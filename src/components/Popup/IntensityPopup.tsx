/**
 * IntensityPopup.tsx — 업무 강도 기록 팝업
 *
 * UX 명세 §Component Strategy §5. IntensityPopup 기반
 *
 * 흐름:
 *   Step confirm → 완료 확인 (Space / 버튼)
 *   Step intensity → 강도 1~4 선택 (7.5초 자동소멸)
 *   Step memo → 강도 4 선택 시 메모창 슬라이드인
 *
 * 원칙:
 *   - usePopupKeyCapture 사용 (팝업 마운트 시에만 키 캡처)
 *   - 배경 dim 없음 — 다른 앱이 계속 보여야 함
 *   - drop-shadow로 "내 앱 팝업"임을 즉시 인식
 *   - 자동소멸: intensity: null, tag: "자동", autoCompleteContext 저장
 *   - 트리거 딜레이: 1.5초 후 intensity 단계로 (확인 단계 없이 바로 강도 요청 시)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { usePopupKeyCapture } from '@/hooks/usePopupKeyCapture'
import { db, countTodayInterruptions } from '@/lib/db'
import { useLiveQuery } from 'dexie-react-hooks'
import { formatTime } from '@/lib/timeline'
import type { Page, Section, AutoCompleteContext } from '@/lib/db'

// ─── Props ──────────────────────────────────────────────────

export interface IntensityPopupProps {
  page: Page
  section: Section
  /**
   * confirm 단계를 건너뛰고 intensity로 바로 진입 여부
   * true = 마감 완료 직후 1.5초 딜레이 후 자동 진입 (Journey 2)
   * false = 사용자 수동 탭 (confirm 단계부터)
   */
  skipConfirm?: boolean
  /** 완료 기록 완료 후 호출 */
  onDone: () => void
  /** Esc 또는 닫기 — 완료 아님, 상태 유지 */
  onDismiss: () => void
}

// ─── 상수 ────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 7500       // 7.5초 자동소멸 (UX 명세: 7~8초)
const AUTO_DISMISS_WARN_MS = 1000  // 소멸 1초 전 경고

/** 강도 레이블 — 차분한 언어 (패닉 증폭 금지) */
const INTENSITY_LABELS: Record<1 | 2 | 3 | 4, { short: string; sub: string }> = {
  1: { short: '여유',    sub: '순조로웠음' },
  2: { short: '보통',    sub: '무난했음' },
  3: { short: '힘듦',   sub: '힘들었음' },
  4: { short: '매우힘듦', sub: '크리티컬' },
}

// ─── 컴포넌트 ────────────────────────────────────────────────

export function IntensityPopup({
  page,
  section,
  skipConfirm = false,
  onDone,
  onDismiss,
}: IntensityPopupProps) {
  type Step = 'confirm' | 'intensity' | 'memo'
  const [step, setStep] = useState<Step>(skipConfirm ? 'intensity' : 'confirm')
  const [memo, setMemo] = useState('')
  const [timeLeft, setTimeLeft] = useState(AUTO_DISMISS_MS)
  const [showAutoSaveHint, setShowAutoSaveHint] = useState(false)

  const memoInputRef = useRef<HTMLInputElement>(null)
  const timerStartRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 오늘 인터럽션 횟수 — 자동완료 컨텍스트용 (useLiveQuery = 단일 진실 공급원)
  const todayInterruptions = useLiveQuery(() => countTodayInterruptions(), [])

  // ── intensity step 진입 시 자동소멸 타이머 ────────────────
  useEffect(() => {
    if (step !== 'intensity') return

    timerStartRef.current = Date.now()
    setTimeLeft(AUTO_DISMISS_MS)
    setShowAutoSaveHint(false)

    timerRef.current = setInterval(() => {
      const remaining = AUTO_DISMISS_MS - (Date.now() - timerStartRef.current)
      setTimeLeft(Math.max(0, remaining))
      if (remaining <= AUTO_DISMISS_WARN_MS) setShowAutoSaveHint(true)
      if (remaining <= 0) {
        clearInterval(timerRef.current!)
        void handleAutoComplete()
      }
    }, 100)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // ── memo step: input auto-focus ───────────────────────────
  useEffect(() => {
    if (step === 'memo') {
      const t = setTimeout(() => memoInputRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
  }, [step])

  // ── DB 저장 ───────────────────────────────────────────────
  const saveIntensity = useCallback(
    async (
      intensity: 1 | 2 | 3 | 4 | null,
      note: string | null,
      autoCtx: AutoCompleteContext | null,
    ) => {
      if (timerRef.current) clearInterval(timerRef.current)

      const now = new Date()
      const triggeredBy = intensity === null ? ('auto' as const) : ('user' as const)

      // intensity 필드 저장 + DONE 전환 (트랜잭션)
      await db.transaction('rw', db.pages, db.statusHistory, async () => {
        await db.pages.update(page.id, {
          intensityScore: intensity,
          intensityNote: note,
          autoCompleteContext: autoCtx,
          completedAt: now,
          updatedAt: now,
          status: 'DONE',
        })
        await db.statusHistory.add({
          pageId: page.id,
          fromStatus: page.status,
          toStatus: 'DONE',
          changedAt: now,
          triggeredBy,
        })
      })

      onDone()
    },
    [page.id, page.status, onDone],
  )

  const handleAutoComplete = useCallback(async () => {
    const ctx: AutoCompleteContext = {
      concurrentActive: 0,   // Phase 2에서 정밀화
      concurrentPaused: 0,
      minutesToDeadline: Math.round(
        (new Date(page.deadlineAt).getTime() - Date.now()) / 60_000,
      ),
      interruptionsToday: todayInterruptions ?? 0,
      lastKeypressGap: Math.round((Date.now() - timerStartRef.current) / 1000),
    }
    await saveIntensity(null, null, ctx)
  }, [page.deadlineAt, todayInterruptions, saveIntensity])

  const handleIntensitySelect = useCallback(
    async (n: 1 | 2 | 3 | 4) => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (n === 4) {
        setStep('memo')
      } else {
        await saveIntensity(n, null, null)
      }
    },
    [saveIntensity],
  )

  const handleMemoSubmit = useCallback(async () => {
    await saveIntensity(4, memo.trim() || null, null)
  }, [memo, saveIntensity])

  // ── 키 캡처 — usePopupKeyCapture (CLAUDE.md §절대 원칙 1) ──
  usePopupKeyCapture({
    onSpace: step === 'confirm' ? () => setStep('intensity') : undefined,
    onNumber: step === 'intensity' ? handleIntensitySelect : undefined,
    onEnter: step === 'memo' ? handleMemoSubmit : undefined,
    onEscape: onDismiss,
  })

  // ── 자동소멸 진행 바 퍼센트 ────────────────────────────────
  const progressPct = (timeLeft / AUTO_DISMISS_MS) * 100

  return (
    // 배경 dim 없음 — fixed overlay는 pointer-events-none (CLAUDE.md §자주 하는 실수)
    <div
      className="fixed inset-0 z-[60] pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="업무 강도 기록"
    >
      {/* 팝업 본체 — 화면 하단 중앙 부유, drop-shadow로 식별 */}
      <div
        className={cn(
          'absolute bottom-16 left-1/2 -translate-x-1/2',
          'w-[320px] pointer-events-auto',
          'bg-popover text-popover-foreground',
          'rounded-xl',
          'shadow-[0_8px_32px_rgba(0,0,0,0.24)]',
          'ring-1 ring-foreground/10',
          'animate-in slide-in-from-bottom-4 fade-in-0 duration-200',
        )}
      >
        {/* ────────────── Step: confirm ────────────────────── */}
        {step === 'confirm' && (
          <div className="p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {section.name}
            </p>
            <h2 className="text-[15px] font-semibold leading-snug mb-0.5">
              {page.pageNumber}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {formatTime(new Date(page.deadlineAt))} 마감 — 완료로 기록할까요?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('intensity')}
                className={cn(
                  'flex-1 h-10 rounded-lg text-sm font-semibold',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                완료{' '}
                <kbd className="ml-1 opacity-60 text-[11px] font-normal">Space</kbd>
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className={cn(
                  'h-10 px-4 rounded-lg text-sm',
                  'border border-border hover:bg-muted transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                닫기{' '}
                <kbd className="ml-0.5 opacity-60 text-[11px] font-normal">Esc</kbd>
              </button>
            </div>
          </div>
        )}

        {/* ────────────── Step: intensity ──────────────────── */}
        {step === 'intensity' && (
          <div className="p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {section.name} · {page.pageNumber}
            </p>
            <h2 className="text-sm font-semibold leading-snug mb-3">
              이 마감의 강도를 기록해주세요
            </h2>

            {/* 강도 버튼 1~4 */}
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {([1, 2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => void handleIntensitySelect(n)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1',
                    'h-[52px] rounded-lg border border-border',
                    'hover:bg-muted transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    n === 4 && 'border-orange-300 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/30',
                  )}
                >
                  <span className="text-[18px] font-bold leading-none">{n}</span>
                  <span className="text-[9px] text-muted-foreground leading-tight text-center px-0.5">
                    {INTENSITY_LABELS[n].short}
                  </span>
                </button>
              ))}
            </div>

            {/* 자동소멸 진행 바 */}
            <div className="h-[3px] bg-muted rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full bg-muted-foreground/30 rounded-full transition-[width] duration-100"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* "자동 저장됩니다…" — 소멸 1초 전만 표시 */}
            <p
              className={cn(
                'text-[11px] text-center text-muted-foreground',
                'transition-opacity duration-300',
                showAutoSaveHint ? 'opacity-100' : 'opacity-0',
              )}
            >
              자동 저장됩니다…
            </p>
          </div>
        )}

        {/* ────────────── Step: memo (강도 4) ──────────────── */}
        {step === 'memo' && (
          <div className="p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {section.name} · {page.pageNumber}
            </p>
            <h2 className="text-sm font-semibold leading-snug mb-0.5">강도 4 — 매우 힘들었음</h2>
            <p className="text-xs text-muted-foreground mb-3">
              무슨 일이 있었나요?{' '}
              <span className="opacity-60">(안 해도 됩니다)</span>
            </p>
            <input
              ref={memoInputRef}
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="한 줄로 적어두세요"
              maxLength={100}
              className={cn(
                'w-full h-9 px-3 rounded-lg border border-input text-sm',
                'bg-background placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'mb-3',
              )}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleMemoSubmit()}
                className={cn(
                  'flex-1 h-9 rounded-lg text-sm font-semibold',
                  'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                저장{' '}
                <kbd className="ml-1 opacity-60 text-[11px] font-normal">Enter</kbd>
              </button>
              <button
                type="button"
                onClick={() => void saveIntensity(4, null, null)}
                className={cn(
                  'h-9 px-3 rounded-lg text-sm text-muted-foreground',
                  'hover:bg-muted transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                건너뛰기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
