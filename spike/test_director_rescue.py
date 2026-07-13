#!/usr/bin/env python3
"""Director 翻案验证：subtract/intersect 由 agnes-2.0-flash 出显式 prompt 后能否图像达标。

每操作符测两种执行方式：
- txt:  director prompt 纯文生图（不给输入图，避免模型被拉回拼贴）
- img:  director prompt + 输入图
"""

import base64
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agnes_client import generate, save_result, to_data_uri  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "https://apihub.agnes-ai.com"
KEY = os.environ["AGNES_API_KEY"]
IMG_MODEL = "agnes-image-2.1-flash"

SYSTEM = """You are a visionary creature/object designer for an image-fusion art tool. \
You are given input images and a fusion intent. Design 1 fusion concept.
Rules:
- Make deliberate design choices; be surprising. Avoid literal collage.
- The concept gets a short evocative NAME (2-4 words, English).
- The "prompt" field must be a self-contained English image-generation prompt (40-80 words), \
concrete and visual, describing the SINGLE subject, its materials, lighting and background. \
It must not reference "image 1/2".
Output STRICT JSON only: {"concepts":[{"name":"...","prompt":"..."}]}"""

INTENTS = {
    "subtract": (
        "SUBTRACT: depict the first subject with every visual quality of the other subject(s) "
        "explicitly stripped away or inverted. Describe what remains, concretely."
    ),
    "intersect": (
        "INTERSECT: depict ONLY the visual and conceptual qualities that ALL inputs share. "
        "Distill their common essence into one brand-new subject that is none of the originals."
    ),
}

CASES = {
    # subtract：从熔岩鞋里减去熔岩感（spike 原图对）
    "subtract": ["inputs/b1_sneaker.png", "inputs/b2_lava.png"],
    # intersect：三图共性蒸馏
    "intersect": ["inputs/d1_jellyfish.png", "inputs/d4_nebula.png", "inputs/d5_origami.png"],
}


def director(op, image_paths):
    content = [{"type": "text", "text": f"Fusion intent: {INTENTS[op]}\nDesign 1 concept."}]
    for p in image_paths:
        content.append({"type": "image_url", "image_url": {"url": to_data_uri(os.path.join(HERE, p))}})
    body = {
        "model": "agnes-2.0-flash",
        "temperature": 1.0,
        "max_tokens": 500,
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": content}],
    }
    req = urllib.request.Request(
        BASE + "/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        d = json.loads(r.read())
    txt = d["choices"][0]["message"]["content"].strip()
    if txt.startswith("```"):
        txt = txt.split("\n", 1)[1].rsplit("```", 1)[0]
    if not txt.startswith("{"):
        txt = txt[txt.index("{"): txt.rindex("}") + 1]
    return json.loads(txt)["concepts"][0]


results = []
for op, paths in CASES.items():
    print(f"=== {op} director ===", flush=True)
    c = director(op, paths)
    print(f"【{c['name']}】\n{c['prompt']}\n", flush=True)
    for mode in ("txt", "img"):
        cell = f"rescue_{op}_{mode}"
        images = [to_data_uri(os.path.join(HERE, p)) for p in paths] if mode == "img" else None
        t0 = time.time()
        r = generate(IMG_MODEL, c["prompt"], images=images, size="1K", ratio="1:1", tag=cell)
        ok = r.get("ok")
        print(f"{cell}: ok={ok} {time.time()-t0:.0f}s", flush=True)
        if ok:
            save_result(r, os.path.join(HERE, "outputs", cell + ".png"))
        results.append({"cell": cell, "ok": ok, "name": c["name"], "prompt": c["prompt"]})

json.dump(results, open(os.path.join(HERE, "rescue-results.json"), "w"), ensure_ascii=False, indent=1)
print("done")
