import { CHAPTERS } from "./game/constants";
import { chunksForChapter } from "./game/chunks";
import {
  interactiveAssetPath,
  INTERACTIVE_ART,
  type InteractiveAssetKind,
} from "./game/interactive-art";
import type { ChunkDefinition, HazardKind } from "./game/types";
import "./test-ground.css";

const FRIENDLY_ASSET_NAMES: Partial<Record<InteractiveAssetKind, string>> = {
  platform: "Floating platform",
  pillar: "Gate pillar",
  thorn: "Terrain spikes",
  barb: "Heavy spikes",
  sandjet: "Sand plume",
  "sandjet-nozzle": "Sand nozzle",
  "flame-warning": "Flame warning",
};

function labelFromId(value: string): string {
  return value
    .replace(/^(nursery|jungle|clock|marble|crooked|corruption|minecart|midnight|underworld)-/, "")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function assetLabel(asset: InteractiveAssetKind): string {
  return FRIENDLY_ASSET_NAMES[asset] ?? labelFromId(asset);
}

function terrainLabel(chunk: ChunkDefinition): string {
  if (!chunk.tunnel) return "Flat corridor";
  const offsets = chunk.tunnel.map((point) => point.y);
  return Math.min(...offsets) < 0 && Math.max(...offsets) > 0 ? "Wave corridor" : "Sloped corridor";
}

function hazardKindForAsset(chapter: number, asset: InteractiveAssetKind): HazardKind | undefined {
  if (asset === "sandjet-nozzle") return "sandJet";
  if (asset === "flame-warning") return "flame";
  const hazards = INTERACTIVE_ART[chapter]?.hazards;
  if (!hazards) return undefined;
  return (Object.entries(hazards) as Array<[HazardKind, InteractiveAssetKind]>).find(([, value]) => value === asset)?.[0];
}

function chunkForAsset(chapter: number, asset: InteractiveAssetKind): ChunkDefinition | undefined {
  const chunks = chunksForChapter(chapter);
  if (asset === "platform") return chunks.find((chunk) => chunk.solids.some((solid) => solid.detail === "perch"));
  if (asset === "pillar") return chunks.find((chunk) => chunk.solids.some((solid) => solid.detail === "cage"));
  const kind = hazardKindForAsset(chapter, asset);
  return kind ? chunks.find((chunk) => chunk.hazards.some((hazard) => hazard.kind === kind)) : undefined;
}

function makeButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  return button;
}

export function mountTestGround(): void {
  document.documentElement.className = "test-ground-page";
  document.title = "Biome Lab — birdddddd";
  document.body.innerHTML = `
    <main class="lab-shell">
      <header class="lab-header">
        <div>
          <span class="lab-kicker">BIRDDDDDD / INTERNAL</span>
          <h1>Biome Lab</h1>
        </div>
        <p>Inspect every environment, jump directly into authored chunks, and test the real collision and animation systems.</p>
      </header>
      <nav class="biome-tabs" id="lab-biomes" aria-label="Environments"></nav>
      <section class="lab-workbench">
        <div class="lab-stage-column">
          <div class="stage-toolbar">
            <div>
              <span class="toolbar-label">Live test</span>
              <strong id="lab-stage-title"></strong>
            </div>
            <div class="toolbar-actions">
              <button type="button" id="lab-reload">Reset run</button>
              <button type="button" id="lab-randomize">New seed</button>
              <a id="lab-open" target="_blank" rel="noreferrer">Open full screen</a>
            </div>
          </div>
          <div class="lab-frame-wrap">
            <iframe id="lab-frame" title="Playable biome test" allow="autoplay; fullscreen"></iframe>
            <span class="frame-hint">Click the game, then use Space or tap to flip gravity · P pauses · M mutes</span>
          </div>
          <div class="telemetry" id="lab-telemetry" aria-live="polite">
            <span><small>MODE</small><b>LOADING</b></span>
            <span><small>GRAVITY</small><b>—</b></span>
            <span><small>VELOCITY</small><b>—</b></span>
            <span><small>PLAYER X</small><b>—</b></span>
            <span><small>VISIBLE</small><b>—</b></span>
          </div>
        </div>
        <aside class="lab-inspector">
          <section>
            <div class="section-heading"><span>01</span><h2>Authored chunks</h2></div>
            <p class="section-copy">Pick a specific gameplay composition. It is placed close to the bird so it arrives almost immediately.</p>
            <div class="chunk-list" id="lab-chunks"></div>
          </section>
          <section>
            <div class="section-heading"><span>02</span><h2>Interactive assets</h2></div>
            <p class="section-copy">These are the exact runtime files. Select one to jump to a chunk that uses it.</p>
            <div class="asset-grid" id="lab-assets"></div>
          </section>
        </aside>
      </section>
    </main>`;

  const biomeTabs = document.querySelector<HTMLElement>("#lab-biomes");
  const chunkList = document.querySelector<HTMLElement>("#lab-chunks");
  const assetGrid = document.querySelector<HTMLElement>("#lab-assets");
  const frame = document.querySelector<HTMLIFrameElement>("#lab-frame");
  const stageTitle = document.querySelector<HTMLElement>("#lab-stage-title");
  const openLink = document.querySelector<HTMLAnchorElement>("#lab-open");
  const telemetry = document.querySelector<HTMLElement>("#lab-telemetry");
  if (!biomeTabs || !chunkList || !assetGrid || !frame || !stageTitle || !openLink || !telemetry) {
    throw new Error("Biome Lab failed to mount.");
  }

  let chapter = 0;
  let selectedChunk = chunksForChapter(chapter)[0]?.id ?? "";
  let seed = Math.floor(Math.random() * 0x7fffffff) + 1;

  const previewUrl = () => {
    const query = new URLSearchParams({
      previewChapter: String(chapter),
      previewChunk: selectedChunk,
      seed: String(seed),
    });
    return `/?${query.toString()}`;
  };

  const loadPreview = () => {
    const url = previewUrl();
    frame.src = url;
    openLink.href = url;
    stageTitle.textContent = `${CHAPTERS[chapter]?.name ?? "UNKNOWN"} · ${labelFromId(selectedChunk)}`;
    for (const button of chunkList.querySelectorAll<HTMLButtonElement>("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.chunk === selectedChunk));
    }
  };

  const renderChunks = () => {
    chunkList.replaceChildren();
    for (const chunk of chunksForChapter(chapter)) {
      const button = makeButton("", "chunk-card");
      button.dataset.chunk = chunk.id;
      button.innerHTML = `
        <span class="chunk-card-top"><strong>${labelFromId(chunk.id)}</strong><em>${terrainLabel(chunk)}</em></span>
        <span class="chunk-meta">${chunk.hazards.length} hazard${chunk.hazards.length === 1 ? "" : "s"} · ${chunk.solids.length} solid${chunk.solids.length === 1 ? "" : "s"} · ${chunk.feathers.length} feather${chunk.feathers.length === 1 ? "" : "s"}</span>`;
      button.addEventListener("click", () => {
        selectedChunk = chunk.id;
        loadPreview();
      });
      chunkList.append(button);
    }
  };

  const renderAssets = () => {
    assetGrid.replaceChildren();
    const family = INTERACTIVE_ART[chapter];
    if (!family) return;
    for (const asset of family.assets) {
      const matchingChunk = chunkForAsset(chapter, asset);
      const button = makeButton("", "asset-card");
      button.disabled = !matchingChunk;
      button.title = matchingChunk ? `Test ${assetLabel(asset)}` : `${assetLabel(asset)} is not used by an authored chunk yet`;
      const image = document.createElement("img");
      image.src = interactiveAssetPath(family, asset);
      image.alt = "";
      const name = document.createElement("span");
      name.textContent = assetLabel(asset);
      button.append(image, name);
      if (matchingChunk) {
        button.addEventListener("click", () => {
          selectedChunk = matchingChunk.id;
          loadPreview();
        });
      }
      assetGrid.append(button);
    }
  };

  const selectChapter = (nextChapter: number) => {
    chapter = nextChapter;
    selectedChunk = chunksForChapter(chapter)[0]?.id ?? "";
    for (const button of biomeTabs.querySelectorAll<HTMLButtonElement>("button")) {
      button.setAttribute("aria-selected", String(Number(button.dataset.chapter) === chapter));
    }
    renderChunks();
    renderAssets();
    loadPreview();
  };

  CHAPTERS.forEach((item, index) => {
    const button = makeButton(`${String(index + 1).padStart(2, "0")} ${item.name}`, "biome-tab");
    button.dataset.chapter = String(index);
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => selectChapter(index));
    biomeTabs.append(button);
  });

  document.querySelector("#lab-reload")?.addEventListener("click", loadPreview);
  document.querySelector("#lab-randomize")?.addEventListener("click", () => {
    seed = Math.floor(Math.random() * 0x7fffffff) + 1;
    loadPreview();
  });

  window.setInterval(() => {
    try {
      const raw = frame.contentWindow?.render_game_to_text?.();
      if (!raw) return;
      const state = JSON.parse(raw) as {
        mode: string;
        player: { gravity: number; vy: number; x: number };
        hazards: unknown[];
        solids: unknown[];
      };
      const values = telemetry.querySelectorAll<HTMLElement>("b");
      if (values[0]) values[0].textContent = state.mode.toUpperCase();
      if (values[1]) values[1].textContent = state.player.gravity > 0 ? "DOWN" : "UP";
      if (values[2]) values[2].textContent = `${Math.round(state.player.vy)} PX/S`;
      if (values[3]) values[3].textContent = state.player.x.toFixed(1);
      if (values[4]) values[4].textContent = `${state.hazards.length} H / ${state.solids.length} S`;
    } catch {
      // The frame may be navigating between previews; the next poll will recover.
    }
  }, 250);

  selectChapter(0);
}
