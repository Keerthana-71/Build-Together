const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
(async ()=>{
  try {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTMsImVtYWlsIjoidGVzdGFkbWluQGV4YW1wbGUuY29tIiwicm9sZSI6ImFkbWluIiwibmFtZSI6IlRlc3QgQWRtaW4iLCJpYXQiOjE3Nzk0MjU4NjUsImV4cCI6MTc4MDAzMDY2NX0.sCLz4SjHQyeIyi4EqTsUVtW5R9wI16Ia7deyK1Rnx4k';
    const res = await fetch('http://localhost:5000/api/interview/course-questions/Full%20Stack%20Web%20Development', { headers: { Authorization: 'Bearer ' + token } });
    console.log('STATUS', res.status);
    const txt = await res.text();
    console.log(txt);
  } catch (e) { console.error('ERR', e.message); }
})();
