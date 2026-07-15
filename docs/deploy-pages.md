# Web 端部署：Cloudflare Pages 操作（给 HB）

> 前置：Agnes 反代 Worker 已部署（`docs/agnes-proxy-setup.md`），记下其地址。

## 方式 A：Dashboard 连 GitHub（推荐，push 即自动部署）

1. dash.cloudflare.com → Workers & Pages → Create → **Pages** → Connect to Git，选 blend 仓库
2. 构建配置：
   - Build command：`pnpm install && pnpm --filter @blend/app run export:web`
   - Build output directory：`apps/blend/dist`
3. Environment variables 加：
   - `EXPO_PUBLIC_AGNES_PROXY_URL` = 你的 Worker 地址（如 `https://blend-agnes-proxy.<子域>.workers.dev`）
4. Save and Deploy。之后每次 push main 自动重建

## 方式 B：本地构建 + wrangler 直传（不走 Git）

```bash
cd apps/blend
EXPO_PUBLIC_AGNES_PROXY_URL=https://blend-agnes-proxy.<子域>.workers.dev \
  pnpm run export:web
npx wrangler pages deploy dist --project-name blend-bnf
```

## 验证清单

- 打开站点 → 树列表页正常，**没有**"尚未配置 key"横幅（说明内置通道生效）
- 不填任何 key 直接锻造一炉：能出图（走 Worker）
- 设置页：生图引擎两项（Agnes/Gemini）、Agnes key 显示"（可选）"

## 说明

- `app.json` 已是 `web.output: "single"`（SPA）；Pages 对无 404.html 的项目自动启用 SPA fallback，expo-router 客户端路由可直接工作，无需 `_redirects`
- 换 Worker 地址后需重新构建（env 是构建时打进 bundle 的）
