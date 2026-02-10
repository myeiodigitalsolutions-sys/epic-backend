const Semester = require('../models/Semester');

// @desc    Get all semesters
// @route   GET /api/semesters
// @access  Public
exports.getSemesters = async (req, res) => {
  try {
    const semesters = await Semester.find().sort({ createdAt: -1 });
    res.status(200).json(semesters);
  } catch (error) {
    console.error('Error fetching semesters:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get single semester
// @route   GET /api/semesters/:id
// @access  Public
exports.getSemesterById = async (req, res) => {
  try {
    const semester = await Semester.findById(req.params.id);
    if (!semester) {
      return res.status(404).json({ message: 'Semester not found' });
    }
    res.status(200).json(semester);
  } catch (error) {
    console.error('Error fetching semester:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Create new semester
// @route   POST /api/semesters
// @access  Private
exports.createSemester = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Semester name is required' });
    }

    // Check if semester already exists
    const existingSemester = await Semester.findOne({ name: name.trim() });
    if (existingSemester) {
      return res.status(400).json({ message: 'Semester with this name already exists' });
    }

    const semester = new Semester({
      name: name.trim()
    });

    const createdSemester = await semester.save();
    res.status(201).json(createdSemester);
  } catch (error) {
    console.error('Error creating semester:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Semester with this name already exists' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update semester
// @route   PUT /api/semesters/:id
// @access  Private
exports.updateSemester = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Semester name is required' });
    }

    const semester = await Semester.findById(req.params.id);
    if (!semester) {
      return res.status(404).json({ message: 'Semester not found' });
    }

    // Check for duplicate name (excluding current semester)
    if (name.trim() !== semester.name) {
      const existingSemester = await Semester.findOne({ name: name.trim() });
      if (existingSemester) {
        return res.status(400).json({ message: 'Semester with this name already exists' });
      }
    }

    semester.name = name.trim();

    const updatedSemester = await semester.save();
    res.status(200).json(updatedSemester);
  } catch (error) {
    console.error('Error updating semester:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Semester with this name already exists' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete semester
// @route   DELETE /api/semesters/:id
// @access  Private
exports.deleteSemester = async (req, res) => {
  try {
    const semester = await Semester.findById(req.params.id);
    if (!semester) {
      return res.status(404).json({ message: 'Semester not found' });
    }

    await semester.deleteOne();
    res.status(200).json({ message: 'Semester removed successfully' });
  } catch (error) {
    console.error('Error deleting semester:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};