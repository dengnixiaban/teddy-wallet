/**
 * 演示：钱包到底在本地存了什么
 */
import { encryptVault } from '../src/core/vault'
import { newMnemonic, WalletSession } from '../src/core/wallet'
import { mnemonicToAccount } from 'viem/accounts'

async function main() {
  const mnemonic = newMnemonic()
  const password = 'my-strong-password'

  console.log('══════════ 1. 生成助记词（只在这台设备的内存里出现过）══════════')
  console.log(`  完整助记词: ${mnemonic}`)
  console.log(`  ⚠️  这句话只在这里打印，实际钱包永远不打印`)

  console.log('\n══════════ 2. 从助记词派生私钥（推导链）══════════')
  const acc = mnemonicToAccount(mnemonic, { addressIndex: 0 })
  const hd = acc.getHdKey()
  const priv = hd.privateKey!
  const hex = '0x' + Buffer.from(priv).toString('hex')

  console.log(`  助记词 (BIP-39)`)
  console.log(`    ↓ PBKDF2-HMAC-SHA512 (2048 轮, salt="mnemonic"+密码)`)
  console.log(`  seed (64 字节)`)
  console.log(`    ↓ BIP-32 分层派生 m/44'/60'/0'/0/0`)
  console.log(`  私钥 (32 字节): ${hex.slice(0, 10)}...${hex.slice(-8)}`)
  console.log(`    ↓ secp256k1 椭圆曲线点乘`)
  console.log(`  公钥`)
  console.log(`    ↓ keccak256 取后 20 字节`)
  console.log(`  地址: ${acc.address}`)

  console.log('\n══════════ 3. 加密助记词（不是加密私钥）══════════')
  const vault = await encryptVault(mnemonic, password)
  const stored = JSON.stringify(vault)

  console.log('  写入 localStorage 的内容：')
  console.log(JSON.stringify(vault, null, 2).split('\n').map(l => '    ' + l).join('\n'))

  console.log('\n══════════ 4. 检查：助记词有没有泄漏到存储里 ══════════')
  const words = mnemonic.split(' ')
  const leaked = words.filter(w => stored.includes(w))
  console.log(`  助记词单词数: ${words.length}`)
  console.log(`  在存储内容里找到的单词: ${leaked.length} 个`)
  console.log(`  判定: ${leaked.length === 0 ? '✅ 完全没泄漏' : '❌ 有泄漏！' + leaked.join(',')}`)

  console.log('\n══════════ 5. 检查：私钥有没有泄漏 ══════════')
  console.log(`  私钥在存储里: ${stored.includes(hex.slice(2)) ? '❌ 泄漏了' : '✅ 没有'}`)

  console.log('\n══════════ 6. 存储大小 ══════════')
  console.log(`  密文总大小: ${stored.length} 字节`)

  console.log('\n══════════ 7. 解锁：只有密码能还原 ══════════')
  console.log(`  正确密码 → 还原出助记词 → 派生私钥 → 签名`)
  console.log(`  错误密码 → AES-GCM 认证失败 → 拿不到任何东西`)
}

main()
