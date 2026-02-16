const express = require('express');
const router = express.Router();
const {
    uploadPhoto,
    getUserPhotos,
    updatePhoto,
    deletePhoto,
    getPhotoFeed,
    reactToPhoto,
    addPhotoComment,
    addPhotoReply,
    updatePhotoComment,
    deletePhotoComment,
    sharePhoto,
    getPhotoById,
    searchPhotos
} = require('../controllers/galleryController');
const { authenticate } = require('../middlewares/auth');
const upload = require('../middlewares/multer');

router.get('/feed', authenticate, getPhotoFeed);
router.post('/upload', authenticate, upload.single('image'), uploadPhoto);
router.get('/:id', authenticate, getPhotoById);
router.get('/user/:userId', authenticate, getUserPhotos);
router.put('/:id', authenticate, upload.single('image'), updatePhoto);
router.delete('/:id', authenticate, deletePhoto);

router.post('/:id/react', authenticate, reactToPhoto);
router.post('/:id/comment', authenticate, addPhotoComment);
router.post('/:id/comment/:commentId/reply', authenticate, addPhotoReply);
router.put('/:id/comment/:commentId', authenticate, updatePhotoComment);
router.delete('/:id/comment/:commentId', authenticate, deletePhotoComment);
router.post('/:id/share', authenticate, sharePhoto);
router.get('/search', authenticate, searchPhotos);

module.exports = router;
