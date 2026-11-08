import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import {
  WalletSession, fetchBalance, formatEth, sendEth, getChainConf, fetchTxStatus,
} from './core/wallet'
import { useToast } from './components/Toast'

interface Activity {
  hash: string
  to: string
  amount: string
  status: 'pending' | 'success' | 'failed'
  time: number
}

/** 复制到剪贴板（带降级方案） */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }
}

const short = (a: string, head = 6, tail = 4) =>
  a ? `${a.slice(0, head)}…${a.slice(-tail)}` : ''

export function Dashboard({ session, chainId, onLock }: {
  session: WalletSession
  chainId: number
  onLock: () => void
}) {
  const toast = useToast()
  const [activeIdx, setActiveIdx] = useState(0)
  const [balances, setBalances] = useState<Record<string, bigint>>({})
  const [loadingBal, setLoadingBal] = useState(true)
  const [sendOpen, setSendOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [activity, setActivity] = useState<Activity[]>([])

  const conf = getChainConf(chainId)
  const account = session.accounts[activeIdx]
  const balance = balances[account?.address]

  const refresh = useCallback(async () => {
    setLoadingBal(true)
    try {
      const entries = await Promise.all(
        session.accounts.map(async a => {
          const v = await fetchBalance(chainId, a.address).catch(() => 0n)
          return [a.address, v] as const
        }),
      )
      setBalances(Object.fromEntries(entries))
    } finally {
      setLoadingBal(false)
    }
  }, [session, chainId])

  useEffect(() => { refresh() }, [refresh])

  async function handleCopy(text: string, label: string) {
    const ok = await copyText(text)
    if (ok) toast.success(`${label}已复制`)
    else toast.error('复制失败，请手动选择')
  }

  function addActivity(a: Activity) {
    setActivity(prev => [a, ...prev].slice(0, 8))
  }

  function updateActivity(hash: string, status: Activity['status']) {
    setActivity(prev => prev.map(x => (x.hash === hash ? { ...x, status } : x)))
  }

  return (
    <>
      {/* ---------- 余额主卡 ---------- */}
      <div className="hero">
        <div className="hero-top">
          <span className="hero-label">总余额</span>
          <span className="hero-label" style={{ textTransform: 'none' }}>
            {conf.name}
          </span>
        </div>

        <div className="hero-balance">
          {loadingBal && balance === undefined ? (
            <span className="hero-amount skeleton" style={{ width: 150, display: 'inline-block' }}>&nbsp;</span>
          ) : (
            <>
              <span className="hero-amount">{balance !== undefined ? formatEth(balance) : '—'}</span>
              <span className="hero-unit">ETH</span>
            </>
          )}
        </div>

        <div className="hero-sub">
          账户 #{account?.index} · 点击地址可复制
        </div>

        <div className="addr-row" onClick={() => handleCopy(account.address, '地址')} title="点击复制地址">
          <span className="addr-text">{account.address}</span>
          <span className="addr-copy">复制</span>
        </div>

        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => setSendOpen(true)}>
            ↑ 发送
          </button>
          <button className="btn" onClick={() => setReceiveOpen(true)}>
            ↓ 接收
          </button>
        </div>
      </div>

      {/* ---------- 账户切换 ---------- */}
      <div className="card">
        <div className="card-title">
          <span>账户</span>
          <button className="btn-link" onClick={refresh} disabled={loadingBal}>
            {loadingBal ? '刷新中…' : '刷新余额'}
          </button>
        </div>
        <div className="accounts">
          {session.accounts.map(a => (
            <button
              key={a.index}
              className={`account-item ${a.index === activeIdx ? 'active' : ''}`}
              onClick={() => setActiveIdx(a.index)}
            >
              <span className="acc-avatar">#{a.index}</span>
              <span className="acc-main">
                <span className="acc-name">账户 #{a.index}</span>
                <span className="acc-addr-sm">{short(a.address, 10, 6)}</span>
              </span>
              <span className="acc-bal-sm">
                {balances[a.address] !== undefined ? `${formatEth(balances[a.address])} ETH` : '—'}
              </span>
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          同一助记词按 BIP-44 派生（m/44'/60'/0'/0/index），不同 index 是不同地址
        </p>
      </div>

      {/* ---------- 最近活动 ---------- */}
      <div className="card">
        <div className="card-title"><span>最近活动</span></div>
        {activity.length === 0 ? (
          <div className="empty">还没有交易记录<br />发送一笔试试</div>
        ) : (
          <div className="activity">
            {activity.map(a => (
              <div key={a.hash} className="activity-item">
                <span className="activity-icon">↑</span>
                <span className="activity-body">
                  <div className="activity-title">
                    发送 {a.amount} ETH → {short(a.to)}
                  </div>
                  <div className="activity-sub">
                    {new Date(a.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    {' · '}
                    <a href={`${conf.explorer}/tx/${a.hash}`} target="_blank" rel="noreferrer">
                      查看交易
                    </a>
                  </div>
                </span>
                <span className={
                  a.status === 'success' ? 'badge-ok'
                  : a.status === 'failed' ? 'badge-fail'
                  : 'activity-sub'
                }>
                  {a.status === 'success' ? '成功'
                    : a.status === 'failed' ? '失败' : '确认中'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- 安全 ---------- */}
      <div className="card">
        <div className="card-title">
          <span>安全</span>
          <button className="btn btn-ghost btn-sm" onClick={onLock}>锁定</button>
        </div>
        <div className="activity">
          <div className="activity-item">
            <span className="activity-icon">⏱</span>
            <span className="activity-body">
              <div className="activity-title">5 分钟无操作自动锁定</div>
            </span>
          </div>
          <div className="activity-item">
            <span className="activity-icon">🔒</span>
            <span className="activity-body">
              <div className="activity-title">PBKDF2 60 万次 + AES-256-GCM 本地加密</div>
            </span>
          </div>
          <div className="activity-item">
            <span className="activity-icon">📡</span>
            <span className="activity-body">
              <div className="activity-title">私钥本地签名，不上传任何服务器</div>
            </span>
          </div>
        </div>
      </div>

      <p className="footer">
        <a href={`${conf.explorer}/address/${account.address}`} target="_blank" rel="noreferrer">
          在区块浏览器查看该地址 ↗
        </a>
      </p>

      {/* ---------- 弹窗 ---------- */}
      {sendOpen && (
        <SendModal
          session={session}
          accountIndex={activeIdx}
          chainId={chainId}
          onClose={() => setSendOpen(false)}
          onSent={(a) => { addActivity(a); }}
          onSettled={(hash, status) => { updateActivity(hash, status); refresh() }}
        />
      )}

      {receiveOpen && (
        <ReceiveModal
          address={account.address}
          chainName={conf.name}
          onClose={() => setReceiveOpen(false)}
          onCopy={() => handleCopy(account.address, '地址')}
        />
      )}
    </>
  )
}

/* ============================================================
 * 发送弹窗
 * ============================================================ */
function SendModal({ session, accountIndex, chainId, onClose, onSent, onSettled }: {
  session: WalletSession
  accountIndex: number
  chainId: number
  onClose: () => void
  onSent: (a: Activity) => void
  onSettled: (hash: string, status: Activity['status']) => void
}) {
  const toast = useToast()
  const conf = getChainConf(chainId)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<'form' | 'sending'>('form')
  const [error, setError] = useState<string | null>(null)

  const validTo = /^0x[0-9a-fA-F]{40}$/.test(to)
  const validAmount = /^\d*\.?\d+$/.test(amount) && Number(amount) > 0

  async function submit() {
    setError(null)
    if (!validTo) return setError('收款地址格式不正确（应为 0x 开头的 40 位十六进制）')
    if (!validAmount) return setError('请输入有效的金额')

    setStep('sending')
    try {
      const account = session.accountAt(accountIndex)
      const hash = await sendEth({ chainId, account, to: to as `0x${string}`, amountEth: amount })
      toast.info('交易已广播，等待确认…')
      onSent({ hash, to, amount, status: 'pending', time: Date.now() })
      onClose()

      const receipt = await fetchTxStatus(chainId, hash).catch(() => null)
      const status = receipt?.status === 'success' ? 'success' : 'failed'
      onSettled(hash, status)
      if (status === 'success') toast.success('交易成功')
      else toast.error('交易失败（gas 已扣除）')
    } catch (e: any) {
      const msg = e.shortMessage || e.message || String(e)
      setError(msg)
      setStep('form')
      toast.error(msg)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">发送 ETH</span>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="modal-body">
          <label className="field">
            <span className="field-label">
              <span>收款地址</span>
              {to && (
                <span style={{ color: validTo ? 'var(--ok)' : 'var(--error)' }}>
                  {validTo ? '格式正确' : '格式不正确'}
                </span>
              )}
            </span>
            <input
              className={`input mono ${to && !validTo ? 'input-error' : ''}`}
              placeholder="0x…"
              value={to}
              onChange={e => setTo(e.target.value.trim())}
              spellCheck={false}
            />
          </label>

          <label className="field">
            <span className="field-label">
              <span>金额</span>
              <button
                className="btn-link"
                onClick={async () => {
                  const bal = await fetchBalance(chainId, session.accountAt(accountIndex).address)
                  setAmount(formatEth(bal))
                }}
              >
                全部
              </button>
            </span>
            <span className="amount-input-wrap">
              <input
                className="input"
                placeholder="0.0"
                value={amount}
                inputMode="decimal"
                onChange={e => setAmount(e.target.value.trim())}
              />
              <span className="amount-suffix">ETH</span>
            </span>
          </label>

          {error && <div className="warn-box" style={{ marginBottom: 14 }}>{error}</div>}

          <div className="row-gap">
            <button className="btn btn-ghost" onClick={onClose}>取消</button>
            <button
              className="btn btn-primary"
              style={{ flex: 2 }}
              disabled={step === 'sending' || !to || !amount}
              onClick={submit}
            >
              {step === 'sending' ? <><span className="spinner" /> 处理中</> : '确认发送'}
            </button>
          </div>

          <p className="hint" style={{ marginTop: 12 }}>
            网络：{conf.name} · 发送前会校验余额是否够付 gas
          </p>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
 * 接收弹窗
 * ============================================================ */
function ReceiveModal({ address, chainName, onClose, onCopy }: {
  address: string
  chainName: string
  onClose: () => void
  onCopy: () => void
}) {
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    QRCode.toDataURL(address, {
      width: 360,
      margin: 1,
      color: { dark: '#0a0d12', light: '#ffffff' },
    })
      .then(setQr)
      .catch(() => setQr(null))
  }, [address])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">接收 ETH</span>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="modal-body" style={{ textAlign: 'center' }}>
          {qr ? (
            <div className="qr-wrap"><img src={qr} alt="地址二维码" /></div>
          ) : (
            <div className="qr-wrap"><div style={{ width: 180, height: 180 }} className="skeleton" /></div>
          )}

          <p className="hint" style={{ marginBottom: 12 }}>
            扫描二维码或复制下方地址转入 {chainName}
          </p>

          <div className="addr-row" style={{ marginBottom: 14 }} onClick={onCopy}>
            <span className="addr-text">{address}</span>
            <span className="addr-copy">复制</span>
          </div>

          <div className="warn-box" style={{ textAlign: 'left', background: 'rgba(251,191,36,.06)', borderColor: 'rgba(251,191,36,.22)', color: '#e6c26a' }}>
            只向此地址转入 {chainName} 上的资产。转错链的资产将无法找回。
          </div>

          <button className="btn btn-block" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  )
}
