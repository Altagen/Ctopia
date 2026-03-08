import { useState } from 'react'
import { Play, Lock, Pencil, Trash2, Loader2, CheckCircle2, XCircle, ChevronDown, Zap, Clock, Activity } from 'lucide-react'
import { clsx } from 'clsx'
import type { Pipeline, PipelineFeatures, PipelineRunProgress, PipelineStep } from '../types'

interface Props {
  pipeline: Pipeline
  perms: PipelineFeatures
  currentRun?: PipelineRunProgress
  onRun: () => void
  onEdit: () => void
  onDelete: () => void
  running?: boolean
}

export default function PipelineCard({ pipeline, perms, currentRun, onRun, onEdit, onDelete, running }: Props) {
  const [expanded, setExpanded] = useState(false)
  const isConfig = pipeline.source === 'config'
  const runStatus = currentRun?.pipeline_name === pipeline.name ? currentRun?.status : undefined

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white truncate">{pipeline.name}</h3>
              {isConfig ? (
                <span className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/45">
                  <Lock className="h-2.5 w-2.5" />
                  config
                </span>
              ) : (
                <span className="rounded-full border border-teal-500/20 bg-teal-500/10 px-2 py-0.5 text-[10px] text-teal-400">
                  runtime
                </span>
              )}
              {runStatus && <RunBadge status={runStatus} />}
            </div>
            <p className="mt-1 text-xs text-white/40">
              {pipeline.steps.length} step{pipeline.steps.length !== 1 ? 's' : ''}
              {pipeline.continue_on_error && <span className="ml-1 text-amber-400/60">· continue on error</span>}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {perms.run && (
              <button
                onClick={onRun}
                disabled={running || runStatus === 'running'}
                title="Run pipeline"
                className="flex items-center gap-1.5 rounded-lg border border-teal-500/25 bg-teal-500/10 px-2.5 py-1.5 text-xs font-medium text-teal-400 transition hover:border-teal-400/40 hover:bg-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {runStatus === 'running' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Run
              </button>
            )}
            {!isConfig && perms.manage && (
              <>
                <button
                  onClick={onEdit}
                  title="Edit pipeline"
                  className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-1.5 text-white/40 transition hover:border-white/15 hover:bg-white/[0.08] hover:text-white/70"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={onDelete}
                  title="Delete pipeline"
                  className="rounded-lg border border-red-500/15 bg-red-500/[0.06] p-1.5 text-red-400/60 transition hover:border-red-500/30 hover:bg-red-500/15 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Steps toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2 border-t border-white/[0.05] text-xs text-white/35 hover:bg-white/[0.04] transition"
      >
        <span>{pipeline.steps.length} step{pipeline.steps.length !== 1 ? 's' : ''}</span>
        <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform duration-200', expanded && 'rotate-180')} />
      </button>

      {/* Steps list */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 space-y-2">
          {pipeline.steps.map((step, i) => (
            <StepRow key={i} step={step} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

function StepRow({ step, index }: { step: PipelineStep; index: number }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.03] p-2.5">
      <div className="flex items-center gap-2">
        {/* Action badge */}
        <span className={clsx(
          'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
          step.action === 'start'   ? 'bg-emerald-500/10 text-emerald-400' :
          step.action === 'stop'    ? 'bg-red-500/10 text-red-400' :
                                     'bg-blue-500/10 text-blue-400',
        )}>
          {step.action}
        </span>

        {/* Step name */}
        <span className="flex-1 text-xs text-white/70 truncate">
          {step.name || `Step ${index + 1}`}
        </span>

        {/* Wait mode icon */}
        <WaitBadge mode={step.wait} delay={step.delay_seconds} />
      </div>

      {/* Compose pills */}
      {step.composes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {step.composes.map((name) => (
            <span
              key={name}
              className="rounded-md border border-white/[0.05] bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-white/50"
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function WaitBadge({ mode, delay }: { mode: string; delay?: number }) {
  if (mode === 'immediately') {
    return (
      <span className="flex items-center gap-1 text-[10px] text-white/35" title="Immediately — proceed as soon as command returns">
        <Zap className="h-3 w-3 shrink-0" style={{ color: '#fbbf24' }} />
        instant
      </span>
    )
  }
  if (mode === 'delay') {
    return (
      <span className="flex items-center gap-1 text-[10px] text-white/35" title={`Wait ${delay}s before next step`}>
        <Clock className="h-3 w-3 shrink-0" style={{ color: '#60a5fa' }} />
        {delay}s
      </span>
    )
  }
  // services_running (default)
  return (
    <span className="flex items-center gap-1 text-[10px] text-white/35" title="Wait until all services are running">
      <Activity className="h-3 w-3 shrink-0" style={{ color: '#34d399' }} />
      healthy
    </span>
  )
}

function RunBadge({ status }: { status: string }) {
  if (status === 'running') {
    return (
      <span className="flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        running
      </span>
    )
  }
  if (status === 'done') {
    return (
      <span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
        <CheckCircle2 className="h-2.5 w-2.5" />
        done
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">
        <XCircle className="h-2.5 w-2.5" />
        failed
      </span>
    )
  }
  return null
}
