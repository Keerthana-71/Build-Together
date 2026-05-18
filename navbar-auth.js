// navbar-auth.js — included in every page
(function () {
    const name    = sessionStorage.getItem('userName');
    const loggedIn = sessionStorage.getItem('loggedIn');
    const role    = sessionStorage.getItem('userRole');

    // Find the <li> that contains the apply-nav link
    const applyLi = document.querySelector('.nav-links .apply-nav')?.parentElement;
    if (!applyLi) return;

    if (loggedIn && name) {
        const initial     = name.charAt(0).toUpperCase();
        const displayName = name.length > 16 ? name.substring(0, 16) + '…' : name;
        const dashLink    = role === 'admin' ? 'admin-dashboard.html' : 'dashboard.html';
        const dashLabel   = role === 'admin' ? 'Admin Dashboard' : 'My Dashboard';
        const dashIcon    = role === 'admin' ? 'fa-user-shield' : 'fa-th-large';

        applyLi.innerHTML = `
            <div class="nav-user" id="navUser">
                <button class="nav-user-btn" id="navUserBtn" aria-expanded="false">
                    <span class="avatar">${initial}</span>
                    Hi, ${displayName}
                    <i class="fas fa-chevron-down" style="font-size:0.7rem;"></i>
                </button>
                <div class="nav-dropdown">
                    <div class="nav-dropdown-header">
                        <span>Logged in as</span>
                        <strong>${name}</strong>
                    </div>
                    <a href="${dashLink}" style="display:flex;align-items:center;gap:10px;padding:12px 18px;color:#374151;text-decoration:none;font-size:0.9rem;font-weight:600;transition:background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'">
                        <i class="fas ${dashIcon}" style="color:#667eea;"></i> ${dashLabel}
                    </a>
                    <button class="nav-dropdown-logout" id="logoutBtn">
                        <i class="fas fa-sign-out-alt"></i> Logout
                    </button>
                </div>
            </div>`;

        // Toggle dropdown on click (for mobile)
        document.getElementById('navUserBtn').addEventListener('click', function () {
            const navUser = document.getElementById('navUser');
            navUser.classList.toggle('open');
            this.setAttribute('aria-expanded', navUser.classList.contains('open'));
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', function (e) {
            const navUser = document.getElementById('navUser');
            if (navUser && !navUser.contains(e.target)) {
                navUser.classList.remove('open');
            }
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', function () {
            sessionStorage.removeItem('loggedIn');
            sessionStorage.removeItem('userName');
            sessionStorage.removeItem('userEmail');
            sessionStorage.removeItem('userRole');
            sessionStorage.removeItem('token');
            location.href = 'apply.html';
        });
    }
})();
