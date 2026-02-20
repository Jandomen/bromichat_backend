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

    const maxFiles = 10;

    if (req.files && req.files.length > maxFiles) {
      return res.status(400).json({ error: `No puedes subir más de ${maxFiles} archivos` });
    }

    const uploadedMedia = await Promise.all(
      (req.files || [])
        .map((file) =>
          new Promise((resolve, reject) => {
            // Cloudinary upload
            const stream = cloudinary.uploader.upload_stream(
              { resource_type: 'auto', folder: 'bromichat_posts' },
              (err, result) => {
                if (err) return reject(err);
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
    await post.populate([
      { path: 'user', select: 'username profilePicture name lastName' },
      { path: 'reactions.user', select: 'username profilePicture' },
      { path: 'comments.user', select: 'username profilePicture' },
      { path: 'sharedFrom', populate: { path: 'user', select: 'username profilePicture' } }
    ]);
    const io = req.app.get('io');
    if (io) io.emit('newPost', post);

    res.status(201).json(post);
  } catch (err) {
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
      return res.status(404).json({ error: 'Publicación no encontrada o no autorizada' });
    }

    await post.populate([
      { path: 'user', select: 'username profilePicture name lastName' },
      { path: 'reactions.user', select: 'username profilePicture' },
      { path: 'comments.user', select: 'username profilePicture' },
      { path: 'sharedFrom', populate: { path: 'user', select: 'username profilePicture' } }
    ]);

    res.status(200).json(post);
  } catch (err) {
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
    const io = req.app.get('io');
    if (io) io.emit('postDeleted', postId);

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
      .populate('reactions.user', 'username profilePicture')
      .populate({
        path: 'sharedFrom',
        populate: { path: 'user', select: 'username profilePicture' }
      })
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

    post.comments.push({ user: req.user._id, comment, parentId: null });
    await post.save();

    await post.populate([
      { path: 'user', select: 'username profilePicture name lastName' },
      { path: 'reactions.user', select: 'username profilePicture' },
      { path: 'comments.user', select: 'username profilePicture' },
      { path: 'sharedFrom', populate: { path: 'user', select: 'username profilePicture' } }
    ]);

    const newComment = post.comments[post.comments.length - 1];

    const postAuthorId = post.user?._id || post.user;
    if (postAuthorId.toString() !== req.user._id.toString()) {
      await createNotification({
        recipientId: postAuthorId,
        senderId: req.user._id,
        type: 'comment',
        message: `${req.user.username} ha comentado en tu publicación`,
        link: `/posts/${post._id}`,
        postId: post._id,
        commentId: newComment._id,
        io: req.app.get('io'),
      });
    }

    const io = req.app.get('io');
    if (io) io.emit('postUpdated', post);

    res.json(post);
  } catch (err) {
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
    commentToUpdate.isEdited = true;
    await post.save();

    await post.populate([
      { path: 'user', select: 'username profilePicture name lastName' },
      { path: 'reactions.user', select: 'username profilePicture' },
      { path: 'comments.user', select: 'username profilePicture' },
      { path: 'sharedFrom', populate: { path: 'user', select: 'username profilePicture' } }
    ]);
    const io = req.app.get('io');
    if (io) io.emit('postUpdated', post);

    res.json(post);
  } catch (err) {
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

    // Also remove any nested replies to this comment
    post.comments = post.comments.filter(c => c.parentId?.toString() !== commentId.toString());

    await post.save();

    await post.populate('comments.user', 'username profilePicture');
    const io = req.app.get('io');
    if (io) io.emit('postUpdated', post);

    res.status(200).json({ message: 'Comentario eliminado con éxito', post });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar el comentario' });
  }
};

exports.getPostById = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId)
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture')
      .populate({
        path: 'sharedFrom',
        populate: { path: 'user', select: 'username profilePicture' }
      });
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
      .populate('reactions.user', 'username profilePicture')
      .populate({
        path: 'sharedFrom',
        populate: { path: 'user', select: 'username profilePicture' }
      })
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
      .populate('reactions.user', 'username profilePicture')
      .populate({
        path: 'sharedFrom',
        populate: { path: 'user', select: 'username profilePicture' }
      })
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
      .populate('reactions.user', 'username profilePicture')
      .populate({
        path: 'sharedFrom',
        populate: { path: 'user', select: 'username profilePicture' }
      })
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

    const currentUser = await User.findById(userId).select('blockedUsers friends following');
    const blockedIds = currentUser.blockedUsers.map(id => id.toString());

    const Group = require('../models/Group');
    const userGroups = await Group.find({ members: userId }).select('_id');
    const groupIds = userGroups.map(g => g._id);

    const skip = (page - 1) * limit;

    // Fetch posts from ANY user (except blocked) OR posts from user's groups
    const posts = await Post.find({
      $or: [
        { user: { $nin: blockedIds }, isGroupPost: { $ne: true } },
        { group: { $in: groupIds }, isGroupPost: true }
      ]
    })
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate('user', '_id username name lastName profilePicture')
      .populate('likes', '_id username')
      .populate('dislikes', '_id username')
      .populate('reactions.user', 'username profilePicture')
      .populate({
        path: 'sharedFrom',
        populate: { path: 'user', select: 'username profilePicture' }
      })
      .populate('comments.user', '_id username name lastName profilePicture')
      .exec();

    const totalPosts = await Post.countDocuments({
      $or: [
        { user: { $nin: blockedIds }, isGroupPost: { $ne: true } },
        { group: { $in: groupIds }, isGroupPost: true }
      ]
    });

    res.json({
      posts,
      totalPages: Math.ceil(totalPosts / limit),
      currentPage: parseInt(page),
      totalPosts,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
};

exports.reactToPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { type } = req.body;
    const validReactions = ['like', 'love', 'haha', 'wow', 'sad', 'angry', 'surprised', 'shocked', 'thinking', 'risky', 'irrelevant'];
    if (!validReactions.includes(type)) {
      return res.status(400).json({ error: 'Invalid reaction type' });
    }

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });

    // Check if user already reacted
    const existingReactionIndex = post.reactions.findIndex(r => r.user.toString() === req.user._id.toString());

    if (existingReactionIndex > -1) {
      if (post.reactions[existingReactionIndex].type === type) {
        // Remove reaction (toggle off)
        post.reactions.splice(existingReactionIndex, 1);
      } else {
        // Change reaction type
        post.reactions[existingReactionIndex].type = type;
      }
    } else {
      // Add new reaction
      post.reactions.push({ user: req.user._id, type });

      const postAuthorId = post.user?._id || post.user;
      if (postAuthorId.toString() !== req.user._id.toString()) {
        await createNotification({
          recipientId: postAuthorId,
          senderId: req.user._id,
          type: 'reaction',
          message: `${req.user.username} reaccionó con ${type} a tu publicación`,
          link: `/posts/${post._id}`,
          postId: post._id,
          io: req.app.get('io'),
        });
      }
    }

    await post.save();
    await post.populate([
      { path: 'user', select: 'username profilePicture name lastName' },
      { path: 'reactions.user', select: 'username profilePicture' },
      { path: 'comments.user', select: 'username profilePicture' },
      { path: 'sharedFrom', populate: { path: 'user', select: 'username profilePicture' } }
    ]);
    const io = req.app.get('io');
    if (io) io.emit('postUpdated', post);

    res.json(post);
  } catch (error) {
    console.error('Error reacting to post:', error);
    res.status(500).json({ error: 'Error al reaccionar' });
  }
};

exports.replyToComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: 'El comentario no puede estar vacío' });
    }

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });

    const parentComment = post.comments.id(commentId);
    if (!parentComment) return res.status(404).json({ error: 'Comentario no encontrado' });

    post.comments.push({
      user: req.user._id,
      comment,
      parentId: commentId // Link to parent for infinite nesting
    });

    await post.save();

    await post.populate([
      { path: 'user', select: 'username profilePicture name lastName' },
      { path: 'reactions.user', select: 'username profilePicture' },
      { path: 'comments.user', select: 'username profilePicture' },
      { path: 'sharedFrom', populate: { path: 'user', select: 'username profilePicture' } }
    ]);

    const newReply = post.comments[post.comments.length - 1];

    const parentCommentAuthorId = parentComment.user?._id || parentComment.user;

    if (parentCommentAuthorId.toString() !== req.user._id.toString()) {
      await createNotification({
        recipientId: parentCommentAuthorId,
        senderId: req.user._id,
        type: 'reply',
        message: `${req.user.username} respondió a tu comentario`,
        link: `/posts/${post._id}`,
        postId: post._id,
        commentId: newReply._id,
        io: req.app.get('io'),
      });
    }

    const io = req.app.get('io');
    if (io) io.emit('postUpdated', post);

    res.json(post);
  } catch (error) {
    res.status(500).json({ error: 'Error al responder comentario' });
  }
};

exports.sharePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;

    const originalPost = await Post.findById(postId);
    if (!originalPost) return res.status(404).json({ error: 'Post original no encontrado' });

    const sharedPost = new Post({
      user: req.user._id,
      content: content || '',
      sharedFrom: originalPost._id,
      media: [],
    });

    await sharedPost.save();
    const resPopulated = await sharedPost.populate([
      { path: 'user', select: 'username profilePicture name lastName' },
      { path: 'sharedFrom', populate: { path: 'user', select: 'username profilePicture' } }
    ]);

    if (originalPost.user.toString() !== req.user._id.toString()) {
      const io = req.app.get('io');
      await createNotification({
        recipientId: originalPost.user,
        senderId: req.user._id,
        type: 'share',
        message: `${req.user.username} ha compartido tu publicación`,
        link: `/posts/${sharedPost._id}`,
        postId: sharedPost._id,
        io
      });
    }

    const io = req.app.get('io');
    if (io) io.emit('newPost', resPopulated);

    res.status(201).json(resPopulated);
  } catch (error) {
    console.error('Error sharing post:', error);
    res.status(500).json({ error: 'Error al compartir la publicación' });
  }
};