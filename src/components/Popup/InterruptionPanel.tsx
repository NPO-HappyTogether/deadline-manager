/**
 * InterruptionPanel.tsx — 중단 기록 패널
 *
 * UX 명세 §Component Strategy §6. InterruptionPanel, §Journey 3 기반
 *
 * 인터럽션 루프:
 *   "중단" 탭 1회 → 타임스탬프 즉시 자동 기록 → 이유는 선택사항
 *   → "(안 해도 됩니다)" 상시 표시 → 자책 없는 기록
 *
 * 원칙:
 *   - 버튼 클릭 즉시 타임스탬프 기록 (new Date() 기준 — CLAUDE.md §절대 원칙 3)
 *   - 이유 선택은 nullable (선택 안 해도 타임라인 완성)
 *   - pill 슬림 형태, 2단 이내
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { startInterruption } from '@/lib/db'
import { usePopupKeyCapture } from '@/hooks/usePopupKeyCapture'
import type { Page, Interruption } from '@/lib/db'

// ─── Props ──────────────────────────────────────────────────

export interface InterruptionPanelProps {
  page: Page
  sectionName: string
  /** 인터럽션 ID 반환 — 이후 'endInterruption' 호출에 사용 */
  onDone: (interruptionId: number) => void
  onDismiss: () => void
}

// ─── 이유 옵션 ────────────────────────────────────────────────

const REASON_OPTIONS: {
  value: NonNullable<Interruption['reason']>
  emoji: string
  label: string
}[] = [
  { value: 'purge',         emoji: '📤', label: '퍼지' },
  { value: 'phone_meeting', emoji: '📞', label: '전화·회의' },
  { value: 'other_section', emoji: '🔄', label: '다른섹션' },
  { value: 'other',         emoji: '❓', label: '기타' },
]

// ─── 컴포넌트 ────────────────────────────────────────────────

export function InterruptionPanel({ page, sectionName, onDone, onDismiss }: InterruptionPanelProps) {
  const [reason, setReason] = useState<Interruption['reason']>(null)
  const [saving, setSaving] = useState(false)

  const handleRecord = async () => {
    if (saving) return
    setSaving(true)
    try {
      // startInterruption: 타임스탬프 자동 기록 + Page → PAUSED 전환
      const id = await startInterruption(page.id, reason)
      onDone(id)
    } catch {
      setSaving(false)
    }
  }

  // Esc만 캡처 — 중단 패널에서 숫자/Space 캡처는 불필요
  usePopupKeyCapture({ onEscape: onDismiss })

  return (
    // 배경 dim 없음 — fixed overlay, pointer-events-none wrapper
    <div
      className="fixed inset-0 z-[60] pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="중단 기록"
    >
      {/* pill 슬림 패널 — 화면 하단 중앙 */}
      <div
        className={cn(
          'absolute bottom-16 left-1/2 -translate-x-1/2',
          'w-[290px] pointer-events-auto',
          'bg-popover text-popover-foreground',
          'rounded-2xl',
          'shadow-[0_8px_32px_rgba(0,0,0,0.24)]',
          'ring-1 ring-foreground/10',
          'p-4',
          'animate-in slide-in-from-bottom-4 fade-in-0 duration-200',
        )}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-none mb-1">
              {sectionName} · {page.pageNumber}
            </p>
            <h2 className="text-[14px] font-semibold leading-tight">중단 기록</h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="닫기"
            className={cn(
              'text-muted-foreground hover:text-foreground',
              'text-[11px] px-2 py-1 rounded hover:bg-muted transition-colors',
              '-mt-0.5',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            Esc
          </button>
        </div>

        {/* 이유 선택 — "(안 해도 됩니다)" 상시 표시 */}
        <p className="text-[11px] text-muted-foreground mb-2">
          이유{' '}
          <span className="opacity-60">(안 해도 됩니다)</span>
        </p>
        <div className="flex gap-1.5 mb-3">
          {REASON_OPTIONS.map(({ value, emoji, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setReason((r) => (r === value ? null : value))}
              aria-pressed={reason === value}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1',
                'h-[48px] rounded-xl border transition-colors',
                reason === value
                  ? 'border-primary bg-primary/8 text-foreground'
                  : 'border-border hover:bg-muted text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <span className="text-[15px] leading-none">{emoji}</span>
              <span className="text-[9px] leading-none font-medium">{label}</span>
            </button>
          ))}
        </div>

        {/* 중단하기 버튼 — 주황색 (인터럽션 토큰) */}
        <button
          type="button"
          onClick={() => void handleRecord()}
          disabled={saving}
          className={cn(
            'w-full h-10 rounded-xl text-sm font-semibold text-white',
            'transition-opacity',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          style={{ backgroundColor: 'var(--color-bar-interrupt)' }}
        >
          {saving ? '기록 중…' : '중단하기'}
        </button>
      </div>
    </div>
  )
}
