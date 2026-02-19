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
    fileSize: 500 * 1024 * 1024, // 500MB limit for high quality videos
    files: 10,
  },
  fileFilter,
});

module.exports = upload;