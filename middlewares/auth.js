const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
   // console.warn('No viene header Authorization');
    return res.status(401).json({ message: 'Requieres autenticación' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
   // console.warn('No viene token en Authorization');
    return res.status(401).json({ message: 'Requieres autenticación' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.SECRET_KEY);
   // console.log('Token válido:', decodedToken);

    const user = await User.findById(decodedToken.userId);
    if (!user) {
     // console.error('Usuario no encontrado en DB');
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    req.user = user;
    next();
  } catch (error) {
   // console.warn('Token inválido:', error.message);
    res.status(401).json({ message: 'Token inválido' });
  }
};


module.exports = { authenticate };