const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function setup(ev) {
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0");
}

test('big selective peers refuse in some cities, with a reason, and only for a while', () => {
  const { ev, errors } = load();
  setup(ev);
  const r = JSON.parse(ev(`(()=>{let tot=0,hit=0,small=0,ex=null;
    for(const n of NETS){for(const c of ALLC){const sn=snub(n.id,c);
      if(!bigPeer(n)){if(sn)small++;continue;}tot++;if(sn){hit++;ex=ex||{id:n.id,c,sn};}}}
    return JSON.stringify({tot,hit,small,ex});})()`));
  assert.equal(r.small, 0, 'small networks never snub');
  assert.ok(r.hit > 0 && r.hit < r.tot * 0.4, `some but not most pairs snub (${r.hit}/${r.tot})`);
  const { id, c, sn } = r.ex;
  assert.equal(ev(`JSON.stringify(snub('${id}','${c}'))`), JSON.stringify(sn), 'stable when asked again');
  const why = ev(`peerOk('${id}','ix','${c}').why`);
  assert.match(why, /reconsider in \d+ day/);
  assert.equal(ev(`peerOk('${id}','pni','${c}').snub===true`), sn.all, 'PNI is only refused for region-wide snubs');
  ev(`S.day=${sn.until}`);
  assert.equal(ev(`!!(snub('${id}','${c}')&&snub('${id}','${c}').until===${sn.until})`), false, 'the window ends');
  assert.deepEqual(errors, []);
});

test('a snubbing peer tears down an existing session and the Request button explains why', () => {
  const { ev, errors } = load();
  setup(ev);
  const k = ev(`(()=>{const ok=['fra','ams','lon','par','nyc','ash','sjc','sin','tok','hkg','mad','mrs','jnb'];
    for(let d=0;d<600;d++)for(const n of NETS)for(const c of ok){if(!ixMembers(c).includes(n.id))continue;
      S.day=d;const a=snub(n.id,c);S.day=d+1;const b=snub(n.id,c);S.day=0;if(!a&&b)return n.id+'@'+c+'@'+d;}})()`);
  assert.ok(k, 'found a snub starting at an IX');
  const [id, c, d] = k.split('@');
  ev(`S.day=${d}`);
  ev(`ACT.buildPop({city:'${c}'});ACT.buyIx({city:'${c}',tier:1,signed:true});S.peers['${id}@${c}']=true;compute()`);
  assert.equal(ev(`ixSessions('${c}').has('${id}')`), true);
  ev('dayTick()');
  assert.equal(ev(`!!S.peers['${id}@${c}']`), false, 'session torn down');
  assert.ok(ev(`S.log.some(e=>/de-peered you/.test(e.t))`));
  ev(`selectCity('${c}');ACT.tab({t:'peer'})`);
  assert.match(ev("document.getElementById('panelBody').textContent"), /reconsider in/);
  assert.deepEqual(errors, []);
});

test('remote peering is offered but costs more, gives less and gets refused more', () => {
  const { ev, errors } = load();
  setup(ev);
  const fab = ev("(FABS.find(f=>f.cities.includes('fra')&&f.cities.includes('ams'))||{}).id");
  assert.ok(fab, 'a fabric covers fra and ams');
  ev(`ACT.buyNni?ACT.buyNni({city:'fra',prov:'${fab}',tier:1}):0`);
  ev(`if(!S.links.some(l=>l.kind==='vxc')){const km=kmBetween('fra','ams');S.links.push({id:uid(),a:'fra',b:'ams',kind:'vxc',prov:'${fab}',vt:1,km,sub:false,mo:vxcMo(km,false,1),cut:0,day:S.day})}`);
  assert.ok(ev("remoteCities().includes('ams')"));
  ev("selectCity('ams');ACT.tab({t:'peer'})");
  const txt = () => ev("document.getElementById('panelBody').textContent");
  ev("ACT.buyIx({city:'ams',tier:1});compute()");
  assert.equal(ev("isRemote('ams')"), true);
  assert.equal(ev("ixPortMo('ams',1)"), ev("Math.round(PORT[1].ix*1.5*ixMul('ams'))"), 'reseller markup');
  assert.equal(ev("ixCap('ams')"), ev("PORT[1].g*0.8"), 'oversubscribed port');
  const refusers = JSON.parse(ev("JSON.stringify(ixMembers('ams').filter(id=>noRemote(id)&&!snub(id,'ams')))"));
  assert.ok(refusers.length > 0, 'some members refuse remote peers');
  const r = JSON.parse(ev(`JSON.stringify(peerOk('${refusers[0]}','ix','ams'))`));
  assert.equal(r.ok, false); assert.equal(r.remote, true);
  assert.equal(ev(`noRemote('drz')`), false, 'open networks still peer, also via the route server');
  ev("ACT.rs({city:'ams'});compute()");
  assert.ok(ev("ixSessions('ams').size") > 0);
  ev("selectCity('ams');ACT.tab({t:'peer'})");
  assert.match(txt(), /refuse remote peers/);
  ev("ACT.buildPop({city:'ams'});compute()");
  assert.equal(ev("isRemote('ams')"), false, 'a real POP makes it local again');
  assert.equal(ev(`peerOk('${refusers[0]}','ix','ams').remote`), undefined);
  assert.deepEqual(errors, []);
});

test('DE-KICKS hides prices, haggles, harmonises upwards, auto-enrolls add-ons and fights to keep you', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("selectCity('fra');ACT.tab({t:'peer'})");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Price on request/);
  ev("ACT.buyIx({city:'fra',tier:1})");
  assert.equal(ev("S.ixp.fra===undefined"), true, 'no port without signing');
  assert.match(ev("document.getElementById('modalCard').textContent"), /Confidential/);
  ev("S.dk.q.m=1.5;ACT.dkAccept()");
  assert.equal(ev("S.ixp.fra"), 1);
  assert.equal(ev("ixPortMo('fra',1)"), ev("Math.round(PORT[1].ix*1.5*ixMul('fra'))"));
  // haggling always moves something
  ev("S.dk.q={city:'mad',tier:1,m:1.5,h:0}");
  for (let i = 0; i < 3; i++) ev("if(S.dk.q)ACT.dkHaggle()");
  assert.ok(ev("!S.dk.q||S.dk.q.m!==1.5||S.dk.stall>S.day"));
  // yearly harmonisation
  const m0 = ev("S.dk.m.fra");
  ev("let n=0;while(n++<400){S.day++;if((S.day+hstr('fra')%90)%365===0)break;}S.day--;dkTick(S.day+1)");
  assert.ok(ev("S.dk.m.fra") > m0, 'price went up');
  // add-ons show up on the invoice until you opt out (twice)
  ev("S.dk.add.fra=[{n:'Route Server Gold',blurb:'gold',mo:500,day:S.day}]");
  assert.equal(ev("dkAddonMo('fra')"), 500);
  ev("selectCity('fra');ACT.tab({t:'peer'})");
  assert.match(ev("document.getElementById('panelBody').textContent"), /auto-enrolled/);
  ev("ACT.dkOptOut({city:'fra',n:'Route Server Gold'})");
  assert.equal(ev("S.dk.add.fra.length"), 1, 'first click only asks');
  ev("ACT.dkOptOut({city:'fra',n:'Route Server Gold'})");
  assert.equal(ev("S.dk.add.fra.length"), 0);
  // leaving: a retention offer first
  ev("ACT.cancelIx({city:'fra'});ACT.cancelIx({city:'fra'})");
  assert.match(ev("document.getElementById('modalCard').textContent"), /Before you go/);
  const full = ev("ixPortMo('fra',1)");
  ev("ACT.dkStay({city:'fra'})");
  assert.ok(ev("ixPortMo('fra',1)") < full, 'promo price');
  ev("ACT.cancelIx({city:'fra'});ACT.cancelIx({city:'fra'})");
  assert.equal(ev("S.ixp.fra"), undefined, 'second time you can actually leave');
  ev("ACT.buildPop({city:'ams'})");
  assert.equal(ev("ixPortMo('ams',1)"), ev("Math.round(PORT[1].ix*ixMul('ams'))"), 'other IXs keep open pricing');
  assert.deepEqual(errors, []);
});

test('a peer at a rival exchange can de-peer you without stopping the game', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  const ix = ev('Object.keys(XIXM)[0]');
  ev(`S.peers['ggl@${ix}']=true;window.snub=()=>({why:'Testing.'})`);
  ev('dayTick()');
  assert.equal(ev(`'ggl@${ix}' in S.peers`), false);
  assert.match(ev("document.getElementById('toasts').textContent"), new RegExp(`de-peered you at ${ev(`ixName('${ix}')`)} in ${ev(`CITY[ixCity('${ix}')].name`)}`));
  assert.deepEqual(errors, []);
});

test('an IX meltdown at a rival exchange names the city, and a failing day tick does not stop the game', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;ACT.buildPop({city:'ams'});ACT.buyIx({city:'ams~2',tier:1});S.day=100");
  const src = ev('fireFailure.toString()').replace(/^function fireFailure/, 'function')
    .replace('let tot=opts.reduce', "opts.splice(0,opts.length,['funny',1]);let tot=opts.reduce")
    .replace('type=pick(f);}', "type='maxpfx';}");
  ev('window.__ff=' + src);
  ev('__ff()');
  assert.match(ev("S.inc.find(i=>i.type==='maxpfx').msg"), /in Amsterdam, is down/);
  // a tick that throws is caught, reported once, and the loop keeps going
  ev("const dt0=dayTick;window.dayTick=()=>{throw new Error('boom')};UI.speed=1;acc=DAY_MS;last=0;frame(16);window.dayTick=dt0");
  assert.equal(ev('UI.tickErr'), true);
  assert.match(ev("document.getElementById('toasts').textContent"), /NOC glitched/);
  assert.deepEqual(errors.filter(e => !/tick failed/.test(e)), []);
});

test('Amsterdam has FRIES-IX, with free 10G and 100G ports and paid larger ports', () => {
  const { ev, errors } = load();
  setup(ev);
  assert.deepEqual(JSON.parse(ev("JSON.stringify(ixIdsIn('ams'))")), ['ams', 'ams~2', 'ams~3']);
  ev("ACT.buildPop({city:'ams'});S.pops.ams.rgen=RG.length-1;compute()");
  const cash = () => ev('S.cash');
  let c0 = cash();
  assert.equal(ev("ixPortMo('ams~3',0)"), 0, '10G port is free');
  ev("ACT.buyIx({city:'ams~3',tier:1})");
  assert.equal(ev("S.ixp['ams~3']"), 1);
  assert.equal(cash(), c0, '100G port is free');
  assert.equal(ev("S.ixp.ams"), undefined, 'HAMS-IX is separate');
  c0 = cash();
  ev("ACT.lagIx({city:'ams~3',d:1})");
  assert.equal(cash(), c0, 'LAG members are free too');
  assert.equal(ev("ixPortMo('ams~3',2)"), ev("Math.round(PORT[2].ix*ixMul('ams~3'))"), '400G is a paid game tier');
  ev("ACT.buyIx({city:'ams',tier:1});ACT.rs({city:'ams~3'});compute()");
  assert.ok(ev("ixSessions('ams~3').has('drz')"));
  assert.equal(ev("ixSessions('ams~3').has('ggl')"), false, 'Goggle is not a member');
  assert.equal(ev("R.useIx['ams~3']!==undefined&&R.useIx.ams!==undefined"), true, 'both fabrics carry traffic');
  assert.equal(ev("R.cost.ix"), ev("ixPortMo('ams',1)"), "only the HAMS-IX port is billed");
  ev("selectCity('ams');ACT.tab({t:'peer'})");
  const txt = ev("document.getElementById('panelBody').textContent");
  assert.match(txt, /FRIES-IX/); assert.match(txt, /HAMS-IX/);
  assert.match(ev("ixBlock('ams~3',true)"), /LAG member <small>free/);
  ev("save();restored=migrate(JSON.parse(localStorage.getItem('sot-save-v1')));");
  assert.equal(ev("restored.ixp['ams~3']"), 1, 'free port survives save migration');
  assert.equal(ev("restored.ixn['ams~3']"), 2, 'free LAG survives save migration');
  ev("S.ev.ixdown={'ams~3':S.day+2};compute()");
  assert.equal(ev("R.useIx['ams~3']"), undefined, 'a FRIES-IX outage drops only that fabric');
  assert.notEqual(ev("R.useIx.ams"), undefined);
  ev("S.ev.ixdown={};compute()");
  c0 = cash();
  ev("ACT.buyIx({city:'ams~3',tier:2})");
  assert.equal(ev("S.ixp['ams~3']"), 2);
  assert.equal(c0 - cash(), ev("2*ixPortMo('ams~3',2)"), 'upgrading bills both LAG members');
  assert.equal(ev("R.cost.ix"), ev("ixPortMo('ams',1)+2*ixPortMo('ams~3',2)"), 'larger ports also have a recurring charge');
  ev("ACT.cancelIx({city:'ams~3'});ACT.cancelIx({city:'ams~3'})");
  assert.equal(ev("S.ixp['ams~3']"), undefined);
  assert.equal(ev("S.ixp.ams"), 1, 'leaving FRIES-IX keeps the HAMS-IX port');
  assert.equal(ev("Object.keys(S.rs).filter(k=>S.rs[k]).length"), 0);
  assert.deepEqual(errors, []);
});

test('community exchanges are wired up in every city, and Barcelona has Catnip-IX', () => {
  const { ev, errors } = load();
  setup(ev);
  const exchanges = ['ams~3', 'mad~2', 'fra~2', 'lon~2', 'jnb~2', 'syd~2', 'tok~2'];
  assert.deepEqual(JSON.parse(ev("JSON.stringify(ixIdsIn('nyc'))")), ['nyc', 'nyc~2'], 'NYC keeps its two existing exchanges');
  assert.equal(ev("ixName('nyc')"), 'NY-Yikes');
  assert.equal(ev("isDk('nyc')"), true, 'NY-Yikes is already part of DE-KICKS Group');
  const bad = ev("XIX.filter(x=>x.core).map(x=>x.id).flatMap(k=>XIXM[k].members.filter(id=>!NET[id]||!NET[id].pops.includes(XIXM[k].c)).map(id=>k+':'+id)).join()");
  assert.equal(bad, '', 'every member has a POP in the city');
  assert.ok(ev("Object.keys(XIXM).every(k=>CITY[XIXM[k].c].ix&&ixIdsIn(XIXM[k].c).includes(k))"), 'each sits beside a main IX');
  ev("ACT.buildPop({city:'mad'})");
  assert.equal(ev("ixPortMo('mad~2',1)"), ev("Math.round(PORT[1].ix*0.6*IX_REG.EU)"), 'Paella-NIX is cheaper than Siesta-IX');
  assert.equal(ev("ixName('bcn')"), 'Catnip-IX');
  for (const k of exchanges) {
    const c = k.split('~')[0];
    ev(`if(!S.pops.${c})ACT.buildPop({city:'${c}'});S.pops.${c}.rgen=RG.length-1;ACT.buyIx({city:'${k}',tier:1});ACT.rs({city:'${k}'})`);
    assert.equal(ev(`S.ixp['${k}']`), 1, `port at ${k}`);
  }
  ev('compute()');
  for (const k of exchanges)
    assert.ok(ev(`ixSessions('${k}').size`) > 0, `route server sessions at ${k}`);
  for (const c of ['ams', 'mad', 'fra', 'lon', 'nyc', 'jnb', 'syd', 'tok', 'bcn']) {
    ev(`selectCity('${c}');ACT.tab({t:'peer'})`);
    const txt = ev("document.getElementById('panelBody').textContent");
    for (const k of JSON.parse(ev(`JSON.stringify(ixIdsIn('${c}'))`))) assert.ok(txt.includes(ev(`ixName('${k}')`)), `${k} shown in ${c}`);
  }
  assert.deepEqual(errors, []);
});

test('a PNI with every willing network at a POP in one go, at one port size and site', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("ACT.launchBB({city:'fra'});compute();selectCity('fra');ACT.tab({t:'peer'})");
  const panel = () => ev("document.getElementById('panelBody').textContent");
  const will = JSON.parse(ev("JSON.stringify(pniWilling('fra').map(n=>n.id))"));
  const no = JSON.parse(ev("JSON.stringify(NETS.filter(n=>n.pops.includes('fra')&&!peerOk(n.id,'pni','fra').ok).map(n=>n.id))"));
  assert.ok(will.length > 2 && no.length > 0, 'some networks here say yes and some no');
  assert.match(panel(), new RegExp(`PNI with all ${will.length} willing networks`));
  const paid = ev("pniWilling('fra').reduce((a,n)=>a+(peerOk(n.id,'pni','fra').fee||0),0)");
  if (paid) assert.ok(panel().includes('Paid peering: ' + ev(`fmt$(${paid})`) + '/mo on top'), 'paid peering is shown before you buy');
  // 100G each needs more router ports than this POP has: nothing is bought
  ev('ACT.pniPick({t:1})');
  assert.equal(ev('UI.pniT'), 1);
  assert.match(panel(), new RegExp(`Needs ${will.length} free router ports here, ${ev("portsMax('fra')")} left`));
  let cash = ev('S.cash');
  ev("ACT.pniAll({city:'fra',t:1,s:'a'})");
  assert.equal(ev('S.pni.length'), 0);
  assert.equal(ev('S.cash'), cash);
  // 10G ports take a quarter of a slot each, so they fit
  ev('ACT.pniPick({t:0})');
  assert.ok(panel().includes(`PNI with all ${will.length} willing networks ` + ev(`fmt$(${will.length}*(1500+PORT[0].setup/2))`)));
  ev("ACT.pniAll({city:'fra',t:0,s:'b'})");
  assert.equal(cash - ev('S.cash'), will.length * ev('1500+PORT[0].setup/2'));
  assert.deepEqual(JSON.parse(ev("JSON.stringify(S.pni.map(p=>p.net))")), will, 'one PNI per willing network, in list order');
  assert.ok(ev("S.pni.every(p=>p.city==='fra'&&p.tier===0&&!p.site&&!p.n)"), 'one 10G port each, in site A (there is no B here)');
  for (const id of no) assert.equal(ev(`S.pni.some(p=>p.net==='${id}')`), false, `${id} said no`);
  assert.ok(ev(`S.log.some(e=>e.t.startsWith('${will.length} new PNIs in Frankfurt.'))`), 'one message for all of them');
  assert.doesNotMatch(panel(), /PNI with all/, 'nobody left to ask');
  // with a second building, both sites: two LAG members per PNI, one in each, for twice the ports and money
  ev("ACT.buildPop({city:'ams'});ACT.launchBB({city:'ams'});ACT.addSite({city:'ams'});compute();selectCity('ams');ACT.tab({t:'peer'})");
  const n2 = ev("pniWilling('ams').length");
  assert.ok(n2 > 1);
  ev("ACT.pniPick({s:'ab'})");
  assert.match(panel(), /Site:.*Both/);
  cash = ev('S.cash');
  const used = ev("portsUsed('ams')");
  ev("ACT.pniAll({city:'ams',t:0,s:'ab'})");
  assert.equal(cash - ev('S.cash'), n2 * 2 * ev('1500+PORT[0].setup/2'));
  assert.equal(ev("portsUsed('ams')") - used, n2 * 2 * 0.25);
  assert.ok(ev("S.pni.filter(p=>p.city==='ams').every(p=>p.n===2&&p.site==='ab')"));
  ev('compute()');
  assert.ok(ev("S.pni.filter(p=>p.city==='ams').some(p=>R.usePni[p.id]>0)"), 'and they carry traffic');
  // saved and loaded, they are the same PNIs
  const before = ev("JSON.stringify(S.pni.map(p=>[p.net,p.city,p.tier,p.n||1,p.site||'a']))");
  ev('S=migrate(JSON.parse(JSON.stringify(S)));compute()');
  assert.equal(ev("JSON.stringify(S.pni.map(p=>[p.net,p.city,p.tier,p.n||1,p.site||'a']))"), before);
  // the picker survives bad input, and a phone shows the controls
  ev("ACT.pniPick({t:99,s:'zz'})");
  assert.equal(ev('UI.pniT'), 0);
  assert.equal(ev('UI.pniS'), 'ab');
  ev("ACT.buildPop({city:'par'});compute();window.innerWidth=360;selectCity('par');ACT.tab({t:'peer'});renderAll()");
  assert.ok(ev("!!document.querySelector('#panelBody [data-act=\"pniAll\"]')"));
  assert.deepEqual(errors, []);
});
