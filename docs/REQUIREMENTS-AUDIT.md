# UltiGrid 原始需求复核

复核日期：2026-07-11。状态只依据当前仓库源码、自动化测试、生产构建和包契约检查，不把设计意图或路线图当作已完成功能。

## 结论

- 达成：12 项
- 部分达成：3 项
- 未实现：0 项

“部分达成”的三项分别是：标准化极限性能证明、宽泛意义上的完整 BI 数据引擎、正式发布与社区 Star 结果。仓库已经具备对应基础，但不能把尚未发生的 benchmark、发布和社区结果写成已达成。

## 表格组件要求

| # | 要求 | 状态 | 当前证据与边界 |
| --- | --- | --- | --- |
| 1 | React、组件分层与 Props 设计 | 达成 | `src/core/viewportTypes.ts` 定义业务无关 Props；`src/bi/UltiGridInsight.tsx` 负责 BI 适配；Studio 与 demo 位于独立目录。发布边界为 `@ultigrid/insight` → `@ultigrid/core`；数据源/列源在类型层互斥，Insight 的公共坐标统一为数据坐标。 |
| 2 | 10 万行 × 10 万列、Map、虚拟滚动、内存与丝滑体验 | 部分达成 | `Axis` 使用稀疏 `Map` 与 typed segment tree，`MergeIndex` 使用 `Map` 与 packed R-tree，`UltiGridViewport` 双轴窗口化且只创建 viewport/pane DOM；缓存有界。仍缺固定设备、浏览器、数据分布下的标准 benchmark，因此不能承诺所有环境无卡顿。 |
| 3 | 仅渲染层与基础样式 | 达成 | `src/core` 不包含 BI 排序、条件格式或业务数据；基础 DOM/CSS 位于 `UltiGridViewport.tsx` 与 `ultiGridViewport.css`。 |
| 4 | 上下左右固定行列 | 达成 | `frozen.top/bottom/left/right` 与最多 9 pane 已实现，并按 viewport 像素约束极端固定数量。 |
| 5 | 合并单元格 | 达成 | 合并矩形由 `MergeIndex` 查询；Demo 同时包含横跨 10,501 列和纵跨 10,499 行的独立 merge，均按单个矩形保存。测试还验证压力集合边界、唯一 id 与互不重叠。 |
| 6 | 每行每列自定义宽高 | 达成 | 支持默认尺寸、稀疏 `rowHeights/columnWidths` Map 与 getter；默认行高固定。 |
| 7 | 内容自适应列宽和行高 | 达成 | `autoSize` 对已渲染、非合并单元格渐进测量，支持行列、边界与 `allowShrink`。它不是全表内容预扫描。 |
| 8 | 自适应容器，少列平分、多列横向滚动 | 达成 | `ResizeObserver` 跟随容器；`fitColumns="stretch"` 分配剩余宽度；自然总宽超出时使用原生双向滚动。 |
| 9 | 单元格级自定义渲染与默认截断 | 达成 | Core 提供 `renderCell`；`InsightColumn`/`InsightCell` 支持对齐、字体、颜色、图片、图标和自定义 React 内容；视觉层与内容层分离，默认单行省略。 |
| 10 | 点击选择与方向键导航 | 达成 | 支持点击、Shift、四方向、Tab、Enter、合并单元格跳转和自动滚入视口。 |
| 11 | 圈选区域复制 | 达成 | 支持拖拽矩形选区、`Ctrl/Cmd+C` 与命令式复制 TSV；默认有 100,000-cell 物化上限。 |

## 其它要求

| # | 要求 | 状态 | 当前证据与边界 |
| --- | --- | --- | --- |
| 1 | 当前目录可运行 Vite 应用 | 达成 | `package.json`、`vite.config.ts`、`index.html` 与 `src/main.tsx` 完整；生产构建通过。 |
| 2 | BI 应用表格与左表右 Props 编辑器 | 达成 | `UltiGridInsight` 与 Studio 已组装。Studio 包含能力总览 + 四个差异场景、统一规模预设、可视/JSON 双模式、每 Tab 的 View code、`zh-CN`/`en-US`、原生优先且带兼容回退的全屏，以及按需诊断。 |
| 3 | 市面 BI 产品表格的所有基础能力 | 部分达成 | 用户明确列举的条件格式、Excel/CSV/当前视图图片导出、平铺、树形、自定义单元格及分层 DOM 已完成。排序、筛选、分组、聚合、透视、列拖拽/缩放、编辑与撤销系统仍是路线图；图片导出当前只捕获虚拟化 viewport。 |
| 4 | 面向开源与大量 Star | 部分达成 | 已有 MIT、双语根 README、两个包级 README、架构文档、测试，以及 `@ultigrid/core` / `@ultigrid/insight` 的 ESM exports、CSS、prepack 和契约检查。根 workspace 保持 private、子包可 public publish；实际 registry 发布、CI、正式 benchmark、社区运营和 Star 结果仍不能由源码证明。 |

## 本轮交互与自动化验收

- Studio 已接入 5 个 Tab：能力总览、经营分析、树形钻取、条件矩阵、合并画布；每个 Tab 都能打开、复制对应公开 npm API snippet。
- 四个数据场景的列 id 和 renderer/规则组合有差异测试，不是只替换标题和配色。
- `zh-CN` / `en-US` 翻译与参数插值有单元测试；语言切换覆盖 Studio、场景、无障碍标签与导出错误。
- Fullscreen 控件优先调用 stage 的 `requestFullscreen()` / `document.exitFullscreen()` 并监听 `fullscreenchange`；嵌入权限拒绝时使用固定定位兼容全屏，按钮与 Esc 均能退出。
- 性能 HUD 默认按需打开；它显示页面级 rAF 回调间隔中位数换算的 cadence、帧间隔 P95，以及 viewport 回调数据，不是表格 FPS 或正式 benchmark。
- Insight 在表头和行号开启时，受控选区、回调、viewport、scroll/copy API 与导出都保持不含 chrome 的数据坐标，并有回归测试。
- 包契约检查要求两个包的 JS、声明、样式、README/LICENSE 完整，禁止声明泄漏源码路径和 Insight 额外依赖 chunk，并验证 Insight CSS 自包含 core 样式。

## 可复现验收命令

```bash
npm test
npm run build
npm run verify:packages
```

旧公共组件名、旧文件名及旧 CSS namespace 已全部移除，不保留双轨兼容层。
