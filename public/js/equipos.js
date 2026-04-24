// ═══════════════════════════════════════════════
// Equipos page — Liga Caribe
// ═══════════════════════════════════════════════
let allCamps = [], activeCamp = null, cats = [], selCat = 'Todos';

async function init() {
  renderNav('/equipos.html');
  allCamps   = await API.get('/api/campeonatos');
  activeCamp = allCamps.find(c => c.estado==='activo') || allCamps[0] || null;
  if (activeCamp) cats = await API.get(`/api/categorias?campeonato_id=${activeCamp.id}`);
  renderCampBar();
  renderCatPillsEl();
  await renderEquipos();
}

function renderCampBar() {
  const bar = document.getElementById('campBar');
  if (!bar||!allCamps.length) return;
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--teal);letter-spacing:1px;text-transform:uppercase;font-weight:700">🏆</span>
      ${allCamps.map(c=>`
        <button class="cat-pill${c.id===activeCamp?.id?' on':''}" onclick="selectCamp('${c.id}')"
                style="${c.estado==='finalizado'?'opacity:0.65':''}">
          ${c.nombre}${c.estado==='activo'?' 🟢':''}
        </button>`).join('')}
    </div>`;
}

async function selectCamp(id) {
  activeCamp = allCamps.find(c => c.id===id)||null;
  if (activeCamp) cats = await API.get(`/api/categorias?campeonato_id=${activeCamp.id}`);
  selCat = 'Todos';
  renderCampBar(); renderCatPillsEl(); renderEquipos();
}

function renderCatPillsEl() {
  document.getElementById('catPills').innerHTML =
    ['Todos', ...cats.map(c=>c.nombre)].map(c=>
      `<button class="cat-pill${c===selCat?' on':''}" onclick="setCat('${c}')">${c}</button>`
    ).join('');
}
function setCat(c) { selCat=c; renderCatPillsEl(); renderEquipos(); }

async function renderEquipos() {
  const el = document.getElementById('equiposContent');
  el.innerHTML = '<p class="empty">Cargando...</p>';
  if (!activeCamp) { el.innerHTML = '<p class="empty">Selecciona un campeonato.</p>'; return; }

  const cat = cats.find(c => c.nombre===selCat);
  const url = cat
    ? `/api/equipos?campeonato_id=${activeCamp.id}&categoria_id=${cat.id}`
    : `/api/equipos?campeonato_id=${activeCamp.id}`;
  const equipos = await API.get(url).catch(()=>[]);
  if (!equipos.length) { el.innerHTML = '<p class="empty">No hay equipos en esta categoría.</p>'; return; }

  const details = await Promise.all(equipos.map(e => API.get(`/api/equipos/${e.id}`)));

  let html = '';
  if (selCat === 'Todos') {
    const grouped = {};
    details.forEach(e => {
      if (!grouped[e.categoria]) grouped[e.categoria] = [];
      grouped[e.categoria].push(e);
    });
    html = Object.entries(grouped).map(([cat, eqs])=>`
      <div style="margin-bottom:40px">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:3px;color:var(--teal);
                    padding-bottom:10px;border-bottom:2px solid var(--border);margin-bottom:18px">${cat}</div>
        <div class="team-grid">${eqs.map(teamCard).join('')}</div>
      </div>`).join('');
  } else {
    html = `<div class="team-grid">${details.map(teamCard).join('')}</div>`;
  }
  el.innerHTML = html;
}

function teamCard(e) {
  const positions = { Portero:0, Defensa:0, Mediocampista:0, Delantero:0 };
  (e.jugadores||[]).forEach(j => { if (positions[j.posicion]!==undefined) positions[j.posicion]++; });
  return `
    <div class="team-card">
      <div class="team-card-head">
        <div class="team-escudo">${escudoAvatar(e.escudo)}</div>
        <div>
          <div class="team-nombre">${e.nombre}</div>
          <div class="team-cat">${e.categoria}</div>
        </div>
      </div>
      <div class="team-body">
        <div class="team-stats-row">
          <div class="team-stat">
            <div class="team-stat-n">${(e.jugadores||[]).length}</div>
            <div class="team-stat-l">Jugadores</div>
          </div>
          ${Object.entries(positions).map(([pos,n])=>n?`
          <div class="team-stat">
            <div class="team-stat-n" style="font-size:16px">${n}</div>
            <div class="team-stat-l">${pos.slice(0,3)}</div>
          </div>`:'').join('')}
        </div>
        ${!(e.jugadores||[]).length
          ? '<p class="empty" style="padding:16px 0">Sin jugadores registrados</p>'
          : `<div class="squad-title">Plantilla</div>
             <div class="squad-grid">${(e.jugadores||[]).map(playerChip).join('')}</div>`}
      </div>
    </div>`;
}

function playerChip(j) {
  return `
    <div class="player-chip">
      <div class="player-photo">${playerAvatar(j.foto)}</div>
      <div class="player-num">${j.numero??'—'}</div>
      <div class="player-name">${j.nombre}</div>
      <div class="player-pos" style="color:${POS_COLOR[j.posicion]||'var(--teal)'}">${POS_ICON[j.posicion]||'⚽'} ${j.posicion||''}</div>
      ${j.edad?`<div style="font-size:10px;color:#3a7080;margin-top:2px">${j.edad} años</div>`:''}
    </div>`;
}

init();
