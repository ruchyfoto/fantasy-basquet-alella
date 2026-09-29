// ============================================
// FANTASY APP - FITXER COMPLET ADAPTAT A SUPABASE
// ============================================

// 1. VARIABLES D'ESTAT INICIALS
let players = [];
let roster = JSON.parse(localStorage.getItem('fantasyRoster') || '[]');
let budget = Number(localStorage.getItem('fantasyBudget') || 120);
let captain = localStorage.getItem('fantasyCaptain') || '';
let currentWeek = Number(localStorage.getItem('fantasyWeek') || 1);

const $ = id => document.getElementById(id);
const money = n => `${Number(n || 0).toFixed(1).replace('.', ',')} M€`;

function save() {
  localStorage.setItem('fantasyRoster', JSON.stringify(roster));
  localStorage.setItem('fantasyBudget', budget);
  localStorage.setItem('fantasyCaptain', captain);
  localStorage.setItem('fantasyWeek', currentWeek);
}

// 2. MOSTRAR SECCIONS
function showSection(id) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.section === id));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 3. TARGETA DE JUGADOR (CAMPS REALS DE SUPABASE)
function playerCard(p, inTeam = false) {
  if (!p) return '';
  
  const pId = String(p.id);
  const fullName = `${p.name || ''} ${p.surname || ''}`.trim() || 'Sense nom';
  const initials = fullName.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
  
  const val = p.current_value || p.value || 0;
  const teamLabel = p.real_team_id ? `Equip ${p.real_team_id}` : (p.team || 'Sense equip');
  const catLabel = p.category || p.position || 'General';

  return `
    <article class="player-card">
      <div class="avatar">${initials}</div>
      <div class="player-info">
        <h3>${fullName}</h3>
        <span>${teamLabel} · ${catLabel}</span>
      </div>
      <div class="player-meta">
        <div><small>Valor</small><b>${money(val)}</b></div>
        <div><small>Dorsal</small><b>#${p.shirt_number || '-'}</b></div>
      </div>
      <div class="card-actions">
        ${inTeam ? `
          <button type="button" class="secondary" data-sell="${pId}" onclick="sell('${pId}')">Vendre</button>
          ${String(captain) === pId ? '' : `<button type="button" class="secondary" data-captain="${pId}" onclick="setCaptain('${pId}')">Fer capità</button>`}
        ` : `
          <button type="button" class="primary" data-buy="${pId}" onclick="buy('${pId}')">Fitxar · ${money(val)}</button>
        `}
      </div>
    </article>
  `;
}

// 4. OPERACIONS (FITXAR I VENDRE)
function buy(id) {
  const p = players.find(x => String(x.id) === String(id));

  if (!p) {
    console.error("Jugador no trobat amb ID:", id, "a la llista:", players);
    return alert("No s'ha trobat la informació d'aquest jugador.");
  }

  const pIdStr = String(p.id);
  if (roster.some(rId => String(rId) === pIdStr)) {
    return alert('Aquest jugador ja forma part de la plantilla.');
  }

  if (roster.length >= 8) {
    return alert('La plantilla ja té 8 jugadors.');
  }

  const pTeam = p.real_team_id;
  if (pTeam) {
    const sameTeamCount = roster.filter(rId => {
      const rPlayer = players.find(player => String(player.id) === String(rId));
      return rPlayer && rPlayer.real_team_id === pTeam;
    }).length;

    if (sameTeamCount >= 2) {
      return alert('No pots tenir més de 2 jugadors del mateix equip.');
    }
  }

  const price = p.current_value || p.value || 0;
  if (budget < price) {
    return alert('No tens prou pressupost.');
  }

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
  if (p) budget += (p.current_value || p.value || 0);
  if (String(captain) === idStr) captain = '';
  save();
  render();
}

function setCaptain(id) {
  captain = String(id);
  save();
  render();
}

// EXPOSAR FUNCIONS A WINDOW (Per si HTML utilitza script type="module")
window.buy = buy;
window.sell = sell;
window.setCaptain = setCaptain;
window.showSection = showSection;

// 5. RENDERITZAT GENERAL
function render() {
  if ($('budget'))$('budget').textContent = money(budget);
  if ($('rosterCount'))$('rosterCount').textContent = `${roster.length}/8`;
  if ($('playerTotal'))$('playerTotal').textContent = players.length;

  // Actualitzar filtre d'equips basat en real_team_id
  const teams = [...new Set(players.map(p => p.real_team_id).filter(Boolean))];
  ['teamFilter', 'select-filtre-equip'].forEach(filterId => {
    const el = $(filterId);
    if (el && el.children.length <= 1) {
      el.innerHTML = '<option value="">Tots els equips</option>' + teams.map(t => `<option value="${t}">Equip ${t}</option>`).join('');
    }
  });

  renderMarket();
  renderTeam();
}

function renderMarket() {
  const searchEl = $('search');
  const teamEl = $('teamFilter') \vert{}\vert{}$('select-filtre-equip');
  const posEl = $('positionFilter') || $('select-filtre-posicio') \vert{}\vert{}$('roleFilter');

  const q = searchEl ? searchEl.value.toLowerCase().trim() : '';
  const team = teamEl ? teamEl.value : '';
  const pos = posEl ? posEl.value : '';

  const filtered = players.filter(p => {
    const fullName = `${p.name || ''} ${p.surname || ''}`.toLowerCase();
    const pTeam = String(p.real_team_id || '');
    const pPos = (p.category || p.position || '').toLowerCase();

    const nameMatch = !q || fullName.includes(q);
    const teamMatch = !team || team === 'tots' || pTeam === String(team);
    const posMatch = !pos || pos === 'tots' || pPos.includes(pos.toLowerCase());

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
        <button type="button" class="primary" onclick="showSection('market')">Anar al mercat</button>
      </div>`;
    return;
  }
  grid.innerHTML = roster.map(id => playerCard(players.find(p => String(p.id) === String(id)), true)).join('');
}

// 6. DELEGACIÓ D'ESDEVENIMENTS DE CLIC
document.addEventListener('click', (e) => {
  const btnBuy = e.target.closest('[data-buy]');
  const btnSell = e.target.closest('[data-sell]');
  const btnCap = e.target.closest('[data-captain]');
  const tab = e.target.closest('.tab');

  if (tab) showSection(tab.dataset.section);
  else if (btnBuy) buy(btnBuy.dataset.buy);
  else if (btnSell) sell(btnSell.dataset.sell);
  else if (btnCap) setCaptain(btnCap.dataset.captain);
});

// ESDEVENIMENTS DE FILTRES
['search', 'teamFilter', 'select-filtre-equip', 'positionFilter', 'select-filtre-posicio'].forEach(id => {
  const el = $(id);
  if (el) {
    el.addEventListener('input', renderMarket);
    el.addEventListener('change', renderMarket);
  }
});

// 7. CÀRREGA DES DE SUPABASE
async function carregarJugadorsSupabase() {
  if (window.supabase) {
    try {
      // Intenta utilitzar el client global existent o crear-ne un de nou
      const client = window.supabaseClient || (typeof SUPABASE_URL !== 'undefined' ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null);
      if (client) {
        const { data, error } = await client.from('players').select('*');
        if (!error && data && data.length > 0) {
          players = data;
          render();
          console.log("✅ Jugadors carregats de Supabase:", players.length);
          return;
        }
      }
    } catch (err) {
      console.warn("⚠️ No s'ha pogut connectar a Supabase:", err);
    }
  }
}

// INICIALITZACIÓ
render();
carregarJugadorsSupabase();

