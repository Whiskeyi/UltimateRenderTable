import {
  ClipboardCopy,
  MousePointer2,
  Target,
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

const API_JUMP_TARGET = { row: 24_000, column: 240 }
const API_SELECTION: CellRange = {
  rowStart: 1_200,
  rowEnd: 1_204,
  columnStart: 40,
  columnEnd: 44,
}

export default function ImperativeApiExample({ t }: GalleryExampleProps) {
  const apiRef = useRef<UltiGridViewportApi | null>(null)
  const [selection, setSelection] = useState<CellRange | null>(null)
  const getCell = useCallback(
    (row: number, column: number) => `${row + 1} · ${column + 1}`,
    [],
  )

  const jump = useCallback(() => {
    apiRef.current?.scrollToCell(API_JUMP_TARGET, 'center')
    apiRef.current?.focus()
  }, [])

  const selectRange = useCallback(() => {
    setSelection(API_SELECTION)
    apiRef.current?.scrollToCell({
      row: API_SELECTION.rowStart,
      column: API_SELECTION.columnStart,
    }, 'center')
    apiRef.current?.focus()
  }, [])

  return (
    <div className="component-gallery__example-stack">
      <div className="component-gallery__example-toolbar">
        <span><Target size={14} /> {t('gallery.api.toolbar')}</span>
        <button type="button" onClick={jump}>
          <MousePointer2 size={14} /> {t('gallery.api.jump')}
        </button>
        <button type="button" onClick={selectRange}>
          <ClipboardCopy size={14} /> {t('gallery.api.select')}
        </button>
      </div>
      <div className="component-gallery__example-grid">
        <UltiGridViewport
          rowCount={50_000}
          columnCount={500}
          getCell={getCell}
          selection={selection}
          onSelectionChange={setSelection}
          apiRef={apiRef}
          defaultColumnWidth={124}
          ariaLabel={t('gallery.api.title')}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  )
}
