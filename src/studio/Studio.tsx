import {
  Activity,
  Braces,
  Check,
  ChevronDown,
  Clipboard,
  Columns3,
  Download,
  FileJson2,
  Gauge,
  Grid2X2,
  Image,
  Keyboard,
  Layers3,
  LayoutDashboard,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RefreshCw,
  RotateCcw,
  Rows3,
  Settings2,
  Sparkles,
  Table2,
  TreePine,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react'
import {
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type Locale,
  type MessageKey,
  type Translate,
  useI18n,
} from '../i18n'
import type {
  StudioChangeMeta,
  StudioDensity,
  StudioExportFormat,
  StudioPerformanceMetrics,
  StudioProps,
  StudioScenario,
  StudioTableConfig,
} from './types'
import { DEFAULT_STUDIO_CONFIG } from './types'
import { writeTextToClipboard } from '../utils/clipboard'
import './studio.css'

type InspectorTab = 'props' | 'json'

interface ScenarioOption {
  value: StudioScenario
  labelKey: MessageKey
  detailKey: MessageKey
  icon: typeof LayoutDashboard
  patch: Partial<StudioTableConfig>
}

interface ScalePreset {
  id: string
  labelKey: MessageKey
  detail: string
  patch: Partial<StudioTableConfig>
  mergedCellCount: number
}

const SCENARIOS: ScenarioOption[] = [
  {
    value: 'capabilities',
    labelKey: 'scenario.capabilities',
    detailKey: 'scenario.capabilities.detail',
    icon: Layers3,
    patch: {
      scenario: 'capabilities',
      mergedCellCount: 0,
      showGridLines: false,
      stripedRows: false,
      showRowNumbers: false,
    },
  },
  {
    value: 'analysis',
    labelKey: 'scenario.analysis',
    detailKey: 'scenario.analysis.detail',
    icon: LayoutDashboard,
    patch: {
      scenario: 'analysis',
      mergedCellCount: 0,
      rowHeight: 42,
      frozenTopRows: 1,
      frozenLeftColumns: 2,
      showGridLines: true,
      stripedRows: true,
      showRowNumbers: true,
    },
  },
  {
    value: 'tree',
    labelKey: 'scenario.tree',
    detailKey: 'scenario.tree.detail',
    icon: TreePine,
    patch: {
      scenario: 'tree',
      mergedCellCount: 0,
      rowHeight: 42,
      frozenTopRows: 1,
      frozenLeftColumns: 1,
      showGridLines: false,
      stripedRows: false,
      showRowNumbers: false,
    },
  },
  {
    value: 'conditional',
    labelKey: 'scenario.conditional',
    detailKey: 'scenario.conditional.detail',
    icon: Sparkles,
    patch: {
      scenario: 'conditional',
      mergedCellCount: 0,
      rowHeight: 38,
      frozenTopRows: 1,
      frozenLeftColumns: 1,
      showGridLines: false,
      stripedRows: false,
      showRowNumbers: false,
    },
  },
  {
    value: 'merged',
    labelKey: 'scenario.merged',
    detailKey: 'scenario.merged.detail',
    icon: Grid2X2,
    patch: {
      scenario: 'merged',
      rowCount: 100_000,
      columnCount: 100_000,
      mergedCellCount: 12_000,
      rowHeight: 38,
      frozenTopRows: 0,
      frozenLeftColumns: 0,
      showGridLines: true,
      stripedRows: false,
      showRowNumbers: false,
    },
  },
]

const SCALE_PRESETS: ScalePreset[] = [
  {
    id: 'everyday',
    labelKey: 'preset.everyday',
    detail: '1K × 40',
    patch: { rowCount: 1_000, columnCount: 40 },
    mergedCellCount: 24,
  },
  {
    id: 'wide',
    labelKey: 'preset.wide',
    detail: '10K × 2K',
    patch: { rowCount: 10_000, columnCount: 2_000 },
    mergedCellCount: 600,
  },
  {
    id: 'maximum',
    labelKey: 'preset.maximum',
    detail: '100K × 100K',
    patch: { rowCount: 100_000, columnCount: 100_000 },
    mergedCellCount: 12_000,
  },
  {
    id: 'merge-stress',
    labelKey: 'preset.merged',
    detail: '12K merges',
    patch: {
      scenario: 'merged',
      rowCount: 100_000,
      columnCount: 100_000,
    },
    mergedCellCount: 12_000,
  },
]

const NUMBER_LIMITS: Partial<
  Record<keyof StudioTableConfig, { min: number; max: number }>
> = {
  rowCount: { min: 1, max: 100_000 },
  columnCount: { min: 1, max: 100_000 },
  mergedCellCount: { min: 0, max: 100_000 },
  rowHeight: { min: 20, max: 120 },
  columnWidth: { min: 48, max: 480 },
  overscanRows: { min: 0, max: 50 },
  overscanColumns: { min: 0, max: 30 },
  frozenTopRows: { min: 0, max: 50 },
  frozenBottomRows: { min: 0, max: 50 },
  frozenLeftColumns: { min: 0, max: 50 },
  frozenRightColumns: { min: 0, max: 50 },
}

const INTEGER_FIELDS = new Set<keyof StudioTableConfig>([
  'rowCount',
  'columnCount',
  'mergedCellCount',
  'overscanRows',
  'overscanColumns',
  'frozenTopRows',
  'frozenBottomRows',
  'frozenLeftColumns',
  'frozenRightColumns',
])

const BOOLEAN_FIELDS: readonly (keyof StudioTableConfig)[] = [
  'fitColumns',
  'autoRowHeight',
  'showGridLines',
  'stripedRows',
  'showRowNumbers',
  'treeExpandedByDefault',
]

function formatCompactNumber(value: number | undefined, locale: Locale): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  return Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function serializeConfig(value: StudioTableConfig): string {
  return JSON.stringify(value, null, 2)
}

function normalizeConfig<TConfig extends StudioTableConfig>(
  candidate: unknown,
  current: TConfig,
  t: Translate,
): TConfig {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error(t('error.propsObject'))
  }

  const next = { ...current, ...(candidate as Partial<TConfig>) }
  const scenarios: StudioScenario[] = ['capabilities', 'analysis', 'tree', 'conditional', 'merged']
  const densities: StudioDensity[] = ['compact', 'comfortable', 'relaxed']

  if (!scenarios.includes(next.scenario)) {
    throw new Error(t('error.scenario'))
  }
  if (!densities.includes(next.density)) {
    throw new Error(t('error.density'))
  }

  for (const [key, limit] of Object.entries(NUMBER_LIMITS)) {
    const fieldValue = next[key as keyof TConfig]
    if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue)) {
      throw new Error(t('error.number', { key }))
    }
    if (INTEGER_FIELDS.has(key as keyof StudioTableConfig) && !Number.isSafeInteger(fieldValue)) {
      throw new Error(t('error.integer', { key }))
    }
    if (fieldValue < limit.min || fieldValue > limit.max) {
      throw new Error(t('error.range', { key, min: limit.min, max: limit.max }))
    }
  }

  for (const key of BOOLEAN_FIELDS) {
    if (typeof next[key] !== 'boolean') throw new Error(t('error.boolean', { key }))
  }

  return next
}

function EmptyRenderArea(): ReactNode {
  const { t } = useI18n()
  return (
    <div className="studio-empty-stage">
      <div className="studio-empty-grid" aria-hidden="true">
        {Array.from({ length: 54 }, (_, index) => (
          <span key={index} className={index === 11 ? 'is-active' : undefined} />
        ))}
      </div>
      <div className="studio-empty-card">
        <span className="studio-empty-icon">
          <Table2 size={22} strokeWidth={1.8} />
        </span>
        <strong>{t('studio.empty.title')}</strong>
        <p>{t('studio.empty.body')}</p>
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  hint?: string
  children: ReactNode
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="studio-field">
      <span className="studio-field-label">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </span>
      {children}
    </label>
  )
}

interface NumberFieldProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => setDraft(String(value)), [value])

  const commitDraft = () => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    const stepped = Number.isInteger(step) ? Math.round(parsed) : parsed
    const next = Math.min(max, Math.max(min, stepped))
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  return (
    <Field label={label}>
      <span className="studio-number-control">
        <input
          type="number"
          value={draft}
          min={min}
          max={max}
          step={step}
          inputMode={Number.isInteger(step) ? 'numeric' : 'decimal'}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setDraft(String(value))
              event.currentTarget.blur()
            }
          }}
        />
        {suffix ? <span>{suffix}</span> : null}
      </span>
    </Field>
  )
}

interface ToggleFieldProps {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function ToggleField({ label, hint, checked, onChange }: ToggleFieldProps) {
  return (
    <label className="studio-toggle-field">
      <span>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="studio-switch" aria-hidden="true">
        <span />
      </span>
    </label>
  )
}

interface ConfigSectionProps {
  icon: typeof Rows3
  title: string
  detail?: string
  children: ReactNode
  open?: boolean
}

function ConfigSection({ icon: Icon, title, detail, children, open = true }: ConfigSectionProps) {
  return (
    <details className="studio-config-section" open={open}>
      <summary>
        <span className="studio-section-icon">
          <Icon size={16} />
        </span>
        <span>
          <strong>{title}</strong>
          {detail ? <small>{detail}</small> : null}
        </span>
        <ChevronDown className="studio-section-chevron" size={16} />
      </summary>
      <div className="studio-section-content">{children}</div>
    </details>
  )
}

interface PerformanceHudProps {
  metrics?: StudioPerformanceMetrics
  statusLabel: string
  onClose: () => void
}

function PerformanceHud({ metrics, statusLabel, onClose }: PerformanceHudProps) {
  const { locale, t } = useI18n()
  const fps = metrics?.fps
  const healthy = metrics?.jankRatio === undefined || metrics.jankRatio <= 0.12
  const sampleState = metrics?.sampleState ?? 'warming'
  const metricItems = [
    { label: t('studio.diagnostics.raf'), value: fps === undefined ? t('studio.sampling') : `${Math.round(fps)} Hz` },
    {
      label: t('studio.diagnostics.p95'),
      value: metrics?.frameTimeP95Ms === undefined ? '—' : `${metrics.frameTimeP95Ms.toFixed(1)} ms`,
    },
    { label: t('studio.diagnostics.cells'), value: formatCompactNumber(metrics?.renderedCells, locale) },
    {
      label: t('studio.diagnostics.visible'),
      value:
        metrics?.visibleRows === undefined || metrics.visibleColumns === undefined
          ? '—'
          : `${metrics.visibleRows} × ${metrics.visibleColumns}`,
    },
  ]

  return (
    <section className="studio-performance-hud" aria-label={t('studio.diagnostics')}>
      <div className="studio-hud-head">
        <span>
          <span className="studio-hud-icon"><Activity size={15} /></span>
          <span>
            <strong>{t('studio.diagnostics')}</strong>
            <small>{t('studio.diagnostics.source')}</small>
          </span>
        </span>
        <div>
          <em className={healthy ? 'is-healthy' : 'is-warn'}>
            {statusLabel} · {t(`studio.diagnostics.${sampleState}` as MessageKey)}
          </em>
          <button type="button" onClick={onClose} aria-label={t('studio.diagnostics.close')}>
            <X size={15} />
          </button>
        </div>
      </div>
      <div className="studio-hud-metrics">
        {metricItems.map((item) => (
          <span key={item.label}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
          </span>
        ))}
      </div>
      <p>{t('studio.diagnostics.note')}</p>
    </section>
  )
}

export function Studio<TConfig extends StudioTableConfig = StudioTableConfig>({
  value,
  defaultValue,
  onChange,
  renderStage,
  metrics,
  status = 'ready',
  error,
  isLoading = false,
  title = 'UltiGrid',
  subtitle = 'Performance Studio',
  className,
  onRetry,
  onExport,
  toolbarActions,
}: StudioProps<TConfig>) {
  const { locale, setLocale, t } = useI18n()
  const [internalValue, setInternalValue] = useState<TConfig>(
    () => ({ ...DEFAULT_STUDIO_CONFIG, ...defaultValue }) as TConfig,
  )
  const config = value ?? internalValue
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('props')
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [inspectorWidth, setInspectorWidth] = useState(410)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState<string | null>(null)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState<StudioExportFormat | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [jsonDraft, setJsonDraft] = useState(() => serializeConfig(config))
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const studioId = useId()
  const propsTabId = `${studioId}-tab-props`
  const jsonTabId = `${studioId}-tab-json`
  const propsPanelId = `${studioId}-panel-props`
  const jsonPanelId = `${studioId}-panel-json`
  const jsonStatusId = `${studioId}-json-status`
  const jsonFocusedRef = useRef(false)
  const copyTimerRef = useRef<number | null>(null)
  const latestConfigRef = useRef(config)
  const inspectorToggleRef = useRef<HTMLButtonElement>(null)
  const inspectorCloseRef = useRef<HTMLButtonElement>(null)
  const previousInspectorOpenRef = useRef(inspectorOpen)
  const exportTriggerRef = useRef<HTMLButtonElement>(null)
  const exportPopoverRef = useRef<HTMLDivElement>(null)
  const stageShellRef = useRef<HTMLElement>(null)
  latestConfigRef.current = config

  const commit = useCallback(
    (next: TConfig, meta: StudioChangeMeta) => {
      latestConfigRef.current = next
      if (value === undefined) setInternalValue(next)
      onChange?.(next, meta)
    },
    [onChange, value],
  )

  const patchConfig = useCallback(
    (patch: Partial<TConfig>, source: StudioChangeMeta['source'] = 'control') => {
      const key = Object.keys(patch)[0]
      commit({ ...latestConfigRef.current, ...patch }, { source, key })
    },
    [commit],
  )

  const resetConfig = useCallback(() => {
    const next = { ...DEFAULT_STUDIO_CONFIG, ...defaultValue } as TConfig
    commit(next, { source: 'reset' })
    setJsonDraft(serializeConfig(next))
    setJsonError(null)
  }, [commit, defaultValue])

  useEffect(() => {
    if (!jsonFocusedRef.current) {
      setJsonDraft(serializeConfig(config))
      setJsonError(null)
    }
  }, [config])

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    const previous = previousInspectorOpenRef.current
    previousInspectorOpenRef.current = inspectorOpen
    if (previous === inspectorOpen) return
    requestAnimationFrame(() => {
      if (inspectorOpen) inspectorCloseRef.current?.focus()
      else inspectorToggleRef.current?.focus()
    })
  }, [inspectorOpen])

  useEffect(() => {
    if (!exportOpen) return
    requestAnimationFrame(() => {
      exportPopoverRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    })
  }, [exportOpen])

  useEffect(() => {
    const syncFullscreen = () => {
      const active = document.fullscreenElement === stageShellRef.current
      setIsFullscreen(active)
      if (active) setFullscreenError(null)
    }

    syncFullscreen()
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const target = stageShellRef.current
    if (!target) {
      setFullscreenError(t('studio.fullscreen.failed'))
      return
    }

    if (fallbackFullscreen) {
      setFallbackFullscreen(false)
      setFullscreenError(null)
      return
    }

    try {
      if (document.fullscreenElement === target) {
        await document.exitFullscreen()
      } else if (document.fullscreenElement === null && document.fullscreenEnabled && target.requestFullscreen) {
        await target.requestFullscreen()
      } else {
        setFallbackFullscreen(true)
        setFullscreenError(null)
      }
    } catch {
      setFallbackFullscreen(true)
      setFullscreenError(null)
    }
  }, [fallbackFullscreen, t])

  const applyJson = useCallback(
    (draft = jsonDraft) => {
      try {
        const next = normalizeConfig<TConfig>(JSON.parse(draft), latestConfigRef.current, t)
        commit(next, { source: 'json' })
        setJsonDraft(serializeConfig(next))
        setJsonError(null)
        return true
      } catch (reason) {
        setJsonError(reason instanceof Error ? reason.message : t('error.json'))
        return false
      }
    },
    [commit, jsonDraft, t],
  )

  const handleJsonChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextDraft = event.target.value
    setJsonDraft(nextDraft)
    try {
      normalizeConfig<TConfig>(JSON.parse(nextDraft), latestConfigRef.current, t)
      setJsonError(null)
    } catch (reason) {
      setJsonError(reason instanceof Error ? reason.message : t('error.json'))
    }
  }

  const discardJsonDraft = () => {
    setJsonDraft(serializeConfig(latestConfigRef.current))
    setJsonError(null)
  }

  const handleCopy = async () => {
    try {
      await writeTextToClipboard(jsonDraft)
      setCopied(true)
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setJsonError(t('error.copy'))
    }
  }

  const closeExport = useCallback((restoreFocus = true) => {
    setExportOpen(false)
    if (restoreFocus) requestAnimationFrame(() => exportTriggerRef.current?.focus())
  }, [])

  const runExport = async (format: StudioExportFormat) => {
    if (!onExport || exporting) return
    setExportOpen(false)
    setExportError(null)
    setExporting(format)
    try {
      await onExport(format, config)
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : t('error.export'))
    } finally {
      setExporting(null)
      requestAnimationFrame(() => exportTriggerRef.current?.focus())
    }
  }

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = inspectorWidth
      const onMove = (moveEvent: globalThis.PointerEvent) => {
        setInspectorWidth(Math.min(520, Math.max(340, startWidth + startX - moveEvent.clientX)))
      }
      const onEnd = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onEnd)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onEnd, { once: true })
    },
    [inspectorWidth],
  )

  const handleKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
      event.preventDefault()
      setInspectorOpen((open) => !open)
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === '0') {
      event.preventDefault()
      resetConfig()
    }
    if (event.key === 'Escape') {
      if (exportOpen) closeExport()
      else if (diagnosticsOpen) setDiagnosticsOpen(false)
      else if (fallbackFullscreen) setFallbackFullscreen(false)
    }
  }

  const renderContext = useMemo(
    () => ({ config, patchConfig: (patch: Partial<TConfig>) => patchConfig(patch), status }),
    [config, patchConfig, status],
  )

  const activeScenario = SCENARIOS.find((item) => item.value === config.scenario) ?? SCENARIOS[0]!
  const activePreset = SCALE_PRESETS.find(
    (preset) =>
      preset.patch.rowCount === config.rowCount &&
      preset.patch.columnCount === config.columnCount &&
      (config.scenario === 'merged' ? preset.mergedCellCount : 0) === config.mergedCellCount &&
      !(config.scenario === 'merged' && preset.id === 'maximum') &&
      (preset.patch.scenario === undefined || preset.patch.scenario === config.scenario),
  )
  const stageStatus = error
    ? t('studio.status.error')
    : isLoading || status === 'rendering'
      ? t('studio.status.rendering')
      : t('studio.status.live')
  const jsonDirty = jsonDraft !== serializeConfig(config)
  const sampledExport = config.rowCount > 2_000 || config.columnCount > 128
  const studioClassName = [
    'table-studio',
    inspectorOpen ? 'has-inspector' : 'is-inspector-hidden',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
  const studioStyle = {
    '--studio-inspector-width': `${inspectorWidth}px`,
  } as CSSProperties

  return (
    <main
      className={studioClassName}
      style={studioStyle}
      onKeyDown={handleKeyboard}
      data-inspector-open={inspectorOpen}
    >
      <header className="studio-topbar">
        <div className="studio-brand">
          <span className="studio-brand-mark" aria-hidden="true">
            <Grid2X2 size={20} strokeWidth={1.8} />
          </span>
          <span className="studio-brand-copy">
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </span>
          <span className="studio-alpha-badge">ALPHA</span>
        </div>

        <nav className="studio-scenarios" aria-label={t('studio.scenarios')}>
          {SCENARIOS.map(({ value: scenario, labelKey, detailKey, icon: Icon, patch }) => (
            <button
              type="button"
              key={scenario}
              data-scenario={scenario}
              className={config.scenario === scenario ? 'is-active' : undefined}
              onClick={() => patchConfig(patch as Partial<TConfig>)}
              aria-pressed={config.scenario === scenario}
              title={t(detailKey)}
            >
              <Icon size={15} />
              <span>{t(labelKey)}</span>
            </button>
          ))}
        </nav>

        <div className="studio-top-actions">
          {toolbarActions}
          <span className="studio-locale-switch" role="group" aria-label={t('locale.label')}>
            <button
              type="button"
              className={locale === 'zh-CN' ? 'is-active' : undefined}
              aria-pressed={locale === 'zh-CN'}
              onClick={() => setLocale('zh-CN')}
            >
              中
            </button>
            <button
              type="button"
              className={locale === 'en-US' ? 'is-active' : undefined}
              aria-pressed={locale === 'en-US'}
              onClick={() => setLocale('en-US')}
            >
              EN
            </button>
          </span>
          <button
            type="button"
            className="studio-icon-button studio-reset-button"
            onClick={resetConfig}
            title={`${t('studio.reset')} (⌘⇧0)`}
            aria-label={t('studio.reset')}
          >
            <RotateCcw size={16} />
          </button>
          <div
            className="studio-export-menu"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setExportOpen(false)
            }}
          >
            <button
              ref={exportTriggerRef}
              data-testid="studio-export-trigger"
              type="button"
              className="studio-action-button"
              aria-haspopup="dialog"
              aria-expanded={exportOpen}
              aria-label={t('studio.export')}
              disabled={!onExport || Boolean(exporting)}
              onClick={() => setExportOpen((open) => !open)}
            >
              <Download size={16} />
              <span>{exporting ? t('studio.exporting', { format: exporting.toUpperCase() }) : t('studio.export')}</span>
              <ChevronDown size={14} />
            </button>
            <div
              ref={exportPopoverRef}
              className={`studio-export-popover ${exportOpen ? 'is-open' : ''}`}
              role="dialog"
              aria-label={t('studio.export.dialog')}
            >
              <div className="studio-export-head">
                <span><strong>{t('studio.export.title')}</strong><small>{t('studio.export.subtitle')}</small></span>
                <button type="button" onClick={() => closeExport()} aria-label={t('studio.export.close')}>
                  <X size={14} />
                </button>
              </div>
              {sampledExport ? (
                <p className="studio-export-note">
                  {t('studio.export.sample')}
                </p>
              ) : null}
              <button type="button" onClick={() => void runExport('xlsx')}>
                <FileJson2 size={17} />
                <span><strong>{t('studio.export.excel')}</strong><small>{t('studio.export.excel.detail')}</small></span>
              </button>
              <button type="button" onClick={() => void runExport('png')}>
                <Image size={17} />
                <span><strong>{t('studio.export.image')}</strong><small>{t('studio.export.image.detail')}</small></span>
              </button>
              <button type="button" onClick={() => void runExport('csv')}>
                <Braces size={17} />
                <span><strong>{t('studio.export.csv')}</strong><small>{t('studio.export.csv.detail')}</small></span>
              </button>
              {exportError ? <p className="studio-export-error" role="alert">{exportError}</p> : null}
            </div>
          </div>
          <button
            ref={inspectorToggleRef}
            type="button"
            className="studio-icon-button studio-inspector-toggle"
            onClick={() => setInspectorOpen((open) => !open)}
            title={`${t('studio.inspector.toggle')} (⌘\)`}
            aria-label={inspectorOpen ? t('studio.inspector.collapse') : t('studio.inspector.expand')}
            aria-expanded={inspectorOpen}
          >
            {inspectorOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </div>
      </header>

      <section className="studio-workspace">
        <section
          ref={stageShellRef}
          className={`studio-stage-shell ${fallbackFullscreen ? 'is-fallback-fullscreen' : ''}`}
          aria-label={t('studio.stage.label')}
        >
          <div className="studio-stage-toolbar">
            <div className="studio-stage-title">
              <span className="studio-live-dot" />
              <span>
                <strong>UltiGrid Insight</strong>
                <small>{t(activeScenario.labelKey)} · {t(activeScenario.detailKey)}</small>
              </span>
            </div>

            <div className="studio-stage-controls">
              {config.scenario === 'capabilities' ? (
                <span className="studio-package-pair">
                  <span>@ultigrid/core</span>
                  <i aria-hidden="true" />
                  <span>@ultigrid/insight</span>
                </span>
              ) : (
                <>
                  <label className="studio-scale-picker">
                    <span>{t('studio.scale')}</span>
                    <select
                      value={activePreset?.id ?? 'custom'}
                      onChange={(event) => {
                        const preset = SCALE_PRESETS.find((item) => item.id === event.target.value)
                        if (preset) {
                          const mergedCellCount = (
                            config.scenario === 'merged' || preset.patch.scenario === 'merged'
                          ) ? preset.mergedCellCount : 0
                          patchConfig({ ...preset.patch, mergedCellCount } as Partial<TConfig>, 'preset')
                        }
                      }}
                      aria-label={t('studio.scale.preset')}
                    >
                      {!activePreset ? <option value="custom">{t('preset.custom')}</option> : null}
                      {SCALE_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {t(preset.labelKey)} · {preset.detail}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} aria-hidden="true" />
                  </label>
                  <button
                    type="button"
                    className="studio-metrics-trigger"
                    data-testid="studio-diagnostics-trigger"
                    onClick={() => setDiagnosticsOpen((open) => !open)}
                    aria-expanded={diagnosticsOpen}
                  >
                    <Activity size={14} />
                    <span>{metrics?.fps === undefined ? t('studio.sampling') : `rAF ${Math.round(metrics.fps)} Hz`}</span>
                    <i className={metrics?.jankRatio === undefined || metrics.jankRatio <= 0.12 ? 'is-healthy' : 'is-warn'} />
                  </button>
                </>
              )}
              <button
                type="button"
                className="studio-icon-button"
                data-testid="studio-fullscreen-trigger"
                aria-pressed={isFullscreen || fallbackFullscreen}
                onClick={() => void toggleFullscreen()}
                title={isFullscreen || fallbackFullscreen ? t('studio.fullscreen.exit') : t('studio.fullscreen.enter')}
                aria-label={isFullscreen || fallbackFullscreen ? t('studio.fullscreen.exit') : t('studio.fullscreen.enter')}
              >
                {isFullscreen || fallbackFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              {fullscreenError ? <span className="studio-fullscreen-error" role="status">{fullscreenError}</span> : null}
            </div>
          </div>

          <div
            className="studio-stage-viewport"
            aria-busy={isLoading || status === 'rendering'}
          >
            {diagnosticsOpen ? (
              <PerformanceHud
                metrics={metrics}
                statusLabel={stageStatus}
                onClose={() => setDiagnosticsOpen(false)}
              />
            ) : null}
            {error ? (
              <div className="studio-stage-error" role="alert">
                <span><TriangleAlert size={24} /></span>
                <strong>{t('studio.render.failed')}</strong>
                <p>{error}</p>
                {onRetry ? (
                  <button type="button" onClick={onRetry}>
                    <RefreshCw size={15} /> {t('studio.render.retry')}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="studio-render-area">
                {renderStage?.(renderContext) ?? <EmptyRenderArea />}
              </div>
            )}
            {isLoading ? (
              <div className="studio-loading-layer" role="status" aria-live="polite">
                <span className="studio-spinner" />
                <strong>{t('studio.render.loading')}</strong>
                <small>{t('studio.render.loading.detail')}</small>
              </div>
            ) : null}
          </div>

          <footer className="studio-stage-statusbar">
            {config.scenario === 'capabilities' ? (
              <>
                <span><Layers3 size={13} /> @ultigrid/core</span>
                <span>@ultigrid/insight</span>
                <span className="studio-status-spacer" />
                <span>React · TypeScript · DOM</span>
              </>
            ) : (
              <>
                <span><Zap size={13} /> Windowed DOM</span>
                <span>{t('studio.status.merges', { count: formatCompactNumber(config.mergedCellCount, locale) })}</span>
                <span>{t('studio.status.pinnedRows', { count: config.frozenTopRows + config.frozenBottomRows })}</span>
                <span>{t('studio.status.pinnedColumns', { count: config.frozenLeftColumns + config.frozenRightColumns })}</span>
                <span className="studio-status-spacer" />
                {metrics?.scrollVelocity !== undefined ? <span>{t('studio.status.scroll', { count: Math.round(metrics.scrollVelocity) })}</span> : null}
                <span>{t('studio.status.cells', { count: metrics?.renderedCells ?? '—' })}</span>
              </>
            )}
          </footer>
        </section>

        {inspectorOpen ? (
          <button
            type="button"
            className="studio-inspector-scrim"
            aria-label={t('studio.inspector.close')}
            onClick={() => setInspectorOpen(false)}
          />
        ) : null}

        <aside
          className="studio-inspector"
          aria-label={t('studio.inspector.label')}
          data-testid="studio-inspector"
        >
          <button
            type="button"
            className="studio-inspector-resizer"
            data-testid="studio-inspector-resizer"
            aria-label={t('studio.inspector.resize')}
            title={t('studio.inspector.resize.hint')}
            onPointerDown={handleResizeStart}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault()
                setInspectorWidth((width) => Math.min(520, width + 12))
              }
              if (event.key === 'ArrowRight') {
                event.preventDefault()
                setInspectorWidth((width) => Math.max(340, width - 12))
              }
            }}
          />
          <div className="studio-inspector-head">
            <div>
              <span className="studio-inspector-icon"><Settings2 size={17} /></span>
              <span>
                <strong>{t('studio.inspector.title')}</strong>
              </span>
            </div>
            <div className="studio-inspector-head-actions">
              <span className="studio-sync-state"><span /> {t('studio.connected')}</span>
              <button
                ref={inspectorCloseRef}
                type="button"
                className="studio-inspector-close"
                onClick={() => setInspectorOpen(false)}
                aria-label={t('studio.inspector.close')}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div
            className="studio-tab-list"
            role="tablist"
            aria-label={t('studio.editor.mode')}
            aria-orientation="horizontal"
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              const next = inspectorTab === 'props' ? 'json' : 'props'
              setInspectorTab(next)
              requestAnimationFrame(() => document.getElementById(
                next === 'props' ? propsTabId : jsonTabId,
              )?.focus())
            }}
          >
            <button
              id={propsTabId}
              type="button"
              role="tab"
              aria-controls={propsPanelId}
              aria-selected={inspectorTab === 'props'}
              tabIndex={inspectorTab === 'props' ? 0 : -1}
              className={inspectorTab === 'props' ? 'is-active' : undefined}
              onClick={() => setInspectorTab('props')}
            >
              <Settings2 size={15} /> {t('studio.editor.visual')}
            </button>
            <button
              id={jsonTabId}
              data-testid="studio-json-tab"
              type="button"
              role="tab"
              aria-controls={jsonPanelId}
              aria-selected={inspectorTab === 'json'}
              tabIndex={inspectorTab === 'json' ? 0 : -1}
              className={inspectorTab === 'json' ? 'is-active' : undefined}
              onClick={() => setInspectorTab('json')}
            >
              <Braces size={15} /> JSON
              {jsonDirty ? <i aria-label={t('studio.editor.pending')} /> : null}
            </button>
          </div>

          {inspectorTab === 'props' ? (
            <div
              id={propsPanelId}
              className="studio-inspector-scroll"
              role="tabpanel"
              aria-labelledby={propsTabId}
            >
              <div className="studio-config-summary">
                <span>
                  <small>{t('studio.summary.grid')}</small>
                  <strong>{formatCompactNumber(config.rowCount, locale)} × {formatCompactNumber(config.columnCount, locale)}</strong>
                </span>
                <span>
                  <small>{t('studio.summary.scenario')}</small>
                  <strong>{t(activeScenario.labelKey)}</strong>
                </span>
                <span>
                  <small>{t('studio.summary.frozen')}</small>
                  <strong>{config.frozenTopRows + config.frozenBottomRows}R · {config.frozenLeftColumns + config.frozenRightColumns}C</strong>
                </span>
              </div>

              <ConfigSection icon={Gauge} title={t('studio.section.engine')} detail={t('studio.section.engine.detail')}>
                <div className="studio-field-grid">
                  <NumberField
                    label={t('studio.field.rows')}
                    value={config.rowCount}
                    min={1}
                    max={100_000}
                    onChange={(rowCount) => patchConfig({ rowCount } as Partial<TConfig>)}
                  />
                  <NumberField
                    label={t('studio.field.columns')}
                    value={config.columnCount}
                    min={1}
                    max={100_000}
                    onChange={(columnCount) => patchConfig({ columnCount } as Partial<TConfig>)}
                  />
                  <NumberField
                    label={t('studio.field.overscanRows')}
                    value={config.overscanRows}
                    min={0}
                    max={50}
                    onChange={(overscanRows) => patchConfig({ overscanRows } as Partial<TConfig>)}
                  />
                  <NumberField
                    label={t('studio.field.overscanColumns')}
                    value={config.overscanColumns}
                    min={0}
                    max={30}
                    onChange={(overscanColumns) => patchConfig({ overscanColumns } as Partial<TConfig>)}
                  />
                </div>
                <NumberField
                  label={t('studio.field.merges')}
                  value={config.mergedCellCount}
                  min={0}
                  max={100_000}
                  onChange={(mergedCellCount) => patchConfig({ mergedCellCount } as Partial<TConfig>)}
                />
              </ConfigSection>

              <ConfigSection icon={Columns3} title={t('studio.section.frozen')} detail={t('studio.section.frozen.detail')}>
                <div className="studio-pin-layout" aria-hidden="true">
                  <span className="pin-top">TOP {config.frozenTopRows}</span>
                  <span className="pin-left">L {config.frozenLeftColumns}</span>
                  <span className="pin-center"><Grid2X2 size={16} /></span>
                  <span className="pin-right">R {config.frozenRightColumns}</span>
                  <span className="pin-bottom">BOTTOM {config.frozenBottomRows}</span>
                </div>
                <div className="studio-field-grid">
                  <NumberField label={t('studio.field.top')} value={config.frozenTopRows} min={0} max={50} onChange={(frozenTopRows) => patchConfig({ frozenTopRows } as Partial<TConfig>)} />
                  <NumberField label={t('studio.field.bottom')} value={config.frozenBottomRows} min={0} max={50} onChange={(frozenBottomRows) => patchConfig({ frozenBottomRows } as Partial<TConfig>)} />
                  <NumberField label={t('studio.field.left')} value={config.frozenLeftColumns} min={0} max={50} onChange={(frozenLeftColumns) => patchConfig({ frozenLeftColumns } as Partial<TConfig>)} />
                  <NumberField label={t('studio.field.right')} value={config.frozenRightColumns} min={0} max={50} onChange={(frozenRightColumns) => patchConfig({ frozenRightColumns } as Partial<TConfig>)} />
                </div>
              </ConfigSection>

              <ConfigSection icon={Rows3} title={t('studio.section.size')} detail={t('studio.section.size.detail')}>
                <div className="studio-field-grid">
                  <NumberField label={t('studio.field.rowHeight')} value={config.rowHeight} min={20} max={120} suffix="px" onChange={(rowHeight) => patchConfig({ rowHeight } as Partial<TConfig>)} />
                  <NumberField label={t('studio.field.columnWidth')} value={config.columnWidth} min={48} max={480} suffix="px" onChange={(columnWidth) => patchConfig({ columnWidth } as Partial<TConfig>)} />
                </div>
                <Field label={t('studio.field.density')}>
                  <span className="studio-segmented-control" role="group" aria-label={t('studio.field.density')}>
                    {(['compact', 'comfortable', 'relaxed'] as StudioDensity[]).map((density) => (
                      <button
                        type="button"
                        key={density}
                        className={config.density === density ? 'is-active' : undefined}
                        aria-pressed={config.density === density}
                        onClick={() => patchConfig({ density } as Partial<TConfig>)}
                      >
                        {t(`studio.density.${density}` as MessageKey)}
                      </button>
                    ))}
                  </span>
                </Field>
                <ToggleField label={t('studio.field.fitColumns')} hint={t('studio.field.fitColumns.hint')} checked={config.fitColumns} onChange={(fitColumns) => patchConfig({ fitColumns } as Partial<TConfig>)} />
                <ToggleField label={t('studio.field.autoRowHeight')} hint={t('studio.field.autoRowHeight.hint')} checked={config.autoRowHeight} onChange={(autoRowHeight) => patchConfig({ autoRowHeight } as Partial<TConfig>)} />
              </ConfigSection>

              <ConfigSection icon={Sparkles} title={t('studio.section.presentation')} detail={t('studio.section.presentation.detail')} open={false}>
                <ToggleField label={t('studio.field.gridLines')} checked={config.showGridLines} onChange={(showGridLines) => patchConfig({ showGridLines } as Partial<TConfig>)} />
                <ToggleField label={t('studio.field.striped')} checked={config.stripedRows} onChange={(stripedRows) => patchConfig({ stripedRows } as Partial<TConfig>)} />
                <ToggleField label={t('studio.field.rowNumbers')} checked={config.showRowNumbers} onChange={(showRowNumbers) => patchConfig({ showRowNumbers } as Partial<TConfig>)} />
                <ToggleField label={t('studio.field.treeExpanded')} checked={config.treeExpandedByDefault} onChange={(treeExpandedByDefault) => patchConfig({ treeExpandedByDefault } as Partial<TConfig>)} />
              </ConfigSection>
            </div>
          ) : (
            <div
              id={jsonPanelId}
              className="studio-json-panel"
              role="tabpanel"
              aria-labelledby={jsonTabId}
            >
              <div className="studio-json-intro">
                <span><FileJson2 size={17} /></span>
                <div>
                  <strong>{t('studio.json.title')}</strong>
                  <p>{t('studio.json.body')}</p>
                </div>
              </div>
              <div className={`studio-code-editor ${jsonError ? 'has-error' : jsonDirty ? 'is-dirty' : 'is-valid'}`}>
                <div className="studio-code-toolbar">
                  <span>ultigrid.props.json</span>
                  <div>
                    <button type="button" onClick={() => void handleCopy()} title={t('studio.json.copyTitle')}>
                      {copied ? <Check size={14} /> : <Clipboard size={14} />}
                      {copied ? t('studio.json.copied') : t('studio.json.copy')}
                    </button>
                    <button type="button" onClick={discardJsonDraft} disabled={!jsonDirty} title={t('studio.json.discardTitle')}>
                      <RotateCcw size={14} /> {t('studio.json.discard')}
                    </button>
                  </div>
                </div>
                <textarea
                  value={jsonDraft}
                  spellCheck={false}
                  aria-label="UltiGrid Props JSON"
                  aria-invalid={Boolean(jsonError)}
                  aria-describedby={jsonStatusId}
                  onFocus={() => { jsonFocusedRef.current = true }}
                  onBlur={() => { jsonFocusedRef.current = false }}
                  onChange={handleJsonChange}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault()
                      applyJson(jsonDraft)
                    }
                  }}
                />
                <div id={jsonStatusId} className="studio-code-status" role={jsonError ? 'alert' : 'status'}>
                  {jsonError ? (
                    <><TriangleAlert size={14} /><span>{jsonError}</span></>
                  ) : jsonDirty ? (
                    <><Activity size={14} /><span>{t('studio.json.validPending')}</span></>
                  ) : (
                    <><Check size={14} /><span>{t('studio.json.synced')}</span></>
                  )}
                </div>
              </div>
              <div className="studio-json-actions">
                <button type="button" className="studio-secondary-button" onClick={resetConfig}>
                  <RotateCcw size={15} /> {t('studio.json.restore')}
                </button>
                <button
                  type="button"
                  className="studio-primary-button"
                  disabled={!jsonDirty || Boolean(jsonError)}
                  onClick={() => applyJson(jsonDraft)}
                >
                  <Play size={15} fill="currentColor" /> {t('studio.json.apply')}
                  <kbd>⌘↵</kbd>
                </button>
              </div>
            </div>
          )}

          <footer className="studio-shortcuts">
            <span><Keyboard size={14} /> {t('studio.shortcuts')}</span>
            <span><kbd>⌘</kbd><kbd>\</kbd> {t('studio.shortcuts.panel')}</span>
            <span><kbd>⌘</kbd><kbd>⇧</kbd><kbd>0</kbd> {t('studio.shortcuts.reset')}</span>
          </footer>
        </aside>
      </section>
    </main>
  )
}
