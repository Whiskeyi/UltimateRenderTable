import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  CircleAlert,
  ClipboardCopy,
  Search,
  Signal,
  X,
} from 'lucide-react'
import {
  UltiGridInsight,
  defineInsightColumn,
  type CellRange,
  type InsightCellComponentProps,
  type InsightCellContext,
  type InsightColumnDefinition,
  type LazyRowSource,
  type UltiGridInsightApi,
} from '@ultigrid/insight'

type OrderStatus = 'exception' | 'pending' | 'picking' | 'packed' | 'shipped' | 'cancelled'
type SalesChannel = 'direct' | 'marketplace' | 'retail' | 'wholesale'
type PaymentStatus = 'paid' | 'cod' | 'review' | 'refunded'
type RiskLevel = 'normal' | 'warning' | 'critical' | 'blocked'
type NoteCode = 'addressMismatch' | 'carrierEscalation' | 'highValueCheck' | 'customerCallback'

interface OrderOperationsRow {
  id: number
  orderNumber: string
  status: OrderStatus
  channel: SalesChannel
  customerIndex: number
  regionIndex: number
  itemCount: number
  amountCents: number
  paymentStatus: PaymentStatus
  warehouseIndex: number
  carrierIndex: number | null
  trackingNumber: string | null
  createdAt: number
  promisedAt: number
  slaMinutes: number
  risk: RiskLevel
  addressIndex: number
  noteCode: NoteCode | null
}

interface OrderOperationsExampleProps {
  locale: 'zh-CN' | 'en-US'
  t: unknown
}

const ROW_COUNT = 12_480
const NOW = Date.UTC(2026, 6, 18, 8, 0)

const STATUS_SEQUENCE: readonly OrderStatus[] = [
  'exception',
  'cancelled',
  'picking',
  'packed',
  'shipped',
  'pending',
  'packed',
  'shipped',
  'picking',
  'pending',
  'shipped',
  'packed',
  'picking',
  'shipped',
  'pending',
  'packed',
  'shipped',
  'picking',
  'pending',
] as const

const CHANNEL_SEQUENCE: readonly SalesChannel[] = [
  'direct',
  'marketplace',
  'retail',
  'wholesale',
] as const

const CARRIER_CODES = ['SF', 'JD', 'YT', 'DHL'] as const

const COPY = {
  zh: {
    title: '订单履约工作台',
    window: '实时履约窗口',
    rows: '笔订单',
    selected: '已选',
    cells: '个单元格',
    noSelection: '未选择单元格',
    currentOrder: '当前订单',
    search: '搜索订单',
    searchPlaceholder: '订单号、运单号或客户',
    clearSearch: '清除搜索',
    focusAttention: '聚焦待处理',
    results: '条匹配',
    noResults: '没有匹配的待处理订单',
    copy: '复制选区',
    copied: '已复制',
    copyFailed: '复制失败',
    ariaLabel: '订单履约中心生产队列',
    empty: '—',
    slaDue: '现在到期',
    overduePrefix: '逾期',
    remainingPrefix: '剩余',
    day: '天',
    hour: '小时',
    minute: '分',
    headers: {
      orderNumber: '订单号',
      status: '履约状态',
      channel: '渠道',
      customer: '客户 / 门店',
      region: '区域',
      itemCount: '商品数',
      amount: '应付金额',
      payment: '支付',
      warehouse: '履约仓',
      carrier: '承运商',
      tracking: '运单号',
      createdAt: '下单时间',
      promisedAt: '承诺送达',
      sla: 'SLA 余量',
      risk: '风险级别',
      address: '收货地址',
      note: '异常备注',
    },
    statuses: {
      exception: '异常',
      pending: '待审核',
      picking: '拣货中',
      packed: '已打包',
      shipped: '运输中',
      cancelled: '已取消',
    },
    channels: {
      direct: '品牌商城',
      marketplace: '电商平台',
      retail: '线下零售',
      wholesale: '企业采购',
    },
    payments: {
      paid: '已支付',
      cod: '货到付款',
      review: '人工复核',
      refunded: '已退款',
    },
    risks: {
      normal: '正常',
      warning: '临期',
      critical: '超时',
      blocked: '阻塞',
    },
    customers: [
      '上海朝暮生活旗舰店',
      '杭州森屿家居有限公司',
      '北京新衡企业采购中心',
      '成都方舟社区团购（高新区）',
      '深圳澄海跨境零售事业部',
      '南京叁禾餐饮供应链',
      '武汉沐光会员店',
      '宁波星环智能设备专营店',
    ],
    regions: ['华东', '华北', '华南', '西南', '华中', '东北'],
    warehouses: ['上海青浦一号仓', '苏州昆山自动化仓', '北京顺义中心仓', '广州南沙保税仓'],
    carriers: ['顺丰速运', '京东物流', '圆通速递', 'DHL Express'],
    addresses: [
      '上海市浦东新区张江路 88 号创新园 3 号楼前台（工作日 18:00 前送达）',
      '北京市朝阳区望京东园一区 120 号楼 B2 装卸区，请联系库房值班人员',
      '广东省深圳市南山区粤海街道科苑南路 2666 号中国华润大厦 18 层',
      '四川省成都市高新区天府五街 200 号菁蓉汇 6 号楼企业服务中心',
      '浙江省杭州市余杭区仓前街道文一西路 1326 号梦想小镇 7 幢',
      '湖北省武汉市江汉区建设大道 568 号新世界国贸大厦东侧收货平台',
    ],
    notes: {
      addressMismatch: '地址智能校验失败：行政区与邮编不一致，等待客服确认。',
      carrierEscalation: '承运商超过 30 分钟未揽收，已升级至区域调度。',
      highValueCheck: '高价值订单，出库前需复核序列号并留存包装影像。',
      customerCallback: '客户要求改约晚间配送，请在交接承运商前回电确认。',
    },
  },
  en: {
    title: 'Order fulfillment workbench',
    window: 'Live fulfillment window',
    rows: 'orders',
    selected: 'Selected',
    cells: 'cells',
    noSelection: 'No cells selected',
    currentOrder: 'Current order',
    search: 'Search orders',
    searchPlaceholder: 'Order, tracking, or customer',
    clearSearch: 'Clear search',
    focusAttention: 'Focus attention',
    results: 'matches',
    noResults: 'No matching orders need attention',
    copy: 'Copy selection',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    ariaLabel: 'Production order fulfillment queue',
    empty: '—',
    slaDue: 'Due now',
    overduePrefix: 'Overdue',
    remainingPrefix: 'Remaining',
    day: 'd',
    hour: 'h',
    minute: 'm',
    headers: {
      orderNumber: 'Order ID',
      status: 'Status',
      channel: 'Channel',
      customer: 'Customer / store',
      region: 'Region',
      itemCount: 'Items',
      amount: 'Order total',
      payment: 'Payment',
      warehouse: 'Fulfillment site',
      carrier: 'Carrier',
      tracking: 'Tracking number',
      createdAt: 'Ordered at',
      promisedAt: 'Promised by',
      sla: 'SLA remaining',
      risk: 'Risk',
      address: 'Delivery address',
      note: 'Exception note',
    },
    statuses: {
      exception: 'Exception',
      pending: 'Pending review',
      picking: 'Picking',
      packed: 'Packed',
      shipped: 'In transit',
      cancelled: 'Cancelled',
    },
    channels: {
      direct: 'Brand store',
      marketplace: 'Marketplace',
      retail: 'Retail store',
      wholesale: 'B2B purchase',
    },
    payments: {
      paid: 'Paid',
      cod: 'Cash on delivery',
      review: 'Manual review',
      refunded: 'Refunded',
    },
    risks: {
      normal: 'Normal',
      warning: 'At risk',
      critical: 'Overdue',
      blocked: 'Blocked',
    },
    customers: [
      'Daybreak Living — Shanghai flagship',
      'Forest Isle Home Ltd.',
      'New Balance Enterprise Procurement Center',
      'Ark Community Buying — Chengdu High-tech Zone',
      'Clearwater Cross-border Retail Division',
      'Sanhe Food Service Supply Chain',
      'Morning Light Members Store — Wuhan',
      'Starloop Smart Devices Specialty Store',
    ],
    regions: ['East China', 'North China', 'South China', 'Southwest', 'Central China', 'Northeast'],
    warehouses: ['Shanghai Qingpu FC-1', 'Suzhou Kunshan automated FC', 'Beijing Shunyi central FC', 'Guangzhou Nansha bonded FC'],
    carriers: ['SF Express', 'JD Logistics', 'YTO Express', 'DHL Express'],
    addresses: [
      'Front desk, Building 3, Innovation Park, 88 Zhangjiang Road, Pudong, Shanghai — weekdays before 18:00',
      'Loading bay B2, Building 120, Wangjing East Park, Chaoyang, Beijing; call the warehouse attendant',
      'Floor 18, China Resources Tower, 2666 Keyuan South Road, Nanshan, Shenzhen, Guangdong',
      'Enterprise Service Center, Building 6, Jingronghui, 200 Tianfu Fifth Street, Chengdu, Sichuan',
      'Building 7, Dream Town, 1326 Wenyi West Road, Yuhang, Hangzhou, Zhejiang',
      'East receiving platform, New World Trade Tower, 568 Jianshe Avenue, Jianghan, Wuhan, Hubei',
    ],
    notes: {
      addressMismatch: 'Address validation failed: region and postal code disagree; awaiting customer support confirmation.',
      carrierEscalation: 'Carrier pickup is more than 30 minutes late; escalated to regional dispatch.',
      highValueCheck: 'High-value order: verify serial numbers and retain packing images before dispatch.',
      customerCallback: 'Customer requested evening delivery; confirm by phone before carrier handoff.',
    },
  },
} as const

const STATUS_TONES: Record<OrderStatus, { background: string; border: string; color: string }> = {
  exception: { background: '#fff1f0', border: '#f6c7c2', color: '#b42318' },
  pending: { background: '#f2f4f7', border: '#d0d5dd', color: '#475467' },
  picking: { background: '#fff7e6', border: '#f5d69b', color: '#9a6700' },
  packed: { background: '#eef4ff', border: '#c7d7fe', color: '#3538cd' },
  shipped: { background: '#ecfdf3', border: '#abefc6', color: '#067647' },
  cancelled: { background: '#f9fafb', border: '#e4e7ec', color: '#667085' },
}

const SHELL_STYLE: CSSProperties = {
  height: '100%',
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: 'auto auto minmax(0, 1fr)',
  overflow: 'hidden',
  border: '1px solid #e4e7ec',
  borderRadius: 10,
  background: '#ffffff',
}

const TOOLBAR_STYLE: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '9px 12px',
  borderBottom: '1px solid #e4e7ec',
  background: '#f8fafc',
}

const COPY_BUTTON_STYLE: CSSProperties = {
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 30,
  padding: '5px 10px',
  border: '1px solid #d0d5dd',
  borderRadius: 7,
  background: '#ffffff',
  color: '#344054',
  font: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

const TASKBAR_STYLE: CSSProperties = {
  display: 'flex',
  minWidth: 0,
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 7,
  padding: '7px 12px',
  borderBottom: '1px solid #e4e7ec',
  background: '#ffffff',
}

const SEARCH_STYLE: CSSProperties = {
  minWidth: 140,
  height: 32,
  flex: '1 1 220px',
  padding: '5px 34px 5px 31px',
  border: '1px solid #d0d5dd',
  borderRadius: 7,
  outline: 0,
  background: '#ffffff',
  color: '#101828',
  font: 'inherit',
  fontSize: 12,
}

const ORDER_ROW_SOURCE: LazyRowSource<OrderOperationsRow> = {
  rowCount: ROW_COUNT,
  getRow: createOrderRow,
  getRowId: (row) => row.id,
}

function createOrderRow(index: number): OrderOperationsRow {
  const status = STATUS_SEQUENCE[index % STATUS_SEQUENCE.length]!
  const channel = CHANNEL_SEQUENCE[(index * 3) % CHANNEL_SEQUENCE.length]!
  const paymentStatus: PaymentStatus = index % 29 === 0
    ? 'review'
    : index % 23 === 0
      ? 'refunded'
      : index % 7 === 0
        ? 'cod'
        : 'paid'
  const amountCents = status === 'cancelled'
    ? 0
    : index % 911 === 0
      ? 8_888_800
      : 2_990 + ((index * 7_919) % 2_500_000)
  const carrierIndex = status === 'pending' || status === 'picking' || status === 'cancelled' || index % 173 === 0
    ? null
    : index % CARRIER_CODES.length
  const slaMinutes = index % 997 === 0
    ? -1_440
    : index % 887 === 0
      ? 2_880
      : index % 601 === 0
        ? 0
        : status === 'exception'
          ? -60 - ((index * 43) % 1_380)
          : -360 + ((index * 197) % 3_241)
  const risk: RiskLevel = paymentStatus === 'review'
    ? 'blocked'
    : status === 'exception' || slaMinutes < 0
      ? 'critical'
      : slaMinutes <= 240 || amountCents >= 5_000_000
        ? 'warning'
        : 'normal'
  const noteCode: NoteCode | null = status === 'exception'
    ? (index % 2 === 0 ? 'carrierEscalation' : 'addressMismatch')
    : amountCents >= 5_000_000
      ? 'highValueCheck'
      : index % 41 === 0
        ? 'customerCallback'
        : null
  const createdAt = NOW - ((index * 37) % (7 * 24 * 60)) * 60_000

  return {
    id: index,
    orderNumber: `OR-${String(2_600_000 + index).padStart(8, '0')}`,
    status,
    channel,
    customerIndex: (index * 5) % 8,
    regionIndex: (index * 7) % 6,
    itemCount: status === 'cancelled' ? 0 : 1 + ((index * 11) % 24),
    amountCents,
    paymentStatus,
    warehouseIndex: (index * 3) % 4,
    carrierIndex,
    trackingNumber: carrierIndex === null || index % 211 === 0
      ? null
      : `${CARRIER_CODES[carrierIndex]}${String(8_400_000_000 + index * 97).padStart(12, '0')}`,
    createdAt,
    promisedAt: NOW + slaMinutes * 60_000,
    slaMinutes,
    risk,
    addressIndex: (index * 11) % 6,
    noteCode,
  }
}

function requiresAttention(row: OrderOperationsRow): boolean {
  return row.status === 'exception'
    || row.paymentStatus === 'review'
    || row.risk === 'critical'
    || row.risk === 'blocked'
}

export function getOrderWorkflowIndexes(
  query: string,
  attentionOnly: boolean,
  customers: readonly string[] = [],
): number[] | null {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery && !attentionOnly) return null

  const indexes: number[] = []
  for (let index = 0; index < ROW_COUNT; index += 1) {
    const row = createOrderRow(index)
    if (attentionOnly && !requiresAttention(row)) continue
    if (
      normalizedQuery
      && !`${row.orderNumber} ${row.trackingNumber ?? ''} ${customers[row.customerIndex] ?? ''}`
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    ) continue
    indexes.push(index)
  }
  return indexes
}

function OrderStatusBadge({ value, displayValue }: InsightCellComponentProps<OrderOperationsRow, OrderStatus>) {
  const tone = STATUS_TONES[value]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        maxWidth: '100%',
        padding: '2px 8px',
        border: `1px solid ${tone.border}`,
        borderRadius: 999,
        background: tone.background,
        color: tone.color,
        fontSize: 12,
        fontWeight: 750,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
      }}
      title={displayValue}
    >
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, flex: '0 0 auto', borderRadius: '50%', background: tone.color }}
      />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayValue}</span>
    </span>
  )
}

export default function OrderOperationsExample({ locale, t: _t }: OrderOperationsExampleProps) {
  const copy = locale === 'zh-CN' ? COPY.zh : COPY.en
  const apiRef = useRef<UltiGridInsightApi | null>(null)
  const shellRef = useRef<HTMLElement | null>(null)
  const [compact, setCompact] = useState(() => (
    typeof window !== 'undefined' && window.innerWidth <= 640
  ))
  const [selection, setSelection] = useState<CellRange | null>({
    rowStart: 0,
    rowEnd: 4,
    columnStart: 0,
    columnEnd: 4,
  })
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [currentOrderNumber, setCurrentOrderNumber] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [attentionOnly, setAttentionOnly] = useState(false)

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const update = () => setCompact(shell.clientWidth <= 640)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  const columns = useMemo<readonly InsightColumnDefinition<OrderOperationsRow>[]>(() => {
    const integer = new Intl.NumberFormat(locale)
    const money = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    const dateTime = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    return [
      defineInsightColumn<OrderOperationsRow, string>({
        id: 'orderNumber',
        header: copy.headers.orderNumber,
        headerText: copy.headers.orderNumber,
        width: 154,
        minWidth: 134,
        getValue: (row) => row.orderNumber,
        visualStyle: {
          color: '#175cd3',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          fontWeight: 800,
        },
      }),
      defineInsightColumn<OrderOperationsRow, OrderStatus>({
        id: 'status',
        header: copy.headers.status,
        headerText: copy.headers.status,
        width: 132,
        minWidth: 116,
        getValue: (row) => row.status,
        formatValue: (value) => copy.statuses[value],
        component: OrderStatusBadge,
      }),
      defineInsightColumn<OrderOperationsRow, SalesChannel>({
        id: 'channel',
        header: copy.headers.channel,
        headerText: copy.headers.channel,
        width: 132,
        getValue: (row) => row.channel,
        formatValue: (value) => copy.channels[value],
        visualStyle: { color: '#475467' },
      }),
      defineInsightColumn<OrderOperationsRow, string>({
        id: 'customer',
        header: copy.headers.customer,
        headerText: copy.headers.customer,
        width: 242,
        minWidth: 170,
        maxWidth: 360,
        getValue: (row) => copy.customers[row.customerIndex]!,
        visualStyle: { color: '#101828', fontWeight: 650 },
      }),
      defineInsightColumn<OrderOperationsRow, string>({
        id: 'region',
        header: copy.headers.region,
        headerText: copy.headers.region,
        width: 126,
        getValue: (row) => copy.regions[row.regionIndex]!,
      }),
      defineInsightColumn<OrderOperationsRow, number>({
        id: 'itemCount',
        header: copy.headers.itemCount,
        headerText: copy.headers.itemCount,
        width: 98,
        minWidth: 82,
        getValue: (row) => row.itemCount,
        formatValue: (value) => integer.format(value),
        visualStyle: { horizontalAlign: 'right', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
      }),
      defineInsightColumn<OrderOperationsRow, number>({
        id: 'amount',
        header: copy.headers.amount,
        headerText: copy.headers.amount,
        width: 152,
        minWidth: 132,
        getValue: (row) => row.amountCents,
        formatValue: (value) => money.format(value / 100),
        visualStyle: { horizontalAlign: 'right', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 700 },
        conditionalRules: [
          { id: 'orders-high-value-bg', kind: 'background', when: { operator: 'greaterThanOrEqual', value: 5_000_000 }, color: '#fff7e6' },
          { id: 'orders-high-value-text', kind: 'text', when: { operator: 'greaterThanOrEqual', value: 5_000_000 }, style: { color: '#9a6700', fontWeight: 800 } },
        ],
      }),
      defineInsightColumn<OrderOperationsRow, PaymentStatus>({
        id: 'payment',
        header: copy.headers.payment,
        headerText: copy.headers.payment,
        width: 136,
        getValue: (row) => row.paymentStatus,
        formatValue: (value) => copy.payments[value],
        conditionalRules: [
          { id: 'orders-payment-review-bg', kind: 'background', when: { operator: 'equals', value: 'review' }, color: '#fff1f0' },
          { id: 'orders-payment-review-text', kind: 'text', when: { operator: 'equals', value: 'review' }, style: { color: '#b42318', fontWeight: 800 } },
        ],
      }),
      defineInsightColumn<OrderOperationsRow, string>({
        id: 'warehouse',
        header: copy.headers.warehouse,
        headerText: copy.headers.warehouse,
        width: 206,
        getValue: (row) => copy.warehouses[row.warehouseIndex]!,
      }),
      defineInsightColumn<OrderOperationsRow, string | null>({
        id: 'carrier',
        header: copy.headers.carrier,
        headerText: copy.headers.carrier,
        width: 142,
        getValue: (row) => row.carrierIndex === null ? null : copy.carriers[row.carrierIndex]!,
        formatValue: (value) => value ?? copy.empty,
        visualStyle: ({ value }) => value === null
          ? { color: '#98a2b3', fontStyle: 'italic' }
          : { color: '#344054' },
      }),
      defineInsightColumn<OrderOperationsRow, string | null>({
        id: 'trackingNumber',
        header: copy.headers.tracking,
        headerText: copy.headers.tracking,
        width: 178,
        getValue: (row) => row.trackingNumber,
        formatValue: (value) => value ?? copy.empty,
        visualStyle: ({ value }) => ({
          color: value === null ? '#98a2b3' : '#344054',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          fontStyle: value === null ? 'italic' : 'normal',
        }),
      }),
      defineInsightColumn<OrderOperationsRow, number>({
        id: 'createdAt',
        header: copy.headers.createdAt,
        headerText: copy.headers.createdAt,
        width: 166,
        getValue: (row) => row.createdAt,
        formatValue: (value) => dateTime.format(value),
        visualStyle: { color: '#475467', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 },
      }),
      defineInsightColumn<OrderOperationsRow, number>({
        id: 'promisedAt',
        header: copy.headers.promisedAt,
        headerText: copy.headers.promisedAt,
        width: 166,
        getValue: (row) => row.promisedAt,
        formatValue: (value) => dateTime.format(value),
        visualStyle: { color: '#475467', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 },
      }),
      defineInsightColumn<OrderOperationsRow, number>({
        id: 'slaMinutes',
        header: copy.headers.sla,
        headerText: copy.headers.sla,
        width: 164,
        minWidth: 142,
        getValue: (row) => row.slaMinutes,
        formatValue: (value) => formatSla(value, copy),
        visualStyle: { horizontalAlign: 'right', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 },
        conditionalRules: [
          {
            id: 'orders-sla-bar',
            kind: 'dataBar',
            domain: [-1_440, 2_880],
            axis: 0,
            color: 'rgba(18, 183, 106, 0.24)',
            negativeColor: 'rgba(240, 68, 56, 0.25)',
          },
          { id: 'orders-sla-overdue', kind: 'text', when: { operator: 'lessThan', value: 0 }, style: { color: '#b42318', fontWeight: 800 } },
          { id: 'orders-sla-warning', kind: 'text', when: { operator: 'between', value: 0, secondValue: 240 }, style: { color: '#9a6700', fontWeight: 800 } },
        ],
      }),
      defineInsightColumn<OrderOperationsRow, RiskLevel>({
        id: 'risk',
        header: copy.headers.risk,
        headerText: copy.headers.risk,
        width: 112,
        getValue: (row) => row.risk,
        formatValue: (value) => copy.risks[value],
        visualStyle: { horizontalAlign: 'center', fontWeight: 750 },
        conditionalRules: [
          { id: 'orders-risk-blocked-bg', kind: 'background', when: { operator: 'equals', value: 'blocked' }, color: '#fef3f2' },
          { id: 'orders-risk-blocked-text', kind: 'text', when: { operator: 'equals', value: 'blocked' }, style: { color: '#b42318', fontWeight: 850 } },
          { id: 'orders-risk-critical-bg', kind: 'background', when: { operator: 'equals', value: 'critical' }, color: '#fff6ed' },
          { id: 'orders-risk-critical-text', kind: 'text', when: { operator: 'equals', value: 'critical' }, style: { color: '#b54708', fontWeight: 800 } },
        ],
      }),
      defineInsightColumn<OrderOperationsRow, string>({
        id: 'address',
        header: copy.headers.address,
        headerText: copy.headers.address,
        width: 360,
        minWidth: 240,
        maxWidth: 480,
        getValue: (row) => copy.addresses[row.addressIndex]!,
        visualStyle: { color: '#475467', fontSize: 12, lineHeight: 1.35, wrap: true, verticalAlign: 'top' },
      }),
      defineInsightColumn<OrderOperationsRow, string | null>({
        id: 'note',
        header: copy.headers.note,
        headerText: copy.headers.note,
        width: 360,
        minWidth: 240,
        maxWidth: 500,
        getValue: (row) => row.noteCode === null
          ? (row.id % 47 === 0 ? '' : null)
          : copy.notes[row.noteCode],
        formatValue: (value) => value || copy.empty,
        visualStyle: ({ value }) => ({
          color: value ? '#7a2e0e' : '#98a2b3',
          backgroundColor: value ? '#fffaf5' : undefined,
          fontSize: 12,
          fontStyle: value ? 'normal' : 'italic',
          lineHeight: 1.35,
          wrap: true,
          verticalAlign: 'top',
        }),
      }),
    ]
  }, [copy, locale])

  const workflowIndexes = useMemo(
    () => getOrderWorkflowIndexes(query, attentionOnly, copy.customers),
    [attentionOnly, copy.customers, query],
  )
  const rowSource = useMemo<LazyRowSource<OrderOperationsRow>>(() => {
    if (workflowIndexes === null) return ORDER_ROW_SOURCE
    return {
      rowCount: workflowIndexes.length,
      getRow: (index) => createOrderRow(workflowIndexes[index]!),
      getRowId: (row) => row.id,
    }
  }, [workflowIndexes])

  useEffect(() => {
    const visibleRows = rowSource.rowCount
    setSelection(visibleRows > 0
      ? {
          rowStart: 0,
          rowEnd: Math.min(4, visibleRows - 1),
          columnStart: 0,
          columnEnd: 4,
        }
      : null)
    setCurrentOrderNumber(null)
    setCopyState('idle')
    if (visibleRows > 0) apiRef.current?.scrollToCell({ row: 0, column: 0 }, 'start')
  }, [rowSource])

  const handleSelectionChange = useCallback((nextSelection: CellRange | null) => {
    setSelection(nextSelection)
    setCopyState('idle')
  }, [])

  const handleCellClick = useCallback((context: InsightCellContext<OrderOperationsRow>) => {
    setCurrentOrderNumber(context.row.orderNumber)
  }, [])

  const handleCopy = useCallback(() => {
    setCopyState('copied')
  }, [])

  const copySelection = useCallback(async () => {
    try {
      await apiRef.current?.copySelection()
    } catch {
      setCopyState('failed')
    }
  }, [])

  const selectedCellCount = selection
    ? (selection.rowEnd - selection.rowStart + 1) * (selection.columnEnd - selection.columnStart + 1)
    : 0
  const copyLabel = copyState === 'copied'
    ? copy.copied
    : copyState === 'failed'
      ? copy.copyFailed
      : copy.copy

  return (
    <section ref={shellRef} style={SHELL_STYLE} aria-label={copy.title}>
      <div style={TOOLBAR_STYLE}>
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
          <span
            aria-hidden="true"
            style={{ display: 'inline-flex', padding: 5, borderRadius: 7, background: '#ecfdf3', color: '#067647' }}
          >
            <Signal size={15} strokeWidth={2.2} />
          </span>
          <span style={{ minWidth: 0 }}>
            <strong style={{ display: 'block', overflow: 'hidden', color: '#101828', fontSize: 13, lineHeight: 1.25, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {copy.title}
            </strong>
            <small style={{ display: 'block', overflow: 'hidden', color: '#667085', fontSize: 11, lineHeight: 1.35, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {copy.window} · {new Intl.NumberFormat(locale).format(ROW_COUNT)} {copy.rows} · {selection
                ? `${copy.selected} ${new Intl.NumberFormat(locale).format(selectedCellCount)} ${copy.cells}`
                : copy.noSelection}{currentOrderNumber ? ` · ${copy.currentOrder}: ${currentOrderNumber}` : ''}
            </small>
          </span>
        </div>
        <button
          type="button"
          style={{ ...COPY_BUTTON_STYLE, opacity: selection ? 1 : 0.55, cursor: selection ? 'pointer' : 'not-allowed' }}
          disabled={!selection}
          onClick={() => void copySelection()}
        >
          <ClipboardCopy size={14} aria-hidden="true" />
          {copyLabel}
        </button>
      </div>
      <div style={TASKBAR_STYLE} role="search" aria-label={copy.search}>
        <label style={{ position: 'relative', display: 'flex', minWidth: 140, flex: '1 1 220px' }}>
          <span className="sr-only">{copy.search}</span>
          <Search
            size={14}
            aria-hidden="true"
            style={{ position: 'absolute', top: 9, left: 10, color: '#667085', pointerEvents: 'none' }}
          />
          <input
            type="search"
            value={query}
            placeholder={copy.searchPlaceholder}
            onChange={(event) => setQuery(event.currentTarget.value)}
            style={SEARCH_STYLE}
          />
          {query ? (
            <button
              type="button"
              aria-label={copy.clearSearch}
              title={copy.clearSearch}
              onClick={() => setQuery('')}
              style={{
                position: 'absolute',
                top: 3,
                right: 3,
                display: 'grid',
                width: 26,
                height: 26,
                padding: 0,
                placeItems: 'center',
                color: '#667085',
                border: 0,
                borderRadius: 5,
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <X size={13} aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <button
          type="button"
          aria-pressed={attentionOnly}
          onClick={() => setAttentionOnly((current) => !current)}
          style={{
            ...COPY_BUTTON_STYLE,
            color: attentionOnly ? '#b42318' : '#475467',
            borderColor: attentionOnly ? '#f4b8b2' : '#d0d5dd',
            background: attentionOnly ? '#fff1f0' : '#fff',
          }}
        >
          <CircleAlert size={14} aria-hidden="true" />
          {copy.focusAttention}
        </button>
        <small
          aria-live="polite"
          style={{ marginLeft: 'auto', color: rowSource.rowCount ? '#667085' : '#b42318', fontSize: 11 }}
        >
          {rowSource.rowCount
            ? `${new Intl.NumberFormat(locale).format(rowSource.rowCount)} ${copy.results}`
            : copy.noResults}
        </small>
      </div>
      <div style={{ minHeight: 0, overflow: 'hidden' }}>
        <UltiGridInsight
          rowSource={rowSource}
          columns={columns}
          apiRef={apiRef}
          selection={selection}
          onSelectionChange={handleSelectionChange}
          onCellClick={handleCellClick}
          onCopy={handleCopy}
          copyCellLimit={ROW_COUNT * columns.length}
          frozen={{ top: 0, left: compact ? 1 : 2 }}
          overscan={{ rows: 8, columns: 2 }}
          defaultRowHeight={48}
          defaultColumnWidth={140}
          fitColumns="none"
          showHeader
          showRowNumbers={!compact}
          stripedRows
          showGridLines
          columnResize
          themeColor="#175cd3"
          ariaLabel={copy.ariaLabel}
          style={{ height: '100%' }}
        />
      </div>
    </section>
  )
}

function formatSla(minutes: number, copy: typeof COPY.zh | typeof COPY.en): string {
  if (minutes === 0) return copy.slaDue

  const absolute = Math.abs(minutes)
  const days = Math.floor(absolute / 1_440)
  const hours = Math.floor((absolute % 1_440) / 60)
  const remainingMinutes = absolute % 60
  const prefix = minutes < 0 ? copy.overduePrefix : copy.remainingPrefix

  if (days > 0) return `${prefix} ${days}${copy.day} ${hours}${copy.hour}`
  if (hours > 0) return `${prefix} ${hours}${copy.hour} ${remainingMinutes}${copy.minute}`
  return `${prefix} ${remainingMinutes}${copy.minute}`
}
