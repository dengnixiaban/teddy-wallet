/**
 * 钱包核心：账户派生、余额查询、交易签名
 *
 * 安全约定：
 *   助记词只存在于内存（本模块的 WalletSession 对象里），
 *   锁定 = 丢弃引用。
 *   任何函数都不允许打印、上传、持久化助记词。
 */
import {
  createPublicClient,
  http,
  formatEther,
  parseEther,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { mnemonicToAccount, generateMnemonic, english, type HDAccount } from 'viem/accounts'
import { validateMnemonic as bip39Validate } from '@scure/bip39'
import { mainnet, sepolia } from 'viem/chains'
import { createWalletClient } from 'viem'

/* ---------- 支持的链 ---------- */
export const CHAINS = [
  { id: sepolia.id, name: 'Sepolia 测试网', rpc: 'https://ethereum-sepolia-rpc.publicnode.com', explorer: 'https://sepolia.etherscan.io', chain: sepolia },
  { id: mainnet.id, name: 'Ethereum 主网',  rpc: 'https://ethereum-rpc.publicnode.com',        explorer: 'https://etherscan.io',        chain: mainnet },
] as const

export function getChainConf(id: number) {
  return CHAINS.find(c => c.id === id) ?? CHAINS[0]
}

const clients = new Map<number, PublicClient>()

export function getPublicClient(chainId: number): PublicClient {
  const cached = clients.get(chainId)
  if (cached) return cached
  const conf = getChainConf(chainId)
  const c = createPublicClient({ chain: conf.chain, transport: http(conf.rpc) }) as PublicClient
  clients.set(chainId, c)
  return c
}

function getWalletClient(chainId: number, account: HDAccount): WalletClient {
  const conf = getChainConf(chainId)
  return createWalletClient({ chain: conf.chain, transport: http(conf.rpc), account })
}

/* ============================================================
 * 会话：只在内存里，解锁后存在，锁定即丢弃
 * ============================================================ */
export interface DerivedAccount {
  index: number
  address: `0x${string}`
}

export class WalletSession {
  private mnemonic: string
  private _accounts: DerivedAccount[] = []

  constructor(mnemonic: string, count = 3) {
    this.mnemonic = mnemonic
    this._accounts = Array.from({ length: count }, (_, i) => {
      const acc = mnemonicToAccount(mnemonic, { addressIndex: i })
      return { index: i, address: acc.address }
    })
  }

  get accounts(): DerivedAccount[] {
    return this._accounts
  }

  /** 取出某个索引对应的签名账户（内部使用，不要暴露给 UI） */
  accountAt(index: number): HDAccount {
    return mnemonicToAccount(this.mnemonic, { addressIndex: index })
  }

  /** 导出助记词（仅在用户明确要求备份时调用） */
  exportMnemonic(): string {
    return this.mnemonic
  }

  /** 锁定：丢弃助记词引用 */
  destroy(): void {
    this.mnemonic = ''
    this._accounts = []
  }
}

/* ============================================================
 * 生成 / 校验
 * ============================================================ */
export function newMnemonic(): string {
  // viem 内部用 crypto.getRandomValues 生成 128 位熵
  return generateMnemonic(english)
}

/**
 * 校验助记词是否合法
 *
 * ⚠️ 必须用 BIP-39 的 validateMnemonic，不能用 "试试 mnemonicToAccount 会不会抛异常"。
 *    实测：mnemonicToAccount 对任意字符串都能派生出一个地址，
 *    所以那种写法会把错误的助记词当成合法的 —— 用户会派生出一个空钱包。
 *
 *    validateMnemonic 会检查：
 *      ① 每个单词都在 BIP-39 词表里
 *      ② 校验和正确（最后一位是前面所有熵的哈希）
 */
export function validateMnemonic(m: string): boolean {
  const trimmed = m.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!trimmed) return false
  const count = trimmed.split(' ').length
  if (count !== 12 && count !== 15 && count !== 18 && count !== 21 && count !== 24) return false
  return bip39Validate(trimmed, english)
}

/* ============================================================
 * 链上操作
 * ============================================================ */
export async function fetchBalance(chainId: number, address: `0x${string}`): Promise<bigint> {
  return getPublicClient(chainId).getBalance({ address })
}

export function formatEth(v: bigint): string {
  const s = formatEther(v)
  const n = Number(s)
  if (n === 0) return '0'
  if (n < 0.000001) return '<0.000001'
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

export async function sendEth(params: {
  chainId: number
  account: HDAccount
  to: `0x${string}`
  amountEth: string
}): Promise<`0x${string}`> {
  const { chainId, account, to, amountEth } = params
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) throw new Error('收款地址格式不正确')
  const value = parseEther(amountEth)
  if (value <= 0n) throw new Error('金额必须大于 0')

  // 先估一下够不够付 gas
  const client = getPublicClient(chainId)
  const balance = await client.getBalance({ address: account.address })
  const gasPrice = await client.getGasPrice()
  const fee = gasPrice * 21000n
  if (balance < value + fee) {
    throw new Error(`余额不足：需要 ${formatEth(value + fee)} ETH（含 gas），当前 ${formatEth(balance)} ETH`)
  }

  const wallet = getWalletClient(chainId, account)
  return wallet.sendTransaction({ to, value, account, chain: getChainConf(chainId).chain })
}

/** 查交易状态 */
export async function fetchTxStatus(chainId: number, hash: `0x${string}`) {
  const client = getPublicClient(chainId)
  const receipt = await client.getTransactionReceipt({ hash })
  return receipt
}
