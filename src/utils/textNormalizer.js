function normalizeUpper(value = '') {
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('es-MX');
}

function normalizeText(value = '') {
  return String(value).trim().replace(/\s+/g, ' ');
}

const lowerNameWords = new Set(['de','del','la','las','los','y','e','da','das','do','dos']);
const uppercaseNameExceptions = new Set([
  'HDO','IMM','PRI','PRD','PAN','PVEM','PT','MC','MORENA','COTS',
  'INE','IEEM','DIF','IMSS','ISSSTE','UAEM','SNTE','CNTE','SUTEYM','PES','RSP','FXM'
]);

function normalizePersonName(value = '') {
  return normalizeText(value).split(' ').map((word,index) => {
    const lower = word.toLocaleLowerCase('es-MX');
    if (index > 0 && lowerNameWords.has(lower)) return lower;
    return word.split('-').map(part => {
      const partLower = part.toLocaleLowerCase('es-MX');
      if (uppercaseNameExceptions.has(part.toLocaleUpperCase('es-MX'))) return part.toLocaleUpperCase('es-MX');
      return partLower.charAt(0).toLocaleUpperCase('es-MX') + partLower.slice(1);
    }).join('-');
  }).join(' ');
}

function normalizeSearch(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('es-MX')
    .trim();
}

module.exports = { normalizeUpper, normalizeText, normalizePersonName, normalizeSearch };
