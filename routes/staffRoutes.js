// routes/staffRoutes.js
const express = require('express');
const mongoose = require('mongoose'); // kept from new file (even if unused)
const router = express.Router();
const admin = require('firebase-admin');

// Models
const Staff = require('../models/Staff');
const Student = require('../models/StudentV2');

// Common email regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ===============================
// GET all staff
// ===============================
router.get('/', async (req, res) => {
  try {
    const staff = await Staff.find().sort({ createdAt: -1 });
    res.status(200).json(staff);
  } catch (err) {
    console.error('Error fetching staff:', err);
    res.status(500).json({
      error: 'Failed to fetch staff: ' + err.message,
    });
  }
});

// ===============================
// GET all students (from old file)
// ===============================
router.get('/students', async (req, res) => {
  try {
    const students = await Student.find().sort({ createdAt: -1 });
    res.json(students);
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// ===============================
// ADD SINGLE STAFF — POST /api/staff/staff
// Combined: old + new logic
// ===============================
router.post('/staff', async (req, res) => {
  let firebaseUser = null;

  try {
    const { name, department, email, password } = req.body;

    console.log('Adding staff with data:', {
      name,
      department,
      email,
      password: password ? '***' : 'undefined',
    });

    if (!name || !department || !email || !password) {
      return res.status(400).json({
        error: 'Name, department, email, and password are required',
      });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be 6+ chars' });
    }

    const lowerEmail = email.toLowerCase().trim();

    // Prevent duplicates in MongoDB (old + new behavior)
    const existingStaff = await Staff.findOne({ email: lowerEmail });
    if (existingStaff) {
      return res.status(400).json({
        error: 'Staff email already exists in database',
      });
    }

    // Check if user exists in Firebase first (new behavior)
    try {
      firebaseUser = await admin.auth().getUserByEmail(lowerEmail);
      console.log('Firebase user already exists:', firebaseUser.uid);
    } catch (firebaseErr) {
      if (firebaseErr.code === 'auth/user-not-found') {
        // Create Firebase Auth user (old + new behavior)
        try {
          firebaseUser = await admin.auth().createUser({
            email: lowerEmail,
            password,
            displayName: name.trim(),
            emailVerified: false,
            disabled: false,
          });
          console.log('Firebase user created:', firebaseUser.uid);
        } catch (createErr) {
          console.error('Error creating Firebase user:', createErr);
          if (createErr.code === 'auth/email-already-exists') {
            return res
              .status(400)
              .json({ error: 'Email already exists in Firebase' });
          }
          throw createErr;
        }
      } else {
        throw firebaseErr;
      }
    }

    // Save to MongoDB with Firebase UID as staffId
    const staff = new Staff({
      staffId: firebaseUser.uid,
      name: name.trim(),
      department: department.trim(),
      email: lowerEmail,
      password, // stored for export only
    });

    await staff.save();
    console.log('Staff saved to MongoDB:', staff._id);

    res.status(201).json({
      message: 'Staff member added successfully',
      data: {
        ...staff.toObject(),
        firebaseUid: firebaseUser.uid,
      },
    });
  } catch (err) {
    console.error('Error adding staff:', err);

    // Cleanup Firebase user if Mongo fails (from old file)
    if (firebaseUser) {
      try {
        await admin.auth().deleteUser(firebaseUser.uid);
      } catch (_) {
        // ignore cleanup error
      }
    }

    if (err.code === 11000) {
      return res
        .status(400)
        .json({ error: 'Staff email already exists in database' });
    }
    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'Email already registered' });
    }

    res.status(500).json({
      error: 'Failed to add staff: ' + err.message,
    });
  }
});

// ===============================
// Get all users from Firebase (new)
// ===============================
router.get('/users', async (req, res) => {
  try {
    const listUsersResult = await admin.auth().listUsers();
    const users = listUsersResult.users.map(user => ({
      email: user.email,
      uid: user.uid,
      displayName: user.displayName,
    }));
    res.status(200).json(users);
  } catch (err) {
    console.error('Error fetching Firebase users:', err);
    res.status(500).json({
      error: 'Failed to fetch Firebase users: ' + err.message,
    });
  }
});

// ===============================
// Get staff by email (for class invitation) (new)
// ===============================
router.get('/email/:email', async (req, res) => {
  try {
    const staff = await Staff.findOne({
      email: req.params.email.toLowerCase(),
    });
    if (!staff) {
      return res.status(404).json({
        success: false,
        error: 'Staff not found with this email',
      });
    }
    res.json({
      success: true,
      staff,
    });
  } catch (error) {
    console.error('Error finding staff by email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to find staff',
    });
  }
});

// ===============================
// DELETE USER (staff or student) — from old file & new merged
// DELETE /api/staff/users
// ===============================
router.delete('/users', async (req, res) => {
  try {
    const { email, type } = req.body;
    console.log('Delete request received:', { email, type });

    if (!email || !type) {
      return res.status(400).json({
        error: 'Email and type (staff/student) are required',
      });
    }

    if (!['staff', 'student'].includes(type)) {
      return res.status(400).json({
        error: 'Type must be either "staff" or "student"',
      });
    }

    const lowerEmail = email.toLowerCase().trim();

    // Delete from Firebase (both versions)
    try {
      const fbUser = await admin.auth().getUserByEmail(lowerEmail);
      await admin.auth().deleteUser(fbUser.uid);
      console.log('User deleted from Firebase:', fbUser.uid);
    } catch (firebaseErr) {
      if (firebaseErr.code === 'auth/user-not-found') {
        console.log('User not found in Firebase, continuing with MongoDB delete');
      } else {
        console.error('Error deleting from Firebase:', firebaseErr);
      }
    }

    // Delete from MongoDB (both versions)
    const Model = type === 'staff' ? Staff : Student;
    const result = await Model.deleteOne({ email: lowerEmail });
    console.log(`${type} deletion result:`, result);

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: `${type} not found in database` });
    }

    res.status(200).json({
      message: `User ${email} deleted successfully`,
    });
  } catch (err) {
    console.error('Error occurred:', err);
    res.status(500).json({
      error: 'Failed to delete user: ' + err.message,
    });
  }
});

// ===============================
// UPDATE USER (staff or student) — PUT /api/staff/users
// Combined old + new
// ===============================
router.put('/users', async (req, res) => {
  try {
    const {
      oldEmail,
      newEmail,
      newPassword,
      name,
      department,
      program,
      type,
    } = req.body;

    console.log('Update request received:', {
      oldEmail,
      newEmail,
      type,
      name,
      program,
      department,
    });

    if (!oldEmail || !type || !['staff', 'student'].includes(type)) {
      return res
        .status(400)
        .json({ error: 'oldEmail and valid type (staff|student) required' });
    }

    if (!newEmail && !newPassword && !name && !department && !program) {
      return res.status(400).json({
        error: 'At least one field to update must be provided',
      });
    }

    const lowerOld = oldEmail.toLowerCase().trim();

    // Validate new email if provided
    if (newEmail && !emailRegex.test(newEmail)) {
      return res.status(400).json({ error: 'Invalid new email format' });
    }

    if (newPassword && newPassword.length < 6) {
      return res.status(400).json({
        error: 'New password must be at least 6 characters',
      });
    }

    // Get Firebase user by old email
    let fbUser;
    try {
      fbUser = await admin.auth().getUserByEmail(lowerOld);
      console.log('Firebase user found:', fbUser.uid);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        return res.status(404).json({ error: 'User not found in Firebase' });
      }
      throw err;
    }

    // Check if new email is already in use in Firebase
    if (newEmail && newEmail.toLowerCase().trim() !== lowerOld) {
      try {
        await admin.auth().getUserByEmail(newEmail.toLowerCase().trim());
        return res.status(400).json({
          error: 'New email is already in use',
        });
      } catch (err) {
        if (err.code !== 'auth/user-not-found') throw err;
      }
    }

    // Prepare Firebase update
    const fbUpdate = {};
    if (newEmail) fbUpdate.email = newEmail.toLowerCase().trim();
    if (newPassword) fbUpdate.password = newPassword;
    if (name) fbUpdate.displayName = name.trim();

    if (Object.keys(fbUpdate).length > 0) {
      await admin.auth().updateUser(fbUser.uid, fbUpdate);
      console.log('User updated in Firebase:', fbUser.uid);
    }

    // Prepare Mongo update
    const mongoUpdate = {};
    if (newEmail) mongoUpdate.email = newEmail.toLowerCase().trim();
    if (name) mongoUpdate.name = name.trim();
    if (type === 'staff' && department) mongoUpdate.department = department.trim();
    if (type === 'student' && program) mongoUpdate.program = program.trim();

    if (Object.keys(mongoUpdate).length > 0) {
      const Model = type === 'staff' ? Staff : Student;
      await Model.updateOne({ email: lowerOld }, { $set: mongoUpdate });
      console.log(`${type} updated in MongoDB`);
    }

    res.status(200).json({
      message: `User ${newEmail || oldEmail} updated successfully`,
    });
  } catch (err) {
    console.error('Error updating user:', err);
    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({
        error: 'New email is already in use',
      });
    }
    res.status(500).json({
      error: 'Failed to update user: ' + err.message,
    });
  }
});

// ===============================
// BULK UPLOAD — POST /api/staff/bulk-users?type=staff|student
// Merged old + new (kept summary + optional cleanup)
// ===============================
router.post('/bulk-users', async (req, res) => {
  try {
    const type = req.query.type; // "staff" or "student"
    const users = req.body.users;

    if (!type || !['staff', 'student'].includes(type)) {
      return res.status(400).json({
        error: 'type query param must be "staff" or "student"',
      });
    }
    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        error: 'users array is required',
      });
    }

    const results = [];
    const createdUids = []; // from old file for optional cleanup

    for (const user of users) {
      let { name, email, password, department, program } = user;

      email = email?.toLowerCase().trim();

      // Validate required fields based on type
      if (type === 'staff') {
        if (!name || !department || !email || !password) {
          results.push({
            email: email || 'unknown',
            success: false,
            error: 'Missing required fields (name, department, email, password)',
          });
          continue;
        }
      } else {
        if (!name || !program || !email || !password) {
          results.push({
            email: email || 'unknown',
            success: false,
            error: 'Missing required fields (name, program, email, password)',
          });
          continue;
        }
      }

      if (!emailRegex.test(email)) {
        results.push({
          email,
          success: false,
          error: 'Invalid email format',
        });
        continue;
      }

      if (password.length < 6) {
        results.push({
          email,
          success: false,
          error: 'Password must be at least 6 characters',
        });
        continue;
      }

      try {
        // Check if user exists in Firebase
        let firebaseUser;
        try {
          firebaseUser = await admin.auth().getUserByEmail(email);
          console.log('Firebase user already exists:', email);
        } catch (err) {
          if (err.code === 'auth/user-not-found') {
            // Create Firebase user
            try {
              firebaseUser = await admin.auth().createUser({
                email,
                password,
                displayName: name.trim(),
                emailVerified: false,
                disabled: false,
              });
              createdUids.push(firebaseUser.uid);
              console.log('Firebase user created:', email);
            } catch (createErr) {
              console.error(`Firebase error for ${email}:`, createErr);
              results.push({
                email,
                success: false,
                error: `Firebase error: ${createErr.message}`,
              });
              continue;
            }
          } else {
            throw err;
          }
        }

        // Save to MongoDB
        if (type === 'staff') {
          const existingStaff = await Staff.findOne({ email });
          if (existingStaff) {
            results.push({
              email,
              success: false,
              error: 'Staff already exists in database',
            });
            continue;
          }

          const staff = new Staff({
            staffId: firebaseUser.uid,
            name: name.trim(),
            department: department.trim(),
            email,
            password,
          });
          await staff.save();
        } else {
          const existingStudent = await Student.findOne({ email });
          if (existingStudent) {
            results.push({
              email,
              success: false,
              error: 'Student already exists in database',
            });
            continue;
          }

          const student = new Student({
            studentId: firebaseUser.uid,
            name: name.trim(),
            program: program.trim(),
            email,
            password,
          });
          await student.save();
        }

        results.push({ email, success: true });
      } catch (err) {
        console.error(`Error processing ${email}:`, err);
        results.push({
          email,
          success: false,
          error: err.message || 'Failed',
        });
      }
    }

    // Optional cleanup on partial failure (from old file)
    if (results.some(r => !r.success) && createdUids.length > 0) {
      createdUids.forEach(uid =>
        admin.auth().deleteUser(uid).catch(() => {})
      );
    }

    res.json({
      message: `Bulk ${type} upload completed`,
      results,
      summary: {
        total: results.length,
        success: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      },
    });
  } catch (err) {
    console.error('Bulk upload error:', err);
    res.status(500).json({
      error: 'Bulk upload failed: ' + err.message,
    });
  }
});

// ===============================
// Get staff by ID — GET /:id (new)
// ===============================
router.get('/:id', async (req, res) => {
  try {
    const staff = await Staff.findOne({ staffId: req.params.id });
    if (!staff) {
      return res.status(404).json({
        success: false,
        error: 'Staff not found',
      });
    }
    res.json({
      success: true,
      staff,
    });
  } catch (error) {
    console.error('Error getting staff:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
    });
  }
});

// ===============================
// Update staff by ID — PUT /:id (new)
// ===============================
router.put('/:id', async (req, res) => {
  try {
    const { name, email, position, department, phone } = req.body;

    const staff = await Staff.findOne({ staffId: req.params.id });
    if (!staff) {
      return res.status(404).json({
        success: false,
        error: 'Staff not found',
      });
    }

    if (name) staff.name = name;
    if (email) staff.email = email.toLowerCase();
    if (position) staff.position = position;
    if (department) staff.department = department;
    if (phone) staff.phone = phone;

    await staff.save();

    res.json({
      success: true,
      staff,
      message: 'Staff updated successfully',
    });
  } catch (error) {
    console.error('Error updating staff:', error);
    res.status(500).json({
      success: false,
      error: `Failed to update staff: ${error.message}`,
    });
  }
});

// ===============================
// Delete staff by ID — DELETE /:id (new)
// ===============================
router.delete('/:id', async (req, res) => {
  try {
    const staff = await Staff.findOne({ staffId: req.params.id });
    if (!staff) {
      return res.status(404).json({
        success: false,
        error: 'Staff not found',
      });
    }

    // Delete from Firebase
    try {
      await admin.auth().deleteUser(req.params.id);
      console.log('User deleted from Firebase:', req.params.id);
    } catch (firebaseErr) {
      console.error('Error deleting from Firebase:', firebaseErr);
      // continue even if Firebase delete fails
    }

    // Delete from MongoDB
    await Staff.deleteOne({ staffId: req.params.id });

    res.json({
      success: true,
      message: 'Staff deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting staff:', error);
    res.status(500).json({
      success: false,
      error: `Failed to delete staff: ${error.message}`,
    });
  }
});

module.exports = router;
