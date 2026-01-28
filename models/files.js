const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true,
    trim: true 
  },
  name: { 
    type: String, 
    required: true,
    trim: true 
  },
  type: { 
    type: String, 
    required: true 
  },
  size: { 
    type: String, 
    required: true 
  },
  lastModified: { 
    type: String 
  },
  url: { 
    type: String,
    default: '' 
  },
  content: { 
    type: String,
    default: null 
  },
  isUploadedFile: { 
    type: Boolean, 
    default: false 
  },
  isNotes: { 
    type: Boolean, 
    default: false 
  },
  isLink: { 
    type: Boolean, 
    default: false 
  },
  desc: { 
    type: String, 
    default: '',
    trim: true 
  },
  filePath: { 
    type: String, 
    default: '' 
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('File', fileSchema);