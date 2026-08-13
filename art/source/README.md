# Biome art sources

These high-resolution PNGs are original project assets generated with the built-in OpenAI image-generation tool on 2026-08-13. They do not contain copied Terraria sprites or textures.

## Prompt set

- `biome-terrain-atlas.png`: four equal pixel-art material fields—rooted forest soil, fossil-bearing desert sandstone, organic violet corruption stone, and ember-lit ash/obsidian.
- `biome-forest-background.png`: a wide late-16-bit forest panorama with rooted trees, continuous ground, layered mountains, clouds, and dense atmospheric woodland.
- `biome-desert-background.png`: a wide late-16-bit desert panorama with continuous dunes, mesas, rooted cacti, buried ruins, and a large sun.
- `biome-violet-background.png`: a wide late-16-bit corrupted cavern with connected walls, chasms, embedded magenta roots, crystals, mushrooms, and spores.
- `biome-ashen-background.png`: a wide late-16-bit volcanic cavern with connected rock, lavafalls, grounded obsidian ruins, chains, ash, and magma seams.
- `biome-props-atlas.png`: a transparent 2×2 prop atlas containing an original rooted forest tree, desert cactus, violet mushroom/crystal cluster, and broken obsidian ruin.
- `biome-underground-jungle-*`: a continuous root-and-water cavern panorama, damp leaf-litter terrain, and a grounded root-shrine prop.
- `biome-marble-cave-*`: a pale veined marble vault panorama, cobalt-seamed stone terrain, and a broken column/urn landmark.
- `biome-underground-corruption-*`: a bone-laced indigo rift panorama, cyan-fissured fossil terrain, and a thorn-root monolith.
- `biome-abandoned-minecart-*`: a supported timber railway panorama, riveted mine-rock terrain, and a derailed cart/signal landmark.
- `biome-underworld-*`: a lava-citadel panorama, fused obsidian furnace terrain, and a chained molten furnace landmark.

All prompts required crisp hard-edged pixels, deliberate clustered shading, original silhouettes, surface-grounded construction, no characters or UI, and no copied game assets. Runtime copies in `public/assets` are nearest-neighbour reductions used by Phaser; Vite does not ship this source directory.
