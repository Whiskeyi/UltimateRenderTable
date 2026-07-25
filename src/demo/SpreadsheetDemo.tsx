import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  ClipboardPaste,
  Combine,
  Copy,
  DollarSign,
  Eraser,
  FunctionSquare,
  Grid2X2,
  Italic,
  Minus,
  PaintBucket,
  Percent,
  Plus,
  Redo2,
  RotateCcw,
  Scissors,
  Sigma,
  Underline,
  Undo2,
  WrapText,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  UltiGridInsight,
  defineInsightColumn,
  type CellAddress,
  type CellRange,
  type InsightCellVisualStyle,
  type InsightColumnDefinition,
  type InsightViewportSnapshot,
  type MergedCellRange,
  type SelectionEndpoints,
  type SelectionKind,
  type UltiGridInsightApi,
  type UltiGridInsightLocaleText,
} from '@ultigrid/insight'
import { rangeToTSV, rangesIntersect } from '../core/selection.js'
import { moveTabAddress } from '../core/keyboardNavigation.js'
import { translate, type Locale, type MessageKey } from '../i18n'
import { writeTextToClipboard } from '../utils/clipboard'
import {
  calculateSelectionStats,
  cellKey,
  columnName,
  createSpreadsheetEvaluator,
  formatSpreadsheetValue,
  parseCellInput,
  parseClipboardMatrix,
  parseSelectionLabel,
  selectionLabel,
  translateFormulaReferences,
  type SpreadsheetCellValue,
  type SpreadsheetNumberFormat,
} from './spreadsheetModel'
import {
  initializeWorkbookHistory,
  localizeWorkbookHistory,
  persistWorkbookHistory,
  workbookReducer,
  type CellFormat,
  type HorizontalAlign,
  type WorkbookAction,
  type WorkbookHistory,
  type WorksheetSnapshot,
} from './spreadsheetWorkbook'

interface SheetRow {
  id: number
  index: number
}

type RibbonTab = 'home' | 'formulas' | 'view'
type EditorNavigation = 'stay' | 'up' | 'down' | 'left' | 'right'
type FormulaName = 'SUM' | 'AVERAGE' | 'MIN' | 'MAX' | 'COUNT'

interface ResolvedCellFormat {
  fontFamily: string
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  color: string
  fill: string
  align: HorizontalAlign
  wrap: boolean
  numberFormat: SpreadsheetNumberFormat
}

interface CellEditorState extends CellAddress {
  draft: string
  selectAll: boolean
}

interface InternalClipboard {
  mode: 'copy' | 'cut'
  text: string
  values: SpreadsheetCellValue[][]
  formats: (CellFormat | undefined)[][]
  source: CellAddress
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
const COLOR_SWATCHES = [
  '#202124', '#ffffff', '#217346', '#0f6cbd', '#5b5fc7', '#b42318', '#d97706',
  '#e7f4eb', '#e8f1fb', '#f0edff', '#fff4ce', '#fde7e9', '#f2f4f2', '#d9e1f2',
] as const
const FORMAT_KEYS: readonly (keyof ResolvedCellFormat)[] = [
  'fontFamily', 'fontSize', 'bold', 'italic', 'underline', 'color', 'fill', 'align', 'wrap', 'numberFormat',
]
const FORMULA_LABEL_KEYS = {
  SUM: 'spreadsheet.formula.sum',
  AVERAGE: 'spreadsheet.formula.average',
  MIN: 'spreadsheet.formula.min',
  MAX: 'spreadsheet.formula.max',
  COUNT: 'spreadsheet.formula.count',
} satisfies Record<FormulaName, MessageKey>

export function SpreadsheetDemo({
  locale,
  apiRef,
  localeText,
  onViewportChange,
}: SpreadsheetDemoProps) {
  const [history, setHistory] = useState<WorkbookHistory>(
    () => initializeWorkbookHistory(locale, createInitialSheet),
  )
  const sheet = history.present
  const [selection, setSelection] = useState<CellRange | null>(DEFAULT_SELECTION)
  const [selectionKind, setSelectionKind] = useState<SelectionKind>('cell')
  const [selectionEndpoints, setSelectionEndpoints] = useState<SelectionEndpoints>({
    anchor: { row: DEFAULT_SELECTION.rowStart, column: DEFAULT_SELECTION.columnStart },
    focus: { row: DEFAULT_SELECTION.rowEnd, column: DEFAULT_SELECTION.columnEnd },
  })
  const [activeCell, setActiveCell] = useState<CellAddress>({
    row: DEFAULT_SELECTION.rowStart,
    column: DEFAULT_SELECTION.columnStart,
  })
  const [activeTab, setActiveTab] = useState<RibbonTab>('home')
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
  const historyRef = useRef(history)
  const latestSheetRef = useRef(sheet)
  const activeCellRef = useRef(activeCell)
  const editorRef = useRef(editor)
  const formulaDraftRef = useRef(formulaDraft)
  const formulaEditingRef = useRef(formulaEditing)
  const headerSelectionRef = useRef<HeaderSelectionSession | null>(null)
  historyRef.current = history
  latestSheetRef.current = sheet
  activeCellRef.current = activeCell
  formulaDraftRef.current = formulaDraft
  formulaEditingRef.current = formulaEditing

  const dispatch = useCallback((action: WorkbookAction) => {
    const next = workbookReducer(historyRef.current, action)
    if (next === historyRef.current) return
    historyRef.current = next
    latestSheetRef.current = next.present
    persistWorkbookHistory(next)
    setHistory(next)
  }, [])

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
    if (!nameEditing) setNameDraft(selectionLabel(singleCellRange(activeCell)))
  }, [activeCell, nameEditing])

  useEffect(() => {
    const next = localizeWorkbookHistory(historyRef.current, locale, createInitialSheet)
    if (next === historyRef.current) return
    historyRef.current = next
    latestSheetRef.current = next.present
    persistWorkbookHistory(next)
    setHistory(next)
  }, [locale])

  useEffect(() => {
    const persistPendingEdits = () => {
      const current = historyRef.current
      let snapshot = consumePendingEditor(current.present, editorRef.current)
      if (formulaEditingRef.current) {
        snapshot = applyDraftToSnapshot(
          snapshot,
          activeCellRef.current,
          formulaDraftRef.current,
        )
      }
      const next = snapshot === current.present
        ? current
        : workbookReducer(current, { type: 'commit', snapshot })
      historyRef.current = next
      latestSheetRef.current = next.present
      persistWorkbookHistory(next, { immediate: true })
      return next
    }
    const handlePageHide = () => {
      persistPendingEdits()
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const current = persistPendingEdits()
      if (!current.dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      persistPendingEdits()
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current)
    }
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
    setSelection(next)
    setSelectionKind(kind)
    setSelectionEndpoints(endpoints ?? createSelectionEndpoints(next, nextActive, kind))
    setActiveCell(nextActive)
    setEditor(null)
    if (scroll) apiRef.current?.scrollToCell(nextActive, 'auto')
  }, [apiRef])

  const commitSnapshot = useCallback((snapshot: WorksheetSnapshot) => {
    latestSheetRef.current = snapshot
    dispatch({ type: 'commit', snapshot })
  }, [dispatch])

  const applyFormat = useCallback((patch: Partial<CellFormat>) => {
    if (!selection) return
    const nextFormats = new Map(sheet.formats)
    let changed = false
    forEachRangeCell(selection, (row, column) => {
      const key = cellKey(row, column)
      const current = nextFormats.get(key) ?? {}
      const next = { ...current, ...patch }
      if (!shallowEqualFormat(current, next)) {
        nextFormats.set(key, next)
        changed = true
      }
    })
    if (changed) {
      commitSnapshot({ ...sheet, formats: nextFormats })
      notify(translate(locale, 'spreadsheet.feedback.formatted'))
    }
    restoreGridFocus()
  }, [commitSnapshot, locale, notify, restoreGridFocus, selection, sheet])

  const clearFormats = useCallback(() => {
    if (!selection) return
    const nextFormats = new Map(sheet.formats)
    let changed = false
    forEachRangeCell(selection, (row, column) => {
      if (nextFormats.delete(cellKey(row, column))) changed = true
    })
    if (changed) {
      commitSnapshot({ ...sheet, formats: nextFormats })
      notify(translate(locale, 'spreadsheet.feedback.formatCleared'))
    }
    restoreGridFocus()
  }, [commitSnapshot, locale, notify, restoreGridFocus, selection, sheet])

  const clearContents = useCallback((clearFormatting = false) => {
    if (!selection) return
    const nextValues = new Map(sheet.values)
    const nextFormats = clearFormatting ? new Map(sheet.formats) : sheet.formats
    let changed = false
    forEachRangeCell(selection, (row, column) => {
      const key = cellKey(row, column)
      if (nextValues.delete(key)) changed = true
      if (clearFormatting && nextFormats.delete(key)) changed = true
    })
    if (changed) {
      commitSnapshot({ ...sheet, values: nextValues, formats: nextFormats })
      notify(translate(locale, 'spreadsheet.feedback.cleared'))
    }
    restoreGridFocus()
  }, [commitSnapshot, locale, notify, restoreGridFocus, selection, sheet])

  const commitCellInput = useCallback((address: CellAddress, draft: string) => {
    const nextValue = parseCellInput(draft)
    const key = cellKey(address.row, address.column)
    const currentSheet = latestSheetRef.current
    const currentValue = currentSheet.values.get(key) ?? ''
    if (Object.is(currentValue, nextValue)) return
    const nextValues = new Map(currentSheet.values)
    if (nextValue === '') nextValues.delete(key)
    else nextValues.set(key, nextValue)
    commitSnapshot({ ...currentSheet, values: nextValues })
  }, [commitSnapshot])

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
    setSelection(next)
    setSelectionKind(kind)
    setEditor(null)
  }, [commitCellInput])

  const handleActiveCellChange = useCallback((next: CellAddress | null) => {
    if (next) setActiveCell(next)
  }, [])

  const handleSelectionEndpointsChange = useCallback((next: SelectionEndpoints | null) => {
    if (next) setSelectionEndpoints(next)
  }, [])

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
  }, [locale, nameDraft, notify, restoreGridFocus, selectRange])

  const copySelection = useCallback(async (cut = false) => {
    if (!selection) return
    const sourceSelection = { ...selection }
    const currentSheet = consumePendingEditor(latestSheetRef.current, editorRef.current)
    const currentEvaluator = createSpreadsheetEvaluator(currentSheet.values, {
      rowCount: ROW_COUNT,
      columnCount: COLUMN_COUNT,
      maxFormulaCells: ROW_COUNT * COLUMN_COUNT,
    })
    const text = rangeToTSV(sourceSelection, ({ row, column }) => {
      const value = currentEvaluator.getValue(row, column)
      const format = getEffectiveFormat(row, column, currentSheet.formats.get(cellKey(row, column)))
      return formatSpreadsheetValue(value, format.numberFormat, locale)
    })
    const values = rangeToMatrix(sourceSelection, (row, column) => (
      currentSheet.values.get(cellKey(row, column)) ?? ''
    ))
    const formats = rangeToMatrix(sourceSelection, (row, column) => currentSheet.formats.get(cellKey(row, column)))
    const internalClipboard: InternalClipboard = {
      mode: 'copy',
      text,
      values,
      formats,
      source: { row: sourceSelection.rowStart, column: sourceSelection.columnStart },
    }
    clipboardRef.current = internalClipboard
    let systemClipboardWritten = false
    try {
      await writeTextToClipboard(text)
      systemClipboardWritten = true
    } catch {
      // The internal clipboard still makes toolbar paste deterministic.
    }
    if (cut) {
      if (!systemClipboardWritten) {
        notify(translate(locale, 'spreadsheet.feedback.cutClipboardFailed'))
        restoreGridFocus()
        return
      }
      if (latestSheetRef.current !== currentSheet) {
        notify(translate(locale, 'spreadsheet.feedback.cutChanged'))
        restoreGridFocus()
        return
      }
      editorRef.current = null
      setEditor(null)
      const nextValues = new Map(currentSheet.values)
      const nextFormats = new Map(currentSheet.formats)
      forEachRangeCell(sourceSelection, (row, column) => {
        const key = cellKey(row, column)
        nextValues.delete(key)
        nextFormats.delete(key)
      })
      clipboardRef.current = { ...internalClipboard, mode: 'cut' }
      commitSnapshot({ ...currentSheet, values: nextValues, formats: nextFormats })
    }
    notify(translate(locale, cut
      ? 'spreadsheet.feedback.cut'
      : systemClipboardWritten
        ? 'spreadsheet.feedback.copied'
        : 'spreadsheet.feedback.copiedInternal'))
    restoreGridFocus()
  }, [commitSnapshot, locale, notify, restoreGridFocus, selection])

  const pasteMatrix = useCallback((
    matrix: SpreadsheetCellValue[][],
    sourceFormats?: (CellFormat | undefined)[][],
    target: CellAddress = activeCellRef.current,
    source?: CellAddress,
  ) => {
    const currentSheet = consumePendingEditor(latestSheetRef.current, editorRef.current)
    const matrixWidth = matrix.reduce((maximum, row) => Math.max(maximum, row.length), 0)
    const cellCount = matrix.length * matrixWidth
    if (matrix.length === 0 || matrixWidth === 0) return
    if (cellCount > MAX_PASTE_CELLS) {
      notify(translate(locale, 'spreadsheet.feedback.pasteTooLarge'))
      return
    }
    const rowEnd = target.row + matrix.length - 1
    const columnEnd = target.column + matrixWidth - 1
    if (rowEnd >= ROW_COUNT || columnEnd >= COLUMN_COUNT) {
      notify(translate(locale, 'spreadsheet.feedback.pasteOutOfBounds', {
        rows: matrix.length,
        columns: matrixWidth,
        address: selectionLabel(singleCellRange(target)),
      }))
      return
    }
    const targetRange: CellRange = {
      rowStart: target.row,
      rowEnd,
      columnStart: target.column,
      columnEnd,
    }
    const intersectingMerge = currentSheet.mergedCells.find((merge) => rangesIntersect(merge, targetRange))
    if (intersectingMerge && !(
      matrix.length === 1 && matrixWidth === 1 &&
      target.row === intersectingMerge.rowStart && target.column === intersectingMerge.columnStart
    )) {
      notify(translate(locale, 'spreadsheet.feedback.mergeConflict'))
      return
    }
    editorRef.current = null
    setEditor(null)
    const nextValues = new Map(currentSheet.values)
    const nextFormats = new Map(currentSheet.formats)
    for (let rowOffset = 0; rowOffset < matrix.length; rowOffset += 1) {
      const targetRow = target.row + rowOffset
      if (targetRow >= ROW_COUNT) break
      const sourceRow = matrix[rowOffset] ?? []
      for (let columnOffset = 0; columnOffset < matrixWidth; columnOffset += 1) {
        const targetColumn = target.column + columnOffset
        if (targetColumn >= COLUMN_COUNT) break
        const key = cellKey(targetRow, targetColumn)
        const sourceValue = sourceRow[columnOffset] ?? ''
        const value = source
          ? translateFormulaReferences(
              sourceValue,
              target.row - source.row,
              target.column - source.column,
              ROW_COUNT,
              COLUMN_COUNT,
            )
          : sourceValue
        if (value === '') nextValues.delete(key)
        else nextValues.set(key, value)
        if (sourceFormats) {
          const format = sourceFormats[rowOffset]?.[columnOffset]
          if (format) nextFormats.set(key, { ...format })
          else nextFormats.delete(key)
        }
      }
    }
    commitSnapshot({ ...currentSheet, values: nextValues, formats: nextFormats })
    selectRange(targetRange)
    notify(translate(locale, 'spreadsheet.feedback.pastedCount', { count: cellCount }))
    restoreGridFocus()
  }, [commitSnapshot, locale, notify, restoreGridFocus, selectRange])

  const pasteText = useCallback((text: string, target: CellAddress = activeCellRef.current) => {
    const internal = clipboardRef.current
    if (internal && internal.text === text) {
      pasteMatrix(
        internal.values,
        internal.formats,
        target,
        internal.mode === 'copy' ? internal.source : undefined,
      )
    }
    else pasteMatrix(parseClipboardMatrix(text), undefined, target)
  }, [pasteMatrix])

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
  }, [locale, notify, pasteText])

  const toggleMerge = useCallback(() => {
    if (!selection) return
    const exactIndex = sheet.mergedCells.findIndex((merge) => rangesEqual(merge, selection))
    if (exactIndex >= 0) {
      const mergedCells = sheet.mergedCells.filter((_, index) => index !== exactIndex)
      commitSnapshot({ ...sheet, mergedCells })
      notify(translate(locale, 'spreadsheet.feedback.unmerged'))
      restoreGridFocus()
      return
    }
    if (isSingleCellRange(selection)) {
      notify(translate(locale, 'spreadsheet.feedback.mergeRange'))
      return
    }
    if (sheet.mergedCells.some((merge) => rangesIntersect(merge, selection))) {
      notify(translate(locale, 'spreadsheet.feedback.mergeConflict'))
      return
    }
    let discardedValues = 0
    forEachRangeCell(selection, (row, column) => {
      if (row === selection.rowStart && column === selection.columnStart) return
      if ((sheet.values.get(cellKey(row, column)) ?? '') !== '') discardedValues += 1
    })
    if (
      discardedValues > 0
      && !window.confirm(translate(locale, 'spreadsheet.confirm.merge', { count: discardedValues }))
    ) {
      restoreGridFocus()
      return
    }
    const nextValues = new Map(sheet.values)
    forEachRangeCell(selection, (row, column) => {
      if (row !== selection.rowStart || column !== selection.columnStart) {
        nextValues.delete(cellKey(row, column))
      }
    })
    commitSnapshot({
      ...sheet,
      values: nextValues,
      mergedCells: [...sheet.mergedCells, { ...selection }],
    })
    const anchor = { row: selection.rowStart, column: selection.columnStart }
    selectRange(singleCellRange(anchor), anchor)
    notify(translate(locale, 'spreadsheet.feedback.merged'))
    restoreGridFocus()
  }, [commitSnapshot, locale, notify, restoreGridFocus, selectRange, selection, sheet])

  const insertFunction = useCallback((functionName: FormulaName) => {
    const source = selection ?? singleCellRange(activeCell)
    let target = activeCell
    let formulaRange = source
    let hasFormulaRange = true
    if (!isSingleCellRange(source) && source.rowEnd < ROW_COUNT - 1) {
      target = { row: source.rowEnd + 1, column: source.columnStart }
    } else if (typeof getRawValue(activeCell.row, activeCell.column) === 'number') {
      let startRow = activeCell.row
      let endRow = activeCell.row
      while (startRow > 0 && typeof getRawValue(startRow - 1, activeCell.column) === 'number') startRow -= 1
      while (endRow < ROW_COUNT - 1 && typeof getRawValue(endRow + 1, activeCell.column) === 'number') endRow += 1
      formulaRange = {
        rowStart: startRow,
        rowEnd: endRow,
        columnStart: activeCell.column,
        columnEnd: activeCell.column,
      }
      if (endRow < ROW_COUNT - 1) target = { row: endRow + 1, column: activeCell.column }
    } else if (activeCell.row > 0 && typeof getRawValue(activeCell.row - 1, activeCell.column) === 'number') {
      let startRow = activeCell.row - 1
      while (startRow > 0 && typeof getRawValue(startRow - 1, activeCell.column) === 'number') startRow -= 1
      formulaRange = {
        rowStart: startRow,
        rowEnd: activeCell.row - 1,
        columnStart: activeCell.column,
        columnEnd: activeCell.column,
      }
    } else {
      hasFormulaRange = false
    }
    const formula = `=${functionName}(${hasFormulaRange ? selectionLabel(formulaRange) : ''})`
    commitCellInput(target, formula)
    selectRange(singleCellRange(target), target)
    setFormulaDraft(formula)
    notify(translate(locale, 'spreadsheet.feedback.formulaInserted'))
    restoreGridFocus()
  }, [activeCell, commitCellInput, getRawValue, locale, notify, restoreGridFocus, selectRange, selection])

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
    latestSheetRef.current = snapshot
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
    latestSheetRef.current = previous
    dispatch({ type: 'undo' })
    editorRef.current = null
    setEditor(null)
    notify(translate(locale, 'spreadsheet.feedback.undo'))
    restoreGridFocus()
  }, [dispatch, locale, notify, restoreGridFocus])

  const redo = useCallback(() => {
    const next = historyRef.current.future[0]
    if (!next) return
    latestSheetRef.current = next
    dispatch({ type: 'redo' })
    editorRef.current = null
    setEditor(null)
    notify(translate(locale, 'spreadsheet.feedback.redo'))
    restoreGridFocus()
  }, [dispatch, locale, notify, restoreGridFocus])

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
  }, [pasteText])

  const handleGridKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isFormControl(event.target) || event.nativeEvent.isComposing) return
    const key = event.key.toLowerCase()
    const command = event.metaKey || event.ctrlKey
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
      applyFormat({ bold: !getEffectiveFormat(activeCell.row, activeCell.column, sheet.formats.get(activeKey)).bold })
      return
    }
    if (command && key === 'i') {
      event.preventDefault()
      applyFormat({ italic: !getEffectiveFormat(activeCell.row, activeCell.column, sheet.formats.get(activeKey)).italic })
      return
    }
    if (command && key === 'u') {
      event.preventDefault()
      applyFormat({ underline: !getEffectiveFormat(activeCell.row, activeCell.column, sheet.formats.get(activeKey)).underline })
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
    activeKey,
    applyFormat,
    clearContents,
    copySelection,
    redo,
    selectRange,
    selection,
    sheet,
    startEditing,
    undo,
  ])

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
    setActiveTab(nextTab)
    window.requestAnimationFrame(() => document.getElementById(`spreadsheet-tab-${nextTab}`)?.focus())
  }, [])

  const formatSummary = useMemo(
    () => summarizeFormats(selection, activeCell, sheet.formats),
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
      <header className="spreadsheet-menu">
        <span className="spreadsheet-book-mark"><Grid2X2 size={15} /> {translate(locale, 'spreadsheet.bookLabel')}</span>
        <span className="spreadsheet-quick-access" role="group" aria-label={translate(locale, 'spreadsheet.group.history')}>
          <ToolbarButton label={translate(locale, 'spreadsheet.undo')} disabled={history.past.length === 0} onClick={undo}><Undo2 size={14} /></ToolbarButton>
          <ToolbarButton label={translate(locale, 'spreadsheet.redo')} disabled={history.future.length === 0} onClick={redo}><Redo2 size={14} /></ToolbarButton>
        </span>
        <div role="tablist" aria-label={translate(locale, 'spreadsheet.toolbar.tabs')}>
          {(['home', 'formulas', 'view'] as const).map((tab) => (
            <button
              key={tab}
              id={`spreadsheet-tab-${tab}`}
              type="button"
              role="tab"
              aria-controls="spreadsheet-ribbon-panel"
              aria-selected={activeTab === tab}
              tabIndex={activeTab === tab ? 0 : -1}
              className={activeTab === tab ? 'is-active' : undefined}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => handleRibbonTabKeyDown(event, tab)}
            >
              {translate(locale, `spreadsheet.tab.${tab}`)}
            </button>
          ))}
        </div>
        <span className="spreadsheet-autosave">
          <i /> {feedback || translate(
            locale,
            history.dirty ? 'spreadsheet.unsaved' : 'spreadsheet.sessionReady',
          )}
        </span>
        <span className="sr-only" role="status" aria-live="polite">{feedback}</span>
      </header>

      <div
        id="spreadsheet-ribbon-panel"
        className={`spreadsheet-ribbon spreadsheet-ribbon--${activeTab}`}
        role="tabpanel"
        aria-labelledby={`spreadsheet-tab-${activeTab}`}
      >
        {activeTab === 'home' ? (
          <>
            <RibbonGroup label={translate(locale, 'spreadsheet.group.clipboard')}>
              <ToolbarButton label={translate(locale, 'spreadsheet.paste')} onClick={() => void pasteFromToolbar()}><ClipboardPaste size={16} /></ToolbarButton>
              <ToolbarButton label={translate(locale, 'spreadsheet.copy')} onClick={() => void copySelection(false)}><Copy size={15} /></ToolbarButton>
              <ToolbarButton label={translate(locale, 'spreadsheet.cut')} onClick={() => void copySelection(true)}><Scissors size={15} /></ToolbarButton>
            </RibbonGroup>
            <RibbonGroup wide label={translate(locale, 'spreadsheet.group.font')} className="spreadsheet-font-group">
              <label>
                <span className="sr-only">{translate(locale, 'spreadsheet.font')}</span>
                <select
                  value={mixed.has('fontFamily') ? '' : activeFormat.fontFamily}
                  onChange={(event) => applyFormat({ fontFamily: event.target.value })}
                >
                  {mixed.has('fontFamily') ? <option value="">—</option> : null}
                  <option>Aptos</option><option>Arial</option><option>Georgia</option><option>Menlo</option>
                </select>
                <ChevronDown size={12} />
              </label>
              <label className="spreadsheet-size-select">
                <span className="sr-only">{translate(locale, 'spreadsheet.fontSize')}</span>
                <select
                  value={mixed.has('fontSize') ? '' : activeFormat.fontSize}
                  onChange={(event) => applyFormat({ fontSize: Number(event.target.value) })}
                >
                  {mixed.has('fontSize') ? <option value="">—</option> : null}
                  {[10, 11, 12, 14, 16, 18, 24].map((size) => <option key={size}>{size}</option>)}
                </select>
                <ChevronDown size={12} />
              </label>
              <ToolbarButton label={translate(locale, 'spreadsheet.bold')} active={mixed.has('bold') ? 'mixed' : activeFormat.bold} onClick={() => applyFormat({ bold: !activeFormat.bold })}><Bold size={15} /></ToolbarButton>
              <ToolbarButton label={translate(locale, 'spreadsheet.italic')} active={mixed.has('italic') ? 'mixed' : activeFormat.italic} onClick={() => applyFormat({ italic: !activeFormat.italic })}><Italic size={15} /></ToolbarButton>
              <ToolbarButton label={translate(locale, 'spreadsheet.underline')} active={mixed.has('underline') ? 'mixed' : activeFormat.underline} onClick={() => applyFormat({ underline: !activeFormat.underline })}><Underline size={15} /></ToolbarButton>
            </RibbonGroup>
            <RibbonGroup label={translate(locale, 'spreadsheet.group.colors')}>
              <ColorControl label={translate(locale, 'spreadsheet.textColor')} value={activeFormat.color} onChange={(color) => applyFormat({ color })} />
              <ColorControl fill label={translate(locale, 'spreadsheet.fillColor')} value={activeFormat.fill} onChange={(fill) => applyFormat({ fill })} />
            </RibbonGroup>
            <RibbonGroup label={translate(locale, 'spreadsheet.group.alignment')}>
              <ToolbarButton label={translate(locale, 'spreadsheet.alignLeft')} active={mixed.has('align') ? 'mixed' : activeFormat.align === 'left'} onClick={() => applyFormat({ align: 'left' })}><AlignLeft size={15} /></ToolbarButton>
              <ToolbarButton label={translate(locale, 'spreadsheet.alignCenter')} active={mixed.has('align') ? 'mixed' : activeFormat.align === 'center'} onClick={() => applyFormat({ align: 'center' })}><AlignCenter size={15} /></ToolbarButton>
              <ToolbarButton label={translate(locale, 'spreadsheet.alignRight')} active={mixed.has('align') ? 'mixed' : activeFormat.align === 'right'} onClick={() => applyFormat({ align: 'right' })}><AlignRight size={15} /></ToolbarButton>
              <ToolbarButton label={translate(locale, 'spreadsheet.wrap')} active={mixed.has('wrap') ? 'mixed' : activeFormat.wrap} onClick={() => applyFormat({ wrap: !activeFormat.wrap })}><WrapText size={15} /></ToolbarButton>
            </RibbonGroup>
            <RibbonGroup label={translate(locale, 'spreadsheet.group.number')}>
              <ToolbarButton label={translate(locale, 'spreadsheet.currency')} active={mixed.has('numberFormat') ? 'mixed' : activeFormat.numberFormat === 'currency'} onClick={() => applyFormat({ numberFormat: 'currency' })}><DollarSign size={15} /></ToolbarButton>
              <ToolbarButton label={translate(locale, 'spreadsheet.percent')} active={mixed.has('numberFormat') ? 'mixed' : activeFormat.numberFormat === 'percent'} onClick={() => applyFormat({ numberFormat: 'percent' })}><Percent size={15} /></ToolbarButton>
              <ToolbarButton label={translate(locale, 'spreadsheet.number')} active={mixed.has('numberFormat') ? 'mixed' : activeFormat.numberFormat === 'number'} onClick={() => applyFormat({ numberFormat: 'number' })}><span className="spreadsheet-decimal-icon">.00</span></ToolbarButton>
            </RibbonGroup>
            <RibbonGroup label={translate(locale, 'spreadsheet.group.cells')}>
              <ToolbarButton label={translate(locale, mergedSelection ? 'spreadsheet.unmerge' : 'spreadsheet.merge')} active={mergedSelection} onClick={toggleMerge}><Combine size={15} /></ToolbarButton>
              <ToolbarButton label={translate(locale, 'spreadsheet.clearFormat')} onClick={clearFormats}><Eraser size={15} /></ToolbarButton>
              <ToolbarButton label={translate(locale, 'spreadsheet.reset')} onClick={resetSheet}><RotateCcw size={15} /></ToolbarButton>
            </RibbonGroup>
          </>
        ) : null}

        {activeTab === 'formulas' ? (
          <>
            <RibbonGroup label={translate(locale, 'spreadsheet.formula.quick')} className="spreadsheet-formula-group">
              {(['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT'] as const).map((name) => (
                <button key={name} type="button" className="spreadsheet-function-button" onClick={() => insertFunction(name)}>
                  <Sigma size={16} /><span><strong>{name}</strong><small>{translate(locale, FORMULA_LABEL_KEYS[name])}</small></span>
                </button>
              ))}
            </RibbonGroup>
            <p className="spreadsheet-ribbon-hint"><FunctionSquare size={17} /> {translate(locale, 'spreadsheet.formula.help')}</p>
          </>
        ) : null}

        {activeTab === 'view' ? (
          <>
            <RibbonGroup label={translate(locale, 'spreadsheet.tab.view')} className="spreadsheet-view-group">
              <ViewToggle active={showGridLines} icon={<Grid2X2 size={16} />} label={translate(locale, 'spreadsheet.view.gridlines')} onClick={() => setShowGridLines((current) => !current)} />
              <ViewToggle active={freezeTop} icon={<Combine size={16} />} label={translate(locale, 'spreadsheet.view.freeze')} onClick={() => setFreezeTop((current) => !current)} />
              <ViewToggle active={showFormulaBar} icon={<FunctionSquare size={16} />} label={translate(locale, 'spreadsheet.view.formulaBar')} onClick={() => setShowFormulaBar((current) => !current)} />
            </RibbonGroup>
            <RibbonGroup label={translate(locale, 'spreadsheet.view.zoom')} className="spreadsheet-zoom-group">
              <ToolbarButton label={translate(locale, 'spreadsheet.view.zoomOut')} disabled={zoom <= 80} onClick={() => setZoom((current) => Math.max(80, current - 10))}><Minus size={15} /></ToolbarButton>
              <input aria-label={translate(locale, 'spreadsheet.view.zoom')} type="range" min="80" max="140" step="10" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
              <output>{zoom}%</output>
              <ToolbarButton label={translate(locale, 'spreadsheet.view.zoomIn')} disabled={zoom >= 140} onClick={() => setZoom((current) => Math.min(140, current + 10))}><Plus size={15} /></ToolbarButton>
            </RibbonGroup>
          </>
        ) : null}
      </div>

      {showFormulaBar ? (
        <div className="spreadsheet-formula-bar">
          <input
            className="spreadsheet-name-box"
            value={nameDraft}
            aria-label={translate(locale, 'spreadsheet.nameBox')}
            title={translate(locale, 'spreadsheet.nameBoxHint')}
            onFocus={(event) => {
              setNameEditing(true)
              event.currentTarget.select()
            }}
            onChange={(event) => setNameDraft(event.target.value.toUpperCase())}
            onBlur={() => commitNameBox(false)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') {
                event.preventDefault()
                commitNameBox(true)
              }
              if (event.key === 'Escape') {
                setNameDraft(selectionLabel(selection))
                setNameEditing(false)
                restoreGridFocus()
              }
            }}
          />
          <button type="button" className="spreadsheet-fx-button" title={translate(locale, 'spreadsheet.tab.formulas')} aria-label={translate(locale, 'spreadsheet.tab.formulas')} onClick={() => setActiveTab('formulas')}><FunctionSquare size={15} /></button>
          <span className="spreadsheet-formula-actions" aria-hidden={!formulaEditing}>
            <button type="button" disabled={!formulaEditing} aria-label={translate(locale, 'spreadsheet.cancelEdit')} onPointerDown={(event) => event.preventDefault()} onClick={cancelFormulaBar}><X size={14} /></button>
            <button type="button" disabled={!formulaEditing} aria-label={translate(locale, 'spreadsheet.acceptEdit')} onPointerDown={(event) => event.preventDefault()} onClick={() => {
              commitFormulaBar()
              restoreGridFocus()
            }}><Check size={14} /></button>
          </span>
          <input
            className="spreadsheet-formula-input"
            value={formulaDraft}
            aria-label={translate(locale, 'spreadsheet.formulaBar')}
            spellCheck={false}
            onFocus={() => setFormulaEditing(true)}
            onChange={(event) => {
              setFormulaEditing(true)
              setFormulaDraft(event.target.value)
            }}
            onBlur={() => {
              if (formulaEditing) commitFormulaBar()
            }}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Enter') {
                event.preventDefault()
                commitFormulaBar(event.shiftKey ? 'up' : 'down')
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                cancelFormulaBar()
              }
            }}
          />
        </div>
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

      <footer className="spreadsheet-sheet-tabs">
        <span className="spreadsheet-sheet-tab">{translate(locale, 'spreadsheet.sheetName')}</span>
        <span className="spreadsheet-active-address">{selectionLabel(selection)}</span>
        <span className="spreadsheet-status-spacer" />
        <small>{sheetSummary}</small>
        <span className="spreadsheet-footer-zoom">
          <button type="button" aria-label={translate(locale, 'spreadsheet.view.zoomOut')} disabled={zoom <= 80} onClick={() => setZoom((current) => Math.max(80, current - 10))}><Minus size={12} /></button>
          <output>{zoom}%</output>
          <button type="button" aria-label={translate(locale, 'spreadsheet.view.zoomIn')} disabled={zoom >= 140} onClick={() => setZoom((current) => Math.min(140, current + 10))}><Plus size={12} /></button>
        </span>
      </footer>
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

function RibbonGroup({
  label,
  className = '',
  wide = false,
  children,
}: {
  label: string
  className?: string
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className={`spreadsheet-ribbon-group ${wide ? 'is-wide' : ''} ${className}`} role="group" aria-label={label}>
      <div>{children}</div>
      <small>{label}</small>
    </div>
  )
}

function ToolbarButton({
  label,
  active,
  disabled = false,
  onClick,
  children,
}: {
  label: string
  active?: boolean | 'mixed'
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={active ? `is-active ${active === 'mixed' ? 'is-mixed' : ''}` : undefined}
      aria-pressed={active === undefined ? undefined : active}
      title={label}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ColorControl({
  label,
  value,
  fill = false,
  onChange,
}: {
  label: string
  value: string
  fill?: boolean
  onChange: (value: string) => void
}) {
  return (
    <details className="spreadsheet-color-control">
      <summary title={label} aria-label={label}>
        {fill ? <PaintBucket size={15} /> : <span className="spreadsheet-font-color">A</span>}
        <i style={{ backgroundColor: value }} />
      </summary>
      <span className="spreadsheet-color-palette" role="group" aria-label={label}>
        {COLOR_SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            aria-pressed={value.toLowerCase() === color}
            aria-label={`${label} ${color}`}
            style={{ backgroundColor: color }}
            onClick={(event) => {
              onChange(color)
              event.currentTarget.closest('details')?.removeAttribute('open')
            }}
          />
        ))}
      </span>
    </details>
  )
}

function ViewToggle({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" className={`spreadsheet-view-toggle ${active ? 'is-active' : ''}`} aria-pressed={active} onClick={onClick}>
      {icon}<span>{label}</span>{active ? <Check size={13} /> : null}
    </button>
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

function consumePendingEditor(
  sheet: WorksheetSnapshot,
  editor: CellEditorState | null,
): WorksheetSnapshot {
  if (!editor) return sheet
  const key = cellKey(editor.row, editor.column)
  const value = parseCellInput(editor.draft)
  if (Object.is(sheet.values.get(key) ?? '', value)) return sheet
  const values = new Map(sheet.values)
  if (value === '') values.delete(key)
  else values.set(key, value)
  return { ...sheet, values }
}

function applyDraftToSnapshot(
  sheet: WorksheetSnapshot,
  address: CellAddress,
  draft: string,
): WorksheetSnapshot {
  const key = cellKey(address.row, address.column)
  const value = parseCellInput(draft)
  if (Object.is(sheet.values.get(key) ?? '', value)) return sheet
  const values = new Map(sheet.values)
  if (value === '') values.delete(key)
  else values.set(key, value)
  return { ...sheet, values }
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

function getEffectiveFormat(row: number, column: number, format?: CellFormat): ResolvedCellFormat {
  return {
    fontFamily: format?.fontFamily ?? 'Aptos',
    fontSize: format?.fontSize ?? 12,
    bold: format?.bold ?? false,
    italic: format?.italic ?? false,
    underline: format?.underline ?? false,
    color: format?.color ?? (row > 14 ? '#5f6368' : '#202124'),
    fill: format?.fill ?? '#ffffff',
    align: format?.align ?? (column >= 3 && column <= 6 ? 'right' : 'left'),
    wrap: format?.wrap ?? false,
    numberFormat: format?.numberFormat ?? defaultNumberFormat(row, column),
  }
}

function summarizeFormats(
  selection: CellRange | null,
  activeCell: CellAddress,
  formats: ReadonlyMap<string, CellFormat>,
) {
  const range = selection ?? DEFAULT_SELECTION
  const base = rangeContainsAddress(range, activeCell)
    ? activeCell
    : { row: range.rowStart, column: range.columnStart }
  const format = getEffectiveFormat(
    base.row,
    base.column,
    formats.get(cellKey(base.row, base.column)),
  )
  const mixed = new Set<keyof ResolvedCellFormat>()
  forEachRangeCell(range, (row, column) => {
    const candidate = getEffectiveFormat(row, column, formats.get(cellKey(row, column)))
    for (const key of FORMAT_KEYS) {
      if (candidate[key] !== format[key]) mixed.add(key)
    }
  })
  return { format, mixed }
}

function resolveCellStyle(
  row: number,
  column: number,
  value: SpreadsheetCellValue,
  format: ResolvedCellFormat,
  scale: number,
): InsightCellVisualStyle {
  const style: InsightCellVisualStyle = {
    color: format.color,
    backgroundColor: format.fill,
    fontFamily: `${format.fontFamily}, Inter, ui-sans-serif, system-ui, sans-serif`,
    fontSize: Math.max(8, format.fontSize * scale),
    fontWeight: format.bold ? 700 : undefined,
    fontStyle: format.italic ? 'italic' : undefined,
    textDecoration: format.underline ? 'underline' : undefined,
    horizontalAlign: format.align,
    wrap: format.wrap,
    paddingInline: 8,
  }
  if (row >= 2 && row <= 13 && column === 6 && typeof value === 'number') {
    style.color = value < 0 ? '#b42318' : '#18794e'
    style.fontWeight = 650
  }
  return style
}

function defaultNumberFormat(row: number, column: number): SpreadsheetNumberFormat {
  if (row >= 2 && column >= 3 && column <= 4) return 'currency'
  if (row >= 2 && column >= 5 && column <= 6) return 'percent'
  return 'general'
}

function statusTone(value: string): 'track' | 'ahead' | 'watch' {
  const normalized = value.toLowerCase()
  if (normalized.includes('ahead') || normalized.includes('超预期')) return 'ahead'
  if (normalized.includes('watch') || normalized.includes('关注') || normalized.includes('风险')) return 'watch'
  return 'track'
}

function forEachRangeCell(range: CellRange, callback: (row: number, column: number) => void) {
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    for (let column = range.columnStart; column <= range.columnEnd; column += 1) callback(row, column)
  }
}

function rangeToMatrix<T>(range: CellRange, getValue: (row: number, column: number) => T): T[][] {
  return Array.from({ length: range.rowEnd - range.rowStart + 1 }, (_, rowOffset) => (
    Array.from({ length: range.columnEnd - range.columnStart + 1 }, (_, columnOffset) => (
      getValue(range.rowStart + rowOffset, range.columnStart + columnOffset)
    ))
  ))
}

function singleCellRange(address: CellAddress): CellRange {
  return {
    rowStart: address.row,
    rowEnd: address.row,
    columnStart: address.column,
    columnEnd: address.column,
  }
}

function createSelectionEndpoints(
  range: CellRange,
  active: CellAddress,
  kind: SelectionKind,
): SelectionEndpoints {
  if (kind === 'column') {
    return {
      anchor: { row: active.row, column: range.columnStart },
      focus: { row: active.row, column: range.columnEnd },
    }
  }
  if (kind === 'row') {
    return {
      anchor: { row: range.rowStart, column: active.column },
      focus: { row: range.rowEnd, column: active.column },
    }
  }
  if (kind === 'sheet') return { anchor: active, focus: active }
  return {
    anchor: { row: range.rowStart, column: range.columnStart },
    focus: { row: range.rowEnd, column: range.columnEnd },
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

function isSingleCellRange(range: CellRange): boolean {
  return range.rowStart === range.rowEnd && range.columnStart === range.columnEnd
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

function shallowEqualFormat(left: CellFormat, right: CellFormat): boolean {
  return Object.keys({ ...left, ...right }).every((key) => (
    left[key as keyof CellFormat] === right[key as keyof CellFormat]
  ))
}
