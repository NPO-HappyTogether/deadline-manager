/**
 * ThemeProvider — 다크/라이트 + DND 통합 관리
 *
 * UX 명세 §UX Consistency Patterns §7. 모드 전환 패턴
 * - prefers-color-scheme 실시간 구독
 * - DND 모드: <html data-dnd="true"> → CSS filter: saturate(0.3)
 * - 설정 저장: Dexie settings 테이블
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, updateSettings } from '@/lib/db'

// ─── 타입 ────────────────────────────────────────────────

export type ThemeMode = 'auto' | 'light' | 'dark'

interface ThemeContextValue {
  /** 실제 적용 중인 테마 ('light' | 'dark') */
  resolvedTheme: 'light' | 'dark'
  /** 사용자가 선택한 모드 */
  themeMode: ThemeMode
  /** DND(방해금지) 활성화 여부 */
  dnd: boolean
  /** 테마 모드 변경 */
  setThemeMode: (mode: ThemeMode) => Promise<void>
  /** DND 토글 */
  toggleDnd: () => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

// ─── Provider ───────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  // OS 다크모드 감지
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Dexie 설정 구독
  const settings = useLiveQuery(() => db.settings.get(1))

  const themeMode: ThemeMode = settings?.theme ?? 'auto'
  const dnd: boolean = settings?.dnd ?? false

  // 실제 적용 테마 계산
  const resolvedTheme: 'light' | 'dark' =
    themeMode === 'auto'
      ? systemDark ? 'dark' : 'light'
      : themeMode

  // <html> 클래스 + data 속성 적용
  useEffect(() => {
    const html = document.documentElement
    html.classList.remove('light', 'dark')
    html.classList.add(resolvedTheme)
    html.setAttribute('data-theme', resolvedTheme)
  }, [resolvedTheme])

  useEffect(() => {
    document.documentElement.setAttribute('data-dnd', String(dnd))
  }, [dnd])

  const setThemeMode = async (mode: ThemeMode) => {
    await updateSettings({ theme: mode })
  }

  const toggleDnd = async () => {
    await updateSettings({ dnd: !dnd })
  }

  return (
    <ThemeContext.Provider
      value={{ resolvedTheme, themeMode, dnd, setThemeMode, toggleDnd }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

// ─── 훅 ─────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
