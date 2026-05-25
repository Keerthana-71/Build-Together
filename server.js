// =============================================
// server.js — Build Together Institute Backend
// =============================================

const express        = require('express');
const http           = require('http');
const { Server }     = require('socket.io');
const mysql          = require('mysql2');
const bcrypt         = require('bcrypt');
const jwt            = require('jsonwebtoken');
const nodemailer     = require('nodemailer');
const cors           = require('cors');
const path           = require('path');
const session        = require('express-session');
const passport       = require('passport');
const MySQLStore     = require('express-mysql-session')(session);
const multer         = require('multer');
const { PDFParse }    = require('pdf-parse');
const fs             = require('fs');
require('dotenv').config();

// Dynamically import node-fetch once at the top level
let fetch;
(async () => {
    fetch = (await import('node-fetch')).default;
})();

const upload = multer({ dest: 'uploads/' });

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });



// OTP store (in-memory)
const otpStore = {};

// =============================================
// MIDDLEWARE
// =============================================
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =============================================
// DATABASE CONNECTION
// =============================================
const db = mysql.createConnection({
    host     : process.env.DB_HOST     || 'shuttle.proxy.rlwy.net',
    port     : process.env.DB_PORT     || 31070,
    user     : process.env.DB_USER     || 'root',
    password : process.env.DB_PASSWORD || '',
    database : process.env.DB_NAME     || 'buildtogether'
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err.message);
        process.exit(1);
    }
    console.log('MySQL connected successfully');

    // ── Session store (MySQL) ────────────────────────────────────────────────
    const sessionStore = new MySQLStore({
        host     : process.env.DB_HOST     || 'shuttle.proxy.rlwy.net',
        port     : process.env.DB_PORT     || 31070,
        user     : process.env.DB_USER     || 'root',
        password : process.env.DB_PASSWORD || '',
        database : process.env.DB_NAME     || 'buildtogether',
        clearExpired     : true,
        checkExpirationInterval : 900000,
        createDatabaseTable     : true
    });

    app.use(session({
        secret            : process.env.SESSION_SECRET || process.env.JWT_SECRET || 'bt_session_secret',
        resave            : false,
        saveUninitialized : false,
        store             : sessionStore,
        cookie            : { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }
    }));

    // ── Passport ────────────────────────────────────────────────────────────
    require('./config/passport')(db);
    app.use(passport.initialize());
    app.use(passport.session());

    // ── OAuth Routes ─────────────────────────────────────────────────────────
    app.use('/auth', require('./routes/auth'));

    // ── Static files & home route ────────────────────────────────────────────
    app.use(express.static(path.join(__dirname)));
    app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
});

// =============================================
// EMAIL TRANSPORTER
// =============================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

function sendEmail(to, subject, html) {
    return transporter.sendMail({
        from: '"Build Together Institute" <' + process.env.EMAIL_USER + '>',
        to,
        subject,
        html
    });
}

// =============================================
// JWT MIDDLEWARE
// =============================================
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

    jwt.verify(token, process.env.JWT_SECRET || 'bt_secret_key', (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
        req.user = user;
        next();
    });
}

function adminOnly(req, res, next) {
    if (req.user.role !== 'admin')
        return res.status(403).json({ error: 'Admin access only.' });
    next();
}

// =============================================
// LOGIN ATTEMPT TRACKING
// =============================================
const loginAttempts = {}; // { email: { count, lastAttempt } }


app.post('/api/auth/signup', async (req, res) => {
    const { full_name, email, password, role, phone } = req.body;

    if (!full_name || !email || !password || !role)
        return res.status(400).json({ error: 'All fields are required.' });

    if (password.length < 8)
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    db.query('SELECT id FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (results.length > 0)
            return res.status(409).json({ error: 'Email already registered.' });

        const password_hash = await bcrypt.hash(password, 10);

        db.query(
            'INSERT INTO users (full_name, email, password_hash, role, phone, email_verified, phone_verified) VALUES (?, ?, ?, ?, ?, 1, 1)',
            [full_name, email, password_hash, role, phone || null],
            async (err) => {
                if (err) return res.status(500).json({ error: 'Failed to create account.' });

                try {
                    await sendEmail(email, 'Welcome to Build Together Institute!', 
                        '<h2>Hi ' + full_name + ',</h2>' +
                        '<p>Welcome to <strong>Build Together Institute</strong>!</p>' +
                        '<p>Your account has been created successfully.</p>' +
                        '<p>Start exploring our courses and internship programs today.</p>' +
                        '<br><p>Best regards,<br>Build Together Team</p>'
                    );
                } catch (e) {
                    console.warn('Email send failed:', e.message);
                }

                res.status(201).json({ message: 'Account created successfully!' });
            }
        );
    });
});


app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password)
        return res.status(400).json({ error: 'Email and password are required.' });

    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (results.length === 0)
            return res.status(401).json({ error: 'Invalid email or password.' });

        const user = results[0];

        // Check if account is locked
        if (loginAttempts[email] && loginAttempts[email].lockedUntil) {
            const remaining = Math.ceil((loginAttempts[email].lockedUntil - Date.now()) / 1000);
            if (remaining > 0) {
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                const timeStr = mins > 0 ? mins + 'm ' + secs + 's' : secs + 's';
                return res.status(429).json({
                    error: 'Account temporarily locked due to multiple failed attempts.',
                    locked: true,
                    remainingSeconds: remaining,
                    timeStr
                });
            } else {
                // Lock expired — reset
                delete loginAttempts[email];
            }
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            if (!loginAttempts[email]) loginAttempts[email] = { count: 0 };
            loginAttempts[email].count++;
            const attempts = loginAttempts[email].count;

            if (attempts >= 3) {
                // Lock for 5 minutes
                loginAttempts[email].lockedUntil = Date.now() + 5 * 60 * 1000;
                loginAttempts[email].count = 0;

                const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
                sendEmail(email, '\u26a0\ufe0f Security Alert - Account Temporarily Locked',
                    '<div style="font-family:Poppins,sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#fff5f5;border-radius:16px;border-left:4px solid #ef4444;">' +
                    '<h2 style="color:#ef4444;margin-bottom:8px;">\u26a0\ufe0f Account Locked</h2>' +
                    '<p style="color:#1e293b;margin-bottom:16px;">Your Build Together Institute account has been <strong>temporarily locked for 5 minutes</strong> due to 3 consecutive failed login attempts.</p>' +
                    '<div style="background:white;border-radius:10px;padding:16px;margin-bottom:16px;">' +
                    '<p style="margin:0;color:#64748b;font-size:0.9rem;"><strong>Email:</strong> ' + email + '</p>' +
                    '<p style="margin:6px 0 0;color:#64748b;font-size:0.9rem;"><strong>Time:</strong> ' + time + ' IST</p>' +
                    '<p style="margin:6px 0 0;color:#64748b;font-size:0.9rem;"><strong>Lock Duration:</strong> 5 minutes</p>' +
                    '</div>' +
                    '<p style="color:#64748b;font-size:0.88rem;">If this was not you, please reset your password immediately.</p>' +
                    '<p style="color:#94a3b8;font-size:0.82rem;margin-top:16px;">Build Together Institute Security Team</p>' +
                    '</div>'
                ).catch(e => console.warn('Alert email failed:', e.message));

                return res.status(429).json({
                    error: 'Too many failed attempts. Account locked for 5 minutes.',
                    locked: true,
                    remainingSeconds: 300,
                    timeStr: '5m 0s'
                });
            }

            return res.status(401).json({
                error: 'Invalid email or password.',
                attemptsLeft: 3 - attempts
            });
        }

        // Successful login — reset attempts
        if (loginAttempts[email]) delete loginAttempts[email];

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.full_name },
            process.env.JWT_SECRET || 'bt_secret_key',
            { expiresIn: '7d' }
        );

        res.json({
            message : 'Login successful!',
            token,
            user: {
                id    : user.id,
                name  : user.full_name,
                email : user.email,
                role  : user.role
            }
        });
    });
});

// =============================================
// ROUTE 3 — COURSE APPLICATION
// POST /api/apply/course
// =============================================
app.post('/api/apply/course', verifyToken, (req, res) => {
    const { full_name, email, phone, city, course_name, qualification, message } = req.body;
    const user_id = req.user.id;

    if (!full_name || !email || !phone || !course_name)
        return res.status(400).json({ error: 'Required fields missing.' });

    db.query('SELECT id FROM course_applications WHERE user_id = ? AND course_name = ?',
        [user_id, course_name], (err, existing) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            if (existing.length > 0)
                return res.status(409).json({ error: 'You have already applied for ' + course_name + '.' });

            db.query(
                'INSERT INTO course_applications (user_id, full_name, email, phone, city, course_name, qualification, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [user_id, full_name, email, phone, city, course_name, qualification, message],
                async (err) => {
                    if (err) return res.status(500).json({ error: 'Failed to submit application.' });
                    try {
                        await sendEmail(email, 'Course Application Received - Build Together',
                            '<h2>Hi ' + full_name + ',</h2>' +
                            '<p>We have received your application for <strong>' + course_name + '</strong>.</p>' +
                            '<p>Our team will contact you within <strong>24 hours</strong>.</p>' +
                            '<br><p>Best regards,<br>Build Together Institute</p>'
                        );
                        await sendEmail(process.env.EMAIL_USER, 'New Course Application - ' + course_name,
                            '<h3>New Course Application</h3>' +
                            '<p><strong>Name:</strong> ' + full_name + '</p>' +
                            '<p><strong>Email:</strong> ' + email + '</p>' +
                            '<p><strong>Phone:</strong> ' + phone + '</p>' +
                            '<p><strong>Course:</strong> ' + course_name + '</p>' +
                            '<p><strong>City:</strong> ' + city + '</p>' +
                            '<p><strong>Qualification:</strong> ' + qualification + '</p>'
                        );
                    } catch (e) {
                        console.warn('Email send failed:', e.message);
                    }

                    // Auto-request mock interview access upon enrollment
                    db.query('INSERT IGNORE INTO mock_interview_access (user_id, course_name, status) VALUES (?, ?, "pending")',
                        [user_id, course_name], (accErr) => {
                            if (accErr) console.error('Failed to create interview request:', accErr.message);
                        });

                    res.status(201).json({ message: 'Course application submitted successfully!' });
                }
            );
        }
    );
});

// =============================================
// ROUTE 4 — INTERNSHIP APPLICATION
// POST /api/apply/internship
// =============================================
app.post('/api/apply/internship', verifyToken, (req, res) => {
    const { full_name, email, phone, city, role_applied,
            qualification, availability, skills, resume_link, message } = req.body;
    const user_id = req.user.id;

    if (!full_name || !email || !phone || !city || !role_applied ||
        !qualification || !availability || !skills || !resume_link)
        return res.status(400).json({ error: 'Required fields missing.' });

    db.query('SELECT id FROM internship_applications WHERE user_id = ? AND role_applied = ?',
        [user_id, role_applied], (err, existing) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            if (existing.length > 0)
                return res.status(409).json({ error: 'You have already applied for ' + role_applied + '.' });

    db.query(
        'INSERT INTO internship_applications (user_id, full_name, email, phone, city, role_applied, qualification, availability, skills, resume_link, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [user_id, full_name, email, phone, city, role_applied, qualification, availability, skills, resume_link, message],
        async (err) => {
            if (err) return res.status(500).json({ error: 'Failed to submit application.' });

            try {
                await sendEmail(email, 'Internship Application Received - Build Together',
                    '<h2>Hi ' + full_name + ',</h2>' +
                    '<p>Thank you for applying for <strong>' + role_applied + '</strong>.</p>' +
                    '<p>Our HR team will contact you within <strong>48 hours</strong>.</p>' +
                    '<br><p>Best regards,<br>Build Together HR Team</p>'
                );
                await sendEmail(process.env.EMAIL_USER, 'New Internship Application - ' + role_applied,
                    '<h3>New Internship Application</h3>' +
                    '<p><strong>Name:</strong> ' + full_name + '</p>' +
                    '<p><strong>Email:</strong> ' + email + '</p>' +
                    '<p><strong>Phone:</strong> ' + phone + '</p>' +
                    '<p><strong>Role:</strong> ' + role_applied + '</p>' +
                    '<p><strong>Skills:</strong> ' + skills + '</p>' +
                    '<p><strong>Resume:</strong> ' + resume_link + '</p>' +
                    '<p><strong>Availability:</strong> ' + availability + '</p>'
                );
            } catch (e) {
                console.warn('Email send failed:', e.message);
            }

            res.status(201).json({ message: 'Internship application submitted successfully!' });
        }
    );
    });
});

// =============================================
// ROUTE 5 — CONTACT FORM
// POST /api/contact
// =============================================
app.post('/api/contact', (req, res) => {
    const { full_name, email, subject, message } = req.body;

    if (!full_name || !email || !subject || !message)
        return res.status(400).json({ error: 'All fields are required.' });

    db.query(
        'INSERT INTO contact_messages (full_name, email, subject, message) VALUES (?, ?, ?, ?)',
        [full_name, email, subject, message],
        async (err) => {
            if (err) return res.status(500).json({ error: 'Failed to send message.' });

            try {
                await sendEmail(email, 'We received your message - Build Together',
                    '<h2>Hi ' + full_name + ',</h2>' +
                    '<p>Thank you for reaching out!</p>' +
                    '<p>We received your message about <strong>"' + subject + '"</strong>.</p>' +
                    '<p>We will get back to you within <strong>24 hours</strong>.</p>' +
                    '<br><p>Best regards,<br>Build Together Institute</p>'
                );
                await sendEmail(process.env.EMAIL_USER, 'New Contact Message - ' + subject,
                    '<h3>New Contact Message</h3>' +
                    '<p><strong>From:</strong> ' + full_name + ' (' + email + ')</p>' +
                    '<p><strong>Subject:</strong> ' + subject + '</p>' +
                    '<p><strong>Message:</strong><br>' + message + '</p>'
                );
            } catch (e) {
                console.warn('Email send failed:', e.message);
            }

            res.status(201).json({ message: 'Message sent successfully!' });
        }
    );
});

// =============================================
// ROUTE 6 — GET ALL COURSES
// GET /api/courses
// =============================================
app.get('/api/courses', (req, res) => {
    db.query('SELECT * FROM courses WHERE is_active = 1', (err, results) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch courses.' });
        res.json(results);
    });
});

// =============================================
// ROUTE 7 — GET ALL INTERNSHIP ROLES
// GET /api/internship-roles
// =============================================
app.get('/api/internship-roles', (req, res) => {
    db.query('SELECT * FROM internship_roles WHERE is_active = 1', (err, results) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch roles.' });
        res.json(results);
    });
});

// GET user's enrolled courses with completion status
app.get('/api/my-courses', verifyToken, (req, res) => {
    const user_id = req.user.id;
    db.query(
        'SELECT ca.course_name, ca.status, ca.applied_at, ' +
        '(SELECT COUNT(*) FROM course_syllabus cs WHERE cs.course_name = ca.course_name) as total_weeks, ' +
        '(SELECT COUNT(*) FROM student_progress sp WHERE sp.user_id = ca.user_id AND sp.course_name = ca.course_name AND sp.is_completed = 1) as completed_weeks ' +
        'FROM course_applications ca WHERE ca.user_id = ? ORDER BY ca.applied_at DESC',
        [user_id], (err, results) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            res.json(results);
        }
    );
});

// PUT update profile
app.put('/api/profile', verifyToken, (req, res) => {
    const { full_name, phone, city, linkedin, github } = req.body;
    const user_id = req.user.id;
    if (!full_name) return res.status(400).json({ error: 'Name is required.' });
    db.query('UPDATE users SET full_name=?, phone=?, city=?, linkedin=?, github=? WHERE id=?',
        [full_name, phone||null, city||null, linkedin||null, github||null, user_id],
        (err) => {
            if (err) return res.status(500).json({ error: 'Update failed.' });
            res.json({ message: 'Profile updated successfully!' });
        });
});

// =============================================
// DASHBOARD ROUTES
// =============================================

// GET student profile + enrolled course
app.get('/api/dashboard', verifyToken, (req, res) => {
    const user_id = req.user.id;
    db.query('SELECT id, full_name, email, phone, city, linkedin, github, role, created_at FROM users WHERE id = ?', [user_id], (err, userResult) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (userResult.length === 0) return res.status(404).json({ error: 'User not found.' });

        // Get all enrolled courses
        db.query(
            'SELECT ca.course_name, ca.status, ca.applied_at, ' +
            '(SELECT COUNT(*) FROM course_syllabus cs WHERE cs.course_name = ca.course_name) as total_weeks, ' +
            '(SELECT COUNT(*) FROM student_progress sp WHERE sp.user_id = ca.user_id AND sp.course_name = ca.course_name AND sp.is_completed = 1) as completed_weeks ' +
            'FROM course_applications ca WHERE ca.user_id = ? ORDER BY ca.applied_at DESC',
            [user_id], (err, courseResult) => {
                if (err) return res.status(500).json({ error: 'Database error.' });

                // Get internship application
                db.query(
                    'SELECT role_applied, status, applied_at FROM internship_applications WHERE user_id = ? ORDER BY applied_at DESC LIMIT 1',
                    [user_id], (err, internResult) => {
                        if (err) return res.status(500).json({ error: 'Database error.' });
                        res.json({
                            user: userResult[0],
                            enrolled_courses: courseResult,
                            enrolled_course: courseResult.length > 0 ? courseResult[0] : null,
                            internship: internResult.length > 0 ? internResult[0] : null
                        });
                    }
                );
            }
        );
    });
});

// GET syllabus + progress for enrolled course
app.get('/api/dashboard/syllabus', verifyToken, (req, res) => {
    const user_id = req.user.id;
    const course_name = req.query.course;

    if (!course_name) return res.status(400).json({ error: 'Course name required.' });

    // Auto-update status: approved → ongoing when student first opens syllabus
    db.query(
        'UPDATE course_applications SET status = "ongoing" WHERE user_id = ? AND course_name = ? AND status = "approved"',
        [user_id, course_name], (err) => {
            if (err) console.error('Failed to update course status to ongoing:', err.message);
        }
    );

    // Get syllabus topics
    db.query(
        'SELECT * FROM course_syllabus WHERE course_name = ? ORDER BY week_no ASC',
        [course_name], (err, syllabus) => {
            if (err) return res.status(500).json({ error: 'Database error.' });

            // Get student progress
            db.query(
                'SELECT * FROM student_progress WHERE user_id = ? AND course_name = ?',
                [user_id, course_name], (err, progress) => {
                    if (err) return res.status(500).json({ error: 'Database error.' });

                    // If no progress yet, create week 1 as unlocked
                    if (progress.length === 0) {
                        db.query(
                            'INSERT INTO student_progress (user_id, course_name, week_no, is_unlocked) VALUES (?, ?, 1, true)',
                            [user_id, course_name], (err) => {
                                if (err) return res.status(500).json({ error: 'Database error.' });
                                db.query(
                                    'SELECT * FROM student_progress WHERE user_id = ? AND course_name = ?',
                                    [user_id, course_name], (err, newProgress) => {
                                        res.json({ syllabus, progress: newProgress });
                                    }
                                );
                            }
                        );
                    } else {
                        res.json({ syllabus, progress });
                    }
                }
            );
        }
    );
});

// GET certificate data for a completed course
app.get('/api/dashboard/certificate', verifyToken, (req, res) => {
    const user_id = req.user.id;
    const course_name = req.query.course;
    console.log(`[Certificate API] Checking status for: ${course_name}`);

    if (!course_name) return res.status(400).json({ error: 'Course name required.' });

    db.query('SELECT status, full_name FROM course_applications WHERE user_id = ? AND course_name = ?', [user_id, course_name], (err, apps) => {
        if (err) { console.error('DB Error 1:', err); return res.status(500).json({ error: 'Database error (DB Error 1).' }); }
        if (apps.length === 0) {
            console.warn(`[Certificate API] No application found for user ${user_id}, course ${course_name}`);
            return res.status(404).json({ error: 'No application found for this course.' });
        }

        const full_name = apps[0].full_name;
        const currentStatus = apps[0].status;

        db.query(
            'SELECT (SELECT COUNT(*) FROM course_syllabus cs WHERE cs.course_name = ?) as total_weeks, ' +
            '(SELECT COUNT(*) FROM student_progress sp WHERE sp.user_id = ? AND sp.course_name = ? AND sp.is_completed = 1) as completed_weeks',
            [course_name, user_id, course_name], (err, counts) => {
                if (err) { console.error('DB Error 2:', err); return res.status(500).json({ error: 'Database error (DB Error 2).' }); }
                const totalWeeks = counts[0].total_weeks || 0;
                const completedWeeks = counts[0].completed_weeks || 0;

                if (completedWeeks < totalWeeks) {
                    return res.status(403).json({ error: 'Course has not yet been completed. Finish all weeks to generate a certificate.' });
                }

                const finalizeCertificate = () => {
                    db.query('SELECT MAX(completed_at) as completion_date FROM student_progress WHERE user_id = ? AND course_name = ? AND is_completed = 1', [user_id, course_name], (err, progress) => {
                        if (err) { console.error('DB Error 3:', err); return res.status(500).json({ error: 'Database error (DB Error 3).' }); }
                        res.json({
                            full_name: full_name,
                            course_name: course_name,
                            completion_date: progress[0].completion_date || new Date()
                        });
                    });
                };

                if (currentStatus !== 'completed') {
                    db.query('UPDATE course_applications SET status = "completed" WHERE user_id = ? AND course_name = ?', [user_id, course_name], (updateErr) => {
                        if (updateErr) console.error('Error updating course status to completed:', updateErr.message);
                        finalizeCertificate();
                    });
                } else {
                    finalizeCertificate();
                }
            }
        );
    });
});

// GET tasks for a specific week
app.get('/api/dashboard/tasks', verifyToken, (req, res) => {
    const user_id = req.user.id;
    const { course, week } = req.query;
    if (!course || !week) return res.status(400).json({ error: 'course and week required.' });

    db.query('SELECT * FROM week_tasks WHERE course_name = ? AND week_no = ? ORDER BY task_no ASC',
        [course, week], (err, tasks) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            db.query('SELECT task_id, is_completed, link_visited, video_watched, quiz_score FROM student_task_progress WHERE user_id = ? AND course_name = ? AND week_no = ?',
                [user_id, course, week], (err, progress) => {
                    if (err) return res.status(500).json({ error: 'Database error.' });
                    const doneMap = {};
                    const progressMap = {};
                    progress.forEach(p => {
                    doneMap[p.task_id] = p.is_completed ? true : false;
                        progressMap[p.task_id] = { link_visited: p.link_visited, video_watched: p.video_watched, quiz_score: p.quiz_score };
                    });
                    res.json({ tasks, doneMap, progressMap });
                });
        });
});

// POST mark resource link as visited
app.post('/api/dashboard/visit-link', verifyToken, (req, res) => {
    const user_id = req.user.id;
    const { course_name, week_no, task_id } = req.body;
    if (!course_name || !week_no || !task_id) return res.status(400).json({ error: 'Missing fields.' });
    db.query(
        'INSERT INTO student_task_progress (user_id, course_name, week_no, task_id, link_visited) VALUES (?,?,?,?,1) ON DUPLICATE KEY UPDATE link_visited=1',
        [user_id, course_name, week_no, task_id],
        (err) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            res.json({ message: 'Link visited.' });
        }
    );
});

// POST mark video as watched
app.post('/api/dashboard/video-watched', verifyToken, (req, res) => {
    const user_id = req.user.id;
    const { course_name, week_no, task_id } = req.body;
    if (!course_name || !week_no || !task_id) return res.status(400).json({ error: 'Missing fields.' });
    db.query(
        'INSERT INTO student_task_progress (user_id, course_name, week_no, task_id, video_watched, is_completed, completed_at) VALUES (?,?,?,?,1,1,NOW()) ON DUPLICATE KEY UPDATE video_watched=1, is_completed=1, completed_at=NOW()',
        [user_id, course_name, week_no, task_id],
        (err) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            res.json({ message: 'Video watched and task completed.' });
        }
    );
});

// GET quiz questions for an assessment task OR video task
app.get('/api/dashboard/quiz', verifyToken, (req, res) => {
    const { task_id } = req.query;
    if (!task_id) return res.status(400).json({ error: 'task_id required.' });
    db.query('SELECT id, question, option_a, option_b, option_c, option_d FROM quiz_questions WHERE task_id = ?',
        [task_id], (err, questions) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            db.query('SELECT pass_score, video_pass_score, task_type FROM week_tasks WHERE id = ?', [task_id], (err, task) => {
                if (err) return res.status(500).json({ error: 'Database error.' });
                const t = task[0];
                const pass_score = t ? (t.task_type === 'task' ? (t.video_pass_score || 60) : (t.pass_score || 60)) : 60;
                res.json({ questions, pass_score });
            });
        });
});

// POST submit video quiz — marks task done only if passed
app.post('/api/dashboard/submit-video-quiz', verifyToken, (req, res) => {
    const user_id = req.user.id;
    const { course_name, week_no, task_id, answers } = req.body;
    if (!course_name || !week_no || !task_id || !answers) return res.status(400).json({ error: 'Missing fields.' });

    db.query('SELECT id, correct_option FROM quiz_questions WHERE task_id = ?', [task_id], (err, questions) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (!questions.length) return res.status(404).json({ error: 'No questions found.' });

        let correct = 0;
        questions.forEach(q => { if (answers[q.id] === q.correct_option) correct++; });
        const score = Math.round((correct / questions.length) * 100);

        db.query('SELECT video_pass_score FROM week_tasks WHERE id = ?', [task_id], (err, task) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            const pass_score = task[0] ? (task[0].video_pass_score || 60) : 60;
            const passed = score >= pass_score;

            db.query(
                'INSERT INTO student_task_progress (user_id, course_name, week_no, task_id, video_watched, is_completed, quiz_score, completed_at) VALUES (?,?,?,?,1,?,?,NOW()) ON DUPLICATE KEY UPDATE quiz_score=?, is_completed=?, completed_at=NOW()',
                [user_id, course_name, week_no, task_id, passed ? 1 : 0, score, score, passed ? 1 : 0],
                (err) => {
                    if (err) return res.status(500).json({ error: 'Database error.' });
                    res.json({ score, pass_score, passed, correct, total: questions.length });
                }
            );
        });
    });
});

// POST submit quiz
app.post('/api/dashboard/submit-quiz', verifyToken, (req, res) => {
    const user_id = req.user.id;
    const { course_name, week_no, task_id, answers } = req.body;
    if (!course_name || !week_no || !task_id || !answers) return res.status(400).json({ error: 'Missing fields.' });

    db.query('SELECT id, correct_option FROM quiz_questions WHERE task_id = ?', [task_id], (err, questions) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (!questions.length) return res.status(404).json({ error: 'No questions found.' });

        let correct = 0;
        questions.forEach(q => { if (answers[q.id] === q.correct_option) correct++; });
        const score = Math.round((correct / questions.length) * 100);

        db.query('SELECT pass_score FROM week_tasks WHERE id = ?', [task_id], (err, task) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            const pass_score = task[0] ? task[0].pass_score : 60;
            const passed = score >= pass_score;

            db.query(
                'INSERT INTO student_task_progress (user_id, course_name, week_no, task_id, is_completed, quiz_score) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE quiz_score=?, is_completed=?',
                [user_id, course_name, week_no, task_id, passed ? 1 : 0, score, score, passed ? 1 : 0],
                (err) => {
                    if (err) return res.status(500).json({ error: 'Database error.' });
                    res.json({ score, pass_score, passed, correct, total: questions.length });
                }
            );
        });
    });
});

// POST complete a task
app.post('/api/dashboard/complete-task', verifyToken, (req, res) => {
    const user_id = req.user.id;
    const { course_name, week_no, task_id } = req.body;
    if (!course_name || !week_no || !task_id) return res.status(400).json({ error: 'Missing fields.' });

    db.query(
        'INSERT INTO student_task_progress (user_id, course_name, week_no, task_id, is_completed, completed_at) VALUES (?,?,?,?,1,NOW()) ON DUPLICATE KEY UPDATE is_completed=1, completed_at=NOW()',
        [user_id, course_name, week_no, task_id], (err) => {
            if (err) return res.status(500).json({ error: 'Database error.' });

            // Check if all tasks (not assessment) are done for this week
            db.query('SELECT id FROM week_tasks WHERE course_name=? AND week_no=? AND task_type="task"', [course_name, week_no], (err, allTasks) => {
                if (err) return res.status(500).json({ error: 'Database error.' });
                db.query('SELECT task_id FROM student_task_progress WHERE user_id=? AND course_name=? AND week_no=? AND is_completed=1', [user_id, course_name, week_no], (err, doneTasks) => {
                    if (err) return res.status(500).json({ error: 'Database error.' });
                    const allTaskIds = allTasks.map(t => t.id);
                    const doneIds = doneTasks.map(t => t.task_id);
                    const allTasksDone = allTaskIds.every(id => doneIds.includes(id));
                    res.json({ message: 'Task completed!', all_tasks_done: allTasksDone });
                });
            });
        }
    );
});

// POST complete a week — unlock next week
app.post('/api/dashboard/complete', verifyToken, (req, res) => {
    const user_id = req.user.id;
    const { course_name, week_no } = req.body;

    if (!course_name || !week_no)
        return res.status(400).json({ error: 'course_name and week_no required.' });

    // Mark current week as completed
    db.query(
        'UPDATE student_progress SET is_completed = true, completed_at = NOW() WHERE user_id = ? AND course_name = ? AND week_no = ?',
        [user_id, course_name, week_no], (err) => {
            if (err) return res.status(500).json({ error: 'Database error.' });

            const nextWeek = parseInt(week_no) + 1;

            // Check if next week exists in syllabus
            db.query(
                'SELECT id FROM course_syllabus WHERE course_name = ? AND week_no = ?',
                [course_name, nextWeek], (err, result) => {
                    if (err) return res.status(500).json({ error: 'Database error.' });
                    if (result.length === 0) {
                        // All weeks done — auto-mark course as completed
                        db.query(
                            'UPDATE course_applications SET status = "completed" WHERE user_id = ? AND course_name = ?',
                            [user_id, course_name], (updateErr) => {
                                if (updateErr) console.error('Error updating course_applications status to completed:', updateErr.message);
                            }
                        );
                        return res.json({ message: 'Course completed! All weeks done.', course_completed: true });
                    }

                    // Check if next week progress row exists
                    db.query(
                        'SELECT id FROM student_progress WHERE user_id = ? AND course_name = ? AND week_no = ?',
                        [user_id, course_name, nextWeek], (err, existing) => {
                            if (err) return res.status(500).json({ error: 'Database error.' });

                            if (existing.length > 0) {
                                // Update existing row
                                db.query(
                                    'UPDATE student_progress SET is_unlocked = true WHERE user_id = ? AND course_name = ? AND week_no = ?',
                                    [user_id, course_name, nextWeek], (err) => {
                                        if (err) return res.status(500).json({ error: 'Database error.' });
                                        res.json({ message: 'Week ' + nextWeek + ' unlocked!', next_week: nextWeek });
                                    }
                                );
                            } else {
                                // Insert new row
                                db.query(
                                    'INSERT INTO student_progress (user_id, course_name, week_no, is_unlocked) VALUES (?, ?, ?, true)',
                                    [user_id, course_name, nextWeek], (err) => {
                                        if (err) return res.status(500).json({ error: 'Database error.' });
                                        res.json({ message: 'Week ' + nextWeek + ' unlocked!', next_week: nextWeek });
                                    }
                                );
                            }
                        }
                    );
                }
            );
        }
    );
});

// =============================================
// OTP ROUTES
// =============================================

// POST /api/otp/send
app.post('/api/otp/send', (req, res) => {
    const { email, type, phone } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const key = type === 'phone' ? 'phone_' + email : 'email_' + email;
    otpStore[key] = { otp, expiresAt: Date.now() + 5 * 60 * 1000 };

    const subject = type === 'phone'
        ? 'Phone Number Verification OTP - Build Together Institute'
        : 'Email Verification OTP - Build Together Institute';

    const bodyText = type === 'phone'
        ? 'Use the OTP below to verify your phone number <strong>' + phone + '</strong>'
        : 'Use the OTP below to verify your email address <strong>' + email + '</strong>';

    sendEmail(email, subject,
        '<div style="font-family:Poppins,sans-serif;max-width:480px;margin:0 auto;padding:30px;background:#f8fafc;border-radius:16px;">' +
        '<h2 style="color:#1e293b;margin-bottom:8px;">Build Together Institute</h2>' +
        '<p style="color:#64748b;margin-bottom:20px;">' + bodyText + '</p>' +
        '<div style="background:linear-gradient(135deg,#667eea,#764ba2);border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;">' +
        '<div style="font-size:2.5rem;font-weight:700;color:white;letter-spacing:10px;">' + otp + '</div>' +
        '</div>' +
        '<p style="color:#94a3b8;font-size:0.85rem;">Valid for <strong>5 minutes</strong>. Do not share with anyone.</p>' +
        '</div>'
    )
    .then(() => res.json({ message: 'OTP sent to ' + email }))
    .catch(err => {
        console.error('Email OTP error:', err.message);
        res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
    });
});

// GET /api/auth/verified-status — check if user's email/phone are verified
app.get('/api/auth/verified-status', verifyToken, (req, res) => {
    db.query('SELECT email_verified AS is_email_verified, phone_verified AS is_phone_verified, email, phone FROM users WHERE id = ?', [req.user.id], (err, results) => {
        if (err) {
            // Column may not exist yet — return verified=true as fallback
            db.query('SELECT email, phone FROM users WHERE id = ?', [req.user.id], (err2, r2) => {
                if (err2 || !r2.length) return res.status(500).json({ error: 'Database error.' });
                return res.json({ is_email_verified: 1, is_phone_verified: 1, email: r2[0].email, phone: r2[0].phone });
            });
            return;
        }
        if (!results.length) return res.status(404).json({ error: 'User not found.' });
        res.json(results[0]);
    });
});

// GET /api/notifications — admin: recent unread activity
app.get('/api/notifications', verifyToken, adminOnly, (req, res) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const notifications = [];
    let pending = 3;
    function done() {
        if (--pending === 0) {
            notifications.sort((a, b) => new Date(b.time) - new Date(a.time));
            res.json(notifications.slice(0, 20));
        }
    }
    db.query('SELECT full_name, course_name, applied_at FROM course_applications WHERE applied_at >= ? ORDER BY applied_at DESC LIMIT 10', [since], (err, rows) => {
        if (!err) rows.forEach(r => notifications.push({ type: 'course', icon: 'fa-graduation-cap', color: '#667eea', text: r.full_name + ' applied for ' + r.course_name, time: r.applied_at }));
        done();
    });
    db.query('SELECT full_name, role_applied, applied_at FROM internship_applications WHERE applied_at >= ? ORDER BY applied_at DESC LIMIT 10', [since], (err, rows) => {
        if (!err) rows.forEach(r => notifications.push({ type: 'internship', icon: 'fa-briefcase', color: '#10b981', text: r.full_name + ' applied for ' + r.role_applied, time: r.applied_at }));
        done();
    });
    db.query('SELECT user_name, session_id, created_at FROM chat_messages WHERE sender = "user" AND is_read = 0 AND created_at >= ? ORDER BY created_at DESC LIMIT 10', [since], (err, rows) => {
        if (!err) rows.forEach(r => notifications.push({ type: 'chat', icon: 'fa-comments', color: '#f59e0b', text: (r.user_name || 'Guest') + ' sent a chat message', time: r.created_at }));
        done();
    });
});

// GET /api/student/notifications — student: their own activity updates
app.get('/api/student/notifications', verifyToken, (req, res) => {
    const user_id = req.user.id;
    const notifications = [];
    let pending = 2;
    function done() {
        if (--pending === 0) {
            notifications.sort((a, b) => new Date(b.time) - new Date(a.time));
            res.json(notifications.slice(0, 10));
        }
    }
    db.query('SELECT course_name, status, applied_at FROM course_applications WHERE user_id = ? ORDER BY applied_at DESC LIMIT 5', [user_id], (err, rows) => {
        if (!err) rows.forEach(r => notifications.push({ icon: 'fa-graduation-cap', color: '#667eea', text: 'Course application for ' + r.course_name + ' is ' + r.status, time: r.applied_at }));
        done();
    });
    db.query('SELECT role_applied, status, applied_at FROM internship_applications WHERE user_id = ? ORDER BY applied_at DESC LIMIT 5', [user_id], (err, rows) => {
        if (!err) rows.forEach(r => notifications.push({ icon: 'fa-briefcase', color: '#10b981', text: 'Internship application for ' + r.role_applied + ' is ' + r.status, time: r.applied_at }));
        done();
    });
});

// POST /api/auth/forgot-password — send OTP to registered email
app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    db.query('SELECT id FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (results.length === 0) return res.status(404).json({ error: 'No account found with this email.' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore['reset_' + email] = { otp, expiresAt: Date.now() + 10 * 60 * 1000 };

        sendEmail(email, 'Password Reset OTP - Build Together Institute',
            '<div style="font-family:Poppins,sans-serif;max-width:480px;margin:0 auto;padding:30px;background:#f8fafc;border-radius:16px;">' +
            '<h2 style="color:#1e293b;">Reset Your Password</h2>' +
            '<p style="color:#64748b;">Use the OTP below to reset your password. Valid for <strong>10 minutes</strong>.</p>' +
            '<div style="background:linear-gradient(135deg,#667eea,#764ba2);border-radius:12px;padding:20px;text-align:center;margin:20px 0;">' +
            '<div style="font-size:2.5rem;font-weight:700;color:white;letter-spacing:10px;">' + otp + '</div>' +
            '</div>' +
            '<p style="color:#94a3b8;font-size:0.85rem;">If you did not request this, please ignore this email.</p>' +
            '</div>'
        )
        .then(() => res.json({ message: 'OTP sent to your email.' }))
        .catch(e => res.status(500).json({ error: 'Failed to send OTP.' }));
    });
});

// POST /api/auth/reset-password — verify OTP and set new password
app.post('/api/auth/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ error: 'All fields required.' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const record = otpStore['reset_' + email];
    if (!record) return res.status(400).json({ error: 'OTP not sent or expired.' });
    if (Date.now() > record.expiresAt) {
        delete otpStore['reset_' + email];
        return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    }
    if (record.otp !== otp.toString()) return res.status(400).json({ error: 'Invalid OTP.' });

    delete otpStore['reset_' + email];
    const hash = await bcrypt.hash(newPassword, 10);
    db.query('UPDATE users SET password_hash = ? WHERE email = ?', [hash, email], (err) => {
        if (err) return res.status(500).json({ error: 'Failed to update password.' });
        res.json({ message: 'Password reset successfully!' });
    });
});

// POST /api/otp/verify
app.post('/api/otp/verify', (req, res) => {
    const { email, otp, type } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required.' });

    const key = type === 'phone' ? 'phone_' + email : 'email_' + email;
    const record = otpStore[key];
    if (!record) return res.status(400).json({ error: 'OTP not sent or expired. Please request again.' });
    if (Date.now() > record.expiresAt) {
        delete otpStore[key];
        return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    }
    if (record.otp !== otp.toString()) return res.status(400).json({ error: 'Invalid OTP. Please try again.' });

    delete otpStore[key];
    res.json({ message: 'Verified successfully.', verified: true });
});

// =============================================
// ROUTE 8 — ADMIN ROUTES
// =============================================
app.get('/api/admin/course-applications', verifyToken, adminOnly, (req, res) => {
    db.query('SELECT * FROM course_applications ORDER BY applied_at DESC', (err, results) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch applications.' });
        res.json(results);
    });
});

app.get('/api/admin/internship-applications', verifyToken, adminOnly, (req, res) => {
    db.query('SELECT * FROM internship_applications ORDER BY applied_at DESC', (err, results) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch applications.' });
        res.json(results);
    });
});

app.get('/api/admin/messages', verifyToken, adminOnly, (req, res) => {
    db.query('SELECT * FROM contact_messages ORDER BY received_at DESC', (err, results) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch messages.' });
        res.json(results);
    });
});

app.patch('/api/admin/course-applications/:id', verifyToken, adminOnly, (req, res) => {
    const { status } = req.body;
    // Admin can only approve or reject — ongoing/completed are set automatically by student progress
    const allowed = ['approved', 'rejected'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status. Admin can only approve or reject.' });

    db.query('SELECT full_name, email, course_name, status AS current_status FROM course_applications WHERE id = ?',
        [req.params.id], async (err, results) => {
            if (err || !results.length) return res.status(500).json({ error: 'Application not found.' });
            const { full_name, email, course_name, current_status } = results[0];

            // Prevent changing already ongoing/completed courses
            if (current_status === 'ongoing' || current_status === 'completed') {
                return res.status(400).json({ error: 'Cannot change status of an ongoing or completed course.' });
            }

            db.query('UPDATE course_applications SET status = ? WHERE id = ?',
                [status, req.params.id], async (err) => {
                    if (err) return res.status(500).json({ error: 'Update failed.' });

                    // Send email on approval
                    if (status === 'approved') {
                        try {
                            await sendEmail(email, '✅ Course Application Approved - Build Together Institute',
                                '<div style="font-family:Poppins,sans-serif;max-width:520px;margin:0 auto;padding:30px;background:#f8fafc;border-radius:16px;">' +
                                '<h2 style="color:#10b981;">Congratulations, ' + full_name + '! ✅</h2>' +
                                '<p style="color:#1e293b;">Your application for <strong>' + course_name + '</strong> has been <strong>approved</strong>!</p>' +
                                '<div style="background:white;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid #10b981;">' +
                                '<p style="margin:0;color:#64748b;">You can now access your course content from your <strong>Student Dashboard</strong>.</p>' +
                                '</div>' +
                                '<p style="color:#94a3b8;font-size:0.85rem;">Best regards,<br>Build Together Institute</p>' +
                                '</div>'
                            );
                        } catch(e) { console.warn('Approval email failed:', e.message); }
                    } else if (status === 'rejected') {
                        try {
                            await sendEmail(email, 'Update on your Course Application - Build Together Institute',
                                '<div style="font-family:Poppins,sans-serif;max-width:520px;margin:0 auto;padding:30px;background:#f8fafc;border-radius:16px;">' +
                                '<h2 style="color:#1e293b;">Hi ' + full_name + ',</h2>' +
                                '<p style="color:#64748b;">Thank you for applying for <strong>' + course_name + '</strong>.</p>' +
                                '<p style="color:#64748b;">Unfortunately, we are unable to process your application at this time. Please contact us for more details.</p>' +
                                '<p style="color:#94a3b8;font-size:0.85rem;">Best regards,<br>Build Together Institute</p>' +
                                '</div>'
                            );
                        } catch(e) { console.warn('Rejection email failed:', e.message); }
                    }

                    res.json({ message: 'Status updated to ' + status });
                }
            );
        }
    );
});

app.patch('/api/admin/internship-applications/:id', verifyToken, adminOnly, (req, res) => {
    const { status } = req.body;
    const allowed = ['pending', 'shortlisted', 'selected', 'rejected'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    db.query('SELECT full_name, email, role_applied FROM internship_applications WHERE id = ?',
        [req.params.id], async (err, results) => {
            if (err || !results.length) return res.status(500).json({ error: 'Application not found.' });
            const { full_name, email, role_applied } = results[0];

            db.query('UPDATE internship_applications SET status = ? WHERE id = ?',
                [status, req.params.id], async (err) => {
                    if (err) return res.status(500).json({ error: 'Update failed.' });

                    // Send email based on status
                    const emailMap = {
                        shortlisted: {
                            subject: '🎉 You have been Shortlisted! - Build Together Institute',
                            html:
                                '<div style="font-family:Poppins,sans-serif;max-width:520px;margin:0 auto;padding:30px;background:#f8fafc;border-radius:16px;">' +
                                '<h2 style="color:#667eea;">Congratulations, ' + full_name + '! 🎉</h2>' +
                                '<p style="color:#1e293b;">We are excited to inform you that you have been <strong>shortlisted</strong> for the <strong>' + role_applied + '</strong> position at Build Together Institute.</p>' +
                                '<div style="background:white;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid #667eea;">' +
                                '<p style="margin:0;color:#64748b;"><strong>Next Steps:</strong></p>' +
                                '<ul style="color:#64748b;margin-top:8px;">' +
                                '<li>Our HR team will contact you shortly with the interview schedule.</li>' +
                                '<li>Prepare by reviewing your applied skills and role requirements.</li>' +
                                '<li>Keep an eye on your email for further updates.</li>' +
                                '</ul></div>' +
                                '<p style="color:#94a3b8;font-size:0.85rem;">Best of luck! 💪<br>Build Together HR Team</p>' +
                                '</div>'
                        },
                        selected: {
                            subject: '🚀 Welcome Aboard! You are Selected - Build Together Institute',
                            html:
                                '<div style="font-family:Poppins,sans-serif;max-width:520px;margin:0 auto;padding:30px;background:#f8fafc;border-radius:16px;">' +
                                '<h2 style="color:#10b981;">Welcome Aboard, ' + full_name + '! 🚀</h2>' +
                                '<p style="color:#1e293b;">We are thrilled to inform you that you have been <strong>selected</strong> for the <strong>' + role_applied + '</strong> internship at Build Together Institute.</p>' +
                                '<div style="background:white;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid #10b981;">' +
                                '<p style="margin:0;color:#64748b;"><strong>What happens next:</strong></p>' +
                                '<ul style="color:#64748b;margin-top:8px;">' +
                                '<li>Our team will share your onboarding details and start date shortly.</li>' +
                                '<li>You will be assigned a mentor for 1-on-1 guidance.</li>' +
                                '<li>Check your dashboard for further updates.</li>' +
                                '</ul></div>' +
                                '<p style="color:#94a3b8;font-size:0.85rem;">Excited to have you with us!<br>Build Together HR Team</p>' +
                                '</div>'
                        },
                        rejected: {
                            subject: 'Update on your Internship Application - Build Together Institute',
                            html:
                                '<div style="font-family:Poppins,sans-serif;max-width:520px;margin:0 auto;padding:30px;background:#f8fafc;border-radius:16px;">' +
                                '<h2 style="color:#1e293b;">Hi ' + full_name + ',</h2>' +
                                '<p style="color:#64748b;">Thank you for applying for the <strong>' + role_applied + '</strong> position at Build Together Institute.</p>' +
                                '<p style="color:#64748b;">After careful consideration, we regret to inform you that we will not be moving forward with your application at this time.</p>' +
                                '<p style="color:#64748b;">We encourage you to keep building your skills and apply again for future openings.</p>' +
                                '<p style="color:#94a3b8;font-size:0.85rem;">Best regards,<br>Build Together HR Team</p>' +
                                '</div>'
                        }
                    };

                    if (emailMap[status]) {
                        try {
                            await sendEmail(email, emailMap[status].subject, emailMap[status].html);
                        } catch(e) {
                            console.warn('Status email failed:', e.message);
                        }
                    }

                    res.json({ message: 'Status updated.' });
                }
            );
        }
    );
});

// =============================================
// CHAT API ROUTES
// =============================================

// GET chat history for a session (admin use)
app.get('/api/chat/history/:session_id', verifyToken, adminOnly, (req, res) => {
    db.query('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
        [req.params.session_id], (err, results) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            res.json(results);
        });
});

// GET all unique chat sessions (admin use)
app.get('/api/chat/sessions', verifyToken, adminOnly, (req, res) => {
    db.query(
        'SELECT session_id, ' +
        'MAX(user_name) as user_name, ' +
        'MAX(user_email) as user_email, ' +
        'MAX(created_at) as last_message, ' +
        'SUM(CASE WHEN is_read=0 AND sender="user" THEN 1 ELSE 0 END) as unread ' +
        'FROM chat_messages GROUP BY session_id ORDER BY last_message DESC',
        (err, results) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            res.json(results);
        });
});

// POST mark messages as read
app.post('/api/chat/mark-read/:session_id', verifyToken, adminOnly, (req, res) => {
    db.query('UPDATE chat_messages SET is_read=1 WHERE session_id=? AND sender="user"',
        [req.params.session_id], (err) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            res.json({ message: 'Marked as read.' });
        });
});

// =============================================
// SOCKET.IO — LIVE CHAT
// =============================================
io.on('connection', (socket) => {

    // User joins with their session
    socket.on('user_join', (data) => {
        socket.join(data.session_id);
        socket.join('admin_room');
    });

    // Admin joins admin room
    socket.on('admin_join', () => {
        socket.join('admin_room');
    });

    // User sends message
    socket.on('user_message', (data) => {
        const { session_id, message, user_name, user_email } = data;
        db.query(
            'INSERT INTO chat_messages (session_id, sender, message, user_name, user_email) VALUES (?,"user",?,?,?)',
            [session_id, message, user_name || 'Guest', user_email || null],
            (err, result) => {
                if (err) return;
                const msg = { id: result.insertId, session_id, sender: 'user', message, user_name: user_name || 'Guest', user_email: user_email || null, created_at: new Date() };
                // Send to user
                io.to(session_id).emit('new_message', msg);
                // Notify admin
                io.to('admin_room').emit('admin_new_message', msg);
            }
        );
    });

    // Admin sends reply
    socket.on('admin_message', (data) => {
        const { session_id, message } = data;
        db.query(
            'INSERT INTO chat_messages (session_id, sender, message, user_name) VALUES (?,"admin",?,"Admin")',
            [session_id, message],
            (err, result) => {
                if (err) return;
                const msg = { id: result.insertId, session_id, sender: 'admin', message, user_name: 'Admin', created_at: new Date() };
                // Send dedicated reply event to user session room
                io.to(session_id).emit('admin_reply', { message });
                // Also update admin room for their own chat view
                io.to('admin_room').emit('admin_new_message', msg);
            }
        );
    });
});

// =============================================
// START SERVER
// =============================================
// --------------------
// Interview management APIs
// --------------------

// GET pending/all interview access requests (admin)
app.get('/api/admin/interview-requests', verifyToken, adminOnly, (req, res) => {
    db.query(
        'SELECT mia.id, mia.user_id, mia.course_name, mia.status, mia.requested_at, u.full_name, u.email FROM mock_interview_access mia LEFT JOIN users u ON mia.user_id = u.id ORDER BY mia.requested_at DESC',
        (err, results) => {
            if (err) return res.status(500).json({ error: 'Failed to fetch requests.' });
            res.json(results.map(r => ({ id: r.id, user_id: r.user_id, course_name: r.course_name, status: r.status, requested_at: r.requested_at, full_name: r.full_name, email: r.email })));
        }
    );
});

// PATCH update interview request status (approve/deny)
app.patch('/api/admin/interview-requests/:id', verifyToken, adminOnly, (req, res) => {
    const id = req.params.id;
    const { status } = req.body;
    if (!['approved','denied'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });

    db.query('SELECT user_id, course_name FROM mock_interview_access WHERE id = ?', [id], (err, rows) => {
        if (err || !rows.length) return res.status(404).json({ error: 'Request not found.' });
        const user_id = rows[0].user_id;
        const course_name = rows[0].course_name;

        db.query('UPDATE mock_interview_access SET status = ? WHERE id = ?', [status, id], async (err) => {
            if (err) return res.status(500).json({ error: 'Failed to update status.' });

            // notify user via email
            db.query('SELECT email, full_name FROM users WHERE id = ?', [user_id], async (err, urows) => {
                if (!err && urows.length) {
                    try {
                        if (status === 'approved') {
                            await sendEmail(urows[0].email, 'Interview Access Approved', '<p>Your access to mock interview for <strong>' + course_name + '</strong> has been approved.</p>');
                        } else {
                            await sendEmail(urows[0].email, 'Interview Access Update', '<p>Your request for mock interview access for <strong>' + course_name + '</strong> was not approved.</p>');
                        }
                    } catch (e) { console.warn('Notify email failed:', e.message); }
                }
            });

            res.json({ message: 'Status updated.' });
        });
    });
});

// Upload PDF and extract simple Q&A (admin)
app.post('/api/admin/upload-qa', verifyToken, adminOnly, upload.single('pdf'), async (req, res) => {
    try {
        const course_name = req.body.course_name || req.body.course || 'General';
        if (!req.file) return res.status(400).json({ error: 'PDF file required.' });

        const dataBuffer = fs.readFileSync(req.file.path);
        let text = '';

        try {
            const parser = new PDFParse({ data: dataBuffer });
            const result = await parser.getText();
            text = result.text || '';
        } catch (parseErr) {
            console.error('PDF parse attempt failed:', parseErr.message);
            text = '';
        }

        // Very small heuristic: split by lines, find questions ending with '?' and treat following non-empty lines as answers.
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const qa = [];
        for (let i = 0; i < lines.length; i++) {
            const ln = lines[i];
            if (ln.endsWith('?') || /^Q[:\.]?/i.test(ln) || /^Question/i.test(ln)) {
                const question = ln.replace(/^Q[:\.]?\s*/i, '');
                let ans = '';
                for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
                    if (lines[j].endsWith('?') || /^Q[:\.]?/i.test(lines[j])) break;
                    ans += (ans ? ' ' : '') + lines[j];
                }
                qa.push({ question, answer: ans });
            }
        }

        const qaJson = JSON.stringify(qa);
        const pdfPath = req.file.path;
        db.query('INSERT INTO course_qa_data (course_name, pdf_path, qa_json, uploaded_at) VALUES (?,?,?,NOW())', [course_name, pdfPath, qaJson], (err) => {
            if (err) return res.status(500).json({ error: 'Failed to save QA data.' });
            res.json({ message: 'PDF processed', count: qa.length, qa });
        });
    } catch (e) {
        console.error('PDF parse error:', e.message);
        res.status(500).json({ error: 'Failed to parse PDF.' });
    }
});

// Get course QA for students (by course name)
app.get('/api/interview/course-questions/:courseName', verifyToken, (req, res) => {
    const course = req.params.courseName;
    db.query('SELECT qa_json FROM course_qa_data WHERE course_name = ? ORDER BY uploaded_at DESC LIMIT 1', [course], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch QA.' });
        if (!rows.length) return res.json([]);
        try { const qa = JSON.parse(rows[0].qa_json || '[]'); res.json(qa); }
        catch(e) { res.json([]); }
    });
});

// Download the uploaded PDF for a course
app.get('/api/interview/course-pdf/:courseName', verifyToken, (req, res) => {
    const course = req.params.courseName;

    db.query('SELECT pdf_path FROM course_qa_data WHERE course_name = ? ORDER BY uploaded_at DESC LIMIT 1', [course], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch PDF.' });
        if (!rows.length || !rows[0].pdf_path) return res.status(404).json({ error: 'PDF not found.' });

        const pdfPath = path.resolve(__dirname, rows[0].pdf_path);
        if (!fs.existsSync(pdfPath)) return res.status(404).json({ error: 'PDF not found.' });

        res.download(pdfPath, `${course}.pdf`);
    });
});

// Student: get interview access status and enrolled courses (used by frontend)
app.get('/api/interview/status', verifyToken, (req, res) => {
    const user_id = req.user.id;
    db.query(`
        SELECT m.course_name,
               m.status,
               m.requested_at,
               m.id,
               (
                   SELECT c.qa_json
                   FROM course_qa_data c
                   WHERE c.course_name = m.course_name
                   ORDER BY c.uploaded_at DESC
                   LIMIT 1
               ) AS qa_json
        FROM mock_interview_access m
        WHERE m.user_id = ?
    `, [user_id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch status.' });
        res.json(rows);
    });
});

// Student: request mock interview access for a course
app.post('/api/interview/request', verifyToken, (req, res) => {
    const user_id = req.user.id;
    const { course_name } = req.body;

    if (!course_name) return res.status(400).json({ error: 'Course name is required.' });

    db.query(
        'INSERT INTO mock_interview_access (user_id, course_name, status) VALUES (?, ?, "pending") ON DUPLICATE KEY UPDATE status = "pending", requested_at = NOW(), updated_at = NOW()',
        [user_id, course_name],
        (err) => {
            if (err) return res.status(500).json({ error: 'Failed to submit interview access request.' });
            res.json({ success: true, status: 'pending', course_name });
        }
    );
});

// Admin: interview analytics
app.get('/api/admin/interview-analytics', verifyToken, adminOnly, (req, res) => {
    db.query(`
        SELECT
            COUNT(*) AS total_interviews,
            AVG(final_score) AS avg_score,
            COUNT(DISTINCT user_id) AS unique_users,
            SUM(CASE WHEN final_score >= 7 THEN 1 ELSE 0 END) AS passed_count
        FROM mock_interviews
        WHERE status = 'completed'
    `, (err, summaryRows) => {
        if (err) return res.status(500).json({ error: 'Failed to load analytics.' });

        db.query(`
            SELECT role, COUNT(*) AS count, AVG(final_score) AS avg_score
            FROM mock_interviews
            WHERE status = 'completed'
            GROUP BY role
            ORDER BY count DESC
        `, (roleErr, roleRows) => {
            if (roleErr) return res.status(500).json({ error: 'Failed to load role analytics.' });

            res.json({
                summary: summaryRows[0] || {
                    total_interviews: 0,
                    avg_score: 0,
                    unique_users: 0,
                    passed_count: 0
                },
                by_role: roleRows
            });
        });
    });
});

// Admin: interview results
app.get('/api/admin/interviews', verifyToken, adminOnly, (req, res) => {
    db.query(`
        SELECT
            m.id,
            m.role,
            m.level,
            m.final_score,
            m.technical_score,
            m.communication_score,
            m.confidence_score,
            m.duration_seconds,
            m.completed_at,
            m.created_at,
            u.full_name,
            u.email
        FROM mock_interviews m
        LEFT JOIN users u ON u.id = m.user_id
        WHERE m.status = 'completed'
        ORDER BY COALESCE(m.completed_at, m.created_at) DESC
        LIMIT 100
    `, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to load interviews.' });
        res.json(rows);
    });
});

// POST /api/interview/start - create a new mock interview session
app.post('/api/interview/start', verifyToken, (req, res) => {
    const user_id = req.user.id;
    const { role, level, total_questions, session_id, course_name } = req.body;
    if (!role || !session_id) return res.status(400).json({ error: 'role and session_id required.' });

    db.query(
        'INSERT INTO mock_interviews (user_id, session_id, role, level, total_questions, status, created_at) VALUES (?,?,?,?,?,"in_progress",NOW())',
        [user_id, session_id, role, level || 'Beginner', total_questions || 5],
        (err, result) => {
            if (err) { console.error('Create interview error:', err.message); return res.status(500).json({ error: 'Failed to start interview.' }); }
            return res.json({ message: 'Interview started', interviewId: result.insertId });
        }
    );
});

const PORT = process.env.PORT || 5000;

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Try killing the process using it or change the PORT in server.js.`);
        process.exit(1);
    }
});

server.listen(PORT, () => {
    console.log('Server running on http://localhost:' + PORT);
    const { exec } = require('child_process');
    exec('start http://localhost:' + PORT);
});
 
