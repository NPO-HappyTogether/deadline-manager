/**
 * usePopupKeyCapture — 팝업 전용 키 캡처 훅
 *
 * UX 명세 §UX Consistency Patterns §3. 키 캡처 패턴
 * 원칙: "앱은 팝업이 열려 있을 때만 키보드를 빌린다"
 * - 이 훅이 마운트되어 있을 때만 keydown 이벤트를 캡처
 * - Input 포커스 중에는 1/2/3/4 캡처 비활성화
 * - Esc는 항상 캡처 (Input 포커스 중에도)
 */

import { useEffect, useCallback } from 'react'

export interface PopupKeyHandlers {
  /** Space 키 — 완료 확인 */
  onSpace?: () => void
  /** 숫자 1/2/3/4 — 강도 선택 */
  onNumber?: (n: 1 | 2 | 3 | 4) => void
  /** Esc — 팝업 닫기 (완료 아님) */
  onEscape?: () => void
  /** Enter — 메모 입력 완료 (Input 활성화 중) */
  onEnter?: () => void
  /** 훅 전체 비활성화 (DND 모드 등) */
  disabled?: boolean
}

export function usePopupKeyCapture(handlers: PopupKeyHandlers): void {
  const { onSpace, onNumber, onEscape, onEnter, disabled = false } = handlers

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled) return

      // Input / Textarea 포커스 중 여부 확인
      const target = e.target as HTMLElement
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      // Esc는 Input 중에도 항상 처리
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onEscape?.()
        return
      }

      // Enter — Input 포커스 중에만 처리
      if (e.key === 'Enter' && isInputFocused) {
        e.preventDefault()
        onEnter?.()
        return
      }

      // Input 포커스 중이면 이하 캡처 모두 비활성화
      if (isInputFocused) return

      // Space — 완료 확인
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault() // 페이지 스크롤 방지
        onSpace?.()
        return
      }

      // 숫자 1/2/3/4 — 강도 선택
      if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        onNumber?.(Number(e.key) as 1 | 2 | 3 | 4)
        return
      }
    },
    [disabled, onSpace, onNumber, onEscape, onEnter]
  )

  useEffect(() => {
    if (disabled) return

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [disabled, handleKeyDown])
}
