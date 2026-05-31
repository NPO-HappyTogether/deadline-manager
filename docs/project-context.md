---
project_name: '신문 제작팀 마감 관리 시스템'
user_name: 'Homestudio'
date: '2026-05-30'
sections_completed: [technology_stack, language_rules, framework_rules, testing_rules, code_quality, workflow_rules, critical_rules]
status: 'complete'
rule_count: 40
optimized_for_llm: true
---

# Project Context for AI Agents

_신문 제작팀 마감 관리 시스템 — AI 에이전트가 코드 작성 시 반드시 따라야 하는 규칙 모음._
_명백한 규칙은 제외. 놓치기 쉬운 불분명한 규칙 위주._

**프로젝트 위치:** `/Users/homestudio/deadline-manager`

---

## Technology Stack & Versions

```
React 19.2  +  Vite 8  +  TypeScript 6 (strict)
Tailwind CSS v4 (CSS @theme — tailwind.config.js 없음)
shadcn/ui (components/ui/ 직접 복사)
Dexie.js 4.4  +  dexie-react-hooks 4.4   ← 단일 진실 공급원
vite-plugin-pwa 1.3 (Workbox, registerType: 'prompt')
lucide-react 1.16  (named import만)
sonner 2.0  (Toast)
fake-indexeddb 6.2  (테스트 전용)
Vitest 4.1  +  @vitest/coverage-v8  +  jsdom
```

**백엔드:** 없음. 순수 로컬 PWA. Supabase 재론 금지.

---

## 🔴 절대 규칙 7개 (위반 = 버그)

| # | 규칙 | 잘못된 예 | 올바른 예 |
|---|------|---------|---------|
| 1 | 키 캡처는 팝업 마운트 시에만 | `window.addEventListener('keydown', ...)` 전역 | `usePopupKeyCapture({ onEscape })` |
| 2 | DB 데이터는 `useLiveQuery`로만 | `useState([])` + `useEffect` fetch | `useLiveQuery(() => db.pages...)` |
| 3 | DB 저장 타임스탬프는 `new Date()` | setInterval 계산값 저장 | `const now = new Date()` (트랜잭션 내부) |
| 4 | 표시용 시각은 `getDisplayNow()` | `new Date()` 카운트다운 | `import { getDisplayNow } from '@/lib/time'` |
| 5 | Tailwind 토큰은 CSS `@theme`만 | `tailwind.config.js` 생성 | `src/index.css` `@theme` 수정 |
| 6 | 애니메이션은 CRITICAL pulse만 | 임의 animate 클래스 | `motion-safe:animate-urgency-pulse` |
| 7 | 내보내기는 `export.ts`만 | 컴포넌트 내 CSV 로직 직접 작성 | `import { exportToCSV } from '@/lib/export'` |

---

## Language-Specific Rules

- **import 경로:** `@/` alias 필수. 상대경로(`../../`) 금지
- **약어 네이밍:** `userId` ✅ / `userID` ❌ — 소문자 약어 통일
- **타임스탬프 컬럼:** `At` suffix 필수 (`deadlineAt`, `startedAt`, `completedAt`)
- **상태값:** `UPPER_SNAKE_CASE` (`WAITING`, `ACTIVE`, `DONE`)
- **noUnusedLocals/noUnusedParameters:** tsconfig strict — 미사용 변수 빌드 실패
- **void 처리:** `async` 함수 호출 시 결과 무시하려면 `void` 키워드 명시
- **타입 정의 위치:**
  - DB 엔티티 → `src/lib/db.ts`만
  - 상태 타입 → `src/lib/urgency.ts`만
  - 컴포넌트 props → 해당 파일 상단 inline
  - `src/types/` 폴더 없음, 중복 정의 금지

---

## Framework-Specific Rules (React + Dexie)

### 상태 관리
```typescript
// ✅ DB 데이터: useLiveQuery (hooks/ 훅으로 캡슐화)
// ✅ UI 상태: 로컬 useState
// ❌ DB 데이터 useState 복사 금지
// ❌ 낙관적 업데이트 금지 — useLiveQuery 속도로 충분
```

### Dexie 쿼리 캡슐화 (필수)
```typescript
// ✅ src/hooks/useXxx.ts 에서만 useLiveQuery 사용
export function useSchedulePages(date: string) {
  return useLiveQuery(
    () => db.pages.where('date').equals(date).sortBy('deadlineAt'),
    [date]  // 외부 변수를 deps에 명시
  )
}
// ❌ 컴포넌트 내 인라인 useLiveQuery 금지
```

### 라우팅
- **React Router 없음** — 모든 화면 전환은 `boolean` state 기반 모달
- `showSchedule`, `showSettings`, `showClosingSummary` 등 boolean으로 제어

### 컴포넌트 분리 기준
```
다음 중 하나라도 해당하면 분리:
  - 150줄 초과
  - props 5개 초과
  - 관심사 2가지 이상 (표시 + 데이터 동시)
```

### useDeadlineTrigger
```typescript
// ✅ App.tsx 최상위에서만 1회 마운트
const { triggeredPage, dismiss } = useDeadlineTrigger()
// ❌ 개별 Row 컴포넌트에서 마운트 금지 (타이머 N개 생성)
```

### Dexie 트랜잭션 규칙
```typescript
// ✅ CSV 가져오기 등 대량 작업: all-or-nothing
await db.transaction('rw', db.pages, async () => {
  await db.pages.bulkAdd(parsedRows)
})
// ❌ 루프 내 개별 저장 금지 (중간 실패 시 DB 오염)
```

### Dexie 스키마 버전 관리
- 기존 `version(N)`은 **절대 수정 금지** — 새 버전 체인 추가만 허용
- 컬럼 추가 시 `version(N+1).stores({...}).upgrade(tx => {...})` 패턴
- 현재 버전: **v3** (`pages` 테이블에 `printConfirmStep`, `printConfirmAt` 포함)

---

## Testing Rules

### 설정
- **`vitest.setup.ts`:** `fake-indexeddb/auto` — 실제 IndexedDB 없이 테스트
- **`vitest.config.ts`:** `environment: 'jsdom'`, `@ alias` 설정됨
- **커버리지 목표:** `src/lib/**/*.ts` 70% (lines/functions/branches)

### 테스트 파일 위치
```
src/lib/urgency.ts       → src/lib/urgency.test.ts  (colocated)
src/lib/timeline.ts      → src/lib/timeline.test.ts
src/lib/export.ts        → src/lib/export.test.ts
src/lib/stats.ts         → src/lib/stats.test.ts
```

### 테스트 패턴
```typescript
// 시간 주입 패턴 (getDisplayNow mockTime 지원)
function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000)
}
// now 직접 주입으로 시간 기반 함수 테스트
calcUrgency({ deadlineAt: deadline, status: 'active', now })
```

### 테스트 대상
- `src/lib/` 순수 함수 — Vitest로 단위 테스트
- DB 헬퍼 함수 — fake-indexeddb로 통합 테스트
- React 컴포넌트 — 현재 scope 외 (필요 시 추가)

---

## Code Quality & Style Rules

### 파일 네이밍
```
컴포넌트:  PascalCase.tsx   (StatusBar.tsx, SectionCardList.tsx)
훅:        camelCase.ts     (useDeadlineTrigger.ts, useSectionPages.ts)
유틸/lib:  camelCase.ts     (urgency.ts, time.ts, export.ts, stats.ts)
```

### 디렉토리 구조
```
src/
  components/
    TopBar/           StatusBar.tsx, SectionSegment.tsx
    Timeline/         ZoomInTimeline.tsx, TimelineBar.tsx, bars/
    Popup/            IntensityPopup.tsx, InterruptionPanel.tsx, PrintConfirmPanel.tsx
    Schedule/         ScheduleEntry.tsx, SectionCardList.tsx, OtherEditionChecklist.tsx
    Summary/          DailyClosingSummary.tsx
    Analytics/        PatternHeatmap.tsx
    Settings/         SettingsPanel.tsx
    ui/               shadcn/ui 복사본 (직접 수정 가능)
    ErrorBoundary.tsx, Onboarding.tsx, PwaUpdateBanner.tsx
  hooks/              DB 쿼리 캡슐화 + 부작용 훅
  lib/                순수 함수 + DB (테스트 대상)
  providers/          ThemeProvider.tsx
```

### 매직 넘버
- **모든 임계값/타이머 → `src/lib/constants.ts`** 에서 import
- 컴포넌트/훅에 하드코딩 금지

### Tailwind CSS
- `tailwind.config.js` 생성 금지
- 색상/토큰 추가 → `src/index.css` `@theme` 블록에만
- 긴박도 색상: `--color-urgency-safe/caution/warning/critical/overtime`
- 막대 색상: `--color-bar-editorial/ad/print/interruption`

### shadcn/ui
```
✅ components/ui/*.tsx 직접 수정 허용 (코드 복사 방식)
✅ cn() 유틸로 className 확장
❌ shadcn 외부 UI 패키지 추가 금지
```

### 에러 처리
```typescript
// Dexie 실패: toast + console
try {
  await db.pages.add(newPage)
} catch (err) {
  toast.error('저장 실패')
  console.error('[db] pages.add failed:', err)
}
// ❌ 조용한 실패 절대 금지 (catch 후 아무것도 안 함)
// ErrorBoundary: App.tsx 최상위 1개만
```

---

## Project-Specific Domain Rules

### 신문 제작 도메인
```typescript
// 5개 섹션 (DB seed에 정의됨)
// 마감: 본국지면 14:00 / 안내광고 15:00 / 경제면 16:00 / 미주면·부동산면 18:00
// 고부하일: 화(2), 수(3) — HEAVY_DAYS = [2, 3]
// 목요일 특이사항: 본국지면 10면(THU_BONKUK_PAGE_COUNT), 안내광고 16면 별도(THU_ANGUIDE_PAGE_COUNT)

// Page 상태머신 (DB 6단계)
WAITING → ACTIVE → PAUSED → RESUMED → HANDED_OFF → DONE

// PrintConfirmStep FSM (0~4)
// 0→1→2→4(DONE) 또는 2→3→2(오류재전송) 반복
// advancePrintConfirmStep()이 유효 전이 검증 포함

// 분판 확인 이력 조회: printConfirmAt 인덱스 (Dexie v3)
```

### Settings (싱글톤 id=1)
```typescript
interface Settings {
  id: 1
  theme: 'auto' | 'light' | 'dark'
  dnd: boolean
  onboardingDone: boolean
  specialDays: SpecialDayOverride[]
  otherEditionChecklist: Record<string, boolean>
  onboardingHintExpiry: Date | null
  updatedAt: Date
}
```

---

## Critical Don't-Miss Rules

### ❌ 절대 하지 말 것

```typescript
// 1. 전역 키 캡처
window.addEventListener('keydown', handler)  // ❌

// 2. 번들 상단 대용량 import
import * as XLSX from 'xlsx'  // ❌
// ✅ 동적: const XLSX = await import('xlsx')

// 3. 타이머 계산 시각 저장
const completedAt = new Date(startTime + elapsed)  // ❌
// ✅ 이벤트 직접: const completedAt = new Date()

// 4. DB 데이터 useState 복사
const [pages, setPages] = useState([])
useEffect(() => { db.pages.toArray().then(setPages) }, [])  // ❌

// 5. tailwind.config.js 생성
// ❌ 절대 금지

// 6. Dexie version(1) 수정
// ❌ 기존 버전 수정 금지, 새 version() 체인 추가만

// 7. advancePrintConfirmStep에 유효 범위 외 nextStep 전달
// FSM 전이: 0→1, 1→2, 2→3, 2→4, 3→2 만 허용
```

### ⚠️ 자주 놓치는 패턴

```typescript
// useLiveQuery deps에 외부 변수 명시 필수
useLiveQuery(() => db.pages.where('date').equals(date).toArray(), [date])
//                                                                  ^^^^ 필수

// Dexie update는 없는 row를 조용히 무시 → 존재 확인 후 분기
const existing = await db.settings.get(1)
if (existing) await db.settings.update(1, patch)
else await db.settings.put({ id: 1, ...defaults })

// CSV 내보내기는 반드시 export.ts 경유
import { rowsToCsv, downloadCsv } from '@/lib/export'  // ✅
// 컴포넌트 내 Blob 직접 생성 ❌

// 트랜잭션 내부에서 now 캡처 (커밋 시각과 일치)
await db.transaction('rw', db.pages, async () => {
  const now = new Date()  // ✅ 트랜잭션 내부
  await db.pages.update(pageId, { updatedAt: now })
})
```

### 🔧 빌드/테스트 명령
```bash
npm run dev          # 개발 서버
npm run build        # 프로덕션 빌드 (tsc -b && vite build)
npm run test         # Vitest 단일 실행
npm run test:watch   # Vitest 감시 모드
npm run test:coverage # 커버리지 리포트
npm run lint         # ESLint
```

### 📂 관련 산출물
```
_bmad-output/planning-artifacts/prd.md           PRD
_bmad-output/planning-artifacts/architecture.md  아키텍처
_bmad-output/planning-artifacts/epics.md         Epic & Stories
_bmad-output/implementation-artifacts/sprint-status.yaml  진행 상태
```

---

## Usage Guidelines

**AI 에이전트용:**
- 코드 작성 전 이 파일을 먼저 읽는다
- 모든 규칙을 문서 그대로 따른다
- 의심스러우면 더 제한적인 쪽을 선택한다
- 새 패턴이 생기면 이 파일을 업데이트한다

**Homestudio용:**
- 기술 스택 변경 시 업데이트
- 새 절대 규칙 생기면 🔴 섹션에 추가
- 명백해진 규칙은 삭제해서 lean 유지

_Last Updated: 2026-05-30_
