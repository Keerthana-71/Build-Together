-- Course Syllabus
CREATE TABLE IF NOT EXISTS course_syllabus (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_name VARCHAR(150) NOT NULL,
    week_no INT NOT NULL,
    topic VARCHAR(200) NOT NULL,
    description TEXT,
    UNIQUE KEY (course_name, week_no)
);

-- Week Tasks
CREATE TABLE IF NOT EXISTS week_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_name VARCHAR(150) NOT NULL,
    week_no INT NOT NULL,
    task_no INT NOT NULL,
    task_type ENUM('task','assessment') NOT NULL DEFAULT 'task',
    title VARCHAR(200) NOT NULL,
    description TEXT,
    UNIQUE KEY (course_name, week_no, task_no, task_type)
);

-- Student Progress (week level)
CREATE TABLE IF NOT EXISTS student_progress (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    course_name VARCHAR(150) NOT NULL,
    week_no INT NOT NULL,
    is_unlocked TINYINT(1) DEFAULT 0,
    is_completed TINYINT(1) DEFAULT 0,
    completed_at TIMESTAMP NULL,
    UNIQUE KEY (user_id, course_name, week_no)
);

-- Student Task Progress
CREATE TABLE IF NOT EXISTS student_task_progress (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    course_name VARCHAR(150) NOT NULL,
    week_no INT NOT NULL,
    task_id INT NOT NULL,
    is_completed TINYINT(1) DEFAULT 0,
    completed_at TIMESTAMP NULL,
    UNIQUE KEY (user_id, task_id)
);

-- Sample syllabus data for Full Stack Development
INSERT IGNORE INTO course_syllabus (course_name, week_no, topic, description) VALUES
('Full Stack Web Development', 1, 'HTML & CSS Fundamentals', 'Learn the building blocks of web pages — structure, styling, and layouts.'),
('Full Stack Web Development', 2, 'JavaScript Basics', 'Variables, functions, DOM manipulation, and events.'),
('Full Stack Web Development', 3, 'React.js Introduction', 'Components, props, state, and hooks.'),
('Full Stack Web Development', 4, 'Node.js & Express', 'Build REST APIs with Node.js and Express framework.'),
('Full Stack Web Development', 5, 'MySQL & Database Design', 'Relational databases, queries, and connecting to Node.js.'),
('Full Stack Web Development', 6, 'Full Stack Web Project', 'Build and deploy a complete full stack application.'),

('Data Science & AI', 1, 'Python for Data Science', 'Python basics, NumPy, and Pandas for data manipulation.'),
('Data Science & AI', 2, 'Data Visualization', 'Matplotlib, Seaborn, and storytelling with data.'),
('Data Science & AI', 3, 'Machine Learning Basics', 'Supervised learning, regression, and classification.'),
('Data Science & AI', 4, 'Deep Learning', 'Neural networks, TensorFlow, and Keras.'),
('Data Science & AI', 5, 'NLP & Computer Vision', 'Text processing and image recognition basics.'),
('Data Science & AI', 6, 'Capstone Project', 'End-to-end ML project with deployment.'),

('UI/UX Design', 1, 'Design Principles', 'Color theory, typography, and visual hierarchy.'),
('Advanced UI/UX Design', 2, 'Figma Fundamentals', 'Wireframing, prototyping, and design systems.'),
('Advanced UI/UX Design', 3, 'User Research', 'User personas, journey maps, and usability testing.'),
('Advanced UI/UX Design', 4, 'Interaction Design', 'Micro-interactions, animations, and accessibility.'),
('Advanced UI/UX Design', 5, 'Portfolio Project', 'Design a complete app UI from scratch.'),

('Cloud Computing (AWS/GCP)', 1, 'Cloud Fundamentals', 'Introduction to cloud concepts, AWS, Azure, and GCP.'),
('Cloud Computing (AWS/GCP)', 2, 'AWS Core Services', 'EC2, S3, RDS, and IAM basics.'),
('Cloud Computing (AWS/GCP)', 3, 'DevOps & CI/CD', 'Docker, Kubernetes, and deployment pipelines.'),
('Cloud Computing (AWS/GCP)', 4, 'Serverless & Microservices', 'Lambda functions and microservice architecture.'),
('Cloud Computing (AWS/GCP)', 5, 'Cloud Security', 'Security best practices and compliance.'),
('Cloud Computing (AWS/GCP)', 6, 'Cloud Project', 'Deploy a scalable application on AWS.'),

('Cyber Security & Ethical Hacking', 1, 'Security Fundamentals', 'CIA triad, threat landscape, and security models.'),
('Cyber Security & Ethical Hacking', 2, 'Network Security', 'Firewalls, VPNs, and network protocols.'),
('Cyber Security & Ethical Hacking', 3, 'Ethical Hacking', 'Penetration testing basics and tools.'),
('Cyber Security & Ethical Hacking', 4, 'Web Application Security', 'OWASP Top 10 and secure coding practices.'),
('Cyber Security & Ethical Hacking', 5, 'Incident Response', 'Threat detection, forensics, and response planning.'),
('Cyber Security & Ethical Hacking', 6, 'Security Project', 'Conduct a full security audit on a sample application.');

-- Sample tasks for each week (Full Stack Development)
INSERT IGNORE INTO week_tasks (course_name, week_no, task_no, task_type, title, description) VALUES
('Full Stack Web Development', 1, 1, 'task', 'Build a Personal Portfolio Page', 'Create a responsive portfolio page using HTML and CSS with at least 3 sections.'),
('Full Stack Web Development', 1, 2, 'task', 'CSS Flexbox Layout', 'Build a navigation bar and card grid using Flexbox.'),
('Full Stack Web Development', 1, 3, 'assessment', 'Week 1 Assessment', 'Answer 5 questions on HTML tags, CSS selectors, and box model.'),

('Full Stack Web Development', 2, 1, 'task', 'DOM Manipulation Exercise', 'Create a to-do list app using vanilla JavaScript.'),
('Full Stack Web Development', 2, 2, 'task', 'Event Handling', 'Build a form with real-time validation using JavaScript events.'),
('Full Stack Web Development', 2, 3, 'assessment', 'Week 2 Assessment', 'Answer questions on JS data types, loops, and DOM methods.'),

('Full Stack Web Development', 3, 1, 'task', 'React Counter App', 'Build a counter app using useState hook.'),
('Full Stack Web Development', 3, 2, 'task', 'Fetch API with React', 'Fetch and display data from a public API using useEffect.'),
('Full Stack Web Development', 3, 3, 'assessment', 'Week 3 Assessment', 'Questions on React lifecycle, props vs state, and hooks.'),

('Full Stack Web Development', 4, 1, 'task', 'Build a REST API', 'Create CRUD endpoints for a simple notes app using Express.'),
('Full Stack Web Development', 4, 2, 'task', 'Middleware & Auth', 'Add JWT authentication middleware to your API.'),
('Full Stack Web Development', 4, 3, 'assessment', 'Week 4 Assessment', 'Questions on HTTP methods, status codes, and Express routing.'),

('Full Stack Web Development', 5, 1, 'task', 'Database Schema Design', 'Design and create tables for a blog application.'),
('Full Stack Web Development', 5, 2, 'task', 'Connect Node to MySQL', 'Integrate your REST API with a MySQL database.'),
('Full Stack Web Development', 5, 3, 'assessment', 'Week 5 Assessment', 'SQL queries, joins, and normalization questions.'),

('Full Stack Web Development', 6, 1, 'task', 'Full Stack App', 'Build a complete CRUD application with React frontend and Node backend.'),
('Full Stack Web Development', 6, 2, 'task', 'Deploy Your App', 'Deploy frontend on Netlify and backend on Render.'),
('Full Stack Web Development', 6, 3, 'assessment', 'Final Assessment', 'Comprehensive test covering all 6 weeks of content.');

-- Add verification columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified TINYINT(1) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_phone_verified TINYINT(1) DEFAULT 0;
-- Mark all existing users as verified (they signed up before this feature)
UPDATE users SET is_email_verified = 1, is_phone_verified = 1 WHERE is_email_verified = 0;

-- Live Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    sender ENUM('user','admin') NOT NULL,
    message TEXT NOT NULL,
    user_name VARCHAR(100) DEFAULT 'Guest',
    user_email VARCHAR(150) DEFAULT NULL,
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- OAuth columns for users table
-- =============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider      VARCHAR(20)  DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id   VARCHAR(100) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo VARCHAR(500) DEFAULT NULL;

-- Allow password_hash to be NULL for OAuth-only accounts
ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) DEFAULT NULL;

-- Unique index so the same OAuth account can't be inserted twice
ALTER TABLE users ADD UNIQUE INDEX IF NOT EXISTS idx_provider_id (provider, provider_id);

-- Sessions table (created automatically by connect-mysql-session, listed here for reference)
-- CREATE TABLE IF NOT EXISTS sessions (
--     session_id VARCHAR(128) NOT NULL PRIMARY KEY,
--     expires    INT(11) UNSIGNED NOT NULL,
--     data       MEDIUMTEXT
-- );

-- =============================================
-- MOCK INTERVIEW SYSTEM — DATABASE SCHEMA
-- =============================================

-- Main interview sessions table
CREATE TABLE IF NOT EXISTS mock_interviews (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    user_id             INT NOT NULL,
    session_id          VARCHAR(60) NOT NULL,
    role                VARCHAR(100) NOT NULL,
    level               ENUM('Beginner','Intermediate','Advanced') NOT NULL DEFAULT 'Beginner',
    total_questions     INT NOT NULL DEFAULT 5,
    status              ENUM('in_progress','completed','abandoned') NOT NULL DEFAULT 'in_progress',
    final_score         DECIMAL(4,1) DEFAULT NULL,
    technical_score     INT DEFAULT NULL,
    communication_score INT DEFAULT NULL,
    confidence_score    INT DEFAULT NULL,
    strengths           JSON DEFAULT NULL,
    weaknesses          JSON DEFAULT NULL,
    suggestions         JSON DEFAULT NULL,
    summary             TEXT DEFAULT NULL,
    duration_seconds    INT DEFAULT 0,
    completed_at        TIMESTAMP NULL DEFAULT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id   (user_id),
    INDEX idx_status    (status),
    INDEX idx_created   (created_at)
);

-- Individual question answers table
CREATE TABLE IF NOT EXISTS interview_answers (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    interview_id    INT NOT NULL,
    user_id         INT NOT NULL,
    question_no     INT NOT NULL,
    question        TEXT NOT NULL,
    answer          TEXT DEFAULT NULL,
    score           INT DEFAULT 0,
    feedback        TEXT DEFAULT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_interview_question (interview_id, question_no),
    INDEX idx_interview_id (interview_id),
    INDEX idx_user_id      (user_id)
);

-- Mock Interview Access Management
CREATE TABLE IF NOT EXISTS mock_interview_access (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    course_name VARCHAR(150) NOT NULL,
    status ENUM('pending', 'approved', 'denied') DEFAULT 'pending',
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_course_access (user_id, course_name)
);

-- Course Q&A Storage (Extracted from PDF)
CREATE TABLE IF NOT EXISTS course_qa_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_name VARCHAR(150) NOT NULL,
    pdf_path VARCHAR(255),
    qa_json LONGTEXT, -- Stores the array of {question, answer} objects
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
