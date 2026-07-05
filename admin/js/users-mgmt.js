import { supabase } from '../../js/supabase-config.js';
import { RANKS_DATA } from '../../js/badges-data.js';

// ==========================================
// 🚀 STATE MANAGEMENT
// ==========================================
let allUsers = [];
let filteredUsers = [];
let allEnrollments = [];
let selectedUser = null;
let selectedUserRole = 'student'; // 'student' or 'leader'
let currentCategory = 'student'; // 'student' or 'leader' (tab switcher)
let adminRoles = []; // Store list of administrative roles from database

// Global LMS Data cache for calculations
let globalCourses = [];
let globalPhases = [];
let globalMaterials = [];
let globalTracks = [];
let globalTeams = [];

// Charts instances to prevent duplicates
let xpChartInstance = null;
let activityChartInstance = null;

// Leader Performance Tab sub-state
let leaderTeamMembers = [];
let leaderComparisonSortCol = 'name';
let leaderComparisonSortAsc = true;

// ==========================================
// 💡 TRANSLATIONS & RESOLVERS
// ==========================================
function resolveImageUrl(url, type) {
    if (url && url.startsWith('http')) return url;
    if (type === 'user') return '../../assets/icons/BUSLA-icon.png';
    return '../../assets/icons/BUSLA-icon.png';
}

function translateUni(val) {
    if (window.translateUni) return window.translateUni(val);
    return val || 'غير محدد';
}

// Map user role to text & CSS color class
function getUserRoleLabel(role) {
    const r = String(role).trim().toLowerCase();
    if (r === 'student') return { text: 'طالب', color: 'text-teal-400 bg-teal-500/10 border-teal-500/20' };
    if (r === 'leader') return { text: 'قائد فريق', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' };
    if (r === 'admin') return { text: 'مشرف', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
    if (r === 'owner') return { text: 'المالك', color: 'text-red-400 bg-red-500/10 border-red-500/20' };
    if (r === 'pending') return { text: 'قيد التفعيل', color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' };
    if (r.startsWith('suspended')) return { text: 'موقوف', color: 'text-red-500 bg-red-500/10 border-red-500/20' };
    return { text: role || 'غير معروف', color: 'text-gray-400 bg-gray-500/10 border-gray-500/20' };
}

// Get user status classification: 'active', 'suspended', 'pending'
function getUserStatus(role) {
    const r = String(role).trim().toLowerCase();
    if (r === 'pending') return 'pending';
    if (r.startsWith('suspended') || r === 'suspended') return 'suspended';
    return 'active';
}

// Calculate user rank from XP
function getRankData(points) {
    if (!RANKS_DATA || RANKS_DATA.length === 0) {
        return { title: 'Trainee', color: 'text-gray-400 bg-gray-400/10', level: 1, stage_color: '#888888' };
    }
    let rank = RANKS_DATA[0];
    for (let i = 0; i < RANKS_DATA.length; i++) {
        if (points >= RANKS_DATA[i].points_required) rank = RANKS_DATA[i];
        else break;
    }
    return rank;
}

// ==========================================
// ⚙️ INITIALIZATION
// ==========================================
window.initUsersMgmt = async () => {
    console.log("👤 [Users Mgmt] Initializing...");
    const tbody = document.getElementById('users-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="p-10 text-center"><i class="fas fa-spinner fa-spin text-b-primary text-2xl"></i></td></tr>`;

    try {
        // Load global static/course data once if empty
        if (globalCourses.length === 0) {
            const [cRes, pRes, mRes, tRes, teamsRes, adminRolesRes] = await Promise.all([
                supabase.from('courses').select('*'),
                supabase.from('phases').select('*'),
                supabase.from('course_materials').select('*').order('order_index', { ascending: true }),
                supabase.from('tracks').select('*'),
                supabase.from('teams').select('*'),
                supabase.from('admin_roles').select('name')
            ]);
            
            globalCourses = cRes.data || [];
            globalPhases = pRes.data || [];
            globalMaterials = mRes.data || [];
            globalTracks = tRes.data || [];
            globalTeams = teamsRes.data || [];
            adminRoles = (adminRolesRes.data || []).map(r => String(r.name).toLowerCase().trim());
        }

        await window.fetchUsersData();
    } catch (err) {
        console.error("Initialization Error:", err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="p-10 text-center text-red-500">حدث خطأ أثناء تحميل البيانات المنهجية.</td></tr>`;
    }
};

// Fetch profiles and enrollments
window.fetchUsersData = async () => {
    const tbody = document.getElementById('users-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="p-10 text-center"><i class="fas fa-spinner fa-spin text-b-primary text-2xl"></i></td></tr>`;

    try {
        // Fetch profiles & active teams
        const [profilesRes, enrollmentsRes, teamsRes] = await Promise.all([
            supabase.from('profiles').select('*').order('created_at', { ascending: false }),
            supabase.from('enrollments').select('*'),
            supabase.from('teams').select('*')
        ]);

        if (profilesRes.error) throw profilesRes.error;
        if (enrollmentsRes.error) throw enrollmentsRes.error;

        const rawProfiles = profilesRes.data || [];
        allEnrollments = enrollmentsRes.data || [];
        globalTeams = teamsRes.data || [];

        // Exclude administrative users
        const knownAdminRoles = ['owner', 'master admin', 'admin', 'content admin', 'review admin', 'team admin', 'content manager', 'review manager', 'team manager', 'leader supervisor', 'team reviewer', 'project reviewer', 'support'];
        allUsers = rawProfiles.filter(p => {
            const role = String(p.role || '').toLowerCase().trim();
            if (adminRoles.includes(role)) return false;
            if (knownAdminRoles.includes(role)) return false;
            return true;
        });

        // Refresh stats cards
        updateStatsCards();

        // Build advanced filter options dynamically
        populateFilterDropdowns();

        // Apply filters & render
        window.filterUsers();
    } catch (err) {
        console.error("Fetch Users Error:", err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="p-10 text-center text-red-500">حدث خطأ أثناء تحميل حسابات المستخدمين.</td></tr>`;
    }
};

// Update top statistics cards
function updateStatsCards() {
    const totalStudents = allUsers.filter(u => {
        const r = String(u.role).toLowerCase();
        return r === 'student' || r === 'suspended_student';
    }).length;

    const totalLeaders = allUsers.filter(u => {
        const r = String(u.role).toLowerCase();
        return r === 'leader' || r === 'suspended_leader';
    }).length;

    const activeStudents = allUsers.filter(u => u.role === 'student').length;
    const activeLeaders = allUsers.filter(u => u.role === 'leader').length;

    const studentsNoTeam = allUsers.filter(u => {
        const r = String(u.role).toLowerCase();
        return (r === 'student' || r === 'suspended_student') && !u.team_id;
    }).length;

    const leadersWithTeam = allUsers.filter(u => {
        const r = String(u.role).toLowerCase();
        const isLeader = r === 'leader' || r === 'suspended_leader';
        return isLeader && globalTeams.some(t => t.leader_id === u.id);
    }).length;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const newUsers = allUsers.filter(u => u.created_at && new Date(u.created_at) >= sevenDaysAgo).length;

    const sStudents = document.getElementById('stat-mgmt-students');
    const sLeaders = document.getElementById('stat-mgmt-leaders');
    const sActiveStudents = document.getElementById('stat-mgmt-active-students');
    const sActiveLeaders = document.getElementById('stat-mgmt-active-leaders');
    const sStudentsNoTeam = document.getElementById('stat-mgmt-students-no-team');
    const sLeadersWithTeam = document.getElementById('stat-mgmt-leaders-with-team');
    const sNewUsers = document.getElementById('stat-mgmt-new-users');

    if (sStudents) sStudents.innerText = totalStudents;
    if (sLeaders) sLeaders.innerText = totalLeaders;
    if (sActiveStudents) sActiveStudents.innerText = activeStudents;
    if (sActiveLeaders) sActiveLeaders.innerText = activeLeaders;
    if (sStudentsNoTeam) sStudentsNoTeam.innerText = studentsNoTeam;
    if (sLeadersWithTeam) sLeadersWithTeam.innerText = leadersWithTeam;
    if (sNewUsers) sNewUsers.innerText = newUsers;
}

// Populate dropdown filters dynamically
function populateFilterDropdowns() {
    const unis = new Set();
    const faculties = new Set();
    const depts = new Set();
    const years = new Set();
    const govs = new Set();
    const ranks = new Set();

    allUsers.forEach(u => {
        if (u.university) unis.add(u.university);
        if (u.faculty) faculties.add(u.faculty);
        if (u.department) depts.add(u.department);
        if (u.academic_year) years.add(u.academic_year);
        if (u.governorate) govs.add(u.governorate);
        if (u.current_rank) ranks.add(u.current_rank);
    });

    const populate = (id, items) => {
        const select = document.getElementById(id);
        if (!select) return;
        select.innerHTML = '<option value="all">الكل</option>';
        [...items].sort().forEach(item => {
            const translated = id === 'filter-user-uni' ? translateUni(item) : item;
            select.innerHTML += `<option value="${item}">${translated}</option>`;
        });
    };

    populate('filter-user-uni', unis);
    populate('filter-user-faculty', faculties);
    populate('filter-user-dept', depts);
    populate('filter-user-year', years);
    populate('filter-user-gov', govs);
    populate('filter-user-rank', ranks);

    // Populate Teams filter
    const teamSelect = document.getElementById('filter-user-team');
    if (teamSelect) {
        teamSelect.innerHTML = '<option value="all">الكل</option>';
        globalTeams.forEach(t => {
            teamSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
        });
    }
}

// ==========================================
// 🔍 SEARCH & FILTERING
// ==========================================
window.switchUsersTab = (category) => {
    currentCategory = category;
    
    // Toggle active button CSS
    const sBtn = document.getElementById('btn-users-tab-students');
    const lBtn = document.getElementById('btn-users-tab-leaders');
    
    if (category === 'student') {
        sBtn?.classList.add('bg-white/10', 'text-white');
        sBtn?.classList.remove('text-gray-400');
        lBtn?.classList.remove('bg-white/10', 'text-white');
        lBtn?.classList.add('text-gray-400');
    } else {
        lBtn?.classList.add('bg-white/10', 'text-white');
        lBtn?.classList.remove('text-gray-400');
        sBtn?.classList.remove('bg-white/10', 'text-white');
        sBtn?.classList.add('text-gray-400');
    }

    window.filterUsers();
};

window.filterUsers = () => {
    const search = document.getElementById('users-filter-search')?.value.trim().toLowerCase() || '';
    
    const uni = document.getElementById('filter-user-uni')?.value || 'all';
    const faculty = document.getElementById('filter-user-faculty')?.value || 'all';
    const dept = document.getElementById('filter-user-dept')?.value || 'all';
    const year = document.getElementById('filter-user-year')?.value || 'all';
    const gov = document.getElementById('filter-user-gov')?.value || 'all';
    const team = document.getElementById('filter-user-team')?.value || 'all';
    const rank = document.getElementById('filter-user-rank')?.value || 'all';
    const status = document.getElementById('filter-user-status')?.value || 'all';

    filteredUsers = allUsers.filter(u => {
        const role = String(u.role).toLowerCase();
        
        // 1. Separate tabs: Students vs Leaders
        if (currentCategory === 'student') {
            // Students are students, pending users, or suspended students
            const isStudentType = role === 'student' || role === 'suspended_student' || role === 'pending' || role === 'suspended';
            if (!isStudentType) return false;
        } else {
            // Leaders are leaders or suspended leaders (exclude admin and owner)
            const isLeaderType = role === 'leader' || role === 'suspended_leader';
            if (!isLeaderType) return false;
        }

        // 2. Search Box
        const name = (u.full_name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const id = (u.id || '').toLowerCase();
        const matchSearch = name.includes(search) || email.includes(search) || id.includes(search);
        if (!matchSearch) return false;

        // 3. Dropdowns
        if (uni !== 'all' && u.university !== uni) return false;
        if (faculty !== 'all' && u.faculty !== faculty) return false;
        if (dept !== 'all' && u.department !== dept) return false;
        if (year !== 'all' && u.academic_year !== year) return false;
        if (gov !== 'all' && u.governorate !== gov) return false;
        if (team !== 'all' && u.team_id !== team) return false;
        if (rank !== 'all' && u.current_rank !== rank) return false;
        
        if (status !== 'all') {
            const uStatus = getUserStatus(u.role);
            if (uStatus !== status) return false;
        }

        return true;
    });

    renderUsersTable(filteredUsers);
};

// ==========================================
// 📊 TABLE RENDERING
// ==========================================
async function renderUsersTable(data) {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-10 text-center text-gray-500">لا يوجد مستخدمين مطابِقين لفلترة البحث.</td></tr>`;
        return;
    }

    // Get current logged-in user permissions to hide/show Delete button
    let isOwner = false;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
            const { data: currentAdmin } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
            isOwner = currentAdmin?.role === 'owner';
        }
    } catch(e) {}

    tbody.innerHTML = data.map(user => {
        const photo = resolveImageUrl(user.avatar_url, 'user');
        const roleLabel = getUserRoleLabel(user.role);
        
        // 1. Calculate Course Enrollments Progress
        const userEnrollments = allEnrollments.filter(e => e.user_id === user.id);
        const regCount = userEnrollments.length;
        const compCount = userEnrollments.filter(e => e.is_completed).length;
        
        let avgProgress = 0;
        let lastActivity = '--';

        if (regCount > 0) {
            const totalProgress = userEnrollments.reduce((acc, curr) => acc + (curr.progress_percent || 0), 0);
            avgProgress = Math.round(totalProgress / regCount);

            // Find latest activity
            let maxDate = null;
            userEnrollments.forEach(e => {
                if (e.last_accessed_at) {
                    const d = new Date(e.last_accessed_at);
                    if (!maxDate || d > maxDate) maxDate = d;
                }
            });
            if (maxDate) {
                lastActivity = maxDate.toLocaleDateString('en-GB') + ' ' + maxDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            }
        }

        // 2. Fetch Team Name
        const teamObj = globalTeams.find(t => t.id === user.team_id);
        const teamName = teamObj ? teamObj.name : 'لا يوجد فريق';

        // 3. Status Badge
        const uStatus = getUserStatus(user.role);
        let statusBadge = '';
        if (uStatus === 'active') {
            statusBadge = `<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400">نشط</span>`;
        } else if (uStatus === 'suspended') {
            statusBadge = `<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400">موقوف</span>`;
        } else {
            statusBadge = `<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">بانتظار التفعيل</span>`;
        }

        const deleteButton = isOwner ? `
            <button onclick="window.deleteUser('${user.id}')" class="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center" title="حذف الحساب"><i class="fas fa-trash-alt text-xs"></i></button>
        ` : '';

        const uRank = getRankData(user.total_xp || 0);

        return `
            <tr class="hover:bg-white/5 transition-colors border-b border-white/5">
                <!-- User Profile info -->
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        <img src="${photo}" class="w-10 h-10 rounded-full object-cover border border-white/10 bg-black shrink-0">
                        <div>
                            <div class="font-bold text-white text-sm flex items-center gap-2">
                                ${user.full_name || 'عضو مجهول'}
                                <span class="px-1.5 py-0.5 rounded text-[8px] font-bold border ${roleLabel.color}">${roleLabel.text}</span>
                            </div>
                            <div class="text-[10px] text-gray-500 font-mono mt-0.5 select-all">${user.email || '--'}</div>
                        </div>
                    </div>
                </td>
                
                <!-- Academic details -->
                <td class="p-4 text-center">
                    <div class="text-xs text-gray-300 font-bold">${translateUni(user.university)}</div>
                    <div class="text-[10px] text-gray-500 mt-1">${user.faculty || '--'} - ${user.academic_year || '--'}</div>
                </td>

                <!-- Team -->
                <td class="p-4 text-center text-xs text-gray-300 font-bold">
                    <span class="bg-white/5 border border-white/10 rounded px-2.5 py-1">${teamName}</span>
                </td>

                <!-- Rank & XP -->
                <td class="p-4 text-center">
                    <div class="text-xs font-bold" style="color: ${uRank.stage_color || '#fff'}">${uRank.title}</div>
                    <div class="text-[10px] text-yellow-500 font-mono font-bold mt-1">${(user.total_xp || 0).toLocaleString()} XP</div>
                </td>

                <!-- Progress % -->
                <td class="p-4 text-center font-mono">
                    <div class="text-xs font-bold text-white">${avgProgress}%</div>
                    <div class="w-20 bg-white/10 h-1.5 rounded-full mt-1.5 overflow-hidden mx-auto">
                        <div class="bg-teal-500 h-full rounded-full" style="width: ${avgProgress}%"></div>
                    </div>
                </td>

                <!-- Registered / Completed Courses -->
                <td class="p-4 text-center text-xs font-mono text-gray-300">
                    <span class="font-bold">${compCount}</span> / <span class="text-gray-500">${regCount}</span>
                </td>

                <!-- Last Activity -->
                <td class="p-4 text-center text-[10px] font-mono text-gray-400">
                    ${lastActivity}
                </td>

                <!-- Status -->
                <td class="p-4 text-center">
                    ${statusBadge}
                </td>

                <!-- Actions -->
                <td class="p-4">
                    <div class="flex items-center justify-center gap-1.5">
                        <button onclick="window.openUserDetails('${user.id}')" class="px-2.5 py-1.5 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white transition-all text-xs font-bold border border-teal-500/20" title="عرض التفاصيل"><i class="fas fa-eye"></i></button>
                        <button onclick="window.openEditUserModal('${user.id}')" class="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center" title="تعديل البيانات"><i class="fas fa-edit text-xs"></i></button>
                        <button onclick="window.toggleUserSuspension('${user.id}')" class="w-8 h-8 rounded-lg ${uStatus === 'suspended' ? 'bg-green-500/10 text-green-400 hover:bg-green-500' : 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500'} hover:text-black transition-all flex items-center justify-center" title="${uStatus === 'suspended' ? 'تفعيل الحساب' : 'إيقاف الحساب'}">
                            <i class="fas ${uStatus === 'suspended' ? 'fa-user-check' : 'fa-user-slash'} text-xs"></i>
                        </button>
                        <button onclick="window.openSendNotificationModal('${user.id}')" class="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-600 hover:text-white transition-all flex items-center justify-center" title="إرسال إشعار للمستخدم"><i class="fas fa-paper-plane text-xs"></i></button>
                        <button onclick="window.resetUserPassword('${user.id}')" class="w-8 h-8 rounded-lg bg-gray-500/10 text-gray-400 hover:bg-white hover:text-black transition-all flex items-center justify-center" title="إعادة تعيين كلمة المرور"><i class="fas fa-key text-xs"></i></button>
                        <button onclick="window.copyUserProfileLink('${user.id}')" class="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:bg-white hover:text-black transition-all flex items-center justify-center" title="نسخ رابط الملف الشخصي"><i class="fas fa-copy text-xs"></i></button>
                        ${deleteButton}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ==========================================
// 🖥️ DETAILS MODAL (TAB PANES LOGIC)
// ==========================================
let detailEnrollments = [];
let detailCompletedMaterials = [];
let detailQuizAttempts = [];
let detailProjectSubmissions = [];
let detailXpLogs = [];
let detailTeamTasks = [];
let detailTasksCategory = 'active'; // active, completed, overdue

window.openUserDetails = async (userId) => {
    selectedUser = allUsers.find(u => u.id === userId);
    if (!selectedUser) return;

    selectedUserRole = String(selectedUser.role).trim().toLowerCase();

    // Set Modal Header
    const avatar = resolveImageUrl(selectedUser.avatar_url, 'user');
    document.getElementById('ud-header-avatar').src = avatar;
    document.getElementById('ud-header-name').innerText = selectedUser.full_name || 'عضو مجهول';
    document.getElementById('ud-header-email').innerText = selectedUser.email || '--';

    const roleLabel = getUserRoleLabel(selectedUser.role);
    const uStatus = getUserStatus(selectedUser.role);
    const sBadge = document.getElementById('ud-header-status-badge');
    if (sBadge) {
        sBadge.className = `px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
            uStatus === 'active' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 
            uStatus === 'suspended' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
            'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
        }`;
        sBadge.innerText = uStatus === 'active' ? 'نشط' : uStatus === 'suspended' ? 'موقوف' : 'بانتظار التفعيل';
    }

    // Toggle Leader tab visibility
    const leadTabBtn = document.getElementById('ud-tab-btn-leader-perf');
    if (selectedUserRole === 'leader' || selectedUserRole === 'suspended_leader') {
        leadTabBtn?.classList.remove('hidden');
    } else {
        leadTabBtn?.classList.add('hidden');
    }

    // Open Modal and display spinner while loading
    const modal = document.getElementById('user-details-modal');
    modal.classList.remove('hidden');

    // Switch default tab to Personal
    window.switchUserDetailsTab('personal');

    // Lazy load user database info
    try {
        const [enrolRes, compRes, quizRes, projRes, xpRes] = await Promise.all([
            supabase.from('enrollments').select('*').eq('user_id', userId),
            supabase.from('completed_materials').select('*').eq('user_id', userId),
            supabase.from('quiz_attempts').select('*').eq('user_id', userId).order('submitted_at', { ascending: false }),
            supabase.from('project_submissions').select('*').eq('user_id', userId).order('submitted_at', { ascending: false }),
            supabase.from('student_xp_logs').select('*').eq('user_id', userId).order('created_at', { ascending: true })
        ]);

        detailEnrollments = enrolRes.data || [];
        detailCompletedMaterials = compRes.data || [];
        detailQuizAttempts = quizRes.data || [];
        detailProjectSubmissions = projRes.data || [];
        detailXpLogs = xpRes.data || [];

        // If in a team, fetch team tasks
        if (selectedUser.team_id) {
            const { data: teamTasks } = await supabase.from('team_tasks').select('*').eq('team_id', selectedUser.team_id);
            detailTeamTasks = teamTasks || [];
        } else {
            detailTeamTasks = [];
        }

        // Render current active pane
        renderActiveDetailsPane();

    } catch (err) {
        console.error("Error lazy-loading user details:", err);
        window.showToast("حدث خطأ أثناء تحميل تفاصيل العضو", "error");
    }
};

window.switchUserDetailsTab = (tabId) => {
    // Reset all tabs active state
    const btns = document.querySelectorAll('.ud-tab-btn');
    const panes = document.querySelectorAll('.ud-pane');

    btns.forEach(btn => {
        const clickFn = btn.getAttribute('onclick');
        if (clickFn && clickFn.includes(`'${tabId}'`)) {
            btn.className = "ud-tab-btn active w-full flex items-center gap-3 p-3 rounded-xl bg-b-primary/10 text-b-primary font-bold text-right text-sm transition-all";
        } else {
            // Keep disabled buttons looking disabled
            if (btn.hasAttribute('disabled')) {
                btn.className = "ud-tab-btn w-full flex items-center gap-3 p-3 rounded-xl text-gray-400/30 cursor-not-allowed text-right text-sm transition-all";
            } else {
                btn.className = "ud-tab-btn w-full flex items-center gap-3 p-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white text-right text-sm transition-all";
            }
        }
    });

    panes.forEach(pane => {
        if (pane.id === `ud-pane-${tabId}`) {
            pane.classList.remove('hidden');
        } else {
            pane.classList.add('hidden');
        }
    });

    renderActiveDetailsPane(tabId);
};

// Render the selected tab's data
function renderActiveDetailsPane(tabId) {
    // Determine active tab if not specified
    if (!tabId) {
        const activePane = document.querySelector('.ud-pane:not(.hidden)');
        tabId = activePane ? activePane.id.replace('ud-pane-', '') : 'personal';
    }

    if (tabId === 'personal') {
        renderTabPersonal();
    } else if (tabId === 'progress') {
        renderTabProgress();
    } else if (tabId === 'courses') {
        renderTabCourses();
    } else if (tabId === 'tasks') {
        renderTabTasks();
    } else if (tabId === 'timeline') {
        renderTabTimeline();
    } else if (tabId === 'team') {
        renderTabTeam();
    } else if (tabId === 'stats') {
        // Run stats rendering and wait a cycle to draw charts on visible canvas
        renderTabStats();
        setTimeout(initCharts, 100);
    } else if (tabId === 'leader-perf') {
        renderTabLeaderPerformance();
    }
}

// -----------------------------------------
// Tab 1: Personal Info Rendering
// -----------------------------------------
function renderTabPersonal() {
    if (!selectedUser) return;
    const teamObj = globalTeams.find(t => t.id === selectedUser.team_id);

    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val || '--';
    };

    setText('ud-p-name', selectedUser.full_name);
    setText('ud-p-email', selectedUser.email);
    setText('ud-p-role', getUserRoleLabel(selectedUser.role).text);
    setText('ud-p-gov', selectedUser.governorate);
    setText('ud-p-uni', translateUni(selectedUser.university));
    setText('ud-p-faculty', selectedUser.faculty);
    setText('ud-p-dept', selectedUser.department);
    setText('ud-p-year', selectedUser.academic_year);
    setText('ud-p-team', teamObj ? teamObj.name : 'لا يوجد فريق');
    setText('ud-p-rank', getRankData(selectedUser.total_xp || 0).title);
    setText('ud-p-xp', (selectedUser.total_xp || 0).toLocaleString() + ' XP');

    if (selectedUser.created_at) {
        setText('ud-p-registered', new Date(selectedUser.created_at).toLocaleDateString('en-GB'));
    }
    
    // Simulating last login based on enrollments or default text
    let lastLogin = '--';
    if (detailEnrollments.length > 0) {
        let maxDate = null;
        detailEnrollments.forEach(e => {
            if (e.last_accessed_at) {
                const d = new Date(e.last_accessed_at);
                if (!maxDate || d > maxDate) maxDate = d;
            }
        });
        if (maxDate) lastLogin = maxDate.toLocaleString('en-GB');
    }
    setText('ud-p-last-login', lastLogin);
}

// -----------------------------------------
// Tab 2: Progress Summary Rendering
// -----------------------------------------
function renderTabProgress() {
    const regCount = detailEnrollments.length;
    const compCount = detailEnrollments.filter(e => e.is_completed).length;

    let avgProgress = 0;
    if (regCount > 0) {
        const totalProgress = detailEnrollments.reduce((acc, curr) => acc + (curr.progress_percent || 0), 0);
        avgProgress = Math.round(totalProgress / regCount);
    }

    // Average Quizzes and Projects grades
    const quizScores = detailQuizAttempts.filter(q => q.passed);
    let avgQuizScore = 0;
    if (quizScores.length > 0) {
        const sum = quizScores.reduce((acc, curr) => acc + (curr.score || 0), 0);
        avgQuizScore = Math.round(sum / quizScores.length);
    }

    const projectGrades = detailProjectSubmissions.filter(p => p.status === 'graded');
    let avgProjScore = 0;
    if (projectGrades.length > 0) {
        const sum = projectGrades.reduce((acc, curr) => acc + (curr.grade || 0), 0);
        avgProjScore = Math.round(sum / projectGrades.length);
    }

    // Videos Calculations
    const enrolledCourseIds = detailEnrollments.map(e => e.course_id);
    const totalVideos = globalMaterials.filter(m => enrolledCourseIds.includes(m.course_id) && (m.type === 'video' || m.type === 'section')).length;
    const compVideos = detailCompletedMaterials.filter(m => enrolledCourseIds.includes(m.course_id)).length;
    const remainingVideos = Math.max(0, totalVideos - compVideos);

    document.getElementById('ud-prog-percent').innerText = `${avgProgress}%`;
    document.getElementById('ud-prog-percent-bar').style.width = `${avgProgress}%`;

    document.getElementById('ud-prog-courses').innerText = `${compCount} / ${regCount}`;
    document.getElementById('ud-prog-videos').innerText = `${compVideos} / ${remainingVideos} متبقي`;
    document.getElementById('ud-prog-assessments').innerText = `${quizScores.length} / ${projectGrades.length}`;

    document.getElementById('ud-avg-quiz').innerText = `${avgQuizScore}%`;
    document.getElementById('ud-avg-quiz-bar').style.width = `${avgQuizScore}%`;
    document.getElementById('ud-avg-proj').innerText = `${avgProjScore}%`;
    document.getElementById('ud-avg-proj-bar').style.width = `${avgProjScore}%`;

    // Visual Overall status
    const overallEl = document.getElementById('ud-prog-overall-badge');
    if (avgProgress >= 80) {
        overallEl.className = "mt-3 px-4 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-bold";
        overallEl.innerText = "نشط ومتفوق جداً 🔥";
    } else if (avgProgress >= 40) {
        overallEl.className = "mt-3 px-4 py-1.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold";
        overallEl.innerText = "مستمر بالتقدم ⚡";
    } else {
        overallEl.className = "mt-3 px-4 py-1.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold";
        overallEl.innerText = "يتطلب متابعة وتشجيع ⚠️";
    }
}

// -----------------------------------------
// Tab 3: Courses Listing Rendering
// -----------------------------------------
function renderTabCourses() {
    const tbody = document.getElementById('ud-courses-table-body');
    if (!tbody) return;

    if (detailEnrollments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-10 text-center text-gray-500">لا يوجد كورسات مسجلة للمستخدم حالياً.</td></tr>`;
        return;
    }

    tbody.innerHTML = detailEnrollments.map(enrol => {
        const course = globalCourses.find(c => c.id === enrol.course_id);
        const title = course ? course.title : enrol.course_id;
        
        // Fetch phase
        const phase = course ? globalPhases.find(p => p.id === course.phase_id) : null;
        const phaseTitle = phase ? phase.title : '--';

        // Calculate course progress
        const courseMaterials = globalMaterials.filter(m => m.course_id === enrol.course_id);
        const totalVids = courseMaterials.filter(m => m.type === 'video' || m.type === 'section').length;
        const completedVids = detailCompletedMaterials.filter(m => m.course_id === enrol.course_id).length;
        
        // Quizzes
        const quizzesInCourse = courseMaterials.filter(m => m.ref_quiz_id);
        const quizIds = quizzesInCourse.map(q => q.ref_quiz_id);
        const solvedQuizzes = detailQuizAttempts.filter(qa => quizIds.includes(qa.quiz_id) && qa.passed).length;
        const totalQuizzes = quizzesInCourse.length;

        // Project
        const projectMaterial = courseMaterials.find(m => m.ref_project_id);
        let projectText = '--';
        if (projectMaterial) {
            const submission = detailProjectSubmissions.find(ps => ps.project_id === projectMaterial.ref_project_id);
            if (submission) {
                projectText = submission.status === 'graded' ? `${submission.grade}/${submission.grade ? 100 : ''}` : 'تم التسليم';
            } else {
                projectText = 'لم يسلم';
            }
        }

        const lastAccess = enrol.last_accessed_at ? new Date(enrol.last_accessed_at).toLocaleDateString('en-GB') : '--';
        const progress = enrol.progress_percent || 0;

        let statusText = 'مستمر';
        let statusClass = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
        if (enrol.is_completed) {
            statusText = 'مكتمل';
            statusClass = 'bg-green-500/10 text-green-400 border-green-500/20';
        } else if (progress === 0) {
            statusText = 'لم يبدأ';
            statusClass = 'bg-gray-500/10 text-gray-400 border-gray-500/20';
        }

        return `
            <tr class="hover:bg-white/5 transition-colors border-b border-white/5 cursor-pointer" onclick="window.viewUserCourseDetails('${enrol.course_id}')">
                <td class="p-4 font-bold text-white">${title}</td>
                <td class="p-4 text-center text-xs text-gray-300">${phaseTitle}</td>
                <td class="p-4 text-center font-mono">
                    <div class="text-xs font-bold">${progress}%</div>
                    <div class="w-16 bg-white/10 h-1.5 rounded-full mt-1.5 overflow-hidden mx-auto">
                        <div class="bg-teal-500 h-full rounded-full" style="width: ${progress}%"></div>
                    </div>
                </td>
                <td class="p-4 text-center text-xs font-mono text-gray-300">${completedVids} / ${totalVids}</td>
                <td class="p-4 text-center text-xs font-mono text-gray-300">${solvedQuizzes} / ${totalQuizzes}</td>
                <td class="p-4 text-center text-xs font-bold text-purple-400">${projectText}</td>
                <td class="p-4 text-center text-xs font-mono text-gray-500">${lastAccess}</td>
                <td class="p-4 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${statusClass}">${statusText}</span>
                </td>
            </tr>
        `;
    }).join('');
}

// -----------------------------------------
// Tab 4: Course Details Rendering (Sub-view)
// -----------------------------------------
window.viewUserCourseDetails = (courseId) => {
    const course = globalCourses.find(c => c.id === courseId);
    if (!course) return;

    // Set course details header
    document.getElementById('ud-cd-course-title').innerText = course.title;

    // Enable Tab 4
    const btnTab = document.getElementById('ud-tab-btn-course-details');
    btnTab.disabled = false;
    btnTab.className = "ud-tab-btn w-full flex items-center gap-3 p-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white text-right text-sm transition-all";

    // Switch to Tab 4
    window.switchUserDetailsTab('course-details');

    // 1. Populate videos
    const courseMaterials = globalMaterials.filter(m => m.course_id === courseId);
    const videosList = document.getElementById('ud-cd-videos-list');
    
    const vids = courseMaterials.filter(m => m.type === 'video' || m.type === 'section');
    if (vids.length === 0) {
        videosList.innerHTML = `<div class="text-center py-6 text-gray-500 text-xs">لا يوجد فيديوهات في هذا الكورس.</div>`;
    } else {
        videosList.innerHTML = vids.map(vid => {
            const isCompleted = detailCompletedMaterials.some(m => m.material_id === vid.id);
            const compRecord = detailCompletedMaterials.find(m => m.material_id === vid.id);
            const watchPercent = isCompleted ? 100 : 0;
            const completedDate = compRecord ? new Date(compRecord.completed_at).toLocaleString('en-GB') : '--';
            const openCount = isCompleted ? 1 : 0; // Simulated open count

            return `
                <div class="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-black/30 hover:bg-white/5 transition-colors">
                    <div>
                        <p class="font-bold text-white text-xs">${vid.title}</p>
                        <p class="text-[10px] text-gray-500 mt-1"><i class="fas fa-clock ml-1"></i> المدة: ${vid.duration ? Math.round(vid.duration/60) + ' دقيقة' : '--'} | آخر فتح: ${completedDate}</p>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="text-[10px] font-bold font-mono text-gray-400">${watchPercent}%</span>
                        <span class="px-2 py-0.5 rounded text-[9px] font-bold ${isCompleted ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-white/5 text-gray-400 border border-white/10'}">${isCompleted ? 'تمت المشاهدة' : 'لم يشاهد'}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 2. Populate Quizzes
    const quizzesList = document.getElementById('ud-cd-quizzes-list');
    const quizzes = courseMaterials.filter(m => m.ref_quiz_id);
    if (quizzes.length === 0) {
        quizzesList.innerHTML = `<div class="text-center py-6 text-gray-500 text-xs">لا توجد كويزات في هذا الكورس.</div>`;
    } else {
        quizzesList.innerHTML = quizzes.map(q => {
            const attempts = detailQuizAttempts.filter(qa => qa.quiz_id === q.ref_quiz_id);
            const bestAttempt = attempts.reduce((acc, curr) => (curr.score > (acc?.score || 0)) ? curr : acc, null);
            const solveDate = bestAttempt ? new Date(bestAttempt.submitted_at).toLocaleDateString('en-GB') : '--';
            const attemptCount = attempts.length;

            return `
                <div class="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-black/30 hover:bg-white/5 transition-colors">
                    <div>
                        <p class="font-bold text-white text-xs">${q.title}</p>
                        <p class="text-[10px] text-gray-500 mt-1"><i class="fas fa-redo ml-1"></i> المحاولات: ${attemptCount} | تاريخ الحل: ${solveDate}</p>
                    </div>
                    <div class="text-left">
                        <span class="text-xs font-bold ${bestAttempt?.passed ? 'text-green-400' : 'text-red-400'}">${bestAttempt ? bestAttempt.score + '%' : 'غير محلول'}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 3. Populate Projects
    const projContainer = document.getElementById('ud-cd-project-details');
    const projMaterial = courseMaterials.find(m => m.ref_project_id);
    if (!projMaterial) {
        projContainer.innerHTML = `<div class="text-center py-6 text-gray-500 text-xs">لا يوجد مشروع في هذا الكورس.</div>`;
    } else {
        const sub = detailProjectSubmissions.find(ps => ps.project_id === projMaterial.ref_project_id);
        if (sub) {
            const subDate = new Date(sub.submitted_at).toLocaleString('en-GB');
            const gradeText = sub.status === 'graded' ? `${sub.grade} / 100` : 'بانتظار التقييم';
            const grader = sub.graded_by_name || '--';

            projContainer.innerHTML = `
                <div class="p-3 bg-black/30 rounded-lg border border-white/5 space-y-2">
                    <div class="flex justify-between"><span>العنوان:</span> <span class="font-bold text-white">${projMaterial.title}</span></div>
                    <div class="flex justify-between"><span>رابط التسليم:</span> <a href="${sub.submission_link}" target="_blank" class="text-teal-400 hover:underline truncate max-w-[180px]">${sub.submission_link}</a></div>
                    <div class="flex justify-between"><span>تاريخ الرفع:</span> <span class="font-mono">${subDate}</span></div>
                    <div class="flex justify-between"><span>الدرجة:</span> <span class="font-bold text-yellow-500">${gradeText}</span></div>
                    <div class="flex justify-between"><span>المصحح:</span> <span class="font-bold text-white">${grader}</span></div>
                </div>
            `;
        } else {
            projContainer.innerHTML = `
                <div class="p-4 rounded-lg bg-red-500/5 border border-red-500/10 text-center">
                    <p class="text-red-400 font-bold mb-1">المشروع لم يسلم بعد</p>
                    <p class="text-[10px] text-gray-500">يتوجب على الطالب تسليم المشروع لإكمال الكورس والحصول على التقييم.</p>
                </div>
            `;
        }
    }
};

// -----------------------------------------
// Tab 5: Tasks Rendering
// -----------------------------------------
window.switchUserTasksCategory = (cat) => {
    detailTasksCategory = cat;
    
    // Switch tabs buttons active state
    const activeBtn = document.getElementById('btn-ud-task-active');
    const compBtn = document.getElementById('btn-ud-task-completed');
    const overdueBtn = document.getElementById('btn-ud-task-overdue');

    const reset = (btn) => btn?.classList.replace('bg-white/10', 'text-gray-400');
    reset(activeBtn); reset(compBtn); reset(overdueBtn);

    const select = document.getElementById(`btn-ud-task-${cat}`);
    select?.classList.remove('text-gray-400');
    select?.classList.add('bg-white/10', 'text-white');

    renderTabTasks();
};

function renderTabTasks() {
    const tbody = document.getElementById('ud-tasks-table-body');
    if (!tbody) return;

    if (detailTeamTasks.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-10 text-center text-gray-500">المستخدم ليس لديه مهام فريق (أو ليس في فريق).</td></tr>`;
        return;
    }

    // Calculate dates boundary
    const now = new Date();
    const completedProjects = new Set(detailProjectSubmissions.map(p => p.project_id));
    const passedQuizzes = new Set(detailQuizAttempts.filter(q => q.passed).map(q => q.quiz_id));
    const completedMats = new Set(detailCompletedMaterials.map(m => m.material_id));

    // Categorize
    const activeTasks = [];
    const completedTasks = [];
    const overdueTasks = [];

    detailTeamTasks.forEach(task => {
        let isCompleted = false;
        if (task.type === 'project') isCompleted = completedProjects.has(task.content_id);
        else if (task.type === 'quiz') isCompleted = passedQuizzes.has(task.content_id);
        else isCompleted = completedMats.has(task.content_id);

        const due = task.due_date ? new Date(task.due_date) : null;
        const isOverdue = due && due < now && !isCompleted;

        const mappedTask = { ...task, isCompleted, isOverdue };

        if (isCompleted) completedTasks.push(mappedTask);
        else if (isOverdue) overdueTasks.push(mappedTask);
        else activeTasks.push(mappedTask);
    });

    let listToRender = [];
    if (detailTasksCategory === 'completed') listToRender = completedTasks;
    else if (detailTasksCategory === 'overdue') listToRender = overdueTasks;
    else listToRender = activeTasks;

    if (listToRender.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-10 text-center text-gray-500">لا توجد مهام في هذا التصنيف.</td></tr>`;
        return;
    }

    tbody.innerHTML = listToRender.map(task => {
        const assigned = task.created_at ? new Date(task.created_at).toLocaleDateString('en-GB') : '--';
        const due = task.due_date ? new Date(task.due_date).toLocaleDateString('en-GB') : '--';

        const courseObj = globalCourses.find(c => c.id === task.course_id);
        const courseTitle = courseObj ? courseObj.title : '--';

        const progressPercent = task.isCompleted ? 100 : 0;

        let badge = '';
        if (task.isCompleted) {
            badge = `<span class="px-2 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 font-bold">مكتملة</span>`;
        } else if (task.isOverdue) {
            badge = `<span class="px-2 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 font-bold animate-pulse">متأخرة</span>`;
        } else {
            badge = `<span class="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">جارية</span>`;
        }

        const typeMap = { 'video': 'فيديو', 'quiz': 'كويز', 'project': 'مشروع' };
        const displayType = typeMap[task.type] || task.type || 'درس';

        return `
            <tr class="hover:bg-white/5 transition-colors border-b border-white/5">
                <td class="p-4 font-bold text-white">${task.title || 'بدون عنوان'}</td>
                <td class="p-4 text-center text-xs text-gray-300">${displayType}</td>
                <td class="p-4 text-center text-xs text-gray-400 truncate max-w-[150px]">${courseTitle}</td>
                <td class="p-4 text-center text-xs font-bold text-teal-400 font-mono">${task.week_id || '--'}</td>
                <td class="p-4 text-center text-xs font-mono text-gray-500">${assigned}</td>
                <td class="p-4 text-center text-xs font-mono text-gray-500">${due}</td>
                <td class="p-4 text-center">${badge}</td>
                <td class="p-4 text-center font-mono font-bold text-xs">${progressPercent}%</td>
            </tr>
        `;
    }).join('');
}

// -----------------------------------------
// Tab 6: Activity Timeline Rendering
// -----------------------------------------
function renderTabTimeline() {
    const container = document.getElementById('ud-timeline-container');
    if (!container) return;

    // Collect events
    const events = [];

    // 1. Course Enrollments (Start Course)
    detailEnrollments.forEach(enrol => {
        if (enrol.started_at) {
            const course = globalCourses.find(c => c.id === enrol.course_id);
            events.push({
                time: new Date(enrol.started_at),
                title: 'بدء كورس جديد',
                body: `بدأ دراسة كورس [${course ? course.title : enrol.course_id}]`,
                icon: 'fa-play-circle text-blue-400 bg-blue-500/10',
            });
        }
    });

    // 2. Video Completions
    detailCompletedMaterials.forEach(mat => {
        if (mat.completed_at) {
            const material = globalMaterials.find(m => m.id === mat.material_id);
            const course = globalCourses.find(c => c.id === mat.course_id);
            events.push({
                time: new Date(mat.completed_at),
                title: 'إنهاء درس فيديو',
                body: `شاهد درس [${material ? material.title : mat.material_id}] من كورس [${course ? course.title : mat.course_id}]`,
                icon: 'fa-check-circle text-green-400 bg-green-500/10',
            });
        }
    });

    // 3. Quiz Attempts
    detailQuizAttempts.forEach(qa => {
        if (qa.submitted_at && qa.passed) {
            const quiz = globalMaterials.find(m => m.ref_quiz_id === qa.quiz_id);
            events.push({
                time: new Date(qa.submitted_at),
                title: 'اجتياز كويز بنجاح',
                body: `حل كويز [${quiz ? quiz.title : 'كويز'}] وحصل على درجة ${qa.score}%`,
                icon: 'fa-clipboard-check text-yellow-500 bg-yellow-500/10',
            });
        }
    });

    // 4. Project Submissions
    detailProjectSubmissions.forEach(ps => {
        if (ps.submitted_at) {
            const proj = globalMaterials.find(m => m.ref_project_id === ps.project_id);
            events.push({
                time: new Date(ps.submitted_at),
                title: 'تسليم مشروع الكورس',
                body: `رفع مشروع [${proj ? proj.title : 'المشروع'}] - الحالة الحالية: ${ps.status === 'graded' ? 'تم التصحيح والتقييم بـ ' + ps.grade + '/100' : 'بانتظار تصحيح الليدر'}`,
                icon: 'fa-code-branch text-purple-400 bg-purple-500/10',
            });
        }
    });

    // 5. XP logs
    detailXpLogs.forEach(log => {
        if (log.created_at) {
            events.push({
                time: new Date(log.created_at),
                title: 'الحصول على نقاط XP',
                body: `حصل على +${log.amount} XP لسبب: "${log.reason}"`,
                icon: 'fa-trophy text-yellow-500 bg-yellow-500/10',
            });
        }
    });

    // 6. Profile Creation (Registration)
    if (selectedUser.created_at) {
        events.push({
            time: new Date(selectedUser.created_at),
            title: 'تأسيس الحساب وتسجيل الدخول الأول',
            body: `انضم رسمياً لمنصة بوصلة في تراك [${selectedUser.track || 'Digital IC Design'}]`,
            icon: 'fa-user-plus text-teal-400 bg-teal-500/10',
        });
    }

    // Sort events in chronological order (latest first)
    events.sort((a, b) => b.time - a.time);

    if (events.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-gray-500 text-xs">لا يوجد نشاط مسجل للمستخدم حالياً.</div>`;
        return;
    }

    container.innerHTML = events.map(evt => {
        const timeStr = evt.time.toLocaleDateString('en-GB') + ' ' + evt.time.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        return `
            <div class="relative pl-8">
                <!-- Timeline Dot Icon -->
                <div class="absolute -right-[43px] top-0 w-8 h-8 rounded-full flex items-center justify-center border border-white/10 ${evt.icon} z-10">
                    <i class="fas ${evt.icon.split(' ')[0]} text-xs"></i>
                </div>
                <!-- Timeline Content Card -->
                <div class="bg-black/40 border border-white/5 rounded-xl p-4 hover:bg-white/5 transition-colors">
                    <span class="text-[10px] text-gray-500 font-mono block mb-1">${timeStr}</span>
                    <h5 class="font-bold text-white text-sm">${evt.title}</h5>
                    <p class="text-xs text-gray-400 mt-1 leading-relaxed">${evt.body}</p>
                </div>
            </div>
        `;
    }).join('');
}

// -----------------------------------------
// Tab 7: Team Details Rendering
// -----------------------------------------
async function renderTabTeam() {
    const teamLogo = document.getElementById('ud-team-logo');
    const teamName = document.getElementById('ud-team-name');
    const teamLeader = document.getElementById('ud-team-leader');
    const teamCount = document.getElementById('ud-team-members-count');
    const teamXp = document.getElementById('ud-team-xp');
    const teamRankEl = document.getElementById('ud-team-rank');
    const membersTbody = document.getElementById('ud-team-members-table-body');

    if (!selectedUser.team_id) {
        teamName.innerText = 'لا ينتمي لأي فريق';
        teamLeader.innerText = '--';
        teamCount.innerText = '0';
        teamXp.innerText = '0 XP';
        teamRankEl.innerText = '--';
        membersTbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-gray-500">المستخدم لا ينتمي لأي فريق حالياً.</td></tr>`;
        return;
    }

    try {
        // Fetch team information
        const { data: team, error } = await supabase.from('teams').select('*').eq('id', selectedUser.team_id).single();
        if (error) throw error;

        // Fetch team members profiles
        const { data: members } = await supabase.from('profiles').select('*').eq('team_id', selectedUser.team_id);
        
        // Find leader name
        const leaderObj = members ? members.find(m => m.id === team.leader_id) : null;
        const leaderName = leaderObj ? leaderObj.full_name : 'غير محدد';

        // Set UI
        teamName.innerText = team.name;
        teamLogo.src = resolveImageUrl(team.logo_url, 'team');
        teamLeader.innerText = leaderName;
        teamCount.innerText = members ? members.length : 0;
        teamXp.innerText = `${(team.total_score || 0).toLocaleString()} XP`;
        teamRankEl.innerText = team.total_score >= 10000 ? 'بلاتيني 🏆' : team.total_score >= 5000 ? 'ذهبي 🥇' : 'فضي 🥈';

        // Render team members
        if (!members || members.length <= 1) {
            membersTbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-gray-500">لا يوجد أعضاء آخرين في هذا الفريق.</td></tr>`;
            return;
        }

        // Filter out selected user and sort by XP
        const otherMembers = members.filter(m => m.id !== selectedUser.id).sort((a, b) => (b.total_xp || 0) - (a.total_xp || 0));

        // Get enrollments for progress calculations
        const otherMemberIds = otherMembers.map(m => m.id);
        const { data: memEnrollments } = await supabase.from('enrollments').select('user_id, progress_percent').in('user_id', otherMemberIds);

        membersTbody.innerHTML = otherMembers.map(m => {
            const mRank = getRankData(m.total_xp || 0);
            
            // Calculate progress
            const mEnrols = memEnrollments ? memEnrollments.filter(e => e.user_id === m.id) : [];
            let progress = 0;
            if (mEnrols.length > 0) {
                progress = Math.round(mEnrols.reduce((acc, curr) => acc + (curr.progress_percent || 0), 0) / mEnrols.length);
            }

            return `
                <tr class="hover:bg-white/5 transition-colors border-b border-white/5">
                    <td class="p-4 font-bold text-white flex items-center gap-2">
                        <img src="${resolveImageUrl(m.avatar_url, 'user')}" class="w-6 h-6 rounded-full object-cover shrink-0">
                        ${m.full_name || 'عضو مجهول'}
                    </td>
                    <td class="p-4 text-center text-xs" style="color: ${mRank.stage_color}">${mRank.title}</td>
                    <td class="p-4 text-center text-xs font-mono font-bold text-yellow-500">${(m.total_xp || 0).toLocaleString()} XP</td>
                    <td class="p-4 text-center font-mono">
                        <span class="text-xs font-bold">${progress}%</span>
                    </td>
                    <td class="p-4 text-center text-[10px] font-mono text-gray-500">نشط مؤخراً</td>
                    <td class="p-4 text-center">
                        <button onclick="window.openUserDetails('${m.id}')" class="px-2 py-1 bg-white/5 hover:bg-teal-500 hover:text-white border border-white/10 rounded text-[10px] font-bold transition-all">فتح الملف</button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Error loading team details:", err);
        membersTbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-red-500">فشل تحميل تفاصيل وأعضاء الفريق.</td></tr>`;
    }
}

// -----------------------------------------
// Tab 8: Statistics Rendering (Charts)
// -----------------------------------------
function renderTabStats() {
    // Basic stats values mapping
    const quizCount = detailQuizAttempts.filter(q => q.passed).length;
    const projCount = detailProjectSubmissions.filter(p => p.status === 'graded').length;
    
    // Simulate learning hours: 1 video = 0.5 hour, 1 quiz = 1 hour, 1 project = 5 hours
    const completedVideosCount = detailCompletedMaterials.length;
    const simulatedHours = Math.round((completedVideosCount * 0.5) + (quizCount * 1.0) + (projCount * 5.0));

    document.getElementById('ud-stat-learning-hours').innerText = `${simulatedHours} ساعة`;
    document.getElementById('ud-stat-quizzes-done').innerText = `${quizCount} كويز`;
    document.getElementById('ud-stat-projects-done').innerText = `${projCount} مشروع`;
}

function initCharts() {
    // 1. XP Growth Chart
    const xpCtx = document.getElementById('ud-chart-xp-growth');
    if (!xpCtx) return;

    if (xpChartInstance) {
        xpChartInstance.destroy();
    }

    // Process XP logs into cumulative data points
    const xpLabels = ['البداية'];
    const xpData = [0];
    let cumulative = 0;

    detailXpLogs.forEach(log => {
        cumulative += log.amount || 0;
        const date = log.created_at ? new Date(log.created_at).toLocaleDateString('en-GB') : '';
        xpLabels.push(date);
        xpData.push(cumulative);
    });

    xpChartInstance = new Chart(xpCtx, {
        type: 'line',
        data: {
            labels: xpLabels,
            datasets: [{
                label: 'النقاط المتراكمة (XP)',
                data: xpData,
                borderColor: '#006A67',
                backgroundColor: 'rgba(0, 106, 103, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#888' } },
                x: { grid: { display: false }, ticks: { color: '#888', maxTicksLimit: 8 } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });

    // 2. Weekly Activity Chart (completed materials per week)
    const actCtx = document.getElementById('ud-chart-weekly-activity');
    if (!actCtx) return;

    if (activityChartInstance) {
        activityChartInstance.destroy();
    }

    // Map completed videos to past 5 weeks
    const weeks = ['الاسبوع 1', 'الاسبوع 2', 'الاسبوع 3', 'الاسبوع 4', 'الاسبوع 5'];
    const videoData = [0, 0, 0, 0, 0];
    const hourData = [0, 0, 0, 0, 0];

    // Distribute completed materials randomly or by dates
    detailCompletedMaterials.forEach((m, idx) => {
        const weekIdx = idx % 5;
        videoData[weekIdx]++;
        hourData[weekIdx] += 0.5;
    });

    activityChartInstance = new Chart(actCtx, {
        type: 'bar',
        data: {
            labels: weeks,
            datasets: [
                {
                    label: 'الدروس المكتملة',
                    data: videoData,
                    backgroundColor: '#FFC107',
                    borderRadius: 5
                },
                {
                    label: 'ساعات التعلم الكلية',
                    data: hourData,
                    backgroundColor: '#006A67',
                    borderRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#888' } },
                x: { grid: { display: false }, ticks: { color: '#888' } }
            },
            plugins: {
                legend: { labels: { color: '#fff', font: { family: 'Cairo' } } }
            }
        }
    });
}

// -----------------------------------------
// Tab 9: Leader Performance & Comparison Table
// -----------------------------------------
async function renderTabLeaderPerformance() {
    const teamCount = document.getElementById('ud-lp-members-count');
    const tasksCreated = document.getElementById('ud-lp-tasks-created');
    const projectsGraded = document.getElementById('ud-lp-projects-graded');
    const avgGradingTime = document.getElementById('ud-lp-avg-grading-time');
    const avgTeamGrade = document.getElementById('ud-lp-avg-team-grade');
    const teamProgress = document.getElementById('ud-lp-team-progress');
    const teamRankIndex = document.getElementById('ud-lp-team-rank-index');
    const postsCount = document.getElementById('ud-lp-posts-count');
    const meetingsCount = document.getElementById('ud-lp-meetings-count');
    const warningsCount = document.getElementById('ud-lp-warnings-count');
    const tbody = document.getElementById('ud-lp-members-comparison-tbody');

    // 1. Leader team ID
    const leaderTeam = globalTeams.find(t => t.leader_id === selectedUser.id);
    if (!leaderTeam) {
        teamCount.innerText = '0';
        tbody.innerHTML = `<tr><td colspan="9" class="p-10 text-center text-gray-500">هذا القائد لا يقود أي فريق حالياً.</td></tr>`;
        return;
    }

    try {
        tbody.innerHTML = `<tr><td colspan="9" class="p-10 text-center"><i class="fas fa-spinner fa-spin text-b-primary text-2xl"></i></td></tr>`;

        // Fetch team members, tasks created, projects graded, posts/meetings/warnings
        const [membersRes, tasksRes, gradedRes, postsRes] = await Promise.all([
            supabase.from('profiles').select('*').eq('team_id', leaderTeam.id),
            supabase.from('team_tasks').select('*').eq('assigned_by', selectedUser.id),
            supabase.from('project_submissions').select('*').eq('graded_by', selectedUser.id),
            supabase.from('team_posts').select('*').eq('creator_id', selectedUser.id)
        ]);

        const members = membersRes.data || [];
        const tasks = tasksRes.data || [];
        const gradedSubmissions = gradedRes.data || [];
        const posts = postsRes.data || [];

        // Set quick stats
        teamCount.innerText = members.length;
        tasksCreated.innerText = tasks.length;
        projectsGraded.innerText = gradedSubmissions.length;

        // Calculate average grading time
        let avgTimeText = '--';
        if (gradedSubmissions.length > 0) {
            let totalHours = 0;
            let gradedCount = 0;
            gradedSubmissions.forEach(sub => {
                if (sub.graded_at && sub.submitted_at) {
                    const diffMs = new Date(sub.graded_at) - new Date(sub.submitted_at);
                    totalHours += diffMs / (1000 * 60 * 60);
                    gradedCount++;
                }
            });
            if (gradedCount > 0) {
                const avgHours = totalHours / gradedCount;
                avgTimeText = avgHours < 24 ? `${Math.round(avgHours)} ساعة` : `${Math.round(avgHours / 24)} يوم`;
            }
        }
        avgGradingTime.innerText = avgTimeText;

        // Count posts types
        postsCount.innerText = posts.filter(p => p.type === 'announcement' || p.type === 'achievement').length;
        meetingsCount.innerText = posts.filter(p => p.type === 'meeting').length;
        warningsCount.innerText = posts.filter(p => p.type === 'warning').length;

        // Team rank index
        const sortedTeams = [...globalTeams].sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
        const rankIdx = sortedTeams.findIndex(t => t.id === leaderTeam.id) + 1;
        teamRankIndex.innerText = rankIdx > 0 ? `#${rankIdx}` : '--';

        // Calculate comparison data for team members
        if (members.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="p-10 text-center text-gray-500">لا يوجد أعضاء في الفريق حالياً.</td></tr>`;
            return;
        }

        const memberIds = members.map(m => m.id);
        const [enrolsRes, compMatsRes, quizAttemptsRes, projSubmissionsRes] = await Promise.all([
            supabase.from('enrollments').select('*').in('user_id', memberIds),
            supabase.from('completed_materials').select('*').in('user_id', memberIds),
            supabase.from('quiz_attempts').select('*').in('user_id', memberIds),
            supabase.from('project_submissions').select('*').in('user_id', memberIds)
        ]);

        const enrols = enrolsRes.data || [];
        const compMats = compMatsRes.data || [];
        const quizzes = quizAttemptsRes.data || [];
        const projects = projSubmissionsRes.data || [];

        // Map and compute metrics for comparison table
        leaderTeamMembers = members.map(m => {
            const mEnrols = enrols.filter(e => e.user_id === m.id);
            const mCompMats = compMats.filter(c => c.user_id === m.id);
            const mQuizzes = quizzes.filter(q => q.user_id === m.id && q.passed);
            const mProjects = projects.filter(p => p.user_id === m.id && p.status === 'graded');

            let progress = 0;
            if (mEnrols.length > 0) {
                progress = Math.round(mEnrols.reduce((acc, curr) => acc + (curr.progress_percent || 0), 0) / mEnrols.length);
            }

            // Find last active date
            let lastAct = null;
            mEnrols.forEach(e => {
                if (e.last_accessed_at) {
                    const d = new Date(e.last_accessed_at);
                    if (!lastAct || d > lastAct) lastAct = d;
                }
            });

            return {
                id: m.id,
                name: m.full_name || 'عضو مجهول',
                progress: progress,
                xp: m.total_xp || 0,
                courses: mEnrols.filter(e => e.is_completed).length,
                videos: mCompMats.length,
                quizzes: mQuizzes.length,
                projects: mProjects.length,
                last_activity: lastAct ? lastAct : new Date(0),
                taskStatus: 'مستمر'
            };
        });

        // Set Team Performance Averages
        const totalProg = leaderTeamMembers.reduce((acc, m) => acc + m.progress, 0);
        const avgTeamProg = Math.round(totalProg / leaderTeamMembers.length);
        teamProgress.innerText = `${avgTeamProg}%`;

        const totalXp = leaderTeamMembers.reduce((acc, m) => acc + m.xp, 0);
        avgTeamGrade.innerText = `${Math.round(totalXp / leaderTeamMembers.length).toLocaleString()} XP`;

        // Render sorted comparison table
        sortAndRenderLeaderComparisonTable();

    } catch (err) {
        console.error("Error loading leader performance:", err);
        tbody.innerHTML = `<tr><td colspan="9" class="p-10 text-center text-red-500">فشل تحميل مقارنة الأعضاء وأداء الليدر.</td></tr>`;
    }
}

// Sort & Render leader comparison
function sortAndRenderLeaderComparisonTable() {
    const tbody = document.getElementById('ud-lp-members-comparison-tbody');
    if (!tbody) return;

    // Apply sorting
    leaderTeamMembers.sort((a, b) => {
        let valA = a[leaderComparisonSortCol];
        let valB = b[leaderComparisonSortCol];

        if (typeof valA === 'string') {
            return leaderComparisonSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
            return leaderComparisonSortAsc ? valA - valB : valB - valA;
        }
    });

    tbody.innerHTML = leaderTeamMembers.map(m => {
        const lastAccess = m.last_activity.getTime() > 0 ? m.last_activity.toLocaleDateString('en-GB') : '--';
        return `
            <tr class="hover:bg-white/5 border-b border-white/5">
                <td class="p-4 font-bold text-white text-xs select-none">${m.name}</td>
                <td class="p-4 text-center font-mono font-bold text-xs text-teal-400">${m.progress}%</td>
                <td class="p-4 text-center font-mono font-bold text-xs text-yellow-500">${m.xp.toLocaleString()}</td>
                <td class="p-4 text-center font-mono text-xs text-gray-300">${m.courses}</td>
                <td class="p-4 text-center font-mono text-xs text-gray-300">${m.videos}</td>
                <td class="p-4 text-center font-mono text-xs text-gray-300">${m.quizzes}</td>
                <td class="p-4 text-center font-mono text-xs text-gray-300">${m.projects}</td>
                <td class="p-4 text-center font-mono text-[10px] text-gray-500">${lastAccess}</td>
                <td class="p-4 text-center">
                    <span class="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">${m.taskStatus}</span>
                </td>
            </tr>
        `;
    }).join('');
}

window.sortTeamMembers = (col) => {
    if (leaderComparisonSortCol === col) {
        leaderComparisonSortAsc = !leaderComparisonSortAsc;
    } else {
        leaderComparisonSortCol = col;
        leaderComparisonSortAsc = true;
    }
    sortAndRenderLeaderComparisonTable();
};

// ==========================================
// ✏️ EDIT PROFILE DATA ACTIONS
// ==========================================
window.openEditUserModal = (userId) => {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('edit-user-id').value = userId;
    document.getElementById('edit-user-name').value = user.full_name || '';
    document.getElementById('edit-user-uni').value = user.university || '';
    document.getElementById('edit-user-faculty').value = user.faculty || '';
    document.getElementById('edit-user-dept').value = user.department || '';
    document.getElementById('edit-user-year').value = user.academic_year || '';
    document.getElementById('edit-user-gov').value = user.governorate || '';
    document.getElementById('edit-user-role').value = user.role || 'student';
    document.getElementById('edit-user-rank').value = user.current_rank || 'Newbie';
    document.getElementById('edit-user-xp').value = user.total_xp || 0;

    document.getElementById('edit-user-modal').classList.remove('hidden');
};

window.saveUserData = async (e) => {
    e.preventDefault();
    const userId = document.getElementById('edit-user-id').value;
    const form = document.getElementById('edit-user-form');
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    submitBtn.disabled = true;

    const updates = {
        full_name: document.getElementById('edit-user-name').value.trim(),
        university: document.getElementById('edit-user-uni').value.trim(),
        faculty: document.getElementById('edit-user-faculty').value.trim(),
        department: document.getElementById('edit-user-dept').value.trim(),
        academic_year: document.getElementById('edit-user-year').value.trim(),
        governorate: document.getElementById('edit-user-gov').value.trim(),
        role: document.getElementById('edit-user-role').value,
        current_rank: document.getElementById('edit-user-rank').value.trim(),
        total_xp: parseInt(document.getElementById('edit-user-xp').value)
    };

    try {
        const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
        if (error) throw error;

        window.showToast("تم تحديث البيانات بنجاح!", "success");
        document.getElementById('edit-user-modal').classList.add('hidden');
        await window.fetchUsersData(); // Reload table
    } catch (err) {
        console.error("Save User Error:", err);
        window.showToast("حدث خطأ أثناء حفظ البيانات: " + err.message, "error");
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
};

// ==========================================
// 🛡️ RESET PASSWORD & SUSPENSION ACTIONS
// ==========================================
window.resetUserPassword = async (userId) => {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    const confirmed = await window.showCustomConfirm(
        "إعادة تعيين كلمة المرور",
        `هل أنت متأكد من إرسال رابط إعادة تعيين كلمة المرور للمستخدم: ${user.full_name}؟`,
        null,
        null,
        'warning'
    );
    if (confirmed) {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                redirectTo: 'https://buslaicd.vercel.app/reset-password.html'
            });
            if (error) throw error;

            window.showToast("تم إرسال بريد إعادة تعيين كلمة المرور بنجاح!", "success");
        } catch (err) {
            console.error("Reset Password Error:", err);
            window.showToast("فشل إرسال البريد: " + err.message, "error");
        }
    }
};

// Suspend / Reactivate account
window.toggleUserSuspension = async (userId) => {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    const uStatus = getUserStatus(user.role);
    let nextRole = 'student';
    let msg = '';

    if (uStatus === 'suspended') {
        // Reactivate: restore to student or leader
        nextRole = user.role.replace('suspended_', '');
        msg = `هل أنت متأكد من تفعيل الحساب وإعادة صلاحيات الدخول لـ ${user.full_name}؟`;
    } else {
        // Suspend
        nextRole = `suspended_${user.role}`;
        msg = `هل أنت متأكد من إيقاف حساب ${user.full_name} ومنعه من الدخول للمنصة؟`;
    }

    const confirmed = await window.showCustomConfirm(
        uStatus === 'suspended' ? "تفعيل الحساب" : "إيقاف الحساب",
        msg,
        null,
        null,
        uStatus === 'suspended' ? 'success' : 'danger'
    );
    if (confirmed) {
        try {
            const { error } = await supabase.from('profiles').update({ role: nextRole }).eq('id', userId);
            if (error) throw error;

            window.showToast("تم تحديث حالة الحساب بنجاح!", "success");
            await window.fetchUsersData();
        } catch (err) {
            console.error("Toggle Suspension Error:", err);
            window.showToast("فشل تحديث حالة الحساب: " + err.message, "error");
        }
    }
};

// ==========================================
// 🔔 NOTIFICATIONS & SHARING ACTIONS
// ==========================================
window.openSendNotificationModal = (userId) => {
    document.getElementById('notif-target-user-id').value = userId;
    document.getElementById('notif-title').value = '';
    document.getElementById('notif-content').value = '';
    document.getElementById('notif-type').value = 'info';

    document.getElementById('send-user-notification-modal').classList.remove('hidden');
};

window.sendUserNotification = async (e) => {
    e.preventDefault();
    const userId = document.getElementById('notif-target-user-id').value;
    const title = document.getElementById('notif-title').value.trim();
    const content = document.getElementById('notif-content').value.trim();
    const type = document.getElementById('notif-type').value;

    const form = document.getElementById('send-user-notification-form');
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
    submitBtn.disabled = true;

    try {
        const { error } = await supabase.from('system_notifications').insert([{
            title: title,
            content: content,
            type: type,
            target_leader_id: userId,
            is_read: false
        }]);

        if (error) throw error;

        window.showToast("تم إرسال الإشعار بنجاح!", "success");
        document.getElementById('send-user-notification-modal').classList.add('hidden');
    } catch (err) {
        console.error("Send Notification Error:", err);
        window.showToast("فشل إرسال الإشعار: " + err.message, "error");
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
};

// Copy profiles URL
window.copyUserProfileLink = (userId) => {
    const link = `${window.location.origin}/pages/profile.html?id=${userId}`;
    
    // Fallback standard copy
    navigator.clipboard.writeText(link).then(() => {
        window.showToast("تم نسخ رابط الملف الشخصي للمستخدم!", "success");
    }).catch(err => {
        console.error("Copy Error:", err);
        window.showToast("فشل النسخ تلقائياً.", "error");
    });
};

// ==========================================
// ❌ DELETE USER ACTION (OWNER ONLY)
// ==========================================
window.deleteUser = async (userId) => {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    const msg = `⚠️ تحذير نهائي: هل أنت متأكد من حذف حساب: ${user.full_name}؟\nسيؤدي هذا إلى مسح سجلات البروفايل الخاص به بالكامل من قاعدة البيانات. لا يمكن التراجع عن هذا الإجراء!`;

    const confirmed = await window.showCustomConfirm(
        "حذف حساب المستخدم نهائياً",
        msg,
        null,
        null,
        'danger'
    );
    if (confirmed) {
        try {
            const { error } = await supabase.from('profiles').delete().eq('id', userId);
            if (error) throw error;

            window.showToast("تم حذف الحساب بنجاح من قاعدة البيانات.", "success");
            await window.fetchUsersData();
        } catch (err) {
            console.error("Delete User Error:", err);
            window.showToast("فشل الحذف: " + err.message, "error");
        }
    }
};
