const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { createNotification } = require('../config/notificationService');
const onlineUsers = require("../sockets/onlineUsers");
const Group = require("../models/Group");
const GroupMessage = require('../models/GroupMessage');


const sendMessage = async (req, res) => {
  try {
    const { recipientId: bodyRecipientId, content, conversationId } = req.body;
    const senderId = req.user?.id;
    if (!senderId) return res.status(401).json({ error: 'No autenticado' });

    const hasFile = !!req.file;
    if (!content && !hasFile) return res.status(400).json({ error: 'El mensaje está vacío' });

    const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;
    let conversation;

    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
      if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' });
      if (!conversation.participants.includes(senderId)) return res.status(403).json({ error: 'No perteneces a esta conversación' });
    } else {
      if (!bodyRecipientId) return res.status(400).json({ error: 'Falta recipientId' });
      conversation = await Conversation.findOne({
        isGroup: false,
        participants: { $all: [senderId, bodyRecipientId], $size: 2 },
      });
      if (!conversation) {
        conversation = new Conversation({ participants: [senderId, bodyRecipientId], isGroup: false });
        await conversation.save();
      }
    }

    const isGroup = !!conversation.isGroup;
    const finalRecipientId = isGroup
      ? null
      : (bodyRecipientId || conversation.participants.find(p => p.toString() !== senderId));

    if (!isGroup && finalRecipientId) {
      const [senderUser, recipientUser] = await Promise.all([
        User.findById(senderId).select('blockedUsers'),
        User.findById(finalRecipientId).select('blockedUsers'),
      ]);

      if (senderUser.blockedUsers.includes(finalRecipientId) ||
          recipientUser.blockedUsers.includes(senderId)) {
        return res.status(403).json({ error: 'No puedes enviar mensajes a este usuario' });
      }
    }

    const message = new Message({
      senderId,
      recipientId: finalRecipientId,
      content,
      fileUrl,
      chatType: isGroup ? 'group' : 'private',
      conversationId: conversation._id,
    });
    await message.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'username profilePicture')
      .lean();

    conversation.lastMessage = message._id;
    conversation.updatedAt = new Date();
    await conversation.save();

    const io = req.app.get('io');

    // Emitir mensaje a la sala del chat o grupo
    if (isGroup) {
      io.to(`group:${conversation._id}`).emit('newGroupMessage', populatedMessage);
      const recipientIds = conversation.members.filter(id => id.toString() !== senderId);
      for (const recipientId of recipientIds) {
        await createNotification({
          recipientId,
          senderId,
          message: `${req.user.username} envió un mensaje en el grupo ${conversation.name || 'sin nombre'}`,
          type: 'group_message',
          link: `/groups/${conversation._id}`,
          conversationId: conversation._id,
          io,
        });
      }
    } else {
      io.to(`conversation:${conversation._id}`).emit('conversation_message', {
        conversationId: conversation._id.toString(),
        message: populatedMessage,
      });
      if (finalRecipientId) {
        await createNotification({
          recipientId: finalRecipientId,
          senderId,
          message: `${req.user.username} te envió un mensaje`,
          type: 'message',
          link: `/chat/${conversation._id}`,
          conversationId: conversation._id,
          io,
        });
      }
    }

    return res.status(201).json({
      conversationId: conversation._id,
      message: populatedMessage,
    });
  } catch (error) {
   // console.error('Error al enviar el mensaje:', error);
    return res.status(500).json({ error: 'Error al enviar el mensaje' });
  }
};




const getPrivateMessages = async (req, res) => {
  try {
    const { userId, recipientId } = req.params;
    const authUserId = req.user?.id;

    if (!authUserId) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (authUserId !== userId) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const messages = await Message.find({
      chatType: 'private',
      $or: [
        { senderId: userId, recipientId },
        { senderId: recipientId, recipientId: userId },
      ],
    })
      .populate('senderId', 'username profilePicture')
      .sort({ createdAt: 1 })
      .lean();

   // console.log(`Mensajes privados obtenidos para userId: ${userId}, recipientId: ${recipientId}`);
    return res.status(200).json(messages);
  } catch (error) {
   // console.error('Error al obtener los mensajes privados:', error);
    return res.status(500).json({ error: 'Error al obtener los mensajes privados' });
  }
};

const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (!content) {
      return res.status(400).json({ error: 'El contenido no puede estar vacío' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    if (message.senderId.toString() !== userId) {
      return res.status(403).json({ error: 'No autorizado para editar este mensaje' });
    }

    message.content = content;
    message.updatedAt = new Date();
    message.isEdited = true;
    await message.save();

    const populatedMessage = await Message.findById(messageId)
      .populate('senderId', 'username profilePicture')
      .lean();

    const io = req.app.get('io');
   // console.log(`Emitiendo conversation_message_updated a conversation:${message.conversationId}`); // Log para depuración
    io.to(`conversation:${message.conversationId}`).emit('conversation_message_updated', {
      conversationId: message.conversationId.toString(),
      message: populatedMessage,
    });

    return res.status(200).json({
      message: 'Mensaje editado con éxito',
      updatedMessage: populatedMessage,
    });
  } catch (error) {
   // console.error('Error al editar el mensaje:', error);
    return res.status(500).json({ error: 'Error al editar el mensaje' });
  }
};

const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    if (message.senderId.toString() !== userId) {
      return res.status(403).json({ error: 'No autorizado para eliminar este mensaje' });
    }

    const conversationId = message.conversationId.toString();
    await Message.findByIdAndDelete(messageId);

    const io = req.app.get('io');
   // console.log(`Emitiendo conversation_message_deleted a conversation:${conversationId}`); // Log para depuración
    io.to(`conversation:${conversationId}`).emit('conversation_message_deleted', {
      conversationId,
      messageId,
    });

    return res.status(200).json({ message: 'Mensaje eliminado con éxito' });
  } catch (error) {
   // console.error('Error al eliminar el mensaje:', error);
    return res.status(500).json({ error: 'Error al eliminar el mensaje' });
  }
};

const getMessagesByConversationId = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const conv = await Conversation.findById(conversationId);
    if (!conv) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }
    const isParticipant = conv.participants.some(p => p.toString() === userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'No perteneces a esta conversación' });
    }

    const messages = await Message.find({ conversationId })
      .populate('senderId', 'username profilePicture')
      .sort({ createdAt: 1 })
      .lean();

   // console.log(`Mensajes obtenidos para conversación: ${conversationId}`);
    return res.status(200).json(messages);
  } catch (error) {
   // console.error('Error al obtener mensajes por conversación:', error);
    return res.status(500).json({ error: 'Error al obtener mensajes' });
  }
};


const sendGroupMessage = async (req, res) => {
  try {
    const { groupId, content } = req.body;
    const senderId = req.user.id;
    const file = req.file ? `/uploads/${req.file.filename}` : null;
    if (!content && !file) return res.status(400).json({ error: 'El mensaje está vacío' });
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });
    if (!group.members.includes(senderId)) {
      return res.status(403).json({ error: 'No eres miembro del grupo' });
    }
    const message = new GroupMessage({
      groupId,
      sender: senderId,
      content,
      file,
    });
    await message.save();
    const populatedMessage = await GroupMessage.findById(message._id)
      .populate('sender', 'username profilePicture')
      .lean();
    const io = req.app.get('io');
    io.to(`group:${groupId}`).emit('newGroupMessage', populatedMessage);
   // console.log(`Mensaje de grupo enviado: ${message._id} al grupo: ${groupId}`);
    return res.status(201).json({ groupId, message: populatedMessage });
  } catch (error) {
   // console.error('Error al enviar mensaje de grupo:', error);
    return res.status(500).json({ error: 'Error al enviar mensaje de grupo' });
  }
};
const getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });
    if (!group.members.includes(userId)) {
      return res.status(403).json({ error: 'No eres miembro del grupo' });
    }
    const messages = await GroupMessage.find({ groupId })
      .populate('sender', 'username profilePicture')
      .sort({ createdAt: 1 })
      .lean();
   // console.log(`Mensajes de grupo obtenidos para grupo: ${groupId}`);
    return res.status(200).json(messages);
  } catch (error) {
   // console.error('Error al obtener mensajes de grupo:', error);
    return res.status(500).json({ error: 'Error al obtener mensajes de grupo' });
  }
};
const editGroupMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;
    if (!content) {
      return res.status(400).json({ error: 'El contenido no puede estar vacío' });
    }
    const message = await GroupMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }
    if (message.sender.toString() !== userId) {
      return res.status(403).json({ error: 'No autorizado para editar este mensaje' });
    }
    message.content = content;
    message.updatedAt = new Date();
    await message.save();
    const populatedMessage = await GroupMessage.findById(messageId)
      .populate('sender', 'username profilePicture')
      .lean();
    const io = req.app.get('io');
    io.to(`group:${message.groupId}`).emit('groupMessageUpdated', populatedMessage);
    return res.status(200).json({
      message: 'Mensaje de grupo editado con éxito',
      updatedMessage: populatedMessage,
    });
  } catch (error) {
   // console.error('Error al editar mensaje de grupo:', error);
    return res.status(500).json({ error: 'Error al editar mensaje de grupo' });
  }
};
const deleteGroupMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    const message = await GroupMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }
    if (message.sender.toString() !== userId) {
      return res.status(403).json({ error: 'No autorizado para eliminar este mensaje' });
    }
    const groupId = message.groupId.toString();
    await GroupMessage.findByIdAndDelete(messageId);
    const io = req.app.get('io');
    io.to(`group:${groupId}`).emit('groupMessageDeleted', { groupId, messageId });
    return res.status(200).json({ message: 'Mensaje de grupo eliminado con éxito' });
  } catch (error) {
   // console.error('Error al eliminar mensaje de grupo:', error);
    return res.status(500).json({ error: 'Error al eliminar mensaje de grupo' });
  }
};
module.exports = {
  sendMessage,
  sendGroupMessage,
  getPrivateMessages,
  getGroupMessages,
  editMessage,
  editGroupMessage,
  deleteMessage,
  deleteGroupMessage,
  getMessagesByConversationId,
};
