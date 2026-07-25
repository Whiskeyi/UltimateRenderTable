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
| 单元格渲染 | Available | 支持文本、class、style、逐单元格 ARIA 属性、meta 和 React renderer |
| 选择与导航 | Available | 点击、拖拽、越界自动滚动、Shift、方向键、Tab、Enter，感知合并区域；选区遍历到边界后释放原生 Tab 顺序，树按钮与列宽分隔线等内部控件仍是 Tab 停靠点 |
| 移动端触控 | Available | `mobileInteraction` 默认自动识别粗指针并锁定首次主方向；纵向保留原生滚动，横向单轴滚动，另含轻点选中、手柄扩选、边缘自动滚动与安全区复制动作 |
| TSV 复制 | Available | 默认最多物化 100,000 个单元格 |
| 主题色 | Available | `themeColor` 统一选择与焦点强调色；深度样式仍可覆盖 CSS 变量 |
| 命令式 API | Available | `scrollToCell`、`getSelection`、`copySelection`、`focus` |
| 内容缓存失效 | Available | 稳定 getter 背后的数据原地变化时递增 `contentVersion`，失效 cell memo 与自动测量；不会重置列宽布局 |
| 100K × 100K 逻辑坐标 | Partial | 不分配完整矩阵；仍受浏览器布局尺寸和滚动精度限制 |

## 应用层表格 · `@ultigrid/insight`

| 能力 | 状态 | 边界 |
| --- | --- | --- |
| 数组与惰性数据源 | Available | `rows`、惰性 `rowSource`、`rowModel` 在类型层互斥；`contentVersion` 会同步开启新的有界行/行元数据缓存 epoch |
| 数组与惰性列 | Available | `columns` 或惰性 `columnCount + getColumn` 二选一 |
| 列值契约 | Available | 0.2.0 的 `InsightColumn` 将 `TValue` 约束为 `string \| number \| boolean \| Date \| null \| undefined`；旧 object-valued `getValue` 应返回 primitive/Date，自定义渲染从 `context.row` 读取完整对象 |
| 平铺与多级树 | Available | `TreeRowModel` 支持任意深度与同步/异步子节点；经营分析和 Gallery 树均展示深度 0/1/2，根与分支可展开 |
| 同列纵向相邻同值合并 | Available | `mergeAdjacent` 遍历配置列与展示行，生成单列矩形，默认上限 100,000；横向或任意二维合并使用显式 `mergedCells` |
| 条件格式 | Available | 文本、背景、图标、二/三色阶、正负数据条 |
| 自定义 Cell | Available | 对齐、字体、颜色、图片、图标、背景、自定义组件与导出值 |
| 移动交互与列宽调整 | Available | 手势由 Core 执行；Insight 映射业务数据坐标，有表头时默认启用调宽，可传 `false` 关闭，行号不进入回调 |
| Excel / CSV 导出 | Available | 客户端物化，默认 250,000-cell 上限；CSV 同步物化并默认防公式注入；0.2.0 的包级 `exportExcel(fileName, range, options)` 第三参数公开进度、`AbortSignal` 与批次大小，XLSX 分批让出事件循环，但序列化阶段不可中断 |
| PNG 导出 | Partial | 捕获当前虚拟化视口，不生成完整逻辑长图 |
| 国际化 | Available | `localeText` 覆盖组件可见或播报文案；宿主仍负责业务内容翻译 |
| ARIA 语义 | Available | 已提供 grid/treegrid、逻辑 rowgroup/row、跨 pane `aria-owns`、cell/header 角色与索引、合并跨度、树状态、多选状态及已渲染活动单元格关联；Chromium AX 树已有回归，生产接入仍应覆盖目标 NVDA/VoiceOver 版本 |

## Studio 交互层

| 能力 | 状态 | 边界 |
| --- | --- | --- |
| 介绍页 | Available | 呈现三层架构、包边界与规模指标，并提供快速接入、生产用例、包文档 CTA；320–390px 下卡片纵向堆叠并由页面滚动 |
| 组件展厅 | Available | 生产用例/基础/进阶三组共 14 个可交互示例；订单履约支持订单/运单/客户搜索、待处理过滤与选区复制，预算矩阵支持 ≥ ¥50K 超支筛选、最大超支定位和复核 CSV，移动现场巡检覆盖触控工作流；每项使用实际 Demo TSX 文件实时编辑与预览 |
| 经营分析 | Available | 根与分支均可展开，至少覆盖深度 0/1/2；树形和同列纵向合并可独立开启，合并按兄弟边界断开 |
| 电子表格 | Available | 以应用集成方式演示编辑、公式、格式、原子粘贴、复制公式平移、剪切公式引用保持、合并/重置保护与撤销/重做；模块内存保留最多 50 步历史，`sessionStorage` 只保存当前快照供同标签页刷新恢复，刷新后不恢复历史；不提供文件/服务端保存、多工作表或自动填充/序列填充 |
| Props / JSON 工作台 | Available | 可视 Props 实时提交；JSON 模式的草稿与应用动作分离；支持规模预设与主题色 |
| 中英文、全屏、诊断 | Available | 性能 HUD 仅在打开诊断时进行页面 rAF 采样，不是标准 benchmark |
| 移动端 Studio | Available | 窄屏优先保留表格舞台；顶部导航横滑并压缩，Props 使用安全区底部 sheet；Spreadsheet Ribbon 分组不收缩，通过水平滚动展示 |

Studio 不发布 npm，也不进入 Core 或 Insight 的运行时依赖。

## 验证与发布

- `npm run verify`：lint、Vitest、完整构建、gzip 包体预算、包契约、tarball Vite 消费端。
- `npm run test:e2e`：构建 Studio 后运行 Chromium 交互测试；覆盖默认介绍页、顶层场景切换、320px 介绍布局、Ribbon 分组，以及电子表格会话恢复和数据保护。
- CI 在 Pull Request、merge queue 与 `main` push 上执行 Node 18/20/22 兼容性、质量/消费端和浏览器三组任务。
- npm 发布仅允许手动触发；`publish=true` 才进入受保护 environment。全部版本已存在时发布失败，避免空发布被误报为成功。

## Planned

- 在现有包体预算和浏览器交互测试之外提供可复现的性能 benchmark
- 分段滚动 / 坐标重基
- Worker 或服务端超大导出
- NVDA / VoiceOver 的跨浏览器、跨版本自动化与人工读屏矩阵
- 排序、筛选、分组、聚合与透视插件
- 自动填充/序列填充、校验、多工作表与持久文件/服务端保存

未列为 Available 的能力不应被视为隐藏配置或稳定公共 API。
