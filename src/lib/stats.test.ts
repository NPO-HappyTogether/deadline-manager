/**
 * stats.test.ts — 통계 순수 함수 테스트 (Story 6.3)
 */

import { describe, it, expect } from 'vitest'
import { calcCompletionRate, calcSectionStats, calcPeriodStats } from './stats'
import type { Page, Section } from './db'

/** 테스트용 Page 생성 헬퍼 */
function makePage(overrides: Partial<Page> & { id: number }): Page {
  const deadline = new Date('2026-01-01T14:00:00')
  return {
    sectionId: 1,
    date: '2026-01-01',
    pageNumber: '4면',
    pageType: 'editorial',
    deadlineAt: deadline,
    status: 'DONE',
    printCount: 1,
    intensityScore: null,
    intensityNote: null,
    autoCompleteContext: null,
    startedAt: new Date('2026-01-01T09:00:00'),
    completedAt: new Date('2026-01-01T13:55:00'),
    printConfirmStep: 0,
    printConfirmAt: null,
    createdAt: new Date('2026-01-01T09:00:00'),
    updatedAt: new Date('2026-01-01T13:55:00'),
    ...overrides,
  } as Page
}

const mockSection: Section = {
  id: 1,
  name: '본국지면',
  displayOrder: 1,
  deadlineHour: 14,
  deadlineMinute: 0,
  isActive: true,
  createdAt: new Date(),
}

describe('calcCompletionRate', () => {
  it('빈 배열이면 0 반환', () => {
    expect(calcCompletionRate([])).toBe(0)
  })

  it('모두 정시 완료면 100', () => {
    const pages = [
      makePage({ id: 1, completedAt: new Date('2026-01-01T13:50:00') }),
      makePage({ id: 2, completedAt: new Date('2026-01-01T13:59:00') }),
    ]
    expect(calcCompletionRate(pages)).toBe(100)
  })

  it('절반이 지연이면 50', () => {
    const pages = [
      makePage({ id: 1, completedAt: new Date('2026-01-01T13:59:00') }), // 정시
      makePage({ id: 2, completedAt: new Date('2026-01-01T14:10:00') }), // 지연
    ]
    expect(calcCompletionRate(pages)).toBe(50)
  })

  it('완료되지 않은 페이지는 계산에서 제외', () => {
    const pages = [
      makePage({ id: 1, status: 'WAITING', completedAt: null }),
      makePage({ id: 2, completedAt: new Date('2026-01-01T13:50:00') }),
    ]
    expect(calcCompletionRate(pages)).toBe(100)
  })
})

describe('calcSectionStats', () => {
  it('섹션별 완료/지연 카운트를 반환한다', () => {
    const pages = [
      makePage({ id: 1, completedAt: new Date('2026-01-01T13:50:00') }), // 정시
      makePage({ id: 2, completedAt: new Date('2026-01-01T14:10:00') }), // 지연
    ]
    const stats = calcSectionStats(pages, [mockSection])
    expect(stats).toHaveLength(1)
    expect(stats[0].sectionName).toBe('본국지면')
    expect(stats[0].doneCount).toBe(2)
    expect(stats[0].lateCount).toBe(1)
  })
})

describe('calcPeriodStats', () => {
  it('날짜 범위 필터링이 작동한다', () => {
    const pages = [
      makePage({ id: 1, date: '2026-01-01', completedAt: new Date('2026-01-01T13:50:00') }),
      makePage({ id: 2, date: '2026-01-05', completedAt: new Date('2026-01-05T14:10:00') }),
    ]
    const stats = calcPeriodStats(pages, [mockSection], '2026-01-01', '2026-01-03')
    expect(stats.totalPages).toBe(1)
    expect(stats.completionRate).toBe(100)
  })

  it('수요일은 isHeavyDay=true', () => {
    // 2026-01-07은 수요일
    const stats = calcPeriodStats([], [], '2026-01-01', '2026-01-07')
    expect(stats.isHeavyDay).toBe(true)
  })
})
