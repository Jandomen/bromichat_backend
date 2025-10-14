const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/User');


const register = async (req, res, next) => {
  const { username, name, lastName, email, password, phone, birthdate } = req.body;

  try {
    if(!username) return res.status(400).json({error: '!El usuario es requerido...¡ :0 '});
    if(!name) return res.status(400).json({error: '!El nombre es requerido...¡ :0 '});
    if(!lastName) return res.status(400).json({error: '!El apellido es requerido...¡ :0 '});
    if(!email) return res.status(400).json({error: '!El correo electronico es requerido...¡ :0 '});
    if(!password || password.length < 8) return res.status(400).json({error: '!La contraseña es requerida y debe tener al menos 8 caracteres...¡ :0 '});
    if(!phone) return res.status(400).json({error: '!El telefono es requerido...¡ :0 '});
    if(!birthdate) return res.status(400).json({error: '!La fecha de nacimiento es requerida...¡ :0 '});

    const hashedPassword = await bcrypt.hash(password, 10);

    if(await User.findOne({ email })) return res.status(400).json({ error: 'El correo electrónico ya existe :0' });
    if(await User.findOne({ username })) return res.status(400).json({ error: 'El nombre de usuario ya existe, intente con otro :0' });
    if(await User.findOne({ phone })) return res.status(400).json({ error: 'El numero telefonico ya existe, intente con otro :0' });

    const birthdateObj = new Date(birthdate + 'T00:00:00');

    const user = new User({
      username,
      name,
      lastName,
      email,
      password: hashedPassword,
      phone,
      birthdate: birthdateObj
    });

    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    const userData = {
      _id: user._id,
      username: user.username,
      name: user.name,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      birthdate: user.birthdate.toISOString().split('T')[0],
    };

    res.status(201).json({ token, user: userData });
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
          //console.log('El correo electrónico no se encuentra :0');
          return res.status(404).json({ message: 'El correo electrónico no se encuentra :0' });
      }

      const passwordMatch = await user.comparePassword(password);
      if (!passwordMatch) {
          //console.log('La contraseña es incorrecta :(');
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
    const user = await User.findById(req.user.id)
      .populate('friends', '_id username name lastName profilePicture')
      .populate('following', '_id username name lastName profilePicture')
      .populate('blockedUsers', '_id username name lastName profilePicture')
      .select('-password');

    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    const userData = {
      ...user._doc,
      birthdate: user.birthdate.toISOString().split('T')[0]
    };

    res.status(200).json(userData);
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
};

module.exports = { register, login, getMe };
  

  

