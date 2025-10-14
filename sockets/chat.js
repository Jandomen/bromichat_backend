// backend/sockets/chat.js
const onlineUsers = require('./onlineUsers');

const setupChatSocket = (io) => {
  io.on('connection', (socket) => {
    const userId = socket.handshake.query?.userId || socket.handshake.auth?.userId;
    if (!userId) {
    //  console.error('⚠️ Conexión rechazada: userId no proporcionado');
      socket.disconnect(true);
      return;
    }

    socket.userId = userId.toString();
    onlineUsers.set(socket.userId, socket.id);
  //  console.log(`🟢 Usuario conectado: ${socket.userId} -> ${socket.id}`);

    socket.on('join_conversation', ({ conversationId, userId: payloadUserId }) => {
      if (!conversationId) {
      //  console.warn('join_conversation: conversationId missing');
        return;
      }
      const roomId = `conversation:${conversationId}`;
      socket.join(roomId);
      socket.currentRoom = roomId;
    //  console.log(`🟡 Usuario ${payloadUserId || socket.userId} se unió a ${roomId}`);
    });

    socket.on('join_group', ({ groupId }) => {
      if (!groupId) {
      //  console.warn('join_group: groupId missing');
        return;
      }
      const roomId = `group:${groupId}`;
      if (socket.currentRoom) {
        socket.leave(socket.currentRoom);
      //  console.log(`🟠 Usuario ${socket.userId} salió de ${socket.currentRoom}`);
      }
      socket.join(roomId);
      socket.currentRoom = roomId;
    //  console.log(`🟡 Usuario ${socket.userId} se unió a ${roomId}`);
    });

    socket.on('leave_group', ({ groupId }) => {
      const roomId = `group:${groupId}`;
      socket.leave(roomId);
      if (socket.currentRoom === roomId) socket.currentRoom = null;
    //  console.log(`🟠 Usuario ${socket.userId} salió de ${roomId}`);
    });

    socket.on('leave_conversation', ({ conversationId }) => {
      const roomId = `conversation:${conversationId}`;
      socket.leave(roomId);
      if (socket.currentRoom === roomId) socket.currentRoom = null;
    //  console.log(`🟠 Usuario ${socket.userId} salió de ${roomId}`);
    });

    socket.on('disconnect', () => {
    //  console.log(`🔴 Usuario desconectado: ${socket.userId}`);
      onlineUsers.delete(socket.userId);
      if (socket.currentRoom) {
        socket.leave(socket.currentRoom);
      //  console.log(`🟠 Usuario ${socket.userId} salió de ${socket.currentRoom}`);
      }
    });
  });
};

module.exports = setupChatSocket;