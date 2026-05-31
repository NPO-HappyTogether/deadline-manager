/**
 * constants.ts — 앱 전체 매직 넘버 단일 관리
 *
 * 원칙:
 *   - 임계값/타이머/UI 수치는 모두 여기서 import
 *   - 값 변경 시 이 파일 하나만 수정
 *   - 출처 주석 필수 (어느 컴포넌트/명세에서 왔는지)
 */

// ─── 긴박도 임계값 (urgency.ts) ──────────────────────────────
/** 마감까지 이 분수 이하이면 CAUTION (주의) 상태 */
export const URGENCY_CAUTION_MINUTES = 60

/** 마감까지 이 분수 이하이면 WARNING (임박) 상태 */
export const URGENCY_WARNING_MINUTES = 30

/** 일시정지 + 마감 N분 이하이면 CRITICAL_INTERRUPT 상태 */
export const URGENCY_CRITICAL_PAUSED_MINUTES = 30

// ─── 타임라인 (timeline.ts) ──────────────────────────────────
/** 줌인 타임라인 좌우 범위 (분) — 현재 시각 ±이 값 */
export const TIMELINE_ZOOM_RANGE_MINUTES = 60

/** 타임라인 틱 간격 (분) */
export const TIMELINE_TICK_INTERVAL_MINUTES = 15

/** 오버타임 기준 시각 (시) — 이 시각 이후는 회색 배경 */
export const TIMELINE_OVERTIME_START_HOUR = 18

/** 마지막 마감 이후 타임라인 연장 시간 (분) */
export const TIMELINE_END_PADDING_MINUTES = 30

// ─── 강도 팝업 (IntensityPopup.tsx) ──────────────────────────
/** 강도 팝업 자동소멸 시간 (ms) — UX 명세: 7~8초 */
export const INTENSITY_POPUP_AUTO_DISMISS_MS = 7500

/** 마감 완료 후 강도 팝업 트리거 딜레이 (ms) */
export const INTENSITY_POPUP_TRIGGER_DELAY_MS = 1500

// ─── 목요일 특별 규칙 (Story 5.3 스케줄 생성 시 사용) ────────
/** 목요일 본국지면 면수 (기본 5면 → 목요일 10면) */
export const THU_BONKUK_PAGE_COUNT = 10

/** 목요일 안내광고 면수 (별도 발행, 16면) */
export const THU_ANGUIDE_PAGE_COUNT = 16

/** 부동산면 제작 요일 (0=일, 1=월, 2=화, ...) */
export const BUDONGSAN_PRODUCTION_DAY = 2 // 화요일

/** 고부하일 요일 목록 (화요일=2, 수요일=3) */
export const HEAVY_DAYS = [2, 3] as const

// ─── UI 일반 ─────────────────────────────────────────────────
/** 최소 터치 영역 (px) — WCAG AA 기준 */
export const MIN_TOUCH_TARGET_PX = 44

/** 화면 전환 최대 시간 (ms) */
export const MAX_TRANSITION_MS = 300
