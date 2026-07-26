import type { MergedCellRange } from '@ultigrid/insight'
import type { Locale } from '../i18n'
import type {
  SpreadsheetCellValue,
  SpreadsheetNumberFormat,
} from './spreadsheetModel'
import { setSpreadsheetSessionDirty } from './spreadsheetSession'

export type HorizontalAlign = 'left' | 'center' | 'right'

export interface CellFormat {
  fontFamily?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  fill?: string
  align?: HorizontalAlign
  wrap?: boolean
  numberFormat?: SpreadsheetNumberFormat
}

export interface WorksheetSnapshot {
  values: Map<string, SpreadsheetCellValue>
  formats: Map<string, CellFormat>
  mergedCells: MergedCellRange[]
  /** Seed cells changed by the user are not translated when the UI locale changes. */
  editedValueKeys: Set<string>
}

export interface WorkbookHistory {
  past: WorksheetSnapshot[]
  present: WorksheetSnapshot
  future: WorksheetSnapshot[]
  revision: number
  locale: Locale
  /** The demo has no server/file save action; dirty means the workbook only lives in this tab. */
  dirty: boolean
}

export type WorkbookAction =
  | {
      type: 'commit'
      snapshot: WorksheetSnapshot
      trackValueChanges?: boolean
      markDirty?: boolean
    }
  | { type: 'undo' }
  | { type: 'redo' }

type SheetFactory = (locale: Locale) => WorksheetSnapshot

interface SerializedSnapshot {
  values: [string, SpreadsheetCellValue][]
  formats: [string, CellFormat][]
  mergedCells: MergedCellRange[]
  editedValueKeys: string[]
}

interface SerializedWorkbook {
  version: 1
  locale: Locale
  dirty: boolean
  revision: number
  past: SerializedSnapshot[]
  present: SerializedSnapshot
  future: SerializedSnapshot[]
}

const HISTORY_LIMIT = 50
const SESSION_STORAGE_KEY = 'ultigrid.spreadsheet-workbook.v1'
let memoryHistory: WorkbookHistory | null = null
let pendingPersistence: WorkbookHistory | null = null
let persistenceTimer: number | null = null

export function createWorkbookHistory(
  locale: Locale,
  createInitialSheet: SheetFactory,
): WorkbookHistory {
  return {
    past: [],
    present: createInitialSheet(locale),
    future: [],
    revision: 0,
    locale,
    dirty: false,
  }
}

export function workbookReducer(
  state: WorkbookHistory,
  action: WorkbookAction,
): WorkbookHistory {
  if (action.type === 'commit') {
    const present = action.trackValueChanges === false
      ? action.snapshot
      : trackChangedValues(state.present, action.snapshot)
    return {
      ...state,
      past: [...state.past, state.present].slice(-HISTORY_LIMIT),
      present,
      future: [],
      revision: state.revision + 1,
      dirty: action.markDirty ?? true,
    }
  }
  if (action.type === 'undo') {
    const previous = state.past.at(-1)
    if (!previous) return state
    return {
      ...state,
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
      revision: state.revision + 1,
      dirty: true,
    }
  }
  if (action.type === 'redo') {
    const next = state.future[0]
    if (!next) return state
    return {
      ...state,
      past: [...state.past, state.present].slice(-HISTORY_LIMIT),
      present: next,
      future: state.future.slice(1),
      revision: state.revision + 1,
      dirty: true,
    }
  }
  return state
}

export function localizeWorkbookHistory(
  state: WorkbookHistory,
  locale: Locale,
  createInitialSheet: SheetFactory,
): WorkbookHistory {
  if (state.locale === locale) return state
  const previousSeed = createInitialSheet(state.locale)
  const nextSeed = createInitialSheet(locale)
  const localizeSnapshot = (snapshot: WorksheetSnapshot) => {
    let values: Map<string, SpreadsheetCellValue> | null = null
    for (const [key, previousValue] of previousSeed.values) {
      if (snapshot.editedValueKeys.has(key)) continue
      if (!Object.is(snapshot.values.get(key), previousValue)) continue
      const nextValue = nextSeed.values.get(key)
      if (nextValue === undefined || Object.is(nextValue, previousValue)) continue
      values ??= new Map(snapshot.values)
      values.set(key, nextValue)
    }
    return values ? { ...snapshot, values } : snapshot
  }
  return {
    ...state,
    locale,
    past: state.past.map(localizeSnapshot),
    present: localizeSnapshot(state.present),
    future: state.future.map(localizeSnapshot),
    revision: state.revision + 1,
  }
}

export function initializeWorkbookHistory(
  locale: Locale,
  createInitialSheet: SheetFactory,
): WorkbookHistory {
  if (typeof window === 'undefined') return createWorkbookHistory(locale, createInitialSheet)
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
 * Keeps the complete history in module memory and schedules a compact
 * current-snapshot write for same-tab reload recovery. Undo/redo history is
 * intentionally not serialized to sessionStorage.
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

export function serializeWorkbookHistory(history: WorkbookHistory): string {
  const serializeSnapshot = (snapshot: WorksheetSnapshot): SerializedSnapshot => ({
    values: [...snapshot.values],
    formats: [...snapshot.formats].map(([key, format]) => [key, { ...format }]),
    mergedCells: snapshot.mergedCells.map((range) => ({ ...range })),
    editedValueKeys: [...snapshot.editedValueKeys],
  })
  const payload: SerializedWorkbook = {
    version: 1,
    locale: history.locale,
    dirty: history.dirty,
    revision: history.revision,
    past: history.past.map(serializeSnapshot),
    present: serializeSnapshot(history.present),
    future: history.future.map(serializeSnapshot),
  }
  return JSON.stringify(payload)
}

export function deserializeWorkbookHistory(serialized: string): WorkbookHistory | null {
  try {
    const payload = JSON.parse(serialized) as Partial<SerializedWorkbook>
    if (
      payload.version !== 1
      || (payload.locale !== 'zh-CN' && payload.locale !== 'en-US')
      || !isSerializedSnapshot(payload.present)
      || !Array.isArray(payload.past)
      || !Array.isArray(payload.future)
    ) return null
    const deserializeSnapshot = (snapshot: SerializedSnapshot): WorksheetSnapshot => ({
      values: new Map(snapshot.values),
      formats: new Map(snapshot.formats.map(([key, format]) => [key, { ...format }])),
      mergedCells: snapshot.mergedCells.map((range) => ({ ...range })),
      editedValueKeys: new Set(snapshot.editedValueKeys),
    })
    const past = payload.past.filter(isSerializedSnapshot).slice(-HISTORY_LIMIT)
    const future = payload.future.filter(isSerializedSnapshot).slice(0, HISTORY_LIMIT)
    return {
      past: past.map(deserializeSnapshot),
      present: deserializeSnapshot(payload.present),
      future: future.map(deserializeSnapshot),
      revision: Number.isSafeInteger(payload.revision) && (payload.revision ?? -1) >= 0
        ? payload.revision!
        : 0,
      locale: payload.locale,
      dirty: payload.dirty === true,
    }
  } catch {
    return null
  }
}

function trackChangedValues(
  previous: WorksheetSnapshot,
  next: WorksheetSnapshot,
): WorksheetSnapshot {
  if (previous.values === next.values) return next
  const editedValueKeys = new Set(next.editedValueKeys)
  const keys = new Set([...previous.values.keys(), ...next.values.keys()])
  for (const key of keys) {
    if (!Object.is(previous.values.get(key) ?? '', next.values.get(key) ?? '')) {
      editedValueKeys.add(key)
    }
  }
  return { ...next, editedValueKeys }
}

function isSerializedSnapshot(value: unknown): value is SerializedSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<SerializedSnapshot>
  if (
    !Array.isArray(snapshot.values)
    || !Array.isArray(snapshot.formats)
    || !Array.isArray(snapshot.mergedCells)
    || !Array.isArray(snapshot.editedValueKeys)
  ) return false
  return snapshot.values.every((entry) => (
    Array.isArray(entry)
    && typeof entry[0] === 'string'
    && (typeof entry[1] === 'string' || typeof entry[1] === 'number')
  )) && snapshot.formats.every((entry) => (
    Array.isArray(entry)
    && typeof entry[0] === 'string'
    && Boolean(entry[1])
    && typeof entry[1] === 'object'
  )) && snapshot.mergedCells.every(isMergedRange)
    && snapshot.editedValueKeys.every((key) => typeof key === 'string')
}

function isMergedRange(value: unknown): value is MergedCellRange {
  if (!value || typeof value !== 'object') return false
  const range = value as Partial<MergedCellRange>
  return Number.isSafeInteger(range.rowStart) && Number.isSafeInteger(range.rowEnd)
    && Number.isSafeInteger(range.columnStart) && Number.isSafeInteger(range.columnEnd)
    && range.rowStart! >= 0 && range.columnStart! >= 0
    && range.rowEnd! >= range.rowStart! && range.columnEnd! >= range.columnStart!
}

function flushPendingPersistence(): void {
  const history = pendingPersistence
  pendingPersistence = null
  if (!history || typeof window === 'undefined') return
  try {
    // Full undo/redo remains in module memory across scenario switches. Reload
    // recovery stores one compact snapshot so formatting a large range does
    // not synchronously stringify dozens of near-identical worksheets.
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
