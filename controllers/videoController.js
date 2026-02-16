const Video = require('../models/Video');
const Post = require('../models/Post');
const User = require('../models/User');
const { cloudinary, uploadToCloudinary } = require('../config/cloudinaryConfig');
const { createNotification } = require('../config/notificationService');

const videoPublic = async (req, res) => {
  const { publicId } = req.params;
  if (!publicId) return res.status(400).json({ error: 'Falta el ID del video' });

  try {
    const result = await cloudinary.api.resource(publicId, { resource_type: 'video' });
    if (!result) return res.status(404).json({ error: 'Video no encontrado' });

    res.json({ videoUrl: result.secure_url });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener la información del video' });
  }
};

const userVideos = async (req, res) => {
  try {
    const userId = req.user._id;
    const videos = await Video.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate('user', '_id username profilePicture')
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture');
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener videos' });
  }
};
const userVideosById = async (req, res) => {
  try {
    const { userId } = req.params;
    const videos = await Video.find({ user: userId, isPrivate: false })
      .sort({ createdAt: -1 })
      .populate('user', '_id username profilePicture')
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture');
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener videos del usuario' });
  }
};

// Subir video
const uploadVideo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se ha subido ningún archivo' });

    const { title, description, isPrivate, allowFeed, category } = req.body;
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
      isPrivate: isPrivate === 'true',
      allowFeed: allowFeed === 'true',
      category: category || 'Todos'
    });

    await video.save();

    // Solo crear post si NO es privado y si se permite el feed
    if (isPrivate !== 'true' && allowFeed === 'true') {
      try {
        const newPost = new Post({
          user: user._id,
          content: description || title || 'Nuevo video subido',
          media: [{
            url: result.secure_url,
            mediaType: 'video'
          }],
          likes: [],
          comments: []
        });
        await newPost.save();
      } catch (postErr) {
        console.error('Error creating auto-post for video:', postErr);
      }
    }

    res.json({ videoUrl: result.secure_url, publicId: result.public_id, video });
  } catch (err) {
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

    if (!video.user.equals(req.user._id)) {
      return res.status(403).json({ error: 'No autorizado para eliminar este video' });
    }

    await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
    await Video.findOneAndDelete({ publicId });

    await Post.findOneAndDelete({
      user: req.user._id,
      'media.url': video.videoUrl
    });

    res.json({ message: 'Video eliminado exitosamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar el video' });
  }
};

// Obtener video por ID
const getVideoById = async (req, res) => {
  const { videoId } = req.params;
  try {
    const video = await Video.findById(videoId)
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture');
    if (!video) return res.status(404).json({ error: 'Video no encontrado' });
    res.json(video);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener the video' });
  }
};

// Actualizar video
const updateVideo = async (req, res) => {
  const { videoId } = req.params;
  const { title, description, isPrivate, allowFeed, category } = req.body;

  try {
    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ error: 'Video no encontrado' });

    if (video.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado para editar este video' });
    }

    if (title !== undefined) video.title = title;
    if (description !== undefined) video.description = description;
    if (isPrivate !== undefined) video.isPrivate = isPrivate;
    if (allowFeed !== undefined) video.allowFeed = allowFeed;
    if (category !== undefined) video.category = category;

    await video.save();
    res.json(video);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar video' });
  }
};

// Buscar videos por título
const searchVideosByTitle = async (req, res) => {
  const { title } = req.query;
  if (!title) return res.status(400).json({ error: 'Debe proporcionar un título de búsqueda' });

  try {
    const videos = await Video.find({
      title: { $regex: title, $options: 'i' },
      isPrivate: false
    })
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture');
    if (videos.length === 0) return res.status(404).json({ message: 'No se encontraron videos con ese título' });
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: 'Error al buscar videos' });
  }
};

// Obtener feed de videos "TikTok" style (SOLO USUARIOS REALES)
const getVideoFeed = async (req, res) => {
  try {
    const { category } = req.query;
    const userId = req.user._id;
    const currentUser = await User.findById(userId).select('blockedUsers');
    const blockedIds = currentUser ? currentUser.blockedUsers.map(id => id.toString()) : [];

    const query = {
      user: { $nin: blockedIds },
      isPrivate: false,
      allowFeed: true
    };

    if (category && category !== 'Todos') {
      query.category = category;
    }

    // Fetch ANY public video except from blocked users
    const allVideos = await Video.find(query)
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture')
      .sort({ createdAt: -1 })
      .limit(100);

    // Order: first 10 strictly recent, then shuffle the rest
    const mostRecent = allVideos.slice(0, 10);
    const theRest = allVideos.slice(10).sort(() => Math.random() - 0.5);

    res.json([...mostRecent, ...theRest]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener el feed de videos' });
  }
};

// Reaccionar a un video
const reactToVideo = async (req, res) => {
  const { videoId } = req.params;
  const { type } = req.body;
  const userId = req.user._id;

  try {
    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ error: 'Video no encontrado' });

    const existingReactionIndex = video.reactions.findIndex(r => r.user.toString() === userId.toString());

    if (existingReactionIndex > -1) {
      if (video.reactions[existingReactionIndex].type === type) {
        // Remove if same type (toggle)
        video.reactions.splice(existingReactionIndex, 1);
      } else {
        // Change type
        video.reactions[existingReactionIndex].type = type;
      }
    } else {
      video.reactions.push({ user: userId, type });
      if (video.user.toString() !== userId.toString()) {
        const emojiMap = { like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😡', surprised: '😄', shocked: '😮', thinking: '🤔', risky: '😬', irrelevant: '🚫' };
        await createNotification({
          recipientId: video.user,
          senderId: userId,
          type: 'reaction',
          message: `${req.user.username} reaccionó con ${emojiMap[type] || '✨'} a tu video`,
          link: `/videos/${video._id}`,
          videoId: video._id,
          io: req.app.get('io'),
        });
      }
    }

    await video.save();
    await video.populate('reactions.user', 'username profilePicture');
    res.json(video.reactions);
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar la reacción' });
  }
};

// Comentar un video
const addVideoComment = async (req, res) => {
  const { videoId } = req.params;
  const { comment } = req.body;
  const userId = req.user._id;

  try {
    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ error: 'Video no encontrado' });

    video.comments.push({ user: userId, comment });
    await video.save();

    if (video.user.toString() !== userId.toString()) {
      await createNotification({
        recipientId: video.user,
        senderId: userId,
        type: 'comment',
        message: `${req.user.username} ha comentado en tu video`,
        link: `/videos/${video._id}`,
        videoId: video._id,
        io: req.app.get('io'),
      });
    }

    const updatedVideo = await Video.findById(videoId)
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture');
    res.json(updatedVideo.comments);
  } catch (err) {
    res.status(500).json({ error: 'Error al añadir comentario' });
  }
};

// Responder a un comentario de video
const addVideoReply = async (req, res) => {
  const { videoId, commentId } = req.params;
  const { comment } = req.body;
  const userId = req.user._id;

  try {
    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ error: 'Video no encontrado' });

    const parentComment = video.comments.id(commentId);
    if (!parentComment) return res.status(404).json({ error: 'Comentario no encontrado' });

    video.comments.push({
      user: userId,
      comment,
      parentId: commentId // Link for recursive threading
    });
    await video.save();

    if (parentComment.user.toString() !== userId.toString()) {
      await createNotification({
        recipientId: parentComment.user,
        senderId: userId,
        type: 'comment',
        message: `${req.user.username} respondió a tu comentario`,
        link: `/videos/${video._id}`,
        videoId: video._id,
        io: req.app.get('io'),
      });
    }

    const updatedVideo = await Video.findById(videoId)
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture');

    res.json(updatedVideo.comments);
  } catch (err) {
    res.status(500).json({ error: 'Error al añadir respuesta' });
  }
};

// Compartir video (ESTILO FACEBOOK)
const shareVideo = async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user._id;
  const { content } = req.body;

  try {
    const video = await Video.findById(videoId).populate('user', 'username profilePicture');
    if (!video) return res.status(404).json({ error: 'Video no encontrado' });

    // Buscar si ya existe un post original para este video
    let originalPost = await Post.findOne({
      user: video.user._id,
      'media.url': video.videoUrl
    });

    if (!originalPost) {
      // Creamos un post "fuente" si no existe
      originalPost = new Post({
        user: video.user._id,
        content: video.description || video.title || 'Mira mi video',
        media: [{
          url: video.videoUrl,
          mediaType: 'video'
        }]
      });
      await originalPost.save();
    }

    // Crear la publicación compartida
    const newPost = new Post({
      user: userId,
      content: content || '', // Comentario del que comparte
      sharedFrom: originalPost._id,
      media: [] // El contenido viene del original
    });

    await newPost.save();

    if (video.user._id.toString() !== userId.toString()) {
      await createNotification({
        recipientId: video.user._id,
        senderId: userId,
        type: 'share',
        message: `${req.user.username} ha compartido tu video`,
        link: `/posts/${newPost._id}`,
        postId: newPost._id,
        io: req.app.get('io'),
      });
    }

    res.json({ message: 'Video compartido en tu muro', post: newPost });
  } catch (err) {
    res.status(500).json({ error: 'Error al compartir video' });
  }
};

// Actualizar comentario de video
const updateVideoComment = async (req, res) => {
  const { videoId, commentId } = req.params;
  const { comment } = req.body;
  const userId = req.user._id;

  try {
    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ error: 'Video no encontrado' });

    const commentObj = video.comments.id(commentId);
    if (!commentObj) return res.status(404).json({ error: 'Comentario no encontrado' });

    if (commentObj.user.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    commentObj.comment = comment;
    commentObj.isEdited = true;
    await video.save();

    const populatedVideo = await Video.findById(videoId)
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture');

    res.json(populatedVideo.comments);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar comentario' });
  }
};

// Eliminar comentario de video
const deleteVideoComment = async (req, res) => {
  const { videoId, commentId } = req.params;
  const userId = req.user._id;

  try {
    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ error: 'Video no encontrado' });

    const commentObj = video.comments.id(commentId);
    if (!commentObj) return res.status(404).json({ error: 'Comentario no encontrado' });

    // Verificar si es el autor del comentario o el autor del video
    if (commentObj.user.toString() !== userId.toString() && video.user.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    // Eliminar el comentario y sus respuestas (mismo parentId)
    video.comments = video.comments.filter(c =>
      c._id.toString() !== commentId &&
      (!c.parentId || c.parentId.toString() !== commentId)
    );

    await video.save();

    const populatedVideo = await Video.findById(videoId)
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture');

    res.json(populatedVideo.comments);
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar comentario' });
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
  getVideoFeed,
  reactToVideo,
  addVideoComment,
  addVideoReply,
  updateVideoComment,
  deleteVideoComment,
  shareVideo,
  updateVideo
};
