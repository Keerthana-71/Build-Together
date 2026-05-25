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
  db.query('SHOW TABLES', (err, rows) => {
    if (err) { console.error('Query error:', err.message); process.exit(1); }
    console.log('Tables:');
    rows.forEach(r => console.log(Object.values(r)[0]));
    process.exit(0);
  });
});
