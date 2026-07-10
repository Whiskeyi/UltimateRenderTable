import {
  Check,
  Code2,
  Copy,
  RefreshCw,
  X,
} from 'lucide-react'
import {
  Component,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import {
  UltiGridInsight,
  type UltiGridInsightApi,
  type UltiGridInsightLocaleText,
} from '@ultigrid/insight'
import type { ViewportSnapshot } from '@ultigrid/core'
import {
  Studio,
  DEFAULT_STUDIO_CONFIG,
  type StudioExportFormat,
  type StudioPerformanceMetrics,
  type StudioTableConfig,
} from './studio'
import { CapabilityOverview } from './demo/CapabilityOverview'
import { demoSnippets } from './demo/demoSnippets'
import {
  createDemoColumnGetter,
  createDemoMerges,
  createDemoRowSource,
  getDemoColumnWidths,
  getDemoRowHeights,
} from './demo/demoData'
import { translate, useI18n, type Locale, type MessageKey } from './i18n'
import { writeTextToClipboard } from './utils/clipboard'
import './styles/demo.css'

interface ToastState {
  tone: 'success' | 'error'
  message: string
}

class DemoStageErrorBoundary extends Component<
  { children: ReactNode; title: string; retryLabel: string },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The studio keeps the failure local so the props editor remains usable.
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="demo-stage-failure" role="alert">
        <span><X size={18} /></span>
        <strong>{this.props.title}</strong>
        <p>{this.state.error.message}</p>
        <button type="button" onClick={() => this.setState({ error: null })}>
          <RefreshCw size={13} /> {this.props.retryLabel}
        </button>
      </div>
    )
  }
}

export function App() {
  const { locale, t } = useI18n()
  const [config, setConfig] = useState<StudioTableConfig>(() => ({ ...DEFAULT_STUDIO_CONFIG }))
  const tableApiRef = useRef<UltiGridInsightApi | null>(null)
  const snapshotRef = useRef<ViewportSnapshot | null>(null)
  const velocityRef = useRef({
    time: performance.now(),
    lastMovementTime: 0,
    top: 0,
    left: 0,
    value: 0,
  })
  const [metrics, setMetrics] = useState<StudioPerformanceMetrics>({})
  const [toast, setToast] = useState<ToastState | null>(null)
  const [codeOpen, setCodeOpen] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const toastTimerRef = useRef<number | null>(null)
  const codeCopyTimerRef = useRef<number | null>(null)
  const codeTriggerRef = useRef<HTMLButtonElement>(null)
  const codeCloseRef = useRef<HTMLButtonElement>(null)

  const showToast = useCallback((next: ToastState) => {
    setToast(next)
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800)
  }, [])

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    if (codeCopyTimerRef.current !== null) window.clearTimeout(codeCopyTimerRef.current)
  }, [])

  useEffect(() => {
    if (!codeOpen) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setCodeOpen(false)
      requestAnimationFrame(() => codeTriggerRef.current?.focus())
    }
    window.addEventListener('keydown', onKeyDown)
    requestAnimationFrame(() => codeCloseRef.current?.focus())
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [codeOpen])

  useEffect(() => setCodeCopied(false), [config.scenario])

  useEffect(() => {
    let frame = 0
    let previousFrame = 0
    let lastPublish = performance.now()
    let intervals: number[] = []

    const resetSample = () => {
      previousFrame = 0
      intervals = []
      lastPublish = performance.now()
      if (document.visibilityState === 'hidden') {
        setMetrics((current) => ({ ...current, sampleState: 'hidden', fps: undefined }))
      } else {
        setMetrics((current) => ({
          ...current,
          sampleState: 'warming',
          fps: undefined,
          frameTimeMs: undefined,
          frameTimeP95Ms: undefined,
          jankRatio: undefined,
        }))
      }
    }

    const sample = (now: number) => {
      if (document.visibilityState === 'visible') {
        if (previousFrame > 0) {
          const interval = now - previousFrame
          if (interval > 0 && interval < 100) intervals.push(interval)
        }
        previousFrame = now
      }

      if (now - lastPublish >= 1_000 && intervals.length >= 12) {
        const sorted = [...intervals].sort((left, right) => left - right)
        const median = percentile(sorted, 0.5)
        const p95 = percentile(sorted, 0.95)
        const jankRatio = intervals.filter((interval) => interval > median * 1.5).length / intervals.length
        const snapshot = snapshotRef.current
        const scrolling = now - velocityRef.current.lastMovementTime < 180
        setMetrics({
          fps: 1000 / Math.max(1, median),
          frameTimeMs: median,
          frameTimeP95Ms: p95,
          jankRatio,
          sampleState: scrolling ? 'scrolling' : 'idle',
          renderedCells: snapshot?.renderedCellCount,
          visibleRows: snapshot && snapshot.rowStart >= 0
            ? snapshot.rowEnd - snapshot.rowStart + 1
            : undefined,
          visibleColumns: snapshot && snapshot.columnStart >= 0
            ? snapshot.columnEnd - snapshot.columnStart + 1
            : undefined,
          scrollVelocity: scrolling ? velocityRef.current.value : 0,
        })
        intervals = []
        lastPublish = now
      }
      frame = requestAnimationFrame(sample)
    }
    document.addEventListener('visibilitychange', resetSample)
    frame = requestAnimationFrame(sample)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', resetSample)
    }
  }, [])

  const handleViewport = useCallback((snapshot: ViewportSnapshot) => {
    snapshotRef.current = snapshot
    const now = performance.now()
    const elapsed = Math.max(1, now - velocityRef.current.time)
    const distance = Math.hypot(
      snapshot.scrollTop - velocityRef.current.top,
      snapshot.scrollLeft - velocityRef.current.left,
    )
    velocityRef.current = {
      time: now,
      lastMovementTime: distance > 0 ? now : velocityRef.current.lastMovementTime,
      top: snapshot.scrollTop,
      left: snapshot.scrollLeft,
      value: distance * 1000 / elapsed,
    }
  }, [])

  const handleExport = useCallback(async (format: StudioExportFormat, config: StudioTableConfig) => {
    const api = tableApiRef.current
    if (!api) return
    const sampled = config.rowCount > 2_000 || config.columnCount > 128
    const range = sampled
      ? {
          rowStart: 0,
          rowEnd: Math.min(config.rowCount - 1, 1_999),
          columnStart: 0,
          columnEnd: Math.min(config.columnCount - 1, 127),
        }
      : undefined
    const operation = format === 'xlsx'
      ? api.exportExcel('ultigrid-insight', range)
      : format === 'png'
        ? api.exportImage('ultigrid-insight')
        : Promise.resolve(api.exportCsv('ultigrid-insight.csv', range))
    try {
      await operation
      showToast({
        tone: 'success',
        message: sampled && format !== 'png'
          ? t('app.exportSampled', { format: format.toUpperCase() })
          : t('app.exportDone', { format: format.toUpperCase() }),
      })
    } catch (reason) {
      showToast({
        tone: 'error',
        message: reason instanceof Error ? reason.message : t('error.export'),
      })
      throw reason
    }
  }, [showToast, t])

  const localeText = useMemo<UltiGridInsightLocaleText>(() => ({
    expandRow: t('table.expandRow'),
    collapseRow: t('table.collapseRow'),
    nodeLoadError: t('table.nodeLoadError'),
    tableNotMounted: t('table.notMounted'),
    excelColumnLimit: t('table.excelColumns'),
    excelRowLimit: t('table.excelRows'),
    exportCellLimitInvalid: t('table.exportLimitInvalid'),
    exportRangeTooLarge: (count, limit) => t('table.exportTooLarge', { count, limit }),
  }), [t])

  const renderStage = useCallback(({ config: stageConfig }: { config: StudioTableConfig }) => {
    if (stageConfig.scenario === 'capabilities') {
      return <CapabilityOverview locale={locale} />
    }
    return (
      <DemoStageErrorBoundary
        key={`${stageConfig.rowCount}:${stageConfig.columnCount}:${stageConfig.scenario}`}
        title={t('app.propsFailed')}
        retryLabel={t('app.retry')}
      >
        <DemoTableStage
          config={stageConfig}
          tableApiRef={tableApiRef}
          onViewportChange={handleViewport}
          locale={locale}
          localeText={localeText}
        />
      </DemoStageErrorBoundary>
    )
  }, [handleViewport, locale, localeText, t])

  const closeCode = useCallback(() => {
    setCodeOpen(false)
    requestAnimationFrame(() => codeTriggerRef.current?.focus())
  }, [])

  const copyCode = useCallback(async () => {
    try {
      await writeTextToClipboard(demoSnippets[config.scenario])
      setCodeCopied(true)
      if (codeCopyTimerRef.current !== null) window.clearTimeout(codeCopyTimerRef.current)
      codeCopyTimerRef.current = window.setTimeout(() => setCodeCopied(false), 1_400)
    } catch {
      showToast({ tone: 'error', message: t('error.copy') })
    }
  }, [config.scenario, showToast, t])

  const scenarioLabel = t(`scenario.${config.scenario}` as MessageKey)

  return (
    <>
      <Studio
        value={config}
        onChange={(next) => setConfig(next)}
        metrics={metrics}
        status="ready"
        renderStage={renderStage}
        onExport={(format, config) => handleExport(format, config)}
        toolbarActions={(
          <button
            ref={codeTriggerRef}
            type="button"
            className="studio-action-button demo-code-trigger"
            data-testid="demo-code-trigger"
            aria-label={t('demo.code.open')}
            onClick={() => setCodeOpen(true)}
          >
            <Code2 size={16} />
            <span>{t('demo.code.open')}</span>
          </button>
        )}
      />
      {toast ? (
        <div
          className={`demo-toast demo-toast--${toast.tone}`}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <span>{toast.tone === 'success' ? <Check size={15} /> : <X size={15} />}</span>
          <p>{toast.message}</p>
          <button type="button" aria-label={t('app.toast.close')} onClick={() => setToast(null)}><X size={13} /></button>
        </div>
      ) : null}
      {codeOpen ? (
        <div
          className="demo-code-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCode()
          }}
        >
          <section
            className="demo-code-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-code-title"
          >
            <header className="demo-code-head">
              <div>
                <span><Code2 size={16} /> TSX</span>
                <h2 id="demo-code-title">{t('demo.code.title', { scenario: scenarioLabel })}</h2>
                <p>{t('demo.code.subtitle')}</p>
              </div>
              <div>
                <button type="button" className="demo-code-copy" onClick={() => void copyCode()}>
                  {codeCopied ? <Check size={15} /> : <Copy size={15} />}
                  {codeCopied ? t('demo.code.copied') : t('demo.code.copy')}
                </button>
                <button
                  ref={codeCloseRef}
                  type="button"
                  className="demo-code-close"
                  aria-label={t('demo.code.close')}
                  onClick={closeCode}
                >
                  <X size={17} />
                </button>
              </div>
            </header>
            <div className="demo-code-packages" aria-hidden="true">
              <span>@ultigrid/core</span>
              <span>@ultigrid/insight</span>
            </div>
            <pre><code>{demoSnippets[config.scenario]}</code></pre>
          </section>
        </div>
      ) : null}
    </>
  )
}

interface DemoTableStageProps {
  config: StudioTableConfig
  tableApiRef: { current: UltiGridInsightApi | null }
  onViewportChange: (snapshot: ViewportSnapshot) => void
  locale: Locale
  localeText: UltiGridInsightLocaleText
}

const DemoTableStage = memo(function DemoTableStage({
  config,
  tableApiRef,
  onViewportChange,
  locale,
  localeText,
}: DemoTableStageProps) {
  const [toggledTreeRows, setToggledTreeRows] = useState<Set<number>>(() => new Set())
  const rowSource = useMemo(
    () => createDemoRowSource(
      config.rowCount,
      config.scenario,
      toggledTreeRows,
      config.treeExpandedByDefault,
    ),
    [config.rowCount, config.scenario, config.treeExpandedByDefault, toggledTreeRows],
  )
  const getColumn = useMemo(
    () => createDemoColumnGetter(config.scenario, locale),
    [config.scenario, locale],
  )
  const merges = useMemo(
    () => createDemoMerges(
      config.rowCount,
      config.columnCount,
      config.mergedCellCount,
      config.scenario,
    ),
    [config.rowCount, config.columnCount, config.mergedCellCount, config.scenario],
  )

  const toggleRow = useCallback((rowId: string | number) => {
    const id = Number(rowId)
    setToggledTreeRows((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return (
    <div className={`demo-report demo-report--${config.density} demo-report--scenario-${config.scenario}`}>
      <div className="demo-report-table">
        <UltiGridInsight
          rowSource={rowSource}
          columnCount={config.columnCount}
          getColumn={getColumn}
          columnWidths={getDemoColumnWidths(config.scenario)}
          rowHeights={getDemoRowHeights(config.scenario)}
          mergedCells={merges}
          defaultRowHeight={config.rowHeight}
          defaultColumnWidth={config.columnWidth}
          frozen={{
            top: config.frozenTopRows,
            bottom: config.frozenBottomRows,
            left: config.frozenLeftColumns,
            right: config.frozenRightColumns,
          }}
          overscan={{ rows: config.overscanRows, columns: config.overscanColumns }}
          fitColumns={config.fitColumns ? 'stretch' : 'none'}
          autoSize={{ rows: config.autoRowHeight, columns: false }}
          contentVersion={`${config.scenario}:${locale}`}
          showHeader={config.scenario !== 'merged'}
          showRowNumbers={config.showRowNumbers}
          showGridLines={config.showGridLines}
          stripedRows={config.stripedRows}
          treeColumnId={config.scenario === 'tree' ? 'dimension' : undefined}
          onToggleRow={toggleRow}
          onViewportChange={onViewportChange}
          apiRef={tableApiRef}
          emptyContent={translate(locale, 'table.empty')}
          localeText={localeText}
          ariaLabel={`UltiGrid Insight · ${translate(locale, `scenario.${config.scenario}` as MessageKey)}`}
        />
      </div>
    </div>
  )
})

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))]!
}
