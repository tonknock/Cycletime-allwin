require('dotenv').config();
// รันครั้งเดียวเพื่อเพิ่มคอลัมน์ type/pipeSize/pattern ตรง ๆ (ข้าม knex ที่ค้าง)
// เช็คก่อนว่ามีคอลัมน์อยู่แล้วหรือยัง กันรันซ้ำแล้ว error
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

  db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = 'log_db' AND TABLE_NAME = 'entries'`,
    (err, results) => {
      if (err) {
        console.error('❌ Check columns failed:', err.message);
        db.end();
        process.exit(1);
      }

      const existing = results.map(r => r.COLUMN_NAME);
      const toAdd = [];
      if (!existing.includes('type'))     toAdd.push("ADD COLUMN `type` VARCHAR(255) DEFAULT 'stamping'");
      if (!existing.includes('pipeSize')) toAdd.push("ADD COLUMN `pipeSize` VARCHAR(255) NULL");
      if (!existing.includes('pattern'))  toAdd.push('ADD COLUMN `pattern` JSON NULL');

      if (toAdd.length === 0) {
        console.log('✅ คอลัมน์ type, pipeSize, pattern มีอยู่ครบแล้ว ไม่ต้องเพิ่มอะไรเพิ่ม');
        db.end();
        return;
      }

      const sql = `ALTER TABLE entries ${toAdd.join(', ')}`;
      console.log('กำลังรัน:', sql);
      db.query(sql, (err) => {
        if (err) {
          console.error('❌ ALTER TABLE failed:', err.message);
        } else {
          console.log(`✅ เพิ่มคอลัมน์สำเร็จ (${toAdd.length} คอลัมน์)`);
        }
        db.end();
      });
    }
  );
});
