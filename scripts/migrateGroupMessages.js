const mongoose = require('mongoose');
const Message = require('../models/Message');
const GroupMessage = require('../models/GroupMessage');
const Conversation = require('../models/Conversation');
const connectDB = require('../config/db');

const migrateMessages = async () => {
  try {
    await connectDB();
    const groupMessages = await GroupMessage.find().lean();
    for (const msg of groupMessages) {
      const conversation = await Conversation.findOne({ _id: msg.groupId, isGroup: true });
      if (!conversation) {
       // console.warn(`No se encontró conversación para groupId: ${msg.groupId}`);
        continue;
      }
      const newMessage = new Message({
        chatType: 'group',
        senderId: msg.sender,
        groupId: msg.groupId,
        content: msg.content,
        fileUrl: msg.file,
        fileType: msg.file ? (msg.file.match(/\.(png|jpe?g|gif|webp|avif)$/i) ? 'image' : msg.file.match(/\.(mp4|webm|ogg)$/i) ? 'video' : 'document') : null,
        conversationId: msg.groupId,
        createdAt: msg.createdAt,
        isEdited: !!msg.updatedAt,
      });
      await newMessage.save();
     // console.log(`Mensaje migrado: ${msg._id} -> ${newMessage._id}`);
    }
   // console.log('Migración completada');
    process.exit(0);
  } catch (err) {
   // console.error('Error en la migración:', err);
    process.exit(1);
  }
};

migrateMessages();