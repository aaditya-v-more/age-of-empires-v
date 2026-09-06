# Age of Empires V · The Emerald March

A playable, unofficial medieval strategy experiment. The entire game—including its 3D engine, artwork, interface, and sound—lives in **`index.html`**. No CDN, asset downloads, server, or internet connection is required to play.

**[Play the game](https://age-of-empires-v.vercel.app)** · [Public source repository](https://github.com/aaditya-v-more/age-of-empires-v)

## Play

Open `index.html` in a modern browser with WebGL 2 enabled. For a local preview, run `npm start` and open the address it prints. Node.js is only needed for the optional development commands.

You command the English settlement of **King’s Crossing**. Grow your economy, recruit an army, defend against Redwatch raids, and destroy the enemy keep across the river. Losing your Town Center ends the battle.

Start by choosing **Build → Barracks**, then place it in the clearing east of town. Your ten villagers already gather resources. The barracks trains men-at-arms and longbowmen; a stable unlocks knights. Houses add population, farms produce food, markets generate gold, and watchtowers fire at enemies automatically.

## Controls

| Action | Control |
| --- | --- |
| Select | Left-click; drag a box for a group |
| Add/remove a unit from selection | Shift-click |
| Select units of the same type | Double-click a unit |
| Move, gather, repair, or attack | Right-click a destination or target |
| Pan | WASD, arrows, middle/right drag, or click the minimap |
| Zoom | Scroll or the + / − controls |
| Rotate | Alt + drag |
| Select the entire army | F |
| Recruit / Build / Command tabs | 1 / 2 / 3 |
| Building menu | B |
| Return to your Town Center | Home |
| Pause | Space |
| Field guide | H |
| Cinematic view | C |
| Cancel placement or targeting | Escape |
| Sound | Speaker button; off initially |

On touchscreens, tap to select and tap a destination or resource to command. Drag to pan and pinch to zoom. The game pauses when its tab is hidden. Battles are not saved; reloading starts a new reign.

## What is inside

- A procedurally modeled 3D world with a sculpted landscape, forests, river, stone bridge, castle, church, windmill, farms, and medieval homes.
- Soft shadows, animated water and banners, chimney smoke, birds, projectile effects, and synthesized ambient music.
- Four resources, seven player building types, four unit types, recruitment queues, repairs, resource trading, and an Imperial Age upgrade.
- A* pathfinding, formations, ranged and melee combat, defensive structures, escalating enemy raids, and victory/defeat states.
- Responsive command interface, keyboard controls, touch controls, minimap, and a cinematic camera.

The HTML contains the MIT-licensed Three.js r170 engine followed by readable game code. Its license is included in the file. No official game assets are used. This project is an unofficial fan-made experiment and is not affiliated with or endorsed by the Age of Empires franchise.

## Development

```sh
npm install
npm test
npm run build
npm start
```

`npm test` runs the embedded game in a DOM simulator, checking geometry, navigation, resource gathering, construction, recruitment, costs, upgrades, raids, combat, and victory/defeat. It does not test GPU rendering or real browser input. `npm run build` validates both inline scripts and copies the complete game into `dist/index.html` for static hosting.

Only the test runner has a development dependency. The game itself remains a single standalone file.

## Deployment

The public GitHub repository is connected to Vercel. Production tracks `main`: pushing to `main` automatically builds and deploys the game. Vercel runs `npm run build` and serves `dist/index.html`; `vercel.json` keeps those settings in the repository.
