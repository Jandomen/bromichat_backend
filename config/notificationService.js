const Notification = require('../models/Notification');

const createNotification = async ({ recipientId, senderId, message, type, link, postId, conversationId, io }) => {
  try {
    const existingNotification = await Notification.findOne({
      recipient: recipientId,
      sender: senderId,
      type,
      postId: postId || null,
      conversationId: conversationId || null,
      isRead: false,
    });
    if (existingNotification) {
     // console.log(`Notificación ya existe para ${type}`);
      return existingNotification;
    }

    const notification = new Notification({
      recipient: recipientId,
      sender: senderId,
      message,
      type,
      isRead: false,
      link,
      postId: postId || null,
      conversationId: conversationId || null,
    });
    await notification.save();

    if (io) {
      io.to(recipientId.toString()).emit('newNotification', {
        _id: notification._id,
        recipientId,
        senderId,
        message,
        type,
        isRead: false,
        createdAt: notification.createdAt,
        link,
        postId: notification.postId,
        conversationId: notification.conversationId,
      });
     // console.log(`✅ Notificación enviada a usuario ${recipientId}: ${message}`);
    } else {
     // console.error('❌ Socket.IO instance not found');
    }

    return notification;
  } catch (error) {
   // console.error('❌ Error creando la notificación:', error);
    throw error;
  }
};

const createCommentNotification = async ({ post, sender, io }) => {
  return createNotification({
    recipientId: post.author,
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
    recipientId: post.author,
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
      if (recipientId.toString() === sender._id.toString()) continue; // no notificar al remitente

      const notification = new Notification({
        recipient: recipientId,
        sender: sender._id,
        message: `${sender.username} te envió un mensaje${conversation.isGroup ? ` en el grupo ${conversation.name || 'sin nombre'}` : ''}`,
        type: conversation.isGroup ? 'group_message' : 'message',
        link: conversation.isGroup ? `/groups/${conversation._id}` : `/messages/${conversation._id}`,
        conversationId: conversation._id,
        isRead: false,
      });

      await notification.save();

      if (io) {
        io.to(recipientId.toString()).emit('newNotification', {
          _id: notification._id,
          recipientId,
          senderId: sender._id,
          message: notification.message,
          type: notification.type,
          isRead: false,
          createdAt: notification.createdAt,
          link: notification.link,
          conversationId: notification.conversationId,
        });
       // console.log(`✅ Notificación enviada a usuario ${recipientId}: ${notification.message}`);
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