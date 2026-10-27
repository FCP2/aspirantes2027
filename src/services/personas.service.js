const { v4: uuidv4 } = require('uuid');
const repo = require('../repositories/personas.repository');
const { normalizeText, normalizePersonName, normalizeSearch } = require('../utils/textNormalizer');

const norm = p => ({
  nombre: normalizePersonName(p.nombre || ''),
  apellidoPaterno: normalizePersonName(p.apellido_paterno || ''),
  apellidoMaterno: normalizePersonName(p.apellido_materno || ''),
  fotoPath: p.foto_path || null,
  clearPhoto: p.foto_eliminar === true || p.foto_eliminar === 1 || p.foto_eliminar === '1'
});

exports.search = term => repo.search(normalizeText(term || ''));
exports.searchReferentes = term => repo.searchReferentes(normalizeText(term || '')).map(person => ({
  ...person,
  nombre_completo:normalizePersonName([person.nombre,person.apellido_paterno,person.apellido_materno].filter(Boolean).join(' '))
}));

exports.resolveOrCreate = payload => {
  if (payload.persona_id) {
    const ex = repo.findById(payload.persona_id);
    if (ex) {
      const n = norm(payload);
      if (n.nombre) {
        const submittedIdentity = [n.nombre,n.apellidoPaterno,n.apellidoMaterno].map(value => normalizeSearch(value || ''));
        const currentIdentity = [ex.nombre,ex.apellido_paterno,ex.apellido_materno].map(value => normalizeSearch(value || ''));
        const isSamePerson = submittedIdentity.every((value,index) => value === currentIdentity[index]);

        // Una ficha puede sustituir a su titular sin renombrar globalmente a la
        // persona anterior. Si la identidad cambió, enlaza una persona existente
        // o crea una nueva; las demás fichas conservan intacto su actor original.
        if (!isSamePerson) {
          const existingPerson = repo.findExact(n);
          if (existingPerson) {
            if (n.clearPhoto || (n.fotoPath && n.fotoPath !== existingPerson.foto_path)) {
              return repo.update({ id: existingPerson.id, ...n });
            }
            return existingPerson;
          }
          return repo.create({ id: uuidv4(), ...n });
        }

        return repo.update({ id: ex.id, ...n });
      }
      return ex;
    }
  }
  const n = norm(payload);
  if (!n.nombre) throw Object.assign(new Error('EL NOMBRE ES OBLIGATORIO'), { status: 400 });
  const ex = repo.findExact(n);
  if (ex) {
    if (n.clearPhoto && ex.foto_path) return repo.update({ id: ex.id, ...n });
    if (n.fotoPath && n.fotoPath !== ex.foto_path) return repo.update({ id: ex.id, ...n });
    return ex;
  }
  return repo.create({ id: uuidv4(), ...n });
};

exports.resolveReference = payload => {
  const typedName = normalizePersonName(payload.referente_nombre || payload.referente_completo || '');
  if (!typedName && payload.referente_persona_id) {
    const selected = repo.findById(payload.referente_persona_id);
    return selected ? repo.markAsReferente(selected.id) : null;
  }
  if (!typedName) return null;

  let person = null;
  if (payload.referente_persona_id) {
    const selected = repo.findById(payload.referente_persona_id);
    const selectedName = selected
      ? [selected.nombre,selected.apellido_paterno,selected.apellido_materno].filter(Boolean).join(' ')
      : '';
    if (normalizePersonName(selectedName) === typedName) person = selected;
  }
  if (!person) person = exports.resolveOrCreate({nombre:typedName,apellido_paterno:'',apellido_materno:''});
  return repo.markAsReferente(person.id);
};
