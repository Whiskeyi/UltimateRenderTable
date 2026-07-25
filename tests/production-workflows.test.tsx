import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BudgetMatrixExample, {
  getBudgetVarianceConditionalRules,
  getLargestBudgetVarianceRow,
  getOverBudgetRowIndexes,
  OVER_BUDGET_THRESHOLD,
} from '../src/demo/examples/BudgetMatrixExample'
import OrderOperationsExample, {
  getOrderWorkflowIndexes,
} from '../src/demo/examples/OrderOperationsExample'
import { translate } from '../src/i18n'

describe('production example workflows', () => {
  it('keeps the unfiltered order queue lazy and narrows actionable searches', () => {
    expect(getOrderWorkflowIndexes('', false)).toBeNull()
    expect(getOrderWorkflowIndexes('OR-02600000', false)).toEqual([0])
    expect(getOrderWorkflowIndexes('OR-02600000', true)).toEqual([0])
    expect(getOrderWorkflowIndexes('OR-02600002', true)).toEqual([])
    expect(getOrderWorkflowIndexes('Shanghai flagship', false, [
      'Daybreak Living — Shanghai flagship',
      'Forest Isle Home Ltd.',
      'New Balance Enterprise Procurement Center',
      'Ark Community Buying — Chengdu High-tech Zone',
      'Clearwater Cross-border Retail Division',
      'Sanhe Food Service Supply Chain',
      'Morning Light Members Store — Wuhan',
      'Starloop Smart Devices Specialty Store',
    ])?.length).toBeGreaterThan(0)
  })

  it('builds a bounded finance review queue and identifies its largest overrun', () => {
    const reviewIndexes = getOverBudgetRowIndexes()

    expect(OVER_BUDGET_THRESHOLD).toBe(50_000)
    expect(reviewIndexes).toHaveLength(2_629)
    expect(getLargestBudgetVarianceRow(reviewIndexes)).toBe(11_352)
    expect(getOverBudgetRowIndexes(2_000_000)).toEqual([])
    expect(getLargestBudgetVarianceRow([])).toBeNull()
  })

  it('renders cost overruns as risk and savings as favorable variance', () => {
    const rules = getBudgetVarianceConditionalRules(6)

    expect(rules.find(({ kind }) => kind === 'dataBar')).toMatchObject({
      color: 'rgba(196, 72, 67, 0.25)',
      negativeColor: 'rgba(29, 143, 93, 0.27)',
    })
    expect(rules.find(({ id }) => id === 'variance-positive-6')).toMatchObject({
      when: { operator: 'greaterThan', value: 0 },
      style: { color: '#b54c48' },
    })
    expect(rules.find(({ id }) => id === 'variance-negative-6')).toMatchObject({
      when: { operator: 'lessThan', value: 0 },
      style: { color: '#177a50' },
    })
  })

  it('renders discoverable controls for completing each task', () => {
    const orderMarkup = renderToStaticMarkup(
      <OrderOperationsExample locale="zh-CN" t={() => ''} />,
    )
    const budgetMarkup = renderToStaticMarkup(
      <BudgetMatrixExample
        locale="zh-CN"
        t={(key, params) => translate('zh-CN', key, params)}
      />,
    )

    expect(orderMarkup).toContain('role="search"')
    expect(orderMarkup).toContain('placeholder="订单号、运单号或客户"')
    expect(orderMarkup).toContain('aria-pressed="false"')
    expect(orderMarkup).toContain('聚焦待处理')
    expect(orderMarkup).toContain('复制选区')

    expect(budgetMarkup).toContain('仅看超预算')
    expect(budgetMarkup).toContain('定位最大超支')
    expect(budgetMarkup).toContain('导出复核清单')
    expect(budgetMarkup).toContain('disabled=""')
  })
})
