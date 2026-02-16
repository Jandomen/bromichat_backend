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
  getVideoFeed,
  reactToVideo,
  addVideoComment,
  addVideoReply,
  updateVideoComment,
  deleteVideoComment,
  shareVideo,
  updateVideo
} = require('../controllers/videoController');

const multer = require('multer');
const { authenticate } = require('../middlewares/auth');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/feed', authenticate, getVideoFeed);
router.post('/:videoId/react', authenticate, reactToVideo);
router.post('/:videoId/comment', authenticate, addVideoComment);
router.post('/:videoId/comment/:commentId/reply', authenticate, addVideoReply);
router.put('/:videoId/comment/:commentId', authenticate, updateVideoComment);
router.delete('/:videoId/comment/:commentId', authenticate, deleteVideoComment);
router.post('/:videoId/share', authenticate, shareVideo);
router.put('/update/:videoId', authenticate, updateVideo);

router.get('/public/:publicId', videoPublic);
router.get('/search', searchVideosByTitle);
router.get('/:videoId', getVideoById);
router.get('/user/videos', authenticate, userVideos);
router.get('/user/:userId', authenticate, userVideosById);

router.post('/upload', authenticate, upload.single('video'), uploadVideo);
router.delete('/delete', authenticate, deleteVideo);

module.exports = router;
