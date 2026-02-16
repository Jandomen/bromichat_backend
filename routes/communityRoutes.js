const express = require('express');
const router = express.Router();
const communityController = require('../controllers/communityController');
const { authenticate: authMiddleware } = require('../middlewares/auth');

router.use(authMiddleware);

const upload = require('../middlewares/multer');

router.post('/', upload.single('coverImage'), communityController.createGroup);
router.get('/', communityController.getAllGroups);
router.get('/:groupId', communityController.getGroup);
router.post('/:groupId/join', communityController.joinGroup);
router.post('/:groupId/leave', communityController.leaveGroup);
router.post('/:groupId/members/add', communityController.addMember);
router.post('/:groupId/members/remove', communityController.removeMember);

router.get('/:groupId/posts', communityController.getGroupPosts);
router.post('/:groupId/posts', upload.array('media'), communityController.createGroupPost);
router.put('/:groupId', upload.single('coverImage'), communityController.updateGroup);
router.delete('/:groupId', communityController.deleteGroup);

module.exports = router;
