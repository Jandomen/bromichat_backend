const mongoose = require('mongoose');

const gallerySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    imageUrl: { type: String, required: true },
    publicId: { type: String },
    description: { type: String },
    isExternal: { type: Boolean, default: false },
    externalSource: { type: String, default: "user" },
    isPrivate: { type: Boolean, default: false },
    allowFeed: { type: Boolean, default: true },
    category: { type: String, default: 'Mundo' },
    reactions: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      type: { type: String, enum: ['like', 'love', 'haha', 'wow', 'sad', 'angry', 'surprised', 'shocked', 'thinking', 'risky', 'irrelevant'], required: true }
    }],
    comments: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      comment: { type: String, required: true },
      parentId: { type: mongoose.Schema.Types.ObjectId, default: null },
      isEdited: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now }
    }],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    views: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Gallery', gallerySchema);
