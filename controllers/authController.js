const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const User = require('../models/User');
const { sendVerificationEmail, sendResetPasswordEmail } = require('../utils/mailService');
const admin = require('../config/firebase');


const register = async (req, res, next) => {
  const { username, name, lastName, email, password, phone, birthdate } = req.body;

  try {
    if (!username) return res.status(400).json({ error: '!El usuario es requerido...¡ :0 ' });
    if (!name) return res.status(400).json({ error: '!El nombre es requerido...¡ :0 ' });
    if (!lastName) return res.status(400).json({ error: '!El apellido es requerido...¡ :0 ' });
    if (!email) return res.status(400).json({ error: '!El correo electronico es requerido...¡ :0 ' });
    if (!password || password.length < 8) return res.status(400).json({ error: '!La contraseña es requerida y debe tener al menos 8 caracteres...¡ :0 ' });
    if (!phone) return res.status(400).json({ error: '!El telefono es requerido...¡ :0 ' });
    if (!birthdate) return res.status(400).json({ error: '!La fecha de nacimiento es requerida...¡ :0 ' });

    const hashedPassword = await bcrypt.hash(password, 10);

    if (await User.findOne({ email })) return res.status(400).json({ error: 'El correo electrónico ya existe :0' });
    if (await User.findOne({ username })) return res.status(400).json({ error: 'El nombre de usuario ya existe, intente con otro :0' });
    if (await User.findOne({ phone })) return res.status(400).json({ error: 'El numero telefonico ya existe, intente con otro :0' });

    const birthdateObj = new Date(birthdate + 'T00:00:00');

    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = new User({
      username,
      name,
      lastName,
      email,
      password: hashedPassword,
      phone,
      birthdate: birthdateObj,
      verificationToken,
      isVerified: false // Ahora empezamos como no verificado
    });

    // Intentar crear usuario en Firebase
    if (admin.apps.length > 0) {
      try {
        const firebaseUser = await admin.auth().createUser({
          email: email,
          password: password,
          displayName: `${name} ${lastName}`,
        });
        user.firebaseUid = firebaseUser.uid;

        // Enviar email de verificación de Firebase
        // Nota: Admin SDK no envía el correo directamente, genera el link o usamos SendGrid/etc.
        // Pero para simplificar, usaremos el link de verificación de Firebase
        const actionCodeSettings = {
          url: 'http://localhost:3000/login', // URL a la que vuelve el usuario
        };
        // Para enviar el correo oficial de Firebase, usualmente se hace desde el CLIENTE
        // pero desde ADMIN podemos enviarlo si configuramos un transportador de correos.
        // Aquí activaremos la lógica de verificación posterior.
      } catch (fbError) {
        console.error('Error al crear usuario en Firebase:', fbError);
      }
    }

    await user.save();

    // Enviar email de verificación
    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (mailError) {
      console.error('Error sending verification email:', mailError);
    }

    const userData = {
      _id: user._id,
      username: user.username,
      name: user.name,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      birthdate: user.birthdate,
    };

    res.status(201).json({
      message: '¡Registro exitoso! Ya puedes iniciar sesión con tu cuenta.',
      user: userData
    });
  } catch (error) {
    next(error);
  }
};





const login = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    if (!email) {
      //console.log('Debes ingresar el correo electrónico :0');
      return res.status(400).json({ error: 'Debes ingresar el correo electrónico :0' });
    }

    if (!password) {
      //console.log('Debes ingresar la contraseña :0');
      return res.status(400).json({ error: 'Debes ingresar la contraseña :0' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'El correo electrónico no se encuentra :0' });
    }

    // Verificar si el correo está verificado en Firebase (si Firebase está habilitado)
    if (admin.apps.length > 0 && user.firebaseUid) {
      try {
        const fbUser = await admin.auth().getUser(user.firebaseUid);
        if (!fbUser.emailVerified) {
          return res.status(401).json({
            message: 'Por favor verifica tu correo electrónico para iniciar sesión.',
            notVerified: true
          });
        }
        // Sincronizar estado en nuestra DB
        if (!user.isVerified) {
          user.isVerified = true;
          await user.save();
        }
      } catch (fbError) {
        console.error('Error verificando estado en Firebase:', fbError);
      }
    } else if (!user.isVerified) {
      // Fallback si no hay Firebase
      return res.status(401).json({ message: 'Por favor verifica tu correo electrónico para iniciar sesión.' });
    }

    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      console.log(`Intento de login fallido: Contraseña incorrecta para ${email}`);
      return res.status(401).json({ message: 'Contraseña incorrecta :(' });
    }

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
      storySettings: user.storySettings,
      sosSettings: user.sosSettings,
      savedPosts: user.savedPosts,
    };

    //console.log('Su token: ' + token);
    //console.log('Usuario logueado:', userData);

    res.json({ token, user: userData });

  } catch (error) {
    //console.log('Error al iniciar sesión :0');
    next(error);
  }
};


const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los datos del usuario' });
  }
};


const verifyEmail = async (req, res) => {
  const { token } = req.query;

  try {
    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return res.status(400).json({ message: 'Token de verificación inválido o expirado.' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;

    // Sincronizar con Firebase si existe el UID
    if (admin.apps.length > 0 && user.firebaseUid) {
      try {
        await admin.auth().updateUser(user.firebaseUid, {
          emailVerified: true
        });
      } catch (fbError) {
        console.error('Error sincronizando verificación con Firebase:', fbError);
      }
    }

    await user.save();

    res.status(200).json({ message: 'Correo electrónico verificado con éxito. Ahora puedes iniciar sesión.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al verificar el correo electrónico.' });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'No existe un usuario con ese correo electrónico.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hora
    await user.save();

    if (admin.apps.length > 0 && user.firebaseUid) {
      try {
        const resetLink = await admin.auth().generatePasswordResetLink(email, {
          url: 'http://localhost:3000/login',
        });
        // Aquí podrías enviar este resetLink usando tu mailService
        await sendResetPasswordEmail(email, resetLink);
      } catch (fbError) {
        console.error('Error generando link en Firebase:', fbError);
        await sendResetPasswordEmail(email, resetToken);
      }
    } else {
      await sendResetPasswordEmail(email, resetToken);
    }

    res.status(200).json({ message: 'Se ha enviado un correo para restablecer tu contraseña.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Error al procesar la solicitud de recuperación.' });
  }
};

const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'El token es inválido o ha expirado.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ message: 'Contraseña restablecida con éxito. Ya puedes iniciar sesión.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al restablecer la contraseña.' });
  }
};

module.exports = { register, login, getMe, verifyEmail, forgotPassword, resetPassword };




