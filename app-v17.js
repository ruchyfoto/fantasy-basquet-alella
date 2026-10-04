const $ = id => document.getElementById(id);
const money = n => `${Number(n || 0).toFixed(2).replace('.', ',')} M€`;

const state = {
  teamId: null,
  team: null,
  round: null,
  players: [], teams: [], coaches: [], coachTeams: [], coachMarkets: [],
  rosterPlayers: [], rosterCoaches: [],
  marketType: 'players',
  session: null,
  username: '',
  admin: false,
  coachContext: []
};

function headers(){
  const token = state.session?.access_token || SUPABASE_ANON_KEY;
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
function api(path, options={}){ return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {...options, headers:{...headers(), ...(options.headers||{})}}); }
function rpc(name, body){ return api(`rpc/${name}`, {method:'POST', body:JSON.stringify(body)}); }
function escapeHtml(v){return String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function teamName(id){return state.teams.find(t=>String(t.id)===String(id))?.name || 'Equip desconegut';}
function coachName(c){return `${c.name||''} ${c.surname||''}`.trim();}
function fixImageError(img){ if(!img.dataset.logo&&img.dataset.ph!=='🧑‍🏫'){ img.dataset.logo='1'; img.classList.add('logo-ph'); img.src='logo.png'; return; } const ph=document.createElement('div'); ph.className='photo-placeholder'; ph.textContent=img.dataset.ph||'📷'; img.replaceWith(ph); }
function showSection(id){document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.section===id));document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===id));window.scrollTo({top:0,behavior:'smooth'});}
function setAuthMessage(msg, ok=false){ $('authMessage').textContent=msg||''; $('authMessage').className=ok?'auth-message ok':'auth-message'; }
function setAdminMessage(msg){ $('adminMessage').textContent=msg||''; const b=$('adminMessageBottom'); if(b) b.textContent=msg||''; }

async function authRequest(path, body){
  const r=await fetch(`${SUPABASE_URL}/auth/v1/${path}`,{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error_description || data.msg || data.message || 'No s’ha pogut completar l’operació.');
  return data;
}

async function refreshSession(){
  const rt=state.session?.refresh_token; if(!rt) return false;
  try{ const data=await authRequest('token?grant_type=refresh_token',{refresh_token:rt}); state.session=data; localStorage.setItem('fantasySession',JSON.stringify(data)); return true; }catch{ return false; }
}

async function signup(){
  const username=$('signupUsername').value.trim();
  const email=$('signupEmail').value.trim();
  const password=$('signupPassword').value;
  const passwordConfirm=$('signupPasswordConfirm')?.value || '';
  if(!username||!email||!password||!passwordConfirm) return setAuthMessage('Omple tots els camps.');
  if(password.length<6) return setAuthMessage('La contrasenya ha de tenir com a mínim 6 caràcters.');
  if(!$('acceptPrivacy')?.checked) return setAuthMessage('Cal acceptar l’avís de privacitat per crear el compte.');
  if(password!==passwordConfirm) return setAuthMessage('Les contrasenyes no coincideixen.');
  try{
    setAuthMessage('Creant el compte…');
    try{ const rc=($('signupRef')?.value||'').trim().toUpperCase(); if(rc) localStorage.setItem('refCode',rc); }catch{}
    const data=await authRequest('signup',{email,password,data:{username}});
    if(!data.access_token){
      setAuthMessage('Compte creat. Revisa el correu per confirmar-lo i després inicia sessió.',true);
      return;
    }
    state.session=data; localStorage.setItem('fantasySession',JSON.stringify(data));
    state.username=username;
    await ensureFantasyTeam();
  }catch(e){setAuthMessage(e.message);}
}

async function login(){
  const email=$('loginEmail').value.trim();
  const password=$('loginPassword').value;
  if(!email||!password) return setAuthMessage('Indica el correu i la contrasenya.');
  try{
    setAuthMessage('Iniciant sessió…');
    const data=await authRequest('token?grant_type=password',{email,password});
    state.session=data; localStorage.setItem('fantasySession',JSON.stringify(data));
    await ensureFantasyTeam();
  }catch(e){setAuthMessage(e.message);}
}

function logout(){
  _isClub=null;
  try{ pushDetach(); }catch(e){}
  try{ botHide(); }catch(e){}
  state.session=null; state.teamId=null; state.team=null; state.username='';
  localStorage.removeItem('fantasySession');
  showAuth();
}

async function ensureFantasyTeam(){
  try{
    const username=state.username || state.session?.user?.user_metadata?.username || state.session?.user?.email?.split('@')[0] || 'Jugador';
    const r=await rpc('ensure_my_fantasy_team',{p_username:username});
    const text=await r.text(); if(!r.ok) throw new Error(text.replace(/^"|"$/g,''));
    state.teamId=Number(text);
    state.username=username;
    hideAuth();
    await loadData();
  }catch(e){setAuthMessage(e.message);}
}

function showAuth(){ $('authGate').style.display='flex'; $('appShell').style.display='none'; $('userLabel').textContent=''; }
function hideAuth(){ $('authGate').style.display='none'; $('appShell').style.display='block'; }

function playerCard(p,inTeam=false){
  const dorsal=p.shirt_number ?? '—';
  const photo=p.photo_url ? `<img src="${escapeHtml(p.photo_url)}" alt="${escapeHtml(p.name)}" class="player-photo" onerror="fixImageError(this)">` : '<img src="logo.png" alt="" class="player-photo logo-ph">';
  const owned=state.rosterPlayers.some(x=>String(x.player_id)===String(p.id));
  const roster=state.rosterPlayers.find(x=>String(x.player_id)===String(p.id));
  const isCaptain=Boolean(roster?.is_captain);
  return `<article class="player-card${isCaptain?' captain-card':''}" data-pid="${p.id}"><div class="player-visual">${photo}${isCaptain?'<span class="captain-badge">⭐ CAPITÀ</span>':''}</div><div class="player-info"><div class="player-number-line"><span class="player-number-label">DORSAL</span><strong class="player-number">#${escapeHtml(String(dorsal).replace(/\.0$/,''))}</strong></div><h3>${escapeHtml(p.name)} ${escapeHtml(p.surname||'')}</h3><div class="player-pts">⭐ Punts: <b>${f1(state.pts?.[p.id]||0)}</b></div><span class="player-team">🏀 ${escapeHtml(teamName(p.real_team_id))}</span>${p.category?`<span class="player-category">${escapeHtml(p.category)}</span>`:''}</div><div class="player-meta"><div><small>Valor</small><b>${money(p.current_value)}</b></div><div><small>Estat</small><b>${isCaptain?'⭐ Capità':owned?'A la plantilla':'Mercat'}</b></div></div><div class="card-actions">${inTeam?`<button class="secondary" data-captain-player="${p.id}">${isCaptain?'⭐ Capità':'Fer capità'}</button><button class="secondary" data-sell-player="${p.id}">Vendre</button>`:`<button class="primary" data-buy-player="${p.id}">${owned?'Ja fitxat':`Fitxar · ${money(Number(p.current_value)*1.05)}`}</button>`}</div></article>`;
}
function coachCard(c,realTeamId,inTeam=false){
  const relation=state.coachTeams.find(r=>String(r.coach_id)===String(c.id)&&String(r.real_team_id)===String(realTeamId));
  const market=state.coachMarkets.find(r=>String(r.coach_id)===String(c.id)&&String(r.real_team_id)===String(realTeamId));
  const coachValue=Number(market?.current_value ?? c.current_value ?? 0);
  if(!relation)return '';
  const coachPhoto=(c.photo_url&&c.photo_url.includes('/storage/v1/'))?c.photo_url:`entrenador-${c.id}.jpeg`;
  const owned=state.rosterCoaches.some(x=>String(x.coach_id)===String(c.id)&&String(x.real_team_id)===String(realTeamId));
  return `<article class="player-card" data-cid="${c.id}" data-ctid="${realTeamId}"><div class="player-visual"><img src="${escapeHtml(coachPhoto)}" alt="${escapeHtml(coachName(c))}" class="player-photo" data-ph="🧑‍🏫" onerror="fixImageError(this)"></div><div class="player-info"><div class="coach-label">ENTRENADOR</div><h3>${escapeHtml(coachName(c))}</h3><span class="player-team">🏀 ${escapeHtml(teamName(realTeamId))}</span></div><div class="player-meta"><div><small>Valor</small><b>${money(coachValue)}</b></div><div><small>Estat</small><b>${owned?'A la plantilla':'Mercat'}</b></div></div><div class="card-actions">${inTeam?`<button class="secondary" data-sell-coach="${c.id}" data-sell-coach-team="${realTeamId}">Vendre</button>`:`<button class="primary" data-buy-coach="${c.id}" data-buy-coach-team="${realTeamId}">${owned?'Ja fitxat':`Fitxar · ${money(coachValue*1.05)}`}</button>`}</div></article>`;
}

function render(){
  const teamBudget=state.team?.budget ?? 0;
  animateMoney($('budget'),Number(teamBudget));
  $('rosterCount').textContent=`${state.rosterPlayers.length}/8`;
  $('coachCount').textContent=`${state.rosterCoaches.length}/2`;
  $('weekLabel').textContent=state.round?`Jornada ${state.round.round_number}`:'Jornada —';
  $('playerTotal').textContent=state.players.length;
  $('teamTotal').textContent=state.teams.length;
  $('homeWeek').textContent=state.round?.round_number ?? '—';
  $('resultsWeek').textContent=state.round?`Jornada ${state.round.round_number}`:'Jornada —';
  renderRanking();
  $('homeStatus').innerHTML=`<b>Supabase connectat.</b> ${state.players.length} jugadors · ${state.teams.length} equips · ${state.coaches.length} entrenadors. Equip Fantasy: ${escapeHtml(state.team?.name||'—')}.`;
  $('userLabel').textContent=state.username || state.session?.user?.email || '';
  renderTeam(); renderMarket(); renderClubs(); renderResults(); renderCoachPanel(); renderRules(); bindActions();
}
const COURT_SVG='<svg class="court-svg" viewBox="0 0 300 560" preserveAspectRatio="none" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><text x="150" y="300" text-anchor="middle" font-size="78" font-weight="900" fill="none" stroke="#e8762c" stroke-opacity=".35" stroke-width="1.6" style="font-family:\'Barlow Condensed\',Impact,sans-serif;font-style:italic">ALELLA</text><rect x="8" y="8" width="284" height="544" rx="4"/><path d="M110 8 A40 40 0 0 0 190 8"/><rect class="key" x="100" y="400" width="100" height="152"/><circle cx="150" cy="400" r="36"/><path class="arc" d="M30 552 V490 A120 120 0 0 1 270 490 V552"/><path d="M135 540 H165"/><circle cx="150" cy="530" r="7"/></svg>';
const SLOTS=[[16,18],[50,12],[84,18],[16,51],[50,48],[84,51],[32,80],[68,80]];
const SLOTS_P=SLOTS.map(([x,y])=>{const d=(1-y/100)*1.4,k=1.3/(1.3+d*.375);return {x:50+(x-50)*k,y:(1-d*.927*k)*100,s:.35+.7*k};});
function courtOrder(){
  const ids=state.rosterPlayers.map(x=>String(x.player_id)); const lay=(state.lineup||[]).slice(0,8).map(v=>v!=null&&ids.includes(String(v))?String(v):null);
  while(lay.length<8) lay.push(null); const used=new Set(lay.filter(Boolean));
  ids.filter(i=>!used.has(i)).forEach(i=>{ const k=lay.indexOf(null); if(k>=0) lay[k]=i; }); return lay;
}
function saveLineup(){ try{localStorage.setItem('lineup_'+state.teamId,JSON.stringify(state.lineup));}catch{} rpc('save_lineup',{p_slots:state.lineup}).catch(()=>{}); }
function courtCard(p,isCap){
  const ph=p.photo_url?`<img src="${escapeHtml(p.photo_url)}" alt="${escapeHtml(p.name)}" data-ph="👤" onerror="fixImageError(this)">`:'<img src="logo.png" alt="" class="logo-ph">';
  return `<div class="pcard${isCap?' cap':''}" data-pid="${p.id}">${isCap?'<span class="cap-badge">C</span>':''}${ph}<b>${escapeHtml(p.name)}</b><small>#${escapeHtml(String(p.shirt_number??'—').replace(/\.0$/,''))} · ${money(p.current_value)}</small><small class="pts">⭐ Punts: ${f1(state.pts?.[p.id]||0)}</small><div class="acts"><button class="secondary" data-act="cap" data-id="${p.id}" title="Fer capità">${isCap?'⭐':'☆'}</button><button class="secondary" data-act="sell" data-id="${p.id}" title="Vendre">💸</button></div></div>`;
}
function benchCard(c,realTeamId){
  const m=state.coachMarkets.find(r=>String(r.coach_id)===String(c.id)&&String(r.real_team_id)===String(realTeamId));
  const photo=(c.photo_url&&c.photo_url.includes('/storage/v1/'))?c.photo_url:`entrenador-${c.id}.jpeg`;
  return `<div class="bench-card" data-cid="${c.id}" data-ctid="${realTeamId}"><img src="${escapeHtml(photo)}" alt="${escapeHtml(coachName(c))}" data-ph="🧑‍🏫" onerror="fixImageError(this)"><div><b>${escapeHtml(coachName(c))}</b><small>🏀 ${escapeHtml(teamName(realTeamId))} · ${money(m?.current_value??c.current_value)}</small><div><button class="secondary" data-sell-coach="${c.id}" data-sell-coach-team="${realTeamId}">💸 Vendre</button></div></div></div>`;
}
function goMarket(type){ showSection('market'); const b=document.querySelector(`.market-tab[data-market="${type}"]`); if(b) b.click(); }
function renderTeam(){
  const order=courtOrder();
  const slots=SLOTS_P.map((s,i)=>{const p=order[i]?state.players.find(x=>String(x.id)===String(order[i])):null; const r=state.rosterPlayers.find(x=>String(x.player_id)===String(order[i]));
    return `<div class="slot" data-i="${i}" style="left:${s.x}%;top:${s.y}%;--s:${s.s};--i:${i};z-index:${Math.round(s.y)+2}">${p?courtCard(p,r&&r.is_captain):'<div class="slot-empty" onclick="goMarket(\'players\')" title="Fitxar un jugador">+</div>'}</div>`;}).join('');
  $('teamPlayers').innerHTML=`<div class="court-floor">${COURT_SVG}</div>`+slots;
  const cs=state.rosterCoaches.map(x=>{const c=state.coaches.find(c=>String(c.id)===String(x.coach_id));return c?benchCard(c,x.real_team_id):'';}).join('');
  $('teamCoaches').innerHTML=cs+Array(Math.max(0,2-state.rosterCoaches.length)).fill('<div class="bench-card empty" onclick="goMarket(\'coaches\')">➕ Fitxar entrenador</div>').join('');
  const captain=state.rosterPlayers.find(x=>x.is_captain), cp=captain?state.players.find(p=>String(p.id)===String(captain.player_id)):null;
  $('captainName').textContent=cp?`${cp.name} ${cp.surname||''}`.trim():'pendent';
  bindActions();
}
async function loadExtras(){
  const [pt,ts,ln]=await Promise.all([rpc('get_player_points',{}),rpc('get_team_stats',{}),api('fantasy_lineups?select=slots&limit=1')]);
  state.pts=pt.ok?await pt.json().catch(()=>({})):{}; state.teamStats=ts.ok?await ts.json().catch(()=>({})):{};
  let lay=null; if(ln.ok){ const a=await ln.json().catch(()=>[]); lay=a[0]?.slots||null; }
  if(!lay){ try{lay=JSON.parse(localStorage.getItem('lineup_'+state.teamId)||'null');}catch{} }
  state.lineup=Array.isArray(lay)?lay:[]; renderTeam(); renderMarket(); renderClubs(); loadAnnounce(); loadTableDuty(); loadAttStats();
}
(function(){
  const court=$('teamPlayers'); if(!court) return; let d=null;
  court.addEventListener('pointerdown',e=>{ const s=e.target.closest('.slot'); if(!s||!s.querySelector('.pcard')||e.target.closest('button')) return;
    d={s,i:+s.dataset.i,x:e.clientX,y:e.clientY,on:false,t:e.pointerType};
    if(d.t!=='mouse') d.timer=setTimeout(()=>{ if(d){ d.on=true; s.classList.add('dragging'); navigator.vibrate&&navigator.vibrate(15); } },220); });
  window.addEventListener('pointermove',e=>{ if(!d) return; const dx=e.clientX-d.x, dy=e.clientY-d.y;
    if(!d.on){ const m=Math.hypot(dx,dy); if(d.t==='mouse'&&m>6){ d.on=true; d.s.classList.add('dragging'); } else if(d.t!=='mouse'&&m>10){ clearTimeout(d.timer); d=null; } return; }
    d.s.style.setProperty('--dx',dx+'px'); d.s.style.setProperty('--dy',dy+'px'); e.preventDefault(); },{passive:false});
  window.addEventListener('pointerup',e=>{ if(!d) return; clearTimeout(d.timer); const cur=d; d=null; if(!cur.on) return; window.__dragged=Date.now();
    const r=court.getBoundingClientRect(), px=(e.clientX-r.left)/r.width*100, py=(e.clientY-r.top)/r.height*100; let j=0,best=1e9;
    SLOTS_P.forEach((p,k)=>{ const dd=Math.hypot(p.x-px,p.y-py); if(dd<best){ best=dd; j=k; } });
    cur.s.classList.remove('dragging'); cur.s.style.removeProperty('--dx'); cur.s.style.removeProperty('--dy');
    if(j!==cur.i){ const o=courtOrder(); [o[cur.i],o[j]]=[o[j],o[cur.i]]; state.lineup=o; saveLineup(); renderTeam(); } });
  window.addEventListener('pointercancel',()=>{ if(d){ clearTimeout(d.timer); d.s.classList.remove('dragging'); d=null; } });
  court.addEventListener('touchmove',e=>{ if(d&&d.on) e.preventDefault(); },{passive:false});
})();
function renderMarket(){
  const head=document.querySelector('#market .section-head p'); if(head) head.textContent=(state.round?.round_number===1?'Abans que comenci la Jornada 1, els fitxatges no tenen el límit de 2 compres.':'Comprar aplica un 5% de comissió. Vendre retorna el valor de mercat actual.');
  const q=($('search').value||'').toLowerCase().trim(); const team=$('teamFilter').value;
  if(state.marketType==='players'){
    $('search').placeholder='Cerca jugador…';
    const list=state.players.filter(p=>`${p.name} ${p.surname} ${teamName(p.real_team_id)}`.toLowerCase().includes(q)&&(!team||String(p.real_team_id)===String(team)));
    $('marketGrid').innerHTML=list.map(p=>playerCard(p,false)).join('')||'<div class="empty-state"><div class="empty-icon">🔎</div><h3>No hem trobat cap jugador</h3></div>';
  }else{
    $('search').placeholder='Cerca entrenador…'; const list=[];
    state.coachTeams.forEach(r=>{const c=state.coaches.find(c=>String(c.id)===String(r.coach_id));if(c&&(!team||String(r.real_team_id)===String(team))&&`${coachName(c)} ${teamName(r.real_team_id)}`.toLowerCase().includes(q))list.push(coachCard(c,r.real_team_id,false));});
    $('marketGrid').innerHTML=list.join('')||'<div class="empty-state"><div class="empty-icon">🔎</div><h3>No hem trobat cap entrenador</h3></div>';
  }
  bindActions();
}
function renderClubs(){
  const ts=state.teamStats||{};
  const cph=c=>(c.photo_url&&c.photo_url.includes('/storage/v1/'))?c.photo_url:`entrenador-${c.id}.jpeg`;
  const chip=(attrs,img,ph,name,sub)=>`<div class="chip" ${attrs}>${img?`<img src="${escapeHtml(img)}" alt="" data-ph="${ph}" onerror="fixImageError(this)">`:`<span class="chip-ph">${ph}</span>`}<div><b>${escapeHtml(name)}</b><small>${sub}</small></div></div>`;
  $('clubsGrid').innerHTML=state.teams.map(t=>{
    const st=ts[t.id]||{}, pj=Number(st.played||0), g=Number(st.wins||0), pop=st.teams?Math.round(100*Number(st.owners||0)/Number(st.teams)):null;
    const coaches=state.coachTeams.filter(r=>String(r.real_team_id)===String(t.id)).map(r=>({c:state.coaches.find(c=>String(c.id)===String(r.coach_id)),tid:r.real_team_id})).filter(o=>o.c);
    const players=state.players.filter(p=>String(p.real_team_id)===String(t.id)).sort((a,b)=>Number(a.shirt_number||999)-Number(b.shirt_number||999));
    return `<article class="club-card"><div class="club-short">${escapeHtml(t.short_name||'')}</div><h3>${escapeHtml(t.name)}</h3>
    <div class="club-stats"><div><small>Partits guanyats</small><b>${g}/${pj}</b><div class="st-bar"><i style="width:${pj?Math.round(100*g/pj):0}%"></i></div></div><div><small>Popularitat</small><b>${pop===null?'—':pop+'%'}</b><div class="st-bar"><i style="width:${pop||0}%"></i></div></div></div>
    ${(()=>{ const a=(state.attRank||{})[String(t.id)]; if(!a) return ''; const n=Object.keys(state.attRank).length; return a.scans>0?`<div class="club-att" style="margin:8px 0 2px;font-size:.92rem">🏟️ Afició: <b>${a.pos}${a.pos===1?'r':a.pos===2?'n':a.pos===3?'r':a.pos===4?'t':'è'}</b> de ${n} · ${a.scans} ${a.scans===1?'partit':'partits'}</div>`:`<div class="club-att" style="margin:8px 0 2px;font-size:.92rem">🏟️ Afició: <b>—</b> · encara cap partit</div>`; })()}
    <div class="club-sec">🧑‍🏫 Entrenadors</div><div class="chips">${coaches.map(o=>chip(`data-cid="${o.c.id}" data-ctid="${o.tid}"`,cph(o.c),'🧑‍🏫',coachName(o.c),'Entrenador')).join('')||'<small>Sense entrenadors</small>'}</div>
    <div class="club-sec">🏀 Jugadors (${players.length})</div><div class="chips">${players.map(p=>chip(`data-pid="${p.id}"`,p.photo_url||'logo.png','👤',`${p.name} ${p.surname||''}`.trim(),'#'+String(p.shirt_number??'—').replace(/\.0$/,''))).join('')||'<small>Sense jugadors</small>'}</div></article>`;
  }).join('');
}
function renderResults(){
  if(!state.round){$('resultsList').innerHTML='<div class="empty-state">No hi ha jornada activa.</div>';return;}
  api(`team_round_results?round_id=eq.${state.round.id}&select=real_team_id,result&order=real_team_id`).then(async r=>{if(!r.ok)throw new Error(await r.text());const rows=await r.json();$('resultsList').innerHTML=rows.length?rows.map(x=>`<div class="match"><div><b>${escapeHtml(teamName(x.real_team_id))}</b></div><strong>${x.result==='win'?'🟢 Victòria':'🔴 Derrota'}</strong></div>`).join(''):'<div class="empty-state"><div class="empty-icon">🏀</div><h3>Encara no hi ha resultats</h3></div>';}).catch(e=>{$('resultsList').innerHTML=`<div class="empty-state">No s'han pogut carregar els resultats.<br><small>${escapeHtml(e.message)}</small></div>`;});
}
document.querySelectorAll('.rk-tab').forEach(t=>t.addEventListener('click',()=>{
  const teams=t.dataset.rk==='teams';
  document.querySelectorAll('.rk-tab').forEach(x=>x.classList.toggle('active',x===t));
  $('rkFantasy').style.display=teams?'none':''; $('rkTeams').style.display=teams?'':'none';
  $('rkSub').textContent=teams?'Quants partits han anat a veure les persones de cada equip del club.':'Punts acumulats de tots els equips Fantasy.';
  if(teams) renderTeamAtt();
}));
async function renderTeamAtt(){
  const box=$('teamAttList'); if(!box) return;
  try{
    const r=await rpc('get_attendance_team_ranking',{}); const t=await r.text(); if(!r.ok) throw new Error(t.slice(0,140));
    const rows=JSON.parse(t||'[]'), max=Math.max(1,...rows.map(x=>Number(x.scans)));
    state.attRank=Object.fromEntries(rows.map(x=>[String(x.real_team_id),{scans:Number(x.scans),pos:1+rows.filter(y=>Number(y.scans)>Number(x.scans)).length}]));
    try{ renderClubs(); }catch{}
    box.innerHTML=rows.some(x=>Number(x.scans)>0)?rows.map((x,i)=>`<div class="ranking-row${i<3&&Number(x.scans)>0?' top'+(i+1):''}" style="--i:${i}"><span class="ranking-pos">${Number(x.scans)>0?(['🥇','🥈','🥉'][i]||i+1):'·'}</span><div class="ranking-name"><b>${escapeHtml(x.team_name)}</b><small>${x.people} ${Number(x.people)===1?'persona':'persones'}${Number(x.players)?` · ${(Number(x.scans)/Number(x.players)).toFixed(1).replace('.',',')} per jugador`:''}</small></div><strong>${x.scans} ${Number(x.scans)===1?'partit':'partits'}</strong></div>`).join(''):'<div class="empty-state">Encara no hi ha cap assistència registrada. Escaneja el QR d’un partit!</div>';
  }catch(e){ box.innerHTML=`<div class="empty-state">No s’ha pogut carregar l’afició per equips.<br><small>${escapeHtml(e.message)}</small></div>`; }
}
async function renderRanking(){
  renderTeamAtt();
  const box=$('rankingList'); if(!box)return;
  try{
    const r=await rpc('get_fantasy_classification',{}); const txt=await r.text(); if(!r.ok)throw new Error(txt.replace(/^"|"$/g,''));
    const rows=JSON.parse(txt||'[]');
    const isMine=x=>String(x.fantasy_team_id)===String(state.teamId), fmt=v=>Number(v||0).toFixed(1).replace('.',','), ord=n=>({1:'1r',2:'2n',3:'3r',4:'4t'}[n]||n+'è');
    const me=$('rankingMe'), idx=rows.findIndex(isMine);
    ['myPoints','myPoints2'].forEach(k=>{ const el=$(k); if(el) el.textContent=fmt(idx>=0?rows[idx].total_points:0); });
    if(me){ if(idx<0) me.innerHTML=''; else { const pts=Number(rows[idx].total_points||0); const extra=idx>0?` · a ${fmt(Number(rows[idx-1].total_points)-pts)} pts de la posició anterior`:(rows.length>1?` · ${fmt(pts-Number(rows[1].total_points))} pts d’avantatge`:''); me.innerHTML=`<span class="me-pos">${ord(idx+1)}</span><div><b>La teva posició</b><small>${idx+1} de ${rows.length} · ${fmt(pts)} pts${extra}</small></div>`; } }
    box.innerHTML=rows.length?rows.map((x,i)=>`<div class="ranking-row${i<3?' top'+(i+1):''}${isMine(x)?' mine':''}" style="--i:${i}"><span class="ranking-pos">${['🥇','🥈','🥉'][i]||i+1}</span><div class="ranking-name"><b>${escapeHtml(x.team_name||'Equip Fantasy')}</b>${isMine(x)?'<span class="me-badge">TU</span>':''}<small>${money(x.budget)} disponibles</small></div><strong>${Number(x.total_points||0).toFixed(1).replace('.',',')} pts</strong></div>`).join(''):'<div class="empty-state"><h3>Encara no hi ha equips classificats</h3></div>';
  }catch(e){box.innerHTML=`<div class="empty-state">No s'ha pogut carregar la classificació.<br><small>${escapeHtml(e.message)}</small></div>`;}
}
const HL_PTS=[7,5,3], HL_MEDAL=['🥇','🥈','🥉'];
function renderCoachPanel(){
  const section=$('coachPanel');
  if(!section)return;
  if(!state.coachContext.length){
    section.style.display='none';
    return;
  }
  section.style.display='';
  state.hlSel=state.hlSel||{};
  $('coachPanelSubtitle').textContent=`Hola ${state.coachContext[0].coach_name}. Un cop registrat el resultat, tria fins a 3 jugadors destacats per ordre d’importància: el 1r suma +7 punts, el 2n +5 i el 3r +3.`;
  $('coachPanelGrid').innerHTML=state.coachContext.map(ctx=>{
    const tid=String(ctx.real_team_id);
    if(!state.hlSel[tid]) state.hlSel[tid]=(ctx.highlighted_player_ids||[]).map(String);
    const sel=state.hlSel[tid];
    const players=state.players.filter(p=>String(p.real_team_id)===tid);
    const saved=(ctx.highlighted_player_ids||[]).length;
    return `<article class="coach-team-panel card">
      <div class="coach-team-header"><div><span class="coach-label">EQUIP</span><h3>${escapeHtml(ctx.real_team_name)}</h3><p>${ctx.result==='win'?'🟢 Victòria':ctx.result==='loss'?'🔴 Derrota':'⏳ Resultat pendent'} · Jornada ${ctx.round_number}</p></div><div class="pill">${saved?`⭐ ${saved} destacat${saved>1?'s':''} desat${saved>1?'s':''}`:'Sense destacats'}</div></div>
      ${ctx.result ? `<div class="coach-player-list">${players.map(p=>{
        const k=sel.indexOf(String(p.id));
        return `<button class="coach-player-option${k>=0?' selected':''}" data-hl-pick="${p.id}" data-hl-team="${tid}"><span class="coach-player-main"><b>#${escapeHtml(String(p.shirt_number ?? '—').replace(/\.0$/,''))}</b><span>${escapeHtml(p.name)} ${escapeHtml(p.surname||'')}</span></span><span>${k>=0?`${HL_MEDAL[k]} ${k+1}r · +${HL_PTS[k]}`:'Seleccionar'}</span></button>`;
      }).join('')}</div>
      <p class="muted" style="margin:.6rem 0 .3rem">Toca els jugadors per ordre: el primer que triïs és el més important. Torna a tocar-ne un per treure’l.</p>
      <button class="primary" data-hl-save="${tid}" ${sel.length?'':'disabled'}>Desar destacats (${sel.length}/3)</button>` : `<div class="notice">Quan l’administrador registri el resultat, podràs seleccionar els jugadors destacats.</div>`}
    </article>`;
  }).join('');
  document.querySelectorAll('[data-hl-pick]').forEach(b=>b.onclick=()=>{
    const tid=b.dataset.hlTeam, id=b.dataset.hlPick, sel=state.hlSel[tid]||(state.hlSel[tid]=[]);
    const k=sel.indexOf(id);
    if(k>=0) sel.splice(k,1); else if(sel.length<3) sel.push(id); else { alert('Només pots triar 3 jugadors. Treu-ne un primer.'); return; }
    renderCoachPanel();
  });
  document.querySelectorAll('[data-hl-save]').forEach(b=>b.onclick=()=>saveHighlights(b.dataset.hlSave));
}

function renderRules(){ $('budgetRule').textContent='💰 120 M€'; }

function bindActions(){
  document.querySelectorAll('[data-buy-player]').forEach(b=>b.onclick=()=>buyPlayer(Number(b.dataset.buyPlayer)));
  document.querySelectorAll('[data-captain-player]').forEach(b=>b.onclick=()=>setCaptain(Number(b.dataset.captainPlayer)));
  document.querySelectorAll('[data-sell-player]').forEach(b=>b.onclick=()=>sellPlayer(Number(b.dataset.sellPlayer)));
  document.querySelectorAll('[data-buy-coach]').forEach(b=>b.onclick=()=>buyCoach(Number(b.dataset.buyCoach),Number(b.dataset.buyCoachTeam)));
  document.querySelectorAll('[data-sell-coach]').forEach(b=>b.onclick=()=>sellCoach(Number(b.dataset.sellCoach),Number(b.dataset.sellCoachTeam)));
}
async function buyPlayer(id){const p=state.players.find(x=>Number(x.id)===id);if(!p)return;if(!confirm(`Fitxar ${p.name} ${p.surname} per ${money(Number(p.current_value)*1.05)}?`))return;await runRpc('buy_fantasy_asset',{p_fantasy_team_id:state.teamId,p_player_id:id,p_coach_id:null,p_coach_real_team_id:null,p_round_id:state.round?.id||null},'Jugador fitxat correctament.');}
async function buyCoach(id,teamId){const c=state.coaches.find(x=>Number(x.id)===id);if(!c)return;const market=state.coachMarkets.find(x=>Number(x.coach_id)===id&&Number(x.real_team_id)===teamId);const coachValue=Number(market?.current_value ?? c.current_value ?? 0);if(!confirm(`Fitxar ${coachName(c)} · ${teamName(teamId)} per ${money(coachValue*1.05)}?`))return;await runRpc('buy_fantasy_asset',{p_fantasy_team_id:state.teamId,p_player_id:null,p_coach_id:id,p_coach_real_team_id:teamId,p_round_id:state.round?.id||null},'Entrenador fitxat correctament.');}
async function sellPlayer(id){if(!confirm('Vols vendre aquest jugador pel seu valor de mercat actual?'))return;await runRpc('sell_fantasy_asset',{p_fantasy_team_id:state.teamId,p_player_id:id,p_coach_id:null,p_coach_real_team_id:null,p_round_id:state.round?.id||null},'Jugador venut correctament.');}
async function setCaptain(id){const p=state.players.find(x=>Number(x.id)===id);if(!p)return;if(state.rosterPlayers.find(x=>Number(x.player_id)===id)?.is_captain){return;}if(!confirm(`Fer ${p.name} ${p.surname||''} capità?`))return;await runRpc('set_fantasy_captain',{p_fantasy_team_id:state.teamId,p_player_id:id},'Capità actualitzat correctament.');}
async function sellCoach(id,teamId){if(!confirm(`Vols vendre ${coachName(state.coaches.find(c=>Number(c.id)===id))} · ${teamName(teamId)}?`))return;await runRpc('sell_fantasy_asset',{p_fantasy_team_id:state.teamId,p_player_id:null,p_coach_id:id,p_coach_real_team_id:teamId,p_round_id:state.round?.id||null},'Entrenador venut correctament.');}
async function saveHighlights(teamId){
  const ids=(state.hlSel?.[String(teamId)]||[]).map(Number);
  if(!ids.length) return;
  const names=ids.map((id,k)=>{ const p=state.players.find(x=>Number(x.id)===id); return `${HL_MEDAL[k]} ${p?p.name+' '+(p.surname||''):id} (+${HL_PTS[k]})`; }).join('\n');
  if(!confirm(`Desar aquests destacats?\n\n${names}`)) return;
  try{
    const r=await rpc('set_team_round_highlights',{p_real_team_id:Number(teamId),p_player_ids:ids});
    const text=await r.text();
    if(!r.ok)throw new Error(text.replace(/^"|"$/g,''));
    alert('✅ Destacats guardats.');
    delete state.hlSel[String(teamId)];
    await loadData();
    showSection('coachPanel');
  }catch(e){alert(`⚠️ ${e.message}`);}
}

async function loadCoachContext(){
  try{
    // Carreguem el context directament des de les taules per evitar dependre
    // d'una versió concreta de la funció RPC.
    const cpR=await api(`coach_profiles?select=coach_id&user_id=eq.${encodeURIComponent(state.session?.user?.id||'')}&limit=1`);
    if(!cpR.ok) throw new Error(await cpR.text());
    const cps=await cpR.json();
    const coachId=cps[0]?.coach_id, club=await isClubAccount();
    if(!coachId&&!club){ state.coachContext=[]; const tab=document.querySelector('.coach-tab'); if(tab) tab.style.display='none'; return; }

    const [ctR,roundR]=await Promise.all([
      club?Promise.resolve({ok:true,json:async()=>state.teams.map(t=>({real_team_id:t.id}))}):api(`coach_teams?coach_id=eq.${coachId}&select=real_team_id`),
      api('fantasy_rounds?is_active=eq.true&select=id,round_number&order=round_number.desc&limit=1')
    ]);
    if(!ctR.ok) throw new Error(await ctR.text());
    if(!roundR.ok) throw new Error(await roundR.text());
    const coachTeams=await ctR.json();
    const round=(await roundR.json())[0];
    if(!round){ state.coachContext=[]; const tab=document.querySelector('.coach-tab'); if(tab) tab.style.display='none'; return; }

    const ids=coachTeams.map(x=>Number(x.real_team_id)).filter(Number.isFinite);
    if(!ids.length){ state.coachContext=[]; const tab=document.querySelector('.coach-tab'); if(tab) tab.style.display='none'; return; }
    const idList=ids.join(',');
    const [teamsR,resR,highR,coachR]=await Promise.all([
      api(`real_teams?id=in.(${idList})&select=id,name`),
      api(`team_round_results?round_id=eq.${round.id}&real_team_id=in.(${idList})&select=real_team_id,result`),
      api(`team_round_highlights?round_id=eq.${round.id}&real_team_id=in.(${idList})&select=real_team_id,player_id,pos&order=pos`),
      club?Promise.resolve({ok:true,json:async()=>[{name:'Club Bàsquet',surname:'Alella'}]}):api(`coaches?id=eq.${coachId}&select=name,surname&limit=1`)
    ]);
    for(const r of [teamsR,resR,highR,coachR]) if(!r.ok) throw new Error(await r.text());
    const teams=await teamsR.json(), results=await resR.json(), highlights=await highR.json(), coaches=await coachR.json();
    const resultByTeam=Object.fromEntries(results.map(x=>[String(x.real_team_id),x.result]));
    const highlightByTeam={}; highlights.slice().sort((a,b)=>(a.pos||1)-(b.pos||1)).forEach(x=>{ (highlightByTeam[String(x.real_team_id)]=highlightByTeam[String(x.real_team_id)]||[]).push(x.player_id); });
    const teamById=Object.fromEntries(teams.map(x=>[String(x.id),x.name]));
    const coach=coaches[0];
    state.coachContext=ids.map(id=>({
      coach_name: coach ? `${coach.name||''} ${coach.surname||''}`.trim() : 'Entrenador',
      real_team_id:id,
      real_team_name:teamById[String(id)]||teamName(id),
      result:resultByTeam[String(id)]||null,
      round_number:round.round_number,
      highlighted_player_ids:highlightByTeam[String(id)]||[]
    }));
    const tab=document.querySelector('.coach-tab'); if(tab) tab.style.display='inline-flex';
  }catch(e){
    console.error('Coach context:',e);
    state.coachContext=[];
    const tab=document.querySelector('.coach-tab'); if(tab) tab.style.display='none';
  }
}

async function runRpc(name,body,success){try{const r=await rpc(name,body);const text=await r.text();if(!r.ok)throw new Error(text.replace(/^"|"$/g,''));alert(`✅ ${success}`);await loadData();showSection('team');}catch(e){console.error(e);alert(`⚠️ ${e.message}`);}}

async function loadData(){
  try{
    const [roundsR,teamsR,playersR,coachesR,coachTeamsR,coachMarketsR,teamR,ftpR,ftcR]=await Promise.all([
      api('fantasy_rounds?is_active=eq.true&select=*&order=round_number.desc&limit=1'),
      api('real_teams?select=*&order=id'), api('players?is_active=eq.true&select=*'), api('coaches?is_active=eq.true&select=*'), api('coach_teams?select=*'), api('coach_team_market?select=*&order=coach_id,real_team_id'),
      api(`fantasy_teams?id=eq.${state.teamId}&select=*`), api(`fantasy_team_players?fantasy_team_id=eq.${state.teamId}&select=*`), api(`fantasy_team_coaches?fantasy_team_id=eq.${state.teamId}&select=*`)
    ]);
    for(const [r,label] of [[roundsR,'jornada'],[teamsR,'equips'],[playersR,'jugadors'],[coachesR,'entrenadors'],[coachTeamsR,'relacions'],[coachMarketsR,'mercat entrenadors'],[teamR,'equip Fantasy'],[ftpR,'plantilla'],[ftcR,'entrenadors Fantasy']])if(!r.ok)throw new Error(`${label}: ${await r.text()}`);
    state.round=(await roundsR.json())[0]||null; state.teams=await teamsR.json(); state.players=await playersR.json(); state.coaches=await coachesR.json(); state.coachTeams=await coachTeamsR.json(); state.coachMarkets=await coachMarketsR.json(); state.team=(await teamR.json())[0]||null; state.rosterPlayers=await ftpR.json(); state.rosterCoaches=await ftcR.json();
    await loadCoachContext();
    if(!state.team) throw new Error('No s’ha trobat l’equip Fantasy de l’usuari.');
    $('teamFilter').innerHTML='<option value="">Tots els equips</option>'+state.teams.map(t=>`<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('');
    $('connectionStatus').textContent=`Supabase · Jornada ${state.round?.round_number??'—'}`; render(); loadMarket(); loadHomeMatches(); loadExtras(); maybeTour(); redeemPending(); initPush(); loadMissions(); loadPredictions(); loadReferral(); redeemRef(); initBot(); renderInstall(); renderInstall();
  }catch(e){console.error(e);$('connectionStatus').textContent='Error de connexió';$('homeStatus').innerHTML=`⚠️ <b>No s'han pogut carregar les dades.</b><br><small>${escapeHtml(e.message)}</small>`;}
}

async function adminReset(){
  if($('adminPinInput').value!=='1234') return setAdminMessage('PIN incorrecte.');
  state.admin=true; $('adminPinCard').style.display='none'; $('adminPanel').style.display='block'; setAdminMessage('Administrador actiu.');
  await loadAdminData(); loadManage();
}
async function loadAdminData(){
  if(!state.admin)return;
  $('adminRoundLabel').textContent=state.round?`Jornada ${state.round.round_number}`:'—';
  $('adminResults').innerHTML=state.teams.map(t=>`<div class="admin-result-row"><span>${escapeHtml(t.name)}</span><select data-admin-team="${t.id}"><option value="win">Victòria</option><option value="loss">Derrota</option><option value="">Sense resultat</option></select></div>`).join('');
  if(state.round){const r=await api(`team_round_results?round_id=eq.${state.round.id}&select=real_team_id,result`);const rows=r.ok?await r.json():[];const map=new Map(rows.map(x=>[String(x.real_team_id),x.result]));document.querySelectorAll('[data-admin-team]').forEach(s=>s.value=map.get(s.dataset.adminTeam)||'');}
}
async function saveAdminResults(){
  if(!state.admin||!state.round)return;
  try{
    for(const s of document.querySelectorAll('[data-admin-team]')){
      const teamId=Number(s.dataset.adminTeam), result=s.value;
      const fn=result ? 'admin_set_round_result' : 'admin_clear_round_result';
      const body=result ? {p_pin:'1234',p_round_id:state.round.id,p_real_team_id:teamId,p_result:result} : {p_pin:'1234',p_round_id:state.round.id,p_real_team_id:teamId};
      const r=await rpc(fn,body); const text=await r.text(); if(!r.ok)throw new Error(text.replace(/^"|"$/g,''));
    }
    await loadData(); await loadAdminData(); setAdminMessage('Resultats desats. Ara els entrenadors poden seleccionar el jugador destacat. Quan estigui tot revisat, prem Processar jornada.');
  }catch(e){setAdminMessage(`Error: ${e.message}`);}
}
async function processCurrentRound(){
  if(!state.admin||!state.round)return;
  if(!confirm('Processar aquesta jornada? Es calcularan punts i valors a partir dels resultats i dels jugadors destacats.'))return;
  const chk=await checkRound();
  if(chk&&(chk.missRes.length||chk.missHl.length)&&!confirm('⚠️ Falten dades:\n'+(chk.missRes.length?'• Resultats: '+chk.missRes.join(', ')+'\n':'')+(chk.missHl.length?'• Destacats: '+chk.missHl.join(', ')+'\n':'')+'\nSegur que vols processar igualment?')) return;
  if(!(await backupNow())&&!confirm('No s’ha pogut fer la còpia de seguretat. Processar igualment?')) return;
  try{
    const p=await rpc('process_fantasy_round',{p_round_id:state.round.id});
    if(!p.ok) throw new Error((await p.text()).replace(/^"|"$/g,''));
    const c=await rpc('process_coach_round',{p_round_id:state.round.id});
    if(!c.ok) throw new Error((await c.text()).replace(/^"|"$/g,''));
    await loadData(); await loadAdminData(); setAdminMessage('Jornada processada correctament.'); confetti();
  }catch(e){setAdminMessage(`Error: ${e.message}`);}
}

async function createNextRound(){
  const next=(state.round?.round_number||0)+1;
  try{
    const r=await rpc('admin_create_round',{p_pin:'1234',p_round_number:next}); const text=await r.text(); if(!r.ok)throw new Error(text.replace(/^"|"$/g,''));
    await rpc('admin_set_market',{p_closes_at:nextFriday().toISOString(),p_manual_closed:false}); await loadData(); await loadAdminData(); setAdminMessage(`Jornada ${next} creada/activada. Mercat obert fins al proper dijous a les 23:59.`);
  }catch(e){setAdminMessage(`Error: ${e.message}`);}
}
async function rollbackLastRound(){
  if(!state.admin)return;
  if(!confirm('Retrocedir l’última jornada processada? Es desfaran els punts, els canvis de valor i els destacats d’aquella jornada. Les plantilles i transferències es mantindran.'))return;
  try{
    const r=await rpc('admin_rollback_last_processed_round',{p_pin:'1234'});
    const text=await r.text();
    if(!r.ok)throw new Error(text.replace(/^"|"$/g,''));
    await loadData();
    await loadAdminData();
    setAdminMessage('Última jornada processada retrocedida correctament. Els valors i punts han tornat a l’estat anterior.');
  }catch(e){setAdminMessage(`No s’ha pogut retrocedir la jornada: ${e.message}`);}
}

async function resetRounds(){
  if(!confirm(`⚠️ ATENCIÓ: RESET TOTAL. Aquesta acció NO es pot desfer.\n\nS’ESBORRARAN:\n• tots els resultats, punts i històrics de jornades\n• les plantilles i els fitxatges de TOTS els usuaris\n\nEs RESTAURARAN:\n• el pressupost de tots els equips a 120 M€\n• el valor de tots els jugadors a 10 M€ i dels entrenadors a 12 M€\n• la Jornada 1 tornarà a ser l’activa\n\nVols continuar?`))return;
  const paraula=prompt('Per confirmar el reset total, escriu RESET (en majúscules):');
  if(paraula!=='RESET'){setAdminMessage('Reset cancel·lat. No s’ha canviat res.');return;}
  try{
    const r=await rpc('admin_reset_rounds',{p_pin:'1234'}); const text=await r.text(); if(!r.ok)throw new Error(text.replace(/^"|"$/g,''));
    await loadData(); await loadAdminData(); setAdminMessage('Reset completat. Jornada 1 activa i dades de prova netes.'); alert('✅ Reset completat. Jornada 1 activa, pressupostos a 120 M€ i valors restaurats.');
  }catch(e){setAdminMessage(`No s’ha pogut fer el reset: ${e.message}`); alert(`⚠️ No s’ha pogut fer el reset: ${e.message}`);}
}
function openAdmin(){showSection('admin');$('adminPinCard').style.display=state.admin?'none':'block';$('adminPanel').style.display=state.admin?'block':'none';}

function init(){
  if(handleRecovery()) return;
  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>showSection(t.dataset.section)));
  document.querySelectorAll('.market-tab').forEach(t=>t.addEventListener('click',()=>{state.marketType=t.dataset.market;document.querySelectorAll('.market-tab').forEach(x=>x.classList.toggle('active',x===t));$('search').value='';renderMarket();}));
  $('search').addEventListener('input',renderMarket); $('teamFilter').addEventListener('change',renderMarket);
  $('loginBtn').onclick=login; $('signupBtn').onclick=signup; $('logoutBtn').onclick=logout;
  $('adminUnlock').onclick=adminReset; $('adminSaveResults').onclick=saveAdminResults; $('adminProcessRound').onclick=processCurrentRound; $('adminNewRound').onclick=createNextRound; $('adminRollbackRound').onclick=rollbackLastRound; $('adminResetRounds').onclick=resetRounds;
  let clicks=0, timer=null; $('logoSecret').addEventListener('click',()=>{clicks++;clearTimeout(timer);timer=setTimeout(()=>clicks=0,1200);if(clicks>=5){clicks=0;openAdmin();}});
  const saved=localStorage.getItem('fantasySession');
  if(saved){try{state.session=JSON.parse(saved);state.username=state.session?.user?.user_metadata?.username||state.session?.user?.email?.split('@')[0]||'';refreshSession().then(ok=>ok?ensureFantasyTeam():showAuth());}catch{showAuth();}} else showAuth();
  setInterval(()=>{if(state.session)refreshSession();},45*60*1000);
}

/* ===== GESTIÓ D'ADMINISTRADOR: jugadors, entrenadors, usuaris, fotos i registre ===== */
async function adminRpc(name, body){
  const r=await rpc(name, body);
  if(!r.ok){ const t=await r.text(); let m=t; try{m=JSON.parse(t).message||t;}catch{} alert('⚠️ '+m); return false; }
  return true;
}
async function loadManage(){
  if(!state.admin) return;
  checkRound();
  const [u,l]=await Promise.all([rpc('admin_list_users',{}), api('admin_log?select=*&order=id.desc&limit=30')]);
  state.adminUsers=u.ok?((await u.json())||[]):[]; state.adminLog=l.ok?await l.json():[];
  renderManage(); loadWeek();
}
function coachPrice(c){ return (state.coachMarkets.find(m=>String(m.coach_id)===String(c.id))||{}).current_value??''; }
function renderManage(){
  const box=$('adminManage'); if(!box||!state.admin) return;
  const q=($('manageSearch').value||'').toLowerCase().trim();
  const hit=x=>!q||coachName(x).toLowerCase().includes(q);
  const byName=(a,b)=>coachName(a).localeCompare(coachName(b));
  const teamOpts=sel=>state.teams.map(t=>`<option value="${t.id}"${String(t.id)===String(sel)?' selected':''}>${escapeHtml(t.name)}</option>`).join('');
  const coachOpts=sel=>'<option value="">— Cap —</option>'+state.coaches.slice().sort(byName).map(c=>`<option value="${c.id}"${String(c.id)===String(sel)?' selected':''}>${escapeHtml(coachName(c))}</option>`).join('');
  const photo=k=>`<label class="secondary mg-ph" title="Pujar foto">📷<input type="file" accept="image/*" hidden data-mgphoto="${k}"></label>`;
  const who=id=>{const u=(state.adminUsers||[]).find(x=>x.user_id===id);return u?(u.username||u.email):'—';};
  const pl=state.players.filter(hit).sort(byName), cs=state.coaches.filter(hit).sort(byName);
  box.innerHTML=`
  <h4>🏀 Jugadors (${pl.length})</h4>
  <div class="mg-row" data-form="1"><input class="mg-n" placeholder="Nom"><input class="mg-s" placeholder="Cognoms"><input class="mg-d" placeholder="Dorsal" inputmode="numeric"><input class="mg-v" placeholder="Valor M€" inputmode="decimal"><select class="mg-t">${teamOpts('')}</select><button class="primary" data-mg="addp">Afegir jugador</button></div>
  ${pl.slice(0,40).map(p=>`<div class="mg-row" data-id="${p.id}"><input class="mg-n" value="${escapeHtml(p.name||'')}"><input class="mg-s" value="${escapeHtml(p.surname||'')}"><input class="mg-d" value="${escapeHtml(p.shirt_number??'')}" inputmode="numeric"><input class="mg-v" value="${escapeHtml(p.current_value??'')}" inputmode="decimal"><select class="mg-t">${teamOpts(p.real_team_id)}</select>${photo('players')}<button class="secondary" data-mg="crop" title="Reenquadrar foto">✂️</button><button class="primary" data-mg="savep">Desar</button><button class="secondary danger" data-mg="delp">Retirar</button></div>`).join('')}
  ${pl.length>40?'<small>Mostrant 40. Usa el cercador per afinar.</small>':''}
  <h4>🧑‍🏫 Entrenadors (${cs.length})</h4>
  <div class="mg-row" data-form="1"><input class="mg-n" placeholder="Nom"><input class="mg-s" placeholder="Cognoms"><input class="mg-v" placeholder="Preu M€" inputmode="decimal"><select class="mg-t">${teamOpts('')}</select><button class="primary" data-mg="addc">Afegir entrenador</button></div>
  ${cs.map(c=>`<div class="mg-row" data-id="${c.id}"><input class="mg-n" value="${escapeHtml(c.name||'')}"><input class="mg-s" value="${escapeHtml(c.surname||'')}"><input class="mg-v" value="${escapeHtml(coachPrice(c))}" inputmode="decimal">${photo('coaches')}<button class="secondary" data-mg="crop" title="Reenquadrar foto">✂️</button><button class="primary" data-mg="savec">Desar</button><button class="secondary danger" data-mg="delc">Retirar</button></div>`).join('')}
  <h4>👤 Usuaris, entrenadors i administradors</h4>
  ${(state.adminUsers||[]).map(u=>`<div class="mg-row" data-uid="${u.user_id}" data-adm="${u.is_admin?1:0}" data-tbl="${u.is_table?1:0}"><span style="flex:1 1 200px">${escapeHtml(u.username||'')} · <small>${escapeHtml(u.email||'')}</small>${u.is_admin?' 🛡️':''}</span><select class="mg-c">${coachOpts(u.coach_id)}</select><button class="primary" data-mg="role">Desar rol</button><button class="secondary" data-mg="adm">${u.is_admin?'Treure admin':'Fer admin'}</button><button class="secondary" data-mg="tbl">${u.is_table?'📋 Treure de taula':'📋 Fa taula'}</button></div>`).join('')||'<small>Sense usuaris.</small>'}
  <h4>📜 Registre d’activitat (últims 30)</h4>
  ${(state.adminLog||[]).map(x=>{const d=x.detall||{};const what=[d.name,d.surname].filter(Boolean).join(' ')||d.user_id||d.id||'';return `<div class="mg-log"><small>${new Date(x.created_at).toLocaleString('ca-ES')} · <b>${escapeHtml(who(x.user_id))}</b> · ${escapeHtml(x.tabla)} ${escapeHtml(x.operacio)} · ${escapeHtml(String(what))}</small></div>`;}).join('')||'<small>Encara no hi ha activitat.</small>'}`;
}
async function compressImage(file,max=600){
  const img=await createImageBitmap(file), k=Math.min(1,max/Math.max(img.width,img.height));
  const c=document.createElement('canvas'); c.width=Math.round(img.width*k); c.height=Math.round(img.height*k);
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return new Promise(res=>c.toBlob(res,'image/jpeg',0.82));
}
async function uploadPhoto(kind,id,file){
  try{
    const blob=await compressImage(file), path=`${kind}/${id}-${Date.now()}.jpg`;
    const r=await fetch(`${SUPABASE_URL}/storage/v1/object/fotos/${path}`,{method:'POST',headers:{...headers(),'Content-Type':'image/jpeg'},body:blob});
    if(!r.ok) return alert('⚠️ No s’ha pogut pujar la foto: '+await r.text());
    const url=`${SUPABASE_URL}/storage/v1/object/public/fotos/${path}`;
    if(await adminRpc('admin_set_photo',{p_kind:kind,p_id:id,p_url:url})){ setAdminMessage('✅ Foto pujada.'); await loadData(); await loadManage(); }
  }catch(e){ alert('⚠️ '+e.message); }
}
async function manageClick(e){
  const b=e.target.closest('[data-mg]'); if(!b) return;
  const row=b.closest('.mg-row'), a=b.dataset.mg;
  const v=s=>(row.querySelector(s)?.value||'').trim();
  const num=s=>v(s)===''?null:Number(v(s).replace(',','.'));
  const nom=()=>`${v('.mg-n')} ${v('.mg-s')}`.trim();
  if(a==='crop') return openCrop(row.querySelector('[data-mgphoto]').dataset.mgphoto,Number(row.dataset.id));
  let ok=false, msg='';
  if(a==='savep'){ ok=await adminRpc('admin_save_player',{p_id:Number(row.dataset.id),p_data:{name:v('.mg-n'),surname:v('.mg-s'),shirt_number:num('.mg-d'),current_value:num('.mg-v'),real_team_id:Number(v('.mg-t'))}}); msg='Jugador desat.'; }
  else if(a==='addp'){ if(!v('.mg-n')) return alert('Cal escriure un nom.'); ok=await adminRpc('admin_save_player',{p_id:null,p_data:{name:v('.mg-n'),surname:v('.mg-s'),shirt_number:num('.mg-d'),current_value:num('.mg-v'),real_team_id:Number(v('.mg-t'))}}); msg='Jugador afegit.'; }
  else if(a==='delp'){ if(!confirm(`Retirar ${nom()}?\n\nDeixarà de sortir al mercat. Si algú el té fitxat, se li reemborsarà el valor actual (${v('.mg-v')||'?'} M€).`)) return; ok=await adminRpc('admin_retire_player',{p_id:Number(row.dataset.id)}); msg='Jugador retirat.'; }
  else if(a==='savec'){ ok=await adminRpc('admin_save_coach',{p_id:Number(row.dataset.id),p_data:{name:v('.mg-n'),surname:v('.mg-s'),current_value:num('.mg-v')}}); msg='Entrenador desat.'; }
  else if(a==='addc'){ if(!v('.mg-n')) return alert('Cal escriure un nom.'); ok=await adminRpc('admin_save_coach',{p_id:null,p_data:{name:v('.mg-n'),surname:v('.mg-s'),current_value:num('.mg-v')},p_team_id:Number(v('.mg-t'))}); msg='Entrenador afegit.'; }
  else if(a==='delc'){ if(!confirm(`Retirar l’entrenador ${nom()}?\n\nSi algú el té fitxat, se li reemborsarà el seu valor de mercat.`)) return; ok=await adminRpc('admin_retire_coach',{p_id:Number(row.dataset.id)}); msg='Entrenador retirat.'; }
  else if(a==='role'){ ok=await adminRpc('admin_set_coach_assignment',{p_pin:'1234',p_user_id:row.dataset.uid,p_coach_id:v('.mg-c')?Number(v('.mg-c')):null}); msg='Rol d’entrenador actualitzat.'; }
  else if(a==='tbl'){ ok=await adminRpc('admin_set_table_person',{p_user_id:row.dataset.uid,p_on:row.dataset.tbl!=='1'}); msg='Llista de taula actualitzada.'; }
  else if(a==='adm'){ const fer=row.dataset.adm!=='1'; if(!confirm(fer?'Donar permisos d’administrador a aquest usuari?':'Treure els permisos d’administrador a aquest usuari?')) return; ok=await adminRpc('admin_set_admin',{p_user_id:row.dataset.uid,p_admin:fer}); msg='Permisos actualitzats.'; }
  if(ok){ setAdminMessage('✅ '+msg); await loadData(); await loadManage(); }
}
if($('adminManage')){
  $('adminManage').addEventListener('click',manageClick);
  $('adminManage').addEventListener('change',e=>{const i=e.target.closest('[data-mgphoto]'); if(i&&i.files[0]) uploadPhoto(i.dataset.mgphoto,Number(i.closest('.mg-row').dataset.id),i.files[0]);});
  $('manageSearch').addEventListener('input',renderManage);
}

/* ===== MERCAT: tancament setmanal ===== */
function nextFriday(){ return nextThursday(); }
function nextThursday(){ const d=new Date(); d.setHours(23,59,0,0); d.setDate(d.getDate()+((4-d.getDay()+7)%7)); if(d<=new Date()) d.setDate(d.getDate()+7); return d; }
function marketClosed(){ const m=state.market; return !!m&&!!(m.manual_closed||(m.closes_at&&new Date(m.closes_at)<=new Date())); }
const fmtData=t=>t.toLocaleString('ca-ES',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
async function loadMarket(){
  const r=await api('market_settings?id=eq.1&select=*'); state.market=r.ok?((await r.json())[0]||null):null;
  const m=state.market, st=$('adminMarketStatus');
  if(st) st.textContent=marketClosed()?'Estat: 🔒 tancat':`Estat: 🟢 obert${m?.closes_at?' fins '+fmtData(new Date(m.closes_at)):''}`;
  const inp=$('marketCloseAt'); if(inp) inp.value=m?.closes_at?new Date(new Date(m.closes_at)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'';
  renderMarketBanner();
}
function tickMarket(){
  const s=$('mkCount'), m=state.market; if(!s||!m||!m.closes_at) return;
  const ms=new Date(m.closes_at)-new Date();
  if(ms<=0){ renderMarketBanner(); return; }
  if(ms<864e5) $('marketBanner').classList.add('soon');
  if(ms<3e5) $('marketBanner').classList.add('urgent');
  const t=Math.floor(ms/1000), d=Math.floor(t/86400), h=Math.floor(t%86400/3600), mi=Math.floor(t%3600/60), se=t%60;
  const p=(n,u,pl)=>`${n} ${n===1?u:pl}`;
  s.textContent=`${p(d,'dia','dies')}, ${p(h,'hora','hores')}, ${p(mi,'minut','minuts')} i ${p(se,'segon','segons')}`;
}
function renderMarketBanner(){
  const el=$('marketBanner'); if(!el) return;
  const m=state.market, closed=marketClosed();
  document.body.classList.toggle('market-closed',closed);
  if(closed){ el.className='market-banner closed'; el.innerHTML='<span class="lock">🔒</span> <b>Mercat tancat.</b><span class="mb-short"> Torna a obrir amb la propera jornada.</span><span class="mb-more"> No es poden fer fitxatges, vendes ni canvis de capità fins que comenci la propera jornada. El mercat tanca cada dijous a les 23:59 (el divendres hi ha partit) perquè ningú faci moviments un cop coneguts els resultats reals.</span>'; }
  else if(m&&m.closes_at){ const t=new Date(m.closes_at), h=(t-new Date())/36e5; el.className='market-banner'+(h<24?' soon':''); el.innerHTML=`${h<24?'⏳':'🟢'} <b>Mercat obert</b> fins al ${fmtData(t)}.<br>⏱️ El mercat es tancarà en <b id="mkCount"></b>`; tickMarket(); }
  else { el.className='market-banner'; el.innerHTML='🟢 <b>Mercat obert.</b>'; }
}
async function saveMarket(closesAt,manual,msg){ if(await adminRpc('admin_set_market',{p_closes_at:closesAt,p_manual_closed:manual})){ setAdminMessage('✅ '+msg); await loadMarket(); if(!state.market) alert('⚠️ S’ha desat, però no es pot llegir l’estat del mercat. Falta el permís de lectura a la taula market_settings (executa el SQL d’arreglament).'); else alert('✅ '+msg+(marketClosed()?' El mercat està tancat.':(state.market.closes_at?' El mercat es tancarà el '+fmtData(new Date(state.market.closes_at))+'.':''))); } }
if($('marketSave')){
  $('marketSave').onclick=()=>{ const v=$('marketCloseAt').value; saveMarket(v?new Date(v).toISOString():null,false,'Tancament desat.'); };
  $('marketCloseNow').onclick=()=>{ if(confirm('Tancar el mercat ara mateix?')) saveMarket(state.market?.closes_at||null,true,'Mercat tancat.'); };
  $('marketOpenNow').onclick=()=>{ if(confirm('Obrir el mercat fins al proper dijous a les 23:59?')) saveMarket(nextFriday().toISOString(),false,'Mercat obert.'); };
}
setInterval(tickMarket,1000);

/* ===== ESTADÍSTIQUES DE JUGADOR ===== */
const f1=v=>Number(v||0).toFixed(1).replace('.',',');
function svgLine(vals,labs){
  const W=320,H=150,p=28,n=vals.length,mn=Math.min(...vals),mx=Math.max(...vals),r=(mx-mn)||1,st=Math.ceil(n/7);
  const x=i=>n>1?p+i*(W-2*p)/(n-1):W/2, y=v=>H-p-((v-mn)/r)*(H-2*p-8);
  const pts=vals.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="st-svg"><polygon points="${x(0)},${H-p} ${pts} ${x(n-1)},${H-p}" fill="rgba(232,118,44,.14)"/><polyline class="draw" pathLength="1" points="${pts}" fill="none" stroke="#e8762c" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${vals.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="#e8762c"/>${i%st===0||i===n-1?`<text x="${x(i)}" y="${y(v)-9}" text-anchor="middle" font-size="9" font-weight="700" fill="#24332c">${f1(v)}</text><text x="${x(i)}" y="${H-8}" text-anchor="middle" font-size="9" fill="#5d6d65">${labs[i]}</text>`:''}`).join('')}</svg>`;
}
function svgBars(rows,labs){
  const W=320,H=150,p=28,n=rows.length,mx=Math.max(1,...rows.map(r=>Number(r.total_points||0))),cw=(W-2*p)/n,bw=Math.min(30,cw-6),y=v=>H-p-(v/mx)*(H-2*p-10);
  return `<svg viewBox="0 0 ${W} ${H}" class="st-svg"><line x1="${p}" x2="${W-p}" y1="${H-p}" y2="${H-p}" stroke="#ccd5cf"/>${rows.map((r,i)=>{const w=Number(r.win_points||0),h=Number(r.highlight_points||0),cx=p+cw*(i+.5),x=cx-bw/2;return `<rect x="${x}" y="${y(w)}" width="${bw}" height="${H-p-y(w)}" rx="3" fill="#0f6b46"/><rect x="${x}" y="${y(w+h)}" width="${bw}" height="${y(w)-y(w+h)}" rx="3" fill="#e8762c"/><text x="${cx}" y="${y(w+h)-4}" text-anchor="middle" font-size="9" font-weight="700" fill="#24332c">${f1(w+h)}</text><text x="${cx}" y="${H-8}" text-anchor="middle" font-size="9" fill="#5d6d65">${labs[i]}</text>`;}).join('')}</svg>`;
}
function closeStats(){ const m=$('statsModal'); if(m) m.classList.remove('open'); document.body.style.overflow=''; }
async function openStats(id,kind='player',teamId=null){
  const isC=kind==='coach';
  const p=isC?state.coaches.find(x=>Number(x.id)===id):state.players.find(x=>Number(x.id)===id); if(!p) return;
  const tid=isC?teamId:p.real_team_id;
  let m=$('statsModal');
  if(!m){ m=document.createElement('div'); m.id='statsModal'; m.className='st-modal'; document.body.appendChild(m);
    m.addEventListener('click',e=>{ if(e.target===m||e.target.closest('.st-close')) closeStats(); });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeStats(); }); }
  const photo=isC?((p.photo_url&&p.photo_url.includes('/storage/v1/'))?p.photo_url:`entrenador-${id}.jpeg`):p.photo_url, em=isC?'🧑‍🏫':'👤';
  const ph=photo?`<img src="${escapeHtml(photo)}" alt="" data-ph="${em}" onerror="fixImageError(this)">`:(isC?`<div class="photo-placeholder">${em}</div>`:'<img src="logo.png" alt="" class="logo-ph">');
  const nm=isC?coachName(p):`${p.name} ${p.surname||''}`;
  const head=`<button class="st-close" aria-label="Tancar">✕</button><div class="st-head">${ph}<div><h3>${escapeHtml(nm)}</h3><small>🏀 ${escapeHtml(teamName(tid))} · ${isC?'Entrenador':'#'+escapeHtml(String(p.shirt_number??'—').replace(/\.0$/,''))}</small></div></div>`;
  m.innerHTML=`<div class="st-card">${head}<p>Carregant estadístiques…</p></div>`; m.classList.add('open'); document.body.style.overflow='hidden';
  const hUrl=isC?`coach_round_history?coach_id=eq.${id}${tid?`&real_team_id=eq.${tid}`:''}&order=round_id.asc&select=*`:`player_round_history?player_id=eq.${id}&order=round_id.asc&select=*`;
  const [hr,rr,pr]=await Promise.all([api(hUrl),api('fantasy_rounds?select=id,round_number'),rpc(isC?'get_coach_popularity':'get_player_popularity',isC?{p_coach_id:id}:{p_player_id:id})]);
  const rows=hr.ok?await hr.json():[]; const rn={}; (rr.ok?await rr.json():[]).forEach(x=>rn[x.id]=x.round_number);
  const pop=pr.ok?await pr.json().catch(()=>null):null; const lab=r=>'J'+(rn[r.round_id]??'?');
  const mk=isC?state.coachMarkets.find(r=>String(r.coach_id)===String(id)&&String(r.real_team_id)===String(tid)):null;
  const cur=Number(isC?(mk?.current_value??p.current_value??0):(p.current_value||0)), ini=rows.length?Number(rows[0].value_after)-Number(rows[0].value_change):cur, delta=cur-ini;
  const pts=rows.reduce((s,r)=>s+Number(r.total_points||0),0), wins=rows.filter(r=>r.result==='win').length, hl=rows.filter(r=>r.is_highlighted).length, streak=rows.length?Number(rows[rows.length-1].win_streak||0):0;
  const tile=(k,v,c='')=>`<div><small>${k}</small><b class="${c}">${v}</b></div>`;
  const pct=pop&&Number(pop.teams)?Math.round(100*Number(pop.owners)/Number(pop.teams)):null;
  const body=`<div class="st-kpis">${tile('Punts totals',f1(pts))}${tile('Jornades',rows.length)}${tile('Victòries',`${wins}/${rows.length}`)}${isC?tile('Variació',`${delta>=0?'+':''}${f1(delta)} M€`,delta>=0?'st-up':'st-down'):tile('Destacat',`${hl} ${hl===1?'cop':'cops'}`)}${tile('Ratxa',streak)}${tile('Valor',money(cur))}</div>`
   +(rows.length?`<h4>Evolució del valor <span class="${delta>=0?'st-up':'st-down'}">${delta>=0?'▲ +':'▼ '}${f1(delta)} M€</span></h4>${svgLine([ini,...rows.map(r=>Number(r.value_after))],['Inici',...rows.map(lab)])}<h4>Punts per jornada</h4>${svgBars(rows.slice(-12),rows.slice(-12).map(lab))}<div class="st-legend"><i style="background:#0f6b46"></i>Victòria${isC?'':'<i style="background:#e8762c"></i>Destacat'}</div>`:'<p class="st-empty">Encara no hi ha jornades processades. Les gràfiques apareixeran quan es processi la primera jornada.</p>')
   +(pct!==null?`<h4>Popularitat</h4><div class="st-bar"><i style="width:${pct}%"></i></div><small>${pop.owners} de ${pop.teams} equips el tenen (${pct}%)</small>`:'');
  m.innerHTML=`<div class="st-card">${head}${body}</div>`;
}
document.addEventListener('click',e=>{ if(Date.now()-(window.__dragged||0)<400) return; const act=e.target.closest('[data-act]'); if(act){ const id=Number(act.dataset.id); return act.dataset.act==='cap'?setCaptain(id):sellPlayer(id); } if(e.target.closest('button,a,input,select,label,#statsModal')) return; const c=e.target.closest('[data-pid]'); if(c) return openStats(Number(c.dataset.pid)); const k=e.target.closest('[data-cid]'); if(k) openStats(Number(k.dataset.cid),'coach',k.dataset.ctid); });

function openCrop(kind,id){
  const p=(kind==='players'?state.players:state.coaches).find(x=>Number(x.id)===id); if(!p) return;
  const url=kind==='players'?p.photo_url:((p.photo_url&&p.photo_url.includes('/storage/v1/'))?p.photo_url:`entrenador-${id}.jpeg`);
  if(!url) return alert('Aquest jugador no té foto per reenquadrar. Puja’n una amb el botó 📷.');
  const m=document.createElement('div'); m.className='st-modal open'; m.id='cropModal';
  m.innerHTML=`<div class="st-card"><button class="st-close" aria-label="Tancar">✕</button><h3 class="crop-title">Reenquadrar foto</h3><p class="st-empty">Arrossega la foto i usa el control per ampliar-la. El cercle mostra com es veurà.</p><div class="crop-box" id="cropBox"><img id="cropImg" crossorigin="anonymous" alt=""><div class="crop-mask"></div></div><input id="cropZoom" type="range" min="1" max="3" step="0.01" value="1" style="width:100%"><div class="mg-row"><button class="primary" id="cropSave">Desar enquadrament</button><button class="secondary" id="cropCancel">Cancel·lar</button></div></div>`;
  document.body.appendChild(m); document.body.style.overflow='hidden';
  const close=()=>{ m.remove(); document.body.style.overflow=''; };
  const img=$('cropImg'), box=$('cropBox'), B=box.clientWidth; let z=1,ox=0,oy=0,w=1,h=1,k0=1,drag=null;
  const apply=()=>{ const W=w*k0*z,H=h*k0*z; ox=Math.min(0,Math.max(B-W,ox)); oy=Math.min(0,Math.max(B-H,oy)); Object.assign(img.style,{width:W+'px',height:H+'px',left:ox+'px',top:oy+'px'}); };
  img.onload=()=>{ w=img.naturalWidth; h=img.naturalHeight; k0=B/Math.min(w,h); ox=(B-w*k0)/2; oy=0; apply(); };
  img.onerror=()=>{ alert('No s’ha pogut carregar la foto.'); close(); };
  img.src=url;
  box.addEventListener('pointerdown',e=>{ drag={x:e.clientX,y:e.clientY,ox,oy}; box.setPointerCapture(e.pointerId); });
  box.addEventListener('pointermove',e=>{ if(!drag) return; ox=drag.ox+e.clientX-drag.x; oy=drag.oy+e.clientY-drag.y; apply(); });
  box.addEventListener('pointerup',()=>{ drag=null; });
  $('cropZoom').addEventListener('input',e=>{ const cx=(B/2-ox)/(w*k0*z), cy=(B/2-oy)/(h*k0*z); z=Number(e.target.value); ox=B/2-cx*w*k0*z; oy=B/2-cy*h*k0*z; apply(); });
  m.addEventListener('click',e=>{ if(e.target===m||e.target.closest('.st-close')||e.target.id==='cropCancel') close(); });
  $('cropSave').onclick=()=>{
    try{
      const f=k0*z, c=document.createElement('canvas'); c.width=c.height=600;
      c.getContext('2d').drawImage(img,-ox/f,-oy/f,B/f,B/f,0,0,600,600);
      c.toBlob(async blob=>{ close(); await uploadPhoto(kind,id,blob); },'image/jpeg',.88);
    }catch(err){ alert('⚠️ No s’ha pogut desar l’enquadrament: '+err.message); }
  };
}
/* ===== GUIA PER A NOUS USUARIS ===== */
const TOUR=[
 {i:'🏀',t:'Benvingut al Fantasy!',h:`<p>Crea el teu equip ideal amb <b>jugadors i entrenadors reals</b> del Club Bàsquet Alella. Quan els seus equips guanyen, <b>tu sumes punts</b> i puges a la classificació.</p><ul><li>Comences amb <b>120 M€</b> de pressupost.</li><li>Pots tenir <b>8 jugadors</b> i <b>2 entrenadors</b>.</li><li>Cada jornada es calculen els punts amb els resultats reals.</li></ul><p>Aquesta guia t’explica cada cosa en un minut.</p>`},
 {i:'📋',t:'La pantalla d’inici',go:'home',h:`<p>A la targeta taronja de dalt tens el teu resum:</p><ul><li><b>Pressupost</b>: els M€ que et queden per fitxar.</li><li><b>8/8 jugadors · 2/2 entrenadors</b>: quants en tens de cada.</li><li><b>Jornada</b>: la jornada en curs.</li><li><b>Els teus punts</b>: els que portes acumulats.</li></ul><p>Sota hi ha la franja del <b>mercat</b>: 🟢 obert (amb compte enrere), ⏳ queda poc, o 🔒 tancat.</p>`},
 {i:'🧭',t:'Les pestanyes',h:`<div class="tour-legend"><b>⌂ Inici</b><span>Resum de la teva situació</span><b>👕 Plantilla</b><span>El teu equip sobre la pista</span><b>🏀 Mercat</b><span>Fitxar jugadors i entrenadors</span><b>🏟️ Equips</b><span>Els equips reals, amb les seves estadístiques</span><b>🏆 Classificació</b><span>Qui va primer</span><b>📅 Resultats</b><span>Resultats reals de cada jornada</span><b>ℹ️ Regles</b><span>Totes les normes</span></div>`},
 {i:'🛒',t:'El mercat',go:'market',h:`<p>Aquí fitxes jugadors i entrenadors. Canvia entre <b>Jugadors</b> i <b>Entrenadors</b> a dalt, i fes servir el cercador i el filtre d’equip.</p><ul><li>Prem <span class="demo">Fitxar · 10,0 M€</span> per fitxar. A la compra s’hi suma una <b>comissió del 5%</b>.</li><li>Toca la targeta (no el botó) per veure’n les <b>estadístiques</b>.</li><li>Cada targeta mostra el <b>valor</b> i els <b>punts</b> que porta.</li></ul>`},
 {i:'👕',t:'La teva plantilla',go:'team',h:`<p>És el teu equip: els <b>entrenadors a dalt</b> i els <b>8 jugadors</b> sobre la pista.</p><div class="tour-legend"><span class="demo">C</span><span>El <b>capità</b>: suma <b>+10 punts extra</b> al teu equip cada jornada que <b>guanya</b></span><span class="demo grey">☆ / ⭐</span><span>Fer capità aquest jugador</span><span class="demo grey">💸</span><span>Vendre’l: et retornen el valor actual, sense comissió</span><span class="demo grey">+</span><span>Lloc buit: et porta al mercat per fitxar-ne un</span></div><p>Pots <b>arrossegar</b> els jugadors per ordenar-los al teu gust. Al mòbil, mantén premuda la targeta un moment i arrossega.</p>`},
 {i:'📊',t:'Estadístiques',h:`<p>Toca qualsevol targeta de jugador o d’entrenador per obrir la seva fitxa:</p><ul><li>Punts totals, victòries, ratxa i valor.</li><li>Gràfica de l’<b>evolució del valor</b> i dels <b>punts per jornada</b>.</li><li>La <b>popularitat</b>: quants equips Fantasy el tenen.</li></ul><p>A <b>Equips</b> hi ha tots els integrants de cada equip real, amb els partits guanyats i la popularitat.</p>`},
 {i:'⭐',t:'Com es guanyen punts',go:'rules',h:`<ul><li><b>Victòria</b> del seu equip: <b>12 punts</b> la primera, <b>13</b> la segona seguida, <b>14</b> la tercera… Cada victòria seguida suma 1 punt més: és la <b>ratxa</b> 🔥.</li><li><b>Jugadors destacats</b>: l’entrenador n’escull fins a 3 per ordre després del partit: <b>+7, +5 i +3 punts</b> extra, encara que l’equip perdi.</li><li><b>Entrenadors</b>: sumen punts quan el seu equip guanya, també amb bonus per ratxa.</li><li><b>Capità</b>: <b>+10 punts extra</b> a la teva classificació cada jornada en què el teu capità <b>guanya</b>.</li><li>Només compten els punts que genera cada jugador o entrenador <b>mentre és a la teva plantilla</b>.</li></ul><p>A més, el <b>valor</b> de jugadors i entrenadors canvia després de cada jornada segons els resultats.</p>`},
 {i:'🔒',t:'Normes del mercat',h:`<ul><li>Pressupost inicial: <b>120 M€</b>. Comprar té un <b>5% de comissió</b>; vendre, cap.</li><li>Màxim <b>8 jugadors</b> i <b>2 entrenadors</b>.</li><li>Màxim <b>1 jugador de cada equip real</b>, amb una excepció: <b>a partir del 5 d’octubre pots tenir-ne 2 del mateix equip</b>, però només d’un equip.</li><li>Màxim <b>2 fitxatges per jornada</b> (abans dels primers resultats, els que vulguis).</li><li>El mercat <b>tanca cada dijous a les 23:59</b> i no s’obre fins que comença la jornada següent. Així ningú fitxa sabent ja els resultats. Tancat, tampoc es pot vendre ni canviar el capità.</li></ul>`},
 {i:'🏆',t:'Classificació i resultats',go:'ranking',h:`<ul><li>A <b>Classificació</b> veus tots els equips per punts. La teva fila porta l’etiqueta <span class="demo">TU</span>, i a dalt hi ha la teva posició. 🥇🥈🥉 són els tres primers.</li><li>A <b>Resultats</b> tens els resultats reals de cada jornada.</li></ul>`},
 {i:'👀',t:'Vés a veure partits',go:'home',h:`<p>Si vens a veure un partit d’un altre equip del club, a l’<b>Inici</b> prem <span class="demo">📷 He vingut a veure un partit</span> i escaneja el <b>QR de la taula</b>: sumes <b>+3 punts</b>.</p><ul><li>A l’<b>Inici</b> veuràs el <b>calendari d’aquesta jornada</b>: tots els partits, a casa (🏠) i a fora (✈️), amb l’hora i l’estat. El QR només hi és als partits a casa. Els marcats amb <b>⭐ x2</b> donen el doble de punts.</li><li>Si vas a veure partits <b>setmanes seguides</b>, tens bonus: <b>+2</b> a la 3a setmana i <b>+5</b> a la 5a.</li><li>Completa les <b>missions</b> i convida amics amb el teu <b>codi</b> per sumar punts extra.</li><li>Només un cop per partit.</li><li>El QR canvia cada pocs segons: s’ha d’escanejar allà mateix.</li><li>Si fas taula en un partit, tens la pestanya <b>Taula</b> amb el QR del teu partit.</li></ul>`},
 {i:'🧑‍🏫',t:'Ets entrenador?',h:`<p>Si ets entrenador del club, registra’t amb el teu correu habitual i l’administrador vincularà el teu compte. Veuràs una pestanya <b>Entrenador</b> on, després de cada partit, pots triar els <b>3 jugadors destacats</b> del teu equip per ordre d’importància (+7, +5 i +3 punts).</p>`},
 {i:'🔮',t:'Pronòstics',go:'home',h:`<p>Cada jornada, a l’<b>Inici</b>, pots pronosticar fins a <b>5 equips</b> del club: <b>guanyaran o perdran</b>.</p><ul><li><b>+2 punts</b> per cada encert.</li><li><b>+3 extra</b> si els encertes tots (mínim 3 pronòstics).</li><li>Es tanquen amb el mercat, dijous a les 23:59. Quan es tanquen, veuràs què pensen els altres usuaris.</li></ul>`},
 {i:'🎉',t:'Tot a punt!',go:'market',h:`<p>Ja saps tot el que cal. Comença fitxant el teu equip des del <b>Mercat</b>, i recorda que tanca el dijous a les 23:59.</p><p>Pots tornar a veure aquesta guia quan vulguis amb el botó <span class="demo dark">❓ Guia</span> de dalt a la dreta, o des de la pestanya Regles.</p>`}
];
function openTour(start=0){
  let i=start, m=$('tourModal');
  if(!m){ m=document.createElement('div'); m.id='tourModal'; m.className='st-modal'; document.body.appendChild(m); }
  const close=()=>{ m.classList.remove('open'); document.body.style.overflow=''; };
  const draw=()=>{ const s=TOUR[i], last=i===TOUR.length-1;
    m.innerHTML=`<div class="st-card tour"><button class="st-close" aria-label="Tancar">✕</button><div class="tour-hero">${s.i}</div><h3>${s.t}</h3><div class="tour-body">${s.h}</div><div class="tour-dots">${TOUR.map((_,k)=>`<i class="${k===i?'on':''}"></i>`).join('')}</div><div class="tour-nav"><button class="secondary" data-t="prev" ${i?'':'disabled'}>← Enrere</button>${s.go?'<button class="secondary" data-t="go">Veure-ho</button>':''}<button class="primary" data-t="next">${last?'Començar! 🏀':'Següent →'}</button></div></div>`; };
  m.onclick=e=>{ if(e.target===m||e.target.closest('.st-close')) return close(); const b=e.target.closest('[data-t]'); if(!b) return; const a=b.dataset.t;
    if(a==='prev'&&i>0){ i--; draw(); } else if(a==='next'){ if(i<TOUR.length-1){ i++; draw(); } else close(); } else if(a==='go'){ const g=TOUR[i].go; close(); showSection(g); } };
  draw(); m.classList.add('open'); document.body.style.overflow='hidden';
}
function maybeTour(){ const uid=state.session?.user?.id; if(!uid) return; const k='tour_'+uid; if(localStorage.getItem(k)) return; localStorage.setItem(k,'1'); setTimeout(()=>openTour(),700); }
if($('helpBtn')) $('helpBtn').addEventListener('click',()=>openTour());

/* ===== PRIVACITAT, RECUPERACIÓ, COPIA, AVISOS, NOM D'EQUIP ===== */
function handleRecovery(){
  const hp=new URLSearchParams(location.hash.slice(1));
  if(hp.get('type')!=='recovery'||!hp.get('access_token')) return false;
  state.recoveryToken=hp.get('access_token'); history.replaceState(null,'',location.pathname+location.search);
  ['loginForm','signupForm','recoverForm'].forEach(id=>$(id).style.display='none'); $('newPassForm').style.display='block'; return true;
}
async function recoverPassword(){
  const email=$('recoverEmail').value.trim(); if(!email) return setAuthMessage('Escriu el teu correu.');
  const r=await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(location.origin+location.pathname)}`,{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email})});
  setAuthMessage(r.ok?'Si el correu existeix, t’hem enviat un enllaç per crear una nova contrasenya. Revisa també la carpeta de correu brossa.':'No s’ha pogut enviar el correu. Torna-ho a provar més tard.',r.ok);
}
async function setNewPassword(){
  const p=$('newPass').value, p2=$('newPass2').value;
  if(p.length<6) return setAuthMessage('La contrasenya ha de tenir com a mínim 6 caràcters.'); if(p!==p2) return setAuthMessage('Les contrasenyes no coincideixen.');
  const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{method:'PUT',headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+state.recoveryToken,'Content-Type':'application/json'},body:JSON.stringify({password:p})});
  if(!r.ok) return setAuthMessage('No s’ha pogut canviar la contrasenya. L’enllaç pot haver caducat: demana’n un de nou.');
  state.recoveryToken=null; $('newPassForm').style.display='none'; $('loginForm').style.display='block'; setAuthMessage('Contrasenya actualitzada. Ja pots iniciar sessió.',true);
}
function showAuthForm(id){ ['loginForm','signupForm','recoverForm','newPassForm'].forEach(x=>$(x).style.display=x===id?'block':'none'); setAuthMessage(''); }
$('forgotLink').addEventListener('click',e=>{ e.preventDefault(); showAuthForm('recoverForm'); });
$('backLogin').addEventListener('click',e=>{ e.preventDefault(); showAuthForm('loginForm'); });
$('recoverBtn').addEventListener('click',recoverPassword); $('newPassBtn').addEventListener('click',setNewPassword);
['showLogin','showSignup'].forEach(id=>$(id).addEventListener('click',()=>{ $('recoverForm').style.display='none'; $('newPassForm').style.display='none'; }));
function openPrivacy(){
  let m=$('privacyModal');
  if(!m){ m=document.createElement('div'); m.id='privacyModal'; m.className='st-modal'; document.body.appendChild(m); m.addEventListener('click',e=>{ if(e.target===m||e.target.closest('.st-close')) m.classList.remove('open'); }); }
  m.innerHTML=`<div class="st-card tour"><button class="st-close" aria-label="Tancar">✕</button><h3>Avís de privacitat</h3><div class="tour-body"><p><b>Responsable:</b> Club Bàsquet Alella.</p><p><b>Quines dades guardem:</b> el teu nom d’usuari, el correu electrònic, la contrasenya (xifrada) i la teva activitat al joc (plantilla, fitxatges i classificació).</p><p><b>Per a què:</b> només per gestionar el teu compte i el joc Fantasy del club. No es cedeixen a tercers ni s’utilitzen amb finalitats comercials. Les dades s’emmagatzemen en un servei d’allotjament (Supabase) que actua com a proveïdor tècnic.</p><p><b>Dades del club:</b> els noms (i, si n’hi ha, les imatges) de jugadors i entrenadors només els poden veure els usuaris registrats.</p><p><b>Menors:</b> els menors de 14 anys necessiten l’autorització del pare, la mare o el tutor legal per registrar-se.</p><p><b>Base legal:</b> el teu consentiment, que pots retirar en qualsevol moment.</p><p><b>Els teus drets:</b> pots demanar accedir a les teves dades, rectificar-les o que s’eliminin, adreçant-te al Club Bàsquet Alella.</p></div></div>`;
  m.classList.add('open');
}
$('openPrivacy').addEventListener('click',e=>{ e.preventDefault(); openPrivacy(); });

async function checkRound(){
  if(!state.round) return null; const rid=state.round.id, el=$('adminChecklist');
  const [rr,hh]=await Promise.all([api(`team_round_results?round_id=eq.${rid}&select=real_team_id,result`),api(`team_round_highlights?round_id=eq.${rid}&select=real_team_id,pos`)]);
  const res=rr.ok?await rr.json():[], hl=hh.ok?await hh.json():[];
  const withRes=new Set(res.filter(x=>x.result).map(x=>String(x.real_team_id))), hlCount={}; hl.forEach(x=>{hlCount[String(x.real_team_id)]=(hlCount[String(x.real_team_id)]||0)+1;}); const withHl=new Set(Object.keys(hlCount).filter(k=>hlCount[k]>=3));
  const missRes=state.teams.filter(t=>!withRes.has(String(t.id))).map(t=>t.name), missHl=state.teams.filter(t=>withRes.has(String(t.id))&&!withHl.has(String(t.id))).map(t=>t.name);
  if(el) el.innerHTML=`<div>${missRes.length?'⚠️':'✅'} Resultats: ${withRes.size}/${state.teams.length}${missRes.length?' · falten: '+escapeHtml(missRes.join(', ')):''}</div><div>${missHl.length?'⚠️':'✅'} Destacats complets (3 per equip amb resultat): ${withRes.size-missHl.length}/${withRes.size}${missHl.length?' · falten: '+escapeHtml(missHl.join(', ')):''}</div>`;
  return {missRes,missHl};
}
async function backupNow(){
  try{
    const r=await rpc('admin_export',{}); if(!r.ok) throw new Error(await r.text());
    const blob=new Blob([JSON.stringify(await r.json())],{type:'application/json'}), a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download=`copia-fantasy-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),4000); setAdminMessage('✅ Còpia de seguretat descarregada.'); return true;
  }catch(e){ alert('⚠️ No s’ha pogut fer la còpia: '+e.message); return false; }
}
async function loadAnnounce(){ const r=await api('announcements?active=eq.true&order=id.desc&limit=1&select=id,text'); state.announce=r.ok?((await r.json())[0]||null):null; renderAnnounce(); }
function renderAnnounce(){ const el=$('announceBanner'), a=state.announce; if(!el) return; el.innerHTML=(a&&!localStorage.getItem('ann_'+a.id))?`<span>📣 ${escapeHtml(a.text)}</span><button data-ann="${a.id}" aria-label="Tancar">✕</button>`:''; }
$('announceBanner').addEventListener('click',e=>{ const b=e.target.closest('[data-ann]'); if(b){ localStorage.setItem('ann_'+b.dataset.ann,'1'); renderAnnounce(); } });
$('adminCheckBtn').onclick=checkRound; $('adminBackup').onclick=backupNow;
$('annPost').onclick=async()=>{ const t=$('annText').value.trim(); if(t.length<3) return alert('Escriu un avís.'); if(await adminRpc('admin_post_announcement',{p_text:t})){ $('annText').value=''; alert('✅ Avís publicat.'); await loadAnnounce(); } };
$('annClear').onclick=async()=>{ if(confirm('Retirar els avisos actius?')&&await adminRpc('admin_clear_announcements',{})){ alert('✅ Avisos retirats.'); await loadAnnounce(); } };
$('renameTeam').onclick=async()=>{
  const n=prompt('Nom del teu equip (3 a 24 caràcters). Deixa-ho buit per tornar al nom d’usuari:',state.team?.custom_name||''); if(n===null) return;
  const r=await rpc('set_team_name',{p_name:n.trim()});
  if(!r.ok){ const t=await r.text(); let m=t; try{m=JSON.parse(t).message||t;}catch{} return alert('⚠️ '+m); }
  alert('✅ Nom actualitzat.'); await loadData();
};

/* ===== CONSELLS AUTOMÀTICS ===== */
const TIP_MS=12000; /* temps entre frases, en mil·lisegons (12000 = 12 s) */
const TIPS=[
"Tens algun dubte? Toca el botó 💬 Ajuda de dalt a la dreta i l’assistent te’l resol.",
"Comences amb 120 M€: gasta’ls amb cap, no cal fitxar-ho tot el primer dia.",
"Una plantilla completa té 8 jugadors i 2 entrenadors.",
"Pots tenir 2 jugadors del mateix equip real, però només una vegada: la resta, d’equips diferents!",
"Comprar té una comissió del 5%; vendre no en té cap.",
"Pots fer un màxim de 2 fitxatges per jornada (abans dels primers resultats, els que vulguis).",
"o|El mercat tanca el dijous a les 23:59. No ho deixis per a l’últim minut!",
"c|El mercat és tancat: aprofita per revisar la plantilla i planificar els pròxims fitxatges.",
"o|Vigila el compte enrere de dalt de tot: marca quan tanca el mercat.",
"El mercat no es reobre fins que comença la jornada següent.",
"Pronostica fins a 5 equips cada jornada: +2 per encert i +3 si els encertes tots!",
"Quan es tanquen els pronòstics, podràs veure quin percentatge d’usuaris creu que guanyarà cada equip.",
"Anar a veure partits setmanes seguides dona bonus: +2 a la 3a setmana i +5 a la 5a!",
"Mira les missions de l’Inici: són punts fàcils cada setmana.",
"Convida un amic amb el teu codi: tots dos sumeu +5 punts.",
"Quan un partit surt marcat amb ⭐ x2, els punts d’assistència valen el doble.",
"Amb el mercat tancat tampoc es pot vendre ni canviar de capità.",
"Cada victòria suma punts: 12 la primera, 13 la segona seguida, 14 la tercera…",
"La ratxa és or: cada victòria seguida d’un jugador suma 1 punt més.",
"L’entrenador tria 3 destacats per equip: el 1r suma +7 punts, el 2n +5 i el 3r +3, encara que l’equip perdi.",
"El capità suma +10 punts extra a l’equip quan guanya. Tria’l amb criteri!",
"Abans del tancament, revisa si el teu capità té un partit amb opcions de victòria.",
"Només compten els punts que genera un jugador mentre és a la teva plantilla.",
"Fitxar un jugador després d’una gran jornada no et dona els punts que ja ha fet.",
"Els entrenadors també sumen punts quan el seu equip guanya, amb bonus per ratxa.",
"El valor de jugadors i entrenadors canvia després de cada jornada segons els resultats.",
"Amb el mercat obert, pots vendre un jugador i recuperar-ne el valor actual.",
"Mira les estadístiques abans de fitxar: toca la targeta del jugador.",
"La gràfica d’evolució del valor t’ajuda a detectar qui puja.",
"La popularitat indica quants equips tenen un jugador: un de poc popular et fa diferent.",
"Un jugador d’un equip amb bona ratxa té més opcions de sumar punts extra.",
"Fitxa abans que un jugador pugi de valor, no després.",
"No gastis tot el pressupost el primer dia: guarda marge per a les oportunitats.",
"Fixa’t en la ratxa actual de cada jugador a la seva fitxa.",
"Un bon entrenador amb ratxa és una inversió rentable.",
"Consulta la pestanya Resultats per veure com van els equips abans de decidir.",
"Els punts s’actualitzen quan l’administrador processa la jornada, un cop entrats els resultats.",
"Toca una targeta per veure estadístiques i gràfiques d’un jugador o entrenador.",
"Pots ordenar la plantilla arrossegant els jugadors (al mòbil, mantén premuda la targeta).",
"A la pista, ☆ fa capità un jugador i 💸 el ven.",
"Un “+” a la pista és un lloc buit: toca’l i aniràs directe al mercat.",
"Al mercat, canvia entre Jugadors i Entrenadors amb les pestanyes de dalt.",
"Fes servir el cercador i el filtre d’equip per trobar jugadors més ràpid.",
"A Classificació, la teva fila porta l’etiqueta TU.",
"A Equips veuràs tots els integrants de cada equip i els seus partits guanyats.",
"Pots posar nom al teu equip des de Plantilla (✏️ Nom de l’equip).",
"Si tens dubtes, el botó ❓ Guia et torna a explicar tot el joc.",
"Afegeix la web a la pantalla d’inici del mòbil i accedeix-hi com si fos una app.",
"La classificació es mou cada jornada: encara ets a temps de remuntar!",
"Els tres primers de la classificació s’emporten les medalles 🥇🥈🥉.",
"Cada jornada és una nova oportunitat: revisa la teva plantilla abans de cada tancament.",
"Comparteix el joc amb la família i els amics del club i competiu junts!",
"Anima l’equip als partits: els resultats reals són els que fan pujar els punts. 🏀",
"Una ratxa llarga pot marcar la diferència entre els primers de la classificació.",
"Si canvies de capità, fes-ho abans que tanqui el mercat.",
"Només sumen punts els jugadors dels equips que tenen resultat registrat a la jornada.",
"Vés a veure un partit del club i escaneja el QR de la taula: +3 punts per partit!",
"El QR de la taula canvia cada pocs segons: s’ha d’escanejar al pavelló.",
"Gràcies per jugar! Que guanyi el millor estrateg. 🏆"
];
let tipOrder=[], tipIdx=0;
function tipPool(){ const closed=marketClosed(); return TIPS.filter(t=>!/^[oc]\|/.test(t)||(t[0]==='o'&&!closed)||(t[0]==='c'&&closed)).map(t=>t.replace(/^[oc]\|/,'')); }
function nextTip(){
  const el=$('tipText'), box=$('tipStrip'); if(!el||document.hidden) return;
  const pool=tipPool(); if(!pool.length) return;
  if(tipIdx>=tipOrder.length||tipOrder.length!==pool.length){ tipOrder=[...pool].sort(()=>Math.random()-.5); tipIdx=0; }
  const txt=tipOrder[tipIdx++]; box.classList.add('out');
  setTimeout(()=>{ el.textContent=txt; box.classList.remove('out'); }, el.textContent?350:0);
}
setTimeout(nextTip,300); setInterval(nextTip,TIP_MS);

/* ===== PARTITS, TAULA I QR ===== */
(function(){ const m=location.hash.match(/att=([\w.-]+)/); if(m){ sessionStorage.setItem('pendingAtt',m[1]); history.replaceState(null,'',location.pathname+location.search); } })();
const fmtMatch=m=>`${ymdDate(m.match_date,'12:00').toLocaleDateString('ca-ES',{weekday:'long',day:'numeric',month:'long'})} · ${String(m.start_time).slice(0,5)}`;
function nextSaturday(){ const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+((6-d.getDay()+7)%7)); return d.toISOString().slice(0,10); }
function attModal(){
  let m=$('attModal');
  if(!m){ m=document.createElement('div'); m.id='attModal'; m.className='st-modal'; document.body.appendChild(m);
    m.addEventListener('click',e=>{ if(e.target===m||e.target.closest('.st-close')||e.target.closest('[data-close]')) closeAtt(); }); }
  m.classList.add('open'); document.body.style.overflow='hidden'; return m;
}
function closeAtt(){ const m=$('attModal'); if(m){ if(m._stop) m._stop(); m._stop=null; m.classList.remove('open'); } document.body.style.overflow=''; }
async function redeemToken(token,teamId){
  const r=await rpc('redeem_attendance',{p_token:token,p_team_id:Number(teamId)}), t=await r.text();
  if(!r.ok){ let msg=t; try{msg=JSON.parse(t).message||t;}catch{} return {ok:false,msg}; }
  try{ return {ok:true,...JSON.parse(t)}; }catch{ return {ok:true}; }
}
function showAttResult(res){
  const m=attModal(); if(m._stop){ m._stop(); m._stop=null; }
  m.innerHTML=res.ok
   ?`<div class="st-card tour"><button class="st-close" aria-label="Tancar">✕</button><div class="tour-hero">✅</div><h3>S’ha escanejat correctament!</h3><p style="text-align:center;font-size:1.1rem"><b>+${res.points||3} punts</b> per al teu equip${res.double?' <b>⭐ (partit x2!)</b>':''}</p>${res.bonus?`<p style="text-align:center">🔥 Ratxa de ${res.streak} setmanes: <b>+${res.bonus} punts extra</b></p>`:(res.streak>=2?`<p style="text-align:center">🔥 Portes ${res.streak} setmanes seguides veient partits</p>`:'')}${res.team?`<p style="text-align:center">🏀 ${escapeHtml(res.team)}${res.rival?' vs '+escapeHtml(res.rival):''}</p>`:''}<div class="tour-nav"><button class="primary" data-close="1" style="margin:auto">Perfecte!</button></div></div>`
   :`<div class="st-card tour"><button class="st-close" aria-label="Tancar">✕</button><div class="tour-hero">⚠️</div><h3>No s’ha pogut registrar</h3><p style="text-align:center">${escapeHtml(res.msg||'Error desconegut.')}</p><div class="tour-nav"><button class="secondary" data-close="1">Tancar</button><button class="primary" id="scanAgain">Tornar a provar</button></div></div>`;
  if(res.ok){ confetti(); loadData(); } else { const b=$('scanAgain'); if(b) b.onclick=openScanner; }
}
function pickAttTeam(){
  return new Promise(resolve=>{
    const m=attModal(); let last=''; try{ last=localStorage.getItem('attTeam')||''; }catch{}
    const opts=(state.teams||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'ca')).map(t=>`<option value="${escapeHtml(t.id)}"${String(t.id)===last?' selected':''}>${escapeHtml(t.name)}</option>`).join('');
    m.innerHTML=`<div class="st-card tour"><button class="st-close" aria-label="Tancar">✕</button><div class="tour-hero">🏀</div><h3>De quin equip ets?</h3><p class="st-empty">Els punts d’assistència també compten per a la classificació d’afició dels equips del club.</p><select id="attTeamSel" style="width:100%;padding:12px;font-size:1rem;margin:10px 0"><option value="">— Tria el teu equip —</option>${opts}</select><div class="tour-nav"><button class="secondary" data-close="1">Cancel·lar</button><button class="primary" id="attTeamOk">Continuar</button></div></div>`;
    m._stop=()=>resolve(null);
    $('attTeamOk').onclick=()=>{ const v=$('attTeamSel').value; if(!v){ alert('Cal triar un equip.'); return; } try{ localStorage.setItem('attTeam',v); }catch{} m._stop=null; resolve(Number(v)); };
  });
}
function redeemPending(){ const t=sessionStorage.getItem('pendingAtt'); if(!t) return; sessionStorage.removeItem('pendingAtt'); pickAttTeam().then(tid=>{ if(!tid) return closeAtt(); return redeemToken(t,tid).then(showAttResult); }); }
async function openScanner(){
  const tid=await pickAttTeam(); if(!tid){ closeAtt(); return; }
  const m=attModal();
  m.innerHTML=`<div class="st-card tour"><button class="st-close" aria-label="Tancar">✕</button><h3>Escaneja el QR</h3><p class="st-empty" id="scanMsg">Apunta la càmera al QR que hi ha a la taula del partit.</p><div class="scan-box"><video id="scanVideo" playsinline muted></video><div class="scan-frame"></div></div><p class="st-empty">També pots escanejar-lo amb la càmera normal del mòbil.</p></div>`;
  const msg=t=>{ const e=$('scanMsg'); if(e) e.textContent=t; };
  if(typeof jsQR==='undefined'||!navigator.mediaDevices?.getUserMedia) return msg('No es pot obrir l’escàner en aquest dispositiu. Escaneja el QR amb la càmera normal del mòbil.');
  let stream, alive=true;
  m._stop=()=>{ alive=false; if(stream) stream.getTracks().forEach(t=>t.stop()); };
  try{ stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false}); }
  catch{ return msg('No s’ha pogut accedir a la càmera. Permet-ne l’accés al navegador o escaneja el QR amb la càmera normal del mòbil.'); }
  if(!alive){ m._stop(); return; }
  const v=$('scanVideo'); v.srcObject=stream; await v.play().catch(()=>{});
  const c=document.createElement('canvas'), x=c.getContext('2d',{willReadFrequently:true});
  (function tick(){
    if(!alive) return;
    if(v.videoWidth){ const k=Math.min(1,640/v.videoWidth); c.width=Math.round(v.videoWidth*k); c.height=Math.round(v.videoHeight*k); x.drawImage(v,0,0,c.width,c.height);
      const q=jsQR(x.getImageData(0,0,c.width,c.height).data,c.width,c.height,{inversionAttempts:'dontInvert'});
      if(q&&q.data){ const t=(q.data.match(/att=([\w.-]+)/)||q.data.match(/^(\d+\.\d+\.[0-9a-f]{16})$/)||[])[1];
        if(t){ alive=false; m._stop(); msg('Comprovant…'); redeemToken(t,tid).then(showAttResult); return; } msg('Aquest QR no és de cap partit del club.'); } }
    requestAnimationFrame(tick);
  })();
}
async function loadAttStats(){
  const el=$('attStats'); if(!el) return; const r=await api('match_attendance?select=points'); if(!r.ok) return;
  const a=await r.json(), n=a.length, s=a.reduce((t,x)=>t+Number(x.points||0),0);
  el.textContent=n?`Has registrat ${n} ${n===1?'partit':'partits'} · +${s} punts`:'';
}
let _isClub=null;
async function isClubAccount(){ if(_isClub!==null) return _isClub; try{ const me=state.session?.user?.id; if(!me){ return false; } const r=await api(`club_accounts?user_id=eq.${encodeURIComponent(me)}&select=user_id`); _isClub=r.ok?((await r.json()).length>0):false; }catch{ _isClub=false; } return _isClub; }
async function loadTableDuty(){
  const me=state.session?.user?.id; if(!me||!$('tableTab')) return;
  const from=new Date(Date.now()-864e5).toISOString().slice(0,10);
  const club=await isClubAccount();
  const [a,b]=await Promise.all([club?api(`club_matches?match_date=gte.${from}&venue=eq.home&select=id,match_date,start_time,real_team_id,rival,double_points`):api(`match_tables?user_id=eq.${me}&select=match_id,club_matches!inner(id,match_date,start_time,real_team_id,rival)&club_matches.match_date=gte.${from}`),api(`table_people?user_id=eq.${me}&select=user_id`)]);
  const rows=a.ok?await a.json():[], isP=club||(b.ok&&(await b.json()).length>0);
  state.myMatches=[...new Map((club?rows:rows.map(r=>r.club_matches)).filter(Boolean).map(m=>[m.id,m])).values()].sort((p,q)=>(p.match_date+p.start_time).localeCompare(q.match_date+q.start_time));
  $('tableTab').style.display=(state.myMatches.length||isP)?'':'none';
  $('tableList').innerHTML=state.myMatches.map(m=>`<div class="mg-row"><b style="flex:1 1 200px">${escapeHtml(fmtMatch(m))}<br><small>🏀 ${escapeHtml(teamName(m.real_team_id))}${m.rival?' vs '+escapeHtml(m.rival):''}</small></b><button class="primary" data-qr="${m.id}">Mostrar QR</button></div>`).join('')||(club?'<p>De moment no hi ha cap partit programat.</p>':'<p>De moment no tens cap partit assignat aquest cap de setmana.</p>');
}
async function openQr(id){
  const m=attModal(); let timer=null, tick=null, left=20;
  m._stop=()=>{ clearInterval(timer); clearInterval(tick); };
  m.innerHTML=`<div class="st-card tour"><button class="st-close" aria-label="Tancar">✕</button><h3>QR del partit</h3><div id="qrInfo" class="st-empty">Carregant…</div><div class="qr-box" id="qrBox"></div><div class="qr-bar"><i id="qrBar" style="width:100%"></i></div><p class="st-empty">El QR canvia cada pocs segons. Els nens l’han d’escanejar des de l’opció <b>“He vingut a veure un partit”</b>.</p><p id="qrScans" style="text-align:center;font-weight:700"></p></div>`;
  async function refresh(){
    const r=await rpc('get_match_qr',{p_match_id:id}), t=await r.text();
    if(!r.ok){ let msg=t; try{msg=JSON.parse(t).message||t;}catch{} clearInterval(timer); clearInterval(tick); $('qrInfo').textContent='⚠️ '+msg; $('qrBox').style.display='none'; return; }
    const d=JSON.parse(t);
    const qr=qrcode(0,'M'); qr.addData(`${location.origin}${location.pathname}#att=${d.token}`); qr.make(); $('qrBox').innerHTML=qr.createImgTag(8,8);
    $('qrInfo').innerHTML=`🏀 <b>${escapeHtml(d.team||'')}</b>${d.rival?' vs '+escapeHtml(d.rival):''} · ${String(d.time).slice(0,5)}`; $('qrScans').textContent=`👀 ${d.scans} ${Number(d.scans)===1?'persona ha':'persones han'} escanejat`; left=20;
  }
  await refresh(); timer=setInterval(refresh,20000); tick=setInterval(()=>{ left=Math.max(0,left-1); const b=$('qrBar'); if(b) b.style.width=(left/20*100)+'%'; },1000);
}
$('tableList').addEventListener('click',e=>{ const b=e.target.closest('[data-qr]'); if(b) openQr(Number(b.dataset.qr)); });
$('scanBtn').addEventListener('click',openScanner);

async function loadWeek(){
  if(!state.admin||!$('wkList')) return; const d=$('wkDate').value||nextSaturday();
  const mr=await api(`club_matches?match_date=eq.${d}&order=start_time&select=*`), ms=mr.ok?await mr.json():[], ids=ms.map(m=>m.id).join(',');
  let tb=[],at=[]; if(ids){ const [t,a]=await Promise.all([api(`match_tables?match_id=in.(${ids})&select=match_id,user_id`),api(`match_attendance?match_id=in.(${ids})&select=match_id`)]); tb=t.ok?await t.json():[]; at=a.ok?await a.json():[]; }
  const us=state.adminUsers||[], pool=us.filter(u=>u.is_table).length?us.filter(u=>u.is_table):us;
  const opt=sel=>'<option value="">— Ningú —</option>'+pool.map(u=>`<option value="${u.user_id}"${u.user_id===sel?' selected':''}>${escapeHtml(u.username||u.email)}</option>`).join('');
  $('wkTeam').innerHTML=state.teams.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  $('wkList').innerHTML=ms.map(m=>{ const u=tb.filter(x=>x.match_id===m.id).map(x=>x.user_id); return `<div class="mg-row" data-mid="${m.id}"><b style="flex:1 1 170px">${String(m.start_time).slice(0,5)} · ${escapeHtml(teamName(m.real_team_id))} vs ${escapeHtml(m.rival||'—')}</b><select class="wk-venue"><option value="home"${m.venue!=='away'?' selected':''}>🏠 Casa</option><option value="away"${m.venue==='away'?' selected':''}>✈️ Fora</option></select><select class="wk-status" title="Estat del partit"><option value="">Estat: automàtic</option><option value="live"${m.status_override==='live'?' selected':''}>🔴 En joc</option><option value="finished"${m.status_override==='finished'?' selected':''}>Acabat</option><option value="suspended"${m.status_override==='suspended'?' selected':''}>⏸️ Suspès</option><option value="cancelled"${m.status_override==='cancelled'?' selected':''}>❌ Anul·lat</option></select>${m.venue==='away'?'':`<select class="wk-t1">${opt(u[0])}</select><select class="wk-t2">${opt(u[1])}</select><button class="primary" data-wk="save">Desar taules</button>`}<button class="secondary danger" data-wk="del">Eliminar</button>${m.venue==='away'?'':`<label style="white-space:nowrap"><input type="checkbox" class="wk-x2" ${m.double_points?'checked':''}> ⭐ x2</label>`}<small>👀 ${at.filter(x=>x.match_id===m.id).length}</small></div>`; }).join('')||'<small>Encara no hi ha partits aquest dia.</small>';
}
if($('wkDate')){
  $('wkDate').value=nextSaturday(); $('wkDate').addEventListener('change',loadWeek);
  $('wkAdd').onclick=async()=>{ const t=$('wkTime').value; if(!t||!$('wkTeam').value) return alert('Cal indicar l’hora i l’equip.'); if(await adminRpc('admin_add_match',{p_date:$('wkDate').value,p_time:t,p_team:Number($('wkTeam').value),p_rival:$('wkRival').value,p_venue:$('wkVenue')?.value||'home'})){ $('wkRival').value=''; setAdminMessage('✅ Partit afegit.'); loadWeek(); loadHomeMatches(); } };
  $('wkList').addEventListener('change',async e=>{
    const vs=e.target.closest('.wk-venue'), ss=e.target.closest('.wk-status');
    if(vs){ const id=Number(vs.closest('.mg-row').dataset.mid); if(vs.value==='away'&&!confirm('Passar el partit a «Fora» esborrarà les taules assignades. Continuar?')){ vs.value='home'; return; } if(await adminRpc('admin_set_match_venue',{p_id:id,p_venue:vs.value})){ loadWeek(); loadHomeMatches(); } return; }
    if(ss){ const id=Number(ss.closest('.mg-row').dataset.mid); if(await adminRpc('admin_set_match_status',{p_id:id,p_status:ss.value||null})){ setAdminMessage('✅ Estat del partit actualitzat.'); loadHomeMatches(); } return; }
    const c=e.target.closest('.wk-x2'); if(!c) return; const id=Number(c.closest('.mg-row').dataset.mid); if(!(await adminRpc('admin_set_match_double',{p_id:id,p_on:c.checked}))){ c.checked=!c.checked; } else { loadHomeMatches(); } });
  $('wkList').addEventListener('click',async e=>{ const b=e.target.closest('[data-wk]'); if(!b) return; const row=b.closest('.mg-row'), id=Number(row.dataset.mid);
    if(b.dataset.wk==='del'){ if(confirm('Eliminar aquest partit i les seves taules?')&&await adminRpc('admin_delete_match',{p_id:id})){ loadWeek(); loadHomeMatches(); } }
    else{ const ids=[...new Set([row.querySelector('.wk-t1').value,row.querySelector('.wk-t2').value].filter(Boolean))]; if(await adminRpc('admin_set_match_tables',{p_match_id:id,p_user_ids:ids})){ alert('✅ Taules desades.'); loadWeek(); } } });
}

/* ===== PARTITS A CASA D'AQUESTA JORNADA (INICI) ===== */
const madridToday=()=>{ try{ const p={}; new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).forEach(x=>p[x.type]=x.value); return `${p.year}-${p.month}-${p.day}`; }catch{ return new Date().toISOString().slice(0,10); } };
const ymdDate=(d,t)=>{ const [y,m,da]=String(d).split('-').map(Number), [hh,mm]=String(t||'12:00').split(':').map(Number); return new Date(y,(m||1)-1,da||1,hh||0,mm||0); };
function weekRange(){
  const d=new Date(madridToday()+'T12:00:00Z'), dow=(d.getUTCDay()+6)%7;
  const mon=new Date(d); mon.setUTCDate(d.getUTCDate()-dow); const sun=new Date(mon); sun.setUTCDate(mon.getUTCDate()+6);
  return [mon.toISOString().slice(0,10),sun.toISOString().slice(0,10)];
}
async function loadHomeMatches(){
  if(!$('homeMatches')) return; const [a,b]=weekRange(); state.homeRange=[a,b];
  try{
    const base=`club_matches?match_date=gte.${a}&match_date=lte.${b}&order=match_date,start_time&select=`;
    let r=await api(base+'id,match_date,start_time,real_team_id,rival,double_points,venue,status_override');
    if(!r.ok) r=await api(base+'id,match_date,start_time,real_team_id,rival,double_points');   /* encara sense pas 21 */
    if(!r.ok) r=await api(base+'id,match_date,start_time,real_team_id,rival');                 /* encara sense pas 20 */
    if(!r.ok) throw new Error((await r.text()).slice(0,140));
    state.homeMatches=await r.json(); state.homeError=null;
  }catch(e){ state.homeMatches=null; state.homeError=e.message||'Error de connexió'; }
  renderHomeMatches();
}
function matchState(m){
  const o=m.status_override; if(o==='cancelled'||o==='suspended'||o==='finished'||o==='live') return o;
  const st=ymdDate(m.match_date,m.start_time).getTime(), now=Date.now();
  return now>=st+72e5?'finished':now>=st?'live':'scheduled';
}
const MS_BADGE={live:'<span class="hm-badge live">🔴 En joc</span>',finished:'<span class="hm-badge off">Acabat</span>',suspended:'<span class="hm-badge" style="background:#b7791f">⏸️ Suspès</span>',cancelled:'<span class="hm-badge off" style="background:#9b2c2c;color:#fff">❌ Anul·lat</span>',scheduled:''};
function renderHomeMatches(){
  const box=$('homeMatches'); if(!box||state.homeMatches===undefined) return;
  if(state.homeMatches===null){ box.innerHTML=`<p class="st-empty">No s’han pogut carregar els partits. <a href="#" id="hmRetry">Tornar-ho a provar</a><br><small>${escapeHtml(state.homeError||'')}</small></p>`; const rt=$('hmRetry'); if(rt) rt.onclick=e=>{ e.preventDefault(); box.innerHTML='<p class="st-empty">Carregant partits…</p>'; loadHomeMatches(); }; return; }
  if(!state.homeMatches.length){ const [ra,rb]=state.homeRange||weekRange(), f=s=>s.slice(8)+'/'+s.slice(5,7); box.innerHTML=`<p class="st-empty">Encara no hi ha partits publicats per aquesta jornada (del ${f(ra)} al ${f(rb)}).</p>`; return; }
  const today=madridToday(), days=[...new Set(state.homeMatches.map(m=>m.match_date))];
  box.innerHTML=`<p class="st-empty" style="margin:-4px 0 6px">🏠 Casa · ✈️ Fora</p>`+days.map(d=>{
    const ms=state.homeMatches.filter(m=>m.match_date===d);
    const title=ymdDate(d,'12:00').toLocaleDateString('ca-ES',{weekday:'long',day:'numeric',month:'long'});
    return `<div class="hm-day${d===today?' today':''}"><b>${escapeHtml(title)}</b>${d===today?'<span class="hm-badge">Avui</span>':''}</div>`+ms.map(m=>{
      const stt=matchState(m), away=m.venue==='away', dead=stt==='cancelled'||stt==='suspended';
      return `<div class="hm-row${stt==='finished'||stt==='cancelled'?' done':''}"><span class="hm-time">${String(m.start_time).slice(0,5)}</span><span class="hm-match" style="${stt==='cancelled'?'text-decoration:line-through':''}">${away?'✈️':'🏠'} <b>${escapeHtml(teamName(m.real_team_id))}</b>${m.rival?' <small>'+(away?'@ ':'vs ')+escapeHtml(m.rival)+'</small>':''}</span>${m.double_points&&!away&&!dead?'<span class="hm-badge" style="background:#f6a21a;color:#2a1a00">⭐ x2</span>':''}${MS_BADGE[stt]||''}</div>`;
    }).join('');
  }).join('');
}
setInterval(renderHomeMatches,60000);


/* ===== Notificacions push ===== */
const VAPID_PUBLIC='BNMRPj_EIlmIRcPEIv_TIZ9twNvGMhyyj-K4xQtMTMPSn6ETEOCgw-g0fmeV0IZvfGGexFsYk-uC_iUq8g7ZJ3s';
const PUSH_KINDS=[['market','⏳ El mercat tanca aviat'],['round','📊 Jornada processada'],['announce','📢 Avisos del club'],['match','🏀 Partits a casa'],['table','📋 Taula (assignació i recordatori)'],['rank','📉 M’han superat a la classificació']];
function b64ToU8(b){ const s=(b+'='.repeat((4-b.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'), r=atob(s), u=new Uint8Array(r.length); for(let i=0;i<r.length;i++) u[i]=r.charCodeAt(i); return u; }
function pushSupport(){
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const standalone=!!(window.navigator.standalone||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches));
  if('serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window) return {ok:true};
  return {ok:false, why:(ios&&!standalone)?'ios':'unsupported'};
}
async function pushGetSub(){ try{ const reg=await navigator.serviceWorker.getRegistration('sw.js')||await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; return {reg, sub:await reg.pushManager.getSubscription()}; }catch(e){ return {reg:null, sub:null}; } }
function pushCheckedKinds(){ const l=[...document.querySelectorAll('#pushKinds input:checked')].map(i=>i.value); return l; }
async function renderPush(){
  const card=$('pushCard'); if(!card) return;
  const sup=pushSupport(); card.style.display='';
  const info=$('pushInfo'), btn=$('pushBtn'), kinds=$('pushKinds'), test=$('pushTest'), off=$('pushOff');
  if(!sup.ok){
    btn.style.display='none'; kinds.style.display='none'; test.style.display='none'; off.style.display='none';
    info.innerHTML=sup.why==='ios'?'A l’iPhone/iPad, per rebre notificacions primer cal <b>afegir aquesta web a la pantalla d’inici</b>: a Safari toca <b>Compartir</b> → <b>Afegeix a la pantalla d’inici</b>, i obre-la des de la nova icona. Després, torna aquí i activa-les (cal iOS 16.4 o superior).':'Aquest navegador no admet notificacions. Prova amb Chrome (Android/ordinador) o amb Safari afegint la web a la pantalla d’inici.';
    return;
  }
  if(Notification.permission==='denied'){
    btn.style.display='none'; kinds.style.display='none'; test.style.display='none'; off.style.display='none';
    info.textContent='Has bloquejat les notificacions d’aquesta web. Per activar-les, permet-les als ajustos del navegador (permisos del lloc) i recarrega la pàgina.';
    return;
  }
  const {sub}=await pushGetSub();
  let kindsSel=PUSH_KINDS.map(k=>k[0]);
  if(sub){
    try{ const r=await api(`push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}&select=kinds`); const j=r.ok?await r.json():[]; if(j[0]) kindsSel=j[0].kinds||[]; else { const jj=sub.toJSON(); await rpc('push_save_subscription',{p_endpoint:jj.endpoint,p_p256dh:jj.keys.p256dh,p_auth:jj.keys.auth,p_kinds:kindsSel}); } }catch(e){}
  }
  kinds.innerHTML=PUSH_KINDS.map(([k,l])=>`<label class="push-k"><input type="checkbox" value="${k}" ${kindsSel.includes(k)?'checked':''}> ${l}</label>`).join('');
  kinds.style.display=sub?'':'none'; test.style.display=sub?'':'none'; off.style.display=sub?'':'none';
  btn.style.display=sub?'none':'';
  info.textContent=sub?'✅ Notificacions activades en aquest dispositiu. Tria quins avisos vols rebre:':'Rep avisos al mòbil o a l’ordinador: quan tanca el mercat, quan es processa la jornada, partits a casa, taula i més.';
  kinds.querySelectorAll('input').forEach(i=>i.onchange=async()=>{ try{ await rpc('push_set_kinds',{p_endpoint:sub.endpoint,p_kinds:pushCheckedKinds()}); }catch(e){} });
}
async function pushEnable(){
  try{
    const reg=await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
    const perm=await Notification.requestPermission();
    if(perm!=='granted'){ alert('Sense permís no podem enviar-te notificacions.'); renderPush(); return; }
    const sub=(await reg.pushManager.getSubscription())||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToU8(VAPID_PUBLIC)});
    const j=sub.toJSON();
    const r=await rpc('push_save_subscription',{p_endpoint:j.endpoint,p_p256dh:j.keys.p256dh,p_auth:j.keys.auth,p_kinds:PUSH_KINDS.map(k=>k[0])});
    if(!r.ok) throw new Error((await r.text()).slice(0,160));
    await renderPush();
    alert('✅ Notificacions activades. Prem «Enviar una prova» per comprovar-ho.');
  }catch(e){ alert('⚠️ No s’han pogut activar: '+(e.message||e)); }
}
async function pushDisable(){
  try{ const {sub}=await pushGetSub(); if(sub){ try{ await rpc('push_remove_subscription',{p_endpoint:sub.endpoint}); }catch(e){} await sub.unsubscribe(); } }catch(e){}
  renderPush();
}
async function pushDetach(){ try{ if(!('serviceWorker' in navigator)) return; const reg=await navigator.serviceWorker.getRegistration('sw.js'); const sub=reg&&await reg.pushManager.getSubscription(); if(sub) await rpc('push_remove_subscription',{p_endpoint:sub.endpoint}); }catch(e){} }
async function pushTest(){
  try{ const r=await rpc('push_test',{}); if(!r.ok) throw new Error((await r.text()).slice(0,160)); alert('Prova enviada. Hauria d’arribar en menys d’un minut.'); }catch(e){ alert('⚠️ '+(e.message||e)); }
}
function initPush(){
  try{
    if($('pushBtn')&&!$('pushBtn').dataset.bound){ $('pushBtn').dataset.bound='1'; $('pushBtn').onclick=pushEnable; $('pushOff').onclick=pushDisable; $('pushTest').onclick=pushTest; }
    if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
    renderPush();
  }catch(e){ console.warn('push',e); }
}


/* ===== Instal·lar l'app (PWA) ===== */
let _installEv=null;
function renderInstall(){
  const card=$('installCard'); if(!card) return;
  const standalone=!!(window.navigator.standalone||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches));
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(standalone){ card.style.display='none'; return; }
  if(_installEv){ card.style.display=''; $('installInfo').textContent='Tingues el Fantasy a la pantalla d’inici, com una app, a pantalla completa.'; $('installBtn').style.display=''; }
  else if(ios){ card.style.display=''; $('installInfo').innerHTML='Per tenir-la com a app: toca <b>Compartir</b> (el quadrat amb la fletxa) a Safari i tria <b>Afegeix a la pantalla d’inici</b>. Això també és necessari per rebre notificacions a l’iPhone.'; $('installBtn').style.display='none'; }
  else card.style.display='none';
}
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); _installEv=e; renderInstall(); });
window.addEventListener('appinstalled',()=>{ _installEv=null; renderInstall(); });
document.addEventListener('click',async e=>{ if(e.target&&e.target.id==='installBtn'&&_installEv){ _installEv.prompt(); try{ await _installEv.userChoice; }catch{} _installEv=null; renderInstall(); } });



/* ===== MISSIONS, RATXA I CONVIDA UN AMIC ===== */
async function loadMissions(){
  const box=$('missionsBox'); if(!box) return;
  try{
    const r=await rpc('get_missions',{}), t=await r.text(); if(!r.ok) throw new Error(t.slice(0,140));
    const d=JSON.parse(t), fm=x=>x.slice(8)+'/'+x.slice(5,7);
    $('missionsSub').textContent=`Setmana del ${fm(d.week_start)} al ${fm(d.week_end)}`;
    const streakTxt=d.streak>0?`<div class="mi-streak">🔥 Ratxa d’assistència: <b>${d.streak}</b> ${d.streak===1?'setmana':'setmanes'} seguides${d.streak_at_risk?' · <b>vés a veure un partit aquesta setmana per no perdre-la!</b>':''}<br><small>+2 punts a les 3 setmanes, +5 a les 5.</small></div>`:`<div class="mi-streak">🔥 Ratxa d’assistència: ves a veure partits setmanes seguides i suma <b>+2</b> (3 setmanes) i <b>+5</b> (5 setmanes).</div>`;
    box.innerHTML=streakTxt+d.missions.map(m=>`<div class="mi-row${m.done?' done':''}"><span class="mi-ic">${m.done?'✅':'⬜'}</span><span class="mi-t">${escapeHtml(m.title)}${m.goal>1?` <small>(${m.prog}/${m.goal})</small>`:''}</span><b>+${m.pts}</b></div>`).join('')+`<small style="display:block;margin-top:6px">Punts extra guanyats en total: <b>${Number(d.bonus_total||0).toFixed(0)}</b></small>`;
    if(state.bonusTotal!==undefined && state.bonusTotal!==d.bonus_total) renderRanking();
    state.bonusTotal=d.bonus_total;
  }catch(e){ box.innerHTML=`<p class="st-empty">No s’han pogut carregar les missions.<br><small>${escapeHtml(e.message||'')}</small></p>`; }
}
async function loadReferral(){
  const box=$('refBox'); if(!box) return;
  try{
    const r=await rpc('get_my_referral',{}), t=await r.text(); if(!r.ok) throw new Error(t.slice(0,140));
    const d=JSON.parse(t), link=`${location.origin}${location.pathname.replace(/index\.html$/,'')}#ref=${d.code}`;
    box.innerHTML=`<p>Convida un amic: quan creï el compte amb el teu codi, <b>tots dos sumeu +5 punts</b>. Màxim ${d.max} amics.</p><div class="ref-code">${escapeHtml(d.code)}</div><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="primary" id="refShare">📤 Compartir</button><button class="secondary" id="refCopy">Copiar codi</button></div><small style="display:block;text-align:center;margin-top:8px">Amics apuntats: <b>${d.invited}/${d.max}</b> · +${Number(d.points||0).toFixed(0)} punts</small>`;
    $('refShare').onclick=async()=>{ const text=`Uneix-te al Fantasy del Club Bàsquet Alella! Fes servir el meu codi ${d.code} i sumem 5 punts cadascú.`; try{ if(navigator.share) await navigator.share({title:'Fantasy Bàsquet Alella',text,url:link}); else { await navigator.clipboard.writeText(text+' '+link); alert('Enllaç copiat!'); } }catch{} };
    $('refCopy').onclick=async()=>{ try{ await navigator.clipboard.writeText(d.code); alert('Codi copiat: '+d.code); }catch{ prompt('El teu codi:',d.code); } };
  }catch(e){ box.innerHTML=`<p class="st-empty">No s’ha pogut carregar el codi d’amic.<br><small>${escapeHtml(e.message||'')}</small></p>`; }
}
(function(){ const m=location.hash.match(/ref=([A-Za-z0-9]{4,10})/); if(m){ try{ localStorage.setItem('refCode',m[1].toUpperCase()); }catch{} history.replaceState(null,'',location.pathname+location.search); } try{ const c=localStorage.getItem('refCode'); if(c&&$('signupRef')) $('signupRef').value=c; }catch{} })();
async function redeemRef(){
  let c=null; try{ c=localStorage.getItem('refCode'); }catch{} if(!c) return;
  try{
    const r=await rpc('redeem_referral',{p_code:c}), t=await r.text();
    try{ localStorage.removeItem('refCode'); }catch{}
    if(r.ok){ confetti(); alert('🤝 Codi d’amic aplicat: +5 punts per a tu i per al teu amic!'); loadMissions(); loadReferral(); renderRanking(); }
  }catch(e){}
}


/* ===== PRONÒSTICS ===== */
async function loadPredictions(){
  const box=$('predBox'); if(!box) return;
  try{
    const r=await rpc('get_predictions',{}), t=await r.text(); if(!r.ok) throw new Error(t.slice(0,140));
    state.pred=JSON.parse(t); renderPredictions();
  }catch(e){ box.innerHTML=`<p class="st-empty">No s’han pogut carregar els pronòstics.<br><small>${escapeHtml(e.message||'')}</small></p>`; }
}
function renderPredictions(){
  const d=state.pred, box=$('predBox'); if(!d||!box) return;
  const when=d.closes_at?fmtData(new Date(d.closes_at)):'quan tanqui el mercat';
  $('predSub').innerHTML=d.closed?'🔒 Pronòstics tancats · es compten quan es processa la jornada':`⏳ Es tanquen ${escapeHtml(when)} (amb el mercat)`;
  if(!d.teams.length){ box.innerHTML='<p class="st-empty">Encara no hi ha equips per pronosticar aquesta jornada.</p>'; return; }
  const vs=m=>m?`${ymdDate(m.date,'12:00').toLocaleDateString('ca-ES',{weekday:'short',day:'numeric'})} · ${String(m.time).slice(0,5)} · ${m.venue==='away'?'✈️ fora':'🏠 casa'}${m.rival?(m.venue==='away'?' @ ':' vs ')+escapeHtml(m.rival):''}`:'';
  box.innerHTML=`<p class="st-empty" style="margin:-4px 0 8px">Pronòstics: <b>${d.count}/${d.max}</b> · +2 per encert, +3 extra si els encertes tots (mínim 3).</p>`+d.teams.map(t=>{
    const res=t.result&&t.pick?(t.result===t.pick?'<span class="hm-badge" style="background:#2f855a">✅ Encert</span>':'<span class="hm-badge" style="background:#9b2c2c">❌ Fallat</span>'):'';
    let ctl='';
    if(!d.closed){
      ctl=`<div class="pr-btns"><button class="pr-b${t.pick==='win'?' on':''}" data-pr-team="${t.team_id}" data-pr-pick="win">✅ Guanya</button><button class="pr-b${t.pick==='loss'?' on loss':''}" data-pr-team="${t.team_id}" data-pr-pick="loss">❌ Perd</button></div>`;
    } else {
      const tot=Number(t.total||0), pw=tot?Math.round(100*Number(t.wins||0)/tot):null;
      ctl=`<div class="pr-closed">${t.pick?`El teu pronòstic: <b>${t.pick==='win'?'✅ Guanya':'❌ Perd'}</b> ${res}`:'<small>No has pronosticat aquest equip</small>'}${pw===null?'<br><small>Ningú l’ha pronosticat</small>':`<div class="st-bar"><i style="width:${pw}%"></i></div><small>${pw}% creu que guanyarà · ${100-pw}% que perdrà (${tot} ${tot===1?'pronòstic':'pronòstics'})</small>`}</div>`;
    }
    return `<div class="pr-row"><div class="pr-t"><b>${escapeHtml(t.name)}</b><small>${vs(t.match)}</small></div>${ctl}</div>`;
  }).join('');
}
if($('predBox')) $('predBox').addEventListener('click',async e=>{
  const b=e.target.closest('[data-pr-team]'); if(!b) return;
  const team=Number(b.dataset.prTeam), pick=b.dataset.prPick, cur=(state.pred?.teams||[]).find(x=>x.team_id===team)?.pick;
  try{ const r=await rpc('save_prediction',{p_team:team,p_pick:cur===pick?null:pick}), t=await r.text(); if(!r.ok){ let m=t; try{m=JSON.parse(t).message||t;}catch{} throw new Error(m); } }
  catch(err){ alert('⚠️ '+err.message); }
  loadPredictions();
});
setInterval(()=>{ if(document.visibilityState==='visible') loadPredictions(); },300000);

/*BOT-ENGINE-START*/
const BOT_CATS=[
 {id:'basic',i:'🎮',t:'Començar'},
 {id:'market',i:'🛒',t:'Mercat'},
 {id:'team',i:'👕',t:'Plantilla'},
 {id:'points',i:'⭐',t:'Punts'},
 {id:'extra',i:'🎯',t:'Punts extra'},
 {id:'rank',i:'🏆',t:'Classificació'},
 {id:'club',i:'🏟️',t:'Partits i taula'},
 {id:'app',i:'📱',t:'App i avisos'},
 {id:'help',i:'🛠️',t:'Problemes'}
];

// c = categoria · q = pregunta · k = paraules clau (català i castellà) · a = resposta · go = pestanya on portar-te · d = línia dinàmica
const BOT_KB=[
/* ---------- COMENÇAR ---------- */
{c:'basic',q:'Què és el Fantasy Bàsquet Alella?',k:'fantasy, que es el fantasy, joc, de que va, explicacio, juego, en que consisteix, objectiu, objetivo',
 a:`És un joc per als socis i les famílies del club. Fitxes <b>jugadors i entrenadors reals</b> del Club Bàsquet Alella i, quan els seus equips <b>guanyen</b>, el teu equip Fantasy suma punts. Qui en té més a la classificació, guanya.`,go:'rules'},
{c:'basic',q:'Com començo a jugar?',k:'comencar, començar, primers passos, empezar, como juego, com es juga, instruccions, guia, tutorial',
 a:`<ol><li>Ves al <b>Mercat</b> i fitxa fins a <b>8 jugadors</b> i <b>2 entrenadors</b> amb els teus 120 M€.</li><li>A <b>Plantilla</b> tria el teu <b>capità</b> (⭐).</li><li>Mira els partits de la setmana a <b>Inici</b> i, si pots, ves a veure'ls: l'assistència també dona punts.</li><li>Cada jornada, els punts es calculen amb els resultats reals.</li></ol><p>Tens una guia pas a pas a <b>Regles → Veure la guia</b>.</p>`,go:'market'},
{c:'basic',q:'Quants jugadors i entrenadors puc tenir?',k:'quants jugadors, plantilla maxima, 8 jugadors, 2 entrenadors, limit, cuantos jugadores, maximo',
 a:`Pots tenir <b>8 jugadors</b> i <b>2 entrenadors</b>. No pots superar aquests límits, però no cal que ho completis tot el primer dia.`,go:'team'},
{c:'basic',q:'Quin pressupost tinc?',k:'pressupost, presupuesto, diners, dinero, milions, 120, euros, budget, M€',
 a:`Comences amb <b>120 M€</b>. Quan fitxes es resta el valor (més un 5% de comissió) i quan vens se't retorna el valor actual. El teu pressupost disponible el veus a la targeta taronja de l'<b>Inici</b>.`,go:'home'},
{c:'basic',q:'Què és una jornada?',k:'jornada, que es una jornada, ronda, semana, setmana, round',
 a:`Una <b>jornada</b> és el període de partits d'una setmana (amb un partit també els divendres). Quan acaba, l'organitzador introdueix els resultats i <b>processa la jornada</b>: és llavors quan se sumen els punts i canvien els valors.`},
{c:'basic',q:'Com em registro o entro a l\'app?',k:'registrar, registro, crear compte, cuenta, entrar, login, iniciar sessio, correu, email, alta, usuari',
 a:`A la pantalla d'entrada tria <b>crear compte</b> amb el teu correu i una contrasenya. Després, entra amb aquest mateix correu. Només cal fer-ho una vegada: l'app et recorda al mateix dispositiu.`},
{c:'basic',q:'He oblidat la contrasenya',k:'contrasenya, contraseña, password, oblidat, olvidado, recuperar, no puc entrar, no puedo entrar, canviar contrasenya',
 a:`Si a la pantalla d'entrada hi ha l'opció de recuperar-la, fes-la servir i t'arribarà un correu. Si no et funciona, avisa l'organitzador del club perquè t'ho ajudi a resoldre.`},
{c:'basic',q:'Puc tenir més d\'un equip Fantasy?',k:'dos equips, mes d un equip, varios equipos, segon compte, duplicar, multiple, otro equipo',
 a:`Cada persona té <b>un únic equip Fantasy</b> amb el seu compte. Si algú de casa també vol jugar, que es creï el seu propi compte amb un altre correu.`},
{c:'basic',q:'Puc canviar el nom del meu equip?',k:'nom equip, nombre equipo, canviar nom, renombrar, editar nom, cambiar nombre',
 a:`Sí. A la pestanya <b>Plantilla</b> toca el llapis ✏️ al costat del nom de l'equip, escriu-ne un de nou i desa.`,go:'team'},

/* ---------- MERCAT ---------- */
{c:'market',q:'Com fitxo un jugador o un entrenador?',k:'fitxar, fichar, comprar, afegir, anadir, contractar, fitxatge, fichaje, com compro',
 a:`Ves a <b>Mercat</b>, tria <b>Jugadors</b> o <b>Entrenadors</b> a dalt i prem <b>Fitxar</b> a la targeta. Pots fer servir el cercador i el filtre per equip. A la compra se suma una <b>comissió del 5%</b>.`,go:'market'},
{c:'market',q:'Com venc un jugador?',k:'vendre, vender, vendes, treure, quitar, fora, deixar anar, liberar, vender jugador, 💸',
 a:`A <b>Plantilla</b> prem el botó <b>💸</b> del jugador. Et retornen el <b>valor de mercat actual</b>, <b>sense cap comissió</b>. Recorda que amb el mercat tancat no es pot vendre.`,go:'team'},
{c:'market',q:'Quina comissió hi ha?',k:'comissio, quina comissio, comissio comprar, comissio vendre, comision, 5%, cinc per cent, comissions, cobrar, cobren, fee',
 a:`<b>Comprar</b> té un <b>5% de comissió</b>. <b>Vendre</b> no en té cap (0%).`},
{c:'market',q:'Quants fitxatges puc fer per jornada?',k:'fitxatges jornada, maxim 2, dos fitxatges, limit fitxatges, cuantos fichajes, fichajes por jornada, quantes compres',
 a:`Màxim <b>2 fitxatges per jornada</b>. Si ja n'has fet 2, no podràs fitxar fins a la jornada següent. Abans dels primers resultats no hi ha aquest límit.`},
{c:'market',q:'Quan tanca i quan obre el mercat?',k:'mercat tanca, mercado cierra, tancament, cierre, dijous, jueves, divendres, viernes, horari, hora, obre, abre, oberts, obert, tancat, cerrado',
 a:`El mercat <b>tanca cada dijous a les 23:59</b> (perquè els divendres ja hi ha partit) i <b>no s'obre fins que comença la jornada següent</b>. Així ningú fitxa sabent ja els resultats. Tancat, tampoc es pot vendre ni canviar el capità.`,
 d:()=>{ try{ return marketClosed()?`<p>🔒 <b>Ara el mercat està tancat.</b></p>`:`<p>🟢 <b>Ara el mercat està obert</b> i tanca el ${nextThursday().toLocaleDateString('ca-ES',{weekday:'long',day:'numeric',month:'long'})} a les 23:59.</p>`; }catch(e){ return ''; } }},
{c:'market',q:'Puc fitxar dos jugadors del mateix equip?',k:'mateix equip, mismo equipo, repetir equip, repetir, dos del mateix, equip real, un per equip, maxim per equip',
 a:`Sí, amb una condició: pots tenir <b>2 jugadors del mateix equip real</b>, però això només es pot fer <b>amb un sol equip</b>. La resta d'equips, màxim 1 jugador cadascun.`,
 d:()=>{ try{ return new Date()>=new Date('2026-10-05T00:00:00')?`<p>✅ Aquesta norma ja està activa.</p>`:`<p>📅 Entra en vigor <b>el 5 d'octubre</b>. Fins llavors, màxim 1 per equip.</p>`; }catch(e){ return ''; } }},
{c:'market',q:'Per què no puc fitxar?',k:'no puc fitxar, no puedo fichar, error fitxar, no deixa, no deja, bloquejat, bloqueado, no es pot comprar, no funciona fitxar, rebutja',
 a:`Comprova aquests motius, de més a menys habitual:<ul><li>🔒 El <b>mercat està tancat</b> (dijous 23:59 fins a la jornada següent).</li><li>💰 No tens prou <b>pressupost</b> (recorda la comissió del 5%).</li><li>👕 Ja tens <b>8 jugadors</b> (o 2 entrenadors).</li><li>🔁 Ja has fet els <b>2 fitxatges</b> d'aquesta jornada.</li><li>🏀 Ja tens un jugador d'aquell equip (només pots repetir equip una vegada).</li></ul>`},
{c:'market',q:'Per què canvia el valor dels jugadors?',k:'valor, preu, precio, value, puja, baixa, sube, baja, canvi de valor, cotitzacio, valoracio',
 a:`Després de <b>cada jornada</b> el valor de jugadors i entrenadors canvia segons els resultats del seu equip: les victories i les ratxes l'apugen. Així convé fitxar els que estan en forma abans que pugin.`},
{c:'market',q:'Què és la popularitat?',k:'popularitat, popularidad, populars, quants equips el tenen, mes fitxats, mas fichados',
 a:`La <b>popularitat</b> indica <b>quants equips Fantasy tenen</b> un jugador o entrenador. La veus a la seva fitxa (toca la targeta) i a la pestanya Equips.`,go:'clubs'},
{c:'market',q:'Puc veure les estadístiques d\'un jugador?',k:'estadistiques, estadisticas, fitxa, grafica, historial, punts per jornada, evolucio, stats',
 a:`Sí. Toca la <b>targeta</b> d'un jugador o entrenador (no el botó) i s'obre la seva fitxa: punts totals, victòries, ratxa, valor, gràfica d'evolució del valor i punts per jornada.`},

/* ---------- PLANTILLA ---------- */
{c:'team',q:'Què és el capità i com el trio?',k:'capita, capitan, captain, c, estrella, ⭐, triar capita, elegir capitan, +10',
 a:`El <b>capità</b> és el teu jugador clau: cada jornada que el seu equip <b>guanya</b>, el teu equip rep <b>+10 punts extra</b>. Si perd, no hi ha extra. Per triar-lo, a <b>Plantilla</b> toca l'estrella ☆ d'un jugador. Només el pots canviar amb el <b>mercat obert</b>.`,go:'team'},
{c:'team',q:'Puc canviar el capità en qualsevol moment?',k:'canviar capita, cambiar capitan, capita tancat, no puc canviar capita, capita bloquejat',
 a:`Només mentre el <b>mercat està obert</b>. Quan tanca (dijous 23:59) el capità queda fixat fins a la jornada següent.`},
{c:'team',q:'Com ordeno la meva plantilla?',k:'ordenar, arrossegar, arrastrar, moure, mover, drag, posicions, posiciones, pista, alineacio',
 a:`Pots <b>arrossegar</b> els jugadors per ordenar-los al teu gust. Al mòbil, mantén premuda la targeta un moment i arrossega. L'ordre és només visual i no afecta els punts.`,go:'team'},
{c:'team',q:'Què vol dir el + de la plantilla?',k:'lloc buit, hueco, mes, afegir, plus, casella buida, slot',
 a:`És un <b>lloc buit</b>. Si hi toques, et porta al mercat per fitxar-hi algú.`,go:'market'},
{c:'team',q:'Quins punts em compten: els d\'abans de fitxar-lo?',k:'punts abans, mentre es a la plantilla, desde que lo ficho, historic, retroactiu, antes de fichar, compten punts',
 a:`Només compten els punts que genera un jugador o entrenador <b>mentre és a la teva plantilla</b>. Els d'abans de fitxar-lo, o després de vendre'l, no.`},
{c:'team',q:'Els entrenadors també sumen punts?',k:'entrenadors punts, entrenador suma, coach, puntuen, entrenadores',
 a:`Sí. Els <b>entrenadors</b> sumen punts quan el seu equip <b>guanya</b>, amb el bonus de ratxa igual que els jugadors. També tenen un valor que canvia cada jornada.`},

/* ---------- PUNTS ---------- */
{c:'points',q:'Com es guanyen punts?',k:'punts, puntos, com sumo, sumar, puntuacio, puntuacion, guanyar punts, ganar puntos, sistema de punts, resum',
 a:`<ul><li>🏀 <b>Victòria</b> del seu equip: a partir de 12 punts (amb ratxa, més).</li><li>⭐ <b>Destacats</b> de l'entrenador: +7 / +5 / +3.</li><li>🅒 <b>Capità</b>: +10 si el seu equip guanya.</li><li>👀 <b>Anar a veure un partit</b>: +3 (el doble en partits x2).</li><li>🎯 <b>Missions, ratxa d'assistència, pronòstics i amics</b>: punts extra.</li></ul>`,go:'rules'},
{c:'points',q:'Quants punts val una victòria?',k:'victoria, victoria punts, guanya, gana, win, 12 punts, 10 punts, valor victoria, quants punts per guanyar',
 a:`Una victòria val <b>12 punts</b> la primera, <b>13</b> la segona seguida, <b>14</b> la tercera… Cada victòria consecutiva suma 1 punt més: és la <b>ratxa</b> 🔥. Si l'equip perd, no suma per victòria i la ratxa es reinicia.`},
{c:'points',q:'Què és la ratxa?',k:'ratxa, racha, victories seguides, consecutives, streak, seguides, 🔥',
 a:`La <b>ratxa</b> 🔥 compta les victòries <b>seguides</b> d'un equip. Cada victòria consecutiva puja en 1 punt el que val guanyar (12, 13, 14…). Perdre la reinicia a zero.`},
{c:'points',q:'Què són els jugadors destacats?',k:'destacat, destacats, destacado, destacados, highlight, 7 5 3, tres destacats, mvp, millor jugador, 7 punts, 5 punts, 3 punts, primer segon tercer',
 a:`Després del partit, l'<b>entrenador</b> de cada equip tria fins a <b>3 jugadors destacats, ordenats per importància</b>: el 1r rep <b>+7 punts</b>, el 2n <b>+5</b> i el 3r <b>+3</b>. Els reben encara que l'equip perdi. Sumen al jugador i, per tant, als equips Fantasy que el tinguin.`},
{c:'points',q:'Hi ha punts negatius?',k:'negatius, negativos, restar, perdre punts, perder puntos, baixar punts, penalitzacio, penalizacion, menys punts',
 a:`<b>No.</b> Els punts només sumen, mai resten. El que sí que pot baixar és el <b>valor</b> d'un jugador o entrenador si el seu equip perd.`},
{c:'points',q:'Quan se sumen els punts?',k:'quan, cuando, actualitzar punts, actualizar, processar jornada, processada, se sumen, no veig punts, tarden, retard, aparece',
 a:`Els punts no es veuen al moment: se sumen quan <b>l'organitzador processa la jornada</b>, després d'introduir tots els resultats reals i els destacats dels entrenadors. Fins llavors, la classificació no es mou.`},
{c:'points',q:'Per què no he sumat punts?',k:'no he sumat, no me han sumado, zero punts, cero puntos, per que no, por que no, falten punts, punts incorrectes, error punts, no compta',
 a:`Possibles motius:<ul><li>⏳ La jornada <b>encara no s'ha processat</b>.</li><li>🏀 El seu equip <b>va perdre</b> (no hi ha punts de victòria).</li><li>🔒 El jugador <b>no era a la teva plantilla</b> quan es va tancar la jornada.</li><li>🧑‍🏫 Els destacats encara no els havia triat l'entrenador.</li></ul><p>Si creus que hi ha un error, digues-ho a l'organitzador amb el nom del jugador i la jornada.</p>`},
{c:'points',q:'Per què el meu jugador té punts però jo no?',k:'jugador te punts, el jugador suma, no suma a mi, punts jugador, punts equip fantasy diferencia',
 a:`Els punts d'un jugador són els que genera <b>ell</b>. Tu només en cobres els que va fer <b>mentre era a la teva plantilla</b>. Si el vas fitxar després, no compten.`},

/* ---------- PUNTS EXTRA ---------- */
{c:'extra',q:'Com sumo punts anant a veure partits?',k:'assistencia, asistencia, anar a veure, ir a ver, partit vist, escanejar, escanear, qr, +3, afició, aficio, veure partit',
 a:`A cada partit, la persona de la <b>taula</b> mostra un <b>QR</b>. Escaneja'l des de l'app: primer <b>tries de quin equip del club ets aficionat</b> en aquell partit i després el codi. Cada partit vist val <b>+3 punts</b>.`,go:'home'},
{c:'extra',q:'Què són els partits x2?',k:'x2, doble, doble de punts, partits dobles, partit x2, ⭐ x2, double, punts dobles',
 a:`Alguns partits (marcats amb <b>⭐ x2</b> al calendari de l'Inici) fan que els punts d'assistència valguin el <b>doble</b>: <b>+6</b> en comptes de +3.`,go:'home'},
{c:'extra',q:'Què és la ratxa d\'assistència?',k:'ratxa assistencia, racha asistencia, setmanes seguides, semanas seguidas, anar cada setmana, constancia, bonus assistencia',
 a:`Si vas a veure com a mínim un partit <b>setmanes seguides</b> (només compten setmanes amb partits al club), guanyes un bonus: <b>+2</b> a la 3a setmana seguida i <b>+5</b> a la 5a. A Inici veus quina ratxa portes.`,go:'home'},
{c:'extra',q:'Com funcionen les missions setmanals?',k:'missions, misiones, mision, repte, reto, tasques, objectius setmanals, mission',
 a:`Cada setmana et proposem <b>3 missions diferents</b> (veure partits, fitxar, triar capità, tenir la plantilla completa…). Cada una val entre <b>1 i 3 punts</b> i es completa sola quan la fas. Les missions <b>canvien cada setmana</b>.`,go:'home'},
{c:'extra',q:'Com convido un amic i quant val?',k:'convidar, invitar, amic, amigo, referral, codi, codigo, convida, convit, referit, portar gent',
 a:`A Inici tens la teva <b>targeta de convidar</b> amb un codi personal. Quan un amic es registra i l'escriu, <b>tots dos guanyeu +5 punts</b>. Pots convidar fins a <b>10 amics</b>.`,go:'home'},
{c:'extra',q:'Què són els pronòstics?',k:'pronostic, pronostico, pronostics, predir, predecir, endevinar, adivinar, predictions, apostes, guanyara perdra, 🔮',
 a:`Cada jornada pots <b>pronosticar</b> fins a <b>5 equips</b> del club: marques si guanyaran o perdran. <b>+2 punts per encert</b> i <b>+3 de plenari</b> si n'encertes tots (amb 3 o més pronòstics). Es tanquen amb el mercat (dijous 23:59) i després es veuen els percentatges de tothom.`,go:'home'},
{c:'extra',q:'Com guanyo més punts? Quines opcions tinc?',k:'mes punts, mas puntos, trucs, consells, estrategia, estrategias, ajuda guanyar, millorar, remuntar, com guanyar el fantasy, tips',
 a:`Combina-ho tot:<ul><li>🏀 Fitxa jugadors d'equips en <b>ratxa</b>.</li><li>🅒 Posa de capità algú d'un equip fort.</li><li>👀 Ves a veure partits (sobretot els <b>x2</b>) i mantén la ratxa d'assistència.</li><li>🎯 Completa les 3 missions de la setmana.</li><li>🔮 Fes els pronòstics abans del dijous.</li><li>🤝 Convida amics (+5 cadascú).</li></ul>`},

/* ---------- CLASSIFICACIÓ ---------- */
{c:'rank',q:'Com funciona la classificació?',k:'classificacio, clasificacion, ranking, posicio, posicion, qui va primer, tabla, taula classificacio, puntuacions, lloc',
 a:`A <b>Classificació</b> veus tots els equips Fantasy ordenats per punts. La teva fila porta l'etiqueta <b>TU</b> i a dalt hi ha la teva posició. 🥇🥈🥉 són els tres primers. Hi ha dues pestanyes: <b>🏆 Fantasy</b> i <b>🏟️ Afició per equips</b>.`,go:'ranking'},
{c:'rank',q:'Què és la classificació d\'afició per equips?',k:'aficio per equips, afició, aficion, equip amb mes aficio, assistencia per equip, quin equip te mes gent, fans',
 a:`És el rànquing dels <b>equips reals del club</b> segons quants partits han anat a veure les persones que els han triat en escanejar el QR. Es veu a <b>Classificació → 🏟️ Afició per equips</b>, i la posició de cada equip també surt a la pestanya <b>Equips</b>.`,go:'ranking'},
{c:'rank',q:'Hi ha premis?',k:'premi, premio, premios, regal, guanyador, ganador, que es guanya, recompensa, trofeu',
 a:`Els premis (si n'hi ha) els decideix l'<b>organitzador del club</b>. Pregunta-li directament o mira els avisos del club.`},
{c:'rank',q:'On veig els resultats reals dels partits?',k:'resultats, resultados, marcador, marcadors, resultat, com ha quedat, quant han quedat, score',
 a:`A la pestanya <b>Resultats</b> hi ha els resultats reals de cada jornada. També els veus a l'<b>Inici</b>, al calendari de la setmana.`,go:'results'},
{c:'rank',q:'On veig els equips reals i els seus jugadors?',k:'equips, equipos, equips reals, club, jugadors del club, plantilles reals, entrenadors del club, categories',
 a:`A la pestanya <b>Equips</b> hi ha els equips del club amb els seus integrants i entrenadors, els partits guanyats, la popularitat i la posició a la classificació d'afició.`,go:'clubs'},

/* ---------- PARTITS I TAULA ---------- */
{c:'club',q:'Què surt al calendari de l\'Inici?',k:'calendari, calendario, partits setmana, partidos semana, inici, home, agenda, proxims partits, proximos partidos, casa, fora, visitant, local',
 a:`Al tauler d'<b>Inici</b> hi ha els partits de la setmana, tant els de <b>casa 🏠</b> com els de <b>fora ✈️</b>. Cada partit mostra el seu estat, i els marcats amb <b>⭐ x2</b> donen el doble de punts d'assistència.`,go:'home'},
{c:'club',q:'Què vol dir en joc, acabat, suspès o anul·lat?',k:'estat partit, estado partido, en joc, en juego, acabat, terminado, suspes, suspendido, anullat, cancelado, aplazado, badges, etiquetes',
 a:`Són els estats d'un partit:<ul><li>🔴 <b>En joc</b>: s'està disputant.</li><li><b>Acabat</b>: el partit ja ha acabat.</li><li>⏸️ <b>Suspès</b>: s'ha interromput.</li><li>❌ <b>Anul·lat</b>: no es juga, i no compta per als pronòstics.</li></ul><p>Normalment es calculen sols segons l'hora del partit, i l'administrador els pot canviar si passa alguna cosa extraordinària.</p>`},
{c:'club',q:'Soc entrenador: com destaco jugadors?',k:'entrenador destacar, destacar jugadors, panell entrenador, panel entrenador, soc entrenador, triar destacats, coach panel, escollir destacats',
 a:`Si el teu compte està vinculat com a entrenador, a la pestanya <b>📋 Taula</b> veuràs el <b>🧑‍🏫 Panell d'entrenador</b>. Quan ja hi ha el <b>resultat de l'equip</b>, tria fins a <b>3 jugadors per ordre d'importància</b> (7 / 5 / 3 punts) i desa. Es pot canviar fins que l'organitzador processi la jornada.`},
{c:'club',q:'No em surt el panell d\'entrenador',k:'no surt panell, no veig panell entrenador, no aparece panel, falta panell, vincular entrenador, no soc vinculat',
 a:`La pestanya Taula i el panell només apareixen si el teu compte està <b>vinculat a un entrenador</b> (o tens taula assignada). Si ho ets i no el veus, passa-li el teu correu a l'organitzador perquè et vinculi. Si has penjat una versió nova de l'app, recarrega la pàgina per actualitzar-la.`},
{c:'club',q:'Com funciona el QR de la taula?',k:'taula, mesa, acta, mostrar qr, qr taula, generar qr, taula partit, fer taula, oficial de taula, codi qr',
 a:`Si fas l'<b>acta</b> d'un partit, a la pestanya <b>Taula</b> hi surten els teus partits. Toca <b>Mostrar QR</b> i deixa que els assistents l'escanegin amb l'app. Cada partit té <b>2 llocs de taula</b>.`},
{c:'club',q:'No puc escanejar el QR',k:'escanejar no funciona, no escaneja, no puc escanejar, camara, càmera, camera, permisos, qr no va, error qr, no lee qr',
 a:`Prova això:<ul><li>📷 Dona <b>permís de càmera</b> a l'app o al navegador.</li><li>💡 Enfoca bé el QR amb prou llum, sense reflexos.</li><li>🏟️ Recorda <b>triar primer l'equip</b> del desplegable.</li><li>🔁 Cada partit només es pot comptar <b>una vegada</b>.</li><li>⏱️ El QR de la taula només és vàlid per a aquell partit.</li></ul>`},
{c:'club',q:'Per què em demana triar un equip abans d\'escanejar?',k:'triar equip escanejar, desplegable, selector equip, quin equip, escollir equip qr, seleccionar equip',
 a:`Perquè així sabem de quin equip ets aficionat aquell dia. Amb això es fa el rànquing <b>🏟️ Afició per equips</b>, que mostra quins equips del club tenen més gent animant-los.`},
{c:'club',q:'Què és el compte "Basquet Alella"?',k:'basquet alella compte, compte club, usuari club, cuenta club, administrador club',
 a:`És el compte oficial del club: no juga i no surt a la classificació. Serveix per gestionar el joc, ocupar sempre la taula dels partits i destacar jugadors de tots els equips.`},

/* ---------- APP I AVISOS ---------- */
{c:'app',q:'Com instal·lo l\'app al mòbil?',k:'instalar, instal·lar, app, aplicacio, descarregar, descargar, icona, icono, pantalla inici, afegir pantalla, android, iphone, ios, pwa',
 a:`<b>Android (Chrome):</b> obre la web, prem el menú ⋮ i tria <i>Instal·la l'app</i> (o fes servir la targeta d'Instal·lar que surt a Inici).<br><b>iPhone (Safari):</b> prem <i>Compartir</i> ⬆️ i tria <i>Afegeix a pantalla d'inici</i>.<br>Quedarà amb la icona verda del club, com una app més.`,go:'home'},
{c:'app',q:'Hi ha notificacions?',k:'notificacions, notificaciones, avisos, avisar, push, alertes, alertas, notificar, recordatori, recordatorio, activar avisos, no arriben notificacions',
 a:`De moment l'app <b>no envia notificacions</b>. Per estar al dia, mira la franja del mercat i el calendari de l'<b>Inici</b>, on surten el compte enrere del tancament i els partits de la setmana.`,go:'home'},
{c:'app',q:'On trobo la guia de com es juga?',k:'guia, tour, tutorial, ajuda, ayuda, com funciona tot, manual, explicacio, instruccions',
 a:`A <b>Regles → ❓ Veure la guia</b> tens una guia pas a pas de tot el joc. A la pestanya Regles també hi ha un resum de totes les normes.`,go:'rules'},
{c:'app',q:'Quines són totes les regles?',k:'regles, reglas, normes, normas, reglament, reglamento, resum regles, condicions',
 a:`Resum:<ul><li>💰 120 M€ · 👕 8 jugadors + 🧑‍🏫 2 entrenadors.</li><li>🛒 Compra amb 5% de comissió; venda sense.</li><li>🔁 Màxim 2 fitxatges per jornada.</li><li>🏀 Màxim 1 jugador per equip real (2 d'un sol equip des del 5/10).</li><li>🔒 Mercat tancat de dijous 23:59 fins a la jornada següent.</li><li>⭐ Victòria + ratxa, destacats 7/5/3, capità +10, assistència +3.</li></ul>`,go:'rules'},
{c:'app',q:'És segur? Quines dades guardeu?',k:'privacitat, privacidad, dades, datos, seguretat, seguridad, rgpd, proteccio dades, privat, menors, nens',
 a:`Només es guarda el que cal per jugar: el teu correu, el nom del teu equip Fantasy i la teva activitat al joc (fitxatges, assistències, pronòstics). Per a qualsevol dubte sobre les teves dades, parla amb l'organitzador del club.`},

/* ---------- PROBLEMES ---------- */
{c:'help',q:'L\'app no es veu actualitzada o falta alguna cosa',k:'no s actualitza, no se actualiza, versio antiga, versión antigua, no surt, no apareix, no apareix res, falta, actualitzar, recarregar, refrescar, cache, novetats',
 a:`Segurament el navegador té la versió antiga. Prova:<ol><li>Tanca l'app i torna-la a obrir.</li><li>Al navegador, recarrega amb força (a l'ordinador <b>Ctrl+Maj+R</b>; al mòbil, tanca la pestanya i reobre-la).</li><li>Mira el peu de pàgina: ha de dir <b>"pàgina vN · codi vN"</b> amb el mateix número als dos.</li></ol>Si els números no coincideixen, la pàgina encara no s'ha actualitzat del tot.`},
{c:'help',q:'Tinc un error o alguna cosa no funciona',k:'error, fallo, bug, no funciona, no va, falla, problema, trencat, roto, no carrega, no carga, pantalla blanca, es queda penjat, colgado',
 a:`Prova primer de <b>recarregar</b> la pàgina i tancar i tornar a entrar. Si continua, envia a l'organitzador una captura de pantalla amb el missatge d'error i digues-li què estaves fent.`},
{c:'help',q:'Puc recuperar un jugador que he venut?',k:'recuperar jugador, desfer venda, deshacer venta, em penedeixo, me arrepiento, tornar a fitxar, vender por error, venut per error',
 a:`No es pot desfer una venda, però, si el mercat és obert, el pots tornar a <b>fitxar</b> pagant el seu valor actual més la comissió del 5%. Compta com un fitxatge normal.`},
{c:'help',q:'Qui m\'ajuda si no trobo la resposta?',k:'contacte, contacto, organitzador, organizador, ajuda humana, ajuda personal, parlar amb algu, hablar, soporte, suport, dubte, pregunta, no trobo',
 a:`Parla amb l'<b>organitzador del Fantasy</b> del club (per exemple, al pavelló o pel grup del club). Si pots, explica-li què intentaves fer i què t'ha sortit.`},

/* ---------- XARRADA ---------- */
{c:'basic',hide:true,q:'Hola',k:'hola, bon dia, bona tarda, bona nit, hello, hi, bones, buenas, ei, ey',
 a:`Hola! 👋 Soc l'assistent del Fantasy. Pregunta'm el que vulguis sobre les regles, el mercat, els punts o l'app.`},
{c:'basic',hide:true,q:'Gràcies',k:'gracies, gracias, merci, perfecte, genial, ok, vale, molt be, thanks, adeu, adios',
 a:`De res! 🏀 Si tens cap altre dubte, aquí em tens.`}
];

const BOT_STOP=new Set('el la els les un una uns unes de del dels al als i o a en es que com per perque quin quina quins quines què me em et te se si no mes molt hi ha han he ho puc pot poden vull tinc tens meu meva meus meves mi mis los las con para por como del una y es mas muy hay mio mia pot ser fer fa qui quan on cal cap tot tots tota totes jo tu ell ella son soc'.split(' '));
function botNorm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/·/g,'').replace(/[^a-z0-9%+ ]+/g,' ').replace(/\s+/g,' ').trim(); }
function botWords(s){ return botNorm(s).split(' ').filter(w=>w&&(w.length>=2)&&!BOT_STOP.has(w)); }
function botSim(a,b){ // 0..1: igualtat o mateixa arrel
  if(a===b) return 1;
  const m=Math.min(a.length,b.length); if(m<4) return 0;
  let i=0; while(i<m&&a[i]===b[i]) i++;
  if(i>=Math.min(5,m)&&i>=m-3) return i===m?.85:.7;
  return 0;
}
let _botIdx=null;
function botIndex(){
  if(_botIdx) return _botIdx;
  _botIdx=BOT_KB.map((e,n)=>{
    const kp=String(e.k||'').split(',').map(s=>botNorm(s)).filter(Boolean);
    const kw=new Set(); kp.forEach(p=>botWords(p).forEach(w=>kw.add(w)));
    return {n,e,phrases:kp.filter(p=>p.includes(' ')||p.length>=3),kw:[...kw],qw:botWords(e.q),aw:[...new Set(botWords(String(e.a||'').replace(/<[^>]+>/g,' ')))]};
  });
  return _botIdx;
}
function botSearch(query){
  const qn=botNorm(query), qw=botWords(query);
  if(!qn) return [];
  const out=[];
  for(const it of botIndex()){
    let s=0, hit=0;
    for(const t of qw){
      let b=0;
      for(const w of it.kw){ const v=botSim(t,w)*3; if(v>b) b=v; }
      for(const w of it.qw){ const v=botSim(t,w)*2; if(v>b) b=v; }
      if(b<2){ for(const w of it.aw){ const v=botSim(t,w)*.5; if(v>b) b=v; } }
      if(b>0){ s+=b; if(b>=2) hit++; }
    }
    for(const p of it.phrases){ if(p.length>=4&&(' '+qn+' ').includes(' '+p+' ')) s+=p.includes(' ')?5:2.5; }
    if(qw.length>1&&hit===qw.length) s+=2; // tots els mots de la pregunta coincideixen
    if(qn===botNorm(it.e.q)) s+=20;
    if(s>0) out.push({n:it.n,e:it.e,s});
  }
  return out.sort((a,b)=>b.s-a.s);
}
/*BOT-ENGINE-END*/


/*BOT-UI-START*/
let _botBuilt=false, _botWelcomed=false;
const BOT_NOTFOUND=['No he trobat una resposta clara per a això. 🤔 Prova amb altres paraules (per exemple <i>mercat</i>, <i>capità</i>, <i>punts</i>, <i>QR</i>) o tria un tema:','Això no ho tinc clar. Reformula la pregunta amb altres paraules, o mira aquests temes:'];
function botScroll(){ const m=$('botMsgs'); if(m) setTimeout(()=>{ m.scrollTop=m.scrollHeight; },30); }
function botAdd(who,html,isText){
  const m=$('botMsgs'); if(!m) return null;
  const d=document.createElement('div'); d.className='bot-msg '+who;
  if(isText) d.textContent=html; else d.innerHTML=html;
  m.appendChild(d); botScroll(); return d;
}
function botQBtns(list){ return '<div class="bot-sugg">'+list.map(e=>`<button type="button" class="bot-q" data-q="${BOT_KB.indexOf(e)}">${e.q.replace(/</g,'&lt;')}</button>`).join('')+'</div>'; }
function botCatBtns(){ return '<div class="bot-sugg">'+BOT_CATS.map(c=>`<button type="button" class="bot-cat" data-cat="${c.id}">${c.i} ${c.t}</button>`).join('')+'</div>'; }
function botShowCat(id){
  const c=BOT_CATS.find(x=>x.id===id); if(!c) return;
  botAdd('user',c.i+' '+c.t,true);
  const list=BOT_KB.filter(e=>e.c===id&&!e.hide);
  setTimeout(()=>botAdd('bot',`<b>${c.i} ${c.t}</b>: tria una pregunta`+botQBtns(list)),150);
}
function botShowAnswer(e,related){
  let h=`<div class="bot-ans">${e.a}</div>`;
  if(e.d){ try{ h+=e.d(); }catch(x){} }
  if(e.go) h+=`<div class="bot-goRow"><button type="button" class="bot-go" data-go="${e.go}">Anar-hi →</button></div>`;
  if(related&&related.length) h+=`<div class="bot-rel">Potser també t'interessa:</div>`+botQBtns(related);
  botAdd('bot',h);
}
function botAsk(text){
  text=String(text||'').trim().slice(0,200); if(!text) return;
  botAdd('user',text,true);
  const res=botSearch(text).filter(r=>!r.e.hide||r.s>=8);
  const top=res[0];
  setTimeout(()=>{
    if(top&&top.s>=2.5){
      const rel=res.slice(1).filter(r=>!r.e.hide&&r.s>=Math.max(2.5,top.s*.45)).slice(0,2).map(r=>r.e);
      botShowAnswer(top.e,rel);
    } else {
      const near=res.filter(r=>!r.e.hide&&r.s>=1.2).slice(0,3).map(r=>r.e);
      let h=BOT_NOTFOUND[Math.floor(Math.random()*BOT_NOTFOUND.length)];
      if(near.length) h+='<div class="bot-rel">Potser volies dir…</div>'+botQBtns(near);
      h+=botCatBtns()+'<div class="bot-rel">Si encara no ho trobes, pregunta-ho a l\'organitzador del club.</div>';
      botAdd('bot',h);
    }
  },250);
}
function botWelcome(){
  if(_botWelcomed) return; _botWelcomed=true;
  const pop=['Quan tanca i quan obre el mercat?','Com es guanyen punts?','Què és el capità i com el trio?','Com sumo punts anant a veure partits?'].map(q=>BOT_KB.find(e=>e.q===q)).filter(Boolean);
  botAdd('bot',`Hola! 👋 Soc l'<b>assistent del Fantasy</b>. Escriu el teu dubte o tria un tema.`+botCatBtns()+'<div class="bot-rel">Preguntes habituals:</div>'+botQBtns(pop));
}
function botOpen(){
  initBot(); const m=$('botModal'); if(!m) return;
  m.style.display='flex'; document.body.classList.add('bot-open'); botWelcome(); botScroll();
  if(window.matchMedia&&window.matchMedia('(hover:hover)').matches) setTimeout(()=>{ const i=$('botInput'); if(i) i.focus(); },50);
}
function botClose(){ const m=$('botModal'); if(m) m.style.display='none'; document.body.classList.remove('bot-open'); }
function botHide(){ botClose(); const f=$('botFab'); if(f) f.style.display='none'; const m=$('botMsgs'); if(m) m.innerHTML=''; _botWelcomed=false; }
function initBot(){
  if(_botBuilt){ const f=$('botFab'); if(f) f.style.display=''; return; }
  _botBuilt=true;
  const fab=document.createElement('button'); fab.id='botFab'; fab.type='button'; fab.className='bot-fab'; fab.setAttribute('aria-label','Obrir l\'assistent d\'ajuda'); fab.innerHTML='<span>💬</span> Ajuda';
  document.body.appendChild(fab);
  // El botó es pot arrossegar i recorda on l'has deixat
  { let st=null, moved=false;
    const clamp=(x,y)=>({x:Math.min(Math.max(4,x),window.innerWidth-fab.offsetWidth-4),y:Math.min(Math.max(4,y),window.innerHeight-fab.offsetHeight-4)});
    const place=(x,y)=>{ const c=clamp(x,y); fab.style.left=c.x+'px'; fab.style.top=c.y+'px'; fab.style.right='auto'; fab.style.bottom='auto'; return c; };
    try{ const sv=JSON.parse(localStorage.getItem('botFabPos')||'null'); if(sv&&typeof sv.x==='number') place(sv.x,sv.y); }catch(e){}
    window.addEventListener('resize',()=>{ if(fab.style.left){ const r=fab.getBoundingClientRect(); place(r.left,r.top); } });
    fab.addEventListener('pointerdown',e=>{ const r=fab.getBoundingClientRect(); st={px:e.clientX,py:e.clientY,x:r.left,y:r.top,id:e.pointerId}; moved=false; try{ fab.setPointerCapture(e.pointerId); }catch(x){} });
    fab.addEventListener('pointermove',e=>{ if(!st) return; const dx=e.clientX-st.px, dy=e.clientY-st.py;
      if(!moved&&Math.hypot(dx,dy)>6){ moved=true; fab.classList.add('moving'); try{ fab.setPointerCapture(st.id); }catch(x){} }
      if(moved){ e.preventDefault(); place(st.x+dx,st.y+dy); } });
    const end=()=>{ if(!st) return; if(moved){ fab.classList.remove('moving'); const r=fab.getBoundingClientRect(); try{ localStorage.setItem('botFabPos',JSON.stringify({x:Math.round(r.left),y:Math.round(r.top)})); }catch(x){} window.__botMoved=Date.now(); } st=null; };
    fab.addEventListener('pointerup',end); fab.addEventListener('pointercancel',end);
    fab.addEventListener('click',()=>{ if(Date.now()-(window.__botMoved||0)<300) return; botOpen(); });
  }
  const modal=document.createElement('div'); modal.id='botModal'; modal.className='bot-modal'; modal.style.display='none';
  modal.innerHTML=`<div class="bot-box" role="dialog" aria-label="Assistent del Fantasy"><div class="bot-head"><b>🤖 Assistent del Fantasy</b><button type="button" id="botClose" aria-label="Tanca">✕</button></div><div id="botMsgs" class="bot-msgs" aria-live="polite"></div><div class="bot-topics" id="botTopics">${BOT_CATS.map(c=>`<button type="button" class="bot-cat" data-cat="${c.id}">${c.i} ${c.t}</button>`).join('')}</div><form id="botForm" class="bot-form" autocomplete="off"><input id="botInput" type="text" maxlength="200" placeholder="Escriu el teu dubte…" enterkeyhint="send"><button type="submit" aria-label="Envia">➤</button></form></div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',ev=>{
    if(ev.target===modal){ botClose(); return; }
    const b=ev.target.closest('button'); if(!b) return;
    if(b.id==='botClose'){ botClose(); return; }
    if(b.dataset.q!==undefined){ const e=BOT_KB[+b.dataset.q]; if(e){ botAdd('user',e.q,true); setTimeout(()=>botShowAnswer(e,[]),200); } return; }
    if(b.dataset.cat){ botShowCat(b.dataset.cat); return; }
    if(b.dataset.go){ const g=b.dataset.go; botClose(); try{ showSection(g); }catch(x){} return; }
  });
  $('botForm').addEventListener('submit',ev=>{ ev.preventDefault(); const i=$('botInput'); const v=i.value; i.value=''; botAsk(v); });
  document.addEventListener('keydown',ev=>{ if(ev.key==='Escape') botClose(); });
}
/*BOT-UI-END*/

const APP_VERSION=64; { const el=$('verJs'); if(el) el.textContent='v'+APP_VERSION; }

/* ===== ANIMACIONS ===== */
const reduceMotion=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
function playCourt(){ const c=$('teamPlayers'); if(!c) return; c.classList.add('done'); c.classList.remove('play'); void c.offsetWidth; c.classList.add('play'); setTimeout(()=>c.classList.remove('play'),1700); }
(function(){
  const c=$('teamPlayers'); if(!c) return;
  if(!('IntersectionObserver' in window)){ c.classList.add('done'); return; }
  new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting) playCourt(); }),{threshold:.35}).observe(c);
})();
function animateMoney(el,to){
  if(!el) return; const from=el.dataset.v===undefined?to:Number(el.dataset.v); el.dataset.v=to;
  if(from===to||reduceMotion()){ el.textContent=money(to); return; }
  el.classList.remove('flash-up','flash-down'); void el.offsetWidth; el.classList.add(to>from?'flash-up':'flash-down');
  const t0=performance.now();
  (function step(t){ const k=Math.min(1,(t-t0)/700), e=1-Math.pow(1-k,3); el.textContent=money(from+(to-from)*e); if(k<1) requestAnimationFrame(step); })(t0);
}
function confetti(){
  if(reduceMotion()) return;
  const box=document.createElement('div'); box.className='confetti'; const cols=['#e8762c','#0f6b46','#ffffff','#f5c542'];
  for(let i=0;i<70;i++){ const s=document.createElement('i'); s.style.cssText=`left:${Math.random()*100}%;background:${cols[i%4]};animation-delay:${Math.random()*.6}s;animation-duration:${2+Math.random()*1.5}s;transform:rotate(${Math.random()*360}deg)`; box.appendChild(s); }
  document.body.appendChild(box); setTimeout(()=>box.remove(),4300);
}

init();
