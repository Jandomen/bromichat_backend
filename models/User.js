const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, unique: true, required: true },
    birthdate: { type: Date, required: true },
    privacySettings: {
      profileVisibility: {
        type: String,
        enum: ['public', 'friends', 'private'],
        default: 'public'
      },
      messagePrivacy: {
        type: String,
        enum: ['everyone', 'friends'],
        default: 'everyone'
      }
    },
    storySettings: {
      defaultDuration: {
        type: Number,
        default: 24
      },
      saveToArchive: {
        type: Boolean,
        default: true
      }
    },
    sosSettings: {
      emergencyContacts: [{
        name: String,
        phone: String,
        relationship: String
      }],
      message: {
        type: String,
        default: "¡Ayuda! Necesito asistencia inmediata. Esta es mi ubicación."
      },
      isEnabled: {
        type: Boolean,
        default: false
      }
    },
    profilePicture: {
      type: String,
      default: "https://res.cloudinary.com/dpmufjj8y/image/upload/v1726000000/profile_pictures/default.png"
    },
    coverPhoto: {
      type: String,
      default: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80"
    },
    bio: { type: String },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    reports: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    firebaseUid: { type: String },
    fcmToken: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    credentials: [{
      credentialID: { type: String, required: true },
      publicKey: { type: String, required: true },
      counter: { type: Number, default: 0 },
      transports: [String],
    }],
    isSuspended: { type: Boolean, default: false },
    suspensionExpires: { type: Date },
    suspensionReason: { type: String },
  },
  { timestamps: true }
);

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', UserSchema);

module.exports = User;