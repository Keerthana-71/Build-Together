const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
(async ()=>{
  try {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTMsImVtYWlsIjoidGVzdGFkbWluQGV4YW1wbGUuY29tIiwicm9sZSI6ImFkbWluIiwibmFtZSI6IlRlc3QgQWRtaW4iLCJpYXQiOjE3Nzk0MjU4NjUsImV4cCI6MTc4MDAzMDY2NX0.sCLz4SjHQyeIyi4EqTsUVtW5R9wI16Ia7deyK1Rnx4k';
    const res = await fetch('http://localhost:5000/api/interview/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ role: 'Full Stack Web Development', level: 'Beginner', total_questions: 2, session_id: 'mi_test_123', course_name: 'Full Stack Web Development' })
    });
    console.log('STATUS', res.status);
    console.log(await res.text());
  } catch (e) { console.error('ERR', e.message); }
})();
