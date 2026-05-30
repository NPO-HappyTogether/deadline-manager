/**
 * StatusBar.tsx — 풀와이드 상단 바 최상위
 *
 * UX 명세 §StatusBar 3단계 인터랙션, §Experience Mechanics 기반
 *
 * 3단계 인터랙션:
 *   Level 1: 9px 색 라인      — ambient awareness (평상시)
 *   Level 2: 44px 확장        — 호버 (SectionSegment 내부에서 처리)
 *   Level 3: ZoomInTimeline   — 클릭 → ±1시간 줌인
 *
 * 원칙:
 *   - useLiveQuery = 단일 진실 공급원 (useState로 DB 데이터 복사 금지)
 *   - setInterval = 표시용 타이머만, DB 저장은 new Date() 타임스탬프
 *   - CRITICAL pulse만 애니메이션 (SectionSegment에서 처리)
 *   - role="status" aria-live="polite" — 접근성 필수
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayString, type Page } from '@/lib/db'
import { getDisplayNow } from '@/lib/time'
import { useTheme } from '@/providers/ThemeProvider'
import { SectionSegment } from './SectionSegment'
import { ZoomInTimeline } from '@/components/Timeline/ZoomInTimeline'

// ─── Props ───────────────────────────────────────────────────

export interface StatusBarProps {
  /** 작업 등록 모달 열기 — 빈 섹션 ZoomInTimeline에서 진입점으로 전달됨 */
  onOpenSchedule?: () => void
}

// ─── 컴포넌트 ────────────────────────────────────────────────

export function StatusBar({ onOpenSchedule }: StatusBarProps = {}) {
  // ── 표시용 타이머 ─────────────────────────────────────────
  // DB 타임스탬프와 무관 — 카운트다운 UI 갱신만 담당 (CLAUDE.md §절대 원칙 3)
  const [now, setNow] = useState(() => getDisplayNow())

  useEffect(() => {
    // 30초 갱신 — 작업 등록 직후 색상 반영 지연 최소화 (Fix 6)
    const id = setInterval(() => setNow(getDisplayNow()), 30_000)
    return () => clearInterval(id)
  }, [])

  // ── 다크 모드 ─────────────────────────────────────────────
  // 모든 세그먼트에 공통 적용 — SectionSegment마다 useTheme 호출 방지
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // ── Level 3 줌인 상태 ────────────────────────────────────
  // ZoomInTimeline은 Phase 1 이후 구현 (현재 state만 준비)
  const [zoomedSectionId, setZoomedSectionId] = useState<number | null>(null)

  const handleZoomIn = useCallback((sectionId: number) => {
    setZoomedSectionId((prev) => (prev === sectionId ? null : sectionId))
  }, [])

  // useCallback으로 안정적 참조 — ZoomInTimeline keyboard useEffect deps 최적화 (Fix 8)
  const handleZoomClose = useCallback(() => setZoomedSectionId(null), [])

  // ── DB 구독 (useLiveQuery = 단일 진실 공급원) ─────────────
  const sections = useLiveQuery(
    () => db.sections.orderBy('displayOrder').filter((s) => s.isActive).toArray(),
    [], // 의존성: 섹션 목록은 거의 변경 없음 — 앱 설정 변경 시 자동 반영
  )

  const today = todayString()
  const pages = useLiveQuery(
    () => db.pages.where('date').equals(today).toArray(),
    [today], // 날짜가 바뀌면 재쿼리 (야간 연속 사용 대비)
  )

  // ── 섹션별 페이지 그룹핑 ──────────────────────────────────
  const pagesBySectionId = useMemo<Record<number, Page[]>>(() => {
    if (!pages) return {}
    return pages.reduce<Record<number, Page[]>>((acc, page) => {
      ;(acc[page.sectionId] ??= []).push(page)
      return acc
    }, {})
  }, [pages])

  // ── 로딩 중 — 골격 바 ────────────────────────────────────
  if (!sections || !pages) {
    return (
      <div
        role="status"
        aria-label="마감 현황 로딩 중"
        aria-busy="true"
        className="fixed top-0 left-0 right-0 z-50 h-[9px] bg-gray-200 dark:bg-gray-700 transition-colors"
      />
    )
  }

  // ── 렌더 ─────────────────────────────────────────────────
  return (
    <>
      {/*
       * 풀와이드 상단 바
       * - fixed top-0: 화면 최상단 고정
       * - z-50: 모든 콘텐츠 위
       * - flex: 섹션 세그먼트 수평 배치 (경계선 없음 — 색 차이가 경계)
       * - role="status" aria-live="polite": 상태 변화 스크린리더 알림
       */}
      <header
        role="status"
        aria-live="polite"
        aria-label="섹션별 마감 현황"
        className="fixed top-0 left-0 right-0 z-50 flex"
        data-testid="status-bar"
      >
        {sections.map((section) => (
          <SectionSegment
            key={section.id}
            section={section}
            pages={pagesBySectionId[section.id] ?? []}
            now={now}
            isDark={isDark}
            isZoomed={zoomedSectionId === section.id}
            onZoomIn={handleZoomIn}
          />
        ))}
      </header>

      {/* Level 3: ZoomInTimeline — 클릭한 섹션의 ±1시간 줌인 */}
      {zoomedSectionId !== null && (
        <ZoomInTimeline
          sectionId={zoomedSectionId}
          sectionName={sections.find((s) => s.id === zoomedSectionId)?.name ?? ''}
          onClose={handleZoomClose}
          onOpenSchedule={onOpenSchedule}
        />
      )}
    </>
  )
}
