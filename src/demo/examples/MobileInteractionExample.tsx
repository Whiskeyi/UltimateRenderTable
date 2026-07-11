import {
  useCallback,
  useMemo,
  useState,
} from 'react'
import {
  UltiGridViewport,
  type CellRange,
  type ColumnResizeChange,
  type ColumnResizeOptions,
  type MobileInteractionOptions,
  type TableCell,
} from '@ultigrid/core'
import type { GalleryExampleProps } from '../galleryExampleTypes'

const ROW_COUNT = 120
const COLUMN_COUNT = 12

export default function MobileInteractionExample({ t }: GalleryExampleProps) {
  const [selection, setSelection] = useState<CellRange | null>({
    rowStart: 2,
    rowEnd: 2,
    columnStart: 1,
    columnEnd: 1,
  })
  const [resizedColumn, setResizedColumn] = useState<{ column: number; width: number } | null>(null)
  const headers = useMemo(() => [
    t('gallery.mobile.column.item'),
    t('gallery.mobile.column.owner'),
    t('gallery.mobile.column.progress'),
    t('gallery.mobile.column.status'),
  ], [t])
  const mobileInteraction = useMemo<MobileInteractionOptions>(() => ({
    mode: 'always',
    tapSlop: 12,
    edgeAutoScrollThreshold: 44,
    labels: {
      copySelection: t('gallery.mobile.copy'),
      copySuccess: t('gallery.mobile.copied'),
      copyError: t('gallery.mobile.copyError'),
      selectionHandle: t('gallery.mobile.selectionHandle'),
      selectionActions: t('gallery.mobile.selectionActions'),
    },
  }), [t])
  const columnResize = useMemo<ColumnResizeOptions>(() => ({
    headerRows: [0],
    minWidth: 84,
    maxWidth: 260,
    getHandleAriaLabel: (column) => t('gallery.mobile.resizeHandle', { column: column + 1 }),
  }), [t])
  const handleColumnResize = useCallback((change: ColumnResizeChange) => {
    if (change.phase !== 'end') return
    setResizedColumn({ column: change.viewportColumn, width: change.width })
  }, [])
  const getCell = useCallback((row: number, column: number): TableCell<string> => {
    if (row === 0) {
      const value = headers[column] ?? t('gallery.mobile.column.metric', { index: column - 3 })
      return {
        value,
        style: {
          backgroundColor: '#eef6f1',
          color: '#1f6846',
          fontWeight: 750,
        },
      }
    }

    const progress = (row * 17 + column * 11) % 101
    const values = [
      t('gallery.mobile.item', { index: row }),
      t('gallery.mobile.owner', { index: (row % 7) + 1 }),
      `${progress}%`,
      progress >= 76
        ? t('gallery.mobile.status.ready')
        : progress >= 48
          ? t('gallery.mobile.status.active')
          : t('gallery.mobile.status.watch'),
    ]
    const value = values[column] ?? `${Math.round((row + 1) * (column + 3) * 1.7)}`
    return { value }
  }, [headers, t])
  const rangeLabel = selection
    ? t('gallery.mobile.range', {
        rowStart: selection.rowStart + 1,
        rowEnd: selection.rowEnd + 1,
        columnStart: selection.columnStart + 1,
        columnEnd: selection.columnEnd + 1,
      })
    : t('gallery.mobile.rangeEmpty')
  const resizeLabel = resizedColumn
    ? t('gallery.mobile.resized', {
        column: resizedColumn.column + 1,
        width: resizedColumn.width,
      })
    : t('gallery.mobile.resizeReady')

  return (
    <div className="component-gallery__example-stack">
      <div className="component-gallery__example-toolbar">
        <span>{t('gallery.mobile.hint')}</span>
        <small aria-live="polite" style={{ color: '#69766e', fontSize: 9 }}>
          {rangeLabel} · {resizeLabel}
        </small>
      </div>
      <div
        className="component-gallery__example-grid"
        style={{ minHeight: 0, padding: 12, background: '#f5f8f6' }}
      >
        <div style={{ width: 'min(100%, 430px)', height: '100%', margin: '0 auto' }}>
          <UltiGridViewport
            rowCount={ROW_COUNT}
            columnCount={COLUMN_COUNT}
            getCell={getCell}
            selection={selection}
            onSelectionChange={setSelection}
            mobileInteraction={mobileInteraction}
            columnResize={columnResize}
            onColumnResize={handleColumnResize}
            frozen={{ top: 1, left: 1 }}
            defaultRowHeight={44}
            defaultColumnWidth={124}
            overscan={{ rows: 3, columns: 1 }}
            fitColumns="none"
            themeColor="#168052"
            ariaLabel={t('gallery.mobile.title')}
            style={{ height: '100%', borderRadius: 14 }}
          />
        </div>
      </div>
    </div>
  )
}
