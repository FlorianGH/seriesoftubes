/* ---------- A PNI with every willing network at a POP, in one go ----------
   One port size for all of them and, with a second building, site A, B or both (two LAG members each, one per
   building). Each is ordered like a single PNI: the same price, router ports, minimum size and delivery time. */
// Every network here that would take a PNI and has none yet (or none on order), in the order the PNI list shows them.
function pniWilling(c){const have=new Set();for(const x of S.pni)if(x.city===c)have.add(x.net);return NETS.filter(n=>n.pops.includes(c)&&!have.has(n.id)&&peerOk(n.id,'pni',c).ok);}
// The pick as this POP can take it: no bigger than its router's ports, and site A without a second building.
function pniAllPick(c){const p=S.pops[c];let t=PORT[UI.pniT]?UI.pniT:0;while(t>0&&!portOk(c,t))t--;return {t,s:p&&p.site2&&['b','ab'].includes(UI.pniS)?UI.pniS:'a'};}
function pniAllCtl(c){const will=pniWilling(c),p=S.pops[c];if(will.length<2)return '';
  const {t,s}=pniAllPick(c),go=will.filter(n=>pniMin(n.id)<=t),lo=will.filter(n=>pniMin(n.id)>t),m=s==='ab'?2:1,
    cost=go.length*m*(1500+PORT[t].setup/2),mo=go.length*m*PORT[t].pni,fee=go.reduce((a,n)=>a+(peerOk(n.id,'pni',c).fee||0),0),
    need=go.length*m*PORT_SLOT(t),free=portsMax(c)-portsUsed(c),fits=need<=free+1e-9;
  return `<div class="seg site"><span class="meta">${tr('pni_all.port')}</span>${PORT.map((P2,i)=>portShown(i)?btn(P2.n,'pniPick',{t:i},i===t?'pink sm':'ghost sm',!portOk(c,i)):'').join('')}</div>`
    +(p.site2?`<div class="seg site"><span class="meta">${tr('common.site')}</span>${['a','b'].map(x=>btn(`${x.toUpperCase()} <small>${esc(siteName(c,x))}</small>`,'pniPick',{s:x},s===x?'pink sm':'ghost sm')).join('')}${btn(tr('sites_and_service.both_adds_a_lag_member'),'pniPick',{s:'ab'},s==='ab'?'pink sm':'ghost sm')}</div>`:'')
    +`<div class="seg site">${btn(tr('pni_all.pni_with_all_n_willing_networks',{n:go.length,cost:fmt$(cost),mo:fmt$(mo)}),'pniAll',{city:c,t,s},'pink sm',!go.length||!fits||S.cash<cost)}</div>`
    +(lo.length?`<div class="meta">${trn('pni_all.left_out_n_network_that_starts',lo.length,{port:PORT[Math.min(...lo.map(n=>pniMin(n.id)))].n})}</div>`:'')
    +(fee?`<div class="meta">${tr('city_panel.paid_peering_price_mo_on_top',{price:fmt$(fee)})}</div>`:'')
    +(fits?'':`<div class="why">${tr('pni_all.needs_need_free_router_ports_here',{need:fmtPorts(need),free:fmtPorts(Math.max(0,free))})}</div>`);}
