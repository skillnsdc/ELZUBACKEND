const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database Connection
const connectDB = require('./config/db');
connectDB();

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/service', require('./routes/service'));
app.use('/api/training', require('./routes/training'));
app.use('/api/job', require('./routes/job'));

// WebRTC Socket Handlers
require('./socket/video')(io);

// Default Route
app.get('/', (req, res) => {
  res.json({
    message: 'EI SOLUTIONS PRO API Server',
    version: '1.0.0',
    status: 'Running'
  });
});

// Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║     🚀 EI SOLUTIONS PRO SERVER RUNNING                 ║
║                                                        ║
║     📡 Port: ${PORT}                                    ║
║     🌐 URL: http://localhost:${PORT}                    ║
║     📅 ${new Date().toLocaleString()}                          ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
  `);
});

module.exports = { app, io };
