import type { ReactNode } from 'react'

export type StudioScenario = 'intro' | 'gallery' | 'analysis' | 'conditional'

export type StudioDensity = 'compact' | 'comfortable' | 'relaxed'

export type StudioStatus = 'idle' | 'ready' | 'rendering' | 'error'

export type StudioExportFormat = 'xlsx' | 'png' | 'csv'

/**
 * A compact, serializable view model used by the Studio controls. The table
 * implementation can translate these values into its own public props.
 */
export interface StudioTableConfig {
  scenario: StudioScenario
  rowCount: number
  columnCount: number
  rowHeight: number
  columnWidth: number
  overscanRows: number
  overscanColumns: number
  frozenTopRows: number
  frozenBottomRows: number
  frozenLeftColumns: number
  frozenRightColumns: number
  density: StudioDensity
  fitColumns: boolean
  autoRowHeight: boolean
  showGridLines: boolean
  stripedRows: boolean
  showRowNumbers: boolean
  themeColor: string
  treeEnabled: boolean
  mergeSameValueDimensions: boolean
  treeExpandedByDefault: boolean
}

export interface StudioPerformanceMetrics {
  fps?: number
  frameTimeMs?: number
  frameTimeP95Ms?: number
  jankRatio?: number
  sampleState?: 'warming' | 'idle' | 'scrolling' | 'hidden'
  /** Number of cell surfaces reported by the current virtual viewport. */
  renderedCells?: number
  heapMb?: number
  visibleRows?: number
  visibleColumns?: number
  scrollVelocity?: number
}

export interface StudioChangeMeta {
  source: 'control' | 'json' | 'preset' | 'reset'
  key?: keyof StudioTableConfig | string
}

export interface StudioRenderContext<TConfig extends StudioTableConfig = StudioTableConfig> {
  config: TConfig
  patchConfig: (patch: Partial<TConfig>) => void
  status: StudioStatus
}

export interface StudioProps<TConfig extends StudioTableConfig = StudioTableConfig> {
  /** Controlled Studio configuration. */
  value?: TConfig
  /** Initial values used when `value` is not supplied. */
  defaultValue?: Partial<TConfig>
  onChange?: (next: TConfig, meta: StudioChangeMeta) => void
  /** Slot that connects the Studio shell to the actual BI/render table. */
  renderStage?: (context: StudioRenderContext<TConfig>) => ReactNode
  metrics?: StudioPerformanceMetrics
  status?: StudioStatus
  error?: string | null
  isLoading?: boolean
  title?: string
  subtitle?: string
  className?: string
  onRetry?: () => void
  onExport?: (format: StudioExportFormat, config: TConfig) => void | Promise<void>
  toolbarActions?: ReactNode
}

export const DEFAULT_STUDIO_CONFIG: StudioTableConfig = {
  scenario: 'analysis',
  rowCount: 1_000,
  columnCount: 40,
  rowHeight: 42,
  columnWidth: 136,
  overscanRows: 2,
  overscanColumns: 1,
  frozenTopRows: 1,
  frozenBottomRows: 0,
  frozenLeftColumns: 2,
  frozenRightColumns: 0,
  density: 'comfortable',
  fitColumns: true,
  autoRowHeight: false,
  showGridLines: true,
  stripedRows: true,
  showRowNumbers: true,
  themeColor: '#198754',
  treeEnabled: false,
  mergeSameValueDimensions: true,
  treeExpandedByDefault: true,
}
