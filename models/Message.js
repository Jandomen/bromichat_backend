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
      validator: function(value) {
        return this.chatType === 'private' ? !!value : true;
      },
      message: 'El ID del destinatario es obligatorio para chats privados.'
    }
  }, 

  groupId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Group', 
    validate: {
      validator: function(value) {
        return this.chatType === 'group' ? !!value : true;
      },
      message: 'El ID del grupo es obligatorio para los mensajes grupales.'
    }
  },

  content: { 
    type: String,
    required: function() { return !this.fileUrl; } 
  },

  fileUrl: {
    type: String,
    required: function() { return !this.content; } 
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


});

messageSchema.pre('validate', function(next) {
  if (this.chatType === 'private' && !this.recipientId) {
    next(new Error('El destinatario es obligatorio para los mensajes privados.'));
  } else if (this.chatType === 'group' && !this.groupId) {
    next(new Error('El ID del grupo es obligatorio para los mensajes grupales.'));
  } else {
    next();
  }
});

module.exports = mongoose.model('Message', messageSchema);
