import { readFile } from "node:fs/promises";
import {
  buildDirectorSystemPrompt,
  parseDirectorConcepts,
  parseDirectorSketch,
} from "../packages/core/src";

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
] as const;

async function asDataUri(path: string) {
  const mime = path.endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${(await readFile(path)).toString("base64")}`;
}

async function call(system: string, text: string, images: string[] = []) {
  const response = await fetch(`${PROXY}/v1/chat/completions`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "agnes-2.0-flash",
      temperature: 0.35,
      enable_thinking: false,
      max_tokens: 1_000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text },
            ...images.map((url) => ({ type: "image_url", image_url: { url } })),
          ],
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
  };
  const message = payload.choices?.[0]?.message;
  return message?.content || message?.reasoning_content || "";
}

function parseObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function main() {
  const readings = await Promise.all(pairs.map(async (pair) => {
    const images = await Promise.all(pair.files.map(asDataUri));
    const rawCards = await Promise.all(images.map((image) => call(
      "You are a visual-semantic annotator, not a designer. Return one compact JSON object immediately. " +
      "Identify the literal subject, exactly two concrete visible anchors, its characteristic behavior/function, " +
      "and its broader human or natural meaning. All fields must be specific and non-empty. Do not propose a fusion. " +
      'Output only {"subject":"literal noun","anchors":["visible feature","visible feature"],"behavior":"verb phrase","meaning":"short phrase"}. Replace every schema hint with observations.',
      "Read this single input.",
      [image],
    )));
    const cards = rawCards.map(parseObject);
    return {
      ...pair,
      reading: cards.every(Boolean) ? { inputs: cards } : null,
      readingRaw: rawCards,
    };
  }));

  const results = await Promise.all(readings.map(async ({ id, label, reading, readingRaw }) => {
    if (!reading) return {
      id,
      label,
      reading: null,
      readingRaw: readingRaw.map((raw) => raw.slice(0, 800)),
      concepts: null,
    };
    const raw = await call(
      buildDirectorSystemPrompt(2, 0.85),
      "These are the source essence cards. Infer their strongest tension. Create concepts from their behaviors " +
      "and meanings first; " +
      "use the anchors only as the final visual leash. The final subject category must differ from both sources.\n" +
      JSON.stringify(reading),
    );
    const concepts = parseDirectorConcepts(raw) ?? parseDirectorSketch(raw);
    return { id, label, reading, concepts, synthesisRaw: concepts ? undefined : raw.slice(0, 1_200) };
  }));

  console.log(JSON.stringify(results, null, 2));
}

void main();
