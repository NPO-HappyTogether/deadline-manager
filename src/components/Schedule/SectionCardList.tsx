/**
 * SectionCardList.tsx — 오늘 섹션 카드 목록 (마감 시각 순)
 *
 * Story 2.1: 앱을 열면 오늘 할 일이 마감 시각 순으로 즉시 표시
 * - useLiveQuery를 통한 실시간 갱신
 * - Empty State: 스케줄 없을 때 안내
 * - 특수 발행일 배너 (settings에서 로드)
 */

import { useSectionPages } from '@/hooks/useSectionPages'
import { todayString } from '@/lib/db'
import type { UIStatus } from '@/lib/urgency'
import { getDisplayNow } from '@/lib/time'

interface SectionCardListProps {
  onOpenSchedule: () => void
}

/** 상태 → 표시 텍스트 */
const STATUS_LABEL: Record<UIStatus, string> = {
  waiting: '대기중',
  active:  '진행중',
  paused:  '일시정지',
  done:    '완료',
}

/** 상태 → 배지 색상 */
const STATUS_COLOR: Record<UIStatus, string> = {
  waiting: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  active:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  paused:  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  done:    'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

/** Date → "HH:MM" */
function fmt(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function SectionCardList({ onOpenSchedule }: SectionCardListProps) {
  const today = todayString()
  const sectionData = useSectionPages(today)

  // 로딩 중
  if (sectionData === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">로딩 중…</p>
      </div>
    )
  }

  // Empty State — 오늘 스케줄 없음 (Story 2.1 AC)
  if (sectionData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-4xl">📋</div>
        <p className="text-base font-medium text-foreground">오늘 스케줄이 없습니다</p>
        <p className="text-sm text-muted-foreground">면 번호와 섹션을 등록해주세요</p>
        <button
          type="button"
          onClick={onOpenSchedule}
          className="mt-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          스케줄 입력
        </button>
      </div>
    )
  }

  const now = getDisplayNow()
  const allDone = sectionData.every((s) => s.status === 'done')

  return (
    <div className="flex flex-col gap-3 px-4 py-4">

      {/* 날짜 헤더 */}
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-foreground">
          {new Date(today).toLocaleDateString('ko-KR', {
            month: 'long', day: 'numeric', weekday: 'short',
          })}
        </h2>
        {allDone && (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            ✓ 오늘 마감 완료
          </span>
        )}
      </div>

      {/* 섹션 카드 목록 */}
      {sectionData.map(({ section, pages, status, doneCount }) => {
        // 대표 마감 시각 (첫 번째 페이지 기준)
        const deadlineAt = pages[0] ? new Date(pages[0].deadlineAt) : null
        const isOverdue = deadlineAt && deadlineAt < now && status !== 'done'

        return (
          <div
            key={section.id}
            className={[
              'rounded-xl border p-4 transition-colors',
              status === 'done'
                ? 'bg-muted/40 border-border/50 opacity-60'
                : isOverdue
                  ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
                  : 'bg-card border-border',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-2">
              {/* 섹션 이름 + 마감 */}
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-semibold text-sm truncate">{section.name}</span>
                {deadlineAt && (
                  <span className={[
                    'text-xs',
                    isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground',
                  ].join(' ')}>
                    {isOverdue ? '⚠ ' : ''}마감 {fmt(deadlineAt)}
                  </span>
                )}
              </div>

              {/* 상태 배지 */}
              <div className="flex items-center gap-2 shrink-0">
                {/* 페이지 카운트 */}
                {pages.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {doneCount}/{pages.length}면
                  </span>
                )}
                <span className={[
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  STATUS_COLOR[status],
                ].join(' ')}>
                  {STATUS_LABEL[status]}
                </span>
              </div>
            </div>
          </div>
        )
      })}

      {/* 스케줄 수정 링크 */}
      <button
        type="button"
        onClick={onOpenSchedule}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 self-start"
      >
        + 스케줄 수정
      </button>
    </div>
  )
}
