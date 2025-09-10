const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');
const User = require('../models/User');
const onlineUsers = require("../sockets/onlineUsers");



const createGroup = async (req, res) => {
  const { name, friendIds } = req.body;
  const { _id: userId } = req.user;

  if (!name || !friendIds || friendIds.length === 0) {
    const message = 'El nombre del grupo y los amigos son requeridos.';
    //console.warn('[Grupo] Validación fallida:', message);
    return res.status(400).json({ message });
  }

  try {
    const users = await User.find({ _id: { $in: friendIds } });
    if (users.length !== friendIds.length) {
      return res.status(400).json({ message: 'Algunos amigos no existen.' });
    }
    const group = new Group({
      name,
      members: [...friendIds, userId],
      createdBy: userId,
    });
    await group.save();
    const io = req.app.get('io');
    [...friendIds, userId].forEach((memberId) => {
      const socketId = onlineUsers.get(memberId.toString());
      if (socketId) {
        io.to(socketId).emit('newConversation', {
          _id: group._id,
          name,
          participants: group.members,
          isGroup: true,
        });
        io.to(socketId).emit('newNotification', {
          message: `Fuiste añadido al grupo ${name}`,
          type: 'group',
          conversationId: group._id,
        });
      }
    });
    //console.log('[Grupo] Grupo creado con éxito:', group._id);
    return res.status(201).json({ message: 'Grupo creado con éxito.', group });
  } catch (error) {
    //console.error('[Grupo] Error creando el grupo:', error);
    return res.status(500).json({ message: 'Error creando el grupo. Inténtalo más tarde.' });
  }
};

const getUserGroups = async (req, res) => {
  const userId = req.user._id; 
  //console.log('[Grupo] Buscando grupos para el usuario:', userId);

  try {
    const groups = await Group.find({ members: userId }).populate('members', 'username profilePicture');
    if (groups.length === 0) {
      //console.warn('[Grupo] No se encontraron grupos para el usuario:', userId);
      return res.status(404).json({ message: 'No se encontraron grupos.' });
    }
    const validGroups = await Promise.all(
      groups.map(async (group) => {
        try {
          const exists = await Group.findById(group._id);
          return exists ? group : null;
        } catch (e) {
          //console.error(`Invalid group ID ${group._id}:`, e);
          return null;
        }
      })
    );
    const filteredGroups = groups.filter((group) => group);
    if (filteredGroups.length === 0) {
      //console.warn('[Grupo] No se encontraron grupos válidos para el usuario:', filteredGroups.length);
      return res.status(404).json({ message: 'No se encontraron grupos válidos.' });
    }
    //console.log('[Grupo] Grupos encontrados:', filteredGroups.length);
    res.status(200).json({ groups: filteredGroups });
  } catch (error) {
    //console.error('[Grupo] Error al obtener los grupos:', error);
    res.status(500).json({ error: 'Error al obtener los grupos. Intenta de nuevo.' });
  }
};


const getGroupDetails = async (req, res) => {
  const { groupId } = req.params;

  try {
    const group = await Group.findById(groupId).populate('members', 'username profilePicture');
    if (!group) {
      //console.warn('[Grupo] Grupo no encontrado con ID:', groupId);
      return res.status(404).json({ message: 'Grupo no encontrado' });
    }
    //console.log('[Grupo] Grupo obtenido:', group._id);
    res.json({ group });
  } catch (error) {
    //console.error('[Grupo] Error al obtener detalles del grupo:', error);
    res.status(500).json({ message: 'Error al obtener los detalles del grupo' });
  }
};

const updateParticipants = async (req, res) => {
  const { groupId } = req.params;
  const { participantIds } = req.body;
  const userId = req.user._id;

  try {
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Grupo no encontrado" });
    }

    if (!group.members.includes(userId)) {
      return res.status(403).json({ message: "No tienes permiso" });
    }

    group.members = participantIds;
    await group.save();

    const io = req.app.get("io");

    participantIds.forEach((memberId) => {
      const socketId = onlineUsers.get(memberId.toString());
      if (socketId) {
        io.to(socketId).emit("newNotification", {
          message: `Los participantes del grupo ${group.name} fueron actualizados`,
          type: "group",
          conversationId: groupId,
        });
      }
    });

    res.json({ message: "Participantes actualizados con éxito", group });
    //console.log("[Grupo] Participantes actualizados con éxito:", groupId);
  } catch (error) {
    //console.error("[Grupo] Error al actualizar participantes:", error);
    //console.error(error);
    res.status(500).json({ message: "Error al actualizar participantes" });
  }
};

const deleteGroupId = async (req, res) => {
  const { groupId } = req.params;

  try {
    const group = await Group.findByIdAndDelete(groupId);

    if (!group) {
      //console.warn('[Grupo] Grupo a eliminar no encontrado:', groupId);
      return res.status(404).json({ message: 'Grupo no encontrado' });
    }

    //console.log('[Grupo] Grupo eliminado con éxito:', group._id);
    res.status(200).json({ message: 'Grupo eliminado correctamente' });
  } catch (error) {
    //console.error('[Grupo] Error al eliminar el grupo:', error);
    res.status(500).json({ message: 'Error al eliminar el grupo' });
  }
};

exports.getUserGroups = async (req, res) => {
  try {
    const userId = req.user.id;

    const groups = await Group.find({ createdBy: userId });

    if (!groups.length) {
      return res.status(404).json({ message: 'No se encontraron grupos.' });
    }

    res.json({ groups });
    //console.log(`Grupos obtenidos para el usuario ${userId}:`, groups.length);
  } catch (err) {
    //console.error(err);
    res.status(500).json({ message: 'Error del servidor al obtener los grupos.' });
  }
};

const leaveGroup = async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user.id;
  try {
    const group = await Group.findById(groupId);
    if (!group) {
      //console.warn('[Grupo] Grupo no encontrado:', groupId);
      return res.status(404).json({ message: 'Grupo no encontrado' });
    }
    if (!group.members.includes(userId)) {
      return res.status(403).json({ message: 'No eres miembro del grupo' });
    }
    group.members = group.members.filter((member) => member.toString() !== userId);
    await group.save();
    const io = req.app.get('io');
    io.to(`group:${groupId}`).emit('groupMemberLeft', {
      groupId,
      userId,
      message: `El usuario ha salido del grupo ${group.name}`,
    });
    onlineUsers.forEach((socketId, memberId) => {
      if (group.members.includes(memberId)) {
        io.to(socketId).emit('groupUpdated', group);
      }
    });
    //console.log('[Grupo] Usuario salió del grupo:', groupId, userId);
    res.json({ message: 'Has salido del grupo con éxito' });
  } catch (error) {
    //console.error('[Grupo] Error al salir del grupo:', error);
    res.status(500).json({ message: 'Error al salir del grupo' });
  }
};

const getUserGroupsWithLastMessage = async (req, res) => {
  try {
    const userId = req.user._id;

    const groups = await Group.find({
      $or: [{ createdBy: userId }, { members: userId }]
    })
      .populate('createdBy', 'username profilePicture')
      .populate('members', 'username profilePicture');

    const groupsWithLastMessage = await Promise.all(
      groups.map(async (group) => {
        const lastMessage = await GroupMessage.findOne({ groupId: group._id })
          .populate('sender', 'username profilePicture')
          .sort({ createdAt: -1 });

        return {
          ...group.toObject(),
          lastMessage: lastMessage || null,
        };
      })
    );

    //console.log(`Grupos obtenidos para el usuario ${userId}:`, groupsWithLastMessage.length);
    res.json({ groups: groupsWithLastMessage });
  } catch (err) {
    //console.error('Error fetching user groups with last message:', err);
    res.status(500).json({ message: 'Error al obtener grupos con último mensaje' });
  }
};





module.exports = {
  createGroup,
  getUserGroups,
  getGroupDetails,
  updateParticipants,
  leaveGroup,
  deleteGroupId,
  getUserGroupsWithLastMessage,
};
