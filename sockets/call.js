const onlineUsers = require('./onlineUsers');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

// Estados globales para persistir entre sockets
const groupCallSessions = new Map(); // groupId -> Set(userIds)
const groupCallMetadata = new Map(); // groupId -> { startTime, type }
const activeP2PCalls = new Map(); // socket.id -> { to, from, conversationId, startTime, type }

const saveCallHistory = async (data) => {
    try {
        const { conversationId, senderId, recipientId, chatType, status, duration, startTime, endTime } = data;
        const message = new Message({
            conversationId,
            senderId,
            recipientId: chatType === 'private' ? recipientId : undefined,
            chatType,
            messageType: 'call',
            callDetails: {
                status,
                duration,
                startTime: startTime || new Date(),
                endTime: endTime || new Date()
            }
        });
        await message.save();

        const populatedMessage = await Message.findById(message._id)
            .populate('senderId', 'username profilePicture')
            .lean();

        return {
            conversationId: conversationId.toString(),
            message: populatedMessage
        };
    } catch (err) {
        console.error("Error saving call history:", err);
        return null;
    }
};

const setupCallSocket = (io) => {
    io.on('connection', (socket) => {
        // Escuchar cuando un usuario inicia una llamada (P2P)
        socket.on('call-user', ({ userToCall, signalData, from, name, avatar, callType, conversationId }) => {
            const targetSocketIds = onlineUsers.getSocketIds(userToCall.toString());

            // Rastrear la llamada para limpieza en desconexión
            activeP2PCalls.set(socket.id, {
                to: userToCall,
                from,
                type: 'calling',
                startTime: new Date(),
                chatType: 'private',
                conversationId,
                callType: callType || 'video'
            });

            targetSocketIds.forEach((targetSocketId) => {
                activeP2PCalls.set(targetSocketId, {
                    to: from,
                    from: userToCall,
                    type: 'receiving',
                    startTime: new Date(),
                    chatType: 'private',
                    conversationId,
                    callType: callType || 'video'
                });

                io.to(targetSocketId).emit('incoming-call', {
                    signal: signalData,
                    from,
                    name,
                    avatar,
                    callType: callType || "video"
                });
            });
        });

        // Escuchar cuando un usuario acepta la llamada
        socket.on('answer-call', async ({ to, signal }) => {
            const targetSocketIds = onlineUsers.getSocketIds(to.toString());

            const callInfo = activeP2PCalls.get(socket.id);
            if (callInfo) {
                callInfo.startTime = new Date(); // Reiniciar al momento de contestar
                callInfo.type = 'active';
            }

            targetSocketIds.forEach((targetSocketId) => {
                const targetCallInfo = activeP2PCalls.get(targetSocketId);
                if (targetCallInfo) {
                    targetCallInfo.startTime = new Date();
                    targetCallInfo.type = 'active';
                }
                io.to(targetSocketId).emit('call-accepted', signal);
            });
        });

        // Evento para señalización continua (Trickle ICE) en P2P
        socket.on('p2p-signal', ({ to, signal }) => {
            const targetSocketIds = onlineUsers.getSocketIds(to.toString());
            targetSocketIds.forEach((targetSocketId) => {
                io.to(targetSocketId).emit('p2p-signal-receive', {
                    signal,
                    from: socket.userId || "unknown"
                });
            });
        });

        // Escuchar cuando un usuario rechaza la llamada
        socket.on('decline-call', async ({ to }) => {
            const targetSocketIds = onlineUsers.getSocketIds(to.toString());
            const callInfo = activeP2PCalls.get(socket.id);

            if (callInfo && callInfo.conversationId) {
                const result = await saveCallHistory({
                    conversationId: callInfo.conversationId,
                    senderId: callInfo.from,
                    recipientId: callInfo.to,
                    chatType: 'private',
                    status: 'rejected',
                    duration: 0,
                    startTime: callInfo.startTime,
                    endTime: new Date()
                });
                if (result) io.to(callInfo.conversationId).emit('conversation_message', result);
            }

            activeP2PCalls.delete(socket.id);
            targetSocketIds.forEach((targetSocketId) => {
                activeP2PCalls.delete(targetSocketId);
                io.to(targetSocketId).emit('call-declined');
            });
        });

        // Escuchar cuando el emisor cancela la llamada antes de que contesten
        socket.on('cancel-call', async ({ to, groupId, participants }) => {
            const callInfo = activeP2PCalls.get(socket.id);

            if (callInfo && callInfo.conversationId && !groupId) {
                const result = await saveCallHistory({
                    conversationId: callInfo.conversationId,
                    senderId: callInfo.from,
                    recipientId: callInfo.to,
                    chatType: 'private',
                    status: 'missed',
                    duration: 0,
                    startTime: callInfo.startTime,
                    endTime: new Date()
                });
                if (result) io.to(callInfo.conversationId).emit('conversation_message', result);
            }

            activeP2PCalls.delete(socket.id);
            if (to) {
                const targetSocketIds = onlineUsers.getSocketIds(to.toString());
                targetSocketIds.forEach((targetSocketId) => {
                    activeP2PCalls.delete(targetSocketId);
                    io.to(targetSocketId).emit('call-canceled');
                });
            }
        });

        // Escuchar cuando alguien cuelga
        socket.on('end-call', async ({ to, groupId, participants }) => {
            const callInfo = activeP2PCalls.get(socket.id);

            if (callInfo && callInfo.conversationId && !groupId) {
                const duration = Math.floor((new Date() - callInfo.startTime) / 1000);
                const result = await saveCallHistory({
                    conversationId: callInfo.conversationId,
                    senderId: callInfo.from,
                    recipientId: callInfo.to,
                    chatType: 'private',
                    status: 'completed',
                    duration: duration > 0 ? duration : 0,
                    startTime: callInfo.startTime,
                    endTime: new Date()
                });
                if (result) io.to(callInfo.conversationId).emit('conversation_message', result);
            }

            activeP2PCalls.delete(socket.id);
            if (to) {
                const targetSocketIds = onlineUsers.getSocketIds(to.toString());
                targetSocketIds.forEach((targetSocketId) => {
                    activeP2PCalls.delete(targetSocketId);
                    io.to(targetSocketId).emit('call-ended');
                });
            }
        });

        // --- Llamadas Grupales ---
        socket.on('group-call-init', ({ groupId, from, name, avatar, participants }) => {
            if (!groupCallSessions.has(groupId)) {
                groupCallSessions.set(groupId, new Set());
                groupCallMetadata.set(groupId, { startTime: new Date(), initiator: from });
            }

            groupCallSessions.get(groupId).add(from.toString());
            socket.join(`group:${groupId}`);

            if (participants && Array.isArray(participants)) {
                participants.forEach(memberId => {
                    if (memberId.toString() === from.toString()) return;
                    const targetSocketIds = onlineUsers.getSocketIds(memberId.toString());
                    targetSocketIds.forEach((targetSocketId) => {
                        io.to(targetSocketId).emit('incoming-group-call', {
                            groupId,
                            from,
                            name,
                            avatar
                        });
                    });
                });
            }
            io.emit('group-call-active', { groupId });
        });

        socket.on('join-group-call', ({ groupId, userId }) => {
            if (!groupCallSessions.has(groupId)) {
                groupCallSessions.set(groupId, new Set());
                groupCallMetadata.set(groupId, { startTime: new Date(), initiator: userId });
            }

            const existingParticipants = Array.from(groupCallSessions.get(groupId));
            groupCallSessions.get(groupId).add(userId.toString());

            socket.to(`group:${groupId}`).emit('participant-joined', {
                userId,
                count: groupCallSessions.get(groupId).size
            });
            socket.join(`group:${groupId}`);

            socket.emit('current-participants', { participants: existingParticipants });
            io.emit('group-call-active', { groupId });
        });

        socket.on('request-group-admission', ({ groupId, from, name, avatar }) => {
            const participants = groupCallSessions.get(groupId);
            if (participants && participants.size > 0) {
                io.to(`group:${groupId}`).emit('admission-request', {
                    groupId,
                    from,
                    name,
                    avatar
                });
            } else {
                socket.emit('admission-accepted', { groupId });
            }
        });

        socket.on('accept-admission', ({ groupId, requesterId }) => {
            const targetSocketIds = onlineUsers.getSocketIds(requesterId.toString());
            targetSocketIds.forEach((targetSocketId) => {
                io.to(targetSocketId).emit('admission-accepted', { groupId });
            });
        });

        socket.on('reject-admission', ({ groupId, requesterId }) => {
            const targetSocketIds = onlineUsers.getSocketIds(requesterId.toString());
            targetSocketIds.forEach((targetSocketId) => {
                io.to(targetSocketId).emit('admission-rejected', { groupId });
            });
        });

        socket.on('group-signal', ({ signal, to, from, groupId, name, avatar }) => {
            const targetSocketIds = onlineUsers.getSocketIds(to.toString());
            targetSocketIds.forEach((targetSocketId) => {
                io.to(targetSocketId).emit('group-signal-receive', {
                    signal,
                    from,
                    groupId,
                    name,
                    avatar
                });
            });
        });

        socket.on('screen-sharing-status', ({ groupId, to, isSharing }) => {
            const userId = socket.userId || Array.from(onlineUsers.has(socket.userId) ? onlineUsers.getSocketIds(socket.userId) : []);
            if (groupId) {
                socket.to(`group:${groupId}`).emit('remote-screen-sharing', {
                    userId: userId,
                    isSharing
                });
            } else if (to) {
                const targetSocketIds = onlineUsers.getSocketIds(to.toString());
                targetSocketIds.forEach((targetSocketId) => {
                    io.to(targetSocketId).emit('remote-screen-sharing', {
                        userId: userId,
                        isSharing
                    });
                });
            }
        });

        socket.on('leave-group-call', async ({ groupId, userId }) => {
            if (groupCallSessions.has(groupId)) {
                groupCallSessions.get(groupId).delete(userId.toString());
                const count = groupCallSessions.get(groupId).size;

                socket.to(`group:${groupId}`).emit('participant-left', {
                    userId,
                    count
                });
                socket.leave(`group:${groupId}`);

                if (count === 0) {
                    const metadata = groupCallMetadata.get(groupId);
                    if (metadata) {
                        const duration = Math.floor((new Date() - metadata.startTime) / 1000);
                        const result = await saveCallHistory({
                            conversationId: groupId,
                            senderId: metadata.initiator,
                            chatType: 'group',
                            status: 'completed',
                            duration: duration > 0 ? duration : 0,
                            startTime: metadata.startTime,
                            endTime: new Date()
                        });
                        if (result) io.to(`group:${groupId}`).emit('newGroupMessage', result);
                    }
                    groupCallSessions.delete(groupId);
                    groupCallMetadata.delete(groupId);
                    io.emit('group-call-ended', { groupId });
                }
            }
        });

        socket.on('disconnect', () => {
            // Limpieza P2P
            const p2pInfo = activeP2PCalls.get(socket.id);
            if (p2pInfo) {
                const targetSocketIds = onlineUsers.getSocketIds(p2pInfo.to.toString());
                targetSocketIds.forEach((targetSocketId) => {
                    io.to(targetSocketId).emit(p2pInfo.type === 'calling' ? 'call-canceled' : 'call-declined');
                    activeP2PCalls.delete(targetSocketId);
                });
                activeP2PCalls.delete(socket.id);
            }

            // Limpieza Grupal
            groupCallSessions.forEach(async (users, groupId) => {
                if (users.has(socket.userId)) {
                    users.delete(socket.userId);
                    const count = users.size;
                    io.to(`group:${groupId}`).emit('participant-left', {
                        userId: socket.userId,
                        count
                    });
                    if (count === 0) {
                        const metadata = groupCallMetadata.get(groupId);
                        if (metadata) {
                            const duration = Math.floor((new Date() - metadata.startTime) / 1000);
                            const result = await saveCallHistory({
                                conversationId: groupId,
                                senderId: metadata.initiator,
                                chatType: 'group',
                                status: 'completed',
                                duration,
                                startTime: metadata.startTime,
                                endTime: new Date()
                            });
                            if (result) io.to(`group:${groupId}`).emit('newGroupMessage', result);
                        }
                        groupCallSessions.delete(groupId);
                        groupCallMetadata.delete(groupId);
                        io.emit('group-call-ended', { groupId });
                    }
                }
            });
        });
    });
};

module.exports = setupCallSocket;
