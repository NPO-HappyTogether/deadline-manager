/**
 * db.ts — Dexie.js 데이터베이스 스키마
 *
 * UX 명세 §Design System Foundation, §User Journey Flows 기반
 * - Dexie.js = 단일 진실 공급원 (Single Source of Truth)
 * - 타이머는 표시용만 (DB 타임스탬프가 실제 기록)
 * - Phase 2: Supabase 동기화 레이어 추가 예정 (현재 구조 유지)
 */

import Dexie, { type EntityTable } from 'dexie'
import type { DBStatus } from './urgency'

// ─── 타입 정의 ──────────────────────────────────────────────

/** 섹션 (본국지면, 안내광고, 경제면, 미주면, 부동산면 등) */
export interface Section {
  id: number
  name: string         // "본국지면", "안내광고", ...
  displayOrder: number // 상단 바 표시 순서
  deadlineHour: number   // 기본 마감 시각 (시)
  deadlineMinute: number // 기본 마감 시각 (분)
  isActive: boolean    // 현재 사용 여부
  createdAt: Date
}

/** 면/페이지 단위 업무 (작업의 기본 단위) */
export interface Page {
  id: number
  sectionId: number    // Section FK
  date: string         // "2026-05-27" (날짜별 스케줄)
  pageNumber: string   // "4면", "13면", "광고 A" 등
  pageType: 'editorial' | 'ad' | 'temp'  // 편집 / 광고 / 임시업무
  deadlineAt: Date     // 이 면의 마감 시각
  status: DBStatus
  printCount: number   // 인쇄 횟수 (Tab 누를 때마다 +1, 업무강도 지표)
  intensityScore: number | null   // 1~4 (null = 미입력 or 자동완료)
  intensityNote: string | null    // 강도 4 선택 시 메모
  autoCompleteContext: AutoCompleteContext | null
  startedAt: Date | null   // ACTIVE 최초 전환 시각
  completedAt: Date | null // DONE 전환 시각
  createdAt: Date
  updatedAt: Date
}

/** 자동 완료 시 저장되는 맥락 스냅샷 (UX 명세 §Journey 2) */
export interface AutoCompleteContext {
  concurrentActive: number    // 동시 진행 중 작업 수
  concurrentPaused: number    // 홀드된 작업 수
  minutesToDeadline: number   // 마감까지 남은 분
  interruptionsToday: number  // 당일 누적 중단 횟수
  lastKeypressGap: number     // 직전 키입력으로부터 경과 시간(초)
}

/** 인터럽션 (중단) 기록 */
export interface Interruption {
  id: number
  pageId: number       // 중단된 Page FK
  date: string         // "2026-05-27"
  startedAt: Date      // 중단 시작 (탭 누른 시각)
  endedAt: Date | null // 중단 종료 (재개 시각, null = 진행 중)
  reason: 'phone_meeting' | 'other_section' | 'purge' | 'other' | null  // nullable
  note: string | null  // 선택적 자유 텍스트
  createdAt: Date
}

/** 상태 전환 이력 (분석용) */
export interface StatusHistory {
  id: number
  pageId: number
  fromStatus: DBStatus | null
  toStatus: DBStatus
  changedAt: Date
  triggeredBy: 'user' | 'auto' | 'system'  // 전환 주체
}

/** 일일 결산 스냅샷 */
export interface DailySummary {
  id: number
  date: string         // "2026-05-27"
  snapshotJson: string // 타임라인 스냅샷 JSON
  totalInterruptions: number
  completedSections: number
  intensityDistribution: Record<1 | 2 | 3 | 4, number>  // 강도별 카운트
  savedAt: Date
  note: string | null  // 인수인계 메모
}

/** 앱 설정 */
export interface Settings {
  id: 1  // 싱글톤 — 항상 id=1
  theme: 'auto' | 'light' | 'dark'
  dnd: boolean          // 방해금지 모드
  onboardingHintExpiry: Date | null  // 힌트 소멸 시각 (첫 주 후 null)
  updatedAt: Date
}

// ─── Dexie 클래스 ─────────────────────────────────────────

export class DeadlineDB extends Dexie {
  sections!:      EntityTable<Section,      'id'>
  pages!:         EntityTable<Page,         'id'>
  interruptions!: EntityTable<Interruption, 'id'>
  statusHistory!: EntityTable<StatusHistory,'id'>
  dailySummary!:  EntityTable<DailySummary, 'id'>
  settings!:      EntityTable<Settings,     'id'>

  constructor() {
    super('DeadlineManagerDB')

    this.version(1).stores({
      // ++ = auto-increment PK
      // & = unique index
      // * = multi-value index
      // [a+b] = compound index
      sections:      '++id, displayOrder, isActive',
      pages:         '++id, sectionId, date, status, [sectionId+date], deadlineAt',
      interruptions: '++id, pageId, date, startedAt, [pageId+startedAt]',
      statusHistory: '++id, pageId, changedAt, [pageId+changedAt]',
      dailySummary:  '++id, &date',
      settings:      'id',
    })
  }
}

/** 싱글톤 DB 인스턴스 — 앱 전체에서 이 하나를 사용 */
export const db = new DeadlineDB()

// ─── 초기 데이터 / 시드 ──────────────────────────────────

/** 기본 섹션 목록 (UX 명세: 5섹션 4마감) */
const DEFAULT_SECTIONS: Omit<Section, 'id' | 'createdAt'>[] = [
  { name: '본국지면',   displayOrder: 1, deadlineHour: 14, deadlineMinute: 0, isActive: true },
  { name: '안내광고',   displayOrder: 2, deadlineHour: 15, deadlineMinute: 0, isActive: true },
  { name: '경제면',     displayOrder: 3, deadlineHour: 16, deadlineMinute: 0, isActive: true },
  { name: '미주면',     displayOrder: 4, deadlineHour: 18, deadlineMinute: 0, isActive: true },
  { name: '부동산면',   displayOrder: 5, deadlineHour: 16, deadlineMinute: 0, isActive: true },
]

/** DB 첫 실행 시 기본 설정/섹션 초기화 */
export async function initializeDB(): Promise<void> {
  // 설정 초기화
  const existing = await db.settings.get(1)
  if (!existing) {
    // put() = upsert — 중복 id여도 에러 없이 처리 (StrictMode 이중 호출 안전)
    await db.settings.put({
      id: 1,
      theme: 'auto',
      dnd: false,
      onboardingHintExpiry: new Date(Date.now() + 7 * 24 * 60 * 60_000), // +7일
      updatedAt: new Date(),
    })
  }

  // 섹션 초기화 (이미 있으면 스킵)
  const sectionCount = await db.sections.count()
  if (sectionCount === 0) {
    const now = new Date()
    await db.sections.bulkAdd(
      DEFAULT_SECTIONS.map(s => ({ ...s, createdAt: now }))
    )
  }
}

// ─── 자주 쓰는 쿼리 헬퍼 ──────────────────────────────────

/** 오늘 날짜 문자열 "YYYY-MM-DD" */
export function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 특정 날짜의 모든 페이지 (섹션 순서대로) */
export async function getPagesForDate(date: string): Promise<Page[]> {
  const pages = await db.pages.where('date').equals(date).toArray()
  // deadlineAt 오름차순 정렬
  return pages.sort((a, b) => a.deadlineAt.getTime() - b.deadlineAt.getTime())
}

/** 특정 날짜의 인터럽션 목록 */
export async function getInterruptionsForDate(date: string): Promise<Interruption[]> {
  return db.interruptions.where('date').equals(date).sortBy('startedAt')
}

/** 페이지 상태 전환 + 이력 저장 (트랜잭션) */
export async function transitionPageStatus(
  pageId: number,
  toStatus: DBStatus,
  triggeredBy: StatusHistory['triggeredBy'] = 'user'
): Promise<void> {
  await db.transaction('rw', db.pages, db.statusHistory, async () => {
    const page = await db.pages.get(pageId)
    if (!page) throw new Error(`Page ${pageId} not found`)

    const now = new Date()
    const updates: Partial<Page> = { status: toStatus, updatedAt: now }

    if (toStatus === 'ACTIVE' && !page.startedAt) {
      updates.startedAt = now
    }
    if (toStatus === 'DONE') {
      updates.completedAt = now
    }

    await db.pages.update(pageId, updates)
    await db.statusHistory.add({
      pageId,
      fromStatus: page.status,
      toStatus,
      changedAt: now,
      triggeredBy,
    })
  })
}

/** 인터럽션 시작 + 해당 페이지 PAUSED 전환 */
export async function startInterruption(
  pageId: number,
  reason: Interruption['reason'] = null,
  note: string | null = null,
  date: string = todayString()
): Promise<number> {
  const now = new Date()
  let interruptionId: number

  await db.transaction('rw', db.pages, db.interruptions, db.statusHistory, async () => {
    interruptionId = await db.interruptions.add({
      pageId,
      date,
      startedAt: now,
      endedAt: null,
      reason,
      note,
      createdAt: now,
    })
    await transitionPageStatus(pageId, 'PAUSED', 'user')
  })

  return interruptionId!
}

/** 인터럽션 종료 + 해당 페이지 RESUMED 전환 */
export async function endInterruption(
  interruptionId: number,
  pageId: number
): Promise<void> {
  const now = new Date()
  await db.transaction('rw', db.interruptions, db.pages, db.statusHistory, async () => {
    await db.interruptions.update(interruptionId, { endedAt: now })
    await transitionPageStatus(pageId, 'RESUMED', 'user')
  })
}

/** 설정 업데이트 */
export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.settings.update(1, { ...patch, updatedAt: new Date() })
}

/** 오늘 인터럽션 총 횟수 */
export async function countTodayInterruptions(date = todayString()): Promise<number> {
  return db.interruptions.where('date').equals(date).count()
}

/** 인쇄 카운트 +1 — 트랜잭션으로 race condition 방지 (빠른 연속 Tab 처리) */
export async function incrementPrintCount(pageId: number): Promise<void> {
  await db.transaction('rw', db.pages, async () => {
    const page = await db.pages.get(pageId)
    if (!page) return
    await db.pages.update(pageId, {
      printCount: (page.printCount ?? 0) + 1,
      updatedAt: new Date(),
    })
  })
}

/**
 * 태스크 전환 — Shift+Tab 스위처용
 * 오늘 ACTIVE/RESUMED 페이지 전체 → PAUSED (모든 섹션 대상)
 * 대상 PAUSED 페이지 → RESUMED
 * 반환값: 이전 상태 (undo용)
 */
export interface SwitchUndoState {
  fromPageIds: number[]   // 일시정지된 모든 페이지 ID
  toPageId: number        // 재개된 페이지 ID
}

export async function switchActiveTask(
  toPageId: number,
): Promise<SwitchUndoState> {
  let fromPageIds: number[] = []

  await db.transaction('rw', db.pages, db.statusHistory, async () => {
    // 오늘 ACTIVE/RESUMED 페이지 전체 조회 (모든 섹션)
    const today = todayString()
    const allActive = await db.pages
      .where('date')
      .equals(today)
      .filter((p) =>
        (p.status === 'ACTIVE' || p.status === 'RESUMED') && p.id !== toPageId
      )
      .toArray()

    fromPageIds = allActive.map((p) => p.id)

    for (const page of allActive) {
      await transitionPageStatus(page.id, 'PAUSED', 'user')
    }
    await transitionPageStatus(toPageId, 'RESUMED', 'user')
  })

  return { fromPageIds, toPageId }
}

/**
 * 태스크 전환 취소 (1초 이내 Esc)
 * 현재 상태를 확인 후 역전환 — 1초 사이 외부 변경이 있어도 안전
 */
export async function undoSwitchActiveTask(
  undo: SwitchUndoState,
): Promise<void> {
  await db.transaction('rw', db.pages, db.statusHistory, async () => {
    // 전환된 페이지가 아직 ACTIVE/RESUMED 상태일 때만 되돌림
    const toPage = await db.pages.get(undo.toPageId)
    if (toPage && (toPage.status === 'ACTIVE' || toPage.status === 'RESUMED')) {
      await transitionPageStatus(undo.toPageId, 'PAUSED', 'user')
    }
    // 원래 페이지들이 아직 PAUSED 상태일 때만 복구
    for (const fromId of undo.fromPageIds) {
      const fromPage = await db.pages.get(fromId)
      if (fromPage && fromPage.status === 'PAUSED') {
        await transitionPageStatus(fromId, 'RESUMED', 'user')
      }
    }
  })
}
