'use strict';

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeReferenceKey(value) {
  return compact(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function referenceDisplayName(row) {
  const dictionaryName = compact([
    row?.referente_nombre,
    row?.referente_apellido_paterno,
    row?.referente_apellido_materno
  ].filter(Boolean).join(' '));
  return dictionaryName || compact(row?.referente_texto);
}

function levenshtein(left, right) {
  const a = normalizeReferenceKey(left);
  const b = normalizeReferenceKey(right);
  let previous = Array.from({ length:b.length+1 },(_,index)=>index);
  for (let i=1;i<=a.length;i+=1) {
    const current=[i];
    for (let j=1;j<=b.length;j+=1) current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
    previous=current;
  }
  return previous[b.length];
}

function probablySameReference(left, right) {
  const a=normalizeReferenceKey(left), b=normalizeReferenceKey(right);
  if (!a || !b || a===b || Math.min(a.length,b.length)<12) return false;
  const aTokens=a.split(' '), bTokens=b.split(' ');
  if (aTokens.length<2 || aTokens.length!==bTokens.length) return false;
  const distance=levenshtein(a,b);
  return distance<=2 || (Math.max(a.length,b.length)>=16 && distance/Math.max(a.length,b.length)<=0.1);
}

module.exports = { compact, normalizeReferenceKey, referenceDisplayName, probablySameReference };
