# Blend — PRD v1.0

> 供 Claude Code 直接执行。结构已锁定，实现细节内可自主决策，凡标注 [DECISION LOCKED] 的不得更改。
> 日期：2026-07-12 · Owner: HB · 状态：待执行

---

## 0. 一句话定义

Blend 是一个开源的图像"锻造"玩具：用户不断投入图片要素，通过生图模型的多图特征融合能力抽卡生成新图，形成可分叉、可回溯、可分享的融合谱系树。

**核心情绪**：炼金术 / 锻造 / 开盲盒。玩的不是"生成一张好图"，而是"这几个东西融在一起会变成什么鬼"。

---

## 1. 核心概念 [DECISION LOCKED]

### 1.1 数据模型：DAG，非线性链

```typescript
// 内容寻址：所有图片以 sha256 hash 存储，全局去重
Element {
  id: string            // uuid
  imageHash: string     // sha256, 指向 blob store
  source: "upload" | "generated"
  createdAt: number
  meta?: { width, height, mime, label? }
}

Node {
  id: string
  recipe: Recipe
  outputs: Output[]     // 抽卡候选，全部保留，不丢弃
  canonicalOutputId: string | null  // 用户选定的"入谱"结果
  createdAt: number
}

Output {
  id: string
  imageHash: string
  seed?: number
  executionPlan: ExecutionStep[]  // 见 1.3
  providerId: string
  modelId: string
  finalPrompt: string   // 实际发送的完整 prompt，可复现性关键
}

Recipe {
  parentNodeIds: string[]     // 0个=根节点(纯要素融合), 1个=迭代, 2+个=分支合并
  elementIds: string[]        // 本轮新增的原始要素
  operator: OperatorId        // 见 1.2
  styleTags: string[]         // 风格维度，与 operator 正交
  userPromptExtra?: string    // 用户自由补充
  mode: "forge" | "recast"    // 锻造(喂上轮输出图) | 重铸(全要素重新融合)
}

Tree {
  id: string
  title: string
  rootElementIds: string[]
  nodeIds: string[]
  canvasLayout: Record<nodeId, {x, y}>   // 谱系画布节点位置
  createdAt, updatedAt: number
}
```

要点：
- **候选全保留**：每次抽卡产出 N 个候选（默认 2，可配 1-4），全部存 hash。用户 canonize 一个入谱，其余留在节点内可随时反悔改选。改选 canonical 后，下游节点标记 `stale`（视觉提示，不自动重跑）。
- **fork**：任意节点可作为新分支的 parent。
- **merge**：两个节点可共同作为 parents 合并（这是核心玩法之一，UI 上要显性支持拖拽两节点合并）。
- **配方与执行分离**：Recipe 是意图，Output.executionPlan 是实际执行路径。同一 Recipe 可无限重 roll、可换模型重跑。

### 1.2 操作符（一等公民 UI，不是文本框）[DECISION LOCKED]

| id | 符号 | 名称 | 语义 | prompt 策略骨架 |
|---|---|---|---|---|
| fuse | ⊕ | 融合 | 特征均匀混合成新物体 | "Seamlessly fuse all subjects into one single coherent new object/creature, blending their key visual features equally" |
| inject | → | 注入 | 后者的材质/风格灌入前者的形态 | "Keep the form and silhouette of image 1, but re-render it entirely in the material/texture/style of image 2" |
| subtract | ⊖ | 相减 | 从 A 中剥离 B 的特征 | "Take image 1 and remove/strip away all visual characteristics that resemble image 2" |
| intersect | ∩ | 交集 | 只保留共同特征，蒸馏公约数 | "Distill and depict only the visual and conceptual qualities that ALL input images share in common, as a single new image" |
| absorb | ⊃ | 吞噬 | A 为主体，B 作为细节碎片嵌入 | "Image 1 is the dominant host; embed fragments and details of the other images into its surface and structure" |

- prompt 骨架放 `packages/core/prompts/operators.ts`，允许按模型 override（provider 层可注册 per-model prompt 变体）。
- 每个操作符有 capability flag：spike 测试后不达标的操作符在对应模型下置灰并提示"该模型不支持此操作"。

### 1.3 双模式 + 级联执行 [DECISION LOCKED]

- **forge（锻造）**：inputs = [parent 的 canonical 输出图] + 新 elements。有信息衰减 drift 美学，默认模式。
- **recast（重铸）**：inputs = 谱系上溯收集的全部原始 elements + 新 elements。高保真。
- **级联降级**：当 inputs 数量 > provider.maxInputImages 时，自动分批级联（每批 maxInputImages 张，中间结果作为下一批的第一张输入）。级联的每一步记入 executionPlan：

```typescript
ExecutionStep {
  inputHashes: string[]
  prompt: string
  outputHash: string
  providerId, modelId: string
}
```

### 1.4 风格维度（与操作符正交）

预设 styleTags 分组，多选，最多 3 个：
- 材质轴：ceramic / biological / mechanical / liquid-metal / paper-craft / voxel
- 时代轴：ancient-bronze / y2k / cyberpunk / solar-punk
- 渲染轴：photoreal / anime-cel / blueprint / clay-render

每个 tag 映射一段 prompt 片段，`packages/core/prompts/styles.ts`。

---

## 2. 模型层

### 2.1 Provider 抽象 [DECISION LOCKED]

```typescript
interface Provider {
  id: string
  displayName: string
  capabilities: {
    maxInputImages: number
    supportedOperators: OperatorId[]   // spike 结果填入
    maxResolution: string
  }
  quota: { type: "free-byok" | "paid-byok", notes: string }
  generate(req: GenerateRequest): Promise<GenerateResult>
}
```

### 2.2 默认 Provider：Agnes（免费）

- Endpoint：`POST https://apihub.agnes-ai.com/v1/images/generations`，OpenAI 兼容，base_url `https://apihub.agnes-ai.com/v1`
- 模型：`agnes-image-2.0-flash`（图像编辑/多图融合主力，Artificial Analysis Image Editing 榜 Top 20 区间）；`agnes-image-2.1-flash` 作为备选注册
- 多图输入：`extra_body.image` 传图片数组（HTTPS URL 或 Data URI Base64）；`response_format` 必须放在 `extra_body` 内
- 本地图片场景一律走 Base64 Data URI（用户图片不上传任何第三方图床）
- 超时设 120s（官方建议 60-360s）
- 免费、无绑卡，仅 RPM 限制。429 处理见 2.4
- **参考实现**：本机已有一版 Agnes 调用机制在 `/Users/hb/Downloads/project/shorts-analyst-managed/agnes`，Claude Code 执行时先读该目录，评估后复用其鉴权/重试/参数封装逻辑，迁移进 `packages/providers/agnes/`。如与本 PRD 参数规范冲突，以官方文档 https://agnes-ai.com/zh-Hans/docs/overview 实测为准

### 2.3 BYOK Providers（预留 adapter，MVP 只实现 Agnes + Gemini）

| provider | model | maxInputImages | 备注 |
|---|---|---|---|
| agnes | agnes-image-2.0-flash | 实测确定（spike 内测出上限） | 默认，免费 |
| gemini | gemini-3.1-flash-image (Nano Banana 2) | 14 | BYOK，多图理解上限最高 |
| dashscope | qwen-image-edit 系列 | 3 | BYOK，预留 stub |
| custom | 用户自填 OpenAI 兼容 endpoint | 用户自填 | 预留 stub |

### 2.4 Key 管理与限流 [DECISION LOCKED]

- **零后端经手**：所有 key 存客户端（web: localStorage；iOS: expo-secure-store/Keychain），请求直连 provider。仓库不含任何共享 key，不做服务端代理转发用户请求。
- 首次启动 onboarding：引导用户 30 秒注册 Agnes 拿免费 key（platform.agnes-ai.com → API Keys），贴入即用。文案强调"免费、不绑卡、key 只存在你本地"。
- Agnes 官方要求 key 不暴露于公开代码——对开源项目的合规解法就是"用户自持 key + 本地存储"，README 中明确说明。
- **429/限流可视化为产品机制**："锻造炉过热，冷却中 🔥→❄️"，展示倒计时，指数退避重试（3 次，2s/8s/30s）。CORS 如有问题，repo 附可选的 Cloudflare Worker 反代模板（10 行，用户自部署自用）。

---

## 3. 产品功能规格

### 3.1 页面结构

```
/ (树列表)          — 我的谱系树，卡片网格，新建入口
/tree/:id (锻造台)   — 核心页面，谱系画布 + 锻造操作区
/tree/:id/card      — 谱系卡导出预览
/settings           — provider 配置、key 管理、语言
```

### 3.2 锻造台（核心页面）

布局（web 横屏）：左侧 70% 谱系画布，右侧 30% 锻造面板。移动端：画布全屏，锻造面板 bottom sheet。

**谱系画布**：
- 节点渲染为圆角卡片：canonical 缩略图 + 操作符角标 + 版本号（v1/v2/v2a…）
- 根部要素以小圆片显示，连线标注操作符符号
- 交互：单击选中（面板显示详情+候选轮播）、双击放大、拖一个节点到另一个节点上 = 发起 merge、长按 fork
- 节点 stale 状态显示虚线边框
- 实现：react-native-skia 或 SVG + gesture-handler，Claude Code 自选，要求 60fps 拖拽、100 节点不卡

**锻造面板**：
1. 要素槽：当前已选 parents + 新增图片上传区（拖拽/相册/粘贴）
2. 操作符选择：5 个大按钮，符号 + 名称，不支持的置灰
3. 风格 tags：折叠式多选
4. 模式切换：forge / recast（带一句话解释 tooltip）
5. 自由 prompt 补充（单行，可选）
6. 🔨 锻造按钮 → 抽卡动画（熔炉/火花 loading）→ 候选并排展示 → 点选 canonize

**候选管理**：节点详情内保留全部历史候选，可改选 canonical，可对任一候选"以此重 roll"。

### 3.3 谱系卡（病毒单元）

- 竖版 9:16 卡片：顶部原始要素缩略图行 → 中部融合路径图（要素→操作符符号连线→中间态小图）→ 底部最终产物大图 → 底边 blend logo + 配方码
- **配方码**：树的 recipe 链序列化（elements 的 hash 不含图片本体，只含结构+prompt+operator+seed），压缩后 base64，生成二维码 + 短文本码。他人导入配方码 → 用自己的图或占位图 + 自己的 key 重演绎 → "同一配方不同结果"对比传播
- 导出：PNG（web canvas 渲染 / iOS react-native-view-shot）+ 系统分享

### 3.4 存储 [DECISION LOCKED]

- **本地优先，无账号系统**：web 用 IndexedDB（图片 blob）+ 结构化数据同库；iOS 用 expo-sqlite + 文件系统存图。抽象一层 `StorageAdapter` 保持双端一致接口
- 树可整体导出/导入为 `.blend` 文件（zip：manifest.json + images/）——这也是跨设备迁移方案，MVP 不做云同步

### 3.5 明确不做（MVP 边界）

- ❌ 账号/云同步/社区 feed
- ❌ 视频输出（Agnes video API 留作 v2 彩蛋：谱系动画）
- ❌ 盲盒配方模式（backlog，配方码结构已为其预留：卡片可选"隐藏结果图"字段）
- ❌ 局部涂抹/mask 编辑

---

## 4. 技术栈 [DECISION LOCKED]

```
Monorepo: pnpm workspaces
├── packages/core        # 数据模型、recipe 引擎、级联执行器、prompt 组装（纯 TS，零 UI 依赖，单测覆盖）
├── packages/providers   # agnes / gemini / dashscope-stub / custom-stub
├── packages/storage     # StorageAdapter: indexeddb / sqlite 双实现
└── apps/blend           # Expo (React Native) universal app → web + iOS
```

- Expo SDK 最新稳定版，expo-router
- 状态：zustand
- 谱系画布：Claude Code 在 react-native-skia / SVG 方案间实测选型，选型理由写入 `docs/adr/001-canvas.md`
- 部署：web → Cloudflare Pages（`npx expo export -p web`）；iOS → EAS Build + TestFlight
- License: MIT。README 中英双语，含 GIF demo

---

## 5. 执行计划（给 Claude Code 的任务序列）

### Phase 0 — Spike（先做，产出决定 Phase 1 范围）
**S1. 操作符×模型保真度矩阵**：脚本化跑 5 操作符 × 2 模型（agnes-image-2.0-flash、agnes-image-2.1-flash）× 3 组测试图（物体+物体 / 物体+材质 / 物体+生物），输出 30 格 HTML 对比矩阵页。
- 先读 `/Users/hb/Downloads/project/shorts-analyst-managed/agnes` 复用调用逻辑
- 顺带实测：extra_body.image 数组的实际最大张数（1/2/3/5/8 递增探测）、Data URI 是否可用、429 触发阈值
- 产出：`docs/spike-results.md`（含矩阵截图 + 每操作符 pass/fail 判定 + capability flags 初值）
- **判定标准**：操作符结果与语义意图肉眼一致率 ≥ 2/3 组则 pass；fail 的操作符 MVP 中对该模型置灰
- ⚠️ 完成后停下，等 HB review 矩阵再进 Phase 1

### Phase 1 — 核心闭环（web only）
1. monorepo 脚手架 + core 数据模型 + 单测
2. agnes provider + key onboarding + 429 处理
3. 锻造台最小版：上传 2+ 图 → 选操作符 → 抽卡 2 候选 → canonize → 继续迭代（先线性，画布可以是简单垂直时间轴）
4. IndexedDB 存储 + 树列表页
- 验收：完整走通"2图→v1→+1图→v2→重roll→改选canonical"，刷新不丢数据

### Phase 2 — DAG 完整体
5. 谱系画布（fork/merge/拖拽/stale 标记）
6. recast 模式 + 级联执行器 + executionPlan 记录
7. 风格 tags + 自由 prompt
8. .blend 导出导入

### Phase 3 — 传播 + 双端
9. 谱系卡渲染与导出 + 配方码（编解码 + 导入重演绎流程）
10. gemini provider（BYOK）+ settings 页
11. Expo iOS 适配（bottom sheet 锻造面板、secure-store、view-shot）+ EAS 构建
12. Cloudflare Pages 部署 + README + demo GIF

### 汇报节点
- 每 Phase 结束输出：可运行 demo 地址/录屏 + 变更摘要 + 下阶段风险
- 任何 [DECISION LOCKED] 项如实现中发现不可行，停下说明，不得静默改设计

---

## 6. Backlog（不排期，记录在案）
- 盲盒配方（隐藏结果的配方码 + 揭晓对比页）
- 谱系动画：用 agnes-video-v2.0 把融合路径生成 morph 视频
- Model Arena：同一配方多模型并排对比页（spike 矩阵的产品化）
- 社区配方广场（需后端，远期）

---

## 7. 风险表

| 风险 | 影响 | 缓解 |
|---|---|---|
| Agnes 免费政策变化/服务不稳 | 默认路径失效 | provider 抽象已隔离；gemini BYOK 兜底；README 声明 |
| Agnes 实测多图上限 < 3 | recast/merge 受限 | 级联执行器兜底，spike 先测出真值 |
| ⊖/∩ 操作符全模型 fail | 玩法叙事削弱 | capability flag 置灰，⊕/→/⊃ 足够撑 MVP |
| Expo web 画布性能 | 核心交互卡顿 | spike 阶段附带 100 节点压测，不行降级 SVG |
| CORS 阻断浏览器直连 Agnes | web 端不可用 | 附 Cloudflare Worker 自部署反代模板 |
