import { supabase } from './supabase-config.js';
import {
    mergeCurriculumLinks,
    buildCoursePlayerStructure,
    resolveTargetPlayableItem,
} from './curriculum-links-core.js';
import { fetchCourseCurriculumLinks } from './curriculum-links-service.js';
import { parseProjectLinks } from './quiz-prompt-core.js';

// ==========================================
// 1. CONFIGURATION & GLOBAL STATE
// ==========================================
let courseId = null;
let currentTaskId = null;
let currentContent = null;

// PDF.js State Variables
let pdfDoc = null;
let pdfPageNum = 1;
let pdfZoom = 1.0;
let pdfRotation = 0;
let pdfScrollMode = 'vertical'; 
let pdfIsDarkMode = false;
let pdfActiveSearchMatches = [];
let pdfCurrentSearchIndex = -1;
let pdfReadingTimer = null;
let pdfTimeSpent = 0;
let pageRenderStatus = {};
let pagesViewedSet = new Set();
let pdfCache = {};
let pdfAutoScrollInterval = null;
let pdfAutoScrollActive = false;
let pdfAutoScrollSpeed = 1.0;
let globalCompletedMaterialIds = [];
let globalCompletedQuizIds = [];
let globalCompletedProjectIds = [];
window.awardXp = async (amount, reason) => {
    if (typeof awardPoints === 'function') {
        await awardPoints(amount, reason);
    }
};

let courseData = null;
let courseContents = [];
let coursePlayerStructure = null;
let courseFlatPlayable = [];
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

// Preview Mode State
let isPreview = false;
let previewType = null;
let previewItemId = null;
let previewAttempts = [];
let previewActiveState = null;
let previewProjectSubmission = null;

// Helper to clean query params
function cleanParam(val) {
    if (!val) return null;
    const s = String(val).trim();
    if (s === '' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null;
    return s;
}

// ==========================================
// 2. INITIALIZATION & SETUP
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    initSpeedOptions();
    setupEventListeners();

    const urlParams = new URLSearchParams(window.location.search);
    isPreview = urlParams.get('preview') === 'true' || urlParams.get('mode') === 'preview';
    
    if (isPreview) {
        previewType = cleanParam(urlParams.get('type'));
        previewItemId = cleanParam(urlParams.get('id'));
        courseId = null;
        currentTaskId = null;
    } else {
        courseId = cleanParam(urlParams.get('id'));
        currentTaskId = cleanParam(urlParams.get('task_id'));
    }

    // Attempt to resolve courseId from team_tasks if task_id was supplied but id was missing or literal 'null'
    if (!courseId && currentTaskId) {
        try {
            const { data: tData } = await supabase
                .from('team_tasks')
                .select('course_id, content_id')
                .eq('id', currentTaskId)
                .maybeSingle();

            if (tData) {
                const resolvedCourseId = cleanParam(tData.course_id);
                if (resolvedCourseId) {
                    courseId = resolvedCourseId;
                }
            }
        } catch (err) {
            console.warn("Could not resolve course from task:", err);
        }
    }

    const rawContent = cleanParam(urlParams.get('content'));
    const isDocMode = rawContent && rawContent.startsWith('doc_');

    if (!courseId && !isPreview && !isDocMode) {
        showToast("Task or course parameter is invalid", "warning");
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

    // Ctrl + Mouse Wheel Zoom shortcut inside PDF viewport
    const pdfViewport = document.getElementById('pdf-viewport');
    if (pdfViewport) {
        pdfViewport.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                if (e.deltaY < 0) {
                    const newZoom = Math.min(3.0, pdfZoom + 0.1);
                    changePdfZoom(newZoom);
                } else {
                    const newZoom = Math.max(0.5, pdfZoom - 0.1);
                    changePdfZoom(newZoom);
                }
            }
        }, { passive: false });
    }

    window.addEventListener('beforeunload', () => {
        if (currentContent && currentContent.type === 'document') {
            saveDocumentProgress(currentContent, false);
        }
    });

    // Escape key listener to exit PDF fullscreen mode
    window.addEventListener('keydown', (e) => {
        const viewer = document.getElementById('view-document');
        if (!viewer || viewer.classList.contains('hidden')) return;

        if (e.key === 'Escape') {
            if (viewer.classList.contains('pdf-fullscreen-active')) {
                viewer.classList.remove('pdf-fullscreen-active');
                viewer.style.position = '';
                viewer.style.top = '';
                viewer.style.left = '';
                viewer.style.width = '';
                viewer.style.height = '';
                viewer.style.zIndex = '';
                viewer.style.borderRadius = '';
                
                const docHeader = document.getElementById('document-header');
                if (docHeader) {
                    docHeader.classList.remove('hidden');
                }
                
                const fsBtn = document.getElementById('pdf-fullscreen');
                const icon = fsBtn?.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-expand text-xs md:text-sm';
                }
                showToast("Exited fullscreen mode", "info");
            }
        } else {
            // Check if typing in search input
            if (document.activeElement && document.activeElement.id === 'pdf-search-input') return;

            // Page by page movement keys (Space, PageDown, PageUp)
            if (e.key === 'PageDown' || e.key === ' ') {
                if (pdfDoc && pdfPageNum < pdfDoc.numPages) {
                    e.preventDefault();
                    if (pdfAutoScrollActive) pausePdfAutoScroll();
                    scrollToPage(pdfPageNum + 1);
                }
            } else if (e.key === 'PageUp') {
                if (pdfDoc && pdfPageNum > 1) {
                    e.preventDefault();
                    if (pdfAutoScrollActive) pausePdfAutoScroll();
                    scrollToPage(pdfPageNum - 1);
                }
            }
        }
    });

    // Pause auto scroll on manual wheel or touch scroll
    const pdfViewportEl = document.getElementById('pdf-viewport');
    if (pdfViewportEl) {
        pdfViewportEl.addEventListener('wheel', () => {
            if (pdfAutoScrollActive) pausePdfAutoScroll();
        }, { passive: true });
        pdfViewportEl.addEventListener('touchstart', () => {
            if (pdfAutoScrollActive) pausePdfAutoScroll();
        }, { passive: true });
    }
}

function closeAllMenus() {
    document.getElementById('captions-menu')?.classList.add('hidden');
    document.getElementById('quality-menu')?.classList.add('hidden');
}

// ==========================================
// 3. DATA FETCHING & SYNCING
// ==========================================
async function getCourseTitleForPreview(type, refId) {
    try {
        const idCol = type === 'quiz' ? 'ref_quiz_id' : 'ref_project_id';
        const { data } = await supabase
            .from('course_materials')
            .select('course_id, courses(title)')
            .eq(idCol, refId)
            .limit(1)
            .maybeSingle();
        
        if (data && data.courses) {
            return data.courses.title;
        }
    } catch (e) {
        console.error("Error fetching course title for preview:", e);
    }
    return "General / Unlinked";
}

function showPreviewBanner() {
    let banner = document.getElementById('preview-mode-banner');
    if (!banner) {
        const mainEl = document.querySelector('main');
        if (!mainEl) return;
        
        banner = document.createElement('div');
        banner.id = 'preview-mode-banner';
        banner.className = 'bg-gradient-to-r from-yellow-500/20 via-yellow-500/30 to-yellow-500/20 border-b border-yellow-500/40 text-yellow-300 px-6 py-3 text-center font-bold text-sm tracking-wide z-[9999] flex items-center justify-between gap-2 select-none shadow-md shrink-0';
        banner.innerHTML = `
            <div class="flex items-center gap-2 mx-auto">
                <i class="fas fa-eye animate-pulse text-yellow-500"></i>
                <span>Preview Mode — No data or attempts will be saved to the database</span>
            </div>
            <button onclick="window.goBackToDashboard()" class="bg-yellow-500 text-black hover:bg-yellow-600 px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow shrink-0">
                <i class="fas fa-arrow-left"></i>
                Exit Preview
            </button>
        `;
        mainEl.insertBefore(banner, mainEl.firstChild);
    }
}

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

        if (isPreview) {
            // Adjust layouts for preview mode
            const mainEl = document.querySelector('main');
            if (mainEl) {
                mainEl.className = "relative w-full h-[100dvh] flex flex-col transition-all duration-300 overflow-hidden";
            }
            document.getElementById('right-sidebar')?.classList.add('hidden');
            const leftSidebar = document.querySelector('aside:not([id])');
            if (leftSidebar) leftSidebar.classList.add('hidden');
            document.getElementById('sidebar-overlay')?.classList.add('hidden');

            // Hide toggle sidebar and back buttons on mobile/header
            document.querySelectorAll('.lg\\:hidden').forEach(el => el.classList.add('hidden'));

            // Inject the premium preview mode banner at the top of main
            showPreviewBanner();

            // Override goBackToDashboard
            window.goBackToDashboard = () => {
                if (window.opener || window.history.length === 1) {
                    window.close();
                } else {
                    window.location.href = "../admin/html/admin-dash.html";
                }
            };

            // Load content directly
            if (previewType === 'quiz') {
                const viewQuiz = document.getElementById('view-quiz');
                if (viewQuiz) {
                    viewQuiz.classList.remove('hidden');
                    viewQuiz.classList.add('flex-1', 'min-h-0');
                    viewQuiz.classList.remove('h-full');
                }
                currentContent = { type: 'quiz', ref_quiz_id: previewItemId };
                await loadQuizViewer(previewItemId);
            } else if (previewType === 'project') {
                const viewProject = document.getElementById('view-project');
                if (viewProject) {
                    viewProject.classList.remove('hidden');
                    viewProject.classList.add('flex-1', 'min-h-0');
                    viewProject.classList.remove('h-full');
                }
                currentContent = { type: 'project', ref_project_id: previewItemId };
                await loadProjectViewer(previewItemId);
            }
            return;
        }

        let targetContentId = cleanParam(new URLSearchParams(window.location.search).get('content'));

        // Check if targetContentId is document-only mode
        let isDocOnlyMode = false;
        let docData = null;
        if (targetContentId && targetContentId.startsWith('doc_')) {
            const docId = targetContentId.replace('doc_', '');
            const { data } = await supabase.from('curriculum_documents').select('*, tracks(name), phases(title)').eq('id', docId).maybeSingle();
            if (data) {
                docData = data;
                if (!courseId) {
                    isDocOnlyMode = true;
                    courseId = cleanParam(data.course_id);
                }
            }
        }

        let course = null;
        if (courseId) {
            const { data: cData, error: courseErr } = await supabase.from('courses').select('*').eq('course_id', courseId).maybeSingle();
            if (!courseErr && cData) {
                course = cData;
                courseData = course;
            }
        }

        if (!course && docData) {
            course = { title: docData.title };
            courseData = course;
        }

        if (!course && !isPreview) {
            showToast("Requested course was not found", "error");
            setTimeout(() => window.location.href = "student-dash.html", 2000);
            return;
        }

        // Load recommended tools for this course
        if (courseId) {
            loadCourseRecommendedTools(courseId);
        }
        if (courseId || targetContentId) {
            loadCourseSuggestedReferences(courseId, targetContentId);
        }
        
        const courseTitleEl = document.getElementById('course-title');
        if (courseTitleEl && course) courseTitleEl.innerText = course.title || "Course Player";

        let materials = [];
        if (courseId) {
            const { data: mats, error: matErr } = await supabase
                .from('course_materials')
                .select('*')
                .eq('course_id', courseId)
                .order('order_index', { ascending: true });
            
            if (!matErr) materials = mats || [];
        }
        // Fetch multi-links for this course and all of its lessons (gracefully falls back if table not yet created)
        const materialIds = materials.map(m => m.content_id).filter(Boolean);
        const { tableLinks, tableReady } = courseId
            ? await fetchCourseCurriculumLinks(supabase, courseId, materialIds)
            : { tableLinks: [], tableReady: false };

        // Fetch documents linked via legacy course_id OR via curriculum_links
        let documents = [];
        const linkedDocIds = Array.from(new Set(
            (tableLinks || []).filter(l => l.item_type === 'document' && l.item_id).map(l => String(l.item_id))
        ));

        if (courseId) {
            const { data: docsData } = await supabase
                .from('curriculum_documents')
                .select('*, tracks(name), phases(title)')
                .eq('course_id', courseId)
                .order('order_index', { ascending: true });
            documents = docsData || [];
        }

        const existingDocIds = new Set(documents.map(d => String(d.id)));
        const missingDocIds = linkedDocIds.filter(id => !existingDocIds.has(id));
        if (missingDocIds.length > 0) {
            const { data: extraDocs } = await supabase
                .from('curriculum_documents')
                .select('*, tracks(name), phases(title)')
                .in('id', missingDocIds);
            if (extraDocs && extraDocs.length > 0) {
                documents = [...documents, ...extraDocs];
            }
        }

        if (isDocOnlyMode && docData && documents.findIndex(d => String(d.id) === String(docData.id)) === -1) {
            documents.push(docData);
        }

        const mergedLinks = mergeCurriculumLinks({
            tableLinks,
            materials,
            documents,
            tableReady,
        });

        // Gather ALL quiz & project IDs from both legacy columns and multi-links
        const quizIdSet = new Set(materials.map(c => c.ref_quiz_id).filter(Boolean).map(String));
        const projectIdSet = new Set(materials.map(c => c.ref_project_id).filter(Boolean).map(String));
        mergedLinks.forEach(l => {
            if (l.item_type === 'quiz' && l.item_id) quizIdSet.add(String(l.item_id));
            if (l.item_type === 'project' && l.item_id) projectIdSet.add(String(l.item_id));
        });

        const quizIds = Array.from(quizIdSet);
        const projectIds = Array.from(projectIdSet);

        if (quizIds.length > 0) {
            const { data: qData } = await supabase.from('quizzes').select('quiz_id, title, max_xp').in('quiz_id', quizIds);
            if (qData) quizzesLookup = qData.reduce((acc, q) => ({ ...acc, [q.quiz_id]: q }), {});
        }
        if (projectIds.length > 0) {
            const { data: pData } = await supabase.from('projects').select('id, title, max_points').in('id', projectIds);
            if (pData) projectsLookup = pData.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
        }

        const documentsLookup = documents.reduce((acc, d) => {
            acc[d.id] = d;
            return acc;
        }, {});

        coursePlayerStructure = buildCoursePlayerStructure({
            courseId,
            materials,
            mergedLinks,
            quizzesLookup,
            projectsLookup,
            documentsLookup,
        });

        courseContents = coursePlayerStructure.orderedMaterials;
        courseFlatPlayable = coursePlayerStructure.flatPlayable;

        if (isDocOnlyMode && courseFlatPlayable.length === 0 && docData) {
            const standaloneDoc = {
                content_id: `doc_${docData.id}`,
                unique_playlist_id: `doc_${docData.id}`,
                course_id: null,
                title: docData.title,
                type: 'document',
                base_xp: docData.xp_reward,
                rawDoc: docData,
            };
            courseContents = [standaloneDoc];
            courseFlatPlayable = [standaloneDoc];
            coursePlayerStructure = {
                orderedMaterials: [standaloneDoc],
                lessonAttachmentsMap: {},
                courseAttachments: { quizzes: [], projects: [], documents: [] },
                flatPlayable: [standaloneDoc],
            };
        }

        await ensureUserEnrolled();

        if (!targetContentId && currentTaskId) {
            const { data: taskData } = await supabase
                .from('team_tasks')
                .select('content_id')
                .eq('id', currentTaskId)
                .maybeSingle();

            if (taskData) {
                const cId = cleanParam(taskData.content_id);
                if (cId) {
                    targetContentId = cId;
                }
            }
        }

        // Restore last opened item in this course (video, quiz, project, document)
        if (!targetContentId && courseId) {
            const savedContentId = localStorage.getItem(`zdc_course_last_content_${courseId}`) || localStorage.getItem(`busla_course_last_content_${courseId}`);
            if (savedContentId) {
                targetContentId = cleanParam(savedContentId);
            }
        }

        // SMART RESOLVER: Identify target content across videos, multi-linked quizzes/projects/docs, and course-level attachments
        if (targetContentId) {
            const resolved = resolveTargetPlayableItem(courseFlatPlayable, targetContentId);
            if (resolved) {
                currentContent = resolved;
            }
        }

        if (!currentContent && courseFlatPlayable.length > 0) {
            currentContent = courseFlatPlayable[0];
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
    if (!courseId || courseId === 'null' || courseId === 'undefined' || !currentUserData?.id) return;
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

function isContentCompleted(item) {
    if (!item) return false;
    if (item.type === 'quiz') {
        return globalCompletedQuizIds.includes(item.ref_quiz_id);
    }
    if (item.type === 'project') {
        return globalCompletedProjectIds.includes(item.ref_project_id);
    }
    return globalCompletedMaterialIds.includes(item.content_id);
}
window.isContentCompleted = isContentCompleted;

function isContentLocked(item) {
    if (isPreview) return false;
    if (currentUserData && ['leader', 'admin', 'owner', 'master admin', 'content manager'].includes(String(currentUserData.role).toLowerCase())) {
        return false;
    }
    const list = courseFlatPlayable.length > 0 ? courseFlatPlayable : courseContents;
    const itemKey = item.unique_playlist_id || item.content_id;
    const currentIndex = list.findIndex(c => (c.unique_playlist_id || c.content_id) === itemKey);
    if (currentIndex <= 0) return false;
    for (let i = 0; i < currentIndex; i++) {
        const prev = list[i];
        if (prev.type === 'section') continue;
        if (!isContentCompleted(prev)) {
            return true;
        }
    }
    return false;
}
window.isContentLocked = isContentLocked;

// ==========================================
// 4. SIDEBAR RENDERING & NAVIGATION
// ==========================================
async function renderSidebar() {
    const container = document.getElementById('playlist-container') || document.getElementById('playlist-items');
    if (!container) return;

    const { data: completedMats } = await supabase.from('completed_materials').select('material_id').eq('user_id', currentUserData.id);
    const { data: passedQuizzes } = await supabase.from('quiz_attempts').select('quiz_id').eq('user_id', currentUserData.id).eq('passed', true);
    const { data: submittedProjects } = await supabase.from('project_submissions').select('project_id').eq('user_id', currentUserData.id).in('status', ['graded', 'remarked']);
    const completedMaterialIds = (completedMats || []).map(row => row.material_id);
    const completedQuizIds = (passedQuizzes || []).map(row => row.quiz_id);
    const completedProjectIds = (submittedProjects || []).map(row => row.project_id);

    globalCompletedMaterialIds = completedMaterialIds;
    globalCompletedQuizIds = completedQuizIds;
    globalCompletedProjectIds = completedProjectIds;

    container.innerHTML = '';
    let totalItemsCount = 0;
    let completedCount = 0;
    let mainIndex = 1;

    const lessonAttMap = coursePlayerStructure?.lessonAttachmentsMap || {};
    const courseAtt = coursePlayerStructure?.courseAttachments || { quizzes: [], projects: [], documents: [] };

    const isItemActiveMatch = (candidate) => {
        if (!currentContent || !candidate) return false;
        const currKey = currentContent.unique_playlist_id || currentContent.content_id;
        const candKey = candidate.unique_playlist_id || candidate.content_id;
        return String(currKey) === String(candKey);
    };

    // Default container for lessons without sections
    let currentSectionBody = container;

    courseContents.forEach((item, index) => {
        // 1. Render Sections
        if (item.type === 'section') {
            const sectionId = `section-${item.content_id}`;

            let hasActiveContent = false;
            for (let i = index; i < courseContents.length; i++) {
                if (i !== index && courseContents[i].type === 'section') break;
                const mat = courseContents[i];
                if (isItemActiveMatch(mat)) hasActiveContent = true;
                const att = lessonAttMap[mat.content_id];
                if (att) {
                    if ([...att.documents, ...att.quizzes, ...att.projects].some(isItemActiveMatch)) {
                        hasActiveContent = true;
                    }
                }
            }

            const shouldBeOpen = hasActiveContent || index === 0;

            const sectionHTML = `
                <div class="mt-4 mb-2 animate-fade-in">
                    <button onclick="window.togglePlaylistSection('${sectionId}')" class="w-full flex justify-between items-center p-3 bg-gradient-to-r from-b-surface to-black border border-white/10 hover:border-b-primary/50 rounded-xl transition-all group shadow-md">
                        <span class="font-bold text-white text-sm group-hover:text-b-primary transition-colors flex items-center gap-3 text-left leading-tight">
                            <div class="w-7 h-7 rounded-lg bg-b-primary/20 text-b-primary flex items-center justify-center text-xs border border-b-primary/30 shrink-0">
                                <i class="fas fa-folder-open"></i>
                            </div>
                            ${item.title}
                        </span>
                        <div class="w-7 h-7 shrink-0 rounded-full bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-white transition-colors">
                            <i class="fas fa-chevron-down text-xs transition-transform duration-300 ${shouldBeOpen ? 'rotate-180' : ''}" id="icon-${sectionId}"></i>
                        </div>
                    </button>
                    <div id="body-${sectionId}" class="section-body mt-3 space-y-1.5 transition-all overflow-hidden ${shouldBeOpen ? '' : 'hidden'} pl-4 border-l-2 border-white/5 ml-3">
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', sectionHTML);
            currentSectionBody = document.getElementById(`body-${sectionId}`);
        }

        // 2. Render Lesson or Document
        const isCompleted = isContentCompleted(item);
        const isChild = currentSectionBody !== container;

        renderSidebarItem(currentSectionBody, item, mainIndex, isCompleted, isChild);

        totalItemsCount++;
        if (isCompleted) completedCount++;
        mainIndex++;

        // 3. Render Lesson Attachments
        const att = lessonAttMap[item.content_id];
        if (att) {
            (att.documents || []).forEach(docItem => {
                const isDocCompleted = isContentCompleted(docItem);
                renderSidebarItem(currentSectionBody, docItem, '', isDocCompleted, true);
                totalItemsCount++;
                if (isDocCompleted) completedCount++;
            });

            (att.quizzes || []).forEach(quizItem => {
                const isQuizCompleted = isContentCompleted(quizItem);
                renderSidebarItem(currentSectionBody, quizItem, '', isQuizCompleted, true);
                totalItemsCount++;
                if (isQuizCompleted) completedCount++;
            });

            (att.projects || []).forEach(projectItem => {
                const isProjectCompleted = isContentCompleted(projectItem);
                renderSidebarItem(currentSectionBody, projectItem, '', isProjectCompleted, true);
                totalItemsCount++;
                if (isProjectCompleted) completedCount++;
            });
        }
    });

    // 4. Render Course-Level Attachments & Assessments
    const allCourseAttachments = [
        ...(courseAtt.documents || []),
        ...(courseAtt.quizzes || []),
        ...(courseAtt.projects || []),
    ];

    if (allCourseAttachments.length > 0) {
        const sectionId = `section-course-attachments-${courseId || 'global'}`;
        const hasActiveCourseAtt = allCourseAttachments.some(isItemActiveMatch);
        const shouldBeOpen = hasActiveCourseAtt || courseContents.length === 0 || true;

        const courseAttHtml = `
            <div class="mt-5 mb-2 animate-fade-in" data-testid="course-level-attachments-section">
                <button type="button" onclick="window.togglePlaylistSection('${sectionId}')" class="w-full flex justify-between items-center p-3 bg-gradient-to-r from-b-primary/15 to-black/70 border border-b-primary/30 hover:border-b-primary/60 rounded-xl transition-all group shadow-md">
                    <span class="font-bold text-white text-xs group-hover:text-teal-300 transition-colors flex items-center gap-2.5 text-left leading-tight">
                        <div class="w-7 h-7 rounded-lg bg-b-primary/20 text-teal-300 flex items-center justify-center text-xs border border-b-primary/30 shrink-0">
                            <i class="fas fa-layer-group"></i>
                        </div>
                        <span>Course Attachments & Assessments (${allCourseAttachments.length})</span>
                    </span>
                    <div class="w-7 h-7 shrink-0 rounded-full bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-white transition-colors">
                        <i class="fas fa-chevron-down text-xs transition-transform duration-300 ${shouldBeOpen ? 'rotate-180' : ''}" id="icon-${sectionId}"></i>
                    </div>
                </button>
                <div id="body-${sectionId}" class="section-body mt-2.5 space-y-1.5 transition-all overflow-hidden ${shouldBeOpen ? '' : 'hidden'}">
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', courseAttHtml);
        const courseAttBody = document.getElementById(`body-${sectionId}`);

        allCourseAttachments.forEach(attItem => {
            const isAttCompleted = isContentCompleted(attItem);
            renderSidebarItem(courseAttBody, attItem, mainIndex, isAttCompleted, false);
            totalItemsCount++;
            if (isAttCompleted) completedCount++;
            mainIndex++;
        });
    }

    updateProgressBar(completedCount, totalItemsCount);
}

// Toggle section folders
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
        const currKey = currentContent.unique_playlist_id || currentContent.content_id;
        const itemKey = item.unique_playlist_id || item.content_id;
        if (String(currKey) === String(itemKey)) {
            isActive = true;
        }
    }

    let icon = "fa-play";
    let typeColor = "text-gray-400";
    let typeLabel = "Video";

    if (item.type === 'quiz') { icon = "fa-clipboard-question"; typeColor = "text-yellow-500"; typeLabel = "Quiz"; }
    if (item.type === 'project') { icon = "fa-laptop-code"; typeColor = "text-purple-500"; typeLabel = "Project"; }
    if (item.type === 'document') { icon = "fa-file-pdf"; typeColor = "text-cyan-400"; typeLabel = "Document"; }

    const isLocked = isContentLocked(item);
    let iconHtml = '';
    let circleBgClass = 'bg-black/50 ';
    
    if (isCompleted) {
        iconHtml = '<i class="fas fa-check"></i>';
        circleBgClass += 'bg-green-500/20 text-green-500';
    } else if (isLocked) {
        iconHtml = '<i class="fas fa-lock text-gray-500"></i>';
        circleBgClass += 'bg-black/60 text-gray-600 border-white/5 opacity-55';
    } else {
        iconHtml = `<i class="fas ${icon}"></i>`;
        circleBgClass += typeColor;
    }

    const baseClasses = "flex items-center gap-3 p-3 cursor-pointer transition-all relative rounded-xl mb-1.5";
    const activeClasses = isActive 
        ? "bg-b-primary/20 border border-b-primary/50 shadow-[0_0_15px_rgba(0,106,103,0.15)]" 
        : "bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10";
    const childClasses = isChild ? "ml-5 mr-2 scale-[0.98] border-l-2 border-l-white/10" : "";
    
    const connectorHtml = isChild ? `<div class="absolute -left-3 top-1/2 w-3 h-[2px] bg-white/10"></div>` : '';
    
    const displayTitle = isChild ? item.title : `<span class="text-gray-500 font-mono mr-1">${indexStr}.</span> ${item.title}`;

    const safeEncodedItem = encodeURIComponent(JSON.stringify(item)).replace(/'/g, "%27");

    const html = `
        <div onclick="window.switchContentObj('${safeEncodedItem}')" 
             class="${baseClasses} ${activeClasses} ${childClasses} ${isLocked ? 'opacity-55 cursor-not-allowed' : ''} group">
            ${connectorHtml}
            <div class="w-8 h-8 rounded-full ${circleBgClass} flex items-center justify-center shrink-0 text-[10px] ${!isLocked ? 'group-hover:scale-110' : ''} transition-transform border border-white/5">
                ${iconHtml}
            </div>
            <div class="flex-1 min-w-0">
                <h4 class="text-xs font-bold ${isActive ? 'text-white' : (isChild ? 'text-gray-300' : 'text-gray-200')} truncate ${!isLocked ? 'group-hover:text-b-primary' : ''} transition-colors leading-tight">${displayTitle}</h4>
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
        
        if (isContentLocked(item)) {
            showToast("This content is locked. Please complete the previous item first.", "warning");
            return;
        }

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
    // 1. Auto-close sidebar on mobile
    if (window.innerWidth < 1024) {
        const sidebar = document.getElementById('right-sidebar');
        if (sidebar && sidebar.classList.contains('translate-x-0')) {
            if (typeof window.toggleSidebar === 'function') {
                window.toggleSidebar();
            }
        }
    }

    if (!item) return;

    // Save previous document progress before switching
    if (pdfReadingTimer) {
        clearInterval(pdfReadingTimer);
        pdfReadingTimer = null;
    }
    pageRenderStatus = {};

    if (currentContent && currentContent.type === 'document') {
        if (docSaveTimeout) clearTimeout(docSaveTimeout);
        await saveDocumentProgress(currentContent, false);
    }

    if (currentContent && (currentContent.type === 'video' || currentContent.type === 'section') && player && typeof player.getCurrentTime === 'function') {
        await saveVideoState(false);
    }

    // Always clean up player and clear intervals when switching content
    if (player) {
        if (typeof player.destroy === 'function') {
            try { player.destroy(); } catch (e) { console.error("Error destroying player on switch:", e); }
        }
        player = null;
    }
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    if (dbSaveInterval) {
        clearInterval(dbSaveInterval);
        dbSaveInterval = null;
    }

    currentContent = item;

    // Save last active item to localStorage and update URL
    if (item && item.content_id) {
        if (courseId) {
            localStorage.setItem(`zdc_course_last_content_${courseId}`, item.content_id);
        }
        localStorage.setItem('zdc_last_played_course', courseId || '');
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('content', item.content_id);
            if (courseId) url.searchParams.set('id', courseId);
            window.history.replaceState(null, '', url.toString());
        } catch (e) {}
    }

    updateVideoHeader(item);
    recordTaskStart(item.content_id);
    loadCourseSuggestedReferences(courseId, item.content_id);

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

    // 3. Launch appropriate content player
    if (item.type === 'video' || item.type === 'section') {
        document.getElementById('view-video')?.classList.remove('hidden');
        document.getElementById('video-header')?.classList.remove('hidden');
        if (progressPanel) progressPanel.classList.remove('hidden');
        
        loadVideo(item.video_id, 0, isCurrentContentCompleted, 1);
        
    } else if (item.type === 'document') {
        document.getElementById('view-document')?.classList.remove('hidden');
        if (progressPanel) progressPanel.classList.add('hidden');
        initDocumentViewer(item);
        
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
function detectVideoSource(source) {
    if (!source) return { type: 'unknown', value: '' };
    source = source.toString().trim();

    // 1. Google Drive
    if (source.includes('drive.google.com') || source.includes('drive.usercontent.google.com')) {
        const idMatch = source.match(/\/d\/([-\w]{25,})/) || source.match(/id=([-\w]{25,})/);
        if (idMatch && idMatch[1]) {
            return { type: 'drive', id: idMatch[1], url: `https://drive.google.com/file/d/${idMatch[1]}/preview` };
        }
    }

    // 2. YouTube
    const ytIdRegex = /^[-\w]{11}$/;
    if (ytIdRegex.test(source)) {
        return { type: 'youtube', id: source };
    }
    if (source.includes('youtube.com') || source.includes('youtu.be')) {
        let ytId = source;
        if (ytId.includes('v=')) ytId = ytId.split('v=')[1];
        if (ytId.includes('&')) ytId = ytId.split('&')[0];
        if (ytId.includes('youtu.be/')) ytId = ytId.split('youtu.be/')[1];
        if (ytId.includes('embed/')) ytId = ytId.split('embed/')[1];
        if (ytId.includes('?')) ytId = ytId.split('?')[0];
        return { type: 'youtube', id: ytId.trim() };
    }

    // 3. Direct/Other URL (e.g. mp4, webm)
    if (source.startsWith('http://') || source.startsWith('https://')) {
        return { type: 'direct', url: source };
    }

    // Fallback: assume youtube ID
    return { type: 'youtube', id: source };
}

function setupIframeControls(isCompleted) {
    const btnIframeComplete = document.getElementById('btn-iframe-complete');
    if (!btnIframeComplete) return;

    if (isCompleted) {
        btnIframeComplete.disabled = true;
        btnIframeComplete.className = "px-6 py-2.5 rounded-xl bg-green-500/20 text-green-400 border border-green-500/30 font-bold text-sm cursor-not-allowed flex items-center gap-2";
        btnIframeComplete.innerHTML = '<i class="fas fa-check-circle"></i> <span>Video Completed</span>';
    } else {
        btnIframeComplete.disabled = false;
        btnIframeComplete.className = "px-6 py-2.5 rounded-xl bg-b-primary text-white font-bold text-sm hover:bg-teal-600 transition flex items-center gap-2 shadow-lg cursor-pointer";
        btnIframeComplete.innerHTML = '<i class="fas fa-check-circle"></i> <span>Mark Video Complete & Claim XP</span>';
        btnIframeComplete.onclick = async () => {
            const points = currentContent.base_xp || 10;
            await markContentComplete(currentContent.content_id, points, 'video');
            setupIframeControls(true);
        };
    }
}

function loadVideo(videoId, startSeconds = 0, isCompleted = false, savedSpeed = 1) {
    if (!videoId) return;

    const source = detectVideoSource(videoId);

    // If YouTube video, require YouTube API
    if (source.type === 'youtube') {
        if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
            setTimeout(() => loadVideo(videoId, startSeconds, isCompleted, savedSpeed), 500);
            return;
        }
    }

    // Destroy existing player
    if (player) {
        if (typeof player.destroy === 'function') {
            try { player.destroy(); } catch (e) { console.error("Error destroying player:", e); }
        }
        player = null;
    }

    // Clean player-container (clear iframe, video, etc.)
    const playerContainer = document.getElementById('player-container');
    if (playerContainer) {
        const overlay = document.getElementById('video-overlay');
        playerContainer.innerHTML = '';
        if (overlay) {
            playerContainer.appendChild(overlay);
        } else {
            const newOverlay = document.createElement('div');
            newOverlay.id = 'video-overlay';
            newOverlay.className = 'absolute inset-0 z-10 bg-transparent hidden';
            playerContainer.appendChild(newOverlay);
        }
    }

    const overlay = document.getElementById('video-overlay');
    const controlsBar = document.getElementById('video-controls-bar');
    const iframeBar = document.getElementById('iframe-controls-bar');
    const btnQual = document.getElementById('btn-quality');
    const btnCap = document.getElementById('btn-captions');

    // 1. YouTube Player
    if (source.type === 'youtube') {
        if (overlay) {
            if (isCompleted) {
                overlay.classList.add('hidden');
                overlay.style.pointerEvents = "none";
            } else {
                overlay.classList.remove('hidden');
                overlay.style.pointerEvents = "auto";
            }
        }

        if (controlsBar) controlsBar.classList.remove('hidden');
        if (iframeBar) iframeBar.classList.add('hidden');
        if (btnQual) btnQual.classList.remove('hidden');
        if (btnCap) btnCap.classList.remove('hidden');

        if (playerContainer) {
            const ytPlayerDiv = document.createElement('div');
            ytPlayerDiv.id = 'youtube-player';
            ytPlayerDiv.className = 'w-full h-full';
            playerContainer.insertBefore(ytPlayerDiv, overlay);
        }

        const desiredControlsState = isCompleted ? 1 : 0;
        const playerVars = {
            'controls': desiredControlsState,
            'disablekb': isCompleted ? 0 : 1,
            'rel': 0,
            'modestbranding': 1,
            'enablejsapi': 1,
            'cc_load_policy': 1,
            'playsinline': 1,
            'start': Math.floor(startSeconds)
        };
        if (window.location.origin && window.location.origin !== 'null') {
            playerVars.origin = window.location.origin;
        }

        currentPlayerControlsState = desiredControlsState;
        try {
            player = new YT.Player('youtube-player', {
                height: '100%',
                width: '100%',
                videoId: source.id,
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
    // 2. Direct MP4/WebM Video (HTML5 Player)
    else if (source.type === 'direct') {
        if (overlay) {
            if (isCompleted) {
                overlay.classList.add('hidden');
                overlay.style.pointerEvents = "none";
            } else {
                overlay.classList.remove('hidden');
                overlay.style.pointerEvents = "auto";
            }
        }

        if (controlsBar) controlsBar.classList.remove('hidden');
        if (iframeBar) iframeBar.classList.add('hidden');
        if (btnQual) btnQual.classList.add('hidden');
        if (btnCap) btnCap.classList.add('hidden');

        let videoEl;
        if (playerContainer) {
            videoEl = document.createElement('video');
            videoEl.id = 'custom-html5-player';
            videoEl.className = 'w-full h-full object-contain';
            videoEl.setAttribute('playsinline', '');
            playerContainer.insertBefore(videoEl, overlay);
        }

        if (videoEl) {
            videoEl.src = source.url;
            videoEl.currentTime = startSeconds;
            videoEl.playbackRate = parseFloat(savedSpeed) || 1;
            videoEl.load();

            player = {
                type: 'html5',
                playVideo: () => videoEl.play(),
                pauseVideo: () => videoEl.pause(),
                getCurrentTime: () => videoEl.currentTime,
                getDuration: () => videoEl.duration || 0,
                seekTo: (seconds) => { videoEl.currentTime = seconds; },
                setPlaybackRate: (rate) => { videoEl.playbackRate = rate; },
                getPlaybackRate: () => videoEl.playbackRate,
                getPlayerState: () => videoEl.paused ? 2 : 1,
                getAvailableQualityLevels: () => [],
                getOption: () => null,
                getVideoData: () => ({ video_id: videoId }),
                destroy: () => {
                    videoEl.pause();
                    videoEl.remove();
                }
            };

            // Hook events to sync controls
            videoEl.onplay = () => {
                const btnIcon = document.querySelector('#btn-play i');
                if (btnIcon) btnIcon.className = "fas fa-pause";
                
                clearInterval(progressInterval);
                progressInterval = setInterval(trackVideoProgress, 1000);
            };

            videoEl.onpause = () => {
                const btnIcon = document.querySelector('#btn-play i');
                if (btnIcon) btnIcon.className = "fas fa-play";
                clearInterval(progressInterval);
            };

            videoEl.onended = async () => {
                if (!isCurrentContentCompleted) {
                    await saveVideoState(true);
                }
            };

            videoEl.onloadedmetadata = () => {
                currentVideoDuration = videoEl.duration || 100;
                document.getElementById('time-duration').innerText = formatTime(currentVideoDuration);
            };

            const speedSelect = document.getElementById('playback-speed');
            if (speedSelect) {
                speedSelect.value = parseFloat(savedSpeed) || 1;
                speedSelect.onchange = (e) => {
                    player.setPlaybackRate(parseFloat(e.target.value));
                };
            }

            const btnPlay = document.getElementById('btn-play');
            if (btnPlay) {
                btnPlay.onclick = () => {
                    if (videoEl.paused) videoEl.play();
                    else videoEl.pause();
                };
            }

            // Start intervals immediately for progress updates
            clearInterval(progressInterval);
            clearInterval(dbSaveInterval);
            progressInterval = setInterval(trackVideoProgress, 1000);
            dbSaveInterval = setInterval(() => saveVideoState(false), 30000);
        }
    } 
    // 3. Google Drive / Iframe Player
    else if (source.type === 'drive') {
        // ALWAYS hide overlay for iframes so clicks reach the video
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.style.pointerEvents = "none";
        }

        if (controlsBar) controlsBar.classList.add('hidden');
        if (iframeBar) iframeBar.classList.remove('hidden');

        if (playerContainer) {
            const iframeEl = document.createElement('iframe');
            iframeEl.id = 'drive-iframe-player';
            iframeEl.src = source.url;
            iframeEl.className = 'w-full h-full border-0';
            iframeEl.setAttribute('allow', 'autoplay; encrypted-media');
            iframeEl.setAttribute('allowfullscreen', '');
            playerContainer.insertBefore(iframeEl, overlay);
        }

        player = {
            type: 'drive',
            playVideo: () => {},
            pauseVideo: () => {},
            getCurrentTime: () => 0,
            getDuration: () => 0,
            seekTo: () => {},
            setPlaybackRate: () => {},
            getPlaybackRate: () => 1,
            getPlayerState: () => 2,
            getAvailableQualityLevels: () => [],
            getOption: () => null,
            getVideoData: () => ({ video_id: videoId }),
            destroy: () => {
                const iframe = document.getElementById('drive-iframe-player');
                if (iframe) iframe.remove();
            }
        };

        // Configure manual watch confirmation button
        setupIframeControls(isCompleted);
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
async function showQuizLandingPage(quiz) {
    const container = document.getElementById('quiz-questions-container');
    if(!container) return;

    container.innerHTML = '<div class="text-center py-20 text-yellow-500"><i class="fas fa-spinner fa-spin text-4xl mb-4"></i><p>Loading Quiz Details...</p></div>';

    let qCount = quiz.questions_to_show;
    try {
        if (!qCount) {
            const { count } = await supabase.from('quiz_questions').select('id', { count: 'exact', head: true }).eq('quiz_id', quiz.quiz_id);
            qCount = count || 0;
        }
    } catch (e) {
        console.error(e);
        qCount = 0;
    }

    const courseTitle = await getCourseTitleForPreview('quiz', quiz.quiz_id);
    const maxAttempts = quiz.attempts_allowed || 3;
    const passingScore = quiz.passing_score || 50;
    const maxXP = quiz.max_xp || 50;

    container.innerHTML = `
        <div class="bg-b-surface border border-white/10 rounded-2xl p-6 md:p-8 text-center max-w-xl mx-auto space-y-6 animate-fade-in shadow-2xl">
            <div class="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto border border-yellow-500/20 text-yellow-500 text-3xl">
                <i class="fas fa-clipboard-question"></i>
            </div>
            <div>
                <h2 class="text-2xl font-bold text-white mb-2">${quiz.title}</h2>
                <p class="text-gray-400 text-sm leading-relaxed">${quiz.description || 'No description provided for this quiz.'}</p>
            </div>
            <div class="grid grid-cols-2 gap-3 text-left">
                <div class="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between">
                    <span class="text-[10px] text-gray-500 font-bold mb-1">Course / Subject</span>
                    <span class="text-white font-bold text-sm truncate" title="${courseTitle}"><i class="fas fa-book text-yellow-500 mr-1 text-xs"></i> ${courseTitle}</span>
                </div>
                <div class="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between">
                    <span class="text-[10px] text-gray-500 font-bold mb-1">Questions</span>
                    <span class="text-white font-bold text-sm"><i class="fas fa-list-ol text-yellow-500 mr-1 text-xs"></i> ${qCount} Questions</span>
                </div>
                <div class="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between">
                    <span class="text-[10px] text-gray-500 font-bold mb-1">Allowed Attempts</span>
                    <span class="text-white font-bold text-sm"><i class="fas fa-redo text-yellow-500 mr-1 text-xs"></i> ${maxAttempts} Attempts</span>
                </div>
                <div class="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between">
                    <span class="text-[10px] text-gray-500 font-bold mb-1">Max XP</span>
                    <span class="text-white font-bold text-sm"><i class="fas fa-trophy text-yellow-500 mr-1 text-xs"></i> ${maxXP} XP</span>
                </div>
                <div class="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between col-span-2">
                    <span class="text-[10px] text-gray-500 font-bold mb-1">Passing Score</span>
                    <span class="text-white font-bold text-sm"><i class="fas fa-check-circle text-yellow-500 mr-1 text-xs"></i> ${passingScore}%</span>
                </div>
            </div>
            <button onclick="window.retryQuiz()" class="w-full py-4 rounded-xl bg-yellow-600 hover:bg-yellow-700 text-white font-bold transition-all shadow-lg shadow-yellow-900/20 flex items-center justify-center gap-2 text-base">
                <i class="fas fa-play text-sm"></i>
                <span>Start Quiz</span>
            </button>
        </div>
    `;
}

async function loadQuizViewer(quizId) {
    const container = document.getElementById('quiz-questions-container');
    if(!container) return;
    
    container.innerHTML = '<div class="text-center py-20 text-yellow-500"><i class="fas fa-spinner fa-spin text-4xl mb-4"></i><p>Loading Quiz...</p></div>';

    try {
        const { data: quiz } = await supabase.from('quizzes').select('*').eq('quiz_id', quizId).single();
        if (!quiz) throw new Error("Quiz not found");

        let attempts = [];
        if (isPreview) {
            attempts = previewAttempts;
        } else {
            const { data: dbAttempts } = await supabase.from('quiz_attempts')
                .select('*').eq('quiz_id', quizId).eq('user_id', currentUserData.id)
                .order('submitted_at', { ascending: false });
            attempts = dbAttempts || [];
        }

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

        let activeState = null;
        if (isPreview) {
            activeState = previewActiveState;
        } else {
            const { data: dbActiveState } = await supabase.from('active_quiz_states')
                .select('*').eq('quiz_id', quizId).eq('user_id', currentUserData.id).maybeSingle();
            activeState = dbActiveState;
        }

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

        await showQuizLandingPage(quiz);

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
                `<button type="button" id="btn-submit-quiz-action" onclick="window.submitQuiz()" class="px-8 py-3 rounded-xl bg-b-primary hover:bg-teal-600 text-white font-bold shadow-lg flex items-center gap-2 transition-all hover:scale-105"><i class="fas fa-paper-plane"></i> <span>Submit Answers</span></button>` : 
                `<button type="button" onclick="window.nextQuestion()" class="px-6 py-2.5 rounded-xl bg-b-primary hover:bg-teal-600 text-white font-bold transition-all">Next Question <i class="fas fa-chevron-right text-xs ml-1"></i></button>`
            }
        </div>
    `;
    container.innerHTML = html;
}

window.selectAnswer = async (qId, option) => {
    currentQuizState.userAnswers[qId] = option;
    renderCurrentQuestion();

    if(currentQuizState.metaData) {
        if (isPreview) {
            if (!previewActiveState) {
                previewActiveState = {
                    quiz_id: currentQuizState.metaData.quiz_id,
                    questions: currentQuizState.questions,
                    user_answers: {}
                };
            }
            previewActiveState.user_answers = currentQuizState.userAnswers;
        } else {
            supabase.from('active_quiz_states')
                .update({ 
                    user_answers: currentQuizState.userAnswers,
                    updated_at: new Date()
                })
                .eq('quiz_id', currentQuizState.metaData.quiz_id)
                .eq('user_id', currentUserData.id)
                .then(); 
        }
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
    const totalQuestions = (currentQuizState.questions || []).length;
    if (totalQuestions === 0) return;

    if (Object.keys(currentQuizState.userAnswers).length < totalQuestions) {
        return showToast("Please answer all questions before submitting.", "warning");
    }

    window.showCustomConfirm(
        "Submit Quiz",
        "Are you sure you want to submit your answers and finish this quiz?",
        async () => {
            const container = document.getElementById('quiz-questions-container');
            if (container) {
                container.innerHTML = '<div class="text-center py-20 text-yellow-500"><i class="fas fa-spinner fa-spin text-4xl mb-4"></i><p class="font-bold text-lg">Grading and saving your result...</p></div>';
            }

            try {
                let correctCount = 0;
                currentQuizState.questions.forEach(q => {
                    const userAns = String(currentQuizState.userAnswers[q.id] || '').trim().toLowerCase();
                    const correctAns = String(q.correct_answer || '').trim().toLowerCase();
                    if (userAns && userAns === correctAns) correctCount++;
                });

                const scorePercent = Math.round((correctCount / totalQuestions) * 100);
                const passingScoreLimit = currentQuizState.metaData?.passing_score || 50;
                const passed = scorePercent >= passingScoreLimit;
                const xpEarned = passed ? Math.round((scorePercent / 100) * (currentQuizState.metaData?.max_xp || 50)) : 0;
                const attemptNum = (currentQuizState.allAttempts ? currentQuizState.allAttempts.length : 0) + 1;

                if (isPreview) {
                    previewAttempts.unshift({
                        quiz_id: currentQuizState.metaData.quiz_id,
                        score: scorePercent,
                        passed: passed,
                        answers: JSON.parse(JSON.stringify(currentQuizState.userAnswers)),
                        submitted_at: new Date().toISOString()
                    });
                    previewActiveState = null;

                    if (passed) {
                        showToast(`Congratulations! You passed with ${scorePercent}% and earned ${xpEarned} XP (Preview)`, "success");
                    } else {
                        showToast(`You did not pass this attempt. Score: ${scorePercent}% (Preview)`, "error");
                    }
                } else {
                    const { error: insertErr } = await supabase.from('quiz_attempts').insert([{
                        user_id: currentUserData.id,
                        quiz_id: currentQuizState.metaData.quiz_id,
                        score: scorePercent,
                        passed: passed,
                        attempt_number: attemptNum,
                        answers: currentQuizState.userAnswers 
                    }]);

                    if (insertErr) {
                        console.error("quiz_attempts insert error:", insertErr);
                        throw insertErr;
                    }

                    await supabase.from('active_quiz_states')
                        .delete()
                        .eq('quiz_id', currentQuizState.metaData.quiz_id)
                        .eq('user_id', currentUserData.id);

                    if (passed) {
                        const targetContentId = currentContent?.content_id || `quiz_${currentQuizState.metaData.quiz_id}`;
                        await markContentComplete(targetContentId, xpEarned, 'quiz');
                        showToast(`Congratulations! You passed with ${scorePercent}% and earned ${xpEarned} XP`, "success");
                    } else {
                        showToast(`You did not pass this attempt. Score: ${scorePercent}%`, "error");
                    }
                }

                await loadQuizViewer(currentQuizState.metaData.quiz_id);

            } catch (e) {
                console.error("Quiz submission error:", e);
                showToast("Error saving quiz result: " + (e.message || "Unknown error"), "error");
                await loadQuizViewer(currentQuizState.metaData.quiz_id);
            }
        },
        null,
        'warning'
    );
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
            <h3 class="text-2xl font-black text-white mb-2 relative z-10">${attemptPassed ? 'Great job! You passed the quiz' : 'You did not pass this attempt'}</h3>
            
            <div class="flex flex-wrap justify-center gap-3 mt-4 relative z-10">
                <div class="bg-b-surface border border-white/10 rounded-xl px-5 py-3 shadow-inner">
                    <p class="text-[11px] text-gray-400 font-bold mb-1 uppercase tracking-wider">Correct Answers</p>
                    <p class="text-xl font-black text-white">${correctCount} <span class="text-sm text-gray-500 font-normal">/ ${totalQ}</span></p>
                </div>
                <div class="bg-b-surface border border-white/10 rounded-xl px-5 py-3 shadow-inner">
                    <p class="text-[11px] text-gray-400 font-bold mb-1 uppercase tracking-wider">Score</p>
                    <p class="text-xl font-black ${attemptPassed ? 'text-green-400' : 'text-red-400'}">${percentage}%</p>
                </div>
                <div class="bg-b-surface border border-white/10 rounded-xl px-5 py-3 shadow-inner">
                    <p class="text-[11px] text-gray-400 font-bold mb-1 uppercase tracking-wider">Earned XP</p>
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
                <span class="text-sm font-bold text-white">Previous Attempts:</span>
            </div>
            <select onchange="window.showQuizReview(this.value)" class="bg-black border border-white/20 rounded-xl text-sm font-bold text-gray-300 px-4 py-2 outline-none focus:border-b-primary transition-colors cursor-pointer">
                ${attempts.map((att, idx) => `
                    <option value="${idx}" ${idx === attemptIndex ? 'selected' : ''}>
                        Attempt #${attempts.length - idx} — ${att.passed ? 'Passed' : 'Failed'} (${att.score}%)
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
                    <strong class="block text-xs text-blue-300 mb-1">Helpful Hint:</strong>
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
            <i class="fas fa-redo"></i> Start New Attempt (${maxAttempts - totalAttemptsMade} remaining)
        </button>`;
    } else if (overallPassed) {
        html += `<div class="text-green-400 font-bold px-8 py-3.5 border border-green-500/30 rounded-xl bg-green-500/10 flex items-center gap-2"><i class="fas fa-check-circle text-xl"></i> Quiz Passed — Result Finalized</div>`;
    } else {
        html += `<div class="text-red-400 font-bold px-8 py-3.5 border border-red-500/30 rounded-xl bg-red-500/10 flex items-center gap-2"><i class="fas fa-lock text-xl"></i> You have used all available attempts</div>`;
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

        if (isPreview) {
            previewActiveState = {
                quiz_id: quizId,
                questions: selectedQuestions,
                user_answers: {},
                current_attempt: attemptsCount + 1
            };
        } else {
            await supabase.from('active_quiz_states').upsert({
                user_id: currentUserData.id,
                quiz_id: quizId,
                questions: selectedQuestions,
                user_answers: {},
                current_attempt: attemptsCount + 1,
                updated_at: new Date()
            }, { onConflict: 'user_id,quiz_id' });
        }

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

        let sub = null;
        if (isPreview) {
            sub = previewProjectSubmission;
        } else {
            const { data: dbSub } = await supabase.from('project_submissions')
                .select('*').eq('project_id', projectId).eq('user_id', currentUserData.id).maybeSingle();
            sub = dbSub;
        }

        renderProjectUI(project, sub);

    } catch (e) {
        console.error(e);
        showToast("Error loading project", "error");
    }
}

function renderProjectUI(projectData, submissionData) {
    document.getElementById('project-title').innerText = projectData.title;
    document.getElementById('project-desc').innerHTML = projectData.description || "No description provided.";
    document.getElementById('project-max-points').innerText = projectData.max_points || 100;

    const lessonTag = document.getElementById('project-lesson-tag');
    if (isPreview) {
        getCourseTitleForPreview('project', projectData.id).then(courseTitle => {
            if (lessonTag) {
                lessonTag.innerText = `Course: ${courseTitle}`;
                lessonTag.classList.remove('hidden');
            }
        });
    } else {
        let relatedLesson = null;
        if (currentContent?.parent_content_id) {
            relatedLesson = courseContents.find(c => String(c.content_id) === String(currentContent.parent_content_id));
        }
        if (!relatedLesson && !currentContent?.is_course_level) {
            relatedLesson = courseContents.find(c => String(c.ref_project_id) === String(projectData.id));
        }
        if (relatedLesson) {
            lessonTag.innerText = `Lesson: ${relatedLesson.title}`;
            lessonTag.classList.remove('hidden');
        } else if (currentContent?.is_course_level && courseData?.title) {
            lessonTag.innerText = `Course: ${courseData.title}`;
            lessonTag.classList.remove('hidden');
        } else {
            lessonTag.classList.add('hidden');
        }
    }

    const reqBtn = document.getElementById('btn-project-requirements');
    const reqLinksWrap = document.getElementById('project-requirements-links');
    const parsedLinks = parseProjectLinks(projectData.requirements_url);
    if (reqLinksWrap) {
        if (parsedLinks.length > 0) {
            const escAttr = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            reqLinksWrap.innerHTML = parsedLinks.map((lnk) => `
                <a href="${escAttr(lnk.url)}" target="_blank" rel="noopener noreferrer" class="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-purple-500/15 text-white text-xs md:text-sm font-bold border border-white/10 hover:border-purple-500/35 transition-all inline-flex items-center gap-2">
                    <i class="fas fa-external-link-alt text-purple-400 text-xs"></i>
                    <span>${escAttr(lnk.title)}</span>
                </a>
            `).join('');
            reqLinksWrap.classList.remove('hidden');
            reqLinksWrap.classList.add('flex');
        } else {
            reqLinksWrap.innerHTML = '';
            reqLinksWrap.classList.add('hidden');
            reqLinksWrap.classList.remove('flex');
        }
        if (reqBtn) {
            reqBtn.classList.add('hidden');
            reqBtn.classList.remove('flex');
        }
    } else if (reqBtn) {
        if (parsedLinks.length > 0) {
            reqBtn.href = parsedLinks[0].url;
            reqBtn.classList.remove('hidden');
            reqBtn.classList.add('flex');
        } else {
            reqBtn.classList.add('hidden');
            reqBtn.classList.remove('flex');
        }
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
        container.innerHTML = '<p class="text-gray-500 text-sm">Evaluation rubric is currently unavailable.</p>';
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
                    <span class="absolute text-[10px] text-gray-500 -bottom-6">of ${max}</span>
                </div>
                <h3 class="text-white font-bold text-lg mb-1">Graded</h3>
                <p class="text-xs text-gray-400 mb-6">Reviewed by: Leader</p>
                
                ${submissionData.feedback_text ? `
                <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-left mb-6">
                    <h5 class="text-yellow-500 text-xs font-bold mb-2"><i class="fas fa-comment-alt mr-1"></i> Leader Feedback:</h5>
                    <p class="text-gray-300 text-sm leading-relaxed">"${submissionData.feedback_text}"</p>
                </div>` : ''}

                <div class="bg-white/5 rounded-lg p-3 text-xs text-gray-400 break-all border border-white/5">
                    <i class="fab fa-github mr-1"></i> Your Link: <a href="${submissionData.submission_link}" target="_blank" class="text-blue-400 hover:underline">Open Submission</a>
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
                <h3 class="text-white font-bold text-lg mb-2">Under Review</h3>
                <p class="text-gray-400 text-xs mb-6 px-4">Your project has been received. Your team leader will review and grade it soon.</p>
                
                <div class="bg-black/30 rounded-xl p-3 border border-white/5 text-left mb-4">
                    <p class="text-[10px] text-gray-500 mb-1">Submitted On</p>
                    <p class="text-xs text-white font-mono">${new Date(submissionData.submitted_at).toLocaleDateString('en-US')}</p>
                </div>

                <div class="bg-white/5 rounded-lg p-3 text-xs text-gray-400 break-all border border-white/5">
                    <i class="fas fa-link mr-1"></i> <a href="${submissionData.submission_link}" target="_blank" class="text-blue-400 hover:underline">Submitted Link</a>
                </div>
                
                <button onclick="window.resubmitProject('${projectData.id}')" class="mt-4 text-xs text-gray-500 hover:text-white underline">
                    Submitted the wrong link? Resubmit
                </button>
            </div>
        `;
        return;
    }

    const methodText = projectData.submission_method || "GitHub Link or Google Drive";
    
    container.innerHTML = `
        <h3 class="text-white font-bold text-lg mb-4 flex items-center gap-2">
            <i class="fas fa-upload text-purple-500"></i> Submit Project
        </h3>
        
        <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 mb-4 flex gap-3 items-start">
            <i class="fas fa-info-circle text-blue-400 mt-0.5 text-sm"></i>
            <div>
                <p class="text-xs text-gray-300 font-bold mb-1">Submission Guidelines:</p>
                <p class="text-[11px] text-gray-400 leading-relaxed">${methodText}</p>
            </div>
        </div>

        <div class="bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-3 mb-6 flex gap-3 items-start">
            <i class="fas fa-exclamation-triangle text-yellow-500 mt-0.5 text-sm"></i>
            <p class="text-[10px] text-gray-400 leading-relaxed">
                Make sure link sharing is enabled ("Anyone with the link") if submitting via Google Drive to avoid rejection.
            </p>
        </div>

        <div class="space-y-4">
            <div>
                <label class="block text-xs text-gray-400 mb-1.5 font-bold">Project URL</label>
                <input type="url" id="submission-url" placeholder="https://github.com/... or Google Drive Link" 
                       class="w-full bg-black border border-white/10 rounded-xl p-3 text-sm text-white focus:border-purple-500 outline-none transition-colors">
            </div>
            
            <button id="btn-submit-project-action" onclick="window.submitProjectAction('${projectData.id}', '${projectData.title}')" 
                    class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-purple-900/20 flex items-center justify-center gap-2">
                <i class="fas fa-paper-plane"></i> Submit for Review
            </button>
        </div>
    `;
}

window.submitProjectAction = async (projectId, projectTitle) => {
    const input = document.getElementById('submission-url');
    const btn = document.getElementById('btn-submit-project-action');
    const link = input.value.trim();

    if (!link || !link.startsWith('http')) {
        showToast("Invalid URL — please make sure it starts with http:// or https://", "error");
        input.focus();
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

    try {
        if (isPreview) {
            previewProjectSubmission = {
                project_id: projectId,
                submission_link: link,
                status: "pending",
                submitted_at: new Date().toISOString()
            };
            showToast("Project submitted successfully (Preview)!", "success");
            loadProjectViewer(projectId);
        } else {
            const { error } = await supabase.from('project_submissions').upsert({
                user_id: currentUserData.id,
                project_id: projectId,
                submission_link: link,
                status: "pending"
            }, { onConflict: 'user_id,project_id' });

            if (error) throw error;

            await updateTaskStatus('completed'); 

            showToast("Project submitted successfully!", "success");
            loadProjectViewer(projectId);
        }

    } catch (e) {
        console.error("Submission Error:", e);
        showToast("An error occurred while submitting", "error");
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Try Again';
    }
};

window.resubmitProject = (projectId) => {
    window.showCustomConfirm(
        "Resubmit Project",
        "Are you sure you want to resubmit? Your previous submission link will be permanently removed.",
        async () => {
            const container = document.getElementById('submission-card');
            container.innerHTML = '<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-purple-500 text-3xl"></i><p class="text-gray-400 mt-2 text-sm">Removing previous submission...</p></div>';

            try {
                if (isPreview) {
                    previewProjectSubmission = null;
                    showToast("Previous submission removed. You can submit a new link now (Preview).", "success");
                    loadProjectViewer(projectId);
                } else {
                    const { error } = await supabase
                        .from('project_submissions')
                        .delete()
                        .eq('project_id', projectId)
                        .eq('user_id', currentUserData.id);

                    if (error) throw error;

                    showToast("Previous submission removed. You can submit a new link now.", "success");
                    
                    loadProjectViewer(projectId);
                }

            } catch (error) {
                console.error("Delete Submission Error:", error);
                showToast("Error removing previous submission. Please try again.", "error");
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
        if (type === 'video' || type === 'section') {
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
            return '../assets/icons/zdc-icon-192.png';
        }
        if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
            const idMatch = url.match(/\/d\/([-\w]{25,})/) || url.match(/id=([-\w]{25,})/);
            if (idMatch && idMatch[1]) {
                // Use Google's direct image endpoint to avoid 403 errors
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
        container.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none';
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
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// openConfirmModal and closeConfirmModal are now managed globally by custom-dialogs.js

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

// Toggle left-docked curriculum sidebar and expand main stage on desktop
window.toggleSidebar = () => {
    const sidebar = document.getElementById('right-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const mainContent = document.getElementById('main-content');
    
    if (!sidebar) return;

    // Toggle slide state for left-docked sidebar
    sidebar.classList.toggle('-translate-x-full');
    sidebar.classList.toggle('translate-x-0');
    
    // Toggle mobile backdrop overlay
    if (overlay) overlay.classList.toggle('hidden');

    // Expand main content to full width when sidebar is closed on desktop
    if (mainContent) {
        mainContent.classList.toggle('lg:ml-80');
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

/**
 * Fetches and renders the published tools recommended for the current course.
 * @param {string} cId - Course ID
 */
async function loadCourseRecommendedTools(cId) {
    const card = document.getElementById('course-recommended-tools-card');
    const list = document.getElementById('course-recommended-tools-list');
    if (!card || !list) return;

    try {
        const { data, error } = await supabase
            .from('tools')
            .select('*')
            .contains('course_ids', [String(cId)])
            .eq('status', 'Published')
            .order('order_index', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            card.classList.add('hidden');
            card.classList.remove('flex');
            return;
        }

        card.classList.remove('hidden');
        card.classList.add('flex');
        
        list.innerHTML = data.map(tool => {
            const impBadge = tool.importance === 'Required' ? 'bg-red-500/10 text-red-400 border-red-500/25' : tool.importance === 'Recommended' ? 'bg-teal-500/10 text-teal-400 border-teal-500/25' : 'bg-gray-500/10 text-gray-400 border-gray-500/25';
            const importanceName = tool.importance === 'Required' ? 'Required' : tool.importance === 'Recommended' ? 'Recommended' : 'Optional';
            return `
                <div onclick="if (typeof window.openToolDetailDrawer === 'function') { window.openToolDetailDrawer('${tool.id}'); } else { window.open('${tool.official_website || '#'}', '_blank'); }" 
                     class="w-full text-left text-xs bg-white/5 border border-white/10 hover:border-teal-500/50 hover:bg-white/10 p-2.5 rounded-xl cursor-pointer flex items-center justify-between transition-all group">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <div class="w-7 h-7 bg-white/5 rounded-lg border border-white/5 flex items-center justify-center overflow-hidden shrink-0">
                            <img src="${tool.logo_url || '../assets/icons/zdc-icon-192.png'}" class="w-full h-full object-contain p-0.5" onerror="this.onerror=null; this.src='../assets/icons/zdc-icon-192.png'">
                        </div>
                        <div class="text-left truncate">
                            <span class="text-white font-bold block group-hover:text-teal-400 transition-colors text-[11px] truncate">${tool.name}</span>
                            <span class="text-[8px] text-gray-500 block truncate mt-0.5">${tool.type}</span>
                        </div>
                    </div>
                    <span class="text-[8px] border px-1.5 py-0.5 rounded font-black shrink-0 ${impBadge}">${importanceName}</span>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error("loadCourseRecommendedTools error:", err);
        card.classList.add('hidden');
        card.classList.remove('flex');
    }
}

/**
 * Fetches and renders suggested references for the current course or active lesson/content.
 * @param {string} cId - Course ID
 * @param {string} contentId - Content ID / Lesson ID (optional)
 */
async function loadCourseSuggestedReferences(cId, contentId = null) {
    const card = document.getElementById('course-suggested-references-card');
    const list = document.getElementById('course-suggested-references-list');
    if (!card || !list) return;

    if (!cId && !contentId) {
        card.classList.add('hidden');
        card.classList.remove('flex');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('reference_library')
            .select('*')
            .eq('status', 'Published')
            .order('order_index', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            card.classList.add('hidden');
            card.classList.remove('flex');
            return;
        }

        const filtered = data.filter(ref => {
            const matchesCourse = cId && ref.course_ids && ref.course_ids.includes(String(cId));
            const matchesLesson = contentId && ref.content_ids && ref.content_ids.includes(String(contentId));
            return matchesCourse || matchesLesson;
        });

        if (filtered.length === 0) {
            card.classList.add('hidden');
            card.classList.remove('flex');
            return;
        }

        card.classList.remove('hidden');
        card.classList.add('flex');

        const defaultCover = '../assets/icons/zdc-icon-192.png';
        
        list.innerHTML = filtered.map(ref => {
            const impBadge = ref.importance === 'Required' ? 'bg-red-500/10 text-red-400 border-red-500/25' : ref.importance === 'Recommended' ? 'bg-teal-500/10 text-teal-400 border-teal-500/25' : 'bg-gray-500/10 text-gray-400 border-gray-500/25';
            const importanceName = ref.importance === 'Required' ? 'Required' : ref.importance === 'Recommended' ? 'Recommended' : ref.importance === 'Advanced Reading' ? 'Advanced' : 'Optional';
            return `
                <div onclick="if (typeof window.openReferenceDetailModal === 'function') { window.openReferenceDetailModal('${ref.id}'); } else { window.open('${ref.read_online_url || ref.download_pdf_url || '#'}', '_blank'); }" 
                     class="w-full text-left text-xs bg-white/5 border border-white/10 hover:border-teal-500/50 hover:bg-white/10 p-2.5 rounded-xl cursor-pointer flex items-center justify-between transition-all group">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <div class="w-7 h-10 bg-white/5 rounded border border-white/5 flex items-center justify-center overflow-hidden shrink-0 shadow">
                            <img src="${ref.cover_url || defaultCover}" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='${defaultCover}'">
                        </div>
                        <div class="text-left truncate">
                            <span class="text-white font-bold block group-hover:text-teal-400 transition-colors text-[11px] truncate" title="${ref.title}">${ref.title}</span>
                            <span class="text-[8px] text-gray-500 block truncate mt-0.5">${ref.type} • ${ref.author || 'Unknown Author'}</span>
                        </div>
                    </div>
                    <span class="text-[8px] border px-1.5 py-0.5 rounded font-black shrink-0 ${impBadge}">${importanceName}</span>
                </div>
            `;
        }).join('');
    } catch (err) {
        card.classList.add('hidden');
        card.classList.remove('flex');
    }
}

function resolveDocumentViewer(url) {
    if (!url) return { mode: 'iframe', url: '' };
    url = url.trim();

    // 1. Google Drive
    if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
        const idMatch = url.match(/\/d\/([-\w]{25,})/) || url.match(/id=([-\w]{25,})/);
        if (idMatch && idMatch[1]) {
            return {
                mode: 'iframe',
                url: `https://drive.google.com/file/d/${idMatch[1]}/preview`
            };
        }
    }

    // 2. Dropbox
    if (url.includes('dropbox.com')) {
        let directUrl = url;
        if (url.includes('?dl=0')) {
            directUrl = url.replace('?dl=0', '?raw=1');
        } else if (!url.includes('?')) {
            directUrl = url + '?raw=1';
        }
        directUrl = directUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
        return {
            mode: 'pdfjs',
            url: directUrl
        };
    }

    // 3. OneDrive
    if (url.includes('onedrive.live.com') || url.includes('1drv.ms')) {
        const residMatch = url.match(/resid=([-\w!]+)/);
        const authkeyMatch = url.match(/authkey=([-\w!]+)/);
        if (residMatch && residMatch[1]) {
            let embedUrl = `https://onedrive.live.com/embed?resid=${residMatch[1]}`;
            if (authkeyMatch && authkeyMatch[1]) {
                embedUrl += `&authkey=${authkeyMatch[1]}`;
            }
            return {
                mode: 'iframe',
                url: embedUrl
            };
        }
        return {
            mode: 'iframe',
            url: `https://docs.google.com/viewer?embedded=true&url=${encodeURIComponent(url)}`
        };
    }

    // 4. Supabase Storage / Direct PDF
    const cleanUrl = url.split('?')[0].toLowerCase();
    const isDirectPdf = cleanUrl.endsWith('.pdf') || url.includes('/storage/v1/object/public/');
    if (isDirectPdf) {
        return {
            mode: 'pdfjs',
            url: url
        };
    }

    // 5. Default fallback: try pdf.js
    return {
        mode: 'pdfjs',
        url: url
    };
}

function loadIframeFallback(embedUrl, item) {
    const viewport = document.getElementById('pdf-viewport');
    if (viewport) {
        viewport.classList.remove('p-6', 'items-center');
        viewport.classList.add('p-0');
        viewport.innerHTML = `
            <iframe src="${embedUrl}" class="w-full h-full border-0 bg-b-surface" allow="autoplay" style="display: block; width: 100%; height: 100%;"></iframe>
        `;
        const iframe = viewport.querySelector('iframe');
        if (iframe && pdfIsDarkMode) {
            iframe.style.filter = 'invert(0.9) hue-rotate(180deg)';
        }
    }

    // Hide PDF sidebar
    document.getElementById('pdf-sidebar')?.classList.add('hidden');

    // Keep toolbar visible but simplify it (show zoom, hide page navigation, auto-scroll and search)
    const toolbar = document.getElementById('pdf-toolbar');
    if (toolbar) {
        toolbar.classList.remove('hidden');
        document.getElementById('pdf-toggle-sidebar')?.parentElement?.classList.add('hidden');
        document.getElementById('pdf-zoom-out')?.parentElement?.classList.remove('hidden');
        document.getElementById('pdf-auto-scroll')?.classList.add('hidden');
        document.getElementById('pdf-auto-scroll-speed')?.classList.add('hidden');
        document.getElementById('pdf-search-btn')?.classList.add('hidden');
        
        // Hide non-functional buttons for iframe fallback mode
        document.getElementById('pdf-rotate')?.classList.add('hidden');
        document.getElementById('pdf-scroll-mode')?.classList.add('hidden');
        document.getElementById('pdf-fit-page')?.classList.add('hidden');
    }

    // Override read_pages/last_page trigger since we can't track pages inside an iframe
    const docData = item.rawDoc;
    if (docData) {
        const trigger = docData.completion_trigger || 'mark_complete';
        if (trigger === 'read_pages' || trigger === 'last_page') {
            docData.completion_trigger = 'manual';
        }
    }

    // Start timer and render completion button
    startPdfReadingTimer(item);
    renderPdfCompletionBtn(item);
}


// ==========================================
// 12. PDF/DOCUMENT VIEWER IMPLEMENTATION
// ==========================================
async function initDocumentViewer(item) {
    const docData = item.rawDoc;
    if (!docData) return;

    pdfDoc = null;
    pdfPageNum = 1;
    pdfZoom = 1.0;
    pdfRotation = 0;
    pdfScrollMode = 'vertical';
    pdfActiveSearchMatches = [];
    pdfCurrentSearchIndex = -1;
    pdfTimeSpent = 0;
    pagesViewedSet = new Set();
    pagesViewedSet.add(1);

    // Reset layout styles for viewport (remove full-width iframe layout if any)
    const viewport = document.getElementById('pdf-viewport');
    if (viewport) {
        viewport.classList.add('p-6', 'items-center');
        viewport.classList.remove('p-0');
        viewport.innerHTML = `<div id="pdf-canvas-container" class="relative shadow-2xl flex flex-col items-center gap-6"></div>`;
    }

    // Reset toolbar and hide page/zoom controls by default to prevent flickering during iframe fallback
    const toolbar = document.getElementById('pdf-toolbar');
    if (toolbar) {
        toolbar.classList.remove('hidden');
        document.getElementById('pdf-toggle-sidebar')?.parentElement?.classList.add('hidden');
        document.getElementById('pdf-zoom-out')?.parentElement?.classList.add('hidden');
        document.getElementById('pdf-search-btn')?.classList.add('hidden');
    }
    document.getElementById('pdf-sidebar')?.classList.add('hidden');

    // Bind all PDF controls (dark mode, fullscreen, print, etc.)
    setupPdfControls(item);

    // Check if the URL is a Google Drive folder or set to external view mode
    const isFolder = docData.source_url && (docData.source_url.includes('/folders/') || docData.source_url.includes('/drive/folders/'));
    if (docData.view_mode === 'external' || isFolder) {
        const container = document.getElementById('pdf-canvas-container');
        if (container) {
            container.innerHTML = `
                <div class="text-center py-20 px-6 max-w-lg mx-auto bg-black/35 rounded-2xl border border-white/10 shadow-2xl flex flex-col items-center gap-6 mt-10 animate-fade-in font-sans">
                    <div class="w-20 h-20 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center text-4xl">
                        <i class="fas fa-folder-open"></i>
                    </div>
                    <div>
                        <h3 class="text-xl font-bold text-white mb-2">${docData.title}</h3>
                        <p class="text-xs text-gray-400 leading-relaxed">${docData.description || 'This resource is an external folder or link that cannot be embedded directly. Click the button below to open it in a new tab and start reading.'}</p>
                    </div>
                    <a href="${docData.source_url}" target="_blank" id="btn-open-external-folder" class="bg-teal-600 hover:bg-teal-700 text-white font-bold px-6 py-3 rounded-xl text-sm transition-all shadow-lg flex items-center gap-2">
                        <i class="fas fa-external-link-alt"></i> Open External Content
                    </a>
                </div>
            `;
            
            const btnOpen = document.getElementById('btn-open-external-folder');
            if (btnOpen) {
                btnOpen.onclick = () => {
                    saveDocumentProgress(item, true);
                };
            }
        }
        
        document.getElementById('pdf-toolbar')?.classList.add('hidden');
        renderPdfCompletionBtn(item);
        return;
    }

    const allowDownload = docData.allow_download;
    const allowPrint = docData.allow_print;
    const allowCopy = docData.allow_copy;

    const downloadBtn = document.getElementById('pdf-download');
    const printBtn = document.getElementById('pdf-print');
    
    if (downloadBtn) {
        if (allowDownload) {
            downloadBtn.classList.remove('hidden');
            downloadBtn.href = docData.source_url;
        } else {
            downloadBtn.classList.add('hidden');
        }
    }
    if (printBtn) {
        if (allowPrint) {
            printBtn.classList.remove('hidden');
        } else {
            printBtn.classList.add('hidden');
        }
    }

    if (viewport) {
        if (!allowCopy) {
            viewport.classList.add('select-none');
            viewport.oncontextmenu = (e) => e.preventDefault();
            viewport.oncopy = (e) => e.preventDefault();
        } else {
            viewport.classList.remove('select-none');
            viewport.oncontextmenu = null;
            viewport.oncopy = null;
        }
    }

    let dbProgress = null;
    try {
        const { data } = await supabase
            .from('document_progress')
            .select('*')
            .eq('user_id', currentUserData.id)
            .eq('document_id', docData.id)
            .maybeSingle();
        dbProgress = data;
    } catch(err) {
        console.error("Error fetching doc progress:", err);
    }

    if (dbProgress) {
        pdfPageNum = dbProgress.last_page || 1;
        pdfTimeSpent = dbProgress.time_spent || 0;
        isCurrentContentCompleted = dbProgress.completed || false;
        pagesViewedSet.add(pdfPageNum);
    } else {
        isCurrentContentCompleted = false;
    }

    updateDocumentHeader(item, dbProgress);

    const container = document.getElementById('pdf-canvas-container');
    if (container) {
        container.innerHTML = `<div class="text-white text-center py-10 flex flex-col items-center gap-4">
            <i class="fas fa-spinner fa-spin text-3xl text-teal-400"></i> Loading document...
        </div>`;
    }

    const resolved = resolveDocumentViewer(docData.source_url);
    if (resolved.mode === 'iframe') {
        loadIframeFallback(resolved.url, item);
    } else {
        // Try to load cached document
        const cacheEntry = pdfCache[docData.id];
        if (cacheEntry) {
            pdfDoc = cacheEntry.pdfDoc;
            pagesViewedSet = cacheEntry.pagesViewedSet || new Set([1]);
            pdfZoom = cacheEntry.pdfZoom || 1.0;
            pdfRotation = cacheEntry.pdfRotation || 0;
            pdfScrollMode = cacheEntry.pdfScrollMode || 'vertical';
            pdfIsDarkMode = cacheEntry.pdfIsDarkMode || false;
            
            document.getElementById('pdf-page-count').innerText = pdfDoc.numPages;
            const docPagesCount = document.getElementById('doc-header-pages-count');
            if (docPagesCount) {
                docPagesCount.innerHTML = `<i class="fas fa-file-lines mr-1"></i> ${pdfDoc.numPages} pages`;
            }
            if (typeof pdfDoc.getDownloadInfo === 'function') {
                pdfDoc.getDownloadInfo().then(data => {
                    if (data && data.length) {
                        const sizeInMb = (data.length / (1024 * 1024)).toFixed(2);
                        const fileSizeEl = document.getElementById('doc-header-file-size');
                        if (fileSizeEl) {
                            fileSizeEl.innerHTML = `<i class="fas fa-weight-hanging mr-1"></i> ${sizeInMb} MB`;
                            fileSizeEl.classList.remove('hidden');
                        }
                    }
                }).catch(e => console.log("Download info error:", e));
            }
            updateDocumentHeaderStatusBadge(item);

            // Show zoom/page controls on successful cached PDF load
            document.getElementById('pdf-toggle-sidebar')?.parentElement?.classList.remove('hidden');
            document.getElementById('pdf-zoom-out')?.parentElement?.classList.remove('hidden');
            document.getElementById('pdf-auto-scroll')?.classList.remove('hidden');
            document.getElementById('pdf-search-btn')?.classList.remove('hidden');
            document.getElementById('pdf-rotate')?.classList.remove('hidden');
            document.getElementById('pdf-scroll-mode')?.classList.remove('hidden');
            document.getElementById('pdf-fit-page')?.classList.remove('hidden');

            const pageNumInput = document.getElementById('pdf-page-num');
            if (pageNumInput) {
                pageNumInput.max = pdfDoc.numPages;
                pageNumInput.value = pdfPageNum;
            }

            await renderPdfPages();
            await buildPdfThumbnails();
            startPdfReadingTimer(item);
            renderPdfCompletionBtn(item);

            if (pdfScrollMode === 'vertical' && pdfPageNum > 1) {
                setTimeout(() => scrollToPage(pdfPageNum), 200);
            }
            return;
        }

        try {
            const loadingTask = pdfjsLib.getDocument(resolved.url);
            pdfDoc = await loadingTask.promise;
            
            // Save to cache
            pdfCache[docData.id] = {
                pdfDoc: pdfDoc,
                pagesViewedSet: pagesViewedSet,
                pdfZoom: pdfZoom,
                pdfRotation: pdfRotation,
                pdfScrollMode: pdfScrollMode,
                pdfIsDarkMode: pdfIsDarkMode
            };
            
            document.getElementById('pdf-page-count').innerText = pdfDoc.numPages;
            const docPagesCount = document.getElementById('doc-header-pages-count');
            if (docPagesCount) {
                docPagesCount.innerHTML = `<i class="fas fa-file-lines mr-1"></i> ${pdfDoc.numPages} pages`;
            }
            if (typeof pdfDoc.getDownloadInfo === 'function') {
                pdfDoc.getDownloadInfo().then(data => {
                    if (data && data.length) {
                        const sizeInMb = (data.length / (1024 * 1024)).toFixed(2);
                        const fileSizeEl = document.getElementById('doc-header-file-size');
                        if (fileSizeEl) {
                            fileSizeEl.innerHTML = `<i class="fas fa-weight-hanging mr-1"></i> ${sizeInMb} MB`;
                            fileSizeEl.classList.remove('hidden');
                        }
                    }
                }).catch(e => console.log("Download info error:", e));
            }
            updateDocumentHeaderStatusBadge(item);

            // Show zoom/page controls on successful fresh PDF load
            document.getElementById('pdf-toggle-sidebar')?.parentElement?.classList.remove('hidden');
            document.getElementById('pdf-zoom-out')?.parentElement?.classList.remove('hidden');
            document.getElementById('pdf-auto-scroll')?.classList.remove('hidden');
            document.getElementById('pdf-search-btn')?.classList.remove('hidden');
            document.getElementById('pdf-rotate')?.classList.remove('hidden');
            document.getElementById('pdf-scroll-mode')?.classList.remove('hidden');
            document.getElementById('pdf-fit-page')?.classList.remove('hidden');

            const pageNumInput = document.getElementById('pdf-page-num');
            if (pageNumInput) {
                pageNumInput.max = pdfDoc.numPages;
                pageNumInput.value = pdfPageNum;
            }

            await renderPdfPages();
            await buildPdfThumbnails();
            startPdfReadingTimer(item);
            renderPdfCompletionBtn(item);

            if (pdfScrollMode === 'vertical' && pdfPageNum > 1) {
                setTimeout(() => scrollToPage(pdfPageNum), 500);
            }

        } catch (err) {
            console.error("Error loading PDF via pdf.js, attempting fallback to iframe embed:", err);
            
            if (window.location.protocol === 'file:') {
                showToast("Notice: To use auto-scroll and zoom tools, run the project via a local server instead of opening the file directly.", "warning", 8000);
            } else {
                showToast("Embedded viewer mode enabled due to cross-origin (CORS) restrictions.", "info");
            }

            const isLocal = docData.source_url.includes('localhost') || 
                            docData.source_url.includes('127.0.0.1') || 
                            docData.source_url.startsWith('/') || 
                            docData.source_url.startsWith('file://') ||
                            !docData.source_url.startsWith('http');
            const fallbackUrl = isLocal ? docData.source_url : `https://docs.google.com/viewer?embedded=true&url=${encodeURIComponent(docData.source_url)}`;
            loadIframeFallback(fallbackUrl, item);
        }
    }
}

async function renderPdfPages() {
    const container = document.getElementById('pdf-canvas-container');
    if (!container || !pdfDoc) return;
    container.innerHTML = '';
    
    const numPages = pdfDoc.numPages;

    if (pdfScrollMode === 'vertical') {
        for (let i = 1; i <= numPages; i++) {
            const pageDiv = document.createElement('div');
            pageDiv.id = `pdf-page-wrapper-${i}`;
            pageDiv.className = 'pdf-page-wrapper relative border border-white/5 bg-black/20 rounded shadow-lg overflow-hidden my-3';
            pageDiv.style.minHeight = '600px'; 
            pageDiv.style.width = '100%';
            pageDiv.style.maxWidth = '800px';
            pageDiv.dataset.pageNum = i;
            
            pageDiv.innerHTML = `<div class="absolute inset-0 flex items-center justify-center text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i> Page ${i}</div>`;
            container.appendChild(pageDiv);
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const pageNum = parseInt(entry.target.dataset.pageNum);
                    if (!pageRenderStatus[pageNum]) {
                        renderPageCanvas(pageNum);
                    }
                    
                    pdfPageNum = pageNum;
                    const pageNumInput = document.getElementById('pdf-page-num');
                    if (pageNumInput) pageNumInput.value = pageNum;
                    
                    pagesViewedSet.add(pageNum);
                    updateReadingProgress();
                }
            });
        }, {
            root: document.getElementById('pdf-viewport'),
            rootMargin: '100px 0px 100px 0px',
            threshold: 0.1
        });

        document.querySelectorAll('.pdf-page-wrapper').forEach(el => observer.observe(el));

    } else {
        const pageDiv = document.createElement('div');
        pageDiv.id = `pdf-page-wrapper-${pdfPageNum}`;
        pageDiv.className = 'pdf-page-wrapper relative border border-white/5 bg-black/20 rounded shadow-lg overflow-hidden';
        pageDiv.style.minHeight = '600px';
        pageDiv.style.width = '100%';
        pageDiv.style.maxWidth = '800px';
        pageDiv.dataset.pageNum = pdfPageNum;
        container.appendChild(pageDiv);

        pagesViewedSet.add(pdfPageNum);
        await renderPageCanvas(pdfPageNum);
    }
}

async function renderPageCanvas(pageNum) {
    if (pageRenderStatus[pageNum] === 'rendering' || pageRenderStatus[pageNum] === 'done') return;
    pageRenderStatus[pageNum] = 'rendering';

    try {
        const page = await pdfDoc.getPage(pageNum);
        const wrapper = document.getElementById(`pdf-page-wrapper-${pageNum}`);
        if (!wrapper) return;

        wrapper.innerHTML = ''; 

        const viewport = page.getViewport({ scale: pdfZoom, rotation: pdfRotation });

        const canvas = document.createElement('canvas');
        canvas.id = `pdf-canvas-${pageNum}`;
        canvas.className = 'block mx-auto transition-transform duration-300';
        
        if (pdfIsDarkMode) {
            canvas.style.filter = 'invert(0.9) hue-rotate(180deg)';
        }

        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        wrapper.style.width = `${viewport.width}px`;
        wrapper.style.minHeight = `${viewport.height}px`;

        wrapper.appendChild(canvas);

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        pageRenderStatus[pageNum] = 'done';
    } catch (err) {
        console.error(`Error rendering page ${pageNum}:`, err);
        pageRenderStatus[pageNum] = 'error';
    }
}

async function buildPdfThumbnails() {
    const sidebar = document.getElementById('pdf-sidebar-content');
    if (!sidebar) return;
    sidebar.innerHTML = '';

    const numPages = pdfDoc.numPages;
    for (let i = 1; i <= numPages; i++) {
        const thumbDiv = document.createElement('div');
        thumbDiv.className = 'mb-4 p-2 border border-white/5 rounded hover:border-teal-500/50 cursor-pointer bg-black/20 text-center transition-all';
        thumbDiv.onclick = () => scrollToPage(i);
        
        const label = document.createElement('div');
        label.className = 'text-[10px] text-gray-500 mt-1';
        label.innerText = `Page ${i}`;

        const canvas = document.createElement('canvas');
        canvas.className = 'w-24 h-32 object-contain mx-auto border border-white/10 rounded bg-white';
        
        pdfDoc.getPage(i).then(page => {
            const viewport = page.getViewport({ scale: 0.15 });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            page.render({ canvasContext: ctx, viewport: viewport });
        }).catch(err => console.error(err));

        thumbDiv.appendChild(canvas);
        thumbDiv.appendChild(label);
        sidebar.appendChild(thumbDiv);
    }
}

function scrollToPage(pageNum) {
    pdfPageNum = pageNum;
    const pageNumInput = document.getElementById('pdf-page-num');
    if (pageNumInput) pageNumInput.value = pageNum;

    pagesViewedSet.add(pageNum);

    if (pdfScrollMode === 'vertical') {
        const wrapper = document.getElementById(`pdf-page-wrapper-${pageNum}`);
        if (wrapper) {
            wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } else {
        renderPdfPages();
    }
}

function updateReadingProgress() {
    const total = pdfDoc ? pdfDoc.numPages : 1;
    const percent = Math.min(100, Math.round((pagesViewedSet.size / total) * 100));
    
    const pctEl = document.getElementById('pdf-reading-percent');
    if (pctEl) pctEl.innerText = `${percent}%`;

    updateDocumentHeaderStatusBadge(currentContent);

    debounceSaveProgress();
}

let docSaveTimeout = null;
function debounceSaveProgress() {
    if (docSaveTimeout) clearTimeout(docSaveTimeout);
    docSaveTimeout = setTimeout(() => {
        saveDocumentProgress(currentContent, false);
    }, 2000);
}

function checkCompletionConditions(docData) {
    if (!pdfDoc) return false;
    const totalPages = pdfDoc.numPages;
    const rawTrigger = docData.completion_trigger || 'read_pages';
    const triggers = rawTrigger.split(',').map(t => t.trim().toLowerCase());
    
    // If 'open' is one of the triggers, it's completed immediately
    if (triggers.includes('open')) {
        return true;
    }
    
    let conditionsMet = [];
    
    if (triggers.includes('last_page')) {
        conditionsMet.push(pdfPageNum === totalPages);
    }
    
    if (triggers.includes('pages') || triggers.includes('read_pages')) {
        const reqPages = docData.completion_pages_count || Math.ceil(totalPages * 0.8);
        conditionsMet.push(pagesViewedSet.size >= reqPages);
    }
    
    if (triggers.includes('time') || triggers.includes('time_spent')) {
        const reqSec = docData.completion_time_seconds || (docData.estimated_reading_time || 5) * 60;
        conditionsMet.push(pdfTimeSpent >= reqSec);
    }
    
    // If 'mark_complete' or 'manual' is in triggers, it requires manual button click
    if (triggers.includes('mark_complete') || triggers.includes('manual')) {
        return false;
    }
    
    if (conditionsMet.length > 0) {
        return conditionsMet.every(c => c === true);
    }
    
    return false;
}

async function saveDocumentProgress(item, forceCompleted = false) {
    if (isPreview) return;
    const docData = item?.rawDoc;
    if (!docData) return;

    const totalPages = pdfDoc ? pdfDoc.numPages : 1;
    const percent = Math.min(100, Math.round((pagesViewedSet.size / totalPages) * 100));

    let completed = forceCompleted || isCurrentContentCompleted;
    if (!completed) {
        completed = checkCompletionConditions(docData);
    }

    try {
        await supabase.from('document_progress').upsert({
            user_id: currentUserData.id,
            document_id: docData.id,
            completed: completed,
            completed_at: completed ? new Date().toISOString() : null,
            reading_percent: percent,
            last_page: pdfPageNum,
            time_spent: pdfTimeSpent,
            last_accessed_at: new Date().toISOString()
        }, { onConflict: 'user_id,document_id' });

        if (completed && !isCurrentContentCompleted) {
            isCurrentContentCompleted = true;
            
            await supabase.from('completed_materials').upsert({
                user_id: currentUserData.id,
                material_id: item.content_id,
                course_id: courseId,
                completed_at: new Date().toISOString()
            }, { onConflict: 'user_id,material_id' });

            const xp = docData.xp_reward || 10;
            await awardPoints(xp, `Document read: ${docData.title}`);

            if (currentTaskId) {
                await updateTaskStatus('completed');
            }
            
            showToast("Congratulations! Document completed and XP awarded!", "success");
            renderSidebar();
            renderPdfCompletionBtn(item);
        }
    } catch(err) {
        console.error("Error saving document progress:", err);
    }
}

function setupPdfControls(item) {
    const zoomIn = document.getElementById('pdf-zoom-in');
    if (zoomIn) {
        zoomIn.onclick = () => {
            const newZoom = Math.min(3.0, pdfZoom + 0.2);
            changePdfZoom(newZoom);
        };
    }

    const zoomOut = document.getElementById('pdf-zoom-out');
    if (zoomOut) {
        zoomOut.onclick = () => {
            const newZoom = Math.max(0.5, pdfZoom - 0.2);
            changePdfZoom(newZoom);
        };
    }

    const zoomReset = document.getElementById('pdf-zoom-reset');
    if (zoomReset) {
        zoomReset.onclick = () => {
            changePdfZoom(1.0);
        };
    }

    const fitWidth = document.getElementById('pdf-fit-width');
    if (fitWidth) {
        fitWidth.onclick = () => {
            const viewportEl = document.getElementById('pdf-viewport');
            if (viewportEl) {
                if (pdfDoc) {
                    pdfDoc.getPage(1).then(page => {
                        const originalViewport = page.getViewport({ scale: 1.0 });
                        const containerWidth = viewportEl.clientWidth - 48; 
                        const targetZoom = containerWidth / originalViewport.width;
                        changePdfZoom(targetZoom);
                    }).catch(err => console.error(err));
                } else {
                    // For iframe mode, reset zoom to 100%
                    changePdfZoom(1.0);
                }
            }
        };
    }

    const fitPage = document.getElementById('pdf-fit-page');
    if (fitPage) {
        fitPage.onclick = () => {
            const viewportEl = document.getElementById('pdf-viewport');
            if (viewportEl && pdfDoc) {
                pdfDoc.getPage(pdfPageNum).then(page => {
                    const originalViewport = page.getViewport({ scale: 1.0 });
                    const containerHeight = viewportEl.clientHeight - 48; 
                    const targetZoom = containerHeight / originalViewport.height;
                    changePdfZoom(targetZoom);
                }).catch(err => console.error(err));
            }
        };
    }

    const rotate = document.getElementById('pdf-rotate');
    if (rotate) {
        rotate.onclick = () => {
            if (!pdfDoc) return;
            pdfRotation = (pdfRotation + 90) % 360;
            pageRenderStatus = {};
            renderPdfPages();
        };
    }

    const scrollMode = document.getElementById('pdf-scroll-mode');
    if (scrollMode) {
        scrollMode.onclick = () => {
            if (!pdfDoc) return;
            pdfScrollMode = pdfScrollMode === 'vertical' ? 'horizontal' : 'vertical';
            const icon = scrollMode.querySelector('i');
            if (icon) {
                if (pdfScrollMode === 'vertical') {
                    icon.className = 'fas fa-arrows-up-down text-xs md:text-sm';
                } else {
                    icon.className = 'fas fa-arrows-left-right text-xs md:text-sm';
                }
            }
            pageRenderStatus = {};
            renderPdfPages();
        };
    }

    const toggleSidebarBtn = document.getElementById('pdf-toggle-sidebar');
    const sidebar = document.getElementById('pdf-sidebar');
    if (toggleSidebarBtn && sidebar) {
        toggleSidebarBtn.onclick = () => {
            sidebar.classList.toggle('hidden');
        };
    }

    const firstBtn = document.getElementById('pdf-first-btn');
    if (firstBtn) {
        firstBtn.onclick = () => {
            scrollToPage(1);
        };
    }

    const lastBtn = document.getElementById('pdf-last-btn');
    if (lastBtn) {
        lastBtn.onclick = () => {
            if (pdfDoc) {
                scrollToPage(pdfDoc.numPages);
            }
        };
    }

    const prevBtn = document.getElementById('pdf-prev-btn');
    if (prevBtn) {
        prevBtn.onclick = () => {
            if (pdfPageNum > 1) {
                scrollToPage(pdfPageNum - 1);
            }
        };
    }

    const nextBtn = document.getElementById('pdf-next-btn');
    if (nextBtn) {
        nextBtn.onclick = () => {
            if (pdfDoc && pdfPageNum < pdfDoc.numPages) {
                scrollToPage(pdfPageNum + 1);
            }
        };
    }

    const pageNumInput = document.getElementById('pdf-page-num');
    if (pageNumInput) {
        pageNumInput.onchange = () => {
            let val = parseInt(pageNumInput.value);
            if (pdfDoc && val >= 1 && val <= pdfDoc.numPages) {
                scrollToPage(val);
            } else {
                pageNumInput.value = pdfPageNum;
            }
        };
    }

    // Tab switching support
    const tabThumbs = document.getElementById('pdf-tab-thumbs');
    const tabToc = document.getElementById('pdf-tab-toc');
    if (tabThumbs && tabToc) {
        tabThumbs.onclick = () => {
            tabThumbs.className = 'flex-1 py-3 border-b-2 border-b-primary font-bold text-white';
            tabToc.className = 'flex-1 py-3 border-b-2 border-transparent font-bold text-gray-400 hover:text-white';
            buildPdfThumbnails();
        };
        tabToc.onclick = () => {
            tabToc.className = 'flex-1 py-3 border-b-2 border-b-primary font-bold text-white';
            tabThumbs.className = 'flex-1 py-3 border-b-2 border-transparent font-bold text-gray-400 hover:text-white';
            buildPdfToc();
        };
    }

    const darkModeBtn = document.getElementById('pdf-dark-mode');
    if (darkModeBtn) {
        if (pdfIsDarkMode) {
            darkModeBtn.classList.add('text-yellow-400');
        } else {
            darkModeBtn.classList.remove('text-yellow-400');
        }
        darkModeBtn.onclick = () => {
            pdfIsDarkMode = !pdfIsDarkMode;
            darkModeBtn.classList.toggle('text-yellow-400');
            document.querySelectorAll('#pdf-canvas-container canvas').forEach(canvas => {
                if (pdfIsDarkMode) {
                    canvas.style.filter = 'invert(0.9) hue-rotate(180deg)';
                } else {
                    canvas.style.filter = '';
                }
            });
            const iframe = document.querySelector('#pdf-viewport iframe');
            if (iframe) {
                if (pdfIsDarkMode) {
                    iframe.style.filter = 'invert(0.9) hue-rotate(180deg)';
                } else {
                    iframe.style.filter = '';
                }
            }
        };
    }

    const openSourceBtn = document.getElementById('pdf-open-source');
    if (openSourceBtn) {
        openSourceBtn.href = item.rawDoc?.source_url || '#';
    }

    const fsBtn = document.getElementById('pdf-fullscreen');
    if (fsBtn) {
        // Sync button icon with current state
        const viewer = document.getElementById('view-document');
        const icon = fsBtn.querySelector('i');
        if (viewer && viewer.classList.contains('pdf-fullscreen-active')) {
            if (icon) icon.className = 'fas fa-compress text-xs md:text-sm';
        } else {
            if (icon) icon.className = 'fas fa-expand text-xs md:text-sm';
        }

        fsBtn.onclick = () => {
            const viewer = document.getElementById('view-document');
            const docHeader = document.getElementById('document-header');
            if (viewer) {
                const isFs = viewer.classList.toggle('pdf-fullscreen-active');
                const icon = fsBtn.querySelector('i');
                if (isFs) {
                    viewer.style.position = 'fixed';
                    viewer.style.top = '0';
                    viewer.style.left = '0';
                    viewer.style.width = '100vw';
                    viewer.style.height = '100vh';
                    viewer.style.zIndex = '9999';
                    viewer.style.borderRadius = '0';
                    if (icon) {
                        icon.className = 'fas fa-compress text-xs md:text-sm';
                    }
                    if (docHeader) {
                        docHeader.classList.add('hidden');
                    }
                    showToast("Fullscreen mode enabled", "info");
                } else {
                    viewer.style.position = '';
                    viewer.style.top = '';
                    viewer.style.left = '';
                    viewer.style.width = '';
                    viewer.style.height = '';
                    viewer.style.zIndex = '';
                    viewer.style.borderRadius = '';
                    if (icon) {
                        icon.className = 'fas fa-expand text-xs md:text-sm';
                    }
                    if (docHeader) {
                        docHeader.classList.remove('hidden');
                    }
                    showToast("Exited fullscreen mode", "info");
                }
            }
        };
    }

    const autoScrollBtn = document.getElementById('pdf-auto-scroll');
    if (autoScrollBtn) {
        // Ensure state is reset when switching documents
        pausePdfAutoScroll();
        autoScrollBtn.onclick = () => {
            togglePdfAutoScroll();
        };
    }

    const autoScrollSpeedBtn = document.getElementById('pdf-auto-scroll-speed');
    if (autoScrollSpeedBtn) {
        autoScrollSpeedBtn.onclick = () => {
            cyclePdfAutoScrollSpeed();
        };
    }

    const searchBtn = document.getElementById('pdf-search-btn');
    const searchBar = document.getElementById('pdf-search-bar');
    if (searchBtn && searchBar) {
        searchBtn.onclick = () => {
            searchBar.classList.toggle('hidden');
            if (!searchBar.classList.contains('hidden')) {
                document.getElementById('pdf-search-input')?.focus();
            }
        };
    }

    const searchClose = document.getElementById('pdf-search-close');
    if (searchClose && searchBar) {
        searchClose.onclick = () => {
            searchBar.classList.add('hidden');
            clearSearchResults();
        };
    }

    const searchInput = document.getElementById('pdf-search-input');
    if (searchInput) {
        searchInput.oninput = () => {
            performPdfSearch(searchInput.value);
        };
    }

    const searchPrev = document.getElementById('pdf-search-prev');
    if (searchPrev) {
        searchPrev.onclick = () => {
            navigateSearchMatch(-1);
        };
    }

    const searchNext = document.getElementById('pdf-search-next');
    if (searchNext) {
        searchNext.onclick = () => {
            navigateSearchMatch(1);
        };
    }

    const printBtn = document.getElementById('pdf-print');
    if (printBtn) {
        printBtn.onclick = () => {
            const directUrl = resolveDocumentViewer(item.rawDoc.source_url).url;
            const printWindow = window.open(directUrl, '_blank');
            if (printWindow) {
                printWindow.onload = () => {
                    printWindow.print();
                };
            } else {
                showToast("Please allow popups to print this document.", "warning");
            }
        };
    }
}

async function performPdfSearch(query) {
    if (!query || query.trim().length < 2) {
        clearSearchResults();
        return;
    }
    
    pdfActiveSearchMatches = [];
    pdfCurrentSearchIndex = -1;
    
    const resultsEl = document.getElementById('pdf-search-results');
    if (resultsEl) resultsEl.innerText = 'Searching...';

    const cleanQuery = query.toLowerCase().trim();

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        try {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ').toLowerCase();
            
            if (pageText.includes(cleanQuery)) {
                let matchCount = 0;
                let pos = pageText.indexOf(cleanQuery);
                while (pos !== -1) {
                    matchCount++;
                    pos = pageText.indexOf(cleanQuery, pos + cleanQuery.length);
                }
                
                pdfActiveSearchMatches.push({ pageNum: i, count: matchCount });
            }
        } catch(err) {
            console.error(err);
        }
    }

    if (pdfActiveSearchMatches.length > 0) {
        pdfCurrentSearchIndex = 0;
        const totalMatches = pdfActiveSearchMatches.reduce((sum, m) => sum + m.count, 0);
        if (resultsEl) resultsEl.innerText = `Found ${totalMatches} matches across ${pdfActiveSearchMatches.length} pages`;
        scrollToPage(pdfActiveSearchMatches[0].pageNum);
    } else {
        if (resultsEl) resultsEl.innerText = 'No results found';
    }
}

function clearSearchResults() {
    pdfActiveSearchMatches = [];
    pdfCurrentSearchIndex = -1;
    const resultsEl = document.getElementById('pdf-search-results');
    if (resultsEl) resultsEl.innerText = '0 / 0';
    const searchInput = document.getElementById('pdf-search-input');
    if (searchInput) searchInput.value = '';
}

function navigateSearchMatch(direction) {
    if (pdfActiveSearchMatches.length === 0) return;
    pdfCurrentSearchIndex = (pdfCurrentSearchIndex + direction + pdfActiveSearchMatches.length) % pdfActiveSearchMatches.length;
    
    const currentMatch = pdfActiveSearchMatches[pdfCurrentSearchIndex];
    scrollToPage(currentMatch.pageNum);
    
    const wrapper = document.getElementById(`pdf-page-wrapper-${currentMatch.pageNum}`);
    if (wrapper) {
        wrapper.classList.add('ring-4', 'ring-teal-500');
        setTimeout(() => wrapper.classList.remove('ring-4', 'ring-teal-500'), 2000);
    }
}

function startPdfReadingTimer(item) {
    if (pdfReadingTimer) clearInterval(pdfReadingTimer);
    
    pdfReadingTimer = setInterval(() => {
        pdfTimeSpent += 1;
        
        if (!isCurrentContentCompleted) {
            renderPdfCompletionBtn(item);
            
            if (checkCompletionConditions(item.rawDoc)) {
                saveDocumentProgress(item, false);
            }
        }
        
        if (pdfTimeSpent % 10 === 0) {
            saveDocumentProgress(item, false);
        }
    }, 1000);
}

function renderPdfCompletionBtn(item) {
    const container = document.getElementById('pdf-completion-btn-container');
    if (!container) return;
    container.innerHTML = '';

    if (isCurrentContentCompleted) {
        container.innerHTML = `<span class="bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"><i class="fas fa-check-circle"></i> Reading Completed ✓</span>`;
        return;
    }

    const docData = item.rawDoc;
    if (!docData) return;

    const rawTrigger = docData.completion_trigger || 'read_pages';
    const triggers = rawTrigger.split(',').map(t => t.trim().toLowerCase());
    
    if (triggers.includes('open')) {
        container.innerHTML = `<span class="bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"><i class="fas fa-check-circle"></i> Completed on Open ✓</span>`;
    } else if (triggers.includes('mark_complete') || triggers.includes('manual')) {
        const btn = document.createElement('button');
        btn.className = 'bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-md flex items-center gap-1.5';
        btn.innerHTML = `<i class="fas fa-check"></i> Mark as Complete`;
        btn.onclick = () => saveDocumentProgress(item, true);
        container.appendChild(btn);
    } else {
        let textParts = [];
        
        if (triggers.includes('pages') || triggers.includes('read_pages')) {
            const total = pdfDoc ? pdfDoc.numPages : 1;
            const reqPages = docData.completion_pages_count || Math.ceil(total * 0.8);
            textParts.push(`Read ${reqPages} pages (${pagesViewedSet.size} viewed)`);
        }
        
        if (triggers.includes('last_page')) {
            const total = pdfDoc ? pdfDoc.numPages : 1;
            textParts.push(`Reach last page ${total} (currently on ${pdfPageNum})`);
        }
        
        if (triggers.includes('time') || triggers.includes('time_spent')) {
            const reqSec = docData.completion_time_seconds || (docData.estimated_reading_time || 5) * 60;
            const remaining = Math.max(0, reqSec - pdfTimeSpent);
            if (remaining > 0) {
                const minutes = Math.floor(remaining / 60);
                const seconds = remaining % 60;
                textParts.push(`Read for ${minutes}:${seconds < 10 ? '0' : ''}${seconds} more`);
            } else {
                textParts.push(`Required reading time met!`);
            }
        }
        
        container.innerHTML = `<span class="bg-blue-500/10 text-blue-400 border border-blue-500/25 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"><i class="fas fa-book-open"></i> ${textParts.join(' & ')}</span>`;
    }
}

// ==========================================
// 13. ADDITIONAL DOCUMENT VIEWER HELPERS
// ==========================================
function updateDocumentHeader(item, dbProgress = null) {
    const docData = item.rawDoc;
    if (!docData) return;

    const courseTitleEl = document.getElementById('doc-header-course-title');
    if (courseTitleEl) {
        courseTitleEl.innerText = courseData ? courseData.title : "Course";
    }

    const trackTitleEl = document.getElementById('doc-header-track-title');
    if (trackTitleEl) {
        const trackName = docData.tracks ? docData.tracks.name : '';
        if (trackName) {
            trackTitleEl.innerText = trackName;
            trackTitleEl.classList.remove('hidden');
        } else {
            trackTitleEl.classList.add('hidden');
        }
    }

    const phaseTitleEl = document.getElementById('doc-header-phase-title');
    if (phaseTitleEl) {
        let phaseTitle = docData.phases ? docData.phases.title : '';
        if (phaseTitle) {
            const trackName = docData.tracks ? docData.tracks.name : '';
            if (trackName && phaseTitle.includes(trackName)) {
                phaseTitle = phaseTitle.replace(new RegExp(`[:\\s\\-]*${trackName}`, 'gi'), '').trim();
                phaseTitle = phaseTitle.replace(/[:\\-\\s]+$/, '').trim();
            }
            phaseTitleEl.innerText = phaseTitle;
            phaseTitleEl.classList.remove('hidden');
        } else {
            phaseTitleEl.classList.add('hidden');
        }
    }

    const typeBadge = document.getElementById('doc-header-type-badge');
    if (typeBadge) {
        typeBadge.innerText = docData.document_type || 'Document';
    }

    const authorEl = document.getElementById('doc-header-author');
    if (authorEl) {
        authorEl.innerText = docData.created_by || 'ZDC Team';
    }

    const titleEl = document.getElementById('doc-header-title');
    if (titleEl) {
        titleEl.innerText = docData.title || 'Untitled Document';
    }

    const noteContainer = document.getElementById('doc-header-note-container');
    const noteText = document.getElementById('doc-header-note-text');
    if (noteContainer && noteText) {
        const desc = docData.description || '';
        if (desc.trim()) {
            noteContainer.classList.remove('hidden');
            noteText.innerText = desc;
        } else {
            noteContainer.classList.add('hidden');
        }
    }

    const pointsBadge = document.getElementById('doc-header-points-badge');
    const pointsText = document.getElementById('doc-header-points-text');
    const points = docData.xp_reward || 0;
    if (points > 0 && pointsBadge) {
        pointsBadge.classList.remove('hidden');
        pointsBadge.classList.add('flex');
        if (pointsText) pointsText.innerText = points;
    } else if (pointsBadge) {
        pointsBadge.classList.add('hidden');
    }

    const pagesCountEl = document.getElementById('doc-header-pages-count');
    if (pagesCountEl) {
        pagesCountEl.innerHTML = `<i class="fas fa-file-lines mr-1"></i> -- pages`;
    }
    const fileSizeEl = document.getElementById('doc-header-file-size');
    if (fileSizeEl) {
        fileSizeEl.classList.add('hidden');
    }

    updateDocumentHeaderStatusBadge(item);
}

function updateDocumentHeaderStatusBadge(item) {
    const statusBadge = document.getElementById('doc-header-status-badge');
    const statusText = document.getElementById('doc-header-status-text');
    if (!statusBadge || !statusText) return;

    statusBadge.className = "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border";
    
    // Create inner icon if not present
    let iconEl = statusBadge.querySelector('i');
    if (!iconEl) {
        iconEl = document.createElement('i');
        statusBadge.insertBefore(iconEl, statusText);
    }

    const isCompleted = isCurrentContentCompleted;
    const isLocked = isContentLocked(item);

    if (isCompleted) {
        statusBadge.className = "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border bg-green-500/10 text-green-400 border-green-500/20";
        statusText.innerText = "Completed";
        iconEl.className = "fas fa-check-circle";
    } else if (isLocked) {
        statusBadge.className = "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border bg-red-500/10 text-red-400 border-red-500/20";
        statusText.innerText = "Locked";
        iconEl.className = "fas fa-lock";
    } else {
        const isStarted = pagesViewedSet.size > 1 || pdfTimeSpent > 5;
        if (isStarted) {
            statusBadge.className = "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
            statusText.innerText = "In Progress";
            iconEl.className = "fas fa-circle-notch animate-spin";
        } else {
            statusBadge.className = "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border bg-blue-500/10 text-blue-400 border-blue-500/20";
            statusText.innerText = "Ready to Read";
            iconEl.className = "fas fa-book-open";
        }
    }
}

function resizeExistingPages(newZoom) {
    if (!pdfDoc) return;
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const wrapper = document.getElementById(`pdf-page-wrapper-${i}`);
        if (wrapper) {
            wrapper.style.transition = 'width 0.3s cubic-bezier(0.1, 0.9, 0.2, 1), min-height 0.3s cubic-bezier(0.1, 0.9, 0.2, 1)';
            
            pdfDoc.getPage(i).then(page => {
                const viewport = page.getViewport({ scale: newZoom, rotation: pdfRotation });
                wrapper.style.width = `${viewport.width}px`;
                wrapper.style.minHeight = `${viewport.height}px`;
                
                const canvas = document.getElementById(`pdf-canvas-${i}`);
                if (canvas) {
                    canvas.style.transition = 'width 0.3s cubic-bezier(0.1, 0.9, 0.2, 1), height 0.3s cubic-bezier(0.1, 0.9, 0.2, 1)';
                    canvas.style.width = `${viewport.width}px`;
                    canvas.style.height = `${viewport.height}px`;
                }
            }).catch(e => console.error(e));
        }
    }
}

let zoomDebounceTimer = null;
async function changePdfZoom(newZoom) {
    const viewportEl = document.getElementById('pdf-viewport');
    if (!viewportEl) return;

    // Constrain zoom levels between 50% and 300%
    newZoom = Math.max(0.5, Math.min(3.0, newZoom));

    // Support smooth zoom in iframe mode (using CSS zoom)
    const iframe = viewportEl.querySelector('iframe');
    if (iframe) {
        pdfZoom = newZoom;
        const zoomValEl = document.getElementById('pdf-zoom-val');
        if (zoomValEl) zoomValEl.innerText = `${Math.round(pdfZoom * 100)}%`;
        
        iframe.style.transition = 'zoom 0.3s cubic-bezier(0.1, 0.9, 0.2, 1)';
        iframe.style.zoom = pdfZoom;
        return;
    }

    if (!pdfDoc) return;
    
    const currentPageNum = pdfPageNum;
    const pageWrapper = document.getElementById(`pdf-page-wrapper-${currentPageNum}`);
    let offsetPercent = 0;
    if (pageWrapper) {
        const height = pageWrapper.clientHeight || 600;
        offsetPercent = (viewportEl.scrollTop - pageWrapper.offsetTop) / height;
    }
    
    pdfZoom = newZoom;
    const zoomValEl = document.getElementById('pdf-zoom-val');
    if (zoomValEl) zoomValEl.innerText = `${Math.round(pdfZoom * 100)}%`;
    
    // Resize existing page wrapper elements smoothly in-place
    resizeExistingPages(pdfZoom);
    
    // Smoothly preserve scroll position
    if (pdfScrollMode === 'vertical') {
        const targetPageWrapper = document.getElementById(`pdf-page-wrapper-${currentPageNum}`);
        if (targetPageWrapper) {
            setTimeout(() => {
                const newHeight = targetPageWrapper.clientHeight || 600;
                viewportEl.scrollTop = targetPageWrapper.offsetTop + (offsetPercent * newHeight);
            }, 100);
        }
    }
    
    // Debounce re-rendering the visible pages to make them crisp
    if (zoomDebounceTimer) clearTimeout(zoomDebounceTimer);
    zoomDebounceTimer = setTimeout(async () => {
        pageRenderStatus = {};
        
        // Re-render current page immediately
        await renderPageCanvas(currentPageNum);
        
        // Re-render other visible pages
        const container = document.getElementById('pdf-canvas-container');
        if (container) {
            const wrappers = container.querySelectorAll('.pdf-page-wrapper');
            wrappers.forEach(wrapper => {
                const pageNum = parseInt(wrapper.dataset.pageNum);
                const rect = wrapper.getBoundingClientRect();
                const viewRect = viewportEl.getBoundingClientRect();
                const isVisible = (rect.bottom >= viewRect.top && rect.top <= viewRect.bottom);
                if (isVisible && pageNum !== currentPageNum) {
                    renderPageCanvas(pageNum);
                }
            });
        }
    }, 400);
}

function startPdfAutoScroll() {
    const viewportEl = document.getElementById('pdf-viewport');
    if (!viewportEl) return;
    
    if (pdfAutoScrollInterval) clearInterval(pdfAutoScrollInterval);
    
    pdfAutoScrollInterval = setInterval(() => {
        if (!pdfAutoScrollActive) return;
        
        // Scroll step based on speed multiplier
        const step = pdfAutoScrollSpeed * 0.8;
        viewportEl.scrollTop += step;
        
        // If we reached the end of the document, stop auto-scrolling
        if (viewportEl.scrollTop + viewportEl.clientHeight >= viewportEl.scrollHeight - 2) {
            pausePdfAutoScroll();
        }
    }, 16); // ~60fps
}

function pausePdfAutoScroll() {
    pdfAutoScrollActive = false;
    if (pdfAutoScrollInterval) {
        clearInterval(pdfAutoScrollInterval);
        pdfAutoScrollInterval = null;
    }
    
    const playBtn = document.getElementById('pdf-auto-scroll');
    if (playBtn) {
        const icon = playBtn.querySelector('i');
        if (icon) icon.className = 'fas fa-play text-xs md:text-sm';
        const label = playBtn.querySelector('span');
        if (label) label.innerText = 'Auto Scroll';
    }
    
    const speedBtn = document.getElementById('pdf-auto-scroll-speed');
    if (speedBtn) speedBtn.classList.add('hidden');
}

function togglePdfAutoScroll() {
    pdfAutoScrollActive = !pdfAutoScrollActive;
    
    const playBtn = document.getElementById('pdf-auto-scroll');
    const speedBtn = document.getElementById('pdf-auto-scroll-speed');
    
    if (pdfAutoScrollActive) {
        if (playBtn) {
            const icon = playBtn.querySelector('i');
            if (icon) icon.className = 'fas fa-pause text-xs md:text-sm';
            const label = playBtn.querySelector('span');
            if (label) label.innerText = 'Pause';
        }
        if (speedBtn) {
            speedBtn.classList.remove('hidden');
            speedBtn.innerText = `${pdfAutoScrollSpeed}x`;
        }
        startPdfAutoScroll();
    } else {
        pausePdfAutoScroll();
    }
}

function cyclePdfAutoScrollSpeed() {
    const speeds = [0.5, 1.0, 1.5, 2.0, 3.0];
    const idx = speeds.indexOf(pdfAutoScrollSpeed);
    const nextIdx = (idx + 1) % speeds.length;
    pdfAutoScrollSpeed = speeds[nextIdx];
    
    const speedBtn = document.getElementById('pdf-auto-scroll-speed');
    if (speedBtn) {
        speedBtn.innerText = `${pdfAutoScrollSpeed}x`;
    }
    
    if (pdfAutoScrollActive) {
        startPdfAutoScroll();
    }
}

async function buildPdfToc() {
    const sidebarContent = document.getElementById('pdf-sidebar-content');
    if (!sidebarContent || !pdfDoc) return;
    
    sidebarContent.innerHTML = '<div class="text-gray-500 text-center py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Loading table of contents...</div>';
    
    try {
        const outline = await pdfDoc.getOutline();
        if (!outline || outline.length === 0) {
            sidebarContent.innerHTML = '<div class="text-gray-500 text-center py-4">No table of contents available</div>';
            return;
        }
        
        sidebarContent.innerHTML = '';
        const listContainer = document.createElement('div');
        listContainer.className = 'space-y-1 text-left text-xs';
        
        function renderItems(outlineItems, depth = 0) {
            outlineItems.forEach(outlineItem => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'py-2 px-2 hover:bg-white/5 hover:text-b-primary rounded cursor-pointer transition-colors truncate flex items-center gap-2';
                itemDiv.style.paddingLeft = `${depth * 12 + 8}px`;
                
                const icon = outlineItem.items && outlineItem.items.length > 0 ? '<i class="fas fa-folder-open text-gray-500 text-[10px]"></i>' : '<i class="fas fa-bookmark text-gray-400 text-[8px]"></i>';
                
                itemDiv.innerHTML = `${icon} <span class="text-gray-300 hover:text-white font-medium">${outlineItem.title}</span>`;
                itemDiv.onclick = (e) => {
                    e.stopPropagation();
                    goToDestination(outlineItem.dest);
                };
                
                listContainer.appendChild(itemDiv);
                
                if (outlineItem.items && outlineItem.items.length > 0) {
                    renderItems(outlineItem.items, depth + 1);
                }
            });
        }
        
        renderItems(outline);
        sidebarContent.appendChild(listContainer);
    } catch (err) {
        console.error("Error building TOC:", err);
        sidebarContent.innerHTML = '<div class="text-red-500 text-center py-4">Failed to load table of contents</div>';
    }
}

async function goToDestination(dest) {
    if (!dest || !pdfDoc) return;
    try {
        let explicitDest = dest;
        if (typeof dest === 'string') {
            explicitDest = await pdfDoc.getDestination(dest);
        }
        if (Array.isArray(explicitDest) && explicitDest.length > 0) {
            const pageRef = explicitDest[0];
            let pageIndex;
            if (pageRef && typeof pageRef === 'object') {
                pageIndex = await pdfDoc.getPageIndex(pageRef);
            } else if (typeof pageRef === 'number') {
                pageIndex = pageRef;
            }
            if (typeof pageIndex === 'number') {
                scrollToPage(pageIndex + 1);
            }
        }
    } catch (e) {
        console.error("Error resolving PDF destination:", e);
    }
}