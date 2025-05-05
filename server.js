// server.js
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const app = express();
const PORT = 3000;

// ======== MySQL Connection ========
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect(err => {
  if (err) {
    console.error('DB connection error:', err);
  } else {
    console.log('MySQL connected...');
  }
});

// ======== Middleware ========
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, 'public')));

// Add default route to serve load.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'load.html'));
});

// ======== Role-based Middleware ========
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  } else {
    return res.status(403).json({ error: 'Access denied' });
  }
}

function isTeacher(req, res, next) {
  if (req.session.user && (req.session.user.role === 'teacher' || req.session.user.role === 'admin')) {
    return next();
  } else {
    return res.status(403).json({ error: 'Access denied' });
  }
}

function isStudent(req, res, next) {
  if (req.session.user && req.session.user.role === 'student') {
    return next();
  } else {
    return res.status(403).json({ error: 'Access denied' });
  }
}

// ======== ROUTES ========

// ✅ Login Route
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const sql = 'SELECT * FROM users WHERE username = ? AND password = ?';

  db.query(sql, [username, password], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });

    if (results.length > 0) {
      req.session.loggedIn = true;
      req.session.user = results[0];  // Store the user details (including role)
      res.json({ success: true, role: results[0].role });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  });
});

// ✅ Session Check Route
app.get('/api/session', (req, res) => {
  res.json({
    loggedIn: req.session.loggedIn || false,
    role: req.session.user?.role,
    id: req.session.user?.id,
    username: req.session.user?.username,
    name: req.session.user?.name
  });
});

// ✅ Logout Route (Don't konw if we even use it)
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// ✅ Get All Attendance
app.get('/api/attendance', (req, res) => {
  const class_id = req.query.class_id;
  let sql = `
    SELECT attendance.id, students.name, attendance.timestamp
    FROM attendance
    LEFT JOIN students ON attendance.student_id = students.id
  `;
  
  if (class_id) {
    sql += ' WHERE attendance.class_id = ?';
  }
  
  sql += ' ORDER BY attendance.timestamp DESC';
  
  const params = class_id ? [class_id] : [];
  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// Utility: Convert ISO string to MySQL DATETIME
function toMySQLDatetime(isoString) {
  // Converts ISO 8601 string to MySQL DATETIME format
  const d = new Date(isoString);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0');
}

// AI Attendance endpoint for computer vision integration
app.post('/api/ai-attendance', (req, res) => {
  const { university_id, class_id, timestamp } = req.body;
  if (!university_id || !class_id || !timestamp) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const mysqlTimestamp = toMySQLDatetime(timestamp);
  const dateOnly = mysqlTimestamp.split(' ')[0];

  // 1. Find student by university_id
  const findStudentSQL = 'SELECT id FROM students WHERE university_id = ?';
  db.query(findStudentSQL, [university_id], (err, studentResults) => {
    if (err) return res.status(500).json({ error: 'DB lookup failed', details: err.message });
    if (studentResults.length === 0) return res.status(404).json({ error: 'Student not found' });
    const student_id = studentResults[0].id;

    // 2. Check if student is enrolled in the class
    const checkEnrollSQL = 'SELECT * FROM class_students WHERE class_id = ? AND student_id = ?';
    db.query(checkEnrollSQL, [class_id, student_id], (errEnroll, enrollResults) => {
      if (errEnroll) return res.status(500).json({ error: 'Enrollment check failed', details: errEnroll.message });
      if (enrollResults.length === 0) return res.status(400).json({ error: 'Student is not enrolled in this class' });

      // 3. Prevent duplicate attendance for the same day
      const checkDuplicateSQL = `
        SELECT * FROM attendance
        WHERE student_id = ? AND class_id = ? AND DATE(timestamp) = ?
      `;
      db.query(checkDuplicateSQL, [student_id, class_id, dateOnly], (errDup, dupResults) => {
        if (errDup) return res.status(500).json({ error: 'Duplicate check failed', details: errDup.message });
        if (dupResults.length > 0) return res.status(400).json({ error: 'Attendance already recorded for this student today.' });

        // 4. Insert attendance record
        const insertSQL = 'INSERT INTO attendance (student_id, timestamp, class_id) VALUES (?, ?, ?)';
        db.query(insertSQL, [student_id, mysqlTimestamp, class_id], (err2, insertResult) => {
          if (err2) return res.status(500).json({ error: 'Insert failed', details: err2.message });

          // 5. Update student's attendance count
          const updateSQL = `
            UPDATE students
            SET attendance_count = (
              SELECT COUNT(*) FROM attendance WHERE student_id = ?
            )
            WHERE id = ?
          `;
          db.query(updateSQL, [student_id, student_id], (err3) => {
            if (err3) return res.status(500).json({ error: 'Update failed', details: err3.message });
            res.json({ success: true, id: insertResult.insertId });
          });
        });
      });
    });
  });
});

// ✅ Get All Students (with optional search)
app.get('/api/students', (req, res) => {
  const search = req.query.search;
  let sql = 'SELECT * FROM students';
  let params = [];

  if (search) {
    sql += ' WHERE name LIKE ? OR student_group LIKE ? OR section = ? OR semester = ? OR university_id = ?';
    params = [`%${search}%`, `%${search}%`, search, search, search];
  }

  sql += ' ORDER BY name ASC';
  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// ✅ Test Route
app.get('/api/test', (req, res) => {
  res.json({ message: 'API working ✅' });
});

// ✅ Class Management Routes
app.post('/api/classes', isTeacher, (req, res) => {
  const { name, description, schedule, teacher_id } = req.body;
  const sql = 'INSERT INTO classes (name, description, schedule, teacher_id) VALUES (?, ?, ?, ?)';
  
  db.query(sql, [name, description, schedule, teacher_id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Failed to create class' });
    res.json({ success: true, id: result.insertId });
  });
});

app.get('/api/classes', (req, res) => {
  const sql = `
    SELECT c.*, COALESCE(u.name, u.username) as teacher_name 
    FROM classes c 
    LEFT JOIN users u ON c.teacher_id = u.id
  `;
  
  console.log('Fetching classes...');
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching classes:', err);
      // Check if the error is due to missing tables
      if (err.code === 'ER_NO_SUCH_TABLE') {
        return res.status(500).json({ 
          error: 'Database tables not set up. Please run the SQL setup script.',
          details: err.message 
        });
      }
      return res.status(500).json({ 
        error: 'Failed to fetch classes',
        details: err.message 
      });
    }
    console.log('Classes fetched:', results);
    res.json(results);
  });
});

app.post('/api/classes/:classId/students', isTeacher, (req, res) => {
  const { student_id } = req.body;
  const { classId } = req.params;

  // Prevent duplicate enrollments
  const checkSQL = 'SELECT * FROM class_students WHERE class_id = ? AND student_id = ?';
  db.query(checkSQL, [classId, student_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (results.length > 0) return res.status(400).json({ error: 'Student already enrolled' });

    const sql = 'INSERT INTO class_students (class_id, student_id) VALUES (?, ?)';
    db.query(sql, [classId, student_id], (err2, result) => {
      if (err2) return res.status(500).json({ error: 'Failed to add student to class' });
      res.json({ success: true });
    });
  });
});

app.get('/api/classes/:classId/students', (req, res) => {
  const { classId } = req.params;
  const sql = `
    SELECT s.* 
    FROM students s
    JOIN class_students cs ON s.id = cs.student_id
    WHERE cs.class_id = ?
  `;
  
  db.query(sql, [classId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch class students' });
    res.json(results);
  });
});


// ✅ Manual Attendance Insertion (Add Button in live.html)
app.post('/api/attendance', (req, res) => {
  const { university_id, class_id, timestamp } = req.body;
  if (!university_id || !class_id || !timestamp) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const mysqlTimestamp = toMySQLDatetime(timestamp);
  const dateOnly = mysqlTimestamp.split(' ')[0];

  const findStudentSQL = 'SELECT id FROM students WHERE university_id = ?';
  db.query(findStudentSQL, [university_id], (err, studentResults) => {
    if (err) return res.status(500).json({ error: 'DB lookup failed', details: err.message });
    if (studentResults.length === 0) return res.status(404).json({ error: 'Student not found' });
    
    const student_id = studentResults[0].id;

    const checkEnrollSQL = 'SELECT * FROM class_students WHERE class_id = ? AND student_id = ?';
    db.query(checkEnrollSQL, [class_id, student_id], (errEnroll, enrollResults) => {
      if (errEnroll) return res.status(500).json({ error: 'Enrollment check failed', details: errEnroll.message });
      if (enrollResults.length === 0) return res.status(400).json({ error: 'Student is not enrolled in this class' });

      const checkDuplicateSQL = `
        SELECT * FROM attendance
        WHERE student_id = ? AND class_id = ? AND DATE(timestamp) = ?
      `;
      db.query(checkDuplicateSQL, [student_id, class_id, dateOnly], (errDup, dupResults) => {
        if (errDup) return res.status(500).json({ error: 'Duplicate check failed', details: errDup.message });
        if (dupResults.length > 0) return res.status(400).json({ error: 'Attendance already recorded for this student today.' });

        const insertSQL = 'INSERT INTO attendance (student_id, timestamp, class_id) VALUES (?, ?, ?)';
        db.query(insertSQL, [student_id, mysqlTimestamp, class_id], (err2, insertResult) => {
          if (err2) return res.status(500).json({ error: 'Insert failed', details: err2.message });

          const updateSQL = `
            UPDATE students
            SET attendance_count = (
              SELECT COUNT(*) FROM attendance WHERE student_id = ?
            )
            WHERE id = ?
          `;
          db.query(updateSQL, [student_id, student_id], (err3) => {
            if (err3) return res.status(500).json({ error: 'Update failed', details: err3.message });
            res.json({ success: true, id: insertResult.insertId });
          });
        });
      });
    });
  });
});

// ======== Start Server ========
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
