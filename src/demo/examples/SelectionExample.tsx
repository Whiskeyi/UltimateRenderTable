import {
  ClipboardCopy,
  MousePointer2,
} from 'lucide-react'
import {
  useCallback,
  useRef,
  useState,
} from 'react'
import {
  UltiGridViewport,
  type CellRange,
  type UltiGridViewportApi,
} from '@ultigrid/core'
import type { GalleryExampleProps } from '../galleryExampleTypes'

export default function SelectionExample({ t }: GalleryExampleProps) {
  const apiRef = useRef<UltiGridViewportApi | null>(null)
  const [selection, setSelection] = useState<CellRange | null>({
    rowStart: 1,
    rowEnd: 3,
    columnStart: 1,
    columnEnd: 3,
  })
  const [copiedRows, setCopiedRows] = useState<number | null>(null)
  const getCell = useCallback(
    (row: number, column: number) => t('gallery.selection.value', { row: row + 1, column: column + 1 }),
    [t],
  )

  const copy = useCallback(async () => {
    const value = await apiRef.current?.copySelection()
    setCopiedRows(value ? value.split(/\r?\n/).length : null)
  }, [])

  return (
    <div className="component-gallery__example-stack">
      <div className="component-gallery__example-toolbar">
        <span><MousePointer2 size={14} /> {t('gallery.selection.toolbar')}</span>
        <button type="button" onClick={() => void copy()}>
          <ClipboardCopy size={14} /> {copiedRows === null
            ? t('gallery.selection.tsv')
            : t('gallery.selection.rows', { count: copiedRows })}
        </button>
      </div>
      <div className="component-gallery__example-grid">
        <UltiGridViewport
          rowCount={200}
          columnCount={50}
          getCell={getCell}
          selection={selection}
          onSelectionChange={setSelection}
          apiRef={apiRef}
          defaultColumnWidth={132}
          ariaLabel={t('gallery.selection.title')}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  )
}
