# Impossible Aviary

A one-button endless arcade game about a bedraggled fledgling escaping a strange mechanical aviary. Reverse gravity without losing momentum, thread handcrafted cage mechanisms, and collect feather chains for bonus points.

## Play

- **Space, click, or tap:** reverse gravity
- **P or the pause button:** pause/resume
- **M or the sound button:** mute/unmute
- **F:** enter/exit fullscreen
- **Esc:** exit fullscreen

The game is designed for landscape screens. On phone-sized touch devices held in portrait, only the orientation screen loads. Phaser initializes after the phone is turned sideways; returning to portrait suspends the current run until landscape is restored.

In landscape, the game host fills the browser viewport by default. The fixed 16:9 playfield is aspect-fitted against a matching background so gameplay geometry remains undistorted on unusually wide or tall screens. Browser-native fullscreen is still available with **F**.

## Development

Node.js 22.12 or newer and Yarn 3.6.3 are required. With NVM installed:

```sh
nvm install
nvm use
corepack enable
yarn install
yarn dev
yarn test
yarn build
```

Open `http://localhost:5173`. Add `?seed=123` to reproduce a particular chunk sequence during testing.

## Design and architecture

- Phaser 4.2 rendering, input, scaling, and a Phaser-owned Web Audio context
- TypeScript and Vite static production build
- 320×180 logical canvas with nearest-neighbour responsive scaling
- Deterministic 60 Hz custom physics with momentum-preserving gravity flips
- Twenty-four authored chunks across four escalating chapters
- Compatibility metadata and discrete physics traversal checks for chunk transitions
- Gate scoring, optional three-feather bonus chains, local best-score/settings persistence
- Original code-drawn pixel art and procedurally synthesized chiptune/SFX—no borrowed game assets

Automated browser checks can inspect the live game through `window.render_game_to_text()` and advance it deterministically through `window.advanceTime(ms)`.
