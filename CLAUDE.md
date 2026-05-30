# CLAUDE.md — 신문 제작팀 마감 관리 시스템

> **AI 영구 브리핑 파일** — 세션 시작 시 이 파일을 먼저 읽어 컨텍스트를 복원하세요.
> UX 명세 전문: `/Users/homestudio/bmad/_bmad-output/planning-artifacts/ux-design-specification.md`
> 인터랙티브 목업: `/Users/homestudio/bmad/_bmad-output/planning-artifacts/ux-design-directions.html`

---

## 프로젝트 한 줄 설명

"관리하지 않고 확인만 하는" 신문 제작팀 마감 워크플로우 트래커.
상단 바를 흘깃 보면 상황이 색으로 말하고, 팝업 시 키 1타로 기록된다.

---

## 기술 스택

| 도구 | 버전 | 역할 |
|------|------|------|
| React + Vite | 6.x | UI 프레임워크 |
| TypeScript | 5.x | 타입 안전성 |
| **Tailwind CSS** | **v4** | 스타일 — CSS 파일에서 `@theme` 로 토큰 설정 (tailwind.config.js 없음) |
| shadcn/ui | latest | Dialog, Popover, Tooltip, Badge, Input, Button, Separator |
| Dexie.js | 4.x | IndexedDB 래퍼 — 단일 진실 공급원 |
| vite-plugin-pwa | latest | 서비스워커, 오프라인 지원 |
| lucide-react | latest | 아이콘 |

**⚠️ Tailwind v4 주의:** `tailwind.config.js` 없음. 색상 토큰은 `src/index.css`의 `@theme` 블록에 있음.

---

## 절대 원칙 (코드 작성 전 반드시 확인)

1. **팝업 활성화 시에만 키 캡처** — 전역 keydown 인터셉트 절대 없음
   → `usePopupKeyCapture` 훅을 반드시 사용, 팝업 마운트/언마운트에 바인딩
2. **Dexie = 단일 진실 공급원** — useState로 DB 데이터를 복사하지 말 것
   → `useLiveQuery` 훅으로 DB 구독
3. **타이머는 표시용만** — 실제 기록은 항상 `new Date()` 타임스탬프
   → `setInterval`로 UI 카운트다운 갱신, DB 저장은 이벤트 시각 기준
4. **번들 ~100KB 이하 유지** — 무거운 라이브러리 추가 전 반드시 확인
5. **CRITICAL pulse만 애니메이션** — 나머지는 CSS transition만
6. **motion-safe: / motion-reduce:** Tailwind 클래스로 모든 애니메이션 처리

---

## 긴박도 색상 토큰

```css
/* src/index.css @theme 블록 */
--color-urgency-safe:     #16a34a  /* 라이트 */  / #4ade80  /* 다크 */
--color-urgency-caution:  #d97706  / #fbbf24
--color-urgency-warning:  #ea580c  / #fb923c
--color-urgency-critical: #dc2626  / #f87171
--color-urgency-overtime: #374151  / #6b7280
```

Tailwind에서 사용: `bg-[var(--color-urgency-critical)]`

---

## 상태 머신

### UI 표시 (사용자 인지용)
```
대기중(waiting) → 진행중(active) → 일시정지(paused) → 완료(done)
```

### DB 내부 (분석용)
```
WAITING → ACTIVE → PAUSED → RESUMED → HANDED_OFF → DONE
```

**PAUSED 스택:** 여러 작업이 동시에 PAUSED 가능 (배열로 관리)

**CRITICAL INTERRUPT:** `status === 'paused' && minutesLeft <= 30`
→ 세그먼트 warm-glow pulse + "이거 먼저" 메시지 (패닉 증폭 금지)

---

## 파일 구조

```
src/
  components/
    TopBar/
      StatusBar.tsx          ← 풀와이드 상단 바 최상위
      SectionSegment.tsx     ← 섹션별 색상 세그먼트
    Timeline/
      ZoomInTimeline.tsx     ← ±1시간 줌인 패널 (scaleY 0→1, 0.22초)
      TimelineBar.tsx        ← 타입 라우터
      bars/
        EditorialBar.tsx     ← 편집 조판 (파랑→빨강)
        AdBar.tsx            ← 광고 제작/조판
        PrintConfirmBar.tsx  ← 인쇄소 확인 (보라)
        InterruptionBar.tsx  ← 중단 구간 (주황 점선)
        TempBar.tsx          ← 임시업무 (점선 + ★)
    Popup/
      IntensityPopup.tsx     ← 마감 완료 후 강도 1~4 팝업
      InterruptionPanel.tsx  ← 중단 기록 패널
    Schedule/
      ScheduleEntry.tsx      ← 하루 시작 스케줄 입력
    Summary/
      DailyClosingSummary.tsx
    Analytics/
      PatternHeatmap.tsx
    ui/                      ← shadcn/ui 복사본 (수정 가능)
  hooks/
    usePopupKeyCapture.ts    ← 키 캡처 집중화 훅 (팝업 마운트 시만)
  providers/
    ThemeProvider.tsx        ← 다크/라이트 + DND 통합 관리
  lib/
    db.ts                    ← Dexie 스키마 + 쿼리 헬퍼
    urgency.ts               ← 긴박도 순수 함수 (테스트 가능)
    timeline.ts              ← X축 계산 순수 함수 (테스트 가능)
    settings.ts              ← 설정 read/write 헬퍼
```

---

## import alias

```ts
import { ... } from '@/lib/urgency'    // src/lib/urgency.ts
import { ... } from '@/components/...' // src/components/...
```

---

## Phase 1 컴포넌트 구현 순서

- [x] `urgency.ts` — 긴박도 순수 함수
- [x] `timeline.ts` — X축 계산 순수 함수
- [x] `db.ts` — Dexie 스키마
- [x] `usePopupKeyCapture.ts` — 키 캡처 훅
- [x] `ThemeProvider.tsx` — 테마/DND 프로바이더
- [x] `StatusBar.tsx` + `SectionSegment.tsx` — 상단 바
- [x] `ZoomInTimeline.tsx` — 줌인 패널
- [x] `EditorialBar.tsx` + `InterruptionBar.tsx`
- [x] `IntensityPopup.tsx` — 강도 1~4 팝업
- [x] `InterruptionPanel.tsx` — 중단 패널
- [x] `ScheduleEntry.tsx` — 하루 시작 입력

## Phase 2 컴포넌트 구현 완료

- [x] `AdBar.tsx` — 광고 조판 막대
- [x] `PrintConfirmBar.tsx` — 인쇄소 확인 막대 (보라)
- [x] `TempBar.tsx` — 임시업무 막대 (점선 + ★)
- [x] `TimelineBar.tsx` v2 — 전체 타입 라우팅
- [x] `useDeadlineTrigger.ts` — 마감 자동 감지 훅
- [x] `DailyClosingSummary.tsx` — 일일 결산 스냅샷
- [x] `PatternHeatmap.tsx` — 인터럽션 패턴 히트맵
- [x] `App.tsx` Phase 2 통합 — 자동 트리거 완전 연결

## Phase 3 구현 완료 (2026-05-27)

- [x] `ZoomInTimeline.tsx` 업데이트 — 페이지 탭 → InterruptionPanel 연결
- [x] `SettingsPanel.tsx` — 테마/DND/섹션 편집
- [x] `App.tsx` 업데이트 — ⚙ 설정 버튼 + SettingsPanel

## Phase 4 구현 완료 (2026-05-29)

- [x] **인쇄 카운트** — `Page.printCount` 필드, Tab 키로 +1, 막대에 "n차" 뱃지
- [x] **Shift+Tab 태스크 스위처** — ZoomInTimeline 내 키보드 태스크 전환
  - Shift+Tab 첫 입력 → 스위처 오버레이 (PAUSED 목록 + 현재 작업 FROM 컨텍스트)
  - Shift 놓음 → 전환 실행, 1초 이내 Esc → 취소
  - 전환 시 오늘 전체 ACTIVE/RESUMED 페이지 일괄 PAUSED (모든 섹션)
- [x] **퍼지(purge) 인터럽션 이유** — InterruptionPanel에 📤 퍼지 추가
- [x] **마감 전 수동 완료** — ZoomInTimeline ACTIVE/PAUSED 행에 "✓ 완료" 버튼
  - 완료 버튼 클릭 → IntensityPopup(skipConfirm=false) → DONE
  - 완료 팝업 열릴 때 Tab 인쇄 카운트 비활성화 (completionTargetRef 가드)
- [x] **PAUSED 마감 트리거** — useDeadlineTrigger가 PAUSED 페이지도 감시
- [x] **상단 바 개선** — 작업 미등록 섹션 회색 + "작업 미등록" 표시
- [x] **빈 섹션 ZoomInTimeline** — "+ 작업 등록" 버튼 (onOpenSchedule 콜백)
- [x] **WAITING → ACTIVE 시 패널 자동 닫기** — 시작 즉시 InDesign 복귀
- [x] **StatusBar 30초 갱신** — 작업 등록 후 색상 반영 지연 최소화
- [x] **PatternHeatmap 첫날** — 데이터 없으면 빈 숫자 대신 안내 메시지

**빌드 상태:** ✅ tsc + vite 모두 통과 (116 KB gzip)

---

## DB 스키마 변경 이력

| 버전 | 변경 내용 |
|------|---------|
| v1 (초기) | 기본 스키마 |
| v1 (필드 추가) | `Page.printCount: number` (인덱스 없음, ?? 0 fallback) |
| v1 (타입 확장) | `Interruption.reason`에 `'purge'` 추가 |

---

## 인터랙션 모델 (팝업 키 캡처)

| 키 | 컨텍스트 | 동작 |
|----|---------|------|
| `Space` | 완료 팝업 활성화 중 | 완료 확인 → 강도 팝업 |
| `1/2/3` | 강도 팝업 활성화 중 | 강도 기록 후 소멸 |
| `4` | 강도 팝업 활성화 중 | 메모창 슬라이드인 |
| `Esc` | 어느 팝업이든 | 닫기 (완료 아님, 상태 유지) |
| `Tab` | ZoomInTimeline 열림 + ACTIVE 페이지 있을 때 | 인쇄 카운트 +1 |
| `Shift+Tab` | ZoomInTimeline 열림 | PAUSED 페이지 순환 스위처 |
| `Shift 놓음` | 스위처 활성화 중 | 선택된 페이지로 전환 |
| **그 외 모든 키** | **팝업/ZoomInTimeline 없을 때** | **앱이 무시** |

**IntensityPopup 자동 소멸:** 7~8초, 소멸 1초 전 "자동 저장됩니다…" 표시
→ `intensity: null`, `tag: "자동"`, `autoCompleteContext` 스냅샷 저장

---

## StatusBar 3단계 인터랙션

```
Level 1: 9px 색 라인     (ambient awareness — 평상시)
Level 2: 44px 확장       (호버 — 섹션명 + 카운트다운)
Level 3: ZoomInTimeline  (클릭 — ±1시간 줌인)
```

---

## 타임라인 막대 색상

| 타입 | 색상 | CSS 변수 |
|------|------|---------|
| 편집 조판 | 파랑→빨강 | `--color-bar-editorial` → urgency |
| 광고 제작/조판 | 파랑→빨강 | `--color-bar-ad` |
| 인쇄소 확인 | 보라 | `--color-bar-print` |
| 중단(인터럽션) | 주황 점선 | `--color-bar-interrupt` |

---

## 접근성 필수 체크리스트

- [ ] `role="status" aria-live="polite"` — 모든 상태 표시 요소
- [ ] `motion-safe:animate-*` + `motion-reduce:animate-none` — 애니메이션
- [ ] `:focus-visible` — 키보드 포커스 스타일 (전역 설정 완료)
- [ ] 최소 탭 영역 44×44px — 모든 인터랙티브 요소
- [ ] WCAG AA 4.5:1 대비비 — 긴박도 색상 (index.css 주석 참조)

---

## 자주 하는 실수 & 방지책

| 실수 | 방지책 |
|------|--------|
| 전역 keydown에서 키 캡처 | `usePopupKeyCapture` 훅만 사용 |
| useState로 DB 데이터 복사 | `useLiveQuery` 직접 구독 |
| 타이머로 완료 시각 계산 | `new Date()` 타임스탬프 |
| CSS animation 남발 | CRITICAL pulse만, 나머지 transition |
| tailwind.config.js 생성 | Tailwind v4는 CSS `@theme` 사용 |
| shadcn Dialog 전체화면 | `data-[state=open]:bg-transparent`로 배경 dim 제거 |
