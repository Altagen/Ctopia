import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Search, Container as ContainerIcon, Boxes, CheckCircle2, XCircle } from 'lucide-react'
import type { AppState, FeatureSet, ContainerFeatures, ComposeFeatures } from '../types'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ContainerCard from '../components/ContainerCard'
import ComposeCard from '../components/ComposeCard'
import Settings from './Settings'
import Images from './Images'

interface Props {
  state: AppState
  onLogout: () => void
  features: FeatureSet
  isAdmin: boolean
}

export default function Dashboard({ state, onLogout, features, isAdmin }: Props) {
  return (
    <div className="relative flex h-full overflow-hidden">
      <div className="blob-1" />
      <div className="blob-2" />
      <div className="blob-3" />

      <Sidebar
        connected={state.connected}
        onLogout={onLogout}
        containerCount={state.containers.length}
        composeCount={state.composes.length}
        features={features}
        isAdmin={isAdmin}
      />

      <main className="relative z-10 flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <div className="flex flex-shrink-0 items-center justify-end px-4 py-2.5 border-b border-white/[0.04]">
          <ThemeToggle />
        </div>

        {/* Page content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Routes>
            <Route path="/"           element={<Overview state={state} features={features} />} />
            <Route path="/containers" element={<ContainersPage state={state} containerPerms={features.containers} />} />
            <Route path="/composes"   element={<ComposesPage state={state} composePerms={features.composes} />} />
            {features.images.view && <Route path="/images" element={<Images perms={features.images} />} />}
            <Route path="/settings"   element={isAdmin ? <Settings /> : <Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

// --- Overview ---

function Overview({ state, features }: { state: AppState; features: FeatureSet }) {
  const running = state.containers.filter(c => c.state === 'running').length
  const stopped = state.containers.filter(c => c.state !== 'running').length
  const composesRunning = state.composes.filter(s => s.status === 'running').length

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <PageHeader
        title="Overview"
        subtitle="Real-time status of your Docker environment"
        lastUpdate={state.lastUpdate}
      />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Containers"     value={state.containers.length} icon={ContainerIcon} color="blue" />
        <StatCard label="Running"        value={running}                 icon={CheckCircle2}  color="green" />
        <StatCard label="Stopped"        value={stopped}                 icon={XCircle}       color="red" />
        <StatCard label="Compose stacks" value={`${composesRunning}/${state.composes.length}`} icon={Boxes} color="orange" />
      </div>

      {state.loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {state.containers.length > 0 && (
            <Section title="Containers" count={state.containers.length} icon={ContainerIcon} color="blue">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {state.containers.slice(0, 6).map(c => (
                  <ContainerCard key={c.id} container={c} perms={features.containers} />
                ))}
              </div>
            </Section>
          )}

          {state.composes.length > 0 && (
            <Section title="Compose stacks" count={state.composes.length} icon={Boxes} color="orange">
              <div className="grid gap-2 sm:grid-cols-2">
                {state.composes.map(s => (
                  <ComposeCard key={s.name} stack={s} perms={features.composes} />
                ))}
              </div>
            </Section>
          )}

          {state.containers.length === 0 && state.composes.length === 0 && (
            <EmptyState
              icon={ContainerIcon}
              title="No containers found"
              desc="Start some Docker containers or configure compose stacks in your config.yml."
            />
          )}
        </>
      )}
    </div>
  )
}

// --- Containers Page ---

function ContainersPage({ state, containerPerms }: { state: AppState; containerPerms: ContainerFeatures }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped'>('all')

  const filtered = state.containers.filter(c => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.image.toLowerCase().includes(search.toLowerCase())
    const matchFilter =
      filter === 'all' ||
      (filter === 'running' && c.state === 'running') ||
      (filter === 'stopped' && c.state !== 'running')
    return matchSearch && matchFilter
  })

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <PageHeader
        title="Containers"
        subtitle={`${state.containers.length} containers total`}
        lastUpdate={state.lastUpdate}
        icon={ContainerIcon}
        color="blue"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
          <input
            type="text"
            placeholder="Search by name or image…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl bg-white/[0.04] py-2 pl-9 pr-4 text-sm text-white placeholder-white/20 outline-none ring-1 ring-white/08 transition focus:ring-blue-500/40"
          />
        </div>
        <FilterTabs value={filter} onChange={setFilter} options={['all', 'running', 'stopped']} />
      </div>

      {state.loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState icon={ContainerIcon} title="No containers" desc={search ? 'No containers match your search.' : 'No containers found.'} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(c => (
            <ContainerCard key={c.id} container={c} perms={containerPerms} />
          ))}
        </div>
      )}
    </div>
  )
}

// --- Composes Page ---

function ComposesPage({ state, composePerms }: { state: AppState; composePerms: ComposeFeatures }) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <PageHeader
        title="Compose stacks"
        subtitle={`${state.composes.length} stacks configured`}
        lastUpdate={state.lastUpdate}
        icon={Boxes}
        color="orange"
      />

      {state.loading ? (
        <LoadingSpinner />
      ) : state.composes.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No compose stacks"
          desc="Add compose paths in your config.yml to manage them here."
          code={`composes:\n  - name: "My App"\n    path: /srv/myapp`}
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {state.composes.map(s => (
            <ComposeCard key={s.name} stack={s} perms={composePerms} />
          ))}
        </div>
      )}
    </div>
  )
}

// --- Shared sub-components ---

function PageHeader({ title, subtitle, lastUpdate, icon: Icon, color }: {
  title: string
  subtitle: string
  lastUpdate: number | null
  icon?: React.ElementType
  color?: 'blue' | 'orange'
}) {
  const titleColor = color === 'blue' ? 'text-blue-400' : color === 'orange' ? 'text-orange-400' : 'text-white'
  return (
    <div className="mb-6 flex items-end justify-between">
      <div>
        <div className="flex items-center gap-2">
          {Icon && <Icon className={`h-5 w-5 ${titleColor}`} />}
          <h1 className={`text-xl font-semibold ${titleColor}`}>{title}</h1>
        </div>
        <p className="text-sm text-white/35">{subtitle}</p>
      </div>
      {lastUpdate && (
        <p className="text-xs text-white/20">
          Updated {new Date(lastUpdate * 1000).toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ElementType; color: 'blue' | 'green' | 'red' | 'orange' }) {
  const styles = {
    blue:   { icon: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/10',      label: 'text-blue-400/75' },
    green:  { icon: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/10', label: 'text-emerald-400/75' },
    red:    { icon: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/10',        label: 'text-red-400/75' },
    orange: { icon: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/10',  label: 'text-orange-400/75' },
  }
  const s = styles[color]
  return (
    <div className="glass rounded-xl p-4">
      <div className={`mb-3 inline-flex rounded-lg border p-2 ${s.bg}`}>
        <Icon className={`h-4 w-4 ${s.icon}`} />
      </div>
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className={`mt-0.5 flex items-center gap-1 text-xs ${s.label}`}>
        <Icon className="h-3 w-3" />
        {label}
      </div>
    </div>
  )
}

function Section({ title, count, icon: Icon, color, children }: {
  title: string
  count: number
  icon?: React.ElementType
  color?: 'blue' | 'orange'
  children: React.ReactNode
}) {
  const colorStyles = {
    blue:   { text: 'text-blue-400/80',   badge: 'bg-blue-500/10 text-blue-400/70 border border-blue-500/15' },
    orange: { text: 'text-orange-400/80', badge: 'bg-orange-500/10 text-orange-400/70 border border-orange-500/15' },
  }
  const s = color ? colorStyles[color] : null

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        {Icon && s && <Icon className={`h-3.5 w-3.5 ${s.text}`} />}
        <h2 className={`text-sm font-medium ${s ? s.text : 'text-white/60'}`}>{title}</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs ${s ? s.badge : 'bg-white/[0.06] text-white/35'}`}>{count}</span>
      </div>
      {children}
    </section>
  )
}

function FilterTabs<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: T[] }) {
  return (
    <div className="flex gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/08">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
            value === opt ? 'bg-blue-600 text-white' : 'text-white/35 hover:text-white/60'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ icon: Icon, title, desc, code }: { icon: React.ElementType; title: string; desc: string; code?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-3 rounded-2xl bg-white/[0.03] p-4">
        <Icon className="h-7 w-7 text-white/15" />
      </div>
      <p className="text-sm font-medium text-white/40">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-white/20">{desc}</p>
      {code && (
        <pre className="mt-4 rounded-xl bg-white/[0.04] px-5 py-3 text-left text-xs font-mono text-white/35 ring-1 ring-white/06">
          {code}
        </pre>
      )}
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  )
}
