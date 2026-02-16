// backend/sockets/chat.js
const onlineUsers = require('./onlineUsers');

const setupChatSocket = (io) => {
  io.on('connection', (socket) => {
    const userId = socket.handshake.query?.userId || socket.handshake.auth?.userId;
    if (!userId) {
      // console.warn('⚠️ Conexión de socket sin userId detectada');
      return;
    }

    const uId = userId.toString();
    socket.userId = uId;

    // Check if this is the first connection for this user
    const isFirstConnection = !onlineUsers.has(uId);
    onlineUsers.add(uId, socket.id);
    socket.join(uId);

    if (isFirstConnection) {
      io.emit('userStatusChanged', { userId: uId, status: 'online' });
      // console.log(`🟢 Usuario ${uId} se ha conectado (Primer dispositivo)`);
    }

    socket.on('getInitialOnlineUsers', () => {
      socket.emit('initialOnlineUsers', onlineUsers.getAllOnlineUserIds());
    });

    socket.on('join_conversation', ({ conversationId, userId: payloadUserId }) => {
      if (!conversationId) return;
      const roomId = `conversation:${conversationId}`;
      socket.join(roomId);
      socket.currentRoom = roomId;
    });

    socket.on('join_group', ({ groupId }) => {
      if (!groupId) return;
      const roomId = `group:${groupId}`;
      if (socket.currentRoom) {
        socket.leave(socket.currentRoom);
      }
      socket.join(roomId);
      socket.currentRoom = roomId;
    });

    socket.on('disconnect', () => {
      if (socket.userId) {
        const wasLastSocket = onlineUsers.remove(socket.userId, socket.id);
        if (wasLastSocket) {
          io.emit('userStatusChanged', { userId: socket.userId, status: 'offline' });
          // console.log(`🔴 Usuario ${socket.userId} se ha desconectado (Todos los dispositivos)`);
        }
      }
      if (socket.currentRoom) {
        socket.leave(socket.currentRoom);
      }
    });
  });
};

module.exports = setupChatSocket;