const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
(async ()=>{
  try {
    const res = await fetch('http://localhost:5000/api/auth/signup', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ full_name:'Test Admin', email:'testadmin@example.com', password:'TestPass123', role:'admin' })
    });
    const text = await res.text();
    console.log('STATUS', res.status);
    console.log('BODY', text);
  } catch (e) {
    console.error('ERR', e.message);
  }
})();
