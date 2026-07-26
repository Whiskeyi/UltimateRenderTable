import {
  CalendarDays,
  ChevronDown,
  CircleAlert,
  Filter,
  Layers3,
  MousePointer2,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react'
import {
  memo,
  useCallback,
  useMemo,
  useState,
} from 'react'
import {
  UltiGridInsight,
  type InsightViewportSnapshot,
  type UltiGridInsightApi,
  type UltiGridInsightLocaleText,
} from '@ultigrid/insight'
import type { StudioTableConfig } from '../studio'
import { translate, type Locale } from '../i18n'
import { DEMO_CURRENCY } from './currency'
import {
  createDemoColumnGetter,
  createDemoRowSource,
  getDemoColumnWidths,
} from './demoData'

const ANALYSIS_MERGE_OPTIONS = { columns: [0, 1] } as const
const ANALYSIS_SINGLE_COLUMN_MERGE_OPTIONS = { columns: [0] } as const

interface BusinessAnalyticsDemoProps {
  config: StudioTableConfig
  tableApiRef: { current: UltiGridInsightApi | null }
  onViewportChange: (snapshot: InsightViewportSnapshot) => void
  locale: Locale
  localeText: UltiGridInsightLocaleText
}

export const BusinessAnalyticsDemo = memo(function BusinessAnalyticsDemo({
  config,
  tableApiRef,
  onViewportChange,
  locale,
  localeText,
}: BusinessAnalyticsDemoProps) {
  const [toggledTreeRows, setToggledTreeRows] = useState<Set<number>>(() => new Set())
  const [analysisSection, setAnalysisSection] = useState<'core' | 'signals'>('core')
  const treeEnabled = config.treeEnabled
  const rowSource = useMemo(
    () => createDemoRowSource(config.rowCount, {
      treeEnabled,
      toggledRows: toggledTreeRows,
      expandedByDefault: config.treeExpandedByDefault,
    }),
    [config.rowCount, config.treeExpandedByDefault, toggledTreeRows, treeEnabled],
  )
  const getColumn = useMemo(
    () => createDemoColumnGetter('analysis', locale, { treeEnabled }),
    [locale, treeEnabled],
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
      'demo-report--scenario-analysis',
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
            columnWidths={getDemoColumnWidths('analysis', { treeEnabled })}
            mergeAdjacent={config.mergeSameValueDimensions
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
            contentVersion={`analysis:${locale}:${treeEnabled}:${config.mergeSameValueDimensions}`}
            showRowNumbers={config.showRowNumbers}
            showGridLines={config.showGridLines}
            stripedRows={config.stripedRows}
            treeColumnId={treeEnabled ? 'dimension' : undefined}
            onToggleRow={toggleRow}
            onViewportChange={onViewportChange}
            exportCellLimit={256_000}
            apiRef={tableApiRef}
            themeColor={config.themeColor}
            emptyContent={translate(locale, 'table.empty')}
            localeText={localeText}
            ariaLabel={`UltiGrid Insight · ${translate(locale, 'scenario.analysis')}`}
          />
        </div>
      </section>
    </div>
  )
})

function AnalysisDashboardHeader({ locale, treeEnabled }: { locale: Locale; treeEnabled: boolean }) {
  const currency = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: DEMO_CURRENCY,
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
