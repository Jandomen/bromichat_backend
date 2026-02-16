const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chatType: {
    type: String,
    enum: ['private', 'group'],
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    validate: {
      validator: function (value) {
        return this.chatType === 'private' ? !!value : true;
      },
      message: 'El ID del destinatario es obligatorio para chats privados.'
    }
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    validate: {
      validator: function (value) {
        return this.chatType === 'group' ? !!value : true;
      },
      message: 'El ID del grupo es obligatorio para los mensajes grupales.'
    }
  },
  content: {
    type: String,
    required: function () {
      if (this.messageType === 'call') return false;
      return !this.fileUrl;
    }
  },
  fileUrl: {
    type: String,
    required: function () {
      if (this.messageType === 'call') return false;
      return !this.content;
    }
  },
  fileType: {
    type: String,
    enum: ['image', 'video', 'document', null]
  },
  fileName: {
    type: String,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  messageType: {
    type: String,
    enum: ['text', 'file', 'call'],
    default: 'text'
  },
  callDetails: {
    status: { type: String, enum: ['missed', 'rejected', 'completed', 'ongoing'] },
    duration: { type: Number }, // in seconds
    startTime: { type: Date },
    endTime: { type: Date },
  },
  isEdited: {
    type: Boolean,
    default: false
  },
});

messageSchema.pre('validate', function (next) {
  if (this.chatType === 'private' && !this.recipientId) {
    next(new Error('El destinatario es obligatorio para los mensajes privados.'));
  } else if (this.chatType === 'group' && !this.groupId) {
    next(new Error('El ID del grupo es obligatorio para los mensajes grupales.'));
  } else {
    next();
  }
});

messageSchema.index(
  { conversationId: 1, senderId: 1, createdAt: 1 },
  { unique: true }
);

module.exports = mongoose.model('Message', messageSchema);