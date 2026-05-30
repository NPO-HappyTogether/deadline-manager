/**
 * TimelineBar.tsx — 타임라인 막대 라우터
 *
 * UX 명세 §Component Strategy §4. TimelineBar 기반
 *
 * 라우팅 규칙:
 *   status === 'HANDED_OFF' | 'DONE'(after HANDED_OFF) → PrintConfirmBar (보라)
 *   pageType === 'temp'                                 → TempBar (점선 ★)
 *   pageType === 'ad'                                   → AdBar (파랑→빨강)
 *   pageType === 'editorial'                            → EditorialBar (파랑→빨강)
 *   type === 'interruption'                             → InterruptionBar (주황 점선)
 *
 * 분리 이유: 타입별 props 분기를 최소화 → AI 코드 생성 품질 향상 (바이브 코딩 환경)
 */

import { EditorialBar } from './bars/EditorialBar'
import { AdBar }        from './bars/AdBar'
import { PrintConfirmBar } from './bars/PrintConfirmBar'
import { TempBar }      from './bars/TempBar'
import { InterruptionBar } from './bars/InterruptionBar'
import type { Page, Interruption } from '@/lib/db'
import type { TimeRange } from '@/lib/timeline'

// ─── 공통 위치 Props ─────────────────────────────────────────

interface PositionProps {
  range: TimeRange
  now: Date
  rowHeight: number
  topOffset: number
}

// ─── Discriminated Union ─────────────────────────────────────

type PageBarProps = PositionProps & {
  type: 'page'
  page: Page
  isDark: boolean
  onClick?: (page: Page) => void
}

type InterruptBarProps = PositionProps & {
  type: 'interruption'
  interruption: Interruption
}

export type TimelineBarProps = PageBarProps | InterruptBarProps

// ─── 컴포넌트 ────────────────────────────────────────────────

export function TimelineBar(props: TimelineBarProps) {
  if (props.type === 'interruption') {
    return (
      <InterruptionBar
        interruption={props.interruption}
        range={props.range}
        now={props.now}
        rowHeight={props.rowHeight}
        topOffset={props.topOffset}
      />
    )
  }

  const { page, range, now, isDark, rowHeight, topOffset, onClick } = props

  // 인쇄소 확인 단계: HANDED_OFF 상태 (또는 HANDED_OFF에서 DONE 전환)
  // PrintConfirmBar는 updatedAt(HANDED_OFF 전환 시각) ~ deadlineAt 범위로 표시
  if (page.status === 'HANDED_OFF') {
    return (
      <PrintConfirmBar
        page={page}
        range={range}
        now={now}
        rowHeight={rowHeight}
        topOffset={topOffset}
        onClick={onClick}
      />
    )
  }

  // 임시업무: 점선 테두리 + ★ 뱃지
  if (page.pageType === 'temp') {
    return (
      <TempBar
        page={page}
        range={range}
        now={now}
        isDark={isDark}
        rowHeight={rowHeight}
        topOffset={topOffset}
        onClick={onClick}
      />
    )
  }

  // 광고 조판
  if (page.pageType === 'ad') {
    return (
      <AdBar
        page={page}
        range={range}
        now={now}
        isDark={isDark}
        rowHeight={rowHeight}
        topOffset={topOffset}
        onClick={onClick}
      />
    )
  }

  // 편집 조판 (기본)
  return (
    <EditorialBar
      page={page}
      range={range}
      now={now}
      isDark={isDark}
      rowHeight={rowHeight}
      topOffset={topOffset}
      onClick={onClick}
    />
  )
}
