// routes/auth.js
const express  = require('express');
const passport = require('passport');
const jwt      = require('jsonwebtoken');
const router   = express.Router();

const CLIENT_URL = process.env.BASE_URL || 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_SECRET || 'bt_secret_key';

// ── Helper: build redirect URL with token/error ──────────────────────────────
function redirectWithToken(res, user) {
    const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.full_name },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
    // Pass token + user info via query params so the frontend can pick them up
    const params = new URLSearchParams({
        token,
        name  : user.full_name  || '',
        email : user.email      || '',
        role  : user.role       || 'student',
        id    : String(user.id)
    });
    res.redirect(CLIENT_URL + '/oauth-callback.html?' + params.toString());
}

// ── Google ───────────────────────────────────────────────────────────────────
router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: CLIENT_URL + '/apply.html?oauth_error=google_failed', session: false }),
    (req, res) => redirectWithToken(res, req.user)
);

// ── GitHub ───────────────────────────────────────────────────────────────────
router.get('/github',
    passport.authenticate('github', { scope: ['user:email'] })
);

router.get('/github/callback',
    passport.authenticate('github', { failureRedirect: CLIENT_URL + '/apply.html?oauth_error=github_failed', session: false }),
    (req, res) => redirectWithToken(res, req.user)
);

// ── Logout ───────────────────────────────────────────────────────────────────
router.get('/logout', (req, res) => {
    req.logout && req.logout(() => {});
    res.redirect(CLIENT_URL + '/apply.html');
});

module.exports = router;
