import type {
  InsightCellIcon,
  InsightCellTextStyle,
  InsightCellContext,
} from './types.js'

export type ConditionalOperator =
  | 'always'
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'between'
  | 'notBetween'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'custom'

export interface ConditionalValueCondition<TRow = unknown, TValue = unknown> {
  operator: ConditionalOperator
  value?: unknown
  secondValue?: unknown
  caseSensitive?: boolean
  predicate?: (context: InsightCellContext<TRow, TValue>) => boolean
}

interface ConditionalRuleBase<TRow, TValue> {
  id: string
  enabled?: boolean
  /** Lower values are evaluated first. Input order is retained for ties. */
  priority?: number
  when?: ConditionalValueCondition<TRow, TValue>
  stopIfTrue?: boolean
}

export interface TextConditionalRule<TRow = unknown, TValue = unknown>
  extends ConditionalRuleBase<TRow, TValue> {
  kind: 'text'
  style: InsightCellTextStyle
}

export interface BackgroundConditionalRule<TRow = unknown, TValue = unknown>
  extends ConditionalRuleBase<TRow, TValue> {
  kind: 'background'
  color: string
}

export interface IconConditionalRule<TRow = unknown, TValue = unknown>
  extends ConditionalRuleBase<TRow, TValue> {
  kind: 'icon'
  icon: InsightCellIcon
}

export interface ColorScaleConditionalRule<TRow = unknown, TValue = unknown>
  extends ConditionalRuleBase<TRow, TValue> {
  kind: 'colorScale'
  /** Explicit numeric domain keeps evaluation independent from the data source. */
  domain: readonly [min: number, max: number]
  colors: readonly [min: string, max: string] | readonly [min: string, mid: string, max: string]
  midpoint?: number
  target?: 'background' | 'text'
  clamp?: boolean
}

export interface DataBarConditionalRule<TRow = unknown, TValue = unknown>
  extends ConditionalRuleBase<TRow, TValue> {
  kind: 'dataBar'
  domain: readonly [min: number, max: number]
  color: string
  negativeColor?: string
  /** Defaults to zero, clamped into the supplied domain. */
  axis?: number
}

export type ConditionalFormatRule<TRow = unknown, TValue = unknown> =
  | TextConditionalRule<TRow, TValue>
  | BackgroundConditionalRule<TRow, TValue>
  | IconConditionalRule<TRow, TValue>
  | ColorScaleConditionalRule<TRow, TValue>
  | DataBarConditionalRule<TRow, TValue>

/**
 * Mutable on purpose. Create one per rendered cell, or reuse a scratch instance
 * when adapting values to the core table. evaluateInto resets every field.
 */
export interface ConditionalFormatResult extends InsightCellTextStyle {
  backgroundColor: string | undefined
  icon: InsightCellIcon | undefined
  dataBarColor: string | undefined
  dataBarOffset: number
  dataBarRatio: number
  dataBarNegative: boolean
  matchedRuleCount: number
  lastMatchedRuleId: string | undefined
}

export interface CompiledConditionalFormatter<TRow = unknown, TValue = unknown> {
  readonly ruleCount: number
  createResult(): ConditionalFormatResult
  evaluate(
    context: InsightCellContext<TRow, TValue>,
    target?: ConditionalFormatResult,
  ): ConditionalFormatResult
  evaluateInto(
    context: InsightCellContext<TRow, TValue>,
    target: ConditionalFormatResult,
  ): ConditionalFormatResult
}

type RulePredicate<TRow, TValue> = (context: InsightCellContext<TRow, TValue>) => boolean

interface CompiledRule<TRow, TValue> {
  id: string
  stopIfTrue: boolean
  test: RulePredicate<TRow, TValue>
  apply: (context: InsightCellContext<TRow, TValue>, target: ConditionalFormatResult) => void
}

const alwaysTrue = () => true

export function createConditionalFormatResult(): ConditionalFormatResult {
  return {
    backgroundColor: undefined,
    color: undefined,
    fontFamily: undefined,
    fontSize: undefined,
    fontStyle: undefined,
    fontWeight: undefined,
    letterSpacing: undefined,
    lineHeight: undefined,
    textDecoration: undefined,
    icon: undefined,
    dataBarColor: undefined,
    dataBarOffset: 0,
    dataBarRatio: 0,
    dataBarNegative: false,
    matchedRuleCount: 0,
    lastMatchedRuleId: undefined,
  }
}

export function resetConditionalFormatResult(
  target: ConditionalFormatResult,
): ConditionalFormatResult {
  target.backgroundColor = undefined
  target.color = undefined
  target.fontFamily = undefined
  target.fontSize = undefined
  target.fontStyle = undefined
  target.fontWeight = undefined
  target.letterSpacing = undefined
  target.lineHeight = undefined
  target.textDecoration = undefined
  target.icon = undefined
  target.dataBarColor = undefined
  target.dataBarOffset = 0
  target.dataBarRatio = 0
  target.dataBarNegative = false
  target.matchedRuleCount = 0
  target.lastMatchedRuleId = undefined
  return target
}

/** Compile once when props change; evaluation performs no rule-array allocation. */
export function compileConditionalFormatting<TRow = unknown, TValue = unknown>(
  rules: readonly ConditionalFormatRule<TRow, TValue>[],
): CompiledConditionalFormatter<TRow, TValue> {
  const ordered = rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.enabled !== false)
    .sort(
      (left, right) =>
        (left.rule.priority ?? 0) - (right.rule.priority ?? 0) || left.index - right.index,
    )

  const compiled: CompiledRule<TRow, TValue>[] = new Array(ordered.length)
  for (let index = 0; index < ordered.length; index += 1) {
    const item = ordered[index]
    if (item) compiled[index] = compileRule(item.rule)
  }

  const evaluateInto = (
    context: InsightCellContext<TRow, TValue>,
    target: ConditionalFormatResult,
  ): ConditionalFormatResult => {
    resetConditionalFormatResult(target)

    for (let index = 0; index < compiled.length; index += 1) {
      const rule = compiled[index]
      if (!rule || !rule.test(context)) continue

      rule.apply(context, target)
      target.matchedRuleCount += 1
      target.lastMatchedRuleId = rule.id
      if (rule.stopIfTrue) break
    }

    return target
  }

  return {
    ruleCount: compiled.length,
    createResult: createConditionalFormatResult,
    evaluate(context, target = createConditionalFormatResult()) {
      return evaluateInto(context, target)
    },
    evaluateInto,
  }
}

function compileRule<TRow, TValue>(
  rule: ConditionalFormatRule<TRow, TValue>,
): CompiledRule<TRow, TValue> {
  const test = compileCondition(rule.when)
  const base = { id: rule.id, stopIfTrue: rule.stopIfTrue === true, test }

  switch (rule.kind) {
    case 'text': {
      const style = { ...rule.style }
      return {
        ...base,
        apply: (_context, target) => applyTextStyle(style, target),
      }
    }
    case 'background':
      return {
        ...base,
        apply: (_context, target) => {
          target.backgroundColor = rule.color
        },
      }
    case 'icon': {
      const icon = { ...rule.icon }
      return {
        ...base,
        apply: (_context, target) => {
          target.icon = icon
        },
      }
    }
    case 'colorScale':
      return { ...base, apply: compileColorScale(rule) }
    case 'dataBar':
      return { ...base, apply: compileDataBar(rule) }
  }
}

function compileCondition<TRow, TValue>(
  condition: ConditionalValueCondition<TRow, TValue> | undefined,
): RulePredicate<TRow, TValue> {
  if (!condition || condition.operator === 'always') return alwaysTrue

  const expected = condition.value
  const second = condition.secondValue
  const caseSensitive = condition.caseSensitive === true

  switch (condition.operator) {
    case 'equals':
      return ({ value }) => Object.is(value, expected)
    case 'notEquals':
      return ({ value }) => !Object.is(value, expected)
    case 'greaterThan':
      return ({ value }) => toComparableNumber(value) > toComparableNumber(expected)
    case 'greaterThanOrEqual':
      return ({ value }) => toComparableNumber(value) >= toComparableNumber(expected)
    case 'lessThan':
      return ({ value }) => toComparableNumber(value) < toComparableNumber(expected)
    case 'lessThanOrEqual':
      return ({ value }) => toComparableNumber(value) <= toComparableNumber(expected)
    case 'between': {
      const first = toComparableNumber(expected)
      const last = toComparableNumber(second)
      const min = Math.min(first, last)
      const max = Math.max(first, last)
      return ({ value }) => {
        const numeric = toComparableNumber(value)
        return numeric >= min && numeric <= max
      }
    }
    case 'notBetween': {
      const first = toComparableNumber(expected)
      const last = toComparableNumber(second)
      const min = Math.min(first, last)
      const max = Math.max(first, last)
      return ({ value }) => {
        const numeric = toComparableNumber(value)
        return numeric < min || numeric > max
      }
    }
    case 'contains':
      return compileStringPredicate(expected, caseSensitive, (value, search) =>
        value.includes(search),
      )
    case 'notContains': {
      const contains = compileStringPredicate(expected, caseSensitive, (value, search) =>
        value.includes(search),
      )
      return (context) => !contains(context)
    }
    case 'startsWith':
      return compileStringPredicate(expected, caseSensitive, (value, search) =>
        value.startsWith(search),
      )
    case 'endsWith':
      return compileStringPredicate(expected, caseSensitive, (value, search) =>
        value.endsWith(search),
      )
    case 'isEmpty':
      return ({ value }) => value == null || value === ''
    case 'isNotEmpty':
      return ({ value }) => value != null && value !== ''
    case 'custom':
      return condition.predicate ?? (() => false)
  }
}

function compileStringPredicate<TRow, TValue>(
  expected: unknown,
  caseSensitive: boolean,
  compare: (value: string, search: string) => boolean,
): RulePredicate<TRow, TValue> {
  const rawSearch = String(expected ?? '')
  const search = caseSensitive ? rawSearch : rawSearch.toLocaleLowerCase()
  if (caseSensitive) return ({ value }) => compare(String(value ?? ''), search)
  return ({ value }) => compare(String(value ?? '').toLocaleLowerCase(), search)
}

function applyTextStyle(style: InsightCellTextStyle, target: ConditionalFormatResult): void {
  if (style.color !== undefined) target.color = style.color
  if (style.fontFamily !== undefined) target.fontFamily = style.fontFamily
  if (style.fontSize !== undefined) target.fontSize = style.fontSize
  if (style.fontStyle !== undefined) target.fontStyle = style.fontStyle
  if (style.fontWeight !== undefined) target.fontWeight = style.fontWeight
  if (style.letterSpacing !== undefined) target.letterSpacing = style.letterSpacing
  if (style.lineHeight !== undefined) target.lineHeight = style.lineHeight
  if (style.textDecoration !== undefined) target.textDecoration = style.textDecoration
}

function compileColorScale<TRow, TValue>(
  rule: ColorScaleConditionalRule<TRow, TValue>,
): (context: InsightCellContext<TRow, TValue>, target: ConditionalFormatResult) => void {
  const [min, max] = normalizeDomain(rule.domain, rule.id)
  const span = max - min
  const clamp = rule.clamp !== false
  const palette = createColorPalette(rule.colors, rule.midpoint, min, max)
  const targetProperty = rule.target === 'text' ? 'color' : 'backgroundColor'

  return ({ value }, target) => {
    const numeric = toComparableNumber(value)
    if (!Number.isFinite(numeric)) return
    let ratio = span === 0 ? 1 : (numeric - min) / span
    if (clamp) ratio = clampUnit(ratio)
    if (ratio < 0 || ratio > 1) return
    const index = Math.min(255, Math.max(0, Math.round(ratio * 255)))
    target[targetProperty] = palette[index]
  }
}

function compileDataBar<TRow, TValue>(
  rule: DataBarConditionalRule<TRow, TValue>,
): (context: InsightCellContext<TRow, TValue>, target: ConditionalFormatResult) => void {
  const [min, max] = normalizeDomain(rule.domain, rule.id)
  const span = max - min
  const axis = Math.min(max, Math.max(min, rule.axis ?? 0))
  const axisRatio = span === 0 ? 0 : (axis - min) / span
  const negativeColor = rule.negativeColor ?? rule.color

  return ({ value }, target) => {
    const numeric = toComparableNumber(value)
    if (!Number.isFinite(numeric)) return
    const valueRatio = span === 0 ? 1 : clampUnit((numeric - min) / span)
    target.dataBarOffset = Math.min(axisRatio, valueRatio)
    target.dataBarRatio = Math.abs(valueRatio - axisRatio)
    target.dataBarNegative = numeric < axis
    target.dataBarColor = numeric < axis ? negativeColor : rule.color
  }
}

function toComparableNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return Number.NaN
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function normalizeDomain(domain: readonly [number, number], ruleId: string): readonly [number, number] {
  const first = domain[0]
  const second = domain[1]
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    throw new Error(`Conditional formatting rule ${ruleId} requires a finite numeric domain`)
  }
  return first <= second ? [first, second] : [second, first]
}

type Rgba = readonly [red: number, green: number, blue: number, alpha: number]

function createColorPalette(
  colors: readonly [string, string] | readonly [string, string, string],
  midpoint: number | undefined,
  min: number,
  max: number,
): readonly string[] {
  const first = parseColor(colors[0])
  const middle = colors.length === 3 ? parseColor(colors[1]) : undefined
  const last = parseColor(colors[colors.length - 1] ?? colors[0])
  const palette = new Array<string>(256)

  if (!first || !last || (colors.length === 3 && !middle)) {
    for (let index = 0; index < 256; index += 1) {
      palette[index] = colors[Math.round((index / 255) * (colors.length - 1))] ?? colors[0]
    }
    return palette
  }

  const midpointRatio =
    middle && max !== min ? clampUnit(((midpoint ?? (min + max) / 2) - min) / (max - min)) : 0.5

  for (let index = 0; index < 256; index += 1) {
    const ratio = index / 255
    if (middle && ratio <= midpointRatio) {
      palette[index] = interpolateColor(first, middle, midpointRatio === 0 ? 1 : ratio / midpointRatio)
    } else if (middle) {
      const tailSpan = 1 - midpointRatio
      palette[index] = interpolateColor(
        middle,
        last,
        tailSpan === 0 ? 1 : (ratio - midpointRatio) / tailSpan,
      )
    } else {
      palette[index] = interpolateColor(first, last, ratio)
    }
  }
  return palette
}

function parseColor(color: string): Rgba | undefined {
  const normalized = color.trim()
  const shortHex = /^#([\da-f])([\da-f])([\da-f])$/i.exec(normalized)
  if (shortHex) {
    const red = shortHex[1]
    const green = shortHex[2]
    const blue = shortHex[3]
    if (red && green && blue) {
      return [
        Number.parseInt(red + red, 16),
        Number.parseInt(green + green, 16),
        Number.parseInt(blue + blue, 16),
        1,
      ]
    }
  }

  const longHex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/i.exec(normalized)
  if (longHex) {
    const red = longHex[1]
    const green = longHex[2]
    const blue = longHex[3]
    if (red && green && blue) {
      return [
        Number.parseInt(red, 16),
        Number.parseInt(green, 16),
        Number.parseInt(blue, 16),
        longHex[4] ? Number.parseInt(longHex[4], 16) / 255 : 1,
      ]
    }
  }

  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(
    normalized,
  )
  if (!rgb) return undefined
  const red = rgb[1]
  const green = rgb[2]
  const blue = rgb[3]
  if (!red || !green || !blue) return undefined
  return [
    Math.min(255, Number(red)),
    Math.min(255, Number(green)),
    Math.min(255, Number(blue)),
    rgb[4] === undefined ? 1 : clampUnit(Number(rgb[4])),
  ]
}

function interpolateColor(from: Rgba, to: Rgba, rawRatio: number): string {
  const ratio = clampUnit(rawRatio)
  const red = Math.round(from[0] + (to[0] - from[0]) * ratio)
  const green = Math.round(from[1] + (to[1] - from[1]) * ratio)
  const blue = Math.round(from[2] + (to[2] - from[2]) * ratio)
  const alpha = from[3] + (to[3] - from[3]) * ratio
  if (alpha >= 0.999) return `rgb(${red} ${green} ${blue})`
  return `rgb(${red} ${green} ${blue} / ${alpha.toFixed(3)})`
}
