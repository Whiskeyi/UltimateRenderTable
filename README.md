**中文** | [English](README.en.md)

# UltiGrid

面向超大二维数据的 React DOM 表格：一个专注窗口化渲染的底座，以及一个建立在其上的 BI 应用表格。

UltiGrid 把 `100,000 × 100,000` 当作逻辑坐标空间，而不是需要预先创建的 100 亿个单元格对象。数据按坐标读取，行列同时虚拟化，合并区域按矩形索引，DOM 数量主要由可见窗口、overscan 和固定区域决定。

> 当前版本为 **0.1.0 / Alpha**。仓库包含可公开发布的 ESM npm 包、可运行的 Vite Studio 和自动化测试，但尚未给出跨设备、跨浏览器的固定 FPS 承诺。性能结论应基于可复现的数据、硬件与浏览器环境。

原始需求的逐项证据与未完成边界见 [需求复核](docs/REQUIREMENTS-AUDIT.md)，热路径、复杂度和内存模型见 [架构文档](docs/ARCHITECTURE.md)。

## 两层架构

```text
业务数据、列定义、条件规则、自定义 React 内容
                        │
                        ▼
               @ultigrid/insight
        BI 语义、树形行、条件格式、导出
                        │
                        ▼
                 @ultigrid/core
      Axis、二维窗口、合并索引、选区与 DOM
                        │
                        ▼
                  可见范围 React DOM
```

| 包 | 适合场景 | 主要公开入口 | 样式 |
| --- | --- | --- | --- |
| `@ultigrid/core` | 需要完全控制数据协议和单元格 DOM 的渲染器、设计器或上层表格 | `UltiGridViewport` 及其 Props、API、坐标与尺寸类型 | `@ultigrid/core/style.css` |
| `@ultigrid/insight` | 需要表头、行号、树形、条件格式、自定义内容和导出的 BI/业务表格 | `UltiGridInsight`、`InsightCell`、`defineInsightColumn`、行模型与条件规则类型 | `@ultigrid/insight/style.css` |

`@ultigrid/insight` 依赖 `@ultigrid/core`，且它的 `style.css` 已包含 core 样式。只使用 Insight 时不需要再导入第二份 CSS。

两个包均为 ESM-only，要求 React 与 ReactDOM `>=18.2 <20`。公开子路径仅有包根入口和 `./style.css`；不要依赖 `dist` 或源码深路径。

## 安装

只使用渲染底座：

```bash
npm install @ultigrid/core react react-dom
```

```tsx
import '@ultigrid/core/style.css'
```

使用 BI 应用表格：

```bash
npm install @ultigrid/insight react react-dom
```

```tsx
import '@ultigrid/insight/style.css'
```

如果同一应用会直接从两个包导入 API 或类型，请显式安装两个包。

## 最小示例

### `@ultigrid/core`

```tsx
import { useCallback } from 'react'
import { UltiGridViewport } from '@ultigrid/core'
import '@ultigrid/core/style.css'

export function CoordinateGrid() {
  const getCell = useCallback((row: number, column: number) => ({
    value: row * 100_000 + column,
    text: `${row}:${column}`,
  }), [])

  return (
    <UltiGridViewport
      rowCount={100_000}
      columnCount={100_000}
      getCell={getCell}
      defaultRowHeight={34}
      defaultColumnWidth={136}
      frozen={{ top: 1, bottom: 1, left: 1, right: 1 }}
      overscan={{ rows: 5, columns: 2 }}
      fitColumns="stretch"
      style={{ height: 520 }}
      ariaLabel="Coordinate grid"
    />
  )
}
```

`getCell` 只会为当前工作集读取值，不要求二维数组。生产场景应让 getter、尺寸 `Map`、合并数组和 renderer 保持稳定引用。

### `@ultigrid/insight`

```tsx
import {
  UltiGridInsight,
  defineInsightColumn,
  type InsightColumnDefinition,
} from '@ultigrid/insight'
import '@ultigrid/insight/style.css'

interface Sale {
  id: number
  region: string
  revenue: number
}

const rows: Sale[] = [
  { id: 1, region: '华东', revenue: 268_000 },
  { id: 2, region: '华南', revenue: 146_000 },
]

const columns: InsightColumnDefinition<Sale>[] = [
  defineInsightColumn<Sale, string>({
    id: 'region',
    header: '区域',
    width: 180,
    getValue: (row) => row.region,
  }),
  defineInsightColumn<Sale, number>({
    id: 'revenue',
    header: '收入',
    width: 180,
    getValue: (row) => row.revenue,
    formatValue: (value) => `¥${value.toLocaleString('zh-CN')}`,
    visualStyle: { horizontalAlign: 'right', fontWeight: 700 },
    conditionalRules: [
      { id: 'revenue-bar', kind: 'dataBar', domain: [0, 300_000], color: '#24935f' },
    ],
  }),
]

export function SalesTable() {
  return (
    <UltiGridInsight
      rows={rows}
      getRowId={(row) => row.id}
      columns={columns}
      frozen={{ left: 1 }}
      stripedRows
      fitColumns="stretch"
      style={{ height: 420 }}
    />
  )
}
```

`rows`、`rowSource`、`rowModel` 在类型层互斥；`columns` 与 `columnCount + getColumn` 也互斥。`defineInsightColumn` 让异构列分别保留自己的值类型。

## 进阶：惰性 10 万 × 10 万与双向万级合并

```tsx
import type { MergedCellRange } from '@ultigrid/core'
import {
  UltiGridInsight,
  defineInsightColumn,
  type InsightColumnDefinition,
  type LazyRowSource,
} from '@ultigrid/insight'
import '@ultigrid/insight/style.css'

interface PlanningRow { index: number }

const rowSource: LazyRowSource<PlanningRow> = {
  rowCount: 100_000,
  getRow: (index) => ({ index }),
  getRowId: (row) => row.index,
}

const getColumn = (column: number): InsightColumnDefinition<PlanningRow> =>
  defineInsightColumn<PlanningRow, number>({
    id: `period-${column}`,
    header: `Period ${column}`,
    getValue: (row) => row.index * 100_000 + column,
  })

const mergedCells: MergedCellRange[] = [
  { id: 'wide', rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 10_500 },
  { id: 'tall', rowStart: 2, rowEnd: 10_500, columnStart: 0, columnEnd: 0 },
]

export function PlanningCanvas() {
  return (
    <UltiGridInsight
      rowSource={rowSource}
      columnCount={100_000}
      getColumn={getColumn}
      mergedCells={mergedCells}
      showHeader={false}
      showRowNumbers={false}
      fitColumns="none"
      overscan={{ rows: 5, columns: 2 }}
      style={{ height: 640 }}
    />
  )
}
```

合并坐标是零基、闭区间的数据坐标。上例横跨 10,501 列、纵跨 10,499 行；每个区域仍只保存为一个矩形，不会展开成逐格记录。

## 功能矩阵

| 能力 | `@ultigrid/core` | `@ultigrid/insight` |
| --- | --- | --- |
| 行列双轴虚拟化 | ✓ | 继承 core |
| 按需数据读取 | `getCell(row, column)` | 数组、`LazyRowSource`、`FlatRowModel`、`TreeRowModel` |
| 上下左右固定 | ✓，最多组合 9 个裁剪 pane | ✓，表头和行号自动纳入坐标转换 |
| 合并单元格 | 二维矩形索引 | 数据坐标 Props，转交 core |
| 自定义行高/列宽 | 默认值、稀疏 `Map`、getter | 同 core，惰性列可单独给宽度 getter |
| 内容自适应 | 当前已渲染、非合并单元格的增量测量 | 同 core |
| 容器自适应 | `fitColumns="stretch"` 或原生横向滚动 | 同 core |
| 自定义单元格 | `renderCell`、样式、class、meta | 对齐、字体、图片、图标、`component`、`renderContent` |
| 选择与导航 | 点击、拖拽、Shift、方向键、Tab、Enter | 对外统一为不含表头/行号的数据坐标 |
| 复制 | `Ctrl/Cmd + C` 与 TSV API | 数据坐标 API，默认 100,000-cell 复制上限继承 core |
| 树形/平铺 | 业务无关 | 平铺、同步/异步树节点、真实展开折叠、`treegrid` |
| 条件格式 | 业务无关 | 文本、背景、图标、二/三色阶、正负数据条 |
| 导出 | — | Excel、CSV、当前可见视口 PNG |
| 国际化 | 文案由调用方提供 | `localeText` 可覆盖交互与错误文案 |
| 无障碍 | ARIA `grid` / `treegrid`、焦点与键盘 | 表头、树层级、展开状态与本地化标签 |

当前没有把排序、筛选、分组、聚合、透视、编辑、撤销/重做等数据引擎能力描述成已完成。它们属于路线图，不是隐藏开关。

## 五个可交互 Demo

Vite Studio 顶部有 5 个 Tab：一个能力总览，以及四个使用不同列 schema、renderer、数据模型和视觉语言的扩展场景。

| Tab | 重点 | 代码证据 |
| --- | --- | --- |
| 能力总览 | 两个公开包的职责、10¹⁰ 逻辑坐标、双向万级合并和五类格式原语 | `CapabilityOverview` |
| 经营分析 | 复合维度、KPI、数据条、头像、状态和迷你趋势 | 独立 analysis 列定义与 renderer |
| 树形钻取 | 惰性可见树、展开/折叠、节点类型、负责人和贡献度 | 折叠会真实移除可见后代 |
| 条件矩阵 | 文本、背景、图标、色阶、数据条与规则图例 | 独立规则矩阵列 schema |
| 合并画布 | 横向、纵向、二维块和 12,000-merge 压力预设 | 10,501 列与 10,499 行的独立矩形 |

每个 Tab 都有“查看代码 / View code”，展示并复制使用最终 npm 入口的 TSX。对应片段位于 [`src/demo/demoSnippets.ts`](src/demo/demoSnippets.ts)。四个数据场景的列组合有自动化差异测试，合并压力数据也验证了边界、唯一 id 与互不重叠。

Studio 还提供：

- 左侧实时表格与右侧可视化 Props/JSON 编辑器；草稿与“应用”动作分离。
- 一组统一的数据规模预设：`1K × 40`、`10K × 2K`、`100K × 100K` 和 `12K merges`。
- `zh-CN` / `en-US` 即时切换并记忆选择。
- 全屏优先调用原生 `requestFullscreen()` / `exitFullscreen()`，并通过 `fullscreenchange` 同步状态；当嵌入环境的权限策略拒绝原生 API 时，自动切换为同一 stage 的固定定位兼容全屏，再次点击或 Esc 均可退出。
- 按需性能 HUD。它展示页面级 `requestAnimationFrame` 回调 cadence（以帧间隔中位数换算为 Hz）、帧间隔 P95，以及 viewport 回调报告的可见范围和已渲染 cell 数。它不是“表格 FPS”，也不是跨设备 benchmark。

## 国际化

演示应用完整提供 `zh-CN` 和 `en-US`，覆盖 Studio、能力总览、场景、无障碍标签和导出错误，并把选择保存到 `localStorage`、同步到 `document.documentElement.lang`。

包本身不绑定 Demo 的 `I18nProvider`。`@ultigrid/insight` 默认使用英文交互文案，产品可通过 `localeText` 局部或完整覆盖：

```tsx
<UltiGridInsight
  rows={rows}
  columns={columns}
  localeText={{
    expandRow: '展开此行',
    collapseRow: '折叠此行',
    nodeLoadError: '节点加载失败',
  }}
/>
```

列标题、单元格内容、数值和日期格式仍由业务 Props 控制。

## 性能与内存设计

### 热路径

- 滚动事件用 `requestAnimationFrame` 合并；每帧同步 CSS transform，只有可见索引窗口改变时才更新 React window state。
- 行列各自使用 `Axis`：默认尺寸 + 稀疏 `Map` 覆盖 + typed segment tree。offset、offset→index 和尺寸更新为 `O(log N)`。
- 普通 DOM 主要随“可见窗口 + overscan + 实际固定区域”增长，而不是随完整矩阵面积增长。
- 合并区域由 id `Map` 和 packed R-tree 管理；单个 10K+ 跨度仍是一条 region。
- 条件规则在 Props 变化时编译，色阶预生成 256 项 palette；逐格热路径复用结果对象，并支持 priority 与 `stopIfTrue`。
- Insight 的惰性列缓存最多 2,048 项，行与行元数据工作集缓存各最多 512 项。

### 不被虚拟化隐藏的成本

- `Axis` 的 typed tree 是按轴长度分配的 `O(N)` 内存。100,000 项时单轴原始 `Float64Array` 约 2 MiB，行列两轴约 4 MiB，不含 React、DOM、JS 对象和浏览器内部开销。
- 上下左右固定区域在可用视口内完整渲染；固定数量和 overscan 过大都会放大 DOM。
- `autoSize` 只测量当前已渲染内容，并会产生同步布局读取和渐进缓存；它不是全表预扫描。
- 自定义 React renderer 在主线程执行。深层 DOM、同步图片解码和昂贵计算会直接影响滚动。
- 复制与导出会逐格物化目标范围，时间和额外内存均随目标面积增长。

## 诚实的规模边界

`100,000 × 100,000` 表示逻辑寻址能力，不等于浏览器已经在内存中创建 100 亿个值，也不构成“任何设备都丝滑”的证明。

默认尺寸下，逻辑滚动画布约为 `13,600,000 × 3,400,000` CSS px。当前使用单一原生滚动坐标，没有分段滚动或坐标重基，因此仍受浏览器最大布局尺寸、滚动精度、缩放和设备内存影响。

仓库不承诺固定 FPS。可复现的性能报告至少应固定浏览器版本、硬件、viewport、缩放、数据 getter、尺寸分布、合并分布、固定区、overscan 和 renderer。Studio HUD 的页面 rAF 中位数/P95 只能帮助观察当前会话，不能归因成表格自身的渲染帧率。

## 导出与物化边界

- Excel 单工作表最多 16,384 列；当前 API 会在超限前拒绝。包含表头后总行数不能超过 1,048,576。
- Excel 与 CSV 默认有 1,000,000-cell 客户端上限，可通过 `exportCellLimit` 收紧；超大导出应传 range 或迁移到 Worker/服务端。
- Studio 在极限规模下默认只导出前 2,000 行 × 128 列的 Excel/CSV 样本，避免误操作冻结页面。
- `exportImage()` 捕获当前表格 shell 中已经布局的 DOM，即当前视口，而不是 10 万 × 10 万整表长图。
- 自定义 React 内容不会自动变成 Excel 值；使用列的 `exportValue` 提供业务导出值。

## 本地开发与验证

```bash
npm ci
npm run dev
```

开发服务器默认运行在 <http://127.0.0.1:4173>。

```bash
npm test                 # Vitest：算法、BI、Demo、i18n 与公共类型/坐标测试
npm run build             # 构建 core、insight 和 Vite Demo
npm run verify:packages   # 检查 exports、声明、README/LICENSE、依赖 chunk 与自包含 CSS
npm run preview
```

根目录是 private npm workspace；`packages/core` 与 `packages/insight` 是可公开发布的包。两个包的 `prepack` 会重新构建产物，避免发布陈旧 `dist`。

## 仓库结构

```text
packages/
├── core/        # @ultigrid/core manifest、构建入口与发布产物
└── insight/     # @ultigrid/insight manifest、构建入口与发布产物
src/
├── core/        # UltiGridViewport 与渲染热路径
├── bi/          # UltiGridInsight、行模型、条件格式与导出
├── studio/      # Props/JSON 工作台、全屏与诊断 UI
├── demo/        # 五个 Tab 的数据、能力总览与公开 API snippets
├── i18n/        # zh-CN / en-US Demo 字典与 Provider
├── styles/      # Demo 与全局样式
├── App.tsx      # Studio、代码面板与 Demo 组装
└── main.tsx     # Vite 入口
tests/           # 算法、BI、场景、i18n、坐标与公共类型回归
scripts/         # npm 包契约验证
docs/            # 架构与需求边界
```

## 路线图

- 建立可复现的浏览器 benchmark、硬件矩阵和性能回归预算。
- 增加分段滚动/坐标重基，降低超大 CSS 画布的浏览器实现风险。
- 将超大 Excel/CSV 与整表分片图片导出迁移到 Worker 或服务端流式管线。
- 以插件层提供排序、筛选、分组、聚合、透视、列拖拽与缩放。
- 增加编辑、粘贴、填充柄、校验和撤销/重做事务。
- 完善固定 pane × merge 组合测试、浏览器截图回归和可访问性测试。

## 贡献

欢迎 Issue、设计讨论、测试、文档和 Pull Request。性能相关贡献请附上最小复现、浏览器与硬件、viewport、行列规模、尺寸/合并分布、固定区、overscan、自定义 DOM，以及修改前后的同口径数据。

提交前请运行：

```bash
npm test
npm run build
npm run verify:packages
```

渲染层应保持业务无关；BI 语义放在 `src/bi` 或更高层。新增公共 API 时，请同时更新类型测试、包级 README 和根文档。

## License

[MIT](LICENSE) © 2026 UltiGrid contributors
