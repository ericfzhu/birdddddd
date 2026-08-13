import { VIEW_HEIGHT, VIEW_WIDTH } from "./game/constants";
import { shouldGateForPortrait, type MobileViewportSignals } from "./mobile";
import "./styles.css";

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
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.CANVAS,
        parent: "game",
        width: VIEW_WIDTH,
        height: VIEW_HEIGHT,
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
          width: VIEW_WIDTH,
          height: VIEW_HEIGHT,
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
