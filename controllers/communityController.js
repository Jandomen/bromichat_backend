const Group = require('../models/Group');
const Post = require('../models/Post');
const User = require('../models/User');
const { createNotification } = require('../config/notificationService');

const createGroup = async (req, res) => {
    try {
        const { name, description, privacy, coverImage, initialMembers } = req.body;
        const userId = req.user._id;
        const io = req.app.get('io');
        const user = await User.findById(userId);

        if (!name) {
            return res.status(400).json({ message: 'Group name is required' });
        }

        // Ensure creator is always a member and admin
        const memberIds = [userId];
        if (initialMembers) {
            let parsedMembers = [];
            try {
                parsedMembers = typeof initialMembers === 'string' ? JSON.parse(initialMembers) : initialMembers;
            } catch (e) {
                parsedMembers = [];
            }
            parsedMembers.forEach(id => {
                if (id.toString() !== userId.toString()) {
                    memberIds.push(id);
                }
            });
        }

        // Subir imagen si viene
        let finalCoverImage = coverImage || '';
        if (req.file && req.file.buffer) {
            const result = await uploadToCloudinary(req.file.buffer, 'community_covers', 'image');
            finalCoverImage = result.secure_url;
        }

        const newGroup = new Group({
            name,
            description,
            privacy,
            coverImage: finalCoverImage,
            creator: userId,
            admins: [userId],
            members: memberIds,
        });

        await newGroup.save();

        // Notify initial members
        if (Array.isArray(initialMembers)) {
            for (const memberId of initialMembers) {
                if (memberId.toString() === userId.toString()) continue;
                await createNotification({
                    recipientId: memberId,
                    senderId: userId,
                    type: 'group_invite',
                    message: `${user.username} te añadió al grupo "${name}"`,
                    link: `/groups/${newGroup._id}`,
                    io
                });
            }
        }

        res.status(201).json({ message: 'Group created successfully', group: newGroup });
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ message: 'Server error creating group' });
    }
};

const addMember = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { userIdToAdd } = req.body;
        const currentUserId = req.user._id;
        const io = req.app.get('io');

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ message: 'Group not found' });

        const currentUser = await User.findById(currentUserId);

        // Check if current user is an admin
        if (!group.admins.includes(currentUserId.toString()) && group.creator.toString() !== currentUserId.toString()) {
            return res.status(403).json({ message: 'Only admins can add members' });
        }

        if (group.members.includes(userIdToAdd)) {
            return res.status(400).json({ message: 'User is already a member' });
        }

        group.members.push(userIdToAdd);
        await group.save();

        await createNotification({
            recipientId: userIdToAdd,
            senderId: currentUserId,
            type: 'group_invite',
            message: `${currentUser.username} te añadió al grupo "${group.name}"`,
            link: `/groups/${group._id}`,
            io
        });

        res.json({ message: 'Member added successfully', group });
    } catch (error) {
        console.error('Error adding member:', error);
        res.status(500).json({ message: 'Server error adding member' });
    }
};

const removeMember = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { userIdToRemove } = req.body;
        const currentUserId = req.user._id;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ message: 'Group not found' });

        // Only admins can remove others, users can remove themselves (leave)
        const isAdmin = group.admins.includes(currentUserId.toString()) || group.creator.toString() === currentUserId.toString();
        const isSelf = currentUserId.toString() === userIdToRemove;

        if (!isAdmin && !isSelf) {
            return res.status(403).json({ message: 'Not authorized to remove this member' });
        }

        // Prevent removing the creator unless handled specifically
        if (userIdToRemove === group.creator.toString() && isSelf) {
            // Logic for creator leaving (e.g., assign new admin or deny)
            // For now, let's just allow it but maybe warn or assigning a new creator
        }

        group.members = group.members.filter(id => id.toString() !== userIdToRemove);
        group.admins = group.admins.filter(id => id.toString() !== userIdToRemove);

        await group.save();
        res.json({ message: 'Member removed successfully' });
    } catch (error) {
        console.error('Error removing member:', error);
        res.status(500).json({ message: 'Server error removing member' });
    }
};

const getAllGroups = async (req, res) => {
    // Can add filters/search later
    try {
        const groups = await Group.find().populate('members', 'username profilePicture');
        res.json(groups);
    } catch (error) {
        console.error('Error fetching groups:', error);
        res.status(500).json({ message: 'Server error fetching groups' });
    }
};

const getGroup = async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId)
            .populate('creator', 'username profilePicture')
            .populate('admins', 'username profilePicture')
            .populate('members', 'username profilePicture');

        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }
        res.json(group);
    } catch (error) {
        console.error('Error fetching group:', error);
        res.status(500).json({ message: 'Server error fetching group' });
    }
};

const joinGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user._id;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ message: 'Group not found' });

        if (group.members.includes(userId)) {
            return res.status(400).json({ message: 'You are already a member' });
        }

        group.members.push(userId);
        await group.save();

        res.json({ message: 'Joined group successfully', group });
    } catch (error) {
        console.error('Error joining group:', error);
        res.status(500).json({ message: 'Server error joining group' });
    }
};

const leaveGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user._id;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ message: 'Group not found' });

        group.members = group.members.filter(id => id.toString() !== userId.toString());
        group.admins = group.admins.filter(id => id.toString() !== userId.toString());

        // Optional: If creator leaves, assign new creator or handle logic

        await group.save();

        res.json({ message: 'Left group successfully' });
    } catch (error) {
        console.error('Error leaving group:', error);
        res.status(500).json({ message: 'Server error leaving group' });
    }
};

const getGroupPosts = async (req, res) => {
    try {
        const { groupId } = req.params;
        const posts = await Post.find({ group: groupId, isGroupPost: true })
            .populate('user', 'username profilePicture')
            .populate('reactions.user', 'username profilePicture')
            .populate('comments.user', 'username profilePicture')
            .populate({
                path: 'sharedFrom',
                populate: { path: 'user', select: 'username profilePicture' }
            })
            .sort({ createdAt: -1 });
        res.json(posts);
    } catch (error) {
        console.error('Error fetching group posts:', error);
        res.status(500).json({ message: 'Server error fetching group posts' });
    }
};

const { uploadToCloudinary } = require('../config/cloudinaryConfig');

const createGroupPost = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { content } = req.body;
        const userId = req.user._id;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ message: 'Group not found' });

        if (!group.members.includes(userId)) {
            return res.status(403).json({ message: 'You must be a member to post' });
        }

        let media = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                try {
                    const resourceType = file.mimetype.startsWith('image/')
                        ? 'image'
                        : file.mimetype.startsWith('video/')
                            ? 'video'
                            : 'raw';

                    const result = await uploadToCloudinary(file.buffer, 'group_posts', resourceType);
                    media.push({
                        url: result.secure_url,
                        mediaType: resourceType === 'raw' ? 'document' : resourceType
                    });
                } catch (uploadErr) {
                    console.error('Error uploading community post media:', uploadErr);
                }
            }
        }

        const newPost = new Post({
            user: userId,
            group: groupId,
            isGroupPost: true,
            content,
            media: media
        });

        await newPost.save();

        // Populate user info for immediate display
        await newPost.populate('user', 'username profilePicture');

        res.status(201).json(newPost);
    } catch (error) {
        console.error('Error creating group post:', error);
        res.status(500).json({ message: 'Server error creating group post' });
    }
};

const updateGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { name, description, privacy } = req.body;
        const userId = req.user._id;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ message: 'Group not found' });

        // Anyone mentioned in members can update? User said "Cualquier integrante"
        if (!group.members.some(m => m.toString() === userId.toString())) {
            return res.status(403).json({ message: 'Solo miembros pueden editar el grupo' });
        }

        if (name) group.name = name;
        if (description) group.description = description;
        if (privacy) group.privacy = privacy;

        if (req.file && req.file.buffer) {
            const result = await uploadToCloudinary(req.file.buffer, 'community_covers', 'image');
            group.coverImage = result.secure_url;
        }

        await group.save();

        const io = req.app.get('io');
        io.to(`group:${groupId}`).emit('groupUpdated', group);

        res.json({ message: 'Grupo actualizado con éxito', group });
    } catch (error) {
        console.error('Error updating group:', error);
        res.status(500).json({ message: 'Error del servidor al actualizar grupo' });
    }
};

const deleteGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user._id;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ message: 'Group not found' });

        // Only creator can delete
        if (group.creator.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'Solo el creador puede eliminar el grupo' });
        }

        // Delete associated posts
        await Post.deleteMany({ group: groupId });

        await Group.findByIdAndDelete(groupId);

        const io = req.app.get('io');
        io.to(`group:${groupId}`).emit('groupDeleted', { groupId });

        res.json({ message: 'Grupo eliminado con éxito' });
    } catch (error) {
        console.error('Error deleting group:', error);
        res.status(500).json({ message: 'Error del servidor al eliminar grupo' });
    }
};

module.exports = {
    createGroup,
    getAllGroups,
    getGroup,
    joinGroup,
    leaveGroup,
    getGroupPosts,
    createGroupPost,
    addMember,
    removeMember,
    updateGroup,
    deleteGroup
};
