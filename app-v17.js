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
function fixImageError(img){const ph=document.createElement('div');ph.className='photo-placeholder';ph.textContent=img.dataset.ph||'📷';img.replaceWith(ph);}
function showSection(id){ if(id==='team') playCourt();document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.section===id));document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===id));window.scrollTo({top:0,behavior:'smooth'});}
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
  const photo=p.photo_url ? `<img src="${escapeHtml(p.photo_url)}" alt="${escapeHtml(p.name)}" class="player-photo" onerror="fixImageError(this)">` : '<div class="photo-placeholder">📷</div>';
  const owned=state.rosterPlayers.some(x=>String(x.player_id)===String(p.id));
  const roster=state.rosterPlayers.find(x=>String(x.player_id)===String(p.id));
  const isCaptain=Boolean(roster?.is_captain);
  return `<article class="player-card${isCaptain?' captain-card':''}"><div class="player-visual">${photo}${isCaptain?'<span class="captain-badge">⭐ CAPITÀ</span>':''}</div><div class="player-info"><div class="player-number-line"><span class="player-number-label">DORSAL</span><strong class="player-number">#${escapeHtml(String(dorsal).replace(/\.0$/,''))}</strong></div><h3>${escapeHtml(p.name)} ${escapeHtml(p.surname||'')}</h3><span class="player-team">🏀 ${escapeHtml(teamName(p.real_team_id))}</span>${p.category?`<span class="player-category">${escapeHtml(p.category)}</span>`:''}</div><div class="player-meta"><div><small>Valor</small><b>${money(p.current_value)}</b></div><div><small>Estat</small><b>${isCaptain?'⭐ Capità':owned?'A la plantilla':'Mercat'}</b></div></div><div class="card-actions">${inTeam?`<button class="secondary" data-captain-player="${p.id}">${isCaptain?'⭐ Capità':'Fer capità'}</button><button class="secondary" data-sell-player="${p.id}">Vendre</button>`:`<button class="primary" data-buy-player="${p.id}">${owned?'Ja fitxat':`Fitxar · ${money(Number(p.current_value)*1.05)}`}</button>`}</div></article>`;
}
function coachCard(c,realTeamId,inTeam=false){
  const relation=state.coachTeams.find(r=>String(r.coach_id)===String(c.id)&&String(r.real_team_id)===String(realTeamId));
  const market=state.coachMarkets.find(r=>String(r.coach_id)===String(c.id)&&String(r.real_team_id)===String(realTeamId));
  const coachValue=Number(market?.current_value ?? c.current_value ?? 0);
  if(!relation)return '';
  const coachPhoto=(c.photo_url&&c.photo_url.includes('/storage/v1/'))?c.photo_url:`entrenador-${c.id}.jpeg`;
  const owned=state.rosterCoaches.some(x=>String(x.coach_id)===String(c.id)&&String(x.real_team_id)===String(realTeamId));
  return `<article class="player-card"><div class="player-visual"><img src="${escapeHtml(coachPhoto)}" alt="${escapeHtml(coachName(c))}" class="player-photo" data-ph="🧑‍🏫" onerror="fixImageError(this)"></div><div class="player-info"><div class="coach-label">ENTRENADOR</div><h3>${escapeHtml(coachName(c))}</h3><span class="player-team">🏀 ${escapeHtml(teamName(realTeamId))}</span></div><div class="player-meta"><div><small>Valor</small><b>${money(coachValue)}</b></div><div><small>Estat</small><b>${owned?'A la plantilla':'Mercat'}</b></div></div><div class="card-actions">${inTeam?`<button class="secondary" data-sell-coach="${c.id}" data-sell-coach-team="${realTeamId}">Vendre</button>`:`<button class="primary" data-buy-coach="${c.id}" data-buy-coach-team="${realTeamId}">${owned?'Ja fitxat':`Fitxar · ${money(coachValue*1.05)}`}</button>`}</div></article>`;
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
const COURT_SVG='<svg class="court-svg" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><text x="150" y="150" text-anchor="middle" font-size="78" font-weight="900" fill="none" stroke="#e8762c" stroke-opacity=".35" stroke-width="1.6" style="font-family:\'Barlow Condensed\',Impact,sans-serif;font-style:italic">ALELLA</text><rect x="8" y="8" width="284" height="384" rx="4"/><path d="M110 8 A40 40 0 0 0 190 8"/><rect class="key" x="100" y="240" width="100" height="152"/><circle cx="150" cy="240" r="36"/><path class="arc" d="M30 392 V330 A120 120 0 0 1 270 330 V392"/><path d="M135 380 H165"/><circle cx="150" cy="370" r="7"/></svg>';
const SLOTS=[[18,19],[50,15],[82,19],[18,45],[50,43],[82,45],[34,75],[66,75]];
function courtCard(p,isCap){
  const ph=p.photo_url?`<img src="${escapeHtml(p.photo_url)}" alt="${escapeHtml(p.name)}" data-ph="👤" onerror="fixImageError(this)">`:'<div class="photo-placeholder">👤</div>';
  return `<div class="pcard${isCap?' cap':''}">${isCap?'<span class="cap-badge">C</span>':''}${ph}<b>${escapeHtml(p.name)}</b><small>#${escapeHtml(String(p.shirt_number??'—').replace(/\.0$/,''))} · ${money(p.current_value)}</small><div class="acts"><button class="secondary" data-captain-player="${p.id}" title="Fer capità">${isCap?'⭐':'☆'}</button><button class="secondary" data-sell-player="${p.id}" title="Vendre">💸</button></div></div>`;
}
function benchCard(c,realTeamId){
  const m=state.coachMarkets.find(r=>String(r.coach_id)===String(c.id)&&String(r.real_team_id)===String(realTeamId));
  const photo=(c.photo_url&&c.photo_url.includes('/storage/v1/'))?c.photo_url:`entrenador-${c.id}.jpeg`;
  return `<div class="bench-card"><img src="${escapeHtml(photo)}" alt="${escapeHtml(coachName(c))}" data-ph="🧑‍🏫" onerror="fixImageError(this)"><div><b>${escapeHtml(coachName(c))}</b><small>🏀 ${escapeHtml(teamName(realTeamId))} · ${money(m?.current_value??c.current_value)}</small><div><button class="secondary" data-sell-coach="${c.id}" data-sell-coach-team="${realTeamId}">💸 Vendre</button></div></div></div>`;
}
function renderTeam(){
  const ps=state.rosterPlayers.map(x=>({x,p:state.players.find(p=>String(p.id)===String(x.player_id))})).filter(o=>o.p);
  const slots=SLOTS.map(([x,y],i)=>{const o=ps[i];return `<div class="slot" style="left:${x}%;top:${y}%;--i:${i}">${o?courtCard(o.p,o.x.is_captain):'<div class="slot-empty" onclick="showSection(\'market\')" title="Fitxar un jugador">+</div>'}</div>`;}).join('');
  $('teamPlayers').innerHTML=COURT_SVG+slots;
  const cs=state.rosterCoaches.map(x=>{const c=state.coaches.find(c=>String(c.id)===String(x.coach_id));return c?benchCard(c,x.real_team_id):'';}).join('');
  $('teamCoaches').innerHTML=cs+Array(Math.max(0,2-state.rosterCoaches.length)).fill('<div class="bench-card empty" onclick="showSection(\'market\')">➕ Fitxar entrenador</div>').join('');
  const captain=state.rosterPlayers.find(x=>x.is_captain);
  const cp=captain?state.players.find(p=>String(p.id)===String(captain.player_id)):null;
  $('captainName').textContent=cp?`${cp.name} ${cp.surname||''}`.trim():'pendent';
}
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
  $('clubsGrid').innerHTML=state.teams.map(t=>{const count=state.players.filter(p=>String(p.real_team_id)===String(t.id)).length;const names=state.coachTeams.filter(r=>String(r.real_team_id)===String(t.id)).map(r=>state.coaches.find(c=>String(c.id)===String(r.coach_id))).filter(Boolean).map(coachName);return `<article class="club-card"><div class="club-short">${escapeHtml(t.short_name||'')}</div><h3>${escapeHtml(t.name)}</h3><div class="club-players">🏀 ${count} jugadors</div><div class="club-coaches"><strong>Entrenadors</strong>${names.map(n=>`<span>👤 ${escapeHtml(n)}</span>`).join('')||'<span>Sense entrenadors</span>'}</div></article>`;}).join('');
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
    $('connectionStatus').textContent=`Supabase · Jornada ${state.round?.round_number??'—'}`; render(); loadMarket();
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
  ${pl.slice(0,40).map(p=>`<div class="mg-row" data-id="${p.id}"><input class="mg-n" value="${escapeHtml(p.name||'')}"><input class="mg-s" value="${escapeHtml(p.surname||'')}"><input class="mg-d" value="${escapeHtml(p.shirt_number??'')}" inputmode="numeric"><input class="mg-v" value="${escapeHtml(p.current_value??'')}" inputmode="decimal"><select class="mg-t">${teamOpts(p.real_team_id)}</select>${photo('players')}<button class="primary" data-mg="savep">Desar</button><button class="secondary danger" data-mg="delp">Retirar</button></div>`).join('')}
  ${pl.length>40?'<small>Mostrant 40. Usa el cercador per afinar.</small>':''}
  <h4>🧑‍🏫 Entrenadors (${cs.length})</h4>
  <div class="mg-row" data-form="1"><input class="mg-n" placeholder="Nom"><input class="mg-s" placeholder="Cognoms"><input class="mg-v" placeholder="Preu M€" inputmode="decimal"><select class="mg-t">${teamOpts('')}</select><button class="primary" data-mg="addc">Afegir entrenador</button></div>
  ${cs.map(c=>`<div class="mg-row" data-id="${c.id}"><input class="mg-n" value="${escapeHtml(c.name||'')}"><input class="mg-s" value="${escapeHtml(c.surname||'')}"><input class="mg-v" value="${escapeHtml(coachPrice(c))}" inputmode="decimal">${photo('coaches')}<button class="primary" data-mg="savec">Desar</button><button class="secondary danger" data-mg="delc">Retirar</button></div>`).join('')}
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

/* ===== ANIMACIONS ===== */
const reduceMotion=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
function playCourt(){ const c=$('teamPlayers'); if(!c) return; c.classList.remove('play'); void c.offsetWidth; c.classList.add('play'); setTimeout(()=>c.classList.remove('play'),1700); }
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
