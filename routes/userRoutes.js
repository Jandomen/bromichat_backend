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
  deleteProfilePicture,
  updateBio,
  deleteAccount,
} = require('../controllers/userController');
const upload = require('../middlewares/multer');


router.get('/profile', authenticate, getUserProfile);
router.get('/search', authenticate, searchUsers);
router.get('/users', authenticate, getUsers);
router.get('/profile/:id', authenticate, getUserProfileId);
router.get('/details', authenticate, getUserDetails);
router.get('/full/:userId', authenticate, getFullUserData);
router.put('/profile-picture', authenticate, upload.single('profilePicture'), updateProfilePicture);
router.delete('/profile-picture', authenticate, deleteProfilePicture);
router.put('/bio/:userId', updateBio);
router.delete('/delete', authenticate, deleteAccount);




module.exports = router;
