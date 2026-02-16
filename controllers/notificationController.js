const Notification = require('../models/Notification');
const { createNotification } = require('../config/notificationService');

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

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(userId.toString()).emit('notificationsMarkedAsRead', { all: true });
    }

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

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(userId.toString()).emit('notificationsMarkedAsRead', { notificationId });
    }

    res.status(200).json({ message: 'Notificación marcada como leída' });
  } catch (error) {
    // console.error('❌ Error al marcar la notificación:', error);
    res.status(500).json({ message: 'Error interno' });
  }
};

const markConversationNotificationsAsRead = async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.id;
  try {
    await Notification.updateMany(
      { recipient: userId, conversationId, isRead: false },
      { isRead: true }
    );

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(userId.toString()).emit('notificationsMarkedAsRead', { conversationId });
    }

    res.status(200).json({ message: 'Notificaciones de la conversación marcadas como leídas' });
  } catch (error) {
    res.status(500).json({ message: 'Error al marcar notificaciones de la conversación' });
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
  markConversationNotificationsAsRead,
  deleteNotification,
};