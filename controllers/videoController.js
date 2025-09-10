const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('../config/cloudinaryConfig');
const streamifier = require('streamifier');
const Video = require('../models/Video');

const upload = multer({ storage: multer.memoryStorage() });

const videoPublic = async (req, res) => {
  const { publicId } = req.params;

  if (!publicId) {
   // console.warn('[videoPublic] Falta el ID del video');
    return res.status(400).json({ error: 'Falta el ID del video' });
  }

  try {
    const result = await cloudinary.api.resource(publicId, { resource_type: 'video' });

    if (!result) {
     // console.warn('[videoPublic] Video no encontrado');
      return res.status(404).json({ error: 'Video no encontrado' });
    }

   // console.log('[videoPublic] Video encontrado:', result.secure_url);
    res.json({ videoUrl: result.secure_url });
  } catch (err) {
   // console.error('[videoPublic] Error al obtener información del video:', err);
    res.status(500).json({ error: 'Error al obtener la información del video' });
  }
};

const userVideos = async (req, res) => {
  try {
    const userId = req.user._id;
    const videos = await Video.find({ user: userId })
                              .sort({ createdAt: -1 })
                              .populate('user', '_id username');
    res.json(videos);
  } catch (err) {
   // console.error('[userVideos] Error al obtener videos:', err);
    res.status(500).json({ error: 'Error al obtener videos' });
  }
};


const uploadVideo = async (req, res) => {
  try {
    if (!req.file) {
     // console.warn('[uploadVideo] No se ha seleccionado un archivo');
      return res.status(400).json({ error: 'No se ha subido ningún archivo' });
    }

    const { title, description } = req.body;
    const user = req.user;

    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: 'video' },
      async (error, result) => {
        if (error) {
         // console.error('[uploadVideo] Error al subir el video a Cloudinary:', error);
          return res.status(500).json({ error: 'Error al subir el video' });
        }

        try {
          const video = new Video({
            title,
            description,
            user: user._id,
            videoUrl: result.secure_url,
            publicId: result.public_id,
          });

          await video.save();
         // console.log('[uploadVideo] Video guardado exitosamente:', result.secure_url);
          res.json({ videoUrl: result.secure_url });
        } catch (err) {
         // console.error('[uploadVideo] Error al guardar el video en la base de datos:', err);
          res.status(500).json({ error: 'Error al guardar el video en la base de datos' });
        }
      }
    );

    streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
  } catch (err) {
   // console.error('[uploadVideo] Error general al subir video:', err);
    res.status(500).json({ error: 'Error al subir el video' });
  }
};

const deleteVideo = async (req, res) => {
  const { publicId } = req.body;

  if (!publicId) {
   // console.warn('[deleteVideo] Falta el ID del video');
    return res.status(400).json({ error: 'Falta el ID del video' });
  }

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });

    await Video.findOneAndDelete({ publicId });

   // console.log('[deleteVideo] Video eliminado correctamente:', publicId);
    res.json({ message: 'Video eliminado exitosamente' });
  } catch (err) {
   // console.error('[deleteVideo] Error al eliminar el video:', err);
    res.status(500).json({ error: 'Error al eliminar el video' });
  }
};


const getVideoById = async (req, res) => {
  const { videoId } = req.params;

  try {
    const video = await Video.findById(videoId).populate('user', 'username profilePicture');

    if (!video) {
     // console.warn('[getVideoById] Video no encontrado:', videoId);
      return res.status(404).json({ error: 'Video no encontrado' });
    }

   // console.log('[getVideoById] Video encontrado:', video._id);
    res.json(video);
  } catch (err) {
   // console.error('[getVideoById] Error al obtener el video:', err);
    res.status(500).json({ error: 'Error al obtener el video' });
  }
};

const searchVideosByTitle = async (req, res) => {
  const { title } = req.query;

  if (!title) {
   // console.warn('[searchVideosByTitle] Título no proporcionado');
    return res.status(400).json({ error: 'Debe proporcionar un título de búsqueda' });
  }

  try {
    const videos = await Video.find({
      title: { $regex: title, $options: 'i' }
    }).populate('user', 'username profilePicture');

    if (videos.length === 0) {
     // console.warn('[searchVideosByTitle] No se encontraron videos con ese título');
      return res.status(404).json({ message: 'No se encontraron videos con ese título' });
    }

   // console.log(`[searchVideosByTitle] ${videos.length} videos encontrados con el título: "${title}"`);
    res.json(videos);
  } catch (err) {
   // console.error('[searchVideosByTitle] Error al buscar videos:', err);
    res.status(500).json({ error: 'Error al buscar videos' });
  }
};

const userVideosById = async (req, res) => {
  try {
    const { userId } = req.params;

    const videos = await Video.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate('user', 'username profilePicture');

   // console.log(`[userVideosById] ${videos.length} videos encontrados para el usuario ${userId}`);
    res.status(200).json(videos);
  } catch (error) {
   // console.error('[userVideosById] Error al obtener videos del usuario:', error);
    res.status(500).json({ error: 'Error al obtener videos del usuario' });
  }
};

module.exports = {
  videoPublic,
  userVideos,
  uploadVideo,
  deleteVideo,
  getVideoById,
  searchVideosByTitle,
  userVideosById,
};
