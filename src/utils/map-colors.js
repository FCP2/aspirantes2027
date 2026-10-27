'use strict';
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const PARTY_COLORS = new Map([
 ['PAN','#233A7D'],['PRI','#C62828'],['PRD','#FFCC03'],['PVEM','#89C273'],['VERDE','#89C273'],['VERDE (PVEM)','#89C273'],
 ['PT','#E65100'],['MC','#F08318'],['MORENA','#5C1C2A'],['NA','#8ABCBB'],['NAEM','#8ABCBB'],['ALIANZA','#8ABCBB'],['ALIANZA (NA)','#8ABCBB']
]);
const REFERENCE_COLORS = new Map([
 ['GOBERNADORA','#84271C'],
 ['HORACIO DUARTE OLIVARES','#BA2054'],
 ['HDO','#BA2054'],
 ['HIGINIO MARTINEZ MIRANDA','#007C91'],
 ['MEXIQUENSES DE CORAZON','#CDB996'],
 ['UNIDOS','#0B1B13'],
 ['DANIEL SERRANO','#B979B1'],
 ['OBRADORISTAS','#951B81'],
 ['RACIEL PEREZ CRUZ','#93CDC1'],
 ['JOSE ALBERTO COUTTOLENC BUENTELLO','#5B3A8E'],
 ['DELFINA GOMEZ ALVAREZ','#C26A1B'],
 ['CRISTINA RUIZ SANDOVAL','#2E6F95'],
 ['JUANA BONILLA JAIME','#B23A48'],
 ['ENRIQUE VARGAS DEL VILLAR','#6A4C93'],
 ['ANUAR ROBERTO AZAR FIGUEROA','#2F7D5A'],
 ['JUAN CARLOS GONZALEZ ROMERO','#8A5A44'],
 ['REGINALDO SANDOVAL FLORES','#6B4F2A'],
 ['OSCAR GONZALEZ YAÑEZ','#7B2D8E'],
 ['JUAN ZEPEDA HERNANDEZ','#356859'],
 ['LUZ MA HERNANDEZ BERMUDEZ','#A05A7A'],
 ['RICARDO AGUILAR CASTILLO','#4056A1'],
 ['PEDRO ZENTENO SANTAELLA','#6D8B74'],
 ['MERCEDES COLIN GUADARRAMA','#A65F38'],
 ['JOSE FRANCISCO VAZQUEZ RODRIGUEZ','#7A5195']
]);
const PARTY_LOGOS = new Map([
 ['MC',['mc']],['MOVIMIENTO CIUDADANO',['mc']],['MORENA',['morena']],['PAN',['pan']],
 ['PRD',['prd']],['PRI',['pri']],['PT',['pt']],['PVEM',['pvem']],['VERDE',['pvem']],['VERDE (PVEM)',['pvem']]
]);
function partyLogoKeys(value) {
 const party=normalize(value);
 if (PARTY_LOGOS.has(party)) return PARTY_LOGOS.get(party);
 const coalition=[];
 [['MORENA','morena'],['PVEM','pvem'],['PRI','pri'],['PAN','pan'],['PRD','prd'],['PT','pt'],['MC','mc']].forEach(([token,key])=>{
  if (new RegExp(`(^|[^A-Z])${token}([^A-Z]|$)`).test(party) && !coalition.includes(key)) coalition.push(key);
 });
 return coalition;
}
exports.partyColor = value => PARTY_COLORS.get(normalize(value)) || '';
exports.partyLogos = value => partyLogoKeys(value).map(key=>`/img/${key}.png`);
exports.referenceColor = value => REFERENCE_COLORS.get(normalize(value)) || '';
exports.NEUTRAL_COLOR = '#AEB6C1';
