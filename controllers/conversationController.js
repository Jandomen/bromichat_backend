const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

const createConversation = async (req, res) => {
  const { participantIds = [], isGroup, name } = req.body;
  const currentUserId = req.user.id;
  const io = req.app.get('io');

  const uniqueParticipants = Array.from(new Set([...participantIds, currentUserId]));
  if (uniqueParticipants.length < 2) {
    return res.status(400).json({ message: 'Se requieren al menos dos participantes' });
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
    createdBy: currentUserId,
  });
  await newConversation.save();

  res.status(201).json(newConversation);
};

const getConversations = async (req, res) => {
  const userId = req.user.id;

  try {
    let conversations = await Conversation.find({ participants: userId })
      .populate('participants', 'username profilePicture')
      .populate({ path: 'lastMessage', select: 'content senderId createdAt' })
      .sort({ updatedAt: -1 });

    conversations = conversations.filter(conv => {
      if (!conv.isGroup) {
        return conv.participants.some(p => p._id.toString() !== userId);
      }
      return true;
    });

    res.status(200).json(conversations);
  } catch (error) {
   // console.error('Error al obtener conversaciones:', error);
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
    const conversation = await Conversation.findById(conversationId)
      .populate('participants', 'username profilePicture')
      .populate({ path: 'lastMessage', select: 'content senderId createdAt' });

    if (!conversation || !conversation.participants.some(p => p._id.toString() === userId)) {
      return res.status(404).json({ message: 'Conversación no encontrada o acceso denegado' });
    }

    res.status(200).json(conversation);
  } catch (error) {
   // console.error('Error al obtener conversación:', error);
    res.status(500).json({ message: 'Error al obtener conversación' });
  }
};

const deleteConversation = async (req, res) => {
  const conversationId = req.params.id;
  const userId = req.user.id;

  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ message: 'Conversación no encontrada' });

    if (!conversation.participants.some(p => p.toString() === userId)) {
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
};
