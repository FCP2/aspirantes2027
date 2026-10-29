const express = require('express');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const createSessionStore = require('./config/session-store');
const sessionDuration = require('./config/session-duration');
const municipiosRoutes = require('./routes/municipios.routes');
const fichasRoutes = require('./routes/fichas.routes');
const personasRoutes = require('./routes/personas.routes');
const filesRoutes = require('./routes/files.routes');
const pdfRoutes = require('./routes/pdf.routes');
const excelRoutes = require('./routes/excel.routes');
const directorioDiputacionesRoutes = require('./routes/directorio-diputaciones.routes');
const revisionFuentesRoutes = require('./routes/revision-fuentes.routes');
const integracionActoresRoutes = require('./routes/integracion-actores.routes');
const reportesMapaRoutes = require('./routes/reportes-mapa.routes');
const accessRoutes = require('./routes/access.routes');
const access = require('./middleware/access-control');
const database = require('./config/database');

// La carga inicial pertenece a SQLite; PostgreSQL ya contiene la copia validada.
if (process.env.RENDER !== 'true' && process.env.MUNICIPAL_DB_ENGINE !== 'postgres') {
  require('./database/personal-coordinacion.seed')();
}

const app = express();
app.set('trust proxy', 1);
app.set('view engine','ejs');
app.set('views',path.join(__dirname,'..','views'));
app.use(express.json({limit:'10mb'}));
app.use(express.urlencoded({extended:true,limit:'10mb'}));
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (process.env.RENDER === 'true' && !process.env.SESSION_SECRET) {
  throw new Error('Falta SESSION_SECRET para las sesiones de Render.');
}
if (!process.env.SESSION_SECRET) console.warn('SESSION_SECRET no está configurado; las sesiones externas se cerrarán al reiniciar.');
const sessionStore = createSessionStore();
app.use(session({
  name: 'fichas.sid',
  secret: sessionSecret,
  ...(sessionStore ? { store: sessionStore } : {}),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: 'auto',
    maxAge: sessionDuration
  }
}));
app.use(express.static(path.join(__dirname,'..','public')));
app.use('/vendor/sweetalert2',express.static(path.join(__dirname,'..','node_modules','sweetalert2','dist')));
app.use('/vendor/bootstrap-icons',express.static(path.join(__dirname,'..','node_modules','bootstrap-icons','font')));
app.use('/vendor/leaflet',express.static(path.join(__dirname,'..','node_modules','leaflet','dist')));
app.use('/vendor/wellknown',express.static(path.join(__dirname,'..','node_modules','wellknown')));
app.use('/storage/photos', access.requireRole('report'), express.static(path.resolve('./storage/photos')));
app.use('/storage/hoja2', access.requireRole('report'), express.static(path.resolve('./storage/hoja2')));
app.use('/api/access', accessRoutes);

app.get('/healthz', (_req, res) => {
  try {
    database.prepare('SELECT 1 AS ok').get();
    res.type('text').send('ok');
  } catch (error) {
    console.error('Health check municipal:', error.message);
    res.status(503).type('text').send('unavailable');
  }
});

app.get('/',(req,res)=>res.redirect('/reportes/mapa'));
app.get('/reportes',(req,res)=>res.redirect('/reportes/mapa'));
app.use('/api/municipios', access.requireRole('report'), municipiosRoutes);
app.use('/api/fichas', access.requireRole('editor'), fichasRoutes);
app.use('/api/personas', access.requireRole('editor'), personasRoutes);
app.use('/api/files', access.requireRole('editor'), filesRoutes);
app.use('/api/pdf', access.requireRole('report'), pdfRoutes);
app.use('/api/excel', access.requireRole('report'), excelRoutes);
app.use('/api/directorio/diputaciones', access.requireRole('editor'), directorioDiputacionesRoutes);
app.use('/api/revision-fuentes', access.requireRole('report'), revisionFuentesRoutes);
app.use('/api/integracion-actores',integracionActoresRoutes);
app.use('/api/reportes/mapa', access.requireRole('report'), reportesMapaRoutes);

function viewConfig() {
  return {
    officeName: process.env.OFFICE_NAME || 'CAPTURA DE DATOS',
    actorsTurnstileSiteKey: process.env.ACTORES_TURNSTILE_SITE_KEY || ''
  };
}

app.get('/captura', access.viewRole('editor'), (req,res)=>res.render('captura/index',viewConfig()));
app.get('/reportes/acceso', (req, res) => {
  const captureDestination = req.query.destino === 'captura';

  return res.render('access/reportes', {
    accessRole: captureDestination ? 'editor' : 'report',
    accessTarget: captureDestination ? '/captura' : '/reportes/mapa'
  });
});
app.get('/revision-fuentes', access.viewRole('report'), (req,res)=>res.render('revision-fuentes/index',viewConfig()));
app.get('/reportes/mapa', access.viewRole('report'), (req,res)=>res.render('reportes/mapa',viewConfig()));

app.use((err,req,res,next)=>{
  console.error(err);
  res.status(err.status||500).json({ok:false,message:err.message||'ERROR INTERNO'});
});
module.exports=app;
