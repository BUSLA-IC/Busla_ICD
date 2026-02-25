import { supabase, AuthService, TeamService, UserService } from './supabase-config.js';
import { initSettingsModal, openSettings } from './settings-handler.js';
import { initBadgesSystem } from './badges-handler.js';
import { initTeamBadgesSystem } from './team-badges-handler.js';
import { initLeaderboard } from './leaderboard-handler.js';
import { initNotificationsSystem } from './notifications-handler.js';
import { RANKS_DATA } from './badges-data.js';
import { TEAM_RANKS_DATA } from './team-badges-data.js';

// ==========================================
// 1. GLOBAL STATE & CONFIGURATION
// ==========================================
const CACHE_KEY = 'busla_lms_v6_supa';

let currentUser = null;
let currentTeam = null;
let currentUserData = null;
let allData = { phases: [], courses: [], tree: [], rawContents: [] };
let lookupData = { projects: {}, quizzes: {}, videos: {}, contents: [] };
let selectedAssignCourse = null;
let expandedNodes = new Set();
let confirmCallback = null;
let calendarDate = new Date();
let isInitialized = false;
let currentViewedWeekStart = null;
let currentViewedWeekEnd = null;
let currentGradingSubmission = null;

// ==========================================
// 2. INITIALIZATION & LIFECYCLE
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initSettingsModal();
    setupEventListeners();

    // Check Auth State
    AuthService.onAuthStateChange(async (user) => {
        if (user) {
            if (isInitialized && currentUser?.id === user.id) return;
            isInitialized = true;
            currentUser = user;
            await initDashboard(user.id);
        } else {
            window.location.href = "auth.html";
        }
    });
});

function setupEventListeners() {
    const settingsBtn = document.getElementById('open-settings-btn'); 
    if(settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openSettings();
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await AuthService.signOut();
            window.location.href = "auth.html";
        });
    }

    const teamSettingsBtn = document.getElementById('open-team-settings-btn');
    if (teamSettingsBtn) {
        teamSettingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const isLeader = (currentUserData?.id === currentTeam?.leader_id) || (currentUserData?.role === 'leader');
            if (currentTeam && currentTeam.id) {
                openTeamSettings(currentTeam.id, isLeader);
            } else {
                showToast("Wait for data loading...", "info");
            }
        });
    }

    // Mobile Menu
    const menuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');

    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.remove('translate-x-full'); 
            overlay.classList.remove('hidden'); 
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.add('translate-x-full'); 
            overlay.classList.add('hidden'); 
        });
    }
}

async function initDashboard(uid) {
    try {
        const { data: profile, error: profileError } = await UserService.getProfile(uid);
        if (profileError || !profile) throw new Error("User profile not found");
        
        currentUserData = profile;

        // Security Check for Student Dashboard
        if (!profile.role || profile.role === 'pending') {
            console.warn("Access denied. Invalid or pending role.");
            window.location.replace('../index.html');
            return;
        }

        const teamId = currentUserData.team_id; 

        if (!teamId) {
            console.warn("User has no team.");
            // 💡 الحل هنا: إنشاء كائن فريق افتراضي فارغ لمنع الانهيار
            currentTeam = {
                id: null,
                team_id: null,
                name: 'لا يوجد فريق',
                courses_plan: [],
                weekly_tasks: [],
                members: [],
                requests: [],
                leader_id: null
            };
        } else {
            const { data: teamData, error: teamError } = await supabase
                .from('teams')
                .select('*')
                .eq('id', teamId)
                .single();

            if (teamError || !teamData) {
                console.error("Team fetch failed", teamError);
                currentTeam = { id: null, team_id: null, name: 'فريق غير معروف', courses_plan: [], weekly_tasks: [], members: [] };
            } else {
                currentTeam = teamData;
                currentTeam.team_id = teamData.id; 

                // Initialize JSON fields
                if (!currentTeam.courses_plan) currentTeam.courses_plan = [];
                if (!currentTeam.requests) currentTeam.requests = [];

                // Fetch team tasks
                const { data: tasksData, error: tasksError } = await supabase
                    .from('team_tasks')
                    .select('*')
                    .eq('team_id', teamId);
                    
                if (tasksError) console.error("Error fetching tasks:", tasksError);
                
                currentTeam.weekly_tasks = tasksData ? tasksData.map(t => ({...t, task_id: t.id})) : [];

                // Fetch members
                const { data: members } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('team_id', teamId);
                
                currentTeam.members = members ? members.map(m => m.id) : [];

                // Initial Render
                if(typeof renderSquadTab === 'function') renderSquadTab(currentTeam);   
            }
        }

        updateHeaderInfo(currentUserData, currentTeam);

        const hasCache = loadFromCache();
        if (hasCache) {
            console.log("Rendering from Cache immediately...");
            renderAllTabs(); 
        } else {
            console.log("No cache found, waiting for server...");
        }
        
        await fetchDataFromServer();
        console.log("Re-rendering with fresh data...");
        renderAllTabs();

    } catch (e) {
        console.error("Init Error:", e);
        showToast("خطأ في تحميل البيانات", "error");
    }
}

// ==========================================
// 3. DATA FETCHING & CACHING
// ==========================================
async function fetchDataFromServer() {
    try {
        console.log("Fetching Fresh Data from Supabase...");
        
        const [phasesRes, coursesRes, materialsRes, projectsRes, quizzesRes] = await Promise.all([
            supabase.from('phases').select('*'), 
            supabase.from('courses').select('*'),
            supabase.from('course_materials').select('*').order('order_index', { ascending: true }),
            supabase.from('projects').select('*'),
            supabase.from('quizzes').select('*')
        ]);

        if (phasesRes.error) throw phasesRes.error;
        if (coursesRes.error) throw coursesRes.error;
        if (materialsRes.error) throw materialsRes.error;

        allData.phases = (phasesRes.data || []).map(p => ({
            ...p, 
            id: p.phase_id,
            module_time: p['Module Time']
        }));

        const rawCourses = (coursesRes.data || []).map(c => ({
            ...c, 
            id: c.course_id, 
            module_time: c['Module_Time'] || c['Module Time'],
            note: c['Note']
        }));

        const rawContents = (materialsRes.data || []).map(c => ({
            ...c, 
            id: c.content_id, 
            author: c['Author'], 
            note: c['Note']
        }));

        allData.projects = (projectsRes.data || []).map(p => ({ ...p, id: p.id }));
        allData.quizzes = (quizzesRes.data || []).map(q => ({ ...q, id: q.quiz_id }));
        allData.rawContents = rawContents;

        allData.courses = rawCourses.map(course => {
            const courseContents = rawContents.filter(c => c.course_id === course.id);
            const videoCount = courseContents.filter(c => c.type === 'video').length;
            
            let totalSeconds = 0;
            let instructor = course.created_by || ""; 

            courseContents.forEach(c => {
                if(c.type === 'video') {
                    let dur = typeof c.duration === 'number' ? c.duration : parseDurationToSeconds(c.duration);
                    totalSeconds += dur;
                    if (!instructor && c.author) instructor = c.author;
                }
            });

            return {
                ...course,
                course_id: course.id, 
                real_video_count: videoCount,
                real_total_duration: formatSecondsToTime(totalSeconds),
                instructor: instructor || "Busla Team",
                image_url: course.image_url
            };
        });

        allData.tree = allData.phases.map(phase => {
            const phaseCourses = allData.courses.filter(c => c.phase_id === phase.id);
            return { ...phase, courses: phaseCourses };
        });

        lookupData = { projects: {}, quizzes: {}, videos: {}, contents: [] }; 
        allData.projects.forEach(p => lookupData.projects[String(p.id)] = p);
        allData.quizzes.forEach(q => lookupData.quizzes[String(q.id)] = q);
        
        lookupData.contents = rawContents.map(c => ({
            ...c,
            content_id: c.id,
            related_quiz_id: c.ref_quiz_id,
            related_project_id: c.ref_project_id
        })); 

        localStorage.setItem(CACHE_KEY, JSON.stringify(allData));
        console.log("✅ Data mapped successfully!", allData);

    } catch (error) {
        console.error("Fetch Error:", error);
        if (!allData.courses || allData.courses.length === 0) {
             showToast("Database connection failed", "error");
        }
    }
}

function loadFromCache() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        try {
            console.log("Loading from Cache...");
            allData = JSON.parse(cached);
            
            lookupData = { projects: {}, quizzes: {}, videos: {}, contents: [] }; 
            if (allData.projects) allData.projects.forEach(p => lookupData.projects[String(p.id)] = p);
            if (allData.quizzes) allData.quizzes.forEach(q => lookupData.quizzes[String(q.id)] = q);
            if (allData.rawContents) {
                lookupData.contents = allData.rawContents.map(c => ({
                    ...c,
                    content_id: c.id,
                    related_quiz_id: c.ref_quiz_id,
                    related_project_id: c.ref_project_id
                }));
            }
            return true;
        } catch (e) {
            console.error("Cache corrupted, clearing...", e);
            localStorage.removeItem(CACHE_KEY);
            return false;
        }
    }
    return false;
}

// ==========================================
// 4. UI RENDERING & NAVIGATION
// ==========================================

function updateHeaderInfo(user, team) {
    const safeText = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.innerText = txt;
    };

    const userPoints = user.total_xp || user.xp_points || 0;
    const teamPoints = (team && team.total_score) ? team.total_score : 0;

    // Get the full rank object to extract title, level, and color
    const getRankObject = (points, dataSet) => {
        let rankObj = dataSet[0];
        for (let i = 0; i < dataSet.length; i++) {
            if (points >= dataSet[i].points_required) {
                rankObj = dataSet[i];
            } else {
                break;
            }
        }
        return rankObj;
    };

    const userRank = getRankObject(userPoints, RANKS_DATA);
    const teamRank = getRankObject(teamPoints, TEAM_RANKS_DATA);

    safeText('header-user-badge', userRank.title);
    safeText('sidebar-team-badge', teamRank.title);

    // Update Header Badges Images
    const badgeImgEl = document.getElementById('header-user-badge-img');
    const badgeImgClearEl = document.getElementById('header-user-badge-img-clear');
    const badgeUrl = `../assets/user-badge/lv${userRank.level}.png`;
    
    if (badgeImgEl) badgeImgEl.src = badgeUrl;
    if (badgeImgClearEl) badgeImgClearEl.src = badgeUrl;

    // Update Badge styling dynamically based on Stage Color
    const badgeTextEl = document.getElementById('header-user-badge');
    if (badgeTextEl && userRank.stage_color) {
        badgeTextEl.style.color = userRank.stage_color;
        badgeTextEl.style.borderColor = userRank.stage_color + '80'; // 50% opacity
        badgeTextEl.style.backgroundColor = userRank.stage_color + '1A'; // 10% opacity
    }

    // Set User and Team Names
    const userName = user.full_name || "طالب بوصلة";
    const teamName = (team && team.name) ? team.name : "بدون فريق";
    
    safeText('sidebar-team-name', teamName);
    safeText('header-user-name', userName);
    safeText('my-points', userPoints);
    safeText('stat-team-score', teamPoints);

    // 💡 التعديل الأهم: جلب اسم الليدر الحقيقي بدلاً من اسم الطالب
    const leaderNameEl = document.getElementById('sidebar-leader-name');
    if (leaderNameEl) {
        if (!team || !team.leader_id) {
            leaderNameEl.innerText = "لا يوجد";
        } else {
            // وضع علامة تحميل مؤقتة حتى يأتي الاسم من قاعدة البيانات
            leaderNameEl.innerHTML = '<i class="fas fa-spinner fa-spin text-gray-500 text-[10px]"></i>';
            
            // جلب الاسم في الخلفية
            supabase.from('profiles').select('full_name').eq('id', team.leader_id).single()
                .then(({ data, error }) => {
                    if (!error && data) {
                        leaderNameEl.innerHTML = `${data.full_name}`;
                    } else {
                        leaderNameEl.innerText = "غير معروف";
                    }
                });
        }
    }

    // Update Team Logo
    const sidebarLogoEl = document.getElementById('sidebar-team-logo');
    if(sidebarLogoEl) {
        let rawTeamLogo = team ? team.logo_url : null;
        sidebarLogoEl.src = rawTeamLogo ? resolveImageUrl(rawTeamLogo, 'team') : "../assets/icons/icon.jpg";
    }

    // Update User Avatar
    const headerAvatarEl = document.getElementById('header-user-avatar');
    if(headerAvatarEl) {
        const rawUserAvatar = user.avatar_url;
        headerAvatarEl.src = rawUserAvatar ? resolveImageUrl(rawUserAvatar, 'user') : "../assets/icons/icon.jpg";
    }
}

window.switchTab = function(id) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.remove('bg-b-primary/10', 'text-b-primary', 'font-bold');
        b.classList.add('text-gray-400');
    });

    const activeContent = document.getElementById(id);
    if (activeContent) activeContent.classList.add('active');

    const activeBtn = document.getElementById('btn-' + id);
    if (activeBtn) {
        activeBtn.classList.add('bg-b-primary/10', 'text-b-primary', 'font-bold');
        activeBtn.classList.remove('text-gray-400');
    }

    if (id === 'rank') initBadgesSystem();
    if (id === 'team-rank') initTeamBadgesSystem();
    if (id === 'leaderboard') initLeaderboard();
    if (id === 'announcements') {
        if (currentUserData?.team_id) {
            initNotificationsSystem(currentUserData.team_id);
        } else {
            showToast("Loading team data...", "info");
        }
    }
};

function renderAllTabs() {
    renderOverview();
    renderRoadmapTree();
    if (typeof renderSquadTab === 'function') {
        renderSquadTab(currentTeam);
    }
    renderCalendarTab();
}
// ==========================================
// 5. DASHBOARD OVERVIEW
// ==========================================
function renderOverview() {
    renderWeekInfo(); 

    const activeIds = currentTeam?.courses_plan || [];
    const tasks = currentTeam?.weekly_tasks || [];

    const statMembers = document.getElementById('stat-members-count');
    const statCourses = document.getElementById('stat-active-courses');
    const statTasks = document.getElementById('stat-active-tasks');

    if (statMembers) statMembers.innerText = `${(currentTeam?.members || []).length} / 5`;
    if (statCourses) statCourses.innerText = activeIds.length;
    if (statTasks) statTasks.innerText = tasks.length;

    renderTeamOverview(tasks);
    renderActiveCourses(activeIds);
}

// Render overview tasks with smart status (Active, Completed, Overdue)
async function renderTeamOverview(tasks) {
    const container = document.getElementById('overview-container');
    const coursesContainer = document.getElementById('active-courses-container');
    if (!container) return;
    
    // 💡 حالة: الطالب ليس لديه فريق (Team ID is null)
    if (!currentTeam || !currentTeam.team_id) {
        // رسالة الانضمام لفريق (تأخذ مساحة القسمين معاً)
        container.parentElement.className = "lg:col-span-3 bg-b-surface p-8 rounded-2xl border border-white/10 flex flex-col items-center justify-center h-full shadow-lg";
        
        // إخفاء صندوق الكورسات النشطة لأننا سنعرض رسالة واحدة كبيرة
        if (coursesContainer && coursesContainer.parentElement) {
            coursesContainer.parentElement.classList.add('hidden');
        }

        container.innerHTML = `
            <div class="text-center py-10 max-w-lg mx-auto">
                <div class="w-24 h-24 bg-yellow-500/10 rounded-full flex items-center justify-center text-yellow-500 text-5xl mx-auto mb-6 shadow-[0_0_30px_rgba(234,179,8,0.2)]">
                    <i class="fas fa-users-slash"></i>
                </div>
                <h3 class="text-3xl font-black text-white mb-4">أنت لست ضمن أي فريق!</h3>
                <p class="text-gray-400 mb-8 text-lg leading-relaxed">
                    نظام <strong>Busla</strong> مصمم للعمل الجماعي. لتتمكن من رؤية المهام، دراسة الكورسات، وجمع النقاط، يجب عليك الانضمام إلى فريق أو إنشاء فريقك الخاص وقيادته.
                </p>
                <div class="flex gap-4 justify-center">
                    <button onclick="window.showToast('قريباً: الانضمام لفريق', 'info')" class="px-8 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-all border border-white/5">
                        <i class="fas fa-search mr-2"></i> البحث عن فريق
                    </button>
                    <button onclick="window.showToast('قريباً: إنشاء فريق', 'info')" class="px-8 py-3 bg-b-primary hover:bg-teal-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-b-primary/30 hover:-translate-y-1">
                        <i class="fas fa-flag mr-2"></i> إنشاء فريق جديد
                    </button>
                </div>
            </div>
        `;
        return;
    }

    // إظهار قسم الكورسات النشطة (في حال كان الطالب لديه فريق)
    if (coursesContainer && coursesContainer.parentElement) {
        coursesContainer.parentElement.classList.remove('hidden');
        container.parentElement.className = "lg:col-span-2 bg-b-surface p-6 rounded-2xl border border-white/10 flex flex-col h-[55vh] shadow-lg";
    }

    // Show loading spinner
    container.innerHTML = '<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-b-primary text-2xl"></i></div>';

    if (!tasks || tasks.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-600 bg-white/5 rounded-2xl border border-white/5 border-dashed">
                <i class="fas fa-clipboard-list text-5xl mb-4 opacity-50"></i>
                <p>لا توجد مهام معينة حالياً.</p>
                <p class="text-xs mt-2">يقوم قائد الفريق بتعيين المهام أسبوعياً.</p>
            </div>`;
        return;
    }

    try {
        const userId = currentUser.id;
        
        // Fetch student's personal progress to determine completion status
        const [projRes, quizRes, matRes] = await Promise.all([
            supabase.from('project_submissions').select('project_id').eq('user_id', userId),
            supabase.from('quiz_attempts').select('quiz_id, passed').eq('user_id', userId),
            supabase.from('completed_materials').select('material_id').eq('user_id', userId)
        ]);

        const completedProjects = new Set((projRes.data || []).map(p => p.project_id));
        const passedQuizzes = new Set((quizRes.data || []).filter(q => q.passed).map(q => q.quiz_id));
        const completedMats = new Set((matRes.data || []).map(m => m.material_id));

        const currentWeek = getCurrentWeekCycle(); 
        const displayTasks = [];

        // Categorize tasks into current or overdue
        tasks.forEach(t => {
            const taskDate = t.due_date ? new Date(t.due_date) : new Date(t.created_at || t.start_date);
            if (isNaN(taskDate.getTime())) return;

            let isCompleted = false;
            if (t.type === 'project') isCompleted = completedProjects.has(t.content_id);
            else if (t.type === 'quiz') isCompleted = passedQuizzes.has(t.content_id);
            else isCompleted = completedMats.has(t.content_id);

            const isCurrentWeek = t.week_id === currentWeek.id;
            const isPastTask = taskDate < currentWeek.start && !isCurrentWeek;

            if (isCurrentWeek) {
                displayTasks.push({ ...t, isCompleted, isOverdue: false });
            } else if (isPastTask && !isCompleted) {
                displayTasks.push({ ...t, isCompleted, isOverdue: true });
            }
        });

        // Sort: Overdue first, then Active, then Completed
        displayTasks.sort((a, b) => {
            if (a.isOverdue && !b.isOverdue) return -1;
            if (!a.isOverdue && b.isOverdue) return 1;
            if (!a.isCompleted && b.isCompleted) return -1;
            if (a.isCompleted && !b.isCompleted) return 1;
            return new Date(b.created_at) - new Date(a.created_at);
        });

        if (displayTasks.length === 0) {
            container.innerHTML = `
                <div class="text-center text-gray-400 py-12 border border-dashed border-white/5 rounded-2xl bg-black/20">
                    <i class="fas fa-check-circle text-green-500 text-4xl mb-3 opacity-80"></i>
                    <p class="font-bold text-lg text-white">عمل رائع!</p>
                    <p class="text-sm mt-1">لقد أنجزت جميع المهام المطلوبة منك بنجاح.</p>
                </div>`;
            return;
        }

        let html = '';
        displayTasks.forEach(task => {
            // UI configuration based on type
            let typeConfig = { icon: 'fa-play', color: 'text-b-primary', bg: 'bg-b-primary/10', border: 'border-l-b-primary', label: 'Video' };
            if (task.type === 'quiz') typeConfig = { icon: 'fa-clipboard-question', color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-l-yellow-500', label: 'Quiz' };
            else if (task.type === 'project') typeConfig = { icon: 'fa-code-branch', color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-l-purple-500', label: 'Project' };

            let statusBadge = '';
            let opacityClass = 'opacity-100';

            if (task.isCompleted) {
                statusBadge = `<span class="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fas fa-check"></i> مكتملة</span>`;
                opacityClass = 'opacity-50 hover:opacity-100'; 
                typeConfig.border = 'border-l-green-500/50'; 
            } else if (task.isOverdue) {
                statusBadge = `<span class="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse"><i class="fas fa-exclamation-triangle"></i> متأخرة</span>`;
                typeConfig.border = 'border-l-red-500'; 
            } else {
                statusBadge = `<span class="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fas fa-clock"></i> جارية</span>`;
            }

            const taskId = task.id || task.task_id;

            // 💡 التعديل هنا: إزالة زر الحذف (سلة المهملات) بالكامل في لوحة الطالب
            html += `
                <div class="bg-black/40 border border-white/5 border-l-4 ${typeConfig.border} rounded-xl p-4 flex justify-between items-center group hover:bg-white/5 transition-all shadow-sm ${opacityClass}">
                    
                    <div class="flex items-center gap-4 flex-1 cursor-pointer" onclick="window.openUnifiedTaskModal('${taskId}')">
                        <div class="w-10 h-10 rounded-xl ${typeConfig.bg} ${typeConfig.color} flex items-center justify-center text-lg shadow-inner shrink-0">
                            <i class="fas ${typeConfig.icon}"></i>
                        </div>
                        <div class="flex-1 min-w-0 pr-2 text-right">
                            <h4 class="font-bold text-white text-sm line-clamp-1 group-hover:text-b-primary transition-colors">
                                ${task.title || "Untitled Task"}
                            </h4>
                            <div class="flex items-center justify-end gap-2 mt-1.5 flex-row-reverse w-full">
                                <span class="text-[10px] text-gray-400 bg-black px-2 py-0.5 rounded border border-white/5">${typeConfig.label}</span>
                                ${statusBadge}
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center gap-2 shrink-0 border-r border-white/10 pr-4 mr-2">
                        <a href="course-player.html?id=${task.course_id}&content=${task.content_id}&task_id=${taskId}" 
                           onclick="event.stopPropagation();"
                           class="w-8 h-8 rounded-full bg-white/5 hover:bg-b-primary text-gray-400 hover:text-white flex items-center justify-center transition-all"
                           title="فتح المهمة">
                            <i class="fas fa-external-link-alt text-xs"></i>
                        </a>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    } catch (e) {
        console.error("Error fetching tasks:", e);
        container.innerHTML = `<p class="text-red-500 text-center py-4">Failed to load tasks.</p>`;
    }
}
function renderActiveCourses(activeIds) {
    const container = document.getElementById('active-courses-container');
    if (!container) return;
    
    container.innerHTML = '';

    if (!activeIds || activeIds.length === 0) {
        container.innerHTML = `<div class="text-center py-8 text-gray-500 bg-white/5 rounded-xl border border-white/5 border-dashed"><p>No active courses.</p></div>`;
        return;
    }

    activeIds.forEach(courseId => {
        const courseData = allData.courses.find(c => String(c.id) === String(courseId));
        const title = courseData ? courseData.title : "Selected Course";
        let img = resolveImageUrl(courseData?.image_url, 'course');

        const html = `
            <a href="course-player.html?id=${courseId}" 
               class="block bg-b-surface border border-white/10 rounded-xl overflow-hidden hover:border-purple-500/50 transition-all group relative mb-4">
                <div class="h-28 overflow-hidden relative">
                    <img src="${img}" alt="${title}" class="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500">
                    <div class="absolute inset-0 bg-gradient-to-t from-b-surface via-transparent to-transparent"></div>
                </div>
                <div class="p-4 relative -mt-6">
                    <div class="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white shadow-lg border-2 border-b-surface mb-2">
                        <i class="fas fa-book-open text-sm"></i>
                    </div>
                    <h4 class="font-bold text-white text-base mb-1 group-hover:text-purple-400 transition-colors line-clamp-1">${title}</h4>
                    <span class="text-xs text-gray-400">Click to Continue ←</span>
                </div>
            </a>
        `;
        container.innerHTML += html;
    });
}

function renderWeekInfo() {
    const headerContainer = document.getElementById('week-header-info');
    if (!headerContainer) return;

    const week = getCurrentWeekCycle();
    const now = new Date();
    
    const daysAr = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const currentDayName = daysAr[now.getDay()];

    const options = { month: 'long', day: 'numeric' };
    const startStr = week.start.toLocaleDateString('ar-EG', options);
    const endStr = week.end.toLocaleDateString('ar-EG', options);

    headerContainer.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-center bg-gradient-to-r from-b-primary/20 to-black/20 p-4 rounded-xl border border-b-primary/30 mb-6">
            <div class="flex items-center gap-4 mb-2 md:mb-0">
                <div class="w-12 h-12 rounded-full bg-b-primary flex items-center justify-center text-white text-xl">
                    <i class="fas fa-calendar-alt"></i>
                </div>
                <div>
                    <h3 class="font-bold text-white text-lg">الاسبوع الحالي</h3>
                    <p class="text-sm text-gray-300">من <span class="text-b-hl-light font-bold">${startStr}</span> الى <span class="text-b-hl-light font-bold">${endStr}</span></p>
                </div>
            </div>
            <div class="text-center md:text-left">
                <div class="bg-black/40 px-4 py-2 rounded-lg border border-white/5">
                    <p class="text-xs text-gray-400">اليوم</p>
                    <p class="font-bold text-white text-lg">${currentDayName}</p>
                </div>
            </div>
        </div>
    `;
}


window.openUnifiedTaskModal = (taskId) => {
    const task = currentTeam.weekly_tasks.find(t => t.task_id === taskId);
    if (!task) {
        console.error("Task not found:", taskId);
        return;
    }

    const modal = document.getElementById('unified-task-modal');
    const type = task.type || 'video';
    modal.classList.remove('hidden');
    
    let details = {};
    if (type === 'quiz') {
        details = lookupData.quizzes[String(task.content_id)];
        if (!details) console.warn("Quiz details not in cache:", task.content_id);
    } else if (type === 'project') {
        details = lookupData.projects[String(task.content_id)];
        if (!details) console.warn("Project details not in cache:", task.content_id);
    } else {
        const contentDetails = (lookupData.contents || []).find(c => String(c.id) === String(task.content_id) && c.type === 'video');
        details = contentDetails || task; 
    }

    updateModalContent(task, details || task, type);
};

// Delete assigned task with safety checks
window.unassignTask = (taskId) => {
    // 1. Find task in local state
    const task = (window.allTeamTasks || currentTeam?.weekly_tasks || []).find(t => t.id === taskId || t.task_id === taskId);
    
    if (!task) {
        showToast("Task not found.", "error");
        return;
    }

    // 2. Prevent deleting past tasks
    const currentWeek = getCurrentWeekCycle();
    if (task.week_id && task.week_id !== currentWeek.id) {
        showToast("Cannot delete past tasks.", "error");
        return;
    }

    // 3. Prevent deleting if started
    if (task.stats && (task.stats.started_count > 0 || task.stats.completed_count > 0)) {
        showToast("Cannot delete: Students have already started.", "error");
        return;
    }

    // 4. Confirmation and Deletion
    const confirmMessage = "Are you sure you want to delete this task?";
    
    const performDeletion = async () => {
        try {
            // Fix: Changed table name from 'weekly_tasks' to 'team_tasks'
            const { error } = await supabase.from('team_tasks').delete().eq('id', taskId);
            if (error) throw error;
            
            showToast("Task deleted successfully.", "success");
            
            // Update local state
            if (window.allTeamTasks) {
                window.allTeamTasks = window.allTeamTasks.filter(t => t.id !== taskId && t.task_id !== taskId);
            }
            if (currentTeam && currentTeam.weekly_tasks) {
                currentTeam.weekly_tasks = currentTeam.weekly_tasks.filter(t => t.id !== taskId && t.task_id !== taskId);
            }
            
            // Refresh UI
            if (typeof renderTeamOverview === 'function') {
                renderTeamOverview(window.allTeamTasks || currentTeam.weekly_tasks);
            }
            
        } catch (err) {
            console.error("Delete Task Error:", err);
            showToast("Failed to delete task.", "error");
        }
    };

    if (typeof openConfirmModal === 'function') {
        openConfirmModal(confirmMessage, performDeletion);
    } else {
        if (confirm(confirmMessage)) {
            performDeletion();
        }
    }
};


// ==========================================
// 6. ROADMAP & CURRICULUM
// ==========================================

// 💡 دالة ذكية لمعالجة الروابط وتجنب خطأ 404
window.formatExternalUrl = function(playlistId) {
    if (!playlistId) return '#';
    const str = String(playlistId).trim();
    if (str.startsWith('http://') || str.startsWith('https://')) {
        return str;
    }
    return `https://www.youtube.com/playlist?list=${str}`;
};

function renderRoadmapTree() {
    const container = document.getElementById('roadmap-tree-container');
    if (!container) return;
    container.innerHTML = '';

    if (!allData.tree || allData.tree.length === 0) {
         container.innerHTML = '<div class="text-center py-10 text-gray-500">جاري تحميل المحتوى...</div>';
         return;
    }

    allData.tree.forEach((phase) => {
        const phaseId = String(phase.id).trim();
        const phaseEl = document.createElement('div');
        phaseEl.className = "mb-8 border-l-4 border-white/10 pl-6 relative"; 

        phaseEl.innerHTML = `
            <div class="absolute -left-[11px] top-0 w-5 h-5 bg-b-primary rounded-full border-4 border-black box-content shadow-[0_0_10px_rgba(0,106,103,0.5)]"></div>
            
            <div class="flex items-center justify-between mb-5 select-none group cursor-pointer" onclick="window.togglePhaseContent('${phaseId}')">
                <div class="flex-1" onclick="event.stopPropagation(); window.showDetails('phase', '${phaseId}')">
                    <h3 class="font-bold text-xl text-white group-hover:text-b-primary transition-colors">${phase.title}</h3>
                    <span class="text-xs text-gray-400 font-mono mt-1 block">${phase.description || ''}</span>
                </div>
                <div class="p-2 hover:bg-white/10 rounded-full transition-all">
                    <i class="fas fa-chevron-down text-white transition-transform duration-300" id="icon-phase-${phaseId}"></i>
                </div>
            </div>
            <div id="content-phase-${phaseId}" class="space-y-4"></div>
        `;

        const itemsContainer = phaseEl.querySelector(`#content-phase-${phaseId}`);

        if (!phase.courses || phase.courses.length === 0) {
            itemsContainer.innerHTML = '<p class="text-sm text-gray-600 italic pl-2">لا يوجد محتوى.</p>';
        } else {
            const mainCourses = phase.courses.filter(c => !c.related_with);
            const subCourses = phase.courses.filter(c => c.related_with);

            mainCourses.forEach(course => {
                const courseId = String(course.id).trim();
                const children = subCourses.filter(c => String(c.related_with).trim() === courseId);
                const hasChildren = children.length > 0;
                const isExpanded = expandedNodes.has(`course-children-${courseId}`);

                const isActive = (currentTeam?.courses_plan || []).includes(courseId);

                const itemHTML = document.createElement('div');
                itemHTML.className = `rounded-xl overflow-hidden border-2 transition-all duration-300 shadow-sm ${isActive ? 'border-b-primary/50 bg-b-primary/5' : 'border-white/10 bg-black/40 hover:border-white/30'}`;

                let childrenHtml = '';
                if (hasChildren) {
                    childrenHtml = `<div id="course-children-${courseId}" class="${isExpanded ? '' : 'hidden'} bg-black/60 border-t border-white/5 p-3 space-y-2">`;
                    
                    children.forEach(child => {
                        const childId = String(child.id).trim();
                        const isChildActive = (currentTeam?.courses_plan || []).includes(childId);
                        
                        childrenHtml += `
                            <div class="flex items-center justify-between p-3 rounded-lg border border-white/5 hover:bg-white/5 transition-colors ${isChildActive ? 'bg-b-primary/10 border-b-primary/30' : 'bg-b-surface mr-4'}">
                                <div class="flex items-center gap-3 flex-1 cursor-pointer" onclick="window.showDetails('course', '${childId}')">
                                    <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-black/40 border border-white/10 shrink-0">
                                        ${isChildActive ? '<i class="fas fa-unlock text-b-primary text-sm"></i>' : '<i class="fas fa-lock text-gray-500 text-sm"></i>'}
                                    </div>
                                    <div class="truncate flex-1">
                                        <h5 class="font-bold text-sm ${isChildActive ? 'text-white' : 'text-gray-300'} truncate">${child.title}</h5>
                                        ${child.real_video_count ? `<span class="text-[10px] text-blue-400"><i class="fas fa-video mr-1"></i> ${child.real_video_count} درس</span>` : ''}
                                    </div>
                                </div>
                                <div class="pl-3 border-l border-white/10 flex gap-2">
                                    <a href="course-player.html?id=${childId}" class="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-b-primary hover:text-white transition-colors text-gray-400" title="فتح المشغل">
                                        <i class="fas fa-play text-xs"></i>
                                    </a>
                                </div>
                            </div>
                        `;
                    });
                    childrenHtml += `</div>`;
                }

                itemHTML.innerHTML = `
                    <div class="p-4 flex items-center justify-between cursor-pointer select-none"
                         onclick="window.handleItemClick('course', '${courseId}', ${hasChildren})">
                        
                        <div class="flex items-center gap-4 overflow-hidden flex-1">
                            <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-black/40 border border-white/10 shrink-0 text-lg shadow-inner">
                                ${isActive ? '<i class="fas fa-unlock text-b-primary text-xl"></i>' : '<i class="fas fa-lock text-gray-500"></i>'}
                            </div>
                            <div class="truncate flex-1">
                                <h4 class="font-bold text-base ${isActive ? 'text-white' : 'text-gray-200'} truncate">${course.title}</h4>
                                <div class="flex items-center gap-3 mt-1">
                                    <span class="text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded border border-white/5 font-mono">Module</span>
                                    ${course.real_video_count ? `<span class="text-[10px] text-blue-400"><i class="fas fa-video ml-1"></i>${course.real_video_count}</span>` : ''}
                                    ${hasChildren ? `<span class="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20"><i class="fas fa-sitemap ml-1"></i>${children.length} أقسام</span>` : ''}
                                </div>
                            </div>
                        </div>

                        <div class="flex items-center gap-2 pl-2">
                            <a href="course-player.html?id=${courseId}" onclick="event.stopPropagation()" class="w-9 h-9 flex items-center justify-center rounded-xl bg-b-primary/20 text-b-primary hover:bg-b-primary hover:text-white transition-colors" title="فتح المشغل">
                                <i class="fas fa-play text-sm"></i>
                            </a>
                            ${course.playlist_id ? `
                            <a href="${window.formatExternalUrl(course.playlist_id)}" target="_blank" onclick="event.stopPropagation()" class="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors" title="المصدر الخارجي">
                                <i class="fas fa-external-link-alt text-sm"></i>
                            </a>
                            ` : ''}

                            ${hasChildren ? `
                            <div class="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors text-gray-400 ml-2" onclick="event.stopPropagation(); window.toggleCourseChildren('${courseId}')">
                                <i class="fas fa-chevron-down transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}" id="icon-course-${courseId}"></i>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    ${childrenHtml}
                `;
                itemsContainer.appendChild(itemHTML);
            });
        }
        container.appendChild(phaseEl);
    });
}

window.handleItemClick = (type, id, hasChildren) => {
    window.showDetails(type, id);
    if (hasChildren) {
        window.toggleCourseChildren(id);
    }
};

window.toggleCourseChildren = (courseId) => {
    const contentId = `course-children-${courseId}`;
    const content = document.getElementById(contentId);
    const icon = document.getElementById(`icon-course-${courseId}`);
    
    if (content) {
        const isHidden = content.classList.toggle('hidden');
        if (icon) icon.classList.toggle('rotate-180');
        
        if (!isHidden) expandedNodes.add(contentId);
        else expandedNodes.delete(contentId);
    }
};

window.togglePhaseContent = (phaseId) => {
    const content = document.getElementById(`content-phase-${phaseId}`);
    const icon = document.getElementById(`icon-phase-${phaseId}`);
    if (content) content.classList.toggle('hidden');
    if (icon) icon.classList.toggle('rotate-180');
};

window.showDetails = (type, id, parentTitle = "") => {
    const ph = document.getElementById('node-details-placeholder');
    const ct = document.getElementById('node-details-content');
    
    ph.classList.add('hidden');
    ct.classList.remove('hidden');

    let item;
    if (type === 'phase') {
        item = allData.phases.find(p => String(p.id) === String(id));
    } else {
        item = allData.courses.find(c => String(c.id) === String(id));
    }

    if (!item) return;

    const setText = (eid, txt) => {
        const el = document.getElementById(eid);
        if(el) el.innerText = txt || '--';
    };

    setText('detail-title', item.title);
    setText('detail-desc', item.description || "No description.");
    
    const typeLabel = type === 'phase' ? 'Educational Phase' : (item.type || 'Course');
    setText('detail-type', typeLabel);
    setText('detail-instructor', item.instructor || "Busla Team");
    
    const realDur = item.real_total_duration && item.real_total_duration !== "00:00:00" ? item.real_total_duration : "00:00:00";
    setText('detail-duration', realDur);

    const vidCount = item.real_video_count ? `${item.real_video_count} Lessons` : "0 Lessons";
    setText('detail-videos', vidCount);

    const planTime = item.module_time || "Undefined";
    setText('detail-plan-time', planTime);

    const showSection = (contId, txtId, content) => {
        const cont = document.getElementById(contId);
        const txt = document.getElementById(txtId);
        let displayContent = content;
        if (Array.isArray(content)) displayContent = content.join(', ');
        
        if (displayContent && displayContent !== 'None' && displayContent.trim() !== "") {
            cont.classList.remove('hidden');
            if(txt) txt.innerText = displayContent;
        } else {
            cont.classList.add('hidden');
        }
    };

    showSection('detail-prereq-container', 'detail-prereq', item.prerequisites);
    showSection('detail-learn-container', 'detail-learn', item.what_you_will_learn);
    showSection('detail-tools-container', 'detail-tools', item.tools_required);
    showSection('detail-notes-container', 'detail-notes', item.note);

    const imgEl = document.getElementById('detail-img');
    let img = resolveImageUrl(item.image_url, 'course');
    if (imgEl) {
        imgEl.src = (item.image_url && item.image_url.startsWith('http')) ? img : '../assets/images/1.jpg';
    }

    const toggleArea = document.getElementById('course-action-area');
    if (type === 'phase') {
        toggleArea.classList.add('hidden');
    } else {
        toggleArea.classList.remove('hidden');
        
        // 💡 تم تطبيق دالة الحماية (formatExternalUrl) هنا أيضاً
        toggleArea.innerHTML = `
            <div class="flex gap-3">
                <a href="course-player.html?id=${id}" class="flex-1 bg-b-primary hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2">
                    <i class="fas fa-play"></i> فتح الكورس
                </a>
                ${item.playlist_id ? `
                <a href="${window.formatExternalUrl(item.playlist_id)}" target="_blank" class="w-12 h-12 bg-white/5 hover:bg-white/10 text-gray-300 font-bold rounded-xl transition-all flex items-center justify-center border border-white/10" title="المصدر الخارجي">
                    <i class="fas fa-external-link-alt"></i>
                </a>
                ` : ''}
            </div>
            ${!(currentTeam?.courses_plan || []).includes(String(id)) ? `
                <p class="text-[10px] text-yellow-500 mt-2 text-center"><i class="fas fa-lock mr-1"></i> الكورس غير مفعل من قِبل الليدر، لكن يمكنك مشاهدته.</p>
            ` : ''}
        `;
    }
};

// ==========================================
// 8. TEAM & SQUAD MANAGEMENT (STUDENT VIEW)
// ==========================================

async function renderSquadTab(teamData) {
    const hasTeamView = document.getElementById('has-team-view');
    const noTeamView = document.getElementById('no-team-view');

    if (teamData && teamData.id) {
        // حالة: الطالب في فريق
        if(hasTeamView) hasTeamView.classList.remove('hidden');
        if(noTeamView) noTeamView.classList.add('hidden');
        await renderSquad(); 
    } else {
        // حالة: الطالب ليس في فريق
        if(hasTeamView) hasTeamView.classList.add('hidden');
        if(noTeamView) noTeamView.classList.remove('hidden');
        checkPendingInvitesBadge();
    }
}

// 1. عرض أعضاء الفريق الحالي للطالب
async function renderSquad() {
    const container = document.getElementById('squad-list-container');
    if (!container) return;

    // 💡 شرط الحماية لمنع إرسال "null" إلى قاعدة البيانات
    if (!currentTeam || !currentTeam.team_id) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = '<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-b-primary text-2xl"></i></div>';

    try {
        const { data: membersData, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('team_id', currentTeam.team_id);

        if (error) throw error;
        
        // ... (باقي الكود كما هو بالأسفل) ...
        membersData.sort((a, b) => (b.total_xp || 0) - (a.total_xp || 0));

        let containerHtml = '';
        membersData.forEach((member, index) => {
            const university = member.university || "غير محدد";
            const name = member.full_name || "عضو مجهول";
            const photo = resolveImageUrl(member.avatar_url, 'user');
            const points = member.total_xp || 0;
            const rankData = getRankDataForMember(points);
            const isLeader = member.id === currentTeam.leader_id;
            const isMe = member.id === currentUser.id;

            containerHtml += `
            <div class="group flex flex-col md:flex-row items-center bg-white/5 border border-white/5 rounded-3xl p-5 relative overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-white/20">
                <div class="absolute right-0 top-0 bottom-0 w-1.5 transition-all duration-500 bg-gradient-to-b from-${index < 3 ? 'yellow-500' : 'transparent'} to-transparent group-hover:h-full"></div>
                <div class="hidden md:flex items-center justify-center w-14 text-3xl font-black text-white/5 font-mono">#${index + 1}</div>
                <div class="relative mb-4 md:mb-0 md:ml-8 flex-shrink-0">
                    <div class="w-24 h-24 rounded-full p-[3px] bg-gradient-to-tr from-[${rankData.stage_color}] to-transparent relative">
                        <img src="${photo}" class="w-full h-full rounded-full object-cover border-4 border-black bg-black" onerror="this.src='../assets/icons/icon.jpg'">
                    </div>
                    <div class="absolute -bottom-2 -right-2 w-12 h-12 bg-black rounded-full flex items-center justify-center border-2 border-[${rankData.stage_color}] shadow-lg z-10">
                        <img src="../assets/user-badge/lv${rankData.level}.png" class="w-10 h-10 object-contain">
                    </div>
                </div>
                <div class="flex-1 text-center md:text-right space-y-1.5 min-w-0">
                    <div class="flex items-center justify-center md:justify-start gap-3">
                        <h4 class="text-white font-bold text-xl truncate tracking-tight">${name}</h4>
                        ${isMe ? `<span class="px-2 py-0.5 bg-white/10 text-gray-300 text-[10px] rounded-full">أنت</span>` : ''}
                        ${isLeader ? `<span class="px-2.5 py-0.5 bg-yellow-500/20 text-yellow-500 text-[10px] rounded-full border border-yellow-500/30 font-bold uppercase"><i class="fas fa-crown mr-1"></i> الليدر</span>` : ''}
                    </div>
                    <div class="text-xs font-bold tracking-widest uppercase opacity-90" style="color: ${rankData.stage_color}">${rankData.title}</div>
                    <div class="flex items-center justify-center md:justify-start gap-2 text-xs text-gray-400 mt-1">
                        <i class="fas fa-university"></i> <span>${university}</span>
                    </div>
                </div>
                <div class="flex items-center gap-6 mt-6 md:mt-0 pl-4 border-l border-white/5 ml-4">
                    <div class="text-center px-2">
                        <span class="block text-[9px] text-gray-500 uppercase tracking-widest mb-0.5">النقاط</span>
                        <span class="font-mono font-black text-2xl text-white">${points.toLocaleString()} <span class="text-[10px] text-b-primary">XP</span></span>
                    </div>
                </div>
            </div>`;
        });
        container.innerHTML = containerHtml;
    } catch (e) {
        console.error("Squad Render Error:", e);
        container.innerHTML = '<p class="text-red-500 text-center py-4">فشل في تحميل أعضاء الفريق.</p>';
    }
}

// 2. مغادرة الفريق (احتفاظ بالطالب بنقاطه، وخصمها من الفريق)
window.leaveCurrentTeam = () => {
    openConfirmModal("هل أنت متأكد من مغادرة الفريق؟ ستحتفظ بنقاطك وإنجازاتك الشخصية، ولكن سيتم حذف مساهماتك من نقاط الفريق.", async () => {
        try {
            const teamId = currentTeam.team_id;
            const myId = currentUser.id;

            // 1. حساب النقاط التي ساهم بها الطالب في هذا الفريق
            const { data: logs } = await supabase.from('team_score_logs')
                .select('amount, id')
                .eq('team_id', teamId)
                .eq('contributor_id', myId);

            let totalContributed = 0;
            let logIds = [];
            if (logs) {
                logs.forEach(l => { totalContributed += l.amount; logIds.push(l.id); });
            }

            // 2. خصم النقاط من رصيد الفريق الكلي
            if (totalContributed > 0) {
                const { data: teamInfo } = await supabase.from('teams').select('total_score').eq('id', teamId).single();
                const newTeamScore = Math.max(0, (teamInfo?.total_score || 0) - totalContributed);
                await supabase.from('teams').update({ total_score: newTeamScore }).eq('id', teamId);
                
                // 3. حذف سجلات المساهمة
                await supabase.from('team_score_logs').delete().in('id', logIds);
            }

            // 4. إزالة الطالب من الفريق في البروفايل (دون المساس بـ total_xp الخاص به)
            const { error: profileError } = await supabase.from('profiles').update({ team_id: null }).eq('id', myId);
            if (profileError) throw profileError;

            showToast("تم مغادرة الفريق بنجاح. بياناتك الشخصية محفوظة.", "success");
            setTimeout(() => window.location.reload(), 1500);

        } catch (error) {
            console.error("Leave Team Error:", error);
            showToast("حدث خطأ أثناء المغادرة.", "error");
        }
    });
};

// ==========================================
// 9. NO-TEAM: INVITATIONS & BROWSER
// ==========================================

let allSystemTeams = []; // Cache for browser

// التشييك على الدعوات لوضع تنبيه (Badge)
async function checkPendingInvitesBadge() {
    const badge = document.getElementById('invites-badge');
    if(!badge || !currentUser) return;
    try {
        const { count } = await supabase.from('team_invitations')
            .select('*', { count: 'exact', head: true })
            .eq('to_uid', currentUser.id)
            .eq('status', 'pending');
        
        if (count > 0) {
            badge.innerText = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    } catch(e){}
}

window.openStudentInvites = async () => {
    document.getElementById('student-invites-modal').classList.remove('hidden');
    const container = document.getElementById('student-invites-list');
    container.innerHTML = '<div class="text-center py-10 text-gray-500"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
    
    try {
        const { data: invites, error } = await supabase.from('team_invitations')
            .select('id, from_team_id, created_at, team_snapshot')
            .eq('to_uid', currentUser.id)
            .eq('status', 'pending');

        if (error) throw error;

        if (!invites || invites.length === 0) {
            container.innerHTML = '<div class="text-center py-10 text-gray-500 bg-white/5 rounded-xl border border-white/5 border-dashed">لا توجد دعوات معلقة.</div>';
            return;
        }

        container.innerHTML = invites.map(inv => `
            <div class="bg-black/40 border border-white/5 rounded-xl p-4 flex justify-between items-center hover:bg-white/5 transition-all">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-purple-500/20 text-purple-500 rounded-lg flex items-center justify-center"><i class="fas fa-flag"></i></div>
                    <div>
                        <h4 class="font-bold text-white text-sm">${inv.team_snapshot?.name || 'فريق'}</h4>
                        <p class="text-[10px] text-gray-400 mt-1">بواسطة القائد: ${inv.team_snapshot?.leader_name || 'غير معروف'}</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="window.viewTeamDetails('${inv.from_team_id}', '${inv.id}', 'invite')" class="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-bold transition-all border border-white/10">التفاصيل والرد</button>
                </div>
            </div>
        `).join('');

    } catch (e) {
        console.error(e);
        container.innerHTML = '<p class="text-red-500 text-center py-4">خطأ في جلب الدعوات.</p>';
    }
};

window.openTeamBrowser = async () => {
    document.getElementById('team-browser-modal').classList.remove('hidden');
    const tbody = document.getElementById('teams-browser-list');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-gray-500"><i class="fas fa-spinner fa-spin"></i> جاري جلب الفرق...</td></tr>';
    
    try {
        const { data: teams, error } = await supabase.from('teams').select('*, profiles!teams_leader_id_fkey(full_name, university)');
        if (error) throw error;
        
        allSystemTeams = teams;
        window.filterTeams(); // يقوم بالرسم بناءً على الفلتر
    } catch(e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 py-10">فشل تحميل قائمة الفرق</td></tr>';
    }
};

window.filterTeams = () => {
    const q = document.getElementById('team-search-input')?.value.toLowerCase() || '';
    const u = document.getElementById('team-uni-filter')?.value || '';
    const tbody = document.getElementById('teams-browser-list');
    
    let filtered = allSystemTeams.filter(t => {
        const tName = (t.name || '').toLowerCase();
        const lName = (t.profiles?.full_name || '').toLowerCase();
        const lUni = t.profiles?.university || '';
        
        const matchSearch = tName.includes(q) || lName.includes(q);
        const matchUni = u === '' || lUni === u;
        return matchSearch && matchUni;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-500 py-10">لا توجد فرق تطابق بحثك.</td></tr>';
        return;
    }

    // Sort by score
    filtered.sort((a,b) => (b.total_score || 0) - (a.total_score || 0));

    tbody.innerHTML = filtered.map(t => {
        const teamRank = getRankObject(t.total_score || 0, TEAM_RANKS_DATA);
        const memCount = (t.members || []).length;
        
        return `
        <tr class="hover:bg-white/5 transition-colors group">
            <td class="p-4">
                <div class="flex items-center gap-3">
                    <img src="${resolveImageUrl(t.logo_url, 'team')}" class="w-10 h-10 rounded-lg object-cover bg-black border border-white/10">
                    <div>
                        <p class="font-bold text-white text-sm">${t.name}</p>
                        <span class="text-[10px] px-1.5 py-0.5 rounded border mt-1 inline-block" style="color:${teamRank.stage_color}; border-color:${teamRank.stage_color}40">${teamRank.title}</span>
                    </div>
                </div>
            </td>
            <td class="p-4 text-sm text-gray-300">
                ${t.profiles?.full_name || 'غير معروف'}
                <br><span class="text-[10px] text-gray-500"><i class="fas fa-university"></i> ${t.profiles?.university || 'غير محدد'}</span>
            </td>
            <td class="p-4 text-center text-sm font-mono ${memCount >= 5 ? 'text-red-400' : 'text-gray-300'}">${memCount}/5</td>
            <td class="p-4 text-center font-bold font-mono text-b-primary">${(t.total_score || 0).toLocaleString()}</td>
            <td class="p-4 text-center">
                <button onclick="window.viewTeamDetails('${t.id}', null, 'browse')" class="px-3 py-1.5 bg-b-primary/10 hover:bg-b-primary text-b-primary hover:text-white rounded-lg text-xs font-bold transition-all">
                    تفاصيل
                </button>
            </td>
        </tr>`;
    }).join('');
};

// 3. عرض بطاقة الفريق الكبيرة (النافذة العملاقة)
window.viewTeamDetails = async (teamId, inviteId = null, context = 'browse') => {
    const modal = document.getElementById('team-details-modal');
    modal.classList.remove('hidden');
    
    document.getElementById('tdm-members-list').innerHTML = '<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-b-primary text-2xl"></i></div>';
    document.getElementById('tdm-courses-list').innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-gray-500"></i></div>';
    
    try {
        // جلب تفاصيل الفريق ومعلومات الليدر
        const { data: teamData, error } = await supabase.from('teams')
            .select('*, profiles!teams_leader_id_fkey(full_name, university)').eq('id', teamId).single();
        if(error) throw error;

        // جلب الأعضاء
        const { data: mems } = await supabase.from('profiles').select('id, full_name, avatar_url, total_xp').eq('team_id', teamId).order('total_xp', {ascending: false});

        // 1. تعبئة بيانات الهيدر العلوية
        document.getElementById('tdm-name').innerText = teamData.name;
        document.getElementById('tdm-logo').src = resolveImageUrl(teamData.logo_url, 'team');
        const tRank = getRankObject(teamData.total_score || 0, TEAM_RANKS_DATA);
        const rankEl = document.getElementById('tdm-rank');
        const rankImgEl = document.getElementById('tdm-rank-img');
        rankEl.innerText = tRank.title;
        rankEl.style.color = tRank.stage_color; 
        rankEl.style.borderColor = tRank.stage_color + '40';
        rankEl.style.backgroundColor = tRank.stage_color + '1A';
        if (rankImgEl) {
            rankImgEl.src = `../assets/team-badge/lv${tRank.level || 1}.png`;
            rankImgEl.onerror = function() {
                this.src = `../assets/user-badge/lv${tRank.level || 1}.png`;
            };
            // تغيير لون التوهج ليطابق لون المرحلة
            rankImgEl.style.filter = `drop-shadow(0 0 8px ${tRank.stage_color}60)`;
        }
        // 2. تعبئة الإحصائيات والمعلومات
        document.getElementById('tdm-points').innerText = (teamData.total_score || 0).toLocaleString();
        document.getElementById('tdm-courses-count').innerText = (teamData.courses_plan || []).length;
        document.getElementById('tdm-members-count').innerText = `${mems?.length || 0}/5`;
        document.getElementById('tdm-members-badge').innerText = mems?.length || 0;
        
        document.getElementById('tdm-leader-name').innerText = teamData.profiles?.full_name || 'غير معروف';
        document.getElementById('tdm-leader-uni').innerText = teamData.profiles?.university || 'غير محدد';

        // 3. 💡 رسم الكورسات المفعلة بالصور والأسماء
        const coursesPlan = teamData.courses_plan || [];
        const coursesCont = document.getElementById('tdm-courses-list');
        
        if (coursesPlan.length === 0) {
            coursesCont.innerHTML = '<div class="col-span-full text-center py-10 text-gray-500 bg-white/5 rounded-xl border border-dashed border-white/10">لم يقم الليدر بتفعيل أي كورسات بعد.</div>';
        } else {
            coursesCont.innerHTML = coursesPlan.map(cid => {
                const cInfo = (allData?.courses || []).find(c => String(c.id) === String(cid));
                if(!cInfo) return '';
                const img = resolveImageUrl(cInfo.image_url, 'course');
                return `
                    <div class="flex items-center gap-3 bg-white/5 border border-white/5 p-3 rounded-xl hover:bg-white/10 transition-colors">
                        <img src="${img}" class="w-14 h-14 rounded-lg object-cover bg-black shadow-md border border-white/10 shrink-0">
                        <div class="min-w-0 flex-1">
                            <h5 class="text-sm font-bold text-white truncate" title="${cInfo.title}">${cInfo.title}</h5>
                            <p class="text-[10px] text-gray-400 mt-1 flex items-center gap-1.5">
                                <span class="bg-black/50 px-1.5 rounded"><i class="fas fa-video text-blue-400"></i> ${cInfo.real_video_count || 0} درس</span>
                                <span class="bg-black/50 px-1.5 rounded font-mono text-gray-500">${cInfo.module_time || ''}</span>
                            </p>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 4. رسم قائمة الأعضاء (السايدبار)
        if(mems && mems.length > 0){
            document.getElementById('tdm-members-list').innerHTML = mems.map((m) => {
                const isLeader = m.id === teamData.leader_id;
                const mRank = getRankDataForMember(m.total_xp || 0);
                const avatar = resolveImageUrl(m.avatar_url, 'user');
                
                return `
                    <div class="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-transparent hover:border-white/10 transition-colors group">
                        <div class="flex items-center gap-3 min-w-0">
                            <div class="relative shrink-0">
                                <img src="${avatar}" class="w-12 h-12 rounded-full bg-black border-2 object-cover" style="border-color: ${mRank.stage_color}80">
                                ${isLeader ? '<div class="absolute -bottom-1 -right-1 bg-black rounded-full p-0.5 shadow-md"><i class="fas fa-crown text-yellow-500 text-[10px]"></i></div>' : ''}
                            </div>
                            <div class="truncate">
                                <p class="text-sm font-bold text-white truncate">${m.full_name}</p>
                                <span class="text-[10px] px-1.5 py-0.5 rounded border mt-0.5 inline-block" style="color:${mRank.stage_color}; border-color:${mRank.stage_color}40; background-color:${mRank.stage_color}10">${mRank.title}</span>
                            </div>
                        </div>
                        <div class="text-left shrink-0 pl-2">
                            <span class="block text-sm font-black font-mono text-white group-hover:text-b-primary transition-colors">${(m.total_xp || 0).toLocaleString()}</span>
                            <span class="text-[9px] text-gray-500 uppercase tracking-widest">XP</span>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            document.getElementById('tdm-members-list').innerHTML = '<p class="text-xs text-gray-500 text-center py-10">لا يوجد أعضاء.</p>';
        }
const actionCont = document.getElementById('tdm-action-container');
        if (context === 'invite') {
            actionCont.innerHTML = `
                <div class="flex flex-col sm:flex-row gap-3 w-full">
                    <button onclick="window.acceptTeamInvite('${inviteId}', '${teamId}')" class="px-8 py-3.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all flex items-center justify-center gap-2"><i class="fas fa-check"></i> قبول الدعوة</button>
                    <button onclick="window.rejectTeamInvite('${inviteId}')" class="px-8 py-3.5 bg-white/5 hover:bg-red-500/20 text-white hover:text-red-400 font-bold rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2"><i class="fas fa-times"></i> رفض</button>
                </div>
            `;
        } else {
            const reqs = teamData.requests || [];
            const hasApplied = reqs.some(r => r.uid === currentUser.id);
            const isFull = (mems?.length || 0) >= 5;

            if (hasApplied) {
                actionCont.innerHTML = `<div class="px-8 py-3.5 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded-xl font-bold text-sm flex items-center justify-center gap-2 w-full shadow-inner cursor-not-allowed"><i class="fas fa-clock"></i> طلبك قيد المراجعة لدى الليدر</div>`;
            } else if (isFull) {
                actionCont.innerHTML = `<div class="px-8 py-3.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-bold text-sm flex items-center justify-center gap-2 w-full shadow-inner cursor-not-allowed"><i class="fas fa-ban"></i> عذراً، الفريق مكتمل</div>`;
            } else {
                // 💡 التعديل هنا: إضافة حقل كتابة السبب
                actionCont.innerHTML = `
                    <div class="flex flex-col gap-2 w-full md:w-80">
                        <textarea id="join-reason-input" placeholder="لماذا تريد الانضمام وماذا ستقدم للفريق؟" class="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white focus:border-b-primary outline-none resize-none h-16 transition-colors"></textarea>
                        <button onclick="window.applyForTeam('${teamId}', '${teamData.name}')" class="w-full px-6 py-3 bg-b-primary hover:bg-teal-700 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(0,106,103,0.4)] transition-all flex items-center justify-center gap-2 hover:-translate-y-1">
                            <i class="fas fa-paper-plane"></i> إرسال الطلب
                        </button>
                    </div>
                `;
            }
        }
    } catch(e) {
        console.error(e);
        showToast("فشل جلب تفاصيل الفريق", "error");
    }
};

window.applyForTeam = async (teamId, teamName) => {
    try {
        const reasonInput = document.getElementById('join-reason-input');
        const reasonText = reasonInput ? reasonInput.value.trim() : '';

        if(!reasonText) return showToast("يرجى كتابة سبب الانضمام.", "warning");

        const { data: teamInfo } = await supabase.from('teams').select('requests').eq('id', teamId).single();
        const currentReqs = teamInfo?.requests || [];
        
        if (currentReqs.some(r => r.uid === currentUser.id)) {
            return showToast("لقد قمت بالتقديم مسبقاً على هذا الفريق.", "warning");
        }

        currentReqs.push({
            uid: currentUser.id,
            name: currentUserData.full_name || 'طالب',
            reason: reasonText, // 💡 حفظ السبب
            status: 'pending',
            date: new Date().toISOString()
        });

        await supabase.from('teams').update({ requests: currentReqs }).eq('id', teamId);
        
        showToast(`تم إرسال طلب الانضمام لفريق ${teamName} بنجاح!`, "success");
        window.closeModal('team-details-modal');
        window.viewTeamDetails(teamId, null, 'browse');

    } catch (e) {
        console.error(e);
        showToast("فشل في إرسال الطلب", "error");
    }
};
window.acceptTeamInvite = async (inviteId, teamId) => {
    try {
        // 1. جلب نقاط الطالب الحالية
        const { data: prof } = await supabase.from('profiles').select('total_xp').eq('id', currentUser.id).single();
        const studentXp = prof?.total_xp || 0;

        // 2. تحديث البروفايل الخاص بالطالب ليصبح ضمن الفريق
        const { error: profileError } = await supabase.from('profiles').update({ team_id: teamId }).eq('id', currentUser.id);
        if (profileError) throw profileError;

        // 3. إذا كان الطالب يمتلك نقاط، قم بإضافتها للفريق
        if (studentXp > 0) {
            const { data: teamInfo } = await supabase.from('teams').select('total_score').eq('id', teamId).single();
            const currentTeamScore = teamInfo?.total_score || 0;
            
            await supabase.from('teams').update({ total_score: currentTeamScore + studentXp }).eq('id', teamId);
            
            // تسجيل مساهمة الطالب في السجل
            await supabase.from('team_score_logs').insert({
                team_id: teamId,
                contributor_id: currentUser.id,
                amount: studentXp,
                reason: 'نقاط الانضمام المبدئية'
            });
        }

        // 4. حذف الدعوة
        await supabase.from('team_invitations').delete().eq('id', inviteId);
        
        showToast("تهانينا! لقد انضممت للفريق وتمت إضافة نقاطك لصالحه.", "success");
        setTimeout(() => window.location.reload(), 1500);
    } catch(e) {
        console.error("Accept Invite Error:", e);
        showToast("حدث خطأ أثناء الانضمام", "error");
    }
};

window.rejectTeamInvite = async (inviteId) => {
    try {
        // 1. حذف الدعوة
        const { error } = await supabase.from('team_invitations').delete().eq('id', inviteId);
        if (error) throw error;

        showToast("تم رفض الدعوة.", "info");
        window.closeModal('team-details-modal');
        
        // 2. تحديث قائمة الدعوات المفتوحة
        window.openStudentInvites(); 
        
        // 3. تحديث رقم الإشعار (البادج) الخارجي لكي يختفي الرقم
        if (typeof checkPendingInvitesBadge === 'function') {
            await checkPendingInvitesBadge();
        }

    } catch(e) {
        console.error("Reject Invite Error:", e);
        showToast("حدث خطأ أثناء الرفض", "error");
    }
};

// دالة مساعدة لعمل رتب الفريق (مفقودة في كود الطالب)
function getRankObject(points, dataSet) {
    if(!dataSet || dataSet.length === 0) return { title: 'مبتدئ', stage_color: '#888', level: 1 };
    let rankObj = dataSet[0];
    for (let i = 0; i < dataSet.length; i++) {
        if (points >= dataSet[i].points_required) rankObj = dataSet[i];
        else break;
    }
    return rankObj;
}

// ==========================================
// 10. CALENDAR SYSTEM
// ==========================================
function renderCalendarTab() {
    if (!currentTeam) return;
    
    if (typeof calendarDate === 'undefined' || !calendarDate) {
        window.calendarDate = new Date();
    }

    const container = document.getElementById('calendar-weeks-container');
    const monthTitle = document.getElementById('calendar-month-title');
    if (!container || !monthTitle) return;

    container.innerHTML = '';
    
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    monthTitle.innerText = `${monthNames[month]} ${year}`;

    let currentDate = new Date(year, month, 1);
    const dayOfWeek = currentDate.getDay(); 
    const offset = (dayOfWeek + 1) % 7; 
    currentDate.setDate(currentDate.getDate() - offset);

    const tasks = window.allTeamTasks || currentTeam.weekly_tasks || [];

    for (let i = 0; i < 5; i++) {
        const weekStart = new Date(currentDate);
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(currentDate);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const startStr = weekStart.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
        const endStr = weekEnd.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });

        const weekTasks = tasks.filter(t => {
            const taskDue = t.due_date ? new Date(t.due_date) : new Date(t.created_at || t.start_date);
            if(isNaN(taskDue.getTime())) return false; 
            return taskDue.getTime() >= weekStart.getTime() && taskDue.getTime() <= weekEnd.getTime();
        });

        const weekHTML = `
            <div onclick="window.openWeekDetails('${weekStart.toISOString()}', '${weekEnd.toISOString()}')" 
                 class="group bg-b-surface border border-white/10 rounded-xl p-5 hover:border-b-primary cursor-pointer transition-all relative overflow-hidden mb-3 shadow-sm">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl ${weekTasks.length > 0 ? 'bg-b-primary text-white shadow-lg shadow-b-primary/20' : 'bg-white/5 text-gray-500'} flex flex-col items-center justify-center font-bold transition-colors">
                            <span class="text-[10px] uppercase tracking-wider">Week</span>
                            <span class="text-lg">${i + 1}</span>
                        </div>
                        <div class="text-right">
                            <h4 class="font-bold text-white text-lg">${startStr} - ${endStr}</h4>
                            <p class="text-xs text-gray-400 mt-1 flex items-center gap-2">
                                <span class="${weekTasks.length > 0 ? 'text-b-hl-light font-bold' : ''}">
                                    ${weekTasks.length} مهام <i class="fas fa-tasks mr-1"></i>
                                </span>
                            </p>
                        </div>
                    </div>
                    <i class="fas fa-chevron-left text-gray-600 group-hover:text-white transition-transform transform group-hover:-translate-x-1"></i>
                </div>
            </div>
        `;
        container.innerHTML += weekHTML;
        currentDate.setDate(currentDate.getDate() + 7);
    }
}

window.changeMonth = (offset) => {
    if (typeof calendarDate === 'undefined' || !calendarDate) window.calendarDate = new Date();
    calendarDate.setMonth(calendarDate.getMonth() + offset);
    renderCalendarTab();
};

window.openWeekDetails = (startIso, endIso) => {
    currentViewedWeekStart = startIso;
    currentViewedWeekEnd = endIso;

    const modal = document.getElementById('week-details-modal');
    const container = document.getElementById('week-modal-tasks');
    const headerTitle = document.getElementById('week-modal-title');
    const headerPoints = document.getElementById('week-modal-points');

    if(!modal || !container) return;

    const startDate = new Date(startIso);
    const endDate = new Date(endIso);
    
    const tasks = (window.allTeamTasks || currentTeam.weekly_tasks || []).filter(t => {
        const d = t.due_date ? new Date(t.due_date) : new Date(t.created_at || t.start_date);
        if(isNaN(d.getTime())) return false;
        return d >= startDate && d <= endDate;
    });

    if(headerTitle) headerTitle.innerText = `الخطة الأسبوعية (${startDate.toLocaleDateString('ar-EG', {day:'numeric', month:'numeric'})} - ${endDate.toLocaleDateString('ar-EG', {day:'numeric', month:'numeric'})})`;
    if(headerPoints) headerPoints.innerText = `${tasks.length} مهام`; 

    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 flex flex-col items-center justify-center text-gray-500 bg-white/5 rounded-2xl border border-white/5 border-dashed">
                <div class="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <i class="fas fa-mug-hot text-2xl"></i>
                </div>
                <p class="font-bold">لا توجد مهام معينة في هذا الأسبوع</p>
            </div>`;
    } else {
        container.innerHTML = tasks.map(t => {
            let icon = 'fa-play-circle text-b-primary';
            let typeName = 'فيديو';
            
            if (t.type === 'quiz') { 
                icon = 'fa-clipboard-question text-yellow-500'; 
                typeName = 'كويز'; 
            }
            if (t.type === 'project') { 
                icon = 'fa-laptop-code text-purple-500'; 
                typeName = 'مشروع'; 
            }

            return `
            <div onclick="window.openCalendarTask('${t.id}')" 
                 class="group bg-black/40 border border-white/5 p-4 rounded-xl hover:border-b-primary hover:bg-white/5 cursor-pointer transition-all flex items-center gap-4 relative overflow-hidden mb-3">
                
                <div class="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-transparent via-white/10 to-transparent group-hover:via-b-primary transition-all"></div>
                
                <div class="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center shrink-0 border border-white/5 group-hover:border-b-primary/30 transition-all shadow-md">
                    <i class="fas ${icon} text-xl group-hover:scale-110 transition-transform"></i>
                </div>
                
                <div class="flex-1 min-w-0 text-right">
                    <div class="flex justify-between items-start mb-1">
                        <span class="text-[10px] text-gray-400 font-mono uppercase tracking-widest bg-black px-2 py-0.5 rounded border border-white/5 shrink-0">${typeName}</span>
                        <h4 class="text-sm font-bold text-white group-hover:text-b-primary transition-colors truncate mr-3" title="${t.title || 'بدون عنوان'}">${t.title || 'بدون عنوان'}</h4>
                    </div>
                </div>
                
                <div class="w-8 h-8 rounded-full bg-black/50 border border-white/5 flex items-center justify-center text-gray-500 group-hover:text-white group-hover:bg-b-primary/20 transition-all shrink-0">
                    <i class="fas fa-chevron-left text-xs"></i>
                </div>
            </div>
            `;
        }).join('');
    }
    modal.classList.remove('hidden');
};

window.closeWeekModal = () => document.getElementById('week-details-modal')?.classList.add('hidden');

window.openCalendarTask = (taskId) => {
    window.closeWeekModal();
    
    if (window.openTaskDetailsModal) {
        window.openTaskDetailsModal(taskId);
    }
    
    setTimeout(() => {
        const modal = document.getElementById('task-details-modal');
        if (modal) {
            const closeBtn = modal.querySelector('.fa-times')?.closest('button');
            
            if (closeBtn) {
                closeBtn.innerHTML = '<i class="fas fa-arrow-right text-lg"></i>';
                
                closeBtn.onclick = (e) => {
                    e.preventDefault();
                    
                    if (window.closeTaskDetailsModal) window.closeTaskDetailsModal();
                    else modal.classList.add('hidden');
                    
                    if (currentViewedWeekStart && currentViewedWeekEnd) {
                        window.openWeekDetails(currentViewedWeekStart, currentViewedWeekEnd);
                    }
                    
                    closeBtn.innerHTML = '<i class="fas fa-times text-lg"></i>';
                    closeBtn.onclick = window.closeTaskDetailsModal;
                };
            }
        }
    }, 100); 
};

window.renderCalendarTab = renderCalendarTab;


// ==========================================
// 12. GLOBAL UI MODALS & HELPERS
// ==========================================


function updateModalContent(task, details, type) {
    const styles = {
        video: { class: 'from-b-primary/20', icon: 'fa-play', color: 'text-b-primary', label: 'Video', btnText: 'Watch Lesson', btnIcon: 'fa-play', btnColor: 'bg-b-primary hover:bg-teal-700' },
        quiz: { class: 'from-yellow-500/20', icon: 'fa-clipboard-question', color: 'text-yellow-500', label: 'Quiz', btnText: 'Start Quiz', btnIcon: 'fa-pencil-alt', btnColor: 'bg-yellow-600 hover:bg-yellow-700' },
        project: { class: 'from-purple-500/20', icon: 'fa-laptop-code', color: 'text-purple-500', label: 'Project', btnText: 'Submit Project', btnIcon: 'fa-upload', btnColor: 'bg-purple-600 hover:bg-purple-700' }
    };
    const style = styles[type] || styles.video;

    const headerBg = document.getElementById('modal-header-bg');
    headerBg.className = `p-6 border-b border-white/10 bg-gradient-to-r ${style.class} to-transparent`;
    document.getElementById('modal-type-icon').className = `fas ${style.icon} ${style.color}`;
    document.getElementById('modal-type-badge').innerText = style.label;
    document.getElementById('modal-type-badge').className = `text-[10px] uppercase font-bold tracking-wider bg-black/40 px-2 py-1 rounded border border-white/5 ${style.color}`;

    let mainTitle = details.title || task.title || "Untitled";
    let subTitle = ""; 
    let description = "";
    let gridHtml = "";

    const addGridItem = (label, value, iconClass) => {
        if(!value && value !== 0) return;
        gridHtml += `
            <div class="bg-black/30 p-3 rounded-xl border border-white/5 flex flex-col justify-between h-full">
                <p class="text-[10px] text-gray-500 mb-1">${label}</p>
                <p class="font-bold text-white text-sm line-clamp-2">
                    <i class="fas ${iconClass} ${style.color} ml-1 opacity-70"></i> ${value}
                </p>
            </div>`;
    };

    if (type === 'project') {
        const relatedLessonName = getRelatedLessonName(task.content_id, 'project'); 
        subTitle = relatedLessonName ? `Project for: ${relatedLessonName}` : `Course: ${getCourseNameById(task.course_id)}`;
        description = details.description ? String(details.description) : (task.description || "No description.");
        addGridItem("Max Points", `${details.max_points || 0} pts`, "fa-star");

    } else if (type === 'quiz') {
        const relatedLessonName = getRelatedLessonName(task.content_id, 'quiz');
        subTitle = relatedLessonName ? `Linked to: ${relatedLessonName}` : `Course: ${getCourseNameById(task.course_id)}`;
        description = details.description ? String(details.description) : "Assessment Quiz.";
        addGridItem("Questions", `${details.questions_to_show || '?'}`, "fa-list-ol");
        addGridItem("Attempts", details.attempts_allowed || "Unlimited", "fa-redo");
        addGridItem("Points", `${details.max_xp || 0} pts`, "fa-trophy");

    } else {
        const courseName = getCourseNameById(task.course_id);
        subTitle = `In Course: ${courseName}`;
        description = details.description || details.note || task.description || "No description.";
        description = String(description);

        let authorName = details.author || "Team";
        if (!details.author || details.author === "Busla Team") {
             const courseInfo = getCourseInfoById(task.course_id);
             if (courseInfo && courseInfo.instructor) authorName = courseInfo.instructor;
        }

        const duration = formatDuration(details.duration || task.duration);
        const points = details.base_xp || 10;
        addGridItem("Instructor", authorName, "fa-chalkboard-teacher");
        addGridItem("Duration", duration, "fa-clock");
        addGridItem("Points", `${points} XP`, "fa-star");
        addGridItem("Source", "Recorded Video", "fa-video");
    }

    document.getElementById('modal-title').innerText = mainTitle;
    const subEl = document.getElementById('modal-subtitle');
    if(subEl) subEl.innerText = subTitle;

    const descEl = document.getElementById('modal-desc');
    descEl.innerHTML = description ? String(description).replace(/\n/g, '<br>') : "No description.";
    
    document.getElementById('modal-details-grid').innerHTML = gridHtml;

    const btn = document.getElementById('modal-action-btn');
    btn.href = `course-player.html?id=${task.course_id}&content=${task.content_id}&task_id=${task.task_id}`;
    btn.innerHTML = `<i class="fas ${style.btnIcon}"></i> <span>${style.btnText}</span>`;
    btn.className = `flex-1 py-3.5 rounded-xl font-bold text-center flex items-center justify-center gap-2 transition-all shadow-lg text-white ${style.btnColor} hover:-translate-y-0.5`;
}

window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
window.openBroadcastModal = () => document.getElementById('broadcast-modal').classList.remove('hidden');
window.openAddMemberModal = () => showToast("Invite system coming soon", "info");

window.sendBroadcast = () => {
    if(document.getElementById('broadcast-text').value) {
        showToast("Sent", "success");
        closeModal('broadcast-modal');
    }
};

window.openConfirmModal = (message, callback) => {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-msg');
    const yesBtn = document.getElementById('btn-confirm-yes');
    
    if(msgEl) msgEl.innerText = message;
    confirmCallback = callback;
    
    const newBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newBtn, yesBtn);
    
    newBtn.addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        closeConfirmModal();
    });
    modal.classList.remove('hidden');
};

window.closeConfirmModal = () => {
    document.getElementById('confirm-modal').classList.add('hidden');
    confirmCallback = null;
};

// ==========================================
// 13. UTILITY FUNCTIONS
// ==========================================
function getSafeDate(dateVal) {
    if (!dateVal) return new Date();
    if (typeof dateVal.toDate === 'function') return dateVal.toDate();
    return new Date(dateVal);
}

function parseDurationToSeconds(duration) {
    if (!duration) return 0;
    const str = String(duration);
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

function formatSecondsToTime(totalSeconds) {
    if (!totalSeconds) return "00:00:00";
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return (h > 0 ? h + ":" : "") + (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
}

function formatDuration(rawTime) {
    if (!rawTime) return '';
    const str = String(rawTime);

    if (!str.includes(':') && !isNaN(str)) {
        return formatSecondsToTime(parseInt(str));
    }

    if (str.includes('T')) {
        const match = str.match(/T(\d{2}):(\d{2}):(\d{2})/);
        if (match) {
            let h = parseInt(match[1]);
            let m = parseInt(match[2]);
            let s = parseInt(match[3]);
            if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            return `${m}:${s.toString().padStart(2, '0')}`;
        }
    }

    if (str.includes(':')) {
        const parts = str.split(':').map(Number);
        if (parts.length === 3 && parts[0] === 0) {
            return `${parts[1]}:${parts[2].toString().padStart(2, '0')}`;
        }
        return str.replace(/^00:/, '').replace(/^0/, '');
    }
    return str;
}

function resolveImageUrl(url, type = 'course') {
    try {
        if (!url || url.trim() === "" || url === "null" || url === "undefined") {
            return '../assets/icons/icon.jpg';
        }
        if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
            const idMatch = url.match(/\/d\/([-\w]{25,})/) || url.match(/id=([-\w]{25,})/);
            if (idMatch && idMatch[1]) {
                return `https://lh3.googleusercontent.com/d/$${idMatch[1]}`;
            }
        }
        if (url.includes('dropbox.com')) {
            return url.replace('?dl=0', '?raw=1');
        }
    } catch(e) {}
    return url;
}

function getRelatedLessonName(contentId, type) {
    if (!lookupData.contents) return null;
    const parentVideo = lookupData.contents.find(c => {
        if (type === 'quiz') return String(c.ref_quiz_id) === String(contentId);
        if (type === 'project') return String(c.ref_project_id) === String(contentId);
        return false;
    });
    return parentVideo ? parentVideo.title : null;
}

function getCourseInfoById(courseId) {
    return allData.courses.find(c => String(c.id) === String(courseId));
}

function getCourseNameById(courseId) {
    if(!allData.courses) return "Unknown";
    const course = allData.courses.find(c => String(c.id) === String(courseId));
    return course ? course.title : "General Course";
}

function getCurrentWeekCycle() {
    const now = new Date();
    const dayOfWeek = now.getDay(); 
    const daysSinceSaturday = (dayOfWeek + 1) % 7;
    
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - daysSinceSaturday);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
    
    const weekId = startDate.toISOString().split('T')[0];

    return {
        id: weekId,
        start: startDate,
        end: endDate,
        isExpired: (dateToCheck) => dateToCheck > endDate
    };
}

function getRankDataForMember(points) {
    if (!RANKS_DATA || RANKS_DATA.length === 0) {
        return { title: 'Trainee', color: 'text-gray-400 bg-gray-400/10', icon: 'fa-star' };
    }
    
    let rank = RANKS_DATA[0];
    for (let i = 0; i < RANKS_DATA.length; i++) {
        if (points >= RANKS_DATA[i].points_required) rank = RANKS_DATA[i];
        else break;
    }
    return rank;
}

function showToast(msg, type='info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const color = type === 'success' ? 'border-green-500' : 'border-red-500';
    toast.className = `bg-gray-900/95 text-white px-6 py-4 rounded-xl border-l-4 ${color} shadow-2xl backdrop-blur flex items-center gap-3 animate-slide-in pointer-events-auto min-w-[300px] mb-3`;
    toast.innerHTML = `<span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3500);
}


// ==========================================
// 🔔 نظام الإشعارات المتقدم للطالب
// ==========================================

let studentNotifsCache = [];

// 1. جلب الإشعارات من المصدرين (الليدر والإدارة)
window.loadStudentNotifications = async () => {
    const activeTbody = document.getElementById('student-active-tbody');
    if (activeTbody) activeTbody.innerHTML = '<tr><td colspan="4" class="text-center py-10"><i class="fas fa-spinner fa-spin text-b-primary text-2xl"></i></td></tr>';

    try {
        const teamId = currentTeam?.id || currentTeam?.team_id;
        const myId = currentUserData.id;
        if (!teamId) return;

        // جلب إشعارات الفريق (الموجهة للكل أو المخصصة للطالب)
        const { data: teamPosts } = await supabase
            .from('team_posts')
            .select('*')
            .eq('team_id', teamId)
            .order('created_at', { ascending: false });

        // جلب رسائل الإدارة (الموجهة للفريق)
        const { data: adminMsgs } = await supabase
            .from('system_notifications')
            .select('*')
            .eq('target_team_id', teamId)
            .order('created_at', { ascending: false });

        let combined = [];

        // تنظيف وتوحيد بيانات إشعارات الفريق
        if (teamPosts) {
            teamPosts.forEach(post => {
                const isTargetAll = !post.target_members || post.target_members.includes('all');
                const isTargetMe = post.target_members && post.target_members.includes(myId);
                
                if (isTargetAll || isTargetMe) {
                    combined.push({
                        ...post,
                        _sourceType: 'leader',
                        _targetLevel: isTargetAll ? 'team' : 'personal',
                        _icon: 'fa-bullhorn',
                        _color: isTargetAll ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' : 'text-purple-400 bg-purple-500/10 border-purple-500/20',
                        _badgeText: isTargetAll ? 'إشعار فريق' : 'مخصص لك'
                    });
                }
            });
        }

        // تنظيف وتوحيد بيانات الإدارة
        if (adminMsgs) {
            adminMsgs.forEach(msg => {
                combined.push({
                    id: msg.id,
                    title: msg.title,
                    content: msg.content,
                    created_at: msg.created_at,
                    seen_by: msg.seen_by || [],
                    creator_name: 'إدارة بوصلة',
                    creator_avatar: '../assets/icons/icon.jpg', // لوجو الموقع
                    _sourceType: 'admin',
                    _targetLevel: 'admin',
                    _icon: 'fa-server',
                    _color: 'text-red-400 bg-red-500/10 border-red-500/20',
                    _badgeText: 'رسالة إدارة'
                });
            });
        }

        // ترتيب الجميع بالتاريخ
        combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        studentNotifsCache = combined;

        window.filterStudentNotifications(); // رسم الجداول بعد الجلب

    } catch (e) {
        console.error("Error loading student notifs:", e);
    }
};

// 2. الفلترة والتصنيف بين (النشط والأرشيف)
window.filterStudentNotifications = () => {
    const isArchiveView = !document.getElementById('student-archive-section').classList.contains('hidden');
    const filterType = document.getElementById('student-notif-filter').value;
    
    const activeSearch = document.getElementById('search-active-notifs').value.toLowerCase();
    const archiveSearch = document.getElementById('search-archive-notifs').value.toLowerCase();
    const query = isArchiveView ? archiveSearch : activeSearch;
    
    const now = new Date();
    const myId = currentUserData.id;

    let activePosts = [];
    let archivedPosts = [];

    studentNotifsCache.forEach(post => {
        // فلترة النوع والبحث
        if (filterType !== 'all' && post._targetLevel !== filterType) return;
        if (query && !post.title.toLowerCase().includes(query) && !post.content.toLowerCase().includes(query)) return;

        // التحقق من حالة القراءة
        let seenData = null;
        if (post.seen_by && Array.isArray(post.seen_by)) {
            seenData = post.seen_by.find(item => typeof item === 'object' ? item.uid === myId : item === myId);
        }
        const hasSeen = !!seenData;

        // منطق الأرشيف الذكي
        let isArchived = false;
        if (post.expiry_date) {
            const expiry = new Date(post.expiry_date);
            expiry.setHours(23, 59, 59, 999);
            if (now > expiry) isArchived = true; // انتهى الميعاد -> أرشيف
        } else if (hasSeen) {
            isArchived = true; // تمت قراءته ولا يوجد ميعاد -> أرشيف
        }

        // تخزين بيانات المشاهدة للرسم
        post._hasSeen = hasSeen;
        post._seenAt = (hasSeen && typeof seenData === 'object' && seenData.seen_at) ? new Date(seenData.seen_at).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

        if (isArchived) archivedPosts.push(post);
        else activePosts.push(post);
    });

    renderStudentNotifsTable(activePosts, 'student-active-tbody', false);
    renderStudentNotifsTable(archivedPosts, 'student-archive-tbody', true);
};

// 3. رسم الجداول
function renderStudentNotifsTable(posts, tbodyId, isArchive) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (posts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-10 text-gray-500 italic">لا توجد إشعارات هنا.</td></tr>`;
        return;
    }

    tbody.innerHTML = posts.map(post => {
        const dateStr = new Date(post.created_at).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
        
        // تصميم حالة القراءة
        const seenBadge = post._hasSeen 
            ? `<span class="text-green-400 text-xs font-bold"><i class="fas fa-check-double"></i> ${isArchive && post._seenAt ? post._seenAt : 'مقروء'}</span>`
            : `<span class="bg-b-primary/20 text-b-primary border border-b-primary/30 px-3 py-1 rounded-full text-[10px] font-bold animate-pulse">جديد</span>`;

        return `
        <tr class="hover:bg-white/5 transition-colors cursor-pointer group" onclick="window.openStudentPostDetail('${post.id}')">
            <td class="p-4 pr-6">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${post._color}">
                        <i class="fas ${post._icon}"></i>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h4 class="font-bold text-white text-sm group-hover:text-b-primary transition-colors">${post.title}</h4>
                            <span class="text-[9px] px-2 py-0.5 rounded border ${post._color}">${post._badgeText}</span>
                        </div>
                    </div>
                </div>
            </td>
            <td class="p-4 text-center text-xs text-gray-400 font-mono">${dateStr}</td>
            <td class="p-4 text-center text-xs text-gray-300">
                <div class="flex items-center justify-center gap-2">
                    <img src="${post.creator_avatar && post.creator_avatar !== 'null' ? post.creator_avatar : '../assets/icons/icon.jpg'}" class="w-6 h-6 rounded-full object-cover bg-black">
                    ${post.creator_name}
                </div>
            </td>
            <td class="p-4 text-center">${seenBadge}</td>
        </tr>
        `;
    }).join('');
}

// 4. التبديل بين النشط والأرشيف
window.toggleStudentArchive = (showArchive) => {
    document.getElementById('student-active-section').classList.toggle('hidden', showArchive);
    document.getElementById('student-archive-section').classList.toggle('hidden', !showArchive);
    window.filterStudentNotifications(); // إعادة التصفية
};

// 5. فتح تفاصيل الإشعار (وتسجيل القراءة في قاعدة البيانات بالوقت والتاريخ)
window.openStudentPostDetail = async (postId) => {
    const post = studentNotifsCache.find(p => p.id === postId);
    if (!post) return;

    const modal = document.getElementById('student-post-detail-modal');
    const contentBox = document.getElementById('student-modal-content');
    const dateStr = new Date(post.created_at).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    // بناء عناصر المرفقات
    const linkHtml = post.link_url ? `<a href="${post.link_url}" target="_blank" class="flex-1 flex items-center justify-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 py-3 px-4 rounded-xl transition-all font-bold text-sm"><i class="fas fa-external-link-alt"></i> فتح الرابط المرفق</a>` : '';
    const expiryHtml = post.expiry_date ? `<div class="flex-1 flex items-center justify-center gap-2 bg-red-500/10 text-red-400 border border-red-500/20 py-3 px-4 rounded-xl font-bold text-sm"><i class="far fa-calendar-times"></i> الموعد النهائي: ${new Date(post.expiry_date).toLocaleDateString('ar-EG')}</div>` : '';

    let avatar = (post.creator_avatar && post.creator_avatar !== 'null') ? post.creator_avatar : '../assets/icons/icon.jpg';

    contentBox.innerHTML = `
        <div class="flex justify-between items-start mb-6 border-b border-white/5 pb-5">
            <div class="flex items-center gap-4">
                <img src="${avatar}" class="w-16 h-16 rounded-xl object-cover border-2 border-white/10 bg-black shadow-lg">
                <div>
                    <h4 class="text-white font-bold text-xl">${post.creator_name}</h4>
                    <span class="text-xs text-gray-500"><i class="far fa-clock"></i> ${dateStr}</span>
                </div>
            </div>
            <span class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase border ${post._color}">
                <i class="fas ${post._icon} mr-1"></i> ${post._badgeText}
            </span>
        </div>
        
        <div class="mb-8">
            <h2 class="text-3xl font-black text-white mb-4 leading-tight">${post.title}</h2>
            <div class="text-gray-200 text-sm leading-loose whitespace-pre-wrap bg-black/40 p-6 rounded-2xl border border-white/5 shadow-inner">${post.content}</div>
        </div>

        ${(linkHtml || expiryHtml) ? `<div class="flex flex-col sm:flex-row gap-3">${linkHtml}${expiryHtml}</div>` : ''}
    `;
    
    modal.classList.remove('hidden');

// 💡 تسجيل المشاهدة بالوقت والتاريخ بشكل آمن
    if (!post._hasSeen) {
        try {
            const myId = currentUserData.id;
            const newSeenEntry = { uid: myId, seen_at: new Date().toISOString() };
            
            // حماية المصفوفة في حال كانت فارغة في قاعدة البيانات
            let currentSeenArray = Array.isArray(post.seen_by) ? post.seen_by : [];
            const updatedSeenBy = [...currentSeenArray, newSeenEntry];

            const tableName = post._sourceType === 'leader' ? 'team_posts' : 'system_notifications';
            
            // نطلب إرجاع البيانات للتأكد من نجاح التحديث
            const { data, error } = await supabase
                .from(tableName)
                .update({ seen_by: updatedSeenBy })
                .eq('id', post.id)
                .select();
            
            if (error) throw error;

            if (!data || data.length === 0) {
                console.warn("لم يتم تسجيل المشاهدة! تأكد من تشغيل كود الـ SQL الخاص بصلاحيات التحديث.");
            } else {
                // تحديث محلي لكي لا يرسل الطلب مرة أخرى إذا أغلق وفتح الإشعار
                post.seen_by = updatedSeenBy;
                post._hasSeen = true;
                window.filterStudentNotifications(); // تحديث علامة "جديد" في الجدول
            }

        } catch (e) {
            console.error("فشل في تسجيل القراءة:", e);
        }
    }
};

window.closeStudentPostDetail = () => {
    document.getElementById('student-post-detail-modal').classList.add('hidden');
    window.filterStudentNotifications(); // إعادة الرسم للتأكد من نقل الإشعار للأرشيف لو لزم الأمر
};

const originalSwitchTab = window.switchTab;
window.switchTab = (id) => {
    if (typeof originalSwitchTab === 'function') originalSwitchTab(id);
    if (id === 'announcements') {
        window.loadStudentNotifications();
    }
};