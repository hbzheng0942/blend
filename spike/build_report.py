#!/usr/bin/env python3
"""把 results.json 渲染成 docs/spike-matrix.html：30 格对比矩阵（输入列 + 5 操作符 × 2 模型）。

图片以相对路径引用 spike/ 下的文件，HTML 放 docs/，репо 内直接打开即可。
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(os.path.dirname(HERE), "docs")
os.makedirs(DOCS, exist_ok=True)

results = {r["cell"]: r for r in json.load(open(os.path.join(HERE, "results.json")))}

OPERATORS = ["fuse", "inject", "subtract", "intersect", "absorb"]
OP_LABEL = {"fuse": "⊕ fuse 融合", "inject": "→ inject 注入",
            "subtract": "⊖ subtract 相减", "intersect": "∩ intersect 交集",
            "absorb": "⊃ absorb 吞噬"}
GROUPS = {"A": ("物体+物体", "a1_teapot.png", "a2_typewriter.png"),
          "B": ("物体+材质", "b1_sneaker.png", "b2_lava.png"),
          "C": ("物体+生物", "c1_phonebooth.png", "c2_octopus.png")}
MODELS = {"20": "agnes-image-2.0-flash", "21": "agnes-image-2.1-flash"}


def cell_html(mk, op, gk):
    r = results.get("%s_%s_%s" % (mk, op, gk))
    if r and r["ok"]:
        p = "../spike/outputs/%s_%s_%s.png" % (mk, op, gk)
        return '<td><img src="%s" loading="lazy"></td>' % p
    err = (r or {}).get("error") or "not run"
    return '<td class="fail">FAIL<br><small>%s</small></td>' % str(err)[:120]


rows = []
for gk, (label, i1, i2) in GROUPS.items():
    for mk, model in MODELS.items():
        tds = "".join(cell_html(mk, op, gk) for op in OPERATORS)
        rows.append(
            "<tr><th>组%s %s<br><small>%s</small><div class='ins'>"
            "<img src='../spike/inputs/%s'><span>+</span><img src='../spike/inputs/%s'>"
            "</div></th>%s</tr>" % (gk, label, model, i1, i2, tds))

html = """<!doctype html><meta charset="utf-8">
<title>blend spike S1 — 操作符×模型保真度矩阵</title>
<style>
body{font-family:-apple-system,sans-serif;margin:20px;background:#111;color:#eee}
table{border-collapse:collapse}
td,th{border:1px solid #333;padding:6px;text-align:center;vertical-align:top}
th{font-weight:600;font-size:13px;min-width:150px}
td img{width:200px;height:200px;object-fit:cover;border-radius:6px;display:block}
.ins{display:flex;align-items:center;gap:4px;justify-content:center;margin-top:6px}
.ins img{width:64px;height:64px;object-fit:cover;border-radius:4px}
.ins span{font-size:18px}
.fail{color:#f66;font-size:12px;min-width:200px}
small{color:#999}
caption{font-size:18px;font-weight:700;margin-bottom:12px;text-align:left}
</style>
<table><caption>blend · Spike S1：5 操作符 × 2 模型 × 3 组（每格为 2 输入图按操作符 prompt 骨架融合的结果）</caption>
<tr><th>输入组 / 模型</th>%s</tr>
%s</table>
""" % ("".join("<th>%s</th>" % OP_LABEL[o] for o in OPERATORS), "\n".join(rows))

def extra_cell(cell):
    p = os.path.join(HERE, "outputs", cell + ".png")
    if os.path.exists(p):
        return '<td><img src="../spike/outputs/%s.png" loading="lazy"></td>' % cell
    return '<td class="fail">FAIL / not run</td>'


v2rows = []
for mk, model in MODELS.items():
    tds = "".join(extra_cell("%s_injectv2_%s" % (mk, gk)) for gk in GROUPS)
    v2rows.append("<tr><th>%s<br><small>inject v2 强化 prompt</small></th>%s</tr>" % (model, tds))

probe_html = ""
probe_path = os.path.join(HERE, "probe-results.json")
if os.path.exists(probe_path):
    probes = json.load(open(probe_path))
    cells = []
    for e in probes:
        mark = "✅" if e["ok"] else ("❌ " + (e.get("error") or "")[:60])
        cells.append("<tr><td>%s</td><td>%d</td><td>%s</td></tr>"
                     % (e["model"], e["n_images"], mark))
    probe_html = ("<h2>多图张数探测（extra_body.image 上限）</h2>"
                  "<table><tr><th>model</th><th>张数</th><th>结果</th></tr>%s</table>"
                  % "".join(cells))

CREATIVE = [
    ("cr_fuse_piano_jellyfish", "⊕ 三角钢琴 × 深海水母", ["d2_piano.png", "d1_jellyfish.png"]),
    ("cr_fuse_flytrap_origami", "⊕ 捕蝇草 × 折纸鹤", ["d3_venusflytrap.png", "d5_origami.png"]),
    ("cr_fuse3_teapot_octopus_nebula", "⊕×3 茶壶 × 章鱼 × 星云", ["a1_teapot.png", "c2_octopus.png", "d4_nebula.png"]),
    ("cr_inject_piano_jellyfish", "→ 钢琴注入水母质感", ["d2_piano.png", "d1_jellyfish.png"]),
    ("cr_inject_origami_nebula", "→ 折纸鹤注入星云纸", ["d5_origami.png", "d4_nebula.png"]),
    ("cr_absorb_piano_flytrap", "⊃ 钢琴吞噬捕蝇草", ["d2_piano.png", "d3_venusflytrap.png"]),
]
cr_cells = []
for cell, label, ins in CREATIVE:
    ins_html = "<span>+</span>".join(
        "<img src='../spike/inputs/%s'>" % i for i in ins)
    cr_cells.append("<td><div class='ins'>%s</div>%s<br><small>%s</small></td>"
                    % (ins_html, extra_cell(cell).replace("<td>", "").replace("</td>", ""), label))
cr_html = ("<h2>Creative 加测（agnes-image-2.1-flash）</h2>"
           "<table><tr>%s</tr><tr>%s</tr></table>"
           % ("".join(cr_cells[:3]), "".join(cr_cells[3:])))

html += """
<h2>inject 强化 prompt 复测（v2：明确"用 image 2 的材质重造 image 1，禁止场景化"）</h2>
<table><tr><th>模型</th><th>组A 物体+物体</th><th>组B 物体+材质</th><th>组C 物体+生物</th></tr>
%s</table>
%s
%s
""" % ("\n".join(v2rows), cr_html, probe_html)

out = os.path.join(DOCS, "spike-matrix.html")
open(out, "w").write(html)
print("wrote", out)
