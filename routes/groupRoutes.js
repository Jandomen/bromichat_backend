const express = require('express');
const router = express.Router();
const upload = require('../middlewares/multer');
const { authenticate } = require('../middlewares/auth');
const {
  createGroup,
  updateGroupImage,
  updateGroupName,
  getUserGroups,
  getGroupDetails,
  updateParticipants,
  deleteGroupId,
  leaveGroup,
  getUserGroupsWithLastMessage,
} = require('../controllers/groupController');

router.post('/create', authenticate, upload.single('groupImage'), createGroup);
router.put('/:groupId/update-image', authenticate, upload.single('groupImage'), updateGroupImage);
router.put('/:groupId', authenticate, updateGroupName);

router.get('/groups', authenticate, getUserGroups);
router.get('/groups/with-last-message', authenticate, getUserGroupsWithLastMessage);
router.get('/:groupId', authenticate, getGroupDetails);
router.put('/:groupId/participants', authenticate, updateParticipants);
router.delete('/:groupId', authenticate, deleteGroupId);
router.delete('/:groupId/leave', authenticate, leaveGroup);

module.exports = router;
