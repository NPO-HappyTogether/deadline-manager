/**
 * OtherEditionChecklist.tsx — 타주 파일 체크리스트 (Story 5.2)
 *
 * 인쇄소로 보내는 타주(다른 지면) 파일 준비 완료 여부를 기록
 * 미완료 항목이 있으면 상단 바에 경고 표시
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { db, toggleOtherEditionCheck } from '@/lib/db'
import { toast } from 'sonner'

/** 기본 체크리스트 항목 */
const DEFAULT_ITEMS = [
  { key: 'local',      label: '본지 파일 확인' },
  { key: 'ad',         label: '광고 파일 확인' },
  { key: 'sports',     label: '스포츠면 파일 확인' },
  { key: 'other',      label: '기타 타주 파일' },
]

export function OtherEditionChecklist() {
  const settings = useLiveQuery(() => db.settings.get(1))
  const checklist: Record<string, boolean> =
    (settings as unknown as Record<string, unknown>)?.otherEditionChecklist as Record<string, boolean> ?? {}

  const pendingCount = DEFAULT_ITEMS.filter((item) => !checklist[item.key]).length
  const allDone = pendingCount === 0

  const handleToggle = async (key: string, current: boolean) => {
    try {
      await toggleOtherEditionCheck(key, !current)
    } catch (err) {
      console.error('[db] checklist update failed:', err)
      toast.error('저장 실패. 다시 시도해주세요.')
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">타주 파일 체크리스트</h3>
        {allDone ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ 완료</span>
        ) : (
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            {pendingCount}개 미완료
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {DEFAULT_ITEMS.map((item) => {
          const done = checklist[item.key] ?? false
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleToggle(item.key, done)}
              className="flex items-center gap-3 text-left min-h-[44px] px-2 py-1 rounded-lg hover:bg-muted/60 transition-colors"
              aria-pressed={done}
            >
              <span className={[
                'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                done
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'border-border bg-background',
              ].join(' ')}>
                {done && <span className="text-xs font-bold">✓</span>}
              </span>
              <span className={[
                'text-sm transition-colors',
                done ? 'text-muted-foreground line-through' : 'text-foreground',
              ].join(' ')}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** 미완료 항목 여부 — 상단 바 경고용 */
export function useHasPendingChecklist(): boolean {
  const settings = useLiveQuery(() => db.settings.get(1))
  const checklist: Record<string, boolean> =
    (settings as unknown as Record<string, unknown>)?.otherEditionChecklist as Record<string, boolean> ?? {}
  return DEFAULT_ITEMS.some((item) => !checklist[item.key])
}
