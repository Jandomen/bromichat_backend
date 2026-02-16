const { cloudinary, uploadToCloudinary } = require('../config/cloudinaryConfig');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Group = require('../models/Group');
const { createNotification, createMessageNotification } = require('../config/notificationService');

exports.sendMessage = async (req, res) => {
  try {
    const { recipientId: bodyRecipientId, content, conversationId } = req.body;
    const senderId = req.user?._id;
    if (!senderId) {
      // console.error('No autenticado: req.user._id.toString() no definido');
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
        const resourceType = req.file.mimetype.startsWith('image/')
          ? 'image'
          : req.file.mimetype.startsWith('video/')
            ? 'video'
            : 'raw';


        const originalName = req.file.originalname;
        const extension = originalName.split('.').pop();
        const nameWithoutExt = originalName.split('.').slice(0, -1).join('.').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const publicId = `${nameWithoutExt}_${Date.now()}`;

        const result = await uploadToCloudinary(req.file.buffer, 'chat_files', resourceType, {
          use_filename: true,
          unique_filename: false,
          public_id: publicId + (resourceType === 'raw' ? `.${extension}` : '')
        });

        fileUrl = result.secure_url;
        fileType = resourceType === 'raw' ? 'document' : resourceType;

      } catch (error) {
        console.error('Error al procesar archivo con Cloudinary:', error);
        return res.status(500).json({ error: 'Error al procesar el archivo' });
      }
    }

    let conversation;
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        // Try to find a Community Group
        const group = await Group.findById(conversationId);
        if (group) {
          conversation = {
            _id: group._id,
            isGroup: true,
            participants: group.members.map(m => m.toString()),
            name: group.name,
            chatType: 'community',
            save: async () => { } // communities don't update via conversation save
          };
        } else {
          return res.status(404).json({ error: 'Conversación no encontrada' });
        }
      }
      if (!conversation.participants.some(p => p.toString() === senderId.toString())) {
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
    let finalRecipientId = isGroup
      ? null
      : bodyRecipientId || (conversation.participants && conversation.participants.find((p) => p.toString() !== senderId.toString()));

    // Fallback for self-messaging (e.g. Saved Messages)
    if (!isGroup && (!finalRecipientId || finalRecipientId.toString() === senderId.toString())) {
      finalRecipientId = senderId;
    }

    if (!isGroup && finalRecipientId) {
      const [senderUser, recipientUser] = await Promise.all([
        User.findById(senderId).select('blockedUsers'),
        User.findById(finalRecipientId).select('blockedUsers'),
      ]);
      if (!senderUser || !recipientUser) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      if (
        (senderUser.blockedUsers && senderUser.blockedUsers.some(b => b.toString() === finalRecipientId.toString())) ||
        (recipientUser.blockedUsers && recipientUser.blockedUsers.some(b => b.toString() === senderId.toString()))
      ) {
        return res.status(403).json({ error: 'No puedes enviar mensajes a este usuario' });
      }
    }

    const message = new Message({
      senderId,
      recipientId: finalRecipientId,
      content: content || "",
      fileUrl,
      fileType,
      fileName: req.file ? req.file.originalname : null,
      chatType: isGroup ? 'group' : 'private',
      conversationId: conversation._id,
      groupId: isGroup ? conversation._id : null,
      messageType: hasFile ? 'file' : 'text'
    });
    await message.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'username profilePicture name lastName')
      .lean();

    // Fix profile picture fallback
    if (populatedMessage.senderId && (!populatedMessage.senderId.profilePicture || populatedMessage.senderId.profilePicture === '/Uploads/undefined')) {
      populatedMessage.senderId.profilePicture = 'https://res.cloudinary.com/dpmufjj8y/image/upload/v1726000000/profile_pictures/default.png';
    }

    conversation.lastMessage = message._id;
    conversation.updatedAt = new Date();
    await conversation.save();

    // If it's a community group, also update the Group model's updatedAt for sorting
    if (conversation.chatType === 'community') {
      await Group.findByIdAndUpdate(conversation._id, { updatedAt: new Date() });
    }

    const io = req.app.get('io');
    const eventData = {
      conversationId: conversation._id.toString(),
      message: populatedMessage,
    };
    // console.log('Emitiendo evento:', isGroup ? 'newGroupMessage' : 'conversation_message', eventData);

    if (isGroup) {
      io.to(`group:${conversation._id}`).emit('newGroupMessage', eventData);

      const recipientIds = Array.isArray(conversation.participants)
        ? conversation.participants
          .map(p => p?._id?.toString() || p?.toString())
          .filter(id => id && id !== senderId.toString())
        : [];

      if (recipientIds.length > 0) {
        await createMessageNotification({
          conversation,
          recipientIds,
          sender: populatedMessage.senderId,
          io
        });
      }
    } else {
      io.to(`conversation:${conversation._id}`).emit('conversation_message', eventData);
      if (finalRecipientId) {
        await createMessageNotification({
          conversation,
          recipientIds: [finalRecipientId.toString()],
          sender: populatedMessage.senderId,
          io
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
        const resourceType = req.file.mimetype.startsWith("image/")
          ? "image"
          : req.file.mimetype.startsWith("video/")
            ? "video"
            : "raw";

        const result = await uploadToCloudinary(req.file.buffer, "chat_files", resourceType, {
          use_filename: true,
          unique_filename: true
        });

        fileUrl = result.secure_url; // Cloudinary URL
        fileType = resourceType === "raw" ? "document" : resourceType;
        // console.log(`Archivo procesado por Cloudinary: ${fileUrl}, tipo: ${fileType}`);
      } catch (error) {
        console.error("Error al procesar archivo con Cloudinary:", error);
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
    if (!conversation.participants.some((p) => (p._id?.toString() || p.toString()) === senderId.toString())) {
      return res.status(403).json({ error: "No eres miembro de este grupo" });
    }

    const message = new Message({
      senderId,
      content: content || "",
      fileUrl,
      fileType,
      fileName: req.file ? req.file.originalname : null,
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
      .map((p) => p._id || p)
      .filter((id) => id.toString() !== senderId.toString());

    await createMessageNotification({
      conversation,
      recipientIds,
      sender: populatedMessage.senderId,
      io
    });

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
    const authUserId = req.user?._id?.toString();
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
    const userId = req.user?._id?.toString();
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    // 1. Try Chat Conversation
    let conv = await Conversation.findById(conversationId);
    let hasAccess = false;

    if (conv) {
      hasAccess = conv.participants.some(p => p.toString() === userId.toString());
    } else {
      // 2. Try Community Group
      const group = await Group.findById(conversationId);
      if (group) {
        hasAccess = group.members.some(m => m.toString() === userId.toString());
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }
    let { page = 1, limit = 20 } = req.query;
    limit = Math.min(parseInt(limit), 50);
    const messages = await Message.find({ conversationId })
      .populate('senderId', 'username profilePicture')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * limit)
      .limit(limit)
      .lean();

    const currentUserData = await User.findById(userId).select('blockedUsers');
    const blockedByMe = currentUserData.blockedUsers.map(b => b.toString());

    const usersWhoBlockedMe = await User.find({ blockedUsers: userId }).select('_id');
    const blockedMe = usersWhoBlockedMe.map(u => u._id.toString());

    const processedMessages = messages.map(msg => {
      const senderIdStr = msg.senderId?._id?.toString();
      const isBlocked = blockedByMe.includes(senderIdStr) || blockedMe.includes(senderIdStr);

      if (isBlocked && senderIdStr !== userId) {
        return {
          ...msg,
          content: '••••••••',
          senderId: {
            _id: senderIdStr,
            username: 'Usuario Desconocido',
            profilePicture: 'https://res.cloudinary.com/dpmufjj8y/image/upload/v1726000000/profile_pictures/default.png'
          }
        };
      }
      return msg;
    });

    return res.status(200).json({ messages: processedMessages.reverse() });
  } catch (error) {
    console.error('Error al obtener mensajes:', error);
    return res.status(500).json({ error: 'Error al obtener mensajes' });
  }
};

exports.editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user?._id?.toString();
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
    const userId = req.user?._id?.toString();
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
    let { page = 1, limit = 20 } = req.query;
    limit = Math.min(parseInt(limit), 50); // Enforce max limit of 50 to prevent saturation

    // 1. Try Chat Conversation
    let conv = await Conversation.findById(groupId).lean();
    let hasAccess = false;

    if (conv) {
      hasAccess = conv.participants.some(p => p.toString() === userId.toString());
    } else {
      // 2. Try Community Group
      const group = await Group.findById(groupId).lean();
      if (group) {
        hasAccess = group.members.some(m => m.toString() === userId.toString());
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ error: "No tienes acceso a este grupo o el grupo no existe" });
    }


    const currentUserData = await User.findById(userId).select('blockedUsers');
    const blockedByMe = currentUserData.blockedUsers.map(b => b.toString());
    const usersWhoBlockedMe = await User.find({ blockedUsers: userId }).select('_id');
    const blockedMe = usersWhoBlockedMe.map(u => u._id.toString());

    const messages = await Message.find({ conversationId: groupId, chatType: "group" })
      .populate("senderId", "username profilePicture")
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * limit)
      .limit(limit)
      .lean();

    const processedMessages = messages.map((msg) => {
      const senderIdStr = msg.senderId?._id?.toString();
      const isBlocked = blockedByMe.includes(senderIdStr) || blockedMe.includes(senderIdStr);

      const senderInfo = (isBlocked && senderIdStr !== userId.toString())
        ? {
          _id: senderIdStr,
          username: "Usuario Desconocido",
          profilePicture: "https://res.cloudinary.com/dpmufjj8y/image/upload/v1726000000/profile_pictures/default.png"
        }
        : {
          _id: senderIdStr || null,
          username: msg.senderId?.username || "Unknown",
          profilePicture:
            msg.senderId?.profilePicture && msg.senderId.profilePicture !== "/Uploads/undefined"
              ? msg.senderId.profilePicture
              : "https://res.cloudinary.com/dpmufjj8y/image/upload/v1726000000/profile_pictures/default.png",
        };

      return {
        ...msg,
        content: (isBlocked && senderIdStr !== userId.toString()) ? '••••••••' : msg.content,
        senderId: senderInfo
      };
    }).filter((msg) => msg.senderId._id);

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
    const userId = req.user._id.toString();
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
    const userId = req.user._id.toString();
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