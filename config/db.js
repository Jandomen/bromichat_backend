const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Conexion exitosa a MongoDB :) ');
  } catch (error) {
    console.log('Error de conexion a MongoDB: :(', error);
  }
};

module.exports = connectDB;