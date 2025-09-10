const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: {
    type: String,
    required: function () {
      return !this.file; 
    },
  },
  file: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
});

module.exports = mongoose.model('GroupMessage', groupMessageSchema);
