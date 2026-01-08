const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const admin = require('firebase-admin');
const Student = require('../models/StudentV2');
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

// Add student
router.post('/student', async (req, res) => {
  let firebaseUser = null;
  
  try {
    const { name, program, email, password } = req.body;
    
    console.log('Adding student with data:', { name, program, email, password: '***' });
    
    // Validate required fields
    if (!name || !program || !email || !password) {
      return res.status(400).json({ 
        error: 'Name, program, email, and password are required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Invalid email format' 
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Password must be at least 6 characters' 
      });
    }

    const lowerEmail = email.toLowerCase().trim();

    // Check if student already exists in MongoDB
    const existingStudent = await Student.findOne({ email: lowerEmail });
    if (existingStudent) {
      return res.status(400).json({ 
        error: 'Student email already exists in database' 
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

    // Create student in MongoDB with Firebase UID
    const student = new Student({ 
      studentId: firebaseUser.uid, // Store Firebase UID
      name: name.trim(),
      program: program.trim(),
      email: lowerEmail,
      password: password // Store password for export
    });
    
    await student.save();
    console.log('Student saved to MongoDB:', student._id);
    
    res.status(201).json({ 
      message: 'Student added successfully',
      data: {
        id: student._id,
        studentId: student.studentId,
        name: student.name,
        program: student.program,
        email: student.email,
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
      return res.status(400).json({ 
        error: 'Student email already exists in database' 
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

// Get student by ID
router.get('/:id', async (req, res) => {
  try {
    // Try to find by studentId first (Firebase UID), then by MongoDB _id
    let student = await Student.findOne({ studentId: req.params.id });
    if (!student) {
      try {
        student = await Student.findById(req.params.id);
      } catch (mongoErr) {
        // If not a valid MongoDB ID, continue to error
      }
    }
    
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }
    
    res.json({
      success: true,
      student
    });
  } catch (error) {
    console.error('Error getting student:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    });
  }
});

// Get student by email
router.get('/email/:email', async (req, res) => {
  try {
    const student = await Student.findOne({ email: req.params.email.toLowerCase() });
    if (!student) {
      return res.status(404).json({ 
        success: false,
        error: 'Student not found with this email' 
      });
    }
    
    res.json({
      success: true,
      student
    });
  } catch (error) {
    console.error('Error finding student by email:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to find student: ' + error.message
    });
  }
});

// Update student
router.put('/:id', async (req, res) => {
  try {
    const { name, email, program, phone } = req.body;
    
    // Try to find by studentId first (Firebase UID), then by MongoDB _id
    let student = await Student.findOne({ studentId: req.params.id });
    if (!student) {
      try {
        student = await Student.findById(req.params.id);
      } catch (mongoErr) {
        // If not a valid MongoDB ID, continue to error
      }
    }
    
    if (!student) {
      return res.status(404).json({ 
        success: false,
        error: 'Student not found' 
      });
    }

    // Update fields if provided
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email.toLowerCase();
    if (program) updateData.program = program;
    if (phone) updateData.phone = phone;

    // Update Firebase if email is being changed
    if (email && student.email !== email.toLowerCase()) {
      try {
        const firebaseUser = await admin.auth().getUserByEmail(student.email);
        await admin.auth().updateUser(firebaseUser.uid, {
          email: email.toLowerCase(),
          displayName: name || student.name
        });
      } catch (firebaseErr) {
        console.error('Error updating Firebase user:', firebaseErr);
      }
    }

    // Update MongoDB
    const updatedStudent = await Student.findByIdAndUpdate(
      student._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.json({ 
      success: true,
      student: updatedStudent,
      message: 'Student updated successfully'
    });
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ 
      success: false,
      error: `Failed to update student: ${error.message}`
    });
  }
});

// Delete student
router.delete('/:id', async (req, res) => {
  try {
    // Try to find by studentId first (Firebase UID), then by MongoDB _id
    let student = await Student.findOne({ studentId: req.params.id });
    if (!student) {
      try {
        student = await Student.findById(req.params.id);
      } catch (mongoErr) {
        // If not a valid MongoDB ID, continue to error
      }
    }
    
    if (!student) {
      return res.status(404).json({ 
        success: false,
        error: 'Student not found' 
      });
    }

    // Delete from Firebase using the studentId (Firebase UID)
    try {
      if (student.studentId) {
        await admin.auth().deleteUser(student.studentId);
        console.log('User deleted from Firebase:', student.studentId);
      } else {
        // Fallback: try to find by email
        try {
          const firebaseUser = await admin.auth().getUserByEmail(student.email);
          await admin.auth().deleteUser(firebaseUser.uid);
          console.log('User deleted from Firebase (by email):', firebaseUser.uid);
        } catch (emailErr) {
          console.error('Could not delete from Firebase by email:', emailErr);
        }
      }
    } catch (firebaseErr) {
      console.error('Error deleting from Firebase:', firebaseErr);
      // Continue with MongoDB delete even if Firebase delete fails
    }

    // Delete from MongoDB
    await Student.findByIdAndDelete(student._id);

    res.json({ 
      success: true,
      message: 'Student deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ 
      success: false,
      error: `Failed to delete student: ${error.message}`
    });
  }
});

// Delete user (student) - Keep existing
router.delete('/users', async (req, res) => {
  try {
    const { email, type } = req.body;
    console.log('Delete request received:', { email, type });

    if (!email || !type) {
      return res.status(400).json({ 
        error: 'Email and type (staff/student) are required' 
      });
    }

    if (type !== 'student') {
      return res.status(400).json({ 
        error: 'Type must be "student" for this endpoint' 
      });
    }

    const lowerEmail = email.toLowerCase().trim();

    // Get Firebase user by email
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().getUserByEmail(lowerEmail);
      console.log('Firebase user found:', firebaseUser.uid);
    } catch (firebaseErr) {
      if (firebaseErr.code === 'auth/user-not-found') {
        console.log('User not found in Firebase, continuing with MongoDB delete');
      } else {
        throw firebaseErr;
      }
    }

    // Delete from Firebase if user exists
    if (firebaseUser) {
      try {
        await admin.auth().deleteUser(firebaseUser.uid);
        console.log('User deleted from Firebase:', firebaseUser.uid);
      } catch (firebaseErr) {
        console.error('Error deleting from Firebase:', firebaseErr);
        // Continue with MongoDB delete
      }
    }

    // Delete from MongoDB
    console.log('Attempting to delete student from MongoDB:', lowerEmail);
    const result = await Student.deleteOne({ email: lowerEmail });
    console.log('Student deletion result:', result);
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        error: 'Student not found in database' 
      });
    }

    res.status(200).json({ 
      message: `User ${email} deleted successfully` 
    });
  } catch (err) {
    console.error('Error occurred:', err);
    res.status(500).json({ 
      error: 'Failed to delete user: ' + err.message 
    });
  }
});

// Update user (student) - Keep existing
router.put('/users', async (req, res) => {
  try {
    const { oldEmail, newEmail, type, newPassword, name, program } = req.body;
    console.log('Update request received:', { oldEmail, newEmail, type, name, program });

    if (!oldEmail || !type) {
      return res.status(400).json({ 
        error: 'oldEmail and type (staff/student) are required' 
      });
    }

    if (!newEmail && !newPassword && !name && !program) {
      return res.status(400).json({ 
        error: 'At least one field to update must be provided' 
      });
    }

    if (type !== 'student') {
      return res.status(400).json({ 
        error: 'Type must be "student" for this endpoint' 
      });
    }

    const lowerOldEmail = oldEmail.toLowerCase().trim();

    // Validate new email format if provided
    if (newEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newEmail)) {
        return res.status(400).json({ 
          error: 'Invalid new email format' 
        });
      }
    }

    if (newPassword && newPassword.length < 6) {
      return res.status(400).json({ 
        error: 'New password must be at least 6 characters' 
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

    // Update MongoDB
    const mongoUpdateData = {};
    if (newEmail) mongoUpdateData.email = newEmail.toLowerCase().trim();
    if (name) mongoUpdateData.name = name.trim();
    if (program) mongoUpdateData.program = program.trim();
    
    if (Object.keys(mongoUpdateData).length > 0) {
      await Student.updateOne(
        { email: lowerOldEmail },
        { $set: mongoUpdateData }
      );
      console.log('Student updated in MongoDB');
    }

    res.status(200).json({ 
      message: `User ${newEmail || oldEmail} updated successfully` 
    });
  } catch (err) {
    console.error('Error updating user:', err);
    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ 
        error: 'New email is already in use' 
      });
    }
    res.status(500).json({ 
      error: 'Failed to update user: ' + err.message 
    });
  }
});

// Bulk student creation
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
    const createdFirebaseUsers = []; // Track created users for cleanup
    
    for (const user of users) {
      const { name, email, password, program } = user;
      
      // Validate required fields
      if (!name || !program || !email || !password) {
        results.push({ 
          email: email || 'unknown', 
          success: false, 
          error: 'Missing required fields (name, program, email, password)' 
        });
        continue;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        results.push({ 
          email, 
          success: false, 
          error: 'Invalid email format' 
        });
        continue;
      }

      // Validate password length
      if (password.length < 6) {
        results.push({ 
          email, 
          success: false, 
          error: 'Password must be at least 6 characters' 
        });
        continue;
      }

      const lowerEmail = email.toLowerCase().trim();

      try {
        // Check if exists in Firebase
        try {
          await admin.auth().getUserByEmail(lowerEmail);
          results.push({ 
            email: lowerEmail, 
            success: false, 
            error: 'Email already exists in Firebase' 
          });
          continue;
        } catch (err) {
          if (err.code !== 'auth/user-not-found') {
            results.push({ 
              email: lowerEmail, 
              success: false, 
              error: 'Firebase error: ' + err.message 
            });
            continue;
          }
        }

        // Check if exists in MongoDB
        const existingStudent = await Student.findOne({ email: lowerEmail });
        if (existingStudent) {
          results.push({ 
            email: lowerEmail, 
            success: false, 
            error: 'Email already exists in database' 
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
            success: false, 
            error: 'Firebase creation failed: ' + createErr.message 
          });
          continue;
        }

        // Create in MongoDB with Firebase UID
        const student = new Student({
          studentId: firebaseUser.uid, // Store Firebase UID
          name: name.trim(),
          program: program.trim(),
          email: lowerEmail,
          password: password
        });
        
        await student.save();

        results.push({ 
          email: lowerEmail, 
          success: true,
          studentId: student._id,
          firebaseUid: firebaseUser.uid
        });
      } catch (err) {
        console.error(`Error processing ${email}:`, err);
        results.push({ 
          email: lowerEmail, 
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

module.exports = router;