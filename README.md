# 신문 제작팀 마감 관리 시스템

> **BMad 워크플로우 실습 프로젝트**  
> PRD → UX → Architecture → Epics/Stories → Dev → Code Review 전체 사이클을 연습한 교육용 프로젝트입니다.

---

## 🔗 라이브 앱

**https://npo-happytogether.github.io/deadline-manager/**

---

## 📋 프로젝트 소개

신문 제작팀의 마감 관리를 위한 PWA 앱입니다.

> *"관리하지 않고 확인만 한다. 스트레스 없이 버튼만 누른다."*

- 오늘 담당 면들이 마감 시각 순으로 자동 표시
- 탭 하나로 완료 처리 → 실제 완료 시각 자동 기록
- 인터럽션(중단) 기록으로 업무 패턴 분석
- 백엔드 없는 순수 로컬 PWA — 어느 컴에서나 작동

---

## 🛠 기술 스택

- React 19 + Vite 8 + TypeScript
- Tailwind CSS v4
- Dexie.js (IndexedDB — 백엔드 없음)
- vite-plugin-pwa (오프라인 지원)
- Vitest (테스트)

---

## 📚 BMad 워크플로우 실습 내용

이 프로젝트는 [BMad](https://github.com/bmadcode/bmad-method) 워크플로우 전체 사이클을 실습하며 만들었습니다.

| 단계 | 산출물 |
|------|--------|
| PRD | 제품 요구사항 정의 (49개 FR) |
| UX Design | 사용자 경험 명세 |
| Architecture | 기술 결정 문서 (백엔드 제거 등) |
| Epics & Stories | 7개 Epic, 28개 Story |
| Sprint Planning | sprint-status.yaml |
| Dev | Epic 1~7 구현 |
| Code Review | 5개 버그 패치 |
| Project Context | AI 에이전트용 규칙 문서 |

**핵심 학습:** 컨셉(PRD)을 기준으로 AI 제안을 검토하고, 맞지 않으면 직접 뒤집는 것이 가장 중요한 역할.

---

## 🚀 로컬 실행

```bash
npm install
npm run dev
```

---

*Made with BMad + Claude Code*
