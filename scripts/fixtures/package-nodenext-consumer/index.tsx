import {
  moveTabAddress,
  parseTSV,
  rangesIntersect,
  rangeToTSV,
  UltiGridViewport,
  type ApiRef,
  type UltiGridViewportApi,
  type UltiGridViewportProps,
} from '@ultigrid/core'
import {
  defineInsightColumn,
  UltiGridInsight,
  type UltiGridInsightApi,
  type UltiGridInsightProps,
} from '@ultigrid/insight'

interface Row {
  id: number
  label: string
}

const coreApiRef: ApiRef<UltiGridViewportApi> = { current: null }
const coreProps = {
  rowCount: 2,
  columnCount: 2,
  getCell: (row: number, column: number) => `${row}:${column}`,
  mobileInteraction: true,
  columnResize: true,
} satisfies UltiGridViewportProps<string>

const columns = [
  defineInsightColumn<Row, string>({
    id: 'label',
    header: 'Label',
    getValue: (row) => row.label,
  }),
]
const insightApiRef: ApiRef<UltiGridInsightApi> = { current: null }
const insightProps = {
  rows: [{ id: 1, label: 'North' }],
  columns,
  getRowId: (row: Row) => row.id,
  mobileInteraction: true,
  columnResize: true,
} satisfies UltiGridInsightProps<Row>

type InsightApiHasNoViewport = 'viewport' extends keyof UltiGridInsightApi ? never : true
const insightApiHasNoViewport: InsightApiHasNoViewport = true
export const parsedClipboard = parseTSV('North\t42')
export const serializedRange = rangeToTSV(
  { rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 1 },
  ({ column }) => column === 0 ? 'North' : 42,
)
export const rangesOverlap = rangesIntersect(
  { rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 1 },
  { rowStart: 1, rowEnd: 2, columnStart: 1, columnEnd: 2 },
)
export const nextTabAddress = moveTabAddress(
  { row: 0, column: 0 },
  { rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 1 },
  false,
  () => undefined,
)

export const coreElement = <UltiGridViewport {...coreProps} apiRef={coreApiRef} />
export const insightElement = <UltiGridInsight {...insightProps} apiRef={insightApiRef} />
export { insightApiHasNoViewport }
