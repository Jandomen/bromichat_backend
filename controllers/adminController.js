const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const Video = require('../models/Video');
const AppSetting = require('../models/AppSetting');
const BannedIp = require('../models/BannedIp');
const onlineUsersTracker = require('../sockets/onlineUsers');

const getAdminDashboard = async (req, res) => {
    try {
        // Core counts
        const [totalUsers, totalPosts, totalVideos] = await Promise.all([
            User.countDocuments().catch(() => 0),
            Post.countDocuments().catch(() => 0),
            Video.countDocuments().catch(() => 0)
        ]);

        // Featured Metrics (Defensive)
        let topCommentedPost = null;
        let topReactedPost = null;
        
        try {
            const allPosts = await Post.find()
                .sort({ createdAt: -1 })
                .limit(200)
                .populate('user', 'username profilePicture')
                .lean();

            if (allPosts && allPosts.length > 0) {
                topCommentedPost = [...allPosts].sort((a, b) => ((b.comments?.length || 0) - (a.comments?.length || 0)))[0];
                topReactedPost = [...allPosts].sort((a, b) => ((b.reactions?.length || 0) - (a.reactions?.length || 0)))[0];
            }
        } catch (e) {
            console.error('METRICS_FAIL:', e);
        }

        const reportedUsers = await User.find({ reports: { $gt: 0 } }).sort({ reports: -1 }).limit(20).lean();
        const recentUsers = await User.find().sort({ createdAt: -1 }).limit(10).select('username email profilePicture createdAt').lean();
        
        const recentPosts = await Post.find().sort({ createdAt: -1 }).limit(15).populate('user', 'username profilePicture').lean();
        const recentVideos = await Video.find().sort({ createdAt: -1 }).limit(15).populate('user', 'username profilePicture').lean();

        let onlineCount = 0;
        try {
            const tracker = require('../sockets/onlineUsers');
            onlineCount = tracker && tracker.getUserCount ? tracker.getUserCount() : 0;
        } catch (e) {
            console.error('SOCKET_TRACKER_FAIL:', e);
        }

        const settings = await AppSetting.find().lean();

        res.json({
            stats: {
                totalUsers,
                totalPosts,
                totalVideos,
                onlineCount,
                topCommentedPost,
                topReactedPost
            },
            reportedUsers: reportedUsers || [],
            recentUsers: recentUsers || [],
            recentPosts: recentPosts || [],
            recentVideos: recentVideos || [],
            settings: settings || []
        });
        
    } catch (error) {
        console.error('STALWART_DASHBOARD_CRITICAL_FAIL:', error);
        res.status(500).json({ error: 'Fallo crítico al ensamblar el panel', details: error.message });
    }
};

const searchEverything = async (req, res) => {
    const { query, type } = req.query;
    try {
        let results = [];
        if (type === 'user') {
            results = await User.find({
                $or: [
                    { username: { $regex: query, $options: 'i' } },
                    { email: { $regex: query, $options: 'i' } },
                    { _id: mongoose.isValidObjectId(query) ? query : null }
                ].filter(c => c._id !== null || !Object.keys(c).includes('_id'))
            }).limit(20);
        } else if (type === 'post') {
            results = await Post.find({
                $or: [
                    { content: { $regex: query, $options: 'i' } },
                    { _id: mongoose.isValidObjectId(query) ? query : null }
                ].filter(c => c._id !== null || !Object.keys(c).includes('_id'))
            }).populate('user', 'username profilePicture').limit(20);
        } else if (type === 'video') {
            results = await Video.find({
                $or: [
                    { title: { $regex: query, $options: 'i' } },
                    { _id: mongoose.isValidObjectId(query) ? query : null }
                ].filter(c => c._id !== null || !Object.keys(c).includes('_id'))
            }).populate('user', 'username profilePicture').limit(20);
        }
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


const updateSetting = async (req, res) => {
    const { key, value } = req.body;
    try {
        const setting = await AppSetting.findOneAndUpdate(
            { key },
            { value },
            { upsert: true, new: true }
        );
        res.json(setting);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


const reportUser = async (req, res) => {
    const { userId } = req.params;
    try {
        const user = await User.findByIdAndUpdate(
            userId,
            { $inc: { reports: 1 } },
            { new: true }
        );
        res.json({ message: 'Usuario reportado correctamente', reports: user.reports });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const deleteUser = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.userId);
        res.json({ message: 'Usuario eliminado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateUserRole = async (req, res) => {
    const { userId, role } = req.body;
    try {
        const user = await User.findByIdAndUpdate(userId, { role }, { new: true });
        res.json({ message: 'Rango de usuario actualizado', user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const deletePost = async (req, res) => {
    try {
        await Post.findByIdAndDelete(req.params.postId);
        res.json({ message: 'Post eliminado por administración' });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const deleteVideo = async (req, res) => {
    try {
        await Video.findByIdAndDelete(req.params.videoId);
        res.json({ message: 'Media eliminada por administración' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const suspendUser = async (req, res) => {
    const { userId, days, reason } = req.body;
    try {
        const expires = new Date();
        expires.setDate(expires.getDate() + parseInt(days));

        const user = await User.findByIdAndUpdate(userId, {
            isSuspended: true,
            suspensionExpires: expires,
            suspensionReason: reason
        }, { new: true });

        res.json({ message: `Usuario suspendido por ${days} días`, user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const unsuspendUser = async (req, res) => {
    const { userId } = req.body;
    try {
        const user = await User.findByIdAndUpdate(userId, {
            isSuspended: false,
            suspensionExpires: null,
            suspensionReason: null
        }, { new: true });
        res.json({ message: 'Suspensión revocada', user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const sendGlobalAnnouncement = async (req, res) => {
    const { title, message } = req.body;
    try {
        const users = await User.find().select('_id fcmToken');
        const Notification = require('../models/Notification');
        const { sendPushNotification } = require('../utils/pushNotifications');

        const notifications = users.map(u => ({
            recipient: u._id,
            sender: req.user._id, // The admin
            message: `${title}: ${message}`,
            type: 'announcement',
            link: '/notifications'
        }));

        // Batch create notifications in DB
        await Notification.insertMany(notifications);

        // Send push notifications where available
        for (const u of users) {
             if (u.fcmToken) {
                 sendPushNotification(u.fcmToken, {
                     title: title || 'Anuncio de Administración',
                     body: message,
                     data: { type: 'announcement' }
                 });
             }
        }

        res.json({ message: 'Anuncio global enviado correctamente a todos los usuarios.' });
    } catch (error) {
        console.error('Error sending global announcement:', error);
        res.status(500).json({ error: 'Fallo al procesar el envío masivo.' });
    }
};

const permanentlyBanUser = async (req, res) => {
    const { userId, reason } = req.body;
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        user.isPermanentlyBanned = true;
        user.suspensionReason = reason || 'Baneo permanente por administración';
        await user.save();

        // Also ban their last IP if available
        if (user.lastIp) {
            await BannedIp.findOneAndUpdate(
                { ip: user.lastIp },
                { ip: user.lastIp, reason: `Baneo de cuenta: ${user.username}`, bannedBy: req.user._id },
                { upsert: true }
            );
        }

        res.json({ message: 'Usuario baneado permanentemente y su IP ha sido inhabilitada.', user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getPublicSettings = async (req, res) => {
    try {
        const publicKeys = ['primaryColor', 'accentColor', 'appLogo', 'appBackground'];
        const settings = await AppSetting.find({ key: { $in: publicKeys } });
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getAuditDataById = async (req, res) => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ error: 'Formato de ID inválido para la red.' });
    }

    try {
        // Try all collections
        const [userData, postData, videoData] = await Promise.all([
            User.findById(id).lean(),
            Post.findById(id).populate('user', 'username profilePicture').lean(),
            Video.findById(id).populate('user', 'username profilePicture').lean()
        ]);

        if (userData) return res.json({ entityType: 'user', data: userData });
        if (postData) return res.json({ entityType: 'post', data: postData });
        if (videoData) return res.json({ entityType: 'video', data: videoData });

        res.status(404).json({ error: 'Ningún registro coincide con el ID proporcionado.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getAdminDashboard,
    getPublicSettings,
    searchEverything,
    updateSetting,
    reportUser,
    deleteUser,
    updateUserRole,
    deletePost,
    getAuditDataById,
    deleteVideo,
    suspendUser,
    unsuspendUser,
    sendGlobalAnnouncement,
    permanentlyBanUser
};
