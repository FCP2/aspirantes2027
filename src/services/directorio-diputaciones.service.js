const { randomUUID } = require('crypto');
const repo = require('../repositories/directorio-diputaciones.repository');
const { normalizeUpper, normalizePersonName } = require('../utils/textNormalizer');

function normalizeType(tipo) {
  const normalized = String(tipo || '').trim().toUpperCase();
  if (!['FEDERAL','LOCAL'].includes(normalized)) {
    throw Object.assign(new Error('TIPO DE DIPUTACIÓN NO VÁLIDO'),{status:400});
  }
  return normalized;
}

function normalizeRecord(input={}) {
  const tipo = normalizeType(input.tipo);
  const nombre_completo = normalizePersonName(input.nombre_completo || '');
  const distrito = normalizeUpper(input.distrito || '');
  if (!nombre_completo || !distrito) {
    throw Object.assign(new Error('EL NOMBRE COMPLETO Y EL DISTRITO SON OBLIGATORIOS'),{status:400});
  }
  return {tipo,nombre_completo,distrito};
}

exports.list = tipo => repo.list(normalizeType(tipo));

exports.create = input => {
  const item = normalizeRecord(input);
  const duplicate = repo.findDuplicate(item.tipo,item.nombre_completo,item.distrito);
  if (duplicate) {
    if (!duplicate.activo) repo.reactivate(duplicate.id,new Date().toISOString());
    return repo.getById(duplicate.id);
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  repo.insert({...item,id,now});
  return repo.getById(id);
};

exports.update = (id,input) => {
  const current = repo.getById(id);
  if (!current) throw Object.assign(new Error('REGISTRO DEL DIRECTORIO NO ENCONTRADO'),{status:404});
  const item = normalizeRecord({...input,tipo:current.tipo});
  const duplicate = repo.findDuplicate(item.tipo,item.nombre_completo,item.distrito,id);
  if (duplicate) throw Object.assign(new Error('YA EXISTE OTRO REGISTRO CON EL MISMO NOMBRE Y DISTRITO'),{status:409});
  repo.update({...item,id,now:new Date().toISOString()});
  return repo.getById(id);
};

exports.remove = id => {
  const current = repo.getById(id);
  if (!current) throw Object.assign(new Error('REGISTRO DEL DIRECTORIO NO ENCONTRADO'),{status:404});
  repo.deactivate(id,new Date().toISOString());
  return {id};
};
