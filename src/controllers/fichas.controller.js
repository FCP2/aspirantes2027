const service = require('../services/fichas.service');
const { verificador } = require('../../tools/integracion-actores');

function scheduleActorVerification(ficha) {
  setImmediate(() => verificador.verifyFicha(ficha).catch(error => {
    console.error('Verificación de Actores pendiente:', error.message);
  }));
}

exports.get=(req,res,next)=>{
  try{
    const officeId=process.env.OFFICE_ID||'COORD-01';
    const data=service.getFicha(req.params.municipioId,officeId);
    res.json({ok:true,data});
    scheduleActorVerification(data);
  }catch(e){next(e)}
};
exports.saveFull=(req,res,next)=>{
  try{
    const officeId=process.env.OFFICE_ID||'COORD-01';
    const data=service.saveFull({municipioId:req.params.municipioId,officeId,payload:req.body});
    res.json({ok:true,data});
    scheduleActorVerification(data);
  }catch(e){next(e)}
};
