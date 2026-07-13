#!/usr/bin/env python3
"""探测 extra_body.image 实际最大张数（1/2/3/5/8 递增），两个模型都测。

用 768px JPEG 缩图做输入，把「张数上限」与「请求体大小上限」解耦。
结果写 probe-results.json，成功样张存 outputs/probe_{model}_{n}.png。
"""

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agnes_client import generate, save_result, to_data_uri  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SMALL = os.path.join(HERE, "inputs_small")
os.makedirs(SMALL, exist_ok=True)
os.makedirs(os.path.join(HERE, "outputs"), exist_ok=True)

# 凑 8 张不同图：6 张原始输入 + 2 张矩阵输出
sources = sorted(
    os.path.join(HERE, "inputs", f) for f in os.listdir(os.path.join(HERE, "inputs"))
    if f.endswith(".png"))
extra = sorted(
    os.path.join(HERE, "outputs", f) for f in os.listdir(os.path.join(HERE, "outputs"))
    if f.startswith("20_fuse") and f.endswith(".png"))[:2]
sources = (sources + extra)[:8]
assert len(sources) == 8, "需要 8 张图，当前 %d" % len(sources)

uris = []
for i, src in enumerate(sources):
    small = os.path.join(SMALL, "p%d.jpg" % i)
    if not os.path.exists(small):
        subprocess.run(["sips", "-Z", "768", "-s", "format", "jpeg",
                        "-s", "formatOptions", "85", src, "--out", small],
                       check=True, capture_output=True)
    uris.append(to_data_uri(small))
print("probe body sizes(KB):", [len(u) // 1024 for u in uris])

PROMPT = ("Combine ALL of the input images into one single surreal composite image "
          "where every input object is clearly visible.")
MODELS = {
    "agnes-image-2.0-flash": {"size": "1024x1024", "ratio": None},
    "agnes-image-2.1-flash": {"size": "1K", "ratio": "1:1"},
}

out = []
for model, cfg in MODELS.items():
    for n in (1, 2, 3, 5, 8):
        r = generate(model, PROMPT, images=uris[:n], size=cfg["size"],
                     ratio=cfg["ratio"], tag="probe:%s:%d" % (model, n))
        saved = False
        if r.get("ok"):
            saved = save_result(r, os.path.join(
                HERE, "outputs", "probe_%s_%d.png" % (model.replace("agnes-image-", "").replace("-flash", ""), n)))
        entry = {"model": model, "n_images": n, "ok": bool(r.get("ok") and saved),
                 "status": r.get("status"), "attempts": r.get("attempts"),
                 "error": None if r.get("ok") else str(r.get("error"))[:300]}
        out.append(entry)
        print(entry)
        json.dump(out, open(os.path.join(HERE, "probe-results.json"), "w"),
                  ensure_ascii=False, indent=1)
