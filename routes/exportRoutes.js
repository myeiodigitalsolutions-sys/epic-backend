const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const Staff = require('../models/Staff');
const Student = require('../models/StudentV2');
const Class = require('../models/Class');
const { Parser } = require('json2csv');

// ---------- Helpers ----------

// Ensure exports directory exists
const ensureExportsDir = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Find logo in multiple possible locations
const findLogoPath = () => {
  const logoPaths = [
    path.join(__dirname, '../public/edenberg1.jpg'),
    path.join(__dirname, '../public/edenberg1.png'),
    path.join(__dirname, '../../public/edenberg1.jpg'),
    path.join(__dirname, '../../public/edenberg1.png'),
    path.join(__dirname, '../../../public/edenberg1.jpg'),
    path.join(__dirname, '../../../public/edenberg1.png'),
    'public/edenberg1.jpg',
    'public/edenberg1.png',
  ];

  for (const lp of logoPaths) {
    if (fs.existsSync(lp)) return lp;
  }
  return null;
};

// Date formatting for report
const formatDateTime = (date) => {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Generic table drawer for neat alignment
// columns: [{ key, label, width }]
// rows: array of objects
const drawTable = (doc, {
  startY,
  columns,
  rows,
  rowHeight = 18,
  headerHeight = 20,
  marginLeft = 40,
  marginRight = 40,
}) => {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const bottomMargin = 50;
  const maxY = pageHeight - bottomMargin;
  let y = startY;

  const drawHeader = () => {
    let x = marginLeft;
    doc.save();
    doc.rect(marginLeft, y, pageWidth - marginLeft - marginRight, headerHeight)
      .fill('#f3f4f6');
    doc.fillColor('#1f2937').font('Helvetica-Bold').fontSize(9);

    columns.forEach(col => {
      doc.text(col.label, x + 4, y + 5, {
        width: col.width - 8,
        ellipsis: true,
      });
      x += col.width;
    });

    doc.restore();
    y += headerHeight;
  };

  const drawRow = (row, index) => {
    let x = marginLeft;
    // Alternate row color
    if (index % 2 === 0) {
      doc.save();
      doc.rect(marginLeft, y, pageWidth - marginLeft - marginRight, rowHeight)
        .fill('#f9fafb');
      doc.restore();
    }

    doc.fillColor('#374151').font('Helvetica').fontSize(8);

    columns.forEach(col => {
      let value = row[col.key];
      if (value === undefined || value === null || value === '') {
        value = 'N/A';
      }
      doc.text(String(value), x + 4, y + 4, {
        width: col.width - 8,
        ellipsis: true,
      });
      x += col.width;
    });

    y += rowHeight;
  };

  // Initial header
  drawHeader();

  rows.forEach((row, idx) => {
    // New page if needed
    if (y + rowHeight > maxY) {
      doc.addPage();
      y = 50; // top margin
      drawHeader();
    }
    drawRow(row, idx);
  });

  return y;
};

// ---------- 1) ORIGINAL DIRECTORY PDF (with password table) ----------
// POST /api/export/pdf-directory
router.post('/pdf-directory', async (req, res) => {
  try {
    const { type, selectedEmails, includePasswords } = req.body;

    if (!type || !['staff', 'student'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type specified' });
    }

    const Model = type === 'staff' ? Staff : Student;
    const query =
      selectedEmails && selectedEmails.length > 0
        ? { email: { $in: selectedEmails } }
        : {};

    const users = await Model.find(query);

    if (users.length === 0) {
      return res.status(404).json({ error: 'No users found' });
    }

    const filename = `${type}_export_${Date.now()}.pdf`;
    const filePath = path.join(__dirname, '../exports', filename);
    ensureExportsDir(filePath);

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Logo + header
    const logoPath = findLogoPath();
    let logoFound = !!logoPath;

    if (logoFound) {
      try {
        doc.image(logoPath, 30, 30, { width: 60, height: 60 });
      } catch (err) {
        console.error('Logo error:', err.message);
        logoFound = false;
      }
    }

    doc.fontSize(24).font('Helvetica-Bold').fillColor('#1e40af');

    if (logoFound) {
      doc.text('University', 100, 40);
      doc.fontSize(16).font('Helvetica').fillColor('#4b5563');
      doc.text(
        `${type.charAt(0).toUpperCase() + type.slice(1)} Directory`,
        100,
        70
      );
    } else {
      doc.text('University', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(16).font('Helvetica').fillColor('#4b5563');
      doc.text(
        `${type.charAt(0).toUpperCase() + type.slice(1)} Directory`,
        { align: 'center' }
      );
    }

    doc.moveTo(30, 110).lineTo(565, 110).strokeColor('#1e40af').lineWidth(1).stroke();

    // Export meta
    doc.y = 120;
    const now = new Date();
    doc.fontSize(10).fillColor('#6b7280');
    doc.text(`Export Date: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`);
    doc.text(`Total ${type}s: ${users.length}`);
    doc.text(`Document ID: ${filename.replace('.pdf', '')}`);
    doc.moveDown(1);

    // Table headers
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1f2937');

    let headers, colWidths;
    if (includePasswords) {
      headers = ['No.', 'Name', 'Email', 'Password', type === 'staff' ? 'Department' : 'Program'];
      colWidths = [30, 120, 150, 100, 120];
    } else {
      headers = ['No.', 'Name', 'Email', type === 'staff' ? 'Department' : 'Program'];
      colWidths = [30, 150, 180, 150];
    }

    const startY = doc.y;
    let xPos = 30;

    doc.rect(30, startY, 535, 25).fill('#f3f4f6');
    headers.forEach((header, i) => {
      doc.fillColor('#1e40af').text(header, xPos + 5, startY + 8, {
        width: colWidths[i] - 10,
      });
      xPos += colWidths[i];
    });

    doc.moveDown(1);
    doc.fontSize(10).font('Helvetica').fillColor('#374151');

    users.forEach((user, index) => {
      const rowY = doc.y;

      if (rowY > 700) {
        doc.addPage();
        doc.fontSize(10).fillColor('#6b7280');
        doc.text(
          `University - ${type} Directory - Page ${Math.floor(index / 30) + 2}`,
          30,
          30
        );
        doc.moveDown(3);
      }

      xPos = 30;

      if (index % 2 === 0) {
        doc.rect(30, rowY, 535, 20).fill('#f9fafb');
      }

      doc.fillColor('#374151')
        .text(String(index + 1), xPos + 5, rowY + 5, { width: colWidths[0] - 10 });
      xPos += colWidths[0];

      doc.text(user.name || 'N/A', xPos + 5, rowY + 5, {
        width: colWidths[1] - 10,
      });
      xPos += colWidths[1];

      doc.text(user.email || 'N/A', xPos + 5, rowY + 5, {
        width: colWidths[2] - 10,
      });
      xPos += colWidths[2];

      if (includePasswords) {
        const passwordText = user.password || 'Password not stored';
        doc.text(passwordText, xPos + 5, rowY + 5, {
          width: colWidths[3] - 10,
        });
        xPos += colWidths[3];
      }

      const field = type === 'staff' ? user.department : user.program;
      doc.text(field || 'N/A', xPos + 5, rowY + 5, {
        width: colWidths[includePasswords ? 4 : 3] - 10,
      });

      doc.moveDown(1);

      if (index < users.length - 1) {
        doc.strokeColor('#e5e7eb').lineWidth(0.5);
        doc.moveTo(30, doc.y).lineTo(565, doc.y).stroke();
        doc.moveDown(0.5);
      }
    });

    doc.end();

    writeStream.on('finish', () => {
      res.json({
        success: true,
        filename,
        downloadUrl: `/exports/${filename}`,
        count: users.length,
        note: includePasswords
          ? `Passwords included (${users.filter(u => u.password).length} out of ${users.length} have passwords)`
          : 'Passwords not included',
        logoUsed: logoFound,
      });
    });

    writeStream.on('error', (err) => {
      console.error('Error writing PDF:', err);
      res.status(500).json({ error: 'Failed to generate PDF' });
    });
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- 2) ORIGINAL DIRECTORY ZIP (simple CSV + README) ----------
// POST /api/export/zip-basic
router.post('/zip-basic', async (req, res) => {
  try {
    const { type, selectedEmails, includePasswords } = req.body;

    if (!type || !['staff', 'student'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type specified' });
    }

    const Model = type === 'staff' ? Staff : Student;
    const query =
      selectedEmails && selectedEmails.length > 0
        ? { email: { $in: selectedEmails } }
        : {};

    const users = await Model.find(query);

    if (users.length === 0) {
      return res.status(404).json({ error: 'No users found' });
    }

    const filename = `${type}_export_${Date.now()}.zip`;
    const filePath = path.join(__dirname, '../exports', filename);
    ensureExportsDir(filePath);

    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      res.json({
        success: true,
        filename,
        downloadUrl: `/exports/${filename}`,
        count: users.length,
        size: archive.pointer(),
      });
    });

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.status(500).json({ error: 'Failed to create ZIP archive' });
    });

    archive.pipe(output);

    const headers = includePasswords
      ? ['No.', 'Name', 'Email', 'Password', type === 'staff' ? 'Department' : 'Program']
      : ['No.', 'Name', 'Email', type === 'staff' ? 'Department' : 'Program'];

    let csvContent = headers.join(',') + '\n';

    users.forEach((user, index) => {
      const row = [
        String(index + 1),
        `"${(user.name || '').replace(/"/g, '""')}"`,
        `"${(user.email || '').replace(/"/g, '""')}"`,
      ];

      if (includePasswords) {
        row.push(`"${(user.password || 'Password not stored').replace(/"/g, '""')}"`);
      }

      const field = type === 'staff' ? user.department : user.program;
      row.push(`"${(field || '').replace(/"/g, '""')}"`);

      csvContent += row.join(',') + '\n';
    });

    archive.append(csvContent, { name: `${type}_list.csv` });

    const readmeContent = `University ${type.toUpperCase()} Export
========================================

EXPORT DETAILS:
---------------
Export Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
Total ${type}s: ${users.length}
Includes Passwords: ${includePasswords ? 'Yes' : 'No'}

FILE CONTENTS:
--------------
1. ${type}_list.csv - Contains ${type} information in CSV format

NOTES:
------
${includePasswords ? '⚠️ This file contains user passwords. Handle with extreme care!' : 'This file contains user information.'}
Passwords are stored in plain text in this export.

SECURITY:
---------
1. Store this file in a secure location
2. Do not share this file via unsecured channels
3. Change passwords regularly for security

CONTACT:
--------
University IT Department
Email: it-support@University.edu.zm

Generated by  University Admin System`;

    archive.append(readmeContent, { name: 'README.txt' });
    archive.finalize();
  } catch (err) {
    console.error('ZIP export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- 3) NEW NEAT REPORT PDF (aligned tables) ----------
// POST /api/export/pdf
router.post('/pdf', async (req, res) => {
  try {
    const { type, selectedEmails, includePasswords } = req.body;

    if (!type || !['staff', 'student', 'both'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid export type. Use "staff", "student", or "both"',
      });
    }

    // Fetch data
    let staffData = [];
    let studentData = [];
    let classData = [];

    if (type === 'staff' || type === 'both') {
      let staffQuery = {};
      if (selectedEmails && selectedEmails.length > 0) {
        staffQuery = { email: { $in: selectedEmails } };
      }
      staffData = await Staff.find(staffQuery).sort({ createdAt: -1 });
    }

    if (type === 'student' || type === 'both') {
      let studentQuery = {};
      if (selectedEmails && selectedEmails.length > 0) {
        studentQuery = { email: { $in: selectedEmails } };
      }
      studentData = await Student.find(studentQuery).sort({ createdAt: -1 });
    }

    classData = await Class.find({}).sort({ createdAt: -1 });

    // Create PDF (A4 landscape for more width, bufferPages to safely use switchToPage)
    const timestamp = Date.now();
    const filename = `export_${type}_${timestamp}.pdf`;
    const filepath = path.join(__dirname, '../exports', filename);
    ensureExportsDir(filepath);

    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      layout: 'landscape',
      bufferPages: true,
    });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const pageWidth = doc.page.width;

    // Header
    const logoPath = findLogoPath();
    if (logoPath) {
      try {
        doc.image(logoPath, 40, 30, { width: 50 });
      } catch (e) {
        console.error('Logo render error:', e.message);
      }
    }

    doc.fontSize(22).font('Helvetica-Bold').fillColor('#1e3a8a');
    doc.text('University', 100, 30);

    doc.fontSize(14).font('Helvetica').fillColor('#4b5563');
    doc.text(
      `${type.charAt(0).toUpperCase() + type.slice(1)} Export Report`,
      100,
      60
    );

    doc.fontSize(9).fillColor('#6b7280');
    doc.text(`Generated on: ${formatDateTime(new Date())}`, 100, 80);

    // Summary boxes
    doc.moveDown(1.5);
    let y = 110;

    const summaryBoxWidth = (pageWidth - 80 - 20) / 3; // margin 40 left/right, gap 10
    const summaryBoxHeight = 45;

    const summaries = [
      { label: 'Total Staff', value: staffData.length, color: '#2563eb' },
      { label: 'Total Students', value: studentData.length, color: '#7c3aed' },
      { label: 'Total Classes', value: classData.length, color: '#16a34a' },
    ];

    summaries.forEach((s, idx) => {
      const x = 40 + idx * (summaryBoxWidth + 10);
      doc.save();
      doc.roundedRect(x, y, summaryBoxWidth, summaryBoxHeight, 6)
        .fillOpacity(0.08)
        .fill(s.color);
      doc.restore();

      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11);
      doc.text(s.label, x + 10, y + 8);

      doc.font('Helvetica-Bold').fontSize(16).fillColor(s.color);
      doc.text(String(s.value), x + 10, y + 22);
    });

    y += summaryBoxHeight + 20;

    // ---------- Staff table ----------
    if (type === 'staff' || type === 'both') {
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#1e40af');
      doc.text('Staff Details', 40, y);
      y += 18;

      const staffColumns = [
        { key: 'no', label: 'No.', width: 35 },
        { key: 'name', label: 'Name', width: 150 },
        { key: 'email', label: 'Email', width: 200 },
        { key: 'department', label: 'Department', width: 120 },
      ];

      if (includePasswords) {
        staffColumns.push({ key: 'password', label: 'Password', width: 140 });
      }

      staffColumns.push({ key: 'createdAt', label: 'Created', width: 120 });

      const staffRows = staffData.map((s, idx) => ({
        no: idx + 1,
        name: s.name || 'N/A',
        email: s.email || 'N/A',
        department: s.department || 'N/A',
        password: includePasswords ? (s.password || 'Not stored') : undefined,
        createdAt: formatDateTime(s.createdAt),
      }));

      y = drawTable(doc, {
        startY: y,
        columns: staffColumns,
        rows: staffRows,
        rowHeight: 16,
        headerHeight: 20,
        marginLeft: 40,
        marginRight: 40,
      });

      y += 20;
    }

    // ---------- Student table ----------
    if (type === 'student' || type === 'both') {
      if (y > doc.page.height - 120) {
        doc.addPage();
        y = 50;
      }

      doc.fontSize(13).font('Helvetica-Bold').fillColor('#1e40af');
      doc.text('Student Details', 40, y);
      y += 18;

      const studentColumns = [
        { key: 'no', label: 'No.', width: 35 },
        { key: 'name', label: 'Name', width: 150 },
        { key: 'email', label: 'Email', width: 200 },
        { key: 'program', label: 'Program', width: 150 },
      ];

      if (includePasswords) {
        studentColumns.push({ key: 'password', label: 'Password', width: 140 });
      }

      studentColumns.push({ key: 'createdAt', label: 'Created', width: 120 });

      const studentRows = studentData.map((s, idx) => ({
        no: idx + 1,
        name: s.name || 'N/A',
        email: s.email || 'N/A',
        program: s.program || 'N/A',
        password: includePasswords ? (s.password || 'Not stored') : undefined,
        createdAt: formatDateTime(s.createdAt),
      }));

      y = drawTable(doc, {
        startY: y,
        columns: studentColumns,
        rows: studentRows,
        rowHeight: 16,
        headerHeight: 20,
        marginLeft: 40,
        marginRight: 40,
      });

      y += 20;
    }

    // ---------- Class table (compact) ----------
    if (classData.length > 0) {
      if (y > doc.page.height - 120) {
        doc.addPage();
        y = 50;
      }

      doc.fontSize(13).font('Helvetica-Bold').fillColor('#1e40af');
      doc.text('Class Details', 40, y);
      y += 18;

      const classColumns = [
        { key: 'no', label: 'No.', width: 35 },
        { key: 'name', label: 'Name', width: 150 },
        { key: 'section', label: 'Section', width: 80 },
        { key: 'subject', label: 'Subject', width: 120 },
        { key: 'teacher', label: 'Teacher', width: 150 },
        { key: 'createdAt', label: 'Created', width: 140 },
      ];

      const classRows = classData.map((c, idx) => ({
        no: idx + 1,
        name: c.name || 'N/A',
        section: c.section || 'N/A',
        subject: c.subject || 'N/A',
        teacher: c.teacher || 'N/A',
        createdAt: formatDateTime(c.createdAt),
      }));

      drawTable(doc, {
        startY: y,
        columns: classColumns,
        rows: classRows,
        rowHeight: 16,
        headerHeight: 20,
        marginLeft: 40,
        marginRight: 40,
      });
    }

    // Footer on each page
    const range = doc.bufferedPageRange();
    const totalPages = range.count;

    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.height - 30;
      doc.fontSize(8).fillColor('#6b7280');
      doc.text(
        `Page ${i + 1} of ${totalPages}`,
        40,
        footerY,
        { width: doc.page.width - 80, align: 'center' }
      );
      doc.text(
        `University - Generated on ${formatDateTime(new Date())}`,
        40,
        footerY + 10,
        { width: doc.page.width - 80, align: 'center' }
      );
    }

    doc.end();

    stream.on('finish', () => {
      res.json({
        success: true,
        message: 'PDF export completed successfully',
        filename,
        downloadUrl: `/exports/${filename}`,
        count:
          type === 'both'
            ? staffData.length + studentData.length
            : type === 'staff'
            ? staffData.length
            : studentData.length,
      });
    });
  } catch (error) {
    console.error('PDF export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export PDF: ' + error.message,
    });
  }
});

// ---------- 4) REPORT ZIP (multi CSVs) ----------
// POST /api/export/zip
router.post('/zip', async (req, res) => {
  try {
    const { type, selectedEmails, includePasswords } = req.body;

    if (!type || !['staff', 'student', 'both'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid export type',
      });
    }

    const timestamp = Date.now();
    const filename = `export_${type}_${timestamp}.zip`;
    const filepath = path.join(__dirname, '../exports', filename);
    ensureExportsDir(filepath);

    const output = fs.createWriteStream(filepath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      res.json({
        success: true,
        message: 'ZIP export completed successfully',
        filename,
        downloadUrl: `/exports/${filename}`,
        size: archive.pointer(),
      });
    });

    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(output);

    let staffData = [];
    let studentData = [];
    let classData = [];

    if (type === 'staff' || type === 'both') {
      let staffQuery = {};
      if (selectedEmails && selectedEmails.length > 0) {
        staffQuery = { email: { $in: selectedEmails } };
      }
      staffData = await Staff.find(staffQuery);
    }

    if (type === 'student' || type === 'both') {
      let studentQuery = {};
      if (selectedEmails && selectedEmails.length > 0) {
        studentQuery = { email: { $in: selectedEmails } };
      }
      studentData = await Student.find(studentQuery);
    }

    classData = await Class.find({});

    const readmeContent = `University Export Report
===============================

Export Type: ${type}
Generated: ${new Date().toISOString()}
Total Staff: ${staffData.length}
Total Students: ${studentData.length}
Total Classes: ${classData.length}
Includes Passwords (CSV): ${includePasswords ? 'Yes' : 'No'}

This ZIP file contains:
1. ${type}_data.csv - Main data file
2. creation_timestamps.csv - Timestamps of all user creations
3. class_creations.csv - Class creation records

CREATION TIMELINE
-----------------

Staff Members Created:
${staffData.map((s, i) => `${i + 1}. ${s.name} (${s.email}) - Created: ${formatDateTime(s.createdAt)}`).join('\n')}

Students Created:
${studentData.map((s, i) => `${i + 1}. ${s.name} (${s.email}) - Created: ${formatDateTime(s.createdAt)}`).join('\n')}

Classes Created:
${classData.map((c, i) => `${i + 1}. ${c.name} by ${c.teacher} - Created: ${formatDateTime(c.createdAt)}`).join('\n')}

--- End of Report ---`;

    archive.append(readmeContent, { name: 'README.txt' });

    if (staffData.length > 0 && (type === 'staff' || type === 'both')) {
      const staffFields = includePasswords
        ? ['name', 'email', 'department', 'password', 'createdAt']
        : ['name', 'email', 'department', 'createdAt'];

      const staffParser = new Parser({ fields: staffFields });
      const staffCsv = staffParser.parse(staffData);
      archive.append(staffCsv, { name: 'staff_data.csv' });
    }

    if (studentData.length > 0 && (type === 'student' || type === 'both')) {
      const studentFields = includePasswords
        ? ['name', 'email', 'program', 'password', 'createdAt']
        : ['name', 'email', 'program', 'createdAt'];

      const studentParser = new Parser({ fields: studentFields });
      const studentCsv = studentParser.parse(studentData);
      archive.append(studentCsv, { name: 'student_data.csv' });
    }

    const allCreations = [
      ...staffData.map((s) => ({
        type: 'staff',
        name: s.name,
        email: s.email,
        details: s.department,
        createdAt: s.createdAt,
      })),
      ...studentData.map((s) => ({
        type: 'student',
        name: s.name,
        email: s.email,
        details: s.program,
        createdAt: s.createdAt,
      })),
    ];

    if (allCreations.length > 0) {
      const creationFields = ['type', 'name', 'email', 'details', 'createdAt'];
      const creationParser = new Parser({ fields: creationFields });
      const creationCsv = creationParser.parse(allCreations);
      archive.append(creationCsv, { name: 'creation_timestamps.csv' });
    }

    if (classData.length > 0) {
      const classFields = ['name', 'section', 'subject', 'teacher', 'staffId', 'createdAt'];
      const classParser = new Parser({ fields: classFields });
      const classCsv = classParser.parse(classData);
      archive.append(classCsv, { name: 'class_creations.csv' });
    }

    archive.finalize();
  } catch (error) {
    console.error('ZIP export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export ZIP: ' + error.message,
    });
  }
});

module.exports = router;
