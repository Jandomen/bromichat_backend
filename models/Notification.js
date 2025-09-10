const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ['message', 'friend_request', 'like', 'dislike', 'comment', 'new_follower', 'group_message'],
      required: true,
    },
    isRead: { type: Boolean, default: false },
    link: { type: String, default: '' },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: false },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);