import {
  encryptVault, decryptVault, KDF_ITERATIONS,
} from '../src/core/vault'
import { generateMnemonic, english, mnemonicToAccount } from 'viem/accounts'

async function main() {
  console.log('=== 1. 生成助记词（BIP-39）===')
  const mnemonic = generateMnemonic(english)
  const words = mnemonic.split(' ')
  console.log(`  单词数: ${words.length}`)
  console.log(`  内容: ${words.slice(0, 3).join(' ')} … (共 ${words.length} 个，不打印全部)`)

  console.log('\n=== 2. 从助记词派生账户（BIP-44）===')
  const account = mnemonicToAccount(mnemonic)
  console.log(`  地址: ${account.address}`)
  const account1 = mnemonicToAccount(mnemonic, { addressIndex: 1 })
  console.log(`  第 2 个地址: ${account1.address}`)
  console.log(`  ↑ 同一个助记词，不同 addressIndex 派生不同地址`)

  console.log('\n=== 3. 加密（测量 PBKDF2 耗时）===')
  const t0 = performance.now()
  const vault = await encryptVault(mnemonic, 'test-password-123')
  const encMs = performance.now() - t0
  console.log(`  迭代次数: ${vault.kdf.iterations.toLocaleString()}`)
  console.log(`  盐: ${vault.kdf.salt}`)
  console.log(`  IV: ${vault.cipher.iv}`)
  console.log(`  密文长度: ${vault.cipher.ct.length} 字符`)
  console.log(`  耗时: ${encMs.toFixed(0)} ms`)

  console.log('\n=== 4. 解密（正确密码）===')
  const t1 = performance.now()
  const decrypted = await decryptVault(vault, 'test-password-123')
  const decMs = performance.now() - t1
  console.log(`  耗时: ${decMs.toFixed(0)} ms`)
  console.log(`  还原一致: ${decrypted === mnemonic ? '✅' : '❌'}`)

  console.log('\n=== 5. 解密（错误密码）===')
  try {
    await decryptVault(vault, 'wrong-password')
    console.log('  ❌ 竟然解密成功了！这是严重 bug')
  } catch (e: any) {
    console.log(`  ✅ 正确拒绝: ${e.message}`)
  }

  console.log('\n=== 6. 篡改密文 ===')
  const tampered = { ...vault, cipher: { ...vault.cipher } }
  const bytes = tampered.cipher.ct
  tampered.cipher.ct = bytes.slice(0, 10) + (bytes[10] === 'A' ? 'B' : 'A') + bytes.slice(11)
  try {
    await decryptVault(tampered, 'test-password-123')
    console.log('  ❌ 篡改后竟然解密成功！GCM 认证失效')
  } catch (e: any) {
    console.log(`  ✅ 正确检测到篡改: ${e.message}`)
  }

  console.log('\n=== 7. 密码强度校验 ===')
  try {
    await encryptVault(mnemonic, '123')
    console.log('  ❌ 短密码被接受了')
  } catch (e: any) {
    console.log(`  ✅ ${e.message}`)
  }
}

main()
