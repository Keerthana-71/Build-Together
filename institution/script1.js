// script.js - Production-grade vanilla JavaScript for SkillForge Institute

// DOM Elements
const navbar = document.getElementById('navbar');
const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('nav-menu');
const form = document.getElementById('applicationForm');
const formSteps = document.querySelectorAll('.form-step');
const progressSteps = document.querySelectorAll('.progress-step');
const formSuccess = document.getElementById('formSuccess');
const testimonialCarousel = document.getElementById('testimonialCarousel');
const partnersTrack = document.getElementById('partnersTrack');
const faqItems = document.querySelectorAll('.faq-item');
const statNumbers = document.querySelectorAll('.stat-number');

// Intersection Observer for scroll animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate');
        }
    });
}, observerOptions);

// Initialize Lucide Icons
lucide.createIcons();

// Smooth scrolling for nav links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
        // Close mobile menu
        navMenu.classList.remove('active');
    });
});

// Navbar scroll effects
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// Mobile hamburger menu
hamburger.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    hamburger.querySelector('i').setAttribute('data-lucide', 
        navMenu.classList.contains('active') ? 'x' : 'menu'
    );
    lucide.createIcons();
});

// Animate elements on scroll
document.querySelectorAll('.fade-in-up').forEach(el => {
    observer.observe(el);
});

// Counter animation for stats
function animateCounters() {
    const statObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = parseInt(entry.target.getAttribute('data-target'));
                const number = entry.target;
                const increment = target / 100;
                let current = 0;

                const timer = setInterval(() => {
                    current += increment;
                    if (current >= target) {
                        number.textContent = target.toLocaleString();
                        clearInterval(timer);
                    } else {
                        number.textContent = Math.floor(current).toLocaleString();
                    }
                }, 20);

                statObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    document.querySelectorAll('.stat-card').forEach(card => {
        statObserver.observe(card);
    });
}

// Testimonial Carousel
function initTestimonialCarousel() {
    const track = testimonialCarousel.querySelector('.carousel-track');
    const cards = track.querySelectorAll('.testimonial-card');
    const dotsContainer = document.getElementById('carouselDots');
    
    let currentIndex = 0;
    const totalCards = cards.length;
    
    // Create dots
    cards.forEach((_, index) => {
        const dot = document.createElement('div');
        dot.className = `carousel-dot ${index === 0 ? 'active' : ''}`;
        dot.addEventListener('click', () => goToSlide(index));
        dotsContainer.appendChild(dot);
    });
    
    const dots = dotsContainer.querySelectorAll('.carousel-dot');
    
    function goToSlide(index) {
        currentIndex = index;
        track.style.transform = `translateX(-${currentIndex * 100}%)`;
        updateDots();
    }
    
    function updateDots() {
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === currentIndex);
        });
    }
    
    // Auto-slide
    setInterval(() => {
        currentIndex = (currentIndex + 1) % totalCards;
        goToSlide(currentIndex);
    }, 5000);
}

// Multi-step Form Logic
function initForm() {
    let currentStep = 1;
    const totalSteps = formSteps.length;
    
    // Next/Previous buttons
    document.querySelectorAll('.next-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (validateStep(currentStep)) {
                nextStep();
            }
        });
    });
    
    document.querySelectorAll('.prev-btn').forEach(btn => {
        btn.addEventListener('click', () => prevStep());
    });
    
    // Form submission
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (validateStep(currentStep)) {
            submitForm();
        }
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
            clearErrors(currentStep + 1);
        }
    }
    
    function updateProgress() {
        progressSteps.forEach((step, index) => {
            step.classList.toggle('active', index + 1 <= currentStep);
        });
    }
    
    function validateStep(stepNum) {
        const step = formSteps[stepNum - 1];
        const inputs = step.querySelectorAll('input[required], select[required]');
        let isValid = true;
        
        inputs.forEach(input => {
            const errorEl = input.parentNode.querySelector('.error-message') || 
                           input.nextElementSibling?.classList.contains('error-message') ? input.nextElementSibling : null;
            
            if (!input.value.trim()) {
                showError(input, errorEl, 'This field is required');
                isValid = false;
            } else if (input.type === 'email' && !isValidEmail(input.value)) {
                showError(input, errorEl, 'Please enter a valid email');
                isValid = false;
            } else {
                clearError(input, errorEl);
            }
        });
        
        return isValid;
    }
    
    function showError(input, errorEl, message) {
        input.style.borderColor = 'var(--error)';
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    }
    
    function clearError(input, errorEl) {
        input.style.borderColor = '';
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }
    }
    
    function clearErrors(stepNum) {
        const step = formSteps[stepNum - 1];
        const inputs = step.querySelectorAll('input, select');
        inputs.forEach(input => {
            clearError(input, input.parentNode.querySelector('.error-message'));
        });
    }
    
    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
    
    function submitForm() {
        // Simulate form submission
        setTimeout(() => {
            form.classList.add('submitted');
            form.style.display = 'none';
            formSuccess.classList.add('active');
            
            // Scroll to success message
            formSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Reset form after 5 seconds
            setTimeout(() => {
                resetForm();
            }, 10000);
        }, 1500);
    }
    
    window.resetForm = function() {
        form.reset();
        currentStep = 1;
        formSteps.forEach(step => step.classList.remove('active'));
        formSteps[0].classList.add('active');
        progressSteps.forEach(step => step.classList.remove('active'));
        progressSteps[0].classList.add('active');
        formSuccess.classList.remove('active');
        form.classList.remove('submitted');
        form.style.display = 'block';
    };
}

// FAQ Accordion
function initFAQ() {
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            
            // Close all items
            faqItems.forEach(i => {
                i.classList.remove('active');
            });
            
            // Open clicked item if it wasn't active
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });
}

// Partners infinite scroll (enhanced)
function initPartnersScroll() {
    const track = partnersTrack;
    const logos = track.querySelectorAll('.partner-logo');
    
    // Clone logos for seamless loop
    logos.forEach(logo => {
        const clone = logo.cloneNode(true);
        track.appendChild(clone);
    });
    
    // Pause on hover
    track.parentElement.addEventListener('mouseenter', () => {
        track.style.animationPlayState = 'paused';
    });
    
    track.parentElement.addEventListener('mouseleave', () => {
        track.style.animationPlayState = 'running';
    });
    
    // Responsive speed adjustment
    function adjustScrollSpeed() {
        if (window.innerWidth < 768) {
            track.style.animationDuration = '40s';
        } else {
            track.style.animationDuration = '30s';
        }
    }
    
    adjustScrollSpeed();
    window.addEventListener('resize', adjustScrollSpeed);
}

// Course cards hover enhancement
function initCourseCards() {
    document.querySelectorAll('.course-card').forEach((card, index) => {
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-10px) scale(1.02)';
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0) scale(1)';
        });
        
        // Staggered entrance
        setTimeout(() => {
            card.classList.add('animate');
        }, index * 100);
    });
}

// Form input enhancements
function initFormEnhancements() {
    // Real-time validation
    document.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('blur', function() {
            if (this.hasAttribute('required')) {
                const stepNum = parseInt(this.closest('.form-step').dataset.step);
                validateStep(stepNum);
            }
        });
        
        input.addEventListener('input', function() {
            const errorEl = this.parentNode.querySelector('.error-message');
            if (errorEl) {
                clearError(this, errorEl);
            }
        });
    });
    
    // Phone number formatting
    const phoneInput = document.getElementById('phone');
    phoneInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 10) value = value.slice(0, 10);
        e.target.value = value;
    });
}

// Keyboard navigation for form
function initKeyboardNav() {
    document.addEventListener('keydown', (e) => {
        const activeStep = document.querySelector('.form-step.active');
        if (!activeStep) return;
        
        if (e.key === 'Enter' && e.target.matches('.next-btn, .prev-btn')) {
            e.target.click();
        }
    });
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Core initializations
    animateCounters();
    initTestimonialCarousel();
    initForm();
    initFAQ();
    initPartnersScroll();
    initCourseCards();
    initFormEnhancements();
    initKeyboardNav();
    
    // Update progress on page load
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('step')) {
        const step = parseInt(urlParams.get('step'));
        // Simulate going to specific step (for testing)
    }
});

// Performance optimizations
// Preload critical animations
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-20px); } }
`;
document.head.appendChild(style);

// Lazy load for better performance
if ('IntersectionObserver' in window) {
    const lazyImages = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                observer.unobserve(img);
            }
        });
    });
    
    lazyImages.forEach(img => imageObserver.observe(img));
}

// Service Worker for PWA (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            // Service worker registration failed
        });
    });
}

// Analytics (placeholder)
window.gtag = function() {
    // Google Analytics placeholder
    dataLayer.push(arguments);
};

// Export functions for global access
window.SkillForge = {
    validateForm: () => validateStep(1),
    goToSlide: (index) => goToSlide(index),
    resetForm: resetForm
};

// Performance monitoring
if (performance && performance.mark) {
    performance.mark('skillforge-init-start');
    
    window.addEventListener('load', () => {
        performance.mark('skillforge-init-end');
        performance.measure('SkillForge Initialization', 'skillforge-init-start', 'skillforge-init-end');
    });
}