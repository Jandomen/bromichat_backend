const mongoose = require('mongoose');

const bannedIpSchema = new mongoose.Schema({
    ip: {
        type: String,
        required: true,
        unique: true
    },
    reason: {
        type: String,
        default: 'Violación de los términos de servicio'
    },
    bannedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

module.exports = mongoose.model('BannedIp', bannedIpSchema);
