import { useEffect } from 'react'
import { X, CheckCircle2, XCircle, Loader2, Circle } from 'lucide-react'
import { clsx } from 'clsx'
import type { PipelineRunProgress, PipelineStepResult, ComposeActionResult } from '../types'

interface Props {
  run: PipelineRunProgress
  onDismiss: () => void
}

export default function PipelineRunOverlay({ run, onDismiss }: Props) {
  useEffect(() => {
    if (run.status === 'done') {
      const timer = setTimeout(onDismiss, 3000)
      return () => clearTimeout(timer)
    }
  }, [run.status, onDismiss])

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[380px] max-h-[80vh] flex flex-col rounded-2xl border border-white/[0.08] bg-[#0d0d0f] modal-panel shadow-2xl overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
        <GlobalStatusIcon status={run.status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{run.pipeline_name}</p>
          <p className={clsx('text-[11px] capitalize', statusTextColor(run.status))}>
            {run.status === 'running' ? 'Running…' : run.status === 'done' ? 'Completed' : 'Failed'}
          </p>
        </div>
        {run.status !== 'running' && (
          <button
            onClick={onDismiss}
            className="rounded-lg p-1 text-white/30 transition hover:bg-white/[0.06] hover:text-white/60"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Pipeline timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="relative">
          {run.steps.map((step, i) => (
            <StepNode
              key={i}
              step={step}
              index={i}
              isLast={i === run.steps.length - 1}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      {run.status === 'done' && (
        <div className="border-t border-white/[0.06] px-4 py-2 text-center text-[11px] text-white/30">
          Closing in 3s…
        </div>
      )}
    </div>
  )
}

function StepNode({ step, index, isLast }: { step: PipelineStepResult; index: number; isLast: boolean }) {
  const active = step.status === 'running' || step.status === 'done' || step.status === 'failed'

  return (
    <div className="flex gap-3">
      {/* Left rail: circle + connector line */}
      <div className="flex flex-col items-center">
        <StepCircle status={step.status} />
        {!isLast && (
          <div className={clsx(
            'w-px flex-1 mt-1',
            step.status === 'done'   ? 'bg-emerald-500/40' :
            step.status === 'failed' ? 'bg-red-500/40' :
            step.status === 'running'? 'bg-blue-500/40' :
                                      'bg-white/[0.08]',
          )} style={{ minHeight: '16px' }} />
        )}
      </div>

      {/* Step content */}
      <div className={clsx('flex-1 pb-4', isLast && 'pb-0')}>
        {/* Step header */}
        <div className="flex items-center gap-2 mb-1.5" style={{ minHeight: '20px' }}>
          <span className={clsx(
            'text-xs font-semibold',
            step.status === 'pending' ? 'text-white/35' :
            step.status === 'running' ? 'text-white/80' :
            step.status === 'done'    ? 'text-white/70' :
                                       'text-red-400/80',
          )}>
            {step.name || `Step ${index + 1}`}
          </span>
          {active && (
            <span className={clsx(
              'rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide',
              step.status === 'running' ? 'bg-blue-500/15 text-blue-400' :
              step.status === 'done'    ? 'bg-emerald-500/10 text-emerald-400' :
                                         'bg-red-500/10 text-red-400',
            )}>
              {step.status}
            </span>
          )}
        </div>

        {/* Compose services */}
        {step.compose_results.length > 0 && (
          <div className={clsx(
            'rounded-lg border p-2.5 space-y-1.5',
            step.status === 'running' ? 'border-blue-500/15 bg-blue-500/[0.04]' :
            step.status === 'done'    ? 'border-emerald-500/10 bg-emerald-500/[0.03]' :
            step.status === 'failed'  ? 'border-red-500/10 bg-red-500/[0.03]' :
                                       'border-white/[0.05] bg-white/[0.02]',
          )}>
            {step.compose_results.map((cr, j) => (
              <ComposeRow key={j} cr={cr} />
            ))}
          </div>
        )}

        {/* Step-level error */}
        {step.error && step.status === 'failed' && !step.compose_results.some(cr => cr.error) && (
          <p className="mt-1.5 text-[10px] text-red-400/70">{step.error}</p>
        )}
      </div>
    </div>
  )
}

function ComposeRow({ cr }: { cr: ComposeActionResult }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <ServiceDot status={cr.status} />
        <span className={clsx(
          'flex-1 text-[11px]',
          cr.status === 'pending' ? 'text-white/30' :
          cr.status === 'running' ? 'text-white/65' :
          cr.status === 'done'    ? 'text-white/55' :
                                   'text-red-400/80',
        )}>
          {cr.name}
        </span>
        <ServiceStatusLabel status={cr.status} />
      </div>
      {cr.error && (
        <p className="pl-4 text-[10px] text-red-400/70 break-words leading-relaxed">{cr.error}</p>
      )}
    </div>
  )
}

function StepCircle({ status }: { status: string }) {
  const base = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all'
  if (status === 'running') {
    return (
      <span className={clsx(base, 'border-blue-400 bg-blue-500/10')}>
        <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-400" />
      </span>
    )
  }
  if (status === 'done') {
    return (
      <span className={clsx(base, 'border-emerald-400 bg-emerald-500/10')}>
        <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className={clsx(base, 'border-red-400 bg-red-500/10')}>
        <XCircle className="h-2.5 w-2.5 text-red-400" />
      </span>
    )
  }
  // pending
  return (
    <span className={clsx(base, 'border-white/[0.12] bg-transparent')}>
      <Circle className="h-2 w-2 text-white/20" />
    </span>
  )
}

function ServiceDot({ status }: { status: string }) {
  return (
    <span className={clsx(
      'h-1.5 w-1.5 shrink-0 rounded-full',
      status === 'pending' ? 'bg-white/15' :
      status === 'running' ? 'bg-blue-400 animate-pulse' :
      status === 'done'    ? 'bg-emerald-400' :
                            'bg-red-400',
    )} />
  )
}

function ServiceStatusLabel({ status }: { status: string }) {
  if (status === 'pending') return null
  if (status === 'running') return <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-400/60 shrink-0" />
  if (status === 'done')    return <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400/60 shrink-0" />
  return <XCircle className="h-2.5 w-2.5 text-red-400/60 shrink-0" />
}

function GlobalStatusIcon({ status }: { status: string }) {
  if (status === 'running') return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-blue-400 bg-blue-500/10">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
    </span>
  )
  if (status === 'done') return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-emerald-400 bg-emerald-500/10">
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
    </span>
  )
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-red-400 bg-red-500/10">
      <XCircle className="h-3.5 w-3.5 text-red-400" />
    </span>
  )
}

function statusTextColor(status: string) {
  if (status === 'running') return 'text-blue-400/70'
  if (status === 'done')    return 'text-emerald-400/70'
  return 'text-red-400/70'
}
