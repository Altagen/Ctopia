import React, { useState, useRef, useEffect } from 'react'
import { X, Plus, ChevronUp, ChevronDown, Trash2, Loader2, Zap, Clock, Activity, Check } from 'lucide-react'
import { clsx } from 'clsx'
import type { Pipeline, PipelineStep, WaitMode } from '../types'

interface Props {
  pipeline?: Pipeline // undefined = create new
  composeNames: string[]
  onClose: () => void
  onSave: () => void
  onSubmit: (p: Omit<Pipeline, 'source'>) => Promise<void>
}

const emptyStep = (): PipelineStep => ({
  name: '',
  action: 'start',
  composes: [],
  wait: 'services_running',
  delay_seconds: 5,
})

export default function PipelineEditor({ pipeline, composeNames, onClose, onSave, onSubmit }: Props) {
  const [name, setName] = useState(pipeline?.name ?? '')
  const [continueOnError, setContinueOnError] = useState(pipeline?.continue_on_error ?? false)
  const [steps, setSteps] = useState<PipelineStep[]>(
    pipeline?.steps.length ? pipeline.steps : [emptyStep()],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])

  const addStep = () => {
    setSteps(prev => [...prev, emptyStep()])
  }

  useEffect(() => {
    const last = stepRefs.current[steps.length - 1]
    if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [steps.length])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Name is required'); return }
    if (steps.length === 0) { setError('At least one step is required'); return }
    for (const [i, step] of steps.entries()) {
      if (step.composes.length === 0) {
        setError(`Step ${i + 1}: select at least one compose`)
        return
      }
    }
    setSaving(true)
    try {
      await onSubmit({ name: name.trim(), continue_on_error: continueOnError, steps })
      onSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const moveStep = (i: number, dir: -1 | 1) => {
    setSteps(prev => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const updateStep = (i: number, patch: Partial<PipelineStep>) => {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }

  const removeStep = (i: number) => {
    setSteps(prev => prev.filter((_, idx) => idx !== i))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col rounded-2xl border border-white/[0.08] bg-[#0d0d0f] modal-panel shadow-2xl max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <h2 className="text-base font-semibold text-white">
            {pipeline ? 'Edit pipeline' : 'New pipeline'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/[0.06] hover:text-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Name + continue_on_error */}
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-medium text-white/50">Pipeline name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Start Full Stack"
                  disabled={!!pipeline} // can't rename existing pipeline
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/20 transition disabled:opacity-50"
                />
              </div>
              <div className="flex flex-col justify-end">
                <label className="mb-1.5 block text-xs font-medium text-white/50">Continue on error</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={continueOnError}
                  onClick={() => setContinueOnError(v => !v)}
                  className={clsx(
                    'relative flex h-5 w-9 cursor-pointer items-center rounded-full border transition-all duration-200',
                    continueOnError ? 'bg-teal-500/80 border-teal-400/40' : 'bg-white/[0.07] border-white/10',
                  )}
                >
                  <span className={clsx(
                    'absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-200',
                    continueOnError ? 'left-[18px]' : 'left-[3px]',
                  )} />
                </button>
              </div>
            </div>

            {/* Steps */}
            <div>
              <label className="mb-2 block text-xs font-medium text-white/50">Steps</label>
              <div className="space-y-3">
                {steps.map((step, i) => (
                  <StepEditor
                    key={i}
                    ref={el => { stepRefs.current[i] = el }}
                    index={i}
                    step={step}
                    total={steps.length}
                    composeNames={composeNames}
                    onUpdate={patch => updateStep(i, patch)}
                    onMoveUp={() => moveStep(i, -1)}
                    onMoveDown={() => moveStep(i, 1)}
                    onRemove={() => removeStep(i)}
                  />
                ))}
                <button
                  type="button"
                  onClick={addStep}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-teal-500/30 bg-teal-500/[0.06] py-3 text-xs font-medium text-teal-400 transition hover:border-teal-400/50 hover:bg-teal-500/10"
                >
                  <Plus className="h-3 w-3" />
                  Add step
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm text-white/60 transition hover:bg-white/[0.08] hover:text-white/80"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/15 px-4 py-2 text-sm font-medium text-teal-300 transition hover:border-teal-400/50 hover:bg-teal-500/25 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {pipeline ? 'Save changes' : 'Create pipeline'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ComposeDropdown({ composeNames, selected, onToggle }: {
  composeNames: string[]
  selected: string[]
  onToggle: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const label = selected.length === 0
    ? 'Select composes…'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`

  return (
    <div ref={ref} className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs transition hover:border-white/15"
      >
        <span className={selected.length === 0 ? 'text-white/30' : 'text-white/70'}>{label}</span>
        <ChevronDown className={clsx('h-3.5 w-3.5 text-white/30 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl border border-white/[0.08] bg-[#0d0d0f] modal-panel shadow-xl overflow-hidden">
          {composeNames.length === 0 ? (
            <p className="px-3 py-2 text-xs text-white/30">No composes configured</p>
          ) : (
            <div className="max-h-40 overflow-y-auto p-1">
              {composeNames.map(name => {
                const checked = selected.includes(name)
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onToggle(name)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs transition hover:bg-white/[0.05]"
                  >
                    <span className={clsx(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition',
                      checked ? 'border-teal-500/60 bg-teal-500/20 text-teal-400' : 'border-white/[0.15] text-transparent',
                    )}>
                      <Check className="h-2.5 w-2.5" />
                    </span>
                    <span className={checked ? 'text-white/80' : 'text-white/50'}>{name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface StepEditorProps {
  index: number
  step: PipelineStep
  total: number
  composeNames: string[]
  onUpdate: (patch: Partial<PipelineStep>) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

const StepEditor = React.forwardRef<HTMLDivElement, StepEditorProps>(
function StepEditor({ index, step, total, composeNames, onUpdate, onMoveUp, onMoveDown, onRemove }, ref) {
  const waitOptions: { value: WaitMode; label: string; icon: React.ReactNode; color: string }[] = [
    { value: 'services_running', label: 'Wait until services are running', icon: <Activity className="h-3.5 w-3.5" />, color: 'text-emerald-400' },
    { value: 'immediately',      label: 'Continue immediately',            icon: <Zap className="h-3.5 w-3.5" />,      color: 'text-amber-400' },
    { value: 'delay',            label: 'Wait a fixed delay',              icon: <Clock className="h-3.5 w-3.5" />,     color: 'text-blue-400' },
  ]

  const toggleCompose = (name: string) => {
    const next = step.composes.includes(name)
      ? step.composes.filter(c => c !== name)
      : [...step.composes, name]
    onUpdate({ composes: next })
  }

  return (
    <div ref={ref} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-3">
      {/* Step header */}
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-[10px] font-bold text-teal-400">
          {index + 1}
        </span>
        <input
          type="text"
          value={step.name}
          onChange={e => onUpdate({ name: e.target.value })}
          placeholder={`Step ${index + 1} name (optional)`}
          className="flex-1 rounded-lg border border-white/[0.06] bg-transparent px-2.5 py-1.5 text-sm text-white placeholder-white/20 outline-none focus:border-teal-500/30 focus:ring-1 focus:ring-teal-500/15 transition"
        />
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="rounded p-1 text-white/30 transition hover:text-white/60 disabled:opacity-30"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="rounded p-1 text-white/30 transition hover:text-white/60 disabled:opacity-30"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 text-red-400/40 transition hover:text-red-400/80"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Action */}
      <div className="flex items-center gap-3">
        <label className="w-16 flex-shrink-0 text-xs text-white/40">Action</label>
        <div className="flex gap-1">
          {(['start', 'stop', 'restart'] as const).map(action => (
            <button
              key={action}
              type="button"
              onClick={() => onUpdate({ action })}
              className={clsx(
                'rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition',
                step.action === action
                  ? action === 'start'   ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : action === 'stop'  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-white/[0.04] text-white/40 border border-white/[0.06] hover:text-white/60',
              )}
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      {/* Composes multi-select */}
      <div className="flex gap-3">
        <label className="w-16 flex-shrink-0 pt-0.5 text-xs text-white/40">Composes</label>
        <ComposeDropdown
          composeNames={composeNames}
          selected={step.composes}
          onToggle={toggleCompose}
        />
      </div>

      {/* Wait mode (shown between steps = always show, useful info) */}
      <div className="flex gap-3">
        <label className="w-16 flex-shrink-0 pt-0.5 text-xs text-white/40">Wait</label>
        <div className="flex flex-col gap-1">
          {waitOptions.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onUpdate({ wait: opt.value })}
              className={clsx(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition text-left',
                step.wait === opt.value
                  ? clsx('border-current bg-white/[0.06]', opt.color)
                  : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/60',
              )}
            >
              <span className={clsx('shrink-0', step.wait === opt.value ? opt.color : '')}>{opt.icon}</span>
              {opt.label}
            </button>
          ))}
          {step.wait === 'delay' && (
            <div className="ml-5 flex items-center gap-2 pt-1">
              <input
                type="number"
                min={1}
                max={3600}
                value={step.delay_seconds ?? 5}
                onChange={e => onUpdate({ delay_seconds: Math.max(1, parseInt(e.target.value) || 1) })}
                className="w-20 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-sm text-white outline-none focus:border-teal-500/30 transition"
              />
              <span className="text-xs text-white/40">seconds</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
