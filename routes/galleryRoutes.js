const express = require('express');
const router = express.Router();
const {uploadPhoto, getUserPhotos, updatePhoto, deletePhoto , getFollowingPhotos} = require('../controllers/galleryController');
const { authenticate } = require('../middlewares/auth');
const upload = require('../middlewares/multer');

router.post('/upload', authenticate, upload.single('image'), uploadPhoto);

router.get('/user/:userId', authenticate, getUserPhotos);

router.put('/:id', authenticate, updatePhoto);

router.delete('/:id', authenticate, deletePhoto);



module.exports = router;
