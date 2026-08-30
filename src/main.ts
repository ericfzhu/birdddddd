import { RENDER_DENSITY, VIEW_HEIGHT } from "./game/constants";
import { shouldGateForPortrait, type MobileViewportSignals } from "./mobile";
import { logicalViewportWidth, viewportAspect } from "./viewport";
import "./styles.css";

function waitForGameReady(): Promise<void> {
  if (document.documentElement.classList.contains("game-ready")) return Promise.resolve();
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!document.documentElement.classList.contains("game-ready")) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  });
}

async function warmOfflineCache(registration: ServiceWorkerRegistration): Promise<void> {
  if (window.location.pathname.replace(/\/+$/, "") === "/test") return;
  await waitForGameReady();
  const worker = registration.active;
  if (!worker) return;
  const urls = new Set<string>([new URL("/", window.location.origin).href]);
  for (const entry of performance.getEntriesByType("resource")) {
    const url = new URL(entry.name, window.location.href);
    if (url.origin === window.location.origin) urls.add(url.href);
  }
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(resolve, 30000);
    channel.port1.onmessage = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    worker.postMessage({ type: "CACHE_URLS", urls: [...urls] }, [channel.port2]);
  });
}

function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => warmOfflineCache(registration))
      .catch((error: unknown) => {
        console.warn("birdddddd could not enable offline play.", error);
      });
  }, { once: true });
}

function bootGamePage(): void {
const gameContent = document.querySelector<HTMLElement>("#game-content");
const rotatePrompt = document.querySelector<HTMLElement>("#rotate-prompt");
const loadingScreen = document.querySelector<HTMLElement>("#loading-screen");
const coarsePointer = window.matchMedia("(pointer: coarse)");
let gameLoadPromise: Promise<void> | undefined;
let sceneReady = false;
let revealPromise: Promise<void> | undefined;

function afterBrowserPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function revealLoadedGame(): Promise<void> {
  if (!sceneReady || revealPromise) return revealPromise ?? Promise.resolve();
  revealPromise = Promise.all([
    document.fonts?.load('700 18px "Pixelify Sans"') ?? Promise.resolve([]),
    document.fonts?.ready ?? Promise.resolve(),
  ])
    .then(() => afterBrowserPaint())
    .then(() => {
      document.documentElement.classList.remove("game-loading");
      document.documentElement.classList.add("game-ready");
      loadingScreen?.setAttribute("aria-hidden", "true");
    });
  return revealPromise;
}

window.addEventListener("birdddddd:scene-ready", () => {
  sceneReady = true;
  void revealLoadedGame();
}, { once: true });

function viewportSignals(): MobileViewportSignals {
  const viewport = window.visualViewport;
  return {
    width: Math.round(viewport?.width ?? window.innerWidth),
    height: Math.round(viewport?.height ?? window.innerHeight),
    coarsePointer: coarsePointer.matches,
    touchPoints: navigator.maxTouchPoints,
  };
}

function syncViewportSize(): number {
  const signals = viewportSignals();
  const logicalWidth = logicalViewportWidth(signals.width, signals.height);
  document.documentElement.style.setProperty("--game-aspect", viewportAspect(logicalWidth));
  const game = window.__birdddddd;
  const pixelWidth = logicalWidth * RENDER_DENSITY;
  const pixelHeight = VIEW_HEIGHT * RENDER_DENSITY;
  if (game && (game.scale.gameSize.width !== pixelWidth || game.scale.gameSize.height !== pixelHeight)) {
    game.scale.setGameSize(pixelWidth, pixelHeight);
  }
  return logicalWidth;
}

function setPortraitGate(blocked: boolean): void {
  document.documentElement.classList.toggle("mobile-portrait-gate", blocked);
  gameContent?.setAttribute("aria-hidden", String(blocked));
  rotatePrompt?.setAttribute("aria-hidden", String(!blocked));
}

function startGame(): Promise<void> {
  if (window.__birdddddd) return Promise.resolve();
  if (gameLoadPromise) return gameLoadPromise;
  gameLoadPromise = Promise.all([import("phaser"), import("./game/scene")])
    .then(([{ default: Phaser }, { AviaryScene }]) => {
      if (shouldGateForPortrait(viewportSignals()) || window.__birdddddd) return;
      const logicalWidth = syncViewportSize();
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.CANVAS,
        parent: "game",
        width: logicalWidth * RENDER_DENSITY,
        height: VIEW_HEIGHT * RENDER_DENSITY,
        backgroundColor: "#211a1d",
        pixelArt: true,
        roundPixels: true,
        render: {
          antialias: false,
          pixelArt: true,
          roundPixels: true,
          transparent: false,
          preserveDrawingBuffer: true,
        },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: logicalWidth * RENDER_DENSITY,
          height: VIEW_HEIGHT * RENDER_DENSITY,
        },
        audio: {
          disableWebAudio: false,
          noAudio: false,
        },
        scene: [AviaryScene],
      };
      window.__birdddddd = new Phaser.Game(config);
    })
    .finally(() => {
      gameLoadPromise = undefined;
    });
  return gameLoadPromise;
}

function syncOrientationGate(): void {
  const blocked = shouldGateForPortrait(viewportSignals());
  setPortraitGate(blocked);
  if (blocked) {
    window.__birdddddd?.loop.sleep();
    return;
  }
  syncViewportSize();
  if (window.__birdddddd) {
    window.__birdddddd.loop.wake();
    window.__birdddddd.scale.refresh();
  } else {
    void startGame();
  }
}

window.__birddddddOrientationState = () => JSON.stringify({
  blocked: shouldGateForPortrait(viewportSignals()),
  gameLoaded: Boolean(window.__birdddddd),
  gameReady: document.documentElement.classList.contains("game-ready"),
  viewport: viewportSignals(),
});

coarsePointer.addEventListener("change", syncOrientationGate);
window.matchMedia("(orientation: portrait)").addEventListener("change", syncOrientationGate);
window.addEventListener("resize", syncOrientationGate);
window.visualViewport?.addEventListener("resize", syncOrientationGate);
syncOrientationGate();
}

if (window.location.pathname.replace(/\/+$/, "") === "/test") {
  void import("./test-ground").then(({ mountTestGround }) => mountTestGround());
} else {
  bootGamePage();
}

registerServiceWorker();
