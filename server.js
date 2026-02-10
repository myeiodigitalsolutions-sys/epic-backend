const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined,
};

if (!firebaseConfig.projectId || !firebaseConfig.clientEmail || !firebaseConfig.privateKey) {
  console.error('Missing Firebase configuration variables');
  process.exit(1);
}

const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'epic-4066e.firebasestorage.app'
});

console.log('Firebase Storage initialized successfully');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: true, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Length', 'X-Request-ID']
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`, req.body ? 'Body present' : 'No body');
  next();
});

app.options(/.*/, cors());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });

const exportsDir = path.join(__dirname, 'exports');
const publicDir = path.join(__dirname, 'public');
const logsDir = path.join(__dirname, 'logs');

[exportsDir, publicDir, logsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Directory created: ${dir}`);
  }
});

app.use('/exports', express.static(exportsDir));
app.use('/public', express.static(publicDir));
app.use('/logs', express.static(logsDir));

app.use(express.static(publicDir));

const classRoutes = require('./routes/classRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const unitRoutes = require('./routes/unitRoutes');
const assignmentRoutes = require('./routes/assignments');
const submissionRoutes = require('./routes/submissions');
const staffRoutes = require('./routes/staffRoutes');
const studentRoutes = require('./routes/studentRoutes');
const messageRoutes = require('./routes/messages');
const studLogin = require('./routes/activityRoutes');
const programRoutes = require('./routes/programRoutes');
const semesterRoutes = require('./routes/semesterRoutes');
const meetingRoutes = require('./routes/meetingRoutes');

app.use('/api/classes', classRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/activity', studLogin);
app.use('/api/export', require('./routes/exportRoutes'));
app.use('/api/logs', require('./routes/logRoutes'));
app.use('/api/programs', programRoutes);
app.use('/api/semesters', semesterRoutes);
app.use('/api/meetings', meetingRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.get('/test', (req, res) => {
  res.json({ message: 'Server is working' });
});

app.get('/test-logo', (req, res) => {
  const logoPath = path.join(publicDir, 'edenberg.jpg');
  if (fs.existsSync(logoPath)) {
    res.json({ 
      exists: true, 
      path: logoPath,
      url: '/edenberg.jpg'
    });
  } else {
    res.json({ 
      exists: false, 
      path: logoPath,
      message: 'Logo not found. Please place edenberg.jpg in public folder.' 
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.path}`,
    availableRoutes: [
      '/api/staff',
      '/api/students',
      '/api/classes',
      '/api/announcements',
      '/api/units',
      '/api/assignments',
      '/api/submissions'
    ]
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    message: 'Internal Server Error',
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`API Health check: http://localhost:${port}/api/health`);
});