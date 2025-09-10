const express = require('express');
const router = express.Router();
const {
  videoPublic,
  userVideos,
  uploadVideo,
  deleteVideo,
  getVideoById,
  searchVideosByTitle,
  userVideosById,
} = require('../controllers/videoController');

const multer = require('multer');
const { authenticate } = require('../middlewares/auth');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/public/:publicId', videoPublic);
router.get('/search', searchVideosByTitle);
router.get('/:videoId', getVideoById);
router.get('/user/videos', authenticate, userVideos);
router.get('/user/:userId', authenticate, userVideosById);



router.post('/upload', authenticate, upload.single('video'), uploadVideo);
router.delete('/delete', authenticate, deleteVideo);

module.exports = router;
