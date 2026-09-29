// ============================================
// FANTASY APP - FITXER COMPLET I NET (app.js)
// ============================================

// 1. VARIABLES D'ESTAT I JUGADORS INICIALS
let players = [
  { id: 'J001', name: 'Arnau Puig', team: 'Alella Blau', value: 10, points: 42, bonus: false, position: 'Jugador' },
  { id: 'J002', name: 'Biel Serra', team: 'Alella Blau', value: 12, points: 55, bonus: false, position: 'Jugador' },
  { id: 'J003', name: 'Nil Casas', team: 'Alella Blanc', value: 9, points: 38, bonus: false, position: 'Jugador' },
  { id: 'J004', name: 'Pol Ferrer', team: 'Alella Blanc', value: 11, points: 49, bonus: false, position: 'Jugador' },
  { id: 'J005', name: 'Jan Soler', team: 'Maresme', value: 14, points: 63, bonus: false, position: 'Jugador' },
  { id: 'J006', name: 'Pau Riera', team: 'Maresme', value: 8, points: 31, bonus: false, position: 'Jugador' },
  { id: 'J007', name: 'Marc Vila', team: 'Alella Blau', value: 13, points: 58, bonus: false, position: 'Jugador' },
  { id: 'J008', name: 'Èric Costa', team: 'Alella Blanc', value: 7, points: 27, bonus: false, position: 'Jugador' }
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

// 2. MOSTRAR SECCIONS
function showSection(id) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.section === id));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 3. TARGETA DE JUGADOR (COMPATIBLE AMB TOTS ELS ATRIBUTS)
function playerCard(p, inTeam = false) {
  if (!p) return '';
  const pId = String(p.id);
  const initials = p.name ? p.name.split(' ').map(x => x[0]).join('').slice(0, 2) : '??';
  const val = p.value || p.price || p.current_value || 0;
  const pTeam = p.team || p.club_team || 'Sense equip';

  return `
    <article class="player-card">
      <div class="avatar">${initials}</div>
      <div class="player-info">
        <h3>${p.name}</h3>
        <span>${pTeam}</span>
      </div>
      <div class="player-meta">
        <div><small>Valor</small><b>${money(val)}</b></div>
        <div><small>Punts</small><b>${p.points || 0}</b></div>
      </div>
      ${p.bonus ? '<div class="bonus">⭐ Bonus setmana</div>' : ''}
      <div class="card-actions">
        ${inTeam ? `
          <button type="button" class="secondary" data-sell="${pId}">Vendre</button>
          ${String(captain) === pId ? '' : `<button type="button" class="secondary" data-captain="${pId}">Fer capità</button>`}
        ` : `
          <button type="button" class="primary" data-buy="${pId}" data-buy-player="${pId}">Fitxar · ${money(val)}</button>
        `}
      </div>
    </article>
  `;
}

// 4. RENDERITZAT GENERAL
function render() {
  if ($('budget'))$('budget').textContent = money(budget);
  if ($('rosterCount'))$('rosterCount').textContent = `${roster.length}/8`;
  if ($('playerTotal'))$('playerTotal').textContent = players.length;
  if ($('teamTotal'))$('teamTotal').textContent = new Set(players.map(p => p.team || p.club_team)).size;
  if ($('weekLabel'))$('weekLabel').textContent = `Jornada ${currentWeek}`;
  if ($('captainName'))$('captainName').textContent = players.find(p => String(p.id) === String(captain))?.name || 'pendent';

  // Poblar desplegable d'equips si no s'ha fet
  const teams = [...new Set(players.map(p => p.team || p.club_team).filter(Boolean))];
  ['teamFilter', 'select-filtre-equip'].forEach(filterId => {
    const el = $(filterId);
    if (el && el.children.length <= 1) {
      el.innerHTML = '<option value="">Tots els equips</option>' + teams.map(t => `<option value="${t}">${t}</option>`).join('');
    }
  });

  renderMarket();
  renderTeam();
  renderRanking();
  renderCoach();
  renderResults();
  renderAdmin();
  if ($('adminStatus'))$('adminStatus').textContent = adminMode ? 'Administrador actiu' : 'Mode jugador';
}

// 5. MERCAT AMB FILTRES MULTICRITERI (EQUIP, ENTRENADOR/POSICIÓ I CERCA)
function renderMarket() {
  const searchEl = $('search');
  const teamEl = $('teamFilter') \vert{}\vert{}$('select-filtre-equip');
  const posEl = $('positionFilter') || $('select-filtre-posicio') \vert{}\vert{}$('roleFilter');

  const q = searchEl ? searchEl.value.toLowerCase().trim() : '';
  const team = teamEl ? teamEl.value : '';
  const pos = posEl ? posEl.value : '';

  const filtered = players.filter(p => {
    const pTeam = p.team || p.club_team || '';
    const pPos = p.position || p.role || '';

    const nameMatch = !q || p.name.toLowerCase().includes(q) || pTeam.toLowerCase().includes(q);
    const teamMatch = !team || team === 'tots' || pTeam === team;
    const posMatch = !pos || pos === 'tots' || pPos.toLowerCase() === pos.toLowerCase();

    return nameMatch && teamMatch && posMatch;
  });

  const html = filtered.map(p => playerCard(p, false)).join('');
  const grid = $('marketGrid') \vert{}\vert{}$('mercat-container');
  if (grid) {
    grid.innerHTML = html || `
      <div class="empty-state">
        <div class="empty-icon">🔎</div>
        <h3>No hem trobat cap jugador</h3>
        <p>Prova un altre nom, equip o filtre.</p>
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
  grid.innerHTML = roster.map(id => playerCard(players.find(p => String(p.id) === String(id)), true)).join('');
}

function renderRanking() {
  const body = $('rankingBody');
  if (!body) return;
  const own = { name: 'Roger', points: roster.reduce((s, id) => s + (players.find(p => String(p.id) === String(id))?.points || 0), 0), team: 'La meva plantilla' };
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

// 6. OPERACIONS (FITXAR I VENDRE AMB CONVERSIÓ DE TIPUS)
function buy(id) {
  const p = players.find(x => String(x.id) === String(id));
  if (!p) return alert("No s'ha trobat la informació d'aquest jugador.");

  const pIdStr = String(p.id);
  if (roster.some(rId => String(rId) === pIdStr)) return alert('Aquest jugador ja forma part de la plantilla.');
  if (roster.length >= 8) return alert('La plantilla ja té 8 jugadors.');

  const pTeam = p.team || p.club_team;
  const sameTeamCount = roster.filter(rId => {
    const rPlayer = players.find(player => String(player.id) === String(rId));
    return (rPlayer?.team || rPlayer?.club_team) === pTeam;
  }).length;

  if (sameTeamCount >= 2) return alert('No pots tenir més de 2 jugadors del mateix equip.');

  const price = p.value || p.price || p.current_value || 0;
  if (budget < price) return alert('No tens prou pressupost.');

  roster.push(p.id);
  budget -= price;
  save();
  render();
  showSection('team');
}

function sell(id) {
  const idStr = String(id);
  const p = players.find(x => String(x.id) === idStr);
  roster = roster.filter(x => String(x) !== idStr);
  if (p) budget += (p.value || p.price || p.current_value || 0);
  if (String(captain) === idStr) captain = '';
  save();
  render();
}

window.buy = buy;
window.sell = sell;

// 7. ESCOLTADORS GLOBALS (CAPTURA SEMPRE ELS CLICS EN BOTONS RE-RENDERITZATS)
document.addEventListener('click', (e) => {
  const btnBuy = e.target.closest('[data-buy], [data-buy-player]');
  const btnSell = e.target.closest('[data-sell]');
  const btnCap = e.target.closest('[data-captain]');
  const btnGo = e.target.closest('[data-go]');
  const tab = e.target.closest('.tab');

  if (tab) {
    showSection(tab.dataset.section);
    return;
  }
  if (btnBuy) {
    const id = btnBuy.dataset.buy || btnBuy.dataset.buyPlayer || btnBuy.getAttribute('data-buy-player');
    buy(id);
    return;
  }
  if (btnSell) {
    sell(btnSell.dataset.sell);
    return;
  }
  if (btnCap) {
    captain = btnCap.dataset.captain;
    save();
    render();
    return;
  }
  if (btnGo) {
    showSection(btnGo.dataset.go);
    return;
  }
});

// Vincular esdeveniments a tots els desplegables de cerca i filtres
['search', 'teamFilter', 'select-filtre-equip', 'positionFilter', 'select-filtre-posicio'].forEach(id => {
  const el = $(id);
  if (el) {
    el.addEventListener('input', renderMarket);
    el.addEventListener('change', renderMarket);
  }
});

// 8. CARREGA DE JUGADORS DES DE SUPABASE (SI ESTÀ CONFIGURAT)
async function carregarJugadorsSupabase() {
  if (window.supabase && typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL) {
    try {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await client.from('players').select('*');
      if (!error && data && data.length > 0) {
        players = data;
        render();
      }
    } catch (err) {
      console.warn("Carregant llista de jugadors locals.");
    }
  }
}

// INICIALITZACIÓ
render();
carregarJugadorsSupabase();
