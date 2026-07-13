# Phase 1 汇报 — 核心闭环（web）

> 2026-07-13 · 状态：验收通过 · demo：`pnpm --filter @blend/app run web`（或 `.claude/launch.json` 的 blend-web）

## 交付内容

| 模块 | 状态 | 说明 |
|---|---|---|
| monorepo 脚手架 | ✅ | pnpm workspaces：core / providers / storage / apps/blend（Expo SDK 57 + expo-router，universal） |
| `@blend/core` | ✅ 14 单测 | 数据模型（Element/Node/Output/Recipe/Tree）、prompt 组装（inject 用 spike v2 骨架）、级联执行器、uuid/sha256 |
| `@blend/providers` | ✅ 7 单测 | Provider 抽象 + Agnes 实现：503 queue-full/网络异常指数退避（2/8/30s）、300s 超时、FurnaceOverheatError、capability flags（fuse/inject/absorb，subtract/intersect 置灰） |
| `@blend/storage` | ✅ 8 单测 | StorageAdapter 契约 + IndexedDB/memory 双实现，blob 内容寻址去重 |
| `apps/blend` | ✅ | 树列表页 / 锻造台（线性时间轴 + 锻造面板）/ 设置页（key 本地存储 + 模型切换）；key onboarding 横幅 |

## E2E 验收（PRD Phase 1 验收标准，真实 Agnes 调用逐项跑通）

1. ✅ 上传 2 图（茶壶+章鱼）→ ⊕ fuse 锻造 → 2 候选入库，canonical 自动设为第 1 张
2. ✅ +1 图（星云）→ 在 v1 基础上 → inject 迭代锻造 → v2 节点（parent 链接正确）
3. ✅ 重 roll：候选追加到已有节点，原候选保留
4. ✅ 改选 canonical：点击第二候选入谱，★ 标记切换
5. ✅ 刷新不丢数据：重载后 2 节点 / 3 要素 / 改选后的 canonical 全部从 IndexedDB 恢复
6. ✅ **浏览器直连 Agnes 无 CORS 障碍**（风险表销项，Cloudflare Worker 反代模板降级为可选项）

## 过程中发现并修复

- storage 测试挂死：`deleteDatabase` 被上一用例未关闭的连接阻塞 → 每用例独立库名
- 根目录缺 `@types/node` 导致 core typecheck 失败 → 已补
- 本机 `~/.npmrc` 指向失效私有源导致 create-expo-app 失败 → 全程用 pnpm（registry.npmjs.org）

## 观察（非阻塞）

- inject 对"已成型复杂主体"（v1 产物八爪茶壶）再注入星云时，材质变化很弱——与 spike 结论一致（inject 最吃"简单主体 + 强质感源"）。产品层已在 inject 操作符下方展示提示语。
- 免费档高峰期 503 频繁，单候选常态延迟 50–90s；抽 2 候选 ≈ 2–4 分钟。锻造动画/文案要按这个预期设计。

## Phase 2 进展（2026-07-13 更新：全部完成）

5. ✅ 谱系画布：View+SVG 方案（[ADR 001](adr/001-canvas.md)），自动分层布局、贝塞尔血统连线、fork（点选任意节点）、merge（多选 2 节点合并锻造）、stale 派生判定（core `isNodeStale` + 单测）
6. ✅ recast 重铸 + 级联执行器接入真实管线（>6 输入自动分批；青铜×赛博朋克重铸 E2E 已验证）
7. ✅ 风格 tags（3 轴 14 tags，最多 3）+ 锻造/重铸模式切换
8. ✅ `.blend` 导出/导入（fflate zip；往返测试通过）。修复随之暴露的存储层 bug：nodes/elements 原以全局 id 为主键，导入副本会抢走原树节点 → DB v2 迁移为 `[treeId, id]` 复合主键，补跨树隔离契约测试
9. ✅ 视觉整顿为「概念艺术画册」基调：暖黑纸面 + 熔金/冷钢双色、衬线展示标题、小型大写 kicker 注记、发丝线描边（`src/theme.ts` 设计 token 化）

## Phase 3 进展（2026-07-13）

- ✅ 锻造等待仪式：熔金脉动印记 + 轮换炉语（`ForgeRitual`，Animated 原生驱动），替代干等的 spinner
- ✅ 天启骰：随机 2-3 个风格 tags（倾向跨轴怪异组合）。实测「太阳朋克+纸艺」骰在赛博章鱼茶壶上 → 纸雕丛林机械章鱼，且保留上代青色电路血统——代际漂移+随机风格已验证为产品核心魔法
- ✅ 卡面海报导出（web）：canvas 2D 排收藏卡（暖黑卡面 + 发丝框 + kicker 注记 + 熔金印章），候选面板一键导出 PNG
- ✅ iOS 端跑通：expo-file-system 文件桶存储适配器（`storage.native.ts`）、expo-crypto 哈希 + 相册选图（`blobs.native.ts`），Metro 平台后缀分流零改动业务代码；iPhone 17 Pro 模拟器 Expo Go 实测启动渲染正常
- 待做：iOS 深度交互 E2E（需 idb/maestro 驱动）、iOS 端 .blend 与卡面导出（expo-sharing）、画布拖拽微调布局

## VLM Director + 内置免费通道（2026-07-13）

- ✅ **VLM director**：锻造前用 `agnes-2.0-flash`（多模态 chat，~11-17s）看全部输入图+操作意图，一次产出 N 条互异设计方案（每候选一条，含命名），替代"同 prompt 重抽"。core `prompts/director.ts`（brief 组装+容错解析）+ providers `director.ts`（chat 调用，失败静默回退静态骨架，不增加失败面）。方案名存 `Output.conceptName`。实测 fuse/intersect 质量显著提升，风格 tags 与用户补充被正确织入
- `agnes-2.5-flash` 实测尚未开放（model_not_found），开放后改 `AGNES_DIRECTOR_MODEL` 一行即可
- ✅ **内置免费通道**：Cloudflare Worker 反代模板（`worker/agnes-proxy.js`，key 存 Worker Secret）+ 部署文档（`docs/agnes-proxy-setup.md`）。前端经 `EXPO_PUBLIC_AGNES_PROXY_URL` 注入后 key 变可选；用户自填 key 仍直连官方。注：此举把 PRD 2.4"零共享 key"调整为"共享 key 只存自部署 Worker 端"，经 HB 拍板
- ✅ Worker 已由 HB 部署验证，内置免费通道生效

## Phase 3 收尾（2026-07-13 下午）

- ✅ **subtract/intersect 翻案解禁**：director 出 prompt 后图像级验证 4/4 达标（`spike/outputs/rescue_*.png`：球鞋⊖熔岩→冷却黑曜石上的纯白鞋；水母∩星云∩纸鹤→发光半透明折纸鹤）。标记为 director-only（core `DIRECTOR_ONLY_OPERATORS`）：director 失败时报错而非回退静态骨架
- ✅ conceptName 上 UI：候选面板显示方案名（斜体）；卡面海报方案名为主标题、树名降副题
- ✅ **配方码**（PRD 3.3）：core `recipecode.ts`（recipe 链→紧凑 plan+校验，6 单测）+ app `recipecode.ts`（deflate+base64url，`BLEND1.` 前缀）。候选面板"🧬配方码"一键复制；树列表页粘贴导入→建"重演绎"树（plan 存 `tree.importedPlan`），锻造台顶部显示逐步指引（✓/▸ 进度、要素标注、风格、方案名）。二维码渲染留待后续
- ✅ 画布拖拽：PanResponder（零新依赖，>6px 位移算拖拽、否则点选），松手写入 `tree.canvasLayout` 持久化，覆盖自动布局
- ✅ **Gemini provider**（BYOK）：generateContent 多模态直连，maxInputImages 14，全操作符；429→FurnaceOverheatError，4 单测。settings 页重构：生图引擎选择（Agnes/Gemini）+ 双 key 输入；gemini 生图时 director 仍走 agnes 通道（内置 Worker 或自填 key），通道全无则跳过 director
- ✅ Pages 部署就绪：`expo export -p web` 构建验证通过（proxy env 正确打进 bundle），部署操作文档 `docs/deploy-pages.md`（Git 自动部署 / wrangler 直传两方式 + 验证清单）
- ✅ 冒烟：导出产物本地起服 + Chrome 实测——首页（无 key 横幅消失）、配方码输入（坏码报"已损坏"）、设置页（引擎选择/可选 key 文案）均正常，控制台零错误
- 待 HB 操作：按 `docs/deploy-pages.md` 部署 Pages
- 待做（backlog）：配方码二维码渲染进卡面、重演绎自动预填锻造面板、iOS 端 .blend/卡面导出
