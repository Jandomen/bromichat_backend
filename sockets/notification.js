const onlineUsers = new Map();
let ioInstance;

module.exports = (socketIO) => {
  ioInstance = socketIO;

  ioInstance.on('connection', (socket) => {
    console.log('🔌 Cliente conectado a notificaciones:', socket.id);

    socket.on('join', (userId) => {
      socket.join(userId); // cada usuario tiene su sala personal
      onlineUsers.set(userId, socket.id);
      console.log(`👤 Usuario ${userId} se unió a la sala de notificaciones`);
    });

    socket.on('disconnect', () => {
      for (const [userId, sockId] of onlineUsers.entries()) {
        if (sockId === socket.id) {
          onlineUsers.delete(userId);
          console.log(`❌ Usuario ${userId} desconectado`);
          break;
        }
      }
    });
  });

  return ioInstance;
};

module.exports.onlineUsers = onlineUsers;
module.exports.io = ioInstance;
