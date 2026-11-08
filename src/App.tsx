import { useCallback, useEffect, useRef, useState } from 'react'
import {
  newMnemonic, validateMnemonic, WalletSession, CHAINS,
} from './core/wallet'
import { encryptVault, decryptVault } from './core/vault'
import { saveVault, loadVault, clearVault } from './core/storage'
import { ToastProvider, useToast } from './components/Toast'
import { Dashboard } from './Dashboard'
import './App.css'

type Screen = 'loading' | 'welcome' | 'create' | 'import' | 'unlock' | 'dashboard'

const AUTO_LOCK_MS = 5 * 60 * 1000

export default function App() {
  return (
    <ToastProvider>
      <WalletApp />
    </ToastProvider>
  )
}

function WalletApp() {
  const toast = useToast()
  const [screen, setScreen] = useState<Screen>('loading')
  const [session, setSession] = useState<WalletSession | null>(null)
  const [chainId, setChainId] = useState<number>(CHAINS[0].id)
  const lastActivity = useRef(Date.now())

  useEffect(() => {
    setScreen(loadVault() ? 'unlock' : 'welcome')
  }, [])

  const lock = useCallback(() => {
    session?.destroy()
    setSession(null)
    setScreen('unlock')
    lastActivity.current = Date.now()
  }, [session])

  /* 自动锁定 */
  useEffect(() => {
    if (!session) return
    const bump = () => { lastActivity.current = Date.now() }
    window.addEventListener('mousemove', bump)
    window.addEventListener('keydown', bump)
    window.addEventListener('click', bump)
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > AUTO_LOCK_MS) {
        lock()
        toast.info('已超时自动锁定')
      }
    }, 10_000)
    return () => {
      window.removeEventListener('mousemove', bump)
      window.removeEventListener('keydown', bump)
      window.removeEventListener('click', bump)
      clearInterval(timer)
    }
  }, [session, lock, toast])

  async function handleCreate(mnemonic: string, password: string) {
    saveVault(await encryptVault(mnemonic, password))
    setSession(new WalletSession(mnemonic))
    setScreen('dashboard')
    toast.success('钱包已创建')
  }

  async function handleImport(mnemonic: string, password: string) {
    const m = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ')
    saveVault(await encryptVault(m, password))
    setSession(new WalletSession(m))
    setScreen('dashboard')
    toast.success('钱包已导入')
  }

  async function handleUnlock(password: string) {
    const vault = loadVault()
    if (!vault) throw new Error('本地没有钱包数据')
    const mnemonic = await decryptVault(vault, password)
    setSession(new WalletSession(mnemonic))
    setScreen('dashboard')
    lastActivity.current = Date.now()
  }

  const unlocked = screen === 'dashboard' && session

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🧸</span>
          <span>Teddy Wallet</span>
        </div>

        <div className="topbar-actions">
          {unlocked && (
            <>
              <select
                className="net-pill"
                value={chainId}
                onChange={e => setChainId(Number(e.target.value))}
                aria-label="选择网络"
              >
                {CHAINS.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button className="icon-btn" onClick={lock} title="锁定钱包" aria-label="锁定">
                🔒
              </button>
            </>
          )}
        </div>
      </header>

      <div className="demo-strip">
        <span>⚠️</span>
        <span>教学演示项目 · 未经过安全审计 · 请勿存入真实资产</span>
      </div>

      {screen === 'loading' && (
        <div className="auth-wrap">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ width: 22, height: 22 }} />
          </div>
        </div>
      )}

      {screen === 'welcome' && (
        <Welcome
          onCreate={() => setScreen('create')}
          onImport={() => setScreen('import')}
        />
      )}

      {screen === 'create' && (
        <CreateFlow onSubmit={handleCreate} onBack={() => setScreen('welcome')} />
      )}

      {screen === 'import' && (
        <ImportFlow onSubmit={handleImport} onBack={() => setScreen('welcome')} />
      )}

      {screen === 'unlock' && (
        <UnlockFlow
          onUnlock={handleUnlock}
          onReset={() => {
            if (confirm('确定清除本地钱包数据吗？没有助记词备份将永远无法恢复。')) {
              clearVault()
              setScreen('welcome')
              toast.info('本地数据已清除')
            }
          }}
        />
      )}

      {unlocked && (
        <Dashboard
          session={session}
          chainId={chainId}
          onLock={lock}
          key={chainId}
        />
      )}

      {screen !== 'dashboard' && (
        <p className="footer">
          <a href="http://149.28.133.245:8090/" target="_blank" rel="noreferrer">
            配套项目：交易安全解析器 ↗
          </a>
        </p>
      )}
    </div>
  )
}

/* ============================================================
 * 欢迎页
 * ============================================================ */
function Welcome({ onCreate, onImport }: { onCreate: () => void; onImport: () => void }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">🧸</div>
        <h1 className="auth-title">泰迪钱包</h1>
        <p className="auth-sub">
          一个完全运行在浏览器里的以太坊钱包。
          <br />
          没有账号、没有服务器 —— 只有你自己保管的助记词。
        </p>

        <button className="btn btn-primary btn-block" onClick={onCreate} style={{ marginBottom: 9 }}>
          创建新钱包
        </button>
        <button className="btn btn-block" onClick={onImport}>
          导入已有钱包
        </button>

        <p className="hint" style={{ marginTop: 16, textAlign: 'center' }}>
          私钥经 PBKDF2 + AES-GCM 加密后仅存于本地
        </p>
      </div>
    </div>
  )
}

/* ============================================================
 * 创建流程
 * ============================================================ */
function CreateFlow({ onSubmit, onBack }: {
  onSubmit: (mnemonic: string, password: string) => Promise<void>
  onBack: () => void
}) {
  const [mnemonic] = useState(() => newMnemonic())
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [revealed, setRevealed] = useState(false)
  const [checked, setChecked] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const words = mnemonic.split(' ')

  async function finish() {
    setError(null)
    if (password.length < 8) return setError('密码至少 8 位')
    if (password !== confirmPwd) return setError('两次输入的密码不一致')
    setBusy(true)
    try { await onSubmit(mnemonic, password) }
    catch (e: any) { setError(e.message || String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="step-dots">
          {[1, 2, 3].map(n => (
            <span key={n} className={`step-dot ${step >= n ? 'done' : ''}`} />
          ))}
        </div>

        <h1 className="auth-title">
          {step === 1 && '备份助记词'}
          {step === 2 && '确认备份'}
          {step === 3 && '设置密码'}
        </h1>

        {step === 1 && (
          <>
            <div className="warn-box">
              这 12 个单词就是你的钱包。谁拿到它们，谁就能拿走你的全部资产。
              请抄写在纸上，不要截图、不要存网盘。
            </div>

            {!revealed ? (
              <div className="mnemonic-reveal" onClick={() => setRevealed(true)}>
                点击显示助记词
              </div>
            ) : (
              <div className="mnemonic-grid">
                {words.map((w, i) => (
                  <div key={i} className="mnemonic-word">
                    <span className="idx">{i + 1}</span>{w}
                  </div>
                ))}
              </div>
            )}

            <div className="row-gap">
              <button className="btn btn-ghost" onClick={onBack}>返回</button>
              <button
                className="btn btn-primary"
                style={{ flex: 2 }}
                disabled={!revealed}
                onClick={() => { setRevealed(false); setStep(2) }}
              >
                我已抄写
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="auth-sub">请确认你已完成备份。丢失助记词后没有任何人可以帮你找回。</p>

            <label className="check-row">
              <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
              <span>我已将助记词抄写在安全的地方，并明白丢失后无法找回</span>
            </label>

            <div className="row-gap">
              <button className="btn btn-ghost" onClick={() => setStep(1)}>上一步</button>
              <button
                className="btn btn-primary"
                style={{ flex: 2 }}
                disabled={!checked}
                onClick={() => setStep(3)}
              >
                下一步
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="auth-sub">设置一个密码，用于加密本地存储的助记词。</p>

            <label className="field">
              <span className="field-label"><span>密码（至少 8 位）</span></span>
              <input
                className="input" type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>

            <label className="field">
              <span className="field-label"><span>再次输入</span></span>
              <input
                className="input" type="password" value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                placeholder="••••••••"
              />
            </label>

            {error && <div className="warn-box">{error}</div>}

            <div className="row-gap">
              <button className="btn btn-ghost" onClick={() => setStep(2)}>上一步</button>
              <button
                className="btn btn-primary"
                style={{ flex: 2 }}
                disabled={busy}
                onClick={finish}
              >
                {busy ? <><span className="spinner" /> 加密中</> : '创建钱包'}
              </button>
            </div>

            <p className="hint" style={{ marginTop: 12 }}>
              密码只用于本地解密，不会上传到任何地方。忘记密码只能用助记词恢复。
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/* ============================================================
 * 导入流程
 * ============================================================ */
function ImportFlow({ onSubmit, onBack }: {
  onSubmit: (mnemonic: string, password: string) => Promise<void>
  onBack: () => void
}) {
  const [mnemonic, setMnemonic] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const count = mnemonic.trim() ? mnemonic.trim().split(/\s+/).length : 0
  const valid = count > 0 && validateMnemonic(mnemonic)

  async function submit() {
    setError(null)
    if (!valid) return setError('助记词无效（单词拼错或顺序不对）')
    if (password.length < 8) return setError('密码至少 8 位')
    if (password !== confirmPwd) return setError('两次输入的密码不一致')
    setBusy(true)
    try { await onSubmit(mnemonic, password) }
    catch (e: any) { setError(e.message || String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">导入钱包</h1>
        <p className="auth-sub">输入你的助记词，用密码加密后保存到本地。</p>

        <label className="field">
          <span className="field-label">
            <span>助记词</span>
            <span style={{ color: count === 0 ? 'var(--text-3)' : valid ? 'var(--ok)' : 'var(--error)' }}>
              {count === 0 ? '' : valid ? `${count} 个单词 · 有效` : `${count} 个单词 · 无效`}
            </span>
          </span>
          <textarea
            className={`textarea ${count > 0 && !valid ? 'input-error' : ''}`}
            rows={4}
            value={mnemonic}
            onChange={e => setMnemonic(e.target.value)}
            placeholder="例如：cage wheat sight ..."
            spellCheck={false}
            autoCapitalize="none"
          />
        </label>

        <label className="field">
          <span className="field-label"><span>设置本地密码</span></span>
          <input
            className="input" type="password" value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="至少 8 位"
          />
        </label>

        <label className="field">
          <span className="field-label"><span>再次输入</span></span>
          <input
            className="input" type="password" value={confirmPwd}
            onChange={e => setConfirmPwd(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {error && <div className="warn-box">{error}</div>}

        <div className="row-gap">
          <button className="btn btn-ghost" onClick={onBack}>返回</button>
          <button
            className="btn btn-primary"
            style={{ flex: 2 }}
            disabled={busy || !valid}
            onClick={submit}
          >
            {busy ? <><span className="spinner" /> 导入中</> : '导入'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
 * 解锁
 * ============================================================ */
function UnlockFlow({ onUnlock, onReset }: {
  onUnlock: (password: string) => Promise<void>
  onReset: () => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setError(null)
    setBusy(true)
    try { await onUnlock(password) }
    catch (e: any) { setError(e.message || String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">🧸</div>
        <h1 className="auth-title">欢迎回来</h1>
        <p className="auth-sub">输入密码解锁本地加密的钱包。</p>

        <label className="field">
          <span className="field-label"><span>密码</span></span>
          <input
            className="input" type="password" value={password} autoFocus
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !busy && submit()}
            placeholder="••••••••"
          />
        </label>

        {error && <div className="warn-box">{error}</div>}

        <button
          className="btn btn-primary btn-block"
          disabled={busy || !password}
          onClick={submit}
        >
          {busy ? <><span className="spinner" /> 解密中</> : '解锁'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button className="btn-link" onClick={onReset}>清除本地数据</button>
        </div>

        <p className="hint" style={{ marginTop: 14, textAlign: 'center' }}>
          PBKDF2（60 万次迭代）+ AES-256-GCM，解密约需 0.1~1 秒
        </p>
      </div>
    </div>
  )
}
