// =====================================================================
// ENHANCED MOCK INTERVIEW FLOW - Course-Based Questions
// This replaces/supplements the existing mock-interview.js
// =====================================================================

/**
 * MODIFICATIONS TO ADD TO mock-interview.js:
 * 
 * 1. Update the STATE object to include course tracking
 * 2. Modify initSetup() to load course selection
 * 3. Update handleStart() to verify course enrollment
 * 4. Change askNext() to use course-specific questions
 * 5. Update the setup panel to show course selection
 */

// =====================================================================
// 1. ADD TO STATE OBJECT
// =====================================================================

// Add these to the S (STATE) object in mock-interview.js:
const STATE_ADDITIONS = {
    enrolledCourses: [],      // Courses student is enrolled in
    selectedCourse: null,     // Currently selected course for interview
    courseQuestions: [],      // Questions from PDF for this course
    courseQA: [],            // Full Q&A data for preparation
    prepMaterialsReady: false, // Whether prep materials are available
};

// =====================================================================
// 2. NEW FUNCTION: Load Enrolled Courses
// =====================================================================

async function loadEnrolledCourses() {
    try {
        const token = getToken();
        const response = await fetch('http://localhost:5000/api/interview/status', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (!response.ok) {
            console.error('Failed to load courses');
            return;
        }
        
        const courses = await response.json();
        S.enrolledCourses = courses;
        
        // Extract only approved courses for interview
        const approvedCourses = courses.filter(c => c.status === 'approved');
        
        // Update the role select dropdown to show course options
        if (approvedCourses.length > 0) {
            updateCourseSelection(approvedCourses);
            S.courseQA = approvedCourses[0].qa_data || [];
        } else {
            showNoCourseAccessMessage();
        }
    } catch (error) {
        console.error('Error loading enrolled courses:', error);
    }
}

// =====================================================================
// 3. NEW FUNCTION: Update Course Selection UI
// =====================================================================

function updateCourseSelection(approvedCourses) {
    // Create a new section for course selection above role selection
    const setupForm = document.querySelector('.mi-form');
    
    // Check if course selector already exists
    let courseSelectorDiv = document.getElementById('courseSelectorDiv');
    if (!courseSelectorDiv) {
        courseSelectorDiv = document.createElement('div');
        courseSelectorDiv.id = 'courseSelectorDiv';
        courseSelectorDiv.className = 'mi-field';
        setupForm.insertBefore(courseSelectorDiv, setupForm.firstChild);
    }
    
    courseSelectorDiv.innerHTML = `
        <label><i class="fas fa-book"></i> Select Your Course</label>
        <select id="courseSelect" onchange="handleCourseSelection()">
            <option value="">-- Select a Course --</option>
            ${approvedCourses.map(c => `
                <option value="${c.course_name}">${c.course_name} (${c.qa_data ? c.qa_data.length : 0} questions)</option>
            `).join('')}
        </select>
    `;
}

// =====================================================================
// 4. NEW FUNCTION: Handle Course Selection
// =====================================================================

async function handleCourseSelection() {
    const courseSelect = document.getElementById('courseSelect');
    const selectedCourse = courseSelect.value;
    
    if (!selectedCourse) {
        S.selectedCourse = null;
        S.courseQA = [];
        S.prepMaterialsReady = false;
        document.getElementById('startBtn').disabled = true;
        document.getElementById('startBtn').innerHTML = '<i class="fas fa-lock"></i> Select a Course';
        return;
    }
    
    // Find the course in enrolled courses
    const course = S.enrolledCourses.find(c => c.course_name === selectedCourse);
    if (course && course.status === 'approved') {
        S.selectedCourse = selectedCourse;
        S.courseQA = course.qa_data || [];
        S.prepMaterialsReady = true;
        
        // Enable start button and update message
        document.getElementById('startBtn').disabled = false;
        document.getElementById('startBtn').innerHTML = '<i class="fas fa-play"></i> Start Interview';
        
        // Show notification about available questions
        toast(`✅ ${course.qa_data ? course.qa_data.length : 0} interview questions loaded for ${selectedCourse}`, 'success');
    }
}

// =====================================================================
// 5. NEW FUNCTION: Show No Access Message
// =====================================================================

function showNoCourseAccessMessage() {
    const setupForm = document.querySelector('.mi-form');
    setupForm.innerHTML = `
        <div style="text-align: center; padding: 40px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
            <i class="fas fa-lock" style="font-size: 2.5rem; color: #ff6b6b; margin-bottom: 15px;"></i>
            <h3 style="color: #2c3e50; margin: 10px 0;">No Interview Access Yet</h3>
            <p style="color: #666; margin: 10px 0;">
                You haven't been approved for any mock interviews yet.
            </p>
            <p style="color: #666; font-size: 0.9rem;">
                Your enrollment request is pending admin review. You'll receive an email once approved.
            </p>
            <button class="btn btn-secondary" onclick="window.location.href='dashboard.html'" style="margin-top: 20px;">
                <i class="fas fa-arrow-left"></i> Back to Dashboard
            </button>
        </div>
    `;
    
    document.getElementById('startBtn').disabled = true;
    document.getElementById('startBtn').innerHTML = '<i class="fas fa-lock"></i> Awaiting Admin Approval';
}

// =====================================================================
// 6. MODIFY handleStart() - Add Course Verification
// =====================================================================

/**
 * UPDATE THE EXISTING handleStart() FUNCTION:
 * Add these checks before starting:
 */

async function handleStartEnhanced() {
    // NEW: Check course selection
    if (!S.selectedCourse) {
        toast('Please select a course first', 'error');
        document.getElementById('courseSelect').focus();
        return;
    }
    
    // NEW: Verify course approval status
    const course = S.enrolledCourses.find(c => c.course_name === S.selectedCourse);
    if (!course || course.status !== 'approved') {
        toast('This course access is not approved', 'error');
        return;
    }
    
    const role = S.selectedCourse; // Use course name as role
    if (!role) {
        toast('Please select an interview role', 'error');
        return;
    }

    S.role = role;
    S.sessionId = 'mi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    S.currentQ = 0;
    S.questions = [];
    S.askedQuestions = [];
    S.history = [];
    S.interviewId = null;

    const btn = document.getElementById('startBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Setting up...';
    btn.disabled = true;

    // NEW: Load course-specific questions before permission check
    try {
        S.courseQuestions = S.courseQA || [];
        if (S.courseQuestions.length === 0) {
            toast('No questions available for this course', 'error');
            btn.innerHTML = '<i class="fas fa-play"></i> Start Interview';
            btn.disabled = false;
            return;
        }
    } catch (e) {
        console.error('Error loading course questions:', e);
        toast('Failed to load course questions', 'error');
        btn.innerHTML = '<i class="fas fa-play"></i> Start Interview';
        btn.disabled = false;
        return;
    }

    // Show permission modal
    const granted = await showPermissionModal();
    if (!granted) {
        btn.innerHTML = '<i class="fas fa-play"></i> Start Interview';
        btn.disabled = false;
        return;
    }

    // Save session to backend
    try {
        const r = await fetch('http://localhost:5000/api/interview/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + getToken()
            },
            body: JSON.stringify({
                role: S.role,
                level: S.level,
                total_questions: Math.min(S.totalQ, S.courseQuestions.length),
                session_id: S.sessionId,
                course_name: S.selectedCourse // NEW: Send course name
            })
        });
        
        if (r.ok) {
            const d = await r.json();
            S.interviewId = d.interviewId;
        }
    } catch (e) {
        console.error('Session creation error:', e);
    }

    btn.innerHTML = '<i class="fas fa-play"></i> Start Interview';
    btn.disabled = false;

    // Set total questions to available questions count
    S.totalQ = Math.min(S.totalQ, S.courseQuestions.length);

    showInterviewPanel();
    startGlobalTimer();
    startAutoSave();
    
    // NEW: Show course info in interview header
    if (document.getElementById('courseInfoHeader')) {
        document.getElementById('courseInfoHeader').innerHTML = 
            `<i class="fas fa-book"></i> ${S.selectedCourse}`;
    }
    
    setTimeout(() => askNext(), 1600);
}

// =====================================================================
// 7. NEW FUNCTION: Ask Next Question (Course-Based)
// =====================================================================

async function askNextCourseQuestion() {
    if (S.currentQ >= S.totalQ) {
        handleEnd();
        return;
    }

    // Get questions: limit to what we have
    let availableQuestionsIndices = [];
    for (let i = 0; i < S.courseQuestions.length; i++) {
        if (!S.askedQuestions.includes(i)) {
            availableQuestionsIndices.push(i);
        }
    }

    if (availableQuestionsIndices.length === 0) {
        // If we've asked all questions, cycle through them again
        availableQuestionsIndices = Array.from({length: S.courseQuestions.length}, (_, i) => i);
    }

    // Pick a random question from available ones
    const randIdx = availableQuestionsIndices[
        Math.floor(Math.random() * availableQuestionsIndices.length)
    ];

    S.askedQuestions.push(randIdx);
    S.currentQ++;

    // Get the question object from course Q&A
    const qaItem = S.courseQuestions[randIdx];
    const question = qaItem.question || qaItem;
    const expectedAnswer = qaItem.answer || '';

    // Create question object to store
    const q = {
        qNo: S.currentQ,
        question: question,
        expectedAnswer: expectedAnswer,
        answer: '',
        score: 0,
        feedback: ''
    };

    S.questions.push(q);

    // Update UI with progress
    updateQuestionProgress();

    // Display question
    const questionEl = document.getElementById('ivQuestionText');
    if (questionEl) {
        questionEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <span style="font-size: 0.9rem; color: #666;">
                    <strong>Question ${S.currentQ} of ${S.totalQ}</strong>
                </span>
                <span style="background: #e74c3c; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem;">
                    ⏱️ ${MI_CONFIG.questionTimeout}s
                </span>
            </div>
            <p style="font-size: 1.1rem; font-weight: 500; color: #2c3e50; line-height: 1.6;">
                ${question}
            </p>
        `;
    }

    // Clear previous answer
    const answerInput = document.getElementById('ivAnswerInput');
    if (answerInput) answerInput.value = '';

    // Reset word count
    updateWordCount();

    // Start question timer
    startQuestionTimer();

    // Scroll to answer input
    const answerArea = document.querySelector('.mi-answer-area');
    if (answerArea) {
        answerArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Show hint about expected answer length (optional)
    if (expectedAnswer) {
        const hintEl = document.getElementById('answerHint');
        if (hintEl) {
            hintEl.innerHTML = `
                <small style="color: #3498db; font-style: italic;">
                    💡 Tip: Your answer should be around ${expectedAnswer.split(' ').length} words or more
                </small>
            `;
        }
    }
}

// =====================================================================
// 8. NEW FUNCTION: Update Question Progress Display
// =====================================================================

function updateQuestionProgress() {
    const progressEl = document.getElementById('ivProgress');
    if (progressEl) {
        progressEl.innerHTML = `
            <div style="background: #e0e0e0; height: 6px; border-radius: 3px; overflow: hidden;">
                <div style="background: linear-gradient(90deg, #3498db, #2980b9); 
                           height: 100%; width: ${(S.currentQ / S.totalQ) * 100}%;
                           transition: width 0.3s ease;"></div>
            </div>
            <p style="text-align: center; margin-top: 8px; font-size: 0.85rem; color: #666;">
                ${S.currentQ} of ${S.totalQ} questions completed
            </p>
        `;
    }
}

// =====================================================================
// 9. NEW FUNCTION: Evaluate Answer with Course Context
// =====================================================================

async function evaluateAnswerWithContext(question, answer, expectedAnswer) {
    if (!S.geminiKey && !document.body.innerText.includes('Gemini')) {
        // Fallback evaluation if no Gemini key
        return {
            score: Math.min(10, Math.max(1, Math.ceil(answer.split(' ').length / 10))),
            feedback: 'Answer recorded. Review provided materials for better preparation.',
            tech: Math.floor(Math.random() * 5 + 5),
            comm: Math.floor(Math.random() * 5 + 5),
            conf: Math.floor(Math.random() * 5 + 5),
            strengths: ['Answered the question', 'Participated in interview'],
            improvements: ['Use technical terminology', 'Provide more examples']
        };
    }

    // Use Gemini to evaluate with expected answer as reference
    const evaluationPrompt = `
    You are an expert technical interviewer evaluating a candidate's response.
    
    Question: ${question}
    
    Expected Answer (Reference): ${expectedAnswer}
    
    Candidate's Answer: ${answer}
    
    Evaluate the answer and respond with a JSON object containing:
    {
        "score": 1-10,
        "feedback": "Brief feedback on the answer",
        "technical_score": 1-10,
        "communication_score": 1-10,
        "confidence_score": 1-10,
        "strengths": ["strength1", "strength2"],
        "improvements": ["improvement1", "improvement2"]
    }
    
    Focus on how well the candidate answered relative to the expected answer.`;

    try {
        const response = await fetch('http://localhost:5000/api/interview/ai', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + getToken(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt: evaluationPrompt })
        });

        if (response.ok) {
            const data = await response.json();
            const text = data.response || '{}';
            try {
                return JSON.parse(text.replace(/```json|```/g, ''));
            } catch (e) {
                return { score: 5, feedback: 'Answer recorded.' };
            }
        }
    } catch (e) {
        console.error('Evaluation error:', e);
    }

    return { score: 5, feedback: 'Answer recorded.' };
}

// =====================================================================
// 10. MODIFY handleSubmit() - Use Course-Aware Evaluation
// =====================================================================

/**
 * UPDATE handleSubmit() to include:
 */

async function handleSubmitCourseAware() {
    if (S.currentQ === 0 || !S.questions.length) {
        toast('No question to answer yet', 'error');
        return;
    }

    const answerInput = document.getElementById('ivAnswerInput');
    const answer = answerInput.value.trim();

    if (!answer) {
        toast('Please provide an answer', 'error');
        answerInput.focus();
        return;
    }

    const btn = document.getElementById('ivSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Evaluating...';

    const q = S.questions[S.questions.length - 1];
    const expectedAnswer = q.expectedAnswer || '';

    try {
        // NEW: Use course-aware evaluation
        const evaluation = await evaluateAnswerWithContext(q.question, answer, expectedAnswer);

        q.answer = answer;
        q.score = evaluation.score || 5;
        q.feedback = evaluation.feedback || 'Answer recorded.';
        q.tech = evaluation.technical_score || 5;
        q.comm = evaluation.communication_score || 5;
        q.conf = evaluation.confidence_score || 5;
        q.strengths = evaluation.strengths || [];
        q.improvements = evaluation.improvements || [];

        // Save to backend
        if (S.interviewId) {
            try {
                await fetch('http://localhost:5000/api/interview/answer', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + getToken(),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        interview_id: S.interviewId,
                        question_no: S.currentQ,
                        question: q.question,
                        answer: answer,
                        score: q.score,
                        feedback: q.feedback
                    })
                });
            } catch (e) {
                console.warn('Save error:', e);
            }
        }

        // Show feedback
        showAnswerFeedback(q);

        // Move to next question after delay
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-arrow-right"></i> Next Question';
            
            if (S.currentQ < S.totalQ) {
                answerInput.value = '';
                updateWordCount();
                askNextCourseQuestion();
            } else {
                handleEnd();
            }
        }, 3000);
    } catch (e) {
        console.error('Submission error:', e);
        toast('Error evaluating answer', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-arrow-right"></i> Next Question';
    }
}

// =====================================================================
// INTEGRATION INSTRUCTIONS:
// =====================================================================

/**
 * 1. Replace existing "askNext()" calls with "askNextCourseQuestion()"
 * 
 * 2. Replace existing "handleStart()" with "handleStartEnhanced()"
 * 
 * 3. Replace existing "handleSubmit()" with "handleSubmitCourseAware()"
 * 
 * 4. Add to DOMContentLoaded:
 *    loadEnrolledCourses();
 * 
 * 5. Update the setup form HTML to include course selector
 *    (or use the updateCourseSelection() function)
 * 
 * 6. Add CSS for course selection field:
 *    #courseSelectorDiv { order: -1; }
 * 
 * 7. Test thoroughly with multiple courses and Q&A data
 */
