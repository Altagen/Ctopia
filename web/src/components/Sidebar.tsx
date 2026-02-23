import { NavLink, useNavigate } from 'react-router-dom'
import { Container, LayoutGrid, LogOut, LogIn, Boxes, Wifi, WifiOff, Settings, HardDrive } from 'lucide-react'
import { clsx } from 'clsx'
import logo from '../assets/ctopia.png'
import type { FeatureSet } from '../types'

interface Props {
  connected: boolean
  onLogout: () => void
  containerCount: number
  composeCount: number
  features: FeatureSet
  isAdmin: boolean
}

export default function Sidebar({ connected, onLogout, containerCount, composeCount, features, isAdmin }: Props) {
  const navigate = useNavigate()

  const navItems = [
    { to: '/', label: 'Overview', icon: LayoutGrid, end: true, show: true },
    { to: '/containers', label: 'Containers', icon: Container, show: true },
    { to: '/composes', label: 'Composes', icon: Boxes, show: features.composes.view },
    { to: '/images', label: 'Images', icon: HardDrive, show: features.images.view },
    { to: '/settings', label: 'Settings', icon: Settings, show: isAdmin },
  ]

  return (
    <aside className="flex h-full w-56 flex-shrink-0 flex-col border-r border-white/[0.05] bg-black/20">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4">
        <img src={logo} alt="Ctopia" className="h-8 w-8 rounded-lg object-contain" />
        <span className="gradient-text text-base font-bold tracking-tight">Ctopia</span>
      </div>

      <div className="mx-4 h-px bg-white/[0.05]" />

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-3">
        {navItems.filter(item => item.show).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
                isActive
                  ? 'bg-blue-600/15 text-blue-400 font-medium border border-blue-500/20'
                  : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70 border border-transparent',
              )
            }
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="space-y-2 px-3 pb-4">
        {/* Connection */}
        <div
          className={clsx(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium',
            connected
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
              : 'bg-red-500/10 text-red-400 border border-red-500/15',
          )}
        >
          {connected
            ? <Wifi className="h-3.5 w-3.5" />
            : <WifiOff className="h-3.5 w-3.5" />
          }
          {connected ? 'Live' : 'Reconnecting…'}
        </div>

        {/* Stats mini */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/15 px-2 py-2 text-center">
            <Container className="mx-auto mb-0.5 h-3 w-3 text-blue-400/60" />
            <div className="text-sm font-semibold text-white">{containerCount}</div>
            <div className="text-[10px] text-blue-400/70">containers</div>
          </div>
          <div className="rounded-lg bg-orange-500/10 border border-orange-500/15 px-2 py-2 text-center">
            <Boxes className="mx-auto mb-0.5 h-3 w-3 text-orange-400/60" />
            <div className="text-sm font-semibold text-white">{composeCount}</div>
            <div className="text-[10px] text-orange-400/70">composes</div>
          </div>
        </div>

        {/* Sign in / Sign out */}
        {isAdmin ? (
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-2 rounded-lg border border-red-500/15 bg-red-500/10 px-3 py-2 text-sm text-red-400/70 transition hover:border-red-500/25 hover:bg-red-500/15 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="flex w-full items-center gap-2 rounded-lg border border-blue-500/15 bg-blue-500/10 px-3 py-2 text-sm text-blue-400/70 transition hover:border-blue-500/25 hover:bg-blue-500/15 hover:text-blue-400"
          >
            <LogIn className="h-4 w-4" />
            Sign in
          </button>
        )}
      </div>
    </aside>
  )
}
