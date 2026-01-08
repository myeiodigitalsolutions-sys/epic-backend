require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const admin = require('./firebaseAdmin');

const classRoutes = require('./routes/classRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const unitRoutes = require('./routes/unitRoutes');
const assignmentRoutes = require('./routes/assignments');
const submissionRoutes = require('./routes/submissions');
const staffRoutes = require('./routes/staffRoutes');
const studentRoutes = require('./routes/studentRoutes');
const messageRoutes = require('./routes/messages');
const studLogin = require('./routes/activityRoutes');
const studentRoutesFromSecond = require('./routes/student.routes');
const schoolRoutes = require('./routes/school.routes');
const examRoutes = require('./routes/exam.routes');
const exportRoutes = require('./routes/exportRoutes');
const logRoutes = require('./routes/logRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
const port = process.env.PORT || 5000;
app.set('timeout', 30000);

const allowedOrigins = [
  'http://localhost:3000',
  'https://ueexam.vercel.app',
  'https://ueexams.com',
];

const corsOptions = {
  origin: function (origin, callback) {
    if (process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Length', 'X-Request-ID']
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    const modelNames = mongoose.modelNames();

    if (!modelNames.includes('Class')) require('./models/classModel');
    if (!modelNames.includes('Announcement')) require('./models/announcementModel');
    if (!modelNames.includes('Unit')) require('./models/unitModel');
    if (!modelNames.includes('Assignment')) require('./models/assignmentModel');
    if (!modelNames.includes('Submission')) require('./models/Submission');
    if (!modelNames.includes('Staff')) require('./models/Staff');

    if (!modelNames.includes('Student') && !modelNames.includes('StudentV2')) {
      try { require('./models/Student'); } catch (err) {}
    }

    if (!modelNames.includes('StudentV2')) {
      try {
        const studentSchemaV2 = require('./models/student.model');
        if (studentSchemaV2 instanceof mongoose.Schema) {
          mongoose.model('StudentV2', studentSchemaV2);
        }
      } catch (err) {}
    }

    if (!modelNames.includes('Message')) require('./models/Message');
    if (!modelNames.includes('School')) require('./models/school.model');
    if (!modelNames.includes('Exam')) require('./models/exam.model');

  } catch (err) {
    console.error('MongoDB connection error:', err);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

connectDB();

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});

const uploadsDir = path.join(__dirname, 'uploads');
const exportsDir = path.join(__dirname, 'exports');
const publicDir = path.join(__dirname, 'public');
const logsDir = path.join(__dirname, 'logs');

[uploadsDir, exportsDir, publicDir, logsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

app.use('/uploads', express.static(uploadsDir));
app.use('/exports', express.static(exportsDir));
app.use('/public', express.static(publicDir));
app.use('/logs', express.static(logsDir));
app.use(express.static(publicDir));

app.use('/api/classes', classRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/activity', studLogin);
app.use('/api/export', exportRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/students-v2', studentRoutesFromSecond);
app.use('/api/schools', schoolRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/users', userRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    firebase: admin ? 'initialized' : 'not initialized',
    server: 'Combined LMS & Exam Monitoring API',
    models: mongoose.modelNames()
  });
});

app.post('/api/auth/get-role', async (req, res) => {
  const { uid } = req.body;
  try {
    const User = mongoose.model('User');
    if (User) {
      const user = await User.findOne({ uid });
      if (user) {
        return res.json({ role: user.role });
      }
    }

    const StudentModelV1 = mongoose.models.Student;
    if (StudentModelV1) {
      const userV1 = await StudentModelV1.findOne({ uid });
      if (userV1) return res.json({ role: 'student', source: 'v1' });
    }

    const StudentModelV2 = mongoose.models.StudentV2;
    if (StudentModelV2) {
      const userV2 = await StudentModelV2.findOne({ uid });
      if (userV2) return res.json({ role: 'student', source: 'v2' });
    }

    const StaffModel = mongoose.models.Staff;
    if (StaffModel) {
      const staffUser = await StaffModel.findOne({ uid });
      if (staffUser) {
        return res.json({ role: 'staff' });
      }
    }

    res.status(404).json({ error: 'User not found' });
  } catch (error) {
    console.error('Get role error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/test', (req, res) => {
  res.json({ 
    message: 'Server is working - Combined LMS & Exam Monitoring API',
    models: mongoose.modelNames()
  });
});

app.get('/test-logo', (req, res) => {
  const logoPath = path.join(publicDir, 'edenberg.jpg');
  if (fs.existsSync(logoPath)) {
    res.json({ exists: true, url: '/edenberg.jpg' });
  } else {
    res.json({ exists: false, message: 'Logo not found' });
  }
});

app.get('/api/submissions/test/:id', async (req, res) => {
  try {
    const Submission = mongoose.models.Submission;
    if (!Submission) return res.status(500).json({ message: 'Submission model not available' });
    
    const submission = await Submission.findById(req.params.id);
    if (!submission) return res.status(404).json({ message: 'Submission not found' });
    
    res.json(submission);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const availableModels = mongoose.modelNames();
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Combined LMS & Exam Monitoring API</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        h1 { color: #333; }
        .endpoint { background: #f4f4f4; padding: 10px; margin: 10px 0; border-left: 4px solid #3498db; }
        .status { padding: 5px 10px; border-radius: 3px; }
        .connected { background: #d4edda; color: #155724; }
        .disconnected { background: #f8d7da; color: #721c24; }
      </style>
    </head>
    <body>
      <h1>Combined LMS & Exam Monitoring API</h1>
      <p>Server is running successfully!</p>
      
      <div class="endpoint">
        <strong>MongoDB Status:</strong> 
        <span class="status ${dbStatus === 'connected' ? 'connected' : 'disconnected'}">${dbStatus}</span>
      </div>
      
      <div class="endpoint">
        <strong>Firebase Status:</strong> 
        <span class="status ${admin ? 'connected' : 'disconnected'}">${admin ? 'Initialized' : 'Not Initialized'}</span>
      </div>

      <h2>Available Models (${availableModels.length})</h2>
      <ul>${availableModels.map(m => `<li>${m}</li>`).join('')}</ul>
    </body>
    </html>
  `);
});

async function initializeAdminUser() {
  const email = 'epicunivclg@gmail.com';
  const password = 'admin123';
  const role = 'admin';

  if (!admin) {
    console.warn('Firebase Admin not initialized');
    return;
  }

  try {
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
      console.log(`Admin already exists in Firebase: ${email}`);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        userRecord = await admin.auth().createUser({
          email,
          password,
          emailVerified: true
        });
        console.log(`Admin created in Firebase: ${email}`);
      } else {
        throw err;
      }
    }

    const UserSchema = new mongoose.Schema({
      email: { type: String, required: true, unique: true },
      password: { type: String, required: true },
      role: { type: String, required: true },
      uid: { type: String, unique: true, sparse: true }
    }, { timestamps: true });

    const User = mongoose.models.User || mongoose.model('User', UserSchema);

    const existing = await User.findOne({ uid: userRecord.uid });
    if (!existing) {
      await User.create({
        email: email.toLowerCase(),
        password: password,
        role: role,
        uid: userRecord.uid
      });
      console.log(`Admin saved to MongoDB - User collection: ${email}`);
    } else {
      console.log(`Admin already exists in MongoDB: ${email}`);
    }

  } catch (error) {
    console.error('Admin initialization error:', error.message);
  }
}

mongoose.connection.once('open', async () => {
  await initializeAdminUser();

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Ready!`);
  });
});

app.use((req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.path}`
  });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    message: 'Internal Server Error'
  });
});

module.exports = app;