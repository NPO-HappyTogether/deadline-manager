/**
 * App.tsx — 최상위 컴포넌트
 *
 * Phase 2 완성 — 자동 트리거 + 결산 + 히트맵 통합
 *
 * 자동 흐름:
 *   1. useDeadlineTrigger → 마감 지난 페이지 감지
 *      → 1.5초 딜레이 → IntensityPopup(skipConfirm=true) 표시
 *   2. 오늘 모든 페이지 DONE → DailyClosingSummary 자동 트리거
 *      (마지막 페이지가 DONE 되는 순간 감지)
 *   3. PatternHeatmap → 하단 분석 패널 (스케줄 있을 때 표시)
 */

import { useEffect, useState, useRef, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { StatusBar } from '@/components/TopBar/StatusBar'
import { isMockTimeActive, getDisplayNow } from '@/lib/time'
import { ScheduleEntry } from '@/components/Schedule/ScheduleEntry'
import { IntensityPopup } from '@/components/Popup/IntensityPopup'
import { DailyClosingSummary } from '@/components/Summary/DailyClosingSummary'
import { PatternHeatmap } from '@/components/Analytics/PatternHeatmap'
import { SettingsPanel } from '@/components/Settings/SettingsPanel'
import { useDeadlineTrigger } from '@/hooks/useDeadlineTrigger'
import { db, initializeDB, todayString } from '@/lib/db'
import { dbStatusToUI } from '@/lib/urgency'
import type { Page, Section } from '@/lib/db'

// ─── 메인 컨텐츠 (DB 초기화 완료 후 렌더) ──────────────────

function AppContent() {
  const [dbReady, setDbReady] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [showClosingSummary, setShowClosingSummary] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // DB 초기화 (기본 섹션 + 설정 시드)
  useEffect(() => {
    initializeDB()
      .then(() => setDbReady(true))
      .catch(err => {
        console.error('DB 초기화 실패:', err)
        setDbReady(true) // 에러여도 앱은 표시 (빈 상태로라도)
      })
  }, [])

  const today = todayString()

  // 오늘 페이지 목록 — useLiveQuery 단일 진실 공급원
  const todayPages = useLiveQuery<Page[]>(
    () => dbReady ? db.pages.where('date').equals(today).toArray() : Promise.resolve([] as Page[]),
    [dbReady, today],
  )

  const todayPageCount = todayPages?.length ?? null

  // 섹션 맵 (IntensityPopup에 section prop 전달용)
  const sections = useLiveQuery<Section[]>(
    () => db.sections.toArray(),
    [],
  )
  const sectionMap = useMemo(
    () => new Map(sections?.map((s) => [s.id, s]) ?? []),
    [sections],
  )

  // ── 마감 자동 트리거 ───────────────────────────────────────
  const { triggeredPage, dismiss } = useDeadlineTrigger()

  // 1.5초 딜레이 후 IntensityPopup 표시
  // useRef로 현재 보여줄 page를 들고 있음 (setState와 별개)
  const [intensityPage, setIntensityPage] = useState<typeof triggeredPage>(null)
  const triggerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTriggeredIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!triggeredPage) return
    // 이미 이 페이지 팝업 대기 중이거나 표시 중이면 스킵
    if (triggeredPage.id === lastTriggeredIdRef.current) return

    lastTriggeredIdRef.current = triggeredPage.id

    // 기존 타이머 취소
    if (triggerTimerRef.current) clearTimeout(triggerTimerRef.current)

    // 1.5초 딜레이 후 팝업 표시
    triggerTimerRef.current = setTimeout(() => {
      setIntensityPage(triggeredPage)
      triggerTimerRef.current = null
    }, 1500)

    return () => {
      if (triggerTimerRef.current) {
        clearTimeout(triggerTimerRef.current)
        triggerTimerRef.current = null
      }
    }
  }, [triggeredPage])

  const handleIntensityDone = () => {
    if (intensityPage) dismiss(intensityPage.id)
    setIntensityPage(null)
    lastTriggeredIdRef.current = null
  }

  const handleIntensityDismiss = () => {
    if (intensityPage) dismiss(intensityPage.id)
    setIntensityPage(null)
    lastTriggeredIdRef.current = null
  }

  // ── 일일 결산 자동 트리거 ─────────────────────────────────
  // 오늘 페이지가 전부 DONE이 되는 순간 한 번만 표시
  const closingSummaryShownRef = useRef(false)
  const prevAllDoneRef = useRef(false)

  const allPagesDone = useMemo(() => {
    if (!todayPages || todayPages.length === 0) return false
    return todayPages.every((p) => dbStatusToUI(p.status) === 'done')
  }, [todayPages])

  useEffect(() => {
    // false → true 전환 감지 (엣지 트리거)
    if (allPagesDone && !prevAllDoneRef.current && !closingSummaryShownRef.current) {
      closingSummaryShownRef.current = true
      setShowClosingSummary(true)
    }
    prevAllDoneRef.current = allPagesDone
  }, [allPagesDone])

  // ── 렌더 ──────────────────────────────────────────────────

  if (!dbReady) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">로딩 중…</p>
      </div>
    )
  }

  const hasSchedule = (todayPageCount ?? 0) > 0

  return (
    <>
      {/* mockTime 활성화 배너 — 개발 테스트 중임을 명확히 표시 */}
      {isMockTimeActive && (
        <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center bg-yellow-400 text-yellow-900 text-[11px] font-bold py-0.5 pointer-events-none select-none">
          🕘 시간 오버라이드 중: {getDisplayNow().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      {/* 최상단 상태 바 — 항상 표시 */}
      <StatusBar onOpenSchedule={() => setShowSchedule(true)} />

      {/* StatusBar 높이만큼 padding (최대 44px) */}
      <main className="flex-1 flex flex-col" style={{ paddingTop: 44 }}>

        {/* 오늘 작업 미등록 → 진입 안내 */}
        {todayPageCount === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                오늘 작업할 면을 등록해주세요
              </p>
              <p className="text-xs text-muted-foreground/50">
                상단 회색 바 = 섹션 기본 마감 (작업 등록 전)
              </p>
              <button
                type="button"
                onClick={() => setShowSchedule(true)}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                작업 등록
              </button>
            </div>
          </div>
        )}

        {/* 스케줄 있을 때 — 히트맵 */}
        {hasSchedule && (
          <div className="px-4 py-3">
            <PatternHeatmap className="bg-muted/30 rounded-xl" />
          </div>
        )}

        {/* 하단 도구 모음 — 항상 표시 (스케줄 없을 때도 설정 접근 가능) */}
        <div className="fixed bottom-4 right-4 flex gap-2">
          {hasSchedule && (
            <>
              <button
                type="button"
                onClick={() => setShowClosingSummary(true)}
                className="px-3 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors shadow-sm ring-1 ring-border"
              >
                결산
              </button>
              <button
                type="button"
                onClick={() => setShowSchedule(true)}
                className="px-3 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors shadow-sm ring-1 ring-border"
              >
                스케줄 수정
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="px-3 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors shadow-sm ring-1 ring-border"
            aria-label="설정"
            title="설정 (섹션·마감·테마·방해금지)"
          >
            ⚙ 설정
          </button>
        </div>
      </main>

      {/* 하루 시작 스케줄 입력 */}
      {showSchedule && (
        <ScheduleEntry onClose={() => setShowSchedule(false)} />
      )}

      {/* IntensityPopup — 마감 감지 후 1.5초 딜레이 자동 표시 */}
      {intensityPage && sectionMap.get(intensityPage.sectionId) && (
        <IntensityPopup
          page={intensityPage}
          section={sectionMap.get(intensityPage.sectionId)!}
          skipConfirm={true}
          onDone={handleIntensityDone}
          onDismiss={handleIntensityDismiss}
        />
      )}

      {/* 일일 결산 — 모든 면 완료 시 자동 표시 또는 수동 */}
      {showClosingSummary && (
        <DailyClosingSummary
          onClose={() => setShowClosingSummary(false)}
        />
      )}

      {/* 설정 패널 */}
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
    </>
  )
}

// ─── 루트 앱 ─────────────────────────────────────────────────

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <div className="flex flex-col min-h-svh">
          <AppContent />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  )
}
