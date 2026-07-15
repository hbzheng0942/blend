# 内置免费通道：Agnes 反代 Worker 部署操作（给 HB）

> 目的：web 端默认无需用户填 key——前端打到你自部署的 Cloudflare Worker，
> 你的 Agnes key 以 Secret 形式只存在 Worker 端，不进 bundle、不进 git。
> 用户如果自填了 key 则直连 Agnes 官方，不走此通道。

## 一次性部署

限流 binding 必须随 Wrangler 配置部署，不能只在 Dashboard 粘贴脚本：

1. `cd worker`
2. `npx wrangler@latest login`
3. `npx wrangler@latest secret put AGNES_API_KEY`
4. 如有自定义域名，在 `wrangler.jsonc` 增加 vars：
   `"vars": { "ALLOWED_ORIGINS": "https://blend-bnf.pages.dev,https://你的域名" }`
5. `npx wrangler@latest deploy`
6. 记下 Worker 地址并验证（应返回模型列表）：
   ```bash
   curl https://blend-agnes-proxy.<你的子域>.workers.dev/v1/models
   ```

`wrangler.jsonc` 已配置两级限流：每 IP 每分钟最多 6 次生图、30 次导演/模型请求。
Cloudflare 的计数按边缘节点最终一致，适合防滥用，不作为精确计费。

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

- Worker 只放行 3 个端点，并对模型、参数、图片类型、图片数量和 12 MB 请求体做白名单校验
- POST 必须来自允许的浏览器 Origin；CORS 不再使用 `*`，客户端 Authorization 始终被忽略
- 生图最多 6 张输入图，仅接受 PNG/JPEG/WebP Data URI；上游请求由 Worker 重建，未知字段不会透传
- Rate Limiter binding 缺失时 POST 会 fail closed，返回 503，不会退回无限制公开代理
- 你的 key 被共享使用，高峰期 503「熔炉过热」会更常见——这是产品预期内的机制
- Origin 可伪造，因此真正的成本护栏是限流和请求白名单；若未来流量放大，再加 Turnstile/登录态配额
