import { useLayoutEffect, useState, useCallback } from 'react'

type Theme = 'dark' | 'light'

function getInitial(): Theme {
  const stored = localStorage.getItem('ctopia_theme')
  return stored === 'light' ? 'light' : 'dark'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitial)

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    localStorage.setItem('ctopia_theme', theme)
  }, [theme])

  const toggle = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), [])

  return { theme, toggle }
}
