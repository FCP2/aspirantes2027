const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const controller = require('../controllers/files.controller');

function storageFor(dir) {
  fs.mkdirSync(dir,{recursive:true});
  return multer.diskStorage({
    destination:(req,file,cb)=>cb(null,dir),
    filename:(req,file,cb)=>{
      const ext=path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null,`${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`);
    }
  });
}
const photoUpload = multer({storage:storageFor(path.resolve('./storage/photos')),limits:{fileSize:8*1024*1024}});
const hoja2Upload = multer({storage:storageFor(path.resolve('./storage/hoja2')),limits:{fileSize:15*1024*1024}});
const anexosUpload = multer({
  storage:storageFor(path.resolve('./storage/hoja2')),
  limits:{fileSize:30*1024*1024,files:20},
  fileFilter:(req,file,cb)=>{
    if (['image/jpeg','image/png','application/pdf'].includes(file.mimetype)) return cb(null,true);
    cb(Object.assign(new Error('FORMATO NO PERMITIDO. USA JPG, PNG O PDF.'),{status:400}));
  }
});

router.post('/photo',photoUpload.single('file'),controller.uploadPhoto);
router.post('/hoja2/:municipioId',hoja2Upload.single('file'),controller.uploadHoja2);
router.post('/anexos/:municipioId',anexosUpload.array('files',20),controller.uploadAnexos);
router.put('/anexos/:municipioId/:archivoId',anexosUpload.single('file'),controller.replaceAnexo);
router.delete('/anexos/:municipioId/:archivoId',controller.deleteAnexo);
module.exports=router;
