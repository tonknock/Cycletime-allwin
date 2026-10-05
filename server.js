require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ตั้งค่าการเชื่อมต่อ MySQL (อ่านค่าจากไฟล์ .env)
// ใช้ pool แทน connection เดียว ถ้าการเชื่อมต่อหลุด pool จะต่อใหม่ให้เอง
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true
});

db.query('SELECT 1', (err) => {
  if (err) {
    console.error('❌ Connection DB failed:', err.message);
  } else {
    console.log('✅ Connected to MySQL Database!');
  }
});

// 1. ดึงข้อมูลประวัติทั้งหมด
app.get('/api/entries', (req, res) => {
  const sql = 'SELECT * FROM entries ORDER BY id DESC';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Fetch error:', err);
      return res.status(500).json({ error: err.message });
    }

    const parsedResults = results.map(row => ({
      id: row.id,
      type: row.type || 'stamping',
      pn: row.pn,
      op: row.op,
      process: row.process,
      pipeSize: row.pipeSize || undefined,
      pattern: row.pattern
        ? (typeof row.pattern === 'string' ? JSON.parse(row.pattern) : row.pattern)
        : undefined,
      shiftHours: row.shiftHours,
      rows: typeof row.rows === 'string' ? JSON.parse(row.rows) : (row.rows || []),
      stats: typeof row.stats === 'string' ? JSON.parse(row.stats) : (row.stats || {}),
      createdAt: row.createdAt
    }));

    res.json(parsedResults);
  });
});

// 2. บันทึกข้อมูลใหม่ (ใส่ Backticks ครอบชื่อ column กัน Reserved Word)
app.post('/api/entries', (req, res) => {
  const { type, pn, op, process, pipeSize, pattern, shiftHours, rows, stats } = req.body;
  const createdAt = Date.now();

  const sql = `INSERT INTO entries (\`type\`, \`pn\`, \`op\`, \`process\`, \`pipeSize\`, \`pattern\`, \`shiftHours\`, \`rows\`, \`stats\`, \`createdAt\`)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.query(sql, [
    type || 'stamping',
    pn || '',
    op || '',
    process || '',
    pipeSize || null,
    pattern ? JSON.stringify(pattern) : null,
    shiftHours || 0,
    JSON.stringify(rows || []),
    JSON.stringify(stats || {}),
    createdAt
  ], (err, result) => {
    if (err) {
      console.error('❌ Insert Error:', err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, id: result.insertId });
  });
});

// 3. ลบข้อมูลตาม ID
app.delete('/api/entries/:id', (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM entries WHERE id = ?';
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error('Delete error:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});