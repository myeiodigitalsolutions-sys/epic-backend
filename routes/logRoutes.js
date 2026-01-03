const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Class = require('../models/Class');
const Staff = require('../models/Staff');
const Student = require('../models/Students');

// Get logs for PDF export
router.get('/export-data', async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;
    
    let logs = [];
    let classesData = [];
    let usersData = [];

    // Get user creation logs
    if (type === 'staff') {
      const staff = await Staff.find({}).sort({ createdAt: -1 });
      usersData = staff.map(staff => ({
        type: 'staff',
        name: staff.name,
        email: staff.email,
        department: staff.department,
        createdAt: staff.createdAt,
        action: 'Created'
      }));
    } else if (type === 'student') {
      const students = await Student.find({}).sort({ createdAt: -1 });
      usersData = students.map(student => ({
        type: 'student',
        name: student.name,
        email: student.email,
        program: student.program,
        createdAt: student.createdAt,
        action: 'Created'
      }));
    } else {
      // Both staff and students
      const staff = await Staff.find({}).sort({ createdAt: -1 });
      const students = await Student.find({}).sort({ createdAt: -1 });
      
      usersData = [
        ...staff.map(staff => ({
          type: 'staff',
          name: staff.name,
          email: staff.email,
          department: staff.department,
          createdAt: staff.createdAt,
          action: 'Created'
        })),
        ...students.map(student => ({
          type: 'student',
          name: student.name,
          email: student.email,
          program: student.program,
          createdAt: student.createdAt,
          action: 'Created'
        }))
      ];
    }

    // Get class creation logs
    const classes = await Class.find({}).sort({ createdAt: -1 });
    classesData = classes.map(cls => ({
      type: 'class',
      name: cls.name,
      section: cls.section || '',
      subject: cls.subject || '',
      teacher: cls.teacher,
      createdBy: cls.staffId,
      createdAt: cls.createdAt,
      action: 'Created'
    }));

    // Filter by date if provided
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      logs = [
        ...usersData.filter(log => log.createdAt >= start && log.createdAt <= end),
        ...classesData.filter(log => log.createdAt >= start && log.createdAt <= end)
      ];
    } else {
      logs = [...usersData, ...classesData];
    }

    // Sort by date
    logs.sort((a, b) => b.createdAt - a.createdAt);

    res.json({
      success: true,
      logs: logs.slice(0, 100), // Limit to 100 most recent logs
      stats: {
        totalStaff: usersData.filter(log => log.type === 'staff').length,
        totalStudents: usersData.filter(log => log.type === 'student').length,
        totalClasses: classesData.length,
        totalLogs: logs.length
      }
    });
  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get logs' 
    });
  }
});

// Get detailed activity log
router.get('/activity', async (req, res) => {
  try {
    const { userId, userType, action } = req.query;
    
    let query = {};
    if (userId) {
      query.userId = userId;
    }
    if (userType) {
      query.userType = userType;
    }
    if (action) {
      query.action = action;
    }

    // For now, return mock data - in production, you'd query from an ActivityLog collection
    const activities = [
      {
        userId: 'admin123',
        userName: 'Admin User',
        userType: 'admin',
        action: 'user_created',
        details: 'Created staff member: John Doe',
        timestamp: new Date(Date.now() - 86400000) // 1 day ago
      },
      {
        userId: 'staff456',
        userName: 'John Doe',
        userType: 'staff',
        action: 'class_created',
        details: 'Created class: Mathematics 101',
        timestamp: new Date(Date.now() - 43200000) // 12 hours ago
      },
      {
        userId: 'admin123',
        userName: 'Admin User',
        userType: 'admin',
        action: 'user_created',
        details: 'Created student: Jane Smith',
        timestamp: new Date(Date.now() - 7200000) // 2 hours ago
      }
    ];

    res.json({
      success: true,
      activities
    });
  } catch (error) {
    console.error('Error getting activity log:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get activity log' 
    });
  }
});

// Log an activity
router.post('/activity', async (req, res) => {
  try {
    const { userId, userName, userType, action, details } = req.body;
    
    if (!userId || !action) {
      return res.status(400).json({ 
        success: false, 
        error: 'userId and action are required' 
      });
    }

    const logEntry = {
      userId,
      userName: userName || 'Unknown',
      userType: userType || 'user',
      action,
      details: details || '',
      timestamp: new Date(),
      ip: req.ip,
      userAgent: req.headers['user-agent']
    };

    // Log to console for now
    console.log('ACTIVITY LOG:', logEntry);

    // In production, you would save this to MongoDB
    // const activityLog = new ActivityLog(logEntry);
    // await activityLog.save();

    res.json({
      success: true,
      message: 'Activity logged successfully',
      logEntry
    });
  } catch (error) {
    console.error('Error logging activity:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to log activity' 
    });
  }
});

module.exports = router;