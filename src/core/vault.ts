/**
 * 保险库：助记词的加密存储
 *
 * 设计见 SECURITY.md：
 *   PBKDF2-SHA256（600,000 次迭代）派生密钥
 *   AES-256-GCM 认证加密
 *   密文才落盘，明文永不存储
 */

export interface EncryptedVault {
  version: number
  kdf: { name: 'PBKDF2-SHA256'; iterations: number; salt: string }
  cipher: { name: 'AES-GCM'; iv: string; ct: string }
  createdAt: number
}

/** PBKDF2 迭代次数（OWASP 2023 对 PBKDF2-HMAC-SHA256 的推荐值） */
export const KDF_ITERATIONS = 600_000

/* ---------- base64 工具 ---------- */
function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function b64ToBuf(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/* ---------- 密钥派生 ---------- */
async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/* ============================================================
 * 加密：助记词 → 保险库对象
 * ============================================================ */
export async function encryptVault(
  mnemonic: string,
  password: string,
  iterations = KDF_ITERATIONS,
): Promise<EncryptedVault> {
  if (!mnemonic.trim()) throw new Error('助记词不能为空')
  if (password.length < 8) throw new Error('密码至少 8 位')

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, iterations)

  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(mnemonic),
  )

  return {
    version: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations, salt: bufToB64(salt) },
    cipher: { name: 'AES-GCM', iv: bufToB64(iv), ct: bufToB64(ct) },
    createdAt: Date.now(),
  }
}

/* ============================================================
 * 解密：保险库对象 → 助记词
 *
 * ⚠️ 密码错误时，AES-GCM 会抛 OperationError（认证标签不匹配）
 *    这是正确行为 —— 不能区分"密码错"和"密文被篡改"
 * ============================================================ */
export async function decryptVault(vault: EncryptedVault, password: string): Promise<string> {
  const salt = b64ToBuf(vault.kdf.salt)
  const iv = b64ToBuf(vault.cipher.iv)
  const ct = b64ToBuf(vault.cipher.ct)

  const key = await deriveKey(password, salt, vault.kdf.iterations)

  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ct as BufferSource,
    )
  } catch {
    // 不暴露具体原因（可能是密码错，也可能是密文被改）
    throw new Error('密码错误或数据已损坏')
  }

  return new TextDecoder().decode(plain)
}

/* ---------- 存储键 ---------- */
export const VAULT_STORAGE_KEY = 'demo-wallet:vault'
