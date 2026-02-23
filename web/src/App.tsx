import { useEffect, useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { api } from './lib/api'
import { WSClient } from './lib/ws'
import type { AppState, WSMessage, FeatureSet } from './types'
import Setup from './pages/Setup'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

const defaultAdminFeatures: FeatureSet = {
  containers: { view: true, start: true, stop: true, restart: true, delete: true },
  composes: { view: true, start: true, stop: true, restart: true },
  images: { view: true, delete: true, prune: true, pull: true },
}
const defaultPublicFeatures: FeatureSet = {
  containers: { view: true, start: false, stop: false, restart: false, delete: false },
  composes: { view: true, start: false, stop: false, restart: false },
  images: { view: false, delete: false, prune: false, pull: false },
}

function AppInner() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [setupDone, setSetupDone] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [authless, setAuthless] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [strict, setStrict] = useState(true)
  const [adminFeatures, setAdminFeatures] = useState<FeatureSet>(defaultAdminFeatures)
  const [publicFeatures, setPublicFeatures] = useState<FeatureSet>(defaultPublicFeatures)
  const [state, setState] = useState<AppState>({
    containers: [],
    composes: [],
    connected: false,
    loading: true,
    lastUpdate: null,
  })

  const features: FeatureSet = isAdmin ? adminFeatures : publicFeatures

  // Bootstrap: check setup + auth status
  useEffect(() => {
    api.setup.status().then(({ configured, authless: al, strict: st, admin_features, public_features }) => {
      setSetupDone(configured)
      setAuthless(al)
      setStrict(st)
      setAdminFeatures(admin_features)
      setPublicFeatures(public_features)
      const token = localStorage.getItem('ctopia_token')
      const hasToken = !!token
      const isAuthed = configured && (al || hasToken)
      setAuthed(isAuthed)
      setIsAdmin(hasToken)
      setReady(true)
    }).catch(() => setReady(true))
  }, [])

  // WebSocket
  useEffect(() => {
    if (!authed) return

    const handleMessage = (msg: WSMessage) => {
      if (msg.type === 'state') {
        setState(prev => ({
          ...prev,
          containers: msg.containers,
          composes: msg.composes,
          loading: false,
          lastUpdate: msg.timestamp,
        }))
      }
    }

    const handleStatus = (connected: boolean) => {
      setState(prev => ({ ...prev, connected, loading: !connected }))
    }

    const ws = new WSClient(handleMessage, handleStatus)
    ws.connect()

    return () => ws.disconnect()
  }, [authed])

  const handleSetupComplete = useCallback((token: string) => {
    localStorage.setItem('ctopia_token', token)
    setSetupDone(true)
    setAuthed(true)
    setIsAdmin(true)
    navigate('/')
  }, [navigate])

  const handleLogin = useCallback((token: string) => {
    localStorage.setItem('ctopia_token', token)
    setAuthed(true)
    setIsAdmin(true)
    navigate('/')
  }, [navigate])

  const handleLogout = useCallback(() => {
    localStorage.removeItem('ctopia_token')
    setIsAdmin(false)
    if (authless) {
      // Stay on dashboard as public user — no need to drop authed or navigate
    } else {
      setAuthed(false)
      navigate('/login')
    }
  }, [navigate, authless])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/setup"
        element={
          setupDone ? <Navigate to="/" replace /> : <Setup onComplete={handleSetupComplete} strict={strict} />
        }
      />
      <Route
        path="/login"
        element={
          isAdmin ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />
        }
      />
      <Route
        path="/*"
        element={
          !setupDone ? (
            <Navigate to="/setup" replace />
          ) : !authed ? (
            <Navigate to="/login" replace />
          ) : (
            <Dashboard state={state} onLogout={handleLogout} features={features} isAdmin={isAdmin} />
          )
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
