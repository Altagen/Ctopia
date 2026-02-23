import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'rgba(15, 15, 25, 0.95)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#e2e8f0',
          backdropFilter: 'blur(16px)',
          borderRadius: '10px',
          fontSize: '14px',
        },
        success: {
          iconTheme: { primary: '#22c55e', secondary: '#07070f' },
        },
        error: {
          iconTheme: { primary: '#ef4444', secondary: '#07070f' },
        },
      }}
    />
  </StrictMode>,
)
