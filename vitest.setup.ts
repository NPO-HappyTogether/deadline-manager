/**
 * vitest.setup.ts — 테스트 환경 초기화
 *
 * - Dexie 인메모리 모킹: 실제 IndexedDB 없이 테스트 실행
 * - fake-indexeddb: 브라우저 없이 동작하는 IDB 구현
 */

import 'fake-indexeddb/auto'
