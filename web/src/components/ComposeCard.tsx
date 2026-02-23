import { useState } from 'react'
import { Play, Square, RotateCcw, ChevronDown, FolderOpen, Box, Network } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import type { ComposeStack, ComposeFeatures } from '../types'
import { api } from '../lib/api'
import StatusBadge from './StatusBadge'
import ActionButton from './ActionButton'

interface Props {
  stack: ComposeStack
  perms: ComposeFeatures
}

export default function ComposeCard({ stack, perms }: Props) {
  const [loading, setLoading] = useState<'start' | 'stop' | 'restart' | null>(null)
  const [expanded, setExpanded] = useState(false)

  const isStopped = stack.status === 'stopped'
  const runningCount = stack.services.filter(s => s.running).length

  const act = async (type: 'start' | 'stop' | 'restart') => {
    setLoading(type)
    try {
      await api.composes[type](stack.name)
      toast.success(`${stack.name} ${type}ed`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${type}`)
    } finally {
      setLoading(null)
    }
  }

  const hasActions = perms.start || perms.stop || perms.restart

  return (
    <div className="glass glass-hover rounded-xl overflow-hidden animate-fade-in">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-white">{stack.name}</span>
              <StatusBadge status={stack.status} />
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/25">
              <FolderOpen className="h-3 w-3 flex-shrink-0" />
              <span className="truncate font-mono">{stack.path}</span>
            </div>
          </div>

          {/* Actions */}
          {hasActions && (
            <div className="flex flex-shrink-0 gap-1">
              {isStopped
                ? perms.start && <ActionButton icon={Play}      label="Start"   variant="start"   loading={loading === 'start'}   onClick={() => act('start')} />
                : perms.stop  && <ActionButton icon={Square}    label="Stop"    variant="stop"    loading={loading === 'stop'}    onClick={() => act('stop')} />
              }
              {perms.restart && (
                <ActionButton icon={RotateCcw} label="Restart" variant="restart" loading={loading === 'restart'} onClick={() => act('restart')} />
              )}
            </div>
          )}
        </div>

        {/* Services summary + expand toggle */}
        {stack.services.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-3 flex w-full items-center gap-2 text-left text-xs text-white/35 hover:text-white/55 transition"
          >
            <span className="font-medium text-white/55">{runningCount}/{stack.services.length}</span>
            <span>services running</span>
            {/* Dot strip */}
            <div className="flex flex-1 gap-1">
              {stack.services.slice(0, 8).map(s => (
                <span
                  key={s.name}
                  className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', s.running ? 'bg-emerald-400' : 'bg-white/15')}
                />
              ))}
            </div>
            <ChevronDown className={clsx('h-3.5 w-3.5 flex-shrink-0 transition-transform', expanded && 'rotate-180')} />
          </button>
        )}
      </div>

      {/* Expanded service list */}
      {expanded && stack.services.length > 0 && (
        <div className="border-t border-white/[0.05] px-4 py-3 space-y-3">
          {stack.services.map(svc => {
            const publishedPorts = svc.ports?.filter(p => p.host > 0) ?? []
            return (
              <div key={svc.name} className="space-y-1">
                {/* Name + status */}
                <div className="flex items-center gap-2.5">
                  <span className={clsx('h-1.5 w-1.5 flex-shrink-0 rounded-full', svc.running ? 'bg-emerald-400' : 'bg-white/15')} />
                  <span className="flex-1 text-xs font-mono text-white/70">{svc.name}</span>
                  <StatusBadge status={svc.state || 'stopped'} />
                </div>

                {/* Container name */}
                {svc.containerName && (
                  <div className="ml-4 flex items-center gap-1 text-[10px] font-mono text-white/25">
                    <Box className="h-2.5 w-2.5 flex-shrink-0" />
                    <span>{svc.containerName}</span>
                  </div>
                )}

                {/* Image */}
                {svc.image && (
                  <div className="ml-4 text-[10px] font-mono text-white/20 truncate pl-3.5">
                    {svc.image}
                  </div>
                )}

                {/* Published ports */}
                {publishedPorts.length > 0 && (
                  <div className="ml-4 flex flex-wrap items-center gap-1 pl-3.5">
                    <Network className="h-2.5 w-2.5 flex-shrink-0 text-white/20" />
                    {publishedPorts.map((p, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-mono text-white/35 bg-white/[0.05] rounded px-1 py-0.5"
                      >
                        {p.host}:{p.container}/{p.protocol}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
