const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const upload = require('../middlewares/multer');
const { createStory, getStories, deleteStory, viewStory, getArchivedStories } = require('../controllers/storyController');

router.post('/create', authenticate, upload.single('media'), createStory);
router.get('/feed', authenticate, getStories);
router.get('/archive', authenticate, getArchivedStories);
router.delete('/:storyId', authenticate, deleteStory);
router.post('/:storyId/view', authenticate, viewStory);

module.exports = router;
