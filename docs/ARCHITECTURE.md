# UltiGrid 架构

本文描述 UltiGrid 的分层、渲染热路径、数据结构、复杂度和内存边界。公开能力状态见 [CAPABILITIES.md](CAPABILITIES.md)。

## 1. 三层边界

```text
Studio 交互层
  └─ Demo、Props/JSON、真实源码实时编辑、i18n、诊断
       │
       ▼
应用层表格 · @ultigrid/insight
  └─ 行列模型、树形、同列纵向相邻同值合并、条件格式、Cell、导出
       │
       ▼
表格渲染底座 · @ultigrid/core
  └─ Axis、窗口化、固定 pane、矩形合并、选区、导航、DOM
```

依赖只向下：

- Studio 组合并演示公开 API，不进入 npm 运行时。
- Insight 把业务数据转换为 Core 的坐标、单元格和矩形协议。
- Core 不理解 BI、树形、条件规则、导出或“值相同”。

移动端边界同样分层：Core 负责手势仲裁、viewport 坐标与 Axis；Insight 负责业务列、数据坐标和列配置映射；Studio 负责响应式壳层、焦点约束与安全区。

实现位于 `src/studio`、`src/demo`、`src/bi`、`src/core`；`packages/core` 与 `packages/insight` 只定义发布入口、构建和包元数据。

Studio 有 4 个顶层 Tab：介绍、组件展厅、经营分析和条件格式。介绍页在单屏内交互呈现 Studio、应用层表格与表格渲染底座的边界；组件展厅按基础/进阶分组挂载 12 个可交互示例，每项从实际 TSX 文件加载源码并在浏览器中实时编译预览；经营分析负责组合业务维度、树形和同列合并。窄屏下表格舞台保持优先，顶部导航横向滚动并压缩，Props 进入带遮罩、拖拽把手、关闭动作和安全区适配的底部 sheet。默认日常档为 `1K × 40`、行列 overscan `2 / 1`、自动行高关闭，`100K × 100K` 仅作为手动压力预设。

实时编辑仅接收当前页面内的本地草稿，不从 URL 或远端存储恢复。模块解析使用 allowlist，但代码仍在 Studio 页面上下文执行，并非安全沙箱；运行时不得自动接入不可信共享源码。

## 2. 数据与坐标契约

Core 只要求：

```ts
rowCount: number
columnCount: number
getCell(row: number, column: number): CellSource<TValue, TMeta>
```

组件不会创建完整二维数组。调用方可从数组、列式存储、分页缓存或确定性函数按坐标返回数据。

Core 坐标均为零基；range 的结束索引为闭区间。合并矩形以左上角为锚点，内容和复制值默认从锚点读取。

Insight 会为表头和行号增加内部偏移，但以下公共契约始终使用不含 chrome 的数据坐标：

- `selection` 与 `onSelectionChange`
- `onViewportChange`
- `scrollToCell`、`getSelection`、`copySelection`
- 合并配置与导出范围

## 3. Core 渲染热路径

```text
browser scroll
  → requestAnimationFrame 合并事件
  → Axis.indexAtOffset(scrollTop / scrollLeft)
  → 精确 visible rows / columns
  → 直接写入最多 9 个 pane layer transform，并报告精确 viewport
  → 仅在 visible 越过 retained overscan guard 时：
      补充方向感知 render window
      → start / middle / end bands
      → MergeIndex 查询每个 pane 的相交矩形
      → 更新并复用 memoized React cells
```

### Axis

每条轴保存：

- 默认尺寸
- `Map<index, size>` 稀疏覆盖
- 保存尺寸 delta 的 `Float64Array` segment tree
- 可选容器尺寸与 `stretch` 状态

主要操作：

| 操作 | 复杂度 |
| --- | --- |
| `getSize(index)` | `O(1)` |
| `getOffset(index)` | `O(log N)` |
| `indexAtOffset(offset)` | `O(log N)` |
| `setSize(index, size)` | `O(log N)` |
| 构建 / 重建 | `O(P + K)` |

`P` 是不小于轴长度的下一 2 次幂，`K` 是自定义尺寸项数。`fitColumns="stretch"` 只在自然列宽小于容器时平分剩余空间；否则使用自然宽度和原生横向滚动。

尺寸 `ReadonlyMap` 只遍历覆盖项。尺寸 getter 在轴重建时需要遍历完整轴，因此大规模、频繁变化的尺寸优先使用稳定的稀疏 Map。

Core 的 `columnResize` 需显式开启；它在配置的零基 viewport 表头行上挂载 separator。拖拽期间 Core 更新对应 Axis 宽度并显示 guide；鼠标、触控笔、触控和键盘复用 min/max 约束，触控默认长按激活，`onColumnResize` 报告 `start/change/end/cancel`。手动调宽后退出 stretch 分配；stretch 冻结基线与真正手调列分层保存，因此未手调列仍可继续自动测量。`columnWidths` / `getColumnWidth` 更新可直接持久化 `end` 结果而不触发 stretch 重入；需要让外部布局权威覆盖当前冻结基线与手调宽度时，递增 `columnLayoutVersion`，Core 会清除列测量、冻结基线与手动覆盖并重读稳定 getter。`contentVersion` 只失效内容与测量缓存。

### 窗口与固定 pane

每条轴最多拆成三个 band：固定起始区、滚动中间区、固定结束区。行列 band 做笛卡尔积，最多形成 9 个裁剪 pane。

中间区同时维护精确可见区和 retained 渲染区。overscan 是带方向倾斜的守护缓冲：精确可见区在 guard 内移动时，render window、cell key 和 React 子树保持稳定；接近边缘时才沿当前滚动方向补窗。`onViewportChange` 的 visible 边界来自精确可见区，`renderedCellCount` 来自 retained 渲染区。

固定区受可用像素约束，避免四侧请求量超过容器。普通 cell surface 数量近似为：

```text
(精确可见行 + 至多 2 × 行 overscan + 实际上下固定行)
×
(精确可见列 + 至多 2 × 列 overscan + 实际左右固定列)
```

cell 使用绝对 `left/top` 定位；滚动中的 middle pane layer 才由 rAF 直接写入 `translate3d`。viewport 不再通过继承 CSS 变量驱动整棵子树。viewport 与 pane 使用 CSS containment 限制布局和绘制影响范围，渲染期还会缓存唯一行列边界的 Axis offset，避免每格重复查询。

### MergeIndex

Core 将每个合并区域保存为一条二维矩形，而不是为覆盖的每个格点建立记录。

`MergeIndex` 包含：

- `Map<string, MergeRegion>`：稳定 id 与变更管理
- packed R-tree：点查询和矩形相交查询
- dirty 标记：批量变化后延迟到首次查询统一建树

构建主要由排序主导，约 `O(M log M)`；分布良好时查询接近 `O(log M + I)`，退化分布最坏为 `O(M + I)`。`I` 是查询结果数。

跨 pane 的合并区域会被裁剪成 fragment。只有 owner fragment 执行自定义 renderer，其余 fragment 使用静态文本并从可访问性树隐藏，避免重复 effect 和状态分叉。

显式 `mergedCells` 应保持稳定引用、稳定 id 且互不重叠。Core 不为任意重叠矩形定义覆盖优先级。

### 选择、导航与复制

选区常驻状态是一个闭区间矩形和独立 anchor/focus，空间为 `O(1)`。点击、拖拽、Shift、方向键、Tab 与 Enter 共用坐标导航；进入或离开合并区域时按整个矩形移动。

`mobileInteraction` 默认按粗指针与触控能力自动启用，也可强制开启或关闭。触控输入先保留给浏览器原生双向滚动；只有未越过 `tapSlop` 且未发生滚动的 pointer 才提交点击选择。活动 cell 暴露选区手柄，拖动后沿同一坐标协议扩选；接近边缘时使用独立阈值继续滚动。选区存在时可显示带安全区间距的复制动作，并通过可覆盖 labels 提供本地化反馈。

复制不是虚拟化操作。TSV 生成会逐格读取目标范围，时间和额外内存均为 `O(A)`。Core 默认限制 100,000 个单元格，应用可以收紧范围或改用服务端导出。

### 内容测量

`autoSize` 在 render window 更新后测量当前已渲染、非合并 cell，并渐进更新轴。它不会扫描完整数据集，但会产生同步布局读取，测量缓存也可能随访问过的行列增长。日常预设默认关闭；压力场景应关闭或仅启用必要轴。

## 4. Insight 应用适配

### 行列来源

行来源在类型层互斥：

- `rows`：内存数组
- `rowSource`：同步 `LazyRowSource`
- `rowModel`：`FlatRowModel`、`TreeRowModel` 或兼容模型

列来源同样互斥：

- `columns`：已物化的异构列数组
- `columnCount + getColumn(index)`：超宽表惰性列

Insight 维护有界工作集：惰性列最多 2,048 项，行与行元数据各最多 512 项。远端分页、预取、失效和请求取消仍由调用方负责。

Insight 将 Core viewport 列映射为业务数据列，行号不进入调宽回调。有表头时 `columnResize` 默认启用，可传 `false` 关闭；列级 `resizable`、min/max 与回调均使用业务列语义。

### 树形与同列纵向相邻同值合并

`TreeRowModel` 将展开节点维护为当前可见序列，并支持任意深度以及同步或异步子节点。展开、折叠会改变展示行和数据坐标，而不是只隐藏 DOM；Studio 的经营分析与 Gallery 树示例均包含深度 0/1/2，根节点和分支节点都可展开。

`mergeAdjacent?: false | AdjacentMergeOptions<TRow>` 是 Insight 的应用层能力。配置使用 `AdjacentMergeColumn<TRow>` 描述参与合并的维度；Insight 按当前展示顺序识别配置列中纵向连续的相同值，生成 `columnStart === columnEnd` 的规范矩形，再交给 Core 的 `MergeIndex`。横向或任意二维合并通过显式 `mergedCells` 提供。Core 仍只消费矩形，不读取业务值，也不执行相等判断。

相邻合并在 React `useMemo` 中同步计算：主体扫描为 `O(Nᵣ × D)`，流式 key 状态为 `O(D)`，生成结果为 `O(G)` 且默认最多 100,000 条。扫描前，`E` 条显式 `mergedCells` 的阻断预处理还会增加 `O(E × D)` 时间和最坏 `O(E × D)` 临时 blocker 内存，避免生成范围与其重叠。

Studio 在经营分析中分别提供树形与同列纵向相邻同值合并开关，两者可以同时启用。树形模式下，`treeBoundary` 默认使用 `siblings`，合并 run 会在父节点、层级或不可合并节点边界处断开；这不是 Core 的渲染模式。

### 条件格式与 Cell DOM

规则在 Props 变化时编译和排序，支持文本、背景、图标、二/三色阶、正负数据条、priority 与 `stopIfTrue`。色阶预生成 256 项 palette；逐个可见 cell 的求值约为 `O(R)`。

应用单元格有轻量与富渲染两条 DOM 路径：

```text
静态文本 / 静态 visualStyle：
.ultigrid-cell
└── .ultigrid-cell__content
    └── .ultigrid-insight-cell--plain

条件规则、媒体、动态 visualStyle 或自定义 renderer：
.ultigrid-cell
└── .ultigrid-cell__content
    └── .ultigrid-insight-cell
        ├── visual-layer     # 背景、图片、数据条；pointer-events: none
        └── content-layer    # 对齐、图片、图标、文本或 React 组件
```

两条路径都保留 `.ultigrid-insight-cell` 与 `data-row-id` / `data-column-id` 样式 hook。默认文本单行省略；`wrap` 才允许换行。自定义组件应保持浅 DOM、稳定 Props，并避免同步图片解码或昂贵计算。稳定 getter 背后的数据原地更新时，调用方必须递增 `contentVersion`，同时失效 memoized cell 与自动测量缓存。

### 导出

Excel 与 CSV 按目标范围逐格物化，时间和峰值内存为 `O(A)`，默认限制 1,000,000 个单元格。Excel 还受单工作表 16,384 列和 1,048,576 行限制。自定义视图内容通过列的 `exportValue` 提供业务值。

图片导出捕获当前已布局的 table shell，即虚拟化视口，而不是完整逻辑长表。

## 5. 复杂度与内存

记 `Nᵣ/N𝚌` 为逻辑行列数，`Kᵣ/K𝚌` 为尺寸覆盖数，`W` 为 retained pane 工作集，`M` 为合并数，`I` 为相交合并数，`R` 为规则数，`A` 为复制或导出面积。

| 操作 / 状态 | 时间 | 额外内存 |
| --- | --- | --- |
| Axis 构建 | `O(P + K)` | `O(P + K)` |
| offset / index 查询 | `O(log N)` | `O(1)` |
| 双轴窗口定位 | `O(log Nᵣ + log N𝚌)` | `O(1)` |
| guard 内滚动帧 | `O(log Nᵣ + log N𝚌 + P)`；`P ≤ 9`，无 React cell 重建 | `O(1)` |
| retained 窗口补充 | `O(W)` 加 pane 合并查询 | 行列边界缓存 `O(Wᵣ + W𝚌)` |
| 可见 DOM | `O(W)` | `O(W)` |
| MergeIndex 构建 | 约 `O(M log M)` | `O(M)` |
| MergeIndex 查询 | 常见 `O(log M + I)` | `O(I)` |
| 同列纵向相邻同值合并 | `O(Nᵣ × D + E × D)` | `O(D + G)`；blocker 临时内存最坏 `O(E × D)` |
| 条件格式 | `O(W × R)` | 每个可见格一个结果 |
| 复制 / 导出 | `O(A)` | `O(A)` |

常驻内存不包含完整矩阵：

- Axis typed tree：`O(Nᵣ + N𝚌)`。100K 行和 100K 列的原始 buffers 合计约 4 MiB。
- 稀疏尺寸：`O(Kᵣ + K𝚌)`。
- 合并矩形与空间树：`O(M)`。
- 选区：`O(1)`。
- DOM 与 React cells：`O(W)`。
- 自动测量缓存：最坏随访问过的行列增长。
- 调用方传入的 `rows`、`columns` 与远端缓存由调用方承担。

## 6. 性能边界

`rowCount=100_000`、`columnCount=100_000` 验证的是逻辑寻址与窗口化路径，不代表任意设备、renderer 和配置都能维持固定帧率。

当前使用单一原生滚动坐标，没有分段滚动或坐标重基。超大画布仍受浏览器最大布局尺寸、滚动精度、缩放和内存影响。以下配置会直接放大主线程工作：

- 大量固定行列或 overscan
- 不稳定 getter、Map、合并数组和 renderer 引用
- 全轴尺寸 getter 与持续 autoSize
- 深层自定义 DOM、同步解码和逐格昂贵规则
- 大范围复制与客户端导出

推荐保持数据读取接近 `O(1)`，宽表使用惰性列，尺寸使用稀疏 Map，合并配置使用稳定无重叠集合，并在固定环境下分别测量冷启动、索引构建、稳态滚动和方向突变。

## 7. 发布与验证边界

`@ultigrid/core` 根入口只公开 `UltiGridViewport` 与组件契约；Axis、virtualizer、MergeIndex 和 selection 是内部实现。`@ultigrid/insight` 公开应用组件、列定义、行模型、条件规则，以及 `mergeAdjacent` 的 `AdjacentMergeOptions` / `AdjacentMergeColumn` 类型。

两个包只支持包根和 `./style.css` 子路径。Insight CSS 自包含 Core CSS。

```bash
npm test
npm run build
npm run verify:packages
```

测试与包验证应持续保护坐标转换、窗口边界、合并查询、树形展开、同列纵向相邻同值合并、条件格式、复制上限、声明边界和样式产物。
