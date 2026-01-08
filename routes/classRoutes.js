const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Class = require('../models/Class');
const Staff = require('../models/Staff');
const Student = require('../models/StudentV2');

function extractNameFromEmail(email) {
  if (!email) return 'Unknown User';
  const username = email.split('@')[0];
  const cleanName = username.replace(/[0-9._-]+/g, ' ');
  return cleanName.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim() || 'Unknown User';
}

router.post('/', async (req, res) => {
  try {
    const { name, section, subject, teacher, staffId, email } = req.body;

    if (!name || !staffId || !email) {
      return res.status(400).json({ 
        success: false,
        error: 'Class name, staff ID, and email are required' 
      });
    }

    const newClass = new Class({
      name,
      section,
      subject,
      teacher: teacher || '',
      staffId,
      color: req.body.color || 'blue',
      staff: [{
        staffId,
        name: teacher || email.split('@')[0] || 'Unknown',
        email,
        joinedAt: new Date()
      }],
      students: []
    });

    await newClass.save();
    
    res.status(201).json({
      success: true,
      class: newClass
    });
  } catch (error) {
    console.error('Error creating class:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      error: `Failed to create class: ${error.message}`
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const { staffId } = req.query;
    
    let query = {};
    if (staffId) {
      query.$or = [
        { staffId },
        { 'staff.staffId': staffId }
      ];
    }

    const classes = await Class.find(query).sort({ createdAt: -1 });
    res.json({ 
      success: true,
      classes 
    });
  } catch (error) {
    console.error('Error fetching classes:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      error: `Failed to fetch classes: ${error.message}`
    });
  }
});

router.post('/join', async (req, res) => {
  try {
    const { classCode, studentId, name, email } = req.body;
    if (!classCode || !studentId || !email) {
      return res.status(400).json({ 
        success: false,
        error: 'Class code, student ID, and email are required' 
      });
    }

    const classToJoin = await Class.findById(classCode);
    if (!classToJoin) {
      return res.status(404).json({ 
        success: false,
        error: 'Class not found' 
      });
    }

    const alreadyJoined = classToJoin.students.some(
      student => student.studentId === studentId
    );

    if (alreadyJoined) {
      return res.status(400).json({  
        success: false,
        error: 'Student already joined this class' 
      });
    }
    classToJoin.students.push({
      studentId,
      name: name || email.split('@')[0] || 'Unknown',
      email,
      joinedAt: new Date()
    });

    await classToJoin.save();

    res.status(200).json({ 
      success: true,
      class: classToJoin,
      message: 'Successfully joined class'
    });
  } catch (error) {
    console.error('Error joining class:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      error: `Failed to join class: ${error.message}`
    });
  }
});

router.get('/:id/verify', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid ID format' 
      });
    }

    const classToShare = await Class.findById(req.params.id);
    if (!classToShare) {
      return res.status(404).json({ 
        success: false,
        error: 'Class not found' 
      });
    }

    res.json({ 
      success: true,
      class: classToShare,
      message: 'Class verified and ready for sharing'
    });
  } catch (error) {
    console.error('Error verifying class:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      error: `Failed to verify class: ${error.message}`
    });
  }
});

router.get('/:classId/staff/:staffId', async (req, res) => {
  try {
    const { classId, staffId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid class ID format' 
      });
    }

    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ 
        success: false,
        error: 'Class not found' 
      });
    }

    const isAuthorized = classData.staffId === staffId || classData.staff.some(s => s.staffId === staffId);
    if (!isAuthorized) {
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized: Staff member does not have access to this class' 
      });
    }

    res.json({ 
      success: true,
      class: classData 
    });
  } catch (error) {
    console.error('Error fetching class details:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      error: `Failed to fetch class details: ${error.message}`
    });
  }
});

router.get('/:classId/people/staff/:staffId', async (req, res) => {
  try {
    const { classId, staffId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid class ID format' 
      });
    }

    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ 
        success: false,
        error: 'Class not found' 
      });
    }

    const isAuthorized = classData.staffId === staffId || classData.staff.some(s => s.staffId === staffId);
    if (!isAuthorized) {
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized: Staff member does not have access to this class' 
      });
    }

    const people = [
      ...(classData.staff || []).map(s => ({
        id: s.staffId,
        name: s.name || extractNameFromEmail(s.email),
        email: s.email || 'N/A',
        role: 'staff',
        pinned: false
      })),
      ...(classData.students || []).map(s => ({
        id: s.studentId,
        name: s.name || extractNameFromEmail(s.email),
        email: s.email || 'N/A',
        role: 'student',
        pinned: false
      }))
    ];

    res.json({ 
      success: true,
      people,
      className: classData.name
    });
  } catch (error) {
    console.error('Error fetching people:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      error: `Failed to fetch people: ${error.message}`
    });
  }
});

router.post('/:classId/invite/staff/:staffId', async (req, res) => {
  try {
    const { classId, staffId } = req.params;
    const { email, role } = req.body;

    console.log('Adding staff to class:', { classId, staffId, email });

    if (!mongoose.Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid class ID format' 
      });
    }

    if (!email || !role) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and role are required' 
      });
    }

    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ 
        success: false,
        error: 'Class not found' 
      });
    }

    const isAuthorized = classData.staffId === staffId || classData.staff.some(s => s.staffId === staffId);
    if (!isAuthorized) {
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized: You do not have permission to add staff to this class' 
      });
    }

    const staffToAdd = await Staff.findOne({ email: email.toLowerCase() });
    if (!staffToAdd) {
      return res.status(404).json({ 
        success: false,
        error: 'Staff not found. Please ensure they are registered in the system via admin page first.' 
      });
    }

    const alreadyExists = classData.staff.some(s => s.staffId === staffToAdd.staffId || s.email === email.toLowerCase());
    if (alreadyExists) {
      return res.status(400).json({ 
        success: false,
        error: 'This staff member is already in the class' 
      });
    }

    classData.staff.push({
      staffId: staffToAdd.staffId,
      name: staffToAdd.name || email.split('@')[0],
      email: email.toLowerCase(),
      joinedAt: new Date()
    });

    await classData.save();

    res.json({ 
      success: true,
      person: {
        id: staffToAdd.staffId,
        name: staffToAdd.name || email.split('@')[0],
        email: email.toLowerCase(),
        role: 'staff'
      },
      message: `Staff member ${staffToAdd.name} added successfully to class`
    });

  } catch (error) {
    console.error('Error inviting staff:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      error: `Failed to add staff member: ${error.message}`
    });
  }
});

router.delete('/:classId/people/:personId/staff/:staffId', async (req, res) => {
  try {
    const { classId, personId, staffId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid class ID format' 
      });
    }

    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ 
        success: false,
        error: 'Class not found' 
      });
    }

    const isAuthorized = classData.staffId === staffId || classData.staff.some(s => s.staffId === staffId);
    if (!isAuthorized) {
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized: Staff member does not have access to this class' 
      });
    }

    const staffIndex = classData.staff.findIndex(s => s.staffId === personId);
    const studentIndex = classData.students.findIndex(s => s.studentId === personId);

    if (staffIndex === -1 && studentIndex === -1) {
      return res.status(404).json({ 
        success: false,
        error: 'Person not found in this class' 
      });
    }

    if (staffIndex !== -1) {
      classData.staff.splice(staffIndex, 1);
    } else {
      classData.students.splice(studentIndex, 1);
    }

    await classData.save();

    res.json({ 
      success: true,
      message: 'Person removed successfully'
    });
  } catch (error) {
    console.error('Error removing person:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      error: `Failed to remove person: ${error.message}`
    });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid ID format' 
      });
    }

    const updatedClass = await Class.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updatedClass) {
      return res.status(404).json({ 
        success: false,
        error: 'Class not found' 
      });
    }

    res.json({ 
      success: true,
      class: updatedClass 
    });
  } catch (error) {
    console.error('Error updating class:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      error: `Failed to update class: ${error.message}`
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid ID format' 
      });
    }

    const deletedClass = await Class.findByIdAndDelete(req.params.id);
    if (!deletedClass) {
      return res.status(404).json({ 
        success: false,
        error: 'Class not found' 
      });
    }

    res.json({ 
      success: true,
      message: 'Class deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting class:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      error: `Failed to delete class: ${error.message}`
    });
  }
});

router.get('/:classId/students/:studentId', async (req, res) => {
  try {
    const { classId, studentId } = req.params;
    const { email } = req.query;

    const classData = await Class.findById(classId);
    if (!classData) {
      return res.json({ isEnrolled: false });
    }

    const isEnrolled = classData.students.some(s => 
      s.studentId === studentId || s.email === email
    );

    res.json({ isEnrolled });
    
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: 'Enrollment check failed' 
    });
  }
});

router.get('/:classId/people/student/:studentId', async (req, res) => {
  try {
    const { classId, studentId } = req.params;
    const { email } = req.query;

    if (!email || email === 'undefined') {
      return res.status(400).json({ 
        success: false,
        error: 'Valid email is required' 
      });
    }

    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ 
        success: false,
        error: 'Class not found' 
      });
    }

    const isEnrolled = classData.students.some(student => 
      (student.studentId === studentId || student.email === email)
    );

    if (!isEnrolled) {
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized: Student not enrolled in this class' 
      });
    }

    const response = {
      success: true,
      people: [
        ...(classData.staff || []).map(s => ({
          id: s.staffId,
          name: s.name,
          email: s.email,
          role: 'staff'
        })),
        ...(classData.students || []).map(s => ({
          id: s.studentId,
          name: s.name,
          email: s.email,
          role: 'student'
        }))
      ],
      className: classData.name
    };

    res.json(response);

  } catch (error) {
    console.error('Error in /people route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error while fetching class people' 
    });
  }
});

router.post('/:classId/people/staff/:staffId', async (req, res) => {
  try {
    const { classId, staffId } = req.params;
    const { studentEmail } = req.body;

    if (!studentEmail) {
      return res.status(400).json({ 
        success: false,
        error: 'Student email is required' 
      });
    }

    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ 
        success: false,
        error: 'Class not found' 
      });
    }

    const isAuthorized = classData.staffId === staffId || classData.staff.some(s => s.staffId === staffId);
    if (!isAuthorized) {
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized: Staff member does not have access to this class' 
      });
    }

    const student = await Student.findOne({ email: studentEmail });
    if (!student) {
      return res.status(404).json({ 
        success: false,
        error: 'Student not found with the provided email' 
      });
    }

    const alreadyJoined = classData.students.some(s => s.studentId === student._id.toString());
    if (alreadyJoined) {
      return res.status(400).json({ 
        success: false,
        error: 'Student is already in the classroom' 
      });
    }

    classData.students.push({
      studentId: student._id.toString(),
      name: student.name || studentEmail.split('@')[0] || 'Unknown',
      email: studentEmail,
      joinedAt: new Date()
    });
    await classData.save();

    res.status(200).json({ 
      success: true,
      message: `Student ${student.email} successfully added to class ${classId}`,
      data: { studentId: student._id, classroomId: classId }
    });
  } catch (err) {
    console.error('Error adding student to classroom:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to add student: ' + err.message 
    });
  }
});

router.get('/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { email } = req.query;
    console.log('GET /student/:studentId - studentId:', studentId, 'email:', email);

    if (!email || email === 'undefined') {
      console.error('Invalid email provided:', email);
      return res.status(400).json({ 
        success: false,
        error: 'Valid email query parameter is required' 
      });
    }

    const studentClasses = await Class.find({
      'students.email': email
    }).sort({ createdAt: -1 });

    console.log('Found classes:', studentClasses);
    res.json({ 
      success: true,
      classes: studentClasses 
    });
  } catch (error) {
    console.error('Error fetching student classes:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      error: `Failed to fetch student classes: ${error.message}`
    });
  }
});

router.post('/:classId/people/bulk/staff/:staffId', async (req, res) => {
  try {
    const { classId, staffId } = req.params;
    const { studentEmails } = req.body;

    if (!studentEmails || !Array.isArray(studentEmails)) {
      return res.status(400).json({ 
        success: false,
        error: 'Student emails array is required' 
      });
    }

    const uniqueEmails = [...new Set(studentEmails.map(email => email?.toLowerCase()))].filter(email => email);

    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ 
        success: false,
        error: 'Class not found' 
      });
    }

    const isAuthorized = classData.staffId === staffId || classData.staff.some(s => s.staffId === staffId);
    if (!isAuthorized) {
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized: Staff member does not have access to this class' 
      });
    }

    const addedStudents = [];
    const skippedEmails = [];

    for (const email of uniqueEmails) {
      try {
        if (!email || !email.endsWith('@gmail.com')) {
          skippedEmails.push(email);
          continue;
        }

        const student = await Student.findOne({ email });
        if (!student) {
          skippedEmails.push(email);
          continue;
        }

        const alreadyJoined = classData.students.some(s => 
          s.studentId === student._id.toString() || s.email.toLowerCase() === email.toLowerCase()
        );
        if (alreadyJoined) {
          skippedEmails.push(email);
          continue;
        }

        classData.students.push({
          studentId: student._id.toString(),
          name: student.name || email.split('@')[0] || 'Unknown',
          email,
          joinedAt: new Date()
        });

        addedStudents.push({
          studentId: student._id.toString(),
          email,
          name: student.name || email.split('@')[0] || 'Unknown'
        });
      } catch (error) {
        console.error(`Error processing email ${email}:`, error.message);
        skippedEmails.push(email);
      }
    }

    await classData.save();

    res.status(200).json({ 
      success: true,
      addedStudents,
      skippedEmails,
      message: `${addedStudents.length} student${addedStudents.length === 1 ? '' : 's'} added successfully`
    });
  } catch (error) {
    console.error('Error in bulk student addition:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      error: `Failed to add students: ${error.message}`
    });
  }
});

module.exports = router;