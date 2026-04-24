const express  = require('express');
const session  = require('express-session');
const multer   = require('multer');
const admin    = require('firebase-admin');
const path     = require('path');
const fs       = require('fs');

// ─── Firebase init ───────────────────────────────────────────
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require('./serviceAccount.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'puerto-deportes.appspot.com',
});
const db     = admin.firestore();
const bucket = admin.storage().bucket();

// ─── Firestore helpers ────────────────────────────────────────
const col  = name => db.collection(name);
const snap = async (ref) => { const s = await ref.get(); return s.docs.map(d => ({ id: d.id, ...d.data() })); };
const one  = async (c, id) => { const d = await col(c).doc(id).get(); return d.exists ? { id: d.id, ...d.data() } : null; };
const add  = async (c, data) => { const r = await col(c).add(data); return r.id; };
const set  = async (c, id, data) => col(c).doc(id).update(data);
const del  = async (c, id) => col(c).doc(id).delete();
const delWhere = async (c, field, val) => {
  const s = await col(c).where(field, '==', val).get();
  const batch = db.batch();
  s.docs.forEach(d => batch.delete(d.ref));
  if (s.docs.length) await batch.commit();
};

// ─── Seed ─────────────────────────────────────────────────────
async function seed() {
  const camps = await snap(col('campeonatos'));
  if (!camps.length) {
    const campId = await add('campeonatos', {
      nombre: 'Apertura 2026', año: 2026, descripcion: 'Primer campeonato de la temporada',
      estado: 'activo', creado_at: new Date().toISOString(),
    });
    const catNombres = ['Sub-12','Sub-15','Sub-18','Mayores'];
    for (let i = 0; i < catNombres.length; i++)
      await add('categorias', { nombre: catNombres[i], campeonato_id: campId, orden: i });
    await col('usuarios').add({ usuario:'super', password:'super123', nombre:'Super Admin', rol:'super', equipo_id:null });
    await col('usuarios').add({ usuario:'admin', password:'admin123', nombre:'Admin Liga',  rol:'admin', equipo_id:null });
    console.log('✅ Datos iniciales creados en Firestore (Apertura 2026)');
  }
}

// ─── Express setup ────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'liga-caribe-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 3600 * 1000 },
}));

// ─── Multer (memory → Firebase Storage) ──────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Solo imágenes')),
});

async function uploadToStorage(buffer, mimetype, folder) {
  const ext  = mimetype.split('/')[1] || 'jpg';
  const name = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const file = bucket.file(name);
  await file.save(buffer, { metadata: { contentType: mimetype }, public: true });
  return `https://storage.googleapis.com/puerto-deportes.appspot.com/${name}`;
}

// ─── Auth middleware ──────────────────────────────────────────
const requireAuth  = (req,res,next) => req.session.user ? next() : res.status(401).json({error:'No autenticado'});
const requireAdmin = (req,res,next) => ['super','admin'].includes(req.session.user?.rol) ? next() : res.status(403).json({error:'Sin permisos'});
const requireSuper = (req,res,next) => req.session.user?.rol==='super' ? next() : res.status(403).json({error:'Solo super admin'});
const ar = fn => (req,res,next) => fn(req,res,next).catch(next);

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════
app.post('/api/auth/login', ar(async (req,res) => {
  const { usuario, password } = req.body;
  const s = await col('usuarios').where('usuario','==',usuario).where('password','==',password).get();
  if (s.empty) return res.status(401).json({error:'Credenciales incorrectas'});
  const u = { id: s.docs[0].id, ...s.docs[0].data() };
  req.session.user = { id:u.id, usuario:u.usuario, nombre:u.nombre, rol:u.rol, equipo_id:u.equipo_id||null };
  res.json({ ok:true, user:req.session.user });
}));
app.post('/api/auth/logout', (req,res) => { req.session.destroy(); res.json({ok:true}); });
app.get('/api/auth/me',      (req,res) => res.json({ user: req.session.user||null }));

// ═══════════════════════════════════════════════════════════════
// CAMPEONATOS
// ═══════════════════════════════════════════════════════════════
app.get('/api/campeonatos', ar(async (_,res) => {
  const camps = await snap(col('campeonatos'));
  camps.sort((a,b) => (b.creado_at||'').localeCompare(a.creado_at||''));
  res.json(camps);
}));
app.post('/api/campeonatos', requireAdmin, ar(async (req,res) => {
  const { nombre, año, descripcion } = req.body;
  if (!nombre) return res.status(400).json({error:'Nombre requerido'});
  const id = await add('campeonatos', {
    nombre, año: parseInt(año)||new Date().getFullYear(),
    descripcion: descripcion||'', estado:'activo', creado_at: new Date().toISOString(),
  });
  res.json({id});
}));
app.put('/api/campeonatos/:id', requireAdmin, ar(async (req,res) => {
  const { nombre, año, descripcion, estado } = req.body;
  await set('campeonatos', req.params.id, { nombre, año:parseInt(año)||new Date().getFullYear(), descripcion:descripcion||'', estado:estado||'activo' });
  res.json({ok:true});
}));
app.delete('/api/campeonatos/:id', requireSuper, ar(async (req,res) => {
  await Promise.all([
    delWhere('categorias',  'campeonato_id', req.params.id),
    delWhere('equipos',     'campeonato_id', req.params.id),
    delWhere('jugadores',   'campeonato_id', req.params.id),
    delWhere('partidos',    'campeonato_id', req.params.id),
  ]);
  await del('campeonatos', req.params.id);
  res.json({ok:true});
}));

// ═══════════════════════════════════════════════════════════════
// CATEGORIAS
// ═══════════════════════════════════════════════════════════════
app.get('/api/categorias', ar(async (req,res) => {
  const { campeonato_id } = req.query;
  let ref = col('categorias');
  if (campeonato_id) ref = ref.where('campeonato_id','==',campeonato_id);
  const cats = (await snap(ref)).sort((a,b)=>(a.orden||0)-(b.orden||0));
  res.json(cats);
}));
app.post('/api/categorias', requireAdmin, ar(async (req,res) => {
  const { nombre, campeonato_id } = req.body;
  if (!nombre||!campeonato_id) return res.status(400).json({error:'Faltan datos'});
  const existing = await snap(col('categorias').where('campeonato_id','==',campeonato_id));
  const id = await add('categorias', { nombre, campeonato_id, orden: existing.length });
  res.json({id});
}));
app.put('/api/categorias/:id', requireAdmin, ar(async (req,res) => {
  const { nombre } = req.body;
  await set('categorias', req.params.id, { nombre });
  res.json({ok:true});
}));
app.delete('/api/categorias/:id', requireAdmin, ar(async (req,res) => {
  await del('categorias', req.params.id);
  res.json({ok:true});
}));

// ═══════════════════════════════════════════════════════════════
// EQUIPOS
// ═══════════════════════════════════════════════════════════════
app.get('/api/equipos', ar(async (req,res) => {
  const { campeonato_id, categoria_id } = req.query;
  let ref = col('equipos');
  if (campeonato_id) ref = ref.where('campeonato_id','==',campeonato_id);
  else if (categoria_id) ref = ref.where('categoria_id','==',categoria_id);
  const equipos = (await snap(ref)).sort((a,b) => a.nombre.localeCompare(b.nombre));
  res.json(equipos);
}));
app.get('/api/equipos/:id', ar(async (req,res) => {
  const eq = await one('equipos', req.params.id);
  if (!eq) return res.status(404).json({error:'No encontrado'});
  eq.jugadores = (await snap(col('jugadores').where('equipo_id','==',req.params.id))).sort((a,b)=>(a.numero||99)-(b.numero||99));
  res.json(eq);
}));
app.post('/api/equipos', requireAdmin, ar(async (req,res) => {
  const { nombre, categoria_id, campeonato_id } = req.body;
  if (!nombre||!categoria_id||!campeonato_id) return res.status(400).json({error:'Faltan datos'});
  const cat = await one('categorias', categoria_id);
  const id = await add('equipos', { nombre, categoria_id, campeonato_id, categoria: cat?.nombre||'' });
  res.json({ id, nombre, categoria_id });
}));
app.put('/api/equipos/:id', requireAdmin, ar(async (req,res) => {
  const { nombre, categoria_id } = req.body;
  const cat = await one('categorias', categoria_id);
  await set('equipos', req.params.id, { nombre, categoria_id, categoria: cat?.nombre||'' });
  res.json({ok:true});
}));
app.delete('/api/equipos/:id', requireSuper, ar(async (req,res) => {
  await delWhere('jugadores','equipo_id',req.params.id);
  await del('equipos', req.params.id);
  res.json({ok:true});
}));
app.post('/api/equipos/:id/escudo', requireAdmin, upload.single('imagen'), ar(async (req,res) => {
  if (!req.file) return res.status(400).json({error:'Sin imagen'});
  const url = await uploadToStorage(req.file.buffer, req.file.mimetype, 'equipos');
  await set('equipos', req.params.id, { escudo: url });
  res.json({ok:true, url});
}));

// ═══════════════════════════════════════════════════════════════
// JUGADORES
// ═══════════════════════════════════════════════════════════════
app.get('/api/jugadores', ar(async (req,res) => {
  const { equipo_id, categoria_id, campeonato_id } = req.query;
  let ref = col('jugadores');
  if (equipo_id)         ref = ref.where('equipo_id','==',equipo_id);
  else if (campeonato_id) ref = ref.where('campeonato_id','==',campeonato_id);
  else if (categoria_id)  ref = ref.where('categoria_id','==',categoria_id);
  const list = (await snap(ref)).sort((a,b)=>a.nombre.localeCompare(b.nombre));
  res.json(list);
}));
app.get('/api/jugadores/:id', ar(async (req,res) => {
  const j = await one('jugadores', req.params.id);
  if (!j) return res.status(404).json({error:'No encontrado'});
  res.json(j);
}));
app.post('/api/jugadores', requireAuth, ar(async (req,res) => {
  const { nombre, posicion, numero, edad, equipo_id } = req.body;
  if (!nombre||!equipo_id) return res.status(400).json({error:'Faltan datos'});
  if (req.session.user.rol==='delegado' && req.session.user.equipo_id!==equipo_id)
    return res.status(403).json({error:'Solo tu equipo'});
  const eq = await one('equipos', equipo_id);
  const id = await add('jugadores', {
    nombre, posicion:posicion||null, numero:numero?parseInt(numero):null,
    edad:edad?parseInt(edad):null, equipo_id,
    equipo_nombre: eq?.nombre||'', categoria_id: eq?.categoria_id||'',
    categoria: eq?.categoria||'', campeonato_id: eq?.campeonato_id||null,
  });
  res.json({id});
}));
app.put('/api/jugadores/:id', requireAuth, ar(async (req,res) => {
  const j = await one('jugadores', req.params.id);
  if (!j) return res.status(404).json({error:'No encontrado'});
  if (req.session.user.rol==='delegado' && req.session.user.equipo_id!==j.equipo_id)
    return res.status(403).json({error:'Solo tu equipo'});
  const { nombre, posicion, numero, edad, equipo_id } = req.body;
  const updates = { nombre, posicion:posicion||null, numero:numero?parseInt(numero):null, edad:edad?parseInt(edad):null };
  if (equipo_id && equipo_id !== j.equipo_id) {
    const eq = await one('equipos', equipo_id);
    updates.equipo_id = equipo_id;
    updates.equipo_nombre = eq?.nombre||'';
    updates.categoria_id = eq?.categoria_id||'';
    updates.categoria = eq?.categoria||'';
    updates.campeonato_id = eq?.campeonato_id||null;
  }
  await set('jugadores', req.params.id, updates);
  res.json({ok:true});
}));
app.delete('/api/jugadores/:id', requireAdmin, ar(async (req,res) => {
  await del('jugadores', req.params.id);
  res.json({ok:true});
}));
app.post('/api/jugadores/:id/foto', requireAuth, upload.single('imagen'), ar(async (req,res) => {
  if (!req.file) return res.status(400).json({error:'Sin imagen'});
  const j = await one('jugadores', req.params.id);
  if (req.session.user.rol==='delegado' && req.session.user.equipo_id!==j?.equipo_id)
    return res.status(403).json({error:'Sin permisos'});
  const url = await uploadToStorage(req.file.buffer, req.file.mimetype, 'jugadores');
  await set('jugadores', req.params.id, { foto: url });
  res.json({ok:true, url});
}));

// ═══════════════════════════════════════════════════════════════
// PARTIDOS
// ═══════════════════════════════════════════════════════════════
app.get('/api/partidos', ar(async (req,res) => {
  const { campeonato_id, categoria_id, estado } = req.query;
  let ref = col('partidos');
  if (campeonato_id)     ref = ref.where('campeonato_id','==',campeonato_id);
  else if (categoria_id) ref = ref.where('categoria_id','==',categoria_id);
  let list = await snap(ref);
  if (categoria_id && campeonato_id) list = list.filter(p => p.categoria_id === categoria_id);
  if (estado) list = list.filter(p => p.estado === estado);
  list.sort((a,b) => b.fecha.localeCompare(a.fecha) || (a.hora||'').localeCompare(b.hora||''));
  res.json(list);
}));
app.get('/api/partidos/:id', ar(async (req,res) => {
  const p = await one('partidos', req.params.id);
  if (!p) return res.status(404).json({error:'No encontrado'});
  p.goles    = await snap(col('goles_partido').where('partido_id','==',req.params.id));
  p.tarjetas = await snap(col('tarjetas_partido').where('partido_id','==',req.params.id));
  res.json(p);
}));
app.post('/api/partidos', requireAdmin, ar(async (req,res) => {
  const { fecha, hora, equipo_local_id, equipo_visitante_id, categoria_id, campeonato_id, notas } = req.body;
  if (!fecha||!equipo_local_id||!equipo_visitante_id||!categoria_id||!campeonato_id)
    return res.status(400).json({error:'Faltan datos'});
  const [local, visita, cat, camp] = await Promise.all([
    one('equipos', equipo_local_id),
    one('equipos', equipo_visitante_id),
    one('categorias', categoria_id),
    one('campeonatos', campeonato_id),
  ]);
  const id = await add('partidos', {
    fecha, hora:hora||null, campeonato_id, campeonato_nombre: camp?.nombre||'',
    equipo_local_id, local_nombre:local?.nombre||'', local_escudo:local?.escudo||null,
    equipo_visitante_id, visita_nombre:visita?.nombre||'', visita_escudo:visita?.escudo||null,
    categoria_id, categoria:cat?.nombre||'',
    goles_local:null, goles_visitante:null, estado:'programado', minuto:0, notas:notas||null,
  });
  res.json({id});
}));
app.put('/api/partidos/:id', requireAdmin, ar(async (req,res) => {
  const { fecha, hora, equipo_local_id, equipo_visitante_id, categoria_id, notas } = req.body;
  const [local, visita, cat] = await Promise.all([
    one('equipos', equipo_local_id),
    one('equipos', equipo_visitante_id),
    one('categorias', categoria_id),
  ]);
  await set('partidos', req.params.id, {
    fecha, hora:hora||null,
    equipo_local_id, local_nombre:local?.nombre||'', local_escudo:local?.escudo||null,
    equipo_visitante_id, visita_nombre:visita?.nombre||'', visita_escudo:visita?.escudo||null,
    categoria_id, categoria:cat?.nombre||'', notas:notas||null,
  });
  res.json({ok:true});
}));
app.delete('/api/partidos/:id', requireAdmin, ar(async (req,res) => {
  await Promise.all([
    delWhere('convocatorias',   'partido_id', req.params.id),
    delWhere('goles_partido',   'partido_id', req.params.id),
    delWhere('tarjetas_partido','partido_id', req.params.id),
  ]);
  await del('partidos', req.params.id);
  res.json({ok:true});
}));
app.post('/api/partidos/:id/resultado', requireAdmin, ar(async (req,res) => {
  const { goles_local, goles_visitante, goles=[], tarjetas=[] } = req.body;
  await set('partidos', req.params.id, { goles_local, goles_visitante, estado:'finalizado' });
  await delWhere('goles_partido',   'partido_id', req.params.id);
  await delWhere('tarjetas_partido','partido_id', req.params.id);
  const p = await one('partidos', req.params.id);
  await Promise.all([
    ...goles.map(g    => add('goles_partido',    { partido_id:req.params.id, campeonato_id:p?.campeonato_id||null, jugador_id:g.jugador_id, jugador_nombre:g.nombre||'', equipo_nombre:g.equipo||'', minuto:g.minuto||null })),
    ...tarjetas.map(t => add('tarjetas_partido', { partido_id:req.params.id, campeonato_id:p?.campeonato_id||null, jugador_id:t.jugador_id, jugador_nombre:t.nombre||'', equipo_nombre:t.equipo||'', tipo:t.tipo, minuto:t.minuto||null })),
  ]);
  res.json({ok:true});
}));
app.post('/api/partidos/:id/vivo', requireAdmin, ar(async (req,res) => {
  const { vivo, minuto=0, goles_local=null, goles_visitante=null } = req.body;
  await set('partidos', req.params.id, { estado:vivo?'en_vivo':'programado', minuto, goles_local, goles_visitante });
  res.json({ok:true});
}));

// ═══════════════════════════════════════════════════════════════
// CONVOCATORIAS
// ═══════════════════════════════════════════════════════════════
app.get('/api/partidos/:id/convocatoria', ar(async (req,res) => {
  const list = await snap(col('convocatorias').where('partido_id','==',req.params.id));
  list.sort((a,b)=>(a.equipo_nombre||'').localeCompare(b.equipo_nombre||'')||(a.numero||99)-(b.numero||99));
  res.json(list);
}));
app.post('/api/partidos/:id/convocatoria', requireAuth, ar(async (req,res) => {
  const { jugador_id, equipo_id } = req.body;
  if (req.session.user.rol==='delegado' && req.session.user.equipo_id!==equipo_id)
    return res.status(403).json({error:'Solo tu equipo'});
  const ex = await col('convocatorias').where('partido_id','==',req.params.id).where('jugador_id','==',jugador_id).get();
  if (!ex.empty) return res.json({ok:true});
  const j  = await one('jugadores', jugador_id);
  const eq = await one('equipos', equipo_id);
  await add('convocatorias', {
    partido_id: req.params.id, jugador_id, equipo_id,
    jugador_nombre: j?.nombre||'', posicion: j?.posicion||'', numero: j?.numero||null, foto: j?.foto||null,
    equipo_nombre: eq?.nombre||'',
  });
  res.json({ok:true});
}));
app.delete('/api/partidos/:id/convocatoria/:jugador_id', requireAuth, ar(async (req,res) => {
  const s = await col('convocatorias').where('partido_id','==',req.params.id).where('jugador_id','==',req.params.jugador_id).get();
  if (s.empty) return res.json({ok:true});
  const conv = { id: s.docs[0].id, ...s.docs[0].data() };
  if (req.session.user.rol==='delegado' && req.session.user.equipo_id!==conv.equipo_id)
    return res.status(403).json({error:'Sin permisos'});
  await del('convocatorias', conv.id);
  res.json({ok:true});
}));

// ═══════════════════════════════════════════════════════════════
// STANDINGS & ESTADÍSTICAS
// ═══════════════════════════════════════════════════════════════
app.get('/api/standings', ar(async (req,res) => {
  const { campeonato_id, categoria_id } = req.query;
  if (!categoria_id) return res.status(400).json({error:'categoria_id requerido'});
  let eqRef = col('equipos').where('categoria_id','==',categoria_id);
  if (campeonato_id) eqRef = col('equipos').where('campeonato_id','==',campeonato_id).where('categoria_id','==',categoria_id);
  let pRef = col('partidos').where('categoria_id','==',categoria_id);
  if (campeonato_id) pRef = col('partidos').where('campeonato_id','==',campeonato_id);
  const [equipos, partidos] = await Promise.all([snap(eqRef), snap(pRef)]);
  const finalizados = partidos.filter(p => p.estado==='finalizado' && (!campeonato_id || p.categoria_id===categoria_id));
  const rows = equipos.map(eq => {
    const s = { id:eq.id, nombre:eq.nombre, escudo:eq.escudo||null, pj:0,pg:0,pe:0,pp:0,gf:0,gc:0 };
    finalizados.forEach(p => {
      if (p.equipo_local_id===eq.id) {
        s.pj++; s.gf+=p.goles_local||0; s.gc+=p.goles_visitante||0;
        if (p.goles_local>p.goles_visitante) s.pg++;
        else if (p.goles_local===p.goles_visitante) s.pe++; else s.pp++;
      }
      if (p.equipo_visitante_id===eq.id) {
        s.pj++; s.gf+=p.goles_visitante||0; s.gc+=p.goles_local||0;
        if (p.goles_visitante>p.goles_local) s.pg++;
        else if (p.goles_local===p.goles_visitante) s.pe++; else s.pp++;
      }
    });
    s.pts=s.pg*3+s.pe; s.dg=s.gf-s.gc; return s;
  });
  rows.sort((a,b)=>b.pts-a.pts||b.dg-a.dg||b.gf-a.gf);
  res.json(rows);
}));

app.get('/api/goleadores', ar(async (req,res) => {
  const { campeonato_id, categoria_id } = req.query;
  let ref = col('goles_partido');
  if (campeonato_id) ref = ref.where('campeonato_id','==',campeonato_id);
  let goles = await snap(ref);
  if (categoria_id) {
    const jugs = (await snap(col('jugadores').where('categoria_id','==',categoria_id))).map(j=>j.id);
    goles = goles.filter(g => jugs.includes(g.jugador_id));
  }
  const agg = {};
  for (const g of goles) {
    if (!agg[g.jugador_id]) {
      const j = await one('jugadores', g.jugador_id).catch(()=>null);
      agg[g.jugador_id] = { id:g.jugador_id, nombre:j?.nombre||g.jugador_nombre, foto:j?.foto||null, equipo:g.equipo_nombre, goles:0 };
    }
    agg[g.jugador_id].goles++;
  }
  res.json(Object.values(agg).sort((a,b)=>b.goles-a.goles).slice(0,20));
}));

app.get('/api/tarjetas', ar(async (req,res) => {
  const { campeonato_id, categoria_id } = req.query;
  let ref = col('tarjetas_partido');
  if (campeonato_id) ref = ref.where('campeonato_id','==',campeonato_id);
  let tarjetas = await snap(ref);
  if (categoria_id) {
    const jugs = (await snap(col('jugadores').where('categoria_id','==',categoria_id))).map(j=>j.id);
    tarjetas = tarjetas.filter(t => jugs.includes(t.jugador_id));
  }
  const agg = {};
  for (const t of tarjetas) {
    if (!agg[t.jugador_id]) {
      const j = await one('jugadores', t.jugador_id).catch(()=>null);
      agg[t.jugador_id] = { id:t.jugador_id, nombre:j?.nombre||t.jugador_nombre, foto:j?.foto||null, equipo:t.equipo_nombre, amarillas:0, rojas:0 };
    }
    if (t.tipo==='amarilla') agg[t.jugador_id].amarillas++;
    else agg[t.jugador_id].rojas++;
  }
  res.json(Object.values(agg).sort((a,b)=>b.rojas-a.rojas||b.amarillas-a.amarillas).slice(0,20));
}));

// ═══════════════════════════════════════════════════════════════
// USUARIOS
// ═══════════════════════════════════════════════════════════════
app.get('/api/usuarios', requireSuper, ar(async (_,res) => {
  const users = await snap(col('usuarios'));
  const withEq = await Promise.all(users.map(async u => {
    if (u.equipo_id) { const eq = await one('equipos',u.equipo_id).catch(()=>null); u.equipo_nombre = eq?.nombre||null; }
    delete u.password;
    return u;
  }));
  res.json(withEq.sort((a,b)=>a.rol.localeCompare(b.rol)));
}));
app.post('/api/usuarios', requireSuper, ar(async (req,res) => {
  const { usuario, password, nombre, rol, equipo_id } = req.body;
  const ex = await col('usuarios').where('usuario','==',usuario).get();
  if (!ex.empty) return res.status(400).json({error:'Usuario ya existe'});
  const id = await add('usuarios', { usuario, password, nombre, rol, equipo_id:equipo_id||null });
  res.json({id});
}));
app.put('/api/usuarios/:id', requireSuper, ar(async (req,res) => {
  const { nombre, password, rol, equipo_id } = req.body;
  const data = { nombre, rol, equipo_id:equipo_id||null };
  if (password) data.password = password;
  await set('usuarios', req.params.id, data);
  res.json({ok:true});
}));
app.delete('/api/usuarios/:id', requireSuper, ar(async (req,res) => {
  if (req.session.user.id===req.params.id) return res.status(400).json({error:'No puedes eliminarte'});
  await del('usuarios', req.params.id);
  res.json({ok:true});
}));

// ═══════════════════════════════════════════════════════════════
// BACKUP
// ═══════════════════════════════════════════════════════════════
app.get('/api/backup/json', requireSuper, ar(async (_,res) => {
  const [campeonatos,categorias,equipos,jugadores,partidos,convocatorias,goles_partido,tarjetas_partido] =
    await Promise.all([
      snap(col('campeonatos')), snap(col('categorias')), snap(col('equipos')),
      snap(col('jugadores')),   snap(col('partidos')),   snap(col('convocatorias')),
      snap(col('goles_partido')), snap(col('tarjetas_partido')),
    ]);
  const ts = new Date().toISOString().slice(0,10);
  res.setHeader('Content-Disposition', `attachment; filename="liga-caribe-${ts}.json"`);
  res.json({ exported_at:new Date().toISOString(), campeonatos, categorias, equipos, jugadores, partidos, convocatorias, goles_partido, tarjetas_partido });
}));

// ─── Error handler ────────────────────────────────────────────
app.use((err,_req,res,_next) => {
  if (err.code==='LIMIT_FILE_SIZE') return res.status(400).json({error:'Imagen muy grande (máx 5MB)'});
  console.error(err.message);
  res.status(500).json({error: err.message||'Error del servidor'});
});

// ─── Start ────────────────────────────────────────────────────
seed().then(() =>
  app.listen(PORT, () =>
    console.log(`\n⚽  Liga Caribe  →  http://localhost:${PORT}\n   Firebase     →  puerto-deportes (Firestore)\n`))
).catch(err => { console.error('Error al iniciar:', err); process.exit(1); });
