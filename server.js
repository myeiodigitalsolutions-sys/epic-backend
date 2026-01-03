const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const classRoutes = require('./routes/classRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const unitRoutes = require('./routes/unitRoutes');
const assignmentRoutes = require('./routes/assignments');
const submissionRoutes = require('./routes/submissions');
const staffRoutes = require('./routes/staffRoutes');
const studentRoutes = require('./routes/studentRoutes');
const admin = require('firebase-admin');
const messageRoutes = require('./routes/messages');
const studLogin = require('./routes/activityRoutes');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? 'Defined' : 'Undefined');

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

admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig),
});

const app = express();
const port = process.env.PORT || 5000;

// Enhanced CORS configuration
app.use(cors({
  origin: true, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Length', 'X-Request-ID']
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '50mb' }));

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`, req.body ? 'Body present' : 'No body');
  next();
});

// Handle preflight requests for all routes (use RegExp to avoid path-to-regexp errors)
app.options(/.*/, cors());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });

// Create directories if they don't exist
const uploadsDir = path.join(__dirname, 'uploads');
const exportsDir = path.join(__dirname, 'exports');
const publicDir = path.join(__dirname, 'public');
const logsDir = path.join(__dirname, 'logs');

[uploadsDir, exportsDir, publicDir, logsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Directory created: ${dir}`);
  }
});

// Serve static files from directories
app.use('/uploads', express.static(uploadsDir));
app.use('/exports', express.static(exportsDir));
app.use('/public', express.static(publicDir));
app.use('/logs', express.static(logsDir));

// Also serve from root for backward compatibility
app.use(express.static(publicDir));

// Routes
app.use('/api/classes', classRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionRoutes);

// IMPORTANT: Mount staffRoutes at /api/staff
app.use('/api/staff', staffRoutes);


// IMPORTANT: Mount studentRoutes at /api/students
app.use('/api/students', studentRoutes);

app.use('/api/messages', messageRoutes);
app.use('/api/activity', studLogin);

// Export routes
app.use('/api/export', require('./routes/exportRoutes'));
app.use('/api/staff', require('./routes/staffRoutes'));
app.use('/api/students', require('./routes/studentRoutes'));
// Log routes
app.use('/api/logs', require('./routes/logRoutes'));

// Simple health check
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

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ message: 'Server is working' });
});

// Test logo endpoint
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

// Test submissions endpoint
app.get('/api/submissions/test/:id', async (req, res) => {
  try {
    const Submission = require('./models/Submission');
    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }
    res.json(submission);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 404 handler
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

// Global error handler
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
  console.log(`Public directory: ${publicDir}`);
  console.log(`Check logo at: http://localhost:${port}/test-logo`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`API Health check: http://localhost:${port}/api/health`);
  console.log(`Staff routes mounted at: /api/staff`);
  console.log(`Student routes mounted at: /api/students`);
  console.log(`Available endpoints:`);
  console.log(`  GET  /api/staff - Get all staff`);
  console.log(`  POST /api/staff/staff - Add staff`);
  console.log(`  GET  /api/students - Get all students`);
  console.log(`  POST /api/students/student - Add student`);
});
