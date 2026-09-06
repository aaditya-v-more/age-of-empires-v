import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

// Exercise the actual embedded game and Three.js geometry without a browser or GPU.
// Renderer and audio are excluded; all gameplay, navigation, geometry, and DOM state are real.
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const engine = html.match(/<script id="three-engine">([\s\S]*?)<\/script>/)[1];
const source = html.match(/<script id="game-code">([\s\S]*?)<\/script>/)[1];
const errors = [];
function boot() {
  const { document, window } = parseHTML(html);
  const noop = () => {};
  const context2d = new Proxy({}, { get: (target, key) => key in target ? target[key] : key === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop, set: (target, key, value) => (target[key] = value, true) });
  window.HTMLCanvasElement.prototype.getContext = () => context2d;
  window.HTMLElement.prototype.focus = noop;
  const events = new Map();
  const timeouts = [];
  const sandbox = {
    document, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
    console: { log: noop, warn: (...args) => errors.push(args.join(' ')), error: (...args) => errors.push(args.join(' ')) },
    performance, Math, Date, Float32Array, Uint8Array, Int32Array, Uint16Array, Uint32Array,
    setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; }, clearTimeout: noop,
    requestAnimationFrame: fn => { sandbox.frame = fn; },
    addEventListener: (name, fn) => { events.set(name, fn); },
    location: { reload: noop }, __EMERALD_TEST__: {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(engine, sandbox, { timeout: 10000 });
  vm.runInContext(`THREE = { ...THREE, WebGLRenderer: class {
    constructor({canvas}) { this.domElement = canvas; this.shadowMap = {}; }
    setPixelRatio() {} setSize() {} render(scene, camera) { scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); }
  }};`, sandbox);
  vm.runInContext(source, sandbox, { timeout: 30000 });
  return { game: sandbox.__EMERALD_TEST__, document, events, timeouts, sandbox };
}

const { game: g, document, sandbox } = boot();
assert.equal(errors.length, 0, errors.join('\n'));
assert.equal(g.population(), 16);
assert.equal(g.capacity(), 45);
assert.equal(g.playerTown.hp, 2400);
assert.equal(g.enemyKeep.hp, 2900);
assert.equal(document.getElementById('action-grid').children.length, 6);
assert.equal(g.units.filter(u => u.type === 'villager' && u.order === 'gather').length, 10);
let meshes = 0, triangles = 0;
g.scene.traverse(object => {
  if (!object.isMesh) return;
  meshes++;
  const positions = object.geometry.attributes.position;
  assert.ok(positions && positions.count > 0, 'Every rendered mesh has geometry');
  for (const value of positions.array) assert.ok(Number.isFinite(value), 'Geometry must contain no NaN vertices');
  triangles += (object.geometry.index?.count ?? positions.count) / 3 * (object.isInstancedMesh ? object.count : 1);
});
assert.ok(meshes < 550, `Scene draw-call budget exceeded: ${meshes}`);
console.log(`PASS: world initializes with ${meshes} meshes and ${Math.round(triangles).toLocaleString()} triangles; no geometry or runtime errors.`);

const crossRiver = g.findPath({ x: -10, z: 24 }, { x: 52, z: -20 });
assert.ok(crossRiver.length > 10, 'Cross-river target must be reachable');
let crossed = false;
for (const p of crossRiver) {
  if (Math.abs(p.x - g.riverX(p.z)) < 6.3) {
    assert.ok(Math.abs(p.z - 4) < 2.5, 'Units may enter the river only on the bridge');
    crossed = true;
  }
}
assert.ok(crossed, 'Cross-river route uses the bridge');
assert.ok(g.validPlacement('house', g.riverX(10), 10));
assert.ok(g.validPlacement('house', -26, 12));
assert.ok(g.validPlacement('house', 80, 70));
assert.equal(g.validPlacement('barracks', -3, 24), '');
console.log('PASS: routes cross the bridge; placement rejects river, overlaps, and enemy territory.');

const starting = { ...g.stock };
for (let i = 0; i < 900; i++) g.step(1 / 30);
assert.ok(g.stock.food > starting.food + 50, 'Food economy produces income');
assert.ok(g.stock.wood > starting.wood + 20, 'Villagers collect wood');
assert.ok(g.stock.gold > starting.gold + 35, 'Gold economy produces income');
assert.ok(g.stock.stone > starting.stone + 5, 'Villagers collect stone');
g.startPlacement('barracks');
g.placeBuilding({ x: -3, z: 24 });
const barracks = g.buildings.find(b => b.type === 'barracks' && !b.team);
assert.ok(barracks && !barracks.built);
for (let i = 0; i < 570; i++) g.step(1 / 30);
assert.ok(barracks.built);
const populationBefore = g.population(), resourcesBefore = { ...g.stock };
g.train('swordsman');
assert.equal(barracks.queue.length, 1);
assert.equal(g.stock.food, resourcesBefore.food - 70);
assert.equal(g.stock.gold, resourcesBefore.gold - 20);
for (let i = 0; i < 330; i++) g.step(1 / 30);
assert.equal(g.population(), populationBefore + 1);
assert.equal(barracks.queue.length, 0);
g.updateUI();
assert.ok(document.getElementById('obj-barracks').classList.contains('done'));
console.log('PASS: all four resources gather, construction completes, recruitment deducts costs and creates a unit.');

const poorStock = { ...g.stock };
g.stock.food = 0; g.stock.gold = 0;
g.train('swordsman');
assert.equal(barracks.queue.length, 0, 'Cannot recruit without resources');
Object.assign(g.stock, poorStock);
const woodBefore = g.stock.wood, goldBefore = g.stock.gold;
g.trade();
assert.equal(g.stock.wood, woodBefore - 100);
assert.equal(g.stock.gold, goldBefore + 70);
g.stock.food = 1000; g.stock.gold = 1000;
const soldier = g.units.find(u => u.type === 'swordsman' && !u.team);
g.upgrade();
assert.equal(g.getState().imperial, true);
assert.equal(soldier.maxHp, 186);
assert.equal(g.stock.food, 500);
assert.equal(g.stock.gold, 650);
const foodAfter = g.stock.food;
g.upgrade();
assert.equal(g.stock.food, foodAfter, 'Imperial upgrade cannot charge twice');
console.log('PASS: resource costs are enforced; trade and the one-time Imperial upgrade work.');

const probe = g.units.find(u => u.team && u.type === 'archer');
g.selectEntities([soldier]);
document.getElementById('action-grid').children[2].click();
assert.equal(soldier.order, 'hold');
probe.x = soldier.x + 8; probe.z = soldier.z;
g.step(.05);
assert.equal(soldier.path.length, 0, 'Hold ground does not chase distant enemies');
const marchGoal = { x: soldier.x + 15, z: soldier.z + 2 };
g.issueMove([soldier], marchGoal, true);
g.step(.05);
assert.equal(soldier.destination.x, marchGoal.x, 'Engaging an enemy preserves the march destination');
g.damage(probe, 1000, soldier);
g.step(.05);
assert.equal(soldier.order, 'move', 'Attack march resumes after an engagement');
assert.ok(soldier.path.length > 0);
console.log('PASS: command buttons dispatch orders, hold ground stays put, and attack marches resume.');

const victim = g.units.find(u => u.team && u.type === 'swordsman');
victim.x = soldier.x + .5; victim.z = soldier.z + .5;
victim.hp = 10;
g.issueTarget([soldier], victim);
g.step(.05);
assert.equal(victim.alive, false, 'Melee combat defeats a low-health enemy');
const enemyCount = g.units.filter(u => u.team).length;
g.launchRaid();
assert.ok(g.units.filter(u => u.team).length > enemyCount);
assert.equal(g.getState().wave, 1);
assert.ok(g.units.filter(u => u.raid).every(u => u.path.length), 'Raid units can reach player territory');
sandbox.frame(1000); sandbox.frame(1016);
assert.equal(errors.length, 0, errors.join('\n'));
g.damage(g.enemyKeep, 10000, soldier);
assert.equal(g.getState().ended, true);
assert.equal(g.getState().paused, true);
assert.equal(g.enemyKeep.alive, false);
console.log('PASS: combat, raid pathfinding, frame updates, and conquest victory.');

const defeat = boot().game;
defeat.damage(defeat.playerTown, 10000, defeat.enemyKeep);
assert.equal(defeat.getState().ended, true);
assert.equal(defeat.getState().paused, true);
assert.equal(defeat.playerTown.alive, false);
assert.equal(errors.length, 0, errors.join('\n'));
console.log('PASS: losing the Town Center ends the battle.');
console.log('All gameplay checks passed. These tests do not validate GPU rendering or browser input delivery.');
