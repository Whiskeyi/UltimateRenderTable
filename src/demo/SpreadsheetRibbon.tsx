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
  PanelTop,
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
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { translate, type Locale, type MessageKey } from '../i18n'
import type { ResolvedCellFormat } from './spreadsheetFormatting'
import type {
  FormulaName,
  SpreadsheetNumberFormat,
} from './spreadsheetModel'
import type { CellFormat } from './spreadsheetWorkbook'

export type RibbonTab = 'home' | 'formulas' | 'view'
export type RibbonColorMenu = 'text' | 'fill'

interface SpreadsheetMenuProps {
  locale: Locale
  activeTab: RibbonTab
  feedback: string
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onActivateTab: (tab: RibbonTab) => void
  onTabKeyDown: (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    tab: RibbonTab,
  ) => void
}

interface SpreadsheetRibbonProps {
  locale: Locale
  activeTab: RibbonTab
  ribbonRef: RefObject<HTMLDivElement | null>
  activeFormat: ResolvedCellFormat
  mixed: ReadonlySet<keyof ResolvedCellFormat>
  openColorMenu: RibbonColorMenu | null
  recentTextColor: string
  recentFillColor: string
  mergedSelection: boolean
  showGridLines: boolean
  freezeTop: boolean
  showFormulaBar: boolean
  zoom: number
  onToolbarKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  onPaste: () => void | Promise<void>
  onCopy: (cut: boolean) => void | Promise<void>
  onApplyFormat: (patch: Partial<CellFormat>, restoreFocus?: boolean) => void
  onOpenColorMenuChange: (menu: RibbonColorMenu | null) => void
  onTextColorChange: (color: string) => void
  onFillColorChange: (color: string) => void
  onToggleMerge: () => void
  onClearFormats: () => void
  onReset: () => void
  onInsertFunction: (name: FormulaName) => void
  onToggleGridLines: () => void
  onToggleFreezeTop: () => void
  onToggleFormulaBar: () => void
  onZoomChange: Dispatch<SetStateAction<number>>
}

const COLOR_SWATCHES = [
  '#202124', '#ffffff', '#217346', '#0f6cbd', '#5b5fc7', '#b42318', '#d97706',
  '#e7f4eb', '#e8f1fb', '#f0edff', '#fff4ce', '#fde7e9', '#f2f4f2', '#d9e1f2',
] as const

const FORMULA_LABEL_KEYS = {
  SUM: 'spreadsheet.formula.sum',
  AVERAGE: 'spreadsheet.formula.average',
  MIN: 'spreadsheet.formula.min',
  MAX: 'spreadsheet.formula.max',
  COUNT: 'spreadsheet.formula.count',
} satisfies Record<FormulaName, MessageKey>

export function SpreadsheetMenu({
  locale,
  activeTab,
  feedback,
  dirty,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onActivateTab,
  onTabKeyDown,
}: SpreadsheetMenuProps) {
  return (
    <header className="spreadsheet-menu">
      <span className="spreadsheet-book-mark"><Grid2X2 size={15} /> {translate(locale, 'spreadsheet.bookLabel')}</span>
      <span className="spreadsheet-quick-access" role="group" aria-label={translate(locale, 'spreadsheet.group.history')}>
        <ToolbarButton label={translate(locale, 'spreadsheet.undo')} disabled={!canUndo} onClick={onUndo}><Undo2 size={14} /></ToolbarButton>
        <ToolbarButton label={translate(locale, 'spreadsheet.redo')} disabled={!canRedo} onClick={onRedo}><Redo2 size={14} /></ToolbarButton>
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
            onClick={() => onActivateTab(tab)}
            onKeyDown={(event) => onTabKeyDown(event, tab)}
          >
            {translate(locale, `spreadsheet.tab.${tab}`)}
          </button>
        ))}
      </div>
      <span className="spreadsheet-autosave">
        <i /> {feedback || translate(
          locale,
          dirty ? 'spreadsheet.unsaved' : 'spreadsheet.sessionReady',
        )}
      </span>
      <span className="sr-only" role="status" aria-live="polite">{feedback}</span>
    </header>
  )
}

export function SpreadsheetRibbon({
  locale,
  activeTab,
  ribbonRef,
  activeFormat,
  mixed,
  openColorMenu,
  recentTextColor,
  recentFillColor,
  mergedSelection,
  showGridLines,
  freezeTop,
  showFormulaBar,
  zoom,
  onToolbarKeyDown,
  onPaste,
  onCopy,
  onApplyFormat,
  onOpenColorMenuChange,
  onTextColorChange,
  onFillColorChange,
  onToggleMerge,
  onClearFormats,
  onReset,
  onInsertFunction,
  onToggleGridLines,
  onToggleFreezeTop,
  onToggleFormulaBar,
  onZoomChange,
}: SpreadsheetRibbonProps) {
  return (
    <div
      ref={ribbonRef}
      id="spreadsheet-ribbon-panel"
      className="spreadsheet-ribbon"
      role="tabpanel"
      aria-labelledby={`spreadsheet-tab-${activeTab}`}
    >
      <div
        className="spreadsheet-ribbon-toolbar"
        role="toolbar"
        aria-label={translate(locale, 'spreadsheet.toolbar.label')}
        onKeyDown={onToolbarKeyDown}
      >
        {activeTab === 'home' ? (
          <>
            <RibbonGroup label={translate(locale, 'spreadsheet.group.clipboard')} className="spreadsheet-clipboard-group">
              <ToolbarButton variant="large" label={translate(locale, 'spreadsheet.paste')} onClick={() => void onPaste()}><ClipboardPaste /></ToolbarButton>
              <div className="spreadsheet-clipboard-stack">
                <ToolbarButton variant="labeled" label={translate(locale, 'spreadsheet.cut')} onClick={() => void onCopy(true)}><Scissors /></ToolbarButton>
                <ToolbarButton variant="labeled" label={translate(locale, 'spreadsheet.copy')} onClick={() => void onCopy(false)}><Copy /></ToolbarButton>
              </div>
            </RibbonGroup>

            <RibbonGroup label={translate(locale, 'spreadsheet.group.font')} className="spreadsheet-font-group">
              <div className="spreadsheet-ribbon-control-row spreadsheet-font-select-row">
                <label>
                  <span className="sr-only">{translate(locale, 'spreadsheet.font')}</span>
                  <select
                    value={mixed.has('fontFamily') ? '' : activeFormat.fontFamily}
                    onChange={(event) => onApplyFormat({ fontFamily: event.target.value }, false)}
                  >
                    {mixed.has('fontFamily') ? <option value="">—</option> : null}
                    <option>Aptos</option><option>Arial</option><option>Georgia</option><option>Menlo</option>
                  </select>
                  <ChevronDown />
                </label>
                <label className="spreadsheet-size-select">
                  <span className="sr-only">{translate(locale, 'spreadsheet.fontSize')}</span>
                  <select
                    value={mixed.has('fontSize') ? '' : activeFormat.fontSize}
                    onChange={(event) => onApplyFormat({ fontSize: Number(event.target.value) }, false)}
                  >
                    {mixed.has('fontSize') ? <option value="">—</option> : null}
                    {[10, 11, 12, 14, 16, 18, 24].map((size) => <option key={size}>{size}</option>)}
                  </select>
                  <ChevronDown />
                </label>
              </div>
              <div className="spreadsheet-ribbon-control-row spreadsheet-font-command-row">
                <ToolbarButton label={translate(locale, 'spreadsheet.bold')} active={mixed.has('bold') ? 'mixed' : activeFormat.bold} onClick={() => onApplyFormat({ bold: mixed.has('bold') || !activeFormat.bold })}><Bold /></ToolbarButton>
                <ToolbarButton label={translate(locale, 'spreadsheet.italic')} active={mixed.has('italic') ? 'mixed' : activeFormat.italic} onClick={() => onApplyFormat({ italic: mixed.has('italic') || !activeFormat.italic })}><Italic /></ToolbarButton>
                <ToolbarButton label={translate(locale, 'spreadsheet.underline')} active={mixed.has('underline') ? 'mixed' : activeFormat.underline} onClick={() => onApplyFormat({ underline: mixed.has('underline') || !activeFormat.underline })}><Underline /></ToolbarButton>
                <ColorControl
                  menuId="text"
                  label={translate(locale, 'spreadsheet.textColor')}
                  value={recentTextColor}
                  selectedValue={mixed.has('color') ? undefined : activeFormat.color}
                  open={openColorMenu === 'text'}
                  onOpenChange={(open) => onOpenColorMenuChange(open ? 'text' : null)}
                  onChange={onTextColorChange}
                  applyLabel={translate(locale, 'spreadsheet.color.apply', { color: recentTextColor })}
                  paletteLabel={translate(locale, 'spreadsheet.color.palette', { target: translate(locale, 'spreadsheet.textColor') })}
                />
                <ColorControl
                  fill
                  menuId="fill"
                  label={translate(locale, 'spreadsheet.fillColor')}
                  value={recentFillColor}
                  selectedValue={mixed.has('fill') ? undefined : activeFormat.fill}
                  open={openColorMenu === 'fill'}
                  onOpenChange={(open) => onOpenColorMenuChange(open ? 'fill' : null)}
                  onChange={onFillColorChange}
                  applyLabel={translate(locale, 'spreadsheet.fill.apply', { color: recentFillColor })}
                  paletteLabel={translate(locale, 'spreadsheet.color.palette', { target: translate(locale, 'spreadsheet.fillColor') })}
                />
              </div>
            </RibbonGroup>

            <RibbonGroup label={translate(locale, 'spreadsheet.group.alignment')} className="spreadsheet-alignment-group">
              <div className="spreadsheet-ribbon-control-row">
                <ToolbarButton label={translate(locale, 'spreadsheet.alignLeft')} active={mixed.has('align') ? 'mixed' : activeFormat.align === 'left'} onClick={() => onApplyFormat({ align: 'left' })}><AlignLeft /></ToolbarButton>
                <ToolbarButton label={translate(locale, 'spreadsheet.alignCenter')} active={mixed.has('align') ? 'mixed' : activeFormat.align === 'center'} onClick={() => onApplyFormat({ align: 'center' })}><AlignCenter /></ToolbarButton>
                <ToolbarButton label={translate(locale, 'spreadsheet.alignRight')} active={mixed.has('align') ? 'mixed' : activeFormat.align === 'right'} onClick={() => onApplyFormat({ align: 'right' })}><AlignRight /></ToolbarButton>
              </div>
              <div className="spreadsheet-ribbon-control-row">
                <ToolbarButton label={translate(locale, 'spreadsheet.wrap')} active={mixed.has('wrap') ? 'mixed' : activeFormat.wrap} onClick={() => onApplyFormat({ wrap: mixed.has('wrap') || !activeFormat.wrap })}><WrapText /></ToolbarButton>
                <ToolbarButton variant="labeled" label={translate(locale, mergedSelection ? 'spreadsheet.unmerge' : 'spreadsheet.merge')} active={mergedSelection} onClick={onToggleMerge}><Combine /></ToolbarButton>
              </div>
            </RibbonGroup>

            <RibbonGroup label={translate(locale, 'spreadsheet.group.number')} className="spreadsheet-number-group">
              <div className="spreadsheet-ribbon-control-row">
                <label className="spreadsheet-number-select">
                  <span className="sr-only">{translate(locale, 'spreadsheet.numberFormat')}</span>
                  <select
                    aria-label={translate(locale, 'spreadsheet.numberFormat')}
                    value={mixed.has('numberFormat') ? '' : activeFormat.numberFormat}
                    onChange={(event) => {
                      const numberFormat = event.target.value as SpreadsheetNumberFormat | ''
                      if (numberFormat) onApplyFormat({ numberFormat }, false)
                    }}
                  >
                    {mixed.has('numberFormat') ? <option value="">—</option> : null}
                    <option value="general">{translate(locale, 'spreadsheet.numberFormat.general')}</option>
                    <option value="number">{translate(locale, 'spreadsheet.numberFormat.number')}</option>
                    <option value="currency">{translate(locale, 'spreadsheet.numberFormat.currency')}</option>
                    <option value="percent">{translate(locale, 'spreadsheet.numberFormat.percent')}</option>
                  </select>
                  <ChevronDown />
                </label>
              </div>
              <div className="spreadsheet-ribbon-control-row">
                <ToolbarButton label={translate(locale, 'spreadsheet.currency')} onClick={() => onApplyFormat({ numberFormat: 'currency' })}><DollarSign /></ToolbarButton>
                <ToolbarButton label={translate(locale, 'spreadsheet.percent')} onClick={() => onApplyFormat({ numberFormat: 'percent' })}><Percent /></ToolbarButton>
                <ToolbarButton label={translate(locale, 'spreadsheet.number')} onClick={() => onApplyFormat({ numberFormat: 'number' })}><span className="spreadsheet-decimal-icon">.00</span></ToolbarButton>
              </div>
            </RibbonGroup>

            <RibbonGroup label={translate(locale, 'spreadsheet.group.editing')} className="spreadsheet-editing-group">
              <ToolbarButton variant="large" label={translate(locale, 'spreadsheet.clearFormat')} onClick={onClearFormats}><Eraser /></ToolbarButton>
              <ToolbarButton variant="large" label={translate(locale, 'spreadsheet.reset')} onClick={onReset}><RotateCcw /></ToolbarButton>
            </RibbonGroup>
          </>
        ) : null}

        {activeTab === 'formulas' ? (
          <>
            <RibbonGroup label={translate(locale, 'spreadsheet.formula.quick')} className="spreadsheet-formula-group">
              {(['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT'] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  className="spreadsheet-function-button"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => onInsertFunction(name)}
                >
                  <span className="spreadsheet-command-icon"><Sigma /></span>
                  <span><strong>{name}</strong><small>{translate(locale, FORMULA_LABEL_KEYS[name])}</small></span>
                </button>
              ))}
            </RibbonGroup>
            <p className="spreadsheet-ribbon-hint"><FunctionSquare size={17} /> {translate(locale, 'spreadsheet.formula.help')}</p>
          </>
        ) : null}

        {activeTab === 'view' ? (
          <>
            <RibbonGroup label={translate(locale, 'spreadsheet.tab.view')} className="spreadsheet-view-group">
              <ViewToggle active={showGridLines} icon={<Grid2X2 />} label={translate(locale, 'spreadsheet.view.gridlines')} onClick={onToggleGridLines} />
              <ViewToggle active={freezeTop} icon={<PanelTop />} label={translate(locale, 'spreadsheet.view.freeze')} onClick={onToggleFreezeTop} />
              <ViewToggle active={showFormulaBar} icon={<FunctionSquare />} label={translate(locale, 'spreadsheet.view.formulaBar')} onClick={onToggleFormulaBar} />
            </RibbonGroup>
            <RibbonGroup label={translate(locale, 'spreadsheet.view.zoom')} className="spreadsheet-zoom-group">
              <ToolbarButton label={translate(locale, 'spreadsheet.view.zoomOut')} disabled={zoom <= 80} onClick={() => onZoomChange((current) => Math.max(80, current - 10))}><Minus /></ToolbarButton>
              <input aria-label={translate(locale, 'spreadsheet.view.zoom')} type="range" min="80" max="140" step="10" value={zoom} onChange={(event) => onZoomChange(Number(event.target.value))} />
              <output>{zoom}%</output>
              <ToolbarButton label={translate(locale, 'spreadsheet.view.zoomIn')} disabled={zoom >= 140} onClick={() => onZoomChange((current) => Math.min(140, current + 10))}><Plus /></ToolbarButton>
            </RibbonGroup>
          </>
        ) : null}
      </div>
    </div>
  )
}

function RibbonGroup({
  label,
  className = '',
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`spreadsheet-ribbon-group ${className}`.trim()} role="group" aria-label={label}>
      <div className="spreadsheet-ribbon-group__content">{children}</div>
      <small>{label}</small>
    </div>
  )
}

function ToolbarButton({
  label,
  active,
  disabled = false,
  variant = 'icon',
  onClick,
  children,
}: {
  label: string
  active?: boolean | 'mixed'
  disabled?: boolean
  variant?: 'icon' | 'large' | 'labeled'
  onClick: () => void
  children: ReactNode
}) {
  const classes = [
    'spreadsheet-command',
    `spreadsheet-command--${variant}`,
    active ? 'is-active' : '',
    active === 'mixed' ? 'is-mixed' : '',
  ].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      className={classes}
      aria-pressed={active === undefined ? undefined : active}
      title={label}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <span className="spreadsheet-command-icon" aria-hidden="true">{children}</span>
      {variant === 'icon' ? null : <span className="spreadsheet-command-label">{label}</span>}
    </button>
  )
}

function ColorControl({
  menuId,
  label,
  applyLabel,
  paletteLabel,
  value,
  selectedValue,
  fill = false,
  open,
  onOpenChange,
  onChange,
}: {
  menuId: RibbonColorMenu
  label: string
  applyLabel: string
  paletteLabel: string
  value: string
  selectedValue?: string
  fill?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (value: string) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const paletteRef = useRef<HTMLDivElement>(null)
  const [palettePosition, setPalettePosition] = useState({ left: 8, top: 8 })
  const paletteId = `spreadsheet-${menuId}-color-palette`
  const normalizedSelectedValue = selectedValue?.toLowerCase()
  const hasSelectedSwatch = COLOR_SWATCHES.some((color) => color === normalizedSelectedValue)

  const updatePalettePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const triggerBounds = trigger.getBoundingClientRect()
    const paletteWidth = paletteRef.current?.offsetWidth ?? (window.innerWidth <= 600 ? 302 : 190)
    const paletteHeight = paletteRef.current?.offsetHeight ?? (window.innerWidth <= 600 ? 158 : 74)
    const left = Math.min(
      Math.max(8, triggerBounds.left),
      Math.max(8, window.innerWidth - paletteWidth - 8),
    )
    const below = triggerBounds.bottom + 4
    const top = below + paletteHeight <= window.innerHeight - 8
      ? below
      : Math.max(8, triggerBounds.top - paletteHeight - 4)
    setPalettePosition({ left, top })
  }, [])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onOpenChange(false)
      triggerRef.current?.focus()
    }
    updatePalettePosition()
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('scroll', updatePalettePosition, true)
    window.addEventListener('resize', updatePalettePosition)
    const frame = window.requestAnimationFrame(() => {
      updatePalettePosition()
      const selected = paletteRef.current?.querySelector<HTMLButtonElement>(
        '[role="menuitemradio"][aria-checked="true"]',
      )
      const first = paletteRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')
      const focusTarget = selected ?? first
      focusTarget?.focus()
    })
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('scroll', updatePalettePosition, true)
      window.removeEventListener('resize', updatePalettePosition)
    }
  }, [onOpenChange, open, updatePalettePosition])

  const handlePaletteKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== 'ArrowRight'
      && event.key !== 'ArrowLeft'
      && event.key !== 'ArrowDown'
      && event.key !== 'ArrowUp'
      && event.key !== 'Home'
      && event.key !== 'End'
    ) return
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(
      '[role="menuitemradio"]',
    )]
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
    const columnCount = window.getComputedStyle(event.currentTarget)
      .gridTemplateColumns.split(/\s+/).filter(Boolean).length
    const horizontalDelta = event.key === 'ArrowRight' ? 1 : -1
    const verticalDelta = event.key === 'ArrowDown' ? columnCount : -columnCount
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowRight' || event.key === 'ArrowLeft'
          ? (Math.max(0, currentIndex) + horizontalDelta + items.length) % items.length
          : (Math.max(0, currentIndex) + verticalDelta + items.length) % items.length
    event.preventDefault()
    event.stopPropagation()
    items[nextIndex]?.focus()
  }

  return (
    <div ref={rootRef} className={`spreadsheet-color-control ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="spreadsheet-color-apply"
        aria-label={applyLabel}
        title={applyLabel}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => onChange(value)}
      >
        <span className="spreadsheet-command-icon" aria-hidden="true">
          {fill ? <PaintBucket /> : <span className="spreadsheet-font-color">A</span>}
        </span>
        <i aria-hidden="true" style={{ backgroundColor: value }} />
      </button>
      <button
        ref={triggerRef}
        type="button"
        className="spreadsheet-color-menu-trigger"
        aria-label={paletteLabel}
        title={paletteLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={paletteId}
        onClick={() => {
          if (!open) updatePalettePosition()
          onOpenChange(!open)
        }}
      >
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={paletteRef}
          id={paletteId}
          className="spreadsheet-color-palette"
          role="menu"
          aria-label={label}
          style={palettePosition}
          onKeyDown={handlePaletteKeyDown}
        >
          {COLOR_SWATCHES.map((color, index) => {
            const selected = normalizedSelectedValue === color
            return (
              <button
                key={color}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                tabIndex={selected || (!hasSelectedSwatch && index === 0) ? 0 : -1}
                aria-label={`${label} ${color}`}
                style={{ backgroundColor: color }}
                onClick={() => {
                  onChange(color)
                  onOpenChange(false)
                }}
              />
            )
          })}
        </div>
      ) : null}
    </div>
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
    <button
      type="button"
      className={`spreadsheet-view-toggle ${active ? 'is-active' : ''}`}
      aria-pressed={active}
      onPointerDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <span className="spreadsheet-command-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <span className="spreadsheet-view-toggle__check" aria-hidden="true">
        <Check size={13} style={{ visibility: active ? 'visible' : 'hidden' }} />
      </span>
    </button>
  )
}
