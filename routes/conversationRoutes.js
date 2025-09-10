const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const {
  createConversation,
  getConversations,
  getConversationById,
  deleteConversation,
  searchConversations,
} = require('../controllers/conversationController');

router.get('/search', authenticate, searchConversations); 
router.post('/create', authenticate, createConversation);
router.get('/', authenticate, getConversations);
router.get('/:id', authenticate, getConversationById);
router.delete('/:id', authenticate, deleteConversation);

module.exports = router;
