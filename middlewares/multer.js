const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/ogg',
    'application/pdf',
  ];

  console.log('Archivo recibido en Multer:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  });

  if (!allowedTypes.includes(file.mimetype)) {
    return cb(
      new Error(
        `Tipo de archivo no permitido: ${file.mimetype} (${file.originalname}). Solo se permiten imágenes (jpeg, jpg, png, gif, webp), videos (mp4, webm, ogg) o PDFs.`
      ),
      false
    );
  }

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