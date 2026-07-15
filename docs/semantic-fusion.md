# Semantic fusion: product and model contract

## Product thesis

Blend is not an image compositor. Its payoff is a short causal story:

`A 的某种本质 × B 的某种本质 → 一个看得懂、猜不到的新东西`

“守序 ⇄ 混沌” therefore controls **semantic distance**, not sampling randomness.

| Level | What crosses between inputs | Result contract |
| --- | --- | --- |
| 守序 / 形态 | silhouette, construction, material, anatomy | both sources readable in one second |
| 跃迁 / 功能 | behavior, trigger, rhythm, growth, protection | one source may change category; visible cause-and-effect |
| 混沌 / 意义 | tension, cultural meaning, natural law | result category differs from both sources; visual evidence still traces back to each |

Continuous precision is fake: the UI exposes three deliberate stops.

## BOOM gate

A candidate ships only if it passes all four:

1. **One-second read** — one focal subject and legible silhouette.
2. **Traceable** — visible, causal evidence from every input.
3. **Non-obvious** — not texture transfer, decoration, collage or an A-B hybrid noun.
4. **Imageable** — concrete mechanics that an image model can render.

Weak extra concepts are omitted. One strong card beats two duplicated or padded cards.

## July 15 spike

Test pairs:

- sun × moon — strong natural duality, visually similar discs;
- dandelion × grenade — similar radial silhouette, opposite meanings;
- alarm clock × bonsai — urgency versus slow growth;
- jellyfish × piano — organic pulse versus ordered resonance.

Observed results:

- Original single-stage director: 3/8 requests yielded parseable concepts.
- Low-temperature semantic-distance prompt: 6/8 yielded concepts; order mode improved, but chaos remained mostly literal.
- Hard category-shift prompt: 4/4 yielded at least one concept, but only 1/4 made a partial category leap.
- Two-stage paired reading produced one strong concept, `鸣岁藤`: each annual ring drives a root escapement that strikes bronze bells.
- Per-image parallel reading exceeded 150 seconds and was aborted. It is not production-safe.
- Three real Agnes 2.1 image benchmark calls produced zero images: one hit the 120-second client timeout and two hit the upstream full queue.
- The same three gold briefs were imageable with the built-in benchmark model, confirming that concept quality is viable even though the current public image backend is not dependable enough.

Conclusion: Agnes 2.0 Flash is useful as **eyes and a conservative director**, but is not a reliable high-chaos concept engine. More prompt pressure does not solve the capability and gateway long-tail.

## Recommended architecture

Short term:

1. Keep the single VLM call and fixed low temperature.
2. Treat `守序` and `跃迁` as supported production modes.
3. Mark `混沌` as an experimental semantic leap and accept one candidate when only one passes.
4. Maintain gold briefs for regression tests; score the final image, not just JSON compliance.

Next model iteration:

1. Parallel visual readers produce one compact essence card per source.
2. A stronger text reasoning model combines behaviors/meanings without seeing pixels.
3. A deterministic BOOM gate rejects source-category reuse and missing visual anchors.
4. The image generator receives the concept brief plus original images.

Target latency: semantic planning P95 under 20 seconds. Any architecture missing that gate should fall back to one conservative card rather than block the forge.

## Gold semantic briefs

- `鸣岁藤`: mechanical urgency × slow organic growth → a living metronome vine that rings once per annual ring.
- `风暴花`: threat detonation × seed dispersal → a defensive organism that reproduces when its pin-like stamen is triggered.
- `共鸣礁`: drifting pulse × harmonic order → a living reef whose tensioned nerve strings reshape the tide as they resonate.

The runnable probes live in `spike/test_semantic_director.ts`, `spike/test_two_stage_director.ts`, and `spike/generate_semantic_benchmarks.ts`.

Compressed gold images used by the landing-page benchmark shelf live under `apps/blend/public/samples/semantic-*.jpg`; they are concept targets, not claimed Agnes outputs.
