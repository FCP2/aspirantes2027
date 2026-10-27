const repo = require('../repositories/municipios.repository');

exports.listByOffice = (officeId) => repo.listByOffice(officeId);

exports.getAllowedMunicipio = (municipioId, officeId) => {
  const municipio = repo.getAllowedMunicipio(municipioId, officeId);
  if (!municipio) {
    const error = new Error('MUNICIPIO NO AUTORIZADO PARA ESTA OFICINA');
    error.status = 403;
    throw error;
  }
  return municipio;
};
