# UltiGrid 能力清单

UltiGrid 由 Studio、`@ultigrid/insight` 应用层表格和 `@ultigrid/core` 表格渲染底座组成。本页记录公开能力及其边界；实现细节见 [ARCHITECTURE.md](ARCHITECTURE.md)。

状态：**Available** 已提供；**Partial** 有明确边界；**Planned** 尚未提供。

## 表格渲染底座 · `@ultigrid/core`

| 能力 | 状态 | 边界 |
| --- | --- | --- |
| 行列双轴虚拟化 | Available | DOM 随视口、overscan 与固定区增长 |
| 按坐标读取 | Available | `getCell` 必须是同步读取；异步数据由外部缓存 |
| 上下左右固定 | Available | 最多组合 9 个 pane；实际数量受容器像素约束 |
| 二维矩形合并 | Available | Core 不判断业务值；显式矩形应稳定且不重叠 |
| 自定义行高/列宽 | Available | 默认值、稀疏 Map 与 getter；getter 重建时遍历完整轴 |
| 列宽直接调整 | Available | Core 需显式开启 `columnResize`；指定表头分隔线支持鼠标、触控笔、触控和键盘，并通过 `onColumnResize` 报告生命周期 |
| 内容自适应 | Available | 只渐进测量已渲染、非合并 cell，不做全表预扫描 |
| 容器自适应 | Available | 少列可平分剩余宽度，多列使用原生横向滚动 |
| 单元格渲染 | Available | 支持文本、class、style、ARIA、meta 和 React renderer |
| 选择与导航 | Available | 点击、拖拽、越界自动滚动、Shift、方向键、Tab、Enter，感知合并区域 |
| 移动端触控 | Available | `mobileInteraction` 默认自动识别粗指针；原生滚动优先，轻点选中，拖拽手柄扩选并支持边缘自动滚动与安全区复制动作 |
| TSV 复制 | Available | 默认最多物化 100,000 个单元格 |
| 主题色 | Available | `themeColor` 统一选择与焦点强调色；深度样式仍可覆盖 CSS 变量 |
| 命令式 API | Available | `scrollToCell`、`getSelection`、`copySelection`、`focus` |
| 100K × 100K 逻辑坐标 | Partial | 不分配完整矩阵；仍受浏览器布局尺寸和滚动精度限制 |

## 应用层表格 · `@ultigrid/insight`

| 能力 | 状态 | 边界 |
| --- | --- | --- |
| 数组与惰性数据源 | Available | `rows`、惰性 `rowSource`、`rowModel` 在类型层互斥 |
| 数组与惰性列 | Available | `columns` 或惰性 `columnCount + getColumn` 二选一 |
| 平铺与多级树 | Available | `TreeRowModel` 支持任意深度与同步/异步子节点；经营分析和 Gallery 树均展示深度 0/1/2，根与分支可展开 |
| 同列纵向相邻同值合并 | Available | `mergeAdjacent` 遍历配置列与展示行，生成单列矩形，默认上限 100,000；横向或任意二维合并使用显式 `mergedCells` |
| 条件格式 | Available | 文本、背景、图标、二/三色阶、正负数据条 |
| 自定义 Cell | Available | 对齐、字体、颜色、图片、图标、背景、自定义组件与导出值 |
| 移动交互与列宽调整 | Available | 手势由 Core 执行；Insight 映射业务数据坐标，有表头时默认启用调宽，可传 `false` 关闭，行号不进入回调 |
| Excel / CSV 导出 | Available | 客户端物化，默认 1,000,000-cell 上限；Excel 受工作表规格限制 |
| PNG 导出 | Partial | 捕获当前虚拟化视口，不生成完整逻辑长图 |
| 国际化与无障碍 | Available | `localeText`、grid/treegrid、焦点与键盘语义 |

## Studio 交互层

| 能力 | 状态 | 边界 |
| --- | --- | --- |
| 介绍页 | Available | 单屏呈现三层架构、包边界与规模指标；层级和基础/进阶能力通过按钮切换，不占用表格场景空间 |
| 组件展厅 | Available | 基础/进阶两组共 12 个可交互示例，覆盖惰性行列、多级树、移动端触控、命令式 API、Excel/CSV/PNG 导出；每项使用实际 Demo TSX 文件进行实时源码编辑与预览 |
| 经营分析 | Available | 根与分支均可展开，至少覆盖深度 0/1/2；树形和同列纵向合并可独立开启，合并按兄弟边界断开 |
| 条件格式场景 | Available | 组合展示五类格式规则 |
| Props / JSON 工作台 | Available | 可视 Props 实时提交；JSON 模式的草稿与应用动作分离；支持规模预设与主题色 |
| 中英文、全屏、诊断 | Available | 性能 HUD 是页面 rAF 观测，不是标准 benchmark |
| 移动端 Studio | Available | 窄屏优先保留表格舞台；顶部导航横滑并压缩，Props 使用带遮罩、拖拽把手、关闭动作和安全区适配的底部 sheet |

Studio 不发布 npm，也不进入 Core 或 Insight 的运行时依赖。

## Planned

- 可复现的浏览器 benchmark 与性能回归预算
- 分段滚动 / 坐标重基
- Worker 或服务端超大导出
- 排序、筛选、分组、聚合与透视插件
- 编辑、粘贴、填充、校验与撤销/重做事务

未列为 Available 的能力不应被视为隐藏配置或稳定公共 API。
