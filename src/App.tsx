import {
  Check,
  Code2,
  RefreshCw,
  X,
} from 'lucide-react'
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  type InsightViewportSnapshot,
  type UltiGridInsightApi,
  type UltiGridInsightLocaleText,
} from '@ultigrid/insight'
import {
  Studio,
  DEFAULT_STUDIO_CONFIG,
  type StudioExportFormat,
  type StudioPerformanceMetrics,
  type StudioTableConfig,
} from './studio'
import { readStudioScenario, writeStudioScenario } from './studio/urlState'
import { RepositoryIntro } from './demo/RepositoryIntro'
import { BusinessAnalyticsDemo } from './demo/BusinessAnalyticsDemo'
import { hasDirtySpreadsheetSession } from './demo/spreadsheetSession'
import { useI18n } from './i18n'
import './styles/demo.css'

const ComponentGallery = lazy(() => import('./demo/ComponentGallery').then((module) => ({
  default: module.ComponentGallery,
})))
const SpreadsheetDemo = lazy(() => import('./demo/SpreadsheetDemo').then((module) => ({
  default: module.SpreadsheetDemo,
})))

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
  const [config, setConfig] = useState<StudioTableConfig>(() => ({
    ...DEFAULT_STUDIO_CONFIG,
    scenario: typeof window === 'undefined'
      ? DEFAULT_STUDIO_CONFIG.scenario
      : readStudioScenario(window.location.search) ?? DEFAULT_STUDIO_CONFIG.scenario,
  }))
  const configRef = useRef(config)
  const tableApiRef = useRef<UltiGridInsightApi | null>(null)
  const [tableApiReady, setTableApiReady] = useState(false)
  const tableApiReadyRef = useRef(false)
  const [diagnosticsActive, setDiagnosticsActive] = useState(false)
  const snapshotRef = useRef<InsightViewportSnapshot | null>(null)
  const velocityRef = useRef({
    time: performance.now(),
    lastMovementTime: 0,
    top: 0,
    left: 0,
    value: 0,
  })
  const [metrics, setMetrics] = useState<StudioPerformanceMetrics>({})
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  configRef.current = config

  const showToast = useCallback((next: ToastState) => {
    setToast(next)
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800)
  }, [])

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
  }, [])

  useEffect(() => {
    const search = writeStudioScenario(window.location.search, config.scenario)
    if (search === window.location.search) return
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${search}${window.location.hash}`,
    )
  }, [config.scenario])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDirtySpreadsheetSession()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  useEffect(() => {
    if (!diagnosticsActive) {
      setMetrics({})
      return
    }
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
  }, [diagnosticsActive])

  const handleViewport = useCallback((snapshot: InsightViewportSnapshot) => {
    snapshotRef.current = snapshot
    if (!tableApiReadyRef.current) {
      tableApiReadyRef.current = true
      setTableApiReady(true)
    }
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
    if (!api) {
      const message = t('app.exportNotReady')
      showToast({ tone: 'error', message })
      throw new Error(message)
    }
    const sampled = config.rowCount > 2_000 || config.columnCount > 128
    const range = sampled
      ? {
          rowStart: 0,
          rowEnd: Math.min(config.rowCount - 1, 1_999),
          columnStart: 0,
          columnEnd: Math.min(config.columnCount - 1, 127),
        }
      : undefined
    try {
      const operation = format === 'xlsx'
        ? api.exportExcel('ultigrid-insight', range)
        : format === 'png'
          ? api.exportImage('ultigrid-insight')
          : Promise.resolve(api.exportCsv('ultigrid-insight.csv', range))
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

  const handleConfigChange = useCallback((next: StudioTableConfig) => {
    if (next.scenario !== configRef.current.scenario) {
      tableApiRef.current = null
      snapshotRef.current = null
      tableApiReadyRef.current = false
      setTableApiReady(false)
    }
    configRef.current = next
    setConfig(next)
  }, [])

  const localeText = useMemo<UltiGridInsightLocaleText>(() => ({
    expandRow: t('table.expandRow'),
    collapseRow: t('table.collapseRow'),
    nodeLoadError: t('table.nodeLoadError'),
    tableNotMounted: t('table.notMounted'),
    excelColumnLimit: t('table.excelColumns'),
    excelRowLimit: t('table.excelRows'),
    exportCellLimitInvalid: t('table.exportLimitInvalid'),
    exportRangeTooLarge: (count, limit) => t('table.exportTooLarge', { count, limit }),
    copySelection: t('table.copySelection'),
    copySuccess: t('table.copySuccess'),
    copyError: t('table.copyError'),
    selectionHandle: t('table.selectionHandle'),
    selectionActions: t('table.selectionActions'),
    resizeColumn: (column) => t('table.resizeColumn', { column }),
  }), [t])

  const renderStage = useCallback(({ config: stageConfig }: { config: StudioTableConfig }) => {
    if (stageConfig.scenario === 'intro') {
      return <RepositoryIntro />
    }
    if (stageConfig.scenario === 'gallery') {
      return (
        <Suspense fallback={<DemoStageLoading title={t('studio.render.loading')} detail={t('studio.render.loading.detail')} />}>
          <ComponentGallery />
        </Suspense>
      )
    }
    if (stageConfig.scenario === 'spreadsheet') {
      return (
        <DemoStageErrorBoundary
          key="spreadsheet"
          title={t('app.propsFailed')}
          retryLabel={t('app.retry')}
        >
          <Suspense fallback={<DemoStageLoading title={t('studio.render.loading')} detail={t('studio.render.loading.detail')} />}>
            <SpreadsheetDemo
              locale={locale}
              apiRef={tableApiRef}
              localeText={localeText}
              onViewportChange={handleViewport}
            />
          </Suspense>
        </DemoStageErrorBoundary>
      )
    }
    return (
      <DemoStageErrorBoundary
        key={`${stageConfig.rowCount}:${stageConfig.columnCount}:${stageConfig.scenario}:${stageConfig.treeEnabled}:${stageConfig.mergeSameValueDimensions}`}
        title={t('app.propsFailed')}
        retryLabel={t('app.retry')}
      >
        <BusinessAnalyticsDemo
          config={stageConfig}
          tableApiRef={tableApiRef}
          onViewportChange={handleViewport}
          locale={locale}
          localeText={localeText}
        />
      </DemoStageErrorBoundary>
    )
  }, [handleViewport, locale, localeText, t])

  return (
    <>
      <Studio
        value={config}
        onChange={handleConfigChange}
        metrics={metrics}
        status="ready"
        renderStage={renderStage}
        onExport={(format, config) => handleExport(format, config)}
        exportReady={tableApiReady}
        onDiagnosticsOpenChange={setDiagnosticsActive}
        toolbarActions={(
          <a
            className="studio-icon-button demo-github-link"
            data-testid="github-repository-link"
            href="https://github.com/Whiskeyi/UltimateRenderTable"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('app.source.open')}
            title={t('app.source.open')}
          >
            <Code2 size={17} />
          </a>
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
    </>
  )
}

function DemoStageLoading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="studio-loading-layer" role="status" aria-live="polite">
      <span className="studio-spinner" />
      <strong>{title}</strong>
      <small>{detail}</small>
    </div>
  )
}

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))]!
}
