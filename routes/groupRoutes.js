const express = require('express');
const router = express.Router();
const { createGroup, getUserGroups, getGroupDetails, updateParticipants, deleteGroupId, leaveGroup, getUserGroupsWithLastMessage } = require('../controllers/groupController');
const { authenticate } = require('../middlewares/auth');

router.post('/create', authenticate, createGroup);
router.get('/groups', authenticate, getUserGroups);
router.get('/:groupId', authenticate, getGroupDetails);
router.put('/group/:groupId/participants', authenticate, updateParticipants);
router.delete('/group/:groupId', authenticate, deleteGroupId);
router.delete('/group/:groupId/leave', authenticate, leaveGroup);
router.get('/groups/with-last-message', authenticate, getUserGroupsWithLastMessage);
router.get('/my-groups', authenticate, getUserGroups);


module.exports = router;
