/**
 * darkmode.js — Global Dark/Light Theme for Build Together Institute
 * Works across ALL pages: home, about, contact, courses, internship,
 * apply, dashboard, admin-dashboard
 * Stored in localStorage so preference persists across all pages
 */
(function () {
    'use strict';

    const KEY = 'bti-dark';

    // ── Read saved preference ──
    function isDark() {
        return localStorage.getItem(KEY) === 'true';
    }

    // ── Apply theme immediately to <html> to prevent flash ──
    if (isDark()) {
        document.documentElement.classList.add('dark-pre');
    }

    // ── All inline-style overrides (sections with hardcoded style="background:...") ──
    const BG_OVERRIDES = [
        // contact page
        { sel: '.map-section',           dark: '#0f172a',  light: '#f8fafc' },
        { sel: '.faq-section',           dark: '#1e293b',  light: '#ffffff' },
        // courses page
        { sel: '.fee-structure-section', dark: '#1e293b',  light: '#f8fafc' },
        // course & internship application pages
        { sel: '.application-section',   dark: '#0f172a',  light: '#f8fafc' },
        { sel: '.application-card',      dark: '#1e293b',  light: '#ffffff' },
        { sel: '.application-form-body', dark: '#1e293b',  light: '#ffffff' },
        // dashboard inline styles
        { sel: '.dashboard-main',        dark: '#0a0f1e',  light: '#f1f5f9' },
        { sel: '.dash-main',             dark: '#0a0f1e',  light: '#f1f5f9' },
    ];

    const TEXT_OVERRIDES = [
        { sel: '.faq-question',                          dark: '#e2e8f0', light: '#1e293b' },
        { sel: '.faq-answer',                            dark: '#94a3b8', light: '#64748b' },
        { sel: '.map-section h2, .faq-section h2',       dark: '#e2e8f0', light: '#1e293b' },
        { sel: '.map-section > .container > p, .faq-section > .container > p', dark: '#94a3b8', light: '#64748b' },
        { sel: '.fee-structure-section h2',              dark: '#e2e8f0', light: '#1e293b' },
        { sel: '.fee-structure-section > .container > p',dark: '#94a3b8', light: '#64748b' },
        { sel: '.fee-name',                              dark: '#e2e8f0', light: '#1e293b' },
        { sel: '.fee-duration',                          dark: '#94a3b8', light: '#64748b' },
        // application pages
        { sel: '.app-form-group label',                  dark: '#cbd5e1', light: '#374151' },
        { sel: '.success-msg h3',                        dark: '#e2e8f0', light: '#1e293b' },
        { sel: '.success-msg p',                         dark: '#94a3b8', light: '#64748b' },
        // dashboard page-title / page-sub (admin)
        { sel: '.page-title',  dark: '#e2e8f0', light: '#1e293b' },
        { sel: '.page-sub',    dark: '#94a3b8', light: '#64748b' },
        // stat cards inline
        { sel: '.stat-card h3', dark: '#e2e8f0', light: '#1e293b' },
        { sel: '.stat-card p',  dark: '#94a3b8', light: '#64748b' },
    ];

    // ── Apply / remove all overrides ──
    function applyOverrides(dark) {
        BG_OVERRIDES.forEach(({ sel, dark: d, light: l }) => {
            document.querySelectorAll(sel).forEach(el => {
                el.style.background = dark ? d : l;
            });
        });
        TEXT_OVERRIDES.forEach(({ sel, dark: d, light: l }) => {
            document.querySelectorAll(sel).forEach(el => {
                el.style.color = dark ? d : l;
            });
        });
    }

    // ── Main apply function ──
    function applyTheme(dark) {
        // Toggle body class (drives all CSS rules in style.css)
        document.body.classList.toggle('dark-mode', dark);

        // Update toggle button
        const btn = document.getElementById('darkToggleBtn');
        if (btn) {
            btn.innerHTML = dark
                ? '<i class="fas fa-sun"></i>'
                : '<i class="fas fa-moon"></i>';
            btn.title = dark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
        }

        // Override inline styles
        applyOverrides(dark);

        // Prevent html background flash
        document.documentElement.style.background = dark ? '#0f172a' : '';
        document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    }

    // ── Init on DOM ready ──
    document.addEventListener('DOMContentLoaded', function () {
        const dark = isDark();
        applyTheme(dark);

        // Wire up the toggle button
        const btn = document.getElementById('darkToggleBtn');
        if (btn) {
            btn.addEventListener('click', function () {
                const nowDark = !isDark();
                localStorage.setItem(KEY, nowDark);
                applyTheme(nowDark);
            });
        }

        // Re-run overrides after a short delay to catch dynamically rendered content
        // (dashboard loads content via fetch — re-apply after 1s and 3s)
        setTimeout(() => applyOverrides(isDark()), 800);
        setTimeout(() => applyOverrides(isDark()), 2500);
    });

    // ── Listen for storage changes (sync across tabs) ──
    window.addEventListener('storage', function (e) {
        if (e.key === KEY) applyTheme(e.newValue === 'true');
    });

})();
