/**
 * Onboarding.tsx — 첫 실행 온보딩 안내 (Story 7.4)
 *
 * 조건: Dexie settings.onboardingDone === false
 * 완료 후 settings.onboardingDone = true (다시 표시 안 함)
 */

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { toast } from 'sonner'

const STEPS = [
  {
    icon: '📋',
    title: '오늘 스케줄 확인',
    desc: '앱을 열면 오늘 담당 면들이 마감 시각 순으로 표시됩니다.',
  },
  {
    icon: '✓',
    title: '버튼 하나로 완료',
    desc: '면 작업이 끝나면 완료 버튼을 탭하세요. 완료 시각이 자동 기록됩니다.',
  },
  {
    icon: '📊',
    title: '데이터가 쌓입니다',
    desc: '매일 기록이 쌓이면 패턴을 발견하고 팀장 미팅 근거로 활용할 수 있습니다.',
  },
]

export function Onboarding() {
  const settings = useLiveQuery(() => db.settings.get(1))
  const [step, setStep] = useState(0)
  const [closing, setClosing] = useState(false)

  // 온보딩 완료 또는 이미 완료된 경우 표시 안 함
  if (!settings || settings.onboardingDone || closing) return null

  const handleComplete = async () => {
    setClosing(true)
    try {
      await db.settings.update(1, { onboardingDone: true, updatedAt: new Date() })
    } catch (err) {
      console.error('[db] onboarding update failed:', err)
      toast.error('설정 저장 실패')
    }
  }

  const isLast = step === STEPS.length - 1
  const current = STEPS[step]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-xl p-6 w-80 flex flex-col gap-5">
        {/* 아이콘 + 내용 */}
        <div className="text-center flex flex-col gap-3">
          <div className="text-5xl">{current.icon}</div>
          <h2 className="text-lg font-semibold">{current.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{current.desc}</p>
        </div>

        {/* 단계 인디케이터 */}
        <div className="flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={[
                'w-2 h-2 rounded-full transition-colors',
                i === step ? 'bg-primary' : 'bg-muted',
              ].join(' ')}
            />
          ))}
        </div>

        {/* 버튼 */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={isLast ? handleComplete : () => setStep((s) => s + 1)}
            className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            {isLast ? '시작하기' : '다음'}
          </button>
          <button
            type="button"
            onClick={handleComplete}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            건너뛰기
          </button>
        </div>
      </div>
    </div>
  )
}
