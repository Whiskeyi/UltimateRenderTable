import type { Locale } from '../i18n'
import { setSpreadsheetSessionDirty } from './spreadsheetSession'
import {
  createWorkbookHistory,
  deserializeWorkbookHistory,
  localizeWorkbookHistory,
  serializeWorkbookHistory,
  type SheetFactory,
  type WorkbookHistory,
} from './spreadsheetWorkbook'

const SESSION_STORAGE_KEY = 'ultigrid.spreadsheet-workbook.v1'
let memoryHistory: WorkbookHistory | null = null
let pendingPersistence: WorkbookHistory | null = null
let persistenceTimer: number | null = null

export function initializeWorkbookHistory(
  locale: Locale,
  createInitialSheet: SheetFactory,
): WorkbookHistory {
  if (typeof window === 'undefined') {
    return createWorkbookHistory(locale, createInitialSheet)
  }
  let restored = memoryHistory
  if (!restored) {
    try {
      const serialized = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
      restored = serialized ? deserializeWorkbookHistory(serialized) : null
    } catch {
      restored = null
    }
  }
  const history = localizeWorkbookHistory(
    restored ?? createWorkbookHistory(locale, createInitialSheet),
    locale,
    createInitialSheet,
  )
  memoryHistory = history
  setSpreadsheetSessionDirty(history.dirty)
  return history
}

/**
 * Keeps complete undo/redo history in module memory while scheduling a compact
 * current-snapshot write for same-tab reload recovery.
 */
export function persistWorkbookHistory(
  history: WorkbookHistory,
  options: { immediate?: boolean } = {},
): void {
  memoryHistory = history
  setSpreadsheetSessionDirty(history.dirty)
  if (typeof window === 'undefined') return
  pendingPersistence = history
  if (options.immediate) {
    cancelScheduledPersistence()
    flushPendingPersistence()
    return
  }
  if (persistenceTimer === null) {
    persistenceTimer = window.setTimeout(() => {
      persistenceTimer = null
      flushPendingPersistence()
    }, 120)
  }
}

function flushPendingPersistence(): void {
  const history = pendingPersistence
  pendingPersistence = null
  if (!history || typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      serializeWorkbookHistory({ ...history, past: [], future: [] }),
    )
  } catch {
    // Session recovery is best-effort; module memory remains authoritative.
  }
}

function cancelScheduledPersistence(): void {
  if (persistenceTimer === null || typeof window === 'undefined') return
  window.clearTimeout(persistenceTimer)
  persistenceTimer = null
}
