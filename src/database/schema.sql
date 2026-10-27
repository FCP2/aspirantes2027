PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS oficinas (
  id TEXT PRIMARY KEY,
  clave TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  office_id TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('CAPTURISTA','REVISOR','ADMIN','SUPER_ADMIN')),
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (office_id) REFERENCES oficinas(id)
);

CREATE TABLE IF NOT EXISTS municipios (
  id TEXT PRIMARY KEY,
  clave TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL UNIQUE,
  metadata_json TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS oficina_municipio (
  office_id TEXT NOT NULL,
  municipio_id TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (office_id, municipio_id),
  FOREIGN KEY (office_id) REFERENCES oficinas(id),
  FOREIGN KEY (municipio_id) REFERENCES municipios(id)
);

CREATE TABLE IF NOT EXISTS fichas_municipales (
  id TEXT PRIMARY KEY,
  municipio_id TEXT NOT NULL UNIQUE,
  estatus TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estatus IN ('PENDIENTE','EN_CAPTURA','PARA_REVISION','VALIDADO','FINALIZADO')),
  revision INTEGER NOT NULL DEFAULT 0,
  hoja_2_archivo_id TEXT,
  grupo_politico_imagen_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (municipio_id) REFERENCES municipios(id)
);

CREATE TABLE IF NOT EXISTS partidos (
  id TEXT PRIMARY KEY,
  siglas TEXT NOT NULL UNIQUE,
  nombre TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido_paterno TEXT,
  apellido_materno TEXT,
  foto_path TEXT,
  foto_hash TEXT,
  es_referente INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tipos_personal_territorio (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS grupos_politicos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS municipio_grupo_dominante (
  id TEXT PRIMARY KEY,
  municipio_id TEXT NOT NULL UNIQUE,
  grupo_politico_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (municipio_id) REFERENCES municipios(id),
  FOREIGN KEY (grupo_politico_id) REFERENCES grupos_politicos(id)
);

CREATE TABLE IF NOT EXISTS grupos_presencia_municipio (
  id TEXT PRIMARY KEY,
  municipio_id TEXT NOT NULL,
  actor_politico TEXT NOT NULL,
  grupo_nombre TEXT NOT NULL,
  imagen_path TEXT,
  orden_visual INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (municipio_id) REFERENCES municipios(id)
);

CREATE TABLE IF NOT EXISTS directorio_diputaciones (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('FEDERAL','LOCAL')),
  nombre_completo TEXT NOT NULL,
  distrito TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  origen_archivo TEXT,
  origen_hoja TEXT,
  origen_fila INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tipo,nombre_completo,distrito)
);

CREATE TABLE IF NOT EXISTS actores_municipio (
  id TEXT PRIMARY KEY,
  municipio_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  tipo_actor TEXT NOT NULL CHECK (
    tipo_actor IN (
      'PRESIDENCIA_MUNICIPAL',
      'DIPUTACION_FEDERAL',
      'DIPUTACION_LOCAL',
      'LIDER',
      'ASPIRANTE_2027'
    )
  ),
  partido_id TEXT,
  referente_persona_id TEXT,
  referente_texto TEXT,
  distrito_texto TEXT,
  subreferente_texto TEXT,
  puede_reelegirse INTEGER,
  pretende_reelegirse INTEGER,
  podria_ganar_eleccion INTEGER,
  observaciones TEXT,
  orden_visual INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (municipio_id) REFERENCES municipios(id),
  FOREIGN KEY (persona_id) REFERENCES personas(id),
  FOREIGN KEY (partido_id) REFERENCES partidos(id),
  FOREIGN KEY (referente_persona_id) REFERENCES personas(id)
);

CREATE TABLE IF NOT EXISTS presidencia_referentes (
  id TEXT PRIMARY KEY,
  municipio_id TEXT NOT NULL,
  referente_persona_id TEXT,
  referente_texto TEXT,
  orden_visual INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (municipio_id) REFERENCES municipios(id),
  FOREIGN KEY (referente_persona_id) REFERENCES personas(id)
);

CREATE INDEX IF NOT EXISTS idx_presidencia_referentes_municipio
  ON presidencia_referentes(municipio_id, orden_visual);

CREATE TABLE IF NOT EXISTS personal_territorio (
  id TEXT PRIMARY KEY,
  municipio_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  tipo_personal_id TEXT NOT NULL,
  cargo_funcion_texto TEXT,
  referente_persona_id TEXT,
  referente_texto TEXT,
  orden_visual INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (municipio_id) REFERENCES municipios(id),
  FOREIGN KEY (persona_id) REFERENCES personas(id),
  FOREIGN KEY (tipo_personal_id) REFERENCES tipos_personal_territorio(id),
  FOREIGN KEY (referente_persona_id) REFERENCES personas(id)
);

CREATE TABLE IF NOT EXISTS personal_coordinacion (
  id TEXT PRIMARY KEY,
  municipio_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  cargo TEXT,
  coordinacion_general TEXT,
  region TEXT,
  telefono TEXT,
  foto_path TEXT,
  orden_visual INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (municipio_id) REFERENCES municipios(id)
);

CREATE TABLE IF NOT EXISTS archivos_municipio (
  id TEXT PRIMARY KEY,
  municipio_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  ruta TEXT NOT NULL,
  nombre_original TEXT NOT NULL,
  mime_type TEXT,
  hash_sha256 TEXT,
  user_id TEXT,
  orden_visual INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (municipio_id) REFERENCES municipios(id),
  FOREIGN KEY (user_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  office_id TEXT NOT NULL,
  user_id TEXT,
  municipio_id TEXT,
  entity TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_actores_municipio ON actores_municipio(municipio_id);
CREATE INDEX IF NOT EXISTS idx_personal_municipio ON personal_territorio(municipio_id);
CREATE INDEX IF NOT EXISTS idx_personal_coordinacion_municipio ON personal_coordinacion(municipio_id, orden_visual);
CREATE INDEX IF NOT EXISTS idx_audit_municipio ON audit_log(municipio_id, created_at);

CREATE INDEX IF NOT EXISTS idx_personas_nombre ON personas(nombre, apellido_paterno, apellido_materno);
CREATE INDEX IF NOT EXISTS idx_grupos_presencia_municipio ON grupos_presencia_municipio(municipio_id, orden_visual);
CREATE INDEX IF NOT EXISTS idx_directorio_diputaciones_tipo ON directorio_diputaciones(tipo, activo, nombre_completo);
