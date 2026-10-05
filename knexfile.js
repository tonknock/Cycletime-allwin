require('dotenv').config();

module.exports = {
  development: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD, // ใส่รหัสผ่าน MySQL ตามที่คุณตั้งไว้ใน server.js
      database: process.env.DB_NAME
    },
    migrations: {
      directory: './migrations'
    }
  }
};