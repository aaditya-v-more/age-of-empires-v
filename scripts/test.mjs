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
function boot(storage = new Map(), options = {}) {
  const { document, window } = parseHTML(html);
  const noop = () => {};
  const context2d = new Proxy({}, { get: (target, key) => key in target ? target[key] : key === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop, set: (target, key, value) => (target[key] = value, true) });
  window.HTMLCanvasElement.prototype.getContext = () => context2d;
  window.HTMLElement.prototype.focus = noop;
  window.HTMLCanvasElement.prototype.setPointerCapture = noop;
  window.HTMLCanvasElement.prototype.releasePointerCapture = noop;
  const events = new Map();
  const timeouts = [];
  const sandbox = {
    document, innerWidth: options.width ?? 1440, innerHeight: options.height ?? 900, devicePixelRatio: 1,
    matchMedia: () => ({ matches: !!options.coarse }),
    console: { log: noop, warn: (...args) => errors.push(args.join(' ')), error: (...args) => errors.push(args.join(' ')) },
    performance, Math, Date, Float32Array, Uint8Array, Int32Array, Uint16Array, Uint32Array,
    setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; }, clearTimeout: noop,
    requestAnimationFrame: fn => { sandbox.frame = fn; },
    addEventListener: (name, fn) => { events.set(name, fn); },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    reloadCount: 0, location: { reload: () => { sandbox.reloadCount++; } }, __EMERALD_TEST__: {},
  };
  sandbox.fullscreenRequests = 0;
  sandbox.fullscreenExits = 0;
  if (options.fullscreen !== undefined) {
    document.documentElement.requestFullscreen = async () => {
      sandbox.fullscreenRequests++;
      if (options.fullscreen === 'reject') throw new Error('Fullscreen rejected');
      document.fullscreenElement = document.documentElement;
      document.dispatchEvent(new window.Event('fullscreenchange'));
    };
    document.exitFullscreen = async () => {
      sandbox.fullscreenExits++;
      document.fullscreenElement = null;
      document.dispatchEvent(new window.Event('fullscreenchange'));
    };
  }
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(engine, sandbox, { timeout: 10000 });
  vm.runInContext(`THREE = { ...THREE, WebGLRenderer: class {
    constructor({canvas}) { this.domElement = canvas; this.shadowMap = {}; }
    setPixelRatio() {} setSize() {} render(scene, camera) { scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); }
  }};`, sandbox);
  vm.runInContext(source, sandbox, { timeout: 30000 });
  if (options.autoStart !== false) document.getElementById('btn-start')?.onclick();
  return { game: sandbox.__EMERALD_TEST__, document, events, timeouts, sandbox, storage };
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
const snapshot = g => { const data=JSON.parse(JSON.stringify(g.captureBattle())); delete data.savedAt; return data; };
{
 const first=boot(),g=first.game;advance(g,24);rich(g);
 g.completeResearch('castle',0);g.completeResearch('wheelbarrow',0);g.completeResearch('pikeman',0);g.completeResearch('sanctity',0);
 const site=g.construct('barracks',-3,24);assert.ok(site);for(const u of g.units.filter(u=>u.target===site)){u.x=site.x+site.radius+1;u.z=site.z;u.path=[];}
 const barracks=g.addBuilding('barracks',-15,43),smith=g.addBuilding('blacksmith',-26,43);g.selectEntities([barracks]);assert.ok(g.train('spearman'));assert.ok(g.train('swordsman'));assert.ok(g.research('forging'));g.updateBuildings(4);
 const sheltered=g.units.filter(u=>!u.team&&u.type==='villager')[4];g.requestGarrison([sheltered],g.playerTown);sheltered.x=g.playerTown.x+g.playerTown.radius+1;sheltered.z=g.playerTown.z;g.updateUnits(.1);assert.equal(sheltered.garrisoned,g.playerTown);
 const priest=g.addUnit('priest',-30,53),converted=g.units.find(u=>u.team===1&&u.type==='archer');converted.x=-34;converted.z=55;g.convertUnit(priest,converted);
 const target=g.addUnit('knight',-24,53,1);target.order='hold';g.updateVision();g.issueTarget([priest],target);g.updatePriest(priest,2);assert.ok(priest.conversion>0&&priest.conversion<7);
 const hauler=g.units.find(u=>!u.team&&u.type==='villager'&&u.order==='gather');hauler.cargo={type:'food',amount:7.25};hauler.order='return';hauler.dropoff=g.playerTown;
 const mine=g.resources.find(r=>r.type==='gold');mine.amount=0;g.resources.find(r=>r.type==='wood').amount=123.5;
 g.damage(g.buildings.find(b=>b.type==='house'&&!b.team),9999,g.enemyKeep);g.damage(g.units.find(u=>u.team===1&&u.type==='spearman'),9999,priest);
 barracks.rally={x:-10,z:45};g.playerTown.rallyTarget=mine;g.playerTown.rally={x:mine.x,z:mine.z};
 g.issueMove([converted],{x:-20,z:60},true);g.shoot(converted,target,13);g.updateProjectiles(.05);assert.equal(g.projectiles.length,1);
 g.trade('wood');g.controlGroups.set('5',[priest,converted]);g.selectEntities([priest,converted]);g.explored[0]=1;g.cameraTarget.set(-2,0,17);g.cameraDesired.set(7,0,22);first.document.getElementById('btn-speed').onclick();g.updateUI();
 assert.ok(g.saveBattle());const before=snapshot(g),saved=first.storage.get(g.SAVE_KEY);g.validateBattle(JSON.parse(saved));
 const second=boot(first.storage),restored=second.game;assert.equal(restored.getState().paused,true);assert.equal(second.document.getElementById('modal-title').textContent,'Your reign continues.');
 assert.deepEqual(snapshot(restored),before,'A fresh runtime restores the complete simulation snapshot without advancing time');
 const p=restored.units.find(u=>u.id===priest.id),t=restored.units.find(u=>u.id===target.id),worker=restored.units.find(u=>u.id===sheltered.id);
 assert.equal(p.target,t);assert.equal(p.channelTarget,t);assert.equal(worker.garrisoned,restored.playerTown);assert.ok(restored.playerTown.garrison.includes(worker));assert.equal(restored.projectiles[0].target,t);
 assert.equal(restored.units.find(u=>u.id===converted.id).team,0);assert.equal(restored.units.find(u=>u.id===hauler.id).dropoff,restored.playerTown);assert.equal(restored.units.find(u=>u.id===hauler.id).cargo.amount,7.25);
 const ruins=restored.buildings.find(b=>b.kind==='building'&&!b.alive);assert.equal(ruins.mesh.scale.y,.16);assert.ok(restored.buildings.find(b=>b.id===site.id).scaffold.visible);
 second.document.getElementById('btn-resume-save').onclick();assert.equal(restored.getState().paused,false);
 advance(g,6);advance(restored,6);g.updateUI();restored.updateUI();assert.deepEqual(snapshot(restored),snapshot(g),'Jobs, paid queues, attacks, RNG, and conversion continue identically after reloading');assert.equal(t.team,0,'The saved priest chant completes after resuming');
 console.log(`PASS: full save/reload round trip (${Math.round(saved.length/1024)} KB), both economies, queued research/recruits, construction, cargo, depleted mines, garrisons, converted models, mid-flight arrows, fog, camera, control groups, and deterministic continuation.`);
}
{
 const run=boot(),g=run.game;run.sandbox.frame(1000);for(let i=1;i<=110;i++)run.sandbox.frame(1000+i*50);
 const periodic=JSON.parse(run.storage.get(g.SAVE_KEY));assert.ok(periodic.state.elapsed>=4.9,'A running match autosaves every five real seconds');
 g.stock.gold=431;run.events.get('beforeunload')();assert.equal(JSON.parse(run.storage.get(g.SAVE_KEY)).teams[0].stock.gold,431);
 g.stock.gold=432;run.events.get('pagehide')();assert.equal(JSON.parse(run.storage.get(g.SAVE_KEY)).teams[0].stock.gold,432);
 g.stock.gold=433;Object.defineProperty(run.document,'hidden',{value:true,configurable:true});run.document.dispatchEvent(new run.document.defaultView.Event('visibilitychange'));assert.equal(g.getState().paused,true);assert.equal(JSON.parse(run.storage.get(g.SAVE_KEY)).teams[0].stock.gold,433);
 const elapsed=g.getState().elapsed,restored=boot(run.storage);restored.sandbox.frame(1000);restored.sandbox.frame(36000000);assert.equal(restored.game.getState().elapsed,elapsed,'Time away never simulates an unattended battle');
 restored.document.getElementById('btn-new-save').onclick();restored.document.getElementById('btn-cancel-restart').onclick();assert.ok(run.storage.has(g.SAVE_KEY),'Cancelling a new reign retains the save');
 restored.game.pauseGame();restored.document.getElementById('btn-pause-restart').onclick();restored.document.getElementById('btn-confirm-restart').onclick();assert.equal(restored.sandbox.reloadCount,1);restored.events.get('beforeunload')();restored.events.get('pagehide')();assert.equal(run.storage.has(g.SAVE_KEY),false);assert.equal(run.storage.has(g.BACKUP_KEY),false);
 const fresh=boot(run.storage);assert.equal(fresh.game.getState().elapsed,0);assert.equal(fresh.game.getState().paused,false);assert.equal(fresh.game.stock.gold,240);
 console.log('PASS: periodic, refresh, page-close, and hidden-tab saves; paused restoration; no offline advancement; confirmed new game clears both saves without the exit handler writing the old battle back.');
}
{
 const original=boot(),g=original.game;advance(g,12);g.saveBattle();const previous=original.storage.get(g.SAVE_KEY);advance(g,7);g.saveBattle();original.storage.set(g.SAVE_KEY,'{broken JSON');
 const recovered=boot(original.storage);assert.equal(recovered.game.getState().elapsed,JSON.parse(previous).state.elapsed);assert.match(recovered.document.getElementById('modal-content').textContent,/BACKUP RECOVERED/);assert.ok(recovered.game.saveBattle());assert.equal(original.storage.get(g.BACKUP_KEY),previous);
 const corrupt=JSON.parse(original.storage.get(g.SAVE_KEY));corrupt.entities.find(e=>e.kind==='unit').target=999999;original.storage.set(g.SAVE_KEY,JSON.stringify(corrupt));original.storage.set(g.BACKUP_KEY,'broken backup');
 const blocked=boot(original.storage),bad=original.storage.get(g.SAVE_KEY);assert.equal(blocked.game.getState().saveBlocked,true);assert.equal(blocked.game.getState().paused,true);blocked.game.resume();blocked.events.get('pagehide')();assert.equal(blocked.game.getState().paused,true);assert.equal(original.storage.get(g.SAVE_KEY),bad,'Invalid data is preserved until the player explicitly starts over');
 corrupt.version=99;original.storage.set(g.SAVE_KEY,JSON.stringify(corrupt));original.storage.set(g.BACKUP_KEY,previous);const future=boot(original.storage);assert.equal(future.game.getState().saveBlocked,true,'An incompatible newer save is not overwritten with an older backup');
 const denied=new Map();denied.get=()=>{throw new Error('Storage disabled');};const unavailable=boot(denied);assert.equal(unavailable.game.getState().paused,false);assert.equal(unavailable.game.getState().saveReady,false);advance(unavailable.game,1);assert.ok(Math.abs(unavailable.game.getState().elapsed-1)<1e-8);
 const quota=boot(),old=quota.storage.get(quota.game.SAVE_KEY);quota.storage.set=()=>{throw new Error('Quota exceeded');};quota.game.stock.gold=444;assert.equal(quota.game.saveBattle(),false);assert.equal(quota.storage.get(quota.game.SAVE_KEY),old);assert.equal(quota.document.getElementById('save-status').textContent,'Save unavailable');
 console.log('PASS: corrupt-save recovery, invalid references, incompatible versions, storage denial, and quota failure preserve prior saves and do not crash the game.');
}
{
 const first=boot(),g=first.game,initial=first.storage.get(g.SAVE_KEY),second=boot(first.storage);assert.ok(second.game.saveBattle());assert.equal(first.storage.get(g.SAVE_KEY),initial,'An unchanged restored battle needs no new write');
 advance(second.game,3);second.game.saveBattle();const latest=first.storage.get(g.SAVE_KEY);g.pauseGame();assert.equal(g.getState().saveBlocked,true);assert.equal(g.getState().paused,true);assert.match(first.document.getElementById('modal-content').textContent,/Load latest battle/);first.events.get('pagehide')();assert.equal(first.storage.get(g.SAVE_KEY),latest,'An older tab cannot overwrite newer progress');
 const reloaded=boot(first.storage);assert.equal(reloaded.game.getState().elapsed,second.game.getState().elapsed);reloaded.game.newBattle();second.events.get('beforeunload')();assert.equal(first.storage.has(g.SAVE_KEY),false,'An older tab cannot resurrect a cleared battle');
 const slow=boot();slow.sandbox.frame(1000);slow.sandbox.frame(6500);assert.ok(JSON.parse(slow.storage.get(slow.game.SAVE_KEY)).state.elapsed>0,'A slow frame still saves after five wall-clock seconds');
 console.log('PASS: stale tabs cannot overwrite newer saves or resurrect a restarted match; autosave timing remains correct with slow frames.');
}
{
 for(const win of [true,false]){const run=boot(),g=run.game;advance(g,10);g.damage(win?g.enemyKeep:g.playerTown,10000,win?g.playerTown:g.enemyKeep);g.saveBattle();const restored=boot(run.storage);assert.equal(restored.game.getState().ended,true);assert.equal(restored.game.getState().paused,true);assert.equal(restored.game.getState().battleResult,win?'victory':'defeat');assert.match(restored.document.getElementById('modal-content').textContent,win?/CONQUEST VICTORY/:/THE MARCH HAS FALLEN/);restored.document.getElementById('btn-restart').onclick();restored.events.get('pagehide')();assert.equal(run.storage.has(g.SAVE_KEY),false);}
 console.log('PASS: victory and defeat survive reloads, and the result screen starts a fresh reign correctly.');
}

// Touch controls execute the same orders as desktop input, using real projected world coordinates.
function pointer(run, type, x, y, id = 1, extra = {}) {
 const event = new run.document.defaultView.Event(type, {bubbles:true,cancelable:true});
 Object.assign(event,{clientX:x,clientY:y,pointerId:id,pointerType:'touch',button:0,shiftKey:false,altKey:false,...extra});
 run.document.getElementById('world').dispatchEvent(event);
}
function tap(run, point) { pointer(run,'pointerdown',point.x,point.y);pointer(run,'pointerup',point.x,point.y); }
{
 const run=boot(new Map(),{width:390,height:844,coarse:true,autoStart:false,fullscreen:'allow'}),g=run.game,d=run.document;
 assert.equal(g.getState().paused,true,'A fresh battle waits for the explicit Start gesture');
 assert.equal(run.sandbox.fullscreenRequests,0,'Loading a game never requests fullscreen');
 assert.ok(d.body.classList.contains('compact-ui'));
 assert.equal(d.querySelectorAll('[data-creator-links]').length,1);
 assert.deepEqual([...d.querySelectorAll('[data-creator-links] a')].map(a=>a.href),['https://aadityamore.com/','https://github.com/aaditya-v-more','https://www.linkedin.com/in/aadityavmore/']);
 await d.getElementById('btn-start').onclick();
 assert.equal(g.getState().paused,false);assert.equal(run.sandbox.fullscreenRequests,1);assert.equal(g.isFullscreen(),true);
 assert.equal(d.getElementById('btn-fullscreen').getAttribute('aria-label'),'Exit fullscreen');
 assert.equal(d.getElementById('modal-shade').classList.contains('open'),false,'Creator links live in the closed menu during active play');
 assert.equal(d.getElementById('action-grid').children.length,3,'Compact actions have readable three-card pages');
 assert.match(d.getElementById('production-status').textContent,/choose Order, then tap/,'Compact rally instructions match the touch input mode');
 g.stock.wood=12345;g.updateUI();assert.equal(d.getElementById('res-wood').textContent,'12.3k','Large stockpiles fit the compact HUD');assert.match(d.getElementById('mobile-age-time').textContent,/Feudal Age/);g.saveBattle();assert.equal(d.getElementById('mobile-save-status').textContent,'Saved locally');
 d.getElementById('btn-actions').onclick();assert.equal(d.body.dataset.mobilePanel,'actions');
 d.getElementById('btn-map').onclick();assert.equal(d.body.dataset.mobilePanel,'map');assert.equal(d.getElementById('btn-actions').getAttribute('aria-expanded'),'false');
 d.getElementById('btn-map').onclick();assert.equal(d.body.dataset.mobilePanel,'');
 d.getElementById('tab-build').onclick();const seen=[];
 do { seen.push(...[...d.querySelectorAll('#action-grid .action-name')].map(el=>el.textContent));if(d.getElementById('page-next').disabled)break;d.getElementById('page-next').onclick(); } while(seen.length<30);
 assert.equal(seen.length,12);assert.equal(new Set(seen).size,12);assert.ok(seen.includes('Market'),'Pagination keeps every building reachable');
 run.sandbox.innerWidth=1440;run.sandbox.innerHeight=900;run.sandbox.matchMedia=()=>({matches:false});run.events.get('resize')();
 assert.equal(d.body.classList.contains('compact-ui'),false);assert.equal(d.getElementById('action-grid').children.length,6,'Desktop retains six action cards after rotation/resizing');g.updateUI();assert.match(d.getElementById('production-status').textContent,/RIGHT-CLICK/,'Desktop retains its mouse rally instructions');
 assert.equal(d.body.dataset.mobilePanel,'');
 await g.toggleFullscreen();assert.equal(run.sandbox.fullscreenExits,1);assert.equal(d.getElementById('btn-fullscreen').getAttribute('aria-pressed'),'false');
 g.pauseGame();assert.ok(d.querySelector('#modal-content [data-creator-links]'));await d.getElementById('btn-resume').onclick();
 assert.equal(run.sandbox.fullscreenRequests,1,'A deliberate fullscreen exit is respected on Resume');
 await g.toggleFullscreen();assert.equal(run.sandbox.fullscreenRequests,2);
 run.document.fullscreenElement=null;g.pauseGame();await d.getElementById('btn-resume').onclick();
 assert.equal(run.sandbox.fullscreenRequests,3,'Resume requests fullscreen while the player prefers it');
 console.log('PASS: explicit Start, fullscreen preference/toggle/resume, menu-only creator links, one compact panel at a time, all 12 buildings across pages, and desktop layout restoration.');
}
{
 for(const fullscreen of [undefined,'reject']){
  const run=boot(new Map(),{width:375,height:812,autoStart:false,fullscreen});await run.document.getElementById('btn-start').onclick();
  assert.equal(run.game.getState().paused,false,'Unsupported or rejected fullscreen never blocks play');
  assert.equal(run.game.isFullscreen(),false);assert.match(run.document.getElementById('notices').textContent,/Fullscreen/);
 }
 const phone=boot(new Map(),{width:932,height:430,coarse:true});assert.equal(phone.game.compactLayout(),true,'Landscape touch devices use the compact UI even above 900 px');phone.sandbox.innerWidth=1024;phone.sandbox.innerHeight=1366;phone.events.get('resize')();assert.equal(phone.game.compactLayout(),true,'Large touch tablets must retain the Order and Group controls');
 console.log('PASS: denied and unsupported fullscreen continue normally; wide landscape phones retain compact controls.');
}
{
 const run=boot(new Map(),{width:390,height:844,coarse:true}),g=run.game,d=run.document;
 g.setPaused(false);stopWorkers(g);g.updateCamera(0);const u=g.units.find(u=>!u.team&&u.type==='villager'),point=g.projected(u);
 g.selectEntities([]);tap(run,point);assert.equal(g.getState().selected[0],u,'Select mode taps inspect a friendly unit');
 const before={x:g.cameraDesired.x,z:g.cameraDesired.z};pointer(run,'pointerdown',180,320);pointer(run,'pointermove',220,360);pointer(run,'pointerup',220,360);
 assert.notDeepEqual({x:g.cameraDesired.x,z:g.cameraDesired.z},before,'Select mode drags pan the camera');assert.equal(g.getState().selected[0],u,'Camera dragging keeps the selection');
 g.updateCamera(1);const p=g.projected(u),camera={x:g.cameraDesired.x,z:g.cameraDesired.z};g.setTouchMode('group');
 pointer(run,'pointerdown',p.x-24,p.y-24);pointer(run,'pointermove',p.x+24,p.y+24);pointer(run,'pointerup',p.x+24,p.y+24);
 assert.ok(g.getState().selected.includes(u),'Group mode drag selects units in a screen rectangle');assert.deepEqual({x:g.cameraDesired.x,z:g.cameraDesired.z},camera,'Group mode does not pan');
 const n=g.getState().selected.length;tap(run,p);assert.equal(g.getState().selected.length,n-1,'Group mode tap removes a selected unit');
 g.selectEntities([g.playerTown]);g.setTouchMode('order');const rally={x:165,y:410};tap(run,rally);assert.ok(g.playerTown.rally,'Touch orders can set a production-building rally point');
 g.selectEntities([u]);g.setTouchMode('order');const wood=g.resources.find(r=>r.type==='wood'&&g.isVisibleAt(r.x,r.z));tap(run,g.projected(wood,0));assert.equal(u.order,'gather');assert.equal(u.gatherTarget,wood,'Touch orders dispatch gathering to the same economic system');
 const targetBefore=u.gatherTarget;pointer(run,'pointerdown',140,330,1);pointer(run,'pointerdown',240,330,2);pointer(run,'pointermove',280,330,2);pointer(run,'pointerup',140,330,1);pointer(run,'pointerup',280,330,2);
 assert.equal(u.gatherTarget,targetBefore,'Pinch release never issues an unintended command');assert.equal(d.getElementById('selection-rectangle').style.display,'none');
 rich(g);g.setMobilePanel('actions');g.startPlacement('barracks');assert.equal(d.body.dataset.mobilePanel,'','Starting construction clears the command drawer');assert.match(d.getElementById('placement-help').textContent,/Tap clear ground/);d.getElementById('btn-cancel-placement').onclick();assert.equal(d.getElementById('placement-badge').style.display,'none');
 console.log('PASS: touch selection, camera pan, drag-box groups, additive group taps, building rallies, gathering orders, pinch suppression, and construction cancellation.');
}

{
 for(const pointerType of ['mouse','pen']){
  const run=boot(new Map(),{width:740,height:360}),g=run.game,d=run.document;
  const event=(type,x,y)=>pointer(run,type,x,y,1,{pointerType});
  const click=p=>{event('pointerdown',p.x,p.y);event('pointerup',p.x,p.y);};
  stopWorkers(g);g.updateCamera(0);g.selectEntities([g.playerTown]);
  d.getElementById('touch-order').onclick();click({x:590,y:180});
  assert.ok(g.playerTown.rally,`${pointerType} uses the visible Order control to set a rally`);
  assert.equal(g.getState().selected[0],g.playerTown,`${pointerType} Order keeps its selection`);
  d.getElementById('touch-select').onclick();const u=g.units.find(u=>!u.team&&u.type==='villager'),p=g.projected(u);click(p);
  assert.equal(g.getState().selected[0],u,`${pointerType} Select inspects a unit`);
  const before={x:g.cameraDesired.x,z:g.cameraDesired.z};event('pointerdown',180,160);event('pointermove',220,200);event('pointerup',220,200);
  assert.notDeepEqual({x:g.cameraDesired.x,z:g.cameraDesired.z},before,`${pointerType} Select drags pan in compact mode`);
  g.updateCamera(1);const point=g.projected(u),camera={x:g.cameraDesired.x,z:g.cameraDesired.z};d.getElementById('touch-group').onclick();
  event('pointerdown',point.x-24,point.y-24);event('pointermove',point.x+24,point.y+24);event('pointerup',point.x+24,point.y+24);
  assert.ok(g.getState().selected.includes(u),`${pointerType} Group drags select units`);
  assert.deepEqual({x:g.cameraDesired.x,z:g.cameraDesired.z},camera,`${pointerType} Group does not pan`);
  const count=g.getState().selected.length;click(point);assert.equal(g.getState().selected.length,count-1,`${pointerType} Group clicks remove a selected unit`);
 }
 const run=boot(),g=run.game;stopWorkers(g);g.updateCamera(0);g.setTouchMode('order');g.selectEntities([g.playerTown]);const u=g.units.find(u=>!u.team&&u.type==='villager'),point=g.projected(u);
 pointer(run,'pointerdown',point.x,point.y,1,{pointerType:'mouse'});pointer(run,'pointerup',point.x,point.y,1,{pointerType:'mouse'});
 assert.equal(g.getState().selected[0],u,'Full desktop left-click still selects, regardless of an earlier compact control mode');assert.equal(g.playerTown.rally,null);
 g.selectEntities([g.playerTown]);pointer(run,'pointerdown',point.x,point.y,1,{pointerType:'mouse',button:2});pointer(run,'pointerup',point.x,point.y,1,{pointerType:'mouse',button:2});assert.ok(g.playerTown.rally,'Full desktop right-click still commands');
 console.log('PASS: visible compact Select/Order/Group controls work with mouse and pen; full desktop left/right-click semantics remain unchanged.');
}

assert.equal(errors.length,0,errors.join('\n'));
console.log('All RTS simulation checks passed. GPU rendering and real browser controls are verified separately.');
