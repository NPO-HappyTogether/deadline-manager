/**
 * ZoomInTimeline.tsx — ±1시간 줌인 타임라인 패널
 *
 * UX 명세 §Component Strategy §3. ZoomInTimeline, §Journey 2, §Journey 3 기반
 *
 * 동작:
 *   - 상단 바 세그먼트 클릭 → 슬라이드다운 (scaleY 0→1, 0.22초)
 *   - Esc 또는 배경 클릭 → 닫기 (9px 바로 복귀)
 *   - 현재 시각 빨간 선 (50% 위치)
 *   - 18:00 이후 오버타임 구간 회색 배경
 *   - 타이머: 창 열릴 때만 활성화 (useEffect cleanup — CLAUDE.md §절대 원칙 3)
 *
 * 페이지 탭 동작 (Journey 3):
 *   WAITING  → ACTIVE 전환 (시작)
 *   ACTIVE/RESUMED → InterruptionPanel 표시 (중단 기록)
 *   PAUSED   → 열린 인터럽션 종료 → RESUMED (즉시 재개)
 *   DONE     → 무시
 *
 * 레이아웃:
 *   - 시간 눈금 (15분 간격) 헤더
 *   - 섹션 내 페이지별 타임라인 막대 행
 *   - 각 행: 편집 막대 (전체) + 인터럽션 막대 (하단 40%)
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, todayString, transitionPageStatus, endInterruption,
  incrementPrintCount, switchActiveTask, undoSwitchActiveTask,
  type SwitchUndoState,
} from '@/lib/db'
import { getDisplayNow } from '@/lib/time'
import { dbStatusToUI } from '@/lib/urgency'
import {
  calcZoomRange,
  calcTimeMarkers,
  nowLinePercent,
  overtimeZonePosition,
  timeToPercent,
} from '@/lib/timeline'
import { useTheme } from '@/providers/ThemeProvider'
import { TimelineBar } from './TimelineBar'
import { InterruptionPanel } from '@/components/Popup/InterruptionPanel'
import { IntensityPopup } from '@/components/Popup/IntensityPopup'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/timeline'
import type { Page, Interruption, Section } from '@/lib/db'

// ─── Props ──────────────────────────────────────────────────

export interface ZoomInTimelineProps {
  sectionId: number
  /** 섹션 이름 — InterruptionPanel 헤더에 표시 */
  sectionName: string
  onClose: () => void
  /** 작업 등록 모달 열기 — 빈 섹션 패널에서 진입점 제공 */
  onOpenSchedule?: () => void
}

// ─── 상수 ────────────────────────────────────────────────────

/** 행 높이 (px) — UX 명세 §Spacing "행: 24px" */
const ROW_HEIGHT = 24
/** 행 간격 */
const ROW_GAP = 6
/** 시간 눈금 헤더 높이 */
const HEADER_HEIGHT = 28
/** 패드 (상하) */
const PANEL_PADDING = 8

// ─── 컴포넌트 ────────────────────────────────────────────────

export function ZoomInTimeline({ sectionId, sectionName, onClose, onOpenSchedule }: ZoomInTimelineProps) {
  // 자체 타이머 — 창 열릴 때만 활성화 (CLAUDE.md §절대 원칙 3)
  const [now, setNow] = useState(() => getDisplayNow())
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // 중단 기록 팝업 대상
  const [interruptionTarget, setInterruptionTarget] = useState<Page | null>(null)

  // ── Shift+Tab 태스크 스위처 상태 (렌더링용) ──────────────
  const [shiftHeld, setShiftHeld]         = useState(false)
  const [cycleIndex, setCycleIndex]       = useState(0)
  const [shiftTabUsed, setShiftTabUsed]   = useState(false)
  const [pendingUndo, setPendingUndo]     = useState<SwitchUndoState | null>(null)
  const [undoCountdown, setUndoCountdown] = useState(0)

  // ── Refs (핸들러에서 즉시 갱신 — useEffect sync 없음) ────
  const shiftHeldRef    = useRef(false)
  const cycleIndexRef   = useRef(0)
  const shiftTabUsedRef = useRef(false)
  const pendingUndoRef  = useRef<SwitchUndoState | null>(null)
  const undoTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // DB/비동기 데이터 refs (useEffect 동기화 — 타이밍 민감하지 않음)
  const interruptionTargetRef = useRef<Page | null>(null)
  useEffect(() => { interruptionTargetRef.current = interruptionTarget }, [interruptionTarget])

  useEffect(() => {
    const id = setInterval(() => setNow(getDisplayNow()), 30_000)
    return () => clearInterval(id)
  }, [])

  // DB 구독 — 현재 섹션 페이지
  const today = todayString()

  const pages = useLiveQuery(
    () =>
      db.pages
        .where('[sectionId+date]')
        .equals([sectionId, today])
        .sortBy('deadlineAt'),
    [sectionId, today],
  )

  const pageIds = useMemo(() => pages?.map((p) => p.id) ?? [], [pages])

  const interruptions = useLiveQuery<Interruption[]>(
    () => db.interruptions.where('pageId').anyOf(pageIds).toArray(),
    [pageIds],
  )

  // 전체 오늘 PAUSED 페이지 — 긴박도 순 정렬 (Shift+Tab 스위처용)
  const allPausedPages = useLiveQuery<Page[]>(
    async () => {
      const pages = await db.pages
        .where('date')
        .equals(today)
        .filter((p) => p.status === 'PAUSED')
        .toArray()
      const now = new Date()
      return pages.sort((a, b) => {
        const aLeft = new Date(a.deadlineAt).getTime() - now.getTime()
        const bLeft = new Date(b.deadlineAt).getTime() - now.getTime()
        // 마감 전 항목 우선, 마감 임박한 순
        if (aLeft >= 0 && bLeft < 0) return -1
        if (aLeft < 0 && bLeft >= 0) return 1
        if (aLeft >= 0 && bLeft >= 0) return aLeft - bLeft  // 임박한 것 먼저
        return bLeft - aLeft  // 둘 다 초과: 최근 초과 먼저
      })
    },
    [today],
  )

  // 전체 오늘 ACTIVE/RESUMED 페이지 — 스위처 FROM 컨텍스트 표시용
  const allActivePages = useLiveQuery<Page[]>(
    () =>
      db.pages
        .where('date')
        .equals(today)
        .filter((p) => p.status === 'ACTIVE' || p.status === 'RESUMED')
        .toArray(),
    [today],
  )

  // 완료 대상 페이지 (마감 전 수동 완료 — IntensityPopup 트리거)
  const [completionTarget, setCompletionTarget] = useState<Page | null>(null)
  const completionTargetRef = useRef<Page | null>(null)
  useEffect(() => { completionTargetRef.current = completionTarget }, [completionTarget])

  // 섹션 맵 (이름용 + 객체용 — IntensityPopup에 Section 전체 필요)
  const allSections = useLiveQuery<Section[]>(() => db.sections.toArray(), [])
  const sectionMap = useMemo(
    () => new Map((allSections ?? []).map((s) => [s.id, s.name])),
    [allSections],
  )
  const sectionObjMap = useMemo(
    () => new Map((allSections ?? []).map((s) => [s.id, s])),
    [allSections],
  )

  // 현재 섹션의 ACTIVE/RESUMED 페이지 (Tab 인쇄 카운트 대상)
  const activePage = useMemo(
    () => pages?.find((p) => p.status === 'ACTIVE' || p.status === 'RESUMED') ?? null,
    [pages],
  )
  const activePageRef = useRef<Page | null>(null)
  useEffect(() => { activePageRef.current = activePage }, [activePage])

  // 스위처에서 순환할 PAUSED 목록 ref
  const pausedForCycleRef = useRef<Page[]>([])
  useEffect(() => {
    pausedForCycleRef.current = allPausedPages ?? []
  }, [allPausedPages])

  // ── undo 실행 ──────────────────────────────────────────────
  const clearUndo = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }
    pendingUndoRef.current = null   // ref 즉시 갱신
    setPendingUndo(null)
    setUndoCountdown(0)
  }, [])

  const handleUndo = useCallback(async () => {
    const undo = pendingUndoRef.current
    if (!undo) return
    clearUndo()
    await undoSwitchActiveTask(undo)
  }, [clearUndo])

  // ── 태스크 전환 실행 ──────────────────────────────────────
  const executeSwitch = useCallback(async (targetPage: Page) => {
    clearUndo()
    // switchActiveTask가 오늘 전체 ACTIVE 페이지를 찾아 PAUSED 처리
    const undo = await switchActiveTask(targetPage.id)
    pendingUndoRef.current = undo   // ref 즉시 갱신
    setPendingUndo(undo)
    setUndoCountdown(1000)
    const start = Date.now()
    const tick = () => {
      const left = 1000 - (Date.now() - start)
      if (left <= 0) {
        pendingUndoRef.current = null
        setPendingUndo(null)
        setUndoCountdown(0)
        undoTimerRef.current = null
        return
      }
      setUndoCountdown(left)
      undoTimerRef.current = setTimeout(tick, 50)
    }
    undoTimerRef.current = setTimeout(tick, 50)
  }, [clearUndo])

  // ── 키보드 이벤트 (Tab / Shift+Tab) ──────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // InterruptionPanel 또는 IntensityPopup 열려 있으면 처리 중단 (Fix 3)
      if (interruptionTargetRef.current || completionTargetRef.current) return

      // Input/Textarea/다른 모달 열려 있으면 Tab 무시 (fix #12)
      const target = e.target as HTMLElement
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      const hasOtherModal = !!document.querySelector(
        '[role="dialog"][aria-modal="true"]:not([aria-label="중단 기록"]):not([aria-label="업무 강도 기록"])'
      )

      // ── Shift 단독 → ref만 기록, 시각 변화 없음 (fix #5) ─
      if (e.key === 'Shift' && !shiftHeldRef.current) {
        shiftHeldRef.current = true
        setShiftHeld(true)
        return
      }

      // ── Tab 단독 → 인쇄 카운트 +1 ───────────────────────
      if (e.key === 'Tab' && !e.shiftKey) {
        if (isInputFocused || hasOtherModal) return
        e.preventDefault()
        if (!shiftHeldRef.current) {
          const p = activePageRef.current
          if (p) void incrementPrintCount(p.id)
        }
        return
      }

      // ── Shift+Tab → 스위처 순환 (fix #5: 시각화는 Tab 눌린 후) ──
      if (e.key === 'Tab' && e.shiftKey) {
        if (isInputFocused || hasOtherModal) return
        e.preventDefault()
        shiftHeldRef.current = true

        const paused = pausedForCycleRef.current
        if (paused.length === 0) return

        if (!shiftTabUsedRef.current) {
          // 첫 Shift+Tab → 스위처 표시 + index 0 (fix #5)
          shiftTabUsedRef.current = true
          cycleIndexRef.current = 0
          setShiftTabUsed(true)
          setCycleIndex(0)
        } else {
          // 이후 Shift+Tab → 순환
          const next = (cycleIndexRef.current + 1) % paused.length
          cycleIndexRef.current = next   // ref 즉시 갱신 (fix #6)
          setCycleIndex(next)
        }
        return
      }

      // ── Escape → undo 또는 스위처 취소 또는 닫기 ─────────
      if (e.key === 'Escape') {
        if (pendingUndoRef.current) {
          void handleUndo()
        } else if (shiftHeldRef.current) {
          shiftHeldRef.current = false     // ref 즉시 (fix #6)
          shiftTabUsedRef.current = false
          cycleIndexRef.current = 0
          setShiftHeld(false)
          setShiftTabUsed(false)
          setCycleIndex(0)
        } else {
          onClose()
        }
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Shift') return
      if (!shiftHeldRef.current) return

      const wasTabUsed = shiftTabUsedRef.current

      // ref 즉시 리셋 (fix #6)
      shiftHeldRef.current = false
      shiftTabUsedRef.current = false
      setShiftHeld(false)
      setShiftTabUsed(false)

      // Tab이 실제로 눌렸을 때만 전환 (fix #5)
      if (!wasTabUsed) return

      const paused = pausedForCycleRef.current
      if (paused.length === 0) return
      const target = paused[cycleIndexRef.current] ?? paused[0]
      void executeSwitch(target)
    }

    // 아키텍처 규칙 1 승인된 예외:
    // ZoomInTimeline은 조건부 렌더링(zoomedSectionId !== null)으로만 마운트됨
    // Tab/Shift+Tab 사이클링은 usePopupKeyCapture 지원 범위 밖 — 직접 처리
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [handleUndo, executeSwitch, onClose])

  // cleanup: 언마운트 시 undo 타이머 정리
  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current) }, [])

  // ── 페이지 클릭 핸들러 ──────────────────────────────────
  const handlePageClick = useCallback(async (page: Page) => {
    const uiStatus = dbStatusToUI(page.status)

    if (uiStatus === 'done') return

    if (uiStatus === 'waiting') {
      await transitionPageStatus(page.id, 'ACTIVE')
      onClose()  // 시작 즉시 패널 닫기 → InDesign으로 바로 복귀
      return
    }

    if (uiStatus === 'active') {
      setInterruptionTarget(page)
      return
    }

    if (uiStatus === 'paused') {
      const openIr = interruptions?.find(
        (ir) => ir.pageId === page.id && !ir.endedAt,
      )
      if (openIr) {
        await endInterruption(openIr.id, page.id)
      } else {
        await transitionPageStatus(page.id, 'RESUMED')
      }
    }
  }, [interruptions])

  // ── 타임라인 계산 ─────────────────────────────────────────
  const range = useMemo(() => calcZoomRange(now), [now])
  const markers = useMemo(() => calcTimeMarkers(range), [range])
  const nowPct = nowLinePercent(range)
  const overtimePos = overtimeZonePosition(range)

  // ── null 안전 처리 (Fix 10) ──────────────────────────────
  const safePages = pages ?? []

  // ── 패널 높이 계산 ────────────────────────────────────────
  const rowCount = safePages.length
  const panelHeight =
    PANEL_PADDING +
    HEADER_HEIGHT +
    rowCount * (ROW_HEIGHT + ROW_GAP) +
    PANEL_PADDING

  // ── Shift+Tab 스위처 표시 여부 (fix #5: Tab 눌린 후에만 표시) ─
  const pausedForCycle = allPausedPages ?? []
  const showSwitcher = shiftHeld && shiftTabUsed && pausedForCycle.length > 0
  const showHint = safePages.some((p) => p.status === 'ACTIVE' || p.status === 'RESUMED')

  return (
    <>
      {/* 배경 클릭 → 닫기 */}
      <div
        className="fixed inset-0 z-40"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* ── 줌인 패널 본체 ────────────────────────────────── */}
      <div
        role="region"
        aria-label="±1시간 타임라인"
        className={cn(
          // StatusBar (최대 44px) 바로 아래
          'fixed top-[44px] left-0 right-0 z-50',
          'border-b border-border',
          'shadow-md',
          // scaleY 0→1 슬라이드다운, 0.22초 (UX 명세 §상태 전환 패턴)
          'origin-top',
          'animate-in slide-in-from-top-1 duration-[220ms] ease-out',
        )}
        style={{
          height: panelHeight,
          backgroundColor: isDark
            ? 'var(--color-timeline-bg-dark)'
            : 'var(--color-timeline-bg)',
        }}
      >
        <div className="relative h-full" style={{ padding: `${PANEL_PADDING}px 16px` }}>

          {/* ── 오버타임 구간 배경 (18:00 이후 회색) ──────── */}
          {overtimePos && (
            <div
              aria-hidden="true"
              className="absolute top-0 bottom-0 opacity-50"
              style={{
                left: `calc(${overtimePos.leftPercent}% + 16px)`,
                right: 16,
                backgroundColor: isDark
                  ? 'var(--color-overtime-bg-dark)'
                  : 'var(--color-overtime-bg)',
              }}
            />
          )}

          {/* ── 현재 시각 빨간 수직 선 ──────────────────── */}
          <div
            aria-hidden="true"
            className="absolute top-0 bottom-0 w-px bg-red-500 z-20 pointer-events-none"
            style={{ left: `calc(${nowPct}% + 16px)` }}
          >
            {/* 상단 원형 도트 */}
            <div className="absolute -top-0.5 -left-[3px] w-[7px] h-[7px] bg-red-500 rounded-full" />
          </div>

          {/* ── 시간 눈금 헤더 ────────────────────────────── */}
          <div
            className="relative select-none"
            style={{ height: HEADER_HEIGHT }}
            aria-hidden="true"
          >
            {markers.map((marker) => (
              <div
                key={marker.label}
                className="absolute top-0 flex flex-col items-center"
                style={{
                  left: `${marker.leftPercent}%`,
                  transform: 'translateX(-50%)',
                }}
              >
                <div className="w-px h-2 bg-border" />
                <span className="text-[10px] text-muted-foreground leading-none mt-0.5 tabular-nums whitespace-nowrap">
                  {marker.label}
                </span>
              </div>
            ))}
          </div>

          {/* ── 섹션 페이지별 타임라인 행 ───────────────── */}
          <div className="relative" style={{ paddingTop: 2 }}>
            {safePages.map((page) => {
              const pageInterruptions =
                interruptions?.filter((ir) => ir.pageId === page.id) ?? []
              const uiStatus = dbStatusToUI(page.status)

              return (
                <div
                  key={page.id}
                  className="relative"
                  style={{ height: ROW_HEIGHT, marginBottom: ROW_GAP }}
                >
                  {/* 편집/광고 막대 (전체 행 높이) */}
                  <TimelineBar
                    type="page"
                    page={page}
                    range={range}
                    now={now}
                    isDark={isDark}
                    rowHeight={ROW_HEIGHT}
                    topOffset={0}
                    onClick={uiStatus !== 'done' ? handlePageClick : undefined}
                  />

                  {/* 완료 버튼 — ACTIVE/PAUSED 모두 표시, 클릭 영역 최대화 (Fix 2·5) */}
                  {(uiStatus === 'active' || uiStatus === 'paused') && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setCompletionTarget(page)
                      }}
                      aria-label={`${page.pageNumber} 완료 처리`}
                      className="absolute right-0 top-0 h-full w-12 flex items-center justify-center z-30 pointer-events-auto"
                    >
                      <span className="text-[10px] text-white font-bold bg-green-600/80 hover:bg-green-600 px-2 py-1 rounded transition-colors">
                        ✓ 완료
                      </span>
                    </button>
                  )}

                  {/* 강도 점수 뱃지 — DONE 상태에서 표시 (Story 4.2) */}
                  {uiStatus === 'done' && page.intensityScore !== null && (
                    <div
                      className="absolute left-1 top-0 h-full flex items-center pointer-events-none z-20"
                      aria-label={`강도 ${page.intensityScore}`}
                    >
                      <span className={[
                        'text-[9px] font-bold px-1 rounded leading-none py-0.5',
                        page.intensityScore === 4
                          ? 'bg-red-500/80 text-white'
                          : 'bg-black/40 text-white',
                      ].join(' ')}>
                        {page.intensityScore === 4 ? `⚠${page.intensityScore}` : page.intensityScore}
                      </span>
                    </div>
                  )}

                  {/* 인쇄 카운트 뱃지 (1차 이상일 때만) */}
                  {(uiStatus === 'active') && (page.printCount ?? 0) > 0 && (
                    <div
                      className="absolute left-1 top-0 h-full flex items-center pointer-events-none z-20"
                      aria-label={`인쇄 ${page.printCount}차`}
                    >
                      <span className="text-[9px] text-white font-bold bg-black/40 px-1 rounded leading-none py-0.5 tabular-nums">
                        {page.printCount}차
                      </span>
                    </div>
                  )}

                  {/* PAUSED 재개 힌트 */}
                  {uiStatus === 'paused' && (
                    <div
                      className="absolute right-1 top-0 h-full flex items-center pointer-events-none z-20"
                      aria-hidden="true"
                    >
                      <span className="text-[9px] text-white/80 font-semibold bg-black/30 px-1 rounded leading-none py-0.5">
                        ▶ 재개
                      </span>
                    </div>
                  )}

                  {/* WAITING 시작 힌트 */}
                  {uiStatus === 'waiting' && (
                    <div
                      className="absolute right-1 top-0 h-full flex items-center pointer-events-none z-20"
                      aria-hidden="true"
                    >
                      <span className="text-[9px] text-white/80 font-semibold bg-black/30 px-1 rounded leading-none py-0.5">
                        ▶ 시작
                      </span>
                    </div>
                  )}

                  {/* 마감 시각 세로 마커 */}
                  <DeadlineMarker
                    deadlineAt={new Date(page.deadlineAt)}
                    range={range}
                    rowHeight={ROW_HEIGHT}
                  />

                  {/* 인터럽션 막대 (행 하단 40%) */}
                  {pageInterruptions.map((ir) => (
                    <TimelineBar
                      key={ir.id}
                      type="interruption"
                      interruption={ir}
                      range={range}
                      now={now}
                      rowHeight={Math.round(ROW_HEIGHT * 0.45)}
                      topOffset={Math.round(ROW_HEIGHT * 0.55)}
                    />
                  ))}
                </div>
              )
            })}

            {/* 빈 상태 — 작업 등록 진입점 (Fix 4) */}
            {(pages ?? []).length === 0 && (
              <div className="text-center py-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  이 섹션에 등록된 작업이 없습니다
                </p>
                {onOpenSchedule && (
                  <button
                    type="button"
                    onClick={() => { onClose(); onOpenSchedule() }}
                    className="text-xs text-primary hover:underline focus-visible:outline-none"
                  >
                    + 작업 등록
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 키보드 힌트 — panelHeight 기반으로 패널 바로 아래 (Fix 7) */}
      {showHint && (
        <div
          className="fixed left-0 right-0 z-50 flex items-center justify-center pointer-events-none select-none"
          style={{ top: 44 + panelHeight + 4 }}
          aria-hidden="true"
        >
          <span className="text-[10px] text-muted-foreground/50 bg-background/80 px-2 py-0.5 rounded-full border border-border/40">
            <kbd className="font-mono text-[9px]">Tab</kbd> 인쇄+1
            &nbsp;·&nbsp;
            <kbd className="font-mono text-[9px]">Shift+Tab</kbd> 작업전환
            &nbsp;·&nbsp;
            <kbd className="font-mono text-[9px]">Esc</kbd> 닫기
          </span>
        </div>
      )}

      {/* ── 중단 기록 패널 ──────────────────────────────────── */}
      {interruptionTarget && (
        <InterruptionPanel
          page={interruptionTarget}
          sectionName={sectionName}
          onDone={() => setInterruptionTarget(null)}
          onDismiss={() => setInterruptionTarget(null)}
        />
      )}

      {/* ── 수동 완료 IntensityPopup ─────────────────────────── */}
      {completionTarget && sectionObjMap.get(completionTarget.sectionId) && (
        <IntensityPopup
          page={completionTarget}
          section={sectionObjMap.get(completionTarget.sectionId)!}
          skipConfirm={false}
          onDone={() => { setCompletionTarget(null); onClose() }}
          onDismiss={() => setCompletionTarget(null)}
        />
      )}

      {/* ── Shift+Tab 태스크 스위처 오버레이 ─────────────────── */}
      {showSwitcher && (
        <div
          className={cn(
            'fixed z-[55] left-1/2 -translate-x-1/2',
            'top-[calc(44px+8px)]',
            'w-[340px]',
            'bg-popover text-popover-foreground',
            'rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.28)]',
            'ring-1 ring-foreground/10',
            'p-3',
            'animate-in fade-in-0 duration-100',
          )}
          role="listbox"
          aria-label="작업 전환"
        >
          {/* FROM 컨텍스트 — 현재 작업 중인 페이지 표시 (fix #7) */}
          {allActivePages && allActivePages.length > 0 && (
            <div className="mb-2 pb-2 border-b border-border">
              <p className="text-[10px] text-muted-foreground mb-1 px-1">현재 작업 중 → 일시정지 예정</p>
              {allActivePages.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-1 py-0.5">
                  <span className="text-[11px] font-semibold truncate">
                    {sectionMap.get(p.sectionId) ?? '?'} · {p.pageNumber}
                  </span>
                  {(p.printCount ?? 0) > 0 && (
                    <span className="text-[9px] bg-muted px-1 py-0.5 rounded font-bold">
                      {p.printCount}차
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            전환할 작업 · Shift 놓기 = 확정 · Esc = 취소
          </p>
          <div className="space-y-1">
            {pausedForCycle.map((p, idx) => {
              const secName = sectionMap.get(p.sectionId) ?? '?'
              const isHighlighted = idx === cycleIndex
              return (
                <div
                  key={p.id}
                  role="option"
                  aria-selected={isHighlighted}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors',
                    isHighlighted
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  <span className="text-[11px] font-medium flex-1 truncate">
                    {isHighlighted && '▶ '}{secName} · {p.pageNumber}
                  </span>
                  <span className="text-[10px] tabular-nums opacity-70">
                    {formatTime(new Date(p.deadlineAt))}
                  </span>
                  {(p.printCount ?? 0) > 0 && (
                    <span className={cn(
                      'text-[9px] font-bold px-1 py-0.5 rounded',
                      isHighlighted ? 'bg-white/20' : 'bg-muted',
                    )}>
                      {p.printCount}차
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 전환 후 1초 undo 토스트 ───────────────────────────── */}
      {pendingUndo && (
        <div
          className={cn(
            'fixed z-[55] left-1/2 -translate-x-1/2 bottom-6',
            'flex items-center gap-3',
            'bg-foreground text-background',
            'rounded-full px-4 py-2',
            'shadow-lg text-[12px] font-medium',
            'animate-in slide-in-from-bottom-2 fade-in-0 duration-150',
          )}
          role="status"
          aria-live="polite"
        >
          <span>작업 전환됨</span>
          <div
            className="h-1 rounded-full bg-background/30 overflow-hidden"
            style={{ width: 40 }}
          >
            <div
              className="h-full bg-background rounded-full transition-none"
              style={{ width: `${(undoCountdown / 1000) * 100}%` }}
            />
          </div>
          <span className="opacity-60 text-[11px]">Esc 취소</span>
        </div>
      )}
    </>
  )
}

// ─── 마감 시각 세로 마커 ─────────────────────────────────────

function DeadlineMarker({
  deadlineAt,
  range,
  rowHeight,
}: {
  deadlineAt: Date
  range: ReturnType<typeof calcZoomRange>
  rowHeight: number
}) {
  const pos = timeToPercent(deadlineAt, range)
  if (!pos.isVisible) return null

  return (
    <div
      aria-hidden="true"
      className="absolute z-10 flex items-start pointer-events-none"
      style={{
        left: `${pos.leftPercent}%`,
        top: 0,
        height: rowHeight,
        transform: 'translateX(-50%)',
      }}
    >
      {/* 세로선 */}
      <div
        className="w-px bg-foreground/25 h-full"
        style={{ minHeight: rowHeight }}
      />
      {/* 시각 레이블 */}
      <span className="absolute -top-[13px] left-0.5 text-[9px] text-muted-foreground tabular-nums whitespace-nowrap leading-none">
        {formatTime(deadlineAt)}
      </span>
    </div>
  )
}
