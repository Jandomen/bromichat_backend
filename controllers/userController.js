const User = require('../models/User');
const mongoose = require('mongoose');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Story = require('../models/Story');
const { uploadToCloudinary } = require('../config/cloudinaryConfig');


const bcrypt = require('bcrypt');

const getUserProfile = async (req, res) => {
  try {
    const userId = req.params.id;
    const currentUserId = req.user._id;

    const [currentUser, targetUser, activeStories] = await Promise.all([
      User.findById(currentUserId).select('friends following blockedUsers'),
      User.findById(userId)
        .populate('friends', '_id username name lastName profilePicture')
        .populate('followers', '_id username name lastName profilePicture')
        .populate('following', '_id username name lastName profilePicture')
        .populate('blockedUsers', '_id username name lastName profilePicture')
        .select('name lastName username email phone birthdate profilePicture coverPhoto bio friends followers following blockedUsers createdAt privacySettings'),
      Story.find({
        user: userId,
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: 1 })
    ]);


    if (!targetUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }


    if (currentUser.blockedUsers.some(b => b._id.toString() === userId)) {
      return res.status(403).json({ message: 'Has bloqueado a este usuario' });
    }
    if (targetUser.blockedUsers.some(b => b._id.toString() === currentUserId.toString())) {
      return res.status(403).json({ message: 'Este usuario te ha bloqueado' });
    }

    const storiesWithStatus = activeStories.map(story => ({
      ...story.toObject(),
      viewedByUser: story.views.some(v => v.user.toString() === currentUserId.toString())
    }));

    const responseUser = {
      ...targetUser.toObject(),
      isFriend: currentUser.friends.some(f => f._id.toString() === userId),
      isFollowing: currentUser.following.some(f => f._id.toString() === userId),
      isBlocked: currentUser.blockedUsers.some(b => b._id.toString() === userId),
      stories: storiesWithStatus,
      hasStories: activeStories.length > 0,
      allStoriesViewed: activeStories.length > 0 && storiesWithStatus.every(s => s.viewedByUser)
    };

    //console.log('Depuración - Datos devueltos por getUserProfile:', responseUser);
    res.json(responseUser);
  } catch (err) {
    //console.error('Error al obtener perfil de usuario:', err);
    res.status(500).json({ message: 'Error del servidor' });
  }
};



const getUserProfileId = async (req, res) => {
  const userId = req.params.id;
  const currentUserId = req.user._id;

  //console.log("El ID de getUserProfileId: " + userId);
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    //console.warn('ID de usuario inválido :(');
    return res.status(400).json({ message: 'ID de usuario inválido' });
  }

  try {
    const [currentUser, targetUser, activeStories] = await Promise.all([
      User.findById(currentUserId).select('friends following blockedUsers'),
      User.findById(userId)
        .populate('friends', '_id username name lastName profilePicture')
        .populate('followers', '_id username name lastName profilePicture')
        .populate('following', '_id username name lastName profilePicture')
        .populate('blockedUsers', '_id username name lastName profilePicture')
        .select('name lastName username email phone birthdate profilePicture coverPhoto bio friends followers following blockedUsers createdAt'),
      Story.find({
        user: userId,
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: 1 })
    ]);

    if (!targetUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (currentUser.blockedUsers.some(b => b._id.toString() === userId)) {
      return res.status(403).json({ message: 'Has bloqueado a este usuario' });
    }
    if (targetUser.blockedUsers.some(b => b._id.toString() === currentUserId.toString())) {
      return res.status(403).json({ message: 'Este usuario te ha bloqueado' });
    }

    const isFriend = currentUser.friends.some(f => f._id.toString() === userId);
    const isFollowing = currentUser.following.some(f => f._id.toString() === userId);
    const isBlocked = currentUser.blockedUsers.some(b => b._id.toString() === userId);

    const storiesWithStatus = activeStories.map(story => ({
      ...story.toObject(),
      viewedByUser: story.views.some(v => v.user.toString() === currentUserId.toString())
    }));

    const responseUser = {
      _id: targetUser._id,
      username: targetUser.username,
      name: targetUser.name,
      lastName: targetUser.lastName,
      email: targetUser.email,
      phone: targetUser.phone,
      birthdate: targetUser.birthdate,
      profilePicture: targetUser.profilePicture,
      coverPhoto: targetUser.coverPhoto,
      bio: targetUser.bio,
      friends: targetUser.friends,
      followers: targetUser.followers,
      following: targetUser.following,
      blockedUsers: targetUser.blockedUsers,
      createdAt: targetUser.createdAt,
      isFriend,
      isFollowing,
      isBlocked,
      stories: storiesWithStatus,
      hasStories: activeStories.length > 0,
      allStoriesViewed: activeStories.length > 0 && storiesWithStatus.every(s => s.viewedByUser)
    };

    //console.log('Depuración - Datos devueltos por getUserProfileId:', responseUser);
    //console.log('Usuario Obtenido :)');
    res.json(responseUser);
  } catch (error) {
    //console.error('Error al buscar el usuario:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};


const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const currentUser = await User.findById(req.user._id).select('blockedUsers');
    const users = await User.find({
      _id: { $nin: currentUser.blockedUsers },
      blockedUsers: { $nin: [req.user._id] }
    })
      .populate('friends', '_id username name lastName profilePicture')
      .populate('followers', '_id username name lastName profilePicture')
      .populate('following', '_id username name lastName profilePicture')
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .select('name lastName username email profilePicture coverPhoto friends followers following')
      .exec();

    const totalUsers = await User.countDocuments({
      _id: { $nin: currentUser.blockedUsers },
      blockedUsers: { $nin: [req.user._id] }
    });

    res.json({
      users,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: parseInt(page),
      totalUsers,
    });
    //console.log('Usuarios obtenidos con paginación exitosa :)');
  } catch (error) {
    //console.error('Error al obtener usuarios con paginación :(', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};


const searchUsers = async (req, res) => {
  try {
    const { query = '', page = 1, limit = 10 } = req.query;
    const userId = req.user._id;

    const currentUser = await User.findById(userId).select('friends following blockedUsers');
    const skip = (page - 1) * limit;

    const filter = {
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { name: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
      ],
      _id: {
        $nin: currentUser.blockedUsers,
      },
      blockedUsers: { $nin: [userId] },
    };

    const users = await User.find(filter)
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate('friends', '_id username name lastName profilePicture')
      .populate('followers', '_id username name lastName profilePicture')
      .populate('following', '_id username name lastName profilePicture')
      .select('username name lastName email profilePicture coverPhoto friends followers following')
      .exec();

    const totalUsers = await User.countDocuments(filter);

    const formattedUsers = users.map((u) => ({
      ...u.toObject(),
      isFriend: currentUser.friends.some(f => f._id.toString() === u._id.toString()),
      isFollowing: currentUser.following.some(f => f._id.toString() === u._id.toString()),
      isBlocked: currentUser.blockedUsers.some(b => b._id.toString() === u._id.toString()),
    }));

    res.json({
      users: formattedUsers,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: parseInt(page),
      totalUsers,
    });

    //console.log('Usuarios encontrados con éxito :)');
  } catch (error) {
    //console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};



const getUserDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    //console.log('User ID:', userId);

    const user = await User.findById(userId)
      .populate('friends', '_id username name lastName profilePicture')
      .populate('followers', '_id username name lastName profilePicture')
      .populate('following', '_id username name lastName profilePicture')
      .populate('blockedUsers', '_id username name lastName profilePicture')
      .select('username name lastName email phone bio profilePicture coverPhoto friends followers following blockedUsers privacySettings');

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    //console.log('Detalles del usuario con éxito :)');
    res.status(200).json({
      currentUser: user,
      friends: user.friends,
      followers: user.followers,
      following: user.following,
      blockedUsers: user.blockedUsers,
    });
  } catch (error) {
    //console.error('Error fetching user details :(', error);
    res.status(500).json({ message: 'Error al obtener detalles del usuario' });
  }
};


const getFullUserData = async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.user._id;

  if (!userId || userId === 'undefined') {
    return res.status(400).json({ message: 'ID de usuario inválido o faltante' });
  }

  try {
    const [currentUser, targetUser, activeStories] = await Promise.all([
      User.findById(currentUserId).select('friends following blockedUsers'),
      User.findById(userId)
        .populate('friends', '_id username name lastName profilePicture')
        .populate('followers', '_id username name lastName profilePicture')
        .populate('following', '_id username name lastName profilePicture')
        .select('name lastName username email phone birthdate profilePicture coverPhoto bio friends followers following createdAt'),
      Story.find({
        user: userId,
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: 1 })
    ]);

    if (!targetUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Verificar si hay bloqueo mutuo
    if (currentUser.blockedUsers.some(b => b._id.toString() === userId)) {
      return res.status(403).json({ message: 'Has bloqueado a este usuario' });
    }
    if (targetUser.blockedUsers.some(b => b._id.toString() === currentUserId.toString())) {
      return res.status(403).json({ message: 'Este usuario te ha bloqueado' });
    }

    const posts = await Post.find({ user: userId })
      .populate('comments.user', 'username profilePicture')
      .populate('user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture')
      .sort({ createdAt: -1 });

    const isFriend = currentUser.friends.some(f => f._id.toString() === userId);
    const isFollowing = currentUser.following.some(f => f._id.toString() === userId);
    const isBlocked = currentUser.blockedUsers.some(b => b._id.toString() === userId);

    const storiesWithStatus = activeStories.map(story => ({
      ...story.toObject(),
      viewedByUser: story.views.some(v => v.user.toString() === currentUserId.toString())
    }));

    const fullData = {
      user: {
        ...targetUser.toObject(),
        isFriend,
        isFollowing,
        isBlocked,
        stories: storiesWithStatus,
        hasStories: activeStories.length > 0,
        allStoriesViewed: activeStories.length > 0 && storiesWithStatus.every(s => s.viewedByUser)
      },
      posts,
      followers: targetUser.followers,
      following: targetUser.following,
      friends: targetUser.friends,
    };

    //console.log('Depuración - Datos devueltos por getFullUserData:', fullData);
    res.status(200).json(fullData);
  } catch (err) {
    //console.error('Error al obtener la data completa del usuario', err);
    res.status(500).json({ message: 'Error del servidor' });
  }
};



const updateProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'Archivo de imagen requerido' });
    }

    // Subir directamente a Cloudinary desde buffer
    const result = await uploadToCloudinary(req.file.buffer, 'profile_pictures');

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePicture: result.secure_url },
      { new: true }
    ).select('username profilePicture coverPhoto');

    if (!updatedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.status(200).json({
      message: 'Foto de perfil actualizada con éxito',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Error al actualizar la foto de perfil:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

const updateCoverPhoto = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'Archivo de imagen requerido' });
    }

    // Subir directamente a Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, 'cover_photos');

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { coverPhoto: result.secure_url },
      { new: true }
    ).select('username profilePicture coverPhoto');

    if (!updatedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.status(200).json({
      message: 'Foto de portada actualizada con éxito',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Error al actualizar la foto de portada:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

const deleteProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePicture: '' }, // Eliminamos el campo
      { new: true }
    ).select('username profilePicture');

    if (!updatedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.status(200).json({
      message: 'Foto de perfil eliminada',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Error al eliminar la foto de perfil:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};











const updateBio = async (req, res, next) => {
  const { userId } = req.params;
  const { bio } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    user.bio = bio || user.bio;
    await user.save();

    //console.log('Bio actualizada con éxito :)');
    res.status(200).json({ message: 'Bio actualizada correctamente', user });
  } catch (error) {
    //console.error('Error al actualizar la bio :(', error);
    next(error);
  }
};


const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;

    await Post.deleteMany({ user: userId });

    await Comment.deleteMany({ user: userId });

    await User.updateMany(
      { $or: [{ friends: userId }, { followers: userId }, { following: userId }] },
      {
        $pull: {
          friends: userId,
          followers: userId,
          following: userId,
        },
      }
    );

    await User.findByIdAndDelete(userId);

    res.status(200).json({ message: 'Cuenta eliminada con éxito' });
  } catch (error) {
    //console.error('Error al eliminar la cuenta:', error);
    res.status(500).json({ message: 'Error al eliminar la cuenta' });
  }
};

const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Contraseña actual incorrecta' });

    if (newPassword.length < 8) return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 8 caracteres' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ message: 'Error al actualizar la contraseña' });
  }
};

const updateEmail = async (req, res) => {
  try {
    const { email } = req.body;
    const userId = req.user._id;

    if (!email) return res.status(400).json({ message: 'Email requerido' });

    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser._id.toString() !== userId.toString()) {
      return res.status(400).json({ message: 'El email ya está en uso' });
    }

    const user = await User.findByIdAndUpdate(userId, { email }, { new: true });
    res.json({ message: 'Email actualizado correctamente', user });
  } catch (error) {
    console.error('Error updating email:', error);
    res.status(500).json({ message: 'Error al actualizar el email' });
  }
};

const updatePrivacySettings = async (req, res) => {
  try {
    const { profileVisibility, messagePrivacy } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    if (profileVisibility) user.privacySettings.profileVisibility = profileVisibility;
    if (messagePrivacy) user.privacySettings.messagePrivacy = messagePrivacy;

    await user.save();
    res.json({ message: 'Configuración de privacidad actualizada', privacySettings: user.privacySettings });
  } catch (error) {
    console.error('Error updating privacy settings:', error);
    res.status(500).json({ message: 'Error al actualizar privacidad' });
  }
};

const updateStorySettings = async (req, res) => {
  try {
    const { defaultDuration, saveToArchive } = req.body;
    const allowed = [1, 3, 6, 12, 24, 72];
    const updateData = {};

    if (defaultDuration !== undefined) {
      if (!allowed.includes(Number(defaultDuration))) {
        return res.status(400).json({ message: 'Duración no permitida' });
      }
      updateData['storySettings.defaultDuration'] = defaultDuration;
    }

    if (saveToArchive !== undefined) {
      updateData['storySettings.saveToArchive'] = saveToArchive;
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true }
    );

    res.json({ message: 'Configuración de historias actualizada', storySettings: user.storySettings });
  } catch (error) {
    console.error('Error updating story settings:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

const updateSosSettings = async (req, res) => {
  try {
    const { isEnabled, message, emergencyContacts } = req.body;

    // Limit contacts to 5
    const contacts = (emergencyContacts || []).slice(0, 5);

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        'sosSettings.isEnabled': isEnabled,
        'sosSettings.message': message,
        'sosSettings.emergencyContacts': contacts
      },
      { new: true }
    );

    res.json({ message: 'Configuración SOS actualizada', sosSettings: user.sosSettings });
  } catch (error) {
    console.error('Error updating SOS settings:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

const toggleSavePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: 'ID de publicación inválido' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const isSaved = user.savedPosts.includes(postId);

    if (isSaved) {
      user.savedPosts = user.savedPosts.filter((id) => id.toString() !== postId);
    } else {
      user.savedPosts.push(postId);
    }

    await user.save();
    res.json({ message: isSaved ? 'Publicación eliminada de guardados' : 'Publicación guardada', isSaved: !isSaved });
  } catch (error) {
    console.error('Error in toggleSavePost:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

const getSavedPosts = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).populate({
      path: 'savedPosts',
      populate: [
        { path: 'user', select: 'username profilePicture' },
        { path: 'comments', populate: { path: 'user', select: 'username profilePicture' } }
      ]
    });

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json(user.savedPosts);
  } catch (error) {
    console.error('Error in getSavedPosts:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

const updateFcmToken = async (req, res) => {
  const { fcmToken } = req.body;
  const userId = req.user._id;
  try {
    await User.findByIdAndUpdate(userId, { fcmToken });
    res.status(200).json({ message: 'Token FCM actualizado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar token' });
  }
};

module.exports = {
  getUserProfile,
  getUsers,
  searchUsers,
  getUserDetails,
  getUserProfileId,
  getFullUserData,
  updateProfilePicture,
  updateCoverPhoto,
  deleteProfilePicture,
  updateBio,
  deleteAccount,
  updatePassword,
  updateEmail,
  updatePrivacySettings,
  updateStorySettings,
  updateSosSettings,
  toggleSavePost,
  getSavedPosts,
  updateFcmToken,
};