/**
 * export.test.ts — CSV 내보내기 순수 함수 테스트
 */

import { describe, it, expect } from 'vitest'
import {
  EXPORT_COLUMNS,
  getEnabledColumns,
  rowsToCsv,
  formatTime,
  type ExportRow,
} from './export'

describe('EXPORT_COLUMNS', () => {
  it('11개 컬럼이 정의되어 있다', () => {
    expect(EXPORT_COLUMNS).toHaveLength(11)
  })

  it('필수 컬럼 key가 모두 존재한다', () => {
    const keys = EXPORT_COLUMNS.map(c => c.key)
    expect(keys).toContain('date')
    expect(keys).toContain('sectionName')
    expect(keys).toContain('completedAt')
    expect(keys).toContain('intensityScore')
  })

  it('기본적으로 모든 컬럼이 enabled=true', () => {
    expect(EXPORT_COLUMNS.every(c => c.enabled)).toBe(true)
  })
})

describe('getEnabledColumns', () => {
  it('enabled=true 컬럼만 반환한다', () => {
    const enabled = getEnabledColumns()
    expect(enabled.every(c => c.enabled)).toBe(true)
  })
})

describe('rowsToCsv', () => {
  const sampleRow: ExportRow = {
    date: '2026-01-01',
    sectionName: '본국지면',
    pageNumber: '4면',
    pageType: 'editorial',
    startedAt: '09:00',
    completedAt: '13:45',
    printCount: 2,
    interruptCount: 1,
    interruptReasons: '전화',
    intensityScore: 3,
    intensityNote: null,
  }

  it('헤더 첫 번째 줄이 컬럼 label이다', () => {
    const csv = rowsToCsv([sampleRow])
    const firstLine = csv.split('\n')[0]
    expect(firstLine).toBe('날짜,섹션명,면번호,종류,시작시각,완료시각,인쇄횟수,인터럽션횟수,인터럽션사유,강도점수,메모')
  })

  it('빈 배열이면 헤더만 반환한다', () => {
    const csv = rowsToCsv([])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(1)
  })

  it('null 값은 빈 문자열로 출력된다', () => {
    const csv = rowsToCsv([sampleRow])
    const dataLine = csv.split('\n')[1]
    // intensityNote가 null이므로 마지막 컬럼이 빈 값
    expect(dataLine.endsWith(',')).toBe(true)
  })

  it('쉼표 포함 값은 따옴표로 감싼다', () => {
    const rowWithComma: ExportRow = {
      ...sampleRow,
      interruptReasons: '전화,회의',
    }
    const csv = rowsToCsv([rowWithComma])
    expect(csv).toContain('"전화,회의"')
  })
})

describe('formatTime', () => {
  it('null이면 빈 문자열 반환', () => {
    expect(formatTime(null)).toBe('')
  })

  it('Date를 HH:MM 형식으로 반환', () => {
    const date = new Date('2026-01-01T14:30:00')
    const result = formatTime(date)
    expect(result).toMatch(/14:30/)
  })
})
