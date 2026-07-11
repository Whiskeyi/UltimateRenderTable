import {
  Check,
  Code2,
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
import { ComponentGallery } from './demo/ComponentGallery'
import { RepositoryIntro } from './demo/RepositoryIntro'
import {
  createDemoColumnGetter,
  createDemoRowSource,
  getDemoColumnWidths,
} from './demo/demoData'
import { translate, useI18n, type Locale, type MessageKey } from './i18n'
import './styles/demo.css'

const ANALYSIS_MERGE_OPTIONS = { columns: [0, 1] } as const
const ANALYSIS_SINGLE_COLUMN_MERGE_OPTIONS = { columns: [0] } as const

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
  const toastTimerRef = useRef<number | null>(null)

  const showToast = useCallback((next: ToastState) => {
    setToast(next)
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800)
  }, [])

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
  }, [])

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
    if (stageConfig.scenario === 'intro') {
      return <RepositoryIntro />
    }
    if (stageConfig.scenario === 'gallery') {
      return <ComponentGallery />
    }
    return (
      <DemoStageErrorBoundary
        key={`${stageConfig.rowCount}:${stageConfig.columnCount}:${stageConfig.scenario}:${stageConfig.treeEnabled}:${stageConfig.mergeSameValueDimensions}`}
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
  const treeEnabled = config.scenario === 'analysis' && config.treeEnabled
  const rowSource = useMemo(
    () => createDemoRowSource(config.rowCount, {
      treeEnabled,
      toggledRows: toggledTreeRows,
      expandedByDefault: config.treeExpandedByDefault,
    }),
    [config.rowCount, config.treeExpandedByDefault, toggledTreeRows, treeEnabled],
  )
  const getColumn = useMemo(
    () => createDemoColumnGetter(config.scenario, locale, { treeEnabled }),
    [config.scenario, locale, treeEnabled],
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
    <div className={[
      'demo-report',
      `demo-report--${config.density}`,
      `demo-report--scenario-${config.scenario}`,
      treeEnabled ? 'demo-report--tree-enabled' : '',
    ].filter(Boolean).join(' ')}>
      <div className="demo-report-table">
        <UltiGridInsight
          rowSource={rowSource}
          columnCount={config.columnCount}
          getColumn={getColumn}
          columnWidths={getDemoColumnWidths(config.scenario, { treeEnabled })}
          mergeAdjacent={config.scenario === 'analysis' && config.mergeSameValueDimensions
            ? config.columnCount > 1
              ? ANALYSIS_MERGE_OPTIONS
              : ANALYSIS_SINGLE_COLUMN_MERGE_OPTIONS
            : false}
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
          contentVersion={`${config.scenario}:${locale}:${treeEnabled}:${config.mergeSameValueDimensions}`}
          showRowNumbers={config.showRowNumbers}
          showGridLines={config.showGridLines}
          stripedRows={config.stripedRows}
          treeColumnId={treeEnabled ? 'dimension' : undefined}
          onToggleRow={toggleRow}
          onViewportChange={onViewportChange}
          apiRef={tableApiRef}
          themeColor={config.themeColor}
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
