/**
 * SettingsPanel.tsx — 앱 설정 패널
 *
 * UX 명세 §Experience Principles "관리하지 않고 확인만 하는" 원칙 기반
 *
 * 구성:
 *   - 테마 전환 (자동 / 라이트 / 다크)
 *   - DND 모드 토글
 *   - 섹션 목록 편집 (이름, 마감 시각, 활성화 여부)
 *
 * 원칙:
 *   - 즉시 저장 (change 즉시 Dexie 저장 — "저장" 버튼 없음)
 *   - useLiveQuery = 단일 진실 공급원
 *   - 입력 필드는 로컬 상태 유지 → blur 시 저장 (DB 과도 쓰기 방지)
 */

import { useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { cn } from '@/lib/utils'
import { db } from '@/lib/db'
import { useTheme } from '@/providers/ThemeProvider'
import { usePopupKeyCapture } from '@/hooks/usePopupKeyCapture'
import type { ThemeMode } from '@/providers/ThemeProvider'
import type { Section } from '@/lib/db'

// ─── Props ──────────────────────────────────────────────────

export interface SettingsPanelProps {
  onClose: () => void
}

// ─── 컴포넌트 ────────────────────────────────────────────────

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { themeMode, dnd, setThemeMode, toggleDnd } = useTheme()

  usePopupKeyCapture({ onEscape: onClose })

  const sections = useLiveQuery(
    () => db.sections.orderBy('displayOrder').toArray(),
    [],
  )

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/40 flex items-end justify-center pb-4 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="설정"
    >
      <div
        className={cn(
          'w-full max-w-[480px] max-h-[85vh] overflow-y-auto',
          'bg-popover text-popover-foreground',
          'rounded-2xl',
          'shadow-[0_8px_32px_rgba(0,0,0,0.24)]',
          'ring-1 ring-foreground/10',
          'animate-in slide-in-from-bottom-4 fade-in-0 duration-200',
        )}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <h2 className="text-base font-semibold">설정</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            닫기
          </button>
        </div>

        <div className="px-5 py-4 space-y-6">

          {/* ── 테마 ─────────────────────────────────────── */}
          <section>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              테마
            </p>
            <div className="flex gap-2">
              {(['auto', 'light', 'dark'] as ThemeMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => void setThemeMode(mode)}
                  className={cn(
                    'flex-1 h-10 rounded-xl text-sm font-medium transition-colors border',
                    themeMode === mode
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted',
                  )}
                >
                  {mode === 'auto' ? '자동' : mode === 'light' ? '라이트' : '다크'}
                </button>
              ))}
            </div>
          </section>

          {/* ── DND 모드 ──────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">방해금지 모드</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  색상 채도를 낮춰 집중력을 유지합니다
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={dnd}
                onClick={() => void toggleDnd()}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  dnd ? 'bg-primary' : 'bg-muted-foreground/30',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                    dnd ? 'translate-x-5' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>
          </section>

          {/* ── 섹션 편집 ─────────────────────────────────── */}
          <section>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              섹션 편집
            </p>
            <div className="space-y-2">
              {sections?.map((section) => (
                <SectionRow key={section.id} section={section} />
              ))}
            </div>

            {/* 새 섹션 추가 */}
            <button
              type="button"
              onClick={() => void addSection()}
              className={cn(
                'mt-3 w-full h-9 rounded-xl border border-dashed border-border',
                'text-sm text-muted-foreground hover:bg-muted transition-colors',
              )}
            >
              + 섹션 추가
            </button>
          </section>

        </div>
      </div>
    </div>
  )
}

// ─── 섹션 행 (인라인 편집) ────────────────────────────────────

function SectionRow({ section }: { section: Section }) {
  const [name, setName] = useState(section.name)
  // "HH:MM" 형태로 로컬 상태
  const [deadlineTime, setDeadlineTime] = useState(
    `${String(section.deadlineHour).padStart(2, '0')}:${String(section.deadlineMinute).padStart(2, '0')}`
  )

  const saveName = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === section.name) return
    await db.sections.update(section.id, { name: trimmed })
  }, [name, section.id, section.name])

  const saveDeadline = useCallback(async () => {
    const [hourStr, minStr] = deadlineTime.split(':')
    const hour = parseInt(hourStr ?? '0', 10)
    const min = parseInt(minStr ?? '0', 10)
    if (isNaN(hour) || isNaN(min)) return
    if (hour === section.deadlineHour && min === section.deadlineMinute) return
    await db.sections.update(section.id, {
      deadlineHour: hour,
      deadlineMinute: min,
    })
  }, [deadlineTime, section.id, section.deadlineHour, section.deadlineMinute])

  const toggleActive = useCallback(async () => {
    await db.sections.update(section.id, { isActive: !section.isActive })
  }, [section.id, section.isActive])

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-3 rounded-xl border transition-colors',
        section.isActive ? 'border-border bg-muted/20' : 'border-dashed border-border/50 bg-muted/10 opacity-60',
      )}
    >
      {/* 활성화 토글 */}
      <button
        type="button"
        role="switch"
        aria-checked={section.isActive}
        onClick={() => void toggleActive()}
        title={section.isActive ? '비활성화' : '활성화'}
        className={cn(
          'relative w-8 h-4 rounded-full transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          section.isActive ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform',
            section.isActive ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </button>

      {/* 섹션 이름 */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void saveName()}
        maxLength={20}
        className={cn(
          'flex-1 min-w-0 text-sm bg-transparent border-none outline-none',
          'focus:bg-muted/40 rounded px-1 -mx-1 transition-colors',
          !section.isActive && 'text-muted-foreground',
        )}
        aria-label="섹션 이름"
      />

      {/* 마감 시각 */}
      <input
        type="time"
        value={deadlineTime}
        onChange={(e) => setDeadlineTime(e.target.value)}
        onBlur={() => void saveDeadline()}
        className={cn(
          'text-xs tabular-nums bg-transparent border border-border rounded px-1.5 py-0.5',
          'focus:outline-none focus:ring-1 focus:ring-ring transition-colors',
          'text-muted-foreground w-[72px] shrink-0',
        )}
        aria-label="마감 시각"
      />
    </div>
  )
}

// ─── 섹션 추가 ───────────────────────────────────────────────

async function addSection(): Promise<void> {
  const existing = await db.sections.orderBy('displayOrder').last()
  const nextOrder = (existing?.displayOrder ?? 0) + 1
  const now = new Date()
  await db.sections.add({
    name: `새 섹션 ${nextOrder}`,
    displayOrder: nextOrder,
    deadlineHour: 18,
    deadlineMinute: 0,
    isActive: true,
    createdAt: now,
  })
}
