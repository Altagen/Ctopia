import { clsx } from 'clsx'

interface Props {
  icon: React.ElementType
  label: string
  onClick: () => void
  loading: boolean
  variant: 'start' | 'stop' | 'restart'
}

const variantClass: Record<Props['variant'], string> = {
  start:   'text-emerald-400 hover:bg-emerald-500/15 hover:border-emerald-500/25',
  stop:    'text-red-400 hover:bg-red-500/15 hover:border-red-500/25',
  restart: 'text-white/40 hover:bg-white/[0.07] hover:text-white/70 hover:border-white/10',
}

export default function ActionButton({ icon: Icon, label, onClick, loading, variant }: Props) {
  return (
    <button
      title={label}
      onClick={onClick}
      disabled={loading}
      className={clsx(
        'flex h-7 w-7 items-center justify-center rounded-lg border border-transparent transition disabled:opacity-40',
        variantClass[variant],
      )}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}
    </button>
  )
}
