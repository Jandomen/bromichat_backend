const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'chat_files',
    resource_type: 'auto',
  },
});

const uploadToCloudinary = async (buffer) => {
  try {
    if (!buffer || buffer.length === 0) {
      //console.error('Buffer vacío recibido en uploadToCloudinary');
      throw new Error('Empty file buffer');
    }
    return new Promise((resolve, reject) => {
      //console.log('Subiendo archivo a Cloudinary, buffer size:', buffer.length);
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'chat_files', resource_type: 'auto' },
        (error, result) => {
          if (error) {
            //console.error('Cloudinary upload error:', error);
            reject(error);
          } else {
            //console.log('Cloudinary upload success:', result.secure_url);
            resolve(result);
          }
        }
      );
      stream.end(buffer);
    });
  } catch (error) {
    //console.error('Error en uploadToCloudinary:', error);
    throw new Error('Failed to upload file to Cloudinary');
  }
};

module.exports = { cloudinary, storage, uploadToCloudinary };