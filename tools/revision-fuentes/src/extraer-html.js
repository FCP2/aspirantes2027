'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { decodeHtml, textoPlano } = require('./normalizar');

function linksDe(fragment) {
  return [...String(fragment).matchAll(/<a\b[^>]*class="[^"]*src[^"]*"[^>]*href="([^"]+)"[^>]*>/gi)]
    .map(match => decodeHtml(match[1]))
    .filter(url => /^https?:\/\//i.test(url));
}

function extraerAsociaciones(fragment) {
  const association = (fragment.match(/<span class="asoc(?:\s+mis)?">([\s\S]*?)<\/span>/i) || [])[1] || '';
  return [...association.matchAll(/<span class="mini[^>]*">([^<]+)<\/span>\s*([0-9]+)%/gi)]
    .map(match => ({ partido: textoPlano(match[1]), porcentaje: Number(match[2]) }));
}

function extraerPerfil(fragment, municipio) {
  const name = (fragment.match(/<span class="name">([\s\S]*?)<\/span>/i) || [])[1];
  if (!name) return null;
  const party = (fragment.match(/<span class="chip[^>]*">([\s\S]*?)<\/span>/i) || [])[1] || '';
  const plainParagraphs = [...fragment.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map(match => textoPlano(match[1]));
  const alert = (fragment.match(/<p class="alert">([\s\S]*?)<\/p>/i) || [])[1] || '';
  const explanation = (fragment.match(/<p class="expl">([\s\S]*?)<\/p>/i) || [])[1] || '';
  const explanationTypes = [...explanation.matchAll(/<span class="tipo[^>]*">([^<]+)<\/span>/gi)]
    .map(match => textoPlano(match[1]));
  return {
    municipio,
    nombre: textoPlano(name),
    partido: textoPlano(party),
    asociaciones: extraerAsociaciones(fragment),
    perfil: plainParagraphs.join(' '),
    alerta: textoPlano(alert),
    explicacion: textoPlano(explanation).replace(/^Por qué lo asocian así\s*/i, ''),
    tipos_explicacion: explanationTypes,
    fuentes: [...new Set(linksDe(fragment))]
  };
}

function extraerFuente(filePath) {
  const buffer = fs.readFileSync(filePath);
  const html = buffer.toString('utf8');
  const title = textoPlano((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || 'Fuente HTML');
  const eyebrow = textoPlano((html.match(/<p class="eyebrow">([\s\S]*?)<\/p>/i) || [])[1] || '');
  const sections = [...html.matchAll(/<section id="m(\d+)">([\s\S]*?)<\/section>/gi)];
  const municipios = sections.map(section => {
    const body = section[2];
    const municipio = textoPlano((body.match(/<h2>([\s\S]*?)<\/h2>/i) || [])[1] || '');
    const president = body.match(/Presidencia actual:\s*<strong>([\s\S]*?)<\/strong>\s*<span class="chip[^>]*">([\s\S]*?)<\/span>\s*<span class="reel[^>]*">([\s\S]*?)<\/span>/i);
    const list = (body.match(/<ul class="asps">([\s\S]*?)<\/ul>/i) || [])[1] || '';
    const profiles = [...list.matchAll(/<li>([\s\S]*?)<\/li>/gi)]
      .map(match => extraerPerfil(match[1], municipio))
      .filter(Boolean);
    return {
      municipio,
      presidencia: president ? {
        nombre: textoPlano(president[1]),
        partido: textoPlano(president[2]),
        reeleccion: textoPlano(president[3])
      } : null,
      perfiles: profiles
    };
  }).filter(item => item.municipio);

  const stats = fs.statSync(filePath);
  return {
    archivo: require('node:path').basename(filePath),
    titulo: title,
    contexto: eyebrow,
    hash: crypto.createHash('sha256').update(buffer).digest('hex'),
    bytes: buffer.length,
    modificado: stats.mtime.toISOString(),
    municipios,
    total_perfiles: municipios.reduce((sum, item) => sum + item.perfiles.length, 0),
    total_fuentes: municipios.reduce((sum, item) => sum + item.perfiles.reduce((inner, profile) => inner + profile.fuentes.length, 0), 0)
  };
}

module.exports = { extraerFuente };
