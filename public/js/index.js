// ═══════════════════════════════════════════════
// Landing page — Liga Caribe
// ═══════════════════════════════════════════════
let allCamps = [], activeCamp = null, cats = [], tCat = '', sCat = '', jCat = '';

async function init() {
  renderNav('/');
  allCamps = await API.get('/api/campeonatos');
  activeCamp = allCamps.find(c => c.estado === 'activo') || allCamps[0] || null;
  renderCampBar();
  await loadCamp();
  setInterval(renderLive, 30000);
}

function renderCampBar() {
  const bar = document.getElementById('campBar');
  if (!bar || !allCamps.length) return;
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center">
      <span style="font-size:11px;color:var(--teal);letter-spacing:1px;text-transform:uppercase;font-weight:700">🏆 Campeonato:</span>
      ${allCamps.map(c => `
        <button class="cat-pill${c.id===activeCamp?.id?' on':''}" onclick="selectCamp('${c.id}')"
                style="${c.estado==='finalizado'?'opacity:0.65':''}">
          ${c.nombre}${c.estado==='activo'?' 🟢':''}
        </button>`).join('')}
    </div>`;
}

async function selectCamp(id) {
  activeCamp = allCamps.find(c => c.id === id) || null;
  renderCampBar();
  await loadCamp();
}

async function loadCamp() {
  if (!activeCamp) return;
  cats = await API.get(`/api/categorias?campeonato_id=${activeCamp.id}`);
  tCat = cats[0]?.nombre || '';
  sCat = cats[0]?.nombre || '';
  jCat = cats[0]?.nombre || '';
  await Promise.all([
    renderStatsBar(), renderLive(), renderResultados(),
    renderTabla(), renderStats(), renderJugadores(), renderNoticias(),
  ]);
}

// ── Stats bar ────────────────────────────────────
async function renderStatsBar() {
  if (!activeCamp) return;
  const [equipos, jugadores, partidos] = await Promise.all([
    API.get(`/api/equipos?campeonato_id=${activeCamp.id}`),
    API.get(`/api/jugadores?campeonato_id=${activeCamp.id}`),
    API.get(`/api/partidos?campeonato_id=${activeCamp.id}`),
  ]);
  const jugados = partidos.filter(p => p.estado === 'finalizado').length;
  document.getElementById('statsBar').innerHTML = `
    <div class="stat-item"><div class="stat-n">${equipos.length}</div><div class="stat-l">Equipos</div></div>
    <div class="stat-item"><div class="stat-n">${jugadores.length}</div><div class="stat-l">Jugadores</div></div>
    <div class="stat-item"><div class="stat-n">${jugados}</div><div class="stat-l">Partidos Jugados</div></div>
    <div class="stat-item"><div class="stat-n">${cats.length}</div><div class="stat-l">Categorías</div></div>`;
}

// ── En Vivo ──────────────────────────────────────
async function renderLive() {
  const url = activeCamp
    ? `/api/partidos?campeonato_id=${activeCamp.id}&estado=en_vivo`
    : '/api/partidos?estado=en_vivo';
  const vivos = await API.get(url);
  const el = document.getElementById('liveContent');
  if (!vivos.length) {
    el.innerHTML = `<div class="no-live">
      <div class="no-live-icon">🌴</div>
      <div class="no-live-txt">No hay partidos en vivo ahora mismo.<br/>
        <span style="color:#3a7080;font-size:12px">El administrador activa el modo EN VIVO cuando comienza un partido.</span></div>
    </div>`;
    return;
  }
  el.innerHTML = `
    <div class="live-banner"><div class="live-dot"></div><span class="live-label">EN VIVO</span>
      <span style="font-size:12px;color:var(--text)"> · ${vivos.length} partido${vivos.length>1?'s':''} activo${vivos.length>1?'s':''}</span>
    </div>
    <div class="live-grid">${vivos.map(p=>`
      <div class="live-card">
        <div class="lc-top">
          <span class="badge badge-live">🔴 EN VIVO</span>
          <span style="font-size:11px;color:var(--text)">${p.categoria}</span>
          <span class="lc-min">${p.minuto||0}'</span>
        </div>
        <div class="lc-teams">
          <span class="lc-team">${p.local_nombre}</span>
          <span class="lc-score">${p.goles_local??0} - ${p.goles_visitante??0}</span>
          <span class="lc-team">${p.visita_nombre}</span>
        </div>
      </div>`).join('')}
    </div>`;
}

// ── Resultados recientes ─────────────────────────
async function renderResultados() {
  if (!activeCamp) return;
  const partidos = await API.get(`/api/partidos?campeonato_id=${activeCamp.id}&estado=finalizado`);
  const recent = partidos.slice(0, 6);
  const el = document.getElementById('resGrid');
  if (!recent.length) { el.innerHTML = '<p class="empty">No hay resultados aún.</p>'; return; }
  el.innerHTML = `<div class="res-grid">${recent.map(p=>`
    <div class="res-card">
      <div class="rc-meta">
        <span class="badge badge-teal">${p.categoria}</span>
        <span class="rc-date">${fmt(p.fecha)}${p.hora?' · '+p.hora:''}</span>
      </div>
      <div class="rc-teams">
        <span class="rc-team">${p.local_nombre}</span>
        <span class="rc-score">${p.goles_local} - ${p.goles_visitante}</span>
        <span class="rc-team">${p.visita_nombre}</span>
      </div>
    </div>`).join('')}</div>`;
}

// ── Tabla ─────────────────────────────────────────
async function renderTabla() {
  if (!activeCamp) return;
  const pills = document.getElementById('tablaCatPills');
  pills.innerHTML = cats.map(c =>
    `<button class="cat-pill${c.nombre===tCat?' on':''}" onclick="setTCat('${c.nombre}')">${c.nombre}</button>`
  ).join('');
  if (!tCat) { document.getElementById('tablaTable').innerHTML = '<p class="empty">Sin categorías.</p>'; return; }
  const cat = cats.find(c => c.nombre === tCat);
  const rows = await API.get(`/api/standings?campeonato_id=${activeCamp.id}&categoria_id=${cat.id}`);
  const el = document.getElementById('tablaTable');
  if (!rows.length) { el.innerHTML = '<p class="empty">Sin equipos en esta categoría.</p>'; return; }
  el.innerHTML = `<table>
    <thead><tr><th>#</th><th style="text-align:left">Equipo</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>DG</th><th>PTS</th></tr></thead>
    <tbody>${rows.map((r,i)=>`
      <tr class="${i===0?'r1':i===1?'r2':'ra'}">
        <td>${medal(i)}</td>
        <td class="tdl">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:24px;height:24px;border-radius:50%;overflow:hidden;background:var(--teal3);display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">
              ${escudoAvatar(r.escudo)}
            </div>
            ${r.nombre}
          </div>
        </td>
        <td>${r.pj}</td><td>${r.pg}</td><td>${r.pe}</td><td>${r.pp}</td>
        <td>${r.gf}</td><td>${r.gc}</td>
        <td style="color:${r.dg>=0?'var(--teal)':'var(--red)'}">${r.dg>0?'+':''}${r.dg}</td>
        <td class="tdpts">${r.pts}</td>
      </tr>`).join('')}
    </tbody></table>`;
}
function setTCat(c) { tCat = c; renderTabla(); }

// ── Stats ─────────────────────────────────────────
async function renderStats() {
  if (!activeCamp) return;
  const pills = document.getElementById('statsCatPills');
  pills.innerHTML = cats.map(c =>
    `<button class="cat-pill${c.nombre===sCat?' on':''}" onclick="setSCat('${c.nombre}')">${c.nombre}</button>`
  ).join('');
  const cat = cats.find(c => c.nombre === sCat);
  const base = `campeonato_id=${activeCamp.id}${cat?'&categoria_id='+cat.id:''}`;
  const [goles, tarjetas] = await Promise.all([
    API.get(`/api/goleadores?${base}`),
    API.get(`/api/tarjetas?${base}`),
  ]);
  document.getElementById('statsContent').innerHTML = `
    <div class="mini-card">
      <div class="mini-title">⚽ Top Goleadores</div>
      ${!goles.length ? '<p class="empty">Sin datos.</p>' : `<table>
        <thead><tr><th>#</th><th style="text-align:left">Jugador</th><th>Equipo</th><th>Goles</th></tr></thead>
        <tbody>${goles.slice(0,8).map((g,i)=>`
          <tr><td>${i+1}</td><td class="tdl">${g.nombre}</td><td style="color:var(--text);font-size:12px">${g.equipo}</td>
          <td><span style="background:var(--teal3);border:1px solid var(--teal);border-radius:20px;padding:2px 10px;color:var(--teal);font-weight:700;font-size:12px">${g.goles}</span></td>
          </tr>`).join('')}</tbody></table>`}
    </div>
    <div class="mini-card">
      <div class="mini-title">🟨 Disciplina</div>
      ${!tarjetas.length ? '<p class="empty">Sin datos.</p>' : `<table>
        <thead><tr><th>#</th><th style="text-align:left">Jugador</th><th>🟨</th><th>🟥</th></tr></thead>
        <tbody>${tarjetas.slice(0,8).map((t,i)=>`
          <tr><td>${i+1}</td><td class="tdl">${t.nombre}</td>
          <td>${t.amarillas?`<span class="amar">${t.amarillas}</span>`:'-'}</td>
          <td>${t.rojas?`<span class="roja">${t.rojas}</span>`:'-'}</td>
          </tr>`).join('')}</tbody></table>`}
    </div>`;
}
function setSCat(c) { sCat = c; renderStats(); }

// ── Jugadores ─────────────────────────────────────
async function renderJugadores() {
  if (!activeCamp) return;
  const pills = document.getElementById('jugCatPills');
  pills.innerHTML = cats.map(c =>
    `<button class="cat-pill${c.nombre===jCat?' on':''}" onclick="setJCat('${c.nombre}')">${c.nombre}</button>`
  ).join('');
  const cat = cats.find(c => c.nombre === jCat);
  const url = cat
    ? `/api/jugadores?campeonato_id=${activeCamp.id}&categoria_id=${cat.id}`
    : `/api/jugadores?campeonato_id=${activeCamp.id}`;
  const list = await API.get(url);
  const el = document.getElementById('jugGrid');
  if (!list.length) { el.innerHTML = '<p class="empty">Sin jugadores registrados.</p>'; return; }
  el.innerHTML = list.slice(0,12).map(j=>`
    <div class="jug-card">
      <div class="jug-av">${playerAvatar(j.foto)}</div>
      <div class="jug-num">${j.numero??'—'}</div>
      <div class="jug-name">${j.nombre}</div>
      <div style="font-size:10px;color:${POS_COLOR[j.posicion]||'var(--teal)'};margin-bottom:3px">${POS_ICON[j.posicion]||'⚽'} ${j.posicion||''}</div>
      <div class="jug-team">${j.equipo_nombre}</div>
    </div>`).join('');
}
function setJCat(c) { jCat = c; renderJugadores(); }

// ── Noticias ─────────────────────────────────────
async function renderNoticias() {
  if (!activeCamp) return;
  const partidos = await API.get(`/api/partidos?campeonato_id=${activeCamp.id}&estado=finalizado`);
  const recent = partidos.slice(0,6);
  const el = document.getElementById('notGrid');
  if (!recent.length) { el.innerHTML = '<p class="empty">Sin noticias aún.</p>'; return; }
  el.innerHTML = recent.map(p=>`
    <div class="not-card">
      <div class="not-img">⚽</div>
      <div class="not-body">
        <div class="not-tag">${p.categoria}</div>
        <div class="not-ttl">${p.local_nombre} ${p.goles_local} - ${p.goles_visitante} ${p.visita_nombre}</div>
        <div class="not-date">${fmt(p.fecha)}</div>
      </div>
    </div>`).join('');
}

init();
