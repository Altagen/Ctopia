const BASE = '/api'

function getToken(): string | null {
  return localStorage.getItem('ctopia_token')
}

function headers(): HeadersInit {
  const token = getToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...headers(), ...(options?.headers ?? {}) },
  })

  if (res.status === 401) {
    localStorage.removeItem('ctopia_token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  setup: {
    status: () =>
      request<{
        configured: boolean
        authless: boolean
        strict: boolean
        admin_features: import('../types').FeatureSet
        public_features: import('../types').FeatureSet
      }>('/setup/status'),
  },

  auth: {
    setup: (password: string) =>
      request<{ token: string }>('/auth/setup', {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    login: (password: string) =>
      request<{ token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    changePassword: (current: string, newPwd: string) =>
      request<{ token: string }>('/auth/password', {
        method: 'POST',
        body: JSON.stringify({ current, new: newPwd }),
      }),
  },

  containers: {
    list: () => request<import('../types').Container[]>('/containers'),
    start: (id: string) => request<void>(`/containers/${id}/start`, { method: 'POST' }),
    stop: (id: string) => request<void>(`/containers/${id}/stop`, { method: 'POST' }),
    restart: (id: string) => request<void>(`/containers/${id}/restart`, { method: 'POST' }),
    delete: (id: string) => request<void>(`/containers/${id}`, { method: 'DELETE' }),
  },

  composes: {
    list: () => request<import('../types').ComposeStack[]>('/composes'),
    start: (name: string) =>
      request<void>(`/composes/${encodeURIComponent(name)}/start`, { method: 'POST' }),
    stop: (name: string) =>
      request<void>(`/composes/${encodeURIComponent(name)}/stop`, { method: 'POST' }),
    restart: (name: string) =>
      request<void>(`/composes/${encodeURIComponent(name)}/restart`, { method: 'POST' }),
  },

  images: {
    list: () => request<import('../types').Image[]>('/images'),
    remove: (id: string) =>
      request<void>(`/images/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    prune: () =>
      request<{ count: number; spaceReclaimed: number }>('/images/prune', { method: 'POST' }),
    pull: (ref: string) =>
      request<void>('/images/pull', { method: 'POST', body: JSON.stringify({ ref }) }),
  },

  settings: {
    get: () => request<import('../types').AppSettings>('/settings'),
    update: (patch: Partial<import('../types').AppSettings>) =>
      request<import('../types').AppSettings>('/settings', {
        method: 'POST',
        body: JSON.stringify(patch),
      }),
  },
}
