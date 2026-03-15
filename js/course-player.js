import { supabase } from './supabase-config.js';

// ==========================================
// 1. CONFIGURATION & GLOBAL STATE
// ==========================================
let courseId = null;
let currentTaskId = null;
let currentContent = null;

let courseData = null;
let courseContents = [];
let currentUserData = null;
let currentTeamId = null;

// Player State
let player = null;
let progressInterval = null;
let dbSaveInterval = null;
let selectedQuality = 'hd720';
let currentPlayerControlsState = 0; 
let isCurrentContentCompleted = false;
let maxWatchedSeconds = 0;
let currentVideoDuration = 0;

// Quiz State
let currentQuizState = {
    questions: [],
    userAnswers: {},
    currentIndex: 0,
    uniqueId: null,
    isReviewMode: false,
    metaData: null,
    savedState: null
};
let quizzesLookup = {};
let projectsLookup = {};

// ==========================================
// 2. INITIALIZATION & SETUP
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    initSpeedOptions();
    setupEventListeners();

    const urlParams = new URLSearchParams(window.location.search);
    courseId = urlParams.get('id');
    currentTaskId = urlParams.get('task_id');

    if (!courseId) {
        showToast("Course ID is missing!", "error");
        setTimeout(() => window.location.href = "student-dash.html", 2000);
        return;
    }

    await initPlayer();
});

function initSpeedOptions() {
    const select = document.getElementById('playback-speed');
    if (!select) return;
    select.innerHTML = '';
    for (let i = 0.5; i <= 3.5; i += 0.1) {
        let val = parseFloat(i.toFixed(1));
        let opt = document.createElement('option');
        opt.value = val;
        opt.text = val + 'x';
        if (val === 1) opt.selected = true;
        select.appendChild(opt);
    }
}

function setupEventListeners() {
    document.getElementById('btn-restart')?.addEventListener('click', () => {
        if (player && typeof player.seekTo === 'function') {
            player.seekTo(0);
            player.playVideo();
            showToast("Video Restarted", "info");
        }
    });

    document.getElementById('btn-rewind')?.addEventListener('click', () => {
        if (player && typeof player.getCurrentTime === 'function') {
            const curr = player.getCurrentTime();
            player.seekTo(Math.max(0, curr - 10));
            showToast("-10 Seconds", "info");
        }
    });

    const btnFull = document.getElementById('btn-fullscreen');
    if (btnFull) btnFull.onclick = toggleFullscreen;

    const btnCap = document.getElementById('btn-captions');
    if (btnCap) btnCap.onclick = (e) => {
        e.stopPropagation();
        closeAllMenus();
        updateCaptionsMenu();
        document.getElementById('captions-menu')?.classList.toggle('hidden');
    };

    const btnQual = document.getElementById('btn-quality');
    if (btnQual) btnQual.onclick = (e) => {
        e.stopPropagation();
        closeAllMenus();
        updateQualityMenu();
        document.getElementById('quality-menu')?.classList.toggle('hidden');
    };

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#btn-captions') && !e.target.closest('#captions-menu') &&
            !e.target.closest('#btn-quality') && !e.target.closest('#quality-menu')) {
            closeAllMenus();
        }
    });

    document.addEventListener('fullscreenchange', () => {
        const header = document.getElementById('video-header');
        const icon = document.querySelector('#btn-fullscreen i');
        if (!document.fullscreenElement) {
            if (header) header.classList.remove('hidden');
            if (icon) { icon.classList.remove('fa-compress'); icon.classList.add('fa-expand'); }
        }
    });
}

function closeAllMenus() {
    document.getElementById('captions-menu')?.classList.add('hidden');
    document.getElementById('quality-menu')?.classList.add('hidden');
}

// ==========================================
// 3. DATA FETCHING & SYNCING
// ==========================================
async function initPlayer() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "auth.html";
            return;
        }

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        currentUserData = profile;
        currentTeamId = profile?.team_id;

        await updateHeaderUserInfo();

        const { data: course, error: courseErr } = await supabase.from('courses').select('*').eq('course_id', courseId).single();
        if (courseErr) throw courseErr;
        courseData = course;
        
        const courseTitleEl = document.getElementById('course-title');
        if (courseTitleEl) courseTitleEl.innerText = course.title || "Course Player";

        const { data: materials, error: matErr } = await supabase
            .from('course_materials')
            .select('*')
            .eq('course_id', courseId)
            .order('order_index', { ascending: true });
        
        if (matErr) throw matErr;
        courseContents = materials || [];

        const quizIds = courseContents.map(c => c.ref_quiz_id).filter(Boolean);
        const projectIds = courseContents.map(c => c.ref_project_id).filter(Boolean);

        if (quizIds.length > 0) {
            const { data: qData } = await supabase.from('quizzes').select('quiz_id, title, max_xp').in('quiz_id', quizIds);
            if (qData) quizzesLookup = qData.reduce((acc, q) => ({...acc, [q.quiz_id]: q}), {});
        }
        if (projectIds.length > 0) {
            const { data: pData } = await supabase.from('projects').select('id, title, max_points').in('id', projectIds);
            if (pData) projectsLookup = pData.reduce((acc, p) => ({...acc, [p.id]: p}), {});
        }

        await ensureUserEnrolled();

        let targetContentId = new URLSearchParams(window.location.search).get('content');

        if (!targetContentId && currentTaskId) {
            const { data: taskData } = await supabase
                .from('team_tasks')
                .select('content_id')
                .eq('id', currentTaskId)
                .maybeSingle();

            if (taskData && taskData.content_id) {
                targetContentId = taskData.content_id;
            }
        }

        // SMART RESOLVER: Identify target content type
        if (targetContentId) {
            let foundDirect = courseContents.find(c => String(c.content_id) === String(targetContentId));
            
            if (foundDirect) {
                currentContent = foundDirect;
            } else {
                let parentWithQuiz = courseContents.find(c => String(c.ref_quiz_id) === String(targetContentId));
                if (parentWithQuiz) {
                    const qData = quizzesLookup[parentWithQuiz.ref_quiz_id] || {};
                    currentContent = {
                        content_id: parentWithQuiz.content_id + '_quiz',
                        ref_quiz_id: parentWithQuiz.ref_quiz_id,
                        title: 'اختبار: ' + (qData.title || 'تقييم الدرس'),
                        type: 'quiz',
                        base_xp: qData.max_xp || 0,
                        Author: parentWithQuiz.Author
                    };
                } else {
                    let parentWithProject = courseContents.find(c => String(c.ref_project_id) === String(targetContentId));
                    if (parentWithProject) {
                        const pData = projectsLookup[parentWithProject.ref_project_id] || {};
                        currentContent = {
                            content_id: parentWithProject.content_id + '_project',
                            ref_project_id: parentWithProject.ref_project_id,
                            title: 'مشروع: ' + (pData.title || 'تطبيق عملي'),
                            type: 'project',
                            base_xp: pData.max_points || 0,
                            Author: parentWithProject.Author
                        };
                    } else {
                        courseContents.forEach(item => {
                            if (targetContentId === item.content_id + '_quiz') {
                                const qData = quizzesLookup[item.ref_quiz_id] || {};
                                currentContent = { content_id: item.content_id + '_quiz', ref_quiz_id: item.ref_quiz_id, type: 'quiz', title: 'اختبار: ' + (qData.title || 'تقييم الدرس'), base_xp: qData.max_xp || 0 };
                            } else if (targetContentId === item.content_id + '_project') {
                                const pData = projectsLookup[item.ref_project_id] || {};
                                currentContent = { content_id: item.content_id + '_project', ref_project_id: item.ref_project_id, type: 'project', title: 'مشروع: ' + (pData.title || 'تطبيق عملي'), base_xp: pData.max_points || 0 };
                            }
                        });
                    }
                }
            }
        }

        if (!currentContent && courseContents.length > 0) {
            currentContent = courseContents[0];
        }

        await renderSidebar();
        
        if (currentContent) {
            await loadContent(currentContent);
        }

    } catch (err) {
        console.error("Initialization Error:", err);
        showToast("Error loading course data", "error");
    }
}

async function ensureUserEnrolled() {
    try {
        const { data: enrollment } = await supabase
            .from('enrollments')
            .select('id')
            .eq('user_id', currentUserData.id)
            .eq('course_id', courseId)
            .maybeSingle();

        if (!enrollment) {
            await supabase.from('enrollments').insert([{
                user_id: currentUserData.id,
                course_id: courseId,
                progress_percent: 0,
                is_completed: false
            }]);
        } else {
            await supabase.from('enrollments').update({ last_accessed_at: new Date() }).eq('id', enrollment.id);
        }
    } catch (e) {
        console.error("Enrollment error:", e);
    }
}

async function updateHeaderUserInfo() {
    if (!currentUserData) return;
    
    const name = currentUserData.full_name || "Student";
    const photo = resolveImageUrl(currentUserData.avatar_url);
    const rankTitle = currentUserData.current_rank || "Newbie";

    const elName = document.getElementById('user-name');
    const elAvatar = document.getElementById('user-avatar');
    const elRank = document.getElementById('user-rank-title');
    const elPoints = document.getElementById('stat-points');

    if (elName) elName.innerText = name;
    if (elAvatar) elAvatar.src = photo;
    if (elRank) elRank.innerText = rankTitle;
    if (elPoints) elPoints.innerText = currentUserData.total_xp || 0;

    if (currentTeamId) {
        try {
            const { data: members } = await supabase
                .from('profiles')
                .select('id, total_xp')
                .eq('team_id', currentTeamId)
                .order('total_xp', { ascending: false });

            if (members) {
                const myRank = members.findIndex(m => m.id === currentUserData.id) + 1;
                const totalMembers = members.length;
                
                const elRankDisplay = document.getElementById('team-rank-display');
                const elTotalMembers = document.getElementById('team-total-members');
                
                if (elRankDisplay) elRankDisplay.innerText = `#${myRank}`;
                if (elTotalMembers) elTotalMembers.innerText = `/ ${totalMembers}`;
            }
        } catch (e) { console.error(e); }
    }
}

// ==========================================
// 4. SIDEBAR RENDERING & NAVIGATION
// ==========================================
async function renderSidebar() {
    const container = document.getElementById('playlist-container') || document.getElementById('playlist-items');
    if (!container) return;

    // Fetch completed videos & quizzes & projects
// Fetch completed videos & quizzes & projects
    const { data: completedVideos } = await supabase.from('completed_materials').select('material_id').eq('user_id', currentUserData.id).eq('course_id', courseId);
    const { data: passedQuizzes } = await supabase.from('quiz_attempts').select('quiz_id').eq('user_id', currentUserData.id).eq('passed', true);
    const { data: submittedProjects } = await supabase.from('project_submissions').select('project_id').eq('user_id', currentUserData.id).in('status', ['graded', 'remarked']);
    const completedVideoIds = (completedVideos || []).map(row => row.material_id);
    const completedQuizIds = (passedQuizzes || []).map(row => row.quiz_id);
    const completedProjectIds = (submittedProjects || []).map(row => row.project_id);

    container.innerHTML = '';
    let totalItemsCount = 0;
    let completedCount = 0;
    let mainIndex = 1;

    // 💡 المسار الافتراضي للفيديوهات (لكي يعمل بشكل طبيعي مع الكورسات القديمة بدون سكاشن)
    let currentSectionBody = container; 

    courseContents.forEach((item, index) => {
        
        // =====================================
        // 💡 1. رسم العناوين (Sections)
        // =====================================
        if (item.type === 'section') {
            const sectionId = `section-${item.content_id}`;
            
            // ذكاء الواجهة: فحص ما إذا كان الفيديو الذي يشاهده الطالب الآن موجوداً داخل هذا الفولدر لفتحه تلقائياً
            let hasActiveContent = false;
            for (let i = index; i < courseContents.length; i++) {
                if (i !== index && courseContents[i].type === 'section') break; // وصلنا لـ Section جديد
                if (currentContent && courseContents[i].content_id === currentContent.content_id) hasActiveContent = true;
                if (currentContent && currentContent.ref_quiz_id && courseContents[i].ref_quiz_id === currentContent.ref_quiz_id) hasActiveContent = true;
                if (currentContent && currentContent.ref_project_id && courseContents[i].ref_project_id === currentContent.ref_project_id) hasActiveContent = true;
            }

            const shouldBeOpen = hasActiveContent || index === 0;

            const sectionHTML = `
                <div class="mt-4 mb-2 animate-fade-in">
                    <button onclick="window.togglePlaylistSection('${sectionId}')" class="w-full flex justify-between items-center p-3 bg-gradient-to-l from-b-surface to-black border border-white/10 hover:border-b-primary/50 rounded-xl transition-all group shadow-md">
                        <span class="font-bold text-white text-sm group-hover:text-b-primary transition-colors flex items-center gap-3 text-right leading-tight">
                            <div class="w-7 h-7 rounded-lg bg-b-primary/20 text-b-primary flex items-center justify-center text-xs border border-b-primary/30 shrink-0">
                                <i class="fas fa-folder-open"></i>
                            </div>
                            ${item.title}
                        </span>
                        <div class="w-7 h-7 shrink-0 rounded-full bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-white transition-colors">
                            <i class="fas fa-chevron-down text-xs transition-transform duration-300 ${shouldBeOpen ? 'rotate-180' : ''}" id="icon-${sectionId}"></i>
                        </div>
                    </button>
                    <div id="body-${sectionId}" class="section-body mt-3 space-y-1.5 transition-all overflow-hidden ${shouldBeOpen ? '' : 'hidden'} pr-4 border-r-2 border-white/5 mr-3">
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', sectionHTML);
            
            // تحويل مسار الرسم ليكون داخل هذا الـ Section الجديد
            currentSectionBody = document.getElementById(`body-${sectionId}`);
            
            // 💡 تم حذف (return;) من هنا لكي يكمل الكود رسم الفيديو نفسه ليكون قابلاً للتشغيل!
        }

        // =====================================
        // 💡 2. رسم الدروس (Videos / Playable Sections)
        // =====================================
        const isVideoCompleted = completedVideoIds.includes(item.content_id);
        const isChild = currentSectionBody !== container; // لو هو جوه فولدر، نعطيه تنسيق الابن (Child)
        
        renderSidebarItem(currentSectionBody, item, mainIndex, isVideoCompleted, isChild);
        
        totalItemsCount++;
        if (isVideoCompleted) completedCount++;
        mainIndex++;

        // =====================================
        // 💡 3. رسم الكويزات التابعة للدرس
        // =====================================
        if (item.ref_quiz_id) {
            const qData = quizzesLookup[item.ref_quiz_id] || {};
            const quizItem = {
                content_id: item.content_id + '_quiz',
                ref_quiz_id: item.ref_quiz_id,
                title: 'اختبار: ' + (qData.title || 'تقييم الدرس'),
                type: 'quiz',
                base_xp: qData.max_xp || 0
            };
            const isQuizCompleted = completedQuizIds.includes(item.ref_quiz_id);
            renderSidebarItem(currentSectionBody, quizItem, '', isQuizCompleted, true);
            totalItemsCount++; 
            if (isQuizCompleted) completedCount++;
        }

        // =====================================
        // 💡 4. رسم المشاريع التابعة للدرس
        // =====================================
        if (item.ref_project_id) {
            const pData = projectsLookup[item.ref_project_id] || {};
            const projectItem = {
                content_id: item.content_id + '_project',
                ref_project_id: item.ref_project_id,
                title: 'مشروع: ' + (pData.title || 'تطبيق عملي'),
                type: 'project',
                base_xp: pData.max_points || 0
            };
            const isProjectCompleted = completedProjectIds.includes(item.ref_project_id);
            renderSidebarItem(currentSectionBody, projectItem, '', isProjectCompleted, true);
            totalItemsCount++;
            if (isProjectCompleted) completedCount++;
        }
    });

    updateProgressBar(completedCount, totalItemsCount);
}

// 💡 دالة لفتح وإغلاق مجلدات السكاشن
window.togglePlaylistSection = (sectionId) => {
    const body = document.getElementById(`body-${sectionId}`);
    const icon = document.getElementById(`icon-${sectionId}`);
    if (body) {
        body.classList.toggle('hidden');
        if (icon) icon.classList.toggle('rotate-180');
    }
};

function renderSidebarItem(container, item, indexStr, isCompleted, isChild) {
    let isActive = false;
    if (currentContent) {
        if (currentContent.content_id === item.content_id) isActive = true;
        if (item.type === 'quiz' && currentContent.ref_quiz_id === item.ref_quiz_id) isActive = true;
        if (item.type === 'project' && currentContent.ref_project_id === item.ref_project_id) isActive = true;
    }

    let icon = "fa-play"; 
    let typeColor = "text-gray-400";
    let typeLabel = "فيديو"; // 💡 توحيد الاسم ليظهر (فيديو) حتى لو برمجياً مسجل (section)
    
    if (item.type === 'quiz') { icon = "fa-clipboard-question"; typeColor = "text-yellow-500"; typeLabel = "كويز"; }
    if (item.type === 'project') { icon = "fa-laptop-code"; typeColor = "text-purple-500"; typeLabel = "مشروع"; }

    const baseClasses = "flex items-center gap-3 p-3 cursor-pointer transition-all relative rounded-xl mb-1.5";
    const activeClasses = isActive 
        ? "bg-b-primary/20 border border-b-primary/50 shadow-[0_0_15px_rgba(0,106,103,0.15)]" 
        : "bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10";
    // 💡 إعطاء مسافة بادئة للدروس لتبدو كفروع (Tree structure)
    const childClasses = isChild ? "mr-5 ml-2 scale-[0.98] border-r-2 border-r-white/10" : "";
    
    const connectorHtml = isChild ? `<div class="absolute -right-3 top-1/2 w-3 h-[2px] bg-white/10"></div>` : '';
    const displayTitle = isChild ? item.title : `<span class="text-gray-500 font-mono mr-1">${indexStr}.</span> ${item.title}`;

// 💡 التشفير الآمن: نقوم بتحويل علامات الاقتباس المفردة يدوياً لمنع الـ SyntaxError
    const safeEncodedItem = encodeURIComponent(JSON.stringify(item)).replace(/'/g, "%27");

    const html = `
        <div onclick="window.switchContentObj('${safeEncodedItem}')" 
             class="${baseClasses} ${activeClasses} ${childClasses} group">
            ${connectorHtml}
            <div class="w-8 h-8 rounded-full ${isCompleted ? 'bg-green-500/20 text-green-500' : 'bg-black/50 ' + typeColor} flex items-center justify-center shrink-0 text-[10px] group-hover:scale-110 transition-transform border border-white/5">
                ${isCompleted ? '<i class="fas fa-check"></i>' : `<i class="fas ${icon}"></i>`}
            </div>
            <div class="flex-1 min-w-0">
                <h4 class="text-xs font-bold ${isActive ? 'text-white' : (isChild ? 'text-gray-300' : 'text-gray-200')} truncate group-hover:text-b-primary transition-colors leading-tight">${displayTitle}</h4>
                <div class="flex justify-between items-center mt-1.5">
                    <span class="text-[9px] uppercase font-mono tracking-widest ${typeColor} bg-black/40 px-1.5 py-0.5 rounded border border-white/5">${typeLabel}</span>
                    ${item.base_xp ? `<span class="text-[9px] text-yellow-500 font-bold bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20"><i class="fas fa-star text-[8px]"></i> ${item.base_xp} XP</span>` : ''}
                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', html);
}

window.switchContentObj = async (encodedItemStr) => {
    try {
        const item = JSON.parse(decodeURIComponent(encodedItemStr));
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('content', item.content_id);
        window.history.pushState({}, '', newUrl);
        
        await loadContent(item);
        renderSidebar(); 
    } catch (e) {
        console.error("Error switching content:", e);
    }
};

// ==========================================
// 5. CONTENT LOADING & ROUTING
// ==========================================
async function loadContent(item) {
    // 💡 1. الإغلاق التلقائي للقائمة في الموبايل
    if (window.innerWidth < 1024) {
        const sidebar = document.getElementById('right-sidebar');
        if (sidebar && sidebar.classList.contains('translate-x-0')) {
            if (typeof window.toggleSidebar === 'function') {
                window.toggleSidebar();
            }
        }
    }

    if (!item) return;

    // 💡 2. التعديل الهام هنا: حفظ تقدم الفيديو سواء كان video أو section
    if (currentContent && (currentContent.type === 'video' || currentContent.type === 'section') && player && typeof player.getCurrentTime === 'function') {
        await saveVideoState(false);
    }

    currentContent = item;
    updateVideoHeader(item);
    recordTaskStart(item.content_id);

    document.querySelectorAll('.content-view').forEach(el => el.classList.add('hidden'));
    const progressPanel = document.getElementById('video-progress-panel');

    const { data: completedCheck } = await supabase
        .from('completed_materials')
        .select('id')
        .eq('user_id', currentUserData.id)
        .eq('material_id', item.content_id)
        .maybeSingle();
    
    isCurrentContentCompleted = !!completedCheck;
    maxWatchedSeconds = 0;

    // 💡 3. الكود الخاص بك (الممتاز) لتشغيل المشغل
    if (item.type === 'video' || item.type === 'section') {
        document.getElementById('view-video')?.classList.remove('hidden');
        document.getElementById('video-header')?.classList.remove('hidden');
        if (progressPanel) progressPanel.classList.remove('hidden');
        
        loadVideo(item.video_id, 0, isCurrentContentCompleted, 1);
        
    } else if (item.type === 'quiz') {
        document.getElementById('view-quiz')?.classList.remove('hidden');
        if (progressPanel) progressPanel.classList.add('hidden');
        loadQuizViewer(item.ref_quiz_id);
        
    } else if (item.type === 'project') {
        document.getElementById('view-project')?.classList.remove('hidden');
        if (progressPanel) progressPanel.classList.add('hidden');
        loadProjectViewer(item.ref_project_id);
    }
}

function updateVideoHeader(item) {
    const courseTitleEl = document.getElementById('header-course-title');
    const authorEl = document.getElementById('header-author');
    const videoTitleEl = document.getElementById('header-video-title');
    const noteContainer = document.getElementById('header-note-container');
    const noteText = document.getElementById('header-note-text');
    const pointsBadge = document.getElementById('header-points-badge');
    const pointsText = document.getElementById('header-points-text');

    if (courseTitleEl) courseTitleEl.innerText = courseData ? courseData.title : "Course";
    if (authorEl) authorEl.innerText = item.Author || "Busla";
    if (videoTitleEl) videoTitleEl.innerText = item.title || "Untitled";

    const points = item.base_xp || 0;
    if (points > 0 && pointsBadge) {
        pointsBadge.classList.remove('hidden'); pointsBadge.classList.add('flex');
        if (pointsText) pointsText.innerText = points;
    } else if (pointsBadge) {
        pointsBadge.classList.add('hidden'); pointsBadge.classList.remove('flex');
    }

    const note = (item.Note || "").toString().trim();
    if (noteContainer && noteText) {
        if (note && note !== "undefined" && note !== "null") {
            noteContainer.classList.remove('hidden'); noteText.innerText = note;
        } else { noteContainer.classList.add('hidden'); }
    }
}

// ==========================================
// 6. YOUTUBE VIDEO PLAYER
// ==========================================
function loadVideo(videoId, startSeconds = 0, isCompleted = false, savedSpeed = 1) {
    if (!videoId) return;

    if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
        setTimeout(() => loadVideo(videoId, startSeconds, isCompleted, savedSpeed), 500);
        return;
    }

    if (videoId.includes('v=')) videoId = videoId.split('v=')[1];
    if (videoId.includes('&')) videoId = videoId.split('&')[0];
    if (videoId.includes('youtu.be/')) videoId = videoId.split('youtu.be/')[1];

    const desiredControlsState = isCompleted ? 1 : 0;
    const playerVars = {
        'controls': desiredControlsState,
        'disablekb': isCompleted ? 0 : 1,
        'rel': 0,
        'modestbranding': 1,
        'origin': window.location.origin,
        'enablejsapi': 1,
        'cc_load_policy': 1,
        'playsinline': 1,
        'start': Math.floor(startSeconds)
    };

    const overlay = document.getElementById('video-overlay');
    if (overlay) {
        if (isCompleted) {
            overlay.classList.add('hidden');
            overlay.style.pointerEvents = "none";
        } else {
            overlay.classList.remove('hidden');
            overlay.style.pointerEvents = "auto";
        }
    }

    if (player && typeof player.destroy === 'function' && currentPlayerControlsState !== desiredControlsState) {
        player.destroy();
        player = null;
    }

    if (player && typeof player.loadVideoById === 'function') {
        player.loadVideoById({ 'videoId': videoId, 'startSeconds': startSeconds, 'suggestedQuality': selectedQuality });
        player.setPlaybackRate(parseFloat(savedSpeed) || 1);
        const speedSelect = document.getElementById('playback-speed');
        if (speedSelect) speedSelect.value = parseFloat(savedSpeed) || 1;
    } else {
        currentPlayerControlsState = desiredControlsState;
        try {
            player = new YT.Player('youtube-player', {
                height: '100%',
                width: '100%',
                videoId: videoId,
                playerVars: playerVars,
                events: {
                    'onReady': (e) => onPlayerReady(e, savedSpeed),
                    'onStateChange': onPlayerStateChange,
                    'onApiChange': onPlayerApiChange,
                    'onError': (e) => console.error("YT Error:", e)
                }
            });
        } catch (e) { console.error("Player creation error:", e); }
    }
}

function onPlayerReady(event, savedSpeed) {
    if (typeof player.loadModule === 'function') player.loadModule('captions');

    const btnPlay = document.getElementById('btn-play');
    if (btnPlay) {
        btnPlay.onclick = () => {
            const state = player.getPlayerState();
            if (state === 1) player.pauseVideo();
            else player.playVideo();
        };
    }

    const speedSelect = document.getElementById('playback-speed');
    if (speedSelect) {
        speedSelect.value = savedSpeed;
        speedSelect.onchange = (e) => {
            player.setPlaybackRate(parseFloat(e.target.value));
        };
    }

    player.setPlaybackRate(savedSpeed);
    player.setPlaybackQuality(selectedQuality);
    currentVideoDuration = player.getDuration() || 100;

    clearInterval(progressInterval);
    clearInterval(dbSaveInterval);
    progressInterval = setInterval(trackVideoProgress, 1000);
    dbSaveInterval = setInterval(() => saveVideoState(false), 30000); 
}

async function trackVideoProgress() {
    if (!player || !player.getDuration) return;
    const currentTime = player.getCurrentTime();
    const duration = player.getDuration();
    if (duration === 0) return;

    if (currentTime > maxWatchedSeconds) {
        maxWatchedSeconds = currentTime;
    }

    document.getElementById('time-current').innerText = formatTime(currentTime);
    document.getElementById('time-duration').innerText = formatTime(duration);

    const percent = (currentTime / duration) * 100;
    const savedBar = document.getElementById('saved-progress-bar');
    const savedTxt = document.getElementById('saved-time-display');

    if (savedBar) savedBar.style.width = `${percent}%`;
    if (savedTxt) savedTxt.innerText = formatTime(currentTime);

    if (!isCurrentContentCompleted && (maxWatchedSeconds / duration) >= 0.90) {
        await saveVideoState(true);
    }
}

async function saveVideoState(isFinal = false) {
    if (!player || !currentContent || currentContent.type !== 'video') return;
    
    if (isFinal && !isCurrentContentCompleted) {
        isCurrentContentCompleted = true;
        const points = currentContent.base_xp || 10;
        await markContentComplete(currentContent.content_id, points, 'video');

        const overlay = document.getElementById('video-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.style.pointerEvents = "none";
        }
        
        const currentTime = player.getCurrentTime();
        loadVideo(currentContent.video_id, currentTime, true, player.getPlaybackRate());
    }
}

function onPlayerStateChange(event) {
    const btnIcon = document.querySelector('#btn-play i');
    if (event.data === 1) { 
        if (btnIcon) btnIcon.className = "fas fa-pause"; 
    } else { 
        if (btnIcon) btnIcon.className = "fas fa-play"; 
    }
    
    if (event.data === YT.PlayerState.BUFFERING || event.data === YT.PlayerState.PLAYING) {
        if (selectedQuality !== 'default') player.setPlaybackQuality(selectedQuality);
        updateCaptionsMenu(); updateQualityMenu();
    }
}

function onPlayerApiChange() {
    updateCaptionsMenu();
    updateQualityMenu();
}

function updateCaptionsMenu() {
    if (!player || typeof player.getOption !== 'function') return;
    const tracks = player.getOption('captions', 'tracklist') || [];
    const menu = document.getElementById('captions-menu');
    if(!menu) return;
    let html = `<button class="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-white/10 border-b border-white/5 font-bold" onclick="window.changeCaption('off')">🔕 Turn Off Captions</button>`;
    html += `<button class="w-full text-left px-4 py-2 text-xs text-green-400 hover:bg-white/10 border-b border-white/5 font-bold" onclick="window.changeCaption('on')">💬 Turn On (Auto)</button>`;
    if (tracks.length > 0) {
        tracks.forEach(track => {
            const isActive = track.languageCode === (player.getOption('captions', 'track') || {}).languageCode;
            const activeClass = isActive ? 'text-b-primary font-bold bg-white/5' : 'text-gray-300';
            const checkMark = isActive ? '<i class="fas fa-check text-[10px]"></i>' : '';
            html += `<button class="w-full text-left px-4 py-2 text-xs hover:bg-white/10 flex justify-between items-center ${activeClass}" onclick="window.changeCaption('${track.languageCode}')"><span>${track.displayName}</span><div class="flex items-center gap-2"><span class="uppercase text-[9px] text-gray-500 bg-white/10 px-1 rounded">${track.languageCode}</span>${checkMark}</div></button>`;
        });
    } else { html += `<div class="px-4 py-2 text-[10px] text-gray-500 text-center animate-pulse">Searching...</div>`; }
    menu.innerHTML = html;
}

window.changeCaption = (code) => {
    if (!player) return;
    if (code === 'off') { player.setOption('captions', 'track', {}); }
    else if (code === 'on') {
        player.loadModule('captions');
        const tracks = player.getOption('captions', 'tracklist') || [];
        if (tracks.length > 0) player.setOption('captions', 'track', { 'languageCode': tracks[0].languageCode }); 
        else player.setOption('captions', 'reload', true);
    }
    else { player.setOption('captions', 'track', { 'languageCode': code }); }
    closeAllMenus();
};

function updateQualityMenu() {
    if (!player || typeof player.getAvailableQualityLevels !== 'function') return;
    const levels = player.getAvailableQualityLevels();
    const menu = document.getElementById('quality-menu');
    if(!menu) return;
    menu.innerHTML = '';
    if (!levels || levels.length === 0) { menu.innerHTML = '<div class="px-4 py-2 text-xs text-gray-500 text-center">Auto only</div>'; return; }
    const labelMap = { 'highres': '4K / Original', 'hd2160': '4K (2160p)', 'hd1440': '2K (1440p)', 'hd1080': 'HD (1080p)', 'hd720': 'HD (720p)', 'large': 'SD (480p)', 'medium': 'Low (360p)', 'small': 'Low (240p)', 'tiny': 'Low (144p)', 'auto': 'Auto' };
    levels.forEach(level => {
        const btn = document.createElement('button');
        btn.className = "w-full text-center px-2 py-1.5 text-xs text-gray-300 hover:bg-white/10 hover:text-b-primary transition block";
        if (level === selectedQuality) { btn.classList.add('text-b-primary', 'bg-white/5', 'font-bold'); btn.classList.remove('text-gray-300'); }
        btn.innerText = labelMap[level] || level;
        btn.onclick = () => window.changeQuality(level);
        menu.appendChild(btn);
    });
}

window.changeQuality = (quality) => {
    if (!player) return;
    selectedQuality = quality;
    const currentTime = player.getCurrentTime();
    const videoId = player.getVideoData().video_id;
    player.loadVideoById({ 'videoId': videoId, 'startSeconds': currentTime, 'suggestedQuality': quality });
    const txt = document.getElementById('current-quality-txt');
    if (txt) txt.innerText = quality === 'auto' ? 'Auto' : quality.replace('hd', '') + 'p';
    closeAllMenus();
};

// ==========================================
// 7. QUIZ MODULE
// ==========================================
async function loadQuizViewer(quizId) {
    const container = document.getElementById('quiz-questions-container');
    if(!container) return;
    
    container.innerHTML = '<div class="text-center py-20 text-yellow-500"><i class="fas fa-spinner fa-spin text-4xl mb-4"></i><p>Loading Quiz...</p></div>';

    try {
        const { data: quiz } = await supabase.from('quizzes').select('*').eq('quiz_id', quizId).single();
        if (!quiz) throw new Error("Quiz not found");

        const { data: attempts } = await supabase.from('quiz_attempts')
            .select('*').eq('quiz_id', quizId).eq('user_id', currentUserData.id)
            .order('submitted_at', { ascending: false });

        currentQuizState.metaData = quiz;
        currentQuizState.allAttempts = attempts || [];
        
        const attemptsCount = currentQuizState.allAttempts.length;
        const passedAttempt = currentQuizState.allAttempts.find(a => a.passed);

        currentQuizState.savedState = { 
            attempts_count: attemptsCount, 
            passed: !!passedAttempt, 
            last_score: passedAttempt ? passedAttempt.score : (currentQuizState.allAttempts[0]?.score || 0) 
        };

        updateQuizHeaderStats(quiz, currentQuizState.savedState);

        const { data: activeState } = await supabase.from('active_quiz_states')
            .select('*').eq('quiz_id', quizId).eq('user_id', currentUserData.id).maybeSingle();

        if (activeState && activeState.questions && activeState.questions.length > 0) {
            currentQuizState.questions = activeState.questions;
            currentQuizState.userAnswers = activeState.user_answers || {};
            currentQuizState.currentIndex = 0;
            currentQuizState.isReviewMode = false;
            renderCurrentQuestion();
            return;
        }

        if (attemptsCount > 0) {
            window.showQuizReview(0); 
            return;
        }

        window.retryQuiz();

    } catch (e) {
        container.innerHTML = `<p class="text-center text-red-500 py-20">${e.message}</p>`;
    }
}

function updateQuizHeaderStats(quizData, savedState) {
    const titleEl = document.getElementById('quiz-title');
    const descEl = document.getElementById('quiz-desc');
    
    if (titleEl) titleEl.innerText = quizData.title;

    const maxAttempts = quizData.attempts_allowed || 3;
    const usedAttempts = savedState?.attempts_count || 0;

    let statusText = `Max XP: ${quizData.max_xp || 0} | Attempts: ${usedAttempts} / ${maxAttempts}`;
    let progressWidth = "0%";
    let progressColor = "bg-yellow-500";
    let scoreDisplay = "";

    if (savedState && (savedState.passed || usedAttempts >= maxAttempts)) {
        const score = savedState.last_score || 0;
        const resultText = savedState.passed ? "Passed" : "Failed";
        const resultColor = savedState.passed ? "text-green-400" : "text-red-400";
        
        statusText = `${resultText} | Attempts: ${usedAttempts} / ${maxAttempts}`;
        scoreDisplay = `<span class="${resultColor} font-bold ml-2">Score: ${score}%</span>`;
        progressWidth = "100%";
        progressColor = savedState.passed ? "bg-green-500" : "bg-red-500";
    }

    if (descEl) {
        descEl.innerHTML = `
            <div class="flex justify-between items-end">
                <div><span class="text-gray-400 text-xs">${quizData.description || ''}</span></div>
                <div class="text-sm">${scoreDisplay}</div>
            </div>
            <div class="mt-4 bg-gray-800 rounded-full h-2 w-full overflow-hidden border border-white/5">
                <div id="quiz-progress-bar" class="${progressColor} h-full w-0 transition-all duration-500" style="width: ${progressWidth}"></div>
            </div>
            <div class="flex justify-between text-[10px] text-gray-400 mt-1">
                <span id="quiz-progress-text">${savedState?.passed || usedAttempts >= maxAttempts ? "Completed" : "In Progress..."}</span>
                <span>${statusText}</span>
            </div>
        `;
    }
}

function renderCurrentQuestion() {
    const container = document.getElementById('quiz-questions-container');
    container.innerHTML = '';
    
    const q = currentQuizState.questions[currentQuizState.currentIndex];
    if (!q) return;

    const total = currentQuizState.questions.length;
    const currentAns = currentQuizState.userAnswers[q.id];

    const progBar = document.getElementById('quiz-progress-bar');
    const progTxt = document.getElementById('quiz-progress-text');
    if(progBar) progBar.style.width = `${((currentQuizState.currentIndex + 1) / total) * 100}%`;
    if(progTxt) progTxt.innerText = `Question ${currentQuizState.currentIndex + 1} of ${total}`;

    const html = `
        <div class="question-block animate-fade-in">
            <h3 class="font-bold text-xl text-white mb-6 leading-relaxed">
                <span class="text-yellow-500 ml-2">#${currentQuizState.currentIndex + 1}</span> ${q.question_text}
            </h3>
            <div class="space-y-3">
                ${['a', 'b', 'c', 'd'].map(opt => {
                    const optText = q[`option_${opt}`];
                    if (!optText) return '';
                    const isChecked = currentAns === opt ? 'checked' : '';
                    const activeClass = isChecked ? 'border-yellow-500 bg-yellow-500/10' : 'border-white/10 bg-black/40 hover:bg-white/5';
                    return `<label class="flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${activeClass}" onclick="window.selectAnswer('${q.id}', '${opt}')"><div class="w-6 h-6 rounded-full border-2 flex items-center justify-center ${isChecked ? 'border-yellow-500' : 'border-gray-500'}">${isChecked ? '<div class="w-3 h-3 bg-yellow-500 rounded-full"></div>' : ''}</div><span class="text-sm text-gray-200">${optText}</span></label>`;
                }).join('')}
            </div>
        </div>
        <div class="flex justify-between items-center mt-8 pt-6 border-t border-white/10">
            <button onclick="window.prevQuestion()" class="px-6 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-50" ${currentQuizState.currentIndex === 0 ? 'disabled' : ''}>Previous</button>
            ${currentQuizState.currentIndex === total - 1 ? 
                `<button onclick="window.submitQuiz()" class="px-8 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold shadow-lg">Submit Answers</button>` : 
                `<button onclick="window.nextQuestion()" class="px-6 py-2 rounded-lg bg-b-primary hover:bg-teal-600 text-white font-bold">Next Question</button>`
            }
        </div>
    `;
    container.innerHTML = html;
}

window.selectAnswer = async (qId, option) => {
    currentQuizState.userAnswers[qId] = option;
    renderCurrentQuestion();

    if(currentQuizState.metaData) {
        supabase.from('active_quiz_states')
            .update({ 
                user_answers: currentQuizState.userAnswers,
                updated_at: new Date()
            })
            .eq('quiz_id', currentQuizState.metaData.quiz_id)
            .eq('user_id', currentUserData.id)
            .then(); 
    }
};

window.nextQuestion = () => {
    if (currentQuizState.currentIndex < currentQuizState.questions.length - 1) {
        currentQuizState.currentIndex++;
        renderCurrentQuestion();
    }
};

window.prevQuestion = () => {
    if (currentQuizState.currentIndex > 0) {
        currentQuizState.currentIndex--;
        renderCurrentQuestion();
    }
};

window.submitQuiz = async () => {
    if (Object.keys(currentQuizState.userAnswers).length < currentQuizState.questions.length) {
        return showToast("Please answer all questions before submitting.", "warning");
    }

    openConfirmModal("Are you sure you want to submit your answers?", async () => {
        closeConfirmModal();

        const container = document.getElementById('quiz-questions-container');
        container.innerHTML = '<div class="text-center py-20 text-yellow-500"><i class="fas fa-spinner fa-spin text-4xl mb-4"></i><p>Grading...</p></div>';

        let correctCount = 0;
        currentQuizState.questions.forEach(q => {
            if (currentQuizState.userAnswers[q.id] === q.correct_answer.toLowerCase()) correctCount++;
        });

        const totalQuestions = currentQuizState.questions.length;
        const scorePercent = Math.round((correctCount / totalQuestions) * 100);
        const passingScoreLimit = currentQuizState.metaData.passing_score || 50;
        const passed = scorePercent >= passingScoreLimit;
        const xpEarned = passed ? Math.round((scorePercent / 100) * (currentQuizState.metaData.max_xp || 50)) : 0;

        try {
            await supabase.from('quiz_attempts').insert([{
                user_id: currentUserData.id,
                quiz_id: currentQuizState.metaData.quiz_id,
                score: scorePercent,
                passed: passed,
                answers: currentQuizState.userAnswers 
            }]);

            await supabase.from('active_quiz_states')
                .delete()
                .eq('quiz_id', currentQuizState.metaData.quiz_id)
                .eq('user_id', currentUserData.id);

            if (passed) {
                await markContentComplete(currentContent.content_id, xpEarned, 'quiz');
                showToast(`Passed! (${scorePercent}%) Earned ${xpEarned} XP`, "success");
            } else {
                showToast(`Failed. Score: ${scorePercent}%`, "error");
            }

            loadQuizViewer(currentQuizState.metaData.quiz_id);

        } catch (e) {
            console.error(e);
            showToast("Error saving result", "error");
            loadQuizViewer(currentQuizState.metaData.quiz_id);
        }
    });
};

window.showQuizReview = async (attemptIndex = 0) => {
    attemptIndex = parseInt(attemptIndex);
    const container = document.getElementById('quiz-questions-container');
    const attempts = currentQuizState.allAttempts;
    
    if (!attempts || attempts.length === 0) {
         container.innerHTML = `<div class="text-center py-10 text-gray-400">No review details available.</div>`;
         return;
    }

    container.innerHTML = '<div class="text-center py-20 text-yellow-500"><i class="fas fa-spinner fa-spin text-4xl mb-4"></i><p>Loading Review...</p></div>';

    const currentAttempt = attempts[attemptIndex];
    const userAnswers = currentAttempt.answers || {};
    
    const { data: allQuestions } = await supabase.from('quiz_questions')
        .select('*').eq('quiz_id', currentQuizState.metaData.quiz_id);
        
    const answeredQIds = Object.keys(userAnswers);
    const questions = (allQuestions || []).filter(q => answeredQIds.includes(q.id));

    const maxAttempts = currentQuizState.metaData.attempts_allowed || 3;
    const totalAttemptsMade = attempts.length;
    const overallPassed = attempts.some(a => a.passed);
    const canRetry = !overallPassed && (totalAttemptsMade < maxAttempts);

    let correctCount = 0;
    questions.forEach(q => {
        if (userAnswers[q.id] === String(q.correct_answer).toLowerCase()) correctCount++;
    });

    const totalQ = questions.length;
    const percentage = currentAttempt.score;
    const attemptPassed = currentAttempt.passed;
    const maxXp = currentQuizState.metaData.max_xp || 0;
    const earnedXp = attemptPassed ? Math.round((percentage / 100) * maxXp) : 0;

    let html = `
        <div class="bg-black/40 border ${attemptPassed ? 'border-green-500/50' : 'border-red-500/50'} rounded-2xl p-6 mb-6 flex flex-col items-center justify-center text-center shadow-lg relative overflow-hidden">
            <div class="absolute inset-0 opacity-10 ${attemptPassed ? 'bg-green-500' : 'bg-red-500'}"></div>
            <i class="fas ${attemptPassed ? 'fa-medal text-green-400' : 'fa-times-circle text-red-400'} text-5xl mb-4 relative z-10 drop-shadow-lg"></i>
            <h3 class="text-2xl font-black text-white mb-2 relative z-10">${attemptPassed ? 'عمل رائع! لقد اجتزت الاختبار' : 'لم تجتز الاختبار في هذه المحاولة'}</h3>
            
            <div class="flex flex-wrap justify-center gap-3 mt-4 relative z-10">
                <div class="bg-b-surface border border-white/10 rounded-xl px-5 py-3 shadow-inner">
                    <p class="text-[11px] text-gray-400 font-bold mb-1 uppercase tracking-wider">الإجابات الصحيحة</p>
                    <p class="text-xl font-black text-white">${correctCount} <span class="text-sm text-gray-500 font-normal">/ ${totalQ}</span></p>
                </div>
                <div class="bg-b-surface border border-white/10 rounded-xl px-5 py-3 shadow-inner">
                    <p class="text-[11px] text-gray-400 font-bold mb-1 uppercase tracking-wider">النتيجة</p>
                    <p class="text-xl font-black ${attemptPassed ? 'text-green-400' : 'text-red-400'}">${percentage}%</p>
                </div>
                <div class="bg-b-surface border border-white/10 rounded-xl px-5 py-3 shadow-inner">
                    <p class="text-[11px] text-gray-400 font-bold mb-1 uppercase tracking-wider">النقاط (XP)</p>
                    <p class="text-xl font-black text-yellow-500">+${earnedXp}</p>
                </div>
            </div>
        </div>
    `;

    if (attempts.length > 1) {
        html += `
        <div class="mb-6 flex items-center justify-between bg-b-surface p-4 rounded-xl border border-white/10 shadow-md">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400">
                    <i class="fas fa-history"></i>
                </div>
                <span class="text-sm font-bold text-white">سجل المحاولات السابقة:</span>
            </div>
            <select onchange="window.showQuizReview(this.value)" class="bg-black border border-white/20 rounded-xl text-sm font-bold text-gray-300 px-4 py-2 outline-none focus:border-b-primary transition-colors cursor-pointer dir-rtl">
                ${attempts.map((att, idx) => `
                    <option value="${idx}" ${idx === attemptIndex ? 'selected' : ''}>
                        المحاولة رقم ${attempts.length - idx} &nbsp;—&nbsp; ${att.passed ? 'ناجح ✅' : 'راسب ❌'} &nbsp;(${att.score}%)
                    </option>
                `).join('')}
            </select>
        </div>
        `;
    }

    html += `<div class="space-y-6 animate-fade-in">`;
    
    questions.forEach((q, idx) => {
        const userAns = userAnswers[q.id];
        const correctAns = String(q.correct_answer).toLowerCase();
        const isCorrect = userAns && String(userAns).toLowerCase() === correctAns;
        
        html += `
        <div class="bg-b-surface p-6 rounded-2xl border ${isCorrect ? 'border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.05)]' : 'border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.05)]'}">
            <div class="flex justify-between items-start mb-5">
                <h4 class="font-bold text-white text-lg leading-relaxed"><span class="text-gray-500 mr-1">${idx + 1}.</span> ${q.question_text}</h4>
                <span class="${isCorrect ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'} w-8 h-8 flex items-center justify-center rounded-full text-lg shrink-0 border ${isCorrect ? 'border-green-500/20' : 'border-red-500/20'}">
                    <i class="fas ${isCorrect ? 'fa-check' : 'fa-times'}"></i>
                </span>
            </div>
            <div class="space-y-3 mb-2">
                ${['a', 'b', 'c', 'd'].map(opt => {
                    const optText = q[`option_${opt}`];
                    if (!optText) return '';
                    
                    let styleClass = "border-white/5 bg-black/40 text-gray-400";
                    let iconHtml = '<div class="w-5 h-5 rounded-full border border-gray-600 mr-3 shrink-0"></div>';
                    
                    if (opt === correctAns) {
                        styleClass = "bg-green-900/20 border-green-500/50 text-green-300 font-bold";
                        iconHtml = '<div class="w-5 h-5 rounded-full bg-green-500 text-black flex items-center justify-center mr-3 shrink-0 text-[10px]"><i class="fas fa-check"></i></div>';
                    } else if (opt === userAns && !isCorrect) {
                        styleClass = "bg-red-900/20 border-red-500/50 text-red-300 line-through opacity-80";
                        iconHtml = '<div class="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center mr-3 shrink-0 text-[10px]"><i class="fas fa-times"></i></div>';
                    }
                    
                    return `
                    <div class="flex items-center p-4 rounded-xl border ${styleClass} text-sm transition-all">
                        ${iconHtml}
                        <span class="uppercase font-black text-xs opacity-50 mr-2 border-r border-current pr-2">${opt}</span> 
                        <span>${optText}</span>
                    </div>`;
                }).join('')}
            </div>
            ${!isCorrect && q.hint ? `
            <div class="mt-5 p-4 bg-blue-900/10 border border-blue-500/20 rounded-xl flex gap-3 items-start">
                <i class="fas fa-lightbulb text-yellow-400 mt-0.5 text-lg"></i> 
                <div>
                    <strong class="block text-xs text-blue-300 mb-1">تلميح لمساعدتك:</strong>
                    <span class="text-sm text-blue-100/70 leading-relaxed">${q.hint}</span>
                </div>
            </div>` : ''}
        </div>`;
    });

    html += `</div>`;

    html += `<div class="mt-10 flex flex-wrap justify-center gap-4 border-t border-white/10 pt-8">`;
    
    if (canRetry) {
        html += `
        <button onclick="window.retryQuiz()" class="px-8 py-3.5 rounded-xl bg-b-primary hover:bg-teal-600 text-white font-bold shadow-lg shadow-teal-900/20 flex items-center gap-2 transform hover:scale-105 transition-all">
            <i class="fas fa-redo"></i> بدء محاولة جديدة (${maxAttempts - totalAttemptsMade} متبقية)
        </button>`;
    } else if (overallPassed) {
        html += `<div class="text-green-400 font-bold px-8 py-3.5 border border-green-500/30 rounded-xl bg-green-500/10 flex items-center gap-2"><i class="fas fa-check-circle text-xl"></i> لقد استنفدت جميع المحاولات (النتيجة محسومة)</div>`;
    } else {
        html += `<div class="text-red-400 font-bold px-8 py-3.5 border border-red-500/30 rounded-xl bg-red-500/10 flex items-center gap-2"><i class="fas fa-lock text-xl"></i> لقد استنفدت جميع المحاولات المتاحة</div>`;
    }

    html += `</div>`;

    container.innerHTML = html;
};

window.retryQuiz = async () => {
    const quizId = currentQuizState.metaData.quiz_id;
    const attemptsCount = currentQuizState.allAttempts ? currentQuizState.allAttempts.length : 0;
    const maxAttempts = currentQuizState.metaData.attempts_allowed || 3;
    
    if(attemptsCount >= maxAttempts) return; 

    const container = document.getElementById('quiz-questions-container');
    container.innerHTML = '<div class="text-center py-20 text-yellow-500"><i class="fas fa-spinner fa-spin text-4xl mb-4"></i><p>Generating new questions...</p></div>';

    try {
        const { data: allQuestions } = await supabase.from('quiz_questions').select('*').eq('quiz_id', quizId);
        
        const shuffled = allQuestions.sort(() => 0.5 - Math.random());
        const showCount = currentQuizState.metaData.questions_to_show || allQuestions.length;
        const selectedQuestions = shuffled.slice(0, showCount);
        
        currentQuizState.questions = selectedQuestions;
        currentQuizState.userAnswers = {};
        currentQuizState.currentIndex = 0;
        currentQuizState.isReviewMode = false;

        await supabase.from('active_quiz_states').upsert({
            user_id: currentUserData.id,
            quiz_id: quizId,
            questions: selectedQuestions,
            user_answers: {},
            current_attempt: attemptsCount + 1,
            updated_at: new Date()
        }, { onConflict: 'user_id,quiz_id' });

        updateQuizHeaderStats(currentQuizState.metaData, { attempts_count: attemptsCount, passed: false });
        renderCurrentQuestion();
    } catch (e) {
        console.error(e);
        showToast("Error generating attempt", "error");
    }
};

// ==========================================
// 8. PROJECT MODULE
// ==========================================
async function loadProjectViewer(projectId) {
    const container = document.getElementById('project-container');
    const viewProj = document.getElementById('view-project');
    if(!viewProj) return; 
    
    try {
        const { data: project } = await supabase.from('projects').select('*').eq('id', projectId).single();
        if (!project) throw new Error("Project not found");

        const { data: sub } = await supabase.from('project_submissions')
            .select('*').eq('project_id', projectId).eq('user_id', currentUserData.id).maybeSingle();

        renderProjectUI(project, sub);

    } catch (e) {
        console.error(e);
        showToast("Error loading project", "error");
    }
}

function renderProjectUI(projectData, submissionData) {
    document.getElementById('project-title').innerText = projectData.title;
    document.getElementById('project-desc').innerHTML = projectData.description || "لا يوجد وصف.";
    document.getElementById('project-max-points').innerText = projectData.max_points || 100;

    const relatedLesson = courseContents.find(c => String(c.ref_project_id) === String(projectData.id));
    const lessonTag = document.getElementById('project-lesson-tag');
    if (relatedLesson) {
        lessonTag.innerText = `تابع لدرس: ${relatedLesson.title}`;
        lessonTag.classList.remove('hidden');
    } else {
        lessonTag.classList.add('hidden');
    }

    const reqBtn = document.getElementById('btn-project-requirements');
    if (projectData.requirements_url) {
        reqBtn.href = projectData.requirements_url;
        reqBtn.classList.remove('hidden');
        reqBtn.classList.add('flex');
    } else {
        reqBtn.classList.add('hidden');
    }

    renderRubric(projectData.rubric_json, submissionData);
    renderSubmissionCard(projectData, submissionData);
}

function renderRubric(rubricJson, submissionData) {
    const container = document.getElementById('project-rubric-container');
    container.innerHTML = '';

    let criteria = [];
    try {
        if (typeof rubricJson === 'string') {
            const parsed = JSON.parse(rubricJson);
            criteria = parsed.criteria || [];
        } else if (typeof rubricJson === 'object') {
            criteria = rubricJson?.criteria || [];
        }
    } catch (e) {
        container.innerHTML = '<p class="text-gray-500 text-sm">تفاصيل التقييم غير متاحة حالياً.</p>';
        return;
    }

    const isGraded = submissionData && (submissionData.status === 'graded' || submissionData.status === 'remarked');
    const studentScores = submissionData?.rubric_scores || {};

    criteria.forEach(item => {
        const studentScore = studentScores[item.aspect] || 0;
        const maxScore = item.points;
        
        let scoreColor = "text-gray-400";
        let icon = '<i class="fas fa-circle text-[6px] text-gray-600"></i>';
        
        if (isGraded) {
            if (studentScore === maxScore) {
                scoreColor = "text-green-400";
                icon = '<i class="fas fa-check-circle text-green-500"></i>';
            } else if (studentScore > 0) {
                scoreColor = "text-yellow-400";
                icon = '<i class="fas fa-exclamation-circle text-yellow-500"></i>';
            } else {
                scoreColor = "text-red-400";
                icon = '<i class="fas fa-times-circle text-red-500"></i>';
            }
        }

        const html = `
        <div class="bg-black/30 border border-white/5 rounded-xl p-4 flex justify-between items-center group hover:border-white/10 transition-colors">
            <div class="flex items-start gap-3">
                <div class="mt-1.5">${icon}</div>
                <div>
                    <h4 class="text-white font-bold text-sm">${item.aspect}</h4>
                    <p class="text-gray-400 text-xs mt-1 leading-relaxed">${item.description}</p>
                </div>
            </div>
            <div class="text-right min-w-[80px]">
                <div class="font-mono font-bold text-lg ${scoreColor}">
                    ${isGraded ? studentScore : maxScore}
                    <span class="text-[10px] text-gray-500">/ ${maxScore}</span>
                </div>
            </div>
        </div>`;
        container.innerHTML += html;
    });
}

function renderSubmissionCard(projectData, submissionData) {
    const container = document.getElementById('submission-card');
    const status = submissionData ? submissionData.status : 'new'; 

    if (status === 'graded' || status === 'remarked') {
        const grade = submissionData.grade || 0;
        const max = projectData.max_points || 100;
        const percent = Math.round((grade / max) * 100);
        let gradeColor = percent >= 50 ? 'text-green-400' : 'text-red-400';

        container.innerHTML = `
            <div class="text-center">
                <div class="w-20 h-20 mx-auto bg-black rounded-full flex items-center justify-center border-4 ${percent >= 50 ? 'border-green-500/30' : 'border-red-500/30'} mb-4 relative">
                    <span class="text-2xl font-bold ${gradeColor}">${grade}</span>
                    <span class="absolute text-[10px] text-gray-500 -bottom-6">من ${max}</span>
                </div>
                <h3 class="text-white font-bold text-lg mb-1">تم رصد الدرجة</h3>
                <p class="text-xs text-gray-400 mb-6">بواسطة: Leader</p>
                
                ${submissionData.feedback_text ? `
                <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-right mb-6">
                    <h5 class="text-yellow-500 text-xs font-bold mb-2"><i class="fas fa-comment-alt ml-1"></i> ملاحظات الليدر:</h5>
                    <p class="text-gray-300 text-sm leading-relaxed">"${submissionData.feedback_text}"</p>
                </div>` : ''}

                <div class="bg-white/5 rounded-lg p-3 text-xs text-gray-400 break-all border border-white/5">
                    <i class="fab fa-github mr-1"></i> رابطك: <a href="${submissionData.submission_link}" target="_blank" class="text-blue-400 hover:underline">فتح الرابط</a>
                </div>
            </div>
        `;
        return;
    }

    if (status === 'pending') {
        container.innerHTML = `
            <div class="text-center py-6">
                <div class="w-16 h-16 mx-auto bg-yellow-500/10 rounded-full flex items-center justify-center text-yellow-500 text-2xl mb-4 animate-pulse">
                    <i class="fas fa-clock"></i>
                </div>
                <h3 class="text-white font-bold text-lg mb-2">قيد المراجعة</h3>
                <p class="text-gray-400 text-xs mb-6 px-4">تم استلام مشروعك بنجاح. سيقوم الليدر بمراجعته ورصد الدرجة قريباً.</p>
                
                <div class="bg-black/30 rounded-xl p-3 border border-white/5 text-left mb-4">
                    <p class="text-[10px] text-gray-500 mb-1">تاريخ التسليم</p>
                    <p class="text-xs text-white font-mono">${new Date(submissionData.submitted_at).toLocaleDateString('ar-EG')}</p>
                </div>

                <div class="bg-white/5 rounded-lg p-3 text-xs text-gray-400 break-all border border-white/5">
                    <i class="fas fa-link mr-1"></i> <a href="${submissionData.submission_link}" target="_blank" class="text-blue-400 hover:underline">الرابط المرسل</a>
                </div>
                
                <button onclick="window.resubmitProject('${projectData.id}')" class="mt-4 text-xs text-gray-500 hover:text-white underline">
                    هل أرسلت رابط خطأ؟ إعادة التسليم
                </button>
            </div>
        `;
        return;
    }

    const methodText = projectData.submission_method || "GitHub Link or Google Drive";
    
    container.innerHTML = `
        <h3 class="text-white font-bold text-lg mb-4 flex items-center gap-2">
            <i class="fas fa-upload text-purple-500"></i> تسليم المشروع
        </h3>
        
        <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 mb-4 flex gap-3 items-start">
            <i class="fas fa-info-circle text-blue-400 mt-0.5 text-sm"></i>
            <div>
                <p class="text-xs text-gray-300 font-bold mb-1">تعليمات التسليم:</p>
                <p class="text-[11px] text-gray-400 leading-relaxed">${methodText}</p>
            </div>
        </div>

        <div class="bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-3 mb-6 flex gap-3 items-start">
            <i class="fas fa-exclamation-triangle text-yellow-500 mt-0.5 text-sm"></i>
            <p class="text-[10px] text-gray-400 leading-relaxed">
                تأكد من فتح صلاحيات الوصول (Access: Anyone with link) إذا كنت تستخدم Google Drive لتجنب رفض المشروع.
            </p>
        </div>

        <div class="space-y-4">
            <div>
                <label class="block text-xs text-gray-400 mb-1.5 font-bold">رابط المشروع (URL)</label>
                <input type="url" id="submission-url" placeholder="https://github.com/... or Drive Link" 
                       class="w-full bg-black border border-white/10 rounded-xl p-3 text-sm text-white focus:border-purple-500 outline-none transition-colors dir-ltr">
            </div>
            
            <button id="btn-submit-project-action" onclick="window.submitProjectAction('${projectData.id}', '${projectData.title}')" 
                    class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-purple-900/20 flex items-center justify-center gap-2">
                <i class="fas fa-paper-plane"></i> إرسال للمراجعة
            </button>
        </div>
    `;
}

window.submitProjectAction = async (projectId, projectTitle) => {
    const input = document.getElementById('submission-url');
    const btn = document.getElementById('btn-submit-project-action');
    const link = input.value.trim();

    if (!link || !link.startsWith('http')) {
        showToast("الرابط غير صالح، تأكد من بدايته بـ http/https", "error");
        input.focus();
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';

    try {
        const { error } = await supabase.from('project_submissions').upsert({
            user_id: currentUserData.id,
            project_id: projectId,
            submission_link: link,
            status: "pending"
        }, { onConflict: 'user_id,project_id' });

        if (error) throw error; // Stop execution if DB rejects submission

        await updateTaskStatus('completed'); 

        showToast("تم تسليم المشروع بنجاح!", "success");
        loadProjectViewer(projectId);

    } catch (e) {
        console.error("Submission Error:", e);
        showToast("حدث خطأ أثناء التسليم", "error");
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> إعادة المحاولة';
    }
};

window.resubmitProject = (projectId) => {
    openConfirmModal(
        "هل أنت متأكد من رغبتك في إعادة التسليم؟ سيتم إلغاء وحذف الرابط القديم نهائياً.",
        async () => {
            const container = document.getElementById('submission-card');
            container.innerHTML = '<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-purple-500 text-3xl"></i><p class="text-gray-400 mt-2 text-sm">جاري إلغاء التسليم السابق...</p></div>';
            document.getElementById('confirm-modal').classList.add('hidden');

            try {
                // Delete old submission
                const { error } = await supabase
                    .from('project_submissions')
                    .delete()
                    .eq('project_id', projectId)
                    .eq('user_id', currentUserData.id);

                if (error) throw error;

                showToast("تم إلغاء التسليم القديم. يمكنك إرسال رابطك الجديد الآن.", "success");
                
                // Reload UI from DB directly
                loadProjectViewer(projectId);

            } catch (error) {
                console.error("Delete Submission Error:", error);
                showToast("حدث خطأ أثناء إلغاء التسليم، حاول مرة أخرى.", "error");
                loadProjectViewer(projectId);
            }
        }
    );
};

// ==========================================
// 9. COMPLETION & PROGRESS SYNC
// ==========================================
async function markContentComplete(contentId, pointsEarned = 0, type = 'video') {
    if (!contentId) return;

    try {
        // Only insert video materials to completed table
if (item.type === 'video' || item.type === 'section') {
            const { data: existing } = await supabase
                .from('completed_materials')
                .select('id')
                .eq('user_id', currentUserData.id)
                .eq('material_id', contentId)
                .maybeSingle();

            if (existing) {
                isCurrentContentCompleted = true;
                return; 
            }

            const { error } = await supabase.from('completed_materials').insert([{
                user_id: currentUserData.id,
                material_id: contentId,
                course_id: courseId
            }]);

            if (error) {
                if (error.code === '23505' || error.code === '409') {
                    isCurrentContentCompleted = true;
                    return;
                }
                throw error;
            }
            isCurrentContentCompleted = true; 
        }

        // Award points (Video, Quiz, Project)
        if (pointsEarned > 0) {
            await awardPoints(pointsEarned, `Completed: ${currentContent?.title || type}`);
        }
        
        // Update UI completion checkmark
        renderSidebar(); 

        if (currentTaskId) {
            await updateTaskStatus('completed');
        }

    } catch (e) {
        console.error("Completion Sync Error:", e);
    }
}

async function updateTaskStatus(action) {
    if (!currentTaskId || !currentTeamId) return;
    try {
        const { data: task } = await supabase.from('team_tasks').select('stats').eq('id', currentTaskId).single();
        if (!task) return;

        let stats = task.stats || { started_count: 0, completed_count: 0, total_students: 0 };
        
        if (action === 'started') stats.started_count += 1;
        else if (action === 'completed') stats.completed_count += 1;

        await supabase.from('team_tasks').update({ stats: stats }).eq('id', currentTaskId);
    } catch (e) {}
}

async function recordTaskStart(contentId) {
    if (currentTaskId) await updateTaskStatus('started');
}

async function awardPoints(amount, reason) {
    if (!amount || amount <= 0) return;

    try {
        const newTotalXP = (currentUserData.total_xp || 0) + amount;
        await supabase.from('profiles').update({ total_xp: newTotalXP }).eq('id', currentUserData.id);
        currentUserData.total_xp = newTotalXP; 
        
        const elPoints = document.getElementById('stat-points');
        if(elPoints) elPoints.innerText = newTotalXP;

        await supabase.from('student_xp_logs').insert([{
            user_id: currentUserData.id,
            amount: amount,
            reason: reason,
            source_id: courseId
        }]);

        if (currentTeamId) {
            const { data: team } = await supabase.from('teams').select('total_score').eq('id', currentTeamId).single();
            if (team) {
                const newTeamScore = (team.total_score || 0) + amount;
                await supabase.from('teams').update({ total_score: newTeamScore }).eq('id', currentTeamId);
                await supabase.from('team_score_logs').insert([{
                    team_id: currentTeamId,
                    contributor_id: currentUserData.id,
                    amount: amount,
                    reason: `Contribution from: ${currentUserData.full_name || 'Student'}`
                }]);
            }
        }

    } catch (e) { console.error("Award Points Error:", e); }
}

function updateProgressBar(completedCount, totalCount) {
    if (totalCount === 0) return;
    const progress = Math.round((completedCount / totalCount) * 100);
    
    const txt = document.getElementById('total-progress-txt');
    const stat = document.getElementById('stat-completion');
    const bar = document.getElementById('total-progress-bar') || document.getElementById('course-progress-bar');
    
    if (txt) txt.innerText = `${progress}%`;
    if (stat) stat.innerText = `${progress}%`;
    if (bar) bar.style.width = `${progress}%`;

    supabase.from('enrollments').update({ 
        progress_percent: progress,
        is_completed: progress >= 100
    }).eq('user_id', currentUserData.id).eq('course_id', courseId).then();
}

// ==========================================
// 10. GLOBAL UTILS
// ==========================================
function resolveImageUrl(url, type = 'course') {
    try {
        if (!url || url.trim() === "" || url === "null" || url === "undefined") {
            return '../assets/icons/icon.jpg';
        }
        if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
            const idMatch = url.match(/\/d\/([-\w]{25,})/) || url.match(/id=([-\w]{25,})/);
            if (idMatch && idMatch[1]) {
                // 💡 استخدام السيرفر البديل والرسمي من جوجل المخصص لعرض الصور لتفادي 403
                return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
            }
        }
        if (url.includes('dropbox.com')) {
            return url.replace('?dl=0', '?raw=1');
        }
    } catch(e) {}
    return url;
}

function formatTime(seconds) {
    if (!seconds) return "00:00";
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

window.showToast = (message, type = 'info') => {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-4 left-4 z-50 flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const color = type === 'success' ? 'border-green-500 text-green-400' : type === 'error' ? 'border-red-500 text-red-400' : 'border-blue-500 text-blue-400';
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.className = `bg-gray-900 px-6 py-4 rounded-xl border-l-4 ${color} shadow-2xl backdrop-blur flex items-center gap-3 animate-slide-in min-w-[300px] mb-2`;
    toast.innerHTML = `<i class="fas ${icon} text-xl"></i><span class="text-white text-sm font-bold">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

window.openConfirmModal = (message, callback) => {
    const modal = document.getElementById('confirm-modal');
    if (!modal) {
        if (confirm(message)) callback();
        return;
    }
    const msgEl = document.getElementById('confirm-msg');
    const yesBtn = document.getElementById('btn-confirm-yes');

    if (msgEl) msgEl.innerText = message;
    
    const newBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newBtn, yesBtn);
    newBtn.addEventListener('click', () => {
        callback();
        window.closeConfirmModal();
    });
    modal.classList.remove('hidden');
};

window.closeConfirmModal = () => {
    document.getElementById('confirm-modal')?.classList.add('hidden');
};

function toggleFullscreen() {
    const wrapper = document.getElementById('video-wrapper') || document.getElementById('youtube-player-container');
    const header = document.getElementById('video-header');
    const icon = document.querySelector('#btn-fullscreen i');
    
    if (!document.fullscreenElement) {
        if (wrapper.requestFullscreen) {
            wrapper.requestFullscreen();
        } else if (wrapper.webkitRequestFullscreen) {
            wrapper.webkitRequestFullscreen();
        } else if (wrapper.msRequestFullscreen) { 
            wrapper.msRequestFullscreen();
        }
        if (header) header.classList.add('hidden');
        if (icon) { icon.classList.remove('fa-expand'); icon.classList.add('fa-compress'); }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { 
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { 
            document.msExitFullscreen();
        }
        if (header) header.classList.remove('hidden');
        if (icon) { icon.classList.remove('fa-compress'); icon.classList.add('fa-expand'); }
    }
}

// 💡 دالة إظهار وإخفاء القائمة الجانبية مع تمديد شاشة العرض
window.toggleSidebar = () => {
    const sidebar = document.getElementById('right-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const mainContent = document.getElementById('main-content'); // 💡 تم إضافة هذا المتغير
    
    if (!sidebar) return;

    // تبديل حالة القائمة (إظهار/إخفاء)
    sidebar.classList.toggle('translate-x-full');
    sidebar.classList.toggle('translate-x-0');
    
    // إظهار/إخفاء الطبقة السوداء في الموبايل
    if (overlay) overlay.classList.toggle('hidden');

    // 💡 الذكاء هنا: تمديد شاشة العرض لتأخذ الشاشة كاملة عند إغلاق القائمة في الديسكتوب
    if (mainContent) {
        mainContent.classList.toggle('lg:mr-80');
        mainContent.classList.toggle('lg:w-[calc(100%-20rem)]');
    }
};

window.goBackToDashboard = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = 'auth.html';
            return;
        }
        
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        const role = profile ? profile.role : 'student';
        
        if (role === 'leader' || role === 'Leader') {
            window.location.href = 'leader-dash.html';
        } else {
            window.location.href = 'student-dash.html';
        }
    } catch (error) {
        console.error("Navigation error:", error);
        window.location.href = 'student-dash.html';
    }
};