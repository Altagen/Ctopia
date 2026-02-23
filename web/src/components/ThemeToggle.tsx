import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { clsx } from 'clsx'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isLight = theme === 'light'

  return (
    <button
      onClick={toggle}
      title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      className={clsx(
        'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition',
        isLight
          ? 'border-indigo-400/30 bg-indigo-500/10 text-indigo-400 hover:border-indigo-400/50 hover:bg-indigo-500/15 hover:text-indigo-300'
          : 'border-amber-400/30 bg-amber-500/10 text-amber-400 hover:border-amber-400/50 hover:bg-amber-500/15 hover:text-amber-300',
      )}
    >
      {isLight ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
      <span>{isLight ? 'Dark mode' : 'Light mode'}</span>
    </button>
  )
}
