/* ===== state.js — 共有ミュータブル状態 ===== */

export const state = {
  allEntries: [],
  sharedCounts: {},
  sharedLastViewed: {},
  siteReaderName: '',
  siteReaderMsg: '',
  requestedCountIds: {},
  countsLoaded: false,
  viewSeenIds: null,
  viewPendingTimers: new Map(),
  deferInitialVisibleCountLoad: false,
  visibleEntryCount: 1,   // INITIAL_VISIBLE_COUNT と同値で初期化
  anchoredEntryId: null,
  newerEntryCount: 0,
  viewObserver: null,
  revealObserver: null,
  initialScrollDone: false,
  loadingCount: 0,
  modalLockCount: 0,
};
