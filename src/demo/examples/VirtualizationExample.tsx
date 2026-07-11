import { useCallback } from 'react'
import {
  UltiGridViewport,
  type TableCell,
} from '@ultigrid/core'
import type { GalleryExampleProps } from '../galleryExampleTypes'

export default function VirtualizationExample({ t }: GalleryExampleProps) {
  const getCell = useCallback((row: number, column: number): TableCell<number> => ({
    value: row * 100_000 + column,
    text: `${row.toLocaleString()} : ${column.toLocaleString()}`,
  }), [])

  return (
    <UltiGridViewport
      rowCount={100_000}
      columnCount={100_000}
      getCell={getCell}
      defaultRowHeight={34}
      defaultColumnWidth={128}
      overscan={{ rows: 5, columns: 2 }}
      fitColumns="none"
      ariaLabel={t('gallery.virtualization.title')}
      style={{ height: '100%' }}
    />
  )
}
