import {
  BatteryMedium,
  Columns3,
  Hand,
  MousePointer2,
  Signal,
  Wifi,
} from 'lucide-react'
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
const DEVICE_WIDTH = 375
const DEVICE_HEIGHT = 750
const DEVICE_SIZE_LABEL = `${DEVICE_WIDTH} × ${DEVICE_HEIGHT}`

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
    <div className="component-gallery__example-stack component-gallery__mobile-demo">
      <div className="component-gallery__mobile-layout">
        <div className="component-gallery__mobile-overview">
          <header className="component-gallery__mobile-guide-head">
            <h4>{t('gallery.mobile.workbench.title')}</h4>
          </header>

          <ol className="component-gallery__mobile-steps">
            <li>
              <i aria-hidden="true"><Hand size={16} /></i>
              <span>
                <strong>{t('gallery.mobile.step.scroll.title')}</strong>
              </span>
            </li>
            <li>
              <i aria-hidden="true"><MousePointer2 size={16} /></i>
              <span>
                <strong>{t('gallery.mobile.step.select.title')}</strong>
              </span>
            </li>
            <li>
              <i aria-hidden="true"><Columns3 size={16} /></i>
              <span>
                <strong>{t('gallery.mobile.step.resize.title')}</strong>
              </span>
            </li>
          </ol>
        </div>

        <div className="component-gallery__mobile-body">
          <section
            className="component-gallery__mobile-canvas"
            aria-label={t('gallery.mobile.deviceLabel')}
          >
            <div
              className="component-gallery__mobile-device"
              data-viewport-width={DEVICE_WIDTH}
              data-viewport-height={DEVICE_HEIGHT}
            >
              <span className="component-gallery__mobile-device-island" aria-hidden="true" />
              <div className="component-gallery__mobile-screen">
                <div className="component-gallery__mobile-statusbar" aria-hidden="true">
                  <span>9:41</span>
                  <span><Signal size={10} /><Wifi size={10} /><BatteryMedium size={12} /></span>
                </div>
                <header className="component-gallery__mobile-appbar">
                  <span>
                    <strong>{t('gallery.mobile.deviceTitle')}</strong>
                    <small>{t('gallery.mobile.deviceMeta', { count: ROW_COUNT })}</small>
                  </span>
                  <small className="component-gallery__mobile-live">
                    <i aria-hidden="true" /> {t('gallery.mobile.deviceLive')}
                  </small>
                </header>
                <div className="component-gallery__mobile-grid">
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
                    style={{ height: '100%', border: 0, borderRadius: 0 }}
                  />
                </div>
                <span className="component-gallery__mobile-home-indicator" aria-hidden="true" />
              </div>
            </div>
          </section>

          <aside
            className="component-gallery__mobile-details"
            aria-labelledby="component-gallery-mobile-state-title"
          >
            <div className="component-gallery__mobile-state-head">
              <span className="component-gallery__mobile-state-eyebrow">
                {t('gallery.mobile.deviceLabel')}
              </span>
              <h5 id="component-gallery-mobile-state-title">{t('gallery.mobile.state.title')}</h5>
            </div>
            <div className="component-gallery__mobile-viewport-size">
              <small>{t('gallery.mobile.deviceLabel')}</small>
              <strong>{DEVICE_SIZE_LABEL}</strong>
            </div>
            <dl className="component-gallery__mobile-state">
              <div>
                <dt>{t('gallery.mobile.state.selection')}</dt>
                <dd><span>{rangeLabel}</span></dd>
              </div>
              <div>
                <dt>{t('gallery.mobile.state.resize')}</dt>
                <dd><span>{resizeLabel}</span></dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    </div>
  )
}
