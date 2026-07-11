import { useCallback } from 'react'
import {
  UltiGridViewport,
  type TableCell,
} from '@ultigrid/core'
import type { GalleryExampleProps } from '../galleryExampleTypes'

const GALLERY_ROW_HEIGHTS = new Map<number, number>([
  [1, 62],
  [4, 54],
  [7, 70],
])

const GALLERY_COLUMN_WIDTHS = new Map<number, number>([
  [0, 210],
  [1, 164],
  [3, 96],
])

export default function SizingExample({ t }: GalleryExampleProps) {
  const getCell = useCallback((row: number, column: number): TableCell<string> => {
    const value = column === 0
      ? `${t('gallery.sizing.dimension', { index: Math.floor(row / 3) + 1 })}\n${t('gallery.sizing.measured')}`
      : t('gallery.sizing.cell', { row: row + 1, column: column + 1 })
    return {
      value,
      text: value,
      style: column === 0 ? { whiteSpace: 'normal', lineHeight: 1.35 } : undefined,
    }
  }, [t])

  return (
    <UltiGridViewport
      rowCount={80}
      columnCount={8}
      getCell={getCell}
      rowHeights={GALLERY_ROW_HEIGHTS}
      columnWidths={GALLERY_COLUMN_WIDTHS}
      autoSize={{ rows: true, columns: false }}
      fitColumns="stretch"
      ariaLabel={t('gallery.sizing.title')}
      style={{ height: '100%' }}
    />
  )
}
