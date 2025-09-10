const express = require('express');
const { createPost, editPost, deletePost, likePost, dislikePost, commentOnPost, getPostById, getAllPosts, getTenPosts, getPostsByUser, getMyPosts, updateComment, deleteComment, getFriendsPosts } = require('../controllers/postController');
const { authenticate } = require('../middlewares/auth.js')
const upload = require('../middlewares/multer');


const router = express.Router();

router.post('/', upload.array('media'), authenticate, createPost);

router.put('/:postId', authenticate, editPost);
router.delete('/:postId', authenticate, deletePost);

router.get('/friends', authenticate, getFriendsPosts);

router.get('/me/posts', authenticate, getMyPosts);
router.get('/user/:userId', authenticate, getPostsByUser);
router.get('/', authenticate, getAllPosts);
router.get('/page/:page', authenticate, getTenPosts);

router.post('/:postId/like', authenticate, likePost);
router.post('/:postId/dislike', authenticate, dislikePost);

router.post('/:postId/comment', authenticate, commentOnPost);
router.put('/:postId/comment/:commentId', authenticate, updateComment);
router.delete('/:postId/comment/:commentId', authenticate, deleteComment);

router.get('/:postId', authenticate, getPostById);





module.exports = router;
