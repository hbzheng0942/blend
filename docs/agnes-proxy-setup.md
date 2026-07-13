# 内置免费通道：Agnes 反代 Worker 部署操作（给 HB）

> 目的：web 端默认无需用户填 key——前端打到你自部署的 Cloudflare Worker，
> 你的 Agnes key 以 Secret 形式只存在 Worker 端，不进 bundle、不进 git。
> 用户如果自填了 key 则直连 Agnes 官方，不走此通道。

## 一次性部署（约 5 分钟，Dashboard 方式，无需本地工具）

1. 登录 https://dash.cloudflare.com → 左侧 **Workers & Pages** → **Create** → **Create Worker**
2. 名字随意（如 `blend-agnes-proxy`）→ Deploy 生成占位 Worker
3. 点 **Edit code**，把仓库里 `worker/agnes-proxy.js` 的内容整体粘贴覆盖 → **Deploy**
4. 回到该 Worker 页面 → **Settings → Variables and Secrets** → **Add**：
   - Type 选 **Secret**，名字 `AGNES_API_KEY`，值填你的 Agnes key → Save
5. 记下 Worker 地址，形如 `https://blend-agnes-proxy.<你的子域>.workers.dev`
6. 验证（终端执行，应返回模型列表）：
   ```bash
   curl https://blend-agnes-proxy.<你的子域>.workers.dev/v1/models
   ```

（喜欢 CLI 的话等价操作：`npx wrangler deploy worker/agnes-proxy.js --name blend-agnes-proxy`
然后 `npx wrangler secret put AGNES_API_KEY`。）

## 前端接线

构建/本地启动时注入 Worker 地址即可，代码已接好（`apps/blend/src/store.ts` 的
`EXPO_PUBLIC_AGNES_PROXY_URL`）：

```bash
# 本地开发
EXPO_PUBLIC_AGNES_PROXY_URL=https://blend-agnes-proxy.<子域>.workers.dev \
  pnpm --filter @blend/app run web

# Cloudflare Pages 部署：在 Pages 项目的环境变量里加同名变量再构建
```

注入后行为：

- 设置页 key 变为「可选」，未填 key 的用户走 Worker 通道（生图 + VLM director 都走）
- 用户自填 key → 直连 `apihub.agnes-ai.com`，不占你的限额
- 未注入该变量时行为与旧版完全一致（必须自填 key）

## 注意事项

- Worker 免费档每天 10 万次请求，远超 Agnes 免费档本身的队列限制，够用
- Worker 只放行 3 个端点（生图/chat/models），其余 403；客户端传什么 Authorization 都会被忽略
- 你的 key 被共享使用，高峰期 503「熔炉过热」会更常见——这是产品预期内的机制
- 想限制滥用可后续在 Worker 加 per-IP 限流（Cloudflare Rate Limiting 规则即可，Dashboard 配置，不用改代码）
