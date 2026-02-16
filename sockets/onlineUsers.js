const onlineUsersMap = new Map();

module.exports = {
    add: (userId, socketId) => {
        if (!onlineUsersMap.has(userId)) {
            onlineUsersMap.set(userId, new Set());
        }
        onlineUsersMap.get(userId).add(socketId);
    },
    remove: (userId, socketId) => {
        if (onlineUsersMap.has(userId)) {
            const socketSet = onlineUsersMap.get(userId);
            socketSet.delete(socketId);
            if (socketSet.size === 0) {
                onlineUsersMap.delete(userId);
                return true; // Was the last socket, user is now offline
            }
        }
        return false;
    },
    has: (userId) => onlineUsersMap.has(userId),
    getSocketIds: (userId) => {
        if (onlineUsersMap.has(userId)) {
            return Array.from(onlineUsersMap.get(userId));
        }
        return [];
    },
    getAllOnlineUserIds: () => Array.from(onlineUsersMap.keys()),
};