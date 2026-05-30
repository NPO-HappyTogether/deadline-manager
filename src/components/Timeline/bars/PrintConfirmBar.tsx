/**
 * PrintConfirmBar.tsx — 인쇄소 확인 타임라인 막대
 *
 * UX 명세 §Component Strategy §4 "인쇄소 확인 — 보라 (편집·광고 공통 마지막 단계)"
 *
 * 특성:
 *   - 색상: --color-bar-print (#8b5cf6) 고정 (urgency에 따라 변하지 않음)
 *   - 트리거: page.status === 'HANDED_OFF' (인쇄소 전송 완료 후)
 *   - 막대 범위: HANDED_OFF 전환 시각(updatedAt) ~ deadlineAt
 *   - 완료 시: 보라 계열 유지 (회색으로 변하지 않음 — 인쇄확인은 별도 단계)
 *   - 강도 뱃지 표시 (DONE 상태 시)
 */

import { cn } from '@/lib/utils'
import { barToPosition, formatTime } from '@/lib/timeline'
import type { Page } from '@/lib/db'
import type { TimeRange } from '@/lib/timeline'

// ─── Props ──────────────────────────────────────────────────

export interface PrintConfirmBarProps {
  page: Page
  range: TimeRange
  now: Date
  rowHeight: number
  topOffset: number
  onClick?: (page: Page) => void
}

// ─── 색상 ────────────────────────────────────────────────────

const PRINT_COLOR = 'var(--color-bar-print)'          // #8b5cf6
const PRINT_DONE_COLOR = 'rgba(139, 92, 246, 0.55)'  // 완료 후 채도 낮춤

// ─── 컴포넌트 ────────────────────────────────────────────────

export function PrintConfirmBar({
  page,
  range,
  now,
  rowHeight,
  topOffset,
  onClick,
}: PrintConfirmBarProps) {
  // HANDED_OFF 전환 시각을 barStart로 사용 (updatedAt이 전환 시각)
  const barStart = new Date(page.updatedAt)
  const barEnd = new Date(page.deadlineAt)

  const pos = barToPosition(barStart, barEnd, range)
  if (!pos.isVisible || pos.widthPercent < 0.1) return null

  const isDone = page.status === 'DONE'
  const isHandedOff = page.status === 'HANDED_OFF'

  // 경과 시간 — HANDED_OFF 이후 얼마나 지났는지
  const elapsedMins = isHandedOff
    ? Math.round((now.getTime() - barStart.getTime()) / 60_000)
    : null

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${page.pageNumber} 인쇄소 확인 — ${formatTime(barEnd)} 마감`}
      title={`인쇄소 확인: ${page.pageNumber}${elapsedMins !== null ? ` (${elapsedMins}분 경과)` : ''}`}
      style={{
        position: 'absolute',
        left: `${pos.leftPercent}%`,
        width: `${pos.widthPercent}%`,
        top: topOffset,
        height: rowHeight,
        backgroundColor: isDone ? PRINT_DONE_COLOR : PRINT_COLOR,
        borderRadius: 4,
        minWidth: 4,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background-color 0.4s ease',
        // 인쇄소 확인 중 — 살짝 점선 테두리로 "외부 대기" 표현
        ...(isHandedOff && {
          outline: '1.5px dashed rgba(139, 92, 246, 0.6)',
          outlineOffset: '1px',
        }),
      }}
      className={cn(
        'flex items-center overflow-hidden px-1.5',
        onClick && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:z-10',
      )}
      onClick={() => onClick?.(page)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(page) }}
    >
      {/* 인쇄소 레이블 */}
      <span
        className="text-white text-[11px] font-bold leading-none truncate flex-1"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
      >
        {page.pageNumber}
      </span>

      {/* 강도 뱃지 (완료 후) */}
      {isDone && page.intensityScore !== null && (
        <span
          className={cn(
            'shrink-0 ml-1 text-[9px] font-bold leading-none',
            'px-1 py-0.5 rounded bg-white/25 text-white',
            page.intensityScore === 4 && 'bg-orange-400/40',
          )}
        >
          {page.intensityScore === 4 ? '⚠' : page.intensityScore}
        </span>
      )}
    </div>
  )
}
