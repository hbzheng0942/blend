#!/usr/bin/env python3
"""生成 spike 用 3 组测试输入图（物体+物体 / 物体+材质 / 物体+生物），t2i 落盘到 inputs/。"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agnes_client import generate, save_result  # noqa: E402

INPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inputs")
os.makedirs(INPUT_DIR, exist_ok=True)

INPUTS = {
    # 组 A：物体 + 物体
    "a1_teapot": "a glossy ceramic teapot, product photography, centered, plain light gray background",
    "a2_typewriter": "a vintage mechanical typewriter, product photography, centered, plain light gray background",
    # 组 B：物体 + 材质
    "b1_sneaker": "a classic white high-top sneaker, product photography, centered, plain light gray background",
    "b2_lava": "close-up texture of glowing molten lava with dark cooled crust, fills the entire frame",
    # 组 C：物体 + 生物
    "c1_phonebooth": "a classic red british telephone booth, full view, photography, plain light gray background",
    "c2_octopus": "an orange octopus, full body with tentacles visible, photography, plain light gray background",
}

failed = []
for name, prompt in INPUTS.items():
    out = os.path.join(INPUT_DIR, name + ".png")
    if os.path.exists(out):
        print("skip (exists):", name)
        continue
    r = generate("agnes-image-2.0-flash", prompt, size="1024x1024", tag="input:" + name)
    if r.get("ok") and save_result(r, out):
        print("ok:", name, r["attempts"])
    else:
        print("FAIL:", name, r.get("status"), str(r.get("error"))[:200])
        failed.append(name)

sys.exit(1 if failed else 0)
