import { newMnemonic, validateMnemonic, WalletSession, formatEth } from '../src/core/wallet'
import { encryptVault, decryptVault } from '../src/core/vault'

async function main() {
  console.log('=== 1. 生成 + 校验助记词 ===')
  const m = newMnemonic()
  console.log(`  生成: ${m.split(' ').length} 个单词`)
  console.log(`  校验: ${validateMnemonic(m) ? '✅ 合法' : '❌ 非法'}`)
  console.log(`  篡改一个词: ${validateMnemonic(m.replace(/\w+$/, 'zzzz')) ? '❌ 竟然通过' : '✅ 正确拒绝'}`)
  console.log(`  空字符串: ${validateMnemonic('') ? '❌' : '✅ 正确拒绝'}`)

  console.log('\n=== 2. 派生账户 ===')
  const s = new WalletSession(m, 3)
  s.accounts.forEach(a => console.log(`  #${a.index}  ${a.address}`))

  console.log('\n=== 3. 加密 → 解密 → 再派生（验证地址一致）===')
  const vault = await encryptVault(m, 'my-strong-password')
  const restored = await decryptVault(vault, 'my-strong-password')
  const s2 = new WalletSession(restored, 3)
  const same = s.accounts.every((a, i) => a.address === s2.accounts[i].address)
  console.log(`  地址完全一致: ${same ? '✅' : '❌'}`)

  console.log('\n=== 4. 锁定 ===')
  s2.destroy()
  console.log(`  锁定后 accounts: ${s2.accounts.length} 个（应为 0）`)

  console.log('\n=== 5. 金额格式化 ===')
  for (const v of [0n, 1n, 1000000000000000n, 1234567890000000000n]) {
    console.log(`  ${v} wei → ${formatEth(v)} ETH`)
  }
}

main()
