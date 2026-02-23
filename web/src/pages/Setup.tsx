import { useState, FormEvent } from 'react'
import { api } from '../lib/api'
import { Eye, EyeOff, ShieldCheck, AlertTriangle, Check, X } from 'lucide-react'
import logo from '../assets/ctopia.png'

interface Props {
  onComplete: (token: string) => void
  strict: boolean
}

interface Criteria {
  label: string
  met: boolean
}

function getStrengthInfo(password: string): {
  score: number
  level: number
  label: string
  color: string
  criteria: Criteria[]
} {
  const criteria: Criteria[] = [
    { label: 'At least 12 characters', met: password.length >= 12 },
    { label: 'Uppercase letter (A–Z)', met: /[A-Z]/.test(password) },
    { label: 'Lowercase letter (a–z)', met: /[a-z]/.test(password) },
    { label: 'Number (0–9)', met: /[0-9]/.test(password) },
    { label: 'Special character (!@#…)', met: /[^A-Za-z0-9]/.test(password) },
  ]
  const score = criteria.filter((c) => c.met).length

  let level: number
  let label: string
  let color: string
  if (!password) {
    level = 0; label = ''; color = ''
  } else if (score <= 1) {
    level = 1; label = 'Weak'; color = 'bg-red-500'
  } else if (score <= 2) {
    level = 2; label = 'Fair'; color = 'bg-amber-500'
  } else if (score <= 4) {
    level = 3; label = 'Good'; color = 'bg-yellow-400'
  } else {
    level = 4; label = 'Strong'; color = 'bg-green-500'
  }

  return { score, level, label, color, criteria }
}

export default function Setup({ onComplete, strict }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { level, label, color, criteria } = getStrengthInfo(password)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const { token } = await api.auth.setup(password)
      onComplete(token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden p-4">
      <div className="blob-1" />
      <div className="blob-2" />
      <div className="blob-3" />

      <div className="relative z-10 w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={logo} alt="Ctopia" className="h-16 w-16 rounded-2xl object-contain" />
          <div className="text-center">
            <h1 className="gradient-text text-3xl font-bold tracking-tight">Ctopia</h1>
            <p className="mt-1.5 text-sm text-white/35">Set up your admin password to get started.</p>
          </div>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-6">
          {/* Dev mode warning */}
          {!strict && (
            <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="font-semibold">Dev / local mode</p>
                <p className="mt-0.5 text-amber-400/70 text-xs">
                  Reduced password requirements are active (<code className="font-mono">auth.strict: false</code>). Minimum 4 characters.
                  Do not use this in production.
                </p>
              </div>
            </div>
          )}

          {/* First-run notice */}
          {strict && (
            <div className="mb-5 flex items-center gap-2 rounded-lg border border-blue-500/15 bg-blue-500/10 px-3 py-2 text-sm text-blue-400">
              <ShieldCheck className="h-4 w-4 flex-shrink-0" />
              <span>First-run setup — this only happens once</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/35">
                Admin Password
              </label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={strict ? 'Choose a strong password (12+ chars)' : 'Choose a password (min 4 chars)'}
                  className="w-full rounded-xl bg-white/[0.05] px-4 py-2.5 pr-10 text-sm text-white placeholder-white/20 outline-none ring-1 ring-white/10 transition focus:ring-blue-500/50"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Strength bar — only in strict mode */}
              {strict && (
                <div className="mt-2 space-y-2">
                  {/* Bar segments */}
                  <div className="flex items-center gap-1.5">
                    <div className="flex flex-1 gap-1">
                      {[1, 2, 3, 4].map((seg) => (
                        <div
                          key={seg}
                          className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                            level >= seg ? color : 'bg-white/10'
                          }`}
                        />
                      ))}
                    </div>
                    {label && (
                      <span
                        className={`text-xs font-medium transition-colors ${
                          level === 1 ? 'text-red-400' :
                          level === 2 ? 'text-amber-400' :
                          level === 3 ? 'text-yellow-400' :
                          'text-green-400'
                        }`}
                      >
                        {label}
                      </span>
                    )}
                  </div>

                  {/* Criteria checklist */}
                  {password && (
                    <ul className="space-y-1">
                      {criteria.map((c) => (
                        <li key={c.label} className="flex items-center gap-1.5 text-xs">
                          {c.met ? (
                            <Check className="h-3 w-3 flex-shrink-0 text-green-400" />
                          ) : (
                            <X className="h-3 w-3 flex-shrink-0 text-white/25" />
                          )}
                          <span className={c.met ? 'text-white/60' : 'text-white/30'}>{c.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/35">
                Confirm Password
              </label>
              <input
                type={show ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm your password"
                className="w-full rounded-xl bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none ring-1 ring-white/10 transition focus:ring-blue-500/50"
                required
              />
            </div>

            {error && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Setting up…
                </span>
              ) : (
                'Create admin account'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
