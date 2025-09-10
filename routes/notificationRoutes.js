const express = require('express');
const router = express.Router();
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require('../controllers/notificationController');
const { authenticate } = require('../middlewares/auth');

router.get('/', authenticate, getNotifications);
router.get('/unread-count', authenticate, getUnreadCount);
router.put('/:notificationId/read', authenticate, markAsRead);
router.put('/mark-all-read', authenticate, markAllAsRead);
router.delete('/:notificationId', authenticate, deleteNotification);

module.exports = router;