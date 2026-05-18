// 1. Page Navigation Logic
function showPage(pageId) {
    // Ellaa section-ayum hide pannu
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        page.style.display = 'none';
        page.classList.remove('active');
    });

    // Select panna page-ah mattum show pannu
    const selectedPage = document.getElementById(pageId);
    if (selectedPage) {
        // Home-kku mattum center alignment vara flex use pannuvom
        if (pageId === 'home') {
            selectedPage.style.display = 'flex';
        } else {
            selectedPage.style.display = 'block';
        }
        selectedPage.classList.add('active');
    }

    // Page change aana udane top-kku scroll panna
    window.scrollTo(0, 0);
}

// 2. Login / Sign Up Toggle Logic
function toggleAuth(type) {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');

    if (type === 'login') {
        loginForm.classList.add('active-form');
        signupForm.classList.remove('active-form');
        loginBtn.classList.add('toggle-active');
        signupBtn.classList.remove('toggle-active');
    } else {
        signupForm.classList.add('active-form');
        loginForm.classList.remove('active-form');
        signupBtn.classList.add('toggle-active');
        loginBtn.classList.remove('toggle-active');
    }
}

// 3. Form Submission (Apply/Contact)
document.addEventListener('submit', function(e) {
    if(e.target.id === 'applyForm' || e.target.tagName === 'FORM') {
        e.preventDefault();
        alert('Thank you! Your request has been submitted to Build Together Institute.');
        e.target.reset();
    }
});

// Default-ah load aagum pothu Home Page kaatta
window.onload = () => {
    showPage('home');
};