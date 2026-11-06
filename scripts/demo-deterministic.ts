import { mnemonicToAccount } from 'viem/accounts'
import { encryptVault, decryptVault } from '../src/core/vault'

const M = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

function privOf(mnemonic: string, index = 0) {
  const acc = mnemonicToAccount(mnemonic, { addressIndex: index })
  const hd = acc.getHdKey()
  return { addr: acc.address, priv: '0x' + Buffer.from(hd.privateKey!).toString('hex') }
}

console.log('══════════ 实验 1：同一个助记词，算 3 次 ══════════')
console.log(`  助记词: ${M.split(' ').slice(0,3).join(' ')} ... about\n`)
const runs = [1, 2, 3].map(() => privOf(M))
runs.forEach((r, i) => console.log(`  第 ${i+1} 次  ${r.addr}   私钥 ${r.priv.slice(0,12)}...${r.priv.slice(-8)}`))
const same = runs.every(r => r.priv === runs[0].priv && r.addr === runs[0].addr)
console.log(`\n  结果: ${same ? '✅ 三次完全一致（确定性）' : '❌ 不一致'}`)

console.log('\n══════════ 实验 2：换 addressIndex ══════════')
for (const i of [0, 1, 2]) {
  const r = privOf(M, i)
  console.log(`  index ${i}  ${r.addr}   私钥 ${r.priv.slice(0,12)}...`)
}
console.log('\n  结论: 同一个助记词，不同 index → 不同私钥（这是设计，不是随机）')

console.log('\n══════════ 实验 3：加密两次，密文不同但助记词相同 ══════════')
const v1 = await encryptVault(M, 'same-password')
const v2 = await encryptVault(M, 'same-password')
console.log(`  盐1: ${v1.kdf.salt}`)
console.log(`  盐2: ${v2.kdf.salt}`)
console.log(`  盐相同吗: ${v1.kdf.salt === v2.kdf.salt ? '相同' : '❌ 不同（每次随机）'}`)
console.log(`  密文相同吗: ${v1.cipher.ct === v2.cipher.ct ? '相同' : '❌ 不同（因为盐和 IV 都随机）'}`)
const d1 = await decryptVault(v1, 'same-password')
const d2 = await decryptVault(v2, 'same-password')
console.log(`  解密后助记词相同吗: ${d1 === d2 && d1 === M ? '✅ 完全相同' : '❌'}`)
console.log(`  → 盐和 IV 随机，只影响【密文长什么样】，不影响【密文解出来的内容】`)

console.log('\n══════════ 实验 4：BIP-39 的 passphrase（第 25 个词）══════════')
const a = mnemonicToAccount(M)
const b = mnemonicToAccount(M, { passphrase: 'my-secret-25th-word' } as any)
console.log(`  不加 passphrase: ${a.address}`)
console.log(`  加 passphrase:   ${b.address}`)
console.log(`  → 同一个助记词，加不加 passphrase 得到【完全不同的钱包】`)
console.log(`  ⚠️ 这是唯一会让"助记词相同但资产不同"的情况`)
