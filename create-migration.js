// create-migration.js
const mongoose = require('mongoose');
require('dotenv').config();

async function migratePasswords() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const Student = require('./models/Students');
    const Staff = require('./models/Staff');
    
    // Add default password to students without passwords
    const studentsWithoutPasswords = await Student.find({ password: { $exists: false } });
    console.log(`Found ${studentsWithoutPasswords.length} students without passwords`);
    
    for (const student of studentsWithoutPasswords) {
      await Student.updateOne(
        { _id: student._id },
        { $set: { password: 'default123' } }
      );
    }
    
    // Add default password to staff without passwords
    const staffWithoutPasswords = await Staff.find({ password: { $exists: false } });
    console.log(`Found ${staffWithoutPasswords.length} staff without passwords`);
    
    for (const staff of staffWithoutPasswords) {
      await Staff.updateOne(
        { _id: staff._id },
        { $set: { password: 'default123' } }
      );
    }
    
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

migratePasswords();