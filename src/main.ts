import Phaser from "phaser";
import { VIEW_HEIGHT, VIEW_WIDTH } from "./game/constants";
import { AviaryScene } from "./game/scene";
import "./styles.css";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  parent: "game",
  width: VIEW_WIDTH,
  height: VIEW_HEIGHT,
  backgroundColor: "#17182b",
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

window.__impossibleAviary = new Phaser.Game(config);
