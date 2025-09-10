const express = require('express');
const router = express.Router();
const {authenticate} = require('../middlewares/auth')
const {
  addFriend,
  removeFriend,
  followUser,
  unfollowUser,
  blockUser,
  unblockUser,
  getFriends,
  getFollowers,
  getFollowing,
  getBlockedUsers,
  getMyFollowing,
} = require('../controllers/friendController');


router.put('/add/:id', authenticate, addFriend);
router.delete('/remove/:id', authenticate, removeFriend);
router.put('/follow/:id', authenticate, followUser);
router.delete('/unfollow/:id', authenticate, unfollowUser);
router.put('/block/:id', authenticate, blockUser);
router.delete('/unblock/:id', authenticate, unblockUser);
router.get('/friends/:id', authenticate, getFriends);
router.get('/followers/:id', authenticate, getFollowers);
router.get('/following/me', authenticate, getMyFollowing);
router.get('/following/:id', authenticate, getFollowing);
router.get('/blocked', authenticate, getBlockedUsers); 



module.exports = router;