const Video = require('../models/Video');
const { cloudinary, uploadToCloudinary } = require('../config/cloudinaryConfig');

// Obtener URL pública de un video por publicId
const videoPublic = async (req, res) => {
  const { publicId } = req.params;
  if (!publicId) return res.status(400).json({ error: 'Falta el ID del video' });

  try {
    const result = await cloudinary.api.resource(publicId, { resource_type: 'video' });
    if (!result) return res.status(404).json({ error: 'Video no encontrado' });

    res.json({ videoUrl: result.secure_url });
  } catch (err) {
  //  console.error('[videoPublic] Error al obtener información del video:', err);
    res.status(500).json({ error: 'Error al obtener la información del video' });
  }
};

// Obtener todos los videos del usuario autenticado
const userVideos = async (req, res) => {
  try {
    const userId = req.user._id;
    const videos = await Video.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate('user', '_id username');
    res.json(videos);
  } catch (err) {
  //  console.error('[userVideos] Error al obtener videos:', err);
    res.status(500).json({ error: 'Error al obtener videos' });
  }
};

// Subir video
const uploadVideo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se ha subido ningún archivo' });

    const { title, description } = req.body;
    const user = req.user;

    // Subir a Cloudinary usando la función de config
    const result = await uploadToCloudinary(req.file.buffer);

    // Guardar en la base de datos
    const video = new Video({
      title,
      description,
      user: user._id,
      videoUrl: result.secure_url,
      publicId: result.public_id,
    });

    await video.save();

    res.json({ videoUrl: result.secure_url, publicId: result.public_id });
  } catch (err) {
  //  console.error('[uploadVideo] Error al subir video:', err);
    res.status(500).json({ error: 'Error al subir el video' });
  }
};

// Eliminar video
const deleteVideo = async (req, res) => {
  const { publicId } = req.body;
  if (!publicId) return res.status(400).json({ error: 'Falta el ID del video' });

  try {
    const video = await Video.findOne({ publicId });
    if (!video) return res.status(404).json({ error: 'Video no encontrado' });

    // Verificar que el usuario sea dueño del video
    if (!video.user.equals(req.user._id)) {
      return res.status(403).json({ error: 'No autorizado para eliminar este video' });
    }

    await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
    await Video.findOneAndDelete({ publicId });

    res.json({ message: 'Video eliminado exitosamente' });
  } catch (err) {
  //  console.error('[deleteVideo] Error al eliminar el video:', err);
    res.status(500).json({ error: 'Error al eliminar el video' });
  }
};

// Obtener video por ID
const getVideoById = async (req, res) => {
  const { videoId } = req.params;
  try {
    const video = await Video.findById(videoId).populate('user', 'username profilePicture');
    if (!video) return res.status(404).json({ error: 'Video no encontrado' });

    res.json(video);
  } catch (err) {
  //  console.error('[getVideoById] Error al obtener el video:', err);
    res.status(500).json({ error: 'Error al obtener el video' });
  }
};

// Buscar videos por título
const searchVideosByTitle = async (req, res) => {
  const { title } = req.query;
  if (!title) return res.status(400).json({ error: 'Debe proporcionar un título de búsqueda' });

  try {
    const videos = await Video.find({ title: { $regex: title, $options: 'i' } })
      .populate('user', 'username profilePicture');

    if (videos.length === 0) return res.status(404).json({ message: 'No se encontraron videos con ese título' });

    res.json(videos);
  } catch (err) {
  //  console.error('[searchVideosByTitle] Error al buscar videos:', err);
    res.status(500).json({ error: 'Error al buscar videos' });
  }
};

// Obtener videos de un usuario por su ID
const userVideosById = async (req, res) => {
  const { userId } = req.params;
  try {
    const videos = await Video.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate('user', 'username profilePicture');

    res.json(videos);
  } catch (err) {
  //  console.error('[userVideosById] Error al obtener videos del usuario:', err);
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
