/**
 * PatternHeatmap.tsx — 인터럽션 패턴 히트맵
 *
 * UX 명세 §Component Strategy §9, §패턴 학습 시스템 기반
 *
 * 단계별 활성화 (데이터가 쌓인 후 점진적 표시 — UX 명세 §Experience Principles):
 *   1단계 (1~4주):   일별 상대 비교 ("오늘 중단 2회 — 어제보다 1회 줄었음")
 *   2단계 (1개월):   요일 패턴 힌트 활성화
 *   3단계 (4주+):   인터럽션 히트맵 전체 활성화 ("수요일이 항상 빨갛다")
 *
 * 원칙:
 *   - 초기 과부하 방지 — 데이터 없을 때 빈 히트맵보다 단계별 피드백
 *   - 패턴 발견은 강요되지 않음 — 데이터가 쌓이면 스스로 보임
 *   - useLiveQuery = 단일 진실 공급원
 */

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { cn } from '@/lib/utils'
import { db, todayString } from '@/lib/db'

// ─── Props ──────────────────────────────────────────────────

export interface PatternHeatmapProps {
  className?: string
}

// ─── 상수 ────────────────────────────────────────────────────

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토']
const HOURS = Array.from({ length: 10 }, (_, i) => i + 9) // 09~18시

// 활성화 임계값 (일수)
const PHASE_2_DAYS = 14  // 2주
const PHASE_3_DAYS = 28  // 4주

// ─── 컴포넌트 ────────────────────────────────────────────────

export function PatternHeatmap({ className }: PatternHeatmapProps) {
  const today = todayString()

  // 모든 인터럽션 데이터
  const allInterruptions = useLiveQuery(
    () => db.interruptions.orderBy('startedAt').toArray(),
    [],
  )

  // 오늘 인터럽션 수
  const todayInterruptions = useLiveQuery(
    () => db.interruptions.where('date').equals(today).count(),
    [today],
  )

  // 어제 인터럽션 수
  const yesterday = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  }, [])
  const yesterdayInterruptions = useLiveQuery(
    () => db.interruptions.where('date').equals(yesterday).count(),
    [yesterday],
  )

  // 데이터 통계
  const stats = useMemo(() => {
    if (!allInterruptions) return null

    // 기록된 날짜 수
    const uniqueDates = new Set(allInterruptions.map((ir) => ir.date))
    const dayCount = uniqueDates.size

    // 요일×시간 히트맵 집계
    const heatmap: Record<number, Record<number, number>> = {}
    for (let d = 0; d < 7; d++) {
      heatmap[d] = {}
      for (const h of HOURS) heatmap[d][h] = 0
    }

    for (const ir of allInterruptions) {
      const date = new Date(ir.startedAt)
      const dow = date.getDay()    // 0=일
      const hour = date.getHours()
      if (heatmap[dow]?.[hour] !== undefined) {
        heatmap[dow][hour]++
      }
    }

    // 최댓값 (히트맵 정규화용)
    const maxCount = Math.max(...Object.values(heatmap).flatMap((h) => Object.values(h)), 1)

    return { dayCount, heatmap, maxCount }
  }, [allInterruptions])

  // ── 단계 판별 ────────────────────────────────────────────
  const phase = useMemo(() => {
    if (!stats) return 0
    if (stats.dayCount >= PHASE_3_DAYS) return 3
    if (stats.dayCount >= PHASE_2_DAYS) return 2
    return 1
  }, [stats])

  if (!stats) {
    return (
      <div className={cn('p-4 text-center text-sm text-muted-foreground', className)}>
        로딩 중…
      </div>
    )
  }

  // ── Phase 1: 일별 상대 비교 ───────────────────────────────
  if (phase === 1) {
    // 첫날 — 아직 쌓인 데이터 없음. 빈 숫자 대신 간단한 안내
    if (stats.dayCount === 0 && (todayInterruptions ?? 0) === 0) {
      return (
        <div className={cn('p-4 text-center', className)}>
          <p className="text-sm text-muted-foreground">
            중단 기록이 쌓이면 패턴을 보여드립니다
          </p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            인터럽션 탭 → 이유 선택(선택사항) → 기록
          </p>
        </div>
      )
    }

    const diff = (todayInterruptions ?? 0) - (yesterdayInterruptions ?? 0)
    return (
      <div className={cn('p-4 space-y-2', className)}>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          오늘 인터럽션
        </p>
        <p className="text-2xl font-bold tabular-nums">
          {todayInterruptions ?? 0}
          <span className="text-sm font-normal text-muted-foreground ml-1">회</span>
        </p>
        {yesterdayInterruptions !== undefined && yesterdayInterruptions > 0 && (
          <p className={cn(
            'text-sm',
            diff < 0 && 'text-green-600 dark:text-green-400',
            diff > 0 && 'text-orange-500 dark:text-orange-400',
            diff === 0 && 'text-muted-foreground',
          )}>
            {diff < 0 && `어제보다 ${Math.abs(diff)}회 줄었어요 ↓`}
            {diff > 0 && `어제보다 ${diff}회 늘었어요 ↑`}
            {diff === 0 && '어제와 동일해요'}
          </p>
        )}
        <p className="text-xs text-muted-foreground/60">
          {PHASE_2_DAYS - stats.dayCount}일 후 요일 패턴 힌트 활성화
        </p>
      </div>
    )
  }

  // ── Phase 2: 요일별 히트 카운트 ──────────────────────────
  if (phase === 2) {
    const dayTotals = DAYS_KO.map((_, i) =>
      Object.values(stats.heatmap[i] ?? {}).reduce((s, v) => s + v, 0),
    )
    const maxDayTotal = Math.max(...dayTotals, 1)

    return (
      <div className={cn('p-4 space-y-3', className)}>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          요일별 중단 패턴
        </p>
        <div className="flex gap-1.5 items-end h-16">
          {DAYS_KO.map((day, i) => {
            const pct = (dayTotals[i] / maxDayTotal) * 100
            const isToday = new Date().getDay() === i
            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={cn(
                    'w-full rounded-sm transition-all',
                    isToday ? 'bg-primary' : 'bg-muted-foreground/30',
                  )}
                  style={{ height: `${Math.max(pct, 4)}%` }}
                />
                <span className={cn(
                  'text-[10px]',
                  isToday ? 'text-primary font-semibold' : 'text-muted-foreground',
                )}>
                  {day}
                </span>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground/60">
          {PHASE_3_DAYS - stats.dayCount}일 후 시간대 히트맵 활성화
        </p>
      </div>
    )
  }

  // ── Phase 3: 요일×시간 전체 히트맵 ──────────────────────
  return (
    <div className={cn('p-4 space-y-3', className)}>
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        인터럽션 히트맵
        <span className="ml-2 text-muted-foreground/60 font-normal normal-case">요일×시간</span>
      </p>

      {/* 시간 헤더 */}
      <div className="flex">
        <div className="w-4 shrink-0" />
        <div className="flex-1 grid grid-cols-10 gap-0.5">
          {HOURS.map((h) => (
            <span key={h} className="text-center text-[9px] text-muted-foreground tabular-nums">
              {h}
            </span>
          ))}
        </div>
      </div>

      {/* 히트맵 그리드 */}
      <div className="space-y-0.5">
        {DAYS_KO.map((day, dow) => (
          <div key={day} className="flex items-center gap-0.5">
            <span className="w-4 text-[10px] text-muted-foreground shrink-0">{day}</span>
            <div className="flex-1 grid grid-cols-10 gap-0.5">
              {HOURS.map((h) => {
                const count = stats.heatmap[dow]?.[h] ?? 0
                const intensity = count / stats.maxCount
                return (
                  <div
                    key={h}
                    title={`${day}요일 ${h}시: ${count}회`}
                    className="h-4 rounded-sm"
                    style={{
                      backgroundColor:
                        count === 0
                          ? 'var(--color-muted, #f3f4f6)'
                          : `rgba(249, 115, 22, ${0.15 + intensity * 0.85})`,
                    }}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        총 {allInterruptions?.length ?? 0}회 인터럽션 · {stats.dayCount}일 누적
      </p>
    </div>
  )
}
