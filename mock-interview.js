'use strict';

// =============================================
// CONFIG
// =============================================
const MI_CONFIG = {
    apiBase:        'https://build-together-backend.onrender.com',
    geminiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    typingSpeed:    22,
    questionTimeout:120,
    maxRetries:     2,
};

// =============================================
// STATE
// =============================================
const S = {
    role:            '',
    level:           'Beginner',
    totalQ:          5,
    currentQ:        0,
    questions:       [],   // { question, answer, score, feedback, tech, comm, conf, strengths, improvements }
    extractedQA:     [],   // Q&A from PDF
    askedQuestions:  [],   // full list to prevent repeats
    sessionId:       null,
    interviewId:     null,
    geminiKey:       '',
    history:         [],   // { question, answer } for context
    assistantScrollId: null,
    assistantAutoScroll: true,
    // timers
    globalTimer:     null,
    globalSecs:      0,
    qTimer:          null,
    qSecs:           0,
    autoSave:        null,
    // media
    cameraStream:    null,
    micStream:       null,
    audioCtx:        null,
    analyser:        null,
    micAnimFrame:    null,
    // voice
    recognition:     null,
    isRecording:     false,
    ttsEnabled:      true,
    sttEnabled:      false,
    // flags
    isTyping:        false,
    interviewActive: false,
    enrolledCourses: [],      // NEW: Courses student is enrolled in
    selectedCourse: null,     // NEW: Currently selected course for interview
    courseQuestions: [],      // NEW: Questions from PDF for this course
    courseQA: [],            // NEW: Full Q&A data for preparation
    prepMaterialsReady: false, // NEW: Whether prep materials are available
};

// =============================================
// DOM HELPERS
// =============================================
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelector(sel);

function getToken() {
    return sessionStorage.getItem('token') || localStorage.getItem('token') || '';
}

function getUserName() {
    return localStorage.getItem('userName') || sessionStorage.getItem('userName') || 'Candidate';
}

function fmt(secs) {
    return String(Math.floor(secs/60)).padStart(2,'0') + ':' + String(secs%60).padStart(2,'0');
}

function timeStr() {
    return new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
}

function esc(t) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(t||''));
    return d.innerHTML;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseQAJson(value) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

// =============================================
// TOAST
// =============================================
function toast(msg, type='info', dur=3500) {
    document.querySelectorAll('.mi-toast').forEach(t=>t.remove());
    const icons = {success:'fa-check-circle',error:'fa-exclamation-circle',info:'fa-info-circle'};
    const el = document.createElement('div');
    el.className = `mi-toast ${type}`;
    el.innerHTML = `<i class="fas ${icons[type]||icons.info}"></i> ${msg}`;
    document.body.appendChild(el);
    setTimeout(()=>{ el.style.animation='toastIn 0.4s ease reverse'; setTimeout(()=>el.remove(),380); }, dur);
}

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    initSetup();
    checkInterviewAccess();
    loadEnrolledCourses();
    loadPastInterviews();
    fetchGeminiKey();
    initHamburger();
    injectLogoutBtn();
});
// =============================================
// LOAD ENROLLED COURSES
// =============================================

function injectLogoutBtn() {
    // Add logout button to navbar-right so student can always logout
    const navRight = document.querySelector('.navbar-right');
    if (!navRight) return;
    const token = getToken();
    if (!token) return;
    // navbar-auth.js handles the user dropdown — we just ensure it's loaded
    // If navAuthArea is empty after 1s, inject a manual logout link
    setTimeout(() => {
        const area = $('navAuthArea');
        if (area && !area.innerHTML.trim()) {
            area.innerHTML = `<button class="mi-logout-btn" onclick="doLogout()">
                <i class="fas fa-sign-out-alt"></i> Logout
            </button>`;
        }
    }, 1200);
}

async function checkInterviewAccess() {
    const res = await fetch(`${MI_CONFIG.apiBase}/api/interview/status`, {
        headers: {'Authorization': 'Bearer ' + getToken()}
    });
    const data = await res.json();
    const allowed = data.filter(d => d.status === 'approved');
    if (allowed.length === 0) {
        $('startBtn').disabled = true;
        $('startBtn').innerHTML = '<i class="fas fa-lock"></i> Awaiting Admin Approval';
        S.extractedQA = [];
    } else {
        const approved = allowed[0];
        S.extractedQA = parseQAJson(approved.qa_json);
    }
}

function doLogout() {
    if (S.interviewActive) {
        if (!confirm('Interview in progress. Logout anyway?')) return;
    }
    stopCamera(); stopMic();
    sessionStorage.clear();
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
    window.location.href = 'apply.html';
}

async function fetchGeminiKey() {
    try {
        const r = await fetch(`${MI_CONFIG.apiBase}/api/interview/config`,{
            headers:{'Authorization':'Bearer '+getToken()}
        });
        if (r.ok) { const d=await r.json(); S.geminiKey=d.geminiKey||''; }
    } catch(e) { /* silent */ }
}

function initHamburger() {
    const h = $('hamburger'), n = $('navLinks');
    if (h && n) h.addEventListener('click', ()=>n.classList.toggle('active'));
}

// =============================================
// SETUP PANEL
// =============================================
function initSetup() {
    // Level buttons
    document.querySelectorAll('.mi-level-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mi-level-btn').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            S.level = btn.dataset.level;
        });
    });
    S.level = 'Beginner';

    // Count buttons
    document.querySelectorAll('.mi-count-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mi-count-btn').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            S.totalQ = parseInt(btn.dataset.count);
        });
    });
    S.totalQ = 5;

    // Start
    $('startBtn').addEventListener('click', handleStartEnhanced);

    // Sync roleSelect changes to support starting by role selection (fallback when no course selected)
    const roleSel = document.getElementById('roleSelect');
    // Save original role options so we can restore later if needed
    if (roleSel && !window.ORIGINAL_ROLE_OPTIONS) window.ORIGINAL_ROLE_OPTIONS = roleSel.innerHTML;
    if (roleSel) {
        roleSel.addEventListener('change', (e) => {
            const val = e.target.value;
            S.role = val || S.role;
            // If courseSelect exists and matches, sync selection
            const cs = document.getElementById('courseSelect');
            if (cs) {
                const opt = Array.from(cs.options).find(o => o.value === val);
                if (opt) {
                    cs.value = val;
                    try { handleCourseSelection(); } catch(_) {}
                } else {
                    S.selectedCourse = null;
                }
            }
        });
    }

    // End
    $('endBtn').addEventListener('click', handleEnd);

    // Submit answer
    $('ivSubmitBtn').addEventListener('click', (e) => {
        // Use course-aware submit when course questions are active
        if (S.selectedCourse && S.courseQuestions && S.courseQuestions.length) return handleSubmitCourseAware();
        return handleSubmit();
    });


    // Ctrl+Enter
    $('ivAnswerInput').addEventListener('keydown', e => {
        if (e.ctrlKey && e.key==='Enter') {
            if (S.selectedCourse && S.courseQuestions && S.courseQuestions.length) handleSubmitCourseAware();
            else handleSubmit();
        }
    });


    // Word count meter
    $('ivAnswerInput').addEventListener('input', updateWordCount);

    // Mic buttons
    $('ivMicBtn').addEventListener('click', toggleVoice);
    const miniMic = $('ivMiniMicBtn');
    if (miniMic) miniMic.addEventListener('click', toggleVoice);
    const textToggle = $('ivTextToggleBtn');
    if (textToggle) textToggle.addEventListener('click', expandAnswerInput);
    const assistantRefresh = $('ivAssistantRefresh');
    if (assistantRefresh) {
        assistantRefresh.addEventListener('click', () => {
            const idx = S.currentQ - 1;
            const q   = S.questions[idx];
            if (q && q.question) loadScriptedAnswer(q.question, S.currentQ, q.expectedAnswer || '');
        });
    }

    // Report buttons
    $('rpRetryBtn').addEventListener('click', handleRetryEnhanced);
    $('rpNewBtn').addEventListener('click', handleNew);
    $('rpPdfBtn').addEventListener('click', handlePdf);
}
// =============================================
// =============================================
// START INTERVIEW (course-aware implementation exists later)
// =============================================

function handleRetryEnhanced() {
    S.selectedCourse = S.selectedCourse || sessionStorage.getItem('selectedInterviewCourse') || S.role;
    handleStartEnhanced();
}

// =============================================
// PERMISSION MODAL — camera + mic required
// =============================================
function showPermissionModal() {
    return new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'mi-perm-modal';
        modal.id = 'permModal';
        modal.innerHTML = `
            <div class="mi-perm-card">
                <div class="mi-perm-icon"><i class="fas fa-shield-alt"></i></div>
                <h3>Camera & Microphone Required</h3>
                <p>This is a real interview simulation. Your camera and microphone must be enabled — just like a real placement interview.</p>
                <div class="mi-perm-items">
                    <div class="mi-perm-item">
                        <i class="fas fa-video"></i>
                        <div class="mi-perm-item-text">
                            <strong>Camera</strong>
                            <small>Shows your live video during the interview</small>
                        </div>
                    </div>
                    <div class="mi-perm-item">
                        <i class="fas fa-microphone"></i>
                        <div class="mi-perm-item-text">
                            <strong>Microphone</strong>
                            <small>Enables voice input for your answers</small>
                        </div>
                    </div>
                </div>
                <button class="mi-perm-allow-btn" id="permAllowBtn">
                    <i class="fas fa-check-circle"></i> Allow & Start Interview
                </button>
                <button class="mi-perm-skip" id="permSkipBtn">Continue without camera/mic</button>
            </div>`;
        document.body.appendChild(modal);

        $('permAllowBtn').addEventListener('click', async () => {
            $('permAllowBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Requesting access...';
            $('permAllowBtn').disabled = true;
            const ok = await initCameraAndMic();
            modal.remove();
            resolve(ok);
        });

        $('permSkipBtn').addEventListener('click', () => {
            modal.remove();
            resolve(true); // allow interview without media
        });
    });
}

// =============================================
// CAMERA + MIC INIT
// =============================================
async function initCameraAndMic() {
    let ok = false;

    // Camera
    try {
        S.cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    facingMode: { ideal: 'user' }
},
            audio: false
        });
        const vid = $('ivCamFeed');
        if (vid) { vid.srcObject = S.cameraStream; await vid.play().catch(()=>{}); }
        $('ivCamDenied').style.display = 'none';
        ok = true;
    } catch(e) {
        console.warn('Camera denied:', e.message);
        $('ivCamDenied').style.display = 'flex';
        toast('Camera access denied. Interview will continue without video.','error',5000);
    }

    // Microphone
    try {
        S.micStream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
        S.sttEnabled = true; // auto-enable voice input since mic is available
        initMicVisualizer();
        ok = true;
    } catch(e) {
        console.warn('Mic denied:', e.message);
        toast('Microphone access denied. Please type your answers.','error',5000);
    }

    return ok;
}

function initMicVisualizer() {
    try {
        S.audioCtx  = new (window.AudioContext||window.webkitAudioContext)();
        S.analyser  = S.audioCtx.createAnalyser();
        S.analyser.fftSize = 32;
        const src = S.audioCtx.createMediaStreamSource(S.micStream);
        src.connect(S.analyser);
        animateMicBars();
    } catch(e) { /* silent */ }
}

function animateMicBars() {
    if (!S.analyser) return;
    const bars = document.querySelectorAll('.iv-mic-bar');
    const data = new Uint8Array(S.analyser.frequencyBinCount);

    function draw() {
        S.micAnimFrame = requestAnimationFrame(draw);
        S.analyser.getByteFrequencyData(data);
        const avg = data.reduce((a,b)=>a+b,0)/data.length;
        bars.forEach((bar, i) => {
            const h = Math.max(4, Math.min(20, (data[i*2]||avg) / 12));
            bar.style.height = h + 'px';
        });
    }
    draw();
}

function stopCamera() {
    if (S.cameraStream) { S.cameraStream.getTracks().forEach(t=>t.stop()); S.cameraStream=null; }
    const v = $('ivCamFeed'); if (v) v.srcObject=null;
}

function stopMic() {
    if (S.micAnimFrame) { cancelAnimationFrame(S.micAnimFrame); S.micAnimFrame=null; }
    if (S.audioCtx)     { S.audioCtx.close().catch(()=>{}); S.audioCtx=null; }
    if (S.micStream)    { S.micStream.getTracks().forEach(t=>t.stop()); S.micStream=null; }
}

// =============================================
// PANEL SWITCHING
// =============================================
function showInterviewPanel() {
    $('setupPanel').style.display    = 'none';
    $('reportPanel').style.display   = 'none';
    $('interviewPanel').style.display = 'flex';
    document.body.classList.add('interview-active');
    S.interviewActive = true;

    // Set meta
    $('ivRole').textContent  = S.role;
    $('ivLevel').textContent = S.level;
    $('ivQPill').textContent = `Q 0/${S.totalQ}`;
    $('ivCamName').textContent = getUserName();

    // Clear chat
    $('ivChat').innerHTML = `
        <div class="iv-chat-welcome">
            <div class="iv-ai-avatar"><i class="fas fa-robot"></i></div>
            <p>Connecting to your AI interviewer...</p>
        </div>`;

    hideAssistantPanel();
    updateProgress(0);
}

function showSetupPanel() {
    $('interviewPanel').style.display = 'none';
    $('reportPanel').style.display    = 'none';
    $('setupPanel').style.display     = 'block';
    document.body.classList.remove('interview-active');
    S.interviewActive = false;
    stopCamera(); stopMic();
    hideAssistantPanel();
    loadPastInterviews();
}

function showReportPanel() {
    $('interviewPanel').style.display = 'none';
    $('setupPanel').style.display     = 'none';
    $('reportPanel').style.display    = 'block';
    document.body.classList.remove('interview-active');
    S.interviewActive = false;
    stopCamera(); stopMic();
    hideAssistantPanel();
}

// =============================================
// TIMERS
// =============================================
function startGlobalTimer() {
    S.globalSecs = 0;
    clearInterval(S.globalTimer);
    S.globalTimer = setInterval(()=>{ S.globalSecs++; }, 1000);
}

function stopGlobalTimer() { clearInterval(S.globalTimer); }

function startQTimer() {
    S.qSecs = MI_CONFIG.questionTimeout;
    clearInterval(S.qTimer);
    updateTimerUI();
    S.qTimer = setInterval(()=>{
        S.qSecs--;
        updateTimerUI();
        if (S.qSecs <= 20) $('ivTimerWrap').classList.add('warning');
        if (S.qSecs <= 0) {
            clearInterval(S.qTimer);
            $('ivTimerWrap').classList.remove('warning');
            toast('Time up! Moving to next question...','info',2500);
            const inp = $('ivAnswerInput');
            if (!inp.value.trim()) inp.value = '[No answer provided]';
            handleSubmit();
        }
    }, 1000);
}

function stopQTimer() {
    clearInterval(S.qTimer);
    $('ivTimerWrap').classList.remove('warning');
}

function updateTimerUI() { $('ivTimer').textContent = fmt(S.qSecs); }

// =============================================
// PROGRESS
// =============================================
function updateProgress(cur) {
    const pct = S.totalQ > 0 ? Math.round((cur/S.totalQ)*100) : 0;
    $('ivProgressFill').style.width = pct+'%';
    $('ivProgressText').textContent = `Question ${cur} of ${S.totalQ}`;
    $('ivProgressPct').textContent  = pct+'%';
    $('ivQPill').textContent        = `Q ${cur}/${S.totalQ}`;
}

// =============================================
// AUTO-SAVE
// =============================================
function startAutoSave() {
    clearInterval(S.autoSave);
    S.autoSave = setInterval(async ()=>{
        if (!S.interviewId || !S.questions.length) return;
        try {
            await fetch(`${MI_CONFIG.apiBase}/api/interview/autosave`,{
                method:'POST',
                headers:{'Content-Type':'application/json','Authorization':'Bearer '+getToken()},
                body: JSON.stringify({interview_id:S.interviewId, questions:S.questions})
            });
        } catch(e) { /* silent */ }
    }, 30000);
}

function stopAutoSave() { clearInterval(S.autoSave); }

// =============================================
// PAST INTERVIEWS
// =============================================
async function loadPastInterviews() {
    const token = getToken();
    if (!token) return;
    try {
        const r = await fetch(`${MI_CONFIG.apiBase}/api/interview/history`,{
            headers:{'Authorization':'Bearer '+token}
        });
        if (!r.ok) return;
        const data = await r.json();
        if (!data.length) return;

        $('pastSection').style.display = 'block';
        $('pastList').innerHTML = '';
        data.slice(0,5).forEach(item => {
            const score = item.final_score ? parseFloat(item.final_score).toFixed(1) : '—';
            const date  = new Date(item.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
            const div   = document.createElement('div');
            div.className = 'mi-past-item';
            div.innerHTML = `
                <div>
                    <div class="mi-past-role">${item.role}</div>
                    <div class="mi-past-meta">
                        <span><i class="fas fa-layer-group"></i> ${item.level}</span>
                        <span><i class="fas fa-calendar"></i> ${date}</span>
                        <span><i class="fas fa-question-circle"></i> ${item.total_questions}Q</span>
                    </div>
                </div>
                <span class="mi-past-score">${score}/10</span>`;
            $('pastList').appendChild(div);
        });
    } catch(e) { /* silent */ }
}

// =============================================
// HANDLE END / RETRY / NEW
// =============================================
function handleEnd() {
    if (!confirm('End the interview and see your report?')) return;
    stopGlobalTimer(); stopQTimer(); stopAutoSave();
    if (!S.questions.length) { showSetupPanel(); return; }
    generateReport();
}

function handleRetry() {
    document.querySelectorAll('.mi-level-btn').forEach(b=>{
        b.classList.toggle('active', b.dataset.level===S.level);
    });
    handleStartEnhanced();
}

function handleNew() {
    S.role = '';
    S.selectedCourse = null;
    S.courseQA = [];
    S.courseQuestions = [];
    S.questions = [];
    S.currentQ = 0;
    S.history = [];
    S.interviewId = null;
    sessionStorage.removeItem('selectedInterviewCourse');
    showSetupPanel();
}

// =============================================
// WORD COUNT METER
// =============================================
function updateWordCount() {
    const text  = $('ivAnswerInput').value.trim();
    const words = text ? text.split(/\s+/).filter(w=>w.length>0).length : 0;
    const bars  = document.querySelectorAll('.iv-wc-bar');
    const label = $('ivWcLabel');

    let filled=0, cls='';
    if (words>=1)  { filled=1; cls=''; }
    if (words>=15) { filled=2; cls=''; }
    if (words>=30) { filled=3; cls='medium'; }
    if (words>=55) { filled=4; cls='good'; }
    if (words>=80) { filled=5; cls='good'; }

    bars.forEach((b,i)=>{
        b.className = 'iv-wc-bar';
        if (i<filled) b.classList.add('filled', cls||'');
    });

    if (label) {
        const labels = ['','Too short','Brief','Good','Detailed','Comprehensive ✓'];
        label.textContent = words>0 ? `${words} words${filled>0?' — '+labels[filled]:''}` : '0 words';
        label.style.color = filled>=4?'#10b981':filled>=3?'#f59e0b':filled>=1?'#ef4444':'rgba(255,255,255,0.4)';
    }

    const wc = $('ivWordCount');
    if (wc) wc.style.display = 'flex';
}

// =============================================
// KEYBOARD SHORTCUTS
// =============================================
document.addEventListener('keydown', e=>{
    if (e.key==='Escape' && S.interviewActive) handleEnd();
});

window.addEventListener('beforeunload', e=>{
    if (S.interviewActive && S.questions.length>0) {
        e.preventDefault();
        e.returnValue = 'Interview in progress. Are you sure you want to leave?';
    }
});

// =============================================
// GEMINI AI — CORE CALL
// =============================================
async function callGemini(prompt) {
    // Try direct API first if key available
    if (S.geminiKey) {
        for (let attempt=0; attempt<=MI_CONFIG.maxRetries; attempt++) {
            try {
                const r = await fetch(`${MI_CONFIG.geminiEndpoint}?key=${S.geminiKey}`,{
                    method:'POST',
                    headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({
                        contents:[{parts:[{text:prompt}]}],
                        generationConfig:{temperature:0.85,maxOutputTokens:1024,topP:0.9}
                    })
                });
                if (!r.ok) throw new Error('Gemini API '+r.status);
                const d = await r.json();
                const txt = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()||'';
                if (txt) return txt;
            } catch(e) {
                if (attempt===MI_CONFIG.maxRetries) break;
                await sleep(1000*(attempt+1));
            }
        }
    }
    // Fallback: backend proxy
    return callGeminiProxy(prompt);
}

async function callGeminiProxy(prompt) {
    try {
        const r = await fetch(`${MI_CONFIG.apiBase}/api/interview/ai`,{
            method:'POST',
            headers:{'Content-Type':'application/json','Authorization':'Bearer '+getToken()},
            body: JSON.stringify({prompt})
        });
        if (!r.ok) throw new Error('Proxy failed');
        const d = await r.json();
        return d.response||'';
    } catch(e) {
        console.error('AI proxy error:', e.message);
        return '';
    }
}

function parseJSON(text) {
    try {
        return JSON.parse(text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim());
    } catch(_) {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) try { return JSON.parse(m[0]); } catch(_) {}
        return null;
    }
}

// =============================================
// QUESTION PROMPTS — strict repeat prevention
// =============================================
function buildQ1Prompt() {
    return `You are a senior technical interviewer at a top tech company conducting a real placement interview.

Candidate Role: ${S.role}
Difficulty: ${S.level}

Ask the VERY FIRST interview question. Rules:
- ONE specific, targeted question only
- Beginner: core fundamentals/concepts
- Intermediate: practical application/scenario-based
- Advanced: system design/architecture/deep-dive
- Start with ONE natural greeting sentence (e.g. "Welcome! Let's begin.")
- Then ask the question
- End with "?"
- Do NOT say "Question 1", do NOT number it
- Make it UNIQUE and specific to ${S.role}

Respond with ONLY the greeting + question. Nothing else.`;
}

function buildNextQPrompt(prevAnswer, qNum) {
    const historyText = S.history.map((h,i)=>`Q${i+1}: ${h.question}\nAnswer: ${h.answer}`).join('\n\n');
    const askedText   = S.askedQuestions.map((q,i)=>`${i+1}. ${q}`).join('\n');
    const stage = qNum <= Math.ceil(S.totalQ / 3)
        ? 'early'
        : qNum <= Math.ceil(2 * S.totalQ / 3)
            ? 'mid'
            : 'late';

    return `You are a senior technical interviewer for ${S.role} (${S.level} level).

=== INTERVIEW HISTORY ===
${historyText}

=== PREVIOUS QUESTIONS (NEVER REPEAT OR ASK SIMILAR TOPICS) ===
${askedText}

=== CANDIDATE'S LAST ANSWER ===
"${prevAnswer}"

=== YOUR MISSION ===
Ask question ${qNum} of ${S.totalQ}.

Guidance:
- In the ${stage} stage of the interview, choose a question that fits the session flow.
- Maintain a realistic mix of technical, behavioral, situational, and project-based questions for ${S.role}.
- Ensure questions progress naturally from basic to more advanced content across the session.
- Avoid duplicate or similar phrasing to any prior question.
- Use the role context to keep the question relevant and specific.

Decision logic:
- If the candidate's answer was incomplete or vague → ask a targeted follow-up on the same topic.
- If the answer was complete → move to a completely different topic.

STRICT RULES:
1. YOUR RESPONSE MUST BE EXACTLY ONE QUESTION AND NOTHING ELSE.
2. DO NOT REPEAT ANY TOPIC, CONCEPT, OR QUESTION LISTED IN THE "PREVIOUS QUESTIONS" SECTION.
3. DO NOT ASK SIMILAR QUESTIONS. EXPLORE A NEW TECHNICAL AREA OR BEHAVIORAL SCENARIO.
4. DO NOT MENTION THE QUESTION NUMBER OR GIVE FEEDBACK.
5. ENSURE THE DIFFICULTY MATCHES THE ${S.level} LEVEL.
6. DO NOT USE ANY PREAMBLE OR GREETINGS.
7. END THE SENTENCE WITH A QUESTION MARK "?".

Respond with ONLY the question. Nothing else.`;
}

function buildEvalPrompt(question, answer) {
    return `You are evaluating a candidate's interview answer. Be STRICT and ACCURATE — do NOT default to score 5.

Role: ${S.role} | Level: ${S.level}
Question: "${question}"
Answer: "${answer}"

Evaluate honestly. Respond in this EXACT JSON (no markdown):
{
  "score": <integer 1-10>,
  "technical_score": <integer 0-100>,
  "communication_score": <integer 0-100>,
  "confidence_score": <integer 0-100>,
  "brief_feedback": "<2 sentences: what was good and what was missing>",
  "strengths": ["<specific strength>", "<specific strength>"],
  "improvements": ["<specific improvement>", "<specific improvement>"]
}

SCORING GUIDE (be strict):
- 1-2: No answer / completely wrong
- 3-4: Very incomplete, major gaps
- 5-6: Partial answer, some correct points but missing key concepts
- 7-8: Good answer, mostly correct with minor gaps
- 9-10: Excellent, comprehensive, with examples

confidence_score: based on answer length, specificity, use of examples (short vague = low)
communication_score: based on clarity, structure, coherence
technical_score: based on correctness and depth of technical content

If answer is "[No answer provided]" → score must be 1, all scores 0.`;
}

function buildReportPrompt() {
    const qa = S.questions.map((q,i)=>`Q${i+1}: ${q.question}\nAnswer: ${q.answer}\nScore: ${q.score}/10`).join('\n\n');
    return `Generate a final interview performance report.

Role: ${S.role} | Level: ${S.level}
Q&A:
${qa}

Respond in this EXACT JSON (no markdown):
{
  "overall_score": <number 1-10, weighted average>,
  "technical_score": <integer 0-100>,
  "communication_score": <integer 0-100>,
  "confidence_score": <integer 0-100>,
  "strengths": ["<strength 1>","<strength 2>","<strength 3>"],
  "weaknesses": ["<weakness 1>","<weakness 2>","<weakness 3>"],
  "suggestions": ["<actionable suggestion 1>","<actionable suggestion 2>","<actionable suggestion 3>","<actionable suggestion 4>"],
  "summary": "<3 sentences: overall performance, key strengths, main areas to improve>"
}`;
}

// =============================================
// FALLBACK QUESTIONS (if AI fails)
// =============================================
const FALLBACKS = {
    'Frontend Developer':    ['Explain the difference between CSS Flexbox and Grid layout.','What is the Virtual DOM in React and why does it improve performance?','How do you handle cross-browser compatibility issues?','What are Web Vitals and how do you optimize them?','Explain event delegation in JavaScript.'],
    'Backend Developer':     ['What is the difference between REST and GraphQL?','How do you handle database transactions to ensure data consistency?','Explain the concept of middleware in Express.js.','What is connection pooling and why is it important?','How do you secure a REST API?'],
    'Full Stack Developer':  ['How do you manage state in a full stack application?','What is CORS and how do you handle it?','Explain the MVC architecture pattern.','How do you handle authentication with JWT?','What is the difference between SQL and NoSQL databases?'],
    'Java Developer':        ['What is the difference between abstract class and interface in Java?','Explain the Java memory model and garbage collection.','What are design patterns? Name three you have used.','What is multithreading and how do you handle thread safety?','Explain Spring Boot auto-configuration.'],
    'Python Developer':      ['What is the difference between a list and a tuple in Python?','Explain Python decorators with an example.','What is the GIL in Python and how does it affect multithreading?','How does Python manage memory?','What are Python generators and when would you use them?'],
    'UI/UX Designer':        ['What is the difference between UI and UX design?','Explain your design process from research to final prototype.','How do you conduct user research and usability testing?','What is a design system and why is it important?','How do you handle accessibility in your designs?'],
    'Data Scientist':        ['What is the difference between supervised and unsupervised learning?','Explain overfitting and how you prevent it.','What is cross-validation and why is it used?','Explain the bias-variance tradeoff.','How do you handle missing data in a dataset?'],
    'DevOps Engineer':       ['What is the difference between Docker and a virtual machine?','Explain CI/CD pipeline and its benefits.','What is Kubernetes and what problem does it solve?','How do you monitor application performance in production?','What is infrastructure as code?'],
    'HR Round':              ['Tell me about a challenging situation you faced and how you resolved it.','Where do you see yourself in 5 years?','What are your greatest strengths and weaknesses?','Why do you want to work at this company?','How do you handle working under pressure?'],
    'default':               ['Tell me about your most challenging technical project.','How do you stay updated with the latest technology trends?','Describe a time you had to learn a new technology quickly.','How do you approach debugging a complex issue?','What is your development workflow?']
};

const SCRIPTED_ANSWER_MAP = {
    'Frontend Developer': [
        {
            test: q => /flexbox/i.test(q) && /grid/i.test(q),
            answer: 'I use Flexbox for one-dimensional layouts like navigation bars, buttons, and cards where items need to flow in a row or column, while I use Grid for more complex two-dimensional page layouts that require precise control over rows and columns. For example, on a recent dashboard I used Grid to define the overall panel structure and Flexbox inside each card to align icons, text, and buttons responsively.'
        },
        {
            test: q => /virtual dom/i.test(q) || /react/i.test(q),
            answer: 'The Virtual DOM is a lightweight copy of the real DOM that React keeps in memory. React updates the Virtual DOM first, compares it against the previous version, and only applies the smallest possible changes to the real DOM. This reduces browser reflows and makes rendering faster, especially in dynamic interfaces.'
        },
        {
            test: q => /cross-browser/i.test(q) || /compatibility/i.test(q),
            answer: 'I start with progressive enhancement and standard CSS features, then test in multiple browsers and use feature detection. I also keep a small compatibility layer with CSS fallbacks or polyfills for older browsers, and I prefer tools like PostCSS and Autoprefixer so styling works consistently across environments.'
        },
        {
            test: q => /web vitals/i.test(q) || /optimize/i.test(q),
            answer: 'Web Vitals measure real user experience through metrics like Largest Contentful Paint, First Input Delay, and Cumulative Layout Shift. I optimize them by lazy-loading images, minimizing render-blocking scripts, using efficient caching, and ensuring layout elements reserve space so the page feels fast and stable.'
        },
        {
            test: q => /event delegation/i.test(q),
            answer: 'Event delegation means attaching a single event listener to a parent element and processing events from child elements as they bubble up. This reduces the number of listeners, improves performance for dynamic lists, and keeps the DOM easier to manage because new elements do not need individual handlers.'
        }
    ],
    'Backend Developer': [
        {
            test: q => /rest/i.test(q) && /graphql/i.test(q),
            answer: 'REST is a resource-based API style that uses standard HTTP methods and structured endpoints, while GraphQL lets clients request exactly the data they need through a single query endpoint. I choose REST for simple CRUD services and GraphQL when clients need flexible queries and to reduce over-fetching in complex data models.'
        },
        {
            test: q => /transactions/i.test(q) && /consistency/i.test(q),
            answer: 'I use database transactions to group related operations into a single unit of work so they either all succeed or all fail. In relational databases I begin a transaction, perform inserts or updates, and commit only after validation, rolling back immediately if any step fails to keep data consistent.'
        },
        {
            test: q => /middleware/i.test(q) && /express/i.test(q),
            answer: 'Middleware in Express is a function that runs during request processing, usually to authenticate users, parse JSON, or log activity. It allows me to keep common behavior in reusable layers before the final route handler executes.'
        },
        {
            test: q => /connection pooling/i.test(q),
            answer: 'Connection pooling reuses a set of existing database connections instead of opening a new one for each request. This improves performance and stability by reducing connection overhead and preventing the database from being overwhelmed by too many concurrent connections.'
        },
        {
            test: q => /secure/i.test(q) && /rest api/i.test(q),
            answer: 'To secure a REST API I use HTTPS, validate input, authenticate requests with tokens or JWTs, enforce role-based access control, and protect against injection attacks by using parameterized queries and sanitization. I also rate-limit sensitive endpoints and use strong security headers.'
        }
    ],
    'Full Stack Developer': [
        {
            test: q => /state/i.test(q) || /manage state/i.test(q),
            answer: 'For full stack applications, I manage state by keeping the source of truth on the client and server in sync. I use a combination of local component state and central stores on the front end, while ensuring APIs return the exact data needed so the UI stays consistent and responsive.'
        },
        {
            test: q => /cors/i.test(q),
            answer: 'CORS is about allowing the browser to request resources from another origin safely. I handle it by configuring the server to send the correct Access-Control-Allow-Origin header, and I make sure the front-end requests include the right credentials only when necessary.'
        },
        {
            test: q => /mvc/i.test(q),
            answer: 'MVC helps separate concerns by keeping models, views, and controllers distinct. I use it to keep the server-side logic organized, so the data layer, business rules, and presentation are easier to maintain and scale.'
        },
        {
            test: q => /jwt/i.test(q) || /authentication/i.test(q),
            answer: 'For authentication with JWT, I issue a signed token after the user logs in, then validate that token on each request. This gives me a stateless and scalable way to keep users authenticated across the front end and backend without storing session data on the server.'
        },
        {
            test: q => /sql/i.test(q) && /nosql/i.test(q),
            answer: 'SQL is great for structured data and strong relationships, while NoSQL is better for flexible schemas and high scalability. I choose SQL when I need consistent transactions and joins, and NoSQL when I need to store large volumes of semi-structured data quickly.'
        }
    ],
    'Java Developer': [
        {
            test: q => /abstract class/i.test(q) && /interface/i.test(q),
            answer: 'An abstract class can contain both concrete and abstract methods, while an interface defines behavior without implementation. I use interfaces when I need multiple types to share a contract, and abstract classes when I want shared base functionality plus common fields for a related group of subclasses.'
        },
        {
            test: q => /memory model/i.test(q) || /garbage collection/i.test(q),
            answer: 'The Java memory model separates heap, stack, and method areas, and garbage collection automatically reclaims objects that are no longer reachable. I rely on GC to manage memory in most cases, while optimizing object creation and avoiding memory leaks through careful resource handling and closing streams.'
        },
        {
            test: q => /design patterns/i.test(q),
            answer: 'I use design patterns like Singleton, Factory, and Strategy to keep code modular and reusable. They help me structure complex applications so each part has a clear responsibility and the code is easier to extend.'
        },
        {
            test: q => /multithreading/i.test(q) || /thread safety/i.test(q),
            answer: 'In multithreaded Java code, I use synchronization and concurrent utilities like ExecutorService to manage threads safely. I also avoid shared mutable state when possible and prefer immutable data structures so the program stays predictable under load.'
        }
    ],
    'Python Developer': [
        {
            test: q => /list/i.test(q) && /tuple/i.test(q),
            answer: 'A list in Python is mutable, so I can add or remove items, while a tuple is immutable and stays fixed after creation. I usually use tuples for fixed collections of values and lists when I need to modify the data during processing.'
        },
        {
            test: q => /decorator/i.test(q),
            answer: 'A Python decorator wraps a function to extend its behavior without changing the original function body. I use decorators to add logging, validation, or timing around existing functions in a clean and reusable way.'
        },
        {
            test: q => /gil/i.test(q) || /global interpreter lock/i.test(q),
            answer: 'The GIL means only one thread executes Python bytecode at a time, so CPU-bound threads do not run in parallel. I avoid this by using multiprocessing for CPU-intensive work and using threads only for I/O-bound tasks.'
        },
        {
            test: q => /memory/i.test(q) && /python/i.test(q),
            answer: 'Python manages memory with reference counting and a garbage collector for cyclic references. I write code that avoids unnecessary object creation and I close files and network connections explicitly so the runtime can reclaim resources promptly.'
        },
        {
            test: q => /generator/i.test(q),
            answer: 'Generators let me produce values lazily one at a time, which is useful for streaming large datasets without loading everything into memory. I use them when I need a simple iterator that only computes values on demand.'
        }
    ],
    'UI/UX Designer': [
        {
            test: q => /ui and ux/i.test(q) || /difference between ui and ux/i.test(q),
            answer: 'UI is the visual and interactive layer users see, while UX is the overall feel and experience they have using the product. I design interfaces that not only look good but also make interactions intuitive and satisfying.'
        },
        {
            test: q => /design process/i.test(q),
            answer: 'My design process starts with research, then moves into sketching and prototyping before testing. I keep the user’s needs at the center so the final design feels both usable and delightful.'
        },
        {
            test: q => /user research/i.test(q) || /usability testing/i.test(q),
            answer: 'I conduct user research by talking to real users and observing how they interact with prototypes. After testing, I use the feedback to refine the design and make sure it solves real problems clearly.'
        },
        {
            test: q => /design system/i.test(q),
            answer: 'A design system gives teams a shared language of components, colors, and spacing so products stay consistent. I use it to speed up design work and make sure every screen feels like part of the same brand.'
        },
        {
            test: q => /accessibility/i.test(q),
            answer: 'I prioritize accessibility by using clear contrast, readable typography, and keyboard-friendly navigation. That way the product works better for everyone, including people with disabilities.'
        }
    ],
    'Data Scientist': [
        {
            test: q => /supervised/i.test(q) && /unsupervised/i.test(q),
            answer: 'Supervised learning uses labeled data to teach a model the correct output, while unsupervised learning finds patterns in unlabeled data. I use supervised methods when I have clear targets and unsupervised methods to explore structure or clusters in the data.'
        },
        {
            test: q => /overfitting/i.test(q),
            answer: 'Overfitting happens when a model learns the noise in the training data instead of the real patterns. I prevent it by using validation data, regularization, and simpler models when appropriate.'
        },
        {
            test: q => /cross-validation/i.test(q),
            answer: 'Cross-validation helps me test a model on different subsets of the data so I can estimate how it will perform on unseen examples. It gives me more confidence that the model is generalizing rather than just memorizing the training set.'
        },
        {
            test: q => /bias.*variance/i.test(q) || /variance.*bias/i.test(q),
            answer: 'The bias-variance tradeoff is about balancing a model that is too simple against one that is too complex. I aim for a solution that fits the data well without overfitting, usually by tuning model complexity and using validation metrics.'
        },
        {
            test: q => /missing data/i.test(q) || /handle missing/i.test(q),
            answer: 'I handle missing data by understanding why it is missing and then choosing the right approach, such as imputation, removing rows, or using models that handle gaps naturally. The key is to preserve the integrity of the data while keeping the model reliable.'
        }
    ],
    'DevOps Engineer': [
        {
            test: q => /docker/i.test(q) && /virtual machine/i.test(q),
            answer: 'Docker containers package applications with their dependencies, while virtual machines include a full operating system. I use containers for lightweight, portable deployments and VMs when I need stronger isolation or a full OS environment.'
        },
        {
            test: q => /ci\/cd/i.test(q) || /pipeline/i.test(q),
            answer: 'A CI/CD pipeline automates building, testing, and deploying code so changes reach production faster and more safely. I set up pipelines that catch issues early and make deployments repeatable with minimal manual steps.'
        },
        {
            test: q => /kubernetes/i.test(q),
            answer: 'Kubernetes helps manage containerized applications across multiple machines by automating deployment, scaling, and recovery. I use it when applications need to run reliably at scale and when I want to avoid manual container orchestration.'
        },
        {
            test: q => /monitor/i.test(q) && /performance/i.test(q),
            answer: 'I monitor application performance with tools that track metrics like latency, error rate, and resource usage. That lets me catch issues quickly and keep systems running smoothly under real user load.'
        },
        {
            test: q => /infrastructure as code/i.test(q) || /iac/i.test(q),
            answer: 'Infrastructure as code means defining infrastructure with files and version control instead of manual setup. I use it to keep environments consistent, make changes auditable, and automate deployment across teams.'
        }
    ],
    'HR Round': [
        {
            test: q => /challenging situation/i.test(q),
            answer: 'I faced a tight deadline while our team was missing a key dependency. I prioritized the most critical tasks, communicated the new timeline clearly, and asked for help from a teammate with complementary experience. In the end, we delivered the project on time and kept the client informed at every step.'
        },
        {
            test: q => /5 years/i.test(q),
            answer: 'In five years I see myself taking on more responsibility in a collaborative team, deepening my technical skills, and contributing to projects that help users solve real problems. I want to keep learning and grow into a role where I can mentor others and influence product quality.'
        },
        {
            test: q => /strengths.*weaknesses/i.test(q),
            answer: 'My greatest strength is my ability to learn quickly and stay organized under pressure. A weakness I am improving is saying yes to too many tasks, so I now prioritize work more intentionally and communicate clearly when I need focused time.'
        },
        {
            test: q => /why.*company/i.test(q) || /why.*work/i.test(q),
            answer: 'I am excited about this company because of the meaningful problems you solve and the collaborative culture reflected in your team. I want to contribute my skills to help deliver strong results while continuing to grow professionally.'
        },
        {
            test: q => /pressure/i.test(q),
            answer: 'When I work under pressure, I stay calm, break the task into smaller pieces, and communicate clearly with my team. That helps me keep progress steady and stay focused on the most important outcomes.'
        }
    ],
    'default': [
        {
            test: q => /most challenging technical project/i.test(q),
            answer: 'I worked on a project that required integrating multiple services into a single user workflow. I started by breaking the work into smaller components, designed clear APIs, and tested each piece independently. The result was a stable system that improved user efficiency and was easier to maintain.'
        },
        {
            test: q => /learned a new technology/i.test(q),
            answer: 'When I needed to learn a new technology quickly, I focused on the core concepts first and built a small prototype to apply what I learned. That hands-on approach helped me understand the tool faster and made it easier to use in the real project.'
        }
    ]
};

function getFallback() {
    const pool = FALLBACKS[S.role] || FALLBACKS['default'];
    // Filter out already asked questions
    const unused = pool.filter(q => {
        const qLower = q.toLowerCase().trim();
        return !S.askedQuestions.some(asked => {
            const aLower = asked.toLowerCase();
            return aLower.includes(qLower.slice(0, 25)) || qLower.includes(aLower.slice(0, 25));
        });
    });
    
    const list = unused.length ? unused : [
        "Can you discuss a time you had to optimize code for better performance?",
        "How do you handle technical disagreements within a development team?",
        "What is your approach to learning a completely new technology under a tight deadline?",
        "Can you explain the most complex bug you've ever solved?",
        "How do you ensure your code is maintainable and well-documented?"
    ];
    return list[Math.floor(Math.random()*list.length)];
}

function normalizeQuestion(question) {
    return question
        .toLowerCase()
        .replace(/^\s*\d+\.\s*/, '')
        .replace(/\s+/g, ' ')
        .replace(/[?.!]+$/, '')
        .replace(/^(can you|could you|please|tell me|explain|describe|define|what is|what are|what's|how do you|how would you|why do you|why are|why is|when do you|where do you)/i, '')
        .trim();
}

function isDuplicateQuestion(question) {
    const normalized = normalizeQuestion(question);
    if (!normalized) return true;

    for (const asked of S.askedQuestions) {
        const prev = normalizeQuestion(asked);
        if (!prev) continue;
        if (normalized === prev) return true;
        if (normalized.includes(prev) || prev.includes(normalized)) return true;
        const small = normalized.length < prev.length ? normalized : prev;
        if (small.length > 30 && (prev.includes(small) || normalized.includes(small))) return true;
    }
    return false;
}

async function generateQuestion(qNum) {
    const maxAttempts = 4;
    let qText = '';
    let attempts = 0;
    let regenCount = 0;
    let lastAnswer = S.questions[S.questions.length - 1]?.answer || '';

    while (attempts < maxAttempts) {
        attempts += 1;
        try {
            qText = S.currentQ === 0
                ? await callGemini(buildQ1Prompt())
                : await callGemini(buildNextQPrompt(lastAnswer, qNum));
        } catch (e) {
            qText = '';
        }

        qText = (qText || '').trim();
        if (!qText) qText = getFallback();
        if (qText && !/[?]$/.test(qText.trim())) {
            qText = qText.replace(/[.!]+$/, '').trim() + '?';
        }

        const duplicate = isDuplicateQuestion(qText);
        console.log(`[MI] Generated question attempt ${attempts} for Q${qNum}:`, qText);
        console.log('[MI] Previously asked questions:', S.askedQuestions);
        console.log('[MI] Duplicate detected:', duplicate);

        if (!duplicate) {
            console.log(`[MI] Final question selected for Q${qNum} after ${attempts} attempt(s).`);
            break;
        }

        regenCount += 1;
        console.warn(`[MI] Duplicate question detected for Q${qNum}, regenerating... (${regenCount})`);
        if (attempts < maxAttempts) {
            await sleep(600);
            continue;
        }

        qText = getFallback();
        if (!isDuplicateQuestion(qText)) break;
        qText = `${qText} ?`;
        break;
    }

    console.log(`[MI] Regenerated question count for Q${qNum}:`, regenCount);
    return qText;
}

// =============================================
// QUESTION FLOW
// =============================================
async function askNext() {
    const qNum = S.currentQ + 1;

    if (qNum > S.totalQ) {
        stopQTimer();
        await showAIMsg('Excellent work completing all questions! Generating your detailed performance report now...', false);
        await sleep(1200);
        generateReport();
        return;
    }

    const typId = showTyping();
    let qText = await generateQuestion(qNum);

    if (!qText) qText = getFallback();

    // Track to prevent repeats
    S.askedQuestions.push(qText);

    removeTyping(typId);

    S.currentQ = qNum;
    S.questions.push({ question:qText, answer:'', score:0, feedback:'', tech:50, comm:50, conf:50, strengths:[], improvements:[] });

    updateProgress(qNum);
    await showAIMsg(qText, true, qNum);
    showAnswerArea();
    stopQTimer();
    startQTimer();
    loadScriptedAnswer(qText, qNum);

    // Auto-start voice if mic available
    if (S.sttEnabled && S.micStream) {
        await sleep(800);
        startVoiceInput();
    }

    if (S.ttsEnabled) speakText(qText);
}

// =============================================
// CHAT RENDERING
// =============================================
async function showAIMsg(text, showBadge=false, qNum=null) {
    const chat = $('ivChat');
    const welcome = chat.querySelector('.iv-chat-welcome');
    if (welcome) welcome.remove();

    chat.querySelectorAll('.iv-msg').forEach(old => {
        old.classList.add('fade-out');
        setTimeout(() => old.remove(), 360);
    });

    const div = document.createElement('div');
    div.className = 'iv-msg ai-msg';

    const badge = showBadge && qNum
        ? `<div class="iv-q-badge"><i class="fas fa-question"></i> Question ${qNum} of ${S.totalQ}</div>`
        : '';

    div.innerHTML = `
        <div class="iv-msg-avatar"><i class="fas fa-robot"></i></div>
        <div class="iv-msg-content">
            ${badge}
            <div class="iv-msg-bubble" id="bbl_${Date.now()}"></div>
            <span class="iv-msg-time">${timeStr()}</span>
        </div>`;

    chat.appendChild(div);
    scrollChat();

    const bubble = div.querySelector('.iv-msg-bubble');
    await typeText(bubble, text);
    return div;
}

function loadScriptedAnswer(question, qNum, expectedAnswer = '') {
    const role = S.role || 'Candidate';

    if (expectedAnswer && expectedAnswer.trim()) {
        showAssistantPanel(expectedAnswer.trim(), question, qNum);
        return;
    }

    const fallback = getScriptedAnswerFallback(question, role);
    showAssistantPanel(fallback, question, qNum);

    const prompt = buildScriptedAnswerPrompt(question, role, qNum);
    callGemini(prompt).then(answer => {
        if (answer && answer.trim()) {
            showAssistantPanel(answer.trim(), question, qNum);
        }
    }).catch(console.warn);
}

function showAssistantPanel(text, question, qNum) {
    const panel = $('ivAssistant');
    if (!panel) return;
    panel.style.display = 'flex';
    $('ivAssistantRole').textContent = S.role || 'Candidate';
    $('ivAssistantQno').textContent = `Sample Answer · Q ${qNum}`;
    const container = $('ivAssistantText');
    if (!container) return;
    container.textContent = text;
    container.scrollTop = 0;
    stopAssistantScroll();
    startAssistantScroll();
}

function hideAssistantPanel() {
    const panel = $('ivAssistant');
    if (!panel) return;
    panel.style.display = 'none';
    stopAssistantScroll();
}

function startAssistantScroll() {
    const container = $('ivAssistantText');
    if (!container || !S.assistantAutoScroll) return;
    const speed = 0.18;
    function tick() {
        if (!container) return;
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
            S.assistantScrollId = null;
            return;
        }
        container.scrollTop += speed;
        S.assistantScrollId = requestAnimationFrame(tick);
    }
    S.assistantScrollId = requestAnimationFrame(tick);
}

function stopAssistantScroll() {
    if (S.assistantScrollId) {
        cancelAnimationFrame(S.assistantScrollId);
        S.assistantScrollId = null;
    }
}

function buildScriptedAnswerPrompt(question, role, qNum) {
    const safeQuestion = question ? question.trim() : 'the current interview question';
    return `You are a job candidate interviewing for a ${role} role. Answer ONLY the current interview question below in one complete spoken-paragraph. Do not repeat or reuse any previous scripted answer. Make this response unique, directly match the meaning of the question, and keep it concise, professional, and realistic for a 30-60 second spoken response.\n\nCurrent question:\n${safeQuestion}\n\nWrite in the first person, without bullet points, instructions, or stage directions. Avoid generic role descriptions and focus on the specific topic asked.`;
}

function getScriptedAnswerFallback(question, role) {
    const answerPool = SCRIPTED_ANSWER_MAP[role] || SCRIPTED_ANSWER_MAP.default;
    for (const item of answerPool) {
        if (item.test(question)) return item.answer;
    }

    return buildQuestionAwareScriptedAnswerFallback(question, role);
}

function buildQuestionAwareScriptedAnswerFallback(question, role) {
    const cleaned = question.trim().replace(/\?+$/, '').replace(/\s+/g, ' ').trim();
    const core = cleaned.replace(/^(what is|what are|what's|explain|describe|define|how do you|how would you|how can you|why|tell me|can you|have you|do you|when do you|where do you|why is|why are)/i, '').trim() || cleaned;
    let verb = 'address';
    if (/^(how do you|how would you|how can you|how should you)/i.test(cleaned)) verb = 'approach';
    else if (/^(why|what makes|why is|why are)/i.test(cleaned)) verb = 'explain';
    else if (/^(what is|what are|what's|explain|describe|define)/i.test(cleaned)) verb = 'describe';

    return `As a ${role}, I ${verb} ${core} directly and keep the answer focused on the current question. I explain my practical approach clearly and keep the response concise, conversational, and relevant to the interviewer’s request.`;
}

function showUserMsg(text) {
    // Minimal interview UI: keep the camera overlay clear and focus on the current AI prompt.
    console.log('[MI] User answer hidden in minimal overlay UI:', text);
}

function showFeedbackMsg(feedback, score) {
    const color = score>=7?'#10b981':score>=4?'#f59e0b':'#ef4444';
    const icon  = score>=7?'fa-check-circle':score>=4?'fa-info-circle':'fa-times-circle';
    const div   = document.createElement('div');
    div.className = 'iv-msg ai-msg';
    div.innerHTML = `
        <div class="iv-msg-avatar" style="background:${color}22;color:${color};border:2px solid ${color}44;">
            <i class="fas ${icon}"></i>
        </div>
        <div class="iv-msg-content">
            <div class="iv-feedback-bubble">
                <span class="iv-fb-score">Score: ${score}/10</span> — ${esc(feedback)}
            </div>
        </div>`;
    $('ivChat').appendChild(div);
    scrollChat();
}

function showAnswerFeedback(question) {
    const score = typeof question?.score === 'number' ? question.score : 5;
    const feedback = question?.feedback || 'Answer recorded.';
    showFeedbackMsg(feedback, score);
}

async function typeText(el, text) {
    S.isTyping = true;
    el.textContent = '';
    for (let i=0; i<text.length; i++) {
        el.textContent += text[i];
        scrollChat();
        await sleep(MI_CONFIG.typingSpeed);
    }
    S.isTyping = false;
}

function showTyping() {
    const id  = 'typ_'+Date.now();
    const div = document.createElement('div');
    div.className = 'iv-typing'; div.id = id;
    div.innerHTML = `
        <div class="iv-msg-avatar" style="background:var(--mi-grad);color:white;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.95rem;flex-shrink:0;">
            <i class="fas fa-robot"></i>
        </div>
        <div class="iv-typing-dots"><span></span><span></span><span></span></div>`;
    $('ivChat').appendChild(div);
    scrollChat();
    return id;
}

function removeTyping(id) { const el=$(id); if(el) el.remove(); }

function scrollChat() {
    const c = $('ivChat');
    if (c) c.scrollTop = c.scrollHeight;
}

function showAnswerArea() {
    const area = $('ivAnswerArea');
    if (!area) return;
    area.style.display = 'flex';
    area.classList.remove('expanded');
    area.classList.add('collapsed');
    const mini = $('ivAnswerMini');
    const expanded = $('ivAnswerExpanded');
    if (mini) mini.style.display = 'flex';
    if (expanded) expanded.style.display = 'none';
    $('ivAnswerInput').value = '';
    $('ivSubmitBtn').disabled = false;
    const wc = $('ivWordCount');
    if (wc) wc.style.display = 'none';
    updateWordCount();
}

function expandAnswerInput() {
    const area = $('ivAnswerArea');
    if (!area) return;
    area.classList.remove('collapsed');
    area.classList.add('expanded');
    const mini = $('ivAnswerMini');
    const expanded = $('ivAnswerExpanded');
    if (mini) mini.style.display = 'none';
    if (expanded) expanded.style.display = 'flex';
    const wc = $('ivWordCount');
    if (wc) wc.style.display = 'flex';
    $('ivAnswerInput').focus();
    updateWordCount();
}

function hideAnswerArea() {
    const area = $('ivAnswerArea');
    if (!area) return;
    area.style.display = 'none';
    area.classList.remove('expanded', 'collapsed');
    $('ivAnswerInput').value = '';
    const wc = $('ivWordCount');
    if (wc) wc.style.display = 'none';
}

// =============================================
// ANSWER SUBMISSION & REAL AI EVALUATION
// =============================================
async function handleSubmit() {
    const answer = $('ivAnswerInput').value.trim();
    if (!answer) { toast('Please type your answer first','error',2500); $('ivAnswerInput').focus(); return; }

    // Stop voice if recording
    if (S.isRecording) stopVoiceInput();

    stopQTimer();

    $('ivSubmitBtn').disabled = true;
    $('ivSubmitBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Evaluating...';

    hideAnswerArea();
    showUserMsg(answer);

    const idx = S.currentQ - 1;
    if (S.questions[idx]) S.questions[idx].answer = answer;

    S.history.push({ question: S.questions[idx]?.question||'', answer });

    const typId = showTyping();

    // ── REAL AI EVALUATION — not a fallback score ──
    let evalResult = null;
    try {
        const evalText = await callGemini(buildEvalPrompt(S.questions[idx]?.question||'', answer));
        evalResult = parseJSON(evalText);
    } catch(e) { console.warn('Eval error:', e.message); }

    removeTyping(typId);

    if (evalResult && typeof evalResult.score === 'number') {
        // Use real AI score — clamp to 1-10
        const score    = Math.min(10, Math.max(1, Math.round(evalResult.score)));
        const feedback = evalResult.brief_feedback || 'Answer recorded.';

        if (S.questions[idx]) {
            S.questions[idx].score        = score;
            S.questions[idx].feedback     = feedback;
            S.questions[idx].tech         = Math.min(100, Math.max(0, evalResult.technical_score    || 0));
            S.questions[idx].comm         = Math.min(100, Math.max(0, evalResult.communication_score|| 0));
            S.questions[idx].conf         = Math.min(100, Math.max(0, evalResult.confidence_score   || 0));
            S.questions[idx].strengths    = evalResult.strengths    || [];
            S.questions[idx].improvements = evalResult.improvements || [];
        }
        showFeedbackMsg(feedback, score);
    } else {
        // AI failed to parse — compute a basic score from answer length/quality
        const words = answer.split(/\s+/).filter(w=>w.length>0).length;
        const fallbackScore = answer==='[No answer provided]' ? 1
            : words < 10 ? 3
            : words < 25 ? 5
            : words < 50 ? 6
            : words < 80 ? 7 : 8;

        if (S.questions[idx]) {
            S.questions[idx].score    = fallbackScore;
            S.questions[idx].feedback = 'Answer recorded. AI evaluation unavailable.';
            S.questions[idx].tech     = Math.round(fallbackScore*10);
            S.questions[idx].comm     = Math.round(fallbackScore*9);
            S.questions[idx].conf     = Math.round(fallbackScore*8);
        }
        showFeedbackMsg('Answer recorded. Keep going!', fallbackScore);
    }

    // Save to backend
    await saveAnswer(idx);

    $('ivSubmitBtn').innerHTML = '<i class="fas fa-paper-plane"></i> Submit Answer';
    $('ivSubmitBtn').disabled  = false;

    await sleep(1000);
    askNext();
}

async function saveAnswer(idx) {
    if (!S.interviewId) return;
    const q = S.questions[idx];
    if (!q) return;
    try {
        await fetch(`${MI_CONFIG.apiBase}/api/interview/answer`,{
            method:'POST',
            headers:{'Content-Type':'application/json','Authorization':'Bearer '+getToken()},
            body: JSON.stringify({
                interview_id: S.interviewId,
                question_no:  idx+1,
                question:     q.question,
                answer:       q.answer,
                score:        q.score,
                feedback:     q.feedback
            })
        });
    } catch(e) { /* silent */ }
}

// =============================================
// VOICE INPUT — SPEECH TO TEXT
// =============================================
function toggleVoice() {
    if (S.isRecording) { stopVoiceInput(); return; }

    if (!S.sttEnabled || !S.micStream) {
        // Try to get mic permission now
        navigator.mediaDevices.getUserMedia({audio:true,video:false})
            .then(stream => {
                S.micStream  = stream;
                S.sttEnabled = true;
                initMicVisualizer();
                startVoiceInput();
            })
            .catch(()=> toast('Microphone access denied. Please type your answer.','error'));
        return;
    }
    startVoiceInput();
}

function startVoiceInput() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Speech recognition not supported in this browser','error'); return; }

    S.recognition = new SR();
    S.recognition.continuous     = true;
    S.recognition.interimResults = true;
    S.recognition.lang           = 'en-US';
    S.recognition.maxAlternatives = 1;

    let finalText = $('ivAnswerInput').value;

    S.recognition.onstart = () => {
        S.isRecording = true;
        $('ivMicBtn').classList.add('recording');
        $('ivMicBtn').innerHTML = '<i class="fas fa-stop"></i>';
        const ls = $('ivListening');
        if (ls) ls.classList.add('active');
    };

    S.recognition.onresult = e => {
        let interim = '';
        for (let i=e.resultIndex; i<e.results.length; i++) {
            const t = e.results[i][0].transcript;
            if (e.results[i].isFinal) finalText += t + ' ';
            else interim += t;
        }
        $('ivAnswerInput').value = finalText + interim;
        updateWordCount();
    };

    S.recognition.onerror = e => {
        if (e.error !== 'aborted') toast('Voice error: '+e.error+'. Please try again.','error');
        stopVoiceInput();
    };

    S.recognition.onend = () => stopVoiceInput();

    try { S.recognition.start(); }
    catch(e) { toast('Could not start voice input','error'); }
}

function stopVoiceInput() {
    S.isRecording = false;
    $('ivMicBtn').classList.remove('recording');
    $('ivMicBtn').innerHTML = '<i class="fas fa-microphone"></i>';
    const ls = $('ivListening');
    if (ls) ls.classList.remove('active');
    if (S.recognition) {
        try { S.recognition.stop(); } catch(_) {}
        S.recognition = null;
    }
}

// =============================================
// VOICE OUTPUT — TEXT TO SPEECH
// =============================================
function speakText(text) {
    if (!S.ttsEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*_`#]/g,'').trim();
    const utt   = new SpeechSynthesisUtterance(clean);
    utt.rate    = 0.9;
    utt.pitch   = 1.0;
    utt.volume  = 1.0;
    utt.lang    = 'en-US';

    // Wait for voices to load
    const setVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        const pref   = voices.find(v =>
            v.name.includes('Google') || v.name.includes('Samantha') ||
            (v.lang==='en-US' && !v.name.includes('Microsoft'))
        );
        if (pref) utt.voice = pref;
        window.speechSynthesis.speak(utt);
    };

    if (window.speechSynthesis.getVoices().length) setVoice();
    else window.speechSynthesis.onvoiceschanged = setVoice;
}

// Pre-load voices
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

// =============================================
// REPORT GENERATION
// =============================================
async function generateReport() {
    stopGlobalTimer(); stopQTimer(); stopAutoSave();

    await showAIMsg('Analyzing your performance... Generating your detailed report.', false);
    const typId = showTyping();

    let report = null;
    try {
        const txt = await callGemini(buildReportPrompt());
        report    = parseJSON(txt);
    } catch(e) { console.warn('Report gen error:', e.message); }

    removeTyping(typId);

    if (!report) report = buildFallbackReport();

    // Save to backend
    try {
        await fetch(`${MI_CONFIG.apiBase}/api/interview/complete`,{
            method:'POST',
            headers:{'Content-Type':'application/json','Authorization':'Bearer '+getToken()},
            body: JSON.stringify({
                interview_id:        S.interviewId,
                final_score:         report.overall_score,
                technical_score:     report.technical_score,
                communication_score: report.communication_score,
                confidence_score:    report.confidence_score,
                strengths:           JSON.stringify(report.strengths),
                weaknesses:          JSON.stringify(report.weaknesses),
                suggestions:         JSON.stringify(report.suggestions),
                summary:             report.summary,
                duration_seconds:    S.globalSecs
            })
        });
    } catch(e) { /* silent */ }

    showReportPanel();
    renderReport(report);
}

function buildFallbackReport() {
    const scores = S.questions.map(q=>q.score||1);
    const avg    = scores.reduce((a,b)=>a+b,0)/(scores.length||1);
    const tech   = Math.round(S.questions.reduce((a,q)=>a+(q.tech||0),0)/(S.questions.length||1));
    const comm   = Math.round(S.questions.reduce((a,q)=>a+(q.comm||0),0)/(S.questions.length||1));
    const conf   = Math.round(S.questions.reduce((a,q)=>a+(q.conf||0),0)/(S.questions.length||1));
    const str    = S.questions.flatMap(q=>q.strengths||[]).slice(0,3);
    const imp    = S.questions.flatMap(q=>q.improvements||[]).slice(0,3);

    return {
        overall_score:       parseFloat(avg.toFixed(1)),
        technical_score:     tech,
        communication_score: comm,
        confidence_score:    conf,
        strengths:  str.length ? str : ['Completed the interview','Attempted all questions','Showed willingness to engage'],
        weaknesses: imp.length ? imp : ['Answers need more depth','More specific examples needed','Technical concepts need strengthening'],
        suggestions:[
            `Study core ${S.role} concepts daily`,
            'Practice answering with the STAR method',
            'Build projects to demonstrate practical skills',
            'Review fundamentals and do mock interviews regularly'
        ],
        summary: `You completed a ${S.level} ${S.role} interview with an average score of ${avg.toFixed(1)}/10. Focus on providing more detailed, example-driven answers to improve your score.`
    };
}

// =============================================
// REPORT RENDERING
// =============================================
function renderReport(data) {
    $('rpSubtitle').textContent =
        `${S.role} · ${S.level} · ${S.totalQ} Questions · ${fmt(S.globalSecs)} duration`;

    animateRing(data.overall_score);

    setTimeout(()=>{
        animateBar('rpTechBar','rpTechScore', data.technical_score);
        animateBar('rpCommBar','rpCommScore', data.communication_score);
        animateBar('rpConfBar','rpConfScore', data.confidence_score);
    }, 700);

    renderList('rpStrengths',  data.strengths  || []);
    renderList('rpWeaknesses', data.weaknesses || []);
    renderList('rpSuggestions',data.suggestions|| []);
    renderQA();

    window.scrollTo({top:0, behavior:'smooth'});
    toast('Interview report ready!','success');
}

function animateRing(score) {
    const clamped = Math.min(10, Math.max(0, score));
    const circ    = 2 * Math.PI * 50; // 314.16
    const offset  = circ - (clamped/10)*circ;

    const svg  = $('rpScoreRing').closest('svg');
    if (svg && !svg.querySelector('defs')) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
        defs.innerHTML = `<linearGradient id="rpGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stop-color="#667eea"/>
            <stop offset="100%" stop-color="#764ba2"/>
        </linearGradient>`;
        svg.insertBefore(defs, svg.firstChild);
        $('rpScoreRing').style.stroke = 'url(#rpGrad)';
    }

    $('rpScoreRing').style.strokeDasharray  = circ;
    $('rpScoreRing').style.strokeDashoffset = circ;

    requestAnimationFrame(()=> requestAnimationFrame(()=>{
        $('rpScoreRing').style.strokeDashoffset = offset;
    }));

    // Count-up animation
    const el    = $('rpFinalScore');
    const start = performance.now();
    const dur   = 1400;
    function tick(now) {
        const p = Math.min((now-start)/dur, 1);
        const e = 1 - Math.pow(1-p, 3);
        el.textContent = (clamped*e).toFixed(1);
        if (p<1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function animateBar(barId, valId, pct) {
    const clamped = Math.min(100, Math.max(0, pct||0));
    const bar = $(barId), val = $(valId);
    if (!bar || !val) return;
    bar.style.width    = clamped+'%';
    val.textContent    = clamped+'%';
    bar.style.background = clamped>=70
        ? 'linear-gradient(135deg,#10b981,#059669)'
        : clamped>=40
        ? 'linear-gradient(135deg,#f59e0b,#d97706)'
        : 'linear-gradient(135deg,#ef4444,#dc2626)';
}

function renderList(containerId, items) {
    const ul = $(containerId);
    if (!ul) return;
    ul.innerHTML = '';
    if (!items.length) {
        const li = document.createElement('li');
        li.textContent = 'No data available';
        li.style.color = 'var(--mi-muted)';
        ul.appendChild(li);
        return;
    }
    items.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
    });
}

function renderQA() {
    const container = $('rpQAList');
    if (!container) return;
    container.innerHTML = '';

    S.questions.forEach((q, idx) => {
        const score = q.score || 0;
        const cls   = score>=7?'good':score>=4?'avg':'poor';
        const item  = document.createElement('div');
        item.className = 'rp-qa-item';
        item.innerHTML = `
            <div class="rp-qa-header">
                <span class="rp-qa-num">Q${idx+1}</span>
                <span class="rp-qa-q">${esc(q.question)}</span>
                <span class="rp-qa-score ${cls}">${score}/10</span>
                <i class="fas fa-chevron-down rp-qa-chevron"></i>
            </div>
            <div class="rp-qa-body">
                <div class="rp-qa-answer">
                    <strong><i class="fas fa-user"></i> Your Answer</strong>
                    ${esc(q.answer||'[No answer provided]')}
                </div>
                <div class="rp-qa-feedback">
                    <strong><i class="fas fa-robot"></i> AI Feedback</strong>
                    ${esc(q.feedback||'No feedback available')}
                </div>
            </div>`;

        item.querySelector('.rp-qa-header').addEventListener('click', ()=>{
            const body = item.querySelector('.rp-qa-body');
            const isOpen = item.classList.contains('open');

            // Close all
            document.querySelectorAll('.rp-qa-item.open').forEach(el=>{
                el.classList.remove('open');
                el.querySelector('.rp-qa-body').classList.remove('open');
            });

            if (!isOpen) {
                item.classList.add('open');
                body.classList.add('open');
            }
        });

        container.appendChild(item);
    });
}

// =============================================
// PDF DOWNLOAD
// =============================================
function handlePdf() {
    const score = $('rpFinalScore').textContent;
    const tech  = $('rpTechScore').textContent;
    const comm  = $('rpCommScore').textContent;
    const conf  = $('rpConfScore').textContent;

    const li = id => Array.from($(id).querySelectorAll('li')).map(l=>`<li>${l.textContent}</li>`).join('');

    const qaHtml = S.questions.map((q,i)=>`
        <div style="margin-bottom:18px;padding:14px;border:1px solid #e2e8f0;border-radius:10px;">
            <p style="font-weight:700;color:#667eea;margin-bottom:6px;">Q${i+1}: ${q.question}</p>
            <p style="color:#374151;margin-bottom:6px;"><strong>Answer:</strong> ${q.answer||'[No answer]'}</p>
            <p style="color:#10b981;"><strong>Score:</strong> ${q.score}/10 — ${q.feedback||''}</p>
        </div>`).join('');

    const date = new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Interview Report — ${S.role}</title>
<style>
  body{font-family:'Segoe UI',sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#1e293b;}
  h1{color:#667eea;font-size:2rem;margin-bottom:6px;}
  h2{color:#1e293b;font-size:1.1rem;margin:26px 0 10px;border-bottom:2px solid #e2e8f0;padding-bottom:7px;}
  .meta{color:#64748b;font-size:0.88rem;margin-bottom:28px;}
  .score{font-size:3rem;font-weight:800;color:#667eea;}
  .bar-row{display:flex;justify-content:space-between;margin:7px 0;font-size:0.88rem;}
  ul{padding-left:20px;}li{margin-bottom:5px;font-size:0.88rem;line-height:1.6;}
  .footer{margin-top:36px;text-align:center;color:#94a3b8;font-size:0.78rem;border-top:1px solid #e2e8f0;padding-top:18px;}
  @media print{body{padding:20px;}}
</style></head><body>
  <h1>🎯 AI Mock Interview Report</h1>
  <p class="meta"><strong>Role:</strong> ${S.role} &nbsp;|&nbsp; <strong>Level:</strong> ${S.level} &nbsp;|&nbsp; <strong>Date:</strong> ${date} &nbsp;|&nbsp; <strong>Duration:</strong> ${fmt(S.globalSecs)}</p>
  <h2>Overall Score</h2><div class="score">${score} / 10</div>
  <h2>Score Breakdown</h2>
  <div class="bar-row"><span>Technical</span><strong>${tech}</strong></div>
  <div class="bar-row"><span>Communication</span><strong>${comm}</strong></div>
  <div class="bar-row"><span>Confidence</span><strong>${conf}</strong></div>
  <h2>Strengths</h2><ul>${li('rpStrengths')}</ul>
  <h2>Areas to Improve</h2><ul>${li('rpWeaknesses')}</ul>
  <h2>Improvement Suggestions</h2><ul>${li('rpSuggestions')}</ul>
  <h2>Question-by-Question Review</h2>${qaHtml}
  <div class="footer">Generated by Build Together Institute — AI Mock Interview System<br/>${date}</div>
</body></html>`;

    const win = window.open('','_blank');
    if (!win) { toast('Allow popups to download PDF','error'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(()=>win.print(), 600);
}
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
        const response = await fetch('https://build-together-backend.onrender.com/api/interview/status', {
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!response.ok) {
            console.error('Failed to load courses');
            return;
        }

        const courses = await response.json();
        const approvedCourses = courses
            .filter(c => c.status === 'approved')
            .map(course => ({
                ...course,
                qa_data: parseQAJson(course.qa_json)
            }));

        S.enrolledCourses = courses;

        if (approvedCourses.length > 0) {
            updateCourseSelection(approvedCourses);
            const preferredCourse = sessionStorage.getItem('selectedInterviewCourse');
            const courseSelect = document.getElementById('courseSelect');

            if (courseSelect && preferredCourse && approvedCourses.some(c => c.course_name === preferredCourse)) {
                courseSelect.value = preferredCourse;
                await handleCourseSelection();
            } else if (courseSelect && approvedCourses.length === 1) {
                courseSelect.value = approvedCourses[0].course_name;
                await handleCourseSelection();
            }
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
    const setupForm = document.querySelector('.mi-form');

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
    const selectedCourse = courseSelect ? courseSelect.value : '';

    if (!selectedCourse) {
        S.selectedCourse = null;
        S.courseQA = [];
        S.prepMaterialsReady = false;
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = '<i class="fas fa-lock"></i> Select a Course';
        }
        return;
    }

    const course = S.enrolledCourses.find(c => c.course_name === selectedCourse);
    if (course && course.status === 'approved') {
        S.selectedCourse = selectedCourse;
        S.courseQA = parseQAJson(course.qa_json);
        S.prepMaterialsReady = true;

        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-play"></i> Start Interview';
        }

        toast(`✅ ${S.courseQA.length} interview questions loaded for ${selectedCourse}`, 'success');
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

    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fas fa-lock"></i> Awaiting Admin Approval';
    }
}

// =====================================================================
// 6. MODIFY handleStart() - Add Course Verification
// =====================================================================

async function handleStartEnhanced() {
    if (!S.selectedCourse) {
        toast('Please select an approved course first', 'error');
        const courseSelect = document.getElementById('courseSelect');
        if (courseSelect) courseSelect.focus();
        return;
    }

    const course = S.enrolledCourses.find(c => c.course_name === S.selectedCourse);
    if (!course || course.status !== 'approved') {
        toast('This course access is not approved', 'error');
        return;
    }

    if (!S.courseQA || S.courseQA.length === 0) {
        toast('No questions are available for this course yet', 'error');
        return;
    }

    S.role = S.selectedCourse;
    S.sessionId = 'mi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    S.currentQ = 0;
    S.questions = [];
    S.askedQuestions = [];
    S.history = [];
    S.interviewId = null;
    S.courseQuestions = S.courseQA;

    const btn = document.getElementById('startBtn');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Setting up...';
        btn.disabled = true;
    }

    const granted = await showPermissionModal();
    if (!granted) {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-play"></i> Start Interview';
            btn.disabled = false;
        }
        return;
    }

    try {
        const r = await fetch('https://build-together-backend.onrender.com/api/interview/start', {
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
                course_name: S.selectedCourse
            })
        });

        if (r.ok) {
            const d = await r.json();
            S.interviewId = d.interviewId;
        }
    } catch (e) {
        console.error('Session creation error:', e);
    }

    if (btn) {
        btn.innerHTML = '<i class="fas fa-play"></i> Start Interview';
        btn.disabled = false;
    }

    S.totalQ = Math.min(S.totalQ, S.courseQuestions.length);
    showInterviewPanel();
    startGlobalTimer();
    startAutoSave();

    setTimeout(() => {
        if (S.courseQuestions && S.courseQuestions.length) return askNextCourseQuestion();
        return askNext();
    }, 1600);
}

// =====================================================================
// 7. NEW FUNCTION: Ask Next Question (Course-Based)
// =====================================================================

async function askNextCourseQuestion() {
    if (S.currentQ >= S.totalQ) {
        handleEnd();
        return;
    }

    let availableQuestionsIndices = [];
    for (let i = 0; i < S.courseQuestions.length; i++) {
        if (!S.askedQuestions.includes(i)) {
            availableQuestionsIndices.push(i);
        }
    }

    if (availableQuestionsIndices.length === 0) {
        availableQuestionsIndices = Array.from({ length: S.courseQuestions.length }, (_, i) => i);
    }

    const randIdx = availableQuestionsIndices[Math.floor(Math.random() * availableQuestionsIndices.length)];
    S.askedQuestions.push(randIdx);
    S.currentQ++;

    const qaItem = S.courseQuestions[randIdx];
    const question = qaItem.question || qaItem;
    const expectedAnswer = qaItem.answer || '';

    const q = {
        qNo: S.currentQ,
        question,
        expectedAnswer,
        answer: '',
        score: 0,
        feedback: '',
        tech: 50,
        comm: 50,
        conf: 50,
        strengths: [],
        improvements: []
    };

    S.questions.push(q);
    updateProgress(S.currentQ);
    updateQuestionProgress();

    const savedQuestion = question || 'Please answer the current question.';
    await showAIMsg(savedQuestion, true, S.currentQ);
    showAnswerArea();

    const answerInput = document.getElementById('ivAnswerInput');
    if (answerInput) answerInput.value = '';
    updateWordCount();
    stopQTimer();
    startQTimer();

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

    loadScriptedAnswer(savedQuestion, S.currentQ, expectedAnswer);

    if (S.ttsEnabled) speakText(savedQuestion);
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
        const response = await fetch('https://build-together-backend.onrender.com/api/interview/ai', {
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
                await fetch('https://build-together-backend.onrender.com/api/interview/answer', {
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
        const fallbackQuestion = S.questions[S.questions.length - 1] || {};
        fallbackQuestion.answer = answer;
        fallbackQuestion.feedback = fallbackQuestion.feedback || 'Answer recorded. Moving to next question.';
        fallbackQuestion.score = typeof fallbackQuestion.score === 'number' ? fallbackQuestion.score : 5;
        fallbackQuestion.tech = typeof fallbackQuestion.tech === 'number' ? fallbackQuestion.tech : 50;
        fallbackQuestion.comm = typeof fallbackQuestion.comm === 'number' ? fallbackQuestion.comm : 50;
        fallbackQuestion.conf = typeof fallbackQuestion.conf === 'number' ? fallbackQuestion.conf : 50;
        showFeedbackMsg(fallbackQuestion.feedback, fallbackQuestion.score);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-arrow-right"></i> Next Question';

        setTimeout(() => {
            if (S.currentQ < S.totalQ) {
                const answerInput = document.getElementById('ivAnswerInput');
                if (answerInput) {
                    answerInput.value = '';
                    updateWordCount();
                }
                askNextCourseQuestion();
            } else {
                handleEnd();
            }
        }, 1000);
    }
}
