/**
 * SectionSegment.tsx — 섹션별 색상 세그먼트
 *
 * UX 명세 §StatusBar 3단계 인터랙션, §Visual Design Foundation 기반
 *
 * 3단계 인터랙션:
 *   Level 1: 9px 색 라인   — ambient awareness (평상시)
 *   Level 2: 44px 확장     — 호버 시 섹션명 + 카운트다운
 *   Level 3: ZoomInTimeline — 클릭 시 ±1시간 줌인 (부모에서 처리)
 *
 * 원칙:
 *   - 순수 presentational (데이터는 StatusBar에서 props로 받음)
 *   - CRITICAL pulse만 애니메이션, 나머지 transition
 *   - 일시정지 = 점선 outline + 경과 시간 표시
 *   - 접근성: button role, aria-label, focus-visible, 44×44px 터치 영역
 */

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  calcUrgency,
  maxUrgency,
  urgencyToColor,
  shouldPulse,
  dbStatusToUI,
} from '@/lib/urgency'
import type { Section, Page } from '@/lib/db'

// ─── Props ──────────────────────────────────────────────────

export interface SectionSegmentProps {
  /** 섹션 메타 (이름, 기본 마감 시각, displayOrder) */
  section: Section
  /** 오늘 이 섹션의 페이지 목록 (없을 수도 있음) */
  pages: Page[]
  /** 표시용 현재 시각 — StatusBar가 1분 단위로 갱신해서 전달 */
  now: Date
  /** 다크 모드 여부 — StatusBar에서 한 번 계산해서 전달 */
  isDark: boolean
  /** Level 3 (ZoomInTimeline) 활성 여부 */
  isZoomed: boolean
  /** Level 3 진입/해제 콜백 */
  onZoomIn: (sectionId: number) => void
}

// ─── 컴포넌트 ────────────────────────────────────────────────

export function SectionSegment({
  section,
  pages,
  now,
  isDark,
  isZoomed,
  onZoomIn,
}: SectionSegmentProps) {
  const [hovered, setHovered] = useState(false)

  // ── 긴박도 계산 (메모이제이션) ─────────────────────────────
  const { urgencyResult, activePages } = useMemo(() => {
    const active = pages.filter((p) => dbStatusToUI(p.status) !== 'done')
    const allDone =
      pages.length > 0 && pages.every((p) => dbStatusToUI(p.status) === 'done')

    // 케이스 1: 모든 페이지 완료 → done
    if (allDone) {
      const d = sectionDefaultDeadline(section, now)
      return {
        urgencyResult: calcUrgency({ deadlineAt: d, status: 'done', now }),
        activePages: active,
      }
    }

    // 케이스 2: 활성 페이지 있음 → max urgency
    if (active.length > 0) {
      const results = active.map((p) =>
        calcUrgency({ deadlineAt: p.deadlineAt, status: dbStatusToUI(p.status), now }),
      )
      return {
        urgencyResult: maxUrgency(results)!,
        activePages: active,
      }
    }

    // 케이스 3: 페이지 없음 → 섹션 기본 마감 시각으로 대기 상태
    const d = sectionDefaultDeadline(section, now)
    return {
      urgencyResult: calcUrgency({ deadlineAt: d, status: 'waiting', now }),
      activePages: active,
    }
  }, [pages, section, now])

  // ── 상태 플래그 ─────────────────────────────────────────────
  const pulse = shouldPulse(urgencyResult)
  const isCritical = urgencyResult.isCritical

  // 섹션 내 하나라도 PAUSED → 점선 테두리 표시
  const hasAnyPaused = activePages.some((p) => dbStatusToUI(p.status) === 'paused')

  // 가장 위험한 일시정지 페이지 → 경과 시간 계산
  const pausedElapsedMins = useMemo(() => {
    if (!hasAnyPaused) return null
    const pausedPages = activePages.filter((p) => dbStatusToUI(p.status) === 'paused')
    if (pausedPages.length === 0) return null

    // updatedAt 기준 가장 최근에 멈춘 페이지 (= PAUSED 전환 시각)
    const mostRecent = pausedPages.reduce((a, b) =>
      new Date(b.updatedAt).getTime() > new Date(a.updatedAt).getTime() ? b : a,
    )
    const elapsed = Math.max(
      0,
      Math.round((now.getTime() - new Date(mostRecent.updatedAt).getTime()) / 60_000),
    )
    return elapsed
  }, [activePages, hasAnyPaused, now])

  // ── 색상 ────────────────────────────────────────────────────
  // 오늘 등록된 작업이 없으면 중립 회색 (기본 마감 카운트다운과 실제 작업 구분)
  const hasPages = pages.length > 0
  const bgColor = hasPages
    ? urgencyToColor(urgencyResult.level, isDark)
    : (isDark ? '#334155' : '#94a3b8')

  // ── 접근성 레이블 ────────────────────────────────────────────
  const ariaLabel = [
    section.name,
    urgencyResult.label,
    hasAnyPaused ? '일시정지' : null,
    isCritical ? '긴급 — 이거 먼저' : null,
  ]
    .filter(Boolean)
    .join(' — ')

  return (
    <button
      type="button"
      className={cn(
        // 레이아웃 — flex 안에서 동등 분배
        'section-segment',
        'flex-1 relative min-w-0',
        // 높이 전환: Level 1 (9px) ↔ Level 2 (44px)
        'transition-[height] duration-200 ease-out',
        hovered ? 'h-[44px]' : 'h-[9px]',
        // 최소 터치 영역 44px는 height 변환으로 달성
        'cursor-pointer',
        'focus-visible:z-10',
        // CRITICAL pulse — motion-safe 가드 필수 (CLAUDE.md §절대 원칙 5·6)
        pulse && 'motion-safe:animate-urgency-pulse motion-safe:animate-warm-glow',
      )}
      style={{
        backgroundColor: bgColor,
        // 일시정지 점선 outline (border와 달리 레이아웃에 영향 없음)
        ...(hasAnyPaused && {
          outline: '2px dashed rgba(255,255,255,0.55)',
          outlineOffset: '-2px',
        }),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onZoomIn(section.id)}
      aria-label={ariaLabel}
      aria-pressed={isZoomed}
    >
      {/* ── Level 2: 호버 시 섹션명 + 카운트다운 ─────────────── */}
      <div
        className={cn(
          'absolute inset-0 flex flex-col justify-center px-2.5 gap-[3px]',
          'transition-opacity duration-150',
          hovered ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        {/* 섹션명 — 11px / 600 (UX 명세 §Typography) */}
        <span className="text-white/80 text-[11px] font-semibold leading-none truncate">
          {section.name}
        </span>

        {/* 카운트다운 or 미등록 안내 */}
        {hasPages ? (
          <span className="text-white text-[13px] font-bold leading-none tabular-nums">
            {urgencyResult.label}
          </span>
        ) : (
          <span className="text-white/50 text-[10px] font-normal leading-none">
            작업 미등록
          </span>
        )}

        {/* CRITICAL INTERRUPT 메시지 (패닉 증폭 금지 — 차분한 우선순위 안내) */}
        {isCritical && (
          <span className="text-white/90 text-[10px] font-semibold leading-none tracking-wide">
            이거 먼저
          </span>
        )}

        {/* 일시정지 경과 시간 */}
        {hasAnyPaused && pausedElapsedMins !== null && pausedElapsedMins > 0 && (
          <span className="text-white/65 text-[10px] font-normal leading-none">
            {formatElapsed(pausedElapsedMins)} 중단 중
          </span>
        )}
      </div>
    </button>
  )
}

// ─── 유틸리티 ────────────────────────────────────────────────

/** 섹션 기본 마감 시각 (오늘 날짜 기준) */
function sectionDefaultDeadline(section: Section, now: Date): Date {
  const d = new Date(now)
  d.setHours(section.deadlineHour, section.deadlineMinute, 0, 0)
  return d
}

/** 경과 시간 → 표시 문자열 (60분 미만: "32분", 이상: "1시간 4분") */
function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}분`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`
}
