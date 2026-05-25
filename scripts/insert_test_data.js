const mysql = require('mysql2');
require('dotenv').config();
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'buildtogether'
});

const sampleQA = [
  { question: 'What is a closure in JavaScript?', answer: 'A closure is a function that has access to variables from another function\'s scope.' },
  { question: 'Explain event loop briefly.', answer: 'The event loop handles asynchronous callbacks by processing the callback queue when the call stack is empty.' }
];

db.connect(err => {
  if (err) { console.error('DB connect error:', err.message); process.exit(1); }
  const qaJson = JSON.stringify(sampleQA);
  db.query('INSERT INTO course_qa_data (course_name, pdf_path, qa_json) VALUES (?,?,?)', ['Full Stack Web Development','/tmp/sample.pdf', qaJson], (err) => {
    if (err) console.error('Insert QA error:', err.message); else console.log('Inserted sample QA');

    // Insert mock_interview_access for user id 13 (test admin) as approved
    db.query('INSERT INTO mock_interview_access (user_id, course_name, status) VALUES (?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)', [13, 'Full Stack Web Development', 'approved'], (err) => {
      if (err) console.error('Insert access error:', err.message); else console.log('Inserted/updated mock_interview_access');
      process.exit(0);
    });
  });
});
