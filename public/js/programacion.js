// ═══════════════════════════════════════════════
// Programación page — Liga Caribe
// ═══════════════════════════════════════════════
let cats = [], selCat = 'Todos', selVista = 'proximos';
const VISTAS = [
  { key: 'proximos',   label: '📅 Próximos' },
  { key: 'todos',      label: 'Todos' },
  { key: 'en_vivo',    label: '🔴 En Vivo' },
  { key: 'finalizado', label: '✅ Jugados' },
];

async function init() {
  renderNav('/programacion.html');
  cats = await API.get('/api/categorias');
  renderFilters();
  await renderProgramacion();
}

function renderFilters() {
  document.getElementById('catPills').innerHTML =
    ['Todos', ...cats.map(c => c.nombre)].map(c =>
      `<button class="cat-pill${c === selCat ? ' on' : ''}" onclick="setCat('${c}')">${c}</button>`
    ).join('');
  document.getElementById('vistaPills').innerHTML = VISTAS.map(v =>
    `<button class="cat-pill${v.key === selVista ? ' on' : ''}" onclick="setVista('${v.key}')">${v.label}</button>`
  ).join('');
}
function setCat(c)   { selCat = c;   renderFilters(); renderProgramacion(); }
function setVista(v) { selVista = v; renderFilters(); renderProgramacion(); }

async function renderProgramacion() {
  const el = document.getElementById('progContent');
  el.innerHTML = '<p class="empty">Cargando...</p>';

  const cat = cats.find(c => c.nombre === selCat);
  let url = '/api/partidos';
  const params = [];
  if (cat) params.push(`categoria_id=${cat.id}`);
  if (selVista !== 'todos' && selVista !== 'proximos') params.push(`estado=${selVista}`);
  if (params.length) url += '?' + params.join('&');

  let partidos = await API.get(url).catch(() => []);

  // "proximos" = programados + en_vivo
  if (selVista === 'proximos') {
    partidos = partidos.filter(p => p.estado === 'programado' || p.estado === 'en_vivo');
    partidos.sort((a,b) => a.fecha.localeCompare(b.fecha) || (a.hora||'').localeCompare(b.hora||''));
  }

  if (!partidos.length) {
    el.innerHTML = '<p class="empty">No hay partidos con esos filtros.</p>';
    return;
  }

  // Group by date
  const groups = {};
  partidos.forEach(p => {
    if (!groups[p.fecha]) groups[p.fecha] = [];
    groups[p.fecha].push(p);
  });

  el.innerHTML = Object.entries(groups).map(([fecha, ps]) => `
    <div style="margin-bottom:28px">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;color:var(--orange);
                  padding-bottom:8px;border-bottom:1px solid rgba(255,159,28,.2);margin-bottom:12px">
        📅 ${fmt(fecha)}
      </div>
      <div class="prog-list">${ps.map(progCard).join('')}</div>
    </div>`).join('');
}

function progCard(p) {
  const isLive = p.estado === 'en_vivo';
  const isDone = p.estado === 'finalizado';
  const isPend = p.estado === 'programado';

  return `
    <div class="prog-card ${isLive ? 'vivo' : isDone ? 'finalizado' : ''}">
      <div class="prog-meta">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="badge badge-teal">${p.categoria}</span>
          ${isLive ? '<span class="badge badge-live">🔴 EN VIVO · '+p.minuto+"'" : ''}
          ${isDone ? '<span class="badge badge-teal">✅ Finalizado</span>' : ''}
          <span class="prog-fecha">${p.hora || ''}</span>
        </div>
        <button class="btn btn-ghost btn-xs" onclick="openConvModal(${p.id})">
          👥 Ver Convocatoria
        </button>
      </div>
      <div class="prog-teams">
        <span class="prog-team">${p.local_nombre}</span>
        ${isDone
          ? `<span class="prog-score">${p.goles_local} - ${p.goles_visitante}</span>`
          : isLive
            ? `<span class="prog-live-score">${p.goles_local??0} - ${p.goles_visitante??0}</span>`
            : `<span class="prog-vs">VS</span>`}
        <span class="prog-team">${p.visita_nombre}</span>
      </div>
      ${p.notas ? `<div style="font-size:11px;color:#5a9aaa;margin-top:8px">📍 ${p.notas}</div>` : ''}
    </div>`;
}

// ── Convocatoria modal ────────────────────────────
let _convPartido = null;

async function openConvModal(partidoId) {
  document.getElementById('convModal').classList.remove('hidden');
  document.getElementById('convModalContent').innerHTML = '<p class="empty">Cargando...</p>';

  const [partido, convocados] = await Promise.all([
    API.get(`/api/partidos/${partidoId}`),
    API.get(`/api/partidos/${partidoId}/convocatoria`),
  ]);
  _convPartido = partido;

  document.getElementById('convModalTtl').textContent =
    `${partido.local_nombre} vs ${partido.visita_nombre}`;

  if (!convocados.length) {
    document.getElementById('convModalContent').innerHTML =
      `<p class="empty">Ningún equipo ha registrado su convocatoria aún.</p>
       <div style="text-align:center;margin-top:16px">
         <a class="btn btn-t btn-sm" href="/panel.html">Registrar en Panel →</a>
       </div>`;
    return;
  }

  // Group by team
  const byTeam = {};
  convocados.forEach(c => {
    if (!byTeam[c.equipo_nombre]) byTeam[c.equipo_nombre] = [];
    byTeam[c.equipo_nombre].push(c);
  });

  document.getElementById('convModalContent').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px">
      ${Object.entries(byTeam).map(([equipo, jugadores]) => `
        <div class="conv-section">
          <div class="conv-title">🛡️ ${equipo}</div>
          <div class="conv-players" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">
            ${jugadores.map(j => `
              <div style="background:rgba(0,30,50,.6);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center">
                <div style="width:44px;height:44px;border-radius:50%;overflow:hidden;background:var(--teal3);display:flex;align-items:center;justify-content:center;margin:0 auto 7px;font-size:20px">
                  ${j.foto ? `<img src="/uploads/jugadores/${j.foto}" style="width:100%;height:100%;object-fit:cover">` : '👤'}
                </div>
                <div style="font-family:'Bebas Neue',sans-serif;font-size:16px;color:var(--orange)">${j.numero ?? '—'}</div>
                <div style="font-weight:800;font-size:11px;color:var(--white)">${j.jugador_nombre}</div>
                <div style="font-size:10px;color:${POS_COLOR[j.posicion]||'var(--teal)'}">${POS_ICON[j.posicion]||''} ${j.posicion||''}</div>
              </div>`).join('')}
          </div>
        </div>`).join('')}
    </div>
    <div style="text-align:center;margin-top:18px">
      <a class="btn btn-t btn-sm" href="/panel.html">Gestionar en Panel →</a>
    </div>`;
}

function closeConvModal() {
  document.getElementById('convModal').classList.add('hidden');
}

init();
