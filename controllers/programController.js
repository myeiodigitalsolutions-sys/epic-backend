const Program = require('../models/Program');

// Create a new program
exports.createProgram = async (req, res) => {
  try {
    const { name, code, duration } = req.body;

    // Check if program already exists
    const existingProgram = await Program.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${name}$`, 'i') } },
        { code: { $regex: new RegExp(`^${code}$`, 'i') } }
      ]
    });

    if (existingProgram) {
      return res.status(400).json({
        success: false,
        error: 'Program with this name or code already exists'
      });
    }

    // Create new program
    const program = new Program({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      duration: duration || 'N/A'
    });

    await program.save();

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
    const programs = await Program.find().sort({ name: 1 });

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
    const program = await Program.findById(req.params.id);

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
    const { name, code, duration } = req.body;

    // Check if program exists
    let program = await Program.findById(req.params.id);
    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found'
      });
    }

    // Check for duplicate name or code (excluding current program)
    if (name || code) {
      const duplicateQuery = {
        _id: { $ne: req.params.id },
        $or: []
      };

      if (name) {
        duplicateQuery.$or.push({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
      }
      if (code) {
        duplicateQuery.$or.push({ code: { $regex: new RegExp(`^${code}$`, 'i') } });
      }

      const duplicateProgram = await Program.findOne(duplicateQuery);
      if (duplicateProgram) {
        return res.status(400).json({
          success: false,
          error: 'Another program with this name or code already exists'
        });
      }
    }

    // Update program
    program.name = name || program.name;
    program.code = code ? code.trim().toUpperCase() : program.code;
    program.duration = duration || program.duration;
    program.updatedAt = Date.now();

    await program.save();

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