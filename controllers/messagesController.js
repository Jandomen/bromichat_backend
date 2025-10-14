const { cloudinary, uploadToCloudinary } = require('../config/cloudinaryConfig');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Group = require('../models/Group');
const { createNotification } = require('./notificationController');

exports.sendMessage = async (req, res) => {
  try {
    const { recipientId: bodyRecipientId, content, conversationId } = req.body;
    const senderId = req.user?.id;
    if (!senderId) {
     // console.error('No autenticado: req.user.id no definido');
      return res.status(401).json({ error: 'No autenticado' });
    }

    console.log('Datos recibidos en sendMessage:', {
      content,
      conversationId,
      recipientId: bodyRecipientId,
      file: req.file
        ? {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            cloudinaryUrl: req.file.path,
          }
        : 'No file',
    });

    const hasFile = !!req.file;
    if (!content && !hasFile) {
      return res.status(400).json({ error: 'El mensaje está vacío' });
    }

    let fileUrl = null;
    let fileType = null;
    if (hasFile) {
      if (req.file.size > 100 * 1024 * 1024) {
        return res.status(400).json({ error: 'El archivo excede el tamaño máximo de 100 MB' });
      }
      try {
        fileUrl = req.file.path; 
        fileType = req.file.mimetype.startsWith('image/')
          ? 'image'
          : req.file.mimetype.startsWith('video/')
          ? 'video'
          : 'document';
       // console.log(`Archivo procesado por Cloudinary: ${fileUrl}, tipo: ${fileType}`);
      } catch (error) {
       // console.error('Error al procesar archivo con Cloudinary:', error);
        return res.status(500).json({ error: 'Error al procesar el archivo' });
      }
    }

    let conversation;
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }
      if (!conversation.participants.includes(senderId)) {
        return res.status(403).json({ error: 'No perteneces a esta conversación' });
      }
    } else if (!bodyRecipientId) {
      return res.status(400).json({ error: 'Falta recipientId' });
    } else {
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
      : bodyRecipientId || conversation.participants.find((p) => p.toString() !== senderId);

    if (!isGroup && finalRecipientId) {
      const [senderUser, recipientUser] = await Promise.all([
        User.findById(senderId).select('blockedUsers'),
        User.findById(finalRecipientId).select('blockedUsers'),
      ]);
      if (!senderUser || !recipientUser) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      if (
        senderUser.blockedUsers.includes(finalRecipientId) ||
        recipientUser.blockedUsers.includes(senderId)
      ) {
        return res.status(403).json({ error: 'No puedes enviar mensajes a este usuario' });
      }
    }

    const message = new Message({
      senderId,
      recipientId: finalRecipientId,
      content,
      fileUrl,
      fileType,
      chatType: isGroup ? 'group' : 'private',
      conversationId: conversation._id,
      groupId: isGroup ? conversation._id : null,
    });
    await message.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'username profilePicture')
      .lean();

    // Validar que profilePicture no sea /Uploads/undefined
    if (populatedMessage.senderId.profilePicture === '/Uploads/undefined') {
     // console.warn(`profilePicture inválido para senderId ${senderId}, usando default`);
      populatedMessage.senderId.profilePicture =
        'https://res.cloudinary.com/dpmufjj8y/image/upload/v1726000000/profile_pictures/default.png';
    }

    conversation.lastMessage = message._id;
    conversation.updatedAt = new Date();
    await conversation.save();

    const io = req.app.get('io');
    const eventData = {
      conversationId: conversation._id.toString(),
      message: populatedMessage,
    };
    console.log('Emitiendo evento:', isGroup ? 'newGroupMessage' : 'conversation_message', eventData);

    if (isGroup) {
      io.to(`group:${conversation._id}`).emit('newGroupMessage', eventData);
      const recipientIds = conversation.participants.filter((id) => id.toString() !== senderId);
      for (const recipientId of recipientIds) {
        await createNotification({
          recipientId,
          senderId,
          message: `${req.user.username} envió un mensaje en el grupo ${conversation.name || 'sin nombre'}`,
          type: 'group_message',
          link: `/groups/${conversation._id}`,
          conversationId: conversation._id,
        });
      }
    } else {
      io.to(`conversation:${conversation._id}`).emit('conversation_message', eventData);
      if (finalRecipientId) {
        await createNotification({
          recipientId: finalRecipientId,
          senderId,
          message: `${req.user.username} te envió un mensaje`,
          type: 'message',
          link: `/chat/${conversation._id}`,
          conversationId: conversation._id,
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

exports.sendGroupMessage = async (req, res) => {
  try {
    const { content, conversationId } = req.body;
    const senderId = req.user?._id; 
    if (!senderId) {
      console.error("No autenticado: req.user._id no definido");
      return res.status(401).json({ error: "No autenticado" });
    }

   console.log("Datos recibidos en sendGroupMessage:", {
      content,
      conversationId,
      senderId: senderId.toString(),
      file: req.file
        ? {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            cloudinaryUrl: req.file.path,
          }
        : "No file",
    });

    const hasFile = !!req.file;
    if (!content && !hasFile) {
      return res.status(400).json({ error: "El mensaje está vacío" });
    }

    let fileUrl = null;
    let fileType = null;
    if (hasFile) {
      if (req.file.size > 100 * 1024 * 1024) {
        return res.status(400).json({ error: "El archivo excede el tamaño máximo de 100 MB" });
      }
      try {
        fileUrl = req.file.path; // Cloudinary URL
        fileType = req.file.mimetype.startsWith("image/")
          ? "image"
          : req.file.mimetype.startsWith("video/")
          ? "video"
          : "document";
       // console.log(`Archivo procesado por Cloudinary: ${fileUrl}, tipo: ${fileType}`);
      } catch (error) {
       // console.error("Error al procesar archivo con Cloudinary:", error);
        return res.status(500).json({ error: "Error al procesar el archivo" });
      }
    }

    const conversation = await Conversation.findById(conversationId).populate(
      "participants",
      "username profilePicture"
    );
    if (!conversation) {
      return res.status(404).json({ error: "Conversación no encontrada" });
    }
    if (!conversation.isGroup) {
      return res.status(400).json({ error: "Esta no es una conversación grupal" });
    }
    if (!conversation.participants.some((p) => p._id.toString() === senderId.toString())) {
      return res.status(403).json({ error: "No eres miembro de este grupo" });
    }

    const message = new Message({
      senderId,
      content: content || "",
      fileUrl,
      fileType,
      chatType: "group",
      conversationId: conversation._id,
      groupId: conversation._id,
    });
    await message.save();

    const populatedMessage = await Message.findById(message._id)
      .populate("senderId", "username profilePicture")
      .lean();

    if (!populatedMessage.senderId.profilePicture || populatedMessage.senderId.profilePicture === "/Uploads/undefined") {
     // console.warn(`profilePicture inválido para senderId ${senderId}, usando default`);
      populatedMessage.senderId.profilePicture =
        "https://res.cloudinary.com/dpmufjj8y/image/upload/v1726000000/profile_pictures/default.png";
    }

    conversation.lastMessage = message._id;
    conversation.updatedAt = new Date();
    await conversation.save();

    const io = req.app.get("io");
    const eventData = {
      conversationId: conversation._id.toString(),
      message: {
        ...populatedMessage,
        senderId: {
          _id: populatedMessage.senderId._id.toString(),
          username: populatedMessage.senderId.username,
          profilePicture: populatedMessage.senderId.profilePicture,
        },
      },
    };
   // console.log("Emitiendo evento: newGroupMessage", eventData);
    io.to(`group:${conversation._id}`).emit("newGroupMessage", eventData);

    const recipientIds = conversation.participants
      .filter((p) => p._id.toString() !== senderId.toString())
      .map((p) => p._id);
    for (const recipientId of recipientIds) {
      await createNotification({
        recipientId,
        senderId,
        message: `${req.user.username} envió un mensaje en el grupo ${conversation.name || "sin nombre"}`,
        type: "group_message",
        link: `/groups/${conversation._id}`,
        conversationId: conversation._id,
      });
    }

    return res.status(201).json({
      conversationId: conversation._id,
      message: populatedMessage,
    });
  } catch (error) {
   // console.error("Error al enviar el mensaje grupal:", error);
    return res.status(500).json({ error: "Error al enviar el mensaje grupal" });
  }
};

exports.getPrivateMessages = async (req, res) => {
  try {
    const { userId, recipientId } = req.params;
    const authUserId = req.user?.id;
    if (!authUserId) return res.status(401).json({ error: 'No autenticado' });
    if (authUserId !== userId) return res.status(403).json({ error: 'No autorizado' });

    const conversation = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [userId, recipientId], $size: 2 },
    });
    if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' });

    const messages = await Message.find({
      conversationId: conversation._id,
      chatType: 'private',
    })
      .populate('senderId', 'username profilePicture')
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json(messages);
  } catch (error) {
   // console.error('Error al obtener los mensajes privados:', error);
    return res.status(500).json({ error: 'Error al obtener los mensajes privados' });
  }
};

exports.getMessagesByConversationId = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const conv = await Conversation.findById(conversationId);
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
    if (!conv.participants.some(p => p.toString() === userId)) {
      return res.status(403).json({ error: 'No perteneces a esta conversación' });
    }

    const { page = 1, limit = 20 } = req.query;
    const messages = await Message.find({ conversationId })
      .populate('senderId', 'username profilePicture')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    return res.status(200).json({ messages: messages.reverse() });
  } catch (error) {
   // console.error('Error al obtener mensajes por conversación:', error);
    return res.status(500).json({ error: 'Error al obtener mensajes' });
  }
};

exports.editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    if (!content || !content.trim()) return res.status(400).json({ error: 'El contenido no puede estar vacío' });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: 'Mensaje no encontrado' });
    if (message.senderId.toString() !== userId) return res.status(403).json({ error: 'No autorizado para editar este mensaje' });

    message.content = content;
    message.isEdited = true;
    await message.save();

    const populatedMessage = await Message.findById(messageId)
      .populate('senderId', 'username profilePicture')
      .lean();

    const io = req.app.get('io');
    const event = message.chatType === 'group' ? 'groupMessageUpdated' : 'conversation_message_updated';
    io.to(`${message.chatType === 'group' ? 'group' : 'conversation'}:${message.conversationId}`).emit(event, {
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

exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: 'Mensaje no encontrado' });
    if (message.senderId.toString() !== userId) return res.status(403).json({ error: 'No autorizado para eliminar este mensaje' });

    if (message.fileUrl && message.fileType) {
      const publicId = message.fileUrl.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`chat_files/${publicId}`, {
        resource_type: message.fileType === 'document' ? 'raw' : message.fileType,
      });
    }

    const conversationId = message.conversationId.toString();
    await Message.findByIdAndDelete(messageId);

    const io = req.app.get('io');
    const event = message.chatType === 'group' ? 'groupMessageDeleted' : 'conversation_message_deleted';
    io.to(`${message.chatType === 'group' ? 'group' : 'conversation'}:${conversationId}`).emit(event, {
      conversationId,
      messageId,
    });

    return res.status(200).json({ message: 'Mensaje eliminado con éxito' });
  } catch (error) {
   // console.error('Error al eliminar el mensaje:', error);
    return res.status(500).json({ error: 'Error al eliminar el mensaje' });
  }
};



exports.getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { page = 1, limit = 20 } = req.query;

    const conversation = await Conversation.findById(groupId).lean();
    if (!conversation) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }
    if (!conversation.participants.some((p) => p.toString() === userId.toString())) {
      return res.status(403).json({ error: "No eres miembro del grupo" });
    }

    const messages = await Message.find({ conversationId: groupId, chatType: "group" })
      .populate("senderId", "username profilePicture")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const processedMessages = messages.map((msg) => ({
      ...msg,
      senderId: {
        _id: msg.senderId?._id?.toString() || null,
        username: msg.senderId?.username || "Unknown",
        profilePicture:
          msg.senderId?.profilePicture && msg.senderId.profilePicture !== "/Uploads/undefined"
            ? msg.senderId.profilePicture
            : "https://res.cloudinary.com/dpmufjj8y/image/upload/v1726000000/profile_pictures/default.png",
      },
    })).filter((msg) => msg.senderId._id);

    console.log("Messages sent:", {
      groupId,
      messageCount: processedMessages.length,
      senderIds: processedMessages.map((m) => m.senderId._id),
    });

    return res.status(200).json({ messages: processedMessages.reverse() });
  } catch (error) {
   // console.error("Error al obtener mensajes de grupo:", error);
    return res.status(500).json({ error: "Error al obtener mensajes de grupo" });
  }
};

exports.editGroupMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;
    if (!content || !content.trim()) {
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
    message.isEdited = true;
    await message.save();
    const populatedMessage = await Message.findById(messageId)
      .populate('senderId', 'username profilePicture')
      .lean();
    const io = req.app.get('io');
    io.to(`group:${message.conversationId}`).emit('groupMessageUpdated', populatedMessage);
    return res.status(200).json({
      message: 'Mensaje de grupo editado con éxito',
      updatedMessage: populatedMessage,
    });
  } catch (error) {
   // console.error('Error al editar mensaje de grupo:', error);
    return res.status(500).json({ error: 'Error al editar mensaje de grupo' });
  }
};

exports.deleteGroupMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }
    if (message.senderId.toString() !== userId) {
      return res.status(403).json({ error: 'No autorizado para eliminar este mensaje' });
    }
    if (message.fileUrl && message.fileType) {
      const publicId = message.fileUrl.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`chat_files/${publicId}`, {
        resource_type: message.fileType === 'document' ? 'raw' : message.fileType,
      });
    }
    const groupId = message.conversationId.toString();
    await Message.findByIdAndDelete(messageId);
    const io = req.app.get('io');
    io.to(`group:${groupId}`).emit('groupMessageDeleted', { groupId, messageId });
    return res.status(200).json({ message: 'Mensaje de grupo eliminado con éxito' });
  } catch (error) {
   // console.error('Error al eliminar mensaje de grupo:', error);
    return res.status(500).json({ error: 'Error al eliminar mensaje de grupo' });
  }
};