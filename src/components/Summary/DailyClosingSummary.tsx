/**
 * DailyClosingSummary.tsx — 일일 결산 스냅샷
 *
 * UX 명세 §Journey 5, §Component Strategy §8 기반
 *
 * 트리거: 마지막 인쇄소 확인 완료(DONE) 후 자동 (App.tsx에서 감지)
 *
 * 구성:
 *   - 오늘 타임라인 읽기 전용 요약 (섹션별 완료 상태)
 *   - 색깔 요약 카운트 (완료/중단/강도 분포)
 *   - 인수인계 메모 입력
 *   - 저장 → Dexie DailySummary 테이블
 *
 * 원칙:
 *   - useLiveQuery = 단일 진실 공급원
 *   - 저장은 명시적 버튼 (의도적 확인)
 *   - 저장 성공은 조용하게 (토스트 없음 — UX 명세 §피드백 패턴)
 */

import { useState, useMemo, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { cn } from '@/lib/utils'
import { db, todayString, getInterruptionsForDate } from '@/lib/db'
import { dbStatusToUI } from '@/lib/urgency'
import { formatTime } from '@/lib/timeline'
import { usePopupKeyCapture } from '@/hooks/usePopupKeyCapture'
import { rowsToCsv, downloadCsv, formatTime as fmtTime } from '@/lib/export'
import type { ExportRow } from '@/lib/export'

// ─── Props ──────────────────────────────────────────────────

export interface DailyClosingSummaryProps {
  onClose: () => void
}

// ─── 컴포넌트 ────────────────────────────────────────────────

export function DailyClosingSummary({ onClose }: DailyClosingSummaryProps) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const today = todayString()

  // DB 구독
  const sections = useLiveQuery(
    () => db.sections.orderBy('displayOrder').filter((s) => s.isActive).toArray(),
    [],
  )
  const pages = useLiveQuery(
    () => db.pages.where('date').equals(today).sortBy('deadlineAt'),
    [today],
  )
  const interruptions = useLiveQuery(
    () => getInterruptionsForDate(today),
    [today],
  )

  usePopupKeyCapture({ onEscape: onClose })

  // ── 집계 계산 ─────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!pages) return null

    const total = pages.length
    const done = pages.filter((p) => dbStatusToUI(p.status) === 'done').length
    const paused = pages.filter((p) => dbStatusToUI(p.status) === 'paused').length
    const active = pages.filter((p) => dbStatusToUI(p.status) === 'active').length

    const intensityDist: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
    for (const p of pages) {
      if (p.intensityScore) {
        intensityDist[p.intensityScore as 1 | 2 | 3 | 4]++
      }
    }

    const avgIntensity =
      pages.filter((p) => p.intensityScore).length > 0
        ? pages.reduce((sum, p) => sum + (p.intensityScore ?? 0), 0) /
          pages.filter((p) => p.intensityScore).length
        : null

    return { total, done, paused, active, intensityDist, avgIntensity }
  }, [pages])

  const interruptionCount = interruptions?.length ?? 0

  // ── 저장 ─────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!pages || !stats) return
    setSaving(true)
    try {
      const snapshotJson = JSON.stringify(
        pages.map((p) => ({
          id: p.id,
          sectionId: p.sectionId,
          pageNumber: p.pageNumber,
          status: p.status,
          deadlineAt: p.deadlineAt,
          intensityScore: p.intensityScore,
          completedAt: p.completedAt,
        })),
      )

      // upsert — 같은 날 여러 번 저장 허용 (최신으로 덮어씀)
      const existing = await db.dailySummary.where('date').equals(today).first()
      const now = new Date()
      const record = {
        date: today,
        snapshotJson,
        totalInterruptions: interruptionCount,
        completedSections: stats.done,
        intensityDistribution: stats.intensityDist,
        savedAt: now,
        note: note.trim() || null,
      }

      if (existing) {
        await db.dailySummary.update(existing.id, record)
      } else {
        await db.dailySummary.add(record)
      }

      setSaved(true)

      // CSV 자동 저장 (Story 6.1) — export.ts를 통해서만 호출 (절대 규칙 7)
      //
      // TODO(D1): pages/sections는 useLiveQuery 스냅샷, interruptions는 별도 조회
      // DB write와 다른 트랜잭션이므로 극히 드물게 불일치 가능
      // 개선 방법: handleSave 시작 시 모든 데이터를 단일 Promise.all로 묶어 스냅샷 고정
      // 현재는 실용적 문제 없음 — 나중에 정밀도가 필요할 때 수정
      if (pages && sections) {
        const sectionMapLocal = new Map(sections.map((s) => [s.id, s]))
        const interruptions = await db.interruptions.where('date').equals(today).toArray()
        const interruptsByPage = new Map<number, typeof interruptions>()
        for (const ir of interruptions) {
          const arr = interruptsByPage.get(ir.pageId) ?? []
          arr.push(ir)
          interruptsByPage.set(ir.pageId, arr)
        }

        const rows: ExportRow[] = pages.map((p) => {
          const pageInterrupts = interruptsByPage.get(p.id) ?? []
          return {
            date: today,
            sectionName: sectionMapLocal.get(p.sectionId)?.name ?? '',
            pageNumber: p.pageNumber,
            pageType: p.pageType,
            startedAt: fmtTime(p.startedAt),
            completedAt: fmtTime(p.completedAt),
            printCount: p.printCount,
            interruptCount: pageInterrupts.length,
            interruptReasons: pageInterrupts.map((ir) => ir.reason ?? '').filter(Boolean).join('/'),
            intensityScore: p.intensityScore,
            intensityNote: p.intensityNote,
          }
        })
        const csv = rowsToCsv(rows)
        downloadCsv(csv, `마감기록_${today}.csv`)
      }

      setTimeout(onClose, 1200) // 저장 확인 후 1.2초 후 자동 닫기
    } finally {
      setSaving(false)
    }
  }, [pages, stats, today, interruptionCount, note, onClose, sections])

  const sectionMap = useMemo(
    () => new Map(sections?.map((s) => [s.id, s]) ?? []),
    [sections],
  )

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/40 flex items-end justify-center pb-4 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="일일 결산"
    >
      <div
        className={cn(
          'w-full max-w-[480px] max-h-[85vh] overflow-y-auto',
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
            <h2 className="text-base font-semibold">오늘의 결산</h2>
            <p className="text-xs text-muted-foreground">{today}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            닫기
          </button>
        </div>

        {/* 요약 카운트 */}
        {stats && (
          <div className="px-5 pb-3 grid grid-cols-3 gap-2">
            <StatCard
              label="완료"
              value={`${stats.done}/${stats.total}`}
              color="text-green-600 dark:text-green-400"
            />
            <StatCard
              label="중단 횟수"
              value={String(interruptionCount)}
              color="text-orange-500 dark:text-orange-400"
            />
            <StatCard
              label="평균 강도"
              value={stats.avgIntensity ? stats.avgIntensity.toFixed(1) : '—'}
              color="text-foreground"
            />
          </div>
        )}

        {/* 강도 분포 */}
        {stats && (
          <div className="px-5 pb-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              업무 강도 분포
            </p>
            <div className="flex gap-2">
              {([1, 2, 3, 4] as const).map((n) => (
                <div key={n} className="flex-1 text-center">
                  <div
                    className={cn(
                      'h-8 rounded flex items-center justify-center text-sm font-bold',
                      stats.intensityDist[n] > 0
                        ? n === 4
                          ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                          : 'bg-muted text-foreground'
                        : 'bg-muted/40 text-muted-foreground/40',
                    )}
                  >
                    {stats.intensityDist[n]}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{n}{n === 4 ? '⚠' : ''}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 오늘 타임라인 읽기 전용 목록 */}
        {!!pages?.length && (
          <div className="px-5 pb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              오늘 작업 타임라인
            </p>
            <div className="space-y-1.5">
              {pages.map((page) => {
                const sec = sectionMap.get(page.sectionId)
                const status = dbStatusToUI(page.status)
                return (
                  <div key={page.id} className="flex items-center gap-2 py-1">
                    {/* 상태 색 점 */}
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        status === 'done'    && 'bg-green-500',
                        status === 'active'  && 'bg-blue-500',
                        status === 'paused'  && 'bg-orange-500',
                        status === 'waiting' && 'bg-gray-300',
                      )}
                    />
                    <span className="text-[11px] text-muted-foreground shrink-0 w-[52px]">
                      {sec?.name ?? '?'}
                    </span>
                    <span className="text-sm font-medium flex-1 truncate">
                      {page.pageNumber}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                      {formatTime(new Date(page.deadlineAt))}
                    </span>
                    {page.intensityScore !== null && (
                      <span className={cn(
                        'text-[10px] font-bold px-1 py-0.5 rounded shrink-0',
                        page.intensityScore === 4
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                          : 'bg-muted text-muted-foreground',
                      )}>
                        {page.intensityScore === 4 ? '⚠4' : page.intensityScore}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 인수인계 메모 */}
        <div className="px-5 pb-5">
          <div className="border-t border-border pt-4">
            <label className="text-xs text-muted-foreground mb-1.5 block">
              인수인계 메모{' '}
              <span className="opacity-60">(선택사항)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="내일 이어서 해야 할 것, 주의사항 등…"
              rows={2}
              maxLength={500}
              className={cn(
                'w-full px-3 py-2 rounded-lg border border-input text-sm',
                'bg-background placeholder:text-muted-foreground resize-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'mb-3',
              )}
            />
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || saved}
              className={cn(
                'w-full h-10 rounded-lg text-sm font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                saved
                  ? 'bg-green-500 text-white'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:opacity-50',
              )}
            >
              {saved ? '저장됨 ✓' : saving ? '저장 중…' : '결산 저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── StatCard ─────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div className="bg-muted/50 rounded-xl p-3 text-center">
      <p className={cn('text-xl font-bold tabular-nums', color)}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}
