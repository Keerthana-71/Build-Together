// ui.js - Pro JS for ui.html

// Elements
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');
const navbar = document.querySelector('.navbar');
const fadeElements = document.querySelectorAll('.fade-in-up');
const formSteps = document.querySelectorAll('.app-step');
const progressSteps = document.querySelectorAll('.progress-step');
const nextBtns = document.querySelectorAll('.next-btn');
const prevBtns = document.querySelectorAll('.prev-btn');
const appForm = document.getElementById('appForm');
const statNumbers = document.querySelectorAll('.stat-number');
const courseCards = document.querySelectorAll('.course-card');

// Intersection Observer
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate');
        }
    });
}, { threshold: 0.1 });

// Navbar scroll
window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
});

// Mobile menu
hamburger.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    hamburger.classList.toggle('active');
});

// Smooth scroll
document.querySelectorAll('a[href^=\"#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(anchor.getAttribute('href'));
        target?.scrollIntoView({ behavior: 'smooth' });
        navMenu.classList.remove('active');
    });
});

// Animate on scroll
fadeElements.forEach(el => observer.observe(el));

// Stats counters
function animateCounters() {
    const statObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                statNumbers.forEach((num, i) => {
                    const target = parseInt(num.dataset.target) || 100;
                    let current = 0;
                    const increment = target / 50;
                    const timer = setInterval(() => {
                        current += increment;
                        if (current >= target) {
                            num.textContent = target.toLocaleString();
                            clearInterval(timer);
                        } else {
                            num.textContent = Math.floor(current).toLocaleString();
                        }
                    }, 30);
                });
                statObserver.unobserve(entry.target);
            }
        });
    });
    document.querySelector('.stats-grid') && statObserver.observe(document.querySelector('.stats-grid'));
}
animateCounters();

// Course hovers
courseCards.forEach(card => {
    card.addEventListener('mouseenter', () => card.style.transform = 'translateY(-10px)');
    card.addEventListener('mouseleave', () => card.style.transform = 'translateY(0)');
});

// Multi-step form
let currentStep = 1;
const totalSteps = formSteps.length;

nextBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (validateStep(currentStep)) nextStep();
    });
});

prevBtns.forEach(btn => {
    btn.addEventListener('click', prevStep);
});

function nextStep() {
    if (currentStep < totalSteps) {
        formSteps[currentStep - 1].classList.remove('active');
        currentStep++;
        formSteps[currentStep - 1].classList.add('active');
        updateProgress();
    }
}

function prevStep() {
    if (currentStep > 1) {
        formSteps[currentStep - 1].classList.remove('active');
        currentStep--;
        formSteps[currentStep - 1].classList.add('active');
        updateProgress();
    }
}

function updateProgress() {
    progressSteps.forEach((step, i) => {
        step.classList.toggle('active', i + 1 <= currentStep);
    });
}

function validateStep(step) {
    const inputs = formSteps[step - 1].querySelectorAll('[required]');
    let valid = true;
    inputs.forEach(input => {
        if (!input.value.trim()) {
            input.style.borderColor = 'var(--error)';
            valid = false;
        } else {
            input.style.borderColor = '';
        }
    });
    return valid;
}

appForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (validateStep(currentStep)) {
        alert('Application submitted successfully!');
        appForm.reset();
        currentStep = 1;
        formSteps.forEach(s => s.classList.remove('active'));
        formSteps[0].classList.add('active');
        updateProgress();
    }
});

// Init on load
document.addEventListener('DOMContentLoaded', () => {
    formSteps[0]?.classList.add('active');
    progressSteps[0]?.classList.add('active');
});

// Anti-right-click (original)
document.addEventListener('contextmenu', e => e.preventDefault());

