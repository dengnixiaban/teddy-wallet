import { newMnemonic, validateMnemonic } from '../src/core/wallet'

const valid = newMnemonic()
const words = valid.split(' ')
const cases: Array<[string, string, boolean]> = [
  ['正确助记词', valid, true],
  ['改最后一个词', [...words.slice(0, 11), 'zzzz'].join(' '), false],
  ['改中间一个词', [...words.slice(0, 5), 'abandon', ...words.slice(6)].join(' '), false],
  ['词序颠倒', [...words].reverse().join(' '), false],
  ['只有 11 个词', words.slice(0, 11).join(' '), false],
  ['空字符串', '', false],
  ['全空格', '   ', false],
  ['大写', valid.toUpperCase(), true],
  ['多余空格', words.join('   '), true],
]

let pass = 0
const failures: string[] = []
for (const [name, input, expect] of cases) {
  const got = validateMnemonic(input)
  const ok = got === expect
  if (ok) pass++
  else failures.push(name)
  console.log(`  ${ok ? '✅' : '❌'} ${name.padEnd(16)} 期望=${expect} 实际=${got}`)
}
console.log(`\n  ${pass}/${cases.length} 通过`)

// ★ 断言：有失败就以非 0 退出，否则 CI 会误报成功
if (failures.length > 0) {
  console.error(`\n  ❌ 失败的用例: ${failures.join(', ')}`)
  process.exit(1)
}
