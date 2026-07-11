import { useMemo } from 'react'
import type { MergedCellRange } from '@ultigrid/core'
import {
  UltiGridInsight,
  defineInsightColumn,
  type InsightColumnDefinition,
} from '@ultigrid/insight'
import type { GalleryExampleProps } from '../galleryExampleTypes'

interface MergeRow {
  id: number
  region: 'east' | 'south' | 'north'
  product: 'cloud' | 'data' | 'ai'
  revenue: number
  orders: number
  margin: number
}

const MERGE_REGIONS = ['east', 'south', 'north'] as const
const MERGE_PRODUCTS = ['cloud', 'data', 'ai'] as const

const MERGE_ROWS: readonly MergeRow[] = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  region: MERGE_REGIONS[Math.floor(index / 6)]!,
  product: MERGE_PRODUCTS[Math.floor(index / 2) % 3]!,
  revenue: 86_000 + index * 7_400,
  orders: 120 + index * 9,
  margin: 18 + index % 7,
}))

const MERGE_EXPLICIT: readonly MergedCellRange[] = [{
  id: 'gallery-horizontal-summary',
  rowStart: 0,
  rowEnd: 0,
  columnStart: 2,
  columnEnd: 4,
}]

export default function MergingExample({ locale, t }: GalleryExampleProps) {
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale])
  const columns = useMemo<readonly InsightColumnDefinition<MergeRow>[]>(() => [
    defineInsightColumn<MergeRow, MergeRow['region']>({
      id: 'region',
      header: t('gallery.merging.region'),
      headerText: t('gallery.merging.region'),
      width: 128,
      getValue: (row) => row.region,
      formatValue: (value) => t(`gallery.merging.${value}`),
      visualStyle: { fontWeight: 700, verticalAlign: 'middle' },
    }),
    defineInsightColumn<MergeRow, MergeRow['product']>({
      id: 'product',
      header: t('gallery.merging.product'),
      headerText: t('gallery.merging.product'),
      width: 132,
      getValue: (row) => row.product,
      formatValue: (value) => t(`gallery.merging.${value}`),
      visualStyle: { color: '#526058', verticalAlign: 'middle' },
    }),
    defineInsightColumn<MergeRow, number>({
      id: 'revenue',
      header: t('gallery.merging.revenue'),
      headerText: t('gallery.merging.revenue'),
      getValue: (row) => row.revenue,
      formatValue: (value) => number.format(value),
      renderContent: ({ displayValue, row, rowIndex }) => rowIndex === 0 ? (
        <span className="component-gallery__merge-summary">
          <strong>{t('gallery.merging.summary')}</strong>
          <small>
            {displayValue} · {number.format(row.orders)} {t('gallery.merging.orders')} · {row.margin}%
          </small>
        </span>
      ) : displayValue,
      visualStyle: { horizontalAlign: 'right', fontWeight: 700 },
    }),
    defineInsightColumn<MergeRow, number>({
      id: 'orders',
      header: t('gallery.merging.orders'),
      headerText: t('gallery.merging.orders'),
      getValue: (row) => row.orders,
      formatValue: (value) => number.format(value),
      visualStyle: { horizontalAlign: 'right' },
    }),
    defineInsightColumn<MergeRow, number>({
      id: 'margin',
      header: t('gallery.merging.margin'),
      headerText: t('gallery.merging.margin'),
      getValue: (row) => row.margin,
      formatValue: (value) => `${value}%`,
      visualStyle: { horizontalAlign: 'right' },
    }),
  ], [number, t])

  return (
    <UltiGridInsight
      rows={MERGE_ROWS}
      getRowId={(row) => row.id}
      columns={columns}
      mergeAdjacent={{ columns: [0, 1] }}
      mergedCells={MERGE_EXPLICIT}
      frozen={{ left: 1 }}
      showRowNumbers={false}
      fitColumns="stretch"
      ariaLabel={t('gallery.merging.title')}
      style={{ height: '100%' }}
    />
  )
}
