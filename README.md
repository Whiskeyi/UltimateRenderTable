**中文** | [English](README.en.md)

# UltiGrid

面向超大二维数据的 React DOM 表格工程。仓库由 **Studio 交互层、应用表格层和渲染表格层** 组成：Studio 用于演示与调试，`@ultigrid/insight` 提供 BI 表格能力，`@ultigrid/core` 负责窗口化渲染热路径。

UltiGrid 将 `100,000 × 100,000` 视为逻辑坐标空间。数据按坐标读取，行列同时虚拟化，DOM 主要随可见窗口、overscan 与固定区域增长，而不是随完整矩阵面积增长。

> 当前版本为 **0.1.0 / Alpha**。项目不承诺跨设备固定 FPS；性能结论应基于明确的浏览器、硬件、数据与渲染器配置。

## 三层仓库架构

| 层 | 目录 / 产物 | 职责 |
| --- | --- | --- |
| Studio 交互层 | `src/studio`、`src/demo` | 可交互 Demo、实时 Props/JSON、源码查看、i18n、全屏与诊断；不发布 npm |
| 应用表格层 | `src/bi` → `@ultigrid/insight` | 行列模型、树形、同列纵向相邻同值合并、条件格式、自定义单元格与导出 |
| 渲染表格层 | `src/core` → `@ultigrid/core` | Axis、双轴虚拟化、四侧固定、矩形合并、选择、导航、复制与 DOM |

```text
Studio ──演示/配置──▶ @ultigrid/insight ──业务语义──▶ @ultigrid/core ──▶ 可见范围 DOM
```

两个公开包均为 ESM-only，支持 React 与 ReactDOM `>=18.2 <20`。Insight 依赖 Core，且 `@ultigrid/insight/style.css` 已包含 Core 样式。

## 快速开始

应用表格：

```bash
npm install @ultigrid/insight react react-dom
```

```tsx
import {
  UltiGridInsight,
  defineInsightColumn,
  type InsightColumnDefinition,
} from '@ultigrid/insight'
import '@ultigrid/insight/style.css'

interface Sale { id: number; region: string; revenue: number }

const rows: Sale[] = [
  { id: 1, region: '华东', revenue: 268_000 },
  { id: 2, region: '华南', revenue: 146_000 },
]

const columns: InsightColumnDefinition<Sale>[] = [
  defineInsightColumn<Sale, string>({
    id: 'region', header: '区域', getValue: (row) => row.region,
  }),
  defineInsightColumn<Sale, number>({
    id: 'revenue',
    header: '收入',
    getValue: (row) => row.revenue,
    conditionalRules: [
      { id: 'bar', kind: 'dataBar', domain: [0, 300_000], color: '#24935f' },
    ],
  }),
]

export function RevenueTable() {
  return <UltiGridInsight rows={rows} columns={columns} style={{ height: 420 }} />
}
```

只需要底层坐标协议和单元格 DOM 控制时，安装 `@ultigrid/core`。完整入口分别见 [Core README](packages/core/README.md) 与 [Insight README](packages/insight/README.md)。

## 表格能力

| 类别 | 能力 |
| --- | --- |
| 大规模渲染 | 行列双轴虚拟化、按坐标取值、可见范围实时渲染、可配置 overscan |
| 布局 | 上下左右固定、默认/稀疏/函数式行列尺寸、可见内容渐进测量、容器平铺与双向滚动 |
| 合并 | Core 渲染二维矩形；Insight 通过 `mergeAdjacent` 合并配置列中纵向连续的相同维度值；横向或任意二维合并使用显式 `mergedCells` |
| 单元格 | 文本截断、对齐、字体、颜色、图片、图标、背景、数据条、自定义 React 组件 |
| 交互 | 点击与拖拽选择、Shift 扩展、方向键/Tab/Enter 导航、合并区域感知、TSV 复制 |
| 数据模型 | 行数组、`LazyRowSource`、`FlatRowModel`、`TreeRowModel`、列数组与 `columnCount + getColumn` 惰性列 |
| 条件格式 | 文本、背景、图标、二/三色阶、正负数据条、优先级与 `stopIfTrue` |
| 输出与集成 | `scrollToCell`、选区/复制命令式 API，Excel、CSV、当前视口 PNG，数据坐标回调、`localeText`、ARIA grid/treegrid |

详细状态与边界见 [能力清单](docs/CAPABILITIES.md)。

## 架构与技术实现

滚动热路径保持在可见工作集内：

```text
scroll → requestAnimationFrame → Axis offset 查询 → visible window
       → pane 组合 → MergeIndex 相交查询 → React DOM
```

| 模块 | 实现 | 关键成本 |
| --- | --- | --- |
| `Axis` | 默认尺寸、稀疏 `Map`、`Float64Array` segment tree | offset 与 index 互查 `O(log N)` |
| Virtualizer | 行列独立窗口与 overscan | 窗口定位 `O(log Nᵣ + log N𝚌)` |
| Frozen panes | 每轴 start/middle/end，最多 9 个裁剪 pane | DOM 由窗口与实际固定区决定 |
| `MergeIndex` | 稳定 id `Map` + packed R-tree | 构建约 `O(M log M)`；常见查询 `O(log M + I)` |
| Selection | 一个闭区间矩形与独立 anchor/focus | 常驻状态 `O(1)` |
| Insight 同列纵向合并 | Props 变化时扫描展示行与配置维度 | 主体计算 `O(Nᵣ × D)` |
| Insight formatter | Props 变化时编译规则，色阶预生成 palette | 可见格求值约 `O(W × R)` |

Core 不理解树形、条件格式或“值相同”。Insight 将业务行列投影为零基数据坐标，并把 `mergeAdjacent` 推导出的同列纵向相邻区域转换成 Core 接受的无重叠矩形；横向或任意二维区域由 `mergedCells` 显式提供。表头和行号只存在于内部 viewport 坐标，公开选择、滚动和导出 API 始终使用数据坐标。

完整数据流、DOM 合约与复杂度见 [架构文档](docs/ARCHITECTURE.md)。

## 性能与内存

| 状态 | 增长量 | 说明 |
| --- | --- | --- |
| 逻辑数据 | 调用方决定 | Core 不保存 `Nᵣ × N𝚌` 单元格副本 |
| Axis tree | `O(Nᵣ + N𝚌)` | 100K 行与 100K 列的原始 typed buffers 合计约 4 MiB |
| 自定义尺寸 | `O(Kᵣ + K𝚌)` | 稀疏 `ReadonlyMap`，只记录覆盖项 |
| 合并索引 | `O(M)` | 跨越大量格点的区域仍是一条矩形记录 |
| DOM / React cell | `O(W)` | `W` 包含可见窗口、overscan、固定 pane 与 merge fragment |
| Insight 工作集缓存 | 有界 | 最多 2,048 列；行和行元数据各 512 项 |
| 复制与导出 | `O(A)` | 必须物化目标范围，受安全上限约束 |

`100,000 × 100,000` 表示逻辑寻址能力，不代表浏览器创建了 100 亿个值。当前实现使用单一原生滚动坐标，仍受浏览器最大布局尺寸、滚动精度和设备内存影响。固定区域、overscan、自动测量和深层自定义 DOM 都会增加主线程成本。

大规模场景建议保持 getter、尺寸 Map、合并配置和 renderer 的引用稳定；让 `getCell` / `getColumn` 接近 `O(1)`；对宽表使用惰性列；限制固定区、overscan、复制与导出范围。

## Studio 交互层

Studio 用于展示两个 npm 包的组合能力，而不是生产运行时依赖。当前有 3 个顶层 Tab：

| Tab | 内容 |
| --- | --- |
| 组件展厅 | 内含三层架构与关键能力简述；按基础/进阶分组提供 11 个可交互示例，覆盖惰性行列、多级树、命令式 API 与 Excel/CSV/PNG 导出，每项可查看源码 |
| 经营分析 | BI 复合维度与指标；树形根节点和分支节点均可展开，至少展示深度 0/1/2；同列合并可独立开启并按兄弟边界断开 |
| 条件格式 | 文本、背景、图标、色阶与数据条的组合规则 |

所有表格场景都支持查看和复制基于公开 npm 入口的 TSX。右侧工作台提供可视化 Props、JSON、规模预设与性能观测；中文和英文可即时切换。

## 仓库结构

```text
packages/
├── core/          # @ultigrid/core 发布入口
└── insight/       # @ultigrid/insight 发布入口
src/
├── core/          # 渲染表格层
├── bi/            # 应用表格层
├── studio/        # Studio shell 与 Props 编辑器
├── demo/          # 场景、组件展厅与源码片段
└── i18n/          # Studio 中英文文案
tests/             # 算法、坐标、数据模型和公共契约测试
docs/              # 架构与能力边界
```

## 文档

- [架构、热路径与内存模型](docs/ARCHITECTURE.md)
- [能力状态与边界](docs/CAPABILITIES.md)
- [`@ultigrid/core` 使用说明](packages/core/README.md)
- [`@ultigrid/insight` 使用说明](packages/insight/README.md)

## 本地开发

```bash
npm ci
npm run dev
npm test
npm run build
npm run verify:packages
npm run pack:packages
```

根目录是 private npm workspace；两个 `packages/*` 子包是公开发布边界。

## npm 发布

`.github/workflows/publish.yml` 会在 `main` 提交或手动 `workflow_dispatch` 时执行 build、test 和 package tarball 检查（本地同口径命令为 `npm run pack:packages`）。工作流查询 npm 上的现有版本，仅当对应 `package.json` 版本不存在时，按 `@ultigrid/core` → `@ultigrid/insight` 发布；未提升版本的普通提交会安全跳过发布。

首次发布：

1. 创建或拥有 npm 的 `@ultigrid` scope。
2. 创建 granular access token，将 **Packages and scopes** 设为 **Read and write** 并启用 **Bypass 2FA**，保存为 GitHub Actions Secret `NPM_TOKEN`。
3. 通过 `workflow_dispatch` 手动运行发布工作流。

首次发布后，推荐分别为两个 npm 包配置 Trusted Publisher：owner `Whiskeyi`、repository `UltimateRenderTable`、workflow `publish.yml`。随后设置仓库 Actions variable `NPM_USE_OIDC=true`，验证 OIDC 发布成功后移除 `NPM_TOKEN`。

## 路线图

- 建立可复现的浏览器 benchmark 与性能回归预算。
- 增加分段滚动/坐标重基，降低超大 CSS 画布限制。
- 将超大导出迁移到 Worker 或服务端流式管线。
- 以应用插件补充排序、筛选、分组、聚合、透视和编辑事务。

## 贡献

欢迎 Issue、设计讨论和 Pull Request。性能相关变更请附浏览器、硬件、viewport、数据规模、固定区、overscan、自定义 DOM，以及修改前后的同口径结果。

## License

[MIT](LICENSE) © 2026 UltiGrid contributors
