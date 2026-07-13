#!/usr/bin/env python3
"""inject 操作符强化 prompt 变体复测：v1 骨架失效（模型把 image2 当场景），试更强的措辞。"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agnes_client import generate, save_result, to_data_uri  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

V2_PROMPT = (
    "Recreate the object from image 1 as if it were physically manufactured out of "
    "the material shown in image 2. Keep the exact shape, proportions and silhouette "
    "of image 1's object, but its entire surface must be made of image 2's material "
    "with its color, texture and finish. Plain studio background. Do not place the "
    "object inside a scene or landscape."
)

GROUPS = {"A": ("a1_teapot.png", "a2_typewriter.png"),
          "B": ("b1_sneaker.png", "b2_lava.png"),
          "C": ("c1_phonebooth.png", "c2_octopus.png")}
MODELS = {"20": {"model": "agnes-image-2.0-flash", "size": "1024x1024", "ratio": None},
          "21": {"model": "agnes-image-2.1-flash", "size": "1K", "ratio": "1:1"}}

uris = {n: to_data_uri(os.path.join(HERE, "inputs", n))
        for pair in GROUPS.values() for n in pair}

out = []
for mk, m in MODELS.items():
    for gk, (i1, i2) in GROUPS.items():
        cell = "%s_injectv2_%s" % (mk, gk)
        path = os.path.join(HERE, "outputs", cell + ".png")
        if os.path.exists(path):
            print("skip:", cell)
            continue
        r = generate(m["model"], V2_PROMPT, images=[uris[i1], uris[i2]],
                     size=m["size"], ratio=m["ratio"], tag="injectv2:" + cell)
        saved = save_result(r, path) if r.get("ok") else False
        entry = {"cell": cell, "ok": bool(saved), "status": r.get("status"),
                 "error": None if r.get("ok") else str(r.get("error"))[:200]}
        out.append(entry)
        print(entry)
json.dump(out, open(os.path.join(HERE, "injectv2-results.json"), "w"), indent=1)
