const admin = require('../config/firebase');

/**
 * Envía una notificación push a un usuario específico
 * @param {string} fcmToken - El token de Firebase del dispositivo del usuario
 * @param {Object} payload - Los datos de la notificación
 */
const sendPushNotification = async (fcmToken, { title, body, data = {} }) => {
    if (!admin.apps.length || !fcmToken) {
        return;
    }

    const message = {
        notification: {
            title: title,
            body: body,
        },
        data: data, // Datos adicionales (ej: roomId, senderId)
        token: fcmToken,
        android: {
            priority: 'high',
            notification: {
                sound: 'default',
                channelId: 'bromichat_general',
                clickAction: 'FLUTTER_NOTIFICATION_CLICK', // Necesario para algunas configuraciones
            }
        }
    };

    try {
        const response = await admin.messaging().send(message);
        console.log('✅ Notificación push enviada:', response);
        return response;
    } catch (error) {
        console.error('❌ Error enviando push:', error);
    }
};

module.exports = { sendPushNotification };
