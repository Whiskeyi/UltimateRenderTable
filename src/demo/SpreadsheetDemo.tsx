import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  UltiGridInsight,
  defineInsightColumn,
  type CellAddress,
  type CellRange,
  type InsightColumnDefinition,
  type InsightViewportSnapshot,
  type MergedCellRange,
  type SelectionEndpoints,
  type SelectionKind,
  type UltiGridInsightApi,
  type UltiGridInsightLocaleText,
} from '@ultigrid/insight'
import { moveTabAddress } from '@ultigrid/core'
import { translate, type Locale } from '../i18n'
import { writeTextToClipboard } from '../utils/clipboard'
import {
  getEffectiveFormat,
  resolveCellStyle,
  statusTone,
  summarizeFormats,
} from './spreadsheetFormatting'
import {
  calculateSelectionStats,
  cellKey,
  columnName,
  createSpreadsheetEvaluator,
  formatSpreadsheetValue,
  parseClipboardMatrix,
  parseSelectionLabel,
  selectionLabel,
  type FormulaName,
  type SpreadsheetCellValue,
} from './spreadsheetModel'
import {
  applyCellInput,
  applyFormatPatch,
  applyPaste,
  clearWorksheetRange,
  createCopyPayload,
  planFunctionInsertion,
  toggleMergedRange,
  type CopyPayload,
} from './spreadsheetOperations'
import {
  type CellFormat,
  type WorkbookHistory,
  type WorksheetSnapshot,
} from './spreadsheetWorkbook'
import { SpreadsheetFormulaBar } from './SpreadsheetFormulaBar'
import {
  SpreadsheetMenu,
  SpreadsheetRibbon,
  type RibbonColorMenu,
  type RibbonTab,
} from './SpreadsheetRibbon'
import { SpreadsheetStatusBar } from './SpreadsheetStatusBar'
import { useSpreadsheetSelection } from './useSpreadsheetSelection'
import { useWorkbookHistory } from './useWorkbookHistory'

interface SheetRow {
  id: number
  index: number
}

type EditorNavigation = 'stay' | 'up' | 'down' | 'left' | 'right'

interface CellEditorState extends CellAddress {
  draft: string
  selectAll: boolean
}

interface InternalClipboard extends CopyPayload {
  mode: 'copy' | 'cut'
  sourceRevision: number
}

interface HeaderSelectionSession {
  pointerId: number
  kind: 'row' | 'column'
  anchorIndex: number
  active: CellAddress
}

interface SpreadsheetDemoProps {
  locale: Locale
  apiRef: { current: UltiGridInsightApi | null }
  localeText: UltiGridInsightLocaleText
  onViewportChange: (snapshot: InsightViewportSnapshot) => void
}

const ROW_COUNT = 200
const COLUMN_COUNT = 26
const MAX_PASTE_CELLS = 10_000
const DEFAULT_SELECTION: CellRange = {
  rowStart: 2,
  rowEnd: 2,
  columnStart: 4,
  columnEnd: 4,
}
const SHEET_ROWS: readonly SheetRow[] = Array.from({ length: ROW_COUNT }, (_, index) => ({
  id: index,
  index,
}))
const BASE_COLUMN_WIDTHS = new Map<number, number>([
  [0, 118], [1, 156], [2, 118], [3, 116], [4, 116], [5, 128], [6, 102], [7, 112],
])

export function SpreadsheetDemo({
  locale,
  apiRef,
  localeText,
  onViewportChange,
}: SpreadsheetDemoProps) {
  const {
    selection,
    selectionKind,
    selectionEndpoints,
    activeCell,
    activeCellRef,
    select: commitSelection,
    setViewportSelection,
    setViewportActiveCell,
    setViewportEndpoints,
  } = useSpreadsheetSelection(DEFAULT_SELECTION)
  const [activeTab, setActiveTab] = useState<RibbonTab>('home')
  const [openColorMenu, setOpenColorMenu] = useState<RibbonColorMenu | null>(null)
  const [cutSelection, setCutSelection] = useState<CellRange | null>(null)
  const [recentTextColor, setRecentTextColor] = useState('#202124')
  const [recentFillColor, setRecentFillColor] = useState('#fff4ce')
  const [editor, setEditor] = useState<CellEditorState | null>(null)
  const [formulaDraft, setFormulaDraft] = useState('')
  const [formulaEditing, setFormulaEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState(selectionLabel(DEFAULT_SELECTION))
  const [nameEditing, setNameEditing] = useState(false)
  const [showGridLines, setShowGridLines] = useState(true)
  const [freezeTop, setFreezeTop] = useState(true)
  const [showFormulaBar, setShowFormulaBar] = useState(true)
  const [zoom, setZoom] = useState(100)
  const [feedback, setFeedback] = useState('')
  const feedbackTimerRef = useRef<number | null>(null)
  const clipboardRef = useRef<InternalClipboard | null>(null)
  const clipboardOperationRef = useRef(0)
  const ribbonRef = useRef<HTMLDivElement>(null)
  const formulaInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef(editor)
  const formulaDraftRef = useRef(formulaDraft)
  const formulaEditingRef = useRef(formulaEditing)
  const headerSelectionRef = useRef<HeaderSelectionSession | null>(null)
  formulaDraftRef.current = formulaDraft
  formulaEditingRef.current = formulaEditing

  const clearPendingCut = useCallback(() => {
    if (clipboardRef.current?.mode === 'cut') {
      clipboardRef.current = null
      setCutSelection(null)
    }
  }, [])

  const resolvePendingSnapshot = useCallback((current: WorkbookHistory) => {
    const pendingEditor = editorRef.current
    let snapshot = pendingEditor
      ? applyCellInput(current.present, pendingEditor, pendingEditor.draft)
      : current.present
    if (formulaEditingRef.current) {
      snapshot = applyCellInput(
        snapshot,
        activeCellRef.current,
        formulaDraftRef.current,
      )
    }
    return snapshot
  }, [activeCellRef])

  const { history, historyRef, dispatch } = useWorkbookHistory({
    locale,
    createInitialSheet,
    resolvePendingSnapshot,
    onBeforeHistoryChange: clearPendingCut,
  })
  const sheet = history.present

  const evaluator = useMemo(() => createSpreadsheetEvaluator(sheet.values, {
    rowCount: ROW_COUNT,
    columnCount: COLUMN_COUNT,
    maxFormulaCells: ROW_COUNT * COLUMN_COUNT,
  }), [sheet.values])
  const getRawValue = useCallback((row: number, column: number): SpreadsheetCellValue => (
    sheet.values.get(cellKey(row, column)) ?? ''
  ), [sheet.values])
  const getComputedValue = evaluator.getValue
  const activeKey = cellKey(activeCell.row, activeCell.column)
  const activeRawValue = getRawValue(activeCell.row, activeCell.column)

  useEffect(() => {
    if (!formulaEditing) setFormulaDraft(String(activeRawValue))
  }, [activeKey, activeRawValue, formulaEditing, history.revision])

  useEffect(() => {
    if (!nameEditing) setNameDraft(selectionLabel(selection))
  }, [nameEditing, selection])

  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current)
  }, [])

  useEffect(() => {
    const finishHeaderSelection = (event: PointerEvent) => {
      if (headerSelectionRef.current?.pointerId === event.pointerId) headerSelectionRef.current = null
    }
    window.addEventListener('pointerup', finishHeaderSelection)
    window.addEventListener('pointercancel', finishHeaderSelection)
    return () => {
      window.removeEventListener('pointerup', finishHeaderSelection)
      window.removeEventListener('pointercancel', finishHeaderSelection)
    }
  }, [])

  const notify = useCallback((message: string) => {
    setFeedback(message)
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback('')
      feedbackTimerRef.current = null
    }, 2_200)
  }, [])

  useEffect(() => {
    if (!cutSelection) return
    const handlePendingCutEscape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape'
        || event.defaultPrevented
        || openColorMenu !== null
        || formulaEditingRef.current
        || editorRef.current
      ) return
      event.preventDefault()
      clipboardRef.current = null
      setCutSelection(null)
      notify(translate(locale, 'spreadsheet.feedback.cutCancelled'))
    }
    document.addEventListener('keydown', handlePendingCutEscape)
    return () => document.removeEventListener('keydown', handlePendingCutEscape)
  }, [cutSelection, locale, notify, openColorMenu])

  const restoreGridFocus = useCallback(() => {
    window.requestAnimationFrame(() => apiRef.current?.focus())
  }, [apiRef])

  const selectRange = useCallback((
    next: CellRange,
    active?: CellAddress,
    scroll = true,
    kind: SelectionKind = 'cell',
    endpoints?: SelectionEndpoints,
  ) => {
    const nextActive = active ?? { row: next.rowStart, column: next.columnStart }
    editorRef.current = null
    commitSelection(next, nextActive, kind, endpoints)
    setEditor(null)
    if (scroll) apiRef.current?.scrollToCell(nextActive, 'auto')
  }, [apiRef, commitSelection])

  const commitSnapshot = useCallback((snapshot: WorksheetSnapshot) => {
    dispatch({ type: 'commit', snapshot })
  }, [dispatch])

  const applyFormat = useCallback((
    patch: Partial<CellFormat>,
    restoreFocus = true,
  ) => {
    if (!selection) return
    const snapshot = applyFormatPatch(sheet, selection, patch)
    if (snapshot !== sheet) {
      commitSnapshot(snapshot)
      notify(translate(locale, 'spreadsheet.feedback.formatted'))
    }
    if (restoreFocus) restoreGridFocus()
  }, [commitSnapshot, locale, notify, restoreGridFocus, selection, sheet])

  const clearFormats = useCallback(() => {
    if (!selection) return
    const snapshot = clearWorksheetRange(sheet, selection, 'formats')
    if (snapshot !== sheet) {
      commitSnapshot(snapshot)
      notify(translate(locale, 'spreadsheet.feedback.formatCleared'))
    }
    restoreGridFocus()
  }, [commitSnapshot, locale, notify, restoreGridFocus, selection, sheet])

  const clearContents = useCallback((clearFormatting = false) => {
    if (!selection) return
    const snapshot = clearWorksheetRange(
      sheet,
      selection,
      clearFormatting ? 'all' : 'contents',
    )
    if (snapshot !== sheet) {
      commitSnapshot(snapshot)
      notify(translate(locale, 'spreadsheet.feedback.cleared'))
    }
    restoreGridFocus()
  }, [commitSnapshot, locale, notify, restoreGridFocus, selection, sheet])

  const commitCellInput = useCallback((address: CellAddress, draft: string) => {
    const currentSheet = historyRef.current.present
    const snapshot = applyCellInput(currentSheet, address, draft)
    if (snapshot !== currentSheet) commitSnapshot(snapshot)
  }, [commitSnapshot, historyRef])

  const moveAfterEdit = useCallback((address: CellAddress, direction: EditorNavigation) => {
    if (direction === 'stay') return
    const next = moveSpreadsheetAddress(address, direction, sheet.mergedCells)
    selectRange(singleCellRange(next), next)
    restoreGridFocus()
  }, [restoreGridFocus, selectRange, sheet.mergedCells])

  const finishCellEditor = useCallback((draft: string, navigation: EditorNavigation) => {
    if (!editor) return
    const address = { row: editor.row, column: editor.column }
    editorRef.current = null
    commitCellInput(address, draft)
    setEditor(null)
    moveAfterEdit(address, navigation)
  }, [commitCellInput, editor, moveAfterEdit])

  const startEditing = useCallback((
    address: CellAddress,
    draft?: string,
    selectAll = false,
  ) => {
    const merge = sheet.mergedCells.find((item) => rangeContainsAddress(item, address))
    const target = merge
      ? { row: merge.rowStart, column: merge.columnStart }
      : address
    selectRange(merge ?? singleCellRange(target), target)
    const nextEditor = {
      ...target,
      draft: draft ?? String(getRawValue(target.row, target.column)),
      selectAll,
    }
    editorRef.current = nextEditor
    setEditor(nextEditor)
  }, [getRawValue, selectRange, sheet.mergedCells])

  const commitFormulaBar = useCallback((navigation: EditorNavigation = 'stay') => {
    commitCellInput(activeCell, formulaDraft)
    setFormulaEditing(false)
    moveAfterEdit(activeCell, navigation)
  }, [activeCell, commitCellInput, formulaDraft, moveAfterEdit])

  const commitPendingFormulaDraft = useCallback(() => {
    if (!formulaEditingRef.current) return
    commitCellInput(activeCellRef.current, formulaDraftRef.current)
    setFormulaEditing(false)
  }, [activeCellRef, commitCellInput])

  const finishEditingBeforeHeaderSelection = useCallback(() => {
    const pendingEditor = editorRef.current
    if (pendingEditor) {
      editorRef.current = null
      commitCellInput(pendingEditor, pendingEditor.draft)
      setEditor(null)
    }
    if (formulaEditing) commitFormulaBar()
  }, [commitCellInput, commitFormulaBar, formulaEditing])

  const cancelFormulaBar = useCallback(() => {
    setFormulaDraft(String(getRawValue(activeCell.row, activeCell.column)))
    setFormulaEditing(false)
    restoreGridFocus()
  }, [activeCell, getRawValue, restoreGridFocus])

  const handleSelectionChange = useCallback((
    next: CellRange | null,
    kind: SelectionKind,
  ) => {
    const pendingEditor = editorRef.current
    if (pendingEditor) {
      editorRef.current = null
      commitCellInput(pendingEditor, pendingEditor.draft)
    }
    setViewportSelection(next, kind)
    setEditor(null)
  }, [commitCellInput, setViewportSelection])

  const handleActiveCellChange = useCallback((next: CellAddress | null) => {
    setViewportActiveCell(next)
  }, [setViewportActiveCell])

  const handleSelectionEndpointsChange = useCallback((next: SelectionEndpoints | null) => {
    setViewportEndpoints(next)
  }, [setViewportEndpoints])

  const commitNameBox = useCallback((focusGrid = false) => {
    const next = parseSelectionLabel(nameDraft, ROW_COUNT, COLUMN_COUNT)
    setNameEditing(false)
    if (!next) {
      setNameDraft(selectionLabel(singleCellRange(activeCellRef.current)))
      notify(translate(locale, 'spreadsheet.feedback.invalidAddress'))
      return
    }
    selectRange(next)
    if (focusGrid) restoreGridFocus()
  }, [activeCellRef, locale, nameDraft, notify, restoreGridFocus, selectRange])

  const copySelection = useCallback(async (cut = false) => {
    if (!selection) return
    const operationId = clipboardOperationRef.current + 1
    clipboardOperationRef.current = operationId
    const sourceSelection = { ...selection }
    const pendingEditor = editorRef.current
    let currentSheet = pendingEditor
      ? applyCellInput(historyRef.current.present, pendingEditor, pendingEditor.draft)
      : historyRef.current.present
    if (currentSheet !== historyRef.current.present) {
      editorRef.current = null
      setEditor(null)
      commitSnapshot(currentSheet)
      currentSheet = historyRef.current.present
    }
    const sourceRevision = historyRef.current.revision
    const payload = createCopyPayload(currentSheet, sourceSelection, locale, {
      rowCount: ROW_COUNT,
      columnCount: COLUMN_COUNT,
    })
    const internalClipboard: InternalClipboard = {
      ...payload,
      mode: 'copy',
      sourceRevision,
    }
    if (cut) {
      clipboardRef.current = null
      setCutSelection(null)
    } else {
      clipboardRef.current = internalClipboard
      setCutSelection(null)
    }
    let systemClipboardWritten = false
    try {
      await writeTextToClipboard(payload.text)
      systemClipboardWritten = true
    } catch {
      // The internal clipboard still makes toolbar paste deterministic.
    }
    if (clipboardOperationRef.current !== operationId) return
    if (cut) {
      if (!systemClipboardWritten) {
        notify(translate(locale, 'spreadsheet.feedback.cutClipboardFailed'))
        restoreGridFocus()
        return
      }
      if (
        historyRef.current.revision !== sourceRevision
        || historyRef.current.present !== currentSheet
      ) {
        notify(translate(locale, 'spreadsheet.feedback.cutChanged'))
        restoreGridFocus()
        return
      }
      clipboardRef.current = { ...internalClipboard, mode: 'cut' }
      setCutSelection(sourceSelection)
    }
    notify(translate(locale, cut
      ? 'spreadsheet.feedback.cut'
      : systemClipboardWritten
        ? 'spreadsheet.feedback.copied'
        : 'spreadsheet.feedback.copiedInternal'))
    restoreGridFocus()
  }, [commitSnapshot, historyRef, locale, notify, restoreGridFocus, selection])

  const pasteMatrix = useCallback((
    matrix: SpreadsheetCellValue[][],
    sourceFormats?: (CellFormat | undefined)[][],
    target: CellAddress = activeCellRef.current,
    source?: CellAddress,
    cutClipboard?: InternalClipboard,
  ) => {
    const pendingEditor = editorRef.current
    const currentSheet = pendingEditor
      ? applyCellInput(historyRef.current.present, pendingEditor, pendingEditor.draft)
      : historyRef.current.present
    if (
      cutClipboard
      && (
        historyRef.current.revision !== cutClipboard.sourceRevision
        || currentSheet !== historyRef.current.present
      )
    ) {
      clipboardRef.current = null
      setCutSelection(null)
      notify(translate(locale, 'spreadsheet.feedback.cutChanged'))
      restoreGridFocus()
      return
    }
    const result = applyPaste(currentSheet, {
      values: matrix,
      formats: sourceFormats,
      target,
      copySource: source,
      cutSourceRange: cutClipboard?.sourceRange,
      bounds: { rowCount: ROW_COUNT, columnCount: COLUMN_COUNT },
      maxCells: MAX_PASTE_CELLS,
    })
    if (!result.ok) {
      if (result.reason === 'empty') return
      notify(translate(
        locale,
        result.reason === 'too-large'
          ? 'spreadsheet.feedback.pasteTooLarge'
          : result.reason === 'out-of-bounds'
            ? 'spreadsheet.feedback.pasteOutOfBounds'
            : 'spreadsheet.feedback.mergeConflict',
        result.reason === 'out-of-bounds'
          ? {
              rows: result.rows,
              columns: result.columns,
              address: selectionLabel(singleCellRange(target)),
            }
          : undefined,
      ))
      return
    }
    editorRef.current = null
    setEditor(null)
    if (cutClipboard) {
      clipboardRef.current = null
      setCutSelection(null)
    }
    commitSnapshot(result.snapshot)
    selectRange(result.targetRange)
    notify(translate(locale, 'spreadsheet.feedback.pastedCount', { count: result.cellCount }))
    restoreGridFocus()
  }, [
    activeCellRef,
    commitSnapshot,
    historyRef,
    locale,
    notify,
    restoreGridFocus,
    selectRange,
  ])

  const pasteText = useCallback((text: string, target: CellAddress = activeCellRef.current) => {
    const internal = clipboardRef.current
    if (internal && internal.text === text) {
      pasteMatrix(
        internal.values,
        internal.formats,
        target,
        internal.mode === 'copy' ? internal.source : undefined,
        internal.mode === 'cut' ? internal : undefined,
      )
    }
    else pasteMatrix(parseClipboardMatrix(text), undefined, target)
  }, [activeCellRef, pasteMatrix])

  const pasteFromToolbar = useCallback(async () => {
    const target = { ...activeCellRef.current }
    let text: string | undefined
    if (navigator.clipboard?.readText) {
      try {
        text = await navigator.clipboard.readText()
      } catch {
        // Fall back to the workbook's structured clipboard when browser access is denied.
      }
    }
    if (text === undefined) text = clipboardRef.current?.text
    if (!text) {
      notify(translate(locale, 'spreadsheet.feedback.clipboardEmpty'))
      return
    }
    pasteText(text, target)
  }, [activeCellRef, locale, notify, pasteText])

  const toggleMerge = useCallback(() => {
    if (!selection) return
    let result = toggleMergedRange(sheet, selection)
    if (result.status === 'confirmation-required') {
      if (!window.confirm(translate(locale, 'spreadsheet.confirm.merge', {
        count: result.discardedValues,
      }))) {
        restoreGridFocus()
        return
      }
      result = toggleMergedRange(sheet, selection, { allowDiscard: true })
    }
    if (result.status === 'rejected') {
      notify(translate(
        locale,
        result.reason === 'single-cell'
          ? 'spreadsheet.feedback.mergeRange'
          : 'spreadsheet.feedback.mergeConflict',
      ))
      return
    }
    if (result.status !== 'changed') return
    commitSnapshot(result.snapshot)
    if (result.nextSelection && result.nextActiveCell) {
      selectRange(result.nextSelection, result.nextActiveCell)
    }
    notify(translate(
      locale,
      result.mode === 'merged'
        ? 'spreadsheet.feedback.merged'
        : 'spreadsheet.feedback.unmerged',
    ))
    restoreGridFocus()
  }, [commitSnapshot, locale, notify, restoreGridFocus, selectRange, selection, sheet])

  const insertFunction = useCallback((functionName: FormulaName) => {
    commitPendingFormulaDraft()
    const plan = planFunctionInsertion(
      historyRef.current.present,
      selection,
      activeCell,
      functionName,
      { rowCount: ROW_COUNT, columnCount: COLUMN_COUNT },
    )
    selectRange(singleCellRange(plan.target), plan.target)
    setFormulaDraft(plan.formula)
    setFormulaEditing(true)
    setShowFormulaBar(true)
    notify(translate(locale, 'spreadsheet.feedback.formulaInserted'))
    window.requestAnimationFrame(() => {
      const input = formulaInputRef.current
      input?.focus()
      input?.setSelectionRange(plan.formula.length - 1, plan.formula.length - 1)
    })
  }, [
    activeCell,
    commitPendingFormulaDraft,
    historyRef,
    locale,
    notify,
    selectRange,
    selection,
  ])

  const beginFormulaEntry = useCallback(() => {
    commitPendingFormulaDraft()
    const rawValue = String(
      historyRef.current.present.values.get(cellKey(activeCell.row, activeCell.column)) ?? '',
    )
    const draft = rawValue.startsWith('=') ? rawValue : '='
    setShowFormulaBar(true)
    setFormulaDraft(draft)
    setFormulaEditing(true)
    window.requestAnimationFrame(() => {
      const input = formulaInputRef.current
      input?.focus()
      input?.setSelectionRange(draft.length, draft.length)
    })
  }, [activeCell, commitPendingFormulaDraft, historyRef])

  const resetSheet = useCallback(() => {
    if (
      history.dirty
      && !window.confirm(translate(locale, 'spreadsheet.confirm.reset'))
    ) {
      restoreGridFocus()
      return
    }
    const snapshot = createInitialSheet(locale)
    editorRef.current = null
    setEditor(null)
    setFormulaEditing(false)
    setFormulaDraft(String(snapshot.values.get(cellKey(DEFAULT_SELECTION.rowStart, DEFAULT_SELECTION.columnStart)) ?? ''))
    dispatch({
      type: 'commit',
      snapshot,
      trackValueChanges: false,
      markDirty: true,
    })
    selectRange(DEFAULT_SELECTION)
    notify(translate(locale, 'spreadsheet.feedback.reset'))
    restoreGridFocus()
  }, [dispatch, history.dirty, locale, notify, restoreGridFocus, selectRange])

  const undo = useCallback(() => {
    const previous = historyRef.current.past.at(-1)
    if (!previous) return
    dispatch({ type: 'undo' })
    editorRef.current = null
    setEditor(null)
    notify(translate(locale, 'spreadsheet.feedback.undo'))
    restoreGridFocus()
  }, [dispatch, historyRef, locale, notify, restoreGridFocus])

  const redo = useCallback(() => {
    const next = historyRef.current.future[0]
    if (!next) return
    dispatch({ type: 'redo' })
    editorRef.current = null
    setEditor(null)
    notify(translate(locale, 'spreadsheet.feedback.redo'))
    restoreGridFocus()
  }, [dispatch, historyRef, locale, notify, restoreGridFocus])

  const applyHeaderSelection = useCallback((
    kind: HeaderSelectionSession['kind'],
    anchorIndex: number,
    focusIndex: number,
    active: CellAddress,
  ) => {
    const start = Math.min(anchorIndex, focusIndex)
    const end = Math.max(anchorIndex, focusIndex)
    const next = kind === 'row'
      ? { rowStart: start, rowEnd: end, columnStart: 0, columnEnd: COLUMN_COUNT - 1 }
      : { rowStart: 0, rowEnd: ROW_COUNT - 1, columnStart: start, columnEnd: end }
    const endpoints = kind === 'row'
      ? {
          anchor: { row: anchorIndex, column: active.column },
          focus: { row: focusIndex, column: active.column },
        }
      : {
          anchor: { row: active.row, column: anchorIndex },
          focus: { row: active.row, column: focusIndex },
        }
    selectRange(next, active, false, kind, endpoints)
  }, [selectRange])

  const handleGridPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (isFormControl(event.target) || isColumnResizeHandle(event.target)) return
    const viewportAddress = getViewportCellAddressFromTarget(event.target)
    if (viewportAddress?.row === 0 || viewportAddress?.column === 0) {
      event.preventDefault()
      event.stopPropagation()
      finishEditingBeforeHeaderSelection()
      if (viewportAddress.row === 0 && viewportAddress.column === 0) {
        headerSelectionRef.current = null
        selectRange({
          rowStart: 0,
          rowEnd: ROW_COUNT - 1,
          columnStart: 0,
          columnEnd: COLUMN_COUNT - 1,
        }, { row: 0, column: 0 }, false, 'sheet')
        restoreGridFocus()
        return
      }
      const kind = viewportAddress.row === 0 ? 'column' : 'row'
      const index = kind === 'column' ? viewportAddress.column - 1 : viewportAddress.row - 1
      const anchorIndex = event.shiftKey
        ? (kind === 'column' ? activeCellRef.current.column : activeCellRef.current.row)
        : index
      const active = event.shiftKey
        ? { ...activeCellRef.current }
        : resolveHeaderSelectionActive(kind, index, activeCellRef.current, sheet.mergedCells)
      headerSelectionRef.current = { pointerId: event.pointerId, kind, anchorIndex, active }
      applyHeaderSelection(kind, anchorIndex, index, active)
      restoreGridFocus()
      return
    }
  }, [
    applyHeaderSelection,
    activeCellRef,
    finishEditingBeforeHeaderSelection,
    restoreGridFocus,
    selectRange,
    sheet.mergedCells,
  ])

  const handleGridPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = headerSelectionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    const viewportAddress = getViewportCellAddressFromTarget(event.target)
    const focusIndex = session.kind === 'column'
      ? viewportAddress?.row === 0 ? viewportAddress.column - 1 : null
      : viewportAddress?.column === 0 ? viewportAddress.row - 1 : null
    if (focusIndex === null || focusIndex < 0) return
    event.preventDefault()
    applyHeaderSelection(session.kind, session.anchorIndex, focusIndex, session.active)
  }, [applyHeaderSelection])

  const handleGridDoubleClick = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (isFormControl(event.target)) return
    const address = getCellAddressFromTarget(event.target)
    if (!address) return
    event.preventDefault()
    startEditing(address)
  }, [startEditing])

  const handleGridPaste = useCallback((event: ReactClipboardEvent<HTMLDivElement>) => {
    if (isFormControl(event.target)) return
    const text = event.clipboardData.getData('text/plain')
    const target = { ...activeCellRef.current }
    event.preventDefault()
    pasteText(text, target)
  }, [activeCellRef, pasteText])

  const handleGridKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isFormControl(event.target) || event.nativeEvent.isComposing) return
    const key = event.key.toLowerCase()
    const command = event.metaKey || event.ctrlKey
    if (event.key === 'Escape' && clipboardRef.current?.mode === 'cut') {
      event.preventDefault()
      clipboardRef.current = null
      setCutSelection(null)
      notify(translate(locale, 'spreadsheet.feedback.cutCancelled'))
      return
    }
    if (command && key === 'a') {
      event.preventDefault()
      const usedRange = getUsedRange(sheet)
      const wholeSheet = {
        rowStart: 0,
        rowEnd: ROW_COUNT - 1,
        columnStart: 0,
        columnEnd: COLUMN_COUNT - 1,
      }
      const next = selection && rangesEqual(selection, usedRange) ? wholeSheet : usedRange
      selectRange(
        next,
        rangeContainsAddress(next, activeCell) ? activeCell : undefined,
        true,
        rangesEqual(next, wholeSheet) ? 'sheet' : 'cell',
      )
      return
    }
    if (event.key === ' ' && command && event.shiftKey) {
      event.preventDefault()
      selectRange({
        rowStart: 0,
        rowEnd: ROW_COUNT - 1,
        columnStart: 0,
        columnEnd: COLUMN_COUNT - 1,
      }, activeCell, true, 'sheet')
      return
    }
    if (event.key === ' ' && command) {
      event.preventDefault()
      selectRange({
        rowStart: 0,
        rowEnd: ROW_COUNT - 1,
        columnStart: activeCell.column,
        columnEnd: activeCell.column,
      }, activeCell, true, 'column')
      return
    }
    if (event.key === ' ' && event.shiftKey && !event.altKey) {
      event.preventDefault()
      selectRange({
        rowStart: activeCell.row,
        rowEnd: activeCell.row,
        columnStart: 0,
        columnEnd: COLUMN_COUNT - 1,
      }, activeCell, true, 'row')
      return
    }
    if (command && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
      return
    }
    if (command && key === 'y') {
      event.preventDefault()
      redo()
      return
    }
    if (command && key === 'c') {
      event.preventDefault()
      void copySelection(false)
      return
    }
    if (command && key === 'x') {
      event.preventDefault()
      void copySelection(true)
      return
    }
    if (command && key === 'b') {
      event.preventDefault()
      const summary = summarizeFormats(selection ?? DEFAULT_SELECTION, activeCell, sheet.formats)
      applyFormat({ bold: summary.mixed.has('bold') || !summary.format.bold })
      return
    }
    if (command && key === 'i') {
      event.preventDefault()
      const summary = summarizeFormats(selection ?? DEFAULT_SELECTION, activeCell, sheet.formats)
      applyFormat({ italic: summary.mixed.has('italic') || !summary.format.italic })
      return
    }
    if (command && key === 'u') {
      event.preventDefault()
      const summary = summarizeFormats(selection ?? DEFAULT_SELECTION, activeCell, sheet.formats)
      applyFormat({ underline: summary.mixed.has('underline') || !summary.format.underline })
      return
    }
    if (event.key === 'F2') {
      event.preventDefault()
      startEditing(activeCell)
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      clearContents()
      return
    }
    if (!command && !event.altKey && event.key.length === 1) {
      event.preventDefault()
      startEditing(activeCell, event.key)
    }
  }, [
    activeCell,
    applyFormat,
    clearContents,
    copySelection,
    locale,
    notify,
    redo,
    selectRange,
    selection,
    sheet,
    startEditing,
    undo,
  ])

  const activateRibbonTab = useCallback((tab: RibbonTab) => {
    setOpenColorMenu(null)
    setActiveTab(tab)
    window.requestAnimationFrame(() => {
      if (ribbonRef.current) ribbonRef.current.scrollLeft = 0
    })
  }, [])

  const handleRibbonTabKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>, tab: RibbonTab) => {
    const tabs: readonly RibbonTab[] = ['home', 'formulas', 'view']
    let nextIndex = tabs.indexOf(tab)
    if (event.key === 'ArrowRight') nextIndex = (nextIndex + 1) % tabs.length
    else if (event.key === 'ArrowLeft') nextIndex = (nextIndex - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabs.length - 1
    else return
    event.preventDefault()
    const nextTab = tabs[nextIndex]!
    activateRibbonTab(nextTab)
    window.requestAnimationFrame(() => document.getElementById(`spreadsheet-tab-${nextTab}`)?.focus())
  }, [activateRibbonTab])

  const handleRibbonToolbarKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== 'ArrowRight'
      && event.key !== 'ArrowLeft'
      && event.key !== 'Home'
      && event.key !== 'End'
    ) return
    if (!(event.target instanceof HTMLButtonElement)) return
    if (event.target.closest('.spreadsheet-color-palette')) return
    const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(
      'button:not(:disabled)',
    )].filter((control) => control.offsetParent !== null)
    const currentIndex = controls.indexOf(event.target)
    if (currentIndex < 0 || controls.length === 0) return
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? controls.length - 1
        : event.key === 'ArrowRight'
          ? (currentIndex + 1) % controls.length
          : (currentIndex - 1 + controls.length) % controls.length
    event.preventDefault()
    controls[nextIndex]?.focus()
  }, [])

  const formatSummary = useMemo(
    () => summarizeFormats(selection ?? DEFAULT_SELECTION, activeCell, sheet.formats),
    [activeCell, selection, sheet.formats],
  )
  const activeFormat = formatSummary.format
  const mixed = formatSummary.mixed
  const selectionStats = useMemo(
    () => calculateSelectionStats(selection, getComputedValue),
    [getComputedValue, selection],
  )
  const mergedSelection = Boolean(selection
    && sheet.mergedCells.some((merge) => rangesEqual(merge, selection)))
  const scale = zoom / 100
  const columnWidths = useMemo(() => new Map(
    [...BASE_COLUMN_WIDTHS].map(([column, width]) => [column, Math.round(width * scale)]),
  ), [scale])
  const rowHeights = useMemo(() => new Map<number, number>([
    [0, Math.round(46 * scale)],
    [1, Math.round(32 * scale)],
    [14, Math.round(34 * scale)],
    [16, Math.round(38 * scale)],
  ]), [scale])

  const columns = useMemo<readonly InsightColumnDefinition<SheetRow>[]>(() => (
    Array.from({ length: COLUMN_COUNT }, (_, columnIndex) => defineInsightColumn<SheetRow, SpreadsheetCellValue>({
      id: `column-${columnIndex}`,
      header: (
        <span
          className="spreadsheet-column-label"
          style={{ fontSize: Math.round(10 * scale) }}
        >
          {columnName(columnIndex)}
        </span>
      ),
      headerText: columnName(columnIndex),
      width: columnWidths.get(columnIndex) ?? Math.round(96 * scale),
      minWidth: 54,
      getValue: (row) => getComputedValue(row.index, columnIndex),
      formatValue: (value, row) => {
        const format = getEffectiveFormat(row.index, columnIndex, sheet.formats.get(cellKey(row.index, columnIndex)))
        return formatSpreadsheetValue(value, format.numberFormat, locale)
      },
      visualStyle: ({ row }) => resolveCellStyle(
        row.index,
        columnIndex,
        getComputedValue(row.index, columnIndex),
        getEffectiveFormat(row.index, columnIndex, sheet.formats.get(cellKey(row.index, columnIndex))),
        scale,
      ),
      renderContent: ({ row, displayValue, value }) => {
        const rowIndex = row.index
        const raw = getRawValue(rowIndex, columnIndex)
        if (editor?.row === rowIndex && editor.column === columnIndex) {
          return (
            <CellEditor
              key={`${rowIndex}:${columnIndex}`}
              initialValue={editorRef.current?.draft ?? editor.draft}
              selectAll={editor.selectAll}
              label={translate(locale, 'spreadsheet.cellEditor')}
              onDraftChange={(draft) => {
                const current = editorRef.current
                if (current) editorRef.current = { ...current, draft }
              }}
              onFinish={finishCellEditor}
              onCancel={() => {
                editorRef.current = null
                setEditor(null)
                restoreGridFocus()
              }}
            />
          )
        }
        if (rowIndex === 0 && columnIndex === 0) {
          return (
            <span className="spreadsheet-title-cell">
              <strong>{displayValue}</strong>
              <small>{translate(locale, 'spreadsheet.sheet.subtitle')}</small>
            </span>
          )
        }
        if (rowIndex >= 2 && rowIndex <= 13 && columnIndex === 5 && typeof value === 'number') {
          return (
            <span className="spreadsheet-progress-cell">
              <span><i style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} /></span>
              <strong>{displayValue}</strong>
            </span>
          )
        }
        if (rowIndex >= 2 && rowIndex <= 13 && columnIndex === 7) {
          return <span className={`spreadsheet-status spreadsheet-status--${statusTone(String(value))}`}>{displayValue}</span>
        }
        if (typeof value === 'string' && value.startsWith('#')) {
          return <span className="spreadsheet-error-value" style={{ fontSize: 'inherit' }}>{displayValue}</span>
        }
        if (typeof raw === 'string' && raw.startsWith('=')) {
          return <span className="spreadsheet-formula-value" style={{ fontSize: 'inherit' }}>{displayValue}</span>
        }
        return displayValue
      },
    }))
  ), [columnWidths, editor, finishCellEditor, getComputedValue, getRawValue, locale, restoreGridFocus, scale, sheet.formats])

  const sheetSummary = selectionStats.numericCount > 0
    ? translate(locale, 'spreadsheet.status.summary', {
      count: selectionStats.count,
      average: Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(selectionStats.average ?? 0),
      sum: Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(selectionStats.sum),
    })
    : translate(locale, 'spreadsheet.status.count', { count: selectionStats.count })

  return (
    <section
      className={`spreadsheet-demo ${showFormulaBar ? '' : 'is-formula-hidden'}`}
      aria-label={translate(locale, 'scenario.spreadsheet')}
    >
      <SpreadsheetMenu
        locale={locale}
        activeTab={activeTab}
        feedback={feedback}
        dirty={history.dirty}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={undo}
        onRedo={redo}
        onActivateTab={activateRibbonTab}
        onTabKeyDown={handleRibbonTabKeyDown}
      />

      <SpreadsheetRibbon
        locale={locale}
        activeTab={activeTab}
        ribbonRef={ribbonRef}
        activeFormat={activeFormat}
        mixed={mixed}
        openColorMenu={openColorMenu}
        recentTextColor={recentTextColor}
        recentFillColor={recentFillColor}
        mergedSelection={mergedSelection}
        showGridLines={showGridLines}
        freezeTop={freezeTop}
        showFormulaBar={showFormulaBar}
        zoom={zoom}
        onToolbarKeyDown={handleRibbonToolbarKeyDown}
        onPaste={pasteFromToolbar}
        onCopy={copySelection}
        onApplyFormat={applyFormat}
        onOpenColorMenuChange={setOpenColorMenu}
        onTextColorChange={(color) => {
          setRecentTextColor(color)
          applyFormat({ color })
        }}
        onFillColorChange={(fill) => {
          setRecentFillColor(fill)
          applyFormat({ fill })
        }}
        onToggleMerge={toggleMerge}
        onClearFormats={clearFormats}
        onReset={resetSheet}
        onInsertFunction={insertFunction}
        onToggleGridLines={() => {
          setShowGridLines((current) => !current)
          restoreGridFocus()
        }}
        onToggleFreezeTop={() => {
          setFreezeTop((current) => !current)
          restoreGridFocus()
        }}
        onToggleFormulaBar={() => {
          setShowFormulaBar((current) => !current)
          restoreGridFocus()
        }}
        onZoomChange={setZoom}
      />

      {showFormulaBar ? (
        <SpreadsheetFormulaBar
          locale={locale}
          selection={selection}
          nameDraft={nameDraft}
          formulaDraft={formulaDraft}
          formulaEditing={formulaEditing}
          inputRef={formulaInputRef}
          onNameEditingChange={setNameEditing}
          onNameDraftChange={setNameDraft}
          onCommitNameBox={commitNameBox}
          onRestoreGridFocus={restoreGridFocus}
          onBeginFormulaEntry={beginFormulaEntry}
          onCancel={cancelFormulaBar}
          onCommit={commitFormulaBar}
          onFormulaEditingChange={setFormulaEditing}
          onFormulaDraftChange={setFormulaDraft}
        />
      ) : null}

      <div
        className="spreadsheet-grid"
        style={{ fontSize: Math.round(10 * scale) }}
        onPointerDownCapture={handleGridPointerDown}
        onPointerMoveCapture={handleGridPointerMove}
        onDoubleClick={handleGridDoubleClick}
        onPasteCapture={handleGridPaste}
        onKeyDownCapture={handleGridKeyDown}
      >
        <UltiGridInsight
          rows={SHEET_ROWS}
          columns={columns}
          mergedCells={sheet.mergedCells}
          rowHeights={rowHeights}
          columnWidths={columnWidths}
          defaultRowHeight={Math.round(30 * scale)}
          defaultColumnWidth={Math.round(96 * scale)}
          frozen={{ top: freezeTop ? 2 : 0, left: 0 }}
          overscan={{ rows: 5, columns: 2 }}
          showHeader
          showRowNumbers
          showGridLines={showGridLines}
          stripedRows={false}
          fitColumns="none"
          selection={selection}
          selectionKind={selectionKind}
          selectionEndpoints={selectionEndpoints}
          activeCell={activeCell}
          onSelectionChange={handleSelectionChange}
          onSelectionEndpointsChange={handleSelectionEndpointsChange}
          onActiveCellChange={handleActiveCellChange}
          onViewportChange={onViewportChange}
          columnResize
          contentVersion={`${history.revision}:${editor ? `${editor.row}:${editor.column}` : 'view'}`}
          columnLayoutVersion={zoom}
          apiRef={apiRef}
          themeColor="#217346"
          localeText={localeText}
          ariaLabel={translate(locale, 'spreadsheet.gridLabel')}
        />
      </div>

      <SpreadsheetStatusBar
        locale={locale}
        selection={selection}
        cutSelection={cutSelection}
        summary={sheetSummary}
        zoom={zoom}
        onZoomChange={setZoom}
      />
    </section>
  )
}

function CellEditor({
  initialValue,
  selectAll,
  label,
  onDraftChange,
  onFinish,
  onCancel,
}: {
  initialValue: string
  selectAll: boolean
  label: string
  onDraftChange: (value: string) => void
  onFinish: (value: string, navigation: EditorNavigation) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const finishedRef = useRef(false)
  const [draft, setDraft] = useState(initialValue)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    if (selectAll) input.select()
    else input.setSelectionRange(input.value.length, input.value.length)
  }, [selectAll])

  const finish = (navigation: EditorNavigation) => {
    if (finishedRef.current) return
    finishedRef.current = true
    onFinish(draft, navigation)
  }

  return (
    <input
      ref={inputRef}
      className="spreadsheet-cell-editor"
      aria-label={label}
      value={draft}
      spellCheck={false}
      onChange={(event) => {
        const nextDraft = event.target.value
        setDraft(nextDraft)
        onDraftChange(nextDraft)
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onBlur={() => finish('stay')}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Escape') {
          event.preventDefault()
          finishedRef.current = true
          onCancel()
        } else if (event.key === 'Enter') {
          event.preventDefault()
          finish(event.shiftKey ? 'up' : 'down')
        } else if (event.key === 'Tab') {
          event.preventDefault()
          finish(event.shiftKey ? 'left' : 'right')
        }
      }}
    />
  )
}

function createInitialSheet(locale: Locale): WorksheetSnapshot {
  return {
    values: createInitialValues(locale),
    formats: createInitialFormats(),
    mergedCells: [
      { rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 7 },
      { rowStart: 16, rowEnd: 16, columnStart: 0, columnEnd: 7 },
    ],
    editedValueKeys: new Set(),
  }
}

function createInitialValues(locale: Locale): Map<string, SpreadsheetCellValue> {
  const zh = locale === 'zh-CN'
  const values = new Map<string, SpreadsheetCellValue>()
  const set = (row: number, column: number, value: SpreadsheetCellValue) => values.set(cellKey(row, column), value)
  set(0, 0, zh ? '2026 销售计划与实际跟踪' : '2026 Sales Plan & Actual Tracker')
  const headers = zh
    ? ['区域', '产品线', '负责人', '销售目标', '实际收入', '完成率', '同比增长', '状态']
    : ['Region', 'Product', 'Owner', 'Target', 'Actual', 'Progress', 'YoY', 'Status']
  headers.forEach((header, column) => set(1, column, header))

  const regions = zh
    ? ['华东', '华南', '华北', '西南', '东北', '海外']
    : ['East', 'South', 'North', 'Southwest', 'Northeast', 'Overseas']
  const products = ['Cloud One', 'Atlas Pro', 'Nova BI', 'Pulse CRM']
  const owners = zh
    ? ['林一', '周宁', '秦月', '陈屿', '苏禾', '顾言']
    : ['Lynn', 'Noah', 'Quinn', 'Cody', 'Sofia', 'Gavin']
  const statuses = zh ? ['正常', '超预期', '关注'] : ['On track', 'Ahead', 'Watch']
  for (let index = 0; index < 12; index += 1) {
    const row = index + 2
    const target = 680_000 + index * 55_000
    const progress = 0.68 + ((index * 13) % 43) / 100
    set(row, 0, regions[index % regions.length]!)
    set(row, 1, products[index % products.length]!)
    set(row, 2, owners[index % owners.length]!)
    set(row, 3, target)
    set(row, 4, Math.round(target * progress))
    set(row, 5, progress)
    set(row, 6, -0.08 + ((index * 7) % 27) / 100)
    set(row, 7, statuses[index % statuses.length]!)
  }
  set(14, 0, zh ? '合计 / 平均' : 'Total / average')
  set(14, 3, '=SUM(D3:D14)')
  set(14, 4, '=SUM(E3:E14)')
  set(14, 5, '=E15/D15')
  set(14, 6, '=AVERAGE(G3:G14)')
  set(16, 0, zh
    ? '提示：双击或按 F2 编辑；支持公式、复制粘贴、撤销重做、名称框定位与选区统计。'
    : 'Tip: double-click or press F2 to edit. Formulas, clipboard, undo, name-box navigation, and live selection stats are supported.')
  return values
}

function createInitialFormats(): Map<string, CellFormat> {
  return new Map([
    [cellKey(0, 0), { fontSize: 16, bold: true, color: '#173b2a', fill: '#e7f4eb' }],
    ...Array.from({ length: 8 }, (_, column) => [
      cellKey(1, column),
      { bold: true, color: '#ffffff', fill: '#217346', align: column >= 3 ? 'right' as const : 'left' as const },
    ] as [string, CellFormat]),
    ...Array.from({ length: 8 }, (_, column) => [
      cellKey(14, column),
      { bold: true, fill: '#edf4ef', align: column >= 3 ? 'right' as const : 'left' as const },
    ] as [string, CellFormat]),
    [cellKey(16, 0), { color: '#53645a', fill: '#f7faf8', italic: true, wrap: true }],
  ])
}

function singleCellRange(address: CellAddress): CellRange {
  return {
    rowStart: address.row,
    rowEnd: address.row,
    columnStart: address.column,
    columnEnd: address.column,
  }
}

function getUsedRange(sheet: WorksheetSnapshot): CellRange {
  let rowEnd = 0
  let columnEnd = 0
  for (const key of sheet.values.keys()) {
    const [row, column] = key.split(':').map(Number)
    if (Number.isSafeInteger(row)) rowEnd = Math.max(rowEnd, row!)
    if (Number.isSafeInteger(column)) columnEnd = Math.max(columnEnd, column!)
  }
  for (const merge of sheet.mergedCells) {
    rowEnd = Math.max(rowEnd, merge.rowEnd)
    columnEnd = Math.max(columnEnd, merge.columnEnd)
  }
  return { rowStart: 0, rowEnd, columnStart: 0, columnEnd }
}

function resolveHeaderSelectionActive(
  kind: HeaderSelectionSession['kind'],
  index: number,
  current: CellAddress,
  merges: readonly MergedCellRange[],
): CellAddress {
  const preferred = kind === 'column'
    ? { row: current.row, column: index }
    : { row: index, column: current.column }
  const candidates = [
    preferred,
    ...Array.from(
      { length: kind === 'column' ? ROW_COUNT : COLUMN_COUNT },
      (_, offset) => kind === 'column'
        ? { row: offset, column: index }
        : { row: index, column: offset },
    ),
  ]
  for (const candidate of candidates) {
    const merge = merges.find((item) => rangeContainsAddress(item, candidate))
    if (!merge) return candidate
    const owner = { row: merge.rowStart, column: merge.columnStart }
    if ((kind === 'column' && owner.column === index)
      || (kind === 'row' && owner.row === index)) return owner
  }
  return preferred
}

function rangesEqual(left: CellRange, right: CellRange): boolean {
  return left.rowStart === right.rowStart && left.rowEnd === right.rowEnd
    && left.columnStart === right.columnStart && left.columnEnd === right.columnEnd
}

function rangeContainsAddress(range: CellRange, address: CellAddress): boolean {
  return address.row >= range.rowStart && address.row <= range.rowEnd
    && address.column >= range.columnStart && address.column <= range.columnEnd
}

function moveSpreadsheetAddress(
  address: CellAddress,
  direction: EditorNavigation,
  merges: readonly MergedCellRange[],
): CellAddress {
  if (direction === 'right' || direction === 'left') {
    return moveTabAddress(
      address,
      { rowStart: 0, rowEnd: ROW_COUNT - 1, columnStart: 0, columnEnd: COLUMN_COUNT - 1 },
      direction === 'left',
      (candidate) => merges.find((item) => rangeContainsAddress(item, candidate)),
    )
  }
  const merge = merges.find((item) => rangeContainsAddress(item, address))
  let row = direction === 'down' ? merge?.rowEnd ?? address.row
    : direction === 'up' ? merge?.rowStart ?? address.row
      : address.row
  const column = address.column
  if (direction === 'down') row = Math.min(ROW_COUNT - 1, row + 1)
  else if (direction === 'up') row = Math.max(0, row - 1)
  const target = { row, column }
  const targetMerge = merges.find((item) => rangeContainsAddress(item, target))
  return targetMerge
    ? { row: targetMerge.rowStart, column: targetMerge.columnStart }
    : target
}

function getCellAddressFromTarget(target: EventTarget | null): CellAddress | null {
  if (!(target instanceof Element)) return null
  const insightCell = target.closest<HTMLElement>('[data-row-id][data-column-id]')
  if (insightCell) {
    const row = Number(insightCell.dataset.rowId)
    const column = Number(insightCell.dataset.columnId?.replace('column-', ''))
    if (isValidAddress(row, column)) return { row, column }
  }
  const viewportAddress = getViewportCellAddressFromTarget(target)
  if (!viewportAddress) return null
  const row = viewportAddress.row - 1
  const column = viewportAddress.column - 1
  return isValidAddress(row, column) ? { row, column } : null
}

function getViewportCellAddressFromTarget(target: EventTarget | null): CellAddress | null {
  if (!(target instanceof Element)) return null
  const viewportCell = target.closest<HTMLElement>('[data-ultigrid-cell="true"]')
  if (!viewportCell) return null
  const row = Number(viewportCell.dataset.row)
  const column = Number(viewportCell.dataset.column)
  return Number.isSafeInteger(row) && Number.isSafeInteger(column) ? { row, column } : null
}

function isValidAddress(row: number, column: number): boolean {
  return Number.isSafeInteger(row) && Number.isSafeInteger(column)
    && row >= 0 && row < ROW_COUNT && column >= 0 && column < COLUMN_COUNT
}

function isFormControl(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, button, [contenteditable="true"]'))
}

function isColumnResizeHandle(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('.ultigrid-column-resize-handle'))
}
