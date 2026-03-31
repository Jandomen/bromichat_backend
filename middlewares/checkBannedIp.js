const BannedIp = require('../models/BannedIp');

const checkBannedIp = async (req, res, next) => {
    try {
        const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (!clientIp) return next();

        const isBanned = await BannedIp.findOne({ ip: clientIp });
        if (isBanned) {
            return res.status(403).json({
                error: 'ACCESO DENEGADO',
                message: 'Tu terminal (IP) ha sido bloqueada permanentemente por violaciones de seguridad críticas.',
                reason: isBanned.reason
            });
        }
        next();
    } catch (error) {
        next();
    }
};

module.exports = checkBannedIp;
