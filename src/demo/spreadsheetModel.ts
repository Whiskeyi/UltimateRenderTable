import type { CellRange } from '@ultigrid/insight'
import { parseTSV } from '../core/selection.js'

export type SpreadsheetCellValue = string | number
export type SpreadsheetNumberFormat = 'general' | 'number' | 'currency' | 'percent'

export interface SpreadsheetSelectionStats {
  count: number
  numericCount: number
  sum: number
  average: number | null
}

export interface SpreadsheetEvaluator {
  getValue(row: number, column: number): SpreadsheetCellValue
}

export interface SpreadsheetEvaluatorOptions {
  rowCount?: number
  columnCount?: number
  maxFormulaCells?: number
  maxFormulaLength?: number
}

const CELL_REFERENCE = /^\$?([A-Z]+)\$?([1-9]\d*)$/i

export function cellKey(row: number, column: number): string {
  return `${row}:${column}`
}

export function columnName(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) return 'A'
  let result = ''
  let cursor = index + 1
  while (cursor > 0) {
    cursor -= 1
    result = String.fromCharCode(65 + (cursor % 26)) + result
    cursor = Math.floor(cursor / 26)
  }
  return result
}

export function selectionLabel(selection: CellRange | null): string {
  if (!selection) return 'A1'
  const start = `${columnName(selection.columnStart)}${selection.rowStart + 1}`
  const end = `${columnName(selection.columnEnd)}${selection.rowEnd + 1}`
  return start === end ? start : `${start}:${end}`
}

export function parseSelectionLabel(
  input: string,
  rowCount: number,
  columnCount: number,
): CellRange | null {
  const [startInput, endInput = startInput] = input.trim().split(':', 2)
  const start = parseCellReference(startInput ?? '')
  const end = parseCellReference(endInput ?? '')
  if (!start || !end) return null
  if (
    start.row >= rowCount || end.row >= rowCount ||
    start.column >= columnCount || end.column >= columnCount
  ) return null
  return {
    rowStart: Math.min(start.row, end.row),
    rowEnd: Math.max(start.row, end.row),
    columnStart: Math.min(start.column, end.column),
    columnEnd: Math.max(start.column, end.column),
  }
}

export function parseCellInput(input: string): SpreadsheetCellValue {
  const trimmed = input.trim()
  if (trimmed.startsWith('=')) return trimmed
  if (trimmed !== '' && Number.isFinite(Number(trimmed))) return Number(trimmed)
  return input
}

export function parseClipboardMatrix(input: string): SpreadsheetCellValue[][] {
  return parseTSV(input).map((row) => row.map(parseCellInput))
}

/**
 * Applies spreadsheet copy semantics to A1 references. Relative axes move,
 * while `$`-prefixed rows or columns remain fixed.
 */
export function translateFormulaReferences(
  value: SpreadsheetCellValue,
  rowOffset: number,
  columnOffset: number,
  rowCount = Number.POSITIVE_INFINITY,
  columnCount = Number.POSITIVE_INFINITY,
): SpreadsheetCellValue {
  if (typeof value !== 'string' || !value.trimStart().startsWith('=')) return value
  const leadingWhitespace = value.slice(0, value.length - value.trimStart().length)
  const formula = value.trimStart()
  let invalidReference = false
  const translated = formula.replace(
    /(\$?)([A-Z]+)(\$?)([1-9]\d*)/gi,
    (reference, columnAbsolute: string, columnLabel: string, rowAbsolute: string, rowLabel: string) => {
      const parsed = parseCellReference(reference)
      if (!parsed) return reference
      const nextRow = parsed.row + (rowAbsolute ? 0 : rowOffset)
      const nextColumn = parsed.column + (columnAbsolute ? 0 : columnOffset)
      if (
        nextRow < 0
        || nextColumn < 0
        || nextRow >= rowCount
        || nextColumn >= columnCount
      ) {
        invalidReference = true
        return '#REF!'
      }
      return `${columnAbsolute}${columnName(nextColumn)}${rowAbsolute}${nextRow + 1}`
    },
  )
  return invalidReference ? '#REF!' : leadingWhitespace + translated
}

export function createSpreadsheetEvaluator(
  values: ReadonlyMap<string, SpreadsheetCellValue>,
  options: SpreadsheetEvaluatorOptions = {},
): SpreadsheetEvaluator {
  const cache = new Map<string, SpreadsheetCellValue>()
  const resolving = new Set<string>()
  const limits = {
    rowCount: options.rowCount ?? Number.POSITIVE_INFINITY,
    columnCount: options.columnCount ?? Number.POSITIVE_INFINITY,
    maxFormulaCells: options.maxFormulaCells ?? 100_000,
    maxFormulaLength: options.maxFormulaLength ?? 2_000,
  }

  const getValue = (row: number, column: number): SpreadsheetCellValue => {
    if (
      row < 0 || column < 0 ||
      row >= limits.rowCount || column >= limits.columnCount
    ) return '#REF!'
    const key = cellKey(row, column)
    const cached = cache.get(key)
    if (cached !== undefined || cache.has(key)) return cached ?? ''
    const raw = values.get(key) ?? ''
    if (typeof raw !== 'string' || !raw.trimStart().startsWith('=')) {
      cache.set(key, raw)
      return raw
    }
    if (resolving.has(key)) return '#CYCLE!'
    resolving.add(key)
    let result: SpreadsheetCellValue
    try {
      if (raw.length > limits.maxFormulaLength) throw new FormulaError('#NUM!')
      const parser = new FormulaParser(raw.trimStart().slice(1), getValue, limits)
      result = parser.parse()
      if (typeof result === 'number' && !Number.isFinite(result)) result = '#NUM!'
    } catch (reason) {
      result = reason instanceof FormulaError ? reason.code : '#ERROR!'
    }
    resolving.delete(key)
    cache.set(key, result)
    return result
  }

  return { getValue }
}

export function calculateSelectionStats(
  selection: CellRange | null,
  getValue: (row: number, column: number) => SpreadsheetCellValue,
): SpreadsheetSelectionStats {
  if (!selection) return { count: 0, numericCount: 0, sum: 0, average: null }
  let count = 0
  let numericCount = 0
  let sum = 0
  for (let row = selection.rowStart; row <= selection.rowEnd; row += 1) {
    for (let column = selection.columnStart; column <= selection.columnEnd; column += 1) {
      const value = getValue(row, column)
      if (value !== '') count += 1
      if (typeof value === 'number' && Number.isFinite(value)) {
        numericCount += 1
        sum += value
      }
    }
  }
  return {
    count,
    numericCount,
    sum,
    average: numericCount > 0 ? sum / numericCount : null,
  }
}

export function formatSpreadsheetValue(
  value: SpreadsheetCellValue,
  format: SpreadsheetNumberFormat,
  locale: string,
): string {
  if (typeof value !== 'number') return String(value)
  if (format === 'currency') {
    return Intl.NumberFormat(locale, {
      style: 'currency',
      currency: locale === 'zh-CN' ? 'CNY' : 'USD',
      maximumFractionDigits: 0,
    }).format(value)
  }
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`
  if (format === 'number') {
    return Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }
  return Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(value)
}

function parseCellReference(input: string): { row: number; column: number } | null {
  const match = CELL_REFERENCE.exec(input.trim())
  if (!match) return null
  let column = 0
  for (const character of match[1]!.toUpperCase()) {
    column = column * 26 + character.charCodeAt(0) - 64
  }
  return { row: Number(match[2]) - 1, column: column - 1 }
}

type FormulaTokenType =
  | 'number'
  | 'identifier'
  | 'plus'
  | 'minus'
  | 'multiply'
  | 'divide'
  | 'power'
  | 'percent'
  | 'leftParen'
  | 'rightParen'
  | 'comma'
  | 'colon'
  | 'end'

interface FormulaToken {
  type: FormulaTokenType
  value: string
}

class FormulaError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

class FormulaParser {
  private readonly tokens: FormulaToken[]
  private cursor = 0

  constructor(
    expression: string,
    private readonly resolveCell: (row: number, column: number) => SpreadsheetCellValue,
    private readonly limits: Required<SpreadsheetEvaluatorOptions>,
  ) {
    this.tokens = tokenizeFormula(expression)
  }

  parse(): number {
    const value = this.parseExpression()
    if (this.peek().type !== 'end') throw new FormulaError('#ERROR!')
    return value
  }

  private parseExpression(): number {
    let value = this.parseTerm()
    while (this.peek().type === 'plus' || this.peek().type === 'minus') {
      const operation = this.consume().type
      const right = this.parseTerm()
      value = operation === 'plus' ? value + right : value - right
    }
    return value
  }

  private parseTerm(): number {
    let value = this.parsePower()
    while (this.peek().type === 'multiply' || this.peek().type === 'divide') {
      const operation = this.consume().type
      const right = this.parsePower()
      if (operation === 'divide' && right === 0) throw new FormulaError('#DIV/0!')
      value = operation === 'multiply' ? value * right : value / right
    }
    return value
  }

  private parsePower(): number {
    let value = this.parseUnary()
    if (this.peek().type === 'power') {
      this.consume()
      value **= this.parsePower()
    }
    return value
  }

  private parseUnary(): number {
    if (this.peek().type === 'plus') {
      this.consume()
      return this.parseUnary()
    }
    if (this.peek().type === 'minus') {
      this.consume()
      return -this.parseUnary()
    }
    let value = this.parsePrimary()
    if (this.peek().type === 'percent') {
      this.consume()
      value /= 100
    }
    return value
  }

  private parsePrimary(): number {
    const token = this.consume()
    if (token.type === 'number') return Number(token.value)
    if (token.type === 'leftParen') {
      const value = this.parseExpression()
      this.expect('rightParen')
      return value
    }
    if (token.type !== 'identifier') throw new FormulaError('#ERROR!')

    if (this.peek().type === 'leftParen') return this.parseFunction(token.value)
    const reference = parseCellReference(token.value)
    if (!reference) throw new FormulaError('#NAME?')
    return numericCellValue(this.resolveCell(reference.row, reference.column))
  }

  private parseFunction(name: string): number {
    this.expect('leftParen')
    const values: number[] = []
    if (this.peek().type !== 'rightParen') {
      while (true) {
        values.push(...this.parseFunctionArgument())
        if (this.peek().type !== 'comma') break
        this.consume()
      }
    }
    this.expect('rightParen')
    const normalized = name.toUpperCase()
    if (normalized === 'SUM') return values.reduce((sum, value) => sum + value, 0)
    if (normalized === 'AVERAGE') {
      if (values.length === 0) throw new FormulaError('#DIV/0!')
      return values.reduce((sum, value) => sum + value, 0) / values.length
    }
    if (normalized === 'MIN') {
      return values.length > 0
        ? values.slice(1).reduce((minimum, value) => Math.min(minimum, value), values[0]!)
        : 0
    }
    if (normalized === 'MAX') {
      return values.length > 0
        ? values.slice(1).reduce((maximum, value) => Math.max(maximum, value), values[0]!)
        : 0
    }
    if (normalized === 'COUNT') return values.length
    throw new FormulaError('#NAME?')
  }

  private parseFunctionArgument(): number[] {
    const start = this.peek()
    const next = this.tokens[this.cursor + 1]
    const end = this.tokens[this.cursor + 2]
    const startReference = start.type === 'identifier' ? parseCellReference(start.value) : null
    const endReference = end?.type === 'identifier' ? parseCellReference(end.value) : null
    if (startReference && next?.type === 'colon' && endReference) {
      this.cursor += 3
      const values: number[] = []
      const rowStart = Math.min(startReference.row, endReference.row)
      const rowEnd = Math.max(startReference.row, endReference.row)
      const columnStart = Math.min(startReference.column, endReference.column)
      const columnEnd = Math.max(startReference.column, endReference.column)
      if (rowEnd >= this.limits.rowCount || columnEnd >= this.limits.columnCount) {
        throw new FormulaError('#REF!')
      }
      const cellCount = (rowEnd - rowStart + 1) * (columnEnd - columnStart + 1)
      if (cellCount > this.limits.maxFormulaCells) throw new FormulaError('#NUM!')
      for (let row = rowStart; row <= rowEnd; row += 1) {
        for (let column = columnStart; column <= columnEnd; column += 1) {
          const value = this.resolveCell(row, column)
          if (typeof value === 'number' && Number.isFinite(value)) values.push(value)
          else if (typeof value === 'string' && value.startsWith('#')) throw new FormulaError(value)
        }
      }
      return values
    }
    if (startReference && (next?.type === 'comma' || next?.type === 'rightParen')) {
      this.cursor += 1
      const value = this.resolveCell(startReference.row, startReference.column)
      if (typeof value === 'number' && Number.isFinite(value)) return [value]
      if (typeof value === 'string' && value.startsWith('#')) throw new FormulaError(value)
      return []
    }
    return [this.parseExpression()]
  }

  private peek(): FormulaToken {
    return this.tokens[this.cursor] ?? { type: 'end', value: '' }
  }

  private consume(): FormulaToken {
    const token = this.peek()
    this.cursor += 1
    return token
  }

  private expect(type: FormulaTokenType): void {
    if (this.consume().type !== type) throw new FormulaError('#ERROR!')
  }
}

function numericCellValue(value: SpreadsheetCellValue): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value !== '' && Number.isFinite(Number(value))) return Number(value)
  if (typeof value === 'string' && value.startsWith('#')) throw new FormulaError(value)
  return 0
}

function tokenizeFormula(expression: string): FormulaToken[] {
  const tokens: FormulaToken[] = []
  let index = 0
  while (index < expression.length) {
    const character = expression[index]!
    if (/\s/.test(character)) {
      index += 1
      continue
    }
    if (/\d|\./.test(character)) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(expression.slice(index))
      if (!match) throw new FormulaError('#ERROR!')
      tokens.push({ type: 'number', value: match[0] })
      index += match[0].length
      continue
    }
    if (/[A-Za-z_$]/.test(character)) {
      const match = /^\$?[A-Za-z]+\$?\d*|^[_A-Za-z][_A-Za-z0-9]*/.exec(expression.slice(index))
      if (!match) throw new FormulaError('#ERROR!')
      tokens.push({ type: 'identifier', value: match[0] })
      index += match[0].length
      continue
    }
    const type = ({
      '+': 'plus',
      '-': 'minus',
      '*': 'multiply',
      '/': 'divide',
      '^': 'power',
      '%': 'percent',
      '(': 'leftParen',
      ')': 'rightParen',
      ',': 'comma',
      ':': 'colon',
    } as const)[character]
    if (!type) throw new FormulaError('#ERROR!')
    tokens.push({ type, value: character })
    index += 1
  }
  tokens.push({ type: 'end', value: '' })
  return tokens
}
