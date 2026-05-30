/**
 * InterruptionBar.tsx — 중단(인터럽션) 구간 타임라인 막대
 *
 * 색상: 주황 (#f97316) 점선 패턴 (UX 명세 §타임라인 막대 색상)
 * 기간: interruption.startedAt ~ endedAt (진행 중이면 now)
 */

import { barToPosition, formatTime } from '@/lib/timeline'
import type { Interruption } from '@/lib/db'
import type { TimeRange } from '@/lib/timeline'

// ─── Props ──────────────────────────────────────────────────

export interface InterruptionBarProps {
  interruption: Interruption
  range: TimeRange
  now: Date
  rowHeight: number
  topOffset: number
}

// ─── 컴포넌트 ────────────────────────────────────────────────

export function InterruptionBar({
  interruption,
  range,
  now,
  rowHeight,
  topOffset,
}: InterruptionBarProps) {
  const barStart = new Date(interruption.startedAt)
  const barEnd = interruption.endedAt ? new Date(interruption.endedAt) : now

  const pos = barToPosition(barStart, barEnd, range)
  if (!pos.isVisible) return null

  const ongoing = !interruption.endedAt
  const durationMins = Math.round((barEnd.getTime() - barStart.getTime()) / 60_000)

  const startLabel = formatTime(barStart)
  const endLabel = interruption.endedAt ? formatTime(new Date(interruption.endedAt)) : '진행 중'

  return (
    <div
      aria-label={`중단 구간 ${startLabel}~${endLabel} (${durationMins}분)`}
      title={`중단: ${startLabel}~${endLabel} · ${durationMins}분${ongoing ? ' (진행 중)' : ''}`}
      style={{
        position: 'absolute',
        left: `${pos.leftPercent}%`,
        // 최소 너비 0.5% 보장 (아주 짧은 인터럽션도 표시)
        width: `${Math.max(pos.widthPercent, 0.5)}%`,
        top: topOffset,
        height: rowHeight,
        borderRadius: 3,
        opacity: ongoing ? 0.85 : 0.65,
        minWidth: 4,
        overflow: 'hidden',
        // 주황 점선 패턴 (UX 명세: "주황 점선")
        backgroundImage: `repeating-linear-gradient(
          90deg,
          #f97316 0px, #f97316 7px,
          transparent 7px, transparent 12px
        )`,
      }}
    />
  )
}
