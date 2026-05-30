/**
 * AdBar.tsx — 광고 제작/조판 타임라인 막대
 *
 * UX 명세 §Component Strategy §4 "광고 제작/조판 — 파랑→빨강 (편집과 동일)"
 *
 * EditorialBar와 시각적으로 동일하지만 별도 컴포넌트로 분리:
 * - Phase 2+에서 광고 특화 필드(광고주, 광고 코드) 추가 시 확장 용이
 * - --color-bar-ad 토큰 사용 (현재 EditorialBar와 동일값 #3b82f6)
 * - 바이브 코딩 환경에서 타입별 분리로 AI 코드 품질 향상
 */

import { EditorialBar, type EditorialBarProps } from './EditorialBar'

// AdBar는 EditorialBar와 동일한 렌더링 — 타입 분리만 유지
// Phase 2+: 광고 특화 필드 추가 시 여기서 확장
export function AdBar(props: EditorialBarProps) {
  return <EditorialBar {...props} />
}

export type { EditorialBarProps as AdBarProps }
