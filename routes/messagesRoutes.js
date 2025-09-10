const express = require('express');
const router = express.Router();
const {
  sendMessage,
  getPrivateMessages,
  editMessage,
  deleteMessage,
  getMessagesByConversationId,
  sendGroupMessage,
  getGroupMessages,
  editGroupMessage,
  deleteGroupMessage,
} = require('../controllers/messagesController')
const { authenticate } = require('../middlewares/auth');

const upload = require('../middlewares/multer');

router.post('/send', authenticate, upload.single('file'), sendMessage);
router.get('/private/:userId/:recipientId', authenticate, getPrivateMessages);
router.put('/edit/:messageId', authenticate, editMessage);
router.delete('/delete/:messageId', authenticate,  deleteMessage);
router.get('/conversation/:conversationId', authenticate, getMessagesByConversationId);
router.post('/group', authenticate, upload.single('file'), sendGroupMessage);
router.get('/group/:groupId', authenticate, getGroupMessages);
router.put('/group/edit/:messageId', authenticate, editGroupMessage);
router.delete('/group/delete/:messageId', authenticate, deleteGroupMessage);

module.exports = router;
