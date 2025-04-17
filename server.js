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
  secret: 'your_super_secret_key', // change this in production
  resave: false,
  saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, 'public')));

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
  res.json({ loggedIn: req.session.loggedIn || false, role: req.session.user?.role });
});

// ✅ Logout Route
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// ✅ Get All Attendance
app.get('/api/attendance', (req, res) => {
  const sql = `
    SELECT attendance.id, students.name, attendance.timestamp
    FROM attendance
    LEFT JOIN students ON attendance.student_id = students.id
    ORDER BY attendance.timestamp DESC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// ✅ Add Attendance Using University ID
app.post('/api/attendance', (req, res) => {
  const { university_id, timestamp } = req.body;
  if (!university_id || !timestamp) return res.status(400).json({ error: 'Missing university_id or timestamp' });

  const findSQL = 'SELECT id FROM students WHERE university_id = ?';
  db.query(findSQL, [university_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'DB lookup failed' });
    if (results.length === 0) return res.status(404).json({ error: 'Student not found' });

    const student_id = results[0].id;

    const insertSQL = 'INSERT INTO attendance (student_id, timestamp) VALUES (?, ?)';
    db.query(insertSQL, [student_id, timestamp], (err2, insertResult) => {
      if (err2) return res.status(500).json({ error: 'Insert failed' });

      const updateSQL = `
        UPDATE students
        SET attendance_count = (
          SELECT COUNT(*) FROM attendance WHERE student_id = ?
        )
        WHERE id = ?
      `;
      db.query(updateSQL, [student_id, student_id], (err3) => {
        if (err3) return res.status(500).json({ error: 'Update failed' });
        res.json({ success: true, id: insertResult.insertId });
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
    sql += ' WHERE name LIKE ? OR student_group LIKE ? OR section = ? OR semester = ?';
    params = [`%${search}%`, `%${search}%`, search, search];
  }

  sql += ' ORDER BY name ASC';
  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// ✅ For AI Model Integration
app.post('/api/ai-attendance', (req, res) => {
  const { student_id } = req.body;
  if (!student_id) return res.status(400).json({ error: 'Missing student_id' });

  const sql = 'INSERT INTO attendance (student_id) VALUES (?)';
  db.query(sql, [student_id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Insert failed' });
    res.json({ success: true, id: result.insertId });
  });
});

// ✅ Test Route
app.get('/api/test', (req, res) => {
  res.json({ message: 'API working ✅' });
});

// ======== Start Server ========
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
