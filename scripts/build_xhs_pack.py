"""Build the lightweight Xiaohongshu launch carousel from real Blend benchmark assets."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "apps/blend/public/samples"
OUT = ROOT / "social/xhs"
W, H = 1080, 1440
BG, WHITE, DIM, FAINT = "#030303", "#f3f3f0", "#a0a0a0", "#4a4a4a"
ZH = "/System/Library/Fonts/Hiragino Sans GB.ttc"
MONO = "/System/Library/Fonts/Menlo.ttc"

CASES = [
    {
        "index": "01", "name": "鸣岁藤", "a": "闹钟", "b": "盆栽",
        "a_img": "alarm-clock.jpg", "b_img": "bonsai.jpg", "out": "semantic-clock-bonsai.jpg",
        "equation": "机械的急促 × 植物的缓慢", "payoff": "每长一圈年轮，就敲响一次。",
    },
    {
        "index": "02", "name": "风暴花", "a": "手榴弹", "b": "蒲公英",
        "a_img": "grenade.jpg", "b_img": "dandelion.jpg", "out": "semantic-dandelion-grenade.jpg",
        "equation": "爆炸的触发 × 种子的繁衍", "payoff": "它受到威胁时，会爆种。",
    },
    {
        "index": "03", "name": "共鸣礁", "a": "水母", "b": "钢琴",
        "a_img": "jellyfish.jpg", "b_img": "piano.jpg", "out": "semantic-jellyfish-piano.jpg",
        "equation": "漂浮的脉动 × 和弦的秩序", "payoff": "洋流拨动它，潮汐开始演奏。",
    },
]


def font(size, mono=False):
    return ImageFont.truetype(MONO if mono else ZH, size=size)


def canvas():
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)
    for y in range(0, H, 8):
        draw.line((0, y, W, y), fill="#090909", width=1)
    for x in range(790, W, 18):
        for y in range(40, 280, 18):
            draw.rectangle((x, y, x + 5, y + 5), fill="#202020")
    return image, draw


def paste_contain(dst, path, box, pad=12):
    x, y, w, h = box
    art = Image.open(path).convert("RGB")
    art.thumbnail((w - pad * 2, h - pad * 2), Image.Resampling.LANCZOS)
    frame = Image.new("RGB", (w, h), "#050505")
    frame.paste(art, ((w - art.width) // 2, (h - art.height) // 2))
    dst.paste(frame, (x, y))
    ImageDraw.Draw(dst).rectangle((x, y, x + w - 1, y + h - 1), outline="#666666", width=2)


def label(draw, text, xy, size=22, color=DIM, mono=True):
    # Menlo lacks CJK glyphs; keep Latin metadata mono and route Chinese labels to Hiragino.
    draw.text(xy, text, font=font(size, mono and text.isascii()), fill=color)


def save(image, name):
    OUT.mkdir(parents=True, exist_ok=True)
    image.save(OUT / name, "JPEG", quality=88, optimize=True, progressive=True, subsampling="4:2:0")


def build_cover():
    image, draw = canvas()
    label(draw, "BLEND / OPEN CONCEPT FOUNDRY", (72, 64), 20, DIM)
    draw.text((72, 130), "把不相干的东西，", font=font(64), fill=WHITE)
    draw.text((72, 214), "炼成一个新物种。", font=font(64), fill=WHITE)
    draw.text((76, 310), "A + B 不是贴皮。它会先理解，再突变。", font=font(28), fill=DIM)

    cards = [(68, 420, 290, 560), (395, 460, 290, 560), (722, 400, 290, 560)]
    for case, box in zip(CASES, cards):
        paste_contain(image, SAMPLES / case["out"], box, pad=8)
        x, y, w, h = box
        draw.rectangle((x + 12, y + 12, x + 58, y + 48), fill=WHITE)
        draw.text((x + 22, y + 16), case["index"], font=font(16, True), fill=BG)
        draw.rectangle((x + 12, y + h - 52, x + w - 12, y + h - 12), fill="#050505")
        draw.text((x + 24, y + h - 47), case["name"], font=font(24), fill=WHITE)

    draw.line((72, 1050, 1008, 1050), fill="#555555", width=2)
    draw.text((72, 1104), "闹钟 + 盆栽 → 鸣岁藤", font=font(31), fill=WHITE)
    draw.text((72, 1164), "蒲公英 + 手榴弹 → 风暴花", font=font(31), fill=WHITE)
    draw.text((72, 1224), "水母 + 钢琴 → 共鸣礁", font=font(31), fill=WHITE)
    label(draw, "OPEN SOURCE · blend-bnf.pages.dev", (72, 1350), 21, DIM)
    save(image, "00-cover.jpg")


def build_case(case):
    image, draw = canvas()
    label(draw, f"CASE {case['index']} / GOLD SEMANTIC LEAP", (64, 60), 19, DIM)
    draw.text((64, 118), f"{case['a']}  +  {case['b']}", font=font(58), fill=WHITE)
    draw.text((66, 205), "= ?", font=font(34, True), fill=DIM)

    paste_contain(image, SAMPLES / case["a_img"], (64, 292, 218, 218), pad=10)
    draw.text((302, 370), "+", font=font(44, True), fill=DIM)
    paste_contain(image, SAMPLES / case["b_img"], (362, 292, 218, 218), pad=10)
    draw.text((605, 370), "→", font=font(44, True), fill=WHITE)
    label(draw, f"A / {case['a']}", (68, 526), 17, DIM)
    label(draw, f"B / {case['b']}", (366, 526), 17, DIM)

    paste_contain(image, SAMPLES / case["out"], (64, 590, 952, 590), pad=12)
    draw.rectangle((84, 610, 350, 658), fill=WHITE)
    draw.text((102, 618), f"C / {case['name']}", font=font(23), fill=BG)
    draw.rectangle((82, 1100, 998, 1162), fill="#050505")
    draw.text((102, 1114), case["equation"], font=font(26), fill=WHITE)

    draw.text((64, 1226), case["payoff"], font=font(39), fill=WHITE)
    label(draw, "真实输入 · 真实模型生成 · GOLD BENCHMARK", (66, 1310), 17, DIM)
    label(draw, "BLEND™  /  blend-bnf.pages.dev", (66, 1360), 18, FAINT)
    save(image, f"{case['index']}-{case['name']}.jpg")


def build_cta():
    image, draw = canvas()
    label(draw, "HOW IT GROWS / 操作谱系", (64, 62), 19, DIM)
    draw.text((64, 126), "不是一次性生图。", font=font(58), fill=WHITE)
    draw.text((64, 210), "是持续生长的血统。", font=font(58), fill=WHITE)

    centers = [(160, 420), (430, 420), (745, 420), (745, 780)]
    labels = ["投入 A", "投入 B", "第一次异变", "继续喂养 C+D+E"]
    for index, ((x, y), text) in enumerate(zip(centers, labels)):
        w, h = (190, 190) if index < 2 else (260, 260)
        draw.rectangle((x, y, x + w, y + h), outline="#777777", width=2)
        if index < 2:
            src = CASES[0]["a_img"] if index == 0 else CASES[0]["b_img"]
        else:
            src = CASES[index - 2]["out"]
        paste_contain(image, SAMPLES / src, (x + 6, y + 6, w - 12, h - 12), pad=4)
        draw.text((x, y + h + 18), text, font=font(21), fill=DIM)
    draw.text((372, 478), "+", font=font(42, True), fill=WHITE)
    draw.line((635, 514, 726, 514), fill=WHITE, width=5)
    draw.polygon([(726, 514), (706, 502), (706, 526)], fill=WHITE)
    draw.line((875, 690, 875, 766), fill=WHITE, width=5)
    draw.polygon([(875, 766), (863, 746), (887, 746)], fill=WHITE)

    draw.line((64, 1120, 1016, 1120), fill="#555555", width=2)
    draw.text((64, 1170), "点开案例看完整谱系，", font=font(39), fill=WHITE)
    draw.text((64, 1230), "或者拿同一组原料重炼一次。", font=font(39), fill=WHITE)
    label(draw, "试玩  blend-bnf.pages.dev", (64, 1340), 21, DIM)
    label(draw, "源码  github.com/hbzheng0942/blend", (64, 1380), 18, FAINT)
    save(image, "04-lineage-cta.jpg")


if __name__ == "__main__":
    build_cover()
    for item in CASES:
        build_case(item)
    build_cta()
    for path in sorted(OUT.glob("*.jpg")):
        print(path.relative_to(ROOT), path.stat().st_size)
