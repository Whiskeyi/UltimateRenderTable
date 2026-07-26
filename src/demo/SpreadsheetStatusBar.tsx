import { Minus, Plus, Scissors } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { CellRange } from '@ultigrid/insight'
import { translate, type Locale } from '../i18n'
import { selectionLabel } from './spreadsheetModel'

interface SpreadsheetStatusBarProps {
  locale: Locale
  selection: CellRange | null
  cutSelection: CellRange | null
  summary: string
  zoom: number
  onZoomChange: Dispatch<SetStateAction<number>>
}

export function SpreadsheetStatusBar({
  locale,
  selection,
  cutSelection,
  summary,
  zoom,
  onZoomChange,
}: SpreadsheetStatusBarProps) {
  return (
    <footer className="spreadsheet-sheet-tabs">
      <span className="spreadsheet-sheet-tab">{translate(locale, 'spreadsheet.sheetName')}</span>
      <span className="spreadsheet-active-address">{selectionLabel(selection)}</span>
      {cutSelection ? (
        <span className="spreadsheet-cut-status">
          <Scissors size={11} aria-hidden="true" />
          {translate(locale, 'spreadsheet.cutPendingStatus', { range: selectionLabel(cutSelection) })}
        </span>
      ) : null}
      <span className="spreadsheet-status-spacer" />
      <small>{summary}</small>
      <span className="spreadsheet-footer-zoom">
        <button type="button" aria-label={translate(locale, 'spreadsheet.view.zoomOut')} disabled={zoom <= 80} onClick={() => onZoomChange((current) => Math.max(80, current - 10))}><Minus size={12} /></button>
        <output>{zoom}%</output>
        <button type="button" aria-label={translate(locale, 'spreadsheet.view.zoomIn')} disabled={zoom >= 140} onClick={() => onZoomChange((current) => Math.min(140, current + 10))}><Plus size={12} /></button>
      </span>
    </footer>
  )
}
