const mysql = require('mysql2');
require('dotenv').config();
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'buildtogether'
});

db.connect(err => {
  if (err) { console.error('DB connect error:', err.message); process.exit(1); }
  db.query('SHOW CREATE TABLE users', (err, rows) => {
    if (err) { console.error('Query error:', err.message); process.exit(1); }
    console.log(rows[0]['Create Table']);
    process.exit(0);
  });
});
