import type { BlendNode, Element, OperatorId, Tree } from "@blend/core";
import { uuid } from "@blend/core";
import { storeBlob } from "./blobs";
import { getStorage } from "./storage";

export interface ShowcaseSpecimen {
  id: string;
  name: string;
  image: string;
  equation: string;
  payoff: string;
  mechanism: string;
  prompt: string;
  operator: OperatorId;
  chaos: number;
  inputs: readonly {
    label: string;
    essence: string;
    image: string;
  }[];
}

export const SHOWCASE_SPECIMENS: readonly ShowcaseSpecimen[] = [
  {
    id: "ringing-years",
    name: "鸣岁藤",
    image: "/samples/semantic-clock-bonsai.jpg",
    equation: "机械的急促 × 植物的缓慢",
    payoff: "每长一圈年轮，就敲响一次。",
    mechanism: "年轮牵动根系擒纵机构，驱动两枚铜铃。时间不再被显示，而是被生长敲响。",
    operator: "auto",
    chaos: 0.82,
    inputs: [
      { label: "闹钟", essence: "催促 / 节律", image: "/samples/alarm-clock.jpg" },
      { label: "盆栽", essence: "生长 / 年轮", image: "/samples/bonsai.jpg" },
    ],
    prompt:
      "A solitary living metronome vine on a mossy stone pedestal, neither clock nor bonsai. Its gnarled silver-barked trunk grows one annual ring at a time; each new ring pulls a root-like escapement that strikes two bronze chime bells. A pale circular rosette records age without numerals. Quiet dawn, tactile macro realism, one legible organism.",
  },
  {
    id: "storm-bloom",
    name: "风暴花",
    image: "/samples/semantic-dandelion-grenade.jpg",
    equation: "爆炸的触发 × 种子的繁衍",
    payoff: "它受到威胁时，会爆种。",
    mechanism: "保险栓变成感知危险的花蕊；触发不是毁灭，而是一场爆发式繁殖。",
    operator: "auto",
    chaos: 0.88,
    inputs: [
      { label: "蒲公英", essence: "飘散 / 繁衍", image: "/samples/dandelion.jpg" },
      { label: "手榴弹", essence: "触发 / 爆发", image: "/samples/grenade.jpg" },
    ],
    prompt:
      "A new defensive plant organism called a storm bloom, neither grenade nor dandelion. A dark metal safety-pin stamen senses threat; when bent, its spherical white seed chambers burst into hundreds of parachute spores, turning detonation into reproduction. Capture the exact suspended instant of release, stark black field, high-speed botanical photography, one clear silhouette.",
  },
  {
    id: "resonance-reef",
    name: "共鸣礁",
    image: "/samples/semantic-jellyfish-piano.jpg",
    equation: "漂浮的脉动 × 和弦的秩序",
    payoff: "洋流拨动它，潮汐开始演奏。",
    mechanism: "水母神经丝成为张紧的琴弦；洋流每次经过，整片活礁都会改变潮水的节律。",
    operator: "auto",
    chaos: 0.84,
    inputs: [
      { label: "水母", essence: "漂浮 / 脉动", image: "/samples/jellyfish.jpg" },
      { label: "钢琴", essence: "张力 / 和弦", image: "/samples/piano.jpg" },
    ],
    prompt:
      "A new deep-sea habitat called a resonance reef, neither piano nor jellyfish. Ocean currents flex a translucent blue bell canopy; its long bioluminescent nerve strings are tensioned across a black mineral soundboard, making the entire reef pulse in ordered chords and reshape the surrounding tide. Wide underwater specimen portrait, cinematic darkness, one coherent living system.",
  },
] as const;

async function fetchAsset(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`案例素材读取失败：${path}`);
  return response.blob();
}

/**
 * 将 Gold benchmark 安装为本地只读来源的完整谱系档案。
 * 结果来自内部基准模型，不伪装为 Agnes 线上生成记录。
 */
export async function installShowcaseArchive(specimen: ShowcaseSpecimen): Promise<Tree> {
  const storage = getStorage();
  const now = Date.now();
  const elements: Element[] = [];
  const inputHashes: string[] = [];

  for (const input of specimen.inputs) {
    const blob = await fetchAsset(input.image);
    const hash = await storeBlob(blob);
    inputHashes.push(hash);
    elements.push({
      id: uuid(),
      imageHash: hash,
      source: "upload",
      createdAt: now,
      meta: { mime: blob.type, label: `${input.label} · ${input.essence}` },
    });
  }

  const outputBlob = await fetchAsset(specimen.image);
  const outputHash = await storeBlob(outputBlob);
  const nodeId = uuid();
  const outputId = uuid();
  const node: BlendNode = {
    id: nodeId,
    recipe: {
      parentNodeIds: [],
      elementIds: elements.map((item) => item.id),
      operator: specimen.operator,
      styleTags: [],
      userPromptExtra: specimen.mechanism,
      chaos: specimen.chaos,
      mode: "forge",
    },
    outputs: [{
      id: outputId,
      imageHash: outputHash,
      executionPlan: [{
        inputHashes,
        prompt: specimen.prompt,
        outputHash,
        providerId: "blend-benchmark",
        modelId: "gold-reference",
      }],
      providerId: "blend-benchmark",
      modelId: "gold-reference",
      finalPrompt: specimen.prompt,
      conceptName: specimen.name,
      conceptEquation: specimen.equation,
    }],
    canonicalOutputId: outputId,
    createdAt: now,
  };
  const tree: Tree = {
    id: uuid(),
    title: `CASE · ${specimen.name}`,
    rootElementIds: elements.map((item) => item.id),
    nodeIds: [nodeId],
    canvasLayout: { [nodeId]: { x: 180, y: 140 } },
    createdAt: now,
    updatedAt: now,
  };

  await storage.putTree(tree);
  await Promise.all(elements.map((item) => storage.putElement(tree.id, item)));
  await storage.putNode(tree.id, node);
  return tree;
}
