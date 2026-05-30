/**
 * EditorialBar.tsx — 편집 / 광고 조판 타임라인 막대
 *
 * 타입: 'editorial' | 'ad'
 * 색상: 진행 중 → urgency 색 (파랑→빨강), 완료 → 회색
 * 막대 범위: startedAt ~ deadlineAt (startedAt 없으면 deadlineAt - 60분)
 * 완료 후: 우측에 강도 뱃지 표시 (강도 4 = ⚠)
 */

import { cn } from '@/lib/utils'
import { calcUrgency, urgencyToColor, dbStatusToUI } from '@/lib/urgency'
import { barToPosition } from '@/lib/timeline'
import type { Page } from '@/lib/db'
import type { TimeRange } from '@/lib/timeline'

// ─── Props ──────────────────────────────────────────────────

export interface EditorialBarProps {
  page: Page
  range: TimeRange
  now: Date
  isDark: boolean
  /** 막대 높이 (px) */
  rowHeight: number
  /** 막대 상단 오프셋 (px) — 같은 행 내 복수 막대 배치용 */
  topOffset: number
  onClick?: (page: Page) => void
}

// ─── 컴포넌트 ────────────────────────────────────────────────

export function EditorialBar({
  page,
  range,
  now,
  isDark,
  rowHeight,
  topOffset,
  onClick,
}: EditorialBarProps) {
  // 막대 시작 시각: startedAt 있으면 그 시각, 없으면 마감 - 60분
  const barStart = page.startedAt
    ? new Date(page.startedAt)
    : new Date(new Date(page.deadlineAt).getTime() - 60 * 60_000)
  const barEnd = new Date(page.deadlineAt)

  const pos = barToPosition(barStart, barEnd, range)
  if (!pos.isVisible || pos.widthPercent < 0.1) return null

  const uiStatus = dbStatusToUI(page.status)
  const urgency = calcUrgency({ deadlineAt: barEnd, status: uiStatus, now })

  // 색상: 완료 = 회색, 진행/대기/일시정지 = urgency 색
  const barColor =
    uiStatus === 'done'
      ? isDark ? '#4b5563' : '#9ca3af'
      : urgencyToColor(urgency.level, isDark)

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${page.pageNumber} — ${urgency.label}`}
      title={`${page.pageNumber}: ${urgency.label}`}
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
        // 막대 완료 색 전환: 0.4초 (UX 명세 §상태 전환 패턴)
        transition: 'background-color 0.4s ease',
      }}
      className={cn(
        'flex items-center overflow-hidden px-1.5',
        uiStatus === 'paused' && 'opacity-75',
        onClick && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:z-10',
      )}
      onClick={() => onClick?.(page)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.(page)
      }}
    >
      {/* 면 번호 레이블 — 11px Bold (UX 명세 §Typography "막대 글자: 11px Bold") */}
      <span
        className="text-white text-[11px] font-bold leading-none truncate flex-1"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
      >
        {page.pageNumber}
      </span>

      {/* 강도 뱃지 — 완료 후 표시 (강도 4 = ⚠ 아이콘) */}
      {uiStatus === 'done' && page.intensityScore !== null && (
        <span
          className={cn(
            'shrink-0 ml-1',
            'text-[9px] font-bold leading-none',
            'px-1 py-0.5 rounded',
            page.intensityScore === 4
              ? 'bg-orange-400/40 text-white'
              : 'bg-white/25 text-white',
          )}
        >
          {page.intensityScore === 4 ? '⚠' : page.intensityScore}
        </span>
      )}
    </div>
  )
}
