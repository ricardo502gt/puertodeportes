// ═══════════════════════════════════════════════
// Resultados page — Liga Caribe
// ═══════════════════════════════════════════════
let cats = [], selCat = 'Todos', selEstado = 'Todos';

const ESTADOS = [
  { key: 'Todos',      label: 'Todos' },
  { key: 'finalizado', label: '✅ Jugados' },
  { key: 'programado', label: '📅 Programados' },
  { key: 'en_vivo',    label: '🔴 En Vivo' },
];

async function init() {
  renderNav('/resultados.html');
  cats = await API.get('/api/categorias');
  renderFilters();
  await renderPartidos();
}

function renderFilters() {
  // Categorías
  document.getElementById('catPills').innerHTML =
    ['Todos', ...cats.map(c => c.nombre)].map(c =>
      `<button class="cat-pill${c === selCat ? ' on' : ''}" onclick="setCat('${c}')">${c}</button>`
    ).join('');
  // Estados
  document.getElementById('estadoPills').innerHTML = ESTADOS.map(e =>
    `<button class="cat-pill${e.key === selEstado ? ' on' : ''}" onclick="setEstado('${e.key}')">${e.label}</button>`
  ).join('');
}

function setCat(c)    { selCat = c;    renderFilters(); renderPartidos(); }
function setEstado(e) { selEstado = e; renderFilters(); renderPartidos(); }

async function renderPartidos() {
  const el = document.getElementById('resContent');
  el.innerHTML = '<p class="empty">Cargando...</p>';

  let url = '/api/partidos';
  const params = [];
  const cat = cats.find(c => c.nombre === selCat);
  if (cat)                     params.push(`categoria_id=${cat.id}`);
  if (selEstado !== 'Todos')   params.push(`estado=${selEstado}`);
  if (params.length)           url += '?' + params.join('&');

  const partidos = await API.get(url).catch(() => []);
  if (!partidos.length) {
    el.innerHTML = '<p class="empty">No hay partidos con esos filtros.</p>';
    return;
  }

  // Agrupar por fecha
  const groups = {};
  partidos.forEach(p => {
    const key = p.fecha;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });

  el.innerHTML = Object.entries(groups).map(([fecha, ps]) => `
    <div style="margin-bottom:28px">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;color:var(--orange);
                  padding-bottom:8px;border-bottom:1px solid rgba(255,159,28,.2);margin-bottom:12px">
        📅 ${fmt(fecha)}
      </div>
      <div class="res-grid">${ps.map(p => cardHtml(p)).join('')}</div>
    </div>`).join('');
}

function cardHtml(p) {
  const isLive  = p.estado === 'en_vivo';
  const isDone  = p.estado === 'finalizado';
  const isPend  = p.estado === 'programado';
  return `
    <div class="res-card${isPend ? ' pending' : ''}">
      <div class="rc-meta">
        <span class="badge badge-teal">${p.categoria}</span>
        <div style="display:flex;align-items:center;gap:6px">
          ${isLive ? '<span class="badge badge-live">🔴 EN VIVO</span>' : ''}
          <span class="rc-date">${p.hora || ''}</span>
        </div>
      </div>
      <div class="rc-teams">
        <span class="rc-team">${p.local_nombre}</span>
        ${isDone
          ? `<span class="rc-score">${p.goles_local} - ${p.goles_visitante}</span>`
          : isLive
            ? `<span class="rc-score" style="border-color:var(--live);color:var(--live)">${p.goles_local??0} - ${p.goles_visitante??0}</span>`
            : `<span class="rc-vs">VS</span>`}
        <span class="rc-team">${p.visita_nombre}</span>
      </div>
      ${isDone ? scorersLine(p) : ''}
    </div>`;
}

async function scorersLine(p) {
  return '';
}

init();
