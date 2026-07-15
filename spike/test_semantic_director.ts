import { readFile } from "node:fs/promises";
import { createAgnesDirector } from "../packages/providers/src/director";

const PROXY = "https://blend-agnes-proxy.782890529.workers.dev";
const ORIGIN = "https://blend-bnf.pages.dev";

const pairs = [
  {
    id: "sol-luna",
    label: "太阳 × 月亮",
    files: ["apps/blend/public/samples/sun.jpg", "apps/blend/public/samples/moon.jpg"],
  },
  {
    id: "dandelion-grenade",
    label: "蒲公英 × 手雷",
    files: ["apps/blend/public/samples/dandelion.jpg", "apps/blend/public/samples/grenade.jpg"],
  },
  {
    id: "clock-bonsai",
    label: "闹钟 × 盆景",
    files: ["apps/blend/public/samples/alarm-clock.jpg", "apps/blend/public/samples/bonsai.jpg"],
  },
  {
    id: "jellyfish-piano",
    label: "水母 × 钢琴",
    files: ["spike/inputs/d1_jellyfish.png", "spike/inputs/d2_piano.png"],
  },
] as const;

const fetchWithOrigin: typeof fetch = (input, init = {}) =>
  fetch(input, {
    ...init,
    headers: { ...Object.fromEntries(new Headers(init.headers).entries()), Origin: ORIGIN },
  });

const director = createAgnesDirector({
  apiKey: "public-worker",
  baseUrl: PROXY,
  fetchImpl: fetchWithOrigin,
});

async function asDataUri(path: string) {
  const mime = path.endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${(await readFile(path)).toString("base64")}`;
}

const requestedRegister = process.env.REGISTER;
const cases = pairs.flatMap((pair) => [
  { ...pair, register: "order", chaos: 0.15 },
  { ...pair, register: "chaos", chaos: 0.85 },
]).filter(({ register }) => !requestedRegister || register === requestedRegister);

async function main() {
  const results = await Promise.all(
    cases.map(async ({ id, label, files, register, chaos }) => {
      const startedAt = Date.now();
      const images = await Promise.all(files.map(asDataUri));
      const concepts = await director.direct({
        operator: "auto",
        images,
        styleFragments: [],
        count: 2,
        chaos,
      });
      return {
        id,
        label,
        register,
        chaos,
        elapsedMs: Date.now() - startedAt,
        concepts,
      };
    }),
  );

  console.log(JSON.stringify(results, null, 2));
}

void main();
