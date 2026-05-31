/**
 * urgency.ts — 긴박도 순수 함수 모음
 *
 * UX 명세 §Design System Foundation, §Component Strategy 기반
 * - 모든 함수는 순수 함수 (사이드이펙트 없음, 테스트 가능)
 * - DB/타이머/React 의존성 없음
 */

// ─── 타입 정의 ──────────────────────────────────────────────

/** UI 표시 4단계 (사용자 인지 부담 최소) */
export type UIStatus = 'waiting' | 'active' | 'paused' | 'done'

/** DB 내부 6단계 (분석용) */
export type DBStatus =
  | 'WAITING'
  | 'ACTIVE'
  | 'PAUSED'
  | 'RESUMED'
  | 'HANDED_OFF'
  | 'DONE'

/** 긴박도 레벨 (색상 토큰과 1:1 대응) */
export type UrgencyLevel = 'safe' | 'caution' | 'warning' | 'critical' | 'overtime' | 'done'

/** 긴박도 계산에 필요한 최소 정보 */
export interface UrgencyInput {
  deadlineAt: Date       // 마감 시각
  status: UIStatus       // 현재 UI 상태
  now?: Date             // 현재 시각 (테스트용 주입, 기본값 new Date())
}

/** 긴박도 계산 결과 */
export interface UrgencyResult {
  level: UrgencyLevel
  minutesLeft: number    // 음수 = 초과
  isPaused: boolean
  isCritical: boolean    // 일시정지 + 마감 임박 = 최고 위험
  label: string          // 표시용 텍스트 ("32분" / "1시간 4분" / "15분 초과")
}

import {
  URGENCY_CAUTION_MINUTES,
  URGENCY_WARNING_MINUTES,
  URGENCY_CRITICAL_PAUSED_MINUTES,
} from '@/lib/constants'

// ─── 상수 ───────────────────────────────────────────────────

/** 긴박도 전환 임계값 (분) */
const THRESHOLDS = {
  CAUTION:  URGENCY_CAUTION_MINUTES,
  WARNING:  URGENCY_WARNING_MINUTES,
  CRITICAL: 15,   // 15분 이하 → 위험 (constants에서 별도 관리 불필요)
} as const

/** 일시정지 + 마감 임박 판정 기준 (분) */
const CRITICAL_PAUSED_THRESHOLD = URGENCY_CRITICAL_PAUSED_MINUTES

// ─── 핵심 함수 ──────────────────────────────────────────────

/**
 * 긴박도 레벨 계산
 * 위험도 우선순위: CRITICAL INTERRUPT > 일시정지 > 진행중 > 대기중
 */
export function calcUrgency(input: UrgencyInput): UrgencyResult {
  const now = input.now ?? new Date()
  const minutesLeft = Math.round(
    (input.deadlineAt.getTime() - now.getTime()) / 60_000
  )
  const isPaused = input.status === 'paused'
  const isDone = input.status === 'done'

  // 완료된 섹션
  if (isDone) {
    return {
      level: 'done',
      minutesLeft,
      isPaused: false,
      isCritical: false,
      label: '완료',
    }
  }

  // 대기중은 마감까지의 시간으로 색상 계산 (진행 전 미리 경고)
  if (input.status === 'waiting' && minutesLeft > THRESHOLDS.CAUTION) {
    return {
      level: 'safe',
      minutesLeft,
      isPaused: false,
      isCritical: false,
      label: formatMinutes(minutesLeft),
    }
  }

  // 시간 초과 (오버타임)
  if (minutesLeft < 0) {
    return {
      level: 'overtime',
      minutesLeft,
      isPaused,
      isCritical: isPaused, // 일시정지 + 초과 = 무조건 critical
      label: `${Math.abs(minutesLeft)}분 초과`,
    }
  }

  // 일시정지 + 마감 임박 = CRITICAL INTERRUPT (최고 위험)
  const isCritical = isPaused && minutesLeft <= CRITICAL_PAUSED_THRESHOLD

  // 긴박도 레벨 결정
  let level: UrgencyLevel
  if (minutesLeft <= THRESHOLDS.CRITICAL) {
    level = 'critical'
  } else if (minutesLeft <= THRESHOLDS.WARNING) {
    level = 'warning'
  } else if (minutesLeft <= THRESHOLDS.CAUTION) {
    level = 'caution'
  } else {
    level = 'safe'
  }

  return {
    level,
    minutesLeft,
    isPaused,
    isCritical,
    label: formatMinutes(minutesLeft),
  }
}

/**
 * 분 → 표시 텍스트 변환
 * 60분 미만: "32분"
 * 60분 이상: "1시간 4분" (정각이면 "1시간")
 */
export function formatMinutes(minutes: number): string {
  if (minutes < 0) return `${Math.abs(minutes)}분 초과`
  if (minutes === 0) return '마감'
  if (minutes < 60) return `${minutes}분`

  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`
}

/**
 * 긴박도 레벨 → CSS 클래스 (Tailwind v4 CSS 변수 기반)
 * 라이트/다크 모드 자동 처리는 index.css에서 담당
 */
export function urgencyToColorClass(level: UrgencyLevel, isDark = false): string {
  const suffix = isDark ? '-dark' : ''
  const map: Record<UrgencyLevel, string> = {
    safe:     `bg-[var(--color-urgency-safe${suffix})]`,
    caution:  `bg-[var(--color-urgency-caution${suffix})]`,
    warning:  `bg-[var(--color-urgency-warning${suffix})]`,
    critical: `bg-[var(--color-urgency-critical${suffix})]`,
    overtime: `bg-[var(--color-urgency-overtime${suffix})]`,
    done:     'bg-gray-300 dark:bg-gray-600',
  }
  return map[level]
}

/**
 * 긴박도 레벨 → hex 색상값 (타임라인 인라인 스타일용)
 */
export function urgencyToColor(level: UrgencyLevel, isDark = false): string {
  if (isDark) {
    const dark: Record<UrgencyLevel, string> = {
      safe:     '#4ade80',
      caution:  '#fbbf24',
      warning:  '#fb923c',
      critical: '#f87171',
      overtime: '#6b7280',
      done:     '#4b5563',
    }
    return dark[level]
  }
  const light: Record<UrgencyLevel, string> = {
    safe:     '#16a34a',
    caution:  '#d97706',
    warning:  '#ea580c',
    critical: '#dc2626',
    overtime: '#374151',
    done:     '#9ca3af',
  }
  return light[level]
}

/**
 * DB 상태 → UI 상태 변환
 */
export function dbStatusToUI(dbStatus: DBStatus): UIStatus {
  switch (dbStatus) {
    case 'WAITING':    return 'waiting'
    case 'ACTIVE':     return 'active'
    case 'RESUMED':    return 'active'    // RESUMED는 UI상 active
    case 'PAUSED':     return 'paused'
    case 'HANDED_OFF': return 'paused'    // HANDED_OFF는 UI상 paused
    case 'DONE':       return 'done'
  }
}

/**
 * 섹션 내 여러 면(page) 중 가장 위험한 긴박도를 반환
 * 위험도 순: overtime > critical > warning > caution > safe > done
 */
export function maxUrgency(results: UrgencyResult[]): UrgencyResult | null {
  if (results.length === 0) return null

  const priority: Record<UrgencyLevel, number> = {
    overtime: 6,
    critical: 5,
    warning:  4,
    caution:  3,
    safe:     2,
    done:     1,
  }

  return results.reduce((max, curr) => {
    // isCritical (CRITICAL INTERRUPT) 최우선
    if (curr.isCritical && !max.isCritical) return curr
    if (max.isCritical && !curr.isCritical) return max
    return priority[curr.level] >= priority[max.level] ? curr : max
  })
}

/**
 * CRITICAL 세그먼트 판별 (pulse 애니메이션 트리거 여부)
 * UX 명세: "일시정지 + 마감 임박 = 최고 위험 등급 (CRITICAL INTERRUPT)"
 */
export function shouldPulse(result: UrgencyResult): boolean {
  return result.isCritical || result.level === 'critical'
}
