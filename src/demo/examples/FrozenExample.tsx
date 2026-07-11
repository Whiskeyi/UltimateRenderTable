import { useCallback } from 'react'
import {
  UltiGridViewport,
  type TableCell,
} from '@ultigrid/core'
import type { GalleryExampleProps } from '../galleryExampleTypes'

export default function FrozenExample({ t }: GalleryExampleProps) {
  const getCell = useCallback((row: number, column: number): TableCell<string> => {
    const value = `${row + 1} / ${column + 1}`
    return {
      value,
      text: value,
      style: row === 0 || row === 199 || column === 0 || column === 59
        ? { backgroundColor: '#edf6f0', color: '#176f49', fontWeight: 700 }
        : undefined,
    }
  }, [])

  return (
    <UltiGridViewport
      rowCount={200}
      columnCount={60}
      getCell={getCell}
      frozen={{ top: 1, bottom: 1, left: 1, right: 1 }}
      defaultColumnWidth={116}
      ariaLabel={t('gallery.frozen.title')}
      style={{ height: '100%' }}
    />
  )
}
