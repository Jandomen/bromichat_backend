const express = require('express');
const { register, login, getMe, verifyEmail, forgotPassword, resetPassword } = require('../controllers/authController');

const { authenticate } = require('../middlewares/auth');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, getMe);



module.exports = router;