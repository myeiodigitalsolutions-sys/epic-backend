const Program = require('../models/Program');
const mongoose = require('mongoose');

// Create a new program
exports.createProgram = async (req, res) => {
  try {
    const { name, semester } = req.body;

    // Validate inputs
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Program name is required'
      });
    }

    if (!semester || !mongoose.Types.ObjectId.isValid(semester)) {
      return res.status(400).json({
        success: false,
        error: 'Valid semester is required'
      });
    }

    // Check if program already exists
    const existingProgram = await Program.findOne({
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    if (existingProgram) {
      return res.status(400).json({
        success: false,
        error: 'Program with this name already exists'
      });
    }

    // Create new program
    const program = new Program({
      name: name.trim(),
      semester: semester,
      subjects: [] // Initialize empty subjects array
    });

    await program.save();

    // Populate semester name
    await program.populate('semester', 'name');

    res.status(201).json({
      success: true,
      message: 'Program created successfully',
      program
    });
  } catch (error) {
    console.error('Error creating program:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create program',
      details: error.message
    });
  }
};

// Get all programs
exports.getAllPrograms = async (req, res) => {
  try {
    const programs = await Program.find()
      .populate('semester', 'name')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: programs.length,
      programs
    });
  } catch (error) {
    console.error('Error fetching programs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch programs',
      details: error.message
    });
  }
};

// Get single program by ID
exports.getProgramById = async (req, res) => {
  try {
    const program = await Program.findById(req.params.id)
      .populate('semester', 'name');

    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found'
      });
    }

    res.status(200).json({
      success: true,
      program
    });
  } catch (error) {
    console.error('Error fetching program:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch program',
      details: error.message
    });
  }
};

// Update program
exports.updateProgram = async (req, res) => {
  try {
    const { name, semester } = req.body;

    // Check if program exists
    let program = await Program.findById(req.params.id);
    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found'
      });
    }

    // Check for duplicate name (excluding current program)
    if (name) {
      const duplicateProgram = await Program.findOne({
        _id: { $ne: req.params.id },
        name: { $regex: new RegExp(`^${name}$`, 'i') }
      });
      
      if (duplicateProgram) {
        return res.status(400).json({
          success: false,
          error: 'Another program with this name already exists'
        });
      }
    }

    // Validate semester if provided
    if (semester && !mongoose.Types.ObjectId.isValid(semester)) {
      return res.status(400).json({
        success: false,
        error: 'Valid semester is required'
      });
    }

    // Update program
    if (name) program.name = name.trim();
    if (semester) program.semester = semester;
    program.updatedAt = Date.now();

    await program.save();

    // Populate semester name
    await program.populate('semester', 'name');

    res.status(200).json({
      success: true,
      message: 'Program updated successfully',
      program
    });
  } catch (error) {
    console.error('Error updating program:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update program',
      details: error.message
    });
  }
};

// Delete program
exports.deleteProgram = async (req, res) => {
  try {
    const program = await Program.findById(req.params.id);

    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found'
      });
    }

    await program.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Program deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting program:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete program',
      details: error.message
    });
  }
};

// Add subject to program
exports.addSubject = async (req, res) => {
  try {
    const { programId } = req.params;
    const { name, code } = req.body;

    // Check if program exists
    const program = await Program.findById(programId);
    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found'
      });
    }

    // Check if subject with same code already exists in program
    const existingSubject = program.subjects.find(
      subject => subject.code.toUpperCase() === code.toUpperCase()
    );

    if (existingSubject) {
      return res.status(400).json({
        success: false,
        error: 'Subject with this code already exists in the program'
      });
    }

    // Add new subject with initialized arrays
    program.subjects.push({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      assignedStaff: [], // Initialize as empty array
      enrolledStudents: [], // Initialize as empty array
      createdAt: new Date(),
      updatedAt: new Date()
    });

    program.updatedAt = Date.now();
    await program.save();

    const addedSubject = program.subjects[program.subjects.length - 1];

    res.status(201).json({
      success: true,
      message: 'Subject added successfully',
      subject: addedSubject,
      program
    });
  } catch (error) {
    console.error('Error adding subject:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add subject',
      details: error.message
    });
  }
};

// Get program subjects
exports.getProgramSubjects = async (req, res) => {
  try {
    const { programId } = req.params;

    const program = await Program.findById(programId).populate('semester', 'name');
    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found'
      });
    }

    res.status(200).json({
      success: true,
      subjects: program.subjects || [],
      programName: program.name,
      semesterName: program.semester?.name
    });
  } catch (error) {
    console.error('Error fetching subjects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subjects',
      details: error.message
    });
  }
};

// Assign staff to subject (supports multiple staff)
exports.assignStaffToSubject = async (req, res) => {
  try {
    const { programId, subjectId } = req.params;
    const { staffId, staffName, staffEmail, role } = req.body;

    // Validate inputs
    if (!staffId || !staffEmail) {
      return res.status(400).json({
        success: false,
        error: 'Staff ID and email are required'
      });
    }

    // Check if program exists
    const program = await Program.findById(programId);
    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found'
      });
    }

    // Find the subject
    const subject = program.subjects.id(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      });
    }

    // Initialize assignedStaff if it's null
    if (!subject.assignedStaff) {
      subject.assignedStaff = [];
    }

    // Check if staff is already assigned
    const alreadyAssigned = subject.assignedStaff.some(
      staff => staff.staffEmail === staffEmail
    );

    if (alreadyAssigned) {
      return res.status(400).json({
        success: false,
        error: 'Staff member is already assigned to this subject'
      });
    }

    // Add staff to the subject
    subject.assignedStaff.push({
      staffId,
      staffName: staffName || staffEmail.split('@')[0],
      staffEmail,
      role: role || 'Instructor',
      assignedAt: new Date()
    });

    subject.updatedAt = new Date();
    program.updatedAt = Date.now();

    await program.save();

    // Populate semester information for response
    await program.populate('semester', 'name');

    res.status(200).json({
      success: true,
      message: 'Staff assigned successfully',
      subject,
      program
    });
  } catch (error) {
    console.error('Error assigning staff:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assign staff',
      details: error.message
    });
  }
};

// Remove staff from subject
exports.removeStaffFromSubject = async (req, res) => {
  try {
    const { programId, subjectId, staffId } = req.params;

    const program = await Program.findById(programId);
    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found'
      });
    }

    const subject = program.subjects.id(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      });
    }

    // Initialize assignedStaff if it's null
    if (!subject.assignedStaff) {
      subject.assignedStaff = [];
    }

    // Find and remove the staff
    const staffIndex = subject.assignedStaff.findIndex(
      staff => staff.staffId === staffId
    );

    if (staffIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Staff assignment not found'
      });
    }

    subject.assignedStaff.splice(staffIndex, 1);
    subject.updatedAt = new Date();
    program.updatedAt = Date.now();

    await program.save();

    res.status(200).json({
      success: true,
      message: 'Staff removed successfully',
      subject
    });
  } catch (error) {
    console.error('Error removing staff:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove staff',
      details: error.message
    });
  }
};

// Update staff role
exports.updateStaffRole = async (req, res) => {
  try {
    const { programId, subjectId, staffId } = req.params;
    const { role } = req.body;

    const program = await Program.findById(programId);
    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found'
      });
    }

    const subject = program.subjects.id(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      });
    }

    // Initialize assignedStaff if it's null
    if (!subject.assignedStaff) {
      subject.assignedStaff = [];
    }

    const staff = subject.assignedStaff.find(s => s.staffId === staffId);
    if (!staff) {
      return res.status(404).json({
        success: false,
        error: 'Staff assignment not found'
      });
    }

    staff.role = role || staff.role;
    subject.updatedAt = new Date();
    program.updatedAt = Date.now();

    await program.save();

    res.status(200).json({
      success: true,
      message: 'Staff role updated successfully',
      staff
    });
  } catch (error) {
    console.error('Error updating staff role:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update staff role',
      details: error.message
    });
  }
};

// Enroll student to subject
exports.enrollStudentToSubject = async (req, res) => {
  try {
    const { programId, subjectId } = req.params;
    const { studentId, studentName, studentEmail, regNo } = req.body;

    // Validate inputs
    if (!studentId || !studentEmail) {
      return res.status(400).json({
        success: false,
        error: 'Student ID and email are required'
      });
    }

    // Check if program exists
    const program = await Program.findById(programId);
    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found'
      });
    }

    // Find the subject
    const subject = program.subjects.id(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      });
    }

    // Initialize enrolledStudents if it's null
    if (!subject.enrolledStudents) {
      subject.enrolledStudents = [];
    }

    // Check if student is already enrolled
    const alreadyEnrolled = subject.enrolledStudents.some(
      student => student.studentEmail === studentEmail
    );

    if (alreadyEnrolled) {
      return res.status(400).json({
        success: false,
        error: 'Student is already enrolled in this subject'
      });
    }

    // Add student to the subject
    subject.enrolledStudents.push({
      studentId,
      studentName: studentName || studentEmail.split('@')[0],
      studentEmail,
      regNo: regNo || '',
      enrolledAt: new Date()
    });

    subject.updatedAt = new Date();
    program.updatedAt = Date.now();

    await program.save();

    // Populate semester information for response
    await program.populate('semester', 'name');

    res.status(200).json({
      success: true,
      message: 'Student enrolled successfully',
      subject,
      program
    });
  } catch (error) {
    console.error('Error enrolling student:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enroll student',
      details: error.message
    });
  }
};

// Remove student from subject
exports.removeStudentFromSubject = async (req, res) => {
  try {
    const { programId, subjectId, studentEmail } = req.params;

    const program = await Program.findById(programId);
    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found'
      });
    }

    const subject = program.subjects.id(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      });
    }

    // Initialize enrolledStudents if it's null
    if (!subject.enrolledStudents) {
      subject.enrolledStudents = [];
    }

    // Find and remove the student
    const studentIndex = subject.enrolledStudents.findIndex(
      student => student.studentEmail === studentEmail
    );

    if (studentIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Student enrollment not found'
      });
    }

    subject.enrolledStudents.splice(studentIndex, 1);
    subject.updatedAt = new Date();
    program.updatedAt = Date.now();

    await program.save();

    res.status(200).json({
      success: true,
      message: 'Student removed successfully',
      subject
    });
  } catch (error) {
    console.error('Error removing student:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove student',
      details: error.message
    });
  }
};

// Get enrolled students for a subject
exports.getEnrolledStudents = async (req, res) => {
  try {
    const { programId, subjectId } = req.params;

    const program = await Program.findById(programId);
    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found'
      });
    }

    const subject = program.subjects.id(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      });
    }

    res.status(200).json({
      success: true,
      students: subject.enrolledStudents || [],
      count: subject.enrolledStudents?.length || 0
    });
  } catch (error) {
    console.error('Error fetching enrolled students:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch enrolled students',
      details: error.message
    });
  }
};

// Delete subject from program
exports.deleteSubject = async (req, res) => {
  try {
    const { programId, subjectId } = req.params;

    const program = await Program.findById(programId);
    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found'
      });
    }

    // Find and remove the subject
    const subjectIndex = program.subjects.findIndex(
      subject => subject._id.toString() === subjectId
    );

    if (subjectIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      });
    }

    program.subjects.splice(subjectIndex, 1);
    program.updatedAt = Date.now();
    await program.save();

    res.status(200).json({
      success: true,
      message: 'Subject deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting subject:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete subject',
      details: error.message
    });
  }
};

// Update subject
exports.updateSubject = async (req, res) => {
  try {
    const { programId, subjectId } = req.params;
    const { name, code } = req.body;

    const program = await Program.findById(programId);
    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found'
      });
    }

    const subject = program.subjects.id(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      });
    }

    // Check for duplicate subject code (excluding current subject)
    if (code) {
      const duplicateSubject = program.subjects.find(
        sub => 
          sub._id.toString() !== subjectId && 
          sub.code.toUpperCase() === code.toUpperCase()
      );

      if (duplicateSubject) {
        return res.status(400).json({
          success: false,
          error: 'Another subject with this code already exists in the program'
        });
      }
    }

    // Update subject
    if (name) subject.name = name.trim();
    if (code) subject.code = code.trim().toUpperCase();
    subject.updatedAt = new Date();
    program.updatedAt = Date.now();

    await program.save();

    res.status(200).json({
      success: true,
      message: 'Subject updated successfully',
      subject
    });
  } catch (error) {
    console.error('Error updating subject:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update subject',
      details: error.message
    });
  }
};

// Get subjects assigned to a staff member by email
exports.getStaffAssignedSubjects = async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Staff email is required'
      });
    }

    // Find all programs
    const programs = await Program.find().populate('semester', 'name');
    
    let assignedSubjects = [];
    
    // Check each program for subjects where staff is assigned
    for (const program of programs) {
      for (const subject of program.subjects) {
        if (subject.assignedStaff && Array.isArray(subject.assignedStaff)) {
          const isAssigned = subject.assignedStaff.some(
            staff => staff.staffEmail === email
          );
          
          if (isAssigned) {
            assignedSubjects.push({
              _id: subject._id,
              name: subject.name,
              code: subject.code,
              programId: program._id,
              programName: program.name,
              semesterId: program.semester?._id,
              semesterName: program.semester?.name || 'Unknown Semester',
              assignedStaff: subject.assignedStaff,
              enrolledStudents: subject.enrolledStudents || [],
              assignedAt: subject.assignedStaff?.find(s => s.staffEmail === email)?.assignedAt,
              createdAt: subject.createdAt,
              updatedAt: subject.updatedAt
            });
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      count: assignedSubjects.length,
      subjects: assignedSubjects
    });
  } catch (error) {
    console.error('Error fetching staff assigned subjects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch assigned subjects',
      details: error.message
    });
  }
};

// Get subjects where a student is enrolled by email
exports.getStudentEnrolledSubjects = async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Student email is required'
      });
    }

    // Find all programs
    const programs = await Program.find().populate('semester', 'name');
    
    let enrolledSubjects = [];
    
    // Check each program for subjects where student is enrolled
    for (const program of programs) {
      for (const subject of program.subjects) {
        if (subject.enrolledStudents && Array.isArray(subject.enrolledStudents)) {
          const isEnrolled = subject.enrolledStudents.some(
            student => student.studentEmail === email
          );
          
          if (isEnrolled) {
            enrolledSubjects.push({
              _id: subject._id,
              name: subject.name,
              code: subject.code,
              programId: program._id,
              programName: program.name,
              semesterId: program.semester?._id,
              semesterName: program.semester?.name || 'Unknown Semester',
              assignedStaff: subject.assignedStaff || [],
              enrolledAt: subject.enrolledStudents?.find(s => s.studentEmail === email)?.enrolledAt,
              createdAt: subject.createdAt,
              updatedAt: subject.updatedAt
            });
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      count: enrolledSubjects.length,
      subjects: enrolledSubjects
    });
  } catch (error) {
    console.error('Error fetching student enrolled subjects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch enrolled subjects',
      details: error.message
    });
  }
};

// Get programs by semester
exports.getProgramsBySemester = async (req, res) => {
  try {
    const { semesterId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(semesterId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid semester ID'
      });
    }

    const programs = await Program.find({ semester: semesterId })
      .populate('semester', 'name')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: programs.length,
      programs
    });
  } catch (error) {
    console.error('Error fetching programs by semester:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch programs',
      details: error.message
    });
  }
};