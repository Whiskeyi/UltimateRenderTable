import {
  FileText,
  Image,
  Table2,
} from 'lucide-react'
import {
  useMemo,
  useRef,
} from 'react'
import {
  UltiGridInsight,
  defineInsightColumn,
  type InsightColumnDefinition,
  type UltiGridInsightApi,
} from '@ultigrid/insight'
import type { GalleryExampleProps } from '../galleryExampleTypes'

interface ExportGalleryRow {
  id: number
  unit: number
  revenue: number
  orders: number
  margin: number
}

const EXPORT_ROWS: readonly ExportGalleryRow[] = Array.from({ length: 24 }, (_, index) => ({
  id: index,
  unit: index + 1,
  revenue: 36_000 + index * 4_800,
  orders: 80 + index * 7,
  margin: 18 + index % 9,
}))

const EXPORT_RANGE = {
  rowStart: 0,
  rowEnd: EXPORT_ROWS.length - 1,
  columnStart: 0,
  columnEnd: 3,
}

export default function ExportExample({ locale, t }: GalleryExampleProps) {
  const apiRef = useRef<UltiGridInsightApi | null>(null)
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale])
  const columns = useMemo<readonly InsightColumnDefinition<ExportGalleryRow>[]>(() => [
    defineInsightColumn<ExportGalleryRow, number>({
      id: 'unit',
      header: t('gallery.conditional.entity'),
      headerText: t('gallery.conditional.entity'),
      getValue: (row) => row.unit,
      formatValue: (value) => t('gallery.export.unit', { index: value }),
    }),
    defineInsightColumn<ExportGalleryRow, number>({
      id: 'revenue',
      header: t('gallery.merging.revenue'),
      headerText: t('gallery.merging.revenue'),
      getValue: (row) => row.revenue,
      formatValue: (value) => number.format(value),
      visualStyle: { horizontalAlign: 'right' },
    }),
    defineInsightColumn<ExportGalleryRow, number>({
      id: 'orders',
      header: t('gallery.merging.orders'),
      headerText: t('gallery.merging.orders'),
      getValue: (row) => row.orders,
      formatValue: (value) => number.format(value),
      visualStyle: { horizontalAlign: 'right' },
    }),
    defineInsightColumn<ExportGalleryRow, number>({
      id: 'margin',
      header: t('gallery.merging.margin'),
      headerText: t('gallery.merging.margin'),
      getValue: (row) => row.margin,
      formatValue: (value) => `${value}%`,
      visualStyle: { horizontalAlign: 'right' },
    }),
  ], [number, t])

  return (
    <div className="component-gallery__example-stack">
      <div className="component-gallery__example-toolbar">
        <button type="button" onClick={() => { void apiRef.current?.exportExcel('ultigrid-gallery', EXPORT_RANGE) }}>
          <Table2 size={14} /> {t('gallery.export.excel')}
        </button>
        <button type="button" onClick={() => { apiRef.current?.exportCsv('ultigrid-gallery.csv', EXPORT_RANGE) }}>
          <FileText size={14} /> {t('gallery.export.csv')}
        </button>
        <button type="button" onClick={() => { void apiRef.current?.exportImage('ultigrid-gallery') }}>
          <Image size={14} /> {t('gallery.export.png')}
        </button>
      </div>
      <div className="component-gallery__example-grid">
        <UltiGridInsight
          rows={EXPORT_ROWS}
          getRowId={(row) => row.id}
          columns={columns}
          apiRef={apiRef}
          exportCellLimit={500}
          showRowNumbers={false}
          fitColumns="stretch"
          ariaLabel={t('gallery.export.title')}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  )
}
