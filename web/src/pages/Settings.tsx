import { useEffect, useState } from 'react'
import {
  ShieldOff, Shield, AlertTriangle, Loader2, CheckCircle2, Trash2,
  Container, Boxes, HardDrive, ShieldCheck, Globe, ChevronDown, KeyRound,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import type { AppSettings, ContainerFeatures, ComposeFeatures, ImageFeatures } from '../types'

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [adminOpen, setAdminOpen] = useState(true)
  const [publicOpen, setPublicOpen] = useState(true)
  const [pwForm, setPwForm] = useState({ current: '', newPwd: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)

  useEffect(() => {
    api.settings.get()
      .then(setSettings)
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = async (key: 'authless_mode' | 'remove_volumes_on_stop') => {
    if (!settings) return
    const next = { ...settings, [key]: !settings[key] }
    setSaving(true)
    try {
      const updated = await api.settings.update({ [key]: next[key] })
      setSettings(updated)
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const toggleFeature = async (
    profile: 'admin_features' | 'public_features',
    section: 'containers' | 'composes' | 'images',
    key: string,
  ) => {
    if (!settings) return
    const current = settings[profile]
    const sectionData = current[section] as unknown as Record<string, boolean>
    const nextSection = { ...sectionData, [key]: !sectionData[key] }
    const next = { ...current, [section]: nextSection }
    setSaving(true)
    try {
      const updated = await api.settings.update({ [profile]: next })
      setSettings(updated)
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const toggleAll = async (
    profile: 'admin_features' | 'public_features',
    section: 'containers' | 'composes' | 'images',
    keys: string[],
    value: boolean,
  ) => {
    if (!settings) return
    const current = settings[profile]
    const sectionData = current[section] as unknown as Record<string, boolean>
    const nextSection = { ...sectionData, ...Object.fromEntries(keys.map(k => [k, value])) }
    const next = { ...current, [section]: nextSection }
    setSaving(true)
    try {
      const updated = await api.settings.update({ [profile]: next })
      setSettings(updated)
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError(null)
    if (pwForm.newPwd !== pwForm.confirm) {
      setPwError('New passwords do not match')
      return
    }
    setPwSaving(true)
    try {
      const { token } = await api.auth.changePassword(pwForm.current, pwForm.newPwd)
      localStorage.setItem('ctopia_token', token)
      setPwForm({ current: '', newPwd: '', confirm: '' })
      toast.success('Password changed — new token issued')
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setPwSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" />
      </div>
    )
  }

  if (!settings) return null

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-white/35">Configure Ctopia behaviour</p>
      </header>

      <div className="max-w-2xl space-y-8">
        {/* General */}
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-white/30">General</h2>

          <SettingCard
            icon={settings.authless_mode ? ShieldOff : Shield}
            iconColor={settings.authless_mode ? 'text-orange-400' : 'text-blue-400'}
            iconBg={settings.authless_mode ? 'bg-orange-500/10 border-orange-500/15' : 'bg-blue-500/10 border-blue-500/15'}
            title="Authless mode"
            description="When enabled, anyone who reaches the dashboard can manage containers without logging in. Only enable on trusted networks."
            warning={settings.authless_mode ? 'Authentication is currently disabled. Anyone can control your containers.' : undefined}
            success={!settings.authless_mode ? 'Secure — authentication required' : undefined}
            checked={settings.authless_mode}
            onChange={() => toggle('authless_mode')}
            disabled={saving}
          />

          <SettingCard
            icon={Trash2}
            iconColor={settings.remove_volumes_on_stop ? 'text-red-400' : 'text-white/40'}
            iconBg={settings.remove_volumes_on_stop ? 'bg-red-500/10 border-red-500/15' : 'bg-white/[0.04] border-white/[0.08]'}
            title="Remove volumes on stop"
            description="When enabled, stopping a compose stack runs docker compose down -v, which permanently deletes all associated volumes and their data."
            warning={settings.remove_volumes_on_stop ? 'Volumes will be permanently deleted when stopping a compose stack. This cannot be undone.' : undefined}
            checked={settings.remove_volumes_on_stop}
            onChange={() => toggle('remove_volumes_on_stop')}
            disabled={saving}
          />
        </section>

        {/* Security */}
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-white/30">Security</h2>
          <div className="glass rounded-xl p-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 rounded-lg border bg-blue-500/10 border-blue-500/15 p-2">
                <KeyRound className="h-4 w-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Change password</p>
                <p className="mt-0.5 text-xs text-white/35">
                  Changing your password rotates the JWT secret and invalidates all existing sessions.
                </p>
                <form onSubmit={handleChangePassword} className="mt-4 space-y-2">
                  <input
                    type="password"
                    placeholder="Current password"
                    value={pwForm.current}
                    onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                    required
                    className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition"
                  />
                  <input
                    type="password"
                    placeholder="New password"
                    value={pwForm.newPwd}
                    onChange={e => setPwForm(f => ({ ...f, newPwd: e.target.value }))}
                    required
                    className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition"
                  />
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={pwForm.confirm}
                    onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                    required
                    className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition"
                  />
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={pwSaving}
                      className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/15 px-3 py-1.5 text-xs font-medium text-blue-300 transition hover:border-blue-400/50 hover:bg-blue-500/25 disabled:opacity-50"
                    >
                      {pwSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                      Change password
                    </button>
                    {pwError && <p className="text-xs text-red-400">{pwError}</p>}
                  </div>
                </form>
              </div>
            </div>
          </div>
        </section>

        {/* Admin Features */}
        <section className="space-y-3">
          <button
            onClick={() => setAdminOpen(o => !o)}
            className="flex w-full items-center gap-2.5 text-left"
          >
            <div className="h-4 w-1 flex-shrink-0 rounded-full bg-blue-500" />
            <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-400">Admin features</h2>
            <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400/70">
              Admins only
            </span>
            <ChevronDown className={clsx('ml-auto h-3.5 w-3.5 text-white/30 transition-transform duration-200', adminOpen && 'rotate-180')} />
          </button>
          {adminOpen && (
            <>
              <p className="text-xs text-white/25">Features available to authenticated administrators.</p>
              <GranularFeaturesSection
                features={settings.admin_features}
                onToggle={(section, key) => toggleFeature('admin_features', section, key)}
                onToggleAll={(section, keys, value) => toggleAll('admin_features', section, keys, value)}
                disabled={saving}
              />
            </>
          )}
        </section>

        {/* Public Features */}
        <section className="space-y-3">
          <button
            onClick={() => setPublicOpen(o => !o)}
            className="flex w-full items-center gap-2.5 text-left"
          >
            <div className={clsx('h-4 w-1 flex-shrink-0 rounded-full', settings.authless_mode ? 'bg-emerald-500' : 'bg-white/20')} />
            <Globe className={clsx('h-3.5 w-3.5', settings.authless_mode ? 'text-emerald-400' : 'text-white/30')} />
            <h2 className={clsx('text-xs font-semibold uppercase tracking-wider', settings.authless_mode ? 'text-emerald-400' : 'text-white/30')}>
              Public features
            </h2>
            {settings.authless_mode ? (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400/70">
                Unauthenticated users
              </span>
            ) : (
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/25">
                Requires authless mode
              </span>
            )}
            <ChevronDown className={clsx('ml-auto h-3.5 w-3.5 text-white/30 transition-transform duration-200', publicOpen && 'rotate-180')} />
          </button>
          {publicOpen && (
            <>
              <p className="text-xs text-white/25">
                {settings.authless_mode
                  ? 'Features available to unauthenticated users when authless mode is active.'
                  : 'Enable authless mode above to configure public features.'}
              </p>
              <div className={clsx(!settings.authless_mode && 'pointer-events-none opacity-40')}>
                <GranularFeaturesSection
                  features={settings.public_features}
                  onToggle={(section, key) => toggleFeature('public_features', section, key)}
                  onToggleAll={(section, keys, value) => toggleAll('public_features', section, keys, value)}
                  disabled={saving || !settings.authless_mode}
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

// --- Granular features ---

const containerActions: { key: keyof ContainerFeatures; label: string }[] = [
  { key: 'view',    label: 'View' },
  { key: 'start',   label: 'Start' },
  { key: 'stop',    label: 'Stop' },
  { key: 'restart', label: 'Restart' },
  { key: 'delete',  label: 'Delete' },
]

const composeActions: { key: keyof ComposeFeatures; label: string }[] = [
  { key: 'view',    label: 'View' },
  { key: 'start',   label: 'Start' },
  { key: 'stop',    label: 'Stop' },
  { key: 'restart', label: 'Restart' },
]

const imageActions: { key: keyof ImageFeatures; label: string }[] = [
  { key: 'view',   label: 'View' },
  { key: 'delete', label: 'Delete' },
  { key: 'prune',  label: 'Prune' },
  { key: 'pull',   label: 'Pull' },
]

function GranularFeaturesSection({
  features,
  onToggle,
  onToggleAll,
  disabled,
}: {
  features: AppSettings['admin_features']
  onToggle: (section: 'containers' | 'composes' | 'images', key: string) => void
  onToggleAll: (section: 'containers' | 'composes' | 'images', keys: string[], value: boolean) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-3">
      <FeatureCard
        icon={Container}
        title="Containers"
        color="blue"
        actions={containerActions}
        values={features.containers as unknown as Record<string, boolean>}
        onToggle={key => onToggle('containers', key)}
        onToggleAll={value => onToggleAll('containers', containerActions.map(a => a.key), value)}
        disabled={disabled}
      />
      <FeatureCard
        icon={Boxes}
        title="Compose stacks"
        color="orange"
        actions={composeActions}
        values={features.composes as unknown as Record<string, boolean>}
        onToggle={key => onToggle('composes', key)}
        onToggleAll={value => onToggleAll('composes', composeActions.map(a => a.key), value)}
        disabled={disabled}
      />
      <FeatureCard
        icon={HardDrive}
        title="Images"
        color="violet"
        actions={imageActions}
        values={features.images as unknown as Record<string, boolean>}
        onToggle={key => onToggle('images', key)}
        onToggleAll={value => onToggleAll('images', imageActions.map(a => a.key), value)}
        disabled={disabled}
      />
    </div>
  )
}

const colorMap = {
  blue: {
    iconBg:    'bg-blue-500/15 border-blue-500/25',
    iconText:  'text-blue-400',
    iconBgOff: 'bg-white/[0.04] border-white/[0.08]',
    dot:       'bg-blue-500',
    title:     'text-blue-400',
  },
  orange: {
    iconBg:    'bg-orange-500/15 border-orange-500/25',
    iconText:  'text-orange-400',
    iconBgOff: 'bg-white/[0.04] border-white/[0.08]',
    dot:       'bg-orange-500',
    title:     'text-orange-400',
  },
  violet: {
    iconBg:    'bg-violet-500/15 border-violet-500/25',
    iconText:  'text-violet-400',
    iconBgOff: 'bg-white/[0.04] border-white/[0.08]',
    dot:       'bg-violet-500',
    title:     'text-violet-400',
  },
}

function FeatureCard({
  icon: Icon,
  title,
  color,
  actions,
  values,
  onToggle,
  onToggleAll,
  disabled,
}: {
  icon: React.ElementType
  title: string
  color: 'blue' | 'orange' | 'violet'
  actions: { key: string; label: string }[]
  values: Record<string, boolean>
  onToggle: (key: string) => void
  onToggleAll: (value: boolean) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const c = colorMap[color]
  const enabledCount = actions.filter(a => !!values[a.key]).length
  const allEnabled = enabledCount === actions.length
  const anyEnabled = enabledCount > 0

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Clickable header */}
      <div
        role="button"
        onClick={() => setOpen(o => !o)}
        className="flex cursor-pointer select-none items-center gap-3 px-4 py-3"
      >
        <div className={clsx(
          'flex-shrink-0 rounded-lg border p-1.5 transition',
          c.iconBg,
          !anyEnabled && 'opacity-40',
        )}>
          <Icon className={clsx('h-3.5 w-3.5', c.iconText)} />
        </div>
        <span className={clsx('flex-1 text-sm font-semibold transition', c.title, !anyEnabled && 'opacity-40')}>
          {title}
        </span>

        {/* Dot summary + count (collapsed only) */}
        {!open && (
          <div className="mr-1 flex items-center gap-1">
            {actions.map(a => (
              <span
                key={a.key}
                className={clsx('h-1.5 w-1.5 rounded-full transition', values[a.key] ? c.dot : 'bg-white/20')}
              />
            ))}
            <span className="ml-1.5 text-[11px] text-white/35">{enabledCount}/{actions.length}</span>
          </div>
        )}

        <ChevronDown className={clsx(
          'h-3.5 w-3.5 flex-shrink-0 text-white/30 transition-transform duration-200',
          open && 'rotate-180',
        )} />
      </div>

      {/* Expanded content */}
      {open && (
        <>
          {/* Select all bar */}
          {!disabled && (
            <div className="flex items-center justify-end border-t border-white/[0.05] bg-white/[0.02] px-4 py-1.5">
              <button
                onClick={() => onToggleAll(!allEnabled)}
                className="rounded-lg border border-white/[0.10] bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-white/55 transition hover:border-white/[0.18] hover:bg-white/[0.09] hover:text-white/80"
              >
                {allEnabled ? 'Deselect all' : 'Select all'}
              </button>
            </div>
          )}

          {/* Action toggles */}
          <div className="divide-y divide-white/[0.04] border-t border-white/[0.05]">
            {actions.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-white/60">{label}</span>
                <Toggle
                  checked={!!values[key]}
                  onChange={() => onToggle(key)}
                  disabled={disabled}
                  color={color}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// --- Existing SettingCard component ---

interface SettingCardProps {
  icon: React.ElementType
  iconColor: string
  iconBg: string
  title: string
  description: string
  warning?: string
  success?: string
  checked: boolean
  onChange: () => void
  disabled: boolean
}

function SettingCard({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  description,
  warning,
  success,
  checked,
  onChange,
  disabled,
}: SettingCardProps) {
  const warningColor = warning?.includes('permanently') ? 'bg-red-500/10 border-red-500/15' : 'bg-orange-500/10 border-orange-500/15'
  const warningText = warning?.includes('permanently') ? 'text-red-400' : 'text-orange-400'
  const warningBody = warning?.includes('permanently') ? 'text-red-300/80' : 'text-orange-300/80'

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-start gap-4">
        <div className={clsx('flex-shrink-0 rounded-lg border p-2', iconBg)}>
          <Icon className={clsx('h-4 w-4', iconColor)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">{title}</p>
              <p className="mt-0.5 text-xs text-white/35">{description}</p>
            </div>
            <Toggle checked={checked} onChange={onChange} disabled={disabled} danger={warning?.includes('permanently')} />
          </div>

          {warning && (
            <div className={clsx('mt-3 flex items-start gap-2 rounded-lg border px-3 py-2', warningColor)}>
              <AlertTriangle className={clsx('mt-px h-3.5 w-3.5 flex-shrink-0', warningText)} />
              <p className={clsx('text-xs', warningBody)}>{warning}</p>
            </div>
          )}

          {!warning && success && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400/70">
              <CheckCircle2 className="h-3 w-3" />
              <span>{success}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const toggleColors = {
  blue:   'bg-blue-500/80 border-blue-400/40',
  orange: 'bg-orange-500/80 border-orange-400/40',
  violet: 'bg-violet-500/80 border-violet-400/40',
}

function Toggle({
  checked, onChange, disabled, danger, color = 'orange',
}: {
  checked: boolean
  onChange: () => void
  disabled: boolean
  danger?: boolean
  color?: 'blue' | 'orange' | 'violet'
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={clsx(
        'relative flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border transition-all duration-200 disabled:opacity-50',
        checked
          ? danger ? 'bg-red-500/80 border-red-400/40' : toggleColors[color]
          : 'bg-white/[0.07] border-white/10',
      )}
    >
      <span
        className={clsx(
          'absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-200',
          checked ? 'left-[18px]' : 'left-[3px]',
        )}
      />
    </button>
  )
}
