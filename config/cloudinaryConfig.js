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

const uploadToCloudinary = async (buffer, folder = 'chat_files', resourceType = 'auto', options = {}) => {
  try {
    if (!buffer || buffer.length === 0) {
      throw new Error('Empty file buffer');
    }
    return new Promise((resolve, reject) => {
      const uploadOptions = {
        folder,
        resource_type: resourceType,
        ...options
      };

      const stream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
      stream.end(buffer);
    });
  } catch (error) {
    throw new Error('Failed to upload file to Cloudinary');
  }
};

module.exports = { cloudinary, storage, uploadToCloudinary };