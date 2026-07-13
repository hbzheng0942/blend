/**
 * Blend 内置免费通道：Agnes API 反代 Worker。
 * - 真实 key 存在 Worker Secret（AGNES_API_KEY），不进前端 bundle、不进 git
 * - 只放行 blend 用到的三个端点，忽略客户端传来的 Authorization
 * - 处理 CORS，浏览器可直连
 * 部署步骤见 docs/agnes-proxy-setup.md
 */

const UPSTREAM = "https://apihub.agnes-ai.com";

const ALLOWED = new Set([
  "POST /v1/images/generations",
  "POST /v1/chat/completions",
  "GET /v1/models",
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    if (!ALLOWED.has(`${request.method} ${url.pathname}`)) {
      return new Response(JSON.stringify({ error: { message: "endpoint not allowed" } }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const upstream = await fetch(UPSTREAM + url.pathname, {
      method: request.method,
      headers: {
        Authorization: "Bearer " + env.AGNES_API_KEY,
        "Content-Type": "application/json",
      },
      body: request.method === "POST" ? request.body : undefined,
    });

    const headers = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
