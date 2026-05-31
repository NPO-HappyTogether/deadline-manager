/**
 * PwaUpdateBanner.tsx — PWA 새 버전 업데이트 배너 (Story 7.3)
 *
 * vite-plugin-pwa useRegisterSW 훅 활용
 * 사용자가 확인할 때만 새로고침 (자동 강제 없음)
 */

import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdateBanner() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      // P8: cleanup 추가 — 재마운트 시 중복 interval 방지
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (r) {
        intervalRef.current = setInterval(() => void r.update(), 60 * 60_000)
      }
    },
  })

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-16 left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-xl border border-border bg-card shadow-lg px-4 py-3">
      <p className="text-sm text-foreground">
        새 버전이 있습니다.
      </p>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
        >
          나중에
        </button>
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors min-h-[32px]"
        >
          새로고침
        </button>
      </div>
    </div>
  )
}
