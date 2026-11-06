# 🔐 Demo Wallet · 教学演示钱包

![License](https://img.shields.io/badge/license-MIT-blue)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Web Crypto](https://img.shields.io/badge/Web%20Crypto-AES--GCM-8b5cf6)
![BIP-39](https://img.shields.io/badge/BIP--39%2F44-HD%20Wallet-orange)
![demo](https://img.shields.io/badge/demo-live-brightgreen)


一个从零实现的以太坊钱包，用来学习 **BIP-39 / BIP-44 / 密钥加密 / 本地签名**。

> ⚠️ **这不是生产级钱包。** 未经过安全审计，请勿存入真实资产。
> 详见 [SECURITY.md](./SECURITY.md)

## 🌐 在线演示

**http://149.28.133.245:8091/**

配套项目：[交易安全解析器](http://149.28.133.245:8090/)

## 功能

```
✅ 创建钱包（12 词助记词，强制备份确认）
✅ 导入钱包（校验 BIP-39 校验和）
✅ 密码加密存储（PBKDF2 600,000 次 + AES-256-GCM）
✅ 多账户派生（BIP-44，m/44'/60'/0'/0/{0,1,2}）
✅ 余额查询（多账户并行）
✅ 发送 ETH（含 gas 充足性检查 + 交易状态机）
✅ 5 分钟无操作自动锁定
✅ 多链切换（Sepolia / 主网）
```

## 安全设计（详见 SECURITY.md）

```
密钥永不落盘     只有密文进 localStorage
PBKDF2 60 万次   OWASP 2023 对 PBKDF2-HMAC-SHA256 的推荐值
AES-256-GCM      认证加密，密文被改一个字节解密就失败
自动锁定         5 分钟无操作
严格 CSP         nginx 上配置了 script-src 'self' 等安全头
```

## 项目结构

```
src/
├── App.tsx            界面（欢迎/创建/导入/解锁/主页）
└── core/
    ├── vault.ts       ★ 加密：PBKDF2 + AES-GCM
    ├── storage.ts     本地存储（只存密文）
    └── wallet.ts      ★ 会话、账户派生、签名、发送
scripts/
├── test-vault.ts      加密模块的 7 项测试
├── test-wallet.ts     派生与格式化测试
└── test-mnemonic.ts   助记词校验的 9 个用例
SECURITY.md            安全设计文档（先于代码写的）
```

## 运行

```bash
npm install
npm run dev

# 跑安全性测试
npx tsx scripts/test-vault.ts
npx tsx scripts/test-mnemonic.ts
npx tsx scripts/test-wallet.ts
```

## 核心实现

### 1. 助记词 → 地址（BIP-39 / BIP-44）

```ts
const mnemonic = generateMnemonic(english)          // 128 位熵 = 12 个单词
const account  = mnemonicToAccount(mnemonic, {      // BIP-44 路径
  addressIndex: 0,                                  // m/44'/60'/0'/0/0
})
```

同一个助记词，`addressIndex` 不同 → 不同地址。

### 2. 加密存储

```ts
// 派生密钥
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
  baseKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt'],
)

// 加密
const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encodedMnemonic)
```

### 3. 本地签名

```ts
const account = mnemonicToAccount(mnemonic, { addressIndex })
const wallet  = createWalletClient({ chain, transport: http(rpc), account })
const hash    = await wallet.sendTransaction({ to, value, account })
```

**私钥不出内存，不上传任何服务器。**

## 测试覆盖

```
test-vault.ts       7 项：加密/解密/错误密码/篡改检测/弱密码/耗时
test-mnemonic.ts    9 项：正确/改词/换序/词数不对/空/大小写/多余空格
test-wallet.ts      5 项：生成/校验/派生/锁定/格式化
```

## 踩过的坑

### 1. 助记词校验不能靠"试试会不会抛异常"

```ts
// ❌ 错误：mnemonicToAccount 对任意字符串都能派生出一个地址
try { mnemonicToAccount(input); return true } catch { return false }

// ✅ 正确：必须用 BIP-39 的校验和验证
import { validateMnemonic } from '@scure/bip39'
return validateMnemonic(input, english)
```

**后果**：用户输错一个词，会"成功导入"一个空钱包，真实资产永远找不回来。

### 2. AES-GCM 的错误不能区分

密码错误和密文被篡改，抛的都是同一个 `OperationError`。
这是**设计如此**（否则会泄漏信息），所以统一提示"密码错误或数据已损坏"。

### 3. JS 无法真正擦除内存

`destroy()` 只能丢掉引用，GC 何时回收不受控。
这是语言限制，真实钱包也需要面对。

## 为什么不做成浏览器扩展

做 MetaMask 那样的扩展需要：
```
· Manifest V3 + content script 注入 window.ethereum
· background service worker 持有密钥
· dApp ↔ 扩展 的消息桥接
· 更复杂的安全隔离
```

技术上可行，但工作量 2~3 个月，且安全要求更高。
作为学习项目，Web 钱包已经能覆盖 90% 的核心知识点。

## 免责声明

本项目仅供学习，**不要存入真实资产**。
丢失助记词 = 永久丢失资产，没有任何人能帮你找回。
