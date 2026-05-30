/**
 * useDeadlineTrigger.ts — 마감 자동 감지 훅
 *
 * UX 명세 §Journey 2 "마감 완료 루프": "자동 팝업(마감 시각)" 트리거 기반
 *
 * 동작:
 *   1. 오늘 ACTIVE / RESUMED 페이지를 useLiveQuery로 구독
 *   2. 1분 단위로 deadlineAt <= now 검사
 *   3. 가장 마감이 임박한 페이지를 반환 (triggeredPage)
 *   4. 팝업이 닫힐 때 dismiss() 호출 → 재표시 방지
 *
 * 원칙:
 *   - useLiveQuery = 단일 진실 공급원 (useState로 DB 복사 금지)
 *   - setInterval = 표시용 타이머만 (실제 기록은 new Date())
 *   - DONE 상태 페이지는 자동으로 목록에서 제외됨
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayString, type Page } from '@/lib/db'
import { getDisplayNow } from '@/lib/time'

// ─── 반환 타입 ───────────────────────────────────────────────

export interface DeadlineTriggerResult {
  /** 마감이 지났고 아직 완료 처리되지 않은 페이지 (가장 우선순위 높은 1개) */
  triggeredPage: Page | null
  /** 팝업 닫기 시 호출 — 해당 pageId를 dismiss 목록에 추가 */
  dismiss: (pageId: number) => void
  /** 수동으로 특정 pageId를 다시 트리거 (인터럽션 재개 후 등) */
  retrigger: (pageId: number) => void
}

// ─── 상수 ───────────────────────────────────────────────────

/**
 * 마감 트리거 유효 창 (분)
 * 마감 후 이 시간이 지나면 팝업 재표시 안 함 — 앱 재시작 시 오래된 마감 반복 방지
 */
const TRIGGER_WINDOW_MINUTES = 60

// ─── 훅 ─────────────────────────────────────────────────────

export function useDeadlineTrigger(): DeadlineTriggerResult {
  // 표시용 타이머 — 1분 단위 (DB 저장과 무관)
  const [now, setNow] = useState(() => getDisplayNow())
  useEffect(() => {
    const id = setInterval(() => setNow(getDisplayNow()), 60_000)
    return () => clearInterval(id)
  }, [])

  // dismiss된 pageId 목록 (세션 메모리 — 재시작 시 초기화)
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(() => new Set())

  const today = todayString()

  // 오늘 마감 감시 대상 — ACTIVE + RESUMED + PAUSED (CRITICAL INTERRUPT 포함)
  // PAUSED는 deadlineAt <= now 조건에서만 팝업 발동 (approaching은 상단 바 색상으로 처리)
  const activePages = useLiveQuery<Page[]>(
    () =>
      db.pages
        .where('date')
        .equals(today)
        .filter(
          (p) =>
            p.status === 'ACTIVE' ||
            p.status === 'RESUMED' ||
            p.status === 'PAUSED',
        )
        .toArray(),
    [today],
  )

  // 마감이 지났고 dismiss되지 않은 페이지 중 가장 우선순위 높은 것
  const triggeredPage = useMemo<Page | null>(() => {
    if (!activePages?.length) return null

    const overdue = activePages.filter((p) => {
      const dl = new Date(p.deadlineAt)
      const msElapsed = now.getTime() - dl.getTime()
      // 마감 후 TRIGGER_WINDOW_MINUTES 이내 + dismiss되지 않은 것만
      return msElapsed >= 0
        && msElapsed <= TRIGGER_WINDOW_MINUTES * 60_000
        && !dismissedIds.has(p.id)
    })

    if (!overdue.length) return null

    // 가장 오래된 마감(deadlineAt 오름차순) = 가장 급한 것
    return overdue.sort(
      (a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime(),
    )[0]
  }, [activePages, now, dismissedIds])

  const dismiss = useCallback((pageId: number) => {
    setDismissedIds((prev) => new Set([...prev, pageId]))
  }, [])

  const retrigger = useCallback((pageId: number) => {
    setDismissedIds((prev) => {
      const next = new Set(prev)
      next.delete(pageId)
      return next
    })
  }, [])

  return { triggeredPage, dismiss, retrigger }
}
