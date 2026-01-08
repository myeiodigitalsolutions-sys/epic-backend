const School = require('../models/school.model');
const Student = require('../models/student.model');

exports.getAllSchools = async (req, res) => {
  try {
    console.log('Fetching all schools...');
    const schools = await School.find({})
      .populate({
        path: 'programs.semesters.students',
        select: 'email uid firstName lastName',
      })
      .lean();
    if (!schools.length) {
      console.log('No schools found');
      return res.status(404).json({ message: 'No schools found' });
    }
    console.log('Schools fetched:', schools.length);
    res.json(schools);
  } catch (error) {
    console.error('Error fetching schools:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

exports.getSchoolById = async (req, res) => {
  const { id } = req.params;
  try {
    console.log('Fetching school with ID:', id);
    const school = await School.findById(id)
      .populate({
        path: 'programs.semesters.students',
        select: 'email uid firstName lastName',
      })
      .lean();
    if (!school) {
      console.log('School not found for ID:', id);
      return res.status(404).json({ error: 'School not found' });
    }
    console.log('School fetched:', school.name);
    res.json(school);
  } catch (error) {
    console.error('Error fetching school:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

exports.createSchool = async (req, res) => {
  const { name } = req.body;
  try {
    console.log('Creating school with name:', name);
    if (!name || typeof name !== 'string' || name.trim() === '') {
      console.log('Invalid school name provided');
      return res.status(400).json({ error: 'Valid school name is required' });
    }
    const existingSchool = await School.findOne({ name: name.trim() });
    if (existingSchool) {
      console.log('School already exists:', name);
      return res.status(400).json({ error: 'School with this name already exists' });
    }
    const newSchool = new School({
      name: name.trim(),
      programs: [],
    });
    await newSchool.save();
    console.log('School created:', newSchool.name);
    res.status(201).json(newSchool);
  } catch (error) {
    console.error('Error creating school:', error.message);
    res.status(400).json({ error: `Failed to create school: ${error.message}` });
  }
};

exports.updateSchool = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    console.log('Updating school with ID:', id);
    if (!name || typeof name !== 'string' || name.trim() === '') {
      console.log('Invalid school name provided');
      return res.status(400).json({ error: 'Valid school name is required' });
    }
    const existingSchool = await School.findOne({ name: name.trim(), _id: { $ne: id } });
    if (existingSchool) {
      console.log('School name already in use:', name);
      return res.status(400).json({ error: 'School name already in use' });
    }
    const updatedSchool = await School.findByIdAndUpdate(
      id,
      { $set: { name: name.trim() } },
      { new: true }
    )
      .populate({
        path: 'programs.semesters.students',
        select: 'email uid firstName lastName',
      })
      .lean();
    if (!updatedSchool) {
      console.log('School not found for ID:', id);
      return res.status(404).json({ error: 'School not found' });
    }
    console.log('School updated:', updatedSchool.name);
    res.json(updatedSchool);
  } catch (error) {
    console.error('Error updating school:', error.message);
    res.status(400).json({ error: `Failed to update school: ${error.message}` });
  }
};

exports.deleteSchool = async (req, res) => {
  const { id } = req.params;
  try {
    console.log('Deleting school with ID:', id);
    const school = await School.findByIdAndDelete(id);
    if (!school) {
      console.log('School not found for ID:', id);
      return res.status(404).json({ error: 'School not found' });
    }
    console.log('School deleted:', school.name);
    res.json({ message: 'School deleted successfully' });
  } catch (error) {
    console.error('Error deleting school:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

exports.addProgram = async (req, res) => {
  const { schoolId } = req.params;
  const { name } = req.body;
  try {
    console.log('Adding program with name:', name, 'to school ID:', schoolId);
    if (!name || typeof name !== 'string' || name.trim() === '') {
      console.log('Invalid program name provided');
      return res.status(400).json({ error: 'Valid program name is required' });
    }
    const school = await School.findById(schoolId);
    if (!school) {
      console.log('School not found for ID:', schoolId);
      return res.status(404).json({ error: 'School not found' });
    }
    const existingProgram = school.programs.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
    if (existingProgram) {
      console.log('Program already exists:', name);
      return res.status(400).json({ error: 'Program with this name already exists in the school' });
    }
    const newProgram = { name: name.trim(), semesters: [] };
    school.programs.push(newProgram);
    await school.save();
    console.log('Program added:', name);
    
    const populatedSchool = await School.findById(schoolId)
      .populate({
        path: 'programs.semesters.students',
        select: 'email uid firstName lastName',
      })
      .lean();
    const addedProgram = populatedSchool.programs[populatedSchool.programs.length - 1];
    res.status(201).json(addedProgram);
  } catch (error) {
    console.error('Error adding program:', error.message);
    res.status(400).json({ error: `Failed to add program: ${error.message}` });
  }
};

exports.updateProgram = async (req, res) => {
  const { schoolId, programId } = req.params;
  const { name } = req.body;
  try {
    console.log('Updating program with ID:', programId, 'in school ID:', schoolId, 'with name:', name);
    if (!name || typeof name !== 'string' || name.trim() === '') {
      console.log('Invalid program name provided');
      return res.status(400).json({ error: 'Valid program name is required' });
    }
    const school = await School.findById(schoolId);
    if (!school) {
      console.log('School not found for ID:', schoolId);
      return res.status(404).json({ error: 'School not found' });
    }
    const program = school.programs.id(programId);
    if (!program) {
      console.log('Program not found for ID:', programId);
      return res.status(404).json({ error: 'Program not found' });
    }
    const existingProgram = school.programs.find(p => 
      p.name.toLowerCase() === name.trim().toLowerCase() && p._id.toString() !== programId
    );
    if (existingProgram) {
      console.log('Program name already in use:', name);
      return res.status(400).json({ error: 'Program name already in use in this school' });
    }
    program.name = name.trim();
    await school.save();
    console.log('Program updated:', name);
    
    const populatedSchool = await School.findById(schoolId)
      .populate({
        path: 'programs.semesters.students',
        select: 'email uid firstName lastName',
      })
      .lean();
    const updatedProgram = populatedSchool.programs.find(p => p._id.toString() === programId);
    res.json(updatedProgram);
  } catch (error) {
    console.error('Error updating program:', error.message);
    res.status(400).json({ error: `Failed to update program: ${error.message}` });
  }
};

exports.deleteProgram = async (req, res) => {
  const { schoolId, programId } = req.params;
  try {
    console.log('Deleting program with ID:', programId, 'from school ID:', schoolId);
    const school = await School.findById(schoolId);
    if (!school) {
      console.log('School not found for ID:', schoolId);
      return res.status(404).json({ error: 'School not found' });
    }
    const program = school.programs.id(programId);
    if (!program) {
      console.log('Program not found for ID:', programId);
      return res.status(404).json({ error: 'Program not found' });
    }
    // Remove associated exams from students in all semesters of this program
    for (const semester of program.semesters) {
      if (semester.exams && semester.exams.length > 0) {
        await Student.updateMany(
          { _id: { $in: semester.students } },
          { $pull: { exams: { $in: semester.exams } } }
        );
        console.log('Exams removed from students for semester:', semester._id);
      }
    }
    school.programs.pull(programId);
    await school.save();
    console.log('Program deleted:', program.name);
    res.json({ message: 'Program deleted successfully' });
  } catch (error) {
    console.error('Error deleting program:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

exports.addSemester = async (req, res) => {
  const { schoolId, programId } = req.params;
  const { name } = req.body;
  try {
    console.log('Adding semester with name:', name, 'to program ID:', programId, 'in school ID:', schoolId);
    if (!name || typeof name !== 'string' || name.trim() === '') {
      console.log('Invalid semester name provided');
      return res.status(400).json({ error: 'Valid semester name is required' });
    }
    const school = await School.findById(schoolId);
    if (!school) {
      console.log('School not found for ID:', schoolId);
      return res.status(404).json({ error: 'School not found' });
    }
    const program = school.programs.id(programId);
    if (!program) {
      console.log('Program not found for ID:', programId);
      return res.status(404).json({ error: 'Program not found' });
    }
    const existingSemester = program.semesters.find(s => s.name.toLowerCase() === name.trim().toLowerCase());
    if (existingSemester) {
      console.log('Semester already exists:', name);
      return res.status(400).json({ error: 'Semester with this name already exists in the program' });
    }
    const newSemester = { name: name.trim(), students: [], exams: [] };
    program.semesters.push(newSemester);
    await school.save();
    console.log('Semester added:', name);
    
    const populatedSchool = await School.findById(schoolId)
      .populate({
        path: 'programs.semesters.students',
        select: 'email uid firstName lastName',
      })
      .lean();
    const updatedProgram = populatedSchool.programs.find(p => p._id.toString() === programId);
    const addedSemester = updatedProgram.semesters[updatedProgram.semesters.length - 1];
    res.status(201).json(addedSemester);
  } catch (error) {
    console.error('Error adding semester:', error.message);
    res.status(400).json({ error: `Failed to add semester: ${error.message}` });
  }
};

exports.updateSemester = async (req, res) => {
  const { schoolId, programId, semesterId } = req.params;
  const { name } = req.body;
  try {
    console.log('Updating semester with ID:', semesterId, 'in program ID:', programId, 'with name:', name);
    if (!name || typeof name !== 'string' || name.trim() === '') {
      console.log('Invalid semester name provided');
      return res.status(400).json({ error: 'Valid semester name is required' });
    }
    const school = await School.findById(schoolId);
    if (!school) {
      console.log('School not found for ID:', schoolId);
      return res.status(404).json({ error: 'School not found' });
    }
    const program = school.programs.id(programId);
    if (!program) {
      console.log('Program not found for ID:', programId);
      return res.status(404).json({ error: 'Program not found' });
    }
    const semester = program.semesters.id(semesterId);
    if (!semester) {
      console.log('Semester not found for ID:', semesterId);
      return res.status(404).json({ error: 'Semester not found' });
    }
    const existingSemester = program.semesters.find(s => 
      s.name.toLowerCase() === name.trim().toLowerCase() && s._id.toString() !== semesterId
    );
    if (existingSemester) {
      console.log('Semester name already in use:', name);
      return res.status(400).json({ error: 'Semester name already in use in this program' });
    }
    semester.name = name.trim();
    await school.save();
    console.log('Semester updated:', name);
    
    const populatedSchool = await School.findById(schoolId)
      .populate({
        path: 'programs.semesters.students',
        select: 'email uid firstName lastName',
      })
      .lean();
    const updatedProgram = populatedSchool.programs.find(p => p._id.toString() === programId);
    const updatedSemester = updatedProgram.semesters.find(s => s._id.toString() === semesterId);
    res.json(updatedSemester);
  } catch (error) {
    console.error('Error updating semester:', error.message);
    res.status(400).json({ error: `Failed to update semester: ${error.message}` });
  }
};

exports.deleteSemester = async (req, res) => {
  const { schoolId, programId, semesterId } = req.params;
  try {
    console.log('Deleting semester with ID:', semesterId, 'from program ID:', programId, 'in school ID:', schoolId);
    const school = await School.findById(schoolId);
    if (!school) {
      console.log('School not found for ID:', schoolId);
      return res.status(404).json({ error: 'School not found' });
    }
    const program = school.programs.id(programId);
    if (!program) {
      console.log('Program not found for ID:', programId);
      return res.status(404).json({ error: 'Program not found' });
    }
    const semester = program.semesters.id(semesterId);
    if (!semester) {
      console.log('Semester not found for ID:', semesterId);
      return res.status(404).json({ error: 'Semester not found' });
    }
    if (semester.exams && semester.exams.length > 0) {
      await Student.updateMany(
        { _id: { $in: semester.students } },
        { $pull: { exams: { $in: semester.exams } } }
      );
      console.log('Exams removed from students for semester:', semesterId);
    }
    program.semesters.pull(semesterId);
    await school.save();
    console.log('Semester deleted:', semester.name);
    res.json({ message: 'Semester deleted successfully' });
  } catch (error) {
    console.error('Error deleting semester:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

exports.addStudent = async (req, res) => {
  const { schoolId, programId, semesterId } = req.params;
  const { email } = req.body;
  try {
    console.log('Adding student with email:', email, 'to semester ID:', semesterId);
    if (!email || typeof email !== 'string' || !email.trim()) {
      console.log('Invalid email provided');
      return res.status(400).json({ error: 'Valid student email is required' });
    }
    const student = await Student.findOne({ email: email.toLowerCase().trim() });
    if (!student) {
      console.log('Student not found for email:', email);
      return res.status(404).json({ error: 'Student not found' });
    }
    const school = await School.findById(schoolId);
    if (!school) {
      console.log('School not found for ID:', schoolId);
      return res.status(404).json({ error: 'School not found' });
    }
    const program = school.programs.id(programId);
    if (!program) {
      console.log('Program not found for ID:', programId);
      return res.status(404).json({ error: 'Program not found' });
    }
    const semester = program.semesters.id(semesterId);
    if (!semester) {
      console.log('Semester not found for ID:', semesterId);
      return res.status(404).json({ error: 'Semester not found' });
    }
    if (semester.students.includes(student._id)) {
      console.log('Student already enrolled in semester:', email);
      return res.status(400).json({ error: 'Student already enrolled in this semester' });
    }
    semester.students.push(student._id);
    if (semester.exams && semester.exams.length > 0) {
      for (const examId of semester.exams) {
        if (!student.exams.includes(examId)) {
          student.exams.push(examId);
        }
      }
      await student.save();
      console.log('Exams assigned to student:', student.uid);
    }
    await school.save();
    console.log('Student added to semester:', email);
    
    const populatedSchool = await School.findById(schoolId)
      .populate({
        path: 'programs.semesters.students',
        select: 'email uid firstName lastName',
      })
      .lean();
    const updatedProgram = populatedSchool.programs.find(p => p._id.toString() === programId);
    const updatedSemester = updatedProgram.semesters.find(s => s._id.toString() === semesterId);
    res.status(201).json(updatedSemester);
  } catch (error) {
    console.error('Error adding student:', error.message);
    res.status(400).json({ error: `Failed to add student: ${error.message}` });
  }
};

exports.bulkAddStudents = async (req, res) => {
  const { schoolId, programId, semesterId } = req.params;
  const { emails } = req.body;
  try {
    console.log('Bulk adding students to semester ID:', semesterId, 'Emails:', emails);
    if (!Array.isArray(emails) || emails.length === 0) {
      console.log('Invalid or empty email list provided');
      return res.status(400).json({ error: 'A non-empty array of emails is required' });
    }
    const school = await School.findById(schoolId);
    if (!school) {
      console.log('School not found for ID:', schoolId);
      return res.status(404).json({ error: 'School not found' });
    }
    const program = school.programs.id(programId);
    if (!program) {
      console.log('Program not found for ID:', programId);
      return res.status(404).json({ error: 'Program not found' });
    }
    const semester = program.semesters.id(semesterId);
    if (!semester) {
      console.log('Semester not found for ID:', semesterId);
      return res.status(404).json({ error: 'Semester not found' });
    }
    const created = [];
    const errors = [];
    for (const email of emails) {
      try {
        if (!email || typeof email !== 'string' || !email.trim()) {
          errors.push({ email, error: 'Invalid email format' });
          continue;
        }
        const student = await Student.findOne({ email: email.toLowerCase().trim() });
        if (!student) {
          errors.push({ email, error: 'Student not found' });
          continue;
        }
        if (semester.students.includes(student._id)) {
          errors.push({ email, error: 'Student already enrolled in semester' });
          continue;
        }
        semester.students.push(student._id);
        created.push({ email, studentId: student._id });
        if (semester.exams && semester.exams.length > 0) {
          for (const examId of semester.exams) {
            if (!student.exams.includes(examId)) {
              student.exams.push(examId);
            }
          }
          await student.save();
          console.log('Exams assigned to student:', student.uid);
        }
      } catch (err) {
        console.error('Error processing student:', email, err.message);
        errors.push({ email, error: err.message });
      }
    }
    if (created.length > 0) {
      await school.save();
      console.log('Bulk students added:', created.length);
    }
    const populatedSchool = await School.findById(schoolId)
      .populate({
        path: 'programs.semesters.students',
        select: 'email uid firstName lastName',
      })
      .lean();
    const updatedProgram = populatedSchool.programs.find(p => p._id.toString() === programId);
    const updatedSemester = updatedProgram.semesters.find(s => s._id.toString() === semesterId);
    res.status(201).json({ created, errors, semester: updatedSemester });
  } catch (error) {
    console.error('Error bulk adding students:', error.message);
    res.status(400).json({ error: `Failed to bulk add students: ${error.message}` });
  }
};

exports.removeStudent = async (req, res) => {
  const { schoolId, programId, semesterId, email } = req.params;
  try {
    console.log('Removing student with email:', email, 'from semester ID:', semesterId);
    if (!email || typeof email !== 'string' || !email.trim()) {
      console.log('Invalid email provided');
      return res.status(400).json({ error: 'Valid student email is required' });
    }
    const student = await Student.findOne({ email: email.toLowerCase().trim() });
    if (!student) {
      console.log('Student not found for email:', email);
      return res.status(404).json({ error: 'Student not found' });
    }
    const school = await School.findById(schoolId);
    if (!school) {
      console.log('School not found for ID:', schoolId);
      return res.status(404).json({ error: 'School not found' });
    }
    const program = school.programs.id(programId);
    if (!program) {
      console.log('Program not found for ID:', programId);
      return res.status(404).json({ error: 'Program not found' });
    }
    const semester = program.semesters.id(semesterId);
    if (!semester) {
      console.log('Semester not found for ID:', semesterId);
      return res.status(404).json({ error: 'Semester not found' });
    }
    if (!semester.students.includes(student._id)) {
      console.log('Student not enrolled in semester:', email);
      return res.status(400).json({ error: 'Student not enrolled in this semester' });
    }
    semester.students.pull(student._id);
    await school.save();
    console.log('Student removed from semester:', email);
    if (semester.exams && semester.exams.length > 0) {
      for (const examId of semester.exams) {
        student.exams.pull(examId);
      }
      await student.save();
      console.log('Exams removed from student:', student.uid);
    }
    const populatedSchool = await School.findById(schoolId)
      .populate({
        path: 'programs.semesters.students',
        select: 'email uid firstName lastName',
      })
      .lean();
    const updatedProgram = populatedSchool.programs.find(p => p._id.toString() === programId);
    const updatedSemester = updatedProgram.semesters.find(s => s._id.toString() === semesterId);
    res.json(updatedSemester);
  } catch (error) {
    console.error('Error removing student:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};