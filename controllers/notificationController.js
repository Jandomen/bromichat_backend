const Notification = require('../models/Notification');
const { io } = require('../sockets/notification');

const createNotification = async ({ recipientId, senderId, message, type, link, postId, conversationId }) => {
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
     // console.error('Socket.IO instance not found');
    }

    return notification;
  } catch (error) {
   // console.error('❌ Error creando la notificación:', error);
    throw error;
  }
};
     
const getNotifications = async (req, res) => {
  const userId = req.user.id;
  try {
    const notifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .populate('sender', 'username name lastName profilePicture');
    res.status(200).json(notifications);
  } catch (error) {
   // console.error('❌ Error al obtener notificaciones:', error);
    res.status(500).json({ message: 'Error al obtener notificaciones' });
  }
};

const getUnreadCount = async (req, res) => {
  const userId = req.user.id;
  try {
    const count = await Notification.countDocuments({ recipient: userId, isRead: false });
    res.status(200).json({ unreadCount: count });
  } catch (error) {
   // console.error('❌ Error al obtener conteo de notificaciones no leídas:', error);
    res.status(500).json({ message: 'Error al obtener conteo' });
  }
};

const markAllAsRead = async (req, res) => {
  const userId = req.user.id;
  try {
    await Notification.updateMany({ recipient: userId, isRead: false }, { isRead: true });
    res.status(200).json({ message: 'Todas las notificaciones fueron marcadas como leídas' });
  } catch (error) {
   // console.error('❌ Error al marcar todas como leídas:', error);
    res.status(500).json({ message: 'Error al marcar como leídas' });
  }
};

const markAsRead = async (req, res) => {
  const { notificationId } = req.params;
  const userId = req.user.id;
  try {
    const notification = await Notification.findOne({ _id: notificationId, recipient: userId });
    if (!notification) {
      return res.status(404).json({ message: 'Notificación no encontrada' });
    }
    notification.isRead = true;
    await notification.save();
    res.status(200).json({ message: 'Notificación marcada como leída' });
  } catch (error) {
   // console.error('❌ Error al marcar la notificación:', error);
    res.status(500).json({ message: 'Error interno' });
  }
};

const deleteNotification = async (req, res) => {
  const { notificationId } = req.params;
  const userId = req.user.id;
  try {
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: userId,
    });
    if (!notification) {
      return res.status(404).json({ message: 'Notificación no encontrada' });
    }
    res.status(200).json({ message: 'Notificación eliminada' });
  } catch (error) {
   // console.error('❌ Error al eliminar la notificación:', error);
    res.status(500).json({ message: 'Error al eliminar notificación' });
  }
};

module.exports = {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};