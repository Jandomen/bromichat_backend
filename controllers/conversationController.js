const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

const createConversation = async (req, res) => {
  const { participantIds = [], isGroup, name, groupImage } = req.body;
  const currentUserId = req.user.id;

  const uniqueParticipants = Array.from(new Set([...participantIds, currentUserId]));
  if (uniqueParticipants.length < 2) {
    return res.status(400).json({ message: 'Se requieren al menos dos participantes' });
  }

  // Validate friends/following relation
  if (isGroup) {
    const user = await User.findById(currentUserId).populate('friends following');
    const allowedIds = new Set([
      ...user.friends.map(f => f._id.toString()),
      ...user.following.map(f => f._id.toString()),
      currentUserId // Self is always allowed
    ]);

    const invalidParticipants = uniqueParticipants.filter(id => !allowedIds.has(id));
    if (invalidParticipants.length > 0) {
      return res.status(403).json({
        message: 'Solo puedes añadir a amigos o personas que sigues a un grupo.',
        invalidIds: invalidParticipants
      });
    }
  }

  const sortedParticipants = uniqueParticipants.sort();

  if (!isGroup && sortedParticipants.length === 2) {
    const existing = await Conversation.findOne({
      isGroup: false,
      participants: { $all: sortedParticipants, $size: 2 },
    });
    if (existing) {
      return res.status(200).json({ conversation: existing, message: 'Conversación ya existe' });
    }
  }

  const newConversation = new Conversation({
    participants: sortedParticipants,
    isGroup,
    name: isGroup ? name : null,
    groupImage: isGroup ? groupImage : '',
    createdBy: currentUserId,
  });
  await newConversation.save();

  res.status(201).json(newConversation);
};

const updateConversation = async (req, res) => {
  const conversationId = req.params.id;
  const { name, groupImage } = req.body;
  const userId = req.user.id;

  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ message: 'Conversación no encontrada' });

    if (!conversation.participants.some(p => p.toString() === userId.toString())) {
      return res.status(403).json({ message: 'No eres participante de esta conversación' });
    }

    if (name) conversation.name = name;
    if (groupImage) conversation.groupImage = groupImage;

    await conversation.save();

    // Notify update
    const io = req.app.get('io');
    io.to(`group:${conversationId}`).emit('groupUpdated', conversation);

    res.json(conversation);
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ message: 'Error al actualizar grupo' });
  }
};

const leaveConversation = async (req, res) => {
  const conversationId = req.params.id;
  const userId = req.user.id;

  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ message: 'Conversación no encontrada' });

    if (!conversation.isGroup) {
      return res.status(400).json({ message: 'No puedes salir de una conversación privada' });
    }

    const initialLength = conversation.participants.length;
    conversation.participants = conversation.participants.filter(id => id.toString() !== userId);

    if (conversation.participants.length === initialLength) {
      return res.status(400).json({ message: 'No eres parte de esta conversación' });
    }

    // If empty, delete? Or keep archive? Let's keep it but maybe logic to delete specific empty groups
    if (conversation.participants.length === 0) {
      await Conversation.findByIdAndDelete(conversationId);
      // Also delete messages?
      await Message.deleteMany({ conversationId });
      return res.json({ message: 'Grupo eliminado por falta de participantes' });
    }

    await conversation.save();

    const io = req.app.get('io');
    io.to(`group:${conversationId}`).emit('userLeft', { conversationId, userId });

    res.json({ message: 'Has salido del grupo' });
  } catch (error) {
    console.error('Error leaving conversation:', error);
    res.status(500).json({ message: 'Error al salir del grupo' });
  }
};

const getConversations = async (req, res) => {
  const userId = req.user.id;

  try {
    // 1. Fetch private and chat-only group conversations
    let conversations = await Conversation.find({ participants: userId })
      .populate('participants', 'username profilePicture')
      .populate({ path: 'lastMessage', select: 'content senderId createdAt' })
      .sort({ updatedAt: -1 });

    // 2. Fetch community groups the user belongs to
    // Note: We'll need the Group model here
    const Group = require('../models/Group');
    const communityGroups = await Group.find({ members: userId })
      .select('name coverImage members')
      .populate('members', 'username profilePicture')
      .lean();

    // Map community groups to conversation format
    const mappedCommunities = communityGroups.map(group => ({
      _id: group._id,
      name: group.name,
      groupImage: group.coverImage,
      participants: group.members,
      isGroup: true,
      chatType: 'community', // Distinguish from chat groups
      updatedAt: group.createdAt // Default if no messages
    }));

    // 3. Merge and sort
    // Filter private conversations that have at least another participant
    conversations = conversations.filter(conv => {
      if (!conv.isGroup) {
        return conv.participants.some(p => p._id.toString() !== userId);
      }
      return true;
    });

    // Merge both lists
    const merged = [...conversations, ...mappedCommunities].sort((a, b) =>
      new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
    );

    res.status(200).json(merged);
  } catch (error) {
    console.error('Error al obtener conversaciones:', error);
    res.status(500).json({ message: 'Error al obtener conversaciones' });
  }
};

const getConversationById = async (req, res) => {
  const conversationId = req.params.id;
  const userId = req.user.id;

  if (!conversationId || conversationId === 'undefined') {
    return res.status(400).json({ message: 'ID de conversación inválido' });
  }

  try {
    // 1. Try Chat Conversation
    let conversation = await Conversation.findById(conversationId)
      .populate('participants', 'username profilePicture')
      .populate({ path: 'lastMessage', select: 'content senderId createdAt' });

    if (conversation) {
      if (!conversation.participants.some(p => (p._id?.toString() || p.toString()) === userId.toString())) {
        return res.status(403).json({ message: 'Acceso denegado' });
      }
      return res.status(200).json(conversation);
    }

    // 2. Try Community Group
    const Group = require('../models/Group');
    const group = await Group.findById(conversationId)
      .populate('members', 'username profilePicture')
      .lean();

    if (group) {
      if (!group.members.some(m => (m._id?.toString() || m.toString()) === userId.toString())) {
        return res.status(403).json({ message: 'No eres miembro de este grupo' });
      }
      // Map to conversation format
      return res.status(200).json({
        _id: group._id,
        name: group.name,
        groupImage: group.coverImage,
        participants: group.members,
        isGroup: true,
        chatType: 'community'
      });
    }

    res.status(404).json({ message: 'Conversación no encontrada' });
  } catch (error) {
    console.error('Error al obtener conversación:', error);
    res.status(500).json({ message: 'Error al obtener conversación' });
  }
};

const deleteConversation = async (req, res) => {
  const conversationId = req.params.id;
  const userId = req.user.id;

  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ message: 'Conversación no encontrada' });

    if (!conversation.participants.some(p => p.toString() === userId.toString())) {
      return res.status(403).json({ message: 'No tienes permiso para eliminar esta conversación' });
    }

    await Message.deleteMany({ conversationId });
    await Conversation.findByIdAndDelete(conversationId);

    res.status(200).json({ message: 'Conversación eliminada correctamente' });
  } catch (error) {
    // console.error('Error al eliminar conversación:', error);
    res.status(500).json({ message: 'Error al eliminar conversación' });
  }
};

const searchConversations = async (req, res) => {
  const userId = req.user.id;
  const { query = '' } = req.query;

  try {
    const groupConversations = await Conversation.find({
      participants: userId,
      isGroup: true,
      name: { $regex: query, $options: 'i' },
    }).populate('participants', 'username profilePicture');

    const privateConversations = await Conversation.find({
      participants: userId,
      isGroup: false,
    }).populate('participants', 'username profilePicture');

    const filteredPrivate = privateConversations.filter(conv => {
      const otherParticipant = conv.participants.find(p => p._id.toString() !== userId);
      return otherParticipant && otherParticipant.username.match(new RegExp(query, 'i'));
    });

    const conversations = [...groupConversations, ...filteredPrivate];

    res.status(200).json(conversations);
  } catch (error) {
    // console.error('Error al buscar conversaciones:', error);
    res.status(500).json({ message: 'Error al buscar conversaciones' });
  }
};

module.exports = {
  createConversation,
  getConversations,
  getConversationById,
  deleteConversation,
  searchConversations,
  updateConversation,
  leaveConversation
};
