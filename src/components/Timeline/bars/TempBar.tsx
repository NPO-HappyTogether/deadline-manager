/**
 * TempBar.tsx — 임시업무 타임라인 막대
 *
 * UX 명세 §Component Strategy §4 "임시업무 — 점선 테두리 + ★ 뱃지"
 *
 * 특성:
 *   - pageType === 'temp'
 *   - 점선 테두리 (기존 섹션 내 비정규 업무임을 표시)
 *   - ★ 뱃지 (우측 상단)
 *   - 배경색: EditorialBar와 동일하게 urgency 색 (점선이 구분자)
 *   - 완료 시: 회색 + 점선 유지
 */

import { cn } from '@/lib/utils'
import { calcUrgency, urgencyToColor, dbStatusToUI } from '@/lib/urgency'
import { barToPosition } from '@/lib/timeline'
import type { Page } from '@/lib/db'
import type { TimeRange } from '@/lib/timeline'

// ─── Props ──────────────────────────────────────────────────

export interface TempBarProps {
  page: Page
  range: TimeRange
  now: Date
  isDark: boolean
  rowHeight: number
  topOffset: number
  onClick?: (page: Page) => void
}

// ─── 컴포넌트 ────────────────────────────────────────────────

export function TempBar({
  page,
  range,
  now,
  isDark,
  rowHeight,
  topOffset,
  onClick,
}: TempBarProps) {
  const barStart = page.startedAt
    ? new Date(page.startedAt)
    : new Date(new Date(page.deadlineAt).getTime() - 60 * 60_000)
  const barEnd = new Date(page.deadlineAt)

  const pos = barToPosition(barStart, barEnd, range)
  if (!pos.isVisible || pos.widthPercent < 0.1) return null

  const uiStatus = dbStatusToUI(page.status)
  const urgency = calcUrgency({ deadlineAt: barEnd, status: uiStatus, now })

  const barColor =
    uiStatus === 'done'
      ? isDark ? '#4b5563' : '#9ca3af'
      : urgencyToColor(urgency.level, isDark)

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${page.pageNumber} 임시업무 — ${urgency.label}`}
      title={`임시: ${page.pageNumber} — ${urgency.label}`}
      style={{
        position: 'absolute',
        left: `${pos.leftPercent}%`,
        width: `${pos.widthPercent}%`,
        top: topOffset,
        height: rowHeight,
        backgroundColor: barColor,
        borderRadius: 4,
        minWidth: 4,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background-color 0.4s ease',
        // 점선 테두리 — "임시업무"임을 식별하는 핵심 시각 신호
        outline: '1.5px dashed rgba(255,255,255,0.6)',
        outlineOffset: '-1px',
      }}
      className={cn(
        'flex items-center overflow-hidden px-1.5 gap-1',
        uiStatus === 'paused' && 'opacity-75',
        onClick && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:z-10',
      )}
      onClick={() => onClick?.(page)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(page) }}
    >
      {/* ★ 임시업무 심벌 */}
      <span className="text-white/90 text-[10px] leading-none shrink-0">★</span>

      {/* 면 번호 */}
      <span
        className="text-white text-[11px] font-bold leading-none truncate flex-1"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
      >
        {page.pageNumber}
      </span>

      {/* 강도 뱃지 */}
      {uiStatus === 'done' && page.intensityScore !== null && (
        <span className="shrink-0 text-[9px] font-bold leading-none px-1 py-0.5 rounded bg-white/25 text-white">
          {page.intensityScore === 4 ? '⚠' : page.intensityScore}
        </span>
      )}
    </div>
  )
}
