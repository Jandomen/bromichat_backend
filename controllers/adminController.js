const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const Video = require('../models/Video');
const AppSetting = require('../models/AppSetting');

const getAdminDashboard = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalPosts = await Post.countDocuments();
        const totalVideos = await Video.countDocuments();
        const reportedUsers = await User.find({ reports: { $gt: 0 } }).sort({ reports: -1 });
        const settings = await AppSetting.find();

        res.json({
            stats: {
                totalUsers,
                totalPosts,
                totalVideos
            },
            reportedUsers,
            settings
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
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
            }).populate('author', 'username profilePicture').limit(20);
        } else if (type === 'video') {
            results = await Video.find({
                $or: [
                    { title: { $regex: query, $options: 'i' } },
                    { _id: mongoose.isValidObjectId(query) ? query : null }
                ].filter(c => c._id !== null || !Object.keys(c).includes('_id'))
            }).populate('userId', 'username profilePicture').limit(20);
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

module.exports = {
    getAdminDashboard,
    searchEverything,
    updateSetting,
    reportUser,
    deleteUser,
    updateUserRole,
    deletePost,
    deleteVideo,
    suspendUser,
    unsuspendUser
};
