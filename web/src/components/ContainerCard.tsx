import { useState } from 'react'
import { Play, Square, RotateCcw, ExternalLink, Trash2, RefreshCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Container, ContainerFeatures } from '../types'
import { api } from '../lib/api'
import StatusBadge from './StatusBadge'
import ActionButton from './ActionButton'

interface Props {
  container: Container
  perms: ContainerFeatures
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function ResourceBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="resource-bar">
      <div className="resource-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  )
}

function cpuColor(pct: number) {
  if (pct > 80) return '#ef4444'
  if (pct > 50) return '#f97316'
  return '#3b82f6'
}

function memColor(pct: number) {
  if (pct > 85) return '#ef4444'
  if (pct > 60) return '#f97316'
  return '#22c55e'
}

export default function ContainerCard({ container, perms }: Props) {
  const [loading, setLoading] = useState<'start' | 'stop' | 'restart' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const isRunning = container.state === 'running'
  const memPct = container.memoryLimit > 0
    ? (container.memory / container.memoryLimit) * 100
    : 0

  const act = async (type: 'start' | 'stop' | 'restart') => {
    setLoading(type)
    try {
      await api.containers[type](container.id)
      toast.success(`${container.name} ${type}ed`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${type}`)
    } finally {
      setLoading(null)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.containers.delete(container.id)
      toast.success(`${container.name} deleted`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const visiblePorts = container.ports.filter(p => p.host > 0).slice(0, 3)
  const hasActions = perms.start || perms.stop || perms.restart || perms.delete

  return (
    <div className="glass glass-hover rounded-xl p-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium text-white leading-snug">{container.name}</span>
            <StatusBadge status={container.state} />
          </div>
          <p className="mt-0.5 truncate text-xs text-white/55 font-mono">{container.image}</p>
        </div>

        {/* Actions */}
        {hasActions && (
          <div className="flex flex-shrink-0 gap-1">
            {isRunning
              ? perms.stop && <ActionButton icon={Square}    label="Stop"    variant="stop"    loading={loading === 'stop'}    onClick={() => act('stop')} />
              : perms.start && <ActionButton icon={Play}     label="Start"   variant="start"   loading={loading === 'start'}   onClick={() => act('start')} />
            }
            {perms.restart && (
              <ActionButton icon={RotateCcw} label="Restart" variant="restart" loading={loading === 'restart'} onClick={() => act('restart')} />
            )}
            {perms.delete && (
              <button
                onClick={() => setConfirmDelete(true)}
                title="Delete container"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/35 transition hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Ports */}
      {visiblePorts.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {visiblePorts.map((p, i) => isRunning ? (
            <a
              key={i}
              href={`http://${window.location.hostname}:${p.host}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-mono text-white/55 transition hover:bg-blue-500/10 hover:text-blue-400"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              {p.host}:{p.container}
            </a>
          ) : (
            <span key={i} className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-mono text-white/55">
              {p.host}:{p.container}
            </span>
          ))}
        </div>
      )}

      {/* Resources — running only */}
      {isRunning && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1 flex justify-between text-[10px]">
              <span className="uppercase tracking-wider text-white/45">CPU</span>
              <span className="font-mono text-white/65">{container.cpu.toFixed(1)}%</span>
            </div>
            <ResourceBar pct={container.cpu} color={cpuColor(container.cpu)} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[10px]">
              <span className="uppercase tracking-wider text-white/45">Mem</span>
              <span className="font-mono text-white/65">{formatBytes(container.memory)}</span>
            </div>
            <ResourceBar pct={memPct} color={memColor(memPct)} />
          </div>
        </div>
      )}

      {/* Inline delete confirmation */}
      {confirmDelete && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
          <p className="text-xs text-red-300/80">Remove this container?</p>
          <div className="flex gap-1">
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg px-2 py-1 text-xs text-white/60 transition hover:text-white/80"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/20 px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/30 disabled:opacity-50"
            >
              {deleting
                ? <RefreshCcw className="h-3 w-3 animate-spin" />
                : <Trash2 className="h-3 w-3" />
              }
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
