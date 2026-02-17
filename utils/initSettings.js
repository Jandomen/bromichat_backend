const User = require('../models/User');
const AppSetting = require('../models/AppSetting');
const bcrypt = require('bcrypt');

const initSettings = async () => {
    try {
        // 1. Ensure default settings exist
        const defaultSettings = [
            { key: 'strictEmailVerification', value: true, description: 'Si es true, obliga a verificar correo para entrar.' },
            { key: 'adminEmail', value: 'admin@bromichat.com', description: 'Correo del administrador principal.' },
            { key: 'adsEnabled', value: false, description: 'Si es true, se muestran anuncios comerciales en el banner premium.' },
            { key: 'welcomeMessage', value: '¡Bienvenido a BromiChat Enterprise!', description: 'Mensaje de bienvenida para nuevos usuarios.' }
        ];

        for (const s of defaultSettings) {
            const exists = await AppSetting.findOne({ key: s.key });
            if (!exists) {
                await AppSetting.create(s);
                console.log(`Setting created: ${s.key}`);
            }
        }

        // 2. Ensure admin user exists
        let adminUser = await User.findOne({ email: 'admin@bromichat.com' });
        if (!adminUser) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            adminUser = new User({
                username: 'admin',
                name: 'Admin',
                lastName: 'BromiChat',
                email: 'admin@bromichat.com',
                password: hashedPassword,
                phone: '0000000000',
                birthdate: new Date('1990-01-01'),
                role: 'admin',
                isVerified: true
            });
            await adminUser.save();
            console.log('Admin user created (admin@bromichat.com / admin123)');
        } else if (adminUser.role !== 'admin') {
            adminUser.role = 'admin';
            await adminUser.save();
            console.log('User promoted to admin (admin@bromichat.com)');
        }
    } catch (error) {
        console.error('Initialization error:', error);
    }
};

module.exports = initSettings;
