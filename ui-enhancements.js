/* =============================================
   UI ENHANCEMENTS JS — Build Together Institute
   Dark Mode | Toast | Skeleton | Search/Filter
   Scroll Animations | Form Validation | Navbar
   ============================================= */

(function () {
    'use strict';

    /* ── 2. Toast Notifications ── */
    let toastContainer;

    function initToast() {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    window.showToast = window._uiShowToast = function (message, type = 'info', duration = 3500) {
        if (!toastContainer) initToast();
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
        const toast = document.createElement('div');
        toast.className = 'toast ' + type;
        toast.innerHTML =
            '<i class="fas ' + (icons[type] || icons.info) + ' toast-icon"></i>' +
            '<span>' + message + '</span>' +
            '<button class="toast-close" aria-label="Close">&times;</button>';
        toast.querySelector('.toast-close').addEventListener('click', () => dismissToast(toast));
        toastContainer.appendChild(toast);
        const timer = setTimeout(() => dismissToast(toast), duration);
        toast._timer = timer;
    };

    function dismissToast(toast) {
        clearTimeout(toast._timer);
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }

    /* ── 3. Skeleton Screen Loader ── */
    window.showSkeletonCards = function (containerId, count = 6) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < count; i++) {
            container.innerHTML +=
                '<div class="skeleton-card">' +
                  '<div class="skeleton skeleton-img"></div>' +
                  '<div class="skeleton-body">' +
                    '<div class="skeleton skeleton-title"></div>' +
                    '<div class="skeleton skeleton-text"></div>' +
                    '<div class="skeleton skeleton-text short"></div>' +
                    '<div class="skeleton skeleton-btn"></div>' +
                  '</div>' +
                '</div>';
        }
    };

    window.hideSkeletonCards = function (containerId) {
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = '';
    };

    /* ── 4. Search & Filter for Course Grid ── */
    window.initCourseSearch = function () {
        const grid = document.querySelector('.course-grid');
        if (!grid) return;

        const bar = document.createElement('div');
        bar.className = 'search-filter-bar';
        bar.innerHTML =
            '<div class="search-input-wrap">' +
              '<i class="fas fa-search"></i>' +
              '<input type="text" id="courseSearch" placeholder="Search courses..." autocomplete="off">' +
            '</div>' +
            '<select class="filter-select" id="durationFilter">' +
              '<option value="">All Durations</option>' +
              '<option value="3">3 Months</option>' +
              '<option value="4">4 Months</option>' +
              '<option value="5">5 Months</option>' +
              '<option value="6">6 Months</option>' +
              '<option value="8">8 Months</option>' +
            '</select>' +
            '<span class="search-results-count" id="searchCount"></span>';

        const noResults = document.createElement('div');
        noResults.className = 'no-results';
        noResults.id = 'noResults';
        noResults.innerHTML = '<i class="fas fa-search"></i><p>No courses found. Try a different search.</p>';

        grid.parentNode.insertBefore(bar, grid);
        grid.parentNode.insertBefore(noResults, grid.nextSibling);

        const cards = Array.from(grid.querySelectorAll('.course-card'));

        function filterCourses() {
            const q = document.getElementById('courseSearch').value.toLowerCase().trim();
            const dur = document.getElementById('durationFilter').value;
            let visible = 0;
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                const meta = card.querySelector('.course-meta');
                const durText = meta ? meta.textContent : '';
                const matchQ = !q || text.includes(q);
                const matchD = !dur || durText.includes(dur + ' Month');
                const show = matchQ && matchD;
                card.style.display = show ? '' : 'none';
                if (show) visible++;
            });
            const countEl = document.getElementById('searchCount');
            if (countEl) countEl.textContent = (q || dur) ? visible + ' course' + (visible !== 1 ? 's' : '') + ' found' : '';
            const noEl = document.getElementById('noResults');
            if (noEl) noEl.style.display = visible === 0 ? 'block' : 'none';
        }

        document.getElementById('courseSearch').addEventListener('input', filterCourses);
        document.getElementById('durationFilter').addEventListener('change', filterCourses);
    };

    /* ── 5. Scroll Reveal Animations ── */
    function initScrollReveal() {
        const els = document.querySelectorAll('[data-reveal]');
        if (!els.length) return;
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.classList.add('revealed');
                    obs.unobserve(e.target);
                }
            });
        }, { threshold: 0.12 });
        els.forEach(el => obs.observe(el));
    }

    /* ── 6. Navbar Scroll Shrink ── */
    function initNavbarScroll() {
        const navbar = document.querySelector('.navbar');
        if (!navbar) return;
        window.addEventListener('scroll', () => {
            navbar.classList.toggle('scrolled', window.scrollY > 60);
        }, { passive: true });
    }

    /* ── 7. Scroll To Top Button ── */
    function initScrollTop() {
        const btn = document.createElement('button');
        btn.id = 'scrollTopBtn';
        btn.setAttribute('aria-label', 'Scroll to top');
        btn.innerHTML = '<i class="fas fa-chevron-up"></i>';
        btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        document.body.appendChild(btn);
        window.addEventListener('scroll', () => {
            btn.classList.toggle('visible', window.scrollY > 400);
        }, { passive: true });
    }

    /* ── 8. Form Validation with Error Messages ── */
    window.validateField = function (input, rules) {
        const val = input.value.trim();
        let error = '';
        if (rules.required && !val) {
            error = rules.requiredMsg || 'This field is required.';
        } else if (rules.email && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
            error = 'Please enter a valid email address.';
        } else if (rules.phone && val && !/^\d{10}$/.test(val)) {
            error = 'Please enter a valid 10-digit phone number.';
        } else if (rules.url && val && !/^https?:\/\/.+/.test(val)) {
            error = 'Please enter a valid URL starting with http:// or https://';
        } else if (rules.minLen && val.length < rules.minLen) {
            error = 'Minimum ' + rules.minLen + ' characters required.';
        }

        const parent = input.closest('.app-form-group') || input.parentElement;
        let errEl = parent.querySelector('.field-error');
        let okEl  = parent.querySelector('.field-success');

        if (error) {
            input.classList.add('input-error');
            input.classList.remove('input-ok');
            if (!errEl) {
                errEl = document.createElement('span');
                errEl.className = 'field-error';
                parent.appendChild(errEl);
            }
            errEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + error;
            if (okEl) okEl.remove();
            return false;
        } else if (val) {
            input.classList.remove('input-error');
            input.classList.add('input-ok');
            if (errEl) errEl.remove();
            if (!okEl) {
                okEl = document.createElement('span');
                okEl.className = 'field-success';
                parent.appendChild(okEl);
            }
            okEl.innerHTML = '<i class="fas fa-check-circle"></i> Looks good!';
            return true;
        } else {
            input.classList.remove('input-error', 'input-ok');
            if (errEl) errEl.remove();
            if (okEl)  okEl.remove();
            return false;
        }
    };

    /* ── 9. Hero Floating Particles ── */
    function initParticles() {
        const hero = document.querySelector('.hero-section');
        if (!hero) return;
        const wrap = document.createElement('div');
        wrap.className = 'hero-particles';
        for (let i = 0; i < 18; i++) {
            const p = document.createElement('span');
            p.className = 'particle';
            p.style.cssText =
                'left:' + Math.random() * 100 + '%;' +
                'width:' + (4 + Math.random() * 6) + 'px;' +
                'height:' + (4 + Math.random() * 6) + 'px;' +
                'animation-duration:' + (8 + Math.random() * 12) + 's;' +
                'animation-delay:' + (Math.random() * 8) + 's;';
            wrap.appendChild(p);
        }
        hero.style.position = 'relative';
        hero.insertBefore(wrap, hero.firstChild);
    }

    /* ── 10. Newsletter Footer Form ── */
    function initNewsletterForm() {
        const forms = document.querySelectorAll('.newsletter-form');
        forms.forEach(form => {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                const input = this.querySelector('input[type="email"]');
                if (!input || !input.value.trim()) {
                    showToast('Please enter your email address.', 'warning');
                    return;
                }
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())) {
                    showToast('Please enter a valid email address.', 'error');
                    return;
                }
                showToast('🎉 You\'ve subscribed successfully!', 'success');
                input.value = '';
            });
        });
    }

    /* ── 11. Contact Form Inline Validation ── */
    function initContactFormValidation() {
        const form = document.getElementById('contactForm');
        if (!form) return;
        const fields = [
            { id: 'contactName',    rules: { required: true, minLen: 2 } },
            { id: 'contactEmail',   rules: { required: true, email: true } },
            { id: 'subject',        rules: { required: true, minLen: 3 } },
            { id: 'contactMessage', rules: { required: true, minLen: 10 } }
        ];
        fields.forEach(({ id, rules }) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('blur', () => validateField(el, rules));
        });
    }

    /* ── 12. Internship Form Inline Validation ── */
    function initInternFormValidation() {
        const form = document.getElementById('internForm');
        if (!form) return;
        const fields = [
            { id: 'iName',   rules: { required: true, minLen: 2 } },
            { id: 'iEmail',  rules: { required: true, email: true } },
            { id: 'iPhone',  rules: { required: true, phone: true } },
            { id: 'iCity',   rules: { required: true } },
            { id: 'iSkills', rules: { required: true } },
            { id: 'iResume', rules: { required: true, url: true } }
        ];
        fields.forEach(({ id, rules }) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('blur', () => validateField(el, rules));
        });
    }

    /* ── Init All ── */
    document.addEventListener('DOMContentLoaded', function () {
        initToast();
        initScrollReveal();
        initNavbarScroll();
        initScrollTop();
        initParticles();
        initNewsletterForm();
        initContactFormValidation();
        initInternFormValidation();
        initCourseSearch();
    });

})();
