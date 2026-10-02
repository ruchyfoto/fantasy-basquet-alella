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
  if(password!==passwordConfirm) return setAuthMessage('Les contrasenyes no coincideixen.');
  try{
    setAuthMessage('Creant el compte…');
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
  state.lineup=Array.isArray(lay)?lay:[]; renderTeam(); renderMarket(); renderClubs();
}
(function(){
  const court=$('teamPlayers'); if(!court) return; let d=null;
  court.addEventListener('pointerdown',e=>{ const s=e.target.closest('.slot'); if(!s||!s.querySelector('.pcard')||e.target.closest('button')) return;
    d={s,i:+s.dataset.i,x:e.clientX,y:e.clientY,on:false,t:e.pointerType};
    if(d.t!=='mouse') d.timer=setTimeout(()=>{ if(d){ d.on=true; s.classList.add('dragging'); navigator.vibrate&&navigator.vibrate(15); } },280); });
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
    <div class="club-sec">🧑‍🏫 Entrenadors</div><div class="chips">${coaches.map(o=>chip(`data-cid="${o.c.id}" data-ctid="${o.tid}"`,cph(o.c),'🧑‍🏫',coachName(o.c),'Entrenador')).join('')||'<small>Sense entrenadors</small>'}</div>
    <div class="club-sec">🏀 Jugadors (${players.length})</div><div class="chips">${players.map(p=>chip(`data-pid="${p.id}"`,p.photo_url||'logo.png','👤',`${p.name} ${p.surname||''}`.trim(),'#'+String(p.shirt_number??'—').replace(/\.0$/,''))).join('')||'<small>Sense jugadors</small>'}</div></article>`;
  }).join('');
}
function renderResults(){
  if(!state.round){$('resultsList').innerHTML='<div class="empty-state">No hi ha jornada activa.</div>';return;}
  api(`team_round_results?round_id=eq.${state.round.id}&select=real_team_id,result&order=real_team_id`).then(async r=>{if(!r.ok)throw new Error(await r.text());const rows=await r.json();$('resultsList').innerHTML=rows.length?rows.map(x=>`<div class="match"><div><b>${escapeHtml(teamName(x.real_team_id))}</b></div><strong>${x.result==='win'?'🟢 Victòria':'🔴 Derrota'}</strong></div>`).join(''):'<div class="empty-state"><div class="empty-icon">🏀</div><h3>Encara no hi ha resultats</h3></div>';}).catch(e=>{$('resultsList').innerHTML=`<div class="empty-state">No s'han pogut carregar els resultats.<br><small>${escapeHtml(e.message)}</small></div>`;});
}
async function renderRanking(){
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
function renderCoachPanel(){
  const section=$('coachPanel');
  if(!section)return;
  if(!state.coachContext.length){
    section.style.display='none';
    return;
  }
  section.style.display='';
  $('coachPanelSubtitle').textContent=`Hola ${state.coachContext[0].coach_name}. Selecciona el jugador destacat de cada equip després que s’hagi registrat el resultat.`;
  $('coachPanelGrid').innerHTML=state.coachContext.map(ctx=>{
    const players=state.players.filter(p=>String(p.real_team_id)===String(ctx.real_team_id));
    const selected=ctx.highlighted_player_id;
    return `<article class="coach-team-panel card">
      <div class="coach-team-header"><div><span class="coach-label">EQUIP</span><h3>${escapeHtml(ctx.real_team_name)}</h3><p>${ctx.result==='win'?'🟢 Victòria':ctx.result==='loss'?'🔴 Derrota':'⏳ Resultat pendent'} · Jornada ${ctx.round_number}</p></div><div class="pill">${selected?'⭐ Destacat seleccionat':'Sense destacat'}</div></div>
      ${ctx.result ? `<div class="coach-player-list">${players.map(p=>{
        const isSelected=String(p.id)===String(selected);
        return `<button class="coach-player-option${isSelected?' selected':''}" data-highlight-player="${p.id}" data-highlight-team="${ctx.real_team_id}"><span class="coach-player-main"><b>#${escapeHtml(String(p.shirt_number ?? '—').replace(/\.0$/,''))}</b><span>${escapeHtml(p.name)} ${escapeHtml(p.surname||'')}</span></span><span>${isSelected?'⭐ Destacat':'Seleccionar'}</span></button>`;
      }).join('')}</div>` : `<div class="notice">Quan l’administrador registri el resultat, podràs seleccionar el jugador destacat.</div>`}
    </article>`;
  }).join('');
}

function renderRules(){ $('budgetRule').textContent='💰 120 M€'; }

function bindActions(){
  document.querySelectorAll('[data-buy-player]').forEach(b=>b.onclick=()=>buyPlayer(Number(b.dataset.buyPlayer)));
  document.querySelectorAll('[data-captain-player]').forEach(b=>b.onclick=()=>setCaptain(Number(b.dataset.captainPlayer)));
  document.querySelectorAll('[data-sell-player]').forEach(b=>b.onclick=()=>sellPlayer(Number(b.dataset.sellPlayer)));
  document.querySelectorAll('[data-buy-coach]').forEach(b=>b.onclick=()=>buyCoach(Number(b.dataset.buyCoach),Number(b.dataset.buyCoachTeam)));
  document.querySelectorAll('[data-sell-coach]').forEach(b=>b.onclick=()=>sellCoach(Number(b.dataset.sellCoach),Number(b.dataset.sellCoachTeam)));
  document.querySelectorAll('[data-highlight-player]').forEach(b=>b.onclick=()=>setHighlight(Number(b.dataset.highlightPlayer),Number(b.dataset.highlightTeam)));
}
async function buyPlayer(id){const p=state.players.find(x=>Number(x.id)===id);if(!p)return;if(!confirm(`Fitxar ${p.name} ${p.surname} per ${money(Number(p.current_value)*1.05)}?`))return;await runRpc('buy_fantasy_asset',{p_fantasy_team_id:state.teamId,p_player_id:id,p_coach_id:null,p_coach_real_team_id:null,p_round_id:state.round?.id||null},'Jugador fitxat correctament.');}
async function buyCoach(id,teamId){const c=state.coaches.find(x=>Number(x.id)===id);if(!c)return;const market=state.coachMarkets.find(x=>Number(x.coach_id)===id&&Number(x.real_team_id)===teamId);const coachValue=Number(market?.current_value ?? c.current_value ?? 0);if(!confirm(`Fitxar ${coachName(c)} · ${teamName(teamId)} per ${money(coachValue*1.05)}?`))return;await runRpc('buy_fantasy_asset',{p_fantasy_team_id:state.teamId,p_player_id:null,p_coach_id:id,p_coach_real_team_id:teamId,p_round_id:state.round?.id||null},'Entrenador fitxat correctament.');}
async function sellPlayer(id){if(!confirm('Vols vendre aquest jugador pel seu valor de mercat actual?'))return;await runRpc('sell_fantasy_asset',{p_fantasy_team_id:state.teamId,p_player_id:id,p_coach_id:null,p_coach_real_team_id:null,p_round_id:state.round?.id||null},'Jugador venut correctament.');}
async function setCaptain(id){const p=state.players.find(x=>Number(x.id)===id);if(!p)return;if(state.rosterPlayers.find(x=>Number(x.player_id)===id)?.is_captain){return;}if(!confirm(`Fer ${p.name} ${p.surname||''} capità?`))return;await runRpc('set_fantasy_captain',{p_fantasy_team_id:state.teamId,p_player_id:id},'Capità actualitzat correctament.');}
async function sellCoach(id,teamId){if(!confirm(`Vols vendre ${coachName(state.coaches.find(c=>Number(c.id)===id))} · ${teamName(teamId)}?`))return;await runRpc('sell_fantasy_asset',{p_fantasy_team_id:state.teamId,p_player_id:null,p_coach_id:id,p_coach_real_team_id:teamId,p_round_id:state.round?.id||null},'Entrenador venut correctament.');}
async function setHighlight(playerId,teamId){
  const p=state.players.find(x=>Number(x.id)===playerId);
  if(!p)return;
  if(!confirm(`Seleccionar ${p.name} ${p.surname||''} com a jugador destacat?`))return;
  try{
    const r=await rpc('set_team_round_highlight',{p_real_team_id:teamId,p_player_id:playerId});
    const text=await r.text();
    if(!r.ok)throw new Error(text.replace(/^"|"$/g,''));
    alert('✅ Jugador destacat guardat.');
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
    const coachId=cps[0]?.coach_id;
    if(!coachId){ state.coachContext=[]; const tab=document.querySelector('.coach-tab'); if(tab) tab.style.display='none'; return; }

    const [ctR,roundR]=await Promise.all([
      api(`coach_teams?coach_id=eq.${coachId}&select=real_team_id`),
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
      api(`team_round_highlights?round_id=eq.${round.id}&real_team_id=in.(${idList})&select=real_team_id,player_id`),
      api(`coaches?id=eq.${coachId}&select=name,surname&limit=1`)
    ]);
    for(const r of [teamsR,resR,highR,coachR]) if(!r.ok) throw new Error(await r.text());
    const teams=await teamsR.json(), results=await resR.json(), highlights=await highR.json(), coaches=await coachR.json();
    const resultByTeam=Object.fromEntries(results.map(x=>[String(x.real_team_id),x.result]));
    const highlightByTeam=Object.fromEntries(highlights.map(x=>[String(x.real_team_id),x.player_id]));
    const teamById=Object.fromEntries(teams.map(x=>[String(x.id),x.name]));
    const coach=coaches[0];
    state.coachContext=ids.map(id=>({
      coach_name: coach ? `${coach.name||''} ${coach.surname||''}`.trim() : 'Entrenador',
      real_team_id:id,
      real_team_name:teamById[String(id)]||teamName(id),
      result:resultByTeam[String(id)]||null,
      round_number:round.round_number,
      highlighted_player_id:highlightByTeam[String(id)]||null
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
    $('connectionStatus').textContent=`Supabase · Jornada ${state.round?.round_number??'—'}`; render(); loadMarket(); loadExtras(); maybeTour();
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
    await rpc('admin_set_market',{p_closes_at:nextFriday().toISOString(),p_manual_closed:false}); await loadData(); await loadAdminData(); setAdminMessage(`Jornada ${next} creada/activada. Mercat obert fins al proper divendres a les 23:59.`);
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
  const [u,l]=await Promise.all([rpc('admin_list_users',{}), api('admin_log?select=*&order=id.desc&limit=30')]);
  state.adminUsers=u.ok?((await u.json())||[]):[]; state.adminLog=l.ok?await l.json():[];
  renderManage();
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
  ${(state.adminUsers||[]).map(u=>`<div class="mg-row" data-uid="${u.user_id}" data-adm="${u.is_admin?1:0}"><span style="flex:1 1 200px">${escapeHtml(u.username||'')} · <small>${escapeHtml(u.email||'')}</small>${u.is_admin?' 🛡️':''}</span><select class="mg-c">${coachOpts(u.coach_id)}</select><button class="primary" data-mg="role">Desar rol</button><button class="secondary" data-mg="adm">${u.is_admin?'Treure admin':'Fer admin'}</button></div>`).join('')||'<small>Sense usuaris.</small>'}
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
  else if(a==='adm'){ const fer=row.dataset.adm!=='1'; if(!confirm(fer?'Donar permisos d’administrador a aquest usuari?':'Treure els permisos d’administrador a aquest usuari?')) return; ok=await adminRpc('admin_set_admin',{p_user_id:row.dataset.uid,p_admin:fer}); msg='Permisos actualitzats.'; }
  if(ok){ setAdminMessage('✅ '+msg); await loadData(); await loadManage(); }
}
if($('adminManage')){
  $('adminManage').addEventListener('click',manageClick);
  $('adminManage').addEventListener('change',e=>{const i=e.target.closest('[data-mgphoto]'); if(i&&i.files[0]) uploadPhoto(i.dataset.mgphoto,Number(i.closest('.mg-row').dataset.id),i.files[0]);});
  $('manageSearch').addEventListener('input',renderManage);
}

/* ===== MERCAT: tancament setmanal ===== */
function nextFriday(){ const d=new Date(); d.setHours(23,59,0,0); d.setDate(d.getDate()+((5-d.getDay()+7)%7)); if(d<=new Date()) d.setDate(d.getDate()+7); return d; }
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
  if(closed){ el.className='market-banner closed'; el.innerHTML='<span class="lock">🔒</span> <b>Mercat tancat.</b> No es poden fer fitxatges, vendes ni canvis de capità fins que comenci la propera jornada. El mercat tanca cada divendres a les 23:59 perquè ningú faci moviments un cop coneguts els resultats reals.'; }
  else if(m&&m.closes_at){ const t=new Date(m.closes_at), h=(t-new Date())/36e5; el.className='market-banner'+(h<24?' soon':''); el.innerHTML=`${h<24?'⏳':'🟢'} <b>Mercat obert</b> fins al ${fmtData(t)}.<br>⏱️ El mercat es tancarà en <b id="mkCount"></b>`; tickMarket(); }
  else { el.className='market-banner'; el.innerHTML='🟢 <b>Mercat obert.</b>'; }
}
async function saveMarket(closesAt,manual,msg){ if(await adminRpc('admin_set_market',{p_closes_at:closesAt,p_manual_closed:manual})){ setAdminMessage('✅ '+msg); await loadMarket(); if(!state.market) alert('⚠️ S’ha desat, però no es pot llegir l’estat del mercat. Falta el permís de lectura a la taula market_settings (executa el SQL d’arreglament).'); else alert('✅ '+msg+(marketClosed()?' El mercat està tancat.':(state.market.closes_at?' El mercat es tancarà el '+fmtData(new Date(state.market.closes_at))+'.':''))); } }
if($('marketSave')){
  $('marketSave').onclick=()=>{ const v=$('marketCloseAt').value; saveMarket(v?new Date(v).toISOString():null,false,'Tancament desat.'); };
  $('marketCloseNow').onclick=()=>{ if(confirm('Tancar el mercat ara mateix?')) saveMarket(state.market?.closes_at||null,true,'Mercat tancat.'); };
  $('marketOpenNow').onclick=()=>{ if(confirm('Obrir el mercat fins al proper divendres a les 23:59?')) saveMarket(nextFriday().toISOString(),false,'Mercat obert.'); };
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
 {i:'⭐',t:'Com es guanyen punts',go:'rules',h:`<ul><li><b>Victòria</b> del seu equip: <b>12 punts</b> la primera, <b>13</b> la segona seguida, <b>14</b> la tercera… Cada victòria seguida suma 1 punt més: és la <b>ratxa</b> 🔥.</li><li><b>Jugador destacat</b>: <b>+5 punts</b> extra, encara que l’equip perdi. El tria l’entrenador del seu equip després del partit.</li><li><b>Entrenadors</b>: sumen punts quan el seu equip guanya, també amb bonus per ratxa.</li><li><b>Capità</b>: <b>+10 punts extra</b> a la teva classificació cada jornada en què el teu capità <b>guanya</b>.</li><li>Només compten els punts que genera cada jugador o entrenador <b>mentre és a la teva plantilla</b>.</li></ul><p>A més, el <b>valor</b> de jugadors i entrenadors canvia després de cada jornada segons els resultats.</p>`},
 {i:'🔒',t:'Normes del mercat',h:`<ul><li>Pressupost inicial: <b>120 M€</b>. Comprar té un <b>5% de comissió</b>; vendre, cap.</li><li>Màxim <b>8 jugadors</b> i <b>2 entrenadors</b>.</li><li>Només <b>1 jugador de cada equip real</b>.</li><li>Màxim <b>2 fitxatges per jornada</b> (abans dels primers resultats, els que vulguis).</li><li>El mercat <b>tanca cada divendres a les 23:59</b> i no s’obre fins que comença la jornada següent. Així ningú fitxa sabent ja els resultats. Tancat, tampoc es pot vendre ni canviar el capità.</li></ul>`},
 {i:'🏆',t:'Classificació i resultats',go:'ranking',h:`<ul><li>A <b>Classificació</b> veus tots els equips per punts. La teva fila porta l’etiqueta <span class="demo">TU</span>, i a dalt hi ha la teva posició. 🥇🥈🥉 són els tres primers.</li><li>A <b>Resultats</b> tens els resultats reals de cada jornada.</li></ul>`},
 {i:'🧑‍🏫',t:'Ets entrenador?',h:`<p>Si ets entrenador del club, registra’t amb el teu correu habitual i l’administrador vincularà el teu compte. Veuràs una pestanya <b>Entrenador</b> on, després de cada partit, pots triar el <b>jugador destacat</b> del teu equip (+5 punts).</p>`},
 {i:'🎉',t:'Tot a punt!',go:'market',h:`<p>Ja saps tot el que cal. Comença fitxant el teu equip des del <b>Mercat</b>, i recorda que tanca el divendres a les 23:59.</p><p>Pots tornar a veure aquesta guia quan vulguis amb el botó <span class="demo dark">❓ Guia</span> de dalt a la dreta, o des de la pestanya Regles.</p>`}
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
