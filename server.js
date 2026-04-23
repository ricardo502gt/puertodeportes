const express  = require('express');
const session  = require('express-session');
const multer   = require('multer');
const sqlite3  = require('sqlite3');
const { open } = require('sqlite');
const path     = require('path');
const fs       = require('fs');

const app  = express();
const PORT = 3000;

// ─── Directorios ────────────────────────────────────────────
['db','uploads/jugadores','uploads/equipos'].forEach(d => {
  const p = path.join(__dirname, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ─── Base de datos ───────────────────────────────────────────
let db;
async function initDb() {
  db = await open({ filename: path.join(__dirname,'db','liga.db'), driver: sqlite3.Database });
  await db.run('PRAGMA journal_mode = WAL');
  await db.run('PRAGMA foreign_keys = ON');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS categorias (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS equipos (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre       TEXT NOT NULL,
      escudo       TEXT,
      categoria_id INTEGER NOT NULL,
      FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS jugadores (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre    TEXT NOT NULL,
      posicion  TEXT,
      numero    INTEGER,
      edad      INTEGER,
      equipo_id INTEGER NOT NULL,
      foto      TEXT,
      FOREIGN KEY (equipo_id) REFERENCES equipos(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS partidos (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha               TEXT NOT NULL,
      hora                TEXT,
      equipo_local_id     INTEGER NOT NULL,
      equipo_visitante_id INTEGER NOT NULL,
      categoria_id        INTEGER NOT NULL,
      goles_local         INTEGER,
      goles_visitante     INTEGER,
      estado              TEXT DEFAULT 'programado',
      minuto              INTEGER DEFAULT 0,
      notas               TEXT,
      FOREIGN KEY (equipo_local_id)     REFERENCES equipos(id),
      FOREIGN KEY (equipo_visitante_id) REFERENCES equipos(id),
      FOREIGN KEY (categoria_id)        REFERENCES categorias(id)
    );
    CREATE TABLE IF NOT EXISTS convocatorias (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      partido_id INTEGER NOT NULL,
      jugador_id INTEGER NOT NULL,
      equipo_id  INTEGER NOT NULL,
      UNIQUE(partido_id, jugador_id),
      FOREIGN KEY (partido_id) REFERENCES partidos(id)  ON DELETE CASCADE,
      FOREIGN KEY (jugador_id) REFERENCES jugadores(id) ON DELETE CASCADE,
      FOREIGN KEY (equipo_id)  REFERENCES equipos(id)
    );
    CREATE TABLE IF NOT EXISTS goles_partido (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      partido_id INTEGER NOT NULL,
      jugador_id INTEGER NOT NULL,
      minuto     INTEGER,
      FOREIGN KEY (partido_id) REFERENCES partidos(id)  ON DELETE CASCADE,
      FOREIGN KEY (jugador_id) REFERENCES jugadores(id)
    );
    CREATE TABLE IF NOT EXISTS tarjetas_partido (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      partido_id INTEGER NOT NULL,
      jugador_id INTEGER NOT NULL,
      tipo       TEXT NOT NULL,
      minuto     INTEGER,
      FOREIGN KEY (partido_id) REFERENCES partidos(id)  ON DELETE CASCADE,
      FOREIGN KEY (jugador_id) REFERENCES jugadores(id)
    );
    CREATE TABLE IF NOT EXISTS usuarios (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario   TEXT NOT NULL UNIQUE,
      password  TEXT NOT NULL,
      nombre    TEXT NOT NULL,
      rol       TEXT NOT NULL DEFAULT 'delegado',
      equipo_id INTEGER,
      FOREIGN KEY (equipo_id) REFERENCES equipos(id)
    );
  `);

  // Seed
  const n = await db.get('SELECT COUNT(*) as n FROM categorias');
  if (!n.n) {
    for (const c of ['Sub-12','Sub-15','Sub-18','Mayores'])
      await db.run('INSERT INTO categorias (nombre) VALUES (?)', c);
    await db.run('INSERT OR IGNORE INTO usuarios (usuario,password,nombre,rol) VALUES (?,?,?,?)','super','super123','Super Admin','super');
    await db.run('INSERT OR IGNORE INTO usuarios (usuario,password,nombre,rol) VALUES (?,?,?,?)','admin','admin123','Admin Liga','admin');
  }
}

// ─── Middlewares ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(session({
  secret: 'liga-caribe-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 3600 * 1000 }
}));

// ─── Multer ───────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sub = req._uploadDir || 'jugadores';
    cb(null, path.join(__dirname, 'uploads', sub));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Solo imágenes'))
});

// ─── Auth helpers ─────────────────────────────────────────────
const requireAuth  = (req,res,next) => req.session.user ? next() : res.status(401).json({error:'No autenticado'});
const requireAdmin = (req,res,next) => ['super','admin'].includes(req.session.user?.rol) ? next() : res.status(403).json({error:'Sin permisos'});
const requireSuper = (req,res,next) => req.session.user?.rol==='super' ? next() : res.status(403).json({error:'Solo super admin'});

// ─── Async wrapper ────────────────────────────────────────────
const ar = fn => (req,res,next) => fn(req,res,next).catch(next);

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════
app.post('/api/auth/login', ar(async (req,res) => {
  const { usuario, password } = req.body;
  const u = await db.get('SELECT * FROM usuarios WHERE usuario=? AND password=?', usuario, password);
  if (!u) return res.status(401).json({error:'Credenciales incorrectas'});
  req.session.user = { id:u.id, usuario:u.usuario, nombre:u.nombre, rol:u.rol, equipo_id:u.equipo_id };
  res.json({ ok:true, user:req.session.user });
}));
app.post('/api/auth/logout', (req,res) => { req.session.destroy(); res.json({ok:true}); });
app.get('/api/auth/me',      (req,res) => res.json({ user: req.session.user || null }));

// ═══════════════════════════════════════════════════════════════
// CATEGORIAS
// ═══════════════════════════════════════════════════════════════
app.get('/api/categorias', ar(async (_,res) =>
  res.json(await db.all('SELECT * FROM categorias ORDER BY id'))));

// ═══════════════════════════════════════════════════════════════
// EQUIPOS
// ═══════════════════════════════════════════════════════════════
app.get('/api/equipos', ar(async (req,res) => {
  const { categoria_id } = req.query;
  const q = 'SELECT e.*, c.nombre as categoria FROM equipos e JOIN categorias c ON e.categoria_id=c.id';
  if (categoria_id) res.json(await db.all(q+' WHERE e.categoria_id=? ORDER BY e.nombre', categoria_id));
  else              res.json(await db.all(q+' ORDER BY c.id, e.nombre'));
}));
app.get('/api/equipos/:id', ar(async (req,res) => {
  const eq = await db.get('SELECT e.*, c.nombre as categoria FROM equipos e JOIN categorias c ON e.categoria_id=c.id WHERE e.id=?', req.params.id);
  if (!eq) return res.status(404).json({error:'No encontrado'});
  eq.jugadores = await db.all('SELECT * FROM jugadores WHERE equipo_id=? ORDER BY numero', eq.id);
  res.json(eq);
}));
app.post('/api/equipos', requireAdmin, ar(async (req,res) => {
  const { nombre, categoria_id } = req.body;
  if (!nombre||!categoria_id) return res.status(400).json({error:'Faltan datos'});
  const r = await db.run('INSERT INTO equipos (nombre,categoria_id) VALUES (?,?)', nombre, categoria_id);
  res.json({id:r.lastID, nombre, categoria_id});
}));
app.put('/api/equipos/:id', requireAdmin, ar(async (req,res) => {
  const { nombre, categoria_id } = req.body;
  await db.run('UPDATE equipos SET nombre=?,categoria_id=? WHERE id=?', nombre, categoria_id, req.params.id);
  res.json({ok:true});
}));
app.delete('/api/equipos/:id', requireSuper, ar(async (req,res) => {
  await db.run('DELETE FROM equipos WHERE id=?', req.params.id);
  res.json({ok:true});
}));
app.post('/api/equipos/:id/escudo', requireAdmin, (req,res,next) => { req._uploadDir='equipos'; next(); },
  upload.single('imagen'), ar(async (req,res) => {
    if (!req.file) return res.status(400).json({error:'Sin imagen'});
    await db.run('UPDATE equipos SET escudo=? WHERE id=?', req.file.filename, req.params.id);
    res.json({ok:true, filename:req.file.filename});
  }));

// ═══════════════════════════════════════════════════════════════
// JUGADORES
// ═══════════════════════════════════════════════════════════════
app.get('/api/jugadores', ar(async (req,res) => {
  const { equipo_id, categoria_id } = req.query;
  let q = `SELECT j.*, e.nombre as equipo_nombre, c.nombre as categoria
           FROM jugadores j JOIN equipos e ON j.equipo_id=e.id JOIN categorias c ON e.categoria_id=c.id WHERE 1=1`;
  const p = [];
  if (equipo_id)    { q+=' AND j.equipo_id=?';    p.push(equipo_id); }
  if (categoria_id) { q+=' AND e.categoria_id=?'; p.push(categoria_id); }
  res.json(await db.all(q+' ORDER BY e.nombre, j.numero', ...p));
}));
app.get('/api/jugadores/:id', ar(async (req,res) => {
  const j = await db.get('SELECT j.*, e.nombre as equipo_nombre FROM jugadores j JOIN equipos e ON j.equipo_id=e.id WHERE j.id=?', req.params.id);
  if (!j) return res.status(404).json({error:'No encontrado'});
  res.json(j);
}));
app.post('/api/jugadores', requireAuth, ar(async (req,res) => {
  const { nombre, posicion, numero, edad, equipo_id } = req.body;
  if (!nombre||!equipo_id) return res.status(400).json({error:'Faltan datos'});
  if (req.session.user.rol==='delegado' && req.session.user.equipo_id!=equipo_id)
    return res.status(403).json({error:'Solo tu equipo'});
  const r = await db.run('INSERT INTO jugadores (nombre,posicion,numero,edad,equipo_id) VALUES (?,?,?,?,?)', nombre, posicion||null, numero||null, edad||null, equipo_id);
  res.json({id:r.lastID});
}));
app.put('/api/jugadores/:id', requireAuth, ar(async (req,res) => {
  const j = await db.get('SELECT * FROM jugadores WHERE id=?', req.params.id);
  if (!j) return res.status(404).json({error:'No encontrado'});
  if (req.session.user.rol==='delegado' && req.session.user.equipo_id!=j.equipo_id)
    return res.status(403).json({error:'Solo tu equipo'});
  const { nombre, posicion, numero, edad } = req.body;
  await db.run('UPDATE jugadores SET nombre=?,posicion=?,numero=?,edad=? WHERE id=?', nombre, posicion||null, numero||null, edad||null, req.params.id);
  res.json({ok:true});
}));
app.delete('/api/jugadores/:id', requireAdmin, ar(async (req,res) => {
  await db.run('DELETE FROM jugadores WHERE id=?', req.params.id);
  res.json({ok:true});
}));
app.post('/api/jugadores/:id/foto', requireAuth, (req,res,next) => { req._uploadDir='jugadores'; next(); },
  upload.single('imagen'), ar(async (req,res) => {
    if (!req.file) return res.status(400).json({error:'Sin imagen'});
    const j = await db.get('SELECT * FROM jugadores WHERE id=?', req.params.id);
    if (req.session.user.rol==='delegado' && req.session.user.equipo_id!=j?.equipo_id)
      return res.status(403).json({error:'Sin permisos'});
    if (j?.foto) { const old=path.join(__dirname,'uploads','jugadores',j.foto); if(fs.existsSync(old)) fs.unlinkSync(old); }
    await db.run('UPDATE jugadores SET foto=? WHERE id=?', req.file.filename, req.params.id);
    res.json({ok:true, filename:req.file.filename});
  }));

// ═══════════════════════════════════════════════════════════════
// PARTIDOS
// ═══════════════════════════════════════════════════════════════
const PSEL = `SELECT p.*,
  el.nombre as local_nombre,  el.escudo as local_escudo,
  ev.nombre as visita_nombre, ev.escudo as visita_escudo,
  c.nombre  as categoria
  FROM partidos p
  JOIN equipos   el ON p.equipo_local_id=el.id
  JOIN equipos   ev ON p.equipo_visitante_id=ev.id
  JOIN categorias c ON p.categoria_id=c.id`;

app.get('/api/partidos', ar(async (req,res) => {
  const { categoria_id, estado } = req.query;
  let q = PSEL + ' WHERE 1=1'; const p = [];
  if (categoria_id) { q+=' AND p.categoria_id=?'; p.push(categoria_id); }
  if (estado)       { q+=' AND p.estado=?';        p.push(estado); }
  res.json(await db.all(q+' ORDER BY p.fecha DESC, p.hora', ...p));
}));
app.get('/api/partidos/:id', ar(async (req,res) => {
  const p = await db.get(PSEL+' WHERE p.id=?', req.params.id);
  if (!p) return res.status(404).json({error:'No encontrado'});
  p.goles    = await db.all(`SELECT gp.*, j.nombre as jugador_nombre, e.nombre as equipo_nombre
    FROM goles_partido gp JOIN jugadores j ON gp.jugador_id=j.id JOIN equipos e ON j.equipo_id=e.id
    WHERE gp.partido_id=? ORDER BY gp.minuto`, req.params.id);
  p.tarjetas = await db.all(`SELECT tp.*, j.nombre as jugador_nombre, e.nombre as equipo_nombre
    FROM tarjetas_partido tp JOIN jugadores j ON tp.jugador_id=j.id JOIN equipos e ON j.equipo_id=e.id
    WHERE tp.partido_id=? ORDER BY tp.minuto`, req.params.id);
  res.json(p);
}));
app.post('/api/partidos', requireAdmin, ar(async (req,res) => {
  const { fecha, hora, equipo_local_id, equipo_visitante_id, categoria_id, notas } = req.body;
  if (!fecha||!equipo_local_id||!equipo_visitante_id||!categoria_id)
    return res.status(400).json({error:'Faltan datos'});
  const r = await db.run('INSERT INTO partidos (fecha,hora,equipo_local_id,equipo_visitante_id,categoria_id,notas) VALUES (?,?,?,?,?,?)',
    fecha, hora||null, equipo_local_id, equipo_visitante_id, categoria_id, notas||null);
  res.json({id:r.lastID});
}));
app.put('/api/partidos/:id', requireAdmin, ar(async (req,res) => {
  const { fecha, hora, equipo_local_id, equipo_visitante_id, categoria_id, notas } = req.body;
  await db.run('UPDATE partidos SET fecha=?,hora=?,equipo_local_id=?,equipo_visitante_id=?,categoria_id=?,notas=? WHERE id=?',
    fecha, hora||null, equipo_local_id, equipo_visitante_id, categoria_id, notas||null, req.params.id);
  res.json({ok:true});
}));
app.delete('/api/partidos/:id', requireAdmin, ar(async (req,res) => {
  await db.run('DELETE FROM partidos WHERE id=?', req.params.id);
  res.json({ok:true});
}));
app.post('/api/partidos/:id/resultado', requireAdmin, ar(async (req,res) => {
  const { goles_local, goles_visitante, goles=[], tarjetas=[] } = req.body;
  await db.run('BEGIN TRANSACTION');
  try {
    await db.run('UPDATE partidos SET goles_local=?,goles_visitante=?,estado="finalizado" WHERE id=?', goles_local, goles_visitante, req.params.id);
    await db.run('DELETE FROM goles_partido    WHERE partido_id=?', req.params.id);
    await db.run('DELETE FROM tarjetas_partido WHERE partido_id=?', req.params.id);
    for (const g of goles)
      await db.run('INSERT INTO goles_partido (partido_id,jugador_id,minuto) VALUES (?,?,?)', req.params.id, g.jugador_id, g.minuto||null);
    for (const t of tarjetas)
      await db.run('INSERT INTO tarjetas_partido (partido_id,jugador_id,tipo,minuto) VALUES (?,?,?,?)', req.params.id, t.jugador_id, t.tipo, t.minuto||null);
    await db.run('COMMIT');
    res.json({ok:true});
  } catch(e) { await db.run('ROLLBACK'); throw e; }
}));
app.post('/api/partidos/:id/vivo', requireAdmin, ar(async (req,res) => {
  const { vivo, minuto=0, goles_local=null, goles_visitante=null } = req.body;
  await db.run('UPDATE partidos SET estado=?,minuto=?,goles_local=?,goles_visitante=? WHERE id=?',
    vivo?'en_vivo':'programado', minuto, goles_local, goles_visitante, req.params.id);
  res.json({ok:true});
}));

// ═══════════════════════════════════════════════════════════════
// CONVOCATORIAS
// ═══════════════════════════════════════════════════════════════
app.get('/api/partidos/:id/convocatoria', ar(async (req,res) =>
  res.json(await db.all(`
    SELECT c.*, j.nombre as jugador_nombre, j.posicion, j.numero, j.foto, e.nombre as equipo_nombre
    FROM convocatorias c JOIN jugadores j ON c.jugador_id=j.id JOIN equipos e ON c.equipo_id=e.id
    WHERE c.partido_id=? ORDER BY e.nombre, j.numero`, req.params.id))
));
app.post('/api/partidos/:id/convocatoria', requireAuth, ar(async (req,res) => {
  const { jugador_id, equipo_id } = req.body;
  if (req.session.user.rol==='delegado' && req.session.user.equipo_id!=equipo_id)
    return res.status(403).json({error:'Solo tu equipo'});
  await db.run('INSERT OR IGNORE INTO convocatorias (partido_id,jugador_id,equipo_id) VALUES (?,?,?)', req.params.id, jugador_id, equipo_id);
  res.json({ok:true});
}));
app.delete('/api/partidos/:id/convocatoria/:jugador_id', requireAuth, ar(async (req,res) => {
  const conv = await db.get('SELECT * FROM convocatorias WHERE partido_id=? AND jugador_id=?', req.params.id, req.params.jugador_id);
  if (req.session.user.rol==='delegado' && conv && req.session.user.equipo_id!=conv.equipo_id)
    return res.status(403).json({error:'Sin permisos'});
  await db.run('DELETE FROM convocatorias WHERE partido_id=? AND jugador_id=?', req.params.id, req.params.jugador_id);
  res.json({ok:true});
}));

// ═══════════════════════════════════════════════════════════════
// STANDINGS & ESTADÍSTICAS
// ═══════════════════════════════════════════════════════════════
app.get('/api/standings', ar(async (req,res) => {
  const { categoria_id } = req.query;
  if (!categoria_id) return res.status(400).json({error:'categoria_id requerido'});
  const equipos     = await db.all('SELECT * FROM equipos WHERE categoria_id=?', categoria_id);
  const finalizados = await db.all("SELECT * FROM partidos WHERE categoria_id=? AND estado='finalizado'", categoria_id);
  const rows = equipos.map(eq => {
    const s = {id:eq.id, nombre:eq.nombre, escudo:eq.escudo, pj:0, pg:0, pe:0, pp:0, gf:0, gc:0};
    finalizados.forEach(p => {
      if (p.equipo_local_id===eq.id) {
        s.pj++; s.gf+=p.goles_local; s.gc+=p.goles_visitante;
        if (p.goles_local>p.goles_visitante) s.pg++;
        else if (p.goles_local===p.goles_visitante) s.pe++; else s.pp++;
      }
      if (p.equipo_visitante_id===eq.id) {
        s.pj++; s.gf+=p.goles_visitante; s.gc+=p.goles_local;
        if (p.goles_visitante>p.goles_local) s.pg++;
        else if (p.goles_local===p.goles_visitante) s.pe++; else s.pp++;
      }
    });
    s.pts = s.pg*3+s.pe; s.dg = s.gf-s.gc; return s;
  });
  rows.sort((a,b) => b.pts-a.pts || b.dg-a.dg || b.gf-a.gf);
  res.json(rows);
}));
app.get('/api/goleadores', ar(async (req,res) => {
  const { categoria_id } = req.query;
  let q = `SELECT j.id, j.nombre, j.foto, e.nombre as equipo, c.nombre as categoria, COUNT(gp.id) as goles
    FROM goles_partido gp JOIN jugadores j ON gp.jugador_id=j.id JOIN equipos e ON j.equipo_id=e.id JOIN categorias c ON e.categoria_id=c.id WHERE 1=1`;
  const p = [];
  if (categoria_id) { q+=' AND e.categoria_id=?'; p.push(categoria_id); }
  res.json(await db.all(q+' GROUP BY j.id ORDER BY goles DESC LIMIT 20', ...p));
}));
app.get('/api/tarjetas', ar(async (req,res) => {
  const { categoria_id } = req.query;
  let q = `SELECT j.id, j.nombre, j.foto, e.nombre as equipo, c.nombre as categoria,
    SUM(CASE WHEN tp.tipo='amarilla' THEN 1 ELSE 0 END) as amarillas,
    SUM(CASE WHEN tp.tipo='roja'     THEN 1 ELSE 0 END) as rojas
    FROM tarjetas_partido tp JOIN jugadores j ON tp.jugador_id=j.id JOIN equipos e ON j.equipo_id=e.id JOIN categorias c ON e.categoria_id=c.id WHERE 1=1`;
  const p = [];
  if (categoria_id) { q+=' AND e.categoria_id=?'; p.push(categoria_id); }
  res.json(await db.all(q+' GROUP BY j.id ORDER BY rojas DESC, amarillas DESC LIMIT 20', ...p));
}));

// ═══════════════════════════════════════════════════════════════
// USUARIOS
// ═══════════════════════════════════════════════════════════════
app.get('/api/usuarios', requireSuper, ar(async (_,res) =>
  res.json(await db.all(`SELECT u.id,u.usuario,u.nombre,u.rol,u.equipo_id,e.nombre as equipo_nombre
    FROM usuarios u LEFT JOIN equipos e ON u.equipo_id=e.id ORDER BY u.rol,u.nombre`))));
app.post('/api/usuarios', requireSuper, ar(async (req,res) => {
  const { usuario, password, nombre, rol, equipo_id } = req.body;
  try {
    const r = await db.run('INSERT INTO usuarios (usuario,password,nombre,rol,equipo_id) VALUES (?,?,?,?,?)', usuario, password, nombre, rol, equipo_id||null);
    res.json({id:r.lastID});
  } catch { res.status(400).json({error:'Usuario ya existe'}); }
}));
app.put('/api/usuarios/:id', requireSuper, ar(async (req,res) => {
  const { nombre, password, rol, equipo_id } = req.body;
  if (password) await db.run('UPDATE usuarios SET nombre=?,password=?,rol=?,equipo_id=? WHERE id=?', nombre, password, rol, equipo_id||null, req.params.id);
  else          await db.run('UPDATE usuarios SET nombre=?,rol=?,equipo_id=? WHERE id=?',             nombre,          rol, equipo_id||null, req.params.id);
  res.json({ok:true});
}));
app.delete('/api/usuarios/:id', requireSuper, ar(async (req,res) => {
  if (req.session.user.id==req.params.id) return res.status(400).json({error:'No puedes eliminarte'});
  await db.run('DELETE FROM usuarios WHERE id=?', req.params.id);
  res.json({ok:true});
}));

// ═══════════════════════════════════════════════════════════════
// BACKUP
// ═══════════════════════════════════════════════════════════════
app.get('/api/backup/db', requireSuper, (req,res) => {
  const ts = new Date().toISOString().slice(0,10);
  res.download(path.join(__dirname,'db','liga.db'), `liga-caribe-backup-${ts}.db`);
});
app.get('/api/backup/json', requireSuper, ar(async (_,res) => {
  const data = {
    exported_at:       new Date().toISOString(),
    categorias:        await db.all('SELECT * FROM categorias'),
    equipos:           await db.all('SELECT * FROM equipos'),
    jugadores:         await db.all('SELECT * FROM jugadores'),
    partidos:          await db.all('SELECT * FROM partidos'),
    convocatorias:     await db.all('SELECT * FROM convocatorias'),
    goles_partido:     await db.all('SELECT * FROM goles_partido'),
    tarjetas_partido:  await db.all('SELECT * FROM tarjetas_partido'),
  };
  const ts = new Date().toISOString().slice(0,10);
  res.setHeader('Content-Disposition', `attachment; filename="liga-caribe-${ts}.json"`);
  res.json(data);
}));

// ─── Error handler ────────────────────────────────────────────
app.use((err,req,res,_next) => {
  if (err.code==='LIMIT_FILE_SIZE') return res.status(400).json({error:'Imagen muy grande (máx 5MB)'});
  console.error(err);
  res.status(500).json({error: err.message || 'Error del servidor'});
});

// ─── Start ────────────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, () =>
    console.log(`\n⚽  Liga Caribe  →  http://localhost:${PORT}\n   Panel admin  →  http://localhost:${PORT}/panel.html\n`));
}).catch(err => { console.error('Error iniciando BD:', err); process.exit(1); });
