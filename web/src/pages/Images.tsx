import { useState, useEffect, useCallback } from 'react'
import { HardDrive, Trash2, Download, RefreshCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Image, ImageFeatures } from '../types'
import { api } from '../lib/api'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

interface Props {
  perms: ImageFeatures
}

export default function Images({ perms }: Props) {
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(true)
  const [pullRef, setPullRef] = useState('')
  const [pulling, setPulling] = useState(false)
  const [pruning, setPruning] = useState(false)
  const [confirmPrune, setConfirmPrune] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const imgs = await api.images.list()
      setImages(imgs)
    } catch {
      toast.error('Failed to load images')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await api.images.remove(id)
      toast.success('Image deleted')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete image')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  const handlePrune = async () => {
    setPruning(true)
    try {
      const { count, spaceReclaimed } = await api.images.prune()
      toast.success(`Pruned ${count} image${count !== 1 ? 's' : ''}, freed ${formatBytes(spaceReclaimed)}`)
      setConfirmPrune(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to prune images')
    } finally {
      setPruning(false)
    }
  }

  const handlePull = async () => {
    const ref = pullRef.trim()
    if (!ref) return
    setPulling(true)
    try {
      await api.images.pull(ref)
      toast.success(`Pulled ${ref}`)
      setPullRef('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to pull image')
    } finally {
      setPulling(false)
    }
  }

  const unusedCount = images.filter(img => !img.inUse).length

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-violet-400" />
            <h1 className="text-xl font-semibold text-violet-400">Images</h1>
          </div>
          <p className="text-sm text-white/35">
            {images.length} image{images.length !== 1 ? 's' : ''}
            {unusedCount > 0 && ` · ${unusedCount} unused`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Pull */}
          {perms.pull && (
            <div className="flex gap-1">
              <input
                type="text"
                placeholder="nginx:latest"
                value={pullRef}
                onChange={e => setPullRef(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePull()}
                className="w-36 rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-white/20 outline-none ring-1 ring-white/08 transition focus:ring-blue-500/40"
              />
              <button
                onClick={handlePull}
                disabled={pulling || !pullRef.trim()}
                className="flex items-center gap-1.5 rounded-xl border border-blue-500/20 bg-blue-600/20 px-3 py-2 text-sm text-blue-400 transition hover:bg-blue-600/30 disabled:opacity-50"
              >
                {pulling
                  ? <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
                  : <Download className="h-3.5 w-3.5" />
                }
                Pull
              </button>
            </div>
          )}

          {/* Prune */}
          {perms.prune && (
            confirmPrune ? (
              <div className="flex gap-1">
                <button
                  onClick={() => setConfirmPrune(false)}
                  className="rounded-xl px-3 py-2 text-sm text-white/40 transition hover:text-white/70"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePrune}
                  disabled={pruning}
                  className="flex items-center gap-1.5 rounded-xl border border-orange-500/20 bg-orange-600/20 px-3 py-2 text-sm text-orange-400 transition hover:bg-orange-600/30 disabled:opacity-50"
                >
                  {pruning
                    ? <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />
                  }
                  Confirm prune
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmPrune(true)}
                className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/50 transition hover:border-orange-500/20 hover:bg-orange-500/10 hover:text-orange-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Prune unused
              </button>
            )
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSpinner />
      ) : images.length === 0 ? (
        <EmptyImages />
      ) : (
        <div className="space-y-2">
          {images.map(img => (
            <ImageRow
              key={img.id}
              image={img}
              canDelete={perms.delete}
              onDelete={handleDelete}
              deleting={deletingId === img.id}
              confirming={confirmDeleteId === img.id}
              onConfirm={() => setConfirmDeleteId(img.id)}
              onCancelConfirm={() => setConfirmDeleteId(null)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface ImageRowProps {
  image: Image
  canDelete: boolean
  onDelete: (id: string) => void
  deleting: boolean
  confirming: boolean
  onConfirm: () => void
  onCancelConfirm: () => void
}

function ImageRow({ image, canDelete, onDelete, deleting, confirming, onConfirm, onCancelConfirm }: ImageRowProps) {
  const mainTag = image.tags[0] ?? '<none>:<none>'
  const extraTags = image.tags.slice(1)

  return (
    <div className="glass animate-fade-in flex items-center gap-4 rounded-xl px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-sm text-white/80">{mainTag}</span>
          {image.inUse ? (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
              In use
            </span>
          ) : (
            <span className="rounded-full border border-white/[0.08] bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-white/30">
              Unused
            </span>
          )}
          {extraTags.map(tag => (
            <span
              key={tag}
              className="rounded-full border border-blue-500/15 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-mono text-blue-400/70"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-white/25">
          <span className="font-mono">{image.shortId}</span>
          <span>{formatBytes(image.size)}</span>
          <span>{new Date(image.created * 1000).toLocaleDateString()}</span>
        </div>
      </div>

      {canDelete && (
        confirming ? (
          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              onClick={onCancelConfirm}
              className="rounded-lg px-2 py-1.5 text-xs text-white/40 transition hover:text-white/70"
            >
              Cancel
            </button>
            <button
              onClick={() => onDelete(image.id)}
              disabled={deleting}
              className="flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/20 px-2 py-1.5 text-xs text-red-400 transition hover:bg-red-500/30 disabled:opacity-50"
            >
              {deleting
                ? <RefreshCcw className="h-3 w-3 animate-spin" />
                : <Trash2 className="h-3 w-3" />
              }
              Delete
            </button>
          </div>
        ) : (
          <button
            onClick={onConfirm}
            disabled={image.inUse}
            title={image.inUse ? 'Cannot delete in-use image' : 'Delete image'}
            className="flex-shrink-0 rounded-lg p-1.5 text-white/20 transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )
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

function EmptyImages() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-3 rounded-2xl bg-white/[0.03] p-4">
        <HardDrive className="h-7 w-7 text-white/15" />
      </div>
      <p className="text-sm font-medium text-white/40">No images found</p>
      <p className="mt-1 max-w-xs text-xs text-white/20">
        Pull an image or run a container to see images here.
      </p>
    </div>
  )
}
