const express = require('express');
const router = express.Router();
const {
    generateRegistrationChallenge,
    verifyRegistration,
    generateLoginChallenge,
    verifyLogin,
} = require('../controllers/webauthnController');
const { authenticate } = require('../middlewares/auth');


router.get('/register-challenge', authenticate, generateRegistrationChallenge);
router.post('/register-verify', authenticate, verifyRegistration);


router.post('/login-challenge', generateLoginChallenge);
router.post('/login-verify', verifyLogin);

module.exports = router;
