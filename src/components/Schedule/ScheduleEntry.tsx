/**
 * ScheduleEntry.tsx — 하루 시작 스케줄 입력/수정
 *
 * UX 명세 §Component Strategy §7. ScheduleEntry, §Journey 1 기반
 *
 * 기능:
 *   - 오늘 등록된 페이지 목록 + 삭제
 *   - 어제 스케줄 복사 (30초 목표 — MVP 성공 기준)
 *   - 새 페이지 추가: 섹션 → 면 번호 → 마감 시각 → 저장
 *   - 최근 면 번호 자동 제안 (해당 섹션의 최근 5개)
 *   - 마감 시각 중복 경고 (저장은 허용)
 *
 * 원칙:
 *   - useLiveQuery = 단일 진실 공급원 (useState로 DB 복사 금지)
 *   - 명시적 "추가" 버튼 (즉시 저장 + undo 대신 의도적 확인)
 *   - 3탭 이내 완결 (UX 명세 §폼 패턴)
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { cn } from '@/lib/utils'
import { db, todayString, type Page } from '@/lib/db'
import { calcDeadlineDate, formatTime, parseTimeString } from '@/lib/timeline'
import { usePopupKeyCapture } from '@/hooks/usePopupKeyCapture'
import { dbStatusToUI } from '@/lib/urgency'

// ─── Props ──────────────────────────────────────────────────

export interface ScheduleEntryProps {
  onClose: () => void
}

// ─── 컴포넌트 ────────────────────────────────────────────────

export function ScheduleEntry({ onClose }: ScheduleEntryProps) {
  const today = todayString()
  const yesterday = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  }, [])

  // ── DB 구독 ────────────────────────────────────────────────
  const sections = useLiveQuery(
    () => db.sections.orderBy('displayOrder').filter((s) => s.isActive).toArray(),
    [],
  )
  const todayPages = useLiveQuery(
    () => db.pages.where('date').equals(today).sortBy('deadlineAt'),
    [today],
  )
  const yesterdayPages = useLiveQuery(
    () => db.pages.where('date').equals(yesterday).sortBy('deadlineAt'),
    [yesterday],
  )

  // ── 폼 상태 ───────────────────────────────────────────────
  const [sectionId, setSectionId] = useState<number | ''>('')
  const [pageNumber, setPageNumber] = useState('')
  const [deadlineTime, setDeadlineTime] = useState('')  // "HH:MM"
  const [pageType, setPageType] = useState<Page['pageType']>('editorial')
  const [adding, setAdding] = useState(false)
  const [copyingYesterday, setCopyingYesterday] = useState(false)
  const [error, setError] = useState('')
  const duplicateWarn = false  // 경고 비활성화 (미주면 등 동일 마감 시각 정상)

  // ── 최근 면 번호 제안 (해당 섹션의 최근 5개 고유 번호) ───────
  const recentPageNumbers = useLiveQuery<string[]>(
    () =>
      sectionId
        ? db.pages
            .where('sectionId')
            .equals(sectionId)
            .reverse()
            .limit(50)
            .toArray()
            .then((ps) => {
              const seen = new Set<string>()
              const result: string[] = []
              for (const p of ps) {
                if (!seen.has(p.pageNumber)) {
                  seen.add(p.pageNumber)
                  result.push(p.pageNumber)
                  if (result.length >= 5) break
                }
              }
              return result
            })
        : Promise.resolve([] as string[]),
    [sectionId],
  )

  // 선택한 섹션의 기본 마감 시각 → deadlineTime 자동 설정
  const selectedSection = sections?.find((s) => s.id === sectionId)
  useEffect(() => {
    if (selectedSection && !deadlineTime) {
      setDeadlineTime(
        `${String(selectedSection.deadlineHour).padStart(2, '0')}:${String(selectedSection.deadlineMinute).padStart(2, '0')}`,
      )
    }
  // deadlineTime을 deps에 넣으면 사용자 수정 후 즉시 덮어쓰는 문제 발생 → 의도적 제외
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSection])

  // 중복 마감 시각 경고 비활성화 (같은 섹션 내 여러 면이 동일 마감은 정상)

  // ── Esc 닫기 ──────────────────────────────────────────────
  usePopupKeyCapture({ onEscape: onClose })

  // ── 페이지 추가 ───────────────────────────────────────────
  const handleAdd = useCallback(async () => {
    if (!sectionId || !pageNumber.trim() || !deadlineTime) {
      setError('섹션, 면 번호, 마감 시각을 모두 입력해주세요')
      return
    }
    setError('')
    setAdding(true)
    try {
      const now = new Date()
      const deadlineAt = parseTimeString(deadlineTime)
      await db.pages.add({
        sectionId: sectionId as number,
        date: today,
        pageNumber: pageNumber.trim(),
        pageType,
        deadlineAt,
        status: 'WAITING',
        printCount: 0,
        intensityScore: null,
        intensityNote: null,
        autoCompleteContext: null,
        startedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      // 폼 초기화 (섹션/타입은 유지)
      setPageNumber('')
      setDeadlineTime(
        selectedSection
          ? `${String(selectedSection.deadlineHour).padStart(2, '0')}:${String(selectedSection.deadlineMinute).padStart(2, '0')}`
          : '',
      )
    } finally {
      setAdding(false)
    }
  }, [sectionId, pageNumber, deadlineTime, pageType, today, selectedSection])

  // ── 어제 스케줄 복사 ──────────────────────────────────────
  const handleCopyYesterday = useCallback(async () => {
    if (!yesterdayPages?.length) return
    setCopyingYesterday(true)
    try {
      const now = new Date()
      await db.pages.bulkAdd(
        yesterdayPages.map((p) => {
          // 마감 시각에서 날짜 부분만 오늘로 교체
          const origDeadline = new Date(p.deadlineAt)
          const newDeadline = calcDeadlineDate(
            origDeadline.getHours(),
            origDeadline.getMinutes(),
          )
          return {
            sectionId: p.sectionId,
            date: today,
            pageNumber: p.pageNumber,
            pageType: p.pageType,
            deadlineAt: newDeadline,
            status: 'WAITING' as const,
            printCount: 0,
            intensityScore: null,
            intensityNote: null,
            autoCompleteContext: null,
            startedAt: null,
            completedAt: null,
            createdAt: now,
            updatedAt: now,
          }
        }),
      )
    } finally {
      setCopyingYesterday(false)
    }
  }, [yesterdayPages, today])

  // ── 페이지 삭제 ───────────────────────────────────────────
  const handleDelete = useCallback(async (id: number) => {
    await db.pages.delete(id)
  }, [])

  // ─────────────────────────────────────────────────────────

  const sectionMap = useMemo(
    () => new Map(sections?.map((s) => [s.id, s]) ?? []),
    [sections],
  )

  return (
    // 배경 반투명 오버레이 (ScheduleEntry는 전체화면 모달)
    <div
      className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="하루 스케줄 입력"
    >
      <div
        className={cn(
          'w-full max-w-[480px] max-h-[90vh] overflow-y-auto',
          'bg-popover text-popover-foreground',
          'rounded-2xl',
          'shadow-[0_8px_32px_rgba(0,0,0,0.24)]',
          'ring-1 ring-foreground/10',
          'animate-in slide-in-from-bottom-4 fade-in-0 duration-200',
        )}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-base font-semibold">오늘 스케줄</h2>
            <p className="text-xs text-muted-foreground">{today}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm px-2 py-1 rounded hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            닫기
          </button>
        </div>

        {/* 어제 복사 버튼 */}
        {!!yesterdayPages?.length && (
          <div className="px-5 pb-3">
            <button
              type="button"
              onClick={() => void handleCopyYesterday()}
              disabled={copyingYesterday}
              className={cn(
                'w-full h-9 rounded-lg text-sm border border-dashed border-border',
                'text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
                'disabled:opacity-50',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              {copyingYesterday
                ? '복사 중…'
                : `📋 어제 스케줄 복사 (${yesterdayPages.length}개)`}
            </button>
          </div>
        )}

        {/* 오늘 등록 페이지 목록 */}
        {!!todayPages?.length && (
          <div className="px-5 pb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              등록된 작업 ({todayPages.length}개)
            </p>
            <div className="space-y-1.5">
              {todayPages.map((page) => {
                const sec = sectionMap.get(page.sectionId)
                const status = dbStatusToUI(page.status)
                return (
                  <div
                    key={page.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-muted-foreground">
                        {sec?.name ?? '?'}{' '}
                      </span>
                      <span className="text-sm font-medium">{page.pageNumber}</span>
                      <span className="ml-2 text-[11px] text-muted-foreground tabular-nums">
                        {formatTime(new Date(page.deadlineAt))}
                      </span>
                    </div>
                    <StatusChip status={status} />
                    {/* 대기중인 항목만 삭제 가능 */}
                    {status === 'waiting' && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(page.id)}
                        aria-label={`${page.pageNumber} 삭제`}
                        className="text-muted-foreground hover:text-destructive text-[11px] px-1.5 py-0.5 rounded hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 빈 상태 */}
        {todayPages?.length === 0 && (
          <p className="px-5 pb-3 text-sm text-muted-foreground text-center">
            아직 등록된 작업이 없습니다
          </p>
        )}

        {/* 구분선 */}
        <div className="border-t border-border mx-5 mb-4" />

        {/* 새 페이지 추가 폼 */}
        <div className="px-5 pb-5 space-y-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            작업 추가
          </p>

          {/* 섹션 선택 */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">섹션</label>
            <select
              value={sectionId}
              onChange={(e) => {
                setSectionId(e.target.value ? Number(e.target.value) : '')
                setDeadlineTime('')  // 섹션 변경 시 기본값 재설정
              }}
              className={cn(
                'w-full h-9 px-2.5 rounded-lg border border-input text-sm',
                'bg-background',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <option value="">섹션 선택…</option>
              {sections?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* 면 번호 + 최근 제안 */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              면 번호
            </label>
            <input
              type="text"
              value={pageNumber}
              onChange={(e) => setPageNumber(e.target.value)}
              placeholder="예: 4면, 13면, 광고 A"
              className={cn(
                'w-full h-9 px-2.5 rounded-lg border border-input text-sm',
                'bg-background placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            />
            {/* 최근 면 번호 제안 */}
            {!!recentPageNumbers?.length && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {recentPageNumbers.map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setPageNumber(num)}
                    className={cn(
                      'px-2 py-0.5 rounded-md text-[11px]',
                      'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground',
                      'transition-colors',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      pageNumber === num && 'bg-primary/10 text-primary',
                    )}
                  >
                    {num}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 마감 시각 */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              마감 시각
              {duplicateWarn && (
                <span className="ml-2 text-orange-500 dark:text-orange-400">
                  ⚠ 같은 시각의 작업이 이미 있습니다
                </span>
              )}
            </label>
            <input
              type="time"
              value={deadlineTime}
              onChange={(e) => setDeadlineTime(e.target.value)}
              className={cn(
                'w-full h-9 px-2.5 rounded-lg border text-sm',
                'bg-background',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                duplicateWarn ? 'border-orange-400' : 'border-input',
              )}
            />
          </div>

          {/* 작업 타입 */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">종류</label>
            <div className="flex gap-2">
              {(['editorial', 'ad', 'temp'] as const).map((t) => {
                const labels = { editorial: '편집 조판', ad: '광고', temp: '임시업무' }
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPageType(t)}
                    className={cn(
                      'flex-1 h-9 rounded-lg border text-xs font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      pageType === t
                        ? 'border-primary bg-primary/8 text-foreground'
                        : 'border-border hover:bg-muted text-muted-foreground',
                    )}
                  >
                    {labels[t]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          {/* 추가 버튼 */}
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={adding || !sectionId || !pageNumber.trim() || !deadlineTime}
            className={cn(
              'w-full h-10 rounded-lg text-sm font-semibold',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 transition-colors',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            {adding ? '추가 중…' : '작업 추가'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 상태 칩 ─────────────────────────────────────────────────

function StatusChip({ status }: { status: ReturnType<typeof dbStatusToUI> }) {
  const config = {
    waiting:  { label: '대기',    cls: 'bg-muted text-muted-foreground' },
    active:   { label: '진행 중', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    paused:   { label: '일시정지', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
    done:     { label: '완료',    cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  }
  const { label, cls } = config[status]
  return (
    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap', cls)}>
      {label}
    </span>
  )
}
