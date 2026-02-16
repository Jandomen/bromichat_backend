const express = require('express');
const router = express.Router();
const {
    generateRegistrationChallenge,
    verifyRegistration,
    generateLoginChallenge,
    verifyLogin,
} = require('../controllers/webauthnController');
const { authenticate } = require('../middlewares/auth');

// Registration (User must be logged in to register a device)
router.get('/register-challenge', authenticate, generateRegistrationChallenge);
router.post('/register-verify', authenticate, verifyRegistration);

// Login (Public)
router.post('/login-challenge', generateLoginChallenge);
router.post('/login-verify', verifyLogin);

module.exports = router;
