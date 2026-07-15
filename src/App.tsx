import {
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Code2,
  Filter,
  Layers3,
  MousePointer2,
  Sparkles,
  Target,
  TrendingUp,
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
import { SpreadsheetDemo } from './demo/SpreadsheetDemo'
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
      return <ComponentGallery />
    }
    if (stageConfig.scenario === 'spreadsheet') {
      return (
        <DemoStageErrorBoundary
          key={`spreadsheet:${locale}`}
          title={t('app.propsFailed')}
          retryLabel={t('app.retry')}
        >
          <SpreadsheetDemo
            locale={locale}
            apiRef={tableApiRef}
            localeText={localeText}
            onViewportChange={handleViewport}
          />
        </DemoStageErrorBoundary>
      )
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
  const [analysisSection, setAnalysisSection] = useState<'core' | 'signals'>('core')
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

  const showAnalysisSection = useCallback((section: 'core' | 'signals') => {
    setAnalysisSection(section)
    tableApiRef.current?.scrollToCell({
      row: 0,
      column: section === 'core' ? 0 : treeEnabled ? 9 : 10,
    }, 'start')
  }, [tableApiRef, treeEnabled])

  return (
    <div className={[
      'demo-report',
      `demo-report--${config.density}`,
      `demo-report--scenario-${config.scenario}`,
      treeEnabled ? 'demo-report--tree-enabled' : '',
    ].filter(Boolean).join(' ')}>
      <AnalysisDashboardHeader locale={locale} treeEnabled={treeEnabled} />
      <section className="analysis-detail-panel">
        <header className="analysis-detail-head">
          <div>
            <span className="analysis-detail-icon"><Layers3 size={15} /></span>
            <span>
              <strong>{translate(locale, 'analysis.detail.title')}</strong>
              <small>{translate(locale, 'analysis.detail.subtitle')}</small>
            </span>
          </div>
          <div className="analysis-render-legend" aria-label={translate(locale, 'analysis.legend.label')}>
            <span><i className="is-component" />{translate(locale, 'analysis.legend.component')}</span>
            <span><i className="is-bar" />{translate(locale, 'analysis.legend.dataBar')}</span>
            <span><i className="is-scale" />{translate(locale, 'analysis.legend.colorScale')}</span>
            <span><i className="is-rule" />{translate(locale, 'analysis.legend.rules')}</span>
          </div>
          <div className="analysis-section-switch" role="group" aria-label={translate(locale, 'analysis.section.label')}>
            <button
              type="button"
              className={analysisSection === 'core' ? 'is-active' : undefined}
              aria-pressed={analysisSection === 'core'}
              onClick={() => showAnalysisSection('core')}
            >
              {translate(locale, 'analysis.section.core')}
            </button>
            <button
              type="button"
              className={analysisSection === 'signals' ? 'is-active' : undefined}
              aria-pressed={analysisSection === 'signals'}
              onClick={() => showAnalysisSection('signals')}
            >
              {translate(locale, 'analysis.section.signals')}
            </button>
          </div>
        </header>
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
      </section>
    </div>
  )
})

function AnalysisDashboardHeader({ locale, treeEnabled }: { locale: Locale; treeEnabled: boolean }) {
  const currency = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: locale === 'zh-CN' ? 'CNY' : 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  })
  const kpis = [
    {
      label: translate(locale, 'analysis.kpi.revenue'),
      value: currency.format(28_460_000),
      change: '+18.6%',
      note: translate(locale, 'analysis.kpi.revenue.note'),
      tone: 'green',
      points: '0,25 12,22 24,23 36,15 48,17 60,8 72,11 84,3',
    },
    {
      label: translate(locale, 'analysis.kpi.attainment'),
      value: '94.8%',
      change: '+4.2pp',
      note: translate(locale, 'analysis.kpi.attainment.note'),
      tone: 'blue',
      progress: 94.8,
    },
    {
      label: translate(locale, 'analysis.kpi.margin'),
      value: '36.2%',
      change: '+2.1pp',
      note: translate(locale, 'analysis.kpi.margin.note'),
      tone: 'violet',
      points: '0,21 12,18 24,20 36,13 48,14 60,9 72,6 84,7',
    },
    {
      label: translate(locale, 'analysis.kpi.risk'),
      value: '12',
      change: '-5',
      note: translate(locale, 'analysis.kpi.risk.note'),
      tone: 'amber',
      progress: 32,
    },
  ]

  return (
    <section className="analysis-dashboard">
      <header className="analysis-dashboard-title">
        <div>
          <span className="analysis-dashboard-mark"><TrendingUp size={18} /></span>
          <span>
            <small>{translate(locale, 'analysis.eyebrow')}</small>
            <strong>{translate(locale, 'analysis.title')}</strong>
          </span>
          <em><span />{translate(locale, 'analysis.live')}</em>
        </div>
        <div className="analysis-dashboard-filters">
          <button type="button"><CalendarDays size={13} />{translate(locale, 'analysis.period')}<ChevronDown size={12} /></button>
          <button type="button"><Filter size={13} />{treeEnabled ? translate(locale, 'analysis.view.tree') : translate(locale, 'analysis.view.flat')}<ChevronDown size={12} /></button>
        </div>
      </header>
      <div className="analysis-kpi-grid">
        {kpis.map((kpi, index) => (
          <article className={`analysis-kpi analysis-kpi--${kpi.tone}`} key={kpi.label}>
            <div className="analysis-kpi-label">
              <span>{index === 0 ? <TrendingUp size={14} /> : index === 1 ? <Target size={14} /> : index === 2 ? <Sparkles size={14} /> : <CircleAlert size={14} />}</span>
              <small>{kpi.label}</small>
            </div>
            <div className="analysis-kpi-value"><strong>{kpi.value}</strong><em>{kpi.change}</em></div>
            <div className="analysis-kpi-foot">
              <small>{kpi.note}</small>
              {kpi.points ? (
                <svg viewBox="0 0 84 28" preserveAspectRatio="none" aria-hidden="true">
                  <polyline points={kpi.points} />
                </svg>
              ) : (
                <span className="analysis-kpi-progress"><i style={{ width: `${kpi.progress}%` }} /></span>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="analysis-narrative">
        <span><MousePointer2 size={13} />{translate(locale, 'analysis.narrative.label')}</span>
        <p>{translate(locale, 'analysis.narrative.text')}</p>
      </div>
    </section>
  )
}

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))]!
}
