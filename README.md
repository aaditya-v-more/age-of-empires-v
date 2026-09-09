# Age of Empires V · The Second Reign

A playable, unofficial medieval strategy experiment. The entire game—including its 3D engine, artwork, interface, and sound—lives in **`index.html`**. No CDN, asset downloads, server, or internet connection is required to play.

**[Play the game](https://age-of-empires-v.vercel.app)** · [Public source repository](https://github.com/aaditya-v-more/age-of-empires-v)

## Play

Open `index.html` in a modern browser with WebGL 2 enabled. For a local preview, run `npm start` and open the address it prints. Node.js is only needed for the optional development commands.

You command the English settlement of **King’s Crossing**. Grow your economy, recruit an army, defend against Redwatch raids, and destroy the enemy keep across the river. Losing your Town Center ends the battle.

Start with **Build → Barracks** in the clearing east of town. Two nearby villagers will travel to the site and construct it. Your twelve starting villagers are already assigned to food, wood, gold, and stone. Keep training workers, build an Archery Range, and escort your longbows with infantry. **H** opens the field guide; **K** opens the technology tree.

## The Second Reign

This update replaces the original simplified economy and free enemy waves with connected RTS systems:

- **Physical economy:** workers carry 10 resources to a Town Center, camp, or mill before those resources enter your stockpile. Shorter hauling routes improve income. Deposits are finite; each farm needs one worker and costs 60 wood to reseed. Markets trade resources at changing prices instead of generating passive gold.
- **Construction and production:** builders must reach a site and work on it. Multiple builders help with diminishing returns. Recruitment and research cost resources and take time. Queued units reserve population; destroyed houses can block completed recruitment. Cancelling the last queue item refunds its cost.
- **Ages and research:** Feudal → Castle → Imperial, with building prerequisites and 16 technologies. Research improves gathering, carrying, attack, armor, arrow range, projectile prediction, and priest abilities. Existing and future units receive completed upgrades.
- **Eight unit types:** villagers, spearmen/pikemen, men-at-arms, longbowmen, knights, priests, battering rams, and trebuchets. Melee and pierce armor, class bonuses, cavalry charges, braced spears, siege range limits, projectile misses, and terrain elevation affect combat.
- **A paid opponent:** Redwatch assigns workers, gathers the same finite resources, constructs buildings, advances ages, and pays for recruits and research. It sends existing troops on raids, keeps reserves, reacts to observed army composition, and retreats damaged raiding groups.
- **Battlefield control:** fog of war, remembered structures, formation movement, attack marches, control groups, production rally points, repairs, garrisoning, and sheltered healing.
- **Clearer presentation:** detailed stone and timber surfaces, construction scaffolds, distinct military models, worker allocation counts, cargo and combat stats, health/faith bars, and visible healing/conversion beams.

### Wolololo

1. Complete a Barracks. Your starting Market supplies the second Feudal building requirement.
2. Research **Castle Age** at your Town Center: **400 food + 200 gold**, 40 seconds.
3. Build a **Monastery**: **200 wood + 50 gold**, then train a **Priest** for **100 gold**.
4. Enable the speaker button, select the priest, and **right-click an enemy unit**.

Conversion costs **80 faith when the chant begins** and needs **7 uninterrupted seconds** within range. Damage or a fleeing target breaks the chant; spent faith is lost. Converted units join your team and resist further conversion for 25 seconds. Redemption unlocks siege conversion; buildings cannot be converted. Priests automatically heal nearby wounded allies, or you can right-click an ally to prioritize it.

The chant uses an installed local speech voice where available, with a synthesized formant chant as the offline fallback. No audio service or downloaded sound file is required.

### Unit counters

| Unit | Strength | Weakness |
| --- | --- | --- |
| Spearman / Pikeman | +32 / +48 damage against cavalry; braced spears negate charge bonus | Swords and arrows |
| Man-at-arms | Armor; bonuses against spears and siege | Ranged kiting |
| Longbowman | Infantry pressure; +5 against spears | Cavalry and arrow-resistant siege |
| Knight | Mobility, charging attacks, worker raids | Braced spears and protected priests |
| Ram | +90 against buildings; high pierce armor | Melee units |
| Trebuchet | +150 against buildings; 27 range | 7-tile minimum range; slow and vulnerable |
| Priest | Healing and conversion of expensive targets | Focused fire and interrupted chants |

## Controls

| Action | Control |
| --- | --- |
| Select | Left-click; drag a box for a group |
| Add/remove a unit from selection | Shift-click |
| Select units of the same type | Double-click a unit |
| Move, gather, build, repair, attack, heal, or convert | Right-click a destination or target |
| Set a rally point | Select a production building, then right-click a location/resource |
| Pan | WASD, arrows, middle/right drag, or click the minimap |
| Zoom | Scroll or the + / − controls |
| Rotate | Alt + drag |
| Select the entire army | F |
| Save / recall a control group | Ctrl + 1–9 / 1–9 |
| Recruit / Build / Research / Command tabs | 1 / 2 / 3 / 4 when that number has no saved group |
| More / previous action cards | ] / [ or the page arrows |
| Building menu | B |
| Attack march | X, then click a destination |
| Hold ground / brace spears | Command → Hold ground |
| Idle workers | . (period) or the idle-worker button |
| Garrison / release | G / Command → Ungarrison |
| Technology tree | K |
| Return to your Town Center | Home |
| Pause | Space |
| Field guide | H |
| Cinematic view | C |
| Cancel placement or targeting | Escape |
| Sound | Speaker button; off initially |
| Simulation speed | 1× / 1.5× / 2× button |

On touchscreens, tap to select and tap a destination or resource to command. Drag to pan and pinch to zoom. The game pauses when its tab is hidden. Battles are not saved; reloading starts a new reign.

## What is inside

- A procedurally modeled 3D world with a sculpted landscape, forests, river, stone bridge, castle, monastery, windmills, farms, and medieval homes.
- Soft shadows, animated water and banners, chimney smoke, birds, projectile effects, and synthesized ambient music.
- Four resources, twelve constructible building types, eight unit types, and sixteen technologies.
- A* pathfinding, formations, ranged and melee combat, defensive structures, economic enemy AI, and victory/defeat states.
- Responsive command interface, keyboard controls, touch controls, minimap, and a cinematic camera.

The HTML contains the MIT-licensed Three.js r170 engine followed by readable game code. Its license is included in the file. No official game assets are used. This project is an unofficial fan-made experiment and is not affiliated with or endorsed by the Age of Empires franchise.

## Development

```sh
npm install
npm test
npm run build
npm start
```

`npm test` runs the actual embedded game and Three.js geometry in a DOM simulator. It checks hauling and delivery, farm limits and reseeding, physical construction, research prerequisites and timing, population reservations, counters and projectiles, priest healing/conversion/interruption, fog of war, garrisoning, market spread, paid enemy recruitment, and victory/defeat. A 65-second economy check and an eight-minute simulation cover worker delivery, enemy age progression, and priest recruitment. GPU rendering and browser input require separate browser checks.

`npm run build` validates both inline scripts and copies the complete game into `dist/index.html` for static hosting.

Only the test runner has a development dependency. The game itself remains a single standalone file.

## Deployment

The public GitHub repository is connected to Vercel. Production tracks `main`: pushing to `main` automatically builds and deploys the game. Vercel runs `npm run build` and serves `dist/index.html`; `vercel.json` keeps those settings in the repository.
