const AppSetting = require('../models/AppSetting');

const getPublicSettings = async (req, res) => {
    try {
        const settings = await AppSetting.find({
            key: { $in: ['adsEnabled', 'welcomeMessage'] }
        });

        const settingsMap = {};
        settings.forEach(s => {
            settingsMap[s.key] = s.value;
        });

        res.json(settingsMap);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = { getPublicSettings };
