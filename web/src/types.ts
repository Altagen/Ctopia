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

export interface FeatureSet {
  containers: ContainerFeatures
  composes: ComposeFeatures
  images: ImageFeatures
}

export interface WSMessage {
  type: 'state'
  containers: Container[]
  composes: ComposeStack[]
  timestamp: number
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
