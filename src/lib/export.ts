/**
 * export.ts — CSV/Excel 내보내기 단일 관리
 *
 * 아키텍처 절대 규칙 7:
 *   모든 내보내기 로직은 이 파일을 통해서만 실행
 *   EXPORT_COLUMNS가 컬럼 구조의 단일 진실 공급원
 */

// ─── 컬럼 정의 ───────────────────────────────────────────────

export interface ExportColumn {
  key: string
  label: string
  enabled: boolean
}

/** 내보내기 컬럼 목록 — 순서/활성화 여부 이 파일에서만 관리 */
export const EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'date',             label: '날짜',        enabled: true },
  { key: 'sectionName',      label: '섹션명',       enabled: true },
  { key: 'pageNumber',       label: '면번호',       enabled: true },
  { key: 'pageType',         label: '종류',        enabled: true },
  { key: 'startedAt',        label: '시작시각',     enabled: true },
  { key: 'completedAt',      label: '완료시각',     enabled: true },
  { key: 'printCount',       label: '인쇄횟수',     enabled: true },
  { key: 'interruptCount',   label: '인터럽션횟수', enabled: true },
  { key: 'interruptReasons', label: '인터럽션사유', enabled: true },
  { key: 'intensityScore',   label: '강도점수',     enabled: true },
  { key: 'intensityNote',    label: '메모',        enabled: true },
]

// ─── 타입 ────────────────────────────────────────────────────

export interface ExportRow {
  date: string
  sectionName: string
  pageNumber: string
  pageType: string
  startedAt: string
  completedAt: string
  printCount: number
  interruptCount: number
  interruptReasons: string
  intensityScore: number | null
  intensityNote: string | null
}

// ─── 유틸 함수 ───────────────────────────────────────────────

/** Date → "HH:MM" 형식 문자열 */
export function formatTime(date: Date | null): string {
  if (!date) return ''
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** 활성화된 컬럼만 필터 */
export function getEnabledColumns(): ExportColumn[] {
  return EXPORT_COLUMNS.filter(col => col.enabled)
}

/**
 * ExportRow[] → CSV 문자열 변환
 * 헤더는 EXPORT_COLUMNS의 label 사용
 */
export function rowsToCsv(rows: ExportRow[]): string {
  const enabledCols = getEnabledColumns()
  const header = enabledCols.map(col => col.label).join(',')

  const lines = rows.map(row => {
    return enabledCols
      .map(col => {
        const val = row[col.key as keyof ExportRow]
        const str = val === null || val === undefined ? '' : String(val)
        // 쉼표/개행 포함 시 따옴표로 감싸기
        return str.includes(',') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str
      })
      .join(',')
  })

  return [header, ...lines].join('\n')
}

/**
 * CSV 문자열 → 파일 다운로드
 * 브라우저 환경에서만 동작 (URL.createObjectURL)
 */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
