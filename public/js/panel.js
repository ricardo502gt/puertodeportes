// ═══════════════════════════════════════════════════════════════
// Panel Admin — Liga Caribe
// ═══════════════════════════════════════════════════════════════
let cu = null, cats = [], allEquipos = [];
let pTab = 'partidos', pCat = '';

// ── Login ─────────────────────────────────────────────────────
async function doLogin() {
  const usuario  = document.getElementById('lUser').value.trim();
  const password = document.getElementById('lPass').value;
  try {
    const { user } = await API.post('/api/auth/login', { usuario, password });
    cu = user;
    document.getElementById('loginOv').classList.add('hidden');
    document.getElementById('panelApp').classList.remove('hidden');
    await initPanel();
  } catch {
    const err = document.getElementById('lErr');
    err.classList.remove('hidden');
    setTimeout(() => err.classList.add('hidden'), 3000);
  }
}

async function doLogout() {
  await API.post('/api/auth/logout');
  window.location.href = '/';
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  const user = await initAuth();
  if (user) {
    cu = user;
    document.getElementById('loginOv').classList.add('hidden');
    document.getElementById('panelApp').classList.remove('hidden');
    await initPanel();
  }
}

async function initPanel() {
  document.getElementById('pSubTxt').textContent =
    cu.rol === 'super'    ? 'Super Administrador'  :
    cu.rol === 'admin'    ? 'Administrador de Liga' :
    `Delegado — equipo asignado`;
  const badge = document.getElementById('pBadge');
  badge.textContent = cu.rol === 'super' ? `👑 ${cu.nombre}` : cu.rol === 'admin' ? `⚙️ ${cu.nombre}` : `🏅 ${cu.nombre}`;
  badge.className = `p-badge ${cu.rol === 'super' ? 'pb-super' : cu.rol === 'admin' ? 'pb-admin' : 'pb-del'}`;

  cats      = await API.get('/api/categorias');
  allEquipos = await API.get('/api/equipos');
  pCat      = cats[0]?.nombre || '';
  pTab      = cu.rol === 'delegado' ? 'jugadores' : 'partidos';

  renderPNav();
  renderPCatBar();
  renderTab();
}

// ── Tab nav ───────────────────────────────────────────────────
function tabsForRole() {
  if (cu.rol === 'super')  return ['partidos','convocatorias','equipos','jugadores','estadisticas','usuarios','backup'];
  if (cu.rol === 'admin')  return ['partidos','convocatorias','equipos','jugadores','estadisticas'];
  return ['jugadores','convocatorias'];
}
const TAB_LABELS = {
  partidos:      '⚽ Partidos',
  convocatorias: '👥 Convocatorias',
  equipos:       '🛡️ Equipos',
  jugadores:     '👤 Jugadores',
  estadisticas:  '📊 Estadísticas',
  usuarios:      '🔑 Usuarios',
  backup:        '💾 Respaldo',
};

function renderPNav() {
  document.getElementById('pNav').innerHTML = tabsForRole().map(t =>
    `<button class="p-nb${t === pTab ? ' on' : ''}" onclick="setTab('${t}')">${TAB_LABELS[t]}</button>`
  ).join('');
}
function setTab(t) { pTab = t; renderPNav(); renderTab(); }

// ── Cat bar ───────────────────────────────────────────────────
const TABS_WITH_CAT = ['partidos','convocatorias','jugadores','estadisticas','equipos'];
function renderPCatBar() {
  const bar = document.getElementById('pCatBar');
  if (!TABS_WITH_CAT.includes(pTab)) { bar.innerHTML = ''; return; }
  bar.innerHTML = cats.map(c =>
    `<button class="p-cat${c.nombre === pCat ? ' on' : ''}" onclick="setPCat('${c.nombre}')">${c.nombre}</button>`
  ).join('');
}
function setPCat(c) { pCat = c; renderPCatBar(); renderTab(); }

// ── Route ─────────────────────────────────────────────────────
function renderTab() {
  renderPCatBar();
  const fns = {
    partidos:      renderPartidos,
    convocatorias: renderConvocatorias,
    equipos:       renderEquipos,
    jugadores:     renderJugadores,
    estadisticas:  renderEstadisticas,
    usuarios:      renderUsuarios,
    backup:        renderBackup,
  };
  (fns[pTab] || (() => {}))();
}

// ═══════════════════════════════════════════════════════════════
// TAB: PARTIDOS
// ═══════════════════════════════════════════════════════════════
async function renderPartidos() {
  const cat = cats.find(c => c.nombre === pCat);
  const url = cat ? `/api/partidos?categoria_id=${cat.id}` : '/api/partidos';
  const partidos = await API.get(url).catch(() => []);
  const canAdd = cu.rol !== 'delegado';

  document.getElementById('pMain').innerHTML = `
    ${canAdd ? `
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
      <button class="btn btn-t" onclick="openPartidoModal()">+ Programar Partido</button>
    </div>` : ''}
    ${!partidos.length ? '<p class="empty">No hay partidos programados.</p>' : partidos.map(p => partidoCard(p)).join('')}`;
}

function partidoCard(p) {
  const isLive = p.estado === 'en_vivo';
  const isDone = p.estado === 'finalizado';
  const canSuper = cu.rol === 'super';
  const canAdmin = cu.rol !== 'delegado';
  return `
    <div class="mc ${isDone ? 'mc-played' : isLive ? 'mc-live' : 'mc-pending'}">
      <div class="mc-top">
        <div>
          <span class="badge badge-teal">${p.categoria}</span>
          <span class="mc-meta" style="margin-left:8px">${fmt(p.fecha)}${p.hora?' · '+p.hora:''}</span>
          ${isLive ? `<span class="badge badge-live" style="margin-left:6px">🔴 EN VIVO · ${p.minuto}'</span>` : ''}
        </div>
        <div class="mc-actions">
          ${canAdmin && !isDone ? `<button class="btn btn-t btn-xs" onclick="openResultModal(${p.id})">✅ Resultado</button>` : ''}
          ${canAdmin ? `<button class="btn btn-o btn-xs" onclick="toggleVivo(${p.id},${!isLive})">${isLive ? '⏹ Detener' : '🔴 En Vivo'}</button>` : ''}
          <button class="btn btn-ghost btn-xs" onclick="openConvPanel(${p.id})">👥 Convocar</button>
          ${canAdmin ? `<button class="btn btn-ghost btn-xs" onclick="openPartidoModal(${p.id})">✏️</button>` : ''}
          ${canSuper ? `<button class="btn btn-r btn-xs" onclick="deletePartido(${p.id})">🗑</button>` : ''}
        </div>
      </div>
      <div class="mc-teams">
        <span class="mc-team">${p.local_nombre}</span>
        ${isDone  ? `<span class="mc-score">${p.goles_local} - ${p.goles_visitante}</span>` :
          isLive  ? `<span class="mc-live-score">${p.goles_local??0} - ${p.goles_visitante??0}</span>` :
                    `<span class="mc-vs">VS</span>`}
        <span class="mc-team">${p.visita_nombre}</span>
      </div>
      ${p.notas ? `<div class="mc-foot"><span style="font-size:11px;color:#5a9aaa">📍 ${p.notas}</span></div>` : ''}
    </div>`;
}

async function toggleVivo(id, vivo) {
  const minuto = vivo ? (prompt('Minuto actual (ej: 45):', '1') || '1') : '0';
  await API.post(`/api/partidos/${id}/vivo`, { vivo, minuto: parseInt(minuto) || 0 });
  showToast(vivo ? '🔴 Partido marcado EN VIVO' : '⏹ Partido fuera de En Vivo');
  renderPartidos();
}

async function deletePartido(id) {
  if (!confirm('¿Eliminar este partido?')) return;
  await API.delete(`/api/partidos/${id}`);
  showToast('Partido eliminado'); renderPartidos();
}

// ── Partido form modal ────────────────────────────
async function openPartidoModal(id = null) {
  const p = id ? await API.get(`/api/partidos/${id}`) : null;
  const catOptions = cats.map(c => `<option value="${c.id}"${p?.categoria===c.nombre?' selected':''}>${c.nombre}</option>`).join('');

  // Equipo options depend on selected category
  const eqOptions = (catId) => {
    return allEquipos.filter(e => e.categoria_id == catId).map(e =>
      `<option value="${e.id}">${e.nombre}</option>`
    ).join('');
  };
  const firstCatId = cats[0]?.id || '';
  const localEqs   = allEquipos.filter(e => p ? e.categoria === p.categoria : e.categoria_id == firstCatId);
  const visitaEqs  = localEqs;

  document.getElementById('modalBox').innerHTML = `
    <div class="modal-ttl">${p ? 'Editar Partido' : 'Programar Partido'}<button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="fg">
      <div><label class="fl">Fecha</label><input type="date" id="mFecha" value="${p?.fecha||''}"/></div>
      <div><label class="fl">Hora</label><input type="time" id="mHora" value="${p?.hora||''}"/></div>
      <div><label class="fl">Categoría</label>
        <select id="mCat" onchange="updateEquipoSelects()">${catOptions}</select>
      </div>
    </div>
    <div class="fg">
      <div><label class="fl">Equipo Local</label>
        <select id="mLocal">${localEqs.map(e => `<option value="${e.id}"${p?.equipo_local_id==e.id?' selected':''}>${e.nombre}</option>`).join('')}</select>
      </div>
      <div><label class="fl">Equipo Visitante</label>
        <select id="mVisita">${visitaEqs.map(e => `<option value="${e.id}"${p?.equipo_visitante_id==e.id?' selected':''}>${e.nombre}</option>`).join('')}</select>
      </div>
    </div>
    <div style="margin-bottom:12px"><label class="fl">Notas / Cancha</label><input type="text" id="mNotas" placeholder="Ej: Cancha Municipal" value="${p?.notas||''}"/></div>
    <div class="modal-btns">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-t" onclick="savePartido(${id || 'null'})">${p ? 'Guardar' : 'Programar'}</button>
    </div>`;
  document.getElementById('modalOv').classList.remove('hidden');
}

function updateEquipoSelects() {
  const catId = document.getElementById('mCat')?.value;
  const eqs = allEquipos.filter(e => e.categoria_id == catId);
  const opts = eqs.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('');
  document.getElementById('mLocal').innerHTML  = opts;
  document.getElementById('mVisita').innerHTML = opts;
}

async function savePartido(id) {
  const data = {
    fecha:               document.getElementById('mFecha').value,
    hora:                document.getElementById('mHora').value,
    categoria_id:        document.getElementById('mCat').value,
    equipo_local_id:     document.getElementById('mLocal').value,
    equipo_visitante_id: document.getElementById('mVisita').value,
    notas:               document.getElementById('mNotas').value,
  };
  if (!data.fecha || !data.equipo_local_id || !data.equipo_visitante_id) {
    return showToast('Completa fecha y equipos', true);
  }
  if (data.equipo_local_id === data.equipo_visitante_id) {
    return showToast('Los equipos no pueden ser el mismo', true);
  }
  try {
    if (id) await API.put(`/api/partidos/${id}`, data);
    else    await API.post('/api/partidos', data);
    closeModal(); showToast('✅ Partido guardado'); renderPartidos();
  } catch (e) { showToast(e.error || 'Error', true); }
}

// ── Resultado modal ───────────────────────────────
let _resultPartido = null;
async function openResultModal(id) {
  const p = await API.get(`/api/partidos/${id}`);
  _resultPartido = p;
  const jugadores = await API.get(`/api/jugadores?categoria_id=${cats.find(c=>c.nombre===p.categoria)?.id||''}`);
  const localJugs  = jugadores.filter(j => j.equipo_nombre === p.local_nombre);
  const visitaJugs = jugadores.filter(j => j.equipo_nombre === p.visita_nombre);
  const allJugs    = [...localJugs, ...visitaJugs];

  document.getElementById('resultModal').innerHTML = `
    <div class="modal-ttl">Cargar Resultado<button class="modal-close" onclick="closeResultModal()">✕</button></div>
    <div class="rm-score-row">
      <div class="rm-team-label">${p.local_nombre}</div>
      <input class="rm-score-input" type="number" id="rGL" min="0" value="${p.goles_local??0}"/>
      <span style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--teal)">-</span>
      <input class="rm-score-input" type="number" id="rGV" min="0" value="${p.goles_visitante??0}"/>
      <div class="rm-team-label">${p.visita_nombre}</div>
    </div>

    <div class="rm-section">
      <div class="rm-section-title">⚽ Goles (opcional)</div>
      <div id="golesList" class="rm-list"></div>
      <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr auto auto;gap:6px;align-items:end">
        <div><label class="fl">Jugador</label>
          <select id="gJugador">${allJugs.map(j=>`<option value="${j.id}">(${j.equipo_nombre}) ${j.nombre}</option>`).join('')}</select>
        </div>
        <div><label class="fl">Minuto</label><input type="number" id="gMin" min="1" max="120" placeholder="45"/></div>
        <button class="btn btn-t btn-sm" style="align-self:flex-end" onclick="addGol()">+ Gol</button>
        <div></div>
      </div>
    </div>

    <div class="rm-section">
      <div class="rm-section-title">🟨 Tarjetas (opcional)</div>
      <div id="tarjetasList" class="rm-list"></div>
      <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr auto auto;gap:6px;align-items:end">
        <div><label class="fl">Jugador</label>
          <select id="tJugador">${allJugs.map(j=>`<option value="${j.id}">(${j.equipo_nombre}) ${j.nombre}</option>`).join('')}</select>
        </div>
        <div><label class="fl">Tipo</label>
          <select id="tTipo"><option value="amarilla">🟨 Amarilla</option><option value="roja">🟥 Roja</option></select>
        </div>
        <button class="btn btn-o btn-sm" style="align-self:flex-end" onclick="addTarjeta()">+ Tarjeta</button>
        <div></div>
      </div>
    </div>

    <div class="modal-btns">
      <button class="btn btn-ghost" onclick="closeResultModal()">Cancelar</button>
      <button class="btn btn-t" onclick="saveResultado()">💾 Guardar Resultado</button>
    </div>`;
  document.getElementById('resultOv').classList.remove('hidden');

  window._golesTemp    = (p.goles || []).map(g => ({ jugador_id: g.jugador_id, nombre: g.jugador_nombre, equipo: g.equipo_nombre, minuto: g.minuto }));
  window._tarjetasTemp = (p.tarjetas || []).map(t => ({ jugador_id: t.jugador_id, nombre: t.jugador_nombre, equipo: t.equipo_nombre, tipo: t.tipo, minuto: t.minuto }));
  renderGolesTemp(); renderTarjetasTemp();
}

function renderGolesTemp() {
  document.getElementById('golesList').innerHTML = !window._golesTemp.length
    ? '<p class="empty" style="padding:8px 0">Sin goles registrados</p>'
    : window._golesTemp.map((g, i) => `
        <div class="rm-item">
          <span class="rm-item-name">⚽ ${g.nombre} <span style="color:#5a9aaa">(${g.equipo})</span></span>
          <div style="display:flex;align-items:center;gap:8px">
            ${g.minuto ? `<span style="color:var(--teal);font-size:12px">${g.minuto}'</span>` : ''}
            <button class="btn btn-r btn-xs" onclick="removeGol(${i})">✕</button>
          </div>
        </div>`).join('');
}
function renderTarjetasTemp() {
  document.getElementById('tarjetasList').innerHTML = !window._tarjetasTemp.length
    ? '<p class="empty" style="padding:8px 0">Sin tarjetas registradas</p>'
    : window._tarjetasTemp.map((t, i) => `
        <div class="rm-item">
          <span class="rm-item-name">${t.tipo==='amarilla'?'🟨':'🟥'} ${t.nombre} <span style="color:#5a9aaa">(${t.equipo})</span></span>
          <div style="display:flex;align-items:center;gap:8px">
            ${t.minuto ? `<span style="color:var(--teal);font-size:12px">${t.minuto}'</span>` : ''}
            <button class="btn btn-r btn-xs" onclick="removeTarjeta(${i})">✕</button>
          </div>
        </div>`).join('');
}

function addGol() {
  const jugadorId = document.getElementById('gJugador').value;
  const select    = document.getElementById('gJugador');
  const nombre    = select.options[select.selectedIndex].text;
  const minuto    = parseInt(document.getElementById('gMin').value) || null;
  window._golesTemp.push({ jugador_id: parseInt(jugadorId), nombre: nombre.split(') ')[1], equipo: nombre.split('(')[1]?.split(')')[0], minuto });
  renderGolesTemp();
}
function removeGol(i) { window._golesTemp.splice(i, 1); renderGolesTemp(); }

function addTarjeta() {
  const jugadorId = document.getElementById('tJugador').value;
  const select    = document.getElementById('tJugador');
  const nombre    = select.options[select.selectedIndex].text;
  const tipo      = document.getElementById('tTipo').value;
  window._tarjetasTemp.push({ jugador_id: parseInt(jugadorId), nombre: nombre.split(') ')[1], equipo: nombre.split('(')[1]?.split(')')[0], tipo });
  renderTarjetasTemp();
}
function removeTarjeta(i) { window._tarjetasTemp.splice(i, 1); renderTarjetasTemp(); }

async function saveResultado() {
  const goles_local     = parseInt(document.getElementById('rGL').value) || 0;
  const goles_visitante = parseInt(document.getElementById('rGV').value) || 0;
  try {
    await API.post(`/api/partidos/${_resultPartido.id}/resultado`, {
      goles_local, goles_visitante,
      goles:    window._golesTemp,
      tarjetas: window._tarjetasTemp,
    });
    closeResultModal(); showToast('✅ Resultado guardado'); renderPartidos();
  } catch (e) { showToast(e.error || 'Error', true); }
}

function closeResultModal() { document.getElementById('resultOv').classList.add('hidden'); }

// ═══════════════════════════════════════════════════════════════
// TAB: CONVOCATORIAS
// ═══════════════════════════════════════════════════════════════
async function renderConvocatorias() {
  const cat = cats.find(c => c.nombre === pCat);
  const url = cat ? `/api/partidos?categoria_id=${cat.id}` : '/api/partidos';
  const partidos = await API.get(url).catch(() => []);
  const pendientes = partidos.filter(p => p.estado === 'programado' || p.estado === 'en_vivo');

  document.getElementById('pMain').innerHTML = !pendientes.length
    ? '<p class="empty">No hay partidos próximos en esta categoría.</p>'
    : `<div style="margin-bottom:12px;color:var(--text);font-size:13px">
         Selecciona un partido para gestionar la convocatoria de cada equipo.
       </div>
       ${pendientes.map(p => `
        <div class="mc mc-pending" style="margin-bottom:10px">
          <div class="mc-top">
            <div>
              <span class="badge badge-teal">${p.categoria}</span>
              <span class="mc-meta" style="margin-left:8px">${fmt(p.fecha)}${p.hora?' · '+p.hora:''}</span>
            </div>
            <button class="btn btn-t btn-sm" onclick="openConvPanel(${p.id})">👥 Gestionar Convocatoria</button>
          </div>
          <div class="mc-teams">
            <span class="mc-team">${p.local_nombre}</span>
            <span class="mc-vs">VS</span>
            <span class="mc-team">${p.visita_nombre}</span>
          </div>
        </div>`).join('')}`;
}

// ── Convocatoria panel ────────────────────────────
async function openConvPanel(partidoId) {
  document.getElementById('convOv').classList.remove('hidden');
  document.getElementById('convModal').innerHTML = '<p class="empty" style="padding:30px">Cargando...</p>';

  const [partido, convocados] = await Promise.all([
    API.get(`/api/partidos/${partidoId}`),
    API.get(`/api/partidos/${partidoId}/convocatoria`),
  ]);
  const catObj = cats.find(c => c.nombre === partido.categoria);

  // Determine which teams this user can manage
  let teamsToManage = [
    { id: partido.equipo_local_id,     nombre: partido.local_nombre },
    { id: partido.equipo_visitante_id, nombre: partido.visita_nombre },
  ];
  if (cu.rol === 'delegado') {
    teamsToManage = teamsToManage.filter(t => t.id === cu.equipo_id);
  }

  let html = `
    <div class="modal-ttl" style="flex-direction:column;align-items:flex-start;gap:8px">
      <div style="display:flex;width:100%;align-items:center;justify-content:space-between">
        <span>👥 Convocatoria</span>
        <button class="modal-close" onclick="closeConvOv()">✕</button>
      </div>
      <div style="font-size:13px;color:var(--text)">${partido.local_nombre} vs ${partido.visita_nombre} · ${fmt(partido.fecha)}</div>
    </div>`;

  for (const team of teamsToManage) {
    const jugadores    = await API.get(`/api/jugadores?equipo_id=${team.id}`);
    const convIds      = convocados.filter(c => c.equipo_id === team.id).map(c => c.jugador_id);
    const convJugs     = convocados.filter(c => c.equipo_id === team.id);

    html += `
      <div style="margin-bottom:22px">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;color:var(--orange);
                    padding-bottom:8px;border-bottom:1px solid var(--border);margin-bottom:12px">
          🛡️ ${team.nombre}
          <span style="font-size:12px;color:var(--teal);font-family:'Nunito',sans-serif;letter-spacing:0;margin-left:8px">${convIds.length} convocados</span>
        </div>
        ${!jugadores.length
          ? `<p class="empty">Sin jugadores registrados. <a class="text-teal" href="/panel.html#jugadores">Agregar jugadores →</a></p>`
          : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px">
               ${jugadores.map(j => {
                 const sel = convIds.includes(j.id);
                 return `
                   <div onclick="toggleConv(${partidoId},${j.id},${team.id},${sel},this)"
                        style="background:${sel?'rgba(0,212,170,.12)':'rgba(0,30,50,.5)'};
                               border:1.5px solid ${sel?'var(--teal)':'var(--border)'};
                               border-radius:10px;padding:10px;text-align:center;cursor:pointer;transition:all .15s;"
                        title="Clic para ${sel?'quitar de':'agregar a'} la convocatoria">
                     <div style="width:44px;height:44px;border-radius:50%;overflow:hidden;background:var(--teal3);
                                 display:flex;align-items:center;justify-content:center;margin:0 auto 7px;font-size:20px">
                       ${j.foto ? `<img src="/uploads/jugadores/${j.foto}" style="width:100%;height:100%;object-fit:cover">` : '👤'}
                     </div>
                     <div style="font-family:'Bebas Neue',sans-serif;font-size:16px;color:var(--orange)">${j.numero ?? '—'}</div>
                     <div style="font-weight:800;font-size:11px;color:var(--white);line-height:1.2">${j.nombre}</div>
                     <div style="font-size:10px;color:${POS_COLOR[j.posicion]||'var(--teal)'}">${POS_ICON[j.posicion]||''} ${j.posicion||''}</div>
                     ${sel ? `<div style="color:var(--teal);font-size:10px;font-weight:800;margin-top:4px">✓ CONVOCADO</div>` : ''}
                   </div>`;
               }).join('')}
             </div>`}
      </div>`;
  }

  html += `<div class="modal-btns"><button class="btn btn-t" onclick="closeConvOv()">Cerrar</button></div>`;
  document.getElementById('convModal').innerHTML = html;
}

async function toggleConv(partidoId, jugadorId, equipoId, currentlySelected, el) {
  try {
    if (currentlySelected) {
      await API.delete(`/api/partidos/${partidoId}/convocatoria/${jugadorId}`);
      showToast('Jugador quitado de la convocatoria');
    } else {
      await API.post(`/api/partidos/${partidoId}/convocatoria`, { jugador_id: jugadorId, equipo_id: equipoId });
      showToast('✅ Jugador convocado');
    }
    // Refresh the modal
    openConvPanel(partidoId);
  } catch (e) { showToast(e.error || 'Error', true); }
}

function closeConvOv() { document.getElementById('convOv').classList.add('hidden'); }

// ═══════════════════════════════════════════════════════════════
// TAB: EQUIPOS
// ═══════════════════════════════════════════════════════════════
async function renderEquipos() {
  const cat = cats.find(c => c.nombre === pCat);
  const equipos = cat
    ? await API.get(`/api/equipos?categoria_id=${cat.id}`)
    : allEquipos;
  const canAdd = cu.rol !== 'delegado';

  document.getElementById('pMain').innerHTML = `
    ${canAdd ? `
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
      <button class="btn btn-t" onclick="openEquipoModal()">+ Nuevo Equipo</button>
    </div>` : ''}
    ${!equipos.length ? '<p class="empty">No hay equipos en esta categoría.</p>'
      : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
          ${equipos.map(e => `
            <div class="card" style="display:flex;flex-direction:column;gap:12px">
              <div style="display:flex;align-items:center;gap:12px">
                <div style="width:52px;height:52px;border-radius:50%;overflow:hidden;background:var(--teal3);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0">
                  ${e.escudo ? `<img src="/uploads/equipos/${e.escudo}" style="width:100%;height:100%;object-fit:cover">` : '🛡️'}
                </div>
                <div>
                  <div style="font-weight:800;font-size:16px">${e.nombre}</div>
                  <div style="font-size:11px;color:var(--teal)">${e.categoria}</div>
                </div>
              </div>
              ${canAdd ? `
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn btn-ghost btn-xs" onclick="openEquipoModal(${e.id})">✏️ Editar</button>
                <label class="btn btn-o btn-xs" style="cursor:pointer">
                  🖼 Escudo
                  <input type="file" accept="image/*" style="display:none" onchange="uploadEscudo(${e.id},this)"/>
                </label>
                ${cu.rol==='super'?`<button class="btn btn-r btn-xs" onclick="deleteEquipo(${e.id})">🗑</button>`:''}
              </div>` : ''}
            </div>`).join('')}
         </div>`}`;
}

async function openEquipoModal(id = null) {
  const e = id ? await API.get(`/api/equipos/${id}`) : null;
  document.getElementById('modalBox').innerHTML = `
    <div class="modal-ttl">${e ? 'Editar Equipo' : 'Nuevo Equipo'}<button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="fg">
      <div style="grid-column:1/-1"><label class="fl">Nombre del Equipo</label><input id="eNombre" type="text" value="${e?.nombre||''}" placeholder="Nombre del equipo"/></div>
      <div><label class="fl">Categoría</label>
        <select id="eCat">${cats.map(c=>`<option value="${c.id}"${e?.categoria===c.nombre?' selected':''}>${c.nombre}</option>`).join('')}</select>
      </div>
    </div>
    <div class="modal-btns">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-t" onclick="saveEquipo(${id||'null'})">${e ? 'Guardar' : 'Crear'}</button>
    </div>`;
  document.getElementById('modalOv').classList.remove('hidden');
}

async function saveEquipo(id) {
  const data = { nombre: document.getElementById('eNombre').value.trim(), categoria_id: document.getElementById('eCat').value };
  if (!data.nombre) return showToast('Ingresa el nombre del equipo', true);
  try {
    if (id) await API.put(`/api/equipos/${id}`, data);
    else    await API.post('/api/equipos', data);
    closeModal();
    allEquipos = await API.get('/api/equipos');
    showToast('✅ Equipo guardado'); renderEquipos();
  } catch (e) { showToast(e.error || 'Error', true); }
}

async function deleteEquipo(id) {
  if (!confirm('¿Eliminar equipo? Se eliminarán sus jugadores también.')) return;
  await API.delete(`/api/equipos/${id}`);
  allEquipos = await API.get('/api/equipos');
  showToast('Equipo eliminado'); renderEquipos();
}

async function uploadEscudo(id, input) {
  const fd = new FormData(); fd.append('imagen', input.files[0]);
  try {
    await API.upload(`/api/equipos/${id}/escudo`, fd);
    allEquipos = await API.get('/api/equipos');
    showToast('✅ Escudo actualizado'); renderEquipos();
  } catch (e) { showToast(e.error || 'Error al subir imagen', true); }
}

// ═══════════════════════════════════════════════════════════════
// TAB: JUGADORES
// ═══════════════════════════════════════════════════════════════
async function renderJugadores() {
  const cat = cats.find(c => c.nombre === pCat);
  let url = '/api/jugadores';
  if (cu.rol === 'delegado' && cu.equipo_id) {
    url = `/api/jugadores?equipo_id=${cu.equipo_id}`;
  } else if (cat) {
    url += `?categoria_id=${cat.id}`;
  }
  const jugadores = await API.get(url).catch(() => []);
  const myEqs = cu.rol === 'delegado' ? [cu.equipo_id] : null;

  document.getElementById('pMain').innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
      <button class="btn btn-t" onclick="openJugadorModal()">+ Nuevo Jugador</button>
    </div>
    ${!jugadores.length ? '<p class="empty">No hay jugadores en esta selección.</p>'
      : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
          ${jugadores.map(j => `
            <div class="card" style="padding:16px;text-align:center">
              <div style="width:60px;height:60px;border-radius:50%;overflow:hidden;background:var(--teal3);
                          display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-size:28px">
                ${j.foto ? `<img src="/uploads/jugadores/${j.foto}" style="width:100%;height:100%;object-fit:cover">` : '👤'}
              </div>
              <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--orange)">${j.numero ?? '—'}</div>
              <div style="font-weight:800;font-size:13px;margin-bottom:3px">${j.nombre}</div>
              <div style="font-size:11px;color:${POS_COLOR[j.posicion]||'var(--teal)'};margin-bottom:3px">${POS_ICON[j.posicion]||'⚽'} ${j.posicion||''}</div>
              <div style="font-size:11px;color:#5a9aaa;margin-bottom:10px">${j.equipo_nombre}${j.edad?' · '+j.edad+' años':''}</div>
              <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
                <button class="btn btn-ghost btn-xs" onclick="openJugadorModal(${j.id})">✏️</button>
                <label class="btn btn-o btn-xs" style="cursor:pointer" title="Subir foto">
                  📷
                  <input type="file" accept="image/*" style="display:none" onchange="uploadFoto(${j.id},this)"/>
                </label>
                ${(cu.rol==='super'||cu.rol==='admin') ? `<button class="btn btn-r btn-xs" onclick="deleteJugador(${j.id})">🗑</button>` : ''}
              </div>
            </div>`).join('')}
         </div>`}`;
}

async function openJugadorModal(id = null) {
  const j = id ? await API.get(`/api/jugadores/${id}`) : null;
  // Equipo options: delegado only sees their team
  let eqOptions;
  if (cu.rol === 'delegado') {
    const eq = allEquipos.find(e => e.id === cu.equipo_id);
    eqOptions = eq ? `<option value="${eq.id}">${eq.nombre}</option>` : '';
  } else {
    const catId = cats.find(c => c.nombre === pCat)?.id;
    const eqs   = catId ? allEquipos.filter(e => e.categoria_id == catId) : allEquipos;
    eqOptions = eqs.map(e => `<option value="${e.id}"${j?.equipo_id==e.id?' selected':''}>${e.nombre} (${e.categoria})</option>`).join('');
  }

  document.getElementById('modalBox').innerHTML = `
    <div class="modal-ttl">${j ? 'Editar Jugador' : 'Nuevo Jugador'}<button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="fg">
      <div style="grid-column:1/-1"><label class="fl">Nombre Completo</label><input id="jNombre" value="${j?.nombre||''}" placeholder="Nombre del jugador"/></div>
      <div><label class="fl">Posición</label>
        <select id="jPos">
          ${['Portero','Defensa','Mediocampista','Delantero'].map(p=>`<option${j?.posicion===p?' selected':''}>${p}</option>`).join('')}
        </select>
      </div>
      <div><label class="fl">Número</label><input type="number" id="jNum" min="1" max="99" value="${j?.numero||''}" placeholder="10"/></div>
      <div><label class="fl">Edad</label><input type="number" id="jEdad" min="8" max="60" value="${j?.edad||''}" placeholder="20"/></div>
      <div><label class="fl">Equipo</label><select id="jEquipo">${eqOptions}</select></div>
    </div>
    <div class="modal-btns">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-t" onclick="saveJugador(${id||'null'})">${j ? 'Guardar' : 'Agregar'}</button>
    </div>`;
  document.getElementById('modalOv').classList.remove('hidden');
}

async function saveJugador(id) {
  const data = {
    nombre:    document.getElementById('jNombre').value.trim(),
    posicion:  document.getElementById('jPos').value,
    numero:    document.getElementById('jNum').value || null,
    edad:      document.getElementById('jEdad').value || null,
    equipo_id: document.getElementById('jEquipo').value,
  };
  if (!data.nombre) return showToast('Ingresa el nombre del jugador', true);
  try {
    if (id) await API.put(`/api/jugadores/${id}`, data);
    else    await API.post('/api/jugadores', data);
    closeModal(); showToast('✅ Jugador guardado'); renderJugadores();
  } catch (e) { showToast(e.error || 'Error', true); }
}

async function deleteJugador(id) {
  if (!confirm('¿Eliminar jugador?')) return;
  await API.delete(`/api/jugadores/${id}`);
  showToast('Jugador eliminado'); renderJugadores();
}

async function uploadFoto(id, input) {
  const fd = new FormData(); fd.append('imagen', input.files[0]);
  try {
    await API.upload(`/api/jugadores/${id}/foto`, fd);
    showToast('✅ Foto actualizada'); renderJugadores();
  } catch (e) { showToast(e.error || 'Error al subir foto', true); }
}

// ═══════════════════════════════════════════════════════════════
// TAB: ESTADÍSTICAS
// ═══════════════════════════════════════════════════════════════
async function renderEstadisticas() {
  const cat = cats.find(c => c.nombre === pCat);
  const [standings, goles, tarjetas] = await Promise.all([
    cat ? API.get(`/api/standings?categoria_id=${cat.id}`) : Promise.resolve([]),
    API.get(`/api/goleadores${cat?'?categoria_id='+cat.id:''}`),
    API.get(`/api/tarjetas${cat?'?categoria_id='+cat.id:''}`),
  ]);

  document.getElementById('pMain').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr;gap:20px">
      <div class="card">
        <div class="card-title">🏆 Tabla · ${pCat}</div>
        ${!standings.length ? '<p class="empty">Sin datos.</p>' : `
        <div class="t-wrap"><table>
          <thead><tr><th>#</th><th style="text-align:left">Equipo</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>DG</th><th>PTS</th></tr></thead>
          <tbody>${standings.map((r,i)=>`
            <tr class="${i===0?'r1':i===1?'r2':'ra'}">
              <td>${medal(i)}</td><td class="tdl">${r.nombre}</td>
              <td>${r.pj}</td><td>${r.pg}</td><td>${r.pe}</td><td>${r.pp}</td>
              <td>${r.gf}</td><td>${r.gc}</td>
              <td style="color:${r.dg>=0?'var(--teal)':'var(--red)'}">${r.dg>0?'+':''}${r.dg}</td>
              <td class="tdpts">${r.pts}</td>
            </tr>`).join('')}</tbody>
        </table></div>`}
      </div>
      <div class="two-col">
        <div class="mini-card">
          <div class="mini-title">⚽ Goleadores</div>
          ${!goles.length ? '<p class="empty">Sin goles.</p>' : `<table>
            <thead><tr><th>#</th><th style="text-align:left">Jugador</th><th>Equipo</th><th>Goles</th></tr></thead>
            <tbody>${goles.map((g,i)=>`<tr><td>${i+1}</td><td class="tdl">${g.nombre}</td><td style="font-size:12px;color:var(--text)">${g.equipo}</td><td><span style="background:var(--teal3);border:1px solid var(--teal);border-radius:20px;padding:2px 10px;color:var(--teal);font-weight:700;font-size:12px">${g.goles}</span></td></tr>`).join('')}</tbody>
          </table>`}
        </div>
        <div class="mini-card">
          <div class="mini-title">🟨 Disciplina</div>
          ${!tarjetas.length ? '<p class="empty">Sin tarjetas.</p>' : `<table>
            <thead><tr><th>#</th><th style="text-align:left">Jugador</th><th>🟨</th><th>🟥</th></tr></thead>
            <tbody>${tarjetas.map((t,i)=>`<tr><td>${i+1}</td><td class="tdl">${t.nombre}</td><td>${t.amarillas?`<span class="amar">${t.amarillas}</span>`:'-'}</td><td>${t.rojas?`<span class="roja">${t.rojas}</span>`:'-'}</td></tr>`).join('')}</tbody>
          </table>`}
        </div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// TAB: USUARIOS (solo super)
// ═══════════════════════════════════════════════════════════════
async function renderUsuarios() {
  const usuarios = await API.get('/api/usuarios').catch(() => []);
  document.getElementById('pMain').innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
      <button class="btn btn-t" onclick="openUserModal()">+ Nuevo Usuario</button>
    </div>
    <div class="u-grid">${usuarios.map(u => `
      <div class="u-card">
        <div class="u-top">
          <div class="u-av ${u.rol}">
            ${u.rol==='super'?'👑':u.rol==='admin'?'⚙️':'🏅'}
          </div>
          <div>
            <div class="u-name">${u.nombre}</div>
            <div class="u-user">@${u.usuario}</div>
          </div>
        </div>
        <span class="badge ${u.rol==='super'?'badge-gold':u.rol==='admin'?'badge-orange':'badge-teal'}">${u.rol}</span>
        ${u.equipo_nombre ? `<div class="u-info">🛡️ ${u.equipo_nombre}</div>` : ''}
        <div class="divider"></div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-xs" onclick="openUserModal(${u.id})">✏️ Editar</button>
          ${u.id !== cu.id ? `<button class="btn btn-r btn-xs" onclick="deleteUser(${u.id})">🗑</button>` : ''}
        </div>
      </div>`).join('')}
    </div>`;
}

async function openUserModal(id = null) {
  const u = id ? (await API.get('/api/usuarios').catch(()=>[]))?.find(x => x.id === id) : null;
  const eqOptions = allEquipos.map(e => `<option value="${e.id}"${u?.equipo_id==e.id?' selected':''}>${e.nombre} (${e.categoria})</option>`).join('');

  document.getElementById('modalBox').innerHTML = `
    <div class="modal-ttl">${u ? 'Editar Usuario' : 'Nuevo Usuario'}<button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="fg">
      <div><label class="fl">Nombre</label><input id="uNombre" value="${u?.nombre||''}" placeholder="Nombre completo"/></div>
      <div><label class="fl">Usuario</label><input id="uUsuario" value="${u?.usuario||''}" placeholder="usuario123"/></div>
      <div><label class="fl">Contraseña ${u?'(dejar vacío = no cambiar)':''}</label><input type="password" id="uPass" placeholder="••••••••"/></div>
      <div><label class="fl">Rol</label>
        <select id="uRol" onchange="toggleEquipoField()">
          <option${u?.rol==='super'?' selected':''}>super</option>
          <option${u?.rol==='admin'?' selected':''}>admin</option>
          <option${u?.rol==='delegado'?' selected':''}>delegado</option>
        </select>
      </div>
      <div id="uEquipoField" style="${u?.rol==='delegado'||!u?'':'display:none'}">
        <label class="fl">Equipo (si es delegado)</label>
        <select id="uEquipo"><option value="">— Sin equipo —</option>${eqOptions}</select>
      </div>
    </div>
    <div class="modal-btns">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-t" onclick="saveUser(${id||'null'})">${u ? 'Guardar' : 'Crear'}</button>
    </div>`;
  document.getElementById('modalOv').classList.remove('hidden');
}

function toggleEquipoField() {
  const show = document.getElementById('uRol')?.value === 'delegado';
  document.getElementById('uEquipoField').style.display = show ? '' : 'none';
}

async function saveUser(id) {
  const data = {
    nombre:    document.getElementById('uNombre').value.trim(),
    usuario:   document.getElementById('uUsuario').value.trim(),
    password:  document.getElementById('uPass').value || undefined,
    rol:       document.getElementById('uRol').value,
    equipo_id: document.getElementById('uEquipo')?.value || null,
  };
  if (!data.nombre || !data.usuario) return showToast('Completa nombre y usuario', true);
  if (!id && !data.password) return showToast('La contraseña es requerida para usuario nuevo', true);
  try {
    if (id) await API.put(`/api/usuarios/${id}`, data);
    else    await API.post('/api/usuarios', data);
    closeModal(); showToast('✅ Usuario guardado'); renderUsuarios();
  } catch (e) { showToast(e.error || 'Error', true); }
}

async function deleteUser(id) {
  if (!confirm('¿Eliminar usuario?')) return;
  await API.delete(`/api/usuarios/${id}`);
  showToast('Usuario eliminado'); renderUsuarios();
}

// ═══════════════════════════════════════════════════════════════
// TAB: BACKUP
// ═══════════════════════════════════════════════════════════════
function renderBackup() {
  document.getElementById('pMain').innerHTML = `
    <div class="backup-grid">
      <div class="backup-card">
        <div class="backup-icon">🗄️</div>
        <div class="backup-title">Backup SQLite</div>
        <div class="backup-desc">Descarga el archivo de base de datos completo (.db). Guárdalo en un lugar seguro para restaurar si algo sale mal.</div>
        <a class="btn btn-t btn-full" href="/api/backup/db" download>⬇️ Descargar .db</a>
      </div>
      <div class="backup-card">
        <div class="backup-icon">📄</div>
        <div class="backup-title">Exportar JSON</div>
        <div class="backup-desc">Exporta todos los datos en formato JSON. Útil para migrar a otro sistema o revisar los datos.</div>
        <a class="btn btn-o btn-full" href="/api/backup/json" download>⬇️ Exportar JSON</a>
      </div>
      <div class="backup-card">
        <div class="backup-icon">📁</div>
        <div class="backup-title">Archivos de Fotos</div>
        <div class="backup-desc">Las fotos de jugadores y escudos están en la carpeta <code style="color:var(--teal)">/uploads/</code> del servidor. Cópialos para respaldarlos.</div>
        <div style="background:var(--glass2);border:1px solid var(--border);border-radius:8px;padding:10px;font-size:12px;color:var(--text);text-align:left;margin-top:8px">
          📂 <code>liga-caribe/uploads/jugadores/</code><br/>
          📂 <code>liga-caribe/uploads/equipos/</code>
        </div>
      </div>
    </div>
    <div style="margin-top:28px;background:var(--orange2);border:1px solid rgba(255,159,28,.3);border-radius:12px;padding:16px;font-size:13px;color:#e8c060">
      💡 <strong>Recomendación:</strong> Descarga el backup .db al menos una vez por semana y guárdalo en Google Drive o USB.
      La base de datos se encuentra en <code>liga-caribe/db/liga.db</code>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// SHARED MODAL CLOSE
// ═══════════════════════════════════════════════════════════════
function closeModal() { document.getElementById('modalOv').classList.add('hidden'); }

// Close modal on overlay click
document.getElementById('modalOv')?.addEventListener('click', e => {
  if (e.target === document.getElementById('modalOv')) closeModal();
});

// ── Boot ──────────────────────────────────────────────────────
init();
