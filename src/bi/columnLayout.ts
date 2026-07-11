interface WidthBearingColumn {
  width?: number
}

/** Projects application column widths into Core viewport coordinates. */
export function buildInsightViewportColumnWidths(
  columns: readonly WidthBearingColumn[] | undefined,
  columnWidths: ReadonlyMap<number, number> | undefined,
  rowNumberOffset: number,
): Map<number, number> {
  const result = new Map<number, number>()
  if (rowNumberOffset > 0) result.set(0, 54)
  if (columns) {
    for (let index = 0; index < columns.length; index += 1) {
      const width = columns[index]?.width
      if (width !== undefined) result.set(index + rowNumberOffset, width)
    }
  }
  if (columnWidths) {
    for (const [index, width] of columnWidths) result.set(index + rowNumberOffset, width)
  }
  return result
}

export function resolveInsightColumnWidth(
  index: number,
  columnWidths: ReadonlyMap<number, number> | undefined,
  columnWidth: number | undefined,
  defaultColumnWidth: number,
): number {
  return columnWidths?.get(index) ?? columnWidth ?? defaultColumnWidth
}
