const onlineUsers = require("./onlineUsers");

const setupChatSocket = (io) => {
  io.on("connection", (socket) => {
    const userId = socket.handshake.query?.userId || socket.handshake.auth?.userId;
    if (!userId) {
     // console.error("⚠️ Conexión rechazada: userId no proporcionado");
      socket.disconnect(true);
      return;
    }

    socket.userId = userId.toString();
    onlineUsers.set(socket.userId, socket.id);
   // console.log("🟢 Usuario conectado:", socket.userId, "->", socket.id);

    socket.on("join_conversation", ({ conversationId, userId: payloadUserId }) => {
      if (!conversationId) return;
      const roomId = `conversation:${conversationId}`;
      socket.join(roomId);
      socket.currentRoom = roomId;
     // console.log(`🟡 Usuario ${payloadUserId || socket.userId} se unió a ${roomId}`);
    });

    socket.on("join_group", ({ groupId }) => {
      if (!groupId) return;
      const roomId = `group:${groupId}`;
      if (socket.currentRoom) {
        socket.leave(socket.currentRoom);
       // console.log(`🟠 Usuario ${socket.userId} salió de ${socket.currentRoom}`);
      }
      socket.join(roomId);
      socket.currentRoom = roomId;
     // console.log(`🟡 Usuario ${socket.userId} se unió a ${roomId}`);
    });

    socket.on("leave_group", ({ groupId }) => {
      const roomId = `group:${groupId}`;
      socket.leave(roomId);
      if (socket.currentRoom === roomId) socket.currentRoom = null;
     // console.log(`🟠 Usuario ${socket.userId} salió de ${roomId}`);
    });

    socket.on("sendGroupMessage", (message) => {
      io.to(`group:${message.groupId}`).emit("newGroupMessage", message);
    });

    socket.on("groupMessageUpdated", (message) => {
      io.to(`group:${message.groupId}`).emit("groupMessageUpdated", message);
    });

    socket.on("groupMessageDeleted", ({ groupId, messageId }) => {
      io.to(`group:${groupId}`).emit("groupMessageDeleted", { groupId, messageId });
    });

    socket.on("groupMemberLeft", ({ groupId, userId, message }) => {
      io.to(`group:${groupId}`).emit("groupMemberLeft", { groupId, userId, message });
    });

    socket.on("groupUpdated", (updatedGroup) => {
      io.to(`group:${updatedGroup._id}`).emit("groupUpdated", updatedGroup);
    });

    socket.on("sendNotification", ({ recipientId, notification }) => {
      if (!recipientId || !notification) return;
      const recipientSocketId = onlineUsers.get(recipientId.toString());
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("newNotification", notification);
       // console.log(`🔔 Notificación enviada a ${recipientId}`);
      } else {
       // console.log(`📭 Usuario ${recipientId} no está en línea, notificación guardada en BD`);
      }
    });

    socket.on("disconnect", () => {
     // console.log("🔴 Usuario desconectado:", socket.userId);
      onlineUsers.delete(socket.userId);
      if (socket.currentRoom) {
        socket.leave(socket.currentRoom);
       // console.log(`🟠 Usuario ${socket.userId} salió de ${socket.currentRoom}`);
      }
    });
  });
};

module.exports = setupChatSocket;
