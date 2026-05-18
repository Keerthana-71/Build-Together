'use strict';

// =============================================
// CONFIG
// =============================================
const MI_CONFIG = {
    apiBase:        'http://localhost:5000',
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
    askedQuestions:  [],   // full list to prevent repeats
    sessionId:       null,
    interviewId:     null,
    geminiKey:       '',
    history:         [],   // { question, answer } for context
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
};

// =============================================
// DOM HELPERS
// =============================================
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelector(sel);

function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
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
    loadPastInterviews();
    fetchGeminiKey();
    initHamburger();
    injectLogoutBtn();
});

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
    $('startBtn').addEventListener('click', handleStart);

    // End
    $('endBtn').addEventListener('click', handleEnd);

    // Submit answer
    $('ivSubmitBtn').addEventListener('click', handleSubmit);

    // Ctrl+Enter
    $('ivAnswerInput').addEventListener('keydown', e => {
        if (e.ctrlKey && e.key==='Enter') handleSubmit();
    });

    // Word count meter
    $('ivAnswerInput').addEventListener('input', updateWordCount);

    // Mic button
    $('ivMicBtn').addEventListener('click', toggleVoice);

    // Report buttons
    $('rpRetryBtn').addEventListener('click', handleRetry);
    $('rpNewBtn').addEventListener('click', handleNew);
    $('rpPdfBtn').addEventListener('click', handlePdf);
}

// =============================================
// START INTERVIEW
// =============================================
async function handleStart() {
    const role = $('roleSelect').value;
    if (!role) { toast('Please select an interview role','error'); $('roleSelect').focus(); return; }

    S.role = role;
    S.sessionId   = 'mi_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
    S.currentQ    = 0;
    S.questions   = [];
    S.askedQuestions = [];
    S.history     = [];
    S.interviewId = null;

    const btn = $('startBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Setting up...';
    btn.disabled  = true;

    // Show permission modal first
    const granted = await showPermissionModal();
    if (!granted) {
        btn.innerHTML = '<i class="fas fa-play"></i> Start Interview';
        btn.disabled  = false;
        return;
    }

    // Save session to backend
    try {
        const r = await fetch(`${MI_CONFIG.apiBase}/api/interview/start`,{
            method:'POST',
            headers:{'Content-Type':'application/json','Authorization':'Bearer '+getToken()},
            body: JSON.stringify({role:S.role,level:S.level,total_questions:S.totalQ,session_id:S.sessionId})
        });
        if (r.ok) { const d=await r.json(); S.interviewId=d.interviewId; }
    } catch(e) { /* silent */ }

    btn.innerHTML = '<i class="fas fa-play"></i> Start Interview';
    btn.disabled  = false;

    showInterviewPanel();
    startGlobalTimer();
    startAutoSave();
    setTimeout(()=>askNext(), 1600);
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

    updateProgress(0);
}

function showSetupPanel() {
    $('interviewPanel').style.display = 'none';
    $('reportPanel').style.display    = 'none';
    $('setupPanel').style.display     = 'block';
    document.body.classList.remove('interview-active');
    S.interviewActive = false;
    stopCamera(); stopMic();
    loadPastInterviews();
}

function showReportPanel() {
    $('interviewPanel').style.display = 'none';
    $('setupPanel').style.display     = 'none';
    $('reportPanel').style.display    = 'block';
    document.body.classList.remove('interview-active');
    S.interviewActive = false;
    stopCamera(); stopMic();
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
    $('roleSelect').value = S.role;
    document.querySelectorAll('.mi-level-btn').forEach(b=>{
        b.classList.toggle('active', b.dataset.level===S.level);
    });
    handleStart();
}

function handleNew() {
    S.role=''; S.questions=[]; S.currentQ=0; S.history=[]; S.interviewId=null;
    $('roleSelect').value='';
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

    return `You are a senior technical interviewer for ${S.role} (${S.level} level).

=== INTERVIEW HISTORY ===
${historyText}

=== PREVIOUS QUESTIONS (NEVER REPEAT OR ASK SIMILAR TOPICS) ===
${askedText}

=== CANDIDATE'S LAST ANSWER ===
"${prevAnswer}"

=== YOUR MISSION ===
Ask question ${qNum} of ${S.totalQ}.

Decision logic:
- If the candidate's answer was incomplete or vague → ask a targeted follow-up on the SAME topic
- If the answer was complete → move to a COMPLETELY DIFFERENT topic

STRICT RULES:
1. YOUR RESPONSE MUST BE EXACTLY ONE QUESTION AND NOTHING ELSE.
2. DO NOT REPEAT ANY TOPIC, CONCEPT, OR QUESTION LISTED IN THE "PREVIOUS QUESTIONS" SECTION.
3. DO NOT ASK SIMILAR QUESTIONS. YOU MUST EXPLORE A NEW TECHNICAL AREA RELEVANT TO ${S.role}.
4. DO NOT MENTION THE QUESTION NUMBER OR GIVE FEEDBACK YET.
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
    let qText = '';

    try {
        if (S.currentQ === 0) {
            qText = await callGemini(buildQ1Prompt());
        } else {
            const last = S.questions[S.questions.length-1];
            qText = await callGemini(buildNextQPrompt(last.answer, qNum));
        }
    } catch(e) { /* fallthrough */ }

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
    const welcome = $('ivChat').querySelector('.iv-chat-welcome');
    if (welcome) welcome.remove();

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

    $('ivChat').appendChild(div);
    scrollChat();

    const bubble = div.querySelector('.iv-msg-bubble');
    await typeText(bubble, text);
    return div;
}

function showUserMsg(text) {
    const div = document.createElement('div');
    div.className = 'iv-msg user-msg';
    div.innerHTML = `
        <div class="iv-msg-avatar"><i class="fas fa-user"></i></div>
        <div class="iv-msg-content">
            <div class="iv-msg-bubble">${esc(text)}</div>
            <span class="iv-msg-time">${timeStr()}</span>
        </div>`;
    $('ivChat').appendChild(div);
    scrollChat();
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
    $('ivAnswerArea').style.display = 'flex';
    $('ivAnswerInput').value = '';
    $('ivAnswerInput').focus();
    $('ivSubmitBtn').disabled = false;
    $('ivWordCount').style.display = 'flex';
    updateWordCount();
}

function hideAnswerArea() {
    $('ivAnswerArea').style.display = 'none';
    $('ivAnswerInput').value = '';
    $('ivWordCount').style.display = 'none';
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
