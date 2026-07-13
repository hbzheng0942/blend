# ADR 001 — 谱系画布技术选型

日期：2026-07-13 · 状态：已采纳

## 决策

**RN View 绝对定位节点 + react-native-svg 画边线**，不引入 react-native-skia。

## 理由

| 维度 | View+SVG | skia |
|---|---|---|
| web 体积 | ~0（react-native-svg 在 web 输出原生 DOM SVG） | CanvasKit wasm ≈ 2MB+，首屏成本高 |
| 交互 | 节点是普通 Pressable，点击/长按/无障碍全免费 | 需要自己做 hit-test |
| 100 节点性能 | 100 个 View + ~150 条 SVG line，远低于 DOM 性能红线；拖拽用 transform 不触发 reflow | 更高上限，但本场景用不到 |
| 双端一致 | expo 官配，iOS 直接可用 | 同样可用但配置更重 |

PRD 要求"60fps 拖拽、100 节点不卡"——瓶颈在避免逐帧 setState 重排，与渲染后端关系不大。若未来节点数破千（社区谱系广场），再评估 skia。

## 布局与交互

- 自动分层布局：`level = 1 + max(parent levels)`，同层横排；用户拖拽后的位置存 `tree.canvasLayout`（Phase 2 先自动布局，拖拽微调为增量项）
- 选中 1 个节点 = 以它为 parent 继续锻造（fork：任何历史节点都可选）
- 选中 2 个节点 = merge 锻造（双 parents）。MVP 用多选替代拖拽合并，拖拽手势在移动端与画布平移冲突，Phase 3 结合 bottom sheet 再做
- stale 判定为**派生状态**不落库：`isNodeStale`（core）比较各 parent 当前 canonical hash 是否出现在节点 executionPlan 的输入中，改选 canonical 后下游自动虚线化
