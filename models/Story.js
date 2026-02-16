const mongoose = require('mongoose');

const StorySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        mediaUrl: {
            type: String,
            required: function () { return this.type === 'image' || this.type === 'video'; }
        },
        type: {
            type: String,
            enum: ['image', 'video', 'text'],
            default: 'image',
        },
        content: {
            type: String,
            required: function () { return this.type === 'text'; }
        },
        backgroundColor: {
            type: String,
            default: '#000000'
        },

        views: [{
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            viewedAt: {
                type: Date,
                default: Date.now
            }
        }],
        createdAt: {
            type: Date,
            default: Date.now,
        },
        expiresAt: {
            type: Date
        }
    },
    { timestamps: true }
);

const Story = mongoose.model('Story', StorySchema);

module.exports = Story;
