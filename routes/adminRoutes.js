const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middlewares/auth');
const adminController = require('../controllers/adminController');

// Publicly available for the frontend theme
router.get('/settings/public', adminController.getPublicSettings);

// All other routes are admin-protected
router.use(authenticate, isAdmin);

router.get('/dashboard', adminController.getAdminDashboard);
router.get('/search', adminController.searchEverything);
router.post('/settings', adminController.updateSetting);
router.delete('/user/:userId', adminController.deleteUser);
router.post('/user/role', adminController.updateUserRole);
router.delete('/post/:postId', adminController.deletePost);
router.delete('/video/:videoId', adminController.deleteVideo);
router.post('/user/suspend', adminController.suspendUser);
router.post('/user/unsuspend', adminController.unsuspendUser);
router.post('/user/ban', adminController.permanentlyBanUser);
router.post('/announce', adminController.sendGlobalAnnouncement);
router.get('/audit/:id', adminController.getAuditDataById);

module.exports = router;
