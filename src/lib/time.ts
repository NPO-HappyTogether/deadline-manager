/**
 * time.ts — 표시용 현재 시각 유틸리티
 *
 * 개발·테스트용: URL 파라미터 ?mockTime=HH:MM 으로 시간 오버라이드
 * 예) http://localhost:5175/?mockTime=09:00
 *
 * 원칙:
 *   - 표시용(getDisplayNow) vs DB 저장용(new Date()) 명확히 분리
 *   - mockTime은 오프셋으로 작동 → 실제 시간처럼 앞으로 흘러감
 *   - 프로덕션에서는 파라미터 없으면 완전히 무시
 */

/**
 * 모듈 로드 시 1회 계산되는 시간 오프셋 (ms)
 * mockTime 없으면 0 (실제 시각 그대로)
 */
const TIME_OFFSET_MS: number = (() => {
  try {
    const params = new URLSearchParams(window.location.search)
    const mockTime = params.get('mockTime')
    if (!mockTime) return 0

    const [h, m] = mockTime.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return 0

    const mockDate = new Date()
    mockDate.setHours(h, m, 0, 0)
    const offset = mockDate.getTime() - Date.now()

    // 개발 환경에서만 콘솔 표시
    if (import.meta.env.DEV) {
      console.info(
        `[mockTime] 시간 오프셋 적용: ${mockTime} (${offset > 0 ? '+' : ''}${Math.round(offset / 60_000)}분)`,
      )
    }
    return offset
  } catch {
    return 0
  }
})()

/**
 * 표시용 현재 시각
 * mockTime 파라미터가 있으면 해당 시각부터 실제 속도로 진행
 * DB 저장에는 사용하지 말 것 — new Date() 직접 사용
 */
export function getDisplayNow(): Date {
  return new Date(Date.now() + TIME_OFFSET_MS)
}

/** mockTime이 활성화되어 있는지 여부 */
export const isMockTimeActive = TIME_OFFSET_MS !== 0
