/**
 * timeline.test.ts — 타임라인 X축 계산 순수 함수 테스트
 */

import { describe, it, expect } from 'vitest'
import { calcZoomRange, timeToPercent, calcFullRange } from './timeline'

describe('calcZoomRange', () => {
  it('현재 시각 기준 ±60분 범위를 반환한다', () => {
    const now = new Date('2026-01-01T14:00:00')
    const range = calcZoomRange(now)

    const expectedStart = new Date('2026-01-01T13:00:00')
    const expectedEnd = new Date('2026-01-01T15:00:00')

    expect(range.start.getTime()).toBe(expectedStart.getTime())
    expect(range.end.getTime()).toBe(expectedEnd.getTime())
    expect(range.now.getTime()).toBe(now.getTime())
  })
})

describe('timeToPercent', () => {
  it('범위 시작 시각은 leftPercent=0', () => {
    const now = new Date('2026-01-01T14:00:00')
    const range = calcZoomRange(now)
    const pos = timeToPercent(range.start, range)
    expect(pos.leftPercent).toBe(0)
    expect(pos.isVisible).toBe(true)
  })

  it('범위 중간 시각(현재)은 leftPercent≈50', () => {
    const now = new Date('2026-01-01T14:00:00')
    const range = calcZoomRange(now)
    const pos = timeToPercent(now, range)
    expect(pos.leftPercent).toBeCloseTo(50, 1)
    expect(pos.isVisible).toBe(true)
  })

  it('범위 밖 시각은 isVisible=false', () => {
    const now = new Date('2026-01-01T14:00:00')
    const range = calcZoomRange(now)
    const outside = new Date('2026-01-01T10:00:00') // 범위 밖
    const pos = timeToPercent(outside, range)
    expect(pos.isVisible).toBe(false)
  })
})

describe('calcFullRange', () => {
  it('기본 종료 시각은 18:00', () => {
    const now = new Date('2026-01-01T10:00:00')
    const range = calcFullRange(now)

    expect(range.start.getHours()).toBe(9)
    expect(range.end.getHours()).toBe(18)
  })

  it('마지막 마감이 18:00 초과면 그 시각+30분으로 연장', () => {
    const now = new Date('2026-01-01T10:00:00')
    const lateDeadline = new Date('2026-01-01T19:00:00')
    const range = calcFullRange(now, lateDeadline)

    const expectedEnd = new Date('2026-01-01T19:30:00')
    expect(range.end.getTime()).toBe(expectedEnd.getTime())
  })

  it('마지막 마감이 18:00 이하면 기본 종료 유지', () => {
    const now = new Date('2026-01-01T10:00:00')
    const earlyDeadline = new Date('2026-01-01T16:00:00')
    const range = calcFullRange(now, earlyDeadline)

    expect(range.end.getHours()).toBe(18)
  })
})
