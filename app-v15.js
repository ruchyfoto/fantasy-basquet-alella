const $ = id => document.getElementById(id);
const money = n => `${Number(n || 0).toFixed(2).replace('.', ',')} M€`;

const state = {
  teamId: null,
  team: null,
  round: null,
  players: [], teams: [], coaches: [], coachTeams: [],
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
function showSection(id){document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.section===id));document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===id));window.scrollTo({top:0,behavior:'smooth'});}
function setAuthMessage(msg, ok=false){ $('authMessage').textContent=msg||''; $('authMessage').className=ok?'auth-message ok':'auth-message'; }
function setAdminMessage(msg){ $('adminMessage').textContent=msg||''; }

async function authRequest(path, body){
  const r=await fetch(`${SUPABASE_URL}/auth/v1/${path}`,{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error_description || data.msg || data.message || 'No s’ha pogut completar l’operació.');
  return data;
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
  const photo=p.photo_url ? `<img src="${escapeHtml(p.photo_url)}" alt="${escapeHtml(p.name)}" class="player-photo">` : '<div class="photo-placeholder">📷</div>';
  const owned=state.rosterPlayers.some(x=>String(x.player_id)===String(p.id));
  const roster=state.rosterPlayers.find(x=>String(x.player_id)===String(p.id));
  const isCaptain=Boolean(roster?.is_captain);
  return `<article class="player-card${isCaptain?' captain-card':''}"><div class="player-visual">${photo}${isCaptain?'<span class="captain-badge">⭐ CAPITÀ</span>':''}</div><div class="player-info"><div class="player-number-line"><span class="player-number-label">DORSAL</span><strong class="player-number">#${escapeHtml(String(dorsal).replace(/\.0$/,''))}</strong></div><h3>${escapeHtml(p.name)} ${escapeHtml(p.surname||'')}</h3><span class="player-team">🏀 ${escapeHtml(teamName(p.real_team_id))}</span>${p.category?`<span class="player-category">${escapeHtml(p.category)}</span>`:''}</div><div class="player-meta"><div><small>Valor</small><b>${money(p.current_value)}</b></div><div><small>Estat</small><b>${isCaptain?'⭐ Capità':owned?'A la plantilla':'Mercat'}</b></div></div><div class="card-actions">${inTeam?`<button class="secondary" data-captain-player="${p.id}">${isCaptain?'⭐ Capità':'Fer capità'}</button><button class="secondary" data-sell-player="${p.id}">Vendre</button>`:`<button class="primary" data-buy-player="${p.id}">${owned?'Ja fitxat':`Fitxar · ${money(Number(p.current_value)*1.05)}`}</button>`}</div></article>`;
}
function coachCard(c,realTeamId,inTeam=false){
  const relation=state.coachTeams.find(r=>String(r.coach_id)===String(c.id)&&String(r.real_team_id)===String(realTeamId));
  if(!relation)return '';
  const owned=state.rosterCoaches.some(x=>String(x.coach_id)===String(c.id)&&String(x.real_team_id)===String(realTeamId));
  return `<article class="player-card"><div class="player-visual"><div class="photo-placeholder">🧑‍🏫</div></div><div class="player-info"><div class="coach-label">ENTRENADOR</div><h3>${escapeHtml(coachName(c))}</h3><span class="player-team">🏀 ${escapeHtml(teamName(realTeamId))}</span></div><div class="player-meta"><div><small>Valor</small><b>${money(c.current_value)}</b></div><div><small>Estat</small><b>${owned?'A la plantilla':'Mercat'}</b></div></div><div class="card-actions">${inTeam?`<button class="secondary" data-sell-coach="${c.id}" data-sell-coach-team="${realTeamId}">Vendre</button>`:`<button class="primary" data-buy-coach="${c.id}" data-buy-coach-team="${realTeamId}">${owned?'Ja fitxat':`Fitxar · ${money(Number(c.current_value)*1.05)}`}</button>`}</div></article>`;
}

function render(){
  const teamBudget=state.team?.budget ?? 0;
  $('budget').textContent=money(teamBudget);
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
function renderTeam(){
  $('teamPlayers').innerHTML=state.rosterPlayers.length ? state.rosterPlayers.map(x=>state.players.find(p=>String(p.id)===String(x.player_id))).filter(Boolean).map(p=>playerCard(p,true)).join('') : '<div class="empty-state"><div class="empty-icon">👕</div><h3>Encara no tens jugadors</h3><p>Ves al mercat per començar.</p></div>';
  $('teamCoaches').innerHTML=state.rosterCoaches.length ? state.rosterCoaches.map(x=>{const c=state.coaches.find(c=>String(c.id)===String(x.coach_id));return c?coachCard(c,x.real_team_id,true):''}).join('') : '<div class="empty-state"><div class="empty-icon">🧑‍🏫</div><h3>Encara no tens entrenadors</h3><p>Ves al mercat d’entrenadors.</p></div>';
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
    box.innerHTML=rows.length?rows.map((x,i)=>`<div class="ranking-row"><span class="ranking-pos">${i+1}</span><div class="ranking-name"><b>${escapeHtml(x.team_name||'Equip Fantasy')}</b><small>${money(x.budget)} disponibles</small></div><strong>${Number(x.total_points||0).toFixed(1).replace('.',',')} pts</strong></div>`).join(''):'<div class="empty-state"><h3>Encara no hi ha equips classificats</h3></div>';
  }catch(e){box.innerHTML=`<div class="empty-state">No s'ha pogut carregar la classificació.<br><small>${escapeHtml(e.message)}</small></div>`;}
}
function renderCoachPanel(){
  const section=$('coachPanel');
  if(!section)return;
  if(!state.coachContext.length){
    section.style.display='none';
    return;
  }
  section.style.display='block';
  $('coachPanelSubtitle').textContent=`Hola ${state.coachContext[0].coach_name}. Selecciona el jugador destacat de cada equip després que s’hagi registrat el resultat.`;
  $('coachPanelGrid').innerHTML=state.coachContext.map(ctx=>{
    const players=state.players.filter(p=>String(p.real_team_id)===String(ctx.real_team_id));
    const selected=ctx.highlighted_player_id;
    return `<article class="coach-team-panel card">
      <div class="coach-team-header"><div><span class="coach-label">EQUIP</span><h3>${escapeHtml(ctx.real_team_name)}</h3><p>${ctx.result==='win'?'🟢 Victòria':ctx.result==='loss'?'🔴 Derrota':'⏳ Resultat pendent'} · Jornada ${ctx.round_number}</p></div><div class="pill">${selected?'⭐ Destacat seleccionat':'Sense destacat'}</div></div>
      ${ctx.result ? `<div class="coach-player-list">${players.map(p=>{
        const isSelected=String(p.id)===String(selected);
        return `<button class="coach-player-option${isSelected?' selected':''}" data-highlight-player="${p.id}" data-highlight-team="${ctx.real_team_id}"><span class="coach-player-main"><b>#${escapeHtml(String(p.shirt_number ?? '—').replace(/\\.0$/,''))}</b><span>${escapeHtml(p.name)} ${escapeHtml(p.surname||'')}</span></span><span>${isSelected?'⭐ Destacat':'Seleccionar'}</span></button>`;
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
async function buyCoach(id,teamId){const c=state.coaches.find(x=>Number(x.id)===id);if(!c)return;if(!confirm(`Fitxar ${coachName(c)} · ${teamName(teamId)} per ${money(Number(c.current_value)*1.05)}?`))return;await runRpc('buy_fantasy_asset',{p_fantasy_team_id:state.teamId,p_player_id:null,p_coach_id:id,p_coach_real_team_id:teamId,p_round_id:state.round?.id||null},'Entrenador fitxat correctament.');}
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
    const r=await rpc('get_my_coach_context',{});
    const text=await r.text();
    if(!r.ok)throw new Error(text.replace(/^"|"$/g,''));
    state.coachContext=JSON.parse(text||'[]');
    const tab=document.querySelector('.coach-tab'); if(tab) tab.style.display=state.coachContext.length?'inline-flex':'none';
  }catch(e){
    console.error('Coach context:',e);
    state.coachContext=[];
    const tab=document.querySelector('.coach-tab'); if(tab) tab.style.display='none';
  }
}

async function runRpc(name,body,success){try{const r=await rpc(name,body);const text=await r.text();if(!r.ok)throw new Error(text.replace(/^"|"$/g,''));alert(`✅ ${success}`);await loadData();showSection('team');}catch(e){console.error(e);alert(`⚠️ ${e.message}`);}}

async function loadData(){
  try{
    const [roundsR,teamsR,playersR,coachesR,coachTeamsR,teamR,ftpR,ftcR]=await Promise.all([
      api('fantasy_rounds?is_active=eq.true&select=*&order=round_number.desc&limit=1'),
      api('real_teams?select=*&order=id'), api('players?is_active=eq.true&select=*'), api('coaches?is_active=eq.true&select=*'), api('coach_teams?select=*'),
      api(`fantasy_teams?id=eq.${state.teamId}&select=*`), api(`fantasy_team_players?fantasy_team_id=eq.${state.teamId}&select=*`), api(`fantasy_team_coaches?fantasy_team_id=eq.${state.teamId}&select=*`)
    ]);
    for(const [r,label] of [[roundsR,'jornada'],[teamsR,'equips'],[playersR,'jugadors'],[coachesR,'entrenadors'],[coachTeamsR,'relacions'],[teamR,'equip Fantasy'],[ftpR,'plantilla'],[ftcR,'entrenadors Fantasy']])if(!r.ok)throw new Error(`${label}: ${await r.text()}`);
    state.round=(await roundsR.json())[0]||null; state.teams=await teamsR.json(); state.players=await playersR.json(); state.coaches=await coachesR.json(); state.coachTeams=await coachTeamsR.json(); state.team=(await teamR.json())[0]||null; state.rosterPlayers=await ftpR.json(); state.rosterCoaches=await ftcR.json();
    await loadCoachContext();
    if(!state.team) throw new Error('No s’ha trobat l’equip Fantasy de l’usuari.');
    $('teamFilter').innerHTML='<option value="">Tots els equips</option>'+state.teams.map(t=>`<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('');
    $('connectionStatus').textContent=`Supabase · Jornada ${state.round?.round_number??'—'}`; render();
  }catch(e){console.error(e);$('connectionStatus').textContent='Error de connexió';$('homeStatus').innerHTML=`⚠️ <b>No s'han pogut carregar les dades.</b><br><small>${escapeHtml(e.message)}</small>`;}
}

async function adminReset(){
  if($('adminPinInput').value!=='1234') return setAdminMessage('PIN incorrecte.');
  state.admin=true; $('adminPinCard').style.display='none'; $('adminPanel').style.display='block'; setAdminMessage('Administrador actiu.');
  await loadAdminData();
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
    await loadData(); await loadAdminData(); setAdminMessage('Jornada processada correctament.');
  }catch(e){setAdminMessage(`Error: ${e.message}`);}
}

async function createNextRound(){
  const next=(state.round?.round_number||0)+1;
  try{
    const r=await rpc('admin_create_round',{p_pin:'1234',p_round_number:next}); const text=await r.text(); if(!r.ok)throw new Error(text.replace(/^"|"$/g,''));
    await loadData(); await loadAdminData(); setAdminMessage(`Jornada ${next} creada/activada.`);
  }catch(e){setAdminMessage(`Error: ${e.message}`);}
}
async function resetRounds(){
  if(!confirm('Això eliminarà resultats, històrics i transferències de prova, buidarà les plantilles i tornarà els equips a 120 M€. Continuar?'))return;
  try{
    const r=await rpc('admin_reset_rounds',{p_pin:'1234'}); const text=await r.text(); if(!r.ok)throw new Error(text.replace(/^"|"$/g,''));
    await loadData(); await loadAdminData(); setAdminMessage('Reset completat. Jornada 1 activa i dades de prova netes.');
  }catch(e){setAdminMessage(`No s’ha pogut fer el reset: ${e.message}`);}
}
function openAdmin(){showSection('admin');$('adminPinCard').style.display=state.admin?'none':'block';$('adminPanel').style.display=state.admin?'block':'none';}

function init(){
  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>showSection(t.dataset.section)));
  document.querySelectorAll('.market-tab').forEach(t=>t.addEventListener('click',()=>{state.marketType=t.dataset.market;document.querySelectorAll('.market-tab').forEach(x=>x.classList.toggle('active',x===t));$('search').value='';renderMarket();}));
  $('search').addEventListener('input',renderMarket); $('teamFilter').addEventListener('change',renderMarket);
  $('loginBtn').onclick=login; $('signupBtn').onclick=signup; $('logoutBtn').onclick=logout;
  $('adminUnlock').onclick=adminReset; $('adminSaveResults').onclick=saveAdminResults; $('adminProcessRound').onclick=processCurrentRound; $('adminNewRound').onclick=createNextRound; $('adminResetRounds').onclick=resetRounds;
  let clicks=0, timer=null; $('logoSecret').addEventListener('click',()=>{clicks++;clearTimeout(timer);timer=setTimeout(()=>clicks=0,1200);if(clicks>=5){clicks=0;openAdmin();}});
  const saved=localStorage.getItem('fantasySession');
  if(saved){try{state.session=JSON.parse(saved);state.username=state.session?.user?.user_metadata?.username||state.session?.user?.email?.split('@')[0]||'';ensureFantasyTeam();}catch{showAuth();}} else showAuth();
}
init();
