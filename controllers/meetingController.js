const Meeting = require('../models/Meeting');
const Class = require('../models/Class');
const Program = require('../models/Program');

// Create a new meeting
exports.createMeeting = async (req, res) => {
  try {
    const {
      classId,
      subjectId,
      programId,
      title,
      description,
      meetingType,
      meetingLink,
      scheduledTime,
      scheduledDate,
      staffId,
      staffName,
      staffEmail,
      maxAttendees,
      notes,
      isSubject
    } = req.body;

    // Validate required fields
    if ((!classId && !subjectId) || !title || !meetingType || !meetingLink) {
      return res.status(400).json({
        success: false,
        error: 'Class/Subject ID, title, meeting type, and meeting link are required'
      });
    }

    // Validate meeting link
    const urlRegex = /^(https?:\/\/[^\s$.?#].[^\s]*)$/;
    if (!urlRegex.test(meetingLink)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid meeting link format'
      });
    }

    // Build meeting data object
    const meetingData = {
      title,
      description,
      meetingType,
      meetingLink,
      scheduledTime,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date(),
      createdBy: {
        staffId,
        staffName,
        staffEmail
      },
      maxAttendees,
      notes,
      status: 'scheduled'
    };

    // Add classId or subjectId based on the request
    if (isSubject && subjectId) {
      // For subject-based meetings
      meetingData.subjectId = subjectId;
      if (programId) {
        meetingData.programId = programId;
      }
      console.log('📝 Creating SUBJECT meeting for subjectId:', subjectId);
    } else if (classId) {
      // For class-based meetings
      meetingData.classId = classId;
      console.log('📝 Creating CLASS meeting for classId:', classId);
    }

    // Create new meeting
    const meeting = new Meeting(meetingData);

    try {
      await meeting.save();
      console.log('✅ Meeting created successfully:', meeting._id);
    } catch (validationError) {
      console.error('Validation error creating meeting:', validationError);
      return res.status(400).json({
        success: false,
        error: 'Meeting validation failed',
        details: validationError.message
      });
    }

    res.status(201).json({
      success: true,
      message: 'Meeting created successfully',
      meeting
    });
  } catch (error) {
    console.error('Error creating meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create meeting',
      details: error.message
    });
  }
};

// Get meetings for a subject
exports.getSubjectMeetings = async (req, res) => {
  try {
    const { subjectId } = req.params;

    const meetings = await Meeting.find({ subjectId })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: meetings.length,
      meetings: meetings.map(meeting => ({
        ...meeting.toObject(),
        activeAttendees: meeting.attendees.filter(a => a.status === 'joined').length
      }))
    });
  } catch (error) {
    console.error('Error getting subject meetings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get meetings',
      details: error.message
    });
  }
};

// Get live meetings for a subject
exports.getSubjectLiveMeetings = async (req, res) => {
  try {
    const { subjectId } = req.params;

    const meetings = await Meeting.find({ 
      subjectId,
      status: 'live'
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: meetings.length,
      meetings
    });
  } catch (error) {
    console.error('Error getting live subject meetings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get live meetings',
      details: error.message
    });
  }
};

// Get meetings for student's specific subject
// Get meetings for student's specific subject
exports.getStudentSubjectMeetings = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { studentEmail } = req.query;
    
    console.log('🎯 Fetching student subject meetings:', { subjectId, studentEmail });
    
    if (!studentEmail) {
      return res.status(400).json({
        success: false,
        error: 'Student email is required',
        meetings: []
      });
    }
    
    // Get subject details to check if student is enrolled
    const subject = await Program.findOne(
      { 'subjects._id': subjectId },
      { 'subjects.$': 1 }
    );
    
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found',
        meetings: []
      });
    }
    
    const subjectData = subject.subjects[0];
    
    // Check if student is enrolled in this subject
    const isEnrolled = subjectData.enrolledStudents?.some(
      student => student.studentEmail === studentEmail
    );
    
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        error: 'Student not enrolled in this subject',
        meetings: []
      });
    }
    
    // Get all meetings for this subject
    const meetings = await Meeting.find({ 
      subjectId: subjectId 
    })
    .sort({ scheduledDate: -1, createdAt: -1 });
    
    console.log(`✅ Found ${meetings.length} meetings for subject ${subjectId}`);
    
    // Format response with student attendance info
    const formattedMeetings = meetings.map(meeting => {
      // Find student attendance
      let attendance = null;
      if (studentEmail && meeting.attendees && meeting.attendees.length > 0) {
        attendance = meeting.attendees.find(a => 
          a.studentEmail && 
          a.studentEmail.toString().toLowerCase() === studentEmail.toLowerCase()
        );
      }
      
      // Calculate live duration if meeting is live
      let liveDuration = 0;
      if (meeting.status === 'live' && meeting.startTime) {
        liveDuration = Math.round((new Date() - meeting.startTime) / (1000 * 60));
      }
      
      return {
        id: meeting._id,
        _id: meeting._id,
        title: meeting.title || 'Untitled Meeting',
        description: meeting.description || '',
        meetingType: meeting.meetingType || 'other',
        meetingLink: meeting.meetingLink || '',
        scheduledTime: meeting.scheduledTime || '',
        scheduledDate: meeting.scheduledDate || meeting.createdAt,
        status: meeting.status || 'scheduled',
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        duration: meeting.duration || 0,
        liveDuration: liveDuration,
        totalAttendees: meeting.totalAttendees || 0,
        activeAttendees: meeting.attendees?.filter(a => a.status === 'joined').length || 0,
        createdBy: meeting.createdBy || { staffName: 'Teacher', staffEmail: '' },
        subjectId: meeting.subjectId,
        classId: meeting.classId,
        // Student attendance info
        hasJoined: !!attendance,
        joinTime: attendance?.joinTime,
        leaveTime: attendance?.leaveTime,
        studentStatus: attendance?.status || 'absent',
        studentDuration: attendance?.duration || 0
      };
    });
    
    res.status(200).json({
      success: true,
      count: formattedMeetings.length,
      meetings: formattedMeetings,
      debugInfo: {
        subjectId: subjectId,
        studentEmail: studentEmail,
        totalMeetings: meetings.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting student subject meetings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subject meetings',
      details: error.message
    });
  }
};

// Get meetings for student's specific class
exports.getStudentClassMeetings = async (req, res) => {
  try {
    const { classId } = req.params;
    const { studentEmail } = req.query;
    
    console.log('🎯 Fetching student class meetings:', { classId, studentEmail });
    
    if (!studentEmail) {
      return res.status(400).json({
        success: false,
        error: 'Student email is required',
        meetings: []
      });
    }
    
    // Get class details to check if student is enrolled
    const classData = await Class.findById(classId);
    
    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'Class not found',
        meetings: []
      });
    }
    
    // Check if student is enrolled in this class
    const isEnrolled = classData.students?.some(
      student => student.email === studentEmail
    );
    
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        error: 'Student not enrolled in this class',
        meetings: []
      });
    }
    
    // Get all meetings for this class
    const meetings = await Meeting.find({ 
      classId: classId 
    })
    .sort({ scheduledDate: -1, createdAt: -1 });
    
    console.log(`✅ Found ${meetings.length} meetings for class ${classId}`);
    
    // Format response with student attendance info
    const formattedMeetings = meetings.map(meeting => {
      // Find student attendance
      let attendance = null;
      if (studentEmail && meeting.attendees && meeting.attendees.length > 0) {
        attendance = meeting.attendees.find(a => 
          a.studentEmail && 
          a.studentEmail.toString().toLowerCase() === studentEmail.toLowerCase()
        );
      }
      
      // Calculate live duration if meeting is live
      let liveDuration = 0;
      if (meeting.status === 'live' && meeting.startTime) {
        liveDuration = Math.round((new Date() - meeting.startTime) / (1000 * 60));
      }
      
      return {
        id: meeting._id,
        _id: meeting._id,
        title: meeting.title || 'Untitled Meeting',
        description: meeting.description || '',
        meetingType: meeting.meetingType || 'other',
        meetingLink: meeting.meetingLink || '',
        scheduledTime: meeting.scheduledTime || '',
        scheduledDate: meeting.scheduledDate || meeting.createdAt,
        status: meeting.status || 'scheduled',
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        duration: meeting.duration || 0,
        liveDuration: liveDuration,
        totalAttendees: meeting.totalAttendees || 0,
        activeAttendees: meeting.attendees?.filter(a => a.status === 'joined').length || 0,
        createdBy: meeting.createdBy || { staffName: 'Teacher', staffEmail: '' },
        // Student attendance info
        hasJoined: !!attendance,
        joinTime: attendance?.joinTime,
        leaveTime: attendance?.leaveTime,
        studentStatus: attendance?.status || 'absent',
        studentDuration: attendance?.duration || 0
      };
    });
    
    res.status(200).json({
      success: true,
      count: formattedMeetings.length,
      meetings: formattedMeetings,
      debugInfo: {
        classId: classId,
        studentEmail: studentEmail,
        totalMeetings: meetings.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting student class meetings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get class meetings',
      details: error.message
    });
  }
};

// Get meetings for student's specific class (STUDENT-SPECIFIC)
exports.getStudentClassMeetings = async (req, res) => {
  try {
    const { classId } = req.params;
    const { studentEmail } = req.query;
    
    console.log('🎯 Fetching student class meetings:', { classId, studentEmail });
    
    if (!studentEmail) {
      return res.status(400).json({
        success: false,
        error: 'Student email is required',
        meetings: []
      });
    }
    
    // Get all meetings for this class (including scheduled, live, ended)
    const meetings = await Meeting.find({ 
      classId: classId 
    })
    .sort({ scheduledDate: -1, createdAt: -1 });
    
    console.log(`✅ Found ${meetings.length} meetings for class ${classId}`);
    
    // Format response with student attendance info
    const formattedMeetings = meetings.map(meeting => {
      // Find student attendance
      let attendance = null;
      if (studentEmail && meeting.attendees && meeting.attendees.length > 0) {
        attendance = meeting.attendees.find(a => 
          a.studentEmail && 
          a.studentEmail.toString().toLowerCase() === studentEmail.toLowerCase()
        );
      }
      
      // Calculate live duration if meeting is live
      let liveDuration = 0;
      if (meeting.status === 'live' && meeting.startTime) {
        liveDuration = Math.round((new Date() - meeting.startTime) / (1000 * 60));
      }
      
      return {
        id: meeting._id,
        _id: meeting._id,
        title: meeting.title || 'Untitled Meeting',
        description: meeting.description || '',
        meetingType: meeting.meetingType || 'other',
        meetingLink: meeting.meetingLink || '',
        scheduledTime: meeting.scheduledTime || '',
        scheduledDate: meeting.scheduledDate || meeting.createdAt,
        status: meeting.status || 'scheduled',
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        duration: meeting.duration || 0,
        liveDuration: liveDuration,
        totalAttendees: meeting.totalAttendees || 0,
        activeAttendees: meeting.attendees?.filter(a => a.status === 'joined').length || 0,
        createdBy: meeting.createdBy || { staffName: 'Teacher', staffEmail: '' },
        // Student attendance info
        hasJoined: !!attendance,
        joinTime: attendance?.joinTime,
        leaveTime: attendance?.leaveTime,
        studentStatus: attendance?.status || 'absent',
        studentDuration: attendance?.duration || 0
      };
    });
    
    res.status(200).json({
      success: true,
      count: formattedMeetings.length,
      meetings: formattedMeetings,
      debugInfo: {
        classId: classId,
        studentEmail: studentEmail,
        totalMeetings: meetings.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting student class meetings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get class meetings',
      details: error.message
    });
  }
};

// Get all meetings for a class (GENERAL - for staff and students)
exports.getClassMeetings = async (req, res) => {
  try {
    const { classId } = req.params;
    const { studentEmail } = req.query;

    console.log('📋 Fetching class meetings for:', { classId, studentEmail });

    // Get ALL meetings for this class
    const meetings = await Meeting.find({ 
      classId: classId 
    })
    .sort({ createdAt: -1 });

    console.log(`✅ Found ${meetings.length} meetings for class ${classId}`);

    // Format response with student attendance info if studentEmail provided
    const formattedMeetings = meetings.map(meeting => {
      // Find student attendance if email provided
      let studentAttendance = null;
      if (studentEmail && meeting.attendees && meeting.attendees.length > 0) {
        studentAttendance = meeting.attendees.find(attendee => 
          attendee.studentEmail && 
          attendee.studentEmail.toString().toLowerCase() === studentEmail.toLowerCase()
        );
      }

      // Calculate live duration if meeting is live
      let liveDuration = 0;
      if (meeting.status === 'live' && meeting.startTime) {
        liveDuration = Math.round((new Date() - meeting.startTime) / (1000 * 60));
      }

      return {
        id: meeting._id,
        _id: meeting._id,
        title: meeting.title || 'Untitled Meeting',
        description: meeting.description || '',
        meetingType: meeting.meetingType || 'other',
        meetingLink: meeting.meetingLink || '',
        scheduledTime: meeting.scheduledTime || '',
        scheduledDate: meeting.scheduledDate || meeting.createdAt,
        status: meeting.status || 'scheduled',
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        duration: meeting.duration || 0,
        liveDuration: liveDuration,
        totalAttendees: meeting.totalAttendees || 0,
        activeAttendees: meeting.attendees?.filter(a => a.status === 'joined').length || 0,
        createdBy: meeting.createdBy || { staffName: 'Teacher', staffEmail: '' },
        // Student attendance info (if provided)
        hasJoined: !!studentAttendance,
        joinTime: studentAttendance?.joinTime,
        leaveTime: studentAttendance?.leaveTime,
        studentStatus: studentAttendance?.status || 'absent',
        studentDuration: studentAttendance?.duration || 0
      };
    });

    res.status(200).json({
      success: true,
      count: formattedMeetings.length,
      meetings: formattedMeetings
    });
  } catch (error) {
    console.error('❌ Error getting class meetings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get meetings',
      details: error.message
    });
  }
};

// Get live meetings for a class
exports.getClassLiveMeetings = async (req, res) => {
  try {
    const { classId } = req.params;

    const meetings = await Meeting.find({ 
      classId,
      status: 'live'
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: meetings.length,
      meetings
    });
  } catch (error) {
    console.error('Error getting live class meetings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get live meetings',
      details: error.message
    });
  }
};

// Join a meeting (for students)
exports.joinMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { studentId, studentName, studentEmail, regNo } = req.body;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found'
      });
    }

    // Check if meeting is live
    if (meeting.status !== 'live') {
      return res.status(400).json({
        success: false,
        error: 'Meeting is not live. Please wait for the staff to start the meeting.'
      });
    }

    // Check if student is already in the meeting
    const existingAttendee = meeting.attendees.find(
      attendee => attendee.studentEmail === studentEmail
    );

    if (existingAttendee) {
      // Update join time if rejoining
      if (existingAttendee.status === 'left') {
        existingAttendee.joinTime = new Date();
        existingAttendee.status = 'joined';
        existingAttendee.leaveTime = null;
      }
    } else {
      // Add new attendee
      meeting.attendees.push({
        studentId,
        studentName,
        studentEmail,
        regNo,
        joinTime: new Date(),
        status: 'joined'
      });
    }

    // Update total attendees
    meeting.totalAttendees = meeting.attendees.filter(a => a.status === 'joined').length;
    
    await meeting.save();

    res.status(200).json({
      success: true,
      message: 'Joined meeting successfully',
      meeting: {
        id: meeting._id,
        title: meeting.title,
        attendees: meeting.totalAttendees,
        joinTime: new Date()
      }
    });
  } catch (error) {
    console.error('Error joining meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to join meeting',
      details: error.message
    });
  }
};

// Start a meeting
exports.startMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { staffId, isSubject } = req.body;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found'
      });
    }

    // Check if meeting is already live or ended
    if (meeting.status === 'live') {
      return res.status(400).json({
        success: false,
        error: 'Meeting is already live'
      });
    }

    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Cannot start a meeting that has ended or been cancelled'
      });
    }

    // Update meeting status
    meeting.status = 'live';
    meeting.startTime = new Date();
    await meeting.save();

    res.status(200).json({
      success: true,
      message: 'Meeting started successfully',
      meeting
    });
  } catch (error) {
    console.error('Error starting meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start meeting',
      details: error.message
    });
  }
};

// End a meeting
exports.endMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { staffId } = req.body;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found'
      });
    }

    // Check if meeting is live
    if (meeting.status !== 'live') {
      return res.status(400).json({
        success: false,
        error: 'Meeting is not live'
      });
    }

    // Calculate duration
    const endTime = new Date();
    const startTime = meeting.startTime;
    const duration = Math.round((endTime - startTime) / (1000 * 60)); // Convert to minutes

    // Update meeting status and details
    meeting.status = 'ended';
    meeting.endTime = endTime;
    meeting.duration = duration;

    // Update attendees who are still joined
    meeting.attendees = meeting.attendees.map(attendee => {
      if (attendee.status === 'joined') {
        return {
          ...attendee,
          leaveTime: endTime,
          status: 'left',
          duration: Math.round((endTime - attendee.joinTime) / (1000 * 60))
        };
      }
      return attendee;
    });

    await meeting.save();

    res.status(200).json({
      success: true,
      message: 'Meeting ended successfully',
      meeting: {
        ...meeting.toObject(),
        duration,
        totalAttendees: meeting.attendees.filter(a => a.status !== 'absent').length
      }
    });
  } catch (error) {
    console.error('Error ending meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end meeting',
      details: error.message
    });
  }
};

// Get meeting details
exports.getMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found'
      });
    }

    // Calculate live duration if meeting is live
    let liveDuration = 0;
    if (meeting.status === 'live' && meeting.startTime) {
      liveDuration = Math.round((new Date() - meeting.startTime) / (1000 * 60));
    }

    res.status(200).json({
      success: true,
      meeting: {
        ...meeting.toObject(),
        liveDuration,
        activeAttendees: meeting.attendees.filter(a => a.status === 'joined').length
      }
    });
  } catch (error) {
    console.error('Error getting meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get meeting details',
      details: error.message
    });
  }
};

// Update meeting
exports.updateMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const updates = req.body;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found'
      });
    }

    // Update meeting
    Object.keys(updates).forEach(key => {
      if (key !== 'attendees') {
        meeting[key] = updates[key];
      }
    });

    await meeting.save();

    res.status(200).json({
      success: true,
      message: 'Meeting updated successfully',
      meeting
    });
  } catch (error) {
    console.error('Error updating meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update meeting',
      details: error.message
    });
  }
};

// Delete meeting
exports.deleteMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { staffId } = req.body;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found'
      });
    }

    // Don't allow deletion of live meetings
    if (meeting.status === 'live') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete a live meeting. Please end the meeting first.'
      });
    }

    await meeting.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Meeting deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete meeting',
      details: error.message
    });
  }
};

// Get meeting attendance report
exports.getMeetingAttendance = async (req, res) => {
  try {
    const { meetingId } = req.params;

    const meeting = await Meeting.findById(meetingId)
      .select('title startTime endTime duration attendees totalAttendees');
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found'
      });
    }

    // Calculate attendance statistics
    const attendanceStats = {
      totalInvited: meeting.attendees.length,
      joined: meeting.attendees.filter(a => a.status !== 'absent').length,
      present: meeting.attendees.filter(a => a.status === 'joined' || a.status === 'left').length,
      absent: meeting.attendees.filter(a => a.status === 'absent').length,
      averageDuration: 0
    };

    res.status(200).json({
      success: true,
      meeting: {
        title: meeting.title,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        duration: meeting.duration,
        totalAttendees: meeting.totalAttendees
      },
      attendanceStats,
      attendees: meeting.attendees.map(attendee => ({
        studentName: attendee.studentName,
        studentEmail: attendee.studentEmail,
        regNo: attendee.regNo,
        joinTime: attendee.joinTime,
        leaveTime: attendee.leaveTime,
        duration: attendee.duration,
        status: attendee.status
      }))
    });
  } catch (error) {
    console.error('Error getting attendance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get attendance report',
      details: error.message
    });
  }
};