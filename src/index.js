import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import authRoutes from './routes/authRoutes.js';
import pointRoutes from './routes/pointRoutes.js';
import feedRoutes from './routes/feedRoutes.js';
import connectionRoutes from './routes/connectionRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import contentRoutes from './routes/contentRoutes.js';
import { testConnection } from './config/database.js';
import { initPointDB } from './models/PointTransaction.js';
import { connectMongoDB } from './config/mongodb.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://frontend-xz-git-master-gabrim-cpus-projects.vercel.app',
    'https://www.frontend-xz-git-master-gabrim-cpus-projects.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

const io = new Server(server, {
  cors: corsOptions
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' })); // Support larger base64 payloads for voice/images
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static directory for local file fallback uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// Expose Socket.io instance on request object
app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/points', pointRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/content', contentRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    architecture: 'PostgreSQL + Firebase + MongoDB + Socket.io',
    project: 'Digital Roots (XZ)',
    database: process.env.DB_NAME,
    timestamp: new Date()
  });
});

// Setup Socket.io real-time connection rooms + presence tracking.
// A user may hold several sockets (multiple tabs), so we count connections
// per user and only mark them offline when the last one drops.
const onlineUsers = new Map(); // userId -> open socket count

const broadcastPresence = () => {
  io.emit('presence', [...onlineUsers.keys()]);
};

io.on('connection', (socket) => {
  console.log('🔌 Socket connection established:', socket.id);
  console.log('📊 Total active sockets:', io.engine.clientsCount);

  socket.on('join', (userId) => {
    if (!userId) {
      console.error('❌ Join event received without userId');
      return;
    }
    socket.join(userId);
    console.log(`✅ Socket ${socket.id} joined room: ${userId}`);

    // Guard against the same socket joining twice
    if (socket.data.userId !== userId) {
      socket.data.userId = userId;
      onlineUsers.set(userId, (onlineUsers.get(userId) || 0) + 1);
      broadcastPresence();
      console.log(`👤 User ${userId} is now online (${onlineUsers.get(userId)} socket(s))`);
    }
  });

  socket.on('disconnect', (reason) => {
    const userId = socket.data.userId;
    if (userId) {
      const remaining = (onlineUsers.get(userId) || 1) - 1;
      if (remaining <= 0) {
        onlineUsers.delete(userId);
        console.log(`❌ User ${userId} is now OFFLINE`);
      } else {
        onlineUsers.set(userId, remaining);
        console.log(`👤 User ${userId} disconnected (${remaining} socket(s) remaining)`);
      }
      broadcastPresence();
    }
    console.log('❌ Socket disconnected:', socket.id, '- Reason:', reason);
  });

  socket.on('error', (error) => {
    console.error('❌ Socket error:', socket.id, error);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log('======================================================');
  console.log(`🚀 XZ Node.js Core Server executing on port ${PORT}`);
  console.log(`📂 Connected to Firebase Project: ${process.env.FIREBASE_PROJECT_ID || 'not configured'}`);
  console.log('======================================================');
  await testConnection();
  await connectMongoDB();
  await initPointDB();
});