require('dotenv').config();
// สคริปต์นี้รันครั้งเดียวเพื่อแก้ข้อมูลเก่าที่ type ผิด (ลบทิ้งได้หลังรันเสร็จ)
const mysql = require('mysql2');

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect((err) => {
  if (err) {
    console.error('❌ Connect failed:', err.message);
    process.exit(1);
  }

  // แถวไหนมี ctPerPiece อยู่ใน stats แปลว่าเป็นข้อมูล "ตัดท่อ" จริง ๆ
  // แต่ตอนนี้ type ถูกตั้งเป็น stamping ผิด ๆ จาก migration ให้แก้กลับเป็น pipe
  const sql = `
    UPDATE entries
    SET type = 'pipe'
    WHERE JSON_EXTRACT(stats, '$.ctPerPiece') IS NOT NULL
      AND (type IS NULL OR type = 'stamping')
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error('❌ Update failed:', err.message);
    } else {
      console.log(`✅ แก้ไข type ให้ถูกต้องแล้ว: ${result.affectedRows} แถว`);
    }
    db.end();
  });
});
