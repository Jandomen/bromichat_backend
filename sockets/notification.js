const onlineUsers = require('./onlineUsers');

module.exports = (io) => {
  io.on('connection', (socket) => {
    // console.log('🔌 Cliente conectado a notificaciones:', socket.id);

    // Get userId from handshake
    const userId = socket.handshake.query?.userId || socket.handshake.auth?.userId;

    if (userId) {
      const uId = userId.toString();
      socket.userId = uId;
      socket.join(uId);

      const isFirstConnection = !onlineUsers.has(uId);
      onlineUsers.add(uId, socket.id);

      if (isFirstConnection) {
        io.emit('userStatusChanged', { userId: uId, status: 'online' });
      }
      // console.log(`👤 Usuario ${uId} unido automáticamente a su sala y marcado como online`);
    }

    socket.on('join', (userId) => {
      if (!userId) return;
      const uId = userId.toString();
      socket.userId = uId;
      socket.join(uId);

      const isFirstConnection = !onlineUsers.has(uId);
      onlineUsers.add(uId, socket.id);

      if (isFirstConnection) {
        io.emit('userStatusChanged', { userId: uId, status: 'online' });
      }
      // console.log(`👤 Usuario ${uId} se unió explícitamente a su sala de notificaciones`);
    });

    socket.on('disconnect', () => {
      // onlineUsers is also cleaned up by chat.js if userId remains as socket.userId
      if (socket.userId) {
        const wasLastSocket = onlineUsers.remove(socket.userId, socket.id);
        if (wasLastSocket) {
          io.emit('userStatusChanged', { userId: socket.userId, status: 'offline' });
        }
      }
      // Fallback cleanup removed as we rely on socket.userId
    });
  });
};
