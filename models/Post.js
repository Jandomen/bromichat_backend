const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    comment: { type: String, required: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    isEdited: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

const postSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, trim: true },
    media: [{
        url: { type: String, required: true },
        mediaType: { type: String, enum: ['image', 'video', 'raw'], required: true },
    }],

    reactions: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        type: { type: String, enum: ['like', 'love', 'haha', 'wow', 'sad', 'angry', 'surprised', 'shocked', 'thinking', 'risky', 'irrelevant'], required: true }
    }],
    sharedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
    isGroupPost: { type: Boolean, default: false },
    
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [commentSchema],
}, { timestamps: true });

module.exports = mongoose.model('Post', postSchema);
