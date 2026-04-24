// ═══════════════════════════════════════════════
// Landing page — Liga Caribe
// ═══════════════════════════════════════════════
let allCamps = [], activeCamp = null, cats = [], tCat = '', sCat = '', jCat = '';
let _shareGroupsIdx = {};

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
    renderStatsBar(), renderLive(), renderProgramacion(), renderResultados(),
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

// ── Programación próxima ─────────────────────────
async function renderProgramacion() {
  if (!activeCamp) return;
  const partidos = await API.get(`/api/partidos?campeonato_id=${activeCamp.id}`);
  const proximos = partidos
    .filter(p => p.estado === 'programado' || p.estado === 'en_vivo')
    .sort((a,b) => a.fecha.localeCompare(b.fecha) || (a.hora||'').localeCompare(b.hora||''))
    .slice(0, 8);
  const el = document.getElementById('progGrid');
  if (!proximos.length) {
    el.innerHTML = '<p class="empty">No hay partidos programados próximamente.</p>';
    return;
  }
  // Group by date
  _shareGroupsIdx = {};
  proximos.forEach(p => { if (!_shareGroupsIdx[p.fecha]) _shareGroupsIdx[p.fecha]=[]; _shareGroupsIdx[p.fecha].push(p); });
  el.innerHTML = Object.entries(_shareGroupsIdx).map(([fecha, ps]) => `
    <div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;
                  padding-bottom:6px;border-bottom:1px solid rgba(255,159,28,.2);margin-bottom:10px">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:2px;color:var(--orange)">
          📅 ${fmt(fecha)}
        </div>
        <button class="btn btn-ghost btn-xs" onclick="shareJornada('${fecha}')">📤 Compartir</button>
      </div>
      <div class="res-grid">${ps.map(p => `
        <div class="res-card">
          <div class="rc-meta">
            <span class="badge badge-teal">${p.categoria}</span>
            ${p.fase ? `<span class="badge" style="background:rgba(255,159,28,.15);color:var(--orange);border:1px solid rgba(255,159,28,.4)">${p.fase}</span>` : ''}
            <span class="rc-date">${p.hora || 'Por confirmar'}${p.campo?' · Campo '+p.campo:''}</span>
          </div>
          <div class="rc-teams">
            <span class="rc-team">${p.local_nombre}</span>
            ${p.estado === 'en_vivo'
              ? `<span class="rc-score" style="border-color:var(--live);color:var(--live)">${p.goles_local??0} - ${p.goles_visitante??0}</span>`
              : `<span class="rc-vs">VS</span>`}
            <span class="rc-team">${p.visita_nombre}</span>
          </div>
          ${p.notas ? `<div style="font-size:11px;color:#5a9aaa;text-align:center;margin-top:6px">📍 ${p.notas}</div>` : ''}
        </div>`).join('')}
      </div>
    </div>`).join('');
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

// ── Share imagen ─────────────────────────────────
async function shareJornada(fecha) {
  const ps = _shareGroupsIdx[fecha] || [];
  if (!ps.length || typeof html2canvas === 'undefined') return;
  const campNombre = activeCamp?.nombre || 'Liga Caribe';
  const fases = [...new Set(ps.map(p => p.fase).filter(Boolean))];
  const matchRows = ps.map(p => `
    <div style="background:rgba(0,212,170,.07);border:1px solid rgba(0,212,170,.18);
                border-radius:10px;padding:11px 14px;margin-bottom:9px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
        <span style="font-size:11px;color:#00d4aa;font-weight:800;text-transform:uppercase">${p.categoria}${p.fase?' · '+p.fase:''}</span>
        <span style="font-size:11px;color:#5a9aaa">${p.hora||'Sin hora'}${p.campo?' · Campo '+p.campo:''}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-weight:900;font-size:13px;color:#fff;flex:1;text-align:right">${p.local_nombre}</span>
        <span style="font-size:11px;font-weight:700;color:#5a9aaa;padding:2px 8px;border:1px solid rgba(90,154,170,.4);border-radius:6px">VS</span>
        <span style="font-weight:900;font-size:13px;color:#fff;flex:1">${p.visita_nombre}</span>
      </div>
      ${p.notas?`<div style="font-size:10px;color:#5a9aaa;margin-top:5px">📍 ${p.notas}</div>`:''}
    </div>`).join('');
  const card = document.getElementById('shareCard');
  card.innerHTML = `
    <div style="width:540px;background:linear-gradient(145deg,#001526,#002640);
                border:2px solid #00d4aa;border-radius:18px;padding:22px 22px 18px;
                font-family:'Nunito',Arial,sans-serif;box-sizing:border-box">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;
                  border-bottom:1px solid rgba(0,212,170,.25);padding-bottom:14px;margin-bottom:16px">
        <div>
          <div style="font-size:26px;font-weight:900;color:#00d4aa;letter-spacing:2px;line-height:1">⚽ LIGA CARIBE</div>
          <div style="font-size:10px;color:#5a9aaa;letter-spacing:2px;text-transform:uppercase;margin-top:3px">Puerto Barrios · Izabal · Guatemala</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;font-weight:800;color:#ff9f1c">${campNombre}</div>
          ${fases.length?`<div style="font-size:11px;color:rgba(255,159,28,.8);margin-top:2px">${fases.join(' · ')}</div>`:''}
        </div>
      </div>
      <div style="font-size:15px;font-weight:800;color:#ff9f1c;letter-spacing:1px;margin-bottom:13px">📅 ${fmt(fecha)}</div>
      ${matchRows}
      <div style="margin-top:14px;text-align:center;font-size:10px;color:#3a7080;letter-spacing:1px">puertodeportes.com</div>
    </div>`;
  card.style.display = 'block';
  try {
    const canvas = await html2canvas(card.firstElementChild, { backgroundColor:null, scale:2, useCORS:true, logging:false });
    card.style.display = 'none';
    canvas.toBlob(async blob => {
      const file = new File([blob], `liga-caribe-${fecha}.png`, { type:'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files:[file] })) {
        await navigator.share({ files:[file], title:`Liga Caribe · ${fmt(fecha)}` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=url; a.download=`liga-caribe-${fecha}.png`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }, 'image/png');
  } catch(e) { card.style.display='none'; }
}

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
