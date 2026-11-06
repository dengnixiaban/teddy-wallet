/**
 * 本地存储：只存加密后的保险库
 *
 * ⚠️ 这个文件是"私钥绝不落盘"这条红线的守门人。
 *    只允许出现 EncryptedVault，绝不允许出现明文助记词。
 */
import type { EncryptedVault } from './vault'

const KEY = 'demo-wallet:vault'

export function saveVault(vault: EncryptedVault): void {
  localStorage.setItem(KEY, JSON.stringify(vault))
}

export function loadVault(): EncryptedVault | null {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (!v?.cipher?.ct || !v?.kdf?.salt) return null
    return v as EncryptedVault
  } catch {
    return null
  }
}

export function hasVault(): boolean {
  return loadVault() !== null
}

export function clearVault(): void {
  localStorage.removeItem(KEY)
}
