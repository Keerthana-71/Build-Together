const fs = require('fs');
const mysql = require('mysql2');
require('dotenv').config();

const sql = fs.readFileSync('setup_tables.sql', 'utf8');
const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'buildtogether',
  multipleStatements: true
});

db.connect(err => {
  if (err) {
    console.error('DB connect error:', err.message);
    process.exit(1);
  }
  console.log('Connected to DB, running migrations...');

  // Execute the whole file as one multi-statement to preserve statements like ALTER TABLE IF NOT EXISTS
    // Execute statements sequentially and continue on errors
    (async () => {
      for (const stmt of statements) {
        try {
          if (!stmt.trim()) continue;
          await new Promise((resolve, reject) => db.query(stmt, (err) => err ? reject(err) : resolve()));
          console.log('Executed:', stmt.split('\n')[0].slice(0,120));
        } catch (e) {
          console.warn('Statement error (ignored):', e.message);
        }
      }
      console.log('Migrations run (errors ignored where present).');
      process.exit(0);
    })();
});
