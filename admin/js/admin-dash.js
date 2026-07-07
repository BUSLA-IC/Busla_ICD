import { supabase } from '../../js/supabase-config.js';
import { initInteractiveRoadmap } from '../../js/roadmap-interactive.js';

// ==========================================
// 🚀 1. GLOBAL STATE & CONFIGURATION
// ==========================================
let currentAdmin = null;
let adminProfile = null;
let allAdmins = [];
let allRoles = [];
let allPermissions = [];
let allTracks = [];
let allPhases = [];
let allCourses = [];
let rolePermissionsMap = {}; // role_id -> Set of permission_id
let adminPermissionsMap = {}; // admin_id -> Set of permission_id
let currentSelectedAdminId = null;

// Dashboard specific state variables
let allUsers = [];
let allTeams = [];
let allTeamRequests = [];
let allSubmissions = [];
let allAppeals = [];
let allAudits = [];
let allCourseMaterials = [];
let allQuizAttempts = [];
let allCompletedMaterials = [];

// Chart instances
let activityChartInst = null;
let distributionChartInst = null;
let currentDistChartType = 'uni'; // 'uni', 'gov', 'track'

const ADMIN_ROLES_LIST = [
    'owner', 'master admin', 'admin', 'leader supervisor', 
    'content manager', 'team reviewer', 'project reviewer', 'support'
];

// ==========================================
// 🚀 2. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    setupTabNavigation();
    setupSubTabNavigation();
    setupEventListeners();
    
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session && session.user) {
            currentAdmin = session.user;
            await initDashboard(currentAdmin.id);
        } else {
            window.location.href = "../../pages/auth.html";
        }

        supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_OUT' || !session) {
                window.location.href = "../../pages/auth.html";
            }
        });
    } catch (err) {
        console.error("Dashboard Init Session Error:", err);
        window.location.href = "../../pages/auth.html";
    }
});

async function initDashboard(uid) {
    try {
        // Fetch Current Admin Profile
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', uid)
            .maybeSingle();

        if (error) throw error;
        if (!profile) {
            showToast("لم يتم العثور على ملف تعريف المستخدم", "error");
            window.location.href = "../../pages/auth.html";
            return;
        }

        adminProfile = profile;
        const roleLower = (adminProfile.role || '').toLowerCase().trim();

        // Check dynamic database admin roles
        const { data: dbRoles } = await supabase.from('admin_roles').select('name');
        const dbAdminRoles = (dbRoles || []).map(r => String(r.name).toLowerCase().trim());
        
        const isAuthorizedAdmin = ADMIN_ROLES_LIST.includes(roleLower) || dbAdminRoles.includes(roleLower);

        if (!isAuthorizedAdmin) {
            showToast("غير مصرح لك بالدخول إلى لوحة التحكم", "error");
            setTimeout(() => window.location.href = "../../pages/auth.html", 2000);
            return;
        }

        // Update UI Header details
        document.getElementById('admin-user-name').innerText = adminProfile.full_name || adminProfile.email;
        document.getElementById('admin-user-role').innerText = adminProfile.role;
        if (adminProfile.avatar_url) {
            document.getElementById('admin-user-avatar').src = adminProfile.avatar_url;
        }

        // Show/Hide Owner specific tools
        if (roleLower === 'owner') {
            document.getElementById('btn-clear-logs')?.classList.remove('hidden');
        }

        // Track Login Activity
        await updateAdminActivity('login');

        // Load Dashboard Data
        await loadAllData();

        // Re-apply permission visibility
        updateAdminUI();

        // Click first tab
        const firstTab = document.querySelector('.nav-btn[data-target="dashboard"]');
        if (firstTab) {
            firstTab.click();
        }

    } catch (err) {
        console.error("Dashboard Loading Error:", err);
        showToast("حدث خطأ أثناء تحميل لوحة التحكم", "error");
    }
}

// ==========================================
// 🚀 3. DATA LAYER (SUPABASE QUERIES)
// ==========================================
async function loadAllData() {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

        // Parallel fetch for speed
        const [
            rolesRes,
            permsRes,
            tracksRes,
            phasesRes,
            coursesRes,
            rolePermsRes,
            adminPermsRes,
            profilesRes,
            teamsRes,
            teamRequestsRes,
            submissionsRes,
            appealsRes,
            auditsRes,
            courseMaterialsRes,
            quizAttemptsRes,
            completedMaterialsRes
        ] = await Promise.all([
            supabase.from('admin_roles').select('*').order('name'),
            supabase.from('permissions').select('*'),
            supabase.from('tracks').select('*').order('name'),
            supabase.from('phases').select('*'),
            supabase.from('courses').select('*'),
            supabase.from('role_permissions').select('*'),
            supabase.from('admin_permissions').select('*'),
            supabase.from('profiles').select('*'),
            supabase.from('teams').select('*'),
            supabase.from('team_requests').select('*'),
            supabase.from('project_submissions').select('*'),
            supabase.from('project_appeals').select('*'),
            supabase.from('project_audits').select('*'),
            supabase.from('course_materials').select('*').order('order_index'),
            supabase.from('quiz_attempts').select('submitted_at, quiz_id').gte('submitted_at', thirtyDaysAgoISO),
            supabase.from('completed_materials').select('completed_at, material_id').gte('completed_at', thirtyDaysAgoISO)
        ]);

        if (rolesRes.error) throw rolesRes.error;
        if (permsRes.error) throw permsRes.error;
        if (tracksRes.error) throw tracksRes.error;
        if (phasesRes.error) throw phasesRes.error;
        if (coursesRes.error) throw coursesRes.error;
        if (rolePermsRes.error) throw rolePermsRes.error;
        if (adminPermsRes.error) throw adminPermsRes.error;
        if (profilesRes.error) throw profilesRes.error;
        if (teamsRes.error) throw teamsRes.error;
        if (teamRequestsRes.error) throw teamRequestsRes.error;
        if (submissionsRes.error) throw submissionsRes.error;
        if (appealsRes.error) throw appealsRes.error;
        if (auditsRes.error) throw auditsRes.error;
        if (courseMaterialsRes.error) throw courseMaterialsRes.error;
        if (quizAttemptsRes.error) throw quizAttemptsRes.error;
        if (completedMaterialsRes.error) throw completedMaterialsRes.error;

        allRoles = rolesRes.data || [];
        allPermissions = permsRes.data || [];
        allTracks = tracksRes.data || [];
        allPhases = phasesRes.data || [];
        allCourses = coursesRes.data || [];
        allTeams = teamsRes.data || [];
        allTeamRequests = teamRequestsRes.data || [];
        allSubmissions = submissionsRes.data || [];
        allAppeals = appealsRes.data || [];
        allAudits = auditsRes.data || [];
        allCourseMaterials = courseMaterialsRes.data || [];
        allQuizAttempts = quizAttemptsRes.data || [];
        allCompletedMaterials = completedMaterialsRes.data || [];
        allUsers = profilesRes.data || [];

        // Map default role permissions
        rolePermissionsMap = {};
        allRoles.forEach(r => rolePermissionsMap[r.id] = new Set());
        (rolePermsRes.data || []).forEach(rp => {
            if (rolePermissionsMap[rp.role_id]) {
                rolePermissionsMap[rp.role_id].add(rp.permission_id);
            }
        });

        // Map custom admin permissions
        adminPermissionsMap = {};
        (adminPermsRes.data || []).forEach(ap => {
            if (!adminPermissionsMap[ap.admin_id]) {
                adminPermissionsMap[ap.admin_id] = new Set();
            }
            adminPermissionsMap[ap.admin_id].add(ap.permission_id);
        });

        // Filter administrators from profiles
        const dbAdminRolesList = (rolesRes.data || []).map(r => String(r.name).toLowerCase().trim());
        allAdmins = (profilesRes.data || []).filter(p => {
            const r = String(p.role || '').toLowerCase().trim();
            return ADMIN_ROLES_LIST.includes(r) || dbAdminRolesList.includes(r);
        });

        // Update count badges
        updateCountBadges();

        // Render Views
        renderAdminAccounts();
        renderRoles();
        renderPermissionsCatalog('Dashboard');
        renderAuditLogs();

        // Populate filter options
        populateFilterDropdowns();

        // Render Dashboard Mission Control
        await renderDashboardOverview();

        // Re-apply permission visibility
        updateAdminUI();

    } catch (err) {
        console.error("Load All Data Error:", err);
        showToast("فشل تحميل البيانات من السيرفر", "error");
    }
}

// ==========================================
// 🚀 4. UI RENDERERS
// ==========================================
function updateCountBadges() {
    const adminCountEl = document.getElementById('badge-admin-count');
    const rolesCountEl = document.getElementById('badge-roles-count');
    const permsCountEl = document.getElementById('badge-perms-count');

    if (adminCountEl) adminCountEl.innerText = allAdmins.length;
    if (rolesCountEl) rolesCountEl.innerText = allRoles.length;
    if (permsCountEl) permsCountEl.innerText = allPermissions.filter(p => !p.id.includes(':track')).length;
}

function populateFilterDropdowns() {
    const roleFilter = document.getElementById('admin-role-filter');
    const editAdminRole = document.getElementById('edit-admin-role');
    const addAdminRole = document.getElementById('add-admin-role');
    
    if (roleFilter && editAdminRole && addAdminRole) {
        const optionsHTML = allRoles.map(r => `<option value="${r.name}">${r.name}</option>`).join('');
        roleFilter.innerHTML = '<option value="all">كل الأدوار</option>' + optionsHTML;
        editAdminRole.innerHTML = optionsHTML;
        addAdminRole.innerHTML = optionsHTML;
    }
}

// Tab 1: Render Admin Accounts Table
function renderAdminAccounts() {
    const tbody = document.getElementById('admins-table-body');
    if (!tbody) return;

    const searchQuery = document.getElementById('admin-search')?.value.toLowerCase() || '';
    const roleFilter = document.getElementById('admin-role-filter')?.value || 'all';
    const statusFilter = document.getElementById('admin-status-filter')?.value || 'all';

    const filteredAdmins = allAdmins.filter(admin => {
        const matchesSearch = (admin.full_name || '').toLowerCase().includes(searchQuery) ||
                              (admin.email || '').toLowerCase().includes(searchQuery);
        const matchesRole = roleFilter === 'all' || admin.role === roleFilter;
        const matchesStatus = statusFilter === 'all' || admin.status === statusFilter;
        
        return matchesSearch && matchesRole && matchesStatus;
    });

    if (filteredAdmins.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-gray-500">لا توجد حسابات إدارة مطابقة للفلتر.</td></tr>`;
        return;
    }

    tbody.innerHTML = filteredAdmins.map(admin => {
        const avatarUrl = admin.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(admin.full_name || 'Admin')}&background=006A67&color=fff&size=100`;
        const lastLogin = admin.last_login ? new Date(admin.last_login).toLocaleString('ar-EG') : 'لم يدخل بعد';
        const lastActivity = admin.last_activity ? new Date(admin.last_activity).toLocaleString('ar-EG') : 'لا يوجد نشاط';
        
        // Count total permissions
        const customCount = adminPermissionsMap[admin.id] ? adminPermissionsMap[admin.id].size : 0;
        const roleRecord = allRoles.find(r => r.name === admin.role);
        const defaultCount = roleRecord && rolePermissionsMap[roleRecord.id] ? rolePermissionsMap[roleRecord.id].size : 0;
        const permsCount = customCount > 0 ? customCount : defaultCount;

        const isOwner = (adminProfile.role || '').toLowerCase() === 'owner';
        const isTargetOwner = (admin.role || '').toLowerCase() === 'owner';

        let statusClass = 'bg-green-500/10 text-green-400 border-green-500/20';
        let statusText = 'نشط';
        if (admin.status === 'disabled') {
            statusClass = 'bg-red-500/10 text-red-400 border-red-500/20';
            statusText = 'معطل';
        }

        // Build Actions
        let actionButtons = `
            <button onclick="viewAdminDetails('${admin.id}')" class="text-teal-400 hover:text-teal-300 p-1 title="عرض التفاصيل"><i class="fas fa-eye"></i></button>
            <button onclick="openEditAdminModal('${admin.id}')" class="text-blue-400 hover:text-blue-300 p-1" title="تعديل"><i class="fas fa-edit"></i></button>
            <button onclick="openPermissionsDrawer('${admin.id}')" class="text-yellow-500 hover:text-yellow-400 p-1" title="إدارة الصلاحيات"><i class="fas fa-key"></i></button>
        `;

        if (admin.status === 'disabled') {
            actionButtons += `<button onclick="toggleAdminStatus('${admin.id}', 'active')" class="text-green-500 hover:text-green-400 p-1" title="تفعيل الحساب"><i class="fas fa-user-check"></i></button>`;
        } else {
            actionButtons += `<button onclick="toggleAdminStatus('${admin.id}', 'disabled')" class="text-orange-500 hover:text-orange-400 p-1" title="تعطيل الحساب"><i class="fas fa-user-slash"></i></button>`;
        }

        if (isOwner && !isTargetOwner) {
            actionButtons += `<button onclick="deleteAdminAccount('${admin.id}')" class="text-red-500 hover:text-red-400 p-1" title="حذف الحساب"><i class="fas fa-trash-can"></i></button>`;
        }

        return `
            <tr class="hover:bg-white/5 border-b border-white/5 transition-colors">
                <td class="p-4 flex items-center gap-3">
                    <img src="${avatarUrl}" class="w-9 h-9 rounded-full object-cover border border-white/10">
                    <span class="font-bold text-white">${admin.full_name || 'بلا اسم'}</span>
                </td>
                <td class="p-4 text-gray-300 font-mono text-xs">${admin.email}</td>
                <td class="p-4"><span class="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs px-2.5 py-1 rounded-full font-bold">${admin.role}</span></td>
                <td class="p-4 text-center font-mono font-bold text-teal-400">${permsCount}</td>
                <td class="p-4 text-xs text-gray-400">${lastLogin}</td>
                <td class="p-4 text-xs text-gray-400">${lastActivity}</td>
                <td class="p-4"><span class="border text-[10px] font-bold px-2 py-0.5 rounded-md ${statusClass}">${statusText}</span></td>
                <td class="p-4 text-left"><div class="flex items-center justify-end gap-2.5">${actionButtons}</div></td>
            </tr>
        `;
    }).join('');
}

// Tab 2: Render Roles Grid
function renderRoles() {
    const container = document.getElementById('roles-grid');
    if (!container) return;

    container.innerHTML = allRoles.map(role => {
        const permsCount = rolePermissionsMap[role.id] ? rolePermissionsMap[role.id].size : 0;
        const isProtected = ['Owner', 'Master Admin', 'Admin'].includes(role.name);

        let deleteBtn = '';
        if (!isProtected && (adminProfile.role || '').toLowerCase() === 'owner') {
            deleteBtn = `<button onclick="deleteRole('${role.id}')" class="text-red-400 hover:text-red-300 border border-red-500/20 bg-red-500/5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"><i class="fas fa-trash"></i> حذف</button>`;
        }

        return `
            <div class="bg-b-surface border border-white/10 rounded-2xl p-5 hover:border-purple-500/30 transition-all flex flex-col justify-between">
                <div>
                    <div class="flex justify-between items-start mb-3">
                        <h4 class="text-lg font-black text-white">${role.name}</h4>
                        <span class="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold">${permsCount} صلاحية افتراضية</span>
                    </div>
                    <p class="text-xs text-gray-400 leading-relaxed mb-6">${role.description || 'لا يوجد وصف لهذا الدور.'}</p>
                </div>
                <div class="flex gap-2 justify-end border-t border-white/5 pt-4">
                    ${deleteBtn}
                    <button onclick="openEditRoleModal('${role.id}')" class="text-purple-400 hover:text-purple-300 border border-purple-500/20 bg-purple-500/5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"><i class="fas fa-edit"></i> تعديل الصلاحيات</button>
                </div>
            </div>
        `;
    }).join('');
}

// Tab 3: Render Permissions Catalog
function renderPermissionsCatalog(category) {
    const listContainer = document.getElementById('permissions-list-container');
    const badge = document.getElementById('current-perm-group-badge');
    const title = document.getElementById('current-perm-group-title');
    const dynamicTracks = document.getElementById('dynamic-track-structure');

    if (!listContainer) return;

    title.innerText = category;
    
    // Fetch static permissions for this category
    const catPerms = allPermissions.filter(p => p.category === category && !p.id.includes(':track'));
    badge.innerText = `${catPerms.length} صلاحية`;

    listContainer.innerHTML = catPerms.map(p => `
        <div class="bg-black/40 border border-white/5 rounded-xl p-4 flex justify-between items-start">
            <div>
                <span class="font-mono text-teal-400 text-xs font-bold bg-teal-500/5 px-2 py-0.5 rounded-md border border-teal-500/10">${p.id}</span>
                <h4 class="text-sm font-bold text-white mt-2">${p.name}</h4>
            </div>
            <p class="text-xs text-gray-400 text-left max-w-sm">${p.description || 'لا يوجد وصف تفصيلي.'}</p>
        </div>
    `).join('');

    // Toggle track tree visibility
    if (category === 'Content') {
        dynamicTracks.classList.remove('hidden');
        renderGlobalTrackTree();
    } else {
        dynamicTracks.classList.add('hidden');
    }
}

// Tab 3: Render Dynamic Global Track Tree
function renderGlobalTrackTree() {
    const container = document.getElementById('global-track-tree');
    if (!container) return;

    container.innerHTML = allTracks.map(track => {
        const trackPhases = allPhases.filter(p => p.track_id === track.id);
        
        let phasesHTML = '';
        if (trackPhases.length === 0) {
            phasesHTML = `<p class="text-xs text-gray-500 pr-6 py-2">لا توجد مراحل مسجلة في هذا المسار حالياً.</p>`;
        } else {
            phasesHTML = trackPhases.map(phase => {
                const phaseCourses = allCourses.filter(c => c.phase_id === phase.phase_id);
                
                let coursesHTML = '';
                if (phaseCourses.length === 0) {
                    coursesHTML = `<p class="text-xs text-gray-500 pr-8 py-2">لا توجد كورسات في هذه المرحلة.</p>`;
                } else {
                    coursesHTML = phaseCourses.map(course => {
                        return `
                            <div class="tree-line pr-8 py-2">
                                <div class="flex items-center gap-2 mb-2">
                                    <i class="fas fa-book text-yellow-500/80 text-xs"></i>
                                    <span class="text-xs font-bold text-gray-300">${course.title}</span>
                                </div>
                                <div class="grid grid-cols-2 md:grid-cols-3 gap-2 pr-6">
                                    <span class="text-[10px] text-gray-400 bg-white/5 border border-white/5 rounded-md px-2 py-1 flex items-center gap-1.5"><i class="fas fa-edit text-blue-400"></i> تعديل الكورس</span>
                                    <span class="text-[10px] text-gray-400 bg-white/5 border border-white/5 rounded-md px-2 py-1 flex items-center gap-1.5"><i class="fas fa-video-slash text-purple-400"></i> إضافة/تعديل فيديوهات</span>
                                    <span class="text-[10px] text-gray-400 bg-white/5 border border-white/5 rounded-md px-2 py-1 flex items-center gap-1.5"><i class="fas fa-clipboard-question text-emerald-400"></i> إدارة الكويزات</span>
                                    <span class="text-[10px] text-gray-400 bg-white/5 border border-white/5 rounded-md px-2 py-1 flex items-center gap-1.5"><i class="fas fa-laptop-code text-orange-400"></i> إدارة المشاريع</span>
                                </div>
                            </div>
                        `;
                    }).join('');
                }

                return `
                    <div class="tree-line pr-6 py-2">
                        <div class="flex items-center gap-2 mb-2">
                            <i class="fas fa-folder text-purple-400/80 text-xs"></i>
                            <span class="text-xs font-bold text-gray-200">${phase.title}</span>
                        </div>
                        <div class="border-r border-white/5 mr-2 pr-2">
                            ${coursesHTML}
                        </div>
                    </div>
                `;
            }).join('');
        }

        return `
            <div class="bg-black/50 border border-white/5 rounded-xl p-4">
                <div class="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
                    <span class="text-sm font-bold text-white flex items-center gap-2">
                        <i class="fas fa-graduation-cap text-teal-400"></i> ${track.name}
                    </span>
                    <span class="text-[10px] bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded-full font-mono">Dynamic Node</span>
                </div>
                <div class="border-r border-white/5 mr-2 pr-2">
                    ${phasesHTML}
                </div>
            </div>
        `;
    }).join('');
}

// Tab 4: Render Audit Logs
async function renderAuditLogs() {
    const tbody = document.getElementById('logs-table-body');
    if (!tbody) return;

    try {
        const adminFilter = document.getElementById('log-admin-filter').value;
        const actionFilter = document.getElementById('log-action-filter').value;

        let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(50);
        
        if (adminFilter !== 'all') {
            query = query.eq('admin_id', adminFilter);
        }
        if (actionFilter !== 'all') {
            query = query.eq('action', actionFilter);
        }

        const { data: logs, error } = await query;
        if (error) throw error;

        // Build admin options list for filter dropdown once
        const logAdminSelect = document.getElementById('log-admin-filter');
        if (logAdminSelect && logAdminSelect.options.length <= 1) {
            const adminOptions = allAdmins.map(a => `<option value="${a.id}">${a.full_name || a.email}</option>`).join('');
            logAdminSelect.innerHTML = '<option value="all">كل الأدمنز</option>' + adminOptions;
            if (adminFilter !== 'all') logAdminSelect.value = adminFilter;
        }

        const logsCountEl = document.getElementById('badge-logs-count');
        if (logsCountEl) logsCountEl.innerText = logs.length;

        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500">سجل العمليات فارغ حالياً.</td></tr>`;
            return;
        }

        tbody.innerHTML = logs.map(log => {
            const date = new Date(log.created_at).toLocaleString('ar-EG');
            return `
                <tr class="hover:bg-white/5 border-b border-white/5 transition-colors text-xs">
                    <td class="p-4 font-bold text-white">${log.admin_name || 'أدمن غير معروف'}</td>
                    <td class="p-4"><span class="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded font-bold">${log.action}</span></td>
                    <td class="p-4 text-gray-300 font-bold">${log.target || '---'}</td>
                    <td class="p-4 text-gray-400 max-w-xs truncate" title="${log.details || ''}">${log.details || '---'}</td>
                    <td class="p-4 text-gray-400 font-mono">${date}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Fetch Audit Logs Error:", err);
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500">حدث خطأ أثناء تحميل سجل العمليات.</td></tr>`;
    }
}

// ==========================================
// 🚀 5. PERMISSIONS DRAWER ENGINE
// ==========================================
window.openPermissionsDrawer = async (adminId) => {
    currentSelectedAdminId = adminId;
    const admin = allAdmins.find(a => a.id === adminId);
    if (!admin) return;

    // Fill Drawer Profile Details
    document.getElementById('drawer-admin-name').innerText = admin.full_name || 'بلا اسم';
    document.getElementById('drawer-admin-email').innerText = admin.email;
    document.getElementById('drawer-admin-role').innerText = admin.role;
    
    const avatarUrl = admin.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(admin.full_name || 'Admin')}&background=006A67&color=fff&size=100`;
    document.getElementById('drawer-avatar').src = avatarUrl;

    // Get active permissions for admin
    let activePerms = new Set();
    if (adminPermissionsMap[adminId] && adminPermissionsMap[adminId].size > 0) {
        // Has customized permissions
        activePerms = adminPermissionsMap[adminId];
    } else {
        // Fall back to default Role permissions
        const roleRecord = allRoles.find(r => r.name === admin.role);
        if (roleRecord && rolePermissionsMap[roleRecord.id]) {
            activePerms = rolePermissionsMap[roleRecord.id];
        }
    }

    // Build Accordion Categories
    const categories = ['Dashboard', 'Users', 'Leaders', 'Teams', 'Content', 'Reviews', 'Notifications', 'Reports', 'Settings'];
    const accordion = document.getElementById('drawer-accordion');
    
    accordion.innerHTML = categories.map((cat, idx) => {
        const catPerms = allPermissions.filter(p => p.category === cat && !p.id.includes(':track'));
        
        let insideContentHTML = '';
        if (cat === 'Content') {
            insideContentHTML = renderDrawerContentTree(activePerms);
        } else {
            insideContentHTML = catPerms.map(p => {
                const checked = activePerms.has(p.id) ? 'checked' : '';
                return `
                    <label class="flex items-start gap-3 p-3 bg-black/30 border border-white/5 rounded-xl hover:border-teal-500/30 transition-all cursor-pointer">
                        <input type="checkbox" data-perm="${p.id}" ${checked} class="mt-1 accent-teal-500 rounded">
                        <div>
                            <span class="text-xs font-bold text-white block">${p.name}</span>
                            <span class="text-[10px] text-gray-400 mt-0.5 block leading-normal">${p.description || ''}</span>
                        </div>
                    </label>
                `;
            }).join('');
        }

        return `
            <div class="border border-white/10 rounded-xl bg-black/40 overflow-hidden">
                <button onclick="toggleAccordion(this)" class="w-full flex items-center justify-between p-4 text-right font-bold text-sm text-gray-200 hover:bg-white/5 transition-all">
                    <span>${cat}</span>
                    <i class="fas fa-chevron-down text-xs transition-transform duration-300"></i>
                </button>
                <div class="accordion-content hidden border-t border-white/5 bg-[#141414] p-4 space-y-3 max-h-96 overflow-y-auto custom-scroll">
                    ${insideContentHTML}
                </div>
            </div>
        `;
    }).join('');

    // Open Drawer UI
    const drawer = document.getElementById('permissions-drawer');
    const overlay = document.getElementById('drawer-overlay');
    const panel = document.getElementById('drawer-panel');

    drawer.classList.remove('hidden');
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        panel.classList.remove('translate-x-full');
    }, 50);
};

// Render content permissions and dynamic track trees inside drawer
function renderDrawerContentTree(activePerms) {
    // 1. Render generic Content permissions
    const genericContentPerms = allPermissions.filter(p => p.category === 'Content' && !p.id.includes(':track'));
    let html = `
        <div class="grid grid-cols-2 gap-3 mb-4 border-b border-white/5 pb-4">
            ${genericContentPerms.map(p => {
                const checked = activePerms.has(p.id) ? 'checked' : '';
                return `
                    <label class="flex items-start gap-2.5 p-2 bg-black/40 border border-white/5 rounded-lg cursor-pointer">
                        <input type="checkbox" data-perm="${p.id}" ${checked} class="mt-0.5 accent-teal-500 rounded">
                        <span class="text-xs font-bold text-gray-200">${p.name}</span>
                    </label>
                `;
            }).join('')}
        </div>
        <h4 class="text-xs font-black text-gray-400 uppercase mb-3">Track Access & Granular Permissions</h4>
    `;

    // 2. Render dynamic tracks tree
    html += allTracks.map(track => {
        const trackChecked = activePerms.has(`content:track:${track.id}`) ? 'checked' : '';
        const trackPhases = allPhases.filter(p => p.track_id === track.id);
        
        let phasesHTML = '';
        if (trackPhases.length > 0) {
            phasesHTML = trackPhases.map(phase => {
                const phaseChecked = activePerms.has(`content:track:${track.id}:phase:${phase.phase_id}`) ? 'checked' : '';
                const phaseCourses = allCourses.filter(c => c.phase_id === phase.phase_id);
                
                let coursesHTML = '';
                if (phaseCourses.length > 0) {
                    coursesHTML = phaseCourses.map(course => {
                        const courseChecked = activePerms.has(`content:track:${track.id}:course:${course.course_id}`) ? 'checked' : '';
                        
                        // Course sub-permissions checklist
                        const subActions = [
                            { sub: 'video:create', label: 'إضافة فيديو' },
                            { sub: 'video:edit', label: 'تعديل فيديو' },
                            { sub: 'video:delete', label: 'حذف فيديو' },
                            { sub: 'quiz:edit', label: 'تعديل كويز' },
                            { sub: 'quiz:delete', label: 'حذف كويز' },
                            { sub: 'project:edit', label: 'تعديل مشروع' }
                        ];

                        const subHTML = subActions.map(act => {
                            const actChecked = activePerms.has(`content:track:${track.id}:course:${course.course_id}:${act.sub}`) ? 'checked' : '';
                            return `
                                <label class="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" data-perm="content:track:${track.id}:course:${course.course_id}:${act.sub}" ${actChecked} class="accent-teal-500 rounded w-3.5 h-3.5">
                                    <span class="text-[10px] text-gray-400 hover:text-white transition-colors">${act.label}</span>
                                </label>
                            `;
                        }).join('');

                        return `
                            <div class="tree-line pr-8 py-2">
                                <label class="flex items-center gap-2 mb-2 cursor-pointer">
                                    <input type="checkbox" data-perm="content:track:${track.id}:course:${course.course_id}" ${courseChecked} onchange="toggleTreeChildren(this)" class="accent-teal-500 rounded w-4 h-4">
                                    <span class="text-xs font-bold text-gray-300">${course.title}</span>
                                </label>
                                <div class="grid grid-cols-2 gap-2 pr-6 border-r border-white/5">
                                    ${subHTML}
                                </div>
                            </div>
                        `;
                    }).join('');
                }

                return `
                    <div class="tree-line pr-6 py-2">
                        <label class="flex items-center gap-2 mb-1.5 cursor-pointer">
                            <input type="checkbox" data-perm="content:track:${track.id}:phase:${phase.phase_id}" ${phaseChecked} onchange="toggleTreeChildren(this)" class="accent-teal-500 rounded w-4 h-4">
                            <span class="text-xs font-bold text-gray-200">${phase.title}</span>
                        </label>
                        <div class="border-r border-white/5 mr-2 pr-2">
                            ${coursesHTML}
                        </div>
                    </div>
                `;
            }).join('');
        }

        return `
            <div class="bg-black/30 border border-white/5 rounded-xl p-3.5 mb-3">
                <label class="flex items-center justify-between border-b border-white/5 pb-2 mb-2 cursor-pointer">
                    <div class="flex items-center gap-2">
                        <input type="checkbox" data-perm="content:track:${track.id}" ${trackChecked} onchange="toggleTreeChildren(this)" class="accent-teal-500 rounded w-4.5 h-4.5">
                        <span class="text-sm font-bold text-white">${track.name}</span>
                    </div>
                    <span class="text-[9px] bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded-full font-mono">Track</span>
                </label>
                <div class="border-r border-white/5 mr-2 pr-2">
                    ${phasesHTML}
                </div>
            </div>
        `;
    }).join('');

    return html;
}

window.toggleAccordion = (btn) => {
    const content = btn.nextElementSibling;
    const icon = btn.querySelector('i');
    
    content.classList.toggle('hidden');
    icon.classList.toggle('rotate-180');
};

// Help toggle all descendant checkboxes automatically in the Drawer
window.toggleTreeChildren = (parentCheckbox) => {
    const parentContainer = parentCheckbox.closest('.tree-line, div.bg-black\\/30');
    if (!parentContainer) return;
    
    const childCheckboxes = parentContainer.querySelectorAll('div input[type="checkbox"]');
    childCheckboxes.forEach(cb => {
        cb.checked = parentCheckbox.checked;
    });
};

function closePermissionsDrawer() {
    const overlay = document.getElementById('drawer-overlay');
    const panel = document.getElementById('drawer-panel');
    const drawer = document.getElementById('permissions-drawer');

    overlay.classList.add('opacity-0');
    panel.classList.add('translate-x-full');
    setTimeout(() => {
        drawer.classList.add('hidden');
        currentSelectedAdminId = null;
    }, 300);
}

// ==========================================
// 🚀 6. MODAL UTILITIES
// ==========================================
window.openModal = (modalId) => {
    document.getElementById(modalId)?.classList.remove('hidden');
};

window.closeModal = (modalId) => {
    document.getElementById(modalId)?.classList.add('hidden');
};

// View Admin Profile Details
window.viewAdminDetails = (adminId) => {
    const admin = allAdmins.find(a => a.id === adminId);
    if (!admin) return;

    document.getElementById('detail-name').innerText = admin.full_name || 'بلا اسم';
    document.getElementById('detail-email').innerText = admin.email;
    document.getElementById('detail-role').innerText = admin.role;
    document.getElementById('detail-university').innerText = admin.university || '---';
    document.getElementById('detail-faculty').innerText = admin.faculty || '---';
    document.getElementById('detail-acad-year').innerText = admin.academic_year || '---';
    document.getElementById('detail-dept').innerText = admin.department || '---';
    document.getElementById('detail-xp').innerText = admin.total_xp ?? '0';
    document.getElementById('detail-rank').innerText = admin.current_rank || 'Newbie';
    
    const avatarUrl = admin.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(admin.full_name || 'Admin')}&background=006A67&color=fff&size=100`;
    document.getElementById('detail-avatar').src = avatarUrl;

    openModal('view-details-modal');
};

// Edit Admin Account (Modal)
window.openEditAdminModal = (adminId) => {
    const admin = allAdmins.find(a => a.id === adminId);
    if (!admin) return;

    document.getElementById('edit-admin-id').value = admin.id;
    document.getElementById('edit-admin-name').value = admin.full_name || '';
    document.getElementById('edit-admin-email').value = admin.email || '';
    document.getElementById('edit-admin-role').value = admin.role;
    document.getElementById('edit-admin-status').value = admin.status || 'active';

    openModal('edit-admin-modal');
};

// Edit Role Modal
window.openEditRoleModal = (roleId) => {
    const role = allRoles.find(r => r.id === roleId);
    if (!role) return;

    document.getElementById('role-editor-id').value = role.id;
    document.getElementById('role-editor-name').value = role.name;
    document.getElementById('role-editor-name').disabled = true; // Protect system names
    document.getElementById('role-editor-desc').value = role.description || '';
    document.getElementById('role-modal-title').innerHTML = `<i class="fas fa-shield-halved text-purple-400 mr-2"></i> تعديل صلاحيات دور (${role.name})`;

    // Check checklist of default permissions
    const checklist = document.getElementById('role-perms-checklist');
    const activePerms = rolePermissionsMap[role.id] || new Set();

    checklist.innerHTML = allPermissions.filter(p => !p.id.includes(':track')).map(p => {
        const checked = activePerms.has(p.id) ? 'checked' : '';
        return `
            <label class="flex items-center gap-2 p-2 bg-black/40 border border-white/5 rounded-lg cursor-pointer">
                <input type="checkbox" value="${p.id}" ${checked} class="accent-purple-500 rounded">
                <span class="text-xs text-gray-300 font-bold">${p.name}</span>
            </label>
        `;
    }).join('');

    openModal('role-editor-modal');
};

// Create Role Modal
window.openCreateRoleModal = () => {
    document.getElementById('role-editor-id').value = '';
    document.getElementById('role-editor-name').value = '';
    document.getElementById('role-editor-name').disabled = false;
    document.getElementById('role-editor-desc').value = '';
    document.getElementById('role-modal-title').innerHTML = `<i class="fas fa-plus text-purple-400 mr-2"></i> إنشاء دور جديد (Role)`;

    const checklist = document.getElementById('role-perms-checklist');
    checklist.innerHTML = allPermissions.filter(p => !p.id.includes(':track')).map(p => {
        return `
            <label class="flex items-center gap-2 p-2 bg-black/40 border border-white/5 rounded-lg cursor-pointer">
                <input type="checkbox" value="${p.id}" class="accent-purple-500 rounded">
                <span class="text-xs text-gray-300 font-bold">${p.name}</span>
            </label>
        `;
    }).join('');

    openModal('role-editor-modal');
};

// ==========================================
// 🚀 7. CONTROLLERS & DATA UPDATES
// ==========================================

// Save Admin Customized Permissions (Drawer)
async function saveAdminPermissions() {
    if (!currentSelectedAdminId) return;
    
    const btn = document.getElementById('btn-save-permissions');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    btn.disabled = true;

    try {
        const admin = allAdmins.find(a => a.id === currentSelectedAdminId);
        if (!admin) throw new Error("Admin profile not found");

        const checkboxes = document.querySelectorAll('#drawer-accordion input[type="checkbox"]:checked');
        const selectedPermIds = Array.from(checkboxes).map(cb => cb.getAttribute('data-perm'));

        // 1. Upsert dynamic track permissions into 'permissions' table to avoid FK violations
        const dynamicPerms = selectedPermIds.filter(id => id.includes(':track'));
        if (dynamicPerms.length > 0) {
            // Build dynamic metadata objects
            const newPermRows = dynamicPerms.map(id => {
                let name = 'مسار مخصص';
                if (id.includes(':course:')) {
                    const cId = id.split(':course:')[1].split(':')[0];
                    const course = allCourses.find(c => c.course_id === cId);
                    const subAction = id.split(':course:')[1].split(':')[1] || '';
                    name = `مسار: ${course ? course.title : cId} (${subAction || 'تعديل'})`;
                } else if (id.includes(':phase:')) {
                    const pId = id.split(':phase:')[1];
                    const phase = allPhases.find(p => p.phase_id === pId);
                    name = `مرحلة: ${phase ? phase.title : pId}`;
                } else {
                    const tId = id.split(':track:')[1];
                    const track = allTracks.find(t => t.id === tId);
                    name = `مسار: ${track ? track.name : tId}`;
                }

                return {
                    id,
                    name,
                    category: 'Content',
                    description: `صلاحية ديناميكية للمحتوى: ${name}`
                };
            });

            const { error: upsertErr } = await supabase.from('permissions').upsert(newPermRows, { onConflict: 'id' });
            if (upsertErr) throw upsertErr;
        }

        // 2. Delete old admin permissions
        const { error: deleteErr } = await supabase
            .from('admin_permissions')
            .delete()
            .eq('admin_id', currentSelectedAdminId);

        if (deleteErr) throw deleteErr;

        // 3. Insert new custom permissions
        if (selectedPermIds.length > 0) {
            const insertRows = selectedPermIds.map(permId => ({
                admin_id: currentSelectedAdminId,
                permission_id: permId
            }));

            const { error: insertErr } = await supabase.from('admin_permissions').insert(insertRows);
            if (insertErr) throw insertErr;
        }

        // 4. Log Audit Trail
        await logAdminAction(
            currentAdmin.id,
            adminProfile.full_name || adminProfile.email,
            'Edit Admin Permissions',
            admin.full_name || admin.email,
            `تعديل صلاحيات الأدمن. الصلاحيات الجديدة: ${selectedPermIds.length} صلاحية.`
        );

        showToast("تم تحديث الصلاحيات بنجاح", "success");
        closePermissionsDrawer();
        await loadAllData();

    } catch (err) {
        console.error("Save Permissions Error:", err);
        showToast("فشل حفظ وتحديث الصلاحيات", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Edit Admin Account Details
async function handleEditAdminSubmit(e) {
    e.preventDefault();
    const adminId = document.getElementById('edit-admin-id').value;
    const name = document.getElementById('edit-admin-name').value;
    const email = document.getElementById('edit-admin-email').value;
    const role = document.getElementById('edit-admin-role').value;
    const status = document.getElementById('edit-admin-status').value;

    try {
        const { error } = await supabase
            .from('profiles')
            .update({ full_name: name, email, role, status })
            .eq('id', adminId);

        if (error) throw error;

        await logAdminAction(
            currentAdmin.id,
            adminProfile.full_name || adminProfile.email,
            'Edit Admin Profile',
            name,
            `تعديل البيانات الأساسية للأدمن. الدور: ${role}، الحالة: ${status}`
        );

        showToast("تم تعديل بيانات الأدمن بنجاح", "success");
        closeModal('edit-admin-modal');
        await loadAllData();

    } catch (err) {
        console.error("Edit Admin Error:", err);
        showToast("فشل تحديث بيانات الحساب", "error");
    }
}

// Enable or Disable Admin Account
window.toggleAdminStatus = async (adminId, status) => {
    const admin = allAdmins.find(a => a.id === adminId);
    if (!admin) return;

    if (adminId === currentAdmin.id) {
        showToast("لا يمكنك تعطيل حسابك الشخصي", "warning");
        return;
    }

    try {
        const { error } = await supabase
            .from('profiles')
            .update({ status })
            .eq('id', adminId);

        if (error) throw error;

        const actionText = status === 'active' ? 'Enable Admin' : 'Disable Admin';
        const detailText = status === 'active' ? 'إعادة تفعيل وتنشيط الحساب' : 'تعطيل وتجميد الحساب الإداري';

        await logAdminAction(
            currentAdmin.id,
            adminProfile.full_name || adminProfile.email,
            actionText,
            admin.full_name || admin.email,
            detailText
        );

        showToast(`تم ${status === 'active' ? 'تفعيل' : 'تعطيل'} الحساب الإداري بنجاح`, "success");
        await loadAllData();

    } catch (err) {
        console.error("Toggle Admin Status Error:", err);
        showToast("فشل تغيير حالة الحساب", "error");
    }
};

// Delete Admin Account (Owner Only)
window.deleteAdminAccount = async (adminId) => {
    const admin = allAdmins.find(a => a.id === adminId);
    if (!admin) return;

    if (adminId === currentAdmin.id) {
        showToast("لا يمكنك حذف حسابك الشخصي", "warning");
        return;
    }

    const confirmed = await window.showCustomConfirm(
        "حذف حساب إداري",
        `هل أنت متأكد من رغبتك في حذف الحساب الإداري للأدمن (${admin.full_name || admin.email}) نهائياً؟`,
        null,
        null,
        'danger'
    );
    if (!confirmed) return;

    try {
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', adminId);

        if (error) throw error;

        await logAdminAction(
            currentAdmin.id,
            adminProfile.full_name || adminProfile.email,
            'Delete Admin',
            admin.full_name || admin.email,
            'حذف الملف الشخصي للأدمن من النظام بالكامل'
        );

        showToast("تم حذف الحساب بنجاح", "success");
        await loadAllData();

    } catch (err) {
        console.error("Delete Admin Error:", err);
        showToast("حدث خطأ أثناء محاولة حذف الحساب", "error");
    }
};

// Add Admin Account
async function handleAddAdminSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('add-admin-name').value;
    const email = document.getElementById('add-admin-email').value;
    const role = document.getElementById('add-admin-role').value;

    try {
        // Check if user already exists in profiles
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (existingProfile) {
            // Simply upgrade the existing profile's role to admin role
            const { error } = await supabase
                .from('profiles')
                .update({ role, status: 'active' })
                .eq('id', existingProfile.id);

            if (error) throw error;
        } else {
            // Invite/Create profile. The user can register using this email.
            // Since we can't create auth user from client without admin key, we insert a placeholder profile.
            // When they sign up, their profile is matched or created.
            // Insert profile with random uuid
            const randomId = crypto.randomUUID();
            const { error } = await supabase
                .from('profiles')
                .insert({
                    id: randomId,
                    full_name: name,
                    email,
                    role,
                    status: 'active'
                });

            if (error) throw error;
        }

        await logAdminAction(
            currentAdmin.id,
            adminProfile.full_name || adminProfile.email,
            'Create Admin',
            name,
            `تكليف بريد (${email}) بصلاحيات دور (${role})`
        );

        showToast("تم إضافة وتكليف الحساب الإداري بنجاح", "success");
        closeModal('add-admin-modal');
        document.getElementById('add-admin-form').reset();
        await loadAllData();

    } catch (err) {
        console.error("Add Admin Error:", err);
        showToast("فشل إضافة حساب الأدمن", "error");
    }
}

// Role Form Controller (Create/Edit Role)
async function handleRoleEditorSubmit(e) {
    e.preventDefault();
    const roleId = document.getElementById('role-editor-id').value;
    const name = document.getElementById('role-editor-name').value;
    const desc = document.getElementById('role-editor-desc').value;

    try {
        let activeRoleId = roleId;
        const selectedPerms = Array.from(document.querySelectorAll('#role-perms-checklist input:checked')).map(el => el.value);

        if (roleId) {
            // Edit existing role details
            const { error } = await supabase
                .from('admin_roles')
                .update({ description: desc })
                .eq('id', roleId);

            if (error) throw error;

            // Clear old role permissions mapping
            const { error: clearErr } = await supabase
                .from('role_permissions')
                .delete()
                .eq('role_id', roleId);

            if (clearErr) throw clearErr;
        } else {
            // Create brand new role
            const { data: newRole, error } = await supabase
                .from('admin_roles')
                .insert({ name, description: desc })
                .select()
                .single();

            if (error) throw error;
            activeRoleId = newRole.id;
        }

        // Insert selected default permissions for the role
        if (selectedPerms.length > 0) {
            const rows = selectedPerms.map(permId => ({
                role_id: activeRoleId,
                permission_id: permId
            }));

            const { error: insErr } = await supabase.from('role_permissions').insert(rows);
            if (insErr) throw insErr;
        }

        await logAdminAction(
            currentAdmin.id,
            adminProfile.full_name || adminProfile.email,
            roleId ? 'Edit Role' : 'Create Role',
            name,
            `تحديث إعدادات الدور. الصلاحيات المحددة: ${selectedPerms.length}`
        );

        showToast(`تم ${roleId ? 'تعديل' : 'إنشاء'} الدور بنجاح`, "success");
        closeModal('role-editor-modal');
        await loadAllData();

    } catch (err) {
        console.error("Save Role Error:", err);
        showToast("حدث خطأ أثناء حفظ وتعديل صلاحيات الدور", "error");
    }
}

// Delete Role (Owner Only)
window.deleteRole = async (roleId) => {
    const role = allRoles.find(r => r.id === roleId);
    if (!role) return;

    const confirmed = await window.showCustomConfirm(
        "حذف دور إداري",
        `هل أنت متأكد من رغبتك في حذف دور (${role.name}) نهائياً من النظام؟`,
        null,
        null,
        'danger'
    );
    if (!confirmed) return;

    try {
        const { error } = await supabase
            .from('admin_roles')
            .delete()
            .eq('id', roleId);

        if (error) throw error;

        await logAdminAction(
            currentAdmin.id,
            adminProfile.full_name || adminProfile.email,
            'Delete Role',
            role.name,
            `حذف قالب الدور (${role.name}) من قاعدة البيانات`
        );

        showToast("تم حذف الدور بنجاح", "success");
        await loadAllData();

    } catch (err) {
        console.error("Delete Role Error:", err);
        showToast("فشل حذف الدور", "error");
    }
};

// Clear Audit Logs (Owner Only)
async function clearAuditLogs() {
    if ((adminProfile.role || '').toLowerCase() !== 'owner') {
        showToast("غير مصرح لك بمسح سجل العمليات", "error");
        return;
    }

    const confirmed = await window.showCustomConfirm(
        "حذف سجل العمليات",
        "هل أنت متأكد من حذف وسجل كافة العمليات التاريخية للمنصة نهائياً؟ لا يمكن التراجع عن هذا الإجراء.",
        null,
        null,
        'danger'
    );
    if (!confirmed) return;

    try {
        const { error } = await supabase
            .from('audit_logs')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

        if (error) throw error;

        showToast("تم إفراغ سجل العمليات بنجاح", "success");
        await renderAuditLogs();

    } catch (err) {
        console.error("Clear Logs Error:", err);
        showToast("فشل مسح سجل العمليات", "error");
    }
}

// Helper to track activity
async function updateAdminActivity(type) {
    if (!currentAdmin) return;
    const now = new Date().toISOString();
    const updateData = { last_activity: now };
    if (type === 'login') {
        updateData.last_login = now;
    }

    try {
        await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', currentAdmin.id);
    } catch (e) {
        console.warn("Failed to update activity metadata:", e);
    }
}

// Global logger helper
async function logAdminAction(adminId, adminName, action, target, details) {
    let finalAdminId = adminId;
    let finalAdminName = adminName;
    let finalAction = action;
    let finalTarget = target;
    let finalDetails = details;

    // Shift arguments if called as logAdminAction(action, target, details)
    if (target === undefined && details === undefined) {
        finalAdminId = adminProfile?.id || currentAdmin?.id;
        finalAdminName = adminProfile?.full_name || adminProfile?.email || currentAdmin?.email;
        finalAction = adminId;
        finalTarget = adminName;
        finalDetails = action;
    }

    try {
        const { error } = await supabase.from('audit_logs').insert({
            admin_id: finalAdminId,
            admin_name: finalAdminName,
            action: finalAction,
            target: finalTarget,
            details: finalDetails
        });
        if (error) throw error;
    } catch (e) {
        console.error("Audit logger failed:", e);
    }
}

// Export log function to window for other components
window.logAdminAction = logAdminAction;
window.hasPermission = hasPermission;
window.getAdminProfile = () => adminProfile;

// ==========================================
// 🚀 8. NAVIGATION & UI EVENT LISTENERS
// ==========================================
function setupTabNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const mainPanel = document.querySelector('main');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            if (!targetId) return;

            // Reset buttons
            navBtns.forEach(b => {
                b.classList.remove('bg-b-primary/10', 'text-b-primary', 'font-bold');
                b.classList.add('text-gray-400');
            });

            // Activate current button
            btn.classList.add('bg-b-primary/10', 'text-b-primary', 'font-bold');
            btn.classList.remove('text-gray-400');

            // Switch content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetId) {
                    content.classList.add('active');
                    content.classList.remove('hidden');
                } else {
                    content.classList.add('hidden');
                }
            });

            // Adjust main panel layout for roadmap tab (needs to be full-screen, no padding/scroll)
            if (mainPanel) {
                if (targetId === 'learning-roadmap') {
                    mainPanel.classList.add('!p-0', '!overflow-hidden');
                    mainPanel.classList.remove('overflow-y-auto', 'p-8');
                } else {
                    mainPanel.classList.remove('!p-0', '!overflow-hidden');
                    mainPanel.classList.add('overflow-y-auto', 'p-8');
                }
            }

            // Trigger specific module loads based on tab
            loadModuleData(targetId);
            updateAdminActivity('navigation');
        });
    });
}

function setupSubTabNavigation() {
    const subTabButtons = document.querySelectorAll('.users-nav-btn');
    const subTabContents = document.querySelectorAll('.users-subtab-content');

    subTabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetSubTab = btn.getAttribute('data-subtab');
            
            // Remove active classes
            subTabButtons.forEach(b => {
                b.classList.remove('bg-white/10', 'text-white');
                b.classList.add('text-gray-400', 'hover:bg-white/5', 'hover:text-white');
            });
            subTabContents.forEach(c => c.classList.add('hidden'));

            // Add active classes
            btn.classList.add('bg-white/10', 'text-white');
            btn.classList.remove('text-gray-400', 'hover:bg-white/5', 'hover:text-white');
            document.getElementById(`subtab-${targetSubTab}`)?.classList.remove('hidden');

            // Trigger rendering based on subtab
            if (targetSubTab === 'admin-accounts') {
                renderAdminAccounts();
            } else if (targetSubTab === 'roles') {
                renderRoles();
            } else if (targetSubTab === 'permissions') {
                renderPermissionsCatalog('Dashboard');
            } else if (targetSubTab === 'audit-log') {
                renderAuditLogs();
            }
        });
    });
}

function loadModuleData(moduleId) {
    if (moduleId === 'member-requests') {
        if (typeof window.fetchFilterTracks === 'function') window.fetchFilterTracks();
        if (typeof window.fetchApplications === 'function') window.fetchApplications();
    } else if (moduleId === 'team-requests' || moduleId === 'team-mgmt') {
        if (typeof window.initTeamMgmt === 'function') window.initTeamMgmt();
    } else if (moduleId === 'student-leader-mgmt') {
        if (typeof window.initUsersMgmt === 'function') window.initUsersMgmt();
    } else if (moduleId === 'project-audit') {
        if (typeof window.initProjectAudit === 'function') window.initProjectAudit();
    } else if (moduleId === 'tools-mgmt') {
        if (typeof window.initToolsMgmt === 'function') window.initToolsMgmt();
    } else if (moduleId === 'references-mgmt') {
        if (typeof window.initReferencesMgmt === 'function') window.initReferencesMgmt();
    } else if (moduleId === 'learning-roadmap') {
        initInteractiveRoadmap('admin');
    }
}

// ==========================================
// 🚀 8.5. ROLE-BASED ACCESS CONTROL (RBAC)
// ==========================================
function hasPermission(permId) {
    if (!adminProfile) return false;
    const roleLower = (adminProfile.role || '').toLowerCase().trim();
    if (roleLower === 'owner') return true;

    // Load active permissions set for this admin
    const activePerms = adminPermissionsMap[adminProfile.id] || new Set();
    
    // If they don't have customized permissions, check default Role permissions
    let checkSet = activePerms;
    if (activePerms.size === 0) {
        const roleRecord = allRoles.find(r => r.name === adminProfile.role);
        if (roleRecord && rolePermissionsMap[roleRecord.id]) {
            checkSet = rolePermissionsMap[roleRecord.id];
        }
    }

    // Fallback to profile's admin_permissions column if both are empty
    if (checkSet.size === 0 && adminProfile.admin_permissions) {
        let raw = adminProfile.admin_permissions;
        if (typeof raw === 'string') {
            try { raw = JSON.parse(raw); } catch(e) {}
        }
        const arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.permissions) ? raw.permissions : []);
        if (arr.includes('*')) return true;
        if (arr.includes(permId)) return true;
        
        // Mapped old to new permission matches
        if (permId === 'manage_content' && (arr.includes('manage_content') || arr.includes('*'))) return true;
        if (permId === 'manage_requests' && (arr.includes('manage_requests') || arr.includes('*'))) return true;
        if (permId === 'audit_projects' && (arr.includes('audit_projects') || arr.includes('*'))) return true;
        if (permId === 'manage_users' && (arr.includes('manage_users') || arr.includes('*'))) return true;
    }

    if (checkSet.has('*')) return true;
    if (checkSet.has(permId)) return true;

    // Bridge old perm keys to fine-grained database permissions
    if (permId === 'manage_content') {
        return checkSet.has('manage_content') || checkSet.has('content:course:view') || checkSet.has('content:phase:view') || checkSet.has('content:material:view');
    }
    if (permId === 'manage_requests') {
        return checkSet.has('manage_requests') || checkSet.has('teams:approve') || checkSet.has('teams:reject') || checkSet.has('teams:view');
    }
    if (permId === 'audit_projects') {
        return checkSet.has('audit_projects') || checkSet.has('reviews:submissions') || checkSet.has('reviews:grades:approve');
    }
    if (permId === 'manage_users') {
        return checkSet.has('manage_users') || checkSet.has('settings:permissions') || checkSet.has('settings:admins');
    }

    return false;
}

function updateAdminUI() {
    try {
        const restrictedElements = document.querySelectorAll('[data-perm]');
        restrictedElements.forEach((el) => {
            const requiredPermission = el.getAttribute('data-perm');
            const isAllowed = hasPermission(requiredPermission);
            
            if (isAllowed) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });
    } catch (err) {
        console.error("updateAdminUI Error:", err);
    }
}

function setupEventListeners() {
    // Search filter
    document.getElementById('admin-search')?.addEventListener('input', renderAdminAccounts);
    document.getElementById('admin-role-filter')?.addEventListener('change', renderAdminAccounts);
    document.getElementById('admin-status-filter')?.addEventListener('change', renderAdminAccounts);

    // Logs filters
    document.getElementById('log-admin-filter')?.addEventListener('change', renderAuditLogs);
    document.getElementById('log-action-filter')?.addEventListener('change', renderAuditLogs);

    // Permission Drawer Control
    document.getElementById('btn-close-drawer')?.addEventListener('click', closePermissionsDrawer);
    document.getElementById('btn-cancel-permissions')?.addEventListener('click', closePermissionsDrawer);
    document.getElementById('btn-save-permissions')?.addEventListener('click', saveAdminPermissions);

    // CRUD Forms submissions
    document.getElementById('edit-admin-form')?.addEventListener('submit', handleEditAdminSubmit);
    document.getElementById('add-admin-form')?.addEventListener('submit', handleAddAdminSubmit);
    document.getElementById('role-editor-form')?.addEventListener('submit', handleRoleEditorSubmit);

    // Clear logs
    document.getElementById('btn-clear-logs')?.addEventListener('click', clearAuditLogs);

    // Modals buttons triggers
    document.getElementById('btn-add-admin')?.addEventListener('click', () => openModal('add-admin-modal'));
    document.getElementById('btn-create-role')?.addEventListener('click', () => openCreateRoleModal());

    // Perm groups list click handler
    document.querySelectorAll('.perm-group-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.perm-group-btn').forEach(b => {
                b.classList.remove('bg-white/5', 'text-teal-400', 'border-r-2', 'border-teal-500');
                b.classList.add('text-gray-400', 'hover:bg-white/5', 'hover:text-white');
            });
            btn.classList.remove('text-gray-400', 'hover:bg-white/5', 'hover:text-white');
            btn.classList.add('bg-white/5', 'text-teal-400', 'border-r-2', 'border-teal-500');

            const group = btn.getAttribute('data-group');
            renderPermissionsCatalog(group);
        });
    });

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        const confirmed = await window.showCustomConfirm(
            "تسجيل الخروج",
            "هل تريد تسجيل الخروج؟",
            null,
            null,
            'warning'
        );
        if (confirmed) {
            await supabase.auth.signOut();
        }
    });
}

// ==========================================
// 🚀 9. TOAST NOTIFICATIONS SERVICE
// ==========================================
function showToast(message, type = "info") {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `flex items-center gap-3 px-5 py-3 rounded-xl border text-sm font-bold shadow-lg transform transition-all duration-300 translate-y-2 opacity-0 select-none pointer-events-auto z-[9999]`;
    
    let icon = '<i class="fas fa-info-circle"></i>';
    if (type === 'success') {
        toast.className += ' bg-green-500/10 border-green-500/20 text-green-400';
        icon = '<i class="fas fa-check-circle"></i>';
    } else if (type === 'error') {
        toast.className += ' bg-red-500/10 border-red-500/20 text-red-400';
        icon = '<i class="fas fa-times-circle"></i>';
    } else if (type === 'warning') {
        toast.className += ' bg-yellow-500/10 border-yellow-500/20 text-yellow-400';
        icon = '<i class="fas fa-exclamation-triangle"></i>';
    } else {
        toast.className += ' bg-b-surface border-white/10 text-teal-400';
    }

    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    // Auto dismiss
    setTimeout(() => {
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}
window.showToast = showToast;

// ==========================================
// 🚀 10. CENTRAL DASHBOARD ENGINE (MISSION CONTROL)
// ==========================================
async function renderDashboardOverview() {
    try {
        const roleLower = (adminProfile?.role || '').toLowerCase().trim();
        const isMasterOrOwner = ['owner', 'master admin'].includes(roleLower);

        // 1. Welcome Message & Last Login
        const welcomeNameEl = document.getElementById('dash-welcome-name');
        if (welcomeNameEl) {
            welcomeNameEl.innerText = adminProfile?.full_name || adminProfile?.email || 'الأدمن';
        }

        const lastLoginEl = document.getElementById('dash-last-login');
        if (lastLoginEl) {
            lastLoginEl.innerText = adminProfile?.last_login 
                ? new Date(adminProfile.last_login).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
                : 'أول تسجيل دخول لك';
        }

        // 2. Fetch required metrics in background if not fully loaded
        const startOfToday = new Date();
        startOfToday.setHours(0,0,0,0);

        // 3. Compute KPI Counts
        const totalStudents = allUsers.filter(u => {
            const r = String(u.role).toLowerCase();
            return r === 'student' || r === 'suspended_student';
        }).length;

        const activeStudentsToday = allUsers.filter(u => {
            const r = String(u.role).toLowerCase();
            const isStudent = r === 'student' || r === 'suspended_student';
            return isStudent && u.last_activity && new Date(u.last_activity) >= startOfToday;
        }).length;

        const totalLeaders = allUsers.filter(u => {
            const r = String(u.role).toLowerCase();
            return r === 'leader' || r === 'suspended_leader';
        }).length;

        const totalAdminsCount = allAdmins.length;

        const totalTeamsCount = allTeams.length;
        const activeTeamsCount = allTeams.filter(t => t.status !== 'frozen').length;
        const pendingTeamRequestsCount = allTeamRequests.filter(tr => tr.status === 'pending').length;
        const frozenTeamsCount = allTeams.filter(t => t.status === 'frozen').length;

        const totalPhasesCount = allPhases.length;
        const totalCoursesCount = allCourses.length;
        const totalVideosCount = allCourseMaterials.filter(m => m.type === 'video').length;
        const totalQuizzesCount = allCourseMaterials.filter(m => m.type === 'quiz' || m.ref_quiz_id).length;
        const totalProjectsCount = allCourseMaterials.filter(m => m.type === 'project' || m.ref_project_id).length;

        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
        const onlineNowCount = allUsers.filter(u => u.last_activity && new Date(u.last_activity) >= fifteenMinsAgo).length;

        const videosWatchedToday = allCompletedMaterials.filter(cm => new Date(cm.completed_at) >= startOfToday).length;
        const quizzesSolvedToday = allQuizAttempts.filter(qa => new Date(qa.submitted_at) >= startOfToday).length;
        const projectsSubmittedToday = allSubmissions.filter(s => s.submitted_at && new Date(s.submitted_at) >= startOfToday).length;

        const pendingGradingCount = allSubmissions.filter(s => s.status === 'pending').length;
        const pendingReviewCount = allSubmissions.filter(s => s.status === 'graded').length;
        const totalAppealsCount = allAppeals.filter(a => a.status === 'pending').length;

        let randomAuditsCount = 0;
        allSubmissions.forEach(sub => {
            const seed = parseInt(sub.id.substring(0, 8), 16);
            if (seed % 20 === 0) {
                randomAuditsCount++;
            }
        });

        // 4. Set KPI DOM values
        const setElText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val !== undefined && val !== null ? val : '--';
        };

        setElText('kpi-total-students', totalStudents);
        setElText('kpi-active-students-today', activeStudentsToday);
        setElText('kpi-total-leaders', totalLeaders);
        setElText('kpi-total-admins', totalAdminsCount);

        setElText('kpi-total-teams', totalTeamsCount);
        setElText('kpi-active-teams', activeTeamsCount);
        setElText('kpi-pending-team-requests', pendingTeamRequestsCount);
        setElText('kpi-frozen-teams', frozenTeamsCount);

        setElText('kpi-total-phases', totalPhasesCount);
        setElText('kpi-total-courses', totalCoursesCount);
        setElText('kpi-total-videos', totalVideosCount);
        setElText('kpi-total-quizzes', totalQuizzesCount);
        setElText('kpi-total-projects', totalProjectsCount);

        setElText('kpi-online-now', onlineNowCount);
        setElText('kpi-videos-watched-today', videosWatchedToday);
        setElText('kpi-quizzes-solved-today', quizzesSolvedToday);
        setElText('kpi-projects-submitted-today', projectsSubmittedToday);

        setElText('kpi-pending-grading', pendingGradingCount);
        setElText('kpi-pending-review', pendingReviewCount);
        setElText('kpi-total-appeals', totalAppealsCount);
        setElText('kpi-random-audits', randomAuditsCount);

        // 5. Dynamic KPIs visibility based on roles/permissions
        const toggleKpiWrapper = (childId, allowed) => {
            const el = document.getElementById(childId);
            const wrapper = el?.closest('.bg-b-surface');
            if (wrapper) {
                if (allowed) wrapper.classList.remove('hidden');
                else wrapper.classList.add('hidden');
            }
        };

        toggleKpiWrapper('kpi-total-students', isMasterOrOwner || hasPermission('manage_users'));
        toggleKpiWrapper('kpi-total-teams', isMasterOrOwner || hasPermission('manage_requests'));
        toggleKpiWrapper('kpi-total-phases', isMasterOrOwner || hasPermission('manage_content'));
        toggleKpiWrapper('kpi-online-now', isMasterOrOwner);
        toggleKpiWrapper('kpi-pending-grading', isMasterOrOwner || hasPermission('audit_projects'));

        // 6. Action Required Alerts List
        const actionListEl = document.getElementById('dash-action-required-list');
        if (actionListEl) {
            const actionItems = [];

            if (pendingReviewCount > 0 && hasPermission('audit_projects')) {
                actionItems.push({
                    text: `يوجد ${pendingReviewCount} مشروعاً بانتظار المراجعة والاعتماد النهائي.`,
                    icon: 'fa-check-double',
                    color: 'text-yellow-500',
                    tab: 'project-audit',
                    subtab: 'pending-review'
                });
            }

            if (pendingTeamRequestsCount > 0 && hasPermission('manage_requests')) {
                actionItems.push({
                    text: `يوجد ${pendingTeamRequestsCount} طلبات إنشاء فرق بانتظار الموافقة والاعتماد.`,
                    icon: 'fa-users-gear',
                    color: 'text-purple-400',
                    tab: 'team-mgmt',
                    subtab: 'team-requests'
                });
            }

            if (totalAppealsCount > 0 && hasPermission('audit_projects')) {
                actionItems.push({
                    text: `يوجد ${totalAppealsCount} اعتراضات (تظلمات) جديدة من الطلاب بحاجة للفحص.`,
                    icon: 'fa-triangle-exclamation',
                    color: 'text-red-400',
                    tab: 'project-audit',
                    subtab: 'appeals'
                });
            }

            // Abnormal Grading Rate check
            if (hasPermission('audit_projects') || isMasterOrOwner) {
                const leaderPerf = {};
                allSubmissions.forEach(sub => {
                    if (sub.status === 'graded' || sub.status === 'approved') {
                        const graderId = sub.graded_by;
                        const graderName = sub.graded_by_name || 'غير معروف';
                        const graderObj = allUsers.find(p => p.id === graderId);
                        const graderFullName = graderObj?.full_name || graderName;
                        
                        if (graderId) {
                            if (!leaderPerf[graderId]) {
                                leaderPerf[graderId] = {
                                    id: graderId,
                                    name: graderFullName,
                                    gradedCount: 0,
                                    appealsCount: 0,
                                    auditedCount: 0,
                                    regradedCount: 0,
                                    totalDurationMs: 0
                                };
                            }
                            leaderPerf[graderId].gradedCount++;

                            if (sub.graded_at && sub.submitted_at) {
                                leaderPerf[graderId].totalDurationMs += new Date(sub.graded_at).getTime() - new Date(sub.submitted_at).getTime();
                            }

                            const appeal = allAppeals.find(a => a.submission_id === sub.id);
                            if (appeal) leaderPerf[graderId].appealsCount++;

                            const audit = allAudits.find(a => a.submission_id === sub.id);
                            if (audit) {
                                leaderPerf[graderId].auditedCount++;
                                if (audit.admin_grade !== null && Math.abs((sub.grade || 0) - audit.admin_grade) > 5) {
                                    leaderPerf[graderId].regradedCount++;
                                }
                            }
                        }
                    }
                });

                Object.values(leaderPerf).forEach(l => {
                    const avgMs = l.totalDurationMs / l.gradedCount;
                    const appealRate = l.appealsCount / l.gradedCount;
                    const discrepencyRate = l.regradedCount / Math.max(1, l.auditedCount);
                    
                    let trustScore = 100;
                    trustScore -= (appealRate * 35);
                    trustScore -= (discrepencyRate * 45);
                    
                    if (avgMs > 0 && avgMs < 1000 * 60 * 30) {
                        trustScore -= 15;
                    }
                    trustScore = Math.max(10, Math.min(100, Math.round(trustScore)));

                    if (trustScore < 70) {
                        actionItems.push({
                            text: `الليدر (${l.name}) لديه معدل تصحيح غير طبيعي أو نسبة تظلمات مرتفعة (معدل ثقة ${trustScore}%).`,
                            icon: 'fa-user-xmark',
                            color: 'text-red-500',
                            tab: 'project-audit',
                            subtab: 'leader-performance'
                        });
                    }
                });
            }

            if (hasPermission('manage_content')) {
                allCourses.forEach(c => {
                    const hasMaterials = allCourseMaterials.some(m => m.course_id === c.course_id);
                    if (!hasMaterials) {
                        actionItems.push({
                            text: `الكورس (${c.title}) تم إنشاؤه ولا يحتوي على أي مواد دراسية حالياً.`,
                            icon: 'fa-book-open-reader',
                            color: 'text-orange-400',
                            tab: 'content-mgmt',
                            subtab: 'course_materials'
                        });
                    }
                });
            }

            if (actionItems.length === 0) {
                actionListEl.innerHTML = `<li class="py-3 text-center text-gray-500 text-xs flex items-center justify-center gap-2"><i class="fas fa-check-circle text-emerald-400"></i> لا توجد تنبيهات معلقة تتطلب إجراءً حالياً.</li>`;
            } else {
                actionListEl.innerHTML = actionItems.map(item => `
                    <li onclick="window.navigateFromDashboard('${item.tab}', '${item.subtab}')" class="py-3 px-4 flex items-center justify-between hover:bg-white/5 border border-white/5 hover:border-white/10 rounded-xl cursor-pointer transition-all group">
                        <div class="flex items-center gap-3">
                            <i class="fas ${item.icon} ${item.color} text-sm"></i>
                            <span class="text-xs text-gray-200 group-hover:text-white font-bold transition-all">${item.text}</span>
                        </div>
                        <i class="fas fa-chevron-left text-[10px] text-gray-500 group-hover:translate-x-[-4px] transition-transform"></i>
                    </li>
                `).join('');
            }
        }

        // 7. Toggle Quick Actions buttons based on permissions
        const toggleBtn = (sel, allowed) => {
            const btn = document.querySelector(sel);
            if (btn) {
                if (allowed) btn.classList.remove('hidden');
                else btn.classList.add('hidden');
            }
        };
        toggleBtn('button[onclick*="add-phase"]', hasPermission('manage_content'));
        toggleBtn('button[onclick*="add-course"]', hasPermission('manage_content'));
        toggleBtn('button[onclick*="add-quiz"]', hasPermission('manage_content'));
        toggleBtn('button[onclick*="add-project"]', hasPermission('manage_content'));
        toggleBtn('button[onclick*="create-admin"]', hasPermission('manage_users'));
        toggleBtn('button[onclick*="create-notif"]', hasPermission('manage_users'));
        toggleBtn('button[onclick*="review-projects"]', hasPermission('audit_projects'));
        toggleBtn('button[onclick*="review-teams"]', hasPermission('manage_requests'));

        // 8. Toggle Section Views (Charts, Log Timeline, Active Tables)
        const toggleSection = (id, allowed) => {
            const el = document.getElementById(id);
            if (el) {
                if (allowed) el.classList.remove('hidden');
                else el.classList.add('hidden');
            }
        };

        const toggleWrapperByChild = (childId, allowed) => {
            const el = document.getElementById(childId);
            const wrapper = el?.closest('.bg-b-surface');
            if (wrapper) {
                if (allowed) wrapper.classList.remove('hidden');
                else wrapper.classList.add('hidden');
            }
        };

        toggleWrapperByChild('activityChart', isMasterOrOwner);
        toggleWrapperByChild('distributionChart', isMasterOrOwner);
        toggleWrapperByChild('dash-recent-activity-timeline', isMasterOrOwner);
        toggleWrapperByChild('dash-top-students-list', isMasterOrOwner || hasPermission('manage_requests'));
        toggleWrapperByChild('dash-top-teams-tbody', isMasterOrOwner || hasPermission('manage_requests'));
        toggleSection('dash-section-active-courses', isMasterOrOwner || hasPermission('manage_content'));
        toggleWrapperByChild('status-db', isMasterOrOwner);
        toggleWrapperByChild('dash-my-role', isMasterOrOwner);

        // 9. Render dynamic components if permitted
        if (isMasterOrOwner) {
            renderActivityChart();
            renderDistributionChart();
            
            // Render Recent Activity Timeline
            const timelineEl = document.getElementById('dash-recent-activity-timeline');
            if (timelineEl) {
                const { data: recentLogs } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(20);
                const logs = recentLogs || [];
                const activities = [];

                logs.forEach(log => {
                    activities.push({
                        text: `${log.admin_name || 'أدمن'} : ${log.details || log.action}`,
                        time: new Date(log.created_at),
                        icon: 'fa-user-shield',
                        color: 'text-teal-400 border-teal-500/20 bg-teal-500/5'
                    });
                });

                allSubmissions.forEach(sub => {
                    if (sub.submitted_at) {
                        const studentObj = allUsers.find(p => p.id === sub.user_id);
                        const studentName = studentObj?.full_name || 'طالب';
                        const projectObj = allCourseMaterials.find(m => m.ref_project_id === sub.project_id || m.content_id === sub.project_id) || { title: 'مشروع' };
                        activities.push({
                            text: `سلم الطالب (${studentName}) المشروع (${projectObj.title || 'مشروع'}).`,
                            time: new Date(sub.submitted_at),
                            icon: 'fa-upload',
                            color: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/5'
                        });
                    }
                    if (sub.graded_at && sub.status === 'graded') {
                        const graderObj = allUsers.find(p => p.id === sub.graded_by);
                        const graderName = graderObj?.full_name || sub.graded_by_name || 'الليدر';
                        const studentObj = allUsers.find(p => p.id === sub.user_id);
                        const studentName = studentObj?.full_name || 'طالب';
                        activities.push({
                            text: `قيّم الليدر (${graderName}) مشروع الطالب (${studentName}) بدرجة (${sub.grade}).`,
                            time: new Date(sub.graded_at),
                            icon: 'fa-star',
                            color: 'text-purple-400 border-purple-500/20 bg-purple-500/5'
                        });
                    }
                });

                allTeamRequests.forEach(req => {
                    if (req.reviewed_at && req.status === 'approved') {
                        const reviewerObj = allUsers.find(p => p.id === req.reviewed_by);
                        const reviewerName = reviewerObj?.full_name || 'المشرف';
                        activities.push({
                            text: `وافق (${reviewerName}) على طلب إنشاء فريق (${req.team_name}).`,
                            time: new Date(req.reviewed_at),
                            icon: 'fa-circle-check',
                            color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5'
                        });
                    }
                });

                activities.sort((a,b) => b.time - a.time);
                const topActivities = activities.slice(0, 15);

                if (topActivities.length === 0) {
                    timelineEl.innerHTML = `<li class="text-center py-10 text-xs text-gray-500">لا يوجد عمليات حديثة مسجلة.</li>`;
                } else {
                    timelineEl.innerHTML = topActivities.map(act => {
                        const dateStr = act.time.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                        return `
                            <li class="relative pb-1">
                                <div class="flex items-start gap-3">
                                    <div class="w-7 h-7 rounded-full border ${act.color} flex items-center justify-center shrink-0 text-xs mt-0.5">
                                        <i class="fas ${act.icon}"></i>
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <p class="text-xs text-gray-200 font-bold leading-relaxed whitespace-pre-wrap">${act.text}</p>
                                        <span class="text-[9px] text-gray-500 font-mono mt-1 block">${dateStr}</span>
                                    </div>
                                </div>
                            </li>
                        `;
                    }).join('');
                }
            }

            // Platform Status Connection Check
            const statusDbEl = document.getElementById('status-db');
            const statusAuthEl = document.getElementById('status-auth');
            const statusStorageEl = document.getElementById('status-storage');
            const statusApiEl = document.getElementById('status-api');
            const statusNotifEl = document.getElementById('status-notif');
            const statusEmailEl = document.getElementById('status-email');

            try {
                const { data: dbCheck, error: dbErr } = await supabase.from('profiles').select('id').limit(1);
                if (dbErr) throw dbErr;
                if (statusDbEl) statusDbEl.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
                if (statusStorageEl) statusStorageEl.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
                if (statusApiEl) statusApiEl.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
                if (statusNotifEl) statusNotifEl.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
                if (statusEmailEl) statusEmailEl.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
            } catch (e) {
                if (statusDbEl) statusDbEl.className = 'w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse';
                if (statusStorageEl) statusStorageEl.className = 'w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse';
                if (statusApiEl) statusApiEl.className = 'w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse';
                if (statusNotifEl) statusNotifEl.className = 'w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse';
                if (statusEmailEl) statusEmailEl.className = 'w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse';
            }

            try {
                await supabase.auth.getSession();
                if (statusAuthEl) statusAuthEl.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
            } catch (e) {
                if (statusAuthEl) statusAuthEl.className = 'w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse';
            }
        }

        // Render Top Students List (Top 10 by XP)
        if (isMasterOrOwner || hasPermission('manage_requests')) {
            const topStudentsEl = document.getElementById('dash-top-students-list');
            if (topStudentsEl) {
                const students = allUsers
                    .filter(u => u.role === 'student' || u.role === 'suspended_student')
                    .sort((a,b) => (b.total_xp || 0) - (a.total_xp || 0))
                    .slice(0, 10);

                if (students.length === 0) {
                    topStudentsEl.innerHTML = `<p class="text-center py-10 text-xs text-gray-500">لا يوجد طلاب مسجلين.</p>`;
                } else {
                    topStudentsEl.innerHTML = students.map((s, idx) => {
                        const photo = s.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.full_name || 'Student')}&background=006A67&color=fff&size=100`;
                        const teamObj = allTeams.find(t => t.id === s.team_id);
                        const teamName = teamObj ? teamObj.name : 'بدون فريق';
                        const hours = ((s.total_xp || 0) / 120).toFixed(1);

                        let rankBadge = `<span class="w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-mono text-gray-400">${idx+1}</span>`;
                        if (idx === 0) rankBadge = `<span class="w-5 h-5 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center text-[10px] font-mono text-yellow-500"><i class="fas fa-crown"></i></span>`;
                        if (idx === 1) rankBadge = `<span class="w-5 h-5 rounded-full bg-slate-300/20 border border-slate-300/30 flex items-center justify-center text-[10px] font-mono text-slate-300"><i class="fas fa-medal"></i></span>`;
                        if (idx === 2) rankBadge = `<span class="w-5 h-5 rounded-full bg-amber-700/20 border border-amber-700/30 flex items-center justify-center text-[10px] font-mono text-amber-600"><i class="fas fa-medal"></i></span>`;

                        return `
                            <div class="flex items-center justify-between p-2.5 bg-black/30 border border-white/5 rounded-xl hover:border-teal-500/20 transition-all">
                                <div class="flex items-center gap-3">
                                    ${rankBadge}
                                    <img src="${photo}" class="w-8 h-8 rounded-full border border-white/10 object-cover bg-black">
                                    <div>
                                        <h4 class="text-xs font-bold text-white">${s.full_name || 'طالب مجهول'}</h4>
                                        <span class="text-[9px] text-gray-400">فريق: ${teamName}</span>
                                    </div>
                                </div>
                                <div class="text-left font-mono font-bold">
                                    <span class="text-xs text-yellow-500 block">${(s.total_xp || 0).toLocaleString()} XP</span>
                                    <span class="text-[9px] text-gray-500">${hours} ساعة</span>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }

            // Render Top Teams Table
            const topTeamsTbody = document.getElementById('dash-top-teams-tbody');
            if (topTeamsTbody) {
                const sortedTeams = allTeams
                    .sort((a,b) => (b.total_score || 0) - (a.total_score || 0))
                    .slice(0, 10);

                if (sortedTeams.length === 0) {
                    topTeamsTbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-500">لا تتوفر فرق مسجلة.</td></tr>`;
                } else {
                    topTeamsTbody.innerHTML = sortedTeams.map(t => {
                        const membersCount = allUsers.filter(u => u.team_id === t.id).length;
                        const avgProgress = membersCount > 0 ? Math.min(100, Math.round((t.total_score || 0) / membersCount / 10)) : 0;

                        return `
                            <tr class="hover:bg-white/5 border-b border-white/5 transition-colors">
                                <td class="py-2.5 font-bold text-white text-right">${t.name}</td>
                                <td class="py-2.5 text-center font-mono font-bold text-yellow-500">${t.total_score || 0}</td>
                                <td class="py-2.5 text-center text-gray-300 font-mono">${membersCount} أعضاء</td>
                                <td class="py-2.5 text-center">
                                    <span class="font-mono font-bold text-teal-400">${avgProgress}%</span>
                                </td>
                            </tr>
                        `;
                    }).join('');
                }
            }
        }

        // Render Active Courses Table
        if (isMasterOrOwner || hasPermission('manage_content')) {
            const topCoursesTbody = document.getElementById('dash-top-courses-tbody');
            if (topCoursesTbody) {
                const { data: enrollmentsRes } = await supabase.from('enrollments').select('*');
                const enrollments = enrollmentsRes || [];
                const courseStats = {};
                
                allCourses.forEach(c => {
                    courseStats[c.course_id] = {
                        title: c.title,
                        registered: 0,
                        completed: 0,
                        totalProgress: 0,
                        views: 0
                    };
                });

                enrollments.forEach(e => {
                    if (courseStats[e.course_id]) {
                        courseStats[e.course_id].registered++;
                        if (e.is_completed) {
                            courseStats[e.course_id].completed++;
                        }
                        courseStats[e.course_id].totalProgress += e.progress_percent || 0;
                    }
                });

                allCompletedMaterials.forEach(cm => {
                    if (cm.course_id && courseStats[cm.course_id]) {
                        courseStats[cm.course_id].views++;
                    }
                });

                const activeCourses = Object.entries(courseStats)
                    .map(([id, stats]) => ({
                        id,
                        ...stats,
                        avgProgress: stats.registered > 0 ? Math.round(stats.totalProgress / stats.registered) : 0
                    }))
                    .sort((a,b) => b.registered - a.registered)
                    .slice(0, 5);

                if (activeCourses.length === 0) {
                    topCoursesTbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500">لا تتوفر كورسات مسجلة.</td></tr>`;
                } else {
                    topCoursesTbody.innerHTML = activeCourses.map(c => `
                        <tr class="hover:bg-white/5 border-b border-white/5 transition-colors text-xs">
                            <td class="py-3 font-bold text-white text-right">${c.title}</td>
                            <td class="py-3 text-center font-mono font-bold text-gray-300">${c.registered}</td>
                            <td class="py-3 text-center font-mono font-bold text-emerald-400">${c.completed}</td>
                            <td class="py-3 text-center font-mono font-bold text-teal-400">${c.avgProgress}%</td>
                            <td class="py-3 text-center font-mono font-bold text-white">${c.views} مشاهدة</td>
                        </tr>
                    `).join('');
                }
            }
        }

        // Render My Permissions checklist checklist
        if (isMasterOrOwner) {
            const checkPerm = (permId, elId) => {
                const el = document.getElementById(elId);
                if (el) {
                    if (hasPermission(permId)) {
                        el.innerHTML = '<i class="fas fa-circle-check text-emerald-400 text-sm"></i>';
                    } else {
                        el.innerHTML = '<i class="fas fa-circle-xmark text-red-500 text-sm"></i>';
                    }
                }
            };
            checkPerm('manage_content', 'perm-courses');
            checkPerm('manage_content', 'perm-videos');
            checkPerm('manage_content', 'perm-quizzes');
            checkPerm('audit_projects', 'perm-projects');
            checkPerm('manage_users', 'perm-users');
            checkPerm('manage_requests', 'perm-teams');
        }

        // Render My Tasks Checklist
        const myTasksListEl = document.getElementById('dash-my-tasks-list');
        if (myTasksListEl) {
            const tasks = [];

            if (hasPermission('audit_projects')) {
                if (pendingReviewCount > 0) {
                    tasks.push({
                        text: `${pendingReviewCount} مشروعاً بانتظار المراجعة والاعتماد.`,
                        action: "window.navigateFromDashboard('project-audit', 'pending-review')"
                    });
                }
                if (totalAppealsCount > 0) {
                    tasks.push({
                        text: `${totalAppealsCount} اعتراضات (تظلمات) جديدة بحاجة لفصل وحل.`,
                        action: "window.navigateFromDashboard('project-audit', 'appeals')"
                    });
                }
            }

            if (hasPermission('manage_requests')) {
                if (pendingTeamRequestsCount > 0) {
                    tasks.push({
                        text: `${pendingTeamRequestsCount} طلبات إنشاء فرق بحاجة للاعتماد أو الرفض.`,
                        action: "window.navigateFromDashboard('team-mgmt', 'team-requests')"
                    });
                }
            }

            if (hasPermission('manage_content')) {
                const inactiveCoursesCount = allCourses.filter(c => !c.is_active).length;
                if (inactiveCoursesCount > 0) {
                    tasks.push({
                        text: `يوجد ${inactiveCoursesCount} كورسات معطلة بحاجة للمراجعة والتفعيل.`,
                        action: "window.navigateFromDashboard('content-mgmt', 'courses')"
                    });
                }
            }

            if (tasks.length === 0) {
                myTasksListEl.innerHTML = `<li class="text-center py-8 text-xs text-gray-500 flex items-center justify-center gap-2"><i class="fas fa-check-circle text-emerald-400"></i> لا توجد مهام معلقة خاصة بك حالياً.</li>`;
            } else {
                myTasksListEl.innerHTML = tasks.map(task => `
                    <li onclick="${task.action}" class="flex items-center justify-between p-2.5 bg-black/35 hover:bg-white/5 border border-white/5 hover:border-teal-500/20 rounded-xl cursor-pointer transition-all">
                        <span class="text-xs text-gray-300 font-bold">${task.text}</span>
                        <i class="fas fa-arrow-left text-[10px] text-teal-400 animate-pulse"></i>
                    </li>
                `).join('');
            }
        }

    } catch (e) {
        console.error("renderDashboardOverview Error:", e);
    }
}

// ------------------------------------------
// 📈 Chart.js Bindings
// ------------------------------------------
function renderActivityChart() {
    const ctx = document.getElementById('activityChart')?.getContext('2d');
    if (!ctx) return;

    if (activityChartInst) {
        activityChartInst.destroy();
    }

    const labels = [];
    const newStudentsData = [];
    const projectsData = [];
    const quizzesData = [];
    const learningHoursData = [];

    const studentsMap = {};
    const projectsMap = {};
    const quizzesMap = {};
    const hoursMap = {};

    allUsers.forEach(u => {
        if (u.created_at && (u.role === 'student' || u.role === 'suspended_student')) {
            const day = u.created_at.split('T')[0];
            studentsMap[day] = (studentsMap[day] || 0) + 1;
        }
    });

    allSubmissions.forEach(s => {
        if (s.submitted_at) {
            const day = s.submitted_at.split('T')[0];
            projectsMap[day] = (projectsMap[day] || 0) + 1;
        }
    });

    allQuizAttempts.forEach(qa => {
        if (qa.submitted_at) {
            const day = qa.submitted_at.split('T')[0];
            quizzesMap[day] = (quizzesMap[day] || 0) + 1;
        }
    });

    allCompletedMaterials.forEach(cm => {
        if (cm.completed_at) {
            const day = cm.completed_at.split('T')[0];
            const mat = allCourseMaterials.find(m => m.content_id === cm.material_id);
            const durationMins = mat?.duration || 10;
            const durationHrs = durationMins / 60;
            hoursMap[day] = (hoursMap[day] || 0) + durationHrs;
        }
    });

    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
        
        labels.push(label);
        newStudentsData.push(studentsMap[dayStr] || 0);
        projectsData.push(projectsMap[dayStr] || 0);
        quizzesData.push(quizzesMap[dayStr] || 0);
        learningHoursData.push(parseFloat((hoursMap[dayStr] || 0).toFixed(1)));
    }

    activityChartInst = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'الطلاب الجدد',
                    data: newStudentsData,
                    borderColor: '#006A67',
                    backgroundColor: 'rgba(0, 106, 103, 0.05)',
                    borderWidth: 2.5,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'المشاريع المسلمة',
                    data: projectsData,
                    borderColor: '#FFC107',
                    backgroundColor: 'rgba(255, 193, 7, 0.05)',
                    borderWidth: 2.5,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'الكويزات المحلولة',
                    data: quizzesData,
                    borderColor: '#A855F7',
                    backgroundColor: 'rgba(168, 85, 247, 0.05)',
                    borderWidth: 2.5,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'ساعات التعلم',
                    data: learningHoursData,
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.05)',
                    borderWidth: 2.5,
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#888', font: { family: 'Cairo' } }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#888', font: { family: 'Cairo' }, maxTicksLimit: 7 }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#fff', font: { family: 'Cairo', size: 10 } },
                    position: 'top'
                }
            }
        }
    });
}

function renderDistributionChart() {
    const ctx = document.getElementById('distributionChart')?.getContext('2d');
    if (!ctx) return;

    if (distributionChartInst) {
        distributionChartInst.destroy();
    }

    const students = allUsers.filter(u => u.role === 'student' || u.role === 'suspended_student');
    const grouping = {};

    students.forEach(s => {
        let key = 'غير محدد';
        if (currentDistChartType === 'uni') {
            key = s.university || 'غير محدد';
        } else if (currentDistChartType === 'gov') {
            key = s.governorate || 'غير محدد';
        } else if (currentDistChartType === 'track') {
            key = s.track || 'غير محدد';
        }
        grouping[key] = (grouping[key] || 0) + 1;
    });

    const sorted = Object.entries(grouping).sort((a,b) => b[1] - a[1]);
    const labels = [];
    const data = [];
    let otherSum = 0;

    sorted.forEach(([key, val], idx) => {
        if (idx < 5) {
            labels.push(key);
            data.push(val);
        } else {
            otherSum += val;
        }
    });

    if (otherSum > 0) {
        labels.push('أخرى');
        data.push(otherSum);
    }

    const colors = ['#006A67', '#009F9D', '#FFC107', '#A855F7', '#3B82F6', '#64748B'];

    distributionChartInst = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 1,
                borderColor: '#111'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#fff', font: { family: 'Cairo', size: 10 } }
                }
            }
        }
    });
}

window.switchDistChart = (type) => {
    currentDistChartType = type;
    const btns = ['uni', 'gov', 'track'];
    btns.forEach(b => {
        const btn = document.getElementById(`btn-chart-${b}`);
        if (b === type) {
            btn?.classList.add('bg-white/10', 'text-white');
            btn?.classList.remove('text-gray-400');
        } else {
            btn?.classList.remove('bg-white/10', 'text-white');
            btn?.classList.add('text-gray-400');
        }
    });

    renderDistributionChart();
};

// ------------------------------------------
// 🚀 Dashboard Helpers & Navigation Hook
// ------------------------------------------
window.navigateFromDashboard = (tabId, subtabId) => {
    const navBtn = document.querySelector(`.nav-btn[data-target="${tabId}"]`);
    if (navBtn) {
        navBtn.click();
        
        if (subtabId) {
            setTimeout(() => {
                let subBtn = null;
                if (tabId === 'team-mgmt') {
                    subBtn = document.querySelector(`.teams-nav-btn[data-subtab="${subtabId}"]`);
                } else if (tabId === 'project-audit') {
                    subBtn = document.querySelector(`.audit-tab-btn[data-tab="${subtabId}"]`);
                } else if (tabId === 'content-mgmt') {
                    subBtn = document.querySelector(`.cm-nav-btn[data-level="${subtabId}"]`);
                }
                
                if (subBtn) {
                    subBtn.click();
                }
            }, 200);
        }
    }
};

window.dashQuickAction = (action) => {
    if (action === 'add-phase') {
        window.navigateFromDashboard('content-mgmt', 'phases');
        setTimeout(() => {
            if (typeof window.cmOpenModal === 'function') window.cmOpenModal();
        }, 300);
    } else if (action === 'add-course') {
        window.navigateFromDashboard('content-mgmt', 'courses');
        setTimeout(() => {
            if (typeof window.cmOpenModal === 'function') window.cmOpenModal();
        }, 300);
    } else if (action === 'add-quiz') {
        window.navigateFromDashboard('content-mgmt', 'quizzes');
        setTimeout(() => {
            if (typeof window.cmOpenModal === 'function') window.cmOpenModal();
        }, 300);
    } else if (action === 'add-project') {
        window.navigateFromDashboard('content-mgmt', 'projects');
        setTimeout(() => {
            if (typeof window.cmOpenModal === 'function') window.cmOpenModal();
        }, 300);
    } else if (action === 'create-admin') {
        document.getElementById('btn-add-admin')?.click();
    } else if (action === 'create-notif') {
        document.getElementById('global-send-notification-modal').classList.remove('hidden');
        populateGlobalNotifFormLists();
    } else if (action === 'review-projects') {
        window.navigateFromDashboard('project-audit', 'pending-review');
    } else if (action === 'review-teams') {
        window.navigateFromDashboard('team-mgmt', 'team-requests');
    }
};

function populateGlobalNotifFormLists() {
    const teamSelect = document.getElementById('global-notif-team-id');
    const userSelect = document.getElementById('global-notif-user-id');
    
    if (teamSelect) {
        teamSelect.innerHTML = allTeams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }
    
    if (userSelect) {
        const studentOrLeader = (allAdmins || []).concat(allUsers || []).filter(u => ['student', 'leader', 'admin'].includes(String(u.role).toLowerCase()));
        const uniqueUsers = [];
        const seen = new Set();
        studentOrLeader.forEach(u => {
            if (u.id && !seen.has(u.id)) {
                seen.add(u.id);
                uniqueUsers.push(u);
            }
        });
        userSelect.innerHTML = uniqueUsers.map(u => `<option value="${u.id}">${u.full_name || u.email} (${u.role})</option>`).join('');
    }
}

window.onGlobalNotifTargetChange = () => {
    const type = document.getElementById('global-notif-target-type').value;
    const teamWrapper = document.getElementById('global-notif-team-wrapper');
    const userWrapper = document.getElementById('global-notif-user-wrapper');
    
    if (type === 'all') {
        teamWrapper.classList.add('hidden');
        userWrapper.classList.add('hidden');
    } else if (type === 'team') {
        teamWrapper.classList.remove('hidden');
        userWrapper.classList.add('hidden');
    } else if (type === 'user') {
        teamWrapper.classList.add('hidden');
        userWrapper.classList.remove('hidden');
    }
};

window.submitGlobalNotification = async (e) => {
    e.preventDefault();
    const form = document.getElementById('global-send-notification-form');
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
    submitBtn.disabled = true;

    try {
        const targetType = document.getElementById('global-notif-target-type').value;
        const title = document.getElementById('global-notif-title').value;
        const type = document.getElementById('global-notif-type').value;
        const content = document.getElementById('global-notif-content').value;

        let target_team_id = null;
        let target_leader_id = null;

        if (targetType === 'team') {
            target_team_id = document.getElementById('global-notif-team-id').value;
        } else if (targetType === 'user') {
            target_leader_id = document.getElementById('global-notif-user-id').value;
        }

        const { error } = await supabase.from('system_notifications').insert([{
            title: title,
            content: content,
            type: type,
            target_team_id: target_team_id,
            target_leader_id: target_leader_id,
            is_read: false
        }]);

        if (error) throw error;

        showToast("تم إرسال الإشعار بنجاح!", "success");
        document.getElementById('global-send-notification-modal').classList.add('hidden');
        form.reset();
    } catch (err) {
        console.error("Global Send Notification Error:", err);
        showToast("فشل إرسال الإشعار: " + err.message, "error");
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
};
