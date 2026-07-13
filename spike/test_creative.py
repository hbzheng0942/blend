#!/usr/bin/env python3
"""Creative blend 测试：更奇特的物体组合 + 三图融合，全部跑 2.1（矩阵验证的优胜模型）。"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agnes_client import generate, save_result, to_data_uri  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = "agnes-image-2.1-flash"

# --- 1. 生成奇特输入图 ---
NEW_INPUTS = {
    "d1_jellyfish.png": "A bioluminescent deep-sea jellyfish glowing translucent blue and violet, drifting against a pure black background, studio-quality photo, centered.",
    "d2_piano.png": "A glossy black concert grand piano with the lid open, product photography on plain light gray background, centered.",
    "d3_venusflytrap.png": "A vivid green venus flytrap plant with several open spiky traps in a small terracotta pot, studio photo, plain white background, centered.",
    "d4_nebula.png": "A colorful outer-space nebula with swirling magenta, teal and gold gas clouds and dense star fields, deep space astrophotography, full frame.",
    "d5_origami.png": "A single elegant white origami paper crane, crisp folds, studio product photo on plain light background, centered.",
}

FUSE = ("Seamlessly fuse all subjects into one single coherent new object/creature, "
        "blending their key visual features equally.")
INJECT_V2 = ("Recreate the object from image 1 as if it were physically manufactured out of "
             "the material shown in image 2. Keep the exact shape, proportions and silhouette "
             "of image 1's object, but its entire surface must be made of image 2's material "
             "with its color, texture and finish. Plain studio background. Do not place the "
             "object inside a scene or landscape.")
ABSORB = ("Image 1 is the dominant host. Keep its overall form and identity, but show it "
          "visibly absorbing fragments and elements of the other image's subject into its "
          "surface and structure.")

# --- 2. creative 组合 ---
CELLS = [
    ("cr_fuse_piano_jellyfish", FUSE, ["d2_piano.png", "d1_jellyfish.png"]),
    ("cr_fuse_flytrap_origami", FUSE, ["d3_venusflytrap.png", "d5_origami.png"]),
    ("cr_fuse3_teapot_octopus_nebula", FUSE, ["a1_teapot.png", "c2_octopus.png", "d4_nebula.png"]),
    ("cr_inject_piano_jellyfish", INJECT_V2, ["d2_piano.png", "d1_jellyfish.png"]),
    ("cr_inject_origami_nebula", INJECT_V2, ["d5_origami.png", "d4_nebula.png"]),
    ("cr_absorb_piano_flytrap", ABSORB, ["d2_piano.png", "d3_venusflytrap.png"]),
]

results = []

for name, prompt in NEW_INPUTS.items():
    path = os.path.join(HERE, "inputs", name)
    if os.path.exists(path):
        print("skip input:", name)
        continue
    r = generate(MODEL, prompt, images=None, size="1K", ratio="1:1", tag="creative-input:" + name)
    saved = save_result(r, path) if r.get("ok") else False
    print({"input": name, "ok": bool(saved)})
    if not saved:
        results.append({"cell": "input:" + name, "ok": False, "error": str(r.get("error"))[:200]})

for cell, prompt, imgs in CELLS:
    out = os.path.join(HERE, "outputs", cell + ".png")
    if os.path.exists(out):
        print("skip:", cell)
        continue
    missing = [i for i in imgs if not os.path.exists(os.path.join(HERE, "inputs", i))]
    if missing:
        results.append({"cell": cell, "ok": False, "error": "missing inputs: %s" % missing})
        continue
    uris = [to_data_uri(os.path.join(HERE, "inputs", i)) for i in imgs]
    r = generate(MODEL, prompt, images=uris, size="1K", ratio="1:1", tag="creative:" + cell)
    saved = save_result(r, out) if r.get("ok") else False
    entry = {"cell": cell, "ok": bool(saved), "status": r.get("status"),
             "error": None if r.get("ok") else str(r.get("error"))[:200]}
    results.append(entry)
    print(entry)

json.dump(results, open(os.path.join(HERE, "creative-results.json"), "w"), indent=1)
print("creative done")
