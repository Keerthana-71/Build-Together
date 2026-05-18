// config/passport.js
const passport       = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;

module.exports = function (db) {

    // ── Serialize / Deserialize ──────────────────────────────────────────────
    passport.serializeUser((user, done) => done(null, user.id));

    passport.deserializeUser((id, done) => {
        db.query('SELECT * FROM users WHERE id = ?', [id], (err, rows) => {
            if (err) return done(err);
            done(null, rows[0] || null);
        });
    });

    // ── Shared upsert helper ─────────────────────────────────────────────────
    function upsertOAuthUser(profile, provider, done) {
        const email = (profile.emails && profile.emails[0])
            ? profile.emails[0].value
            : null;

        const name  = profile.displayName
            || (profile.name ? profile.name.givenName + ' ' + profile.name.familyName : null)
            || profile.username
            || 'Unknown';

        const photo = (profile.photos && profile.photos[0])
            ? profile.photos[0].value
            : null;

        const providerId = String(profile.id);

        // 1. Look up by provider + provider_id (most reliable)
        db.query(
            'SELECT * FROM users WHERE provider = ? AND provider_id = ?',
            [provider, providerId],
            (err, rows) => {
                if (err) return done(err);

                if (rows.length > 0) {
                    // Existing OAuth user — update photo if changed
                    db.query(
                        'UPDATE users SET profile_photo = ? WHERE id = ?',
                        [photo, rows[0].id],
                        () => done(null, rows[0])
                    );
                    return;
                }

                // 2. If email exists, check for a local account with same email
                if (email) {
                    db.query(
                        'SELECT * FROM users WHERE email = ?',
                        [email],
                        (err2, rows2) => {
                            if (err2) return done(err2);

                            if (rows2.length > 0) {
                                const existing = rows2[0];
                                // Link OAuth to existing account if it was local
                                if (!existing.provider) {
                                    db.query(
                                        'UPDATE users SET provider = ?, provider_id = ?, profile_photo = ? WHERE id = ?',
                                        [provider, providerId, photo, existing.id],
                                        (err3) => {
                                            if (err3) return done(err3);
                                            return done(null, existing);
                                        }
                                    );
                                } else {
                                    // Different provider for same email — reject
                                    return done(null, false, {
                                        message: 'An account with this email already exists via ' + existing.provider + '. Please use that to log in.'
                                    });
                                }
                                return;
                            }

                            // 3. Create new user
                            createUser();
                        }
                    );
                } else {
                    // No email from provider — create without email
                    createUser();
                }

                function createUser() {
                    db.query(
                        'INSERT INTO users (full_name, email, provider, provider_id, profile_photo, role, is_email_verified, is_phone_verified) VALUES (?, ?, ?, ?, ?, "student", 1, 1)',
                        [name, email, provider, providerId, photo],
                        (err4, result) => {
                            if (err4) return done(err4);
                            db.query('SELECT * FROM users WHERE id = ?', [result.insertId], (err5, newRows) => {
                                if (err5) return done(err5);
                                done(null, newRows[0]);
                            });
                        }
                    );
                }
            }
        );
    }

    // ── Google Strategy ──────────────────────────────────────────────────────
    passport.use(new GoogleStrategy(
        {
            clientID     : process.env.GOOGLE_CLIENT_ID,
            clientSecret : process.env.GOOGLE_CLIENT_SECRET,
            callbackURL  : process.env.BASE_URL + '/auth/google/callback'
        },
        (accessToken, refreshToken, profile, done) => upsertOAuthUser(profile, 'google', done)
    ));

    // ── GitHub Strategy ──────────────────────────────────────────────────────
    passport.use(new GitHubStrategy(
        {
            clientID     : process.env.GITHUB_CLIENT_ID,
            clientSecret : process.env.GITHUB_CLIENT_SECRET,
            callbackURL  : process.env.BASE_URL + '/auth/github/callback',
            scope        : ['user:email']
        },
        (accessToken, refreshToken, profile, done) => upsertOAuthUser(profile, 'github', done)
    ));

    return passport;
};
