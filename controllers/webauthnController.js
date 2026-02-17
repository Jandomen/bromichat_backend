const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Configuración dinámica para WebAuthn
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const origin = frontendUrl.replace(/\/$/, ""); // Eliminar barra final si existe
const rpID = new URL(frontendUrl).hostname; // Extraer dominio sin puerto ni protocolo

// --- REGISTRATION ---

const generateRegistrationChallenge = async (req, res) => {
    try {
        const user = req.user;

        const options = await generateRegistrationOptions({
            rpName: 'Bromichat',
            rpID,
            userID: user._id.toString(),
            userName: user.email,
            attestationType: 'none',
            authenticatorSelection: {
                residentKey: 'required',
                userVerification: 'preferred',
            },
        });

        // Store challenge in session or DB to verify later
        // For simplicity with this current architecture, let's use the User model temporarily or a cache
        // But since req.session is available (see package.json), we'll use session if configured
        if (req.session) {
            req.session.currentChallenge = options.challenge;
            req.session.save(); // Force save session
        } else {
            // Fallback or handle differently if sessions aren't persistent
        }

        res.json(options);
    } catch (error) {
        console.error('Registration challenge error:', error);
        res.status(500).json({ error: 'Error generating challenge' });
    }
};

const verifyRegistration = async (req, res) => {
    try {
        const { body } = req;
        const user = req.user;
        const expectedChallenge = req.session?.currentChallenge;

        const verification = await verifyRegistrationResponse({
            response: body,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
        });

        if (verification.verified) {
            const { registrationInfo } = verification;
            const { credentialID, credentialPublicKey, counter } = registrationInfo;

            // Check if credential already exists (compare base64 string)
            const credIDBase64 = Buffer.from(credentialID).toString('base64');
            const existing = user.credentials.find(c => c.credentialID === credIDBase64);
            if (!existing) {
                user.credentials.push({
                    credentialID: credIDBase64,
                    publicKey: Buffer.from(credentialPublicKey).toString('base64'),
                    counter,
                    transports: body.response.transports,
                });
                await user.save();
            }

            res.json({ verified: true });
        } else {
            res.status(400).json({ error: 'Verification failed' });
        }
    } catch (error) {
        console.error('Registration verification error:', error);
        res.status(500).json({ error: 'Error verifying registration' });
    }
};

// --- AUTHENTICATION (LOGIN) ---

const generateLoginChallenge = async (req, res) => {
    try {
        const { email } = req.body;
        let allowCredentials = [];

        if (email) {
            const user = await User.findOne({ email });
            if (user) {
                allowCredentials = user.credentials.map(c => ({
                    id: Buffer.from(c.credentialID, 'base64'),
                    type: 'public-key',
                    transports: c.transports,
                }));
            }
        }

        const options = await generateAuthenticationOptions({
            rpID,
            allowCredentials,
            userVerification: 'preferred',
        });

        req.session.currentChallenge = options.challenge;
        if (email) req.session.loginEmail = email;
        req.session.save(); // Force save session

        res.json(options);
    } catch (error) {
        console.error('Login challenge error:', error);
        res.status(500).json({ error: 'Error generating login challenge' });
    }
};

const verifyLogin = async (req, res) => {
    try {
        const { body } = req;
        const expectedChallenge = req.session?.currentChallenge;

        // The ID from standard WebAuthn JSON is base64url. 
        // We need to match it against our stored base64.
        let idBase64 = body.id.replace(/-/g, '+').replace(/_/g, '/');
        // Add padding if necessary
        while (idBase64.length % 4 !== 0) {
            idBase64 += '=';
        }

        console.log(`WebAuthn Login Debug:`);
        console.log(`- Original ID (base64url): ${body.id}`);
        console.log(`- Converted ID (base64): ${idBase64}`);

        // Find the user by the credential ID
        const user = await User.findOne({
            $or: [
                { 'credentials.credentialID': body.id },
                { 'credentials.credentialID': idBase64 }
            ]
        });

        if (!user) {
            console.log(`WebAuthn Login: Usuario no encontrado para Credential ID: ${body.id} (Converted: ${idBase64})`);
            return res.status(404).json({ error: 'Usuario no encontrado o dispositivo no reconocido' });
        }

        const credential = user.credentials.find(c => c.credentialID === body.id || c.credentialID === idBase64);
        if (!credential) {
            console.log(`WebAuthn Login: Credencial no encontrada en el array del usuario ${user.email}`);
            return res.status(400).json({ error: 'Credencial no encontrada' });
        }

        const verification = await verifyAuthenticationResponse({
            response: body,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            authenticator: {
                credentialID: Buffer.from(credential.credentialID, 'base64'),
                credentialPublicKey: Buffer.from(credential.publicKey, 'base64'),
                counter: credential.counter,
            },
        });

        if (verification.verified) {
            // Update counter
            credential.counter = verification.authenticationInfo.newCounter;
            await user.save();

            // Generate JWT
            const token = jwt.sign({ userId: user._id }, process.env.SECRET_KEY, {
                expiresIn: '24h',
            });

            const userData = {
                _id: user._id,
                username: user.username,
                name: user.name,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                birthdate: user.birthdate,
            };

            // Clear login session
            if (req.session) {
                req.session.currentChallenge = undefined;
                req.session.loginEmail = undefined;
            }

            res.json({ token, user: userData });
        } else {
            res.status(401).json({ error: 'Authentication failed' });
        }
    } catch (error) {
        console.error('Login verification error:', error);
        res.status(500).json({ error: 'Error verifying login' });
    }
};

module.exports = {
    generateRegistrationChallenge,
    verifyRegistration,
    generateLoginChallenge,
    verifyLogin,
};
