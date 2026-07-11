import {
  useCallback,
  useMemo,
} from 'react'
import {
  UltiGridInsight,
  type InsightColumn,
  type LazyRowSource,
} from '@ultigrid/insight'
import type { GalleryExampleProps } from '../galleryExampleTypes'

interface LazyGalleryRow {
  id: number
  index: number
}

const LAZY_ROW_SOURCE: LazyRowSource<LazyGalleryRow> = {
  rowCount: 100_000,
  getRow: (index) => ({ id: index, index }),
  getRowId: (row) => row.id,
}

export default function LazyDataExample({ locale, t }: GalleryExampleProps) {
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale])
  const getColumn = useCallback((columnIndex: number): InsightColumn<LazyGalleryRow, number> => ({
    id: `metric-${columnIndex}`,
    header: t('gallery.lazy.column', { index: columnIndex + 1 }),
    headerText: t('gallery.lazy.column', { index: columnIndex + 1 }),
    getValue: (row) => ((row.index + 1) * (columnIndex + 17)) % 100_000,
    formatValue: (value) => number.format(value),
    visualStyle: { horizontalAlign: 'right', fontFamily: 'var(--font-mono)' },
  }), [number, t])

  return (
    <UltiGridInsight
      rowSource={LAZY_ROW_SOURCE}
      columnCount={10_000}
      getColumn={getColumn}
      defaultColumnWidth={116}
      frozen={{ top: 1, left: 1 }}
      overscan={{ rows: 5, columns: 2 }}
      showRowNumbers={false}
      fitColumns="none"
      ariaLabel={t('gallery.lazy.title')}
      style={{ height: '100%' }}
    />
  )
}
