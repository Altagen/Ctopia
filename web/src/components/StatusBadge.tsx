import { clsx } from 'clsx'

type Status = 'running' | 'stopped' | 'paused' | 'restarting' | 'dead' | 'created' | 'exited' | 'partial' | string

interface Props {
  status: Status
  size?: 'sm' | 'md'
}

const config: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  running: {
    dot: 'bg-emerald-400',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    label: 'Running',
  },
  stopped: {
    dot: 'bg-red-500',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    label: 'Stopped',
  },
  exited: {
    dot: 'bg-red-500',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    label: 'Exited',
  },
  dead: {
    dot: 'bg-red-700',
    bg: 'bg-red-700/10',
    text: 'text-red-500',
    label: 'Dead',
  },
  paused: {
    dot: 'bg-amber-400',
    bg: 'bg-amber-400/10',
    text: 'text-amber-400',
    label: 'Paused',
  },
  restarting: {
    dot: 'bg-blue-400',
    bg: 'bg-blue-400/10',
    text: 'text-blue-400',
    label: 'Restarting',
  },
  created: {
    dot: 'bg-slate-400',
    bg: 'bg-slate-400/10',
    text: 'text-slate-400',
    label: 'Created',
  },
  partial: {
    dot: 'bg-amber-400',
    bg: 'bg-amber-400/10',
    text: 'text-amber-400',
    label: 'Partial',
  },
}

export default function StatusBadge({ status, size = 'sm' }: Props) {
  const c = config[status] ?? {
    dot: 'bg-slate-500',
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    label: status,
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        c.bg,
        c.text,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
      )}
    >
      <span
        className={clsx(
          'rounded-full',
          c.dot,
          size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2',
          status === 'running' && 'animate-pulse-slow',
        )}
      />
      {c.label}
    </span>
  )
}
