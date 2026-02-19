import { supabase, AuthService, TeamService, UserService } from './supabase-config.js';
import { initSettingsModal, openSettings } from './settings-handler.js';
import { initBadgesSystem } from './badges-handler.js';
import { initTeamBadgesSystem } from './team-badges-handler.js';
import { initLeaderboard } from './leaderboard-handler.js';
import { initTeamSettingsModal, openTeamSettings } from './team-settings-handler.js'; 
import { initNotificationsSystem } from './notifications-handler.js';
import { RANKS_DATA } from './badges-data.js';
import { TEAM_RANKS_DATA } from './team-badges-data.js';

// ==========================================
// 1. CONFIGURATION & STATE
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

// ==========================================
// 2. INITIALIZATION & LIFECYCLE
// ==========================================
let isInitialized = false;
document.addEventListener('DOMContentLoaded', () => {
    initSettingsModal();
    initTeamSettingsModal();
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
    // Settings Button
    const settingsBtn = document.getElementById('open-settings-btn'); 
    if(settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openSettings();
        });
    }

    // Logout Button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await AuthService.signOut();
            window.location.href = "auth.html";
        });
    }

    // Team Settings Button
    const teamSettingsBtn = document.getElementById('open-team-settings-btn');
    if (teamSettingsBtn) {
        teamSettingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Leader check logic
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
        // Fetch User Profile
        const { data: profile, error: profileError } = await UserService.getProfile(uid);
        if (profileError || !profile) throw new Error("User profile not found");
        
        currentUserData = profile;
        const teamId = currentUserData.team_id; 

        if (!teamId) {
            window.location.href = "student-dash.html";
            return;
        }

        // Fetch Team Data
        const { data: teamData, error: teamError } = await supabase
            .from('teams')
            .select('*')
            .eq('id', teamId)
            .single();

        if (teamError || !teamData) {
            console.error("Team fetch failed", teamError);
            return;
        }

        currentTeam = teamData;
        currentTeam.team_id = teamData.id; 

        // Ensure JSON fields are initialized (للكورسات والطلبات فقط)
        if (!currentTeam.courses_plan) currentTeam.courses_plan = [];
        if (!currentTeam.requests) currentTeam.requests = [];

        // 🔥 التعديل هنا: جلب المهام من الجدول الجديد (team_tasks)
        const { data: tasksData, error: tasksError } = await supabase
            .from('team_tasks')
            .select('*')
            .eq('team_id', teamId);
            
        if (tasksError) console.error("Error fetching tasks:", tasksError);
        
        // ربط المهام بالفريق مع توحيد اسم الـ id ليكون task_id ليعمل مع باقي الواجهة
        currentTeam.weekly_tasks = tasksData ? tasksData.map(t => ({...t, task_id: t.id})) : [];

        // Fetch Members
        const { data: members } = await supabase
            .from('profiles')
            .select('id')
            .eq('team_id', teamId);
        
        currentTeam.members = members ? members.map(m => m.id) : [];

        // Initial Render
        renderSquadTab(currentTeam);   
        updateHeaderInfo(currentUserData, currentTeam);

        // Load Content (Cache then Network)
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
        showToast("Error loading dashboard", "error");
    }
}

// ==========================================
// 3. DATA FETCHING & CACHING
// ==========================================

async function fetchDataFromServer() {
    try {
        console.log("Fetching Fresh Data from Supabase...");
        
        // 1. Fetch data without order_index for phases to avoid 400 error
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

        // 2. Map IDs and fields correctly based on your SQL schema
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

        // 3. Process courses stats
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

        // 4. Build Tree
        allData.tree = allData.phases.map(phase => {
            const phaseCourses = allData.courses.filter(c => c.phase_id === phase.id);
            return {
                ...phase,
                courses: phaseCourses
            };
        });

        // 5. Build Lookups
        lookupData = { projects: {}, quizzes: {}, videos: {}, contents: [] }; 
        allData.projects.forEach(p => lookupData.projects[String(p.id)] = p);
        allData.quizzes.forEach(q => lookupData.quizzes[String(q.id)] = q);
        
        lookupData.contents = rawContents.map(c => ({
            ...c,
            content_id: c.id,
            related_quiz_id: c.ref_quiz_id,
            related_project_id: c.ref_project_id
        })); 

        // 6. Save & Log
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
            
            // Rebuild Lookups
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
    const teamPoints = team.total_score || 0;

    const getBadgeTitle = (points, dataSet) => {
        let title = dataSet[0].title;
        for (let i = 0; i < dataSet.length; i++) {
            if (points >= dataSet[i].points_required) {
                title = dataSet[i].title;
            } else {
                break;
            }
        }
        return title;
    };

    safeText('header-user-badge', getBadgeTitle(userPoints, RANKS_DATA));
    safeText('sidebar-team-badge', getBadgeTitle(teamPoints, TEAM_RANKS_DATA));

    const userName = user.full_name || "Busla User";
    const teamName = team.name || "My Team";
    
    // For leader name, we might need to fetch if not present, but for now fallback
    const leaderName = "Team Leader"; 

    safeText('sidebar-team-name', teamName);
    safeText('sidebar-leader-name', leaderName);
    safeText('header-user-name', userName);
    safeText('my-points', userPoints);
    safeText('stat-team-score', teamPoints);

    const sidebarLogoEl = document.getElementById('sidebar-team-logo');
    if(sidebarLogoEl) {
        let rawTeamLogo = team.logo_url;
        sidebarLogoEl.src = resolveImageUrl(rawTeamLogo, 'team');
    }

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
    renderAssignments();
    renderSquad();
    renderGrading();
}

function renderOverview() {
    if (!currentTeam) return;
    
    renderWeekInfo(); 

    const activeIds = currentTeam.courses_plan || [];
    const tasks = currentTeam.weekly_tasks || [];

    const statMembers = document.getElementById('stat-members-count');
    const statCourses = document.getElementById('stat-active-courses');
    const statTasks = document.getElementById('stat-active-tasks');

    if (statMembers) statMembers.innerText = `${(currentTeam.members || []).length} / 5`;
    if (statCourses) statCourses.innerText = activeIds.length;
    if (statTasks) statTasks.innerText = tasks.length;

    renderTeamOverview(tasks);
    renderActiveCourses(activeIds);
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
                    <h3 class="font-bold text-white text-lg">Current Week</h3>
                    <p class="text-sm text-gray-300">From <span class="text-b-hl-light font-bold">${startStr}</span> To <span class="text-b-hl-light font-bold">${endStr}</span></p>
                </div>
            </div>
            <div class="text-center md:text-left">
                <div class="bg-black/40 px-4 py-2 rounded-lg border border-white/5">
                    <p class="text-xs text-gray-400">Today</p>
                    <p class="font-bold text-white text-lg">${currentDayName}</p>
                </div>
            </div>
        </div>
    `;
}

// ==========================================
// 5. ROADMAP & CURRICULUM LOGIC
// ==========================================

function renderRoadmapTree() {
    const container = document.getElementById('roadmap-tree-container');
    if (!container) return;
    container.innerHTML = '';

    if (!allData.tree || allData.tree.length === 0) {
         container.innerHTML = '<div class="text-center py-10 text-gray-500">Loading Content...</div>';
         return;
    }

    allData.tree.forEach((phase) => {
        const phaseId = String(phase.id).trim();
        const phaseEl = document.createElement('div');
        phaseEl.className = "mb-8 border-l-4 border-white/10 pl-6 relative"; 

        phaseEl.innerHTML = `
            <div class="absolute -left-[11px] top-0 w-5 h-5 bg-b-primary rounded-full border-4 border-black box-content shadow-[0_0_10px_rgba(0,106,103,0.5)]"></div>
            
            <div class="flex items-center justify-between mb-5 select-none group">
                <div class="cursor-pointer flex-1" onclick="window.showDetails('phase', '${phaseId}')">
                    <h3 class="font-bold text-xl text-white group-hover:text-b-primary transition-colors">${phase.title}</h3>
                    <span class="text-xs text-gray-400 font-mono mt-1 block">${phase.description || ''}</span>
                </div>
                <div class="p-2 cursor-pointer hover:bg-white/10 rounded-full transition-all" onclick="window.togglePhaseContent('${phaseId}')">
                    <i class="fas fa-chevron-down text-white transition-transform duration-300" id="icon-phase-${phaseId}"></i>
                </div>
            </div>
            <div id="content-phase-${phaseId}" class="space-y-4"></div>
        `;

        const itemsContainer = phaseEl.querySelector(`#content-phase-${phaseId}`);

        if (!phase.courses || phase.courses.length === 0) {
            itemsContainer.innerHTML = '<p class="text-sm text-gray-600 italic pl-2">No content.</p>';
        } else {
            phase.courses.forEach(course => {
                const courseId = String(course.id).trim();
                const isActive = (currentTeam.courses_plan || []).includes(courseId);
                const hasChildren = false; // Simplified for now as courses are flat in new structure
                const isExpanded = expandedNodes.has(courseId);

                const itemHTML = document.createElement('div');
                itemHTML.className = `rounded-xl overflow-hidden border-2 transition-all duration-300 shadow-sm ${isActive ? 'border-green-500/40 bg-green-900/10' : 'border-white/10 bg-black/40 hover:border-white/30'}`;

                itemHTML.innerHTML = `
                    <div class="p-4 flex items-center justify-between cursor-pointer select-none"
                         onclick="window.handleItemClick('course', '${courseId}', ${hasChildren})">
                        
                        <div class="flex items-center gap-4 overflow-hidden flex-1">
                            <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-black/40 border border-white/10 shrink-0 text-lg shadow-inner">
                                ${isActive ? '<i class="fas fa-check-circle text-green-400 text-xl"></i>' : '<i class="fas fa-book text-purple-400"></i>'}
                            </div>
                            <div class="truncate flex-1">
                                <h4 class="font-bold text-base ${isActive ? 'text-white' : 'text-gray-200'} truncate">${course.title}</h4>
                                <div class="flex items-center gap-3 mt-1">
                                    <span class="text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded border border-white/5 font-mono">
                                        Module
                                    </span>
                                    ${course.real_video_count ? `<span class="text-[10px] text-blue-400"><i class="fas fa-video ml-1"></i>${course.real_video_count}</span>` : ''}
                                </div>
                            </div>
                        </div>

                        <div class="flex items-center gap-2 pl-2">
                            <div class="relative flex items-center justify-center p-2 rounded-full hover:bg-white/10" onclick="event.stopPropagation()">
                                <input type="checkbox" 
                                       class="appearance-none w-6 h-6 rounded-lg border-2 border-gray-600 bg-black checked:bg-green-500 checked:border-green-500 transition-all cursor-pointer"
                                       ${isActive ? 'checked' : ''} 
                                       onchange="window.toggleActivate('${courseId}', this.checked)">
                                <i class="fas fa-check text-white text-xs absolute pointer-events-none opacity-0 ${isActive ? 'opacity-100' : ''}"></i>
                            </div>
                        </div>
                    </div>
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
        const content = document.getElementById(`details-${id}`);
        if (content && content.classList.contains('hidden')) {
            window.toggleCourseContent(id);
        }
    }
};

window.togglePhaseContent = (phaseId) => {
    const content = document.getElementById(`content-phase-${phaseId}`);
    const icon = document.getElementById(`icon-phase-${phaseId}`);
    if (content) content.classList.toggle('hidden');
    if (icon) icon.classList.toggle('rotate-180');
};

window.toggleCourseContent = (courseId) => {
    const content = document.getElementById(`details-${courseId}`);
    const icon = document.getElementById(`icon-${courseId}`);
    if (content) {
        const isHidden = content.classList.toggle('hidden');
        if (icon) icon.classList.toggle('rotate-180');
        if (!isHidden) expandedNodes.add(String(courseId));
        else expandedNodes.delete(String(courseId));
    }
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
        // Handle JSONB fields from Supabase
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
        const chk = document.getElementById('course-toggle-btn');
        if(chk) {
            const newChk = chk.cloneNode(true);
            chk.parentNode.replaceChild(newChk, chk);
            newChk.checked = (currentTeam.courses_plan || []).includes(String(id));
            newChk.addEventListener('change', (e) => window.toggleActivate(String(id), e.target.checked));
        }
    }
};

window.toggleActivate = async (id, isChecked) => {
    if(!currentTeam.courses_plan) currentTeam.courses_plan = [];
    
    // Local Update
    if (isChecked) {
        if (!currentTeam.courses_plan.includes(id)) currentTeam.courses_plan.push(id);
    } else {
        currentTeam.courses_plan = currentTeam.courses_plan.filter(x => x !== id);
    }

    renderRoadmapTree();
    renderOverview();
    renderAssignments();
    
    const detailBtn = document.getElementById('course-toggle-btn');
    if(detailBtn) detailBtn.checked = isChecked;

    try {
        // Supabase Update
        const { error } = await supabase
            .from('teams')
            .update({ courses_plan: currentTeam.courses_plan })
            .eq('id', currentTeam.team_id);

        if (error) throw error;

        if (isChecked) {
            showToast("Activated", "success");
        } else {
            showToast("Deactivated", "info");
        }
    } catch (e) {
        console.error("Sync Error:", e);
        showToast("Sync Error: " + e.message, "error");
    }
};

// ==========================================
// 6. TASKS & ASSIGNMENTS LOGIC
// ==========================================

function renderAssignments() {
    const list = document.getElementById('assign-courses-list');
    const activeIds = currentTeam.courses_plan || [];
    
    if (activeIds.length === 0) {
        list.innerHTML = `<p class="text-center text-gray-500 text-xs py-10">Activate courses from roadmap first.</p>`;
        return;
    }

    const activeItems = allData.courses.filter(c => activeIds.includes(String(c.id)));
    
    list.innerHTML = activeItems.map(item => {
        const stats = [];
        if(item.real_video_count) stats.push(`${item.real_video_count} Videos`);
        const subInfo = stats.length > 0 ? stats.join(' • ') : (item.module_time || '');
        const itemId = String(item.id);

        return `
        <div id="course-card-${itemId}" onclick="window.loadAssignContent('${itemId}')" 
             class="course-card bg-white/5 p-3 rounded-lg border border-white/10 cursor-pointer hover:bg-white/10 hover:border-b-primary transition-all group mb-2 relative overflow-hidden">
            <div class="absolute left-0 top-0 bottom-0 w-1 bg-b-primary opacity-0 transition-opacity active-indicator"></div>
            <div class="min-w-0">
                <div class="flex justify-between items-start">
                    <h4 class="font-bold text-sm text-white truncate max-w-[80%]">${item.title}</h4>
                    <span class="text-[9px] text-gray-500 bg-black/20 px-2 rounded border border-white/5 uppercase">${item.type || 'Course'}</span>
                </div>
                ${subInfo ? `<p class="text-[10px] text-gray-400 mt-1 flex items-center gap-1"><i class="far fa-clock"></i> ${subInfo}</p>` : ''}
            </div>
        </div>
    `}).join('');
}

window.loadAssignContent = async (cid) => {
    selectedAssignCourse = cid;
    
    document.querySelectorAll('.course-card').forEach(el => {
        el.classList.remove('bg-white/10', 'border-b-primary');
        el.querySelector('.active-indicator')?.classList.add('opacity-0');
    });
    const activeCard = document.getElementById(`course-card-${cid}`);
    if(activeCard) {
        activeCard.classList.add('bg-white/10', 'border-b-primary');
        activeCard.querySelector('.active-indicator')?.classList.remove('opacity-0');
    }

    const cont = document.getElementById('assign-content-list');
    cont.innerHTML = `<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-b-primary text-2xl"></i></div>`;
    
    // Filter contents for this course from raw data
    const courseContents = (lookupData.contents || []).filter(c => String(c.course_id) === String(cid));
    courseContents.sort((a,b) => (a.order_index || 0) - (b.order_index || 0));

    const currentTasks = currentTeam.weekly_tasks || [];

    if (courseContents.length > 0) {
        let html = '';
        courseContents.forEach(m => {
            const contentId = String(m.id);
            const isAssigned = currentTasks.some(t => String(t.content_id) === contentId && t.type === 'video');
            const title = m.title || 'Untitled';
            
            html += `
            <div class="mb-2 border-b border-white/5 pb-2">
                <label class="flex items-start gap-3 p-3 hover:bg-white/5 cursor-pointer transition-colors group ${isAssigned ? 'bg-green-900/10 border-l-2 border-l-green-500' : ''}">
                    <div class="pt-1">
                        <input type="checkbox" value="${contentId}" data-type="video" data-title="${title}" data-course-id="${cid}" class="task-check w-4 h-4 accent-b-primary bg-gray-700 border-gray-600 rounded" ${isAssigned ? 'checked disabled' : ''}>
                    </div>
                    <div class="flex-1 min-w-0">
                        <span class="text-sm font-medium ${isAssigned ? 'text-green-300' : 'text-gray-300'} group-hover:text-white transition-colors truncate">${title}</span>
                        ${isAssigned ? '<span class="text-[9px] text-green-400 bg-green-900/20 px-1.5 rounded mr-2">Published</span>' : ''}
                    </div>
                </label>
                <div class="mr-6 space-y-1 border-r border-white/10 pr-2">
                    ${renderRelatedItem(m, 'quiz', cid, currentTasks)}
                    ${renderRelatedItem(m, 'project', cid, currentTasks)}
                </div>
            </div>`;
        });
        cont.innerHTML = html;
        const btn = document.getElementById('publish-btn');
        if(btn) btn.disabled = false;
    } else {
        cont.innerHTML = `<p class="text-center text-gray-500 py-10">No content.</p>`;
    }
};

function renderRelatedItem(item, type, courseId, currentTasks) {
    let relatedId = null;
    let label = '';
    let icon = '';
    let realTitle = '';

    if (type === 'quiz') {
        relatedId = item.ref_quiz_id; 
        label = 'Quiz';
        icon = 'fa-clipboard-question';
        const cached = lookupData.quizzes[String(relatedId)];
        realTitle = cached ? cached.title : `Related Quiz`;
    } else if (type === 'project') {
        relatedId = item.ref_project_id;
        label = 'Project';
        icon = 'fa-laptop-code';
        const cached = lookupData.projects[String(relatedId)];
        realTitle = cached ? cached.title : `Practical Project`;
    }

    const relatedIdString = String(relatedId).trim();
    if (!relatedIdString || relatedIdString === "null" || relatedIdString === "undefined" || relatedIdString === "") return '';

    const isAssigned = currentTasks.some(t => 
        String(t.content_id) === relatedIdString && 
        String(t.course_id) === String(courseId) &&
        t.type === type
    );

    return `
        <label class="flex items-center gap-3 p-2 mt-1 hover:bg-white/5 cursor-pointer transition-colors rounded-lg ${isAssigned ? 'opacity-50' : ''} border-r-2 border-r-gray-700 pr-3 mr-4">
            <div class="pt-1">
                <input type="checkbox" 
                       value="${relatedIdString}" 
                       data-type="${type}" 
                       data-title="${realTitle}" 
                       data-parent-title="${item.title}" 
                       data-course-id="${courseId}"
                       class="task-check w-3 h-3 accent-yellow-500 bg-gray-700 border-gray-600 rounded"
                       ${isAssigned ? 'checked disabled' : ''}>
            </div>
            <div class="flex items-center gap-2 text-xs text-gray-400 group-hover:text-white">
                <i class="fas ${icon} ${type === 'quiz' ? 'text-yellow-500' : 'text-purple-500'}"></i>
                <span>${label}:</span>
                <span class="text-gray-300 font-bold truncate max-w-[200px]">${realTitle}</span>
                ${isAssigned ? '<span class="text-[9px] text-green-500 font-bold ml-1">(Added)</span>' : ''}
            </div>
        </label>
    `;
}

window.publishSelectedTasks = async function() {
    const checkedBoxes = document.querySelectorAll('.task-check:checked:not(:disabled)');
    if (checkedBoxes.length === 0) return showToast("Select content first", "warning");

    const btn = document.getElementById('publish-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing...';
    btn.disabled = true;

    try {
        const teamId = currentTeam.team_id;
        const weekCycle = getCurrentWeekCycle();
        const now = new Date();
        const due = weekCycle.end.toISOString();
        
        const newTasksToInsert = [];

        checkedBoxes.forEach(box => {
            newTasksToInsert.push({
                team_id: teamId,
                content_id: box.value,
                course_id: box.getAttribute('data-course-id'),
                title: box.getAttribute('data-title'),
                description: box.getAttribute('data-desc'),
                duration: box.getAttribute('data-duration'),
                type: box.getAttribute('data-type') || 'video',
                week_id: weekCycle.id,
                due_date: due,
                assigned_by: currentUser.id
            });
        });

        // 🔥 التعديل هنا: الإدراج في الجدول الجديد
        const { data: insertedTasks, error } = await supabase
            .from('team_tasks')
            .insert(newTasksToInsert)
            .select(); // إرجاع البيانات المدخلة مع الـ IDs الجديدة

        if (error) throw error;

        // تحديث الواجهة محلياً
        const mappedTasks = insertedTasks.map(t => ({...t, task_id: t.id}));
        currentTeam.weekly_tasks = [...(currentTeam.weekly_tasks || []), ...mappedTasks];

        showToast(`${insertedTasks.length} tasks published`, "success");
        if(selectedAssignCourse) loadAssignContent(selectedAssignCourse); 
        renderOverview();

    } catch (error) {
        console.error(error);
        showToast("Error publishing: " + error.message, "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};
window.deleteTask = function(taskId, taskWeekId) {
    openConfirmModal("Are you sure? This task will be removed from team records.", async () => {
        const currentWeek = getCurrentWeekCycle();
        if (taskWeekId !== currentWeek.id) {
            showToast("Cannot delete past tasks (Archived).", "error");
            return;
        }

        try {
            // تحقق محلي إذا كان أحد قد بدأ بها
            const taskToDelete = currentTeam.weekly_tasks.find(t => t.task_id === taskId);
            if (taskToDelete && taskToDelete.stats && taskToDelete.stats.started_count > 0) {
                 showToast("Cannot delete: Students already started.", "error");
                 return;
            }

            // 🔥 التعديل هنا: حذف من الجدول الجديد
            const { error } = await supabase
                .from('team_tasks')
                .delete()
                .eq('id', taskId);

            if (error) throw error;

            // تحديث الواجهة محلياً
            currentTeam.weekly_tasks = currentTeam.weekly_tasks.filter(t => t.task_id !== taskId);

            showToast("Task deleted", "success");
            renderOverview(); 

        } catch (error) {
            console.error("Error deleting task:", error);
            showToast("Delete failed: " + error.message, "error");
        }
    });
};

window.submitCustomTask = async () => {
    const t = document.getElementById('ct-title').value;
    const d = document.getElementById('ct-desc').value;
    if(!t) return showToast("Title required", "error");

    const weekCycle = getCurrentWeekCycle();

    const taskData = {
        team_id: currentTeam.team_id,
        title: t,
        description: d,
        type: 'custom',
        week_id: weekCycle.id,
        due_date: weekCycle.end.toISOString(),
        assigned_by: currentUser.id
    };

    try {
        // 🔥 التعديل هنا: إدراج في الجدول الجديد
        const { data: insertedTask, error } = await supabase
            .from('team_tasks')
            .insert([taskData])
            .select()
            .single();

        if (error) throw error;

        // تحديث الواجهة محلياً
        currentTeam.weekly_tasks.push({...insertedTask, task_id: insertedTask.id});
        
        showToast("Task Published", "success");
        closeModal('custom-task-modal');
        renderOverview();
    } catch (e) { 
        console.error(e);
        showToast("Failed to publish task", "error"); 
    }
};

async function renderTeamOverview(tasks) {
    const container = document.getElementById('overview-container');
    if (!container) return;
    container.innerHTML = '';

    if (!tasks || tasks.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-600 bg-white/5 rounded-2xl border border-white/5 border-dashed">
                <i class="fas fa-clipboard-list text-5xl mb-4 opacity-50"></i>
                <p>No active tasks for this week.</p>
                <button onclick="switchTab('assignments')" class="mt-4 text-b-primary hover:text-white text-sm font-bold underline">
                    + Add New Tasks
                </button>
            </div>`;
        return;
    }

    const currentWeek = getCurrentWeekCycle();
    // Sort tasks
    tasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const currentWeekTasks = tasks.filter(t => t.week_id === currentWeek.id);

    if (currentWeekTasks.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-center py-4">No tasks in current week.</p>`;
        return;
    }

    currentWeekTasks.forEach(task => {
        let typeConfig = {
            icon: 'fa-play', color: 'text-b-primary', bg: 'bg-b-primary/10', border: 'border-l-b-primary', label: 'Video'
        };
        
        if (task.type === 'quiz') {
            typeConfig = { icon: 'fa-clipboard-question', color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-l-yellow-500', label: 'Quiz' };
        } else if (task.type === 'project') {
            typeConfig = { icon: 'fa-code-branch', color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-l-purple-500', label: 'Project' };
        }

        const canDelete = (!task.stats || task.stats.started_count === 0);
        const title = task.title || "Untitled Task";

        const html = `
            <div class="bg-b-surface border border-white/10 border-l-4 ${typeConfig.border} rounded-xl p-4 flex justify-between items-center group hover:bg-white/5 transition-all relative shadow-sm hover:shadow-md">
                <div class="flex items-center gap-4 flex-1 cursor-pointer" onclick="openUnifiedTaskModal('${task.task_id}')">
                    <div class="w-12 h-12 rounded-xl ${typeConfig.bg} ${typeConfig.color} flex items-center justify-center text-xl shadow-inner">
                        <i class="fas ${typeConfig.icon}"></i>
                    </div>
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-[10px] ${typeConfig.color} bg-white/5 px-1.5 rounded border border-white/5">${typeConfig.label}</span>
                            ${task.duration ? `<span class="text-[10px] text-gray-500"><i class="far fa-clock ml-1"></i>${formatDuration(task.duration)}</span>` : ''}
                        </div>
                        <h4 class="font-bold text-white text-base line-clamp-1 group-hover:text-b-primary transition-colors">
                            ${title}
                        </h4>
                    </div>
                </div>

                <div class="flex items-center gap-2 mr-4">
                      <a href="course-player.html?id=${task.course_id}&content=${task.content_id}&task_id=${task.task_id}" 
                        class="w-10 h-10 rounded-lg bg-white/5 hover:bg-b-primary text-gray-400 hover:text-white flex items-center justify-center transition-all"
                        title="Open">
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                    
                    ${canDelete ? `
                        <button onclick="deleteTask('${task.task_id}', '${task.week_id}')" 
                                class="w-10 h-10 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-all flex items-center justify-center"
                                title="Delete">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    ` : `
                        <div class="w-10 h-10 flex items-center justify-center text-gray-600 cursor-help" title="Locked">
                            <i class="fas fa-lock"></i>
                        </div>
                    `}
                </div>
            </div>
        `;
        container.innerHTML += html;
    });
}

function renderGrading() {
    const grid = document.getElementById('submissions-grid');
    if(grid) {
        grid.innerHTML = `<div class="col-span-full text-center text-gray-500 py-20"><i class="fas fa-check-circle text-4xl mb-4 text-green-500/20"></i><p>No submissions.</p></div>`;
    }
}

// ==========================================
// 7. TEAM MANAGEMENT (Squad, Invites, Requests)
// ==========================================

async function renderSquadTab(teamData) {
    if (!teamData) return;
    await renderSquad(); 
    
    // Requests Badge
    const requestsCount = (teamData.requests || []).length;
    const badge = document.getElementById('requests-badge');
    if (badge) {
        badge.innerText = requestsCount;
        badge.classList.toggle('hidden', requestsCount === 0);
    }
    
    // Render other lists
    renderJoinRequests(teamData);
    renderSentInvites(teamData);
}

// Fixed Squad Render (Solves missing members)
async function renderSquad() {
    const list = document.getElementById('squad-list');
    const container = document.getElementById('squad-list-container');
    const countDisplay = document.getElementById('squad-count-display');
    const select = document.getElementById('new-leader-select');
    
    // Clear
    if(list) list.innerHTML = '';
    if(container) container.innerHTML = '';
    if(select) {
        select.innerHTML = '<option value="" disabled selected>Searching members...</option>';
        select.disabled = true;
    }

    if(!currentTeam || !currentTeam.members || currentTeam.members.length === 0) {
        if(select) select.innerHTML = '<option value="" disabled>No members</option>';
        if(container) container.innerHTML = `<div class="p-8 text-center text-gray-500 border border-white/5 border-dashed rounded-2xl">No members currently</div>`;
        return;
    }

    if(countDisplay) countDisplay.innerText = currentTeam.members.length;

    try {
        // Fetch all members (profiles) based on team_id query to be safe
        const { data: membersData, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('team_id', currentTeam.team_id);

        if (error) throw error;

        // Sort by XP
        membersData.sort((a, b) => (b.total_xp || 0) - (a.total_xp || 0));

        if(select) {
            select.innerHTML = '<option value="" disabled selected>-- Select New Leader --</option>';
            select.disabled = false;
        }

        let candidatesFound = 0;
        let containerHtml = '';

        membersData.forEach((member, index) => {
            const university = member.university || "University Unspecified";
            const college = member.faculty || "";
            const name = member.full_name || "Unknown Member";
            const photo = resolveImageUrl(member.avatar_url, 'user');
            const points = member.total_xp || 0;
            const rankData = getRankDataForMember(points);

            const isLeader = member.id === currentTeam.leader_id;
            const isMe = member.id === currentUser.id;
            // Leader logic: only current leader can kick others
            const canKick = (currentUser.id === currentTeam.leader_id) && !isMe;

            // 1. Render Table List
            if(list) {
                const memberRow = document.createElement('div');
                memberRow.className = "p-4 flex justify-between items-center hover:bg-white/5 transition-colors border-b border-white/5 last:border-0";
                memberRow.innerHTML = `
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-full bg-gray-800 border border-white/10 overflow-hidden">
                            <img src="${photo}" class="w-full h-full object-cover" onerror="this.src='../assets/icons/icon.jpg'">
                        </div>
                        <div>
                            <h4 class="font-bold text-sm text-white flex items-center gap-2">
                                ${name} 
                                ${isMe ? '<span class="text-[10px] bg-white/10 px-1.5 rounded text-gray-400">You</span>' : ''}
                                ${isLeader ? '<i class="fas fa-crown text-yellow-500 text-xs" title="Leader"></i>' : ''}
                            </h4>
                            <p class="text-[10px] text-gray-500 font-mono">${points} XP</p>
                        </div>
                    </div>
                    ${canKick ? `
                        <button onclick="confirmKickMember('${currentTeam.team_id}', '${member.id}', '${name}')" 
                                class="text-red-400 hover:text-red-500 text-xs px-3 py-1.5 border border-red-500/20 hover:bg-red-500/10 rounded transition-all">
                            Kick
                        </button>` : ''
                    }
                `;
                list.appendChild(memberRow);
            }

            // 2. Render Card View
            if (container) {
                containerHtml += `
                <div class="group flex flex-col md:flex-row items-center bg-white/5 border border-white/5 rounded-3xl p-5 relative overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-white/20 hover:shadow-2xl hover:shadow-black/50">
                    <div class="absolute right-0 top-0 bottom-0 w-1.5 transition-all duration-500 bg-gradient-to-b from-${index < 3 ? 'yellow-500' : 'transparent'} to-transparent group-hover:h-full"></div>
                    <div class="hidden md:flex items-center justify-center w-14 text-3xl font-black text-white/5 font-mono group-hover:text-white/20 transition-colors">
                        #${index + 1}
                    </div>
                    <div class="relative mb-4 md:mb-0 md:ml-8 flex-shrink-0">
                        <div class="w-24 h-24 rounded-full p-[3px] bg-gradient-to-tr from-[${rankData.stage_color}] to-transparent relative">
                            <img src="${photo}" class="w-full h-full rounded-full object-cover border-4 border-black bg-black" alt="Avatar">
                        </div>
                        <div class="absolute -bottom-2 -right-2 w-12 h-12 bg-black rounded-full flex items-center justify-center border-2 border-[${rankData.stage_color}] shadow-[0_0_15px_${rankData.stage_color}40] z-10">
                            <img src="../assets/user-badge/lv${rankData.level}.png" class="w-12  h-12 rounded-[34%] object-contain">
                        </div>
                    </div>
                    <div class="flex-1 text-center md:text-right space-y-1.5 min-w-0">
                        <div class="flex items-center justify-center md:justify-start gap-3">
                            <h4 class="text-white font-bold text-xl truncate tracking-tight">${name}</h4>
                            ${isLeader ? `<span class="px-2.5 py-0.5 bg-yellow-500/20 text-yellow-500 text-[10px] rounded-full border border-yellow-500/30 font-bold uppercase"><i class="fas fa-crown mr-1"></i> LEADER</span>` : ''}
                        </div>
                        <div class="text-xs font-bold tracking-widest uppercase opacity-90" style="color: ${rankData.stage_color}">
                            ${rankData.title}
                        </div>
                        <div class="flex items-center justify-center md:justify-start gap-2 text-xs text-gray-400 mt-1">
                            <i class="fas fa-university text-gray-500"></i>
                            <span>${university} ${college ? `• ${college}` : ''}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-6 mt-6 md:mt-0 pl-4 border-l border-white/5 ml-4">
                        <div class="text-center px-2">
                            <span class="block text-[9px] text-gray-500 uppercase tracking-widest mb-0.5">XP</span>
                            <span class="font-mono font-black text-2xl text-white tracking-wider">${points.toLocaleString()} <span class="text-[10px] text-b-primary">XP</span></span>
                        </div>
                        ${canKick ? `
                        <button onclick="confirmKickMember('${currentTeam.team_id}', '${member.id}', '${name}')" 
                                class="w-10 h-10 rounded-xl bg-red-500/5 text-red-500 border border-red-500/10 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center" title="Kick">
                            <i class="fas fa-user-times"></i>
                        </button>` : '<div class="w-10"></div>'}
                    </div>
                </div>`;
            }

            // 3. Populate Select
            if (!isMe && select) {
                const option = document.createElement('option');
                option.value = member.id;
                option.text = `${name} (${points} XP)`;
                select.appendChild(option);
                candidatesFound++;
            }
        });

        if (container) container.innerHTML = containerHtml;
        
        if (select && candidatesFound === 0) {
            select.innerHTML = '<option value="" disabled selected>No other members</option>';
            select.disabled = true;
        }

    } catch (e) {
        console.error("Squad Render Error:", e);
        if(select) select.innerHTML = '<option>Error loading</option>';
    }
}

// --- Invitations ---

window.openInviteModal = () => {
    document.getElementById('invite-member-modal').classList.remove('hidden');
    document.getElementById('invite-email-input').value = ''; 
};

window.openSentInvitesModal = () => {
    document.getElementById('sent-invites-modal').classList.remove('hidden');
    renderSentInvitesList(); 
};

window.sendTeamInvitation = async () => {
    const emailInput = document.getElementById('invite-email-input');
    const btn = document.getElementById('btn-send-invite');
    const email = emailInput.value.trim();

    if (!email) return showToast("Enter email address", "error");

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';

    try {
        // Check if user exists
        const { data: user, error: userError } = await supabase
            .from('profiles')
            .select('id, full_name, team_id')
            .eq('email', email)
            .single();

        if (userError || !user) {
            throw new Error("Email not registered.");
        }

        if (user.team_id) {
            throw new Error("User already in a team.");
        }

        // Check if invite exists
        const { data: existing, error: existError } = await supabase
            .from('team_invitations')
            .select('id')
            .eq('to_uid', user.id)
            .eq('from_team_id', currentTeam.team_id)
            .eq('status', 'pending');

        if (existing && existing.length > 0) {
            throw new Error("Invitation already sent.");
        }

        const inviteData = {
            to_uid: user.id,
            to_email: email,
            to_name: user.full_name || "Student",
            from_team_id: currentTeam.team_id,
            from_leader_id: currentUser.id,
            status: 'pending',
            team_snapshot: {
                name: currentTeam.name,
                leader_name: currentUserData.full_name
            }
        };

        const { error: insertError } = await supabase
            .from('team_invitations')
            .insert([inviteData]);

        if (insertError) throw insertError;

        showToast("Invitation sent!", "success");
        closeModal('invite-member-modal');

    } catch (error) {
        console.error(error);
        showToast(error.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Send Invitation';
    }
};

async function renderSentInvitesList() {
    const container = document.getElementById('sent-invites-list');
    container.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-gray-500"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const { data: invites, error } = await supabase
            .from('team_invitations')
            .select('*')
            .eq('from_team_id', currentTeam.team_id);

        if (error) throw error;

        if (!invites || invites.length === 0) {
            container.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-gray-500">No sent invites.</td></tr>';
            return;
        }

        let html = '';
        invites.forEach(invite => {
            if (invite.status === 'accepted') return; 

            const date = new Date(invite.created_at).toLocaleDateString('ar-EG');
            
            let statusBadge = '';
            if (invite.status === 'pending') statusBadge = '<span class="bg-yellow-500/20 text-yellow-500 text-xs px-2 py-1 rounded border border-yellow-500/20">Pending</span>';
            if (invite.status === 'rejected') statusBadge = '<span class="bg-red-500/20 text-red-500 text-xs px-2 py-1 rounded border border-red-500/20">Rejected</span>';

            html += `
            <tr class="hover:bg-white/5 transition border-b border-white/5 last:border-0">
                <td class="p-4 font-bold text-white">${invite.to_name} <br><span class="text-[10px] text-gray-500 font-mono">${invite.to_email}</span></td>
                <td class="p-4">${statusBadge}</td>
                <td class="p-4 text-xs text-gray-400 font-mono">${date}</td>
                <td class="p-4">
                    <button onclick="cancelInvitation('${invite.id}')" class="text-red-400 hover:text-red-300 text-xs font-bold bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded transition-all">
                        <i class="fas fa-trash-alt"></i> Cancel
                    </button>
                </td>
            </tr>
            `;
        });
        container.innerHTML = html || '<tr><td colspan="4" class="p-6 text-center text-gray-500">Clean list.</td></tr>';
    } catch (e) {
        console.error(e);
        container.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-red-500">Failed to load.</td></tr>';
    }
}

function renderSentInvites(teamData) {
    // This function originally rendered recent pending invites in a side panel.
    // We will simulate fetching from the dedicated table since it's no longer in team doc.
    // For now, we call the async fetch and populate.
    
    const container = document.getElementById('invites-container');
    const section = document.getElementById('invites-section');
    
    supabase
        .from('team_invitations')
        .select('*')
        .eq('from_team_id', teamData.id)
        .eq('status', 'pending')
        .then(({ data: invites }) => {
            if (!invites || invites.length === 0) {
                container.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-500">No active invites.</td></tr>`;
                return;
            }

            section.classList.remove('hidden');
            container.innerHTML = invites.map(inv => `
                <tr class="hover:bg-white/5 transition border-b border-white/5 last:border-0 group">
                    <td class="p-4">
                        <div class="font-bold text-white flex items-center gap-2">
                            <div class="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs text-gray-400"><i class="fas fa-user"></i></div>
                            ${inv.to_name || 'Unknown User'}
                        </div>
                    </td>
                    <td class="p-4">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/20 uppercase tracking-wide">
                            <span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span> Waiting
                        </span>
                    </td>
                    <td class="p-4 text-xs font-mono text-gray-500 dir-ltr text-right">
                        ${new Date(inv.created_at).toLocaleDateString('en-GB')}
                    </td>
                    <td class="p-4 text-left">
                        <button onclick="cancelInvitation('${inv.id}')" 
                                class="text-gray-500 hover:text-red-400 text-xs font-bold py-1 px-3 rounded-lg hover:bg-red-500/10 transition-all flex items-center gap-1 ml-auto">
                            <i class="fas fa-trash-alt"></i> Cancel
                        </button>
                    </td>
                </tr>
            `).join('');
        });
}

window.cancelInvitation = (inviteId) => {
    openConfirmModal(
        "Are you sure you want to cancel this invitation?",
        async () => {
            try {
                await supabase.from('team_invitations').delete().eq('id', inviteId);
                showToast("Invitation cancelled", "success");
                closeConfirmModal();
                renderSentInvitesList(); 
                // Refresh small panel
                renderSentInvites(currentTeam);
            } catch (e) {
                console.error("Cancel Error:", e);
                showToast("Error cancelling", "error");
            }
        }
    );
};

// --- Requests ---

window.openRequestsModal = () => {
    document.getElementById('requests-modal').classList.remove('hidden');
    renderRequestsList(); 
};

function renderRequestsList() {
    const container = document.getElementById('requests-list-container');
    const requests = currentTeam.requests || [];

    if (requests.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-gray-500 border border-white/5 border-dashed rounded-xl">No new requests.</div>`;
        return;
    }

    container.innerHTML = requests.map(req => `
        <div class="bg-black/30 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500">
                    <i class="fas fa-user"></i>
                </div>
                <div>
                    <h4 class="font-bold text-white text-sm">${req.name || 'User'}</h4>
                    <p class="text-[10px] text-gray-400">Wants to join</p>
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="handleRequestAction('${currentTeam.team_id}', '${req.uid}', '${req.name}', 'accept')" 
                        class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-all">Accept</button>
                <button onclick="handleRequestAction('${currentTeam.team_id}', '${req.uid}', '${req.name}', 'reject')" 
                        class="px-4 py-2 bg-white/10 hover:bg-red-500/20 text-white hover:text-red-400 rounded-lg text-xs font-bold transition-all border border-white/5">Reject</button>
            </div>
        </div>
    `).join('');
}

function renderJoinRequests(teamData) {
    const section = document.getElementById('requests-section');
    const container = document.getElementById('requests-container');
    const countBadge = document.getElementById('requests-count');
    
    const requests = teamData.requests || [];

    if (requests.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center py-8 text-gray-600 border border-white/5 border-dashed rounded-xl">No new requests</div>`;
        return;
    }

    section.classList.remove('hidden');
    if(countBadge) countBadge.innerText = requests.length;
    
    container.innerHTML = requests.map(req => `
        <div class="bg-b-surface border border-yellow-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-slide-in relative overflow-hidden group">
            <div class="absolute inset-0 bg-yellow-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
            <div class="flex items-center gap-4 z-10">
                <div class="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500 text-xl border border-yellow-500/20 shadow-inner">
                    <i class="fas fa-user-clock"></i>
                </div>
                <div>
                    <h4 class="font-bold text-white text-base">${req.name || 'User'}</h4>
                    <p class="text-xs text-gray-400 mt-0.5">Wants to join your team</p>
                </div>
            </div>
            <div class="flex gap-2 w-full sm:w-auto z-10">
                <button onclick="handleRequestAction('${teamData.id}', '${req.uid}', '${req.name}', 'accept')" 
                        class="flex-1 sm:flex-none py-2 px-4 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-600 hover:text-white transition-all font-bold text-sm">
                    <i class="fas fa-check mr-1"></i> Accept
                </button>
                <button onclick="handleRequestAction('${teamData.id}', '${req.uid}', '${req.name}', 'reject')" 
                        class="flex-1 sm:flex-none py-2 px-4 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-600 hover:text-white transition-all font-bold text-sm">
                    <i class="fas fa-times mr-1"></i> Reject
                </button>
            </div>
        </div>
    `).join('');
}

window.handleRequestAction = async (teamId, userId, userName, action) => {
    try {
        if (action === 'accept') {
            // Update Profile team_id
            const { error: profileErr } = await supabase
                .from('profiles')
                .update({ team_id: teamId, joined_team_at: new Date() })
                .eq('id', userId);
            
            if (profileErr) throw profileErr;

            // Remove request from array
            const newRequests = currentTeam.requests.filter(r => r.uid !== userId);
            await supabase.from('teams').update({ requests: newRequests }).eq('id', teamId);

            showToast(`${userName} accepted!`, 'success');
        } else {
            const newRequests = currentTeam.requests.filter(r => r.uid !== userId);
            await supabase.from('teams').update({ requests: newRequests }).eq('id', teamId);
            showToast(`${userName} rejected`, 'neutral');
        }
        location.reload(); 

    } catch (e) {
        console.error("Request Action Error:", e);
        showToast("Action failed", "error");
    }
};

// --- Member Actions ---

window.confirmKickMember = (teamId, memberUid, memberName) => {
    openConfirmModal(
        `Are you sure you want to remove "${memberName}"? They will keep their points, and team score will not be affected.`,
        async () => {
            try {
                // Update User
                await supabase
                    .from('profiles')
                    .update({ team_id: null })
                    .eq('id', memberUid);

                showToast(`Removed ${memberName} successfully`, 'success');
                setTimeout(() => location.reload(), 1000);
            } catch (error) {
                console.error("Kick Error:", error);
                showToast("Failed to remove member", 'error');
            }
        }
    );
};

window.confirmLeaveTeam = async () => {
    const newLeaderId = document.getElementById('new-leader-select').value;
    const isSolo = (!currentTeam.members || currentTeam.members.length <= 1);
    
    if (!isSolo && !newLeaderId) return showToast("You must select a new leader first", "error");

    try {
        if (newLeaderId) {
            await supabase.from('teams').update({ leader_id: newLeaderId }).eq('id', currentTeam.team_id);
            await supabase.from('profiles').update({ role: 'leader' }).eq('id', newLeaderId);
        }

        await supabase.from('profiles').update({ team_id: null, role: 'student' }).eq('id', currentUser.id);

        showToast("Left team successfully", "success");
        setTimeout(() => window.location.href = "student-dash.html", 1500);

    } catch (e) {
        console.error(e);
        showToast("Error leaving team", "error");
    }
};

window.openLeaveTeamModal = async () => {
    const modal = document.getElementById('leave-team-modal');
    const select = document.getElementById('new-leader-select');
    
    if (modal) modal.classList.remove('hidden');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Loading candidates...</option>';
    select.disabled = true;

    if (!currentTeam || !currentTeam.members) {
        select.innerHTML = '<option value="" disabled>No team data</option>';
        return;
    }

    try {
        const otherMembersIds = currentTeam.members.filter(uid => uid !== currentUser.id);

        if (otherMembersIds.length === 0) {
            select.innerHTML = '<option value="" disabled selected>You are the only member</option>';
            return;
        }

        const { data: members } = await supabase
            .from('profiles')
            .select('*')
            .in('id', otherMembersIds);

        select.innerHTML = '<option value="" disabled selected>-- Select New Leader --</option>';
        
        members.forEach(member => {
            const name = member.full_name || "Unknown";
            const points = member.total_xp || 0;
            
            const option = document.createElement('option');
            option.value = member.id;
            option.text = `${name} (${points} XP)`;
            select.appendChild(option);
        });
        select.disabled = false;

    } catch (error) {
        console.error("Error loading candidates:", error);
        select.innerHTML = '<option value="" disabled>Error loading</option>';
    }
};

// ==========================================
// 8. CALENDAR SYSTEM
// ==========================================

function renderCalendarTab() {
    if (!currentTeam || !currentTeam.weekly_tasks) return;

    const container = document.getElementById('calendar-weeks-container');
    const monthTitle = document.getElementById('calendar-month-title');
    if (!container || !monthTitle) return;

    container.innerHTML = '';
    
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthTitle.innerText = `${monthNames[month]} ${year}`;

    // Calculate start date (previous Saturday)
    let currentDate = new Date(year, month, 1);
    const dayOfWeek = currentDate.getDay(); // 0=Sun ... 6=Sat
    const offset = (dayOfWeek + 1) % 7; 
    currentDate.setDate(currentDate.getDate() - offset);

    const tasks = currentTeam.weekly_tasks || [];

    for (let i = 0; i < 5; i++) {
        const weekStart = new Date(currentDate);
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(currentDate);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const startStr = weekStart.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
        const endStr = weekEnd.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });

        const weekTasks = tasks.filter(t => {
            const taskDue = getSafeDate(t.due_date);
            return taskDue.getTime() >= weekStart.getTime() && taskDue.getTime() <= weekEnd.getTime();
        });

        const weekHTML = `
            <div onclick="openWeekDetails('${weekStart.toISOString()}', '${weekEnd.toISOString()}')" 
                 class="group bg-b-surface border border-white/10 rounded-xl p-5 hover:border-b-primary cursor-pointer transition-all relative overflow-hidden mb-3">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl ${weekTasks.length > 0 ? 'bg-b-primary text-white' : 'bg-white/5 text-gray-500'} flex flex-col items-center justify-center font-bold transition-colors">
                            <span class="text-[10px]">Week</span>
                            <span class="text-lg">${i + 1}</span>
                        </div>
                        <div>
                            <h4 class="font-bold text-white text-lg">${startStr} - ${endStr}</h4>
                            <p class="text-xs text-gray-400 mt-1 flex items-center gap-2">
                                <span class="${weekTasks.length > 0 ? 'text-b-hl-light' : ''}">
                                    <i class="fas fa-tasks ml-1"></i> ${weekTasks.length} tasks
                                </span>
                            </p>
                        </div>
                    </div>
                    <i class="fas fa-chevron-left text-gray-600 group-hover:text-white transition-transform"></i>
                </div>
            </div>
        `;
        container.innerHTML += weekHTML;
        currentDate.setDate(currentDate.getDate() + 7);
    }
}

window.changeMonth = (offset) => {
    calendarDate.setMonth(calendarDate.getMonth() + offset);
    renderCalendarTab();
};

window.openWeekDetails = (startIso, endIso) => {
    const modal = document.getElementById('week-details-modal');
    const container = document.getElementById('week-modal-tasks');
    const headerTitle = document.getElementById('week-modal-title');
    const headerPoints = document.getElementById('week-modal-points');

    const startDate = new Date(startIso);
    const endDate = new Date(endIso);
    
    const tasks = (currentTeam.weekly_tasks || []).filter(t => {
        const d = getSafeDate(t.due_date);
        return d >= startDate && d <= endDate;
    });

    headerTitle.innerText = `Week Details (${startDate.toLocaleDateString('ar-EG', {day:'numeric', month:'numeric'})} - ${endDate.toLocaleDateString('ar-EG', {day:'numeric', month:'numeric'})})`;
    headerPoints.innerText = tasks.length * 10; 

    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 flex flex-col items-center justify-center text-gray-500">
                <div class="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <i class="fas fa-coffee text-2xl"></i>
                </div>
                <p>No tasks assigned this week</p>
            </div>`;
    } else {
        container.innerHTML = tasks.map(t => `
            <div class="flex items-center justify-between p-4 bg-black/20 border border-white/5 rounded-xl hover:bg-black/40 transition-colors">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-lg ${t.stats?.completed_count > 0 ? 'bg-green-500/20 text-green-400' : 'bg-b-primary/20 text-b-primary'} flex items-center justify-center">
                        <i class="fas ${t.type === 'quiz' ? 'fa-question' : 'fa-play'}"></i>
                    </div>
                    <div>
                        <h4 class="font-bold text-white text-sm">${t.title || 'Untitled'}</h4>
                        <div class="flex items-center gap-3 mt-1 text-xs text-gray-400">
                            <span><i class="fas fa-eye ml-1"></i> ${t.stats?.started_count || 0} views</span>
                            <span><i class="fas fa-check-circle ml-1"></i> ${t.stats?.completed_count || 0} done</span>
                        </div>
                    </div>
                </div>
                <div>
                      ${t.stats?.completed_count > 0 ? 
                        '<span class="text-green-400 text-xs font-bold bg-green-900/20 px-2 py-1 rounded">Active</span>' : 
                        '<span class="text-yellow-400 text-xs font-bold bg-yellow-900/20 px-2 py-1 rounded">Pending</span>'}
                </div>
            </div>
        `).join('');
    }
    modal.classList.remove('hidden');
};

window.closeWeekModal = () => document.getElementById('week-details-modal').classList.add('hidden');
window.openDayModal = (dateStr) => {
    const modal = document.getElementById('day-details-modal');
    const content = document.getElementById('day-modal-content');
    const title = document.getElementById('day-modal-title');
    
    const tasks = (currentTeam.weekly_tasks || []).filter(t => t.due_date && t.due_date.startsWith(dateStr));
    title.innerText = `Tasks for ${dateStr}`;
    
    if (tasks.length === 0) {
        content.innerHTML = `<p class="text-center text-gray-500 py-6">No tasks due today.</p>`;
    } else {
        content.innerHTML = tasks.map(t => `
            <div class="bg-black/30 p-3 rounded-lg border border-white/5 mb-2">
                <h4 class="font-bold text-white text-sm">${t.title}</h4>
                <div class="flex justify-between items-center mt-2 text-xs">
                    <span class="text-gray-400">${t.type || 'Video'}</span>
                    <span class="${t.stats?.completed_count > 0 ? 'text-green-400' : 'text-yellow-400'}">
                        ${t.stats?.completed_count || 0} completed
                    </span>
                </div>
            </div>
        `).join('');
    }
    modal.classList.remove('hidden');
};
window.closeDayModal = () => document.getElementById('day-details-modal').classList.add('hidden');

// ==========================================
// 9. MODALS & UI HELPERS
// ==========================================

// Unified Task Modal
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

// Global Modals
window.openTaskDetailsModal = (taskId) => {
    const task = currentTeam.weekly_tasks.find(t => t.task_id === taskId);
    if (!task) return;

    document.getElementById('modal-task-title').innerText = task.title || 'Untitled';
    document.getElementById('modal-task-desc').innerText = task.description || 'No Description.';
    document.getElementById('modal-task-duration').innerText = formatDuration(task.duration) || '--:--';
    
    const playerLink = `course-player.html?id=${task.course_id}&content=${task.content_id}&task_id=${task.task_id}`;
    document.getElementById('modal-task-link').href = playerLink;

    document.getElementById('task-details-modal').classList.remove('hidden');
};
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
window.openCustomTaskModal = () => document.getElementById('custom-task-modal').classList.remove('hidden');
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
// 10. UTILITY FUNCTIONS
// ==========================================

function getSafeDate(dateVal) {
    if (!dateVal) return new Date();
    if (typeof dateVal.toDate === 'function') {
        return dateVal.toDate();
    }
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

    // If it's pure number (seconds)
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
    if (!url || url.trim() === "" || url === "null" || url === "undefined") {
        return '../assets/icons/icon.jpg';
    }
    if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
        const idMatch = url.match(/\/d\/([-\w]{25,})/) || url.match(/id=([-\w]{25,})/);
        if (idMatch && idMatch[1]) {
            return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
        }
    }
    if (url.includes('dropbox.com')) {
        return url.replace('?dl=0', '?raw=1');
    }
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
    let rank = RANKS_DATA[0];
    for (let i = 0; i < RANKS_DATA.length; i++) {
        if (points >= RANKS_DATA[i].points_required) {
            rank = RANKS_DATA[i];
        } else {
            break;
        }
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