#!/usr/bin/env python3
"""Agnes image API 最小客户端（Phase 0 spike 专用，零依赖）。

- key 从环境变量 AGNES_API_KEY 读取
- POST {base}/v1/images/generations，OpenAI 兼容
- 多图走 extra_body.image[]（Data URI base64），response_format 放 extra_body 内
- 429 指数退避重试（2s/8s/30s），所有调用记录到 calls.jsonl 供限流分析
"""

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = (os.environ.get("AGNES_BASE_URL") or "https://apihub.agnes-ai.com").rstrip("/")
KEY = os.environ.get("AGNES_API_KEY", "").strip()
LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "calls.jsonl")
RETRY_DELAYS = (2, 8, 30)


def _log(entry):
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def to_data_uri(path):
    ext = os.path.splitext(path)[1].lower().lstrip(".") or "png"
    mime = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png", "webp": "webp"}.get(ext, "png")
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    return "data:image/%s;base64,%s" % (mime, b64)


def _post_once(body, timeout):
    req = urllib.request.Request(
        BASE + "/v1/images/generations",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read(), time.time() - t0
    except urllib.error.HTTPError as e:
        return e.code, e.read(), time.time() - t0


def generate(model, prompt, images=None, size=None, ratio=None,
             response_format="b64_json", timeout=180, tag=""):
    """返回 {ok, status, elapsed, attempts, data|error}。"""
    if not KEY:
        raise RuntimeError("AGNES_API_KEY 未设置")
    body = {"model": model, "prompt": prompt,
            "extra_body": {"response_format": response_format}}
    if size:
        body["size"] = size
    if ratio:
        body["ratio"] = ratio
    if images:
        body["extra_body"]["image"] = list(images)

    attempts = []
    for i in range(len(RETRY_DELAYS) + 1):
        try:
            status, raw, elapsed = _post_once(body, timeout)
        except Exception as e:  # 网络层异常也按可重试处理
            status, raw, elapsed = -1, str(e).encode(), 0.0
        attempts.append({"status": status, "elapsed": round(elapsed, 1)})
        _log({"ts": time.time(), "tag": tag, "model": model,
              "n_images": len(images or []), "status": status,
              "elapsed": round(elapsed, 1), "attempt": i})
        if status == 200:
            try:
                parsed = json.loads(raw.decode("utf-8"))
            except Exception:
                return {"ok": False, "status": status, "attempts": attempts,
                        "error": "non-JSON response: " + raw[:300].decode("utf-8", "replace")}
            return {"ok": True, "status": status, "attempts": attempts, "data": parsed}
        if status in (429, 500, 502, 503, -1) and i < len(RETRY_DELAYS):
            time.sleep(RETRY_DELAYS[i])
            continue
        return {"ok": False, "status": status, "attempts": attempts,
                "error": raw[:800].decode("utf-8", "replace") if isinstance(raw, bytes) else str(raw)}
    return {"ok": False, "status": status, "attempts": attempts, "error": "exhausted retries"}


def save_result(result, out_path):
    """把 generate() 的成功结果落盘为图片文件，返回 True/False。"""
    if not result.get("ok"):
        return False
    d = (result["data"].get("data") or [{}])[0]
    if d.get("b64_json"):
        with open(out_path, "wb") as f:
            f.write(base64.b64decode(d["b64_json"]))
        return True
    if d.get("url"):
        req = urllib.request.Request(d["url"], headers={"User-Agent": "blend-spike"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            with open(out_path, "wb") as f:
                f.write(resp.read())
        return True
    return False


if __name__ == "__main__":
    # 连通性自检：一次最小 t2i
    r = generate("agnes-image-2.0-flash", "a single red apple on a white table, photo",
                 size="1024x1024", tag="smoke")
    print(json.dumps({k: v for k, v in r.items() if k != "data"}, ensure_ascii=False))
    if r.get("ok"):
        ok = save_result(r, os.path.join(os.path.dirname(LOG_PATH), "smoke.png"))
        print("saved:", ok)
    sys.exit(0 if r.get("ok") else 1)
