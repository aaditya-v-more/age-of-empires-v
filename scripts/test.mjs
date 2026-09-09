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

const advance=(g,seconds,dt=.1)=>{for(let t=0;t<seconds-1e-7;t+=dt)g.step(Math.min(dt,seconds-t));};
const rich=g=>{for(const team of g.teams)Object.assign(team.stock,{food:10000,wood:10000,gold:10000,stone:10000});};
const stopWorkers=g=>{for(const u of g.units.filter(u=>u.type==='villager')){u.order='hold';u.path=[];u.gatherTarget=null;u.target=null;}};

{
 const {game:g,document,sandbox}=boot();
 assert.equal(g.population(),18);assert.equal(g.capacity(),45);assert.equal(g.teams[0].age,2);assert.equal(g.units.filter(u=>!u.team&&u.order==='gather').length,12);
 assert.equal(document.getElementById('action-grid').children.length,6);
 let meshes=0,triangles=0;g.scene.traverse(o=>{if(!o.isMesh)return;meshes++;const p=o.geometry.attributes.position;assert.ok(p?.count);for(const v of p.array)assert.ok(Number.isFinite(v),'No invalid geometry vertices');triangles+=(o.geometry.index?.count??p.count)/3*(o.isInstancedMesh?o.count:1);});
 assert.ok(meshes<850,`Initial mesh budget: ${meshes}`);
 const path=g.findPath({x:-10,z:24},{x:52,z:-20});assert.ok(path.length>10);assert.ok(path.some(p=>Math.abs(p.x-g.riverX(p.z))<6.3));for(const p of path)if(Math.abs(p.x-g.riverX(p.z))<6.3)assert.ok(Math.abs(p.z-4)<2.5,'Cross only at the bridge');
 assert.ok(g.validPlacement('house',g.riverX(10),10));assert.ok(g.validPlacement('house',-26,12));assert.ok(g.validPlacement('house',80,70));assert.equal(g.validPlacement('barracks',-3,24),'');
 sandbox.frame(1000);sandbox.frame(1016);
 console.log(`PASS: ${meshes} meshes / ${Math.round(triangles).toLocaleString()} triangles; valid geometry, frame updates, bridge navigation, and construction placement.`);
}
{
 const {game:g}=boot();stopWorkers(g);const before={...g.stock};g.updateBuildings(30);assert.deepEqual({...g.stock},before,'Farms and markets cannot mint passive resources');
 const u=g.units.find(u=>!u.team&&u.type==='villager'),wood=g.resources.find(r=>r.type==='wood'&&r.x<0);u.x=wood.x+wood.radius+1;u.z=wood.z;assert.ok(g.assignGather(u,wood));const amount=wood.amount;g.updateWorker(u,1);assert.ok(u.cargo.amount>0);assert.equal(g.stock.wood,before.wood,'Gathering fills cargo, not the treasury');assert.ok(wood.amount<amount);
 for(let i=0;i<10&&u.order==='gather';i++)g.updateWorker(u,1);assert.equal(u.order,'return');assert.equal(u.cargo.amount,10);
 const drop=g.closestDropoff(u,'wood');u.x=drop.x+drop.radius+1;u.z=drop.z;g.updateWorker(u,.1);assert.equal(g.stock.wood,before.wood+10);assert.equal(u.cargo.amount,0);
 const farm=g.buildings.find(b=>b.type==='farm'&&!b.team),other=g.units.find(v=>v!==u&&!v.team&&v.type==='villager');farm.amount=5;u.x=farm.x;u.z=farm.z;assert.ok(g.assignGather(u,farm));assert.equal(g.assignGather(other,farm),false,'One farmer per field');g.updateWorker(u,10);assert.equal(farm.amount,0);assert.equal(u.cargo.amount,5);const woodBefore=g.stock.wood;g.updateWorker(u,.1);assert.equal(g.stock.wood,woodBefore-60,'Reseeding costs wood');assert.ok(farm.amount<600&&farm.amount>599);
 g.teams[0].techs.add('wheelbarrow');assert.equal(g.carryCap(u),20);assert.ok(g.stats(u).speed>g.unitDefs.villager.speed);
 console.log('PASS: physical resource hauling, finite harvests, no passive income, one farmer per field, paid reseeding, and Wheelbarrow.');
}
{
 const {game:g}=boot();advance(g,65);
 for(const team of g.teams)for(const resource of ['food','wood','gold','stone'])assert.ok(team.delivered[resource]>0,`Team ${g.teams.indexOf(team)} actually delivers ${resource}`);
 for(const farm of g.buildings.filter(b=>b.type==='farm'&&!b.team))assert.ok(farm.amount<600,'Every starting farmer can reach and work its field');
 assert.ok(g.units.filter(u=>u.team===1&&u.type==='villager').length>12,'The enemy trains paid workers');
 for(const u of g.units){assert.ok(Number.isFinite(u.x)&&Number.isFinite(u.z));assert.ok(u.cargo.amount>=0);}
 console.log('PASS: both economies gather and deliver all four resources during a real 65-second simulation.');
}
{
 const {game:g}=boot();rich(g);const b=g.construct('barracks',-3,24);assert.ok(b&&!b.built);g.updateBuildings(10);assert.equal(b.progress,0,'Construction waits for physical builders');
 for(const u of g.units.filter(u=>u.target===b)){u.x=b.x+b.radius+1;u.z=b.z;u.path=[];}
 g.updateBuildings(8);assert.ok(b.progress>0&&b.progress<1);const hp=b.hp;g.damage(b,100,g.enemyKeep);g.updateBuildings(8);assert.ok(b.built);assert.equal(b.hp,b.maxHp-100,'Construction does not erase combat damage');assert.ok(hp>0);
 const money={...g.stock};assert.ok(g.train('spearman'));assert.equal(g.stock.food,money.food-60);assert.equal(g.stock.wood,money.wood-25);const pop=g.population();g.updateBuildings(12);assert.equal(g.population(),pop);g.updateBuildings(1);assert.equal(g.population(),pop+1);
 g.selectEntities([b]);g.train('swordsman');const afterPay=g.stock.food;g.cancelQueue();assert.equal(g.stock.food,afterPay+65);assert.equal(b.queue.length,0);
 console.log('PASS: builders must arrive, construction preserves damage, production consumes resources and time, and queue cancellation refunds costs.');
}
{
 const {game:g}=boot();rich(g);assert.match(g.researchReason('castle'),/two different/);assert.match(g.trainReason('priest'),/Castle/);g.addBuilding('barracks',-3,24);assert.ok(g.research('castle'));assert.equal(g.research('castle'),false,'Cannot charge twice for queued research');g.updateBuildings(39);assert.equal(g.teams[0].age,2);g.updateBuildings(1);assert.equal(g.teams[0].age,3);assert.match(g.trainReason('priest'),/Monastery/);
 g.addBuilding('monastery',-33,-12);assert.ok(g.train('priest'));g.updateBuildings(23);assert.ok(g.units.some(u=>!u.team&&u.type==='priest'));
 const smith=g.addBuilding('blacksmith',-18,43),sword=g.units.find(u=>!u.team&&u.type==='swordsman'),attack=g.stats(sword).attack;assert.ok(g.research('forging'));g.updateBuildings(24);assert.equal(g.stats(sword).attack,attack);g.updateBuildings(1);assert.equal(g.stats(sword).attack,attack+2);assert.match(g.researchReason('ironCasting'),/Imperial/);assert.match(g.researchReason('imperial'),/Workshop/);
 g.addBuilding('workshop',4,32);assert.ok(g.research('imperial'));g.updateBuildings(65);assert.equal(g.teams[0].age,4);assert.ok(g.train('trebuchet'));g.updateBuildings(38);assert.ok(g.units.some(u=>u.type==='trebuchet'&&!u.team));
 console.log('PASS: age prerequisites, timed research queues, immediate and future unit upgrades, monastery unlock, and Imperial siege production.');
}
{
 const {game:g}=boot();rich(g);g.teams[0].age=3;const stable=g.addBuilding('stable',0,24);g.buildings.filter(b=>b.type==='house'&&!b.team).slice(0,2).forEach(b=>b.alive=false);assert.equal(g.capacity(),25);assert.ok(g.train('knight'));assert.ok(g.train('knight'));assert.ok(g.train('knight'));assert.equal(g.queuedPopulation(0),6);assert.equal(g.train('knight'),false,'Queued units reserve their weighted population');
 g.buildings.find(b=>b.alive&&b.type==='house'&&!b.team).alive=false;g.updateBuildings(24);assert.equal(stable.queue.length,3,'House loss blocks completed production');g.addBuilding('house',-60,30);g.updateBuildings(.1);assert.equal(stable.queue.length,2);
 console.log('PASS: weighted population, queue reservations, and production stalling after houses are destroyed.');
}
{
 const {game:g}=boot();const spear=g.addUnit('spearman',0,34),knight=g.addUnit('knight',4,34,1),sword=g.addUnit('swordsman',4,37,1),archer=g.addUnit('archer',0,37),ram=g.addUnit('ram',6,34,1),treb=g.addUnit('trebuchet',0,40);
 assert.ok(g.damageAgainst(spear,knight)>g.damageAgainst(spear,sword)*4);assert.ok(g.damageAgainst(sword,spear)>g.damageAgainst(spear,sword));assert.equal(g.damageAgainst(archer,ram),1);assert.ok(g.damageAgainst(ram,g.playerTown)>80);assert.equal(g.damageAgainst(treb,{...g.enemyKeep,x:treb.x,z:treb.z}),167);
 spear.order='hold';const braced=g.damageAgainst(knight,spear,true);spear.order='idle';assert.equal(g.damageAgainst(knight,spear,true),braced+20);g.completeResearch('pikeman',0);assert.equal(spear.maxHp,110);assert.ok(g.damageAgainst(spear,knight)>50);
 g.updateVision();g.selectEntities([spear]);g.clearOrders();const pos={x:spear.x,z:spear.z};knight.x=spear.x+9;knight.z=spear.z;g.updateUnits(.1);assert.deepEqual({x:spear.x,z:spear.z},pos,'Braced spears do not chase');
 knight.x=10;knight.z=37;const hp=knight.hp;g.shoot(archer,knight,20);knight.x+=5;g.updateProjectiles(2);assert.equal(knight.hp,hp,'Arrows miss a target that moved after the shot');g.shoot(archer,knight,20);g.updateProjectiles(2);assert.equal(knight.hp,hp-20,'Stationary target receives impact damage');
 console.log('PASS: armor, spears versus cavalry, infantry and siege counters, braced charge defense, stand ground, and projectile hit/miss resolution.');
}
{
 const {game:g}=boot();const p=g.addUnit('priest',0,34),target=g.addUnit('knight',6,34,1),friend=g.addUnit('swordsman',2,34);g.updateVision();friend.hp-=25;const hp=friend.hp;g.updatePriest(p,1);assert.equal(friend.hp,hp+7,'Priests automatically heal allies');assert.equal(g.healUnit(p,target,1),false,'Cannot heal an enemy');
 const before=g.units.length,oldMesh=target.mesh;g.issueTarget([p],target);g.updatePriest(p,.1);assert.ok(p.conversion>0);assert.equal(p.faith,20,'Faith is spent when the chant starts');g.damage(p,1,target);assert.equal(p.conversion,0);assert.equal(target.team,1,'Damage interrupts conversion');
 p.faith=100;p.lastHit=-100;g.issueTarget([p],target);g.updatePriest(p,.1);target.x=22;g.updatePriest(p,.1);assert.equal(p.conversion,0,'Leaving range breaks the chant');
 target.x=6;p.faith=100;p.lastHit=-100;g.issueTarget([p],target);for(let i=0;i<70;i++)g.updatePriest(p,.1);assert.equal(target.team,0);assert.equal(target.mesh===oldMesh,false,'Converted unit receives its new team colors');assert.equal(g.units.length,before,'Conversion transfers an existing unit, not a duplicate');assert.ok(target.immuneUntil>g.getState().elapsed);assert.equal(g.getState().conversions,1);
 const enemyPriest=g.addUnit('priest',7,34,1);assert.match(g.conversionReason(enemyPriest,target),/resistant/);const ram=g.addUnit('ram',6,35,1);assert.match(g.conversionReason(p,ram),/Redemption/);g.completeResearch('redemption',0);assert.equal(g.conversionReason(p,ram),'');assert.match(g.conversionReason(p,g.enemyKeep),/enemy unit/);
 console.log('PASS: priest healing, paid chanting, damage/range interruption, ownership transfer, recoloring, conversion resistance, and Redemption requirements.');
}
{
 const {game:g}=boot();for(const u of g.units)u.alive=false;const soldier=g.addUnit('swordsman',0,34),enemy=g.addUnit('spearman',5,34,1),priest=g.addUnit('priest',-2,34);g.updateVision();const destination={x:14,z:35};g.issueMove([soldier],destination,true);g.updateUnits(.1);assert.ok(soldier.engaged);g.damage(enemy,1000,soldier);g.updateUnits(.1);assert.equal(soldier.order,'move');assert.ok(soldier.path.length);assert.deepEqual({...soldier.destination},destination,'Combat preserves the attack-march destination');
 soldier.hp-=2;g.issueMove([priest],{x:12,z:34},true);for(let i=0;i<8;i++)g.updateUnits(.1);assert.equal(soldier.hp,soldier.maxHp);assert.equal(priest.order,'move');assert.ok(priest.path.length,'A priest resumes its march after healing');
 console.log('PASS: attack marches resume after combat and after a priest stops to heal.');
}
{
 const {game:g}=boot();const enemy=g.units.find(u=>u.team===1);assert.equal(g.isVisibleAt(enemy.x,enemy.z),false);assert.equal(enemy.mesh.visible,false);const scout=g.units.find(u=>!u.team&&u.type==='spearman');scout.x=enemy.x;scout.z=enemy.z;g.updateVision();assert.ok(g.isVisibleAt(enemy.x,enemy.z));assert.ok(enemy.mesh.visible);assert.ok(g.enemyKeep.discovered);scout.x=-20;scout.z=20;g.updateVision();assert.equal(enemy.mesh.visible,false);assert.ok(g.enemyKeep.mesh.visible,'Scouted structures remain known');
 const u=g.units.find(u=>!u.team&&u.type==='villager');assert.ok(g.requestGarrison([u],g.playerTown));u.x=g.playerTown.x+g.playerTown.radius+1;u.z=g.playerTown.z;g.updateUnits(.1);assert.equal(u.garrisoned,g.playerTown);const hp=u.hp;g.damage(u,999,enemy);assert.equal(u.hp,hp,'Garrisoned units are sheltered');g.ungarrison(g.playerTown);assert.equal(u.garrisoned,null);assert.equal(u.order,'gather','Workers resume jobs after leaving shelter');
 const gold=g.stock.gold,wood=g.stock.wood;assert.ok(g.trade('wood'));assert.ok(g.stock.gold>gold);assert.ok(g.trade('wood',true));assert.equal(g.stock.wood,wood);assert.ok(g.stock.gold<gold,'Market spread prevents arbitrage');
 console.log('PASS: fog hides enemy units, scouting remembers structures, garrison shelter and job restoration, and market price/spread behavior.');
}
{
 const {game:g}=boot();Object.assign(g.teams[1].stock,{food:0,wood:0,gold:0,stone:0});const n=g.units.length;assert.ok(g.launchRaid());assert.equal(g.units.length,n,'Mobilization cannot spawn free units');assert.equal(g.launchRaid(),false,'Committed army cannot be duplicated');g.updateAI(12);assert.equal(g.units.length,n);assert.equal(g.buildings.filter(b=>b.team===1).reduce((n,b)=>n+b.queue.length,0),0,'An empty enemy treasury cannot recruit');
 Object.assign(g.teams[1].stock,{food:60,wood:25});assert.ok(g.train('spearman',1));assert.equal(g.teams[1].stock.food,0);assert.equal(g.teams[1].stock.wood,0);g.updateBuildings(13);assert.equal(g.units.length,n+1);
 g.damage(g.enemyKeep,10000,g.playerTown);assert.equal(g.getState().ended,true);assert.equal(g.getState().paused,true);
 const defeat=boot().game;defeat.damage(defeat.playerTown,10000,defeat.enemyKeep);assert.equal(defeat.getState().ended,true);assert.equal(defeat.getState().paused,true);
 console.log('PASS: paid AI recruitment, finite armies and raids, conquest victory, and landmark defeat.');
}
{
 const {game:g}=boot();g.playerTown.hp=g.playerTown.maxHp=1e7;advance(g,480);
 assert.ok(g.teams[1].age>=3,'AI saves for Castle Age');assert.ok(g.buildings.some(b=>b.team===1&&b.type==='monastery'&&b.built),'AI physically builds a monastery');assert.ok(g.units.some(u=>u.team===1&&u.type==='priest'),'AI pays to recruit priests');
 for(const team of g.teams)for(const n of Object.values(team.stock))assert.ok(Number.isFinite(n)&&n>=0,'Treasuries stay finite and nonnegative');for(const u of g.units)assert.ok(Number.isFinite(u.x)&&Number.isFinite(u.z)&&Number.isFinite(u.hp));
 console.log('PASS: an eight-minute simulation sustains both economies, enemy age progression, monastery construction, and priest recruitment without invalid state.');
}
assert.equal(errors.length,0,errors.join('\n'));
console.log('All RTS simulation checks passed. GPU rendering and real browser controls are verified separately.');
