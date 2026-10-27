const service = require('../services/files.service');
const path = require('path');

exports.uploadPhoto = (req,res,next) => {
  try {
    const relativePath = path.relative(process.cwd(), req.file.path).replace(/\\/g,'/');
    res.json({ok:true,data:{path:relativePath,name:req.file.originalname}});
  } catch(e){ next(e); }
};
exports.uploadHoja2 = (req,res,next) => {
  try {
    const data = service.register({municipioId:req.params.municipioId,tipo:'HOJA_02',file:req.file});
    res.json({ok:true,data});
  } catch(e){ next(e); }
};
exports.uploadAnexos = (req,res,next) => {
  try {
    const data = (req.files || []).map(file => service.register({municipioId:req.params.municipioId,tipo:'HOJA_02',file}));
    res.json({ok:true,data});
  } catch(e){ next(e); }
};
exports.deleteAnexo = (req,res,next) => {
  try {
    res.json({ok:true,data:service.remove({municipioId:req.params.municipioId,archivoId:req.params.archivoId})});
  } catch(e){ next(e); }
};
exports.replaceAnexo = (req,res,next) => {
  try {
    res.json({ok:true,data:service.replace({municipioId:req.params.municipioId,archivoId:req.params.archivoId,file:req.file})});
  } catch(e){ next(e); }
};
