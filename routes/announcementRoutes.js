const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const Class = require('../models/Class');
const Program = require('../models/Program');

// Create a new announcement (updated for subjects)
router.post('/', async (req, res) => {
    try {
        const { title, text, link, postedBy, classId, avatar, avatarBg } = req.body;

        if (!title || !text || !classId) {
            return res.status(400).json({ 
                success: false,
                error: 'Title, content, and class selection are required' 
            });
        }

        const newAnnouncement = new Announcement({
            title,
            text,
            link,
            postedBy: postedBy || 'Admin',
            classId,
            avatar: avatar || 'Y',
            avatarBg: avatarBg || '#1a73e8'
        });

        await newAnnouncement.save();
        res.status(201).json({
            success: true,
            announcement: newAnnouncement
        });
    } catch (error) {
        console.error('Error creating announcement:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error creating announcement',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get all announcements with class name (updated for subjects)
router.get('/', async (req, res) => {
    try {
        const { role, postedBy, classIds, studentEmail } = req.query;

        let query = {};

        if (role === 'staff' && postedBy) {
            // For staff, fetch only announcements they posted
            query.postedBy = postedBy;
            
            // If classIds are provided, filter by classIds
            if (classIds) {
                const classIdArray = classIds.split(',').map(id => id.trim());
                query.classId = { $in: classIdArray };
            }
        } else if (role === 'student') {
            // For students, fetch announcements for specific classes if classIds provided
            if (classIds) {
                const classIdArray = classIds.split(',').map(id => id.trim());
                query.classId = { $in: classIdArray };
            }
            
            // For students, also fetch announcements from subjects they're enrolled in
            if (studentEmail) {
                try {
                    // Find programs where student is enrolled in subjects
                    const programs = await Program.find({});
                    let subjectIds = [];
                    
                    for (const program of programs) {
                        for (const subject of program.subjects) {
                            if (subject.enrolledStudents && Array.isArray(subject.enrolledStudents)) {
                                const isEnrolled = subject.enrolledStudents.some(
                                    student => student.studentEmail === studentEmail
                                );
                                if (isEnrolled) {
                                    subjectIds.push(subject._id.toString());
                                }
                            }
                        }
                    }
                    
                    // Add subject announcements to query
                    if (subjectIds.length > 0) {
                        query.$or = [
                            { classId: { $in: classIdArray || [] } },
                            { classId: { $in: subjectIds } }
                        ];
                    }
                } catch (subjectError) {
                    console.error('Error fetching student subjects:', subjectError);
                }
            }
        } else if (role) {
            // Invalid role
            return res.status(400).json({
                success: false,
                error: 'Invalid role specified'
            });
        }

        // Fetch announcements based on query
        const announcements = await Announcement.find(query)
            .sort({ createdAt: -1 });

        // Map announcements to include class/subject name
        const formattedAnnouncements = await Promise.all(announcements.map(async (a) => {
            let className = 'No Class';
            
            // Check if it's a subject from Program
            try {
                const programs = await Program.find({});
                for (const program of programs) {
                    const subject = program.subjects.find(s => s._id.toString() === a.classId.toString());
                    if (subject) {
                        className = `${subject.name} (${program.name})`;
                        break;
                    }
                }
                
                // If not found in programs, check old Class model
                if (className === 'No Class') {
                    const oldClass = await Class.findById(a.classId).select('name');
                    if (oldClass) {
                        className = oldClass.name;
                    }
                }
            } catch (error) {
                console.error('Error fetching class name:', error);
            }

            return {
                _id: a._id,
                title: a.title,
                text: a.text,
                link: a.link,
                postedBy: a.postedBy || 'Unknown',
                className: className,
                avatar: a.avatar,
                avatarBg: a.avatarBg,
                createdAt: a.createdAt
            };
        }));

        res.json({
            success: true,
            announcements: formattedAnnouncements
        });
    } catch (error) {
        console.error('Error fetching announcements:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error fetching announcements',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get all announcements for a specific class/subject
router.get('/class/:classId', async (req, res) => {
    try {
        const { classId } = req.params;
        const announcements = await Announcement.find({ classId })
            .sort({ createdAt: -1 });

        // Get class/subject name
        let className = 'No Class';
        try {
            // Check if it's a subject from Program
            const programs = await Program.find({});
            for (const program of programs) {
                const subject = program.subjects.find(s => s._id.toString() === classId.toString());
                if (subject) {
                    className = `${subject.name} (${program.name})`;
                    break;
                }
            }
            
            // If not found in programs, check old Class model
            if (className === 'No Class') {
                const oldClass = await Class.findById(classId).select('name');
                if (oldClass) {
                    className = oldClass.name;
                }
            }
        } catch (error) {
            console.error('Error fetching class name:', error);
        }

        const formattedAnnouncements = announcements.map(a => ({
            _id: a._id,
            title: a.title,
            text: a.text,
            link: a.link,
            postedBy: a.postedBy || 'Unknown',
            className: className,
            avatar: a.avatar,
            avatarBg: a.avatarBg,
            createdAt: a.createdAt
        }));

        res.json({
            success: true,
            announcements: formattedAnnouncements
        });
    } catch (error) {
        console.error('Error fetching announcements:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error fetching announcements',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Delete an announcement
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'Announcement ID is required'
            });
        }

        const deletedAnnouncement = await Announcement.findByIdAndDelete(id);

        if (!deletedAnnouncement) {
            return res.status(404).json({
                success: false,
                error: 'Announcement not found'
            });
        }

        res.json({
            success: true,
            message: 'Announcement deleted successfully',
            deletedAnnouncementId: id
        });
    } catch (error) {
        console.error('Error deleting announcement:', error);
        res.status(500).json({
            success: false,
            error: 'Error deleting announcement',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;