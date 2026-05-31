/**
 * useSectionPages — 특정 날짜의 섹션별 페이지 목록 (useLiveQuery 캡슐화)
 *
 * 아키텍처 규칙 2: DB 데이터는 useLiveQuery로만, useState 복사 금지
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayString } from '@/lib/db'
import type { Page, Section } from '@/lib/db'
import { dbStatusToUI } from '@/lib/urgency'
import type { UIStatus } from '@/lib/urgency'

export interface SectionWithPages {
  section: Section
  pages: Page[]
  /** 대표 상태: 모두 완료면 done, 하나라도 active면 active, 등 */
  status: UIStatus
  /** 미완료 페이지 수 */
  pendingCount: number
  /** 완료 페이지 수 */
  doneCount: number
}

/** 섹션 대표 상태 계산 */
function calcSectionStatus(pages: Page[]): UIStatus {
  if (pages.length === 0) return 'waiting'
  const statuses = pages.map((p) => dbStatusToUI(p.status))
  if (statuses.every((s) => s === 'done')) return 'done'
  if (statuses.some((s) => s === 'active')) return 'active'
  if (statuses.some((s) => s === 'paused')) return 'paused'
  return 'waiting'
}

/**
 * 오늘 날짜의 섹션별 페이지 목록 (마감 시각 순 정렬)
 */
export function useSectionPages(date: string = todayString()): SectionWithPages[] | undefined {
  return useLiveQuery(async () => {
    // P6: date가 falsy면 빈 배열 반환 (전체 테이블 스캔 방지)
    if (!date) return []

    const [sections, pages] = await Promise.all([
      db.sections.orderBy('displayOrder').toArray(),
      db.pages.where('date').equals(date).toArray(),
    ])

    const pagesBySection = new Map<number, Page[]>()
    for (const page of pages) {
      const existing = pagesBySection.get(page.sectionId) ?? []
      existing.push(page)
      pagesBySection.set(page.sectionId, existing)
    }

    return sections
      .map((section): SectionWithPages => {
        const sectionPages = (pagesBySection.get(section.id) ?? []).sort(
          (a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime()
        )
        const statuses = sectionPages.map((p) => dbStatusToUI(p.status))
        return {
          section,
          pages: sectionPages,
          status: calcSectionStatus(sectionPages),
          pendingCount: statuses.filter((s) => s !== 'done').length,
          doneCount: statuses.filter((s) => s === 'done').length,
        }
      })
      .filter((s) => s.pages.length > 0) // 오늘 페이지 없는 섹션 제외
      .sort((a, b) => {
        // 첫 번째 페이지 마감 기준 정렬
        const aTime = a.pages[0] ? new Date(a.pages[0].deadlineAt).getTime() : 0
        const bTime = b.pages[0] ? new Date(b.pages[0].deadlineAt).getTime() : 0
        return aTime - bTime
      })
  }, [date])
}
