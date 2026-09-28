// ============================================
// 1. CONFIGURACIÓ I CONNEXIÓ SUPABASE
// ============================================
const SUPABASE_URL = 'LA_TEVA_SUPABASE_URL'; // Canvia-ho per la teva URL si en fas servir
const SUPABASE_ANON_KEY = 'LA_TEVA_SUPABASE_KEY'; // Canvia-ho per la teva clau

let supabaseClient = null;
if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function testSupabaseConnection() {
  if (!supabaseClient) return;
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

testSupabaseConnection();

// ============================================
// 2. DADES I ESTAT INICIAL
// ============================================
const players = [
  { id: 'J001', name: 'Arnau Puig', team: 'Alella Blau', value: 10, points: 42, bonus: false },
  { id: 'J002', name: 'Biel Serra', team: 'Alella Blau', value: 12, points: 55, bonus: false },
  { id: 'J003', name: 'Nil Casas', team: 'Alella Blanc', value: 9, points: 38, bonus: false },
  { id: 'J004', name: 'Pol Ferrer', team: 'Alella Blanc', value: 11, points: 49, bonus: false },
  { id: 'J005', name: 'Jan Soler', team: 'Maresme', value: 14, points: 63, bonus: false },
  { id: 'J006', name: 'Pau Riera', team: 'Maresme', value: 8, points: 31, bonus: false },
  { id: 'J007', name: 'Marc Vila', team: 'Alella Blau', value: 13, points: 58, bonus: false },
  { id: 'J008', name: 'Èric Costa', team: 'Alella Blanc', value: 7, points: 27, bonus: false }
];

const participants = [
  { name: 'Roger', points: 128, team: 'Els Trons' },
  { name: 'Julia', points: 116, team: 'Les Estrelles' },
  { name: 'Max', points: 104, team: 'Els Guerrers' }
];

const defaultMatches = [
  { id: 'M001', home: 'Alella Blau', away: 'Alella Blanc', homeScore: 52, awayScore: 48 },
  { id: 'M002', home: 'Maresme', away: 'Alella Blau', homeScore: 41, awayScore: 44 }
];

let roster = JSON.parse(localStorage.getItem('fantasyRoster') || '[]');
let budget = Number(localStorage.getItem('fantasyBudget') || 120);
let captain = localStorage.getItem('fantasyCaptain') || '';
let matches = JSON.parse(localStorage.getItem('fantasyMatches') || 'null') || defaultMatches;
let currentWeek = Number(localStorage.getItem('fantasyWeek') || 1);
let adminMode = localStorage.getItem('fantasyAdmin') === '1';

const $ = id => document.getElementById(id);
const money = n => `${Number(n).toFixed(1).replace('.', ',')} M€`;

function save() {
  localStorage.setItem('fantasyRoster', JSON.stringify(roster));
  localStorage.setItem('fantasyBudget', budget);
  localStorage.setItem('fantasyCaptain', captain);
  localStorage.setItem('fantasyMatches', JSON.stringify(matches));
  localStorage.setItem('fantasyWeek', currentWeek);
  localStorage.setItem('fantasyAdmin', adminMode ? '1' : '0');
}

// ============================================
// 3. NAVEGACIÓ
// ============================================
function showSection(id) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.section === id));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showSection(t.dataset.section)));

// ============================================
// 4. RENDERITZAT I FILTRES
// ============================================
function playerCard(p, inTeam = false) {
  if (!p) return '';
  const initials = p.name ? p.name.split(' ').map(x => x[0]).join('').slice(0, 2) : '??';
  
  return `
    <article class="player-card">
      <div class="avatar">${initials}</div>
      <div class="player-info">
        <h3>${p.name}</h3>
        <span>${p.team || p.club_team || 'Sense equip'}</span>
      </div>
      <div class="player-meta">
        <div><small>Valor</small><b>${money(p.value || p.price || 0)}</b></div>
        <div><small>Punts</small><b>${p.points || 0}</b></div>
      </div>
      ${p.bonus ? '<div class="bonus">⭐ Bonus setmana</div>' : ''}
      <div class="card-actions">
        ${inTeam ? `
          <button type="button" class="secondary" data-sell="${p.id}">Vendre</button>
          ${captain === p.id ? '' : `<button type="button" class="secondary" data-captain="${p.id}">Fer capità</button>`}
        ` : `
          <button type="button" class="primary" data-buy="${p.id}" data-buy-player="${p.id}">Fitxar · ${money(p.value || p.price || 0)}</button>
        `}
      </div>
    </article>
  `;
}

function render() {
  if ($('budget'))$('budget').textContent = money(budget);
  if ($('rosterCount'))$('rosterCount').textContent = `${roster.length}/8`;
  if ($('playerTotal'))$('playerTotal').textContent = players.length;
  if ($('teamTotal'))$('teamTotal').textContent = new Set(players.map(p => p.team)).size;
  if ($('weekLabel'))$('weekLabel').textContent = `Jornada ${currentWeek}`;
  if ($('captainName'))$('captainName').textContent = players.find(p => p.id === captain)?.name || 'pendent';

  const teams = [...new Set(players.map(p => p.team || p.club_team).filter(Boolean))];
  const filterEl = $('teamFilter') \vert{}\vert{}$('select-filtre-equip');
  if (filterEl && filterEl.children.length <= 1) {
    filterEl.innerHTML = '<option value="">Tots els equips</option>' + teams.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  renderMarket();
  renderTeam();
  renderRanking();
  renderCoach();
  renderResults();
  renderAdmin();
  if ($('adminStatus'))$('adminStatus').textContent = adminMode ? 'Administrador actiu' : 'Mode jugador';
}

function renderMarket() {
  const searchEl = $('search');
  const filterEl = $('teamFilter') \vert{}\vert{}$('select-filtre-equip');
  const q = searchEl ? searchEl.value.toLowerCase().trim() : '';
  const team = filterEl ? filterEl.value : '';

  const filtered = players.filter(p => {
    const pTeam = p.team || p.club_team || '';
    const nameMatch = p.name.toLowerCase().includes(q) || pTeam.toLowerCase().includes(q);
    const teamMatch = !team || team === 'tots' || pTeam === team;
    return nameMatch && teamMatch;
  });

  const html = filtered.map(p => playerCard(p, false)).join('');
  const marketGrid = $('marketGrid') \vert{}\vert{}$('mercat-container');
  if (marketGrid) {
    marketGrid.innerHTML = html || `
      <div class="empty-state">
        <div class="empty-icon">🔎</div>
        <h3>No hem trobat cap jugador</h3>
        <p>Prova un altre nom o equip.</p>
      </div>`;
  }
}

function renderTeam() {
  const grid = $('teamGrid');
  if (!grid) return;
  if (!roster.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👕</div>
        <h3>Encara no tens plantilla</h3>
        <p>Ves al mercat per començar a construir el teu equip.</p>
        <button type="button" class="primary" data-go="market">Anar al mercat</button>
      </div>`;
    return;
  }
  grid.innerHTML = roster.map(id => playerCard(players.find(p => p.id === id), true)).join('');
}

function renderRanking() {
  const body = $('rankingBody');
  if (!body) return;
  const own = { name: 'Roger', points: roster.reduce((s, id) => s + (players.find(p => p.id === id)?.points || 0), 0), team: 'La meva plantilla' };
  const rows = [...participants, own].sort((a, b) => b.points - a.points);
  body.innerHTML = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.name}</td><td><b>${r.points}</b></td><td>${r.team}</td></tr>`).join('');
}

function renderCoach() {
  const select = $('coachPlayer');
  if (!select) return;
  select.innerHTML = players.map(p => `<option value="${p.id}">${p.name} · ${p.team || p.club_team}${p.bonus ? ' · ⭐' : ''}</option>`).join('');
}

function renderResults() {
  if ($('resultsWeek'))$('resultsWeek').textContent = `Jornada ${currentWeek}`;
  const list = $('resultsList');
  if (!list) return;
  list.innerHTML = matches.length ? matches.map(m => `
    <div class="match">
      <div><b>${m.home}</b><span> vs </span><b>${m.away}</b></div>
      <strong>${m.homeScore} - ${m.awayScore}</strong>
    </div>`).join('') : `
    <div class="empty-state">
      <div class="empty-icon">🏀</div>
      <h3>Encara no hi ha resultats</h3>
      <p>L’administrador els podrà afegir des del panell.</p>
    </div>`;
}

function renderAdmin() {
  if ($('adminLoginCard'))$('adminLoginCard').style.display = adminMode ? 'none' : 'block';
  if ($('adminPanel'))$('adminPanel').style.display = adminMode ? 'block' : 'none';
  const container = $('adminMatches');
  if (!container) return;
  container.innerHTML = matches.map((m, i) => `
    <div class="admin-match">
      <div class="admin-match-row">
        <input data-match-home="${i}" value="${m.home}">
        <input class="score" type="number" min="0" data-match-hs="${i}" value="${m.homeScore}">
        <span>–</span>
        <input class="score" type="number" min="0" data-match-as="${i}" value="${m.awayScore}">
        <input data-match-away="${i}" value="${m.away}">
        <button type="button" class="secondary danger" data-delete-match="${i}">Eliminar</button>
      </div>
    </div>`).join('');
}

// ============================================
// 5. DELEGACIÓ GLOBAL D'ESDEVENIMENTS (SOLUCIÓ DELS FILTRES)
// ============================================

// Escolta global per als camps de cerca i filtre
if ($('search'))$('search').addEventListener('input', renderMarket);
if ($('teamFilter'))$('teamFilter').addEventListener('change', renderMarket);
if ($('select-filtre-equip'))$('select-filtre-equip').addEventListener('change', renderMarket);

// Delegació de clics: Funciona SEMPRE, fins i tot després de filtrar o re-renderitzar l'HTML!
document.addEventListener('click', async (e) => {
  const target = e.target.closest('button, [data-buy], [data-buy-player], [data-sell], [data-captain], [data-go], [data-delete-match]');
  if (!target) return;

  // Acció de Fitxar
  const buyId = target.dataset.buy || target.dataset.buyPlayer || target.getAttribute('data-buy-player');
  if (buyId) {
    buy(buyId);
    return;
  }

  // Acció de Vendre
  if (target.dataset.sell) {
    sell(target.dataset.sell);
    return;
  }

  // Fer Capità
  if (target.dataset.captain) {
    captain = target.dataset.captain;
    save();
    render();
    return;
  }

  // Canvi de pestanya
  if (target.dataset.go) {
    showSection(target.dataset.go);
    return;
  }

  // Eliminar partit des del panell d'Admin
  if (target.dataset.deleteMatch !== undefined) {
    const idx = Number(target.dataset.deleteMatch);
    matches.splice(idx, 1);
    save();
    render();
    return;
  }
});

// Escolta de canvis als camps editable d'administració
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.matchHome !== undefined) { matches[Number(t.dataset.matchHome)].home = t.value; save(); }
  if (t.dataset.matchAway !== undefined) { matches[Number(t.dataset.matchAway)].away = t.value; save(); }
  if (t.dataset.matchHs !== undefined) { matches[Number(t.dataset.matchHs)].homeScore = Number(t.value) || 0; save(); }
  if (t.dataset.matchAs !== undefined) { matches[Number(t.dataset.matchAs)].awayScore = Number(t.value) || 0; save(); }
});

// ============================================
// 6. LÒGICA DE NEGOCI (FITXAR, VENDRE, ADMIN)
// ============================================
function buy(id) {
  const p = players.find(x => x.id === id);
  if (!p) return alert('Jugador no trobat.');
  if (roster.includes(id)) return alert('Aquest jugador ja forma part de la plantilla.');
  if (roster.length >= 8) return alert('La plantilla ja té 8 jugadors.');

  const pTeam = p.team || p.club_team;
  const sameTeamCount = roster.filter(x => {
    const rPlayer = players.find(player => player.id === x);
    return (rPlayer?.team || rPlayer?.club_team) === pTeam;
  }).length;

  if (sameTeamCount >= 2) return alert('No pots tenir més de 2 jugadors del mateix equip.');

  const price = p.value || p.price || 0;
  if (budget < price) return alert('No tens prou pressupost.');

  roster.push(id);
  budget -= price;
  save();
  render();
  showSection('team');
}

function sell(id) {
  const p = players.find(x => x.id === id);
  if (!p) return;
  roster = roster.filter(x => x !== id);
  budget += (p.value || p.price || 0);
  if (captain === id) captain = '';
  save();
  render();
}

function applyBonus() {
  const select = $('coachPlayer');
  if (!select) return;
  const p = players.find(player => player.id === select.value);
  if (!p) return;

  if (p.bonus) {
    if ($('coachMessage'))$('coachMessage').innerHTML = '⚠️ Aquest jugador ja ha rebut el bonus de prova.';
    return;
  }
  p.bonus = true;
  p.points += 10;
  p.value += 0.5;
  if ($('coachMessage'))$('coachMessage').innerHTML = `✅ <b>${p.name}</b> ha rebut el bonus: +10 punts i +0,5 M€.`;
  render();
}

function loginAdmin() {
  if ($('adminPin') &&$('adminPin').value === '1234') {
    adminMode = true;
    save();
    render();
  } else if ($('adminLoginMessage')) {$('adminLoginMessage').textContent = 'PIN incorrecte. En aquesta demo el PIN és 1234.';
  }
}

function logoutAdmin() {
  adminMode = false;
  save();
  render();
  showSection('home');
}

function addMatch() {
  matches.push({ id: 'M' + Date.now(), home: 'Equip local', away: 'Equip visitant', homeScore: 0, awayScore: 0 });
  save();
  render();
  showSection('admin');
}

function nextWeek() {
  currentWeek++;
  matches = [];
  save();
  render();
}

// Inicialització de botons d'administració
if ($('adminLoginBtn'))$('adminLoginBtn').onclick = loginAdmin;
if ($('adminLogoutBtn'))$('adminLogoutBtn').onclick = logoutAdmin;
if ($('addMatchBtn'))$('addMatchBtn').onclick = addMatch;
if ($('nextWeekBtn'))$('nextWeekBtn').onclick = nextWeek;
if ($('bonusBtn'))$('bonusBtn').onclick = applyBonus;

// Renderitzat inicial
render();
