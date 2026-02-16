const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  console.log('Archivo recibido en Multer:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  });


  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 10,
  },
  fileFilter,
});

module.exports = upload;