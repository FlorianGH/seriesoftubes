const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('PNIs with every willing network at a POP are ordered in one go, at one port size and site', () => {
  const { ev, errors } = load();
  // enough eyeballs in Frankfurt that some of the big networks, which start at 100G, want a PNI too
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=3000;compute()");
  ev("selectCity('fra');ACT.tab({t:'peer'})");
  const panel = () => ev("document.getElementById('panelBody').textContent");
  const ids = (q) => JSON.parse(ev(`JSON.stringify(${q}.map(n=>n.id))`));
  const small = ids("pniWilling('fra').filter(n=>!pniMin(n.id))"), big = ids("pniWilling('fra').filter(n=>pniMin(n.id))");
  const no = ids("NETS.filter(n=>n.pops.includes('fra')&&!peerOk(n.id,'pni','fra').ok)");
  assert.ok(small.length > 2 && big.length > 1 && no.length > 0, 'some networks here say yes, some only from 100G, some no');
  // 10G for all: the ones that start at 100G are left out, and the panel says so
  assert.match(panel(), new RegExp(`PNI with all ${small.length} willing networks`));
  assert.match(panel(), new RegExp(`Left out: ${big.length} networks that start at 100G`));
  const paid = ev(`[${small.map((x) => `'${x}'`)}].reduce((a,id)=>a+(peerOk(id,'pni','fra').fee||0),0)`);
  if (paid) assert.ok(panel().includes('Paid peering: ' + ev(`fmt$(${paid})`) + '/mo on top'), 'paid peering is shown before you buy');
  // 100G for all takes more router ports than this POP has: nothing is ordered
  ev('ACT.pniPick({t:1})');
  assert.equal(ev('UI.pniT'), 1);
  const all = small.length + big.length;
  assert.match(panel(), new RegExp(`PNI with all ${all} willing networks`), 'at 100G the big ones are in');
  assert.match(panel(), new RegExp(`Needs ${all} free router ports here, ${ev("portsMax('fra')")} left`));
  let cash = ev('S.cash');
  ev("ACT.pniAll({city:'fra',t:1,s:'a'})");
  assert.equal(ev('S.pni.length'), 0);
  assert.equal(ev('S.cash'), cash);
  // 10G fits: one order per network, priced like single PNIs, in site A (there is no B here)
  ev('ACT.pniPick({t:0})');
  ev("ACT.pniAll({city:'fra',t:0,s:'b'})");
  assert.equal(cash - ev('S.cash'), small.length * ev('1500+PORT[0].setup/2'));
  assert.deepEqual(ids('S.pni.map(p=>NET[p.net])'), small, 'in the order of the list');
  assert.ok(ev("S.pni.every(p=>p.city==='fra'&&p.tier===0&&!p.site&&!p.n)"));
  for (const id of [...big, ...no]) assert.equal(ev(`S.pni.some(p=>p.net==='${id}')`), false, `${id} is not ordered`);
  assert.ok(ev(`S.log.some(e=>e.t.startsWith('${small.length} PNIs ordered in Frankfurt.'))`), 'one message for all of them');
  // like single PNIs they are orders: nothing is up yet, and each arrives after its own lead time
  assert.ok(ev('S.pni.every(p=>p.ready>S.day)'));
  assert.ok(ev('new Set(S.pni.map(p=>p.ready)).size') > 1, 'not all on the same day');
  assert.match(panel(), /PNI with all 0 willing networks/, 'only the big ones are left, and they need 100G');
  ev('for(let i=0;i<400&&S.pni.some(p=>p.ready>S.day);i++)dayTick();compute()');
  assert.ok(ev('S.pni.every(p=>p.ready<=S.day)'), 'all delivered');
  assert.ok(ev('S.pni.some(p=>R.usePni[p.id]>0)'), 'and they carry traffic');
  // with a second building, both sites: two LAG members per PNI, one in each, for twice the ports and money
  ev("ACT.buildPop({city:'ams'});ACT.launchBB({city:'ams'});ACT.addSite({city:'ams'});compute();selectCity('ams');ACT.tab({t:'peer'})");
  const n2 = ev("pniWilling('ams').filter(n=>!pniMin(n.id)).length");
  assert.ok(n2 > 1);
  ev("ACT.pniPick({s:'ab'})");
  assert.match(panel(), /Site:.*Both/);
  cash = ev('S.cash');
  const used = ev("portsUsed('ams')");
  ev("ACT.pniAll({city:'ams',t:0,s:'ab'})");
  assert.equal(cash - ev('S.cash'), n2 * 2 * ev('1500+PORT[0].setup/2'));
  assert.equal(ev("portsUsed('ams')") - used, n2 * 2 * 0.25);
  assert.ok(ev("S.pni.filter(p=>p.city==='ams').every(p=>p.n===2&&p.site==='ab'&&p.ready>S.day)"));
  assert.match(panel(), /2×10G PNI/, 'on order as a two-port LAG');
  // saved and loaded, they are the same orders
  const before = ev("JSON.stringify(S.pni.map(p=>[p.net,p.city,p.tier,p.n||1,p.site||'a',p.ready]))");
  ev('S=migrate(JSON.parse(JSON.stringify(S)));compute()');
  assert.equal(ev("JSON.stringify(S.pni.map(p=>[p.net,p.city,p.tier,p.n||1,p.site||'a',p.ready]))"), before);
  ev("for(let i=0;i<400&&S.pni.some(p=>p.ready>S.day);i++)dayTick();compute()");
  assert.ok(ev("S.pni.filter(p=>p.city==='ams').some(p=>R.usePni[p.id]>0)"), 'both-site PNIs carry traffic once delivered');
  // the picker shrugs off bad input, and a phone shows the controls
  ev("ACT.pniPick({t:99,s:'zz'})");
  assert.equal(ev('UI.pniT'), 0);
  assert.equal(ev('UI.pniS'), 'ab');
  ev("ACT.buildPop({city:'par'});ACT.launchBB({city:'par'});S.pops.par.bb.d=3000;compute();window.innerWidth=360;selectCity('par');ACT.tab({t:'peer'});renderAll()");
  assert.ok(ev("!!document.querySelector('#panelBody [data-act=\"pniAll\"]')"));
  assert.deepEqual(errors, []);
});
