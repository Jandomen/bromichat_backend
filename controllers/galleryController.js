const Gallery = require('../models/Gallery');
const Post = require('../models/Post');
const User = require('../models/User');
const { uploadToCloudinary } = require('../config/cloudinaryConfig');
const { createNotification } = require('../config/notificationService');

exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No se subió ningún archivo o buffer vacío' });
    }

    const { description, isPrivate, allowFeed, category } = req.body;
    const result = await uploadToCloudinary(req.file.buffer);

    const photo = new Gallery({
      user: req.user._id,
      imageUrl: result.secure_url,
      publicId: result.public_id,
      description: description || '',
      isPrivate: isPrivate === 'true',
      allowFeed: allowFeed === 'true',
      category: category || 'Mundo'
    });

    await photo.save();

    if (isPrivate !== 'true' && allowFeed === 'true') {
      try {
        const newPost = new Post({
          user: req.user._id,
          content: description || 'Nueva foto subida',
          media: [{
            url: result.secure_url,
            mediaType: 'image'
          }],
          likes: [],
          comments: []
        });
        await newPost.save();
      } catch (postErr) {
        console.error('Error creating auto-post for photo:', postErr);
      }
    }

    res.status(201).json(photo);
  } catch (err) {
    res.status(500).json({ error: 'Error al subir la foto' });
  }
};

exports.getUserPhotos = async (req, res) => {
  try {
    const photos = await Gallery.find({ user: req.params.userId })
      .sort({ createdAt: -1 })
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture');
    res.json(photos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener las fotos' });
  }
};

exports.deletePhoto = async (req, res) => {
  try {
    const photo = await Gallery.findById(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });

    if (photo.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    await Gallery.findByIdAndDelete(req.params.id);

    await Post.findOneAndDelete({
      user: req.user._id,
      'media.url': photo.imageUrl
    });

    res.json({ message: 'Foto eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar la foto' });
  }
};

// Obtener feed de fotos (TikTok style for images - SOLO USUARIOS REALES)
exports.getPhotoFeed = async (req, res) => {
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

    if (category && category !== 'Mundo') {
      query.category = category;
    }

    // Fetch ANY public photo except from blocked users
    const allPhotos = await Gallery.find(query)
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture')
      .sort({ createdAt: -1 })
      .limit(100);

    // Order: first 10 strictly recent, then shuffle the rest
    const mostRecent = allPhotos.slice(0, 10);
    const theRest = allPhotos.slice(10).sort(() => Math.random() - 0.5);

    res.json([...mostRecent, ...theRest]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener el feed de fotos' });
  }
};

// Reaccionar a una foto
exports.reactToPhoto = async (req, res) => {
  const { id } = req.params;
  const { type } = req.body;
  const userId = req.user._id;

  try {
    const photo = await Gallery.findById(id);
    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });

    const existingReactionIndex = photo.reactions.findIndex(r => r.user.toString() === userId.toString());

    if (existingReactionIndex > -1) {
      if (photo.reactions[existingReactionIndex].type === type) {
        photo.reactions.splice(existingReactionIndex, 1);
      } else {
        photo.reactions[existingReactionIndex].type = type;
      }
    } else {
      photo.reactions.push({ user: userId, type });
      if (photo.user.toString() !== userId.toString()) {
        const emojiMap = { like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😡', surprised: '😄', shocked: '😮', thinking: '🤔', risky: '😬', irrelevant: '🚫' };
        await createNotification({
          recipientId: photo.user,
          senderId: userId,
          type: 'reaction',
          message: `${req.user.username} reaccionó con ${emojiMap[type] || '✨'} a tu foto`,
          link: `/gallery/${photo._id}`,
          galleryId: photo._id,
          io: req.app.get('io'),
        });
      }
    }

    await photo.save();
    await photo.populate('reactions.user', 'username profilePicture');
    res.json(photo.reactions);
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar la reacción' });
  }
};

// Comentar una foto
exports.addPhotoComment = async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user._id;

  try {
    const photo = await Gallery.findById(id);
    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });

    photo.comments.push({ user: userId, comment });
    await photo.save();

    if (photo.user.toString() !== userId.toString()) {
      await createNotification({
        recipientId: photo.user,
        senderId: userId,
        type: 'comment',
        message: `${req.user.username} ha comentado en tu foto`,
        link: `/gallery/${photo._id}`,
        galleryId: photo._id,
        io: req.app.get('io'),
      });
    }

    const updatedPhoto = await Gallery.findById(id)
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture');
    res.json(updatedPhoto.comments);
  } catch (err) {
    res.status(500).json({ error: 'Error al añadir comentario' });
  }
};

// Responder a un comentario de foto
exports.addPhotoReply = async (req, res) => {
  const { id, commentId } = req.params;
  const { comment } = req.body;
  const userId = req.user._id;

  try {
    const photo = await Gallery.findById(id);
    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });

    const parentComment = photo.comments.id(commentId);
    if (!parentComment) return res.status(404).json({ error: 'Comentario no encontrado' });

    photo.comments.push({
      user: userId,
      comment,
      parentId: commentId // Link for recursive threading
    });
    await photo.save();

    // Notificar al autor del comentario si no es el mismo que responde
    if (parentComment.user.toString() !== userId.toString()) {
      await createNotification({
        recipientId: parentComment.user,
        senderId: userId,
        type: 'comment',
        message: `${req.user.username} respondió a tu comentario`,
        link: `/gallery/${photo._id}`,
        galleryId: photo._id,
        io: req.app.get('io'),
      });
    }

    const updatedPhoto = await Gallery.findById(id)
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture');

    res.json(updatedPhoto.comments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al añadir respuesta' });
  }
};

// Compartir foto (ESTILO FACEBOOK)
exports.sharePhoto = async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  const { content } = req.body;

  try {
    const photo = await Gallery.findById(id).populate('user', 'username profilePicture');
    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });

    // Buscar si ya existe un post original para esta foto
    let originalPost = await Post.findOne({
      user: photo.user._id,
      'media.url': photo.imageUrl
    });

    if (!originalPost) {
      // Creamos un post fuente si no existe
      originalPost = new Post({
        user: photo.user._id,
        content: photo.description || 'Nueva foto',
        media: [{
          url: photo.imageUrl,
          mediaType: 'image'
        }]
      });
      await originalPost.save();
    }

    const newPost = new Post({
      user: userId,
      content: content || '',
      sharedFrom: originalPost._id,
      media: []
    });

    await newPost.save();

    if (photo.user._id.toString() !== userId.toString()) {
      await createNotification({
        recipientId: photo.user._id,
        senderId: userId,
        type: 'share',
        message: `${req.user.username} ha compartido tu foto`,
        link: `/posts/${newPost._id}`,
        postId: newPost._id,
        io: req.app.get('io'),
      });
    }

    res.json({ message: 'Foto compartida en tu muro', post: newPost });
  } catch (err) {
    res.status(500).json({ error: 'Error al compartir foto' });
  }
};

exports.getPhotoById = async (req, res) => {
  try {
    const photo = await Gallery.findById(req.params.id)
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture');
    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });
    res.json(photo);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener la foto' });
  }
};

exports.updatePhoto = async (req, res) => {
  try {
    const { description, isPrivate, allowFeed, category } = req.body;
    const photo = await Gallery.findById(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });
    if (photo.user.toString() !== req.user._id.toString()) return res.status(401).json({ error: 'No autorizado' });

    // Normalizar valores booleanos
    const newIsPrivate = isPrivate === true || isPrivate === 'true';
    const newAllowFeed = allowFeed === true || allowFeed === 'true';

    if (description !== undefined) photo.description = description;

    // Si cambia de público a privado o se quita del feed, actualizamos el post del muro
    if (photo.isPrivate !== newIsPrivate || photo.allowFeed !== newAllowFeed) {
      if (newIsPrivate || !newAllowFeed) {
        // Eliminar del muro si es privado o no se permite feed
        await Post.findOneAndDelete({
          user: req.user._id,
          'media.url': photo.imageUrl
        });
      } else if (!newIsPrivate && newAllowFeed) {
        // Si vuelve a ser público y estar en el feed, y no existe el post, lo creamos
        const existingPost = await Post.findOne({
          user: req.user._id,
          'media.url': photo.imageUrl
        });
        if (!existingPost) {
          const newPost = new Post({
            user: req.user._id,
            content: photo.description || 'Foto actualizada',
            media: [{ url: photo.imageUrl, mediaType: 'image' }]
          });
          await newPost.save();
        }
      }
    }

    photo.isPrivate = newIsPrivate;
    photo.allowFeed = newAllowFeed;
    if (category !== undefined) photo.category = category;

    await photo.save();

    // Devolver objeto poblado para que el frontend no pierda datos
    const updatedPhoto = await Gallery.findById(photo._id)
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture');

    res.json(updatedPhoto);
  } catch (err) {
    console.error('SERVER ERROR (updatePhoto):', err.message);
    res.status(500).json({ error: 'Error al actualizar foto' });
  }
};
// Buscar fotos por descripción
exports.searchPhotos = async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'Debe proporcionar un término de búsqueda' });

  try {
    const photos = await Gallery.find({
      description: { $regex: query, $options: 'i' },
      isPrivate: false
    })
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture')
      .sort({ createdAt: -1 });

    res.json(photos);
  } catch (err) {
    res.status(500).json({ error: 'Error al buscar fotos' });
  }
};

// Actualizar comentario de foto
exports.updatePhotoComment = async (req, res) => {
  const { id, commentId } = req.params;
  const { comment } = req.body;
  const userId = req.user._id;

  try {
    const photo = await Gallery.findById(id);
    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });

    const commentObj = photo.comments.id(commentId);
    if (!commentObj) return res.status(404).json({ error: 'Comentario no encontrado' });

    if (commentObj.user.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    commentObj.comment = comment;
    commentObj.isEdited = true;
    await photo.save();

    const populatedPhoto = await Gallery.findById(id)
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture');

    res.json(populatedPhoto.comments);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar comentario' });
  }
};

// Eliminar comentario de foto
exports.deletePhotoComment = async (req, res) => {
  const { id, commentId } = req.params;
  const userId = req.user._id;

  try {
    const photo = await Gallery.findById(id);
    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });

    const commentObj = photo.comments.id(commentId);
    if (!commentObj) return res.status(404).json({ error: 'Comentario no encontrado' });

    if (commentObj.user.toString() !== userId.toString() && photo.user.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    photo.comments = photo.comments.filter(c =>
      c._id.toString() !== commentId &&
      (!c.parentId || c.parentId.toString() !== commentId)
    );

    await photo.save();

    const populatedPhoto = await Gallery.findById(id)
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture');

    res.json(populatedPhoto.comments);
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar comentario' });
  }
};
