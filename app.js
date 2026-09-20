// ============================================
// SUPABASE CONNECTION TEST
// ============================================

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

async function testSupabaseConnection() {
    const { data, error } = await supabaseClient
        .from('players')
        .select('id, name, position, current_value')
        .limit(5);

    if (error) {
        console.error('ERROR SUPABASE:', error);
        return;
    }

    console.log('SUPABASE CONNECTAT CORRECTAMENT');
    console.log('Jugadors:', data);
}

testSupabaseConnection();const players = [
  {id:'J001',name:'Arnau Puig',team:'Alella Blau',value:10,points:42,bonus:false},
  {id:'J002',name:'Biel Serra',team:'Alella Blau',value:12,points:55,bonus:false},
  {id:'J003',name:'Nil Casas',team:'Alella Blanc',value:9,points:38,bonus:false},
  {id:'J004',name:'Pol Ferrer',team:'Alella Blanc',value:11,points:49,bonus:false},
  {id:'J005',name:'Jan Soler',team:'Maresme',value:14,points:63,bonus:false},
  {id:'J006',name:'Pau Riera',team:'Maresme',value:8,points:31,bonus:false},
  {id:'J007',name:'Marc Vila',team:'Alella Blau',value:13,points:58,bonus:false},
  {id:'J008',name:'Èric Costa',team:'Alella Blanc',value:7,points:27,bonus:false}
];
const participants=[{name:'Roger',points:128,team:'Els Trons'},{name:'Julia',points:116,team:'Les Estrelles'},{name:'Max',points:104,team:'Els Guerrers'}];
const defaultMatches=[
 {id:'M001',home:'Alella Blau',away:'Alella Blanc',homeScore:52,awayScore:48},
 {id:'M002',home:'Maresme',away:'Alella Blau',homeScore:41,awayScore:44}
];
let roster=JSON.parse(localStorage.getItem('fantasyRoster')||'[]');
let budget=Number(localStorage.getItem('fantasyBudget')||100);
let captain=localStorage.getItem('fantasyCaptain')||'';
let matches=JSON.parse(localStorage.getItem('fantasyMatches')||'null')||defaultMatches;
let currentWeek=Number(localStorage.getItem('fantasyWeek')||1);
let adminMode=localStorage.getItem('fantasyAdmin')==='1';
const $=id=>document.getElementById(id);
const money=n=>`${Number(n).toFixed(1).replace('.',',')} M€`;
function save(){localStorage.setItem('fantasyRoster',JSON.stringify(roster));localStorage.setItem('fantasyBudget',budget);localStorage.setItem('fantasyCaptain',captain);localStorage.setItem('fantasyMatches',JSON.stringify(matches));localStorage.setItem('fantasyWeek',currentWeek);localStorage.setItem('fantasyAdmin',adminMode?'1':'0');}
function showSection(id){document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.section===id));document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===id));window.scrollTo({top:0,behavior:'smooth'});}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>showSection(t.dataset.section)));
function playerCard(p,inTeam=false){return `<article class="player-card"><div class="avatar">${p.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div><div class="player-info"><h3>${p.name}</h3><span>${p.team}</span></div><div class="player-meta"><div><small>Valor</small><b>${money(p.value)}</b></div><div><small>Punts</small><b>${p.points}</b></div></div>${p.bonus?'<div class="bonus">⭐ Bonus setmana</div>':''}<div class="card-actions">${inTeam?`<button class="secondary" data-sell="${p.id}">Vendre</button>${captain===p.id?'':`<button class="secondary" data-captain="${p.id}">Fer capità</button>`}`:`<button class="primary" data-buy="${p.id}">Fitxar · ${money(p.value)}</button>`}</div></article>`}
function render(){
 $('budget').textContent=money(budget);$('rosterCount').textContent=`${roster.length}/8`;$('playerTotal').textContent=players.length;$('teamTotal').textContent=new Set(players.map(p=>p.team)).size;$('weekLabel').textContent=`Jornada ${currentWeek}`;$('captainName').textContent=players.find(p=>p.id===captain)?.name||'pendent';
 const teams=[...new Set(players.map(p=>p.team))];$('teamFilter').innerHTML='<option value="">Tots els equips</option>'+teams.map(t=>`<option>${t}</option>`).join('');
 renderMarket();renderTeam();renderRanking();renderCoach();renderResults();renderAdmin();bindActions();
 $('adminStatus').textContent=adminMode?'Administrador actiu':'Mode jugador';
}
function renderMarket(){const q=($('search').value||'').toLowerCase();const team=$('teamFilter').value;const html=players.filter(p=>(p.name.toLowerCase().includes(q)||p.team.toLowerCase().includes(q))&&(!team||p.team===team)).map(p=>playerCard(p,false)).join('');$('marketGrid').innerHTML=html||'<div class="empty-state"><div class="empty-icon">🔎</div><h3>No hem trobat cap jugador</h3><p>Prova un altre nom o equip.</p></div>';}
function renderTeam(){if(!roster.length){$('teamGrid').innerHTML='<div class="empty-state"><div class="empty-icon">👕</div><h3>Encara no tens plantilla</h3><p>Ves al mercat per començar a construir el teu equip.</p><button class="primary" data-go="market">Anar al mercat</button></div>';return}$('teamGrid').innerHTML=roster.map(id=>playerCard(players.find(p=>p.id===id),true)).join('');}
function renderRanking(){const own={name:'Roger',points:roster.reduce((s,id)=>s+(players.find(p=>p.id===id)?.points||0),0),team:'La meva plantilla'};const rows=[...participants,own].sort((a,b)=>b.points-a.points);$('rankingBody').innerHTML=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.name}</td><td><b>${r.points}</b></td><td>${r.team}</td></tr>`).join('');}
function renderCoach(){$('coachPlayer').innerHTML=players.map(p=>`<option value="${p.id}">${p.name} · ${p.team}${p.bonus?' · ⭐':''}</option>`).join('');}
function renderResults(){
 $('resultsWeek').textContent=`Jornada ${currentWeek}`;
 $('resultsList').innerHTML=matches.length?matches.map(m=>`<div class="match"><div><b>${m.home}</b><span> vs </span><b>${m.away}</b></div><strong>${m.homeScore} - ${m.awayScore}</strong></div>`).join(''):'<div class="empty-state"><div class="empty-icon">🏀</div><h3>Encara no hi ha resultats</h3><p>L’administrador els podrà afegir des del panell.</p></div>';
}
function renderAdmin(){
 $('adminLoginCard').style.display=adminMode?'none':'block';$('adminPanel').style.display=adminMode?'block':'none';
 $('adminMatches').innerHTML=matches.map((m,i)=>`<div class="admin-match"><div class="admin-match-row"><input data-match-home="${i}" value="${m.home}"><input class="score" type="number" min="0" data-match-hs="${i}" value="${m.homeScore}"><span>–</span><input class="score" type="number" min="0" data-match-as="${i}" value="${m.awayScore}"><input data-match-away="${i}" value="${m.away}"><button class="secondary danger" data-delete-match="${i}">Eliminar</button></div></div>`).join('');
}
function bindActions(){
 document.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>buy(b.dataset.buy));document.querySelectorAll('[data-sell]').forEach(b=>b.onclick=()=>sell(b.dataset.sell));document.querySelectorAll('[data-captain]').forEach(b=>b.onclick=()=>{captain=b.dataset.captain;save();render()});document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>showSection(b.dataset.go));
 $('bonusBtn').onclick=applyBonus;$('search').oninput=renderMarket;$('teamFilter').onchange=renderMarket;
 document.querySelectorAll('[data-delete-match]').forEach(b=>b.onclick=()=>{matches.splice(Number(b.dataset.deleteMatch),1);save();render()});
 document.querySelectorAll('[data-match-home]').forEach(i=>i.onchange=()=>{matches[Number(i.dataset.matchHome)].home=i.value;save()});
 document.querySelectorAll('[data-match-away]').forEach(i=>i.onchange=()=>{matches[Number(i.dataset.matchAway)].away=i.value;save()});
 document.querySelectorAll('[data-match-hs]').forEach(i=>i.onchange=()=>{matches[Number(i.dataset.matchHs)].homeScore=Number(i.value)||0;save()});
 document.querySelectorAll('[data-match-as]').forEach(i=>i.onchange=()=>{matches[Number(i.dataset.matchAs)].awayScore=Number(i.value)||0;save()});
}
function buy(id){const p=players.find(x=>x.id===id);if(roster.includes(id))return alert('Aquest jugador ja forma part de la plantilla.');if(roster.length>=8)return alert('La plantilla ja té 8 jugadors.');const same=roster.filter(x=>players.find(p=>p.id===x).team===p.team).length;if(same>=2)return alert('No pots tenir més de 2 jugadors del mateix equip.');if(budget<p.value)return alert('No tens prou pressupost.');roster.push(id);budget-=p.value;save();render();showSection('team');}
function sell(id){const p=players.find(x=>x.id===id);roster=roster.filter(x=>x!==id);budget+=p.value;if(captain===id)captain='';save();render();}
function applyBonus(){const p=players.find(p=>p.id===$('coachPlayer').value);if(p.bonus){$('coachMessage').innerHTML='⚠️ Aquest jugador ja ha rebut el bonus de prova.';return}p.bonus=true;p.points+=10;p.value+=0.5;$('coachMessage').innerHTML=`✅ <b>${p.name}</b> ha rebut el bonus: +10 punts i +0,5 M€.`;render();}
function loginAdmin(){if($('adminPin').value==='1234'){adminMode=true;save();render();}else $('adminLoginMessage').textContent='PIN incorrecte. En aquesta demo el PIN és 1234.';}
function logoutAdmin(){adminMode=false;save();render();showSection('home');}
function addMatch(){matches.push({id:'M'+Date.now(),home:'Equip local',away:'Equip visitant',homeScore:0,awayScore:0});save();render();showSection('admin');}
function nextWeek(){currentWeek++;matches=[];save();render();}
$('adminLoginBtn').onclick=loginAdmin;$('adminLogoutBtn').onclick=logoutAdmin;$('addMatchBtn').onclick=addMatch;$('nextWeekBtn').onclick=nextWeek;
render();
