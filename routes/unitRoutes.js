const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Unit = require('../models/unit');
const File = require('../models/files');
const admin = require('firebase-admin');

let bucket;
try {
  bucket = admin.storage().bucket();
} catch (err) {
  console.error('Failed to get Firebase Storage bucket:', err.message);
  bucket = null;
}

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/mpeg',
      'video/webm',
      'video/ogg',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/json',
      'text/html',
      'text/css',
      'application/javascript',
      'text/markdown',
      'application/zip',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Supported types: ${allowedTypes.join(', ')}`));
    }
  },
});

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const uploadToFirebase = async (file, fileName) => {
  if (!bucket) {
    throw new Error('Firebase Storage not available');
  }

  const timestamp = Date.now();
  const extension = path.extname(file.originalname);
  const uniqueName = `${timestamp}-${Math.random().toString(36).substring(7)}${extension}`;
  const filePath = `units/${uniqueName}`;

  const buffer = file.buffer;

  const fileRef = bucket.file(filePath);

  await fileRef.save(buffer, {
    metadata: {
      contentType: file.mimetype,
      metadata: {
        originalName: file.originalname,
        uploadedAt: new Date().toISOString()
      }
    }
  });

  await fileRef.makePublic();

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
  
  return {
    url: publicUrl,
    filePath: filePath,
    name: file.originalname,
    size: file.size,
    type: file.mimetype
  };
};

const deleteFromFirebase = async (filePath) => {
  if (!bucket || !filePath) return;
  
  try {
    const fileRef = bucket.file(filePath);
    await fileRef.delete();
    console.log(`File deleted from Firebase: ${filePath}`);
  } catch (err) {
    console.error('Error deleting file from Firebase:', err.message);
  }
};

router.get('/:classId', async (req, res) => {
  try {
    const units = await Unit.find({ classId: req.params.classId }).populate('files');
    res.json(units);
  } catch (err) {
    console.error('Failed to fetch units:', err);
    res.status(500).json({ error: 'Failed to fetch units', details: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { unitTitle, unitDescription, classId } = req.body;
    if (!unitTitle) {
      return res.status(400).json({ error: 'Unit title is required' });
    }
    if (!classId) {
      return res.status(400).json({ error: 'Class ID is required' });
    }

    const newUnit = new Unit({
      title: unitTitle,
      classId,
      files: []
    });

    if (unitDescription) {
      const fileData = new File({
        title: 'Overview',
        name: 'overview.txt',
        type: 'text/plain',
        size: formatFileSize(Buffer.from(unitDescription).length),
        content: unitDescription,
        lastModified: new Date().toLocaleDateString(),
        isUploadedFile: false,
        isNotes: true,
        isLink: false,
        filePath: '',
        url: ''
      });
      const savedFile = await fileData.save();
      newUnit.files.push(savedFile._id);
    }

    const savedUnit = await newUnit.save();
    const populatedUnit = await Unit.findById(savedUnit._id).populate('files');
    res.status(201).json(populatedUnit);
  } catch (err) {
    console.error('Error creating unit:', err);
    res.status(500).json({ error: 'Failed to create unit', details: err.message });
  }
});

router.post('/:unitId/files', upload.single('fileUpload'), async (req, res) => {
  try {
    const { unitId } = req.params;
    const { fileName, notesContent, fileType, linkUrl } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: 'File name is required' });
    }

    const unit = await Unit.findById(unitId);
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    let fileData;
    let firebaseUrl = '';

    if (fileType === 'upload' && req.file) {
      if (!bucket) {
        return res.status(500).json({ error: 'Firebase Storage not available' });
      }
      
      const uploadResult = await uploadToFirebase(req.file, fileName);
      firebaseUrl = uploadResult.url;

      const isTextFile = req.file.mimetype.startsWith('text/') ||
                       req.file.mimetype === 'application/json' ||
                       req.file.originalname.match(/\.(txt|js|html|css|md)$/);

      let fileContent = null;
      if (isTextFile && req.file.buffer) {
        fileContent = req.file.buffer.toString('utf8');
      }

      fileData = new File({
        title: fileName,
        name: req.file.originalname,
        type: req.file.mimetype,
        size: formatFileSize(req.file.size),
        content: fileContent,
        lastModified: new Date().toLocaleDateString(),
        isUploadedFile: true,
        isNotes: false,
        isLink: false,
        filePath: uploadResult.filePath,
        url: firebaseUrl
      });
    } else if (fileType === 'notes' && notesContent) {
      const blob = Buffer.from(notesContent);
      fileData = new File({
        title: fileName,
        name: fileName + '.txt',
        type: 'text/plain',
        size: formatFileSize(blob.length),
        content: notesContent,
        lastModified: new Date().toLocaleDateString(),
        isUploadedFile: false,
        isNotes: true,
        isLink: false,
        filePath: '',
        url: ''
      });
    } else if (fileType === 'link' && linkUrl) {
      if (!linkUrl.match(/^https?:\/\/[^\s/$.?#].[^\s]*$/)) {
        return res.status(400).json({ error: 'Invalid URL format' });
      }
      fileData = new File({
        title: fileName,
        name: fileName,
        type: 'text/link',
        size: formatFileSize(Buffer.from(linkUrl).length),
        content: linkUrl,
        lastModified: new Date().toLocaleDateString(),
        isUploadedFile: false,
        isNotes: false,
        isLink: true,
        filePath: '',
        url: linkUrl
      });
    } else {
      return res.status(400).json({ error: 'Invalid file, notes content, or link URL' });
    }

    const savedFile = await fileData.save();
    unit.files.push(savedFile._id);
    await unit.save();
    
    const populatedUnit = await Unit.findById(unitId).populate('files');
    res.status(201).json(populatedUnit);
  } catch (err) {
    console.error('Error adding file:', err);
    res.status(500).json({ error: 'Failed to add file', details: err.message });
  }
});

router.get('/files/:fileId', async (req, res) => {
  try {
    const file = await File.findById(req.params.fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (file.url) {
      return res.redirect(file.url);
    }

    if (file.isNotes && file.content) {
      res.set({
        'Content-Type': 'text/plain',
        'Content-Disposition': `inline; filename="${file.name}"`
      });
      return res.send(file.content);
    }

    res.json(file);
  } catch (err) {
    console.error('Error serving file:', err);
    res.status(500).json({ error: 'Failed to serve file', details: err.message });
  }
});

router.put('/:unitId', async (req, res) => {
  try {
    const { unitId } = req.params;
    const { unitTitle, unitDescription } = req.body;

    if (!unitTitle) {
      return res.status(400).json({ error: 'Unit title is required' });
    }

    const unit = await Unit.findById(unitId).populate('files');
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    unit.title = unitTitle;

    if (unitDescription !== undefined) {
      const overviewFile = unit.files.find(file => file.title === 'Overview' && file.isNotes);
      if (overviewFile) {
        overviewFile.content = unitDescription;
        overviewFile.size = formatFileSize(Buffer.from(unitDescription).length);
        overviewFile.lastModified = new Date().toLocaleDateString();
        await overviewFile.save();
      } else if (unitDescription) {
        const newFile = new File({
          title: 'Overview',
          name: 'overview.txt',
          type: 'text/plain',
          size: formatFileSize(Buffer.from(unitDescription).length),
          content: unitDescription,
          lastModified: new Date().toLocaleDateString(),
          isNotes: true,
          isLink: false,
          filePath: '',
          url: ''
        });
        const savedFile = await newFile.save();
        unit.files.push(savedFile._id);
      }
    }

    await unit.save();
    const populatedUnit = await Unit.findById(unitId).populate('files');
    res.json(populatedUnit);
  } catch (err) {
    console.error('Error updating unit:', err);
    res.status(500).json({ error: 'Failed to update unit', details: err.message });
  }
});

router.put('/:unitId/files/:fileId', upload.single('fileUpload'), async (req, res) => {
  try {
    const { unitId, fileId } = req.params;
    const { fileName, notesContent, fileType, linkUrl } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: 'File name is required' });
    }

    const unit = await Unit.findById(unitId);
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    file.title = fileName;
    file.lastModified = new Date().toLocaleDateString();

    const oldFilePath = file.filePath;

    if (fileType === 'upload' && req.file) {
      if (!bucket) {
        return res.status(500).json({ error: 'Firebase Storage not available' });
      }
      
      const uploadResult = await uploadToFirebase(req.file, fileName);
      
      if (oldFilePath) {
        await deleteFromFirebase(oldFilePath);
      }

      const isTextFile = req.file.mimetype.startsWith('text/') ||
                       req.file.mimetype === 'application/json' ||
                       req.file.originalname.match(/\.(txt|js|html|css|md)$/);

      let fileContent = null;
      if (isTextFile && req.file.buffer) {
        fileContent = req.file.buffer.toString('utf8');
      }

      file.name = req.file.originalname;
      file.type = req.file.mimetype;
      file.size = formatFileSize(req.file.size);
      file.content = fileContent;
      file.isUploadedFile = true;
      file.isNotes = false;
      file.isLink = false;
      file.filePath = uploadResult.filePath;
      file.url = uploadResult.url;
    } else if (fileType === 'notes' && notesContent) {
      if (oldFilePath) {
        await deleteFromFirebase(oldFilePath);
      }

      const blob = Buffer.from(notesContent);
      file.name = fileName + '.txt';
      file.type = 'text/plain';
      file.size = formatFileSize(blob.length);
      file.content = notesContent;
      file.isUploadedFile = false;
      file.isNotes = true;
      file.isLink = false;
      file.filePath = '';
      file.url = '';
    } else if (fileType === 'link' && linkUrl) {
      if (!linkUrl.match(/^https?:\/\/[^\s/$.?#].[^\s]*$/)) {
        return res.status(400).json({ error: 'Invalid URL format' });
      }
      
      if (oldFilePath) {
        await deleteFromFirebase(oldFilePath);
      }

      file.name = fileName;
      file.type = 'text/link';
      file.size = formatFileSize(Buffer.from(linkUrl).length);
      file.content = linkUrl;
      file.isUploadedFile = false;
      file.isNotes = false;
      file.isLink = true;
      file.filePath = '';
      file.url = linkUrl;
    } else {
      return res.status(400).json({ error: 'Invalid file, notes content, or link URL' });
    }

    await file.save();
    const populatedUnit = await Unit.findById(unitId).populate('files');
    res.json(populatedUnit);
  } catch (err) {
    console.error('Error updating file:', err);
    res.status(500).json({ error: 'Failed to update file', details: err.message });
  }
});

router.delete('/:unitId', async (req, res) => {
  try {
    const { unitId } = req.params;
    const unit = await Unit.findById(unitId).populate('files');

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    for (const file of unit.files) {
      if (file.filePath) {
        await deleteFromFirebase(file.filePath);
      }
      await File.findByIdAndDelete(file._id);
    }

    await Unit.findByIdAndDelete(unitId);
    res.json({ message: 'Unit deleted successfully' });
  } catch (err) {
    console.error('Error deleting unit:', err);
    res.status(500).json({ error: 'Failed to delete unit', details: err.message });
  }
});

router.delete('/:unitId/files/:fileId', async (req, res) => {
  try {
    const { unitId, fileId } = req.params;
    const unit = await Unit.findById(unitId);

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (file.filePath) {
      await deleteFromFirebase(file.filePath);
    }

    unit.files = unit.files.filter((f) => f.toString() !== fileId);
    await unit.save();
    
    await File.findByIdAndDelete(fileId);
    
    const populatedUnit = await Unit.findById(unitId).populate('files');
    res.json(populatedUnit);
  } catch (err) {
    console.error('Error deleting file:', err);
    res.status(500).json({ error: 'Failed to delete file', details: err.message });
  }
});

module.exports = router;