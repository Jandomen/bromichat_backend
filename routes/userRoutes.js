const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const {
  searchUsers,
  getUsers,
  getUserProfile,
  getUserDetails,
  getUserProfileId,
  getFullUserData,
  updateProfilePicture,
  updateCoverPhoto,
  deleteProfilePicture,
  updateBio,
  deleteAccount,
  updatePassword,
  updateEmail,
  updatePrivacySettings,
  updateStorySettings,
  updateSosSettings,
  toggleSavePost,
  getSavedPosts,
} = require('../controllers/userController');
const upload = require('../middlewares/multer');


router.get('/profile', authenticate, getUserProfile);
router.get('/search', authenticate, searchUsers);
router.get('/users', authenticate, getUsers);
router.get('/profile/:id', authenticate, getUserProfileId);
router.get('/details', authenticate, getUserDetails);
router.get('/full/:userId', authenticate, getFullUserData);
router.put('/profile-picture', authenticate, upload.single('profilePicture'), updateProfilePicture);
router.put('/cover-picture', authenticate, upload.single('coverPhoto'), updateCoverPhoto);
router.delete('/profile-picture', authenticate, deleteProfilePicture);
router.put('/bio/:userId', updateBio);
router.delete('/delete', authenticate, deleteAccount);

router.put('/password', authenticate, updatePassword);
router.put('/email', authenticate, updateEmail);
router.put('/privacy', authenticate, updatePrivacySettings);
router.put('/story-settings', authenticate, updateStorySettings);
router.put('/sos-settings', authenticate, updateSosSettings);

router.post('/save/:postId', authenticate, toggleSavePost);
router.get('/saved', authenticate, getSavedPosts);




module.exports = router;
