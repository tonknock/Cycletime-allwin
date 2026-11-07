require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// ---------- รหัสผ่านเข้าเว็บ: edit = บันทึก/ลบได้, view = ดูอย่างเดียว ----------
// ไม่ยกเว้น localhost เพราะ Tailscale Funnel ส่งคนจากอินเทอร์เน็ตเข้ามาทาง 127.0.0.1
const AUTH_COOKIE = 'ct_auth';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function rolePassword(role) {
  return (role === 'edit' ? process.env.EDIT_PASSWORD : process.env.VIEW_PASSWORD) || '';
}

function sameText(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ลายเซ็นผูกกับรหัสผ่านปัจจุบัน ถ้าเปลี่ยนรหัสใน .env ทุกคนต้องล็อกอินใหม่
function sign(role, exp) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET || '')
    .update(`${role}.${exp}.${rolePassword(role)}`).digest('hex');
}

function getRole(req) {
  if (!process.env.SESSION_SECRET) return null;
  const raw = (req.headers.cookie || '').split(';').map(c => c.trim())
    .find(c => c.startsWith(AUTH_COOKIE + '='));
  if (!raw) return null;
  const [role, exp, sig] = decodeURIComponent(raw.slice(AUTH_COOKIE.length + 1)).split('.');
  if ((role !== 'edit' && role !== 'view') || !rolePassword(role)) return null;
  if (!(Number(exp) > Date.now()) || !sig || !sameText(sig, sign(role, exp))) return null;
  return role;
}

function isHttps(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

// กันเดารหัส: ผิด 5 ครั้งใน 10 นาที ล็อก 5 นาที (แยกตาม IP จริงที่ proxy ส่งมา)
const loginFails = new Map();
function clientKey(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}

app.get('/api/auth-status', (req, res) => {
  res.json({ configured: !!(process.env.SESSION_SECRET && (rolePassword('edit') || rolePassword('view'))) });
});

app.post('/api/login', (req, res) => {
  const key = clientKey(req);
  const now = Date.now();
  const f = loginFails.get(key);
  if (f && f.lockUntil > now) {
    return res.status(429).json({ error: 'locked', retryInSec: Math.ceil((f.lockUntil - now) / 1000) });
  }
  if (!process.env.SESSION_SECRET || (!rolePassword('edit') && !rolePassword('view'))) {
    return res.status(503).json({ error: 'not_set' });
  }
  const pw = String((req.body && req.body.password) || '');
  let role = null;
  if (pw && rolePassword('edit') && sameText(pw, rolePassword('edit'))) role = 'edit';
  else if (pw && rolePassword('view') && sameText(pw, rolePassword('view'))) role = 'view';

  if (!role) {
    const rec = (f && now - f.first < 10 * 60 * 1000) ? f : { count: 0, first: now, lockUntil: 0 };
    rec.count++;
    if (rec.count >= 5) { rec.lockUntil = now + 5 * 60 * 1000; rec.count = 0; rec.first = now; }
    loginFails.set(key, rec);
    return setTimeout(() => res.status(401).json({ error: 'wrong_password' }), 500);
  }
  loginFails.delete(key);
  const exp = now + SESSION_MS;
  const value = encodeURIComponent(`${role}.${exp}.${sign(role, exp)}`);
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${value}; Path=/; Max-Age=${SESSION_MS / 1000}; HttpOnly; SameSite=Lax${isHttps(req) ? '; Secure' : ''}`);
  res.json({ role });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  res.json({ success: true });
});

app.get(['/login', '/login.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ทุกหน้าและทุก API หลังจากนี้ต้องล็อกอิน; บันทึก/ลบต้องเป็นสิทธิ์ edit
app.use((req, res, next) => {
  const role = getRole(req);
  if (!role) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'login_required' });
    return res.redirect('/login');
  }
  if (!['GET', 'HEAD'].includes(req.method) && role !== 'edit') {
    return res.status(403).json({ error: 'view_only' });
  }
  req.role = role;
  next();
});

app.get('/api/me', (req, res) => res.json({ role: req.role }));

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

// ---------- จำนวน OP ทั้งหมดต่อ P/N ----------
const pnKey = (pn) => String(pn || '').toLowerCase().replace(/\s+/g, '');

app.get('/api/pn-ops', (req, res) => {
  db.query('SELECT pn_key, pn, total_ops FROM pn_ops', (err, results) => {
    if (err) {
      console.error('Fetch pn_ops error:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results.map(r => ({ key: r.pn_key, pn: r.pn, totalOps: r.total_ops })));
  });
});

// ตั้งค่า (สิทธิ์ edit เท่านั้น ถูกกันไว้ที่ middleware แล้ว); totalOps = 0 คือลบค่าที่ตั้งไว้
app.put('/api/pn-ops', (req, res) => {
  const pn = String((req.body && req.body.pn) || '').trim();
  const totalOps = parseInt(req.body && req.body.totalOps, 10);
  const key = pnKey(pn);
  if (!key || !(totalOps >= 0 && totalOps <= 50)) {
    return res.status(400).json({ error: 'invalid' });
  }
  const done = (err) => {
    if (err) {
      console.error('Save pn_ops error:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  };
  if (totalOps === 0) return db.query('DELETE FROM pn_ops WHERE pn_key = ?', [key], done);
  db.query(
    `INSERT INTO pn_ops (pn_key, pn, total_ops, updatedAt) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE pn = VALUES(pn), total_ops = VALUES(total_ops), updatedAt = VALUES(updatedAt)`,
    [key, pn, totalOps, Date.now()], done);
});

// ---------- วัสดุต่อ P/N (เช่น Aluminium) ----------
const MATERIALS = ['aluminium'];

app.get('/api/pn-material', (req, res) => {
  db.query('SELECT pn_key, pn, material FROM pn_material', (err, results) => {
    if (err) {
      console.error('Fetch pn_material error:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results.map(r => ({ key: r.pn_key, pn: r.pn, material: r.material })));
  });
});

// ตั้งค่า (สิทธิ์ edit เท่านั้น); material ว่าง = ลบค่าที่ตั้งไว้
app.put('/api/pn-material', (req, res) => {
  const pn = String((req.body && req.body.pn) || '').trim();
  const material = String((req.body && req.body.material) || '').trim().toLowerCase();
  const key = pnKey(pn);
  if (!key || (material && !MATERIALS.includes(material))) {
    return res.status(400).json({ error: 'invalid' });
  }
  const done = (err) => {
    if (err) {
      console.error('Save pn_material error:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  };
  if (!material) return db.query('DELETE FROM pn_material WHERE pn_key = ?', [key], done);
  db.query(
    `INSERT INTO pn_material (pn_key, pn, material, updatedAt) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE pn = VALUES(pn), material = VALUES(material), updatedAt = VALUES(updatedAt)`,
    [key, pn, material, Date.now()], done);
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});