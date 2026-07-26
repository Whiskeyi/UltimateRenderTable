import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { Locale } from '../i18n'
import {
  localizeWorkbookHistory,
  workbookReducer,
  type WorkbookAction,
  type WorkbookHistory,
  type WorksheetSnapshot,
} from './spreadsheetWorkbook'
import {
  initializeWorkbookHistory,
  persistWorkbookHistory,
} from './spreadsheetWorkbookPersistence'

interface UseWorkbookHistoryOptions {
  locale: Locale
  createInitialSheet: (locale: Locale) => WorksheetSnapshot
  resolvePendingSnapshot: (history: WorkbookHistory) => WorksheetSnapshot
  onBeforeHistoryChange?: () => void
}

export function useWorkbookHistory({
  locale,
  createInitialSheet,
  resolvePendingSnapshot,
  onBeforeHistoryChange,
}: UseWorkbookHistoryOptions) {
  const [history, setHistory] = useState<WorkbookHistory>(
    () => initializeWorkbookHistory(locale, createInitialSheet),
  )
  const historyRef = useRef(history)
  const pendingSnapshotResolverRef = useRef(resolvePendingSnapshot)
  const beforeHistoryChangeRef = useRef(onBeforeHistoryChange)
  historyRef.current = history
  pendingSnapshotResolverRef.current = resolvePendingSnapshot
  beforeHistoryChangeRef.current = onBeforeHistoryChange

  const applyHistory = useCallback((
    next: WorkbookHistory,
    options: { immediate?: boolean; render?: boolean } = {},
  ) => {
    historyRef.current = next
    persistWorkbookHistory(next, { immediate: options.immediate })
    if (options.render !== false) setHistory(next)
  }, [])

  const dispatch = useCallback((action: WorkbookAction) => {
    const current = historyRef.current
    const next = workbookReducer(current, action)
    if (next === current) return current
    beforeHistoryChangeRef.current?.()
    applyHistory(next)
    return next
  }, [applyHistory])

  useEffect(() => {
    const current = historyRef.current
    const next = localizeWorkbookHistory(current, locale, createInitialSheet)
    if (next === current) return
    beforeHistoryChangeRef.current?.()
    applyHistory(next)
  }, [applyHistory, createInitialSheet, locale])

  const flushPendingEdits = useCallback(() => {
    const current = historyRef.current
    const snapshot = pendingSnapshotResolverRef.current(current)
    const next = snapshot === current.present
      ? current
      : workbookReducer(current, { type: 'commit', snapshot })
    applyHistory(next, { immediate: true, render: false })
    return next
  }, [applyHistory])

  useEffect(() => {
    const handlePageHide = () => {
      flushPendingEdits()
    }
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setHistory(historyRef.current)
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const current = flushPendingEdits()
      if (!current.dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      flushPendingEdits()
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [flushPendingEdits])

  return {
    history,
    historyRef,
    dispatch,
  }
}
