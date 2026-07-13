#!/usr/bin/env python3
"""S1 矩阵：5 操作符 × 2 模型 × 3 组测试图 = 30 格。

- 输入一律 Data URI base64（顺带验证 PRD 2.2 的 Data URI 可用性）
- 结果落盘 outputs/{model}_{op}_{group}.png，元数据追加进 results.json
- 可重入：已有输出的格子跳过
"""

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agnes_client import generate, save_result, to_data_uri  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "outputs")
RESULTS = os.path.join(HERE, "results.json")
os.makedirs(OUT_DIR, exist_ok=True)

# PRD 1.2 的 prompt 骨架，原样使用
OPERATORS = {
    "fuse": "Seamlessly fuse all subjects into one single coherent new object/creature, blending their key visual features equally.",
    "inject": "Keep the form and silhouette of image 1, but re-render it entirely in the material/texture/style of image 2.",
    "subtract": "Take image 1 and remove/strip away all visual characteristics that resemble image 2.",
    "intersect": "Distill and depict only the visual and conceptual qualities that ALL input images share in common, as a single new image.",
    "absorb": "Image 1 is the dominant host; embed fragments and details of the other images into its surface and structure.",
}

GROUPS = {  # image 1 = 形态/主体承载者, image 2 = 材质/被嵌入方
    "A": ("a1_teapot.png", "a2_typewriter.png"),      # 物体+物体
    "B": ("b1_sneaker.png", "b2_lava.png"),           # 物体+材质
    "C": ("c1_phonebooth.png", "c2_octopus.png"),     # 物体+生物
}

MODELS = {
    "20": {"model": "agnes-image-2.0-flash", "size": "1024x1024", "ratio": None},
    "21": {"model": "agnes-image-2.1-flash", "size": "1K", "ratio": "1:1"},
}

uris = {name: to_data_uri(os.path.join(HERE, "inputs", name))
        for pair in GROUPS.values() for name in pair}

results = []
if os.path.exists(RESULTS):
    results = json.load(open(RESULTS))
done = {r["cell"] for r in results if r.get("ok")}

cells = [(mk, op, gk) for mk in MODELS for op in OPERATORS for gk in GROUPS]
for mk, op, gk in cells:
    cell = "%s_%s_%s" % (mk, op, gk)
    if cell in done:
        print("skip:", cell)
        continue
    m = MODELS[mk]
    img1, img2 = GROUPS[gk]
    r = generate(m["model"], OPERATORS[op], images=[uris[img1], uris[img2]],
                 size=m["size"], ratio=m["ratio"], tag="matrix:" + cell)
    out_path = os.path.join(OUT_DIR, cell + ".png")
    saved = save_result(r, out_path) if r.get("ok") else False
    entry = {"cell": cell, "model": m["model"], "operator": op, "group": gk,
             "inputs": [img1, img2], "prompt": OPERATORS[op],
             "ok": bool(r.get("ok") and saved), "status": r.get("status"),
             "attempts": r.get("attempts"),
             "error": None if r.get("ok") else str(r.get("error"))[:300]}
    results = [x for x in results if x["cell"] != cell] + [entry]
    json.dump(results, open(RESULTS, "w"), ensure_ascii=False, indent=1)
    print(("ok:  " if entry["ok"] else "FAIL:"), cell, r.get("attempts"))
    time.sleep(2)

n_ok = sum(1 for r in results if r["ok"])
print("done: %d/%d ok" % (n_ok, len(cells)))
