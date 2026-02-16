const Notification = require('../models/Notification');

const createNotification = async ({ recipientId, senderId, message, type, link, postId, commentId, videoId, galleryId, conversationId, io }) => {
  const rId = recipientId?._id || recipientId;
  const sId = senderId?._id || senderId;

  if (rId && sId && rId.toString() === sId.toString()) {
    return null;
  }
  try {
    const existingNotification = (['message', 'group_message'].includes(type))
      ? null
      : await Notification.findOne({
        recipient: rId,
        sender: sId,
        type,
        postId: postId || null,
        commentId: commentId || null,
        videoId: videoId || null,
        galleryId: galleryId || null,
        conversationId: conversationId || null,
        isRead: false,
      });

    if (existingNotification) {
      if (io) {
        const populated = await existingNotification.populate('sender', 'username name lastName profilePicture');
        // console.log(`🚀 Emitiendo notificación existente a sala: ${rId.toString()}`);
        io.to(rId.toString()).emit('newNotification', populated);
      }
      return existingNotification;
    }

    const notification = new Notification({
      recipient: rId,
      sender: sId,
      message,
      type,
      isRead: false,
      link,
      postId: postId || null,
      commentId: commentId || null,
      videoId: videoId || null,
      galleryId: galleryId || null,
      conversationId: conversationId || null,
    });
    await notification.save();

    if (io) {
      const populatedNotification = await notification.populate('sender', 'username name lastName profilePicture');
      // console.log(`🚀 Emitiendo nueva notificación a sala: ${rId.toString()}`);
      io.to(rId.toString()).emit('newNotification', populatedNotification);
    }

    return notification;
  } catch (error) {
    throw error;
  }
};

const createCommentNotification = async ({ post, sender, io }) => {
  return createNotification({
    recipientId: post.user,
    senderId: sender._id,
    message: `${sender.username} comentó tu publicación`,
    type: 'comment',
    link: `/posts/${post._id}`,
    postId: post._id,
    io,
  });
};

const createLikeNotification = async ({ post, sender, io }) => {
  return createNotification({
    recipientId: post.user,
    senderId: sender._id,
    message: `${sender.username} le dio like a tu publicación`,
    type: 'like',
    link: `/posts/${post._id}`,
    postId: post._id,
    io,
  });
};

const createMessageNotification = async ({ conversation, recipientIds, sender, io }) => {
  try {
    if (!Array.isArray(recipientIds)) recipientIds = [recipientIds];

    const notifications = [];

    for (const recipientId of recipientIds) {
      // Allow self-notifications for testing/multi-tab sync in messages
      // if (recipientId.toString() === sender._id.toString()) continue;

      const notification = new Notification({
        recipient: recipientId,
        sender: sender._id,
        message: `${sender.username} te envió un mensaje${conversation.isGroup ? ` en el grupo ${conversation.name || 'sin nombre'}` : ''}`,
        type: conversation.isGroup ? 'group_message' : 'message',
        link: `/messages/${conversation._id}`,
        conversationId: conversation._id,
        isRead: false,
      });

      await notification.save();

      if (io) {
        const populatedNotification = await notification.populate('sender', 'username name lastName profilePicture');
        const room = recipientId?._id ? recipientId._id.toString() : recipientId.toString();
        // console.log(`🚀 Emitiendo 'newNotification' a sala ${room} para mensaje de ${sender.username}`);
        io.to(room).emit('newNotification', populatedNotification);
      }

      notifications.push(notification);
    }

    return notifications;
  } catch (error) {
    // console.error('❌ Error creando notificaciones de mensaje:', error);
    throw error;
  }
};



module.exports = {
  createNotification,
  createCommentNotification,
  createLikeNotification,
  createMessageNotification,
};