const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
(async ()=>{
  try {
    const res = await fetch('http://localhost:5000/api/auth/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email:'testadmin@example.com', password:'TestPass123' })
    });
    const json = await res.json();
    console.log('STATUS', res.status);
    console.log(JSON.stringify(json, null, 2));
  } catch (e) {
    console.error('ERR', e.message);
  }
})();
