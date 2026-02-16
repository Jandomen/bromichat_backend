const Story = require('../models/Story');
const User = require('../models/User');
const { uploadToCloudinary } = require('../config/cloudinaryConfig');

const createStory = async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, content, backgroundColor } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });


        const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);
        const recentStoriesCount = await Story.countDocuments({
            user: userId,
            createdAt: { $gte: sevenHoursAgo }
        });

        if (recentStoriesCount >= 5) {
            return res.status(403).json({
                message: 'Has alcanzado el límite de 5 historias cada 7 horas. Por favor espera para subir más.'
            });
        }

        let mediaUrl = '';
        let storyType = type || 'image';

        if (storyType === 'text') {
            if (!content) {
                return res.status(400).json({ message: 'Contenido de texto requerido' });
            }
        } else {
            if (!req.file || !req.file.buffer) {
                return res.status(400).json({ message: 'Archivo de historia requerido' });
            }
            storyType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
            const folder = storyType === 'video' ? 'stories_videos' : 'stories_images';

            const options = {};
            if (storyType === 'video' && req.body.startOffset) {
                // Apply trimming transformation if startOffset is provided
                options.transformation = [
                    { start_offset: req.body.startOffset, duration: 20 }
                ];
            }

            const result = await uploadToCloudinary(
                req.file.buffer,
                folder,
                storyType === 'video' ? 'video' : 'image',
                options
            );
            mediaUrl = result.secure_url;
        }

        const durationHours = req.body.duration || user.storySettings?.defaultDuration || 24;
        const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

        const newStory = new Story({
            user: userId,
            mediaUrl: mediaUrl || '',
            type: storyType,
            content: storyType === 'text' ? content : undefined,
            backgroundColor: storyType === 'text' ? backgroundColor : undefined,
            expiresAt: expiresAt
        });

        await newStory.save();

        const io = req.app.get('io');
        if (io) {
            io.emit('newStory', {
                userId,
                username: user.username,
                profilePicture: user.profilePicture
            });
        }

        res.status(201).json({ message: 'Historia creada con éxito', story: newStory });
        console.log("Historia subida con exito", newStory)
    } catch (error) {
        console.error('Error al crear historia:', error);
        res.status(500).json({ message: 'Error del servidor' });
    }
};

const deleteStory = async (req, res) => {
    try {
        const { storyId } = req.params;
        const story = await Story.findOne({ _id: storyId, user: req.user._id });

        if (!story) {
            return res.status(404).json({ error: 'Historia no encontrada o no autorizada' });
        }

        await Story.deleteOne({ _id: storyId });
        res.json({ message: 'Historia eliminada' });
    } catch (error) {
        console.error('Error delete story:', error);
        res.status(500).json({ error: 'Error al eliminar historia' });
    }
};

const viewStory = async (req, res) => {
    try {
        const { storyId } = req.params;
        const userId = req.user.id;

        const story = await Story.findById(storyId);
        if (!story) {
            return res.status(404).json({ message: 'Historia no encontrada' });
        }

        const alreadyViewed = story.views.some(v => v.user.toString() === userId);
        if (!alreadyViewed) {
            story.views.push({ user: userId });
            await story.save();
        }

        res.json({ message: 'Historia vista' });
    } catch (error) {
        console.error('Error viewing story:', error);
        res.status(500).json({ message: 'Error del servidor' });
    }
};

const getStories = async (req, res) => {
    try {
        const userId = req.user.id;
        const currentUser = await User.findById(userId).select('friends following');

        const userIds = [
            ...currentUser.friends,
            ...currentUser.following,
            userId
        ];

        const stories = await Story.find({
            user: { $in: userIds },
            expiresAt: { $gt: new Date() } // Only show active stories
        })
            .populate('user', 'username profilePicture')
            .populate('views.user', 'username profilePicture')
            .sort({ createdAt: 1 });

        const groupedStories = {};

        stories.forEach(story => {
            if (!story.user || !story.user._id) return;

            const storyObj = story.toObject();
            const userIdStr = userId.toString();
            const storyUserIdStr = story.user._id.toString();
            const isOwner = storyUserIdStr === userIdStr;

            storyObj.viewedByUser = story.views.some(v => v.user && v.user._id.toString() === userIdStr);

            if (!isOwner) {
                delete storyObj.views;
            }

            const uId = storyUserIdStr;
            if (!groupedStories[uId]) {
                groupedStories[uId] = {
                    user: story.user,
                    stories: []
                };
            }
            groupedStories[uId].stories.push(storyObj);
        });

        res.json(Object.values(groupedStories));
    } catch (error) {
        console.error('Error al obtener historias:', error);
        res.status(500).json({ message: 'Error del servidor' });
    }
};

const getArchivedStories = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId).select('storySettings');

        // Si el usuario tiene desactivado el archivo, devolvemos vacío
        if (user.storySettings?.saveToArchive === false) {
            return res.json([]);
        }

        const archivedStories = await Story.find({
            user: userId
            // Eliminamos el filtro de expiresAt para que se vean "desde que las sube"
        })
            .populate('views.user', 'username profilePicture')
            .sort({ createdAt: -1 });

        res.json(archivedStories);
    } catch (error) {
        console.error('Error al obtener archivo de historias:', error);
        res.status(500).json({ message: 'Error del servidor' });
    }
};

module.exports = {
    createStory,
    getStories,
    getArchivedStories,
    deleteStory,
    viewStory,
};
