# birdddddd

A one-button endless arcade game combining Flappy Bird's rapid obstacle loop with VVVVVV's gravity reversal. Guide a bedraggled fledgling through a strange mechanical aviary, reverse gravity without losing momentum, and collect feather chains for bonus points.

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

## Cloudflare deployment and embedding

The production build is configured for a Cloudflare Pages project named `birdddddd`. Deploy it with:

```sh
yarn deploy
```

The deploy script uploads `dist` directly to Pages. `public/_headers` allows the game to be framed by `ericfzhu.com`, its `www` hostname, its Cloudflare Pages preview hostnames, and local development servers. Other websites cannot frame the deployed game.

After assigning the Pages project a public hostname, embed that single deployment in the main website:

```tsx
<iframe
  src="https://your-game-hostname.example"
  title="birdddddd"
  allow="fullscreen; autoplay"
  allowFullScreen
  className="h-full w-full border-0"
/>
```

No cross-origin API or CORS permission is required for the iframe. Best score, mute, and reduced-motion preferences remain local to the game hostname.

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
