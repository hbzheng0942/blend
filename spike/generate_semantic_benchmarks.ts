import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createAgnesProvider } from "../packages/providers/src/agnes";

const PROXY = "https://blend-agnes-proxy.782890529.workers.dev";
const ORIGIN = "https://blend-bnf.pages.dev";
const OUTPUT_DIR = "spike/semantic-outputs";

const cases = [
  {
    id: "clock-bonsai-ringing-years",
    files: ["apps/blend/public/samples/alarm-clock.jpg", "apps/blend/public/samples/bonsai.jpg"],
    prompt:
      "A solitary living metronome vine on a mossy stone pedestal, neither clock nor bonsai. Its gnarled silver-barked trunk grows one annual ring at a time; each new ring pulls a root-like escapement that strikes two bronze chime bells. A pale circular rosette records age without numerals. Quiet dawn, tactile macro realism, one legible organism.",
  },
  {
    id: "dandelion-grenade-threat-bloom",
    files: ["apps/blend/public/samples/dandelion.jpg", "apps/blend/public/samples/grenade.jpg"],
    prompt:
      "A new defensive plant organism called a storm bloom, neither grenade nor dandelion. A dark metal safety-pin stamen senses threat; when bent, its spherical white seed chambers burst into hundreds of parachute spores, turning detonation into reproduction. Capture the exact suspended instant of release, stark black field, high-speed botanical photography, one clear silhouette.",
  },
  {
    id: "jellyfish-piano-tidal-reef",
    files: ["spike/inputs/d1_jellyfish.png", "spike/inputs/d2_piano.png"],
    prompt:
      "A new deep-sea habitat called a resonance reef, neither piano nor jellyfish. Ocean currents flex a translucent blue bell canopy; its long bioluminescent nerve strings are tensioned across a black mineral soundboard, making the entire reef pulse in ordered chords and reshape the surrounding tide. Wide underwater specimen portrait, cinematic darkness, one coherent living system.",
  },
] as const;

const fetchWithOrigin: typeof fetch = (input, init = {}) =>
  fetch(input, {
    ...init,
    headers: { ...Object.fromEntries(new Headers(init.headers).entries()), Origin: ORIGIN },
  });

const provider = createAgnesProvider({
  apiKey: "public-worker",
  baseUrl: PROXY,
  modelId: "agnes-image-2.1-flash",
  fetchImpl: fetchWithOrigin,
});

async function asDataUri(path: string) {
  const mime = path.endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${(await readFile(path)).toString("base64")}`;
}

async function saveImage(id: string, image: string) {
  const bytes = image.startsWith("data:")
    ? Buffer.from(image.split(",", 2)[1]!, "base64")
    : Buffer.from(await (await fetch(image)).arrayBuffer());
  const path = `${OUTPUT_DIR}/${id}.png`;
  await writeFile(path, bytes);
  return path;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const results = await Promise.allSettled(cases.map(async (item, index) => {
    const images = await Promise.all(item.files.map(asDataUri));
    const startedAt = Date.now();
    const result = await provider.generate({
      prompt: item.prompt,
      images,
      seed: 731_000 + index * 997,
      signal: AbortSignal.timeout(120_000),
    });
    return {
      id: item.id,
      path: await saveImage(item.id, result.image),
      elapsedMs: Date.now() - startedAt,
    };
  }));
  console.log(JSON.stringify(results.map((result, index) => result.status === "fulfilled"
    ? { status: result.status, ...result.value }
    : { status: result.status, id: cases[index]!.id, error: String(result.reason) }), null, 2));
}

void main();
