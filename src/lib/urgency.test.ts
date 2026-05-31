/**
 * urgency.test.ts — 긴박도 순수 함수 테스트
 */

import { describe, it, expect } from 'vitest'
import { calcUrgency, formatMinutes } from './urgency'

/** 테스트용 시각 생성 헬퍼: 현재 시각에서 N분 후 */
function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000)
}

describe('calcUrgency', () => {
  describe('완료 상태', () => {
    it('done 상태면 level=done, isCritical=false', () => {
      const result = calcUrgency({
        deadlineAt: minutesFromNow(30),
        status: 'done',
      })
      expect(result.level).toBe('done')
      expect(result.isCritical).toBe(false)
      expect(result.label).toBe('완료')
    })
  })

  describe('시간 초과 (오버타임)', () => {
    it('마감 지난 항목은 level=overtime', () => {
      const result = calcUrgency({
        deadlineAt: minutesFromNow(-15),
        status: 'active',
      })
      expect(result.level).toBe('overtime')
      expect(result.minutesLeft).toBeLessThan(0)
      expect(result.label).toMatch(/초과/)
    })

    it('일시정지 + 오버타임 = isCritical=true', () => {
      const result = calcUrgency({
        deadlineAt: minutesFromNow(-5),
        status: 'paused',
      })
      expect(result.level).toBe('overtime')
      expect(result.isCritical).toBe(true)
    })
  })

  describe('CRITICAL INTERRUPT (일시정지 + 임박)', () => {
    it('paused + 30분 이하 = isCritical=true', () => {
      const result = calcUrgency({
        deadlineAt: minutesFromNow(20),
        status: 'paused',
      })
      expect(result.isCritical).toBe(true)
      expect(result.isPaused).toBe(true)
    })

    it('paused + 31분 이상 = isCritical=false', () => {
      const result = calcUrgency({
        deadlineAt: minutesFromNow(45),
        status: 'paused',
      })
      expect(result.isCritical).toBe(false)
    })
  })

  describe('긴박도 레벨', () => {
    it('61분 이상 → safe', () => {
      const result = calcUrgency({
        deadlineAt: minutesFromNow(90),
        status: 'active',
      })
      expect(result.level).toBe('safe')
    })

    it('31~60분 → caution', () => {
      const result = calcUrgency({
        deadlineAt: minutesFromNow(45),
        status: 'active',
      })
      expect(result.level).toBe('caution')
    })

    it('16~30분 → warning', () => {
      const result = calcUrgency({
        deadlineAt: minutesFromNow(20),
        status: 'active',
      })
      expect(result.level).toBe('warning')
    })

    it('15분 이하 → critical', () => {
      const result = calcUrgency({
        deadlineAt: minutesFromNow(10),
        status: 'active',
      })
      expect(result.level).toBe('critical')
    })
  })

  describe('now 주입 (테스트용)', () => {
    it('now를 주입하면 해당 시각 기준으로 계산', () => {
      const deadline = new Date('2026-01-01T14:00:00')
      const now = new Date('2026-01-01T13:30:00') // 30분 전
      const result = calcUrgency({ deadlineAt: deadline, status: 'active', now })
      expect(result.minutesLeft).toBe(30)
      expect(result.level).toBe('warning')
    })
  })
})

describe('formatMinutes', () => {
  it('60분 미만 → "N분"', () => {
    expect(formatMinutes(32)).toBe('32분')
    expect(formatMinutes(5)).toBe('5분')
  })

  it('정확히 60분 → "1시간"', () => {
    expect(formatMinutes(60)).toBe('1시간')
  })

  it('61분 이상 → "N시간 M분"', () => {
    expect(formatMinutes(64)).toBe('1시간 4분')
    expect(formatMinutes(90)).toBe('1시간 30분')
  })

  it('120분 → "2시간"', () => {
    expect(formatMinutes(120)).toBe('2시간')
  })
})
