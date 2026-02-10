const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const admin = require('firebase-admin');
const Student = require('../models/Students');
const Staff = require('../models/Staff');

// GET all students
router.get('/', async (req, res) => {
  try {
    const students = await Student.find().sort({ createdAt: -1 });
    res.status(200).json(students);
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ 
      error: 'Failed to fetch students: ' + err.message 
    });
  }
});

// Add student with STATUS support
router.post('/student', async (req, res) => {
  let firebaseUser = null;
  
  try {
    // ADDED: Include regNo and status in destructuring
    const { name, program, email, password, regNo, status } = req.body;
    
    console.log('Adding student with data:', { name, program, email, password: '***', regNo, status });
    
    // Validate required fields - ADDED regNo and status
    if (!name || !program || !email || !password || !regNo || !status) {
      return res.status(400).json({ 
        error: 'Name, registration number, program, email, password, and status are required' 
      });
    }

    // Validate status value
    if (status !== 'Active' && status !== 'Hold') {
      return res.status(400).json({ 
        error: 'Status must be either Active or Hold' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Invalid email format' 
      });
    }

    // Validate registration number format (alphanumeric)
    const regNoRegex = /^[A-Za-z0-9]+$/;
    if (!regNoRegex.test(regNo)) {
      return res.status(400).json({ 
        error: 'Registration number must be alphanumeric' 
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Password must be at least 6 characters' 
      });
    }

    const lowerEmail = email.toLowerCase().trim();
    const upperRegNo = regNo.toUpperCase().trim();

    // Check if student already exists in MongoDB by email
    const existingStudentByEmail = await Student.findOne({ email: lowerEmail });
    if (existingStudentByEmail) {
      return res.status(400).json({ 
        error: 'Student email already exists in database' 
      });
    }

    // Check if registration number already exists
    const existingStudentByRegNo = await Student.findOne({ regNo: upperRegNo });
    if (existingStudentByRegNo) {
      return res.status(400).json({ 
        error: 'Registration number already exists in database' 
      });
    }

    // Check if email exists in Firebase
    try {
      await admin.auth().getUserByEmail(lowerEmail);
      return res.status(400).json({ 
        error: 'Email already exists in Firebase authentication system' 
      });
    } catch (firebaseErr) {
      if (firebaseErr.code !== 'auth/user-not-found') {
        return res.status(400).json({ 
          error: 'Firebase error: ' + firebaseErr.message 
        });
      }
    }

    // Create Firebase user
    try {
      firebaseUser = await admin.auth().createUser({
        email: lowerEmail,
        password: password,
        displayName: name.trim(),
        emailVerified: false,
        disabled: false
      });
      console.log('Firebase user created:', firebaseUser.uid);
    } catch (createErr) {
      console.error('Firebase creation error:', createErr);
      if (createErr.code === 'auth/email-already-exists') {
        return res.status(400).json({ 
          error: 'Email already exists in Firebase authentication system' 
        });
      }
      if (createErr.code === 'auth/invalid-email') {
        return res.status(400).json({ 
          error: 'Invalid email address' 
        });
      }
      if (createErr.code === 'auth/weak-password') {
        return res.status(400).json({ 
          error: 'Password is too weak' 
        });
      }
      throw createErr;
    }

    // Create student in MongoDB with Firebase UID, Registration Number, and Status
    const student = new Student({ 
      regNo: upperRegNo,
      studentId: firebaseUser.uid,
      name: name.trim(),
      program: program.trim(),
      email: lowerEmail,
      password: password,
      status: status  // ADDED: Store status
    });
    
    await student.save();
    console.log('Student saved to MongoDB:', student._id);
    
    res.status(201).json({ 
      message: 'Student added successfully',
      data: {
        id: student._id,
        regNo: student.regNo,
        studentId: student.studentId,
        name: student.name,
        program: student.program,
        email: student.email,
        status: student.status,  // ADDED: Return status
        createdAt: student.createdAt,
        firebaseUid: firebaseUser.uid
      }
    });
  } catch (err) {
    console.error('Error adding student:', err);
    
    // If Firebase user was created but MongoDB failed, try to delete Firebase user
    if (firebaseUser) {
      try {
        await admin.auth().deleteUser(firebaseUser.uid);
        console.log('Cleaned up Firebase user:', firebaseUser.uid);
      } catch (deleteErr) {
        console.error('Failed to cleanup Firebase user:', deleteErr);
      }
    }
    
    // Handle duplicate key error for MongoDB
    if (err.code === 11000) {
      if (err.keyPattern && err.keyPattern.email) {
        return res.status(400).json({ 
          error: 'Student email already exists in database' 
        });
      }
      if (err.keyPattern && err.keyPattern.regNo) {
        return res.status(400).json({ 
          error: 'Registration number already exists in database' 
        });
      }
      return res.status(400).json({ 
        error: 'Duplicate entry found' 
      });
    }
    
    // Handle validation errors
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({ 
        error: 'Validation error: ' + messages.join(', ') 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to add student: ' + err.message 
    });
  }
});

// ADDED: New endpoint to check student status during login
router.post('/check-status', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const student = await Student.findOne({ email: email.toLowerCase().trim() });
    
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.status(200).json({ 
      status: student.status,
      name: student.name,
      regNo: student.regNo
    });
  } catch (err) {
    console.error('Error checking student status:', err);
    res.status(500).json({ error: 'Failed to check status: ' + err.message });
  }
});

// Bulk student creation with STATUS support
router.post('/bulk-users', async (req, res) => {
  try {
    const type = req.query.type; 
    const users = req.body.users;

    if (!type || type !== 'student') {
      return res.status(400).json({ 
        error: 'Invalid or missing type (must be student).' 
      });
    }
    
    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ 
        error: 'No users provided' 
      });
    }

    const results = [];
    const createdFirebaseUsers = [];
    
    for (const user of users) {
      // ADDED: Include regNo and status in destructuring
      const { name, email, password, program, regNo, status } = user;
      
      // Validate required fields - ADDED regNo and status
      if (!name || !program || !email || !password || !regNo || !status) {
        results.push({ 
          email: email || 'unknown', 
          regNo: regNo || 'unknown',
          success: false, 
          error: 'Missing required fields (name, regNo, program, email, password, status)' 
        });
        continue;
      }

      // Validate status value
      if (status !== 'Active' && status !== 'Hold') {
        results.push({ 
          email, 
          regNo,
          success: false, 
          error: 'Status must be either Active or Hold' 
        });
        continue;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        results.push({ 
          email, 
          regNo,
          success: false, 
          error: 'Invalid email format' 
        });
        continue;
      }

      // Validate registration number format
      const regNoRegex = /^[A-Za-z0-9]+$/;
      if (!regNoRegex.test(regNo)) {
        results.push({ 
          email, 
          regNo,
          success: false, 
          error: 'Registration number must be alphanumeric' 
        });
        continue;
      }

      // Validate password length
      if (password.length < 6) {
        results.push({ 
          email, 
          regNo,
          success: false, 
          error: 'Password must be at least 6 characters' 
        });
        continue;
      }

      const lowerEmail = email.toLowerCase().trim();
      const upperRegNo = regNo.toUpperCase().trim();

      try {
        // Check if exists in Firebase
        try {
          await admin.auth().getUserByEmail(lowerEmail);
          results.push({ 
            email: lowerEmail, 
            regNo: upperRegNo,
            success: false, 
            error: 'Email already exists in Firebase' 
          });
          continue;
        } catch (err) {
          if (err.code !== 'auth/user-not-found') {
            results.push({ 
              email: lowerEmail, 
              regNo: upperRegNo,
              success: false, 
              error: 'Firebase error: ' + err.message 
            });
            continue;
          }
        }

        // Check if exists in MongoDB by email
        const existingStudentByEmail = await Student.findOne({ email: lowerEmail });
        if (existingStudentByEmail) {
          results.push({ 
            email: lowerEmail, 
            regNo: upperRegNo,
            success: false, 
            error: 'Email already exists in database' 
          });
          continue;
        }

        // Check if registration number already exists
        const existingStudentByRegNo = await Student.findOne({ regNo: upperRegNo });
        if (existingStudentByRegNo) {
          results.push({ 
            email: lowerEmail, 
            regNo: upperRegNo,
            success: false, 
            error: 'Registration number already exists in database' 
          });
          continue;
        }

        // Create in Firebase
        let firebaseUser;
        try {
          firebaseUser = await admin.auth().createUser({ 
            email: lowerEmail, 
            password: password,
            displayName: name.trim(),
            emailVerified: false,
            disabled: false
          });
          createdFirebaseUsers.push({ uid: firebaseUser.uid, email: lowerEmail });
          console.log('Firebase user created:', firebaseUser.uid);
        } catch (createErr) {
          results.push({ 
            email: lowerEmail, 
            regNo: upperRegNo,
            success: false, 
            error: 'Firebase creation failed: ' + createErr.message 
          });
          continue;
        }

        // Create in MongoDB with Firebase UID, RegNo, and Status
        const student = new Student({
          regNo: upperRegNo,
          studentId: firebaseUser.uid,
          name: name.trim(),
          program: program.trim(),
          email: lowerEmail,
          password: password,
          status: status  // ADDED: Store status
        });
        
        await student.save();

        results.push({ 
          email: lowerEmail, 
          regNo: upperRegNo,
          success: true,
          studentId: student._id,
          firebaseUid: firebaseUser.uid,
          status: status  // ADDED: Return status
        });
      } catch (err) {
        console.error(`Error processing ${email}:`, err);
        results.push({ 
          email: lowerEmail, 
          regNo: upperRegNo,
          success: false, 
          error: err.message 
        });
      }
    }

    // If any errors occurred, clean up Firebase users that were created
    const failedResults = results.filter(r => !r.success);
    if (failedResults.length > 0 && createdFirebaseUsers.length > 0) {
      console.log('Cleaning up Firebase users due to errors...');
      for (const fbUser of createdFirebaseUsers) {
        try {
          await admin.auth().deleteUser(fbUser.uid);
          console.log('Cleaned up Firebase user:', fbUser.uid);
        } catch (cleanupErr) {
          console.error('Failed to cleanup Firebase user:', cleanupErr);
        }
      }
    }

    res.status(200).json({ 
      message: `Bulk ${type} upload completed`,
      results,
      summary: {
        total: results.length,
        success: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    });
  } catch (err) {
    console.error('Bulk upload error:', err);
    res.status(500).json({ 
      error: 'Bulk upload failed: ' + err.message 
    });
  }
});

// DELETE student by ID
router.delete('/student/:id', async (req, res) => {
  try {
    const studentId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ error: 'Invalid student ID format' });
    }

    const student = await Student.findById(studentId);
    
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Delete from Firebase Authentication
    try {
      await admin.auth().deleteUser(student.studentId);
      console.log('Deleted from Firebase:', student.studentId);
    } catch (firebaseErr) {
      console.error('Firebase deletion error:', firebaseErr);
      if (firebaseErr.code !== 'auth/user-not-found') {
        return res.status(400).json({ 
          error: 'Firebase deletion failed: ' + firebaseErr.message 
        });
      }
    }

    // Delete from MongoDB
    await Student.findByIdAndDelete(studentId);
    console.log('Deleted from MongoDB:', studentId);

    res.status(200).json({ message: 'Student deleted successfully' });
  } catch (err) {
    console.error('Error deleting student:', err);
    res.status(500).json({ error: 'Failed to delete student: ' + err.message });
  }
});

// DELETE multiple students
router.post('/delete-bulk', async (req, res) => {
  try {
    const { studentIds } = req.body;
    
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'No student IDs provided' });
    }

    const results = {
      deleted: [],
      failed: []
    };

    for (const studentId of studentIds) {
      try {
        if (!mongoose.Types.ObjectId.isValid(studentId)) {
          results.failed.push({ 
            id: studentId, 
            error: 'Invalid ID format' 
          });
          continue;
        }

        const student = await Student.findById(studentId);
        
        if (!student) {
          results.failed.push({ 
            id: studentId, 
            error: 'Student not found' 
          });
          continue;
        }

        // Delete from Firebase
        try {
          await admin.auth().deleteUser(student.studentId);
        } catch (firebaseErr) {
          if (firebaseErr.code !== 'auth/user-not-found') {
            console.error('Firebase deletion error:', firebaseErr);
          }
        }

        // Delete from MongoDB
        await Student.findByIdAndDelete(studentId);
        
        results.deleted.push({ 
          id: studentId, 
          email: student.email 
        });
      } catch (err) {
        console.error(`Error deleting student ${studentId}:`, err);
        results.failed.push({ 
          id: studentId, 
          error: err.message 
        });
      }
    }

    res.status(200).json({
      message: 'Bulk delete completed',
      summary: {
        total: studentIds.length,
        deleted: results.deleted.length,
        failed: results.failed.length
      },
      results
    });
  } catch (err) {
    console.error('Bulk delete error:', err);
    res.status(500).json({ error: 'Bulk delete failed: ' + err.message });
  }
});

// UPDATE user (student) - with STATUS support
router.put('/update-user', async (req, res) => {
  try {
    const { oldEmail, newEmail, name, program, regNo, status, newPassword } = req.body;
    
    if (!oldEmail) {
      return res.status(400).json({ error: 'Old email is required' });
    }

    const lowerOldEmail = oldEmail.toLowerCase().trim();

    // Find student
    const student = await Student.findOne({ email: lowerOldEmail });
    if (!student) {
      return res.status(404).json({ error: 'Student not found in database' });
    }

    // Validate new password if provided
    if (newPassword && newPassword.length < 6) {
      return res.status(400).json({ 
        error: 'New password must be at least 6 characters' 
      });
    }

    // Validate status if provided
    if (status && status !== 'Active' && status !== 'Hold') {
      return res.status(400).json({ 
        error: 'Status must be either Active or Hold' 
      });
    }

    // Get Firebase user by old email
    let user;
    try {
      user = await admin.auth().getUserByEmail(lowerOldEmail);
      console.log('Firebase user found:', user.uid);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        return res.status(404).json({ 
          error: 'User not found in Firebase' 
        });
      }
      throw err;
    }

    // Check if new email is already in use in Firebase
    if (newEmail && lowerOldEmail !== newEmail.toLowerCase()) {
      try {
        await admin.auth().getUserByEmail(newEmail.toLowerCase());
        return res.status(400).json({ 
          error: 'New email is already in use' 
        });
      } catch (err) {
        if (err.code !== 'auth/user-not-found') throw err;
      }
    }

    // Update Firebase user
    const updateData = {};
    if (newEmail) updateData.email = newEmail.toLowerCase();
    if (newPassword) updateData.password = newPassword;
    if (name) updateData.displayName = name;
    
    if (Object.keys(updateData).length > 0) {
      await admin.auth().updateUser(user.uid, updateData);
      console.log('User updated in Firebase:', user.uid);
    }

    // Update MongoDB - ADDED: status update
    const mongoUpdateData = {};
    if (newEmail) mongoUpdateData.email = newEmail.toLowerCase().trim();
    if (name) mongoUpdateData.name = name.trim();
    if (program) mongoUpdateData.program = program.trim();
    if (regNo) mongoUpdateData.regNo = regNo.toUpperCase().trim();
    if (status) mongoUpdateData.status = status;  // ADDED: Update status
    
    if (newPassword) {
      mongoUpdateData.password = newPassword;
      mongoUpdateData.passwordUpdated = true;
      mongoUpdateData.lastPasswordUpdate = new Date();
    }
    
    mongoUpdateData.updatedAt = new Date();
    
    if (Object.keys(mongoUpdateData).length > 0) {
      await Student.updateOne(
        { email: lowerOldEmail },
        { $set: mongoUpdateData }
      );
      console.log('Student updated in MongoDB with fields:', Object.keys(mongoUpdateData));
    }

    res.status(200).json({ 
      success: true,
      message: `User ${newEmail || oldEmail} updated successfully`,
      updatedFields: Object.keys(mongoUpdateData)
    });
  } catch (err) {
    console.error('Error updating user:', err);
    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ 
        success: false,
        error: 'New email is already in use' 
      });
    }
    res.status(500).json({ 
      success: false,
      error: 'Failed to update user: ' + err.message 
    });
  }
});

module.exports = router;