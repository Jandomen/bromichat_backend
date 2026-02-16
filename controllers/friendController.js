const User = require('../models/User');
const Gallery = require('../models/Gallery');
const { createNotification } = require('../config/notificationService');
const onlineUsers = require('../sockets/onlineUsers');

const addFriend = async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = req.params.id;
    const io = req.app.get('io');

    if (userId === friendId) {
      return res.status(400).json({ message: 'No puedes agregarte como amigo' });
    }

    const [user, friend] = await Promise.all([
      User.findById(userId),
      User.findById(friendId),
    ]);

    if (!user || !friend) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (user.friends.includes(friendId)) {
      return res.status(400).json({ message: 'Ya son amigos' });
    }

    await Promise.all([
      User.findByIdAndUpdate(userId, { $addToSet: { friends: friendId } }),
      User.findByIdAndUpdate(friendId, { $addToSet: { friends: userId } }),
    ]);

    await createNotification({
      recipientId: friendId,
      senderId: userId,
      type: 'friend_request',
      message: `${user.username} te ha agregado como amig@`,
      link: `/user/${userId}`,
      io,
    });

    const [updatedUser, updatedFriend] = await Promise.all([
      User.findById(userId)
        .populate('friends followers following blockedUsers', '_id username name lastName profilePicture')
        .select('name lastName username email phone birthdate profilePicture bio friends followers following blockedUsers createdAt'),
      User.findById(friendId)
        .populate('friends', '_id username name lastName profilePicture')
        .select('friends'),
    ]);

    io.to(userId).emit('friendAdded', {
      friendId,
      friends: updatedUser.friends,
      isFriend: true,
    });

    io.to(friendId).emit('friendAdded', {
      friendId: userId,
      friends: updatedFriend.friends,
      isFriend: true,
    });

    res.status(200).json({
      message: 'Amigo agregado',
      user: {
        ...updatedUser.toObject(),
        isFriend: true,
        isFollowing: updatedUser.following.some(f => f._id.toString() === friendId),
        isBlocked: updatedUser.blockedUsers.some(b => b._id.toString() === friendId),
      },
    });
  } catch (error) {
    // console.error('Error al agregar amigo:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};



const removeFriend = async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = req.params.id;
    const io = req.app.get('io');

    if (userId === friendId) {
      return res.status(400).json({ message: 'No puedes eliminarte como amigo' });
    }

    const [user, friend] = await Promise.all([
      User.findById(userId),
      User.findById(friendId),
    ]);

    if (!user || !friend) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (!user.friends.includes(friendId)) {
      return res.status(400).json({ message: 'No son amigos' });
    }

    await Promise.all([
      User.findByIdAndUpdate(userId, { $pull: { friends: friendId } }),
      User.findByIdAndUpdate(friendId, { $pull: { friends: userId } }),
    ]);

    const [updatedUser, updatedFriend] = await Promise.all([
      User.findById(userId)
        .populate('friends followers following blockedUsers', '_id username name lastName profilePicture')
        .select('name lastName username email phone birthdate profilePicture bio friends followers following blockedUsers createdAt'),
      User.findById(friendId)
        .populate('friends', '_id username name lastName profilePicture')
        .select('friends'),
    ]);

    io.to(userId).emit('friendRemoved', {
      friendId,
      friends: updatedUser.friends,
      isFriend: false,
    });
    io.to(friendId).emit('friendRemoved', {
      friendId: userId,
      friends: updatedFriend.friends,
      isFriend: false,
    });

    // console.log('Amigo eliminado');
    res.status(200).json({
      message: 'Amigo eliminado',
      user: {
        ...updatedUser.toObject(),
        isFriend: false,
        isFollowing: updatedUser.following.some(f => f._id.toString() === friendId),
        isBlocked: updatedUser.blockedUsers.some(b => b._id.toString() === friendId),
      },
    });
  } catch (error) {
    //console.error('Error al eliminar amigo:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

const followUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const targetId = req.params.id;
    const io = req.app.get('io');

    if (userId === targetId) {
      return res.status(400).json({ message: 'No puedes seguirte a ti mismo' });
    }

    const [user, targetUser] = await Promise.all([
      User.findById(userId),
      User.findById(targetId),
    ]);

    if (!user || !targetUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (user.following.includes(targetId)) {
      return res.status(400).json({ message: 'Ya sigues a este usuario' });
    }


    await Promise.all([
      User.findByIdAndUpdate(userId, { $addToSet: { following: targetId } }),
      User.findByIdAndUpdate(targetId, { $addToSet: { followers: userId } }),
    ]);

    await createNotification({
      recipientId: targetId,
      senderId: userId,
      message: `${user.username} ha comenzado a seguirte`,
      type: 'new_follower',
      link: `/user/${userId}`,
      io,
    });

    const [updatedUser, updatedTargetUser] = await Promise.all([
      User.findById(userId)
        .populate('friends followers following blockedUsers', '_id username profilePicture')
        .select('name username friends followers following blockedUsers'),
      User.findById(targetId)
        .populate('followers', '_id username profilePicture')
        .select('followers'),
    ]);

    io.to(userId).emit('followed', {
      targetId,
      following: updatedUser.following,
      isFollowing: true,
    });
    io.to(targetId).emit('newFollower', {
      followerId: userId,
      followers: updatedTargetUser.followers,
    });

    res.status(200).json({
      message: 'Usuario seguido',
      user: {
        ...updatedUser.toObject(),
        isFriend: updatedUser.friends.some(f => f._id.toString() === targetId),
        isFollowing: true,
        isBlocked: updatedUser.blockedUsers.some(b => b._id.toString() === targetId),
      },
      targetUser: updatedTargetUser,
    });
  } catch (error) {
    // console.error('Error al seguir usuario:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};


const unfollowUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const targetId = req.params.id;
    const io = req.app.get('io');

    if (userId === targetId) {
      return res.status(400).json({ message: 'No puedes dejar de seguirte a ti mismo' });
    }

    const [user, targetUser] = await Promise.all([
      User.findById(userId),
      User.findById(targetId),
    ]);

    if (!user || !targetUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (!user.following.includes(targetId)) {
      return res.status(400).json({ message: 'No sigues a este usuario' });
    }

    await Promise.all([
      User.findByIdAndUpdate(userId, { $pull: { following: targetId } }),
      User.findByIdAndUpdate(targetId, { $pull: { followers: userId } }),
    ]);

    const [updatedUser, updatedTargetUser] = await Promise.all([
      User.findById(userId)
        .populate('friends followers following blockedUsers', '_id username name lastName profilePicture')
        .select('name lastName username email phone birthdate profilePicture bio friends followers following blockedUsers createdAt'),
      User.findById(targetId)
        .populate('followers', '_id username name lastName profilePicture')
        .select('followers'),
    ]);

    io.to(userId).emit('unfollowed', {
      targetId,
      following: updatedUser.following,
      isFollowing: false,
    });
    io.to(targetId).emit('followerRemoved', {
      followerId: userId,
      followers: updatedTargetUser.followers,
    });

    // console.log('Usuario dejado de seguir');
    res.status(200).json({
      message: 'Usuario dejado de seguir',
      user: {
        ...updatedUser.toObject(),
        isFriend: updatedUser.friends.some(f => f._id.toString() === targetId),
        isFollowing: false,
        isBlocked: updatedUser.blockedUsers.some(b => b._id.toString() === targetId),
      },
      targetUser: updatedTargetUser,
    });
  } catch (error) {
    // console.error('Error al dejar de seguir:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

const blockUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const targetId = req.params.id;
    const io = req.app.get('io');

    if (userId === targetId) {
      //  console.warn('No puedes bloquearte a ti mismo ');
      return res.status(400).json({ message: 'No puedes bloquearte a ti mismo' });
    }

    const [user, targetUser] = await Promise.all([
      User.findById(userId),
      User.findById(targetId),
    ]);

    if (!user || !targetUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (user.blockedUsers.includes(targetId)) {
      return res.status(400).json({ message: 'Usuario ya bloqueado' });
    }

    await Promise.all([
      User.findByIdAndUpdate(userId, {
        $addToSet: { blockedUsers: targetId },
        $pull: { friends: targetId, following: targetId },
      }),
      User.findByIdAndUpdate(targetId, {
        $pull: { friends: userId, followers: userId },
      }),
    ]);

    const [updatedUser, updatedTargetUser] = await Promise.all([
      User.findById(userId)
        .populate('friends followers following blockedUsers', '_id username name lastName profilePicture')
        .select('name lastName username email phone birthdate profilePicture bio friends followers following blockedUsers createdAt'),
      User.findById(targetId)
        .populate('friends followers', '_id username name lastName profilePicture')
        .select('friends followers'),
    ]);

    io.to(userId).emit('userBlocked', {
      targetId,
      blockedUsers: updatedUser.blockedUsers,
      friends: updatedUser.friends,
      following: updatedUser.following,
      isBlocked: true,
      isFriend: false,
      isFollowing: false,
    });
    io.to(targetId).emit('blockedByUser', {
      blockerId: userId,
      friends: updatedTargetUser.friends,
      followers: updatedTargetUser.followers,
    });

    // console.log('Usuario bloqueado correctamente :)');
    res.status(200).json({
      message: 'Usuario bloqueado',
      user: {
        ...updatedUser.toObject(),
        isFriend: false,
        isFollowing: false,
        isBlocked: true,
      },
    });
  } catch (error) {
    // console.error('Error al bloquear usuario:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

const unblockUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const targetId = req.params.id;
    const io = req.app.get('io');

    if (userId === targetId) {
      // console.warn('No puedes desbloquearte a ti mismo :0');
      return res.status(400).json({ message: 'No puedes desbloquearte a ti mismo' });
    }

    const [user, targetUser] = await Promise.all([
      User.findById(userId),
      User.findById(targetId),
    ]);

    if (!user || !targetUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (!user.blockedUsers.includes(targetId)) {
      // console.warn('El usuario no está bloqueado');
      return res.status(400).json({ message: 'Usuario no está bloqueado' });
    }

    await User.findByIdAndUpdate(userId, { $pull: { blockedUsers: targetId } });

    const updatedUser = await User.findById(userId)
      .populate('friends followers following blockedUsers', '_id username name lastName profilePicture')
      .select('name lastName username email phone birthdate profilePicture bio friends followers following blockedUsers createdAt');

    io.to(userId).emit('userUnblocked', {
      targetId,
      blockedUsers: updatedUser.blockedUsers,
      isBlocked: false,
    });
    io.to(targetId).emit('unblockedByUser', {
      blockerId: userId,
    });

    // console.log('Usuario desbloqueado exitosamente :)');
    res.status(200).json({
      message: 'Usuario desbloqueado',
      user: {
        ...updatedUser.toObject(),
        isFriend: updatedUser.friends.some(f => f._id.toString() === targetId),
        isFollowing: updatedUser.following.some(f => f._id.toString() === targetId),
        isBlocked: false,
      },
    });
  } catch (error) {
    // console.error('Error al desbloquear usuario:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

const getFriends = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId)
      .populate('friends', '_id username name lastName profilePicture')
      .select('friends');

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // console.log('Amigos obtenidos correctamente :)');
    const friendsWithStatus = user.friends.map(friend => ({
      ...friend.toObject(),
      isOnline: onlineUsers.has(friend._id.toString())
    }));

    res.status(200).json({
      friends: friendsWithStatus,
    });
  } catch (error) {
    // console.error('Error al obtener amigos:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

const getFollowers = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId)
      .populate('followers', '_id username name lastName profilePicture')
      .select('followers');

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // console.log('Seguidores obtenidos correctamente :)');
    const followersWithStatus = user.followers.map(follower => ({
      ...follower.toObject(),
      isOnline: onlineUsers.has(follower._id.toString())
    }));

    res.status(200).json({
      followers: followersWithStatus,
    });
  } catch (error) {
    // console.error('Error al obtener seguidores:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

const getFollowing = async (req, res) => {
  try {
    const userId = req.params.id;


    const user = await User.findById(userId)
      .populate('following', '_id username name lastName profilePicture')
      .select('following');

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // console.log('Usuarios seguidos obtenidos correctamente :)');
    const followingWithStatus = user.following.map(followed => ({
      ...followed.toObject(),
      isOnline: onlineUsers.has(followed._id.toString())
    }));

    res.status(200).json({
      following: followingWithStatus,
    });
  } catch (error) {
    // console.error('Error al obtener seguidos:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

const getBlockedUsers = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId)
      .populate('blockedUsers', '_id username name lastName profilePicture')
      .select('blockedUsers');

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // console.log('Usuarios bloqueados obtenidos :)');
    res.status(200).json({
      blockedUsers: user.blockedUsers,
    });
  } catch (error) {
    // console.error('Error al obtener usuarios bloqueados:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};


const getMyFollowing = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId)
      .populate('following', '_id username name lastName profilePicture')
      .select('following');

    res.status(200).json({ following: user.following });
  } catch (error) {
    // console.error('Error al obtener usuarios que sigo:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};





module.exports = {
  addFriend,
  removeFriend,
  followUser,
  unfollowUser,
  blockUser,
  unblockUser,
  getFriends,
  getFollowers,
  getFollowing,
  getBlockedUsers,
  getMyFollowing,
};