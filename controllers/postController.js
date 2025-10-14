const Post = require('../models/Post');
const User = require('../models/User');
const { createNotification } = require('../config/notificationService');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.createPost = async (req, res) => {
  try {
    const { content } = req.body;

    if (!content && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ error: 'Debes proporcionar contenido o al menos un archivo' });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/ogg', 'application/pdf'];
    const maxFiles = 10;
    const maxFileSize = 10 * 1024 * 1024; 

    if (req.files && req.files.length > maxFiles) {
      return res.status(400).json({ error: `No puedes subir más de ${maxFiles} archivos` });
    }

    const uploadedMedia = await Promise.all(
      (req.files || [])
        .filter((file) => {
          if (!allowedTypes.includes(file.mimetype)) {
          //  console.log(`Invalid file type for ${file.originalname}: ${file.mimetype}`);
            return false;
          }
          if (!file.buffer || file.size > maxFileSize) {
          //  console.log(`Invalid or oversized file: ${file.originalname}`);
            return false;
          }
          return true;
        })
        .map((file) =>
          new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { resource_type: 'auto', folder: 'jandochat' },
              (err, result) => {
                if (err) {
                //  console.error(`Cloudinary upload error for ${file.originalname}:`, err);
                  return reject(err);
                }
              //  console.log(`Uploaded ${file.originalname} to Cloudinary: ${result.secure_url}`);
                resolve({
                  url: result.secure_url,
                  mediaType: result.resource_type === 'image' ? 'image' : result.resource_type === 'video' ? 'video' : 'raw',
                });
              }
            );
            stream.end(file.buffer);
          })
        )
    );

    const post = new Post({
      user: req.user._id,
      content,
      media: uploadedMedia,
    });

    await post.save();
  //  console.log('✅ Publicación creada con éxito:', post._id);
    res.status(201).json(post);
  } catch (err) {
  //  console.error('❌ Error al crear la publicación:', err);
    res.status(500).json({ error: 'Error al crear la publicación' });
  }
};

exports.editPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'El contenido no puede estar vacío' });
    }

    const post = await Post.findOneAndUpdate(
      { _id: postId, user: req.user._id },
      { content },
      { new: true }
    );

    if (!post) {
    //  console.error('Publicación no encontrada o no autorizada');
      return res.status(404).json({ error: 'Publicación no encontrada o no autorizada' });
    }

  //  console.log('Publicación editada con éxito:', postId);
    res.status(200).json(post);
  } catch (err) {
  //  console.error('Problemas para editar la publicación:', err);
    res.status(500).json({ error: 'Error al editar la publicación' });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findOneAndDelete({ _id: postId, user: req.user._id });

    if (!post) {
      return res.status(404).json({ error: 'Publicación no encontrada o no autorizada' });
    }

  //  console.log('Publicación eliminada con éxito:', postId);
    res.status(200).json({ message: 'Publicación eliminada con éxito' });
  } catch (err) {
  //  console.error('Problemas para eliminar la publicación:', err);
    res.status(500).json({ error: 'Error al eliminar la publicación' });
  }
};

exports.getMyPosts = async (req, res) => {
  try {
    const userId = req.user._id;
    const posts = await Post.find({ user: userId })
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username profilePicture')
      .sort({ createdAt: -1 });

    if (posts.length === 0) {
    //  console.log('No se encontraron publicaciones para el usuario:', userId);
      return res.status(200).json([]);
    }

  //  console.log('Publicaciones del usuario obtenidas con éxito:', userId);
    res.status(200).json(posts);
  } catch (error) {
  //  console.error('Problemas para obtener las publicaciones del usuario:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

exports.likePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });

    if (post.likes.includes(req.user._id)) {
      post.likes.pull(req.user._id);
    } else {
      post.likes.push(req.user._id);
      post.dislikes.pull(req.user._id);
      await createNotification({
        recipientId: post.user,
        senderId: req.user._id,
        type: 'like',
        message: `${req.user.username} ha dado like a tu publicación`,
        link: `/posts/${post._id}`,
        postId: post._id,
        io: req.app.get('io'),
      });
    }

    await post.save();
    res.json(post);
  } catch (err) {
  //  console.error('Error al dar like:', err);
    res.status(500).json({ error: 'Error al dar like' });
  }
};

exports.dislikePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });

    if (post.dislikes.includes(req.user._id)) {
      post.dislikes.pull(req.user._id);
    } else {
      post.dislikes.push(req.user._id);
      post.likes.pull(req.user._id);
      await createNotification({
        recipientId: post.user,
        senderId: req.user._id,
        type: 'dislike',
        message: `${req.user.username} ha dado dislike a tu publicación`,
        link: `/posts/${post._id}`,
        postId: post._id,
        io: req.app.get('io'),
      });
    }

    await post.save();
    res.json(post);
  } catch (err) {
  //  console.error('Error al dar dislike:', err);
    res.status(500).json({ error: 'Error al dar dislike' });
  }
};

exports.commentOnPost = async (req, res) => {
  try {
    const postId = req.params.postId;
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: 'El comentario no puede estar vacío' });
    }

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });

    post.comments.push({ user: req.user._id, comment });
    await post.save();

    await createNotification({
      recipientId: post.user,
      senderId: req.user._id,
      type: 'comment',
      message: `${req.user.username} ha comentado en tu publicación`,
      link: `/posts/${post._id}`,
      postId: post._id,
      io: req.app.get('io'),
    });

    res.json(post);
  } catch (err) {
  //  console.error('Error al comentar:', err);
    res.status(500).json({ error: 'Error al comentar' });
  }
};

exports.updateComment = async (req, res) => {
  try {
    const { comment } = req.body;
    const { postId, commentId } = req.params;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: 'El comentario no puede estar vacío' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post no encontrado' });
    }

    const commentToUpdate = post.comments.id(commentId);
    if (!commentToUpdate || commentToUpdate.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'No tienes permiso para editar este comentario' });
    }

    commentToUpdate.comment = comment;
    await post.save();

  //  console.log('Comentario actualizado con éxito:', commentId);
    res.json(post);
  } catch (err) {
  //  console.error('Problemas para actualizar el comentario:', err);
    res.status(500).json({ error: 'Error al actualizar el comentario' });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post no encontrado' });
    }

    const commentToDelete = post.comments.id(commentId);
    if (!commentToDelete || commentToDelete.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este comentario' });
    }

    post.comments.pull(commentId);
    await post.save();

  //  console.log('Comentario eliminado con éxito:', commentId);
    res.status(200).json({ message: 'Comentario eliminado con éxito', post });
  } catch (err) {
  //  console.error('Problemas para eliminar el comentario:', err);
    res.status(500).json({ error: 'Error al eliminar el comentario' });
  }
};

exports.getPostById = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId)
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username profilePicture');
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    res.json(post);
  } catch (err) {
  //  console.error('Error al obtener post:', err);
    res.status(500).json({ error: 'Error al obtener el post' });
  }
};

exports.getAllPosts = async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username profilePicture')
      .sort({ createdAt: -1 });
  //  console.log('Publicaciones obtenidas con éxito');
    res.status(200).json(posts);
  } catch (error) {
  //  console.error('Problemas para obtener todas las publicaciones:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

exports.getTenPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const posts = await Post.find()
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPosts = await Post.countDocuments();
    const totalPages = Math.ceil(totalPosts / limit);

  //  console.log('Publicaciones obtenidas con éxito');
    res.status(200).json({
      posts,
      currentPage: page,
      totalPages,
      totalPosts,
    });
  } catch (error) {
  //  console.error('Problemas para obtener todas las publicaciones:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

exports.getPostsByUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const posts = await Post.find({ user: userId })
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username profilePicture')
      .sort({ createdAt: -1 });

  //  console.log('Publicaciones del usuario especifico obtenidas con éxito');
    res.status(200).json(posts);
  } catch (error) {
  //  console.error('Problemas para obtener las publicaciones del usuario:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

exports.getFriendsPosts = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10 } = req.query;

    const currentUser = await User.findById(userId).select('friends blockedUsers');
    const friendsIds = currentUser.friends.filter(
      (f) => !currentUser.blockedUsers.includes(f)
    );

    if (friendsIds.length === 0) {
      return res.json({
        posts: [],
        totalPages: 0,
        currentPage: parseInt(page),
        totalPosts: 0,
      });
    }

    const skip = (page - 1) * limit;

    const posts = await Post.find({ user: { $in: friendsIds } })
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate('user', '_id username name lastName profilePicture')
      .populate('likes', '_id username')
      .populate('dislikes', '_id username')
      .populate('comments.user', '_id username name lastName profilePicture')
      .exec();

    const totalPosts = await Post.countDocuments({ user: { $in: friendsIds } });

  //  console.log('Publicaciones de amigos obtenidas con éxito' + userId);
    res.json({
      posts,
      totalPages: Math.ceil(totalPosts / limit),
      currentPage: parseInt(page),
      totalPosts,
    });
  } catch (error) {
  //  console.error('Error fetching friends posts:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};