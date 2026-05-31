/**
 * PrintConfirmPanel.tsx — 분판 확인 4단계 FSM 팝업 (Story 5.1)
 *
 * 흐름:
 *   0→1: 분판 전송 완료 확인
 *   1→2: 결과 확인 중
 *   2→4: 오류 없으면 최종 확인 완료 (DONE)
 *   2→3: 오류 발견 → 수정 후 재전송
 *   3→2: 재전송 완료 → 다시 결과 확인
 */

import { advancePrintConfirmStep } from '@/lib/db'
import { usePopupKeyCapture } from '@/hooks/usePopupKeyCapture'
import type { Page } from '@/lib/db'
import type { PrintConfirmStep } from '@/lib/db'

export interface PrintConfirmPanelProps {
  page: Page
  onDone: () => void
  onDismiss: () => void
}

const STEP_LABELS: Record<PrintConfirmStep, { title: string; desc: string }> = {
  0: { title: '분판 전송',     desc: '인쇄소로 분판 파일을 전송했나요?' },
  1: { title: '결과 확인',     desc: '인쇄소 사이트에서 결과를 확인해주세요' },
  2: { title: '확인 완료?',    desc: '오류가 없으면 완료, 오류가 있으면 재전송' },
  3: { title: '재전송 완료',   desc: '수정 후 재전송이 완료됐나요?' },
  4: { title: '최종 완료',     desc: '분판 확인이 완료됐습니다' },
}

export function PrintConfirmPanel({ page, onDone, onDismiss }: PrintConfirmPanelProps) {
  const step = (page.printConfirmStep ?? 0) as PrintConfirmStep

  usePopupKeyCapture({ onEscape: onDismiss })

  const handleAdvance = async (next: PrintConfirmStep) => {
    await advancePrintConfirmStep(page.id, next)
    if (next === 4) onDone()
  }

  const current = STEP_LABELS[step]

  // 단계별 버튼 구성
  const actions: Array<{ label: string; next: PrintConfirmStep; primary?: boolean }> = (() => {
    switch (step) {
      case 0: return [{ label: '✓ 전송 완료', next: 1, primary: true }]
      case 1: return [{ label: '결과 확인하기', next: 2, primary: true }]
      case 2: return [
        { label: '✓ 오류 없음 — 최종 완료', next: 4, primary: true },
        { label: '✗ 오류 발견 — 재전송', next: 3 },
      ]
      case 3: return [{ label: '✓ 재전송 완료', next: 2, primary: true }]
      default: return []
    }
  })()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="분판 확인"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss() }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-xl p-6 w-80 flex flex-col gap-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{page.pageNumber} · 분판 확인</p>
            <h2 className="text-base font-semibold mt-0.5">{current.title}</h2>
          </div>
          {/* 단계 인디케이터 */}
          <div className="flex gap-1">
            {([1, 2, 3, 4] as PrintConfirmStep[]).map((s) => (
              <div
                key={s}
                className={[
                  'w-2 h-2 rounded-full transition-colors',
                  s === 3 ? 'bg-red-400' : '',
                  step >= s && s !== 3 ? 'bg-violet-500' : '',
                  step < s ? 'bg-muted' : '',
                  step === 3 && s === 3 ? 'bg-red-400' : '',
                ].join(' ')}
              />
            ))}
          </div>
        </div>

        {/* 설명 */}
        <p className="text-sm text-muted-foreground">{current.desc}</p>

        {/* 액션 버튼 */}
        <div className="flex flex-col gap-2">
          {actions.map((action) => (
            <button
              key={action.next}
              type="button"
              onClick={() => handleAdvance(action.next)}
              className={[
                'px-4 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
                action.primary
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-destructive/10 text-destructive hover:bg-destructive/20',
              ].join(' ')}
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            나중에
          </button>
        </div>
      </div>
    </div>
  )
}
