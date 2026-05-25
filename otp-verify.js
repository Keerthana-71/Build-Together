// otp-verify.js — Two-step OTP: Email first, then Phone
const OTP_API = 'https://build-together-backend.onrender.com';

// Step 1: Email OTP verification
// Usage: initEmailOtp(emailInputId, containerId, onVerified)
function initEmailOtp(emailInputId, containerId, onVerified) {
    const emailInput = document.getElementById(emailInputId);
    const container  = document.getElementById(containerId);

    container.innerHTML = `
        <div id="${containerId}-send-row" style="margin-top:6px;">
            <button type="button" id="${containerId}-send-btn"
                style="padding:9px 16px;background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;border-radius:10px;font-size:0.82rem;font-weight:600;cursor:pointer;">
                <i class="fas fa-envelope"></i> Send OTP to Email
            </button>
        </div>
        <div id="${containerId}-otp-row" style="display:none;margin-top:10px;">
            <div style="font-size:0.78rem;color:#64748b;margin-bottom:6px;">Enter the 6-digit OTP sent to your email</div>
            <div style="display:flex;gap:8px;">
                <input id="${containerId}-otp-input" type="text" maxlength="6" inputmode="numeric"
                    placeholder="Enter OTP"
                    style="flex:1;padding:10px 14px;border:2px solid #e2e8f0;border-radius:10px;font-size:1rem;font-family:inherit;outline:none;">
                <button type="button" id="${containerId}-verify-btn"
                    style="padding:10px 16px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;border-radius:10px;font-size:0.82rem;font-weight:600;cursor:pointer;">
                    Verify
                </button>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                <div id="${containerId}-msg" style="font-size:0.78rem;"></div>
                <button type="button" id="${containerId}-resend-btn"
                    style="font-size:0.78rem;color:#667eea;background:none;border:none;cursor:pointer;font-family:inherit;padding:0;">
                    Resend OTP
                </button>
            </div>
        </div>
        <div id="${containerId}-verified-badge" style="display:none;margin-top:8px;padding:8px 12px;background:#d1fae5;border-radius:8px;color:#059669;font-size:0.82rem;font-weight:600;">
            <i class="fas fa-check-circle"></i> Email verified!
        </div>
    `;

    _initOtpLogic(emailInputId, containerId, onVerified, 'email', null);
}

// Step 2: Phone OTP verification (OTP sent to email)
// Usage: initPhoneOtp(phoneInputId, containerId, onVerified, emailInputId)
function initPhoneOtp(phoneInputId, containerId, onVerified, emailInputId) {
    const container = document.getElementById(containerId);

    container.innerHTML = `
        <div id="${containerId}-send-row" style="margin-top:6px;">
            <button type="button" id="${containerId}-send-btn"
                style="padding:9px 16px;background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;border-radius:10px;font-size:0.82rem;font-weight:600;cursor:pointer;">
                <i class="fas fa-mobile-alt"></i> Verify Phone via OTP
            </button>
        </div>
        <div id="${containerId}-otp-row" style="display:none;margin-top:10px;">
            <div style="font-size:0.78rem;color:#64748b;margin-bottom:6px;">OTP sent to your email — enter it below to verify your phone</div>
            <div style="display:flex;gap:8px;">
                <input id="${containerId}-otp-input" type="text" maxlength="6" inputmode="numeric"
                    placeholder="Enter OTP"
                    style="flex:1;padding:10px 14px;border:2px solid #e2e8f0;border-radius:10px;font-size:1rem;font-family:inherit;outline:none;">
                <button type="button" id="${containerId}-verify-btn"
                    style="padding:10px 16px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;border-radius:10px;font-size:0.82rem;font-weight:600;cursor:pointer;">
                    Verify
                </button>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                <div id="${containerId}-msg" style="font-size:0.78rem;"></div>
                <button type="button" id="${containerId}-resend-btn"
                    style="font-size:0.78rem;color:#667eea;background:none;border:none;cursor:pointer;font-family:inherit;padding:0;">
                    Resend OTP
                </button>
            </div>
        </div>
        <div id="${containerId}-verified-badge" style="display:none;margin-top:8px;padding:8px 12px;background:#d1fae5;border-radius:8px;color:#059669;font-size:0.82rem;font-weight:600;">
            <i class="fas fa-check-circle"></i> Phone number verified!
        </div>
    `;

    _initOtpLogic(phoneInputId, containerId, onVerified, 'phone', emailInputId);
}

// Internal shared logic
function _initOtpLogic(inputId, containerId, onVerified, type, emailInputId) {
    const mainInput = document.getElementById(inputId);
    let resendTimer = null;

    function setMsg(text, color) {
        const el = document.getElementById(`${containerId}-msg`);
        if (el) { el.textContent = text; el.style.color = color; }
    }

    function getEmail() {
        if (emailInputId) {
            const el = document.getElementById(emailInputId);
            if (el) return el.value.trim();
        }
        const ids = ['signupEmail', 'appEmail', 'iEmail'];
        for (const id of ids) {
            const el = document.getElementById(id);
            if (el && el.value.trim()) return el.value.trim();
        }
        return '';
    }

    function startResendCountdown() {
        let secs = 30;
        const btn = document.getElementById(`${containerId}-resend-btn`);
        btn.disabled = true;
        btn.style.color = '#94a3b8';
        btn.textContent = `Resend in ${secs}s`;
        resendTimer = setInterval(() => {
            secs--;
            btn.textContent = `Resend in ${secs}s`;
            if (secs <= 0) {
                clearInterval(resendTimer);
                btn.disabled = false;
                btn.style.color = '#667eea';
                btn.textContent = 'Resend OTP';
            }
        }, 1000);
    }

    async function sendOtp() {
        const value = mainInput.value.trim();
        const email = type === 'email' ? value : getEmail();
        const phone = type === 'phone' ? value : null;

        if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            alert('Please enter a valid email address first.');
            mainInput.focus(); return;
        }
        if (type === 'phone' && !/^[0-9]{10}$/.test(value)) {
            alert('Please enter a valid 10-digit phone number first.');
            mainInput.focus(); return;
        }
        if (type === 'phone' && !email) {
            alert('Please verify your email first before verifying phone.');
            return;
        }

        const btn = document.getElementById(`${containerId}-send-btn`);
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        try {
            const res  = await fetch(`${OTP_API}/api/otp/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, phone, type })
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.error);
                btn.disabled = false;
                btn.innerHTML = type === 'email'
                    ? '<i class="fas fa-envelope"></i> Send OTP to Email'
                    : '<i class="fas fa-mobile-alt"></i> Verify Phone via OTP';
                return;
            }
            document.getElementById(`${containerId}-otp-row`).style.display = 'block';
            document.getElementById(`${containerId}-send-btn`).style.display = 'none';
            setMsg('OTP sent! Check your email inbox.', '#059669');
            startResendCountdown();
        } catch(e) {
            alert('Server error. Please try again.');
            btn.disabled = false;
            btn.innerHTML = type === 'email'
                ? '<i class="fas fa-envelope"></i> Send OTP to Email'
                : '<i class="fas fa-mobile-alt"></i> Verify Phone via OTP';
        }
    }

    async function verifyOtp() {
        const value = mainInput.value.trim();
        const email = type === 'email' ? value : getEmail();
        const otp   = document.getElementById(`${containerId}-otp-input`).value.trim();
        if (!otp || otp.length !== 6) { setMsg('Enter the 6-digit OTP.', '#ef4444'); return; }

        const btn = document.getElementById(`${containerId}-verify-btn`);
        btn.disabled = true;
        btn.textContent = 'Verifying...';

        try {
            const res  = await fetch(`${OTP_API}/api/otp/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp, type })
            });
            const data = await res.json();
            if (!res.ok) {
                setMsg(data.error, '#ef4444');
                btn.disabled = false;
                btn.textContent = 'Verify';
                return;
            }
            onVerified(true);
            document.getElementById(`${containerId}-otp-row`).style.display = 'none';
            document.getElementById(`${containerId}-verified-badge`).style.display = 'block';
            mainInput.readOnly = true;
            mainInput.style.background = '#f0fdf4';
            mainInput.style.borderColor = '#10b981';
        } catch(e) {
            setMsg('Server error.', '#ef4444');
            btn.disabled = false;
            btn.textContent = 'Verify';
        }
    }

    document.getElementById(`${containerId}-send-btn`).addEventListener('click', sendOtp);
    document.getElementById(`${containerId}-verify-btn`).addEventListener('click', verifyOtp);
    document.getElementById(`${containerId}-resend-btn`).addEventListener('click', () => {
        clearInterval(resendTimer);
        const btn = document.getElementById(`${containerId}-send-btn`);
        btn.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = type === 'email'
            ? '<i class="fas fa-envelope"></i> Send OTP to Email'
            : '<i class="fas fa-mobile-alt"></i> Verify Phone via OTP';
        document.getElementById(`${containerId}-otp-row`).style.display = 'none';
        sendOtp();
    });

    document.getElementById(`${containerId}-otp-input`).addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, '');
    });
}
