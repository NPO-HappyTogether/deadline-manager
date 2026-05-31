/**
 * stats.ts — 마감 준수율 및 섹션별 통계 순수 함수 (Story 6.3)
 *
 * 모든 함수는 순수 함수 (사이드이펙트 없음, 테스트 가능)
 */

import type { Page, Section } from './db'

// ─── 타입 정의 ───────────────────────────────────────────────

export interface SectionStat {
  sectionId: number
  sectionName: string
  totalCount: number
  doneCount: number
  lateCount: number          // 마감 초과 후 완료
  avgCompletionMinutes: number | null  // 마감 대비 평균 완료 시각 (음수 = 초과)
}

export interface PeriodStats {
  startDate: string
  endDate: string
  totalPages: number
  donePages: number
  completionRate: number     // 0~100 (%)
  latePages: number
  sectionStats: SectionStat[]
  isHeavyDay: boolean        // 화·수요일 고부하일 여부
}

// ─── 핵심 함수 ───────────────────────────────────────────────

/**
 * 마감 준수율 계산
 * completedAt <= deadlineAt 이면 정시 완료
 */
export function calcCompletionRate(pages: Page[]): number {
  const done = pages.filter((p) => p.status === 'DONE' && p.completedAt)
  if (done.length === 0) return 0
  const onTime = done.filter((p) => {
    const completed = new Date(p.completedAt!).getTime()
    const deadline = new Date(p.deadlineAt).getTime()
    return completed <= deadline
  })
  return Math.round((onTime.length / done.length) * 100)
}

/**
 * 섹션별 통계 계산
 */
export function calcSectionStats(
  pages: Page[],
  sections: Section[],
): SectionStat[] {
  const sectionMap = new Map(sections.map((s) => [s.id, s]))

  const grouped = new Map<number, Page[]>()
  for (const page of pages) {
    const arr = grouped.get(page.sectionId) ?? []
    arr.push(page)
    grouped.set(page.sectionId, arr)
  }

  return Array.from(grouped.entries()).map(([sectionId, sectionPages]) => {
    const sectionName = sectionMap.get(sectionId)?.name ?? `섹션 ${sectionId}`
    const done = sectionPages.filter((p) => p.status === 'DONE' && p.completedAt)
    const late = done.filter((p) => {
      return new Date(p.completedAt!).getTime() > new Date(p.deadlineAt).getTime()
    })

    // 마감 대비 평균 완료 시각 (분)
    const deltas = done.map((p) => {
      return (new Date(p.completedAt!).getTime() - new Date(p.deadlineAt).getTime()) / 60_000
    })
    const avgDelta = deltas.length > 0
      ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length)
      : null

    return {
      sectionId,
      sectionName,
      totalCount: sectionPages.length,
      doneCount: done.length,
      lateCount: late.length,
      avgCompletionMinutes: avgDelta,
    }
  })
}

/**
 * 기간 통계 계산
 */
export function calcPeriodStats(
  pages: Page[],
  sections: Section[],
  startDate: string,
  endDate: string,
): PeriodStats {
  const filtered = pages.filter((p) => p.date >= startDate && p.date <= endDate)
  const done = filtered.filter((p) => p.status === 'DONE' && p.completedAt)
  const late = done.filter((p) =>
    new Date(p.completedAt!).getTime() > new Date(p.deadlineAt).getTime()
  )

  // 고부하일 여부 (화·수요일)
  const endDay = new Date(endDate).getDay()
  const isHeavyDay = endDay === 2 || endDay === 3

  return {
    startDate,
    endDate,
    totalPages: filtered.length,
    donePages: done.length,
    completionRate: calcCompletionRate(filtered),
    latePages: late.length,
    sectionStats: calcSectionStats(filtered, sections),
    isHeavyDay,
  }
}
