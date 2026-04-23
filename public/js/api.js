// ═══════════════════════════════════════════════
// API helper — Liga Caribe
// ═══════════════════════════════════════════════
const API = {
  async _req(method, url, data) {
    const opts = { method, headers: {} };
    if (data instanceof FormData) {
      opts.body = data;
    } else if (data) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(data);
    }
    const r = await fetch(url, opts);
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw json;
    return json;
  },
  get:    (url)       => API._req('GET',    url),
  post:   (url, data) => API._req('POST',   url, data),
  put:    (url, data) => API._req('PUT',    url, data),
  delete: (url)       => API._req('DELETE', url),
  upload: (url, formData) => API._req('POST', url, formData),
};

// ── Auth state ──────────────────────────────────
let _user = null;

async function initAuth() {
  const { user } = await API.get('/api/auth/me');
  _user = user;
  return user;
}
function getUser()  { return _user; }
function setUser(u) { _user = u; }

async function doLogout() {
  await API.post('/api/auth/logout');
  _user = null;
  window.location.href = '/';
}

// ── Helpers ─────────────────────────────────────
function fmt(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  const m = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${String(d.getDate()).padStart(2,'0')} ${m[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  const m = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${d.getDate()} ${m[d.getMonth()]}`;
}

function photoUrl(filename, type = 'jugadores') {
  return filename ? `/uploads/${type}/${filename}` : null;
}

function playerAvatar(foto, size = 44) {
  if (foto) return `<img src="/uploads/jugadores/${foto}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  return '👤';
}

function escudoAvatar(escudo) {
  if (escudo) return `<img src="/uploads/equipos/${escudo}" alt="" style="width:100%;height:100%;object-fit:cover">`;
  return '🛡️';
}

function medal(i) {
  if (i === 0) return `<span class="medal m1">1</span>`;
  if (i === 1) return `<span class="medal m2">2</span>`;
  if (i === 2) return `<span class="medal m3">3</span>`;
  return `<span class="pb">${i + 1}</span>`;
}

const POS_COLOR = { Portero:'#ffd700', Defensa:'#00d4aa', Mediocampista:'#ff9f1c', Delantero:'#e63946' };
const POS_ICON  = { Portero:'🧤', Defensa:'🛡️', Mediocampista:'🔄', Delantero:'⚡' };

// ── Toast ────────────────────────────────────────
let _toast;
function showToast(msg, isError = false) {
  if (!_toast) {
    _toast = document.createElement('div');
    _toast.className = 'toast';
    document.body.appendChild(_toast);
  }
  _toast.textContent = msg;
  _toast.className = `toast${isError ? ' error' : ''}`;
  requestAnimationFrame(() => _toast.classList.add('show'));
  clearTimeout(_toast._t);
  _toast._t = setTimeout(() => _toast.classList.remove('show'), 2800);
}

// ── Alert ────────────────────────────────────────
function showAlert(msg) {
  const ov = document.getElementById('alertOv');
  const el = document.getElementById('alertMsg');
  if (ov && el) { el.textContent = msg; ov.classList.remove('hidden'); }
  else alert(msg);
}
function closeAlert() { document.getElementById('alertOv')?.classList.add('hidden'); }

// ── Nav render ────────────────────────────────────
function renderNav(activePage) {
  const pages = [
    { href: '/',                label: 'Inicio' },
    { href: '/resultados.html', label: 'Resultados' },
    { href: '/equipos.html',    label: 'Equipos' },
    { href: '/programacion.html', label: 'Programación' },
  ];
  const links = pages.map(p =>
    `<a class="nav-a${p.href === activePage ? ' active' : ''}" href="${p.href}">${p.label}</a>`
  ).join('');

  document.getElementById('mainNav').innerHTML = `
    <nav class="top-nav">
      <div class="nav-inner">
        <a class="nav-brand" href="/">
          <span class="nav-ball">⚽</span>
          <div>
            <div class="nav-name">LIGA CARIBE</div>
            <div class="nav-loc">Puerto Barrios · Izabal · 2026</div>
          </div>
        </a>
        <div class="nav-links" id="navLinks">${links}
          <a class="nav-btn" href="/panel.html">⚙️ Panel</a>
        </div>
        <button class="nav-mobile-menu" onclick="toggleMobileNav()">☰</button>
      </div>
      <div class="mobile-nav" id="mobileNav">${links}
        <a class="nav-a" href="/panel.html">⚙️ Panel Admin</a>
      </div>
    </nav>`;
}

function toggleMobileNav() {
  document.getElementById('mobileNav')?.classList.toggle('open');
}

// ── Cat pills ─────────────────────────────────────
function renderCatPills(containerId, cats, active, onSelect) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = ['Todos', ...cats].map(c =>
    `<button class="cat-pill${c === active ? ' on' : ''}" onclick="(${onSelect.toString()})('${c}')">${c}</button>`
  ).join('');
}
