-- โครงสร้างตารางสำหรับฐานข้อมูล SQLite (data.db)
-- ปกติ server.js จะรันคำสั่งนี้ให้อัตโนมัติทุกครั้งที่เริ่มรันอยู่แล้ว
-- ไฟล์นี้มีไว้อ้างอิง หรือใช้กรณีอยากสร้างไฟล์ data.db เองล่วงหน้าด้วยคำสั่ง:
--   sqlite3 data.db < schema.sql

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pn TEXT,
  op TEXT,
  process TEXT,
  shift_hours REAL DEFAULT 7.5,
  rows_json TEXT,
  stats_json TEXT,
  created_at INTEGER
);
