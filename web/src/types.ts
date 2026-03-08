export interface Port {
  ip: string
  host: number
  container: number
  protocol: string
}

export interface Container {
  id: string
  fullId: string
  name: string
  image: string
  status: string
  state: 'running' | 'stopped' | 'paused' | 'restarting' | 'dead' | 'created' | 'exited' | string
  cpu: number
  memory: number
  memoryLimit: number
  ports: Port[]
  created: number
  compose?: string
}

export interface ComposeService {
  name: string
  containerId?: string
  containerName?: string
  image?: string
  ports?: Port[]
  status: string
  state: string
  running: boolean
}

export interface ComposeStack {
  name: string
  path: string
  status: 'running' | 'partial' | 'stopped'
  services: ComposeService[]
}

export interface Image {
  id: string
  shortId: string
  tags: string[]
  size: number
  created: number
  inUse: boolean
}

export interface ContainerFeatures {
  view: boolean
  start: boolean
  stop: boolean
  restart: boolean
  delete: boolean
}

export interface ComposeFeatures {
  view: boolean
  start: boolean
  stop: boolean
  restart: boolean
}

export interface ImageFeatures {
  view: boolean
  delete: boolean
  prune: boolean
  pull: boolean
}

export interface PipelineFeatures {
  view: boolean
  run: boolean
  manage: boolean
}

export interface FeatureSet {
  containers: ContainerFeatures
  composes: ComposeFeatures
  images: ImageFeatures
  pipelines: PipelineFeatures
}

// --- Pipeline ---

export type WaitMode = 'immediately' | 'services_running' | 'delay'

export interface PipelineStep {
  name: string
  action: 'start' | 'stop' | 'restart'
  composes: string[]
  wait: WaitMode
  delay_seconds?: number
}

export interface Pipeline {
  name: string
  source: 'config' | 'runtime'
  continue_on_error: boolean
  steps: PipelineStep[]
}

export interface ComposeActionResult {
  name: string
  status: 'pending' | 'running' | 'done' | 'failed'
  error?: string
}

export interface PipelineStepResult {
  index: number
  name: string
  status: 'pending' | 'running' | 'done' | 'failed'
  compose_results: ComposeActionResult[]
  error?: string
}

export interface PipelineRunProgress {
  pipeline_name: string
  status: 'running' | 'done' | 'failed'
  steps: PipelineStepResult[]
  started_at: number
  finished_at?: number
}

export interface WSMessage {
  type: string
  containers?: Container[]
  composes?: ComposeStack[]
  timestamp: number
  pipeline_run?: PipelineRunProgress
}

export interface AppSettings {
  authless_mode: boolean
  remove_volumes_on_stop: boolean
  admin_features: FeatureSet
  public_features: FeatureSet
}

export interface AppState {
  containers: Container[]
  composes: ComposeStack[]
  connected: boolean
  loading: boolean
  lastUpdate: number | null
}
