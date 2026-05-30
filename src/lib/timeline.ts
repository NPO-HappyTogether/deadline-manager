/**
 * timeline.ts — 타임라인 X축 계산 순수 함수
 *
 * UX 명세 §ZoomInTimeline 기반
 * - 현재 시각 ±1시간 범위를 0~100% 퍼센트로 변환
 * - 모든 함수는 순수 함수 (사이드이펙트 없음, 테스트 가능)
 * - 실제 타이머/DOM 의존성 없음
 */

// ─── 타입 정의 ──────────────────────────────────────────────

/** 줌인 타임라인의 시간 범위 (기본 ±60분) */
export interface TimeRange {
  start: Date   // 뷰 시작 시각
  end: Date     // 뷰 종료 시각
  now: Date     // 현재 시각 (빨간 선 위치)
}

/** 타임라인 위치 계산 결과 */
export interface TimelinePosition {
  leftPercent: number    // 0~100 (왼쪽 끝이 0%)
  widthPercent: number   // 0~100 (막대 너비)
  isVisible: boolean     // 현재 뷰 범위 안에 있는지
}

/** 타임 마커 (눈금 표시) */
export interface TimeMarker {
  time: Date
  leftPercent: number
  label: string   // "14:00", "15:30" 등
}

// ─── 상수 ───────────────────────────────────────────────────

/** 줌인 범위 (분) */
const ZOOM_RANGE_MINUTES = 60

/** 전체 타임라인 시작 시각 (09:00) */
export const FULL_TIMELINE_START_HOUR = 9

/** 전체 타임라인 종료 시각 (기본 18:00, 오버타임 시 자동 연장) */
export const OVERTIME_START_HOUR = 18

/** 눈금 간격 (분) */
const TICK_INTERVAL_MINUTES = 15

// ─── 핵심 함수 ──────────────────────────────────────────────

/**
 * 줌인 타임라인 범위 생성
 * 현재 시각 기준 -60분 ~ +60분
 * 단, 09:00 이전 과거는 09:00으로 클램프
 */
export function calcZoomRange(now: Date): TimeRange {
  const start = new Date(now.getTime() - ZOOM_RANGE_MINUTES * 60_000)
  const end = new Date(now.getTime() + ZOOM_RANGE_MINUTES * 60_000)

  // 09:00 이전으로 가지 않음
  const dayStart = new Date(now)
  dayStart.setHours(FULL_TIMELINE_START_HOUR, 0, 0, 0)
  const clampedStart = start < dayStart ? dayStart : start

  return { start: clampedStart, end, now }
}

/**
 * 특정 시각을 타임라인 퍼센트 위치로 변환
 * 범위 밖이면 isVisible: false
 */
export function timeToPercent(time: Date, range: TimeRange): TimelinePosition {
  const totalMs = range.end.getTime() - range.start.getTime()
  const offsetMs = time.getTime() - range.start.getTime()
  const leftPercent = (offsetMs / totalMs) * 100

  return {
    leftPercent: Math.max(0, Math.min(100, leftPercent)),
    widthPercent: 0,
    isVisible: leftPercent >= 0 && leftPercent <= 100,
  }
}

/**
 * 막대 (start ~ end) 를 타임라인 위치로 변환
 * 뷰 범위를 벗어난 부분은 클램프 처리
 */
export function barToPosition(
  barStart: Date,
  barEnd: Date,
  range: TimeRange
): TimelinePosition {
  const totalMs = range.end.getTime() - range.start.getTime()

  const clampedStart = barStart < range.start ? range.start : barStart
  const clampedEnd = barEnd > range.end ? range.end : barEnd

  // 뷰 밖에 완전히 있는 경우
  if (barEnd <= range.start || barStart >= range.end) {
    return { leftPercent: 0, widthPercent: 0, isVisible: false }
  }

  const leftPercent = ((clampedStart.getTime() - range.start.getTime()) / totalMs) * 100
  const widthPercent = ((clampedEnd.getTime() - clampedStart.getTime()) / totalMs) * 100

  return {
    leftPercent: Math.max(0, leftPercent),
    widthPercent: Math.max(0, widthPercent),
    isVisible: true,
  }
}

/**
 * 전체 타임라인 (09:00 ~ 종료) 범위 생성
 * 마지막 마감 시각이 18:00을 초과하면 오버타임 구간 자동 연장
 */
export function calcFullRange(
  now: Date,
  latestDeadline?: Date
): TimeRange {
  const start = new Date(now)
  start.setHours(FULL_TIMELINE_START_HOUR, 0, 0, 0)

  const defaultEnd = new Date(now)
  defaultEnd.setHours(OVERTIME_START_HOUR, 0, 0, 0)

  // 마지막 마감이 18:00을 넘으면 그 시각 + 30분으로 연장
  let end = defaultEnd
  if (latestDeadline && latestDeadline > defaultEnd) {
    end = new Date(latestDeadline.getTime() + 30 * 60_000)
  }

  return { start, end, now }
}

/**
 * 타임라인 눈금 생성 (15분 간격)
 */
export function calcTimeMarkers(range: TimeRange): TimeMarker[] {
  const markers: TimeMarker[] = []
  const totalMs = range.end.getTime() - range.start.getTime()
  const tickMs = TICK_INTERVAL_MINUTES * 60_000

  // 시작 시각을 가장 가까운 15분 경계로 올림
  const firstTick = new Date(
    Math.ceil(range.start.getTime() / tickMs) * tickMs
  )

  for (
    let t = firstTick;
    t <= range.end;
    t = new Date(t.getTime() + tickMs)
  ) {
    const leftPercent = ((t.getTime() - range.start.getTime()) / totalMs) * 100
    markers.push({
      time: new Date(t),
      leftPercent,
      label: formatTime(t),
    })
  }

  return markers
}

/**
 * 현재 시각 빨간 선 위치 (50%가 기본값 — ZoomIn에서는 항상 중앙)
 */
export function nowLinePercent(range: TimeRange): number {
  const totalMs = range.end.getTime() - range.start.getTime()
  const offsetMs = range.now.getTime() - range.start.getTime()
  return Math.max(0, Math.min(100, (offsetMs / totalMs) * 100))
}

/**
 * 18:00 이후 오버타임 구간 위치 계산
 */
export function overtimeZonePosition(range: TimeRange): { leftPercent: number } | null {
  const overtimeStart = new Date(range.now)
  overtimeStart.setHours(OVERTIME_START_HOUR, 0, 0, 0)

  if (overtimeStart >= range.end) return null
  if (overtimeStart <= range.start) return { leftPercent: 0 }

  const totalMs = range.end.getTime() - range.start.getTime()
  const leftPercent = ((overtimeStart.getTime() - range.start.getTime()) / totalMs) * 100
  return { leftPercent }
}

// ─── 유틸리티 ───────────────────────────────────────────────

/**
 * Date → "HH:MM" 형식
 */
export function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

/**
 * "HH:MM" 문자열 → 오늘 날짜의 Date 객체
 */
export function parseTimeString(timeStr: string, baseDate?: Date): Date {
  const [h, m] = timeStr.split(':').map(Number)
  const result = baseDate ? new Date(baseDate) : new Date()
  result.setHours(h, m, 0, 0)
  return result
}

/**
 * 두 Date가 같은 날인지 확인
 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * 오늘 날짜의 특정 시각 Date 생성
 * calcDeadlineDate(14, 0) → 오늘 14:00:00
 */
export function calcDeadlineDate(hour: number, minute = 0, baseDate?: Date): Date {
  const d = baseDate ? new Date(baseDate) : new Date()
  d.setHours(hour, minute, 0, 0)
  return d
}
