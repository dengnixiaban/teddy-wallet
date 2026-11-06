import { useCallback, useEffect, useRef, useState } from 'react'
import {
  newMnemonic, validateMnemonic, WalletSession,
  CHAINS, fetchBalance, formatEth, sendEth, getChainConf, fetchTxStatus,
} from './core/wallet'
import { encryptVault, decryptVault } from './core/vault'
import { saveVault, loadVault, clearVault } from './core/storage'
import './App.css'

type Screen = 'loading' | 'welcome' | 'create' | 'import' | 'unlock' | 'dashboard'

const AUTO_LOCK_MS = 5 * 60 * 1000

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [session, setSession] = useState<WalletSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number>(CHAINS[0].id)
  const lastActivity = useRef(Date.now())

  useEffect(() => {
    setScreen(loadVault() ? 'unlock' : 'welcome')
  }, [])

  const lock = useCallback(() => {
    session?.destroy()
    setSession(null)
    setScreen('unlock')
    setError(null)
  }, [session])

  useEffect(() => {
    if (!session) return
    const bump = () => { lastActivity.current = Date.now() }
    window.addEventListener('mousemove', bump)
    window.addEventListener('keydown', bump)
    window.addEventListener('click', bump)
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > AUTO_LOCK_MS) lock()
    }, 10_000)
    return () => {
      window.removeEventListener('mousemove', bump)
      window.removeEventListener('keydown', bump)
      window.removeEventListener('click', bump)
      clearInterval(timer)
    }
  }, [session, lock])

  async function handleCreate(mnemonic: string, password: string) {
    saveVault(await encryptVault(mnemonic, password))
    setSession(new WalletSession(mnemonic))
    setScreen('dashboard')
  }

  async function handleImport(mnemonic: string, password: string) {
    const m = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ')
    saveVault(await encryptVault(m, password))
    setSession(new WalletSession(m))
    setScreen('dashboard')
  }

  async function handleUnlock(password: string) {
    const vault = loadVault()
    if (!vault) throw new Error('本地没有钱包数据')
    const mnemonic = await decryptVault(vault, password)
    setSession(new WalletSession(mnemonic))
    setScreen('dashboard')
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🔐 Demo Wallet</div>
        <div className="topbar-right">
          {session && (
            <>
              <select value={chainId} onChange={(e) => setChainId(Number(e.target.value))}>
                {CHAINS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={lock}>锁定</button>
            </>
          )}
        </div>
      </header>

      <div className="banner-demo">
        ⚠️ 教学演示项目，未经过安全审计，<strong>请勿存入真实资产</strong>
      </div>

      {error && <div className="error">⚠️ {error}</div>}

      {screen === 'loading' && <p className="center muted">加载中…</p>}

      {screen === 'welcome' && (
        <div className="card center">
          <h2>开始使用</h2>
          <p className="muted">钱包由你自己掌控 —— 没有服务器，没有账户，只有助记词。</p>
          <div className="row center-row">
            <button className="primary" onClick={() => setScreen('create')}>创建新钱包</button>
            <button onClick={() => setScreen('import')}>导入已有钱包</button>
          </div>
        </div>
      )}

      {screen === 'create' && (
        <CreateFlow
          onBack={() => setScreen('welcome')}
          onSubmit={handleCreate}
          setError={setError}
        />
      )}

      {screen === 'import' && (
        <ImportFlow onBack={() => setScreen('welcome')} onSubmit={handleImport} />
      )}

      {screen === 'unlock' && (
        <UnlockFlow
          onUnlock={handleUnlock}
          onReset={() => {
            if (confirm('确定要清除本地钱包数据吗？没有助记词备份将永远无法恢复。')) {
              clearVault(); setScreen('welcome')
            }
          }}
        />
      )}

      {screen === 'dashboard' && session && (
        <Dashboard session={session} chainId={chainId} onLock={lock} key={chainId} />
      )}

      <footer className="foot">
        <a href="http://149.28.133.245:8090/" target="_blank" rel="noreferrer">
          配套项目：交易安全解析器 ↗
        </a>
      </footer>
    </div>
  )
}

/* ---------------- 创建 ---------------- */
function CreateFlow({ onBack, onSubmit, setError }: {
  onBack: () => void
  onSubmit: (mnemonic: string, password: string) => Promise<void>
  setError: (s: string | null) => void
}) {
  const [mnemonic] = useState(() => newMnemonic())
  const [revealed, setRevealed] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [checked, setChecked] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const words = mnemonic.split(' ')

  async function finish() {
    setErr(null); setError(null)
    if (password.length < 8) return setErr('密码至少 8 位')
    if (password !== confirmPwd) return setErr('两次输入的密码不一致')
    setBusy(true)
    try { await onSubmit(mnemonic, password) }
    catch (e: any) { setErr(e.message || String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="card">
      <button className="link-btn" onClick={onBack}>← 返回</button>
      <h2>创建新钱包 · 第 {step} / 3 步</h2>
      {err && <div className="error">⚠️ {err}</div>}

      {step === 1 && (
        <>
          <p className="danger-text">
            ⚠️ 下面这 12 个单词就是你的钱包。谁拿到它们，谁就能拿走你的全部资产。
          </p>
          <p className="muted">请用纸抄下来，不要截图、不要存网盘、不要发给自己。</p>

          {!revealed ? (
            <div className="blur-box" onClick={() => setRevealed(true)}>点击显示助记词</div>
          ) : (
            <div className="mnemonic-grid">
              {words.map((w, i) => (
                <div key={i} className="mnemonic-word"><span className="idx">{i + 1}</span>{w}</div>
              ))}
            </div>
          )}

          <div className="row">
            <button className="primary" disabled={!revealed}
              onClick={() => { setRevealed(false); setStep(2) }}>我已抄写，下一步</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <p>确认你已备份：</p>
          <label className="check">
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
            我已将助记词抄写在安全的地方，并且明白丢失后无法找回
          </label>
          <div className="row">
            <button onClick={() => setStep(1)}>上一步</button>
            <button className="primary" disabled={!checked} onClick={() => setStep(3)}>下一步</button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <p className="muted">设置一个密码，用于加密本地存储的助记词。</p>
          <label className="field">
            <span>密码（至少 8 位）</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          <label className="field">
            <span>再次输入密码</span>
            <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
          </label>
          <div className="row">
            <button onClick={() => setStep(2)}>上一步</button>
            <button className="primary" disabled={busy} onClick={finish}>
              {busy ? '加密中…' : '创建钱包'}
            </button>
          </div>
          <p className="note">密码只用于本地解密，不会上传。忘记密码 = 只能用助记词恢复。</p>
        </>
      )}
    </div>
  )
}

/* ---------------- 导入 ---------------- */
function ImportFlow({ onBack, onSubmit }: {
  onBack: () => void
  onSubmit: (mnemonic: string, password: string) => Promise<void>
}) {
  const [mnemonic, setMnemonic] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setError(null)
    if (!validateMnemonic(mnemonic)) return setError('助记词无效（单词拼错或顺序不对）')
    if (password.length < 8) return setError('密码至少 8 位')
    if (password !== confirmPwd) return setError('两次输入的密码不一致')
    setBusy(true)
    try { await onSubmit(mnemonic, password) }
    catch (e: any) { setError(e.message || String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="card">
      <button className="link-btn" onClick={onBack}>← 返回</button>
      <h2>导入已有钱包</h2>
      {error && <div className="error">⚠️ {error}</div>}
      <label className="field">
        <span>助记词（12 / 15 / 18 / 21 / 24 个单词）</span>
        <textarea rows={4} value={mnemonic} onChange={e => setMnemonic(e.target.value)}
          placeholder="例如：cage wheat sight ..." />
      </label>
      <label className="field">
        <span>设置本地密码（至少 8 位）</span>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      </label>
      <label className="field">
        <span>再次输入密码</span>
        <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
      </label>
      <div className="row">
        <button className="primary" disabled={busy} onClick={submit}>
          {busy ? '导入中…' : '导入'}
        </button>
      </div>
    </div>
  )
}

/* ---------------- 解锁 ---------------- */
function UnlockFlow({ onUnlock, onReset }: {
  onUnlock: (password: string) => Promise<void>
  onReset: () => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setError(null); setBusy(true)
    try { await onUnlock(password) }
    catch (e: any) { setError(e.message || String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="card narrow">
      <h2>解锁钱包</h2>
      {error && <div className="error">⚠️ {error}</div>}
      <label className="field">
        <span>密码</span>
        <input type="password" value={password} autoFocus
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()} />
      </label>
      <div className="row">
        <button className="primary" disabled={busy} onClick={submit}>
          {busy ? '解密中…' : '解锁'}
        </button>
        <button className="link-btn" onClick={onReset}>清除本地数据</button>
      </div>
      <p className="note">解密使用 PBKDF2（60 万次迭代）+ AES-256-GCM。</p>
    </div>
  )
}

/* ---------------- 主页 ---------------- */
function Dashboard({ session, chainId, onLock }: {
  session: WalletSession
  chainId: number
  onLock: () => void
}) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [balances, setBalances] = useState<Record<string, bigint>>({})
  const [loadingBal, setLoadingBal] = useState(false)
  const conf = getChainConf(chainId)
  const account = session.accounts[activeIdx]

  const refresh = useCallback(async () => {
    setLoadingBal(true)
    try {
      const entries = await Promise.all(
        session.accounts.map(async a => [a.address, await fetchBalance(chainId, a.address)] as const)
      )
      setBalances(Object.fromEntries(entries))
    } catch { /* ignore */ }
    finally { setLoadingBal(false) }
  }, [session, chainId])

  useEffect(() => { refresh() }, [refresh])

  return (
    <>
      <div className="card">
        <div className="row between">
          <h2>账户</h2>
          <button onClick={refresh} disabled={loadingBal}>
            {loadingBal ? '刷新中…' : '刷新余额'}
          </button>
        </div>
        <div className="accounts">
          {session.accounts.map(a => (
            <button key={a.index}
              className={`account ${a.index === activeIdx ? 'active' : ''}`}
              onClick={() => setActiveIdx(a.index)}>
              <div className="acc-idx">账户 #{a.index}</div>
              <div className="acc-addr">{a.address.slice(0, 10)}…{a.address.slice(-6)}</div>
              <div className="acc-bal">
                {balances[a.address] !== undefined ? `${formatEth(balances[a.address])} ETH` : '—'}
              </div>
            </button>
          ))}
        </div>
        <p className="note">
          同一助记词按 BIP-44 派生（m/44'/60'/0'/0/&lt;index&gt;），不同 index 是不同地址。
        </p>
      </div>

      <SendForm session={session} accountIndex={activeIdx} chainId={chainId} onSent={refresh} />

      <div className="card">
        <div className="row between">
          <h2>安全</h2>
          <button onClick={onLock}>立即锁定</button>
        </div>
        <ul className="security-list">
          <li>5 分钟无操作自动锁定</li>
          <li>助记词只在内存中，加密后才写入本地存储</li>
          <li>PBKDF2 60 万次 + AES-256-GCM</li>
          <li>私钥本地签名，不发送到任何服务器</li>
        </ul>
        <p className="note">
          当前网络：{conf.name} ·{' '}
          <a href={`${conf.explorer}/address/${account.address}`} target="_blank" rel="noreferrer">
            在区块浏览器查看 ↗
          </a>
        </p>
      </div>
    </>
  )
}

/* ---------------- 发送 ---------------- */
function SendForm({ session, accountIndex, chainId, onSent }: {
  session: WalletSession
  accountIndex: number
  chainId: number
  onSent: () => void
}) {
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const conf = getChainConf(chainId)

  async function submit() {
    setError(null); setTxHash(null); setStatus(null)
    if (!confirm(`确认发送 ${amount} ETH 到\n${to}\n\n网络：${conf.name}`)) return
    setBusy(true); setStatus('签名中…')
    try {
      const account = session.accountAt(accountIndex)
      const hash = await sendEth({ chainId, account, to: to as `0x${string}`, amountEth: amount })
      setTxHash(hash); setStatus('已发送，等待确认…')
      const receipt = await fetchTxStatus(chainId, hash)
      setStatus(receipt.status === 'success' ? '✅ 交易成功' : '❌ 交易失败')
      onSent()
    } catch (e: any) {
      setError(e.shortMessage || e.message || String(e))
      setStatus(null)
    } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <h2>发送 ETH</h2>
      {error && <div className="error">⚠️ {error}</div>}
      <label className="field">
        <span>收款地址</span>
        <input value={to} onChange={e => setTo(e.target.value)} placeholder="0x…（40 位十六进制）" />
      </label>
      <label className="field">
        <span>金额（ETH）</span>
        <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.001" />
      </label>
      <div className="row">
        <button className="primary" disabled={busy || !to || !amount} onClick={submit}>
          {busy ? '处理中…' : '发送'}
        </button>
      </div>
      {status && <p className="status-text">{status}</p>}
      {txHash && (
        <p className="note">
          交易哈希：<code>{txHash.slice(0, 20)}…</code>{' '}
          <a href={`${conf.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">查看 ↗</a>
        </p>
      )}
      <p className="note">发送前会检查余额是否够付 gas（21000 × gasPrice）。</p>
    </div>
  )
}
