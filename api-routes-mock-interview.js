// =============================================
// COMPLETE MOCK INTERVIEW API ROUTES
// Add these routes to server.js
// =============================================

/**
 * 1. PDF Q&A MANAGEMENT FOR ADMIN
 */

// Admin: Upload PDF and extract Q&A for a course
app.post('/api/admin/course-qa/upload', verifyToken, adminOnly, upload.single('pdf'), async (req, res) => {
    const { course_name } = req.body;
    if (!req.file || !course_name) {
        return res.status(400).json({ error: 'PDF file and course name are required.' });
    }

    try {
        const dataBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdf(dataBuffer);
        const rawText = pdfData.text;

        // Use Gemini to structure raw PDF text into Q&A pairs
        const prompt = `You are an expert at extracting interview questions and answers from documents.
        Extract ALL questions and answers from the following text.
        Return ONLY a valid JSON array with objects containing "question" and "answer" fields.
        Each answer should be 2-3 sentences.
        Do NOT include any other text, just the JSON array.
        
        Text to extract from:
        ${rawText.substring(0, 8000)}`;

        const aiResponse = await callGeminiAPI(prompt);
        const qaPairs = JSON.stringify(aiResponse || []);

        // Delete old file
        fs.unlinkSync(req.file.path);

        db.query(
            `INSERT INTO course_qa_data (course_name, pdf_path, qa_json) 
             VALUES (?, ?, ?) 
             ON DUPLICATE KEY UPDATE qa_json=VALUES(qa_json), pdf_path=VALUES(pdf_path), uploaded_at=NOW()`,
            [course_name, req.file.originalname, qaPairs],
            (err) => {
                if (err) {
                    console.error('DB Error:', err);
                    return res.status(500).json({ error: 'Failed to save Q&A data.' });
                }
                
                // Parse and return the extracted Q&A
                try {
                    const parsed = JSON.parse(qaPairs);
                    res.status(201).json({ 
                        message: 'PDF uploaded and Q&A extracted successfully!',
                        course_name: course_name,
                        question_count: parsed.length,
                        qa_data: parsed.slice(0, 5) // Show first 5 as preview
                    });
                } catch (e) {
                    res.status(201).json({ 
                        message: 'PDF uploaded and Q&A extracted!',
                        course_name: course_name
                    });
                }
            }
        );
    } catch (e) {
        console.error('PDF Processing Error:', e);
        res.status(500).json({ error: 'Failed to process PDF: ' + e.message });
    }
});

// Admin: Get existing Q&A for a course
app.get('/api/admin/course-qa/:courseName', verifyToken, adminOnly, (req, res) => {
    const { courseName } = req.params;
    
    db.query(
        'SELECT id, course_name, pdf_path, qa_json, uploaded_at FROM course_qa_data WHERE course_name = ?',
        [courseName],
        (err, results) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            if (!results.length) return res.status(404).json({ error: 'No Q&A found for this course.' });
            
            const data = results[0];
            try {
                data.qa_data = JSON.parse(data.qa_json || '[]');
            } catch (e) {
                data.qa_data = [];
            }
            res.json(data);
        }
    );
});

/**
 * 2. INTERVIEW ACCESS MANAGEMENT FOR ADMIN
 */

// Admin: View all interview access requests (pending/approved/denied)
app.get('/api/admin/interview-requests', verifyToken, adminOnly, (req, res) => {
    const { status } = req.query; // Optional filter: pending, approved, denied
    
    let query = `SELECT 
                    mia.id, 
                    mia.user_id, 
                    mia.course_name, 
                    mia.status, 
                    mia.requested_at, 
                    mia.updated_at,
                    u.full_name, 
                    u.email,
                    cq.qa_json
                 FROM mock_interview_access mia
                 JOIN users u ON mia.user_id = u.id
                 LEFT JOIN course_qa_data cq ON mia.course_name = cq.course_name`;
    
    let params = [];
    
    if (status) {
        query += ' WHERE mia.status = ?';
        params.push(status);
    }
    
    query += ' ORDER BY mia.requested_at DESC';
    
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('DB Error:', err);
            return res.status(500).json({ error: 'Failed to fetch requests.' });
        }
        
        // Parse Q&A data for each result
        const formattedResults = results.map(r => {
            try {
                r.qa_preview = JSON.parse(r.qa_json || '[]').slice(0, 3);
            } catch (e) {
                r.qa_preview = [];
            }
            return r;
        });
        
        res.json(formattedResults);
    });
});

// Admin: Approve interview access for a student
app.post('/api/admin/interview-access/approve/:id', verifyToken, adminOnly, (req, res) => {
    const { id } = req.params;
    
    db.query(
        'UPDATE mock_interview_access SET status = ?, updated_at = NOW() WHERE id = ?',
        ['approved', id],
        (err) => {
            if (err) return res.status(500).json({ error: 'Failed to approve request.' });
            
            // Get student details to send notification email
            db.query(
                `SELECT u.email, u.full_name, mia.course_name 
                 FROM mock_interview_access mia 
                 JOIN users u ON mia.user_id = u.id 
                 WHERE mia.id = ?`,
                [id],
                (err2, results) => {
                    if (results && results.length > 0) {
                        const { email, full_name, course_name } = results[0];
                        sendEmail(
                            email,
                            'Mock Interview Access Approved! 🎉',
                            `<h2>Hi ${full_name},</h2>
                            <p>Great news! Your mock interview access for <strong>${course_name}</strong> has been <strong>approved</strong>!</p>
                            <p>You can now:</p>
                            <ul>
                                <li>View the preparation materials</li>
                                <li>Download the Q&A guide</li>
                                <li>Start the mock interview</li>
                            </ul>
                            <p>Visit your dashboard to get started.</p>
                            <br><p>Best of luck!<br>Build Together Team</p>`
                        ).catch(e => console.warn('Email failed:', e.message));
                    }
                    
                    res.json({ message: 'Request approved and notification sent.' });
                }
            );
        }
    );
});

// Admin: Deny interview access for a student
app.post('/api/admin/interview-access/deny/:id', verifyToken, adminOnly, (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    
    db.query(
        'UPDATE mock_interview_access SET status = ?, updated_at = NOW() WHERE id = ?',
        ['denied', id],
        (err) => {
            if (err) return res.status(500).json({ error: 'Failed to deny request.' });
            
            // Get student details to send notification email
            db.query(
                `SELECT u.email, u.full_name, mia.course_name 
                 FROM mock_interview_access mia 
                 JOIN users u ON mia.user_id = u.id 
                 WHERE mia.id = ?`,
                [id],
                (err2, results) => {
                    if (results && results.length > 0) {
                        const { email, full_name, course_name } = results[0];
                        sendEmail(
                            email,
                            'Mock Interview Access Status Update',
                            `<h2>Hi ${full_name},</h2>
                            <p>Your mock interview access request for <strong>${course_name}</strong> has been reviewed.</p>
                            <p>${reason ? 'Reason: ' + reason : 'Please contact the admin for more information.'}</p>
                            <p>You can reapply after completing the prerequisites.</p>
                            <br><p>Best regards,<br>Build Together Team</p>`
                        ).catch(e => console.warn('Email failed:', e.message));
                    }
                    
                    res.json({ message: 'Request denied and notification sent.' });
                }
            );
        }
    );
});

/**
 * 3. STUDENT ACCESS & PREPARATION MATERIALS
 */

// Student: Check interview access status for all enrolled courses
app.get('/api/interview/status', verifyToken, (req, res) => {
    const user_id = req.user.id;
    
    db.query(
        `SELECT 
            mia.id,
            mia.course_name,
            mia.status,
            mia.requested_at,
            cq.qa_json,
            cq.pdf_path,
            cq.uploaded_at
         FROM mock_interview_access mia
         LEFT JOIN course_qa_data cq ON mia.course_name = cq.course_name
         WHERE mia.user_id = ?
         ORDER BY mia.course_name ASC`,
        [user_id],
        (err, results) => {
            if (err) {
                console.error('DB Error:', err);
                return res.status(500).json({ error: 'Failed to fetch access status.' });
            }
            
            // Parse and filter Q&A for approved students only
            const formattedResults = results.map(r => {
                if (r.status === 'approved' && r.qa_json) {
                    try {
                        r.qa_data = JSON.parse(r.qa_json);
                    } catch (e) {
                        r.qa_data = [];
                    }
                } else {
                    r.qa_data = null; // Hide Q&A if not approved
                }
                delete r.qa_json; // Don't send raw JSON to frontend
                return r;
            });
            
            res.json(formattedResults);
        }
    );
});

// Student: Get preparation materials for a specific course (if approved)
app.get('/api/interview/preparation/:courseName', verifyToken, (req, res) => {
    const user_id = req.user.id;
    const { courseName } = req.params;
    
    // Check if student is approved for this course
    db.query(
        'SELECT status FROM mock_interview_access WHERE user_id = ? AND course_name = ?',
        [user_id, courseName],
        (err, accessResults) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            if (!accessResults.length || accessResults[0].status !== 'approved') {
                return res.status(403).json({ error: 'Access denied. Not approved for this course.' });
            }
            
            // Get Q&A data
            db.query(
                'SELECT qa_json, pdf_path, uploaded_at FROM course_qa_data WHERE course_name = ?',
                [courseName],
                (err2, qaResults) => {
                    if (err2) return res.status(500).json({ error: 'Database error.' });
                    if (!qaResults.length) {
                        return res.status(404).json({ error: 'Preparation materials not found.' });
                    }
                    
                    const data = qaResults[0];
                    try {
                        data.qa_data = JSON.parse(data.qa_json || '[]');
                    } catch (e) {
                        data.qa_data = [];
                    }
                    
                    res.json({
                        course_name: courseName,
                        qa_data: data.qa_data,
                        pdf_file: data.pdf_path,
                        uploaded_at: data.uploaded_at
                    });
                }
            );
        }
    );
});

/**
 * 4. COURSE-SPECIFIC INTERVIEW QUESTIONS
 */

// Student: Get questions for a specific course interview
app.get('/api/interview/course-questions/:courseName', verifyToken, (req, res) => {
    const user_id = req.user.id;
    const { courseName } = req.params;
    
    // Verify student is approved and enrolled in this course
    db.query(
        'SELECT status FROM mock_interview_access WHERE user_id = ? AND course_name = ?',
        [user_id, courseName],
        (err, accessResults) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            if (!accessResults.length || accessResults[0].status !== 'approved') {
                return res.status(403).json({ error: 'Not approved for interviews in this course.' });
            }
            
            // Get Q&A data for this course
            db.query(
                'SELECT qa_json FROM course_qa_data WHERE course_name = ?',
                [courseName],
                (err2, qaResults) => {
                    if (err2) return res.status(500).json({ error: 'Database error.' });
                    if (!qaResults.length) {
                        return res.status(404).json({ error: 'No questions configured for this course.' });
                    }
                    
                    try {
                        const allQuestions = JSON.parse(qaResults[0].qa_json || '[]');
                        // Shuffle and return questions
                        const shuffled = allQuestions.sort(() => Math.random() - 0.5);
                        res.json({
                            course_name: courseName,
                            total_questions: shuffled.length,
                            questions: shuffled
                        });
                    } catch (e) {
                        res.status(500).json({ error: 'Failed to parse questions.' });
                    }
                }
            );
        }
    );
});

/**
 * 5. MODIFIED START INTERVIEW ROUTE (with course verification)
 */

// POST /api/interview/start — Modified to verify course enrollment & approval
app.post('/api/interview/start', verifyToken, (req, res) => {
    const { role, level, total_questions, session_id, course_name } = req.body;
    const user_id = req.user.id;

    if (!role || !level || !course_name) {
        return res.status(400).json({ error: 'Role, level, and course name are required.' });
    }

    // Verify student is approved for this course
    db.query(
        'SELECT id FROM mock_interview_access WHERE user_id = ? AND course_name = ? AND status = ?',
        [user_id, course_name, 'approved'],
        (err, results) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            if (!results.length) {
                return res.status(403).json({ error: 'Not approved for interviews in this course.' });
            }

            // Create interview session
            db.query(
                'INSERT INTO mock_interviews (user_id, role, level, total_questions, session_id, status) VALUES (?,?,?,?,?,?)',
                [user_id, role, level, total_questions || 5, session_id, 'in_progress'],
                (err2, result) => {
                    if (err2) {
                        console.error('Insert error:', err2);
                        return res.status(500).json({ error: 'Failed to create interview session.' });
                    }
                    
                    // Update with course name
                    db.query(
                        'UPDATE mock_interviews SET role = ? WHERE id = ?',
                        [course_name + ' - ' + role, result.insertId],
                        (err3) => {
                            if (err3) console.error('Update error:', err3);
                            res.status(201).json({ 
                                interviewId: result.insertId, 
                                message: 'Interview session created.',
                                course_name: course_name
                            });
                        }
                    );
                }
            );
        }
    );
});

/**
 * 6. HELPER FUNCTION FOR GEMINI API CALLS
 */

async function callGeminiAPI(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('Gemini API key not configured');
        return [];
    }

    try {
        const { default: fetch } = await import('node-fetch');
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 4000 }
                })
            }
        );

        if (!response.ok) {
            const err = await response.json();
            console.error('Gemini API error:', err);
            return [];
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        
        // Try to parse JSON, removing markdown code blocks if present
        try {
            return JSON.parse(text.replace(/```json|\```|```/g, '').trim());
        } catch (e) {
            console.warn('Failed to parse Gemini response:', e.message);
            return [];
        }
    } catch (e) {
        console.error('Gemini API call failed:', e.message);
        return [];
    }
}

// =============================================
// EXPORT OR DOCUMENT: Add these functions/routes to your server.js
// Make sure to have these dependencies:
// - multer (for file upload)
// - pdf-parse (for PDF parsing)
// - node-fetch (for API calls)
// =============================================
