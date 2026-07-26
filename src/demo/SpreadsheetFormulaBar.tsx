import { Check, FunctionSquare, X } from 'lucide-react'
import type { RefObject } from 'react'
import type { CellRange } from '@ultigrid/insight'
import { translate, type Locale } from '../i18n'
import { selectionLabel } from './spreadsheetModel'

interface SpreadsheetFormulaBarProps {
  locale: Locale
  selection: CellRange | null
  nameDraft: string
  formulaDraft: string
  formulaEditing: boolean
  inputRef: RefObject<HTMLInputElement | null>
  onNameEditingChange: (editing: boolean) => void
  onNameDraftChange: (draft: string) => void
  onCommitNameBox: (focusGrid: boolean) => void
  onRestoreGridFocus: () => void
  onBeginFormulaEntry: () => void
  onCancel: () => void
  onCommit: (navigation?: 'up' | 'down') => void
  onFormulaEditingChange: (editing: boolean) => void
  onFormulaDraftChange: (draft: string) => void
}

export function SpreadsheetFormulaBar({
  locale,
  selection,
  nameDraft,
  formulaDraft,
  formulaEditing,
  inputRef,
  onNameEditingChange,
  onNameDraftChange,
  onCommitNameBox,
  onRestoreGridFocus,
  onBeginFormulaEntry,
  onCancel,
  onCommit,
  onFormulaEditingChange,
  onFormulaDraftChange,
}: SpreadsheetFormulaBarProps) {
  return (
    <div className="spreadsheet-formula-bar">
      <input
        className="spreadsheet-name-box"
        value={nameDraft}
        aria-label={translate(locale, 'spreadsheet.nameBox')}
        title={translate(locale, 'spreadsheet.nameBoxHint')}
        onFocus={(event) => {
          onNameEditingChange(true)
          event.currentTarget.select()
        }}
        onChange={(event) => onNameDraftChange(event.target.value.toUpperCase())}
        onBlur={() => onCommitNameBox(false)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') {
            event.preventDefault()
            onCommitNameBox(true)
          }
          if (event.key === 'Escape') {
            onNameDraftChange(selectionLabel(selection))
            onNameEditingChange(false)
            onRestoreGridFocus()
          }
        }}
      />
      <button type="button" className="spreadsheet-fx-button" title={translate(locale, 'spreadsheet.insertFunction')} aria-label={translate(locale, 'spreadsheet.insertFunction')} onPointerDown={(event) => event.preventDefault()} onClick={onBeginFormulaEntry}><FunctionSquare size={15} /></button>
      <span className="spreadsheet-formula-actions" aria-hidden={!formulaEditing}>
        <button type="button" disabled={!formulaEditing} aria-label={translate(locale, 'spreadsheet.cancelEdit')} onPointerDown={(event) => event.preventDefault()} onClick={onCancel}><X size={14} /></button>
        <button type="button" disabled={!formulaEditing} aria-label={translate(locale, 'spreadsheet.acceptEdit')} onPointerDown={(event) => event.preventDefault()} onClick={() => {
          onCommit()
          onRestoreGridFocus()
        }}><Check size={14} /></button>
      </span>
      <input
        ref={inputRef}
        className="spreadsheet-formula-input"
        value={formulaDraft}
        aria-label={translate(locale, 'spreadsheet.formulaBar')}
        spellCheck={false}
        onFocus={() => onFormulaEditingChange(true)}
        onChange={(event) => {
          onFormulaEditingChange(true)
          onFormulaDraftChange(event.target.value)
        }}
        onBlur={() => {
          if (formulaEditing) onCommit()
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Enter') {
            event.preventDefault()
            onCommit(event.shiftKey ? 'up' : 'down')
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
      />
    </div>
  )
}
