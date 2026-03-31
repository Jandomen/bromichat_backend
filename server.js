const buffer = require('buffer');
if (!buffer.SlowBuffer) {
  buffer.SlowBuffer = buffer.Buffer;
}

require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const connectDB = require('./config/db');
const initSettings = require('./utils/initSettings');


connectDB().then(() => {
  initSettings();
});

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const messageRoutes = require('./routes/messagesRoutes');
const postRoutes = require('./routes/postRoutes');
const groupRoutes = require('./routes/groupRoutes');
const friendRoutes = require('./routes/friendRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const videoRoutes = require('./routes/videoRoutes');
const productRoutes = require('./routes/productRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const communityRoutes = require('./routes/communityRoutes');
const storyRoutes = require('./routes/storyRoutes');
const webauthnRoutes = require('./routes/webauthnRoutes');
const adminRoutes = require('./routes/adminRoutes');
const supportRoutes = require('./routes/supportRoutes');
const session = require('express-session');
const checkBannedIp = require('./middlewares/checkBannedIp');
require('./config/firebase');

const app = express();

app.use(checkBannedIp);
const server = http.createServer(app);


app.use(compression());


app.set('trust proxy', 1);


app.use(session({
  secret: process.env.SECRET_KEY || 'biometric-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 30 * 60 * 1000,
    sameSite: 'lax',
    httpOnly: true,
  }
}));

const allowedOrigins = [
  "https://bromichat.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "capacitor://localhost",
  "app://localhost",
  "http://localhost",
  "https://localhost"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

const io = socketIO(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true
  }
});

require('./sockets/chat')(io);
require('./sockets/notification')(io);
require('./sockets/call')(io);



app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('io', io);


app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/conversation', conversationRoutes);
app.use('/messages', messageRoutes);
app.use('/friend', friendRoutes);
app.use('/posts', postRoutes);
app.use('/group', groupRoutes);
app.use('/gallery', galleryRoutes);
app.use('/videos', videoRoutes);
app.use('/api/products', productRoutes);
app.use('/notifications', notificationRoutes);
app.use('/communities', communityRoutes);
app.use('/stories', storyRoutes);
app.use('/webauthn', webauthnRoutes);
app.use('/admin', adminRoutes);
app.use('/support', supportRoutes);

const PORT = process.env.PORT;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
