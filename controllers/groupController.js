const Group = require('../models/Group');
const Message = require('../models/Message');
const User = require('../models/User');
const onlineUsers = require('../sockets/onlineUsers');
const Conversation = require('../models/Conversation');
const { cloudinary, uploadToCloudinary } = require('../config/cloudinaryConfig');

const createGroup = async (req, res) => {
  const { name, friendIds } = req.body;
  const { _id: userId } = req.user;

  let parsedFriendIds = [];
  try {
    parsedFriendIds = JSON.parse(friendIds);
  } catch {
    parsedFriendIds = Array.isArray(friendIds) ? friendIds : [];
  }

  if (!name || parsedFriendIds.length === 0) {
    return res.status(400).json({ message: 'El nombre del grupo y los amigos son requeridos.' });
  }

  try {
    const users = await User.find({ _id: { $in: parsedFriendIds } });
    if (users.length !== parsedFriendIds.length) {
      return res.status(400).json({ message: 'Algunos amigos no existen.' });
    }

    // Subir imagen del grupo si se envía
    let groupImage = null;
    if (req.file && req.file.buffer) {
      const uploadRes = await uploadToCloudinary(req.file.buffer);
      groupImage = uploadRes.secure_url;
    }

    const conversation = new Conversation({
      participants: [...parsedFriendIds, userId],
      isGroup: true,
      name,
      createdBy: userId,
      groupImage,
    });

    await conversation.save();

    const io = req.app.get('io');
    [...parsedFriendIds, userId].forEach((memberId) => {
      const socketId = onlineUsers.get(memberId.toString());
      if (socketId) {
        io.to(socketId).emit('newConversation', {
          _id: conversation._id,
          name,
          groupImage,
          participants: conversation.participants,
          isGroup: true,
        });
        io.to(socketId).emit('newNotification', {
          message: `Fuiste añadido al grupo ${name}`,
          type: 'group',
          conversationId: conversation._id,
        });
      }
    });

    res.status(201).json({ message: 'Grupo creado con éxito.', group: conversation });
  } catch (error) {
    //console.error('[Grupo] Error creando el grupo:', error);
    res.status(500).json({ message: 'Error creando el grupo. Inténtalo más tarde.' });
  }
};

const updateGroupImage = async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user._id;

  try {
    const group = await Conversation.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Grupo no encontrado' });

    if (!group.participants.includes(userId)) {
      return res.status(403).json({ message: 'No tienes permiso para modificar este grupo' });
    }

    if (!req.file || !req.file.buffer)
      return res.status(400).json({ message: 'No se recibió ninguna imagen válida' });

    const uploadRes = await uploadToCloudinary(req.file.buffer);
    group.groupImage = uploadRes.secure_url;
    await group.save();

    const io = req.app.get('io');
    io.to(`group:${groupId}`).emit('groupImageUpdated', {
      groupId,
      image: group.groupImage,
    });

    res.json({ message: 'Imagen actualizada con éxito', group });
  } catch (error) {
    //console.error('[Grupo] Error al actualizar imagen del grupo:', error);
    res.status(500).json({ message: 'Error al actualizar la imagen del grupo' });
  }
};

const getUserGroups = async (req, res) => {
  const userId = req.user._id;

  try {
    const groups = await Conversation.find({ participants: userId, isGroup: true })
      .populate('participants', 'username profilePicture')
      .populate('createdBy', 'username profilePicture');

    if (groups.length === 0)
      return res.status(404).json({ message: 'No se encontraron grupos.' });

    res.status(200).json({ groups });
  } catch (error) {
    //console.error('[Grupo] Error al obtener los grupos:', error);
    res.status(500).json({ error: 'Error al obtener los grupos. Intenta de nuevo.' });
  }
};

const getGroupDetails = async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user._id;

  try {
    const group = await Conversation.findById(groupId)
      .populate("participants", "username profilePicture")
      .populate("createdBy", "username profilePicture")
      .lean();

    if (!group) {
      return res.status(404).json({ message: "Grupo no encontrado" });
    }

    if (!group.participants.some((p) => p._id.toString() === userId.toString())) {
      return res.status(403).json({ message: "No eres miembro de este grupo" });
    }

    group.participants = (group.participants || []).map((p) => ({
      _id: p._id.toString(),
      username: p.username || "Unknown",
      profilePicture:
        p.profilePicture && p.profilePicture !== "/Uploads/undefined"
          ? p.profilePicture
          : "https://res.cloudinary.com/dpmufjj8y/image/upload/v1726000000/profile_pictures/default.png",
    }));

    if (group.createdBy) {
      group.createdBy = {
        _id: group.createdBy._id.toString(),
        username: group.createdBy.username || "Unknown",
        profilePicture:
          group.createdBy.profilePicture && group.createdBy.profilePicture !== "/Uploads/undefined"
            ? group.createdBy.profilePicture
            : "https://res.cloudinary.com/dpmufjj8y/image/upload/v1726000000/profile_pictures/default.png",
      };
    }

    console.log("Group details sent:", {
      groupId,
      participants: group.participants.map((p) => ({
        _id: p._id,
        username: p.username,
        profilePicture: p.profilePicture,
      })),
    });

    res.json({ group });
  } catch (error) {
    //console.error("[Grupo] Error al obtener detalles del grupo:", error);
    res.status(500).json({ message: "Error al obtener los detalles del grupo" });
  }
};

const updateParticipants = async (req, res) => {
  const { groupId } = req.params;
  const { participantIds } = req.body;
  const userId = req.user._id;

  try {
    const group = await Conversation.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Grupo no encontrado' });

    if (!group.participants.includes(userId)) return res.status(403).json({ message: 'No tienes permiso' });

    group.participants = participantIds;
    await group.save();

    const io = req.app.get('io');
    participantIds.forEach((memberId) => {
      const socketId = onlineUsers.get(memberId.toString());
      if (socketId) {
        io.to(socketId).emit('newNotification', {
          message: `Los participantes del grupo ${group.name} fueron actualizados`,
          type: 'group',
          conversationId: groupId,
        });
      }
    });

    io.to(`group:${groupId}`).emit('groupUpdated', group);
    res.json({ message: 'Participantes actualizados con éxito', group });
  } catch (error) {
    //console.error('[Grupo] Error al actualizar participantes:', error);
    res.status(500).json({ message: 'Error al actualizar participantes' });
  }
};

const deleteGroupId = async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user._id;

  try {
    const group = await Conversation.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Grupo no encontrado' });

    if (group.createdBy.toString() !== userId)
      return res.status(403).json({ message: 'Solo el creador puede eliminar el grupo' });

    const messages = await Message.find({ conversationId: groupId });
    for (const message of messages) {
      if (message.fileUrl && message.fileType) {
        const publicId = message.fileUrl.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`chat_files/${publicId}`, {
          resource_type: message.fileType === 'document' ? 'raw' : message.fileType,
        });
      }
    }

    await Message.deleteMany({ conversationId: groupId });
    await Conversation.findByIdAndDelete(groupId);

    const io = req.app.get('io');
    io.to(`group:${groupId}`).emit('groupDeleted', { groupId });

    res.status(200).json({ message: 'Grupo eliminado correctamente' });
  } catch (error) {
    //console.error('[Grupo] Error al eliminar el grupo:', error);
    res.status(500).json({ message: 'Error al eliminar el grupo' });
  }
};

const leaveGroup = async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user._id;

  try {
    const group = await Conversation.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Grupo no encontrado' });

    if (!group.participants.includes(userId))
      return res.status(403).json({ message: 'No eres miembro del grupo' });

    group.participants = group.participants.filter((member) => member.toString() !== userId);
    await group.save();

    const io = req.app.get('io');
    io.to(`group:${groupId}`).emit('groupMemberLeft', {
      groupId,
      userId,
      message: `El usuario ha salido del grupo ${group.name}`,
    });

    group.participants.forEach((memberId) => {
      const socketId = onlineUsers.get(memberId.toString());
      if (socketId) io.to(socketId).emit('groupUpdated', group);
    });

    res.json({ message: 'Has salido del grupo con éxito' });
  } catch (error) {
    //console.error('[Grupo] Error al salir del grupo:', error);
    res.status(500).json({ message: 'Error al salir del grupo' });
  }
};

const getUserGroupsWithLastMessage = async (req, res) => {
  try {
    const userId = req.user._id;
    const groups = await Conversation.find({ participants: userId, isGroup: true })
      .populate('participants', 'username profilePicture')
      .populate('createdBy', 'username profilePicture');

    const groupsWithLastMessage = await Promise.all(
      groups.map(async (group) => {
        const lastMessage = await Message.findOne({ conversationId: group._id })
          .populate('senderId', 'username profilePicture')
          .sort({ createdAt: -1 });
        return { ...group.toObject(), lastMessage: lastMessage || null };
      })
    );

    res.json({ groups: groupsWithLastMessage });
  } catch (err) {
    //console.error('Error fetching user groups with last message:', err);
    res.status(500).json({ message: 'Error al obtener grupos con último mensaje' });
  }
};

module.exports = {
  createGroup,
  updateGroupImage,
  getUserGroups,
  getGroupDetails,
  updateParticipants,
  deleteGroupId,
  leaveGroup,
  getUserGroupsWithLastMessage,
};
