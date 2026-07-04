import { supabase } from '../../js/supabase-config.js';

// ==========================================
// 🚀 UNIFIED TEAM MANAGEMENT CONTROLLER
// ==========================================

let allTeams = [];
let teamRequestsData = [];
let teamInvitationsData = [];
let teamActivitiesData = [];
let tracksMap = {};
let tracksList = [];
let coursesList = [];
let profilesList = [];
let projectsList = [];
let quizzesList = [];
let selectedTeam = null;

// Initialize when tab is opened
window.initTeamMgmt = async () => {
    setupSubtabs();
    setupDetailTabs();
    
    // Load initial lookup lists
    await loadInitialLookups();
    
    // Fetch and render teams first (default view)
    await window.fetchTeams();
};

// 1. Setup Navigation Event Listeners
function setupSubtabs() {
    const btns = document.querySelectorAll('.teams-nav-btn');
    const panes = document.querySelectorAll('.teams-subtab-content');
    
    btns.forEach(btn => {
        // Remove existing listeners to avoid duplicates
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', () => {
            const target = newBtn.getAttribute('data-subtab');
            
            // Toggle active classes
            document.querySelectorAll('.teams-nav-btn').forEach(b => {
                b.classList.remove('bg-white/10', 'text-white', 'active');
                b.classList.add('text-gray-400', 'hover:bg-white/5', 'hover:text-white');
            });
            document.querySelectorAll('.teams-subtab-content').forEach(p => p.classList.add('hidden'));
            
            newBtn.classList.add('bg-white/10', 'text-white', 'active');
            newBtn.classList.remove('text-gray-400', 'hover:bg-white/5', 'hover:text-white');
            
            const pane = document.getElementById(`subtab-${target}`);
            if (pane) pane.classList.remove('hidden');
            
            // Load specific data
            if (target === 'teams') {
                window.fetchTeams();
            } else if (target === 'team-requests') {
                window.fetchTeamRequests();
            } else if (target === 'team-invitations') {
                window.fetchTeamInvitations();
            } else if (target === 'team-activity') {
                window.fetchTeamActivities();
            }
        });
    });
}

function setupDetailTabs() {
    const btns = document.querySelectorAll('.td-nav-btn');
    btns.forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', () => {
            const targetTab = newBtn.getAttribute('data-tab');
            
            document.querySelectorAll('.td-nav-btn').forEach(b => {
                b.classList.remove('bg-white/5', 'text-teal-400', 'border-r-2', 'border-teal-500', 'active');
                b.classList.add('text-gray-400', 'hover:bg-white/5', 'hover:text-white');
            });
            document.querySelectorAll('.td-pane').forEach(p => p.classList.add('hidden'));
            
            newBtn.classList.add('bg-white/5', 'text-teal-400', 'border-r-2', 'border-teal-500', 'active');
            newBtn.classList.remove('text-gray-400', 'hover:bg-white/5', 'hover:text-white');
            
            const pane = document.getElementById(`td-pane-${targetTab}`);
            if (pane) pane.classList.remove('hidden');
            
            // Load detail subtab data
            loadTeamDetailTabContent(targetTab);
        });
    });
}

// 2. Load Lookups & System Data
async function loadInitialLookups() {
    try {
        const [tracksRes, coursesRes, profilesRes, projectsRes, quizzesRes] = await Promise.all([
            supabase.from('tracks').select('*').order('name'),
            supabase.from('courses').select('*').order('title'),
            supabase.from('profiles').select('*'),
            supabase.from('projects').select('*'),
            supabase.from('quizzes').select('*')
        ]);
        
        tracksList = tracksRes.data || [];
        coursesList = coursesRes.data || [];
        profilesList = profilesRes.data || [];
        projectsList = projectsRes.data || [];
        quizzesList = quizzesRes.data || [];
        
        tracksMap = {};
        tracksList.forEach(t => tracksMap[t.id] = t.name);
        
        // Populate track dropdown filters and modals
        populateTrackDropdowns();
    } catch (err) {
        console.error("Error loading lookups:", err);
    }
}

function populateTrackDropdowns() {
    const editTrackSelect = document.getElementById('edit-team-track');
    const filterTrackSelect = document.getElementById('teams-track-filter');
    
    if (editTrackSelect) {
        editTrackSelect.innerHTML = tracksList.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }
    if (filterTrackSelect) {
        filterTrackSelect.innerHTML = '<option value="all">كل التراكات</option>' + 
            tracksList.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }
}

// 3. Imgur Helper
function resolveImageUrl(url) {
    if (!url) return `https://ui-avatars.com/api/?name=Team&background=006A67&color=fff&size=100`;
    return url;
}

// ==========================================
// 🚀 TAB 1: TEAMS MANAGER
// ==========================================

window.fetchTeams = async () => {
    const tbody = document.getElementById('teams-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="p-10 text-center"><i class="fas fa-spinner fa-spin text-teal-500 text-2xl"></i></td></tr>`;
    
    try {
        // Fetch teams
        const { data, error } = await supabase
            .from('teams')
            .select('*, leader:profiles!teams_leader_id_fkey(id, full_name, email)')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        allTeams = data || [];
        
        // Reload profiles list to keep count updated
        const { data: profs } = await supabase.from('profiles').select('*');
        if (profs) profilesList = profs;
        
        updateTeamOverviewStats();
        populateUniDropdownFilter();
        window.filterTeams();
    } catch (err) {
        console.error("Fetch Teams Error:", err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="p-10 text-center text-red-500">حدث خطأ أثناء جلب بيانات الفرق.</td></tr>`;
    }
};

function updateTeamOverviewStats() {
    const totalTeams = allTeams.length;
    const activeTeams = allTeams.filter(t => t.status !== 'frozen').length;
    const frozenTeams = allTeams.filter(t => t.status === 'frozen').length;
    const totalMembers = profilesList.filter(p => p.team_id !== null).length;
    
    setText('stat-total-teams-count', totalTeams);
    setText('stat-active-teams-count', activeTeams);
    setText('stat-frozen-teams-count', frozenTeams);
    setText('stat-team-members-count', totalMembers);
}

function populateUniDropdownFilter() {
    const select = document.getElementById('teams-uni-filter');
    if (!select) return;
    
    const unis = [...new Set(allTeams.map(t => t.university).filter(Boolean))];
    select.innerHTML = '<option value="all">كل الجامعات</option>' + 
        unis.map(u => `<option value="${u}">${u}</option>`).join('');
}

window.filterTeams = () => {
    const search = (document.getElementById('teams-search')?.value || '').toLowerCase().trim();
    const uni = document.getElementById('teams-uni-filter')?.value || 'all';
    const track = document.getElementById('teams-track-filter')?.value || 'all';
    const status = document.getElementById('teams-status-filter')?.value || 'all';
    
    const filtered = allTeams.filter(t => {
        const leaderName = t.leader?.full_name || '';
        const matchSearch = t.name.toLowerCase().includes(search) || 
                            leaderName.toLowerCase().includes(search) || 
                            t.id.toLowerCase().includes(search);
                            
        const matchUni = uni === 'all' || t.university === uni;
        const matchTrack = track === 'all' || t.specialization === track;
        
        const isFrozen = t.status === 'frozen';
        const matchStatus = status === 'all' || 
                            (status === 'frozen' && isFrozen) || 
                            (status === 'active' && !isFrozen);
                            
        return matchSearch && matchUni && matchTrack && matchStatus;
    });
    
    renderTeamsTable(filtered);
};

function renderTeamsTable(data) {
    const tbody = document.getElementById('teams-table-body');
    if (!tbody) return;
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="p-10 text-center text-gray-500">لا توجد فرق تطابق محددات البحث.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = data.map(t => {
        const logo = resolveImageUrl(t.logo_url);
        const leaderName = t.leader?.full_name || 'بدون قائد';
        const membersCount = profilesList.filter(p => p.team_id === t.id).length;
        const createdDate = new Date(t.created_at).toLocaleDateString('ar-EG');
        
        // Count active courses and tasks
        const coursesCount = Array.isArray(t.courses_plan) ? t.courses_plan.length : 0;
        const tasksCount = Array.isArray(t.weekly_tasks) ? t.weekly_tasks.length : 0;
        
        const isFrozen = t.status === 'frozen';
        const statusBadge = isFrozen ? 
            `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400">مجمد</span>` :
            `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400">نشط</span>`;
            
        // Check deletion permission
        const isAdminOwner = window.getAdminProfile()?.role?.toLowerCase() === 'owner';
        const hasDeletePerm = window.hasPermission('teams:delete');
        const showDeleteBtn = isAdminOwner || hasDeletePerm;
        
        let actionButtons = `
            <button onclick="window.openTeamDetails('${t.id}')" class="text-teal-400 hover:text-teal-300 p-1" title="عرض التفاصيل"><i class="fas fa-eye"></i></button>
            <button onclick="window.openEditTeamModalDirect('${t.id}')" class="text-blue-400 hover:text-blue-300 p-1" title="تعديل البيانات"><i class="fas fa-edit"></i></button>
            <button onclick="window.openManageMembersModalDirect('${t.id}')" class="text-teal-400 hover:text-teal-300 p-1" title="إدارة الأعضاء"><i class="fas fa-users-gear"></i></button>
        `;
        
        if (isFrozen) {
            actionButtons += `<button onclick="window.toggleTeamFreezeStatusDirect('${t.id}', 'active')" class="text-green-500 hover:text-green-400 p-1" title="تفعيل النشاط"><i class="fas fa-play"></i></button>`;
        } else {
            actionButtons += `<button onclick="window.toggleTeamFreezeStatusDirect('${t.id}', 'frozen')" class="text-red-500 hover:text-red-400 p-1" title="تجميد النشاط"><i class="fas fa-pause"></i></button>`;
        }
        
        if (showDeleteBtn) {
            actionButtons += `<button onclick="window.deleteTeamAccountDirect('${t.id}')" class="text-red-500 hover:text-red-400 p-1" title="حذف الفريق"><i class="fas fa-trash-can"></i></button>`;
        }
        
        return `
            <tr class="hover:bg-white/5 transition-colors border-b border-white/5">
                <td class="p-4 flex items-center gap-3">
                    <img src="${logo}" class="w-9 h-9 rounded-xl object-cover border border-white/10" referrerPolicy="no-referrer">
                    <span class="font-bold text-white">${t.name}</span>
                </td>
                <td class="p-4 text-center font-semibold text-gray-300 text-xs">${leaderName}</td>
                <td class="p-4 text-center text-gray-300 text-xs">${t.university || '--'}</td>
                <td class="p-4 text-center font-bold text-white text-xs">${membersCount} أعضاء</td>
                <td class="p-4 text-center text-teal-400 font-bold text-xs">${tracksMap[t.specialization] || 'تخصص عام'}</td>
                <td class="p-4 text-center font-mono font-bold text-yellow-500 text-xs">${t.total_score || 0}</td>
                <td class="p-4 text-center font-semibold text-gray-300 text-xs">${coursesCount} كورس</td>
                <td class="p-4 text-center font-semibold text-gray-300 text-xs">${tasksCount} مهام</td>
                <td class="p-4 text-center font-mono text-gray-500 text-xs">${createdDate}</td>
                <td class="p-4 text-center">${statusBadge}</td>
                <td class="p-4 text-left"><div class="flex items-center justify-end gap-2.5">${actionButtons}</div></td>
            </tr>
        `;
    }).join('');
}

// ==========================================
// 🚀 TAB 2: TEAM REQUESTS ENGINE
// ==========================================

window.fetchTeamRequests = async () => {
    const tbody = document.getElementById('team-requests-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center"><i class="fas fa-spinner fa-spin text-teal-500 text-2xl"></i></td></tr>`;
    
    try {
        const { data, error } = await supabase
            .from('team_requests')
            .select('*, requester:profiles!team_requests_requester_id_fkey(id, full_name, email)')
            .order('submitted_at', { ascending: false });
            
        if (error) throw error;
        
        teamRequestsData = data || [];
        updateTeamRequestsStats();
        window.filterTeamRequests();
    } catch (err) {
        console.error("Fetch Team Requests Error:", err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-red-500">حدث خطأ أثناء جلب الطلبات.</td></tr>`;
    }
};

function updateTeamRequestsStats() {
    setText('stat-total-teams', teamRequestsData.length);
    setText('stat-pending-teams', teamRequestsData.filter(t => t.status === 'pending').length);
    setText('stat-accepted-teams', teamRequestsData.filter(t => t.status === 'approved').length);
    setText('stat-rejected-teams', teamRequestsData.filter(t => t.status === 'rejected').length);
    setText('stat-archived-teams', teamRequestsData.filter(t => t.status === 'archived').length);
}

window.filterTeamRequests = () => {
    const search = (document.getElementById('team-filter-search')?.value || '').toLowerCase().trim();
    const status = document.getElementById('team-filter-status')?.value || 'all';
    
    const filtered = teamRequestsData.filter(req => {
        const leaderName = req.requester?.full_name || '';
        const uni = req.university || '';
        const matchSearch = req.team_name.toLowerCase().includes(search) || 
                            leaderName.toLowerCase().includes(search) || 
                            uni.toLowerCase().includes(search);
                            
        const matchStatus = status === 'all' || req.status === status;
        return matchSearch && matchStatus;
    });
    
    renderTeamRequestsTable(filtered);
};

function renderTeamRequestsTable(data) {
    const tbody = document.getElementById('team-requests-table-body');
    if (!tbody) return;
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-gray-500">لا توجد طلبات مطابقة للبحث.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = data.map(req => {
        const submittedDate = new Date(req.submitted_at).toLocaleDateString('ar-EG');
        const leaderName = req.requester?.full_name || 'غير معروف';
        
        let statusBadge = '';
        if (req.status === 'approved') {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400">معتمد</span>`;
        } else if (req.status === 'rejected') {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400">مرفوض</span>`;
        } else if (req.status === 'archived') {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/10 border border-gray-500/20 text-gray-400">مؤرشف</span>`;
        } else {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">قيد المراجعة</span>`;
        }
        
        return `
            <tr class="hover:bg-white/5 transition-colors border-b border-white/5">
                <td class="p-4">
                    <div class="font-bold text-white text-xs">${leaderName}</div>
                    <div class="text-[10px] text-gray-500 font-mono mt-1">${req.requester?.email || ''}</div>
                </td>
                <td class="p-4 text-center font-bold text-gray-200 text-xs">${req.team_name}</td>
                <td class="p-4 text-center text-xs text-gray-300">${req.university || ''}</td>
                <td class="p-4 text-center text-xs font-mono text-gray-500">${submittedDate}</td>
                <td class="p-4 text-center">${statusBadge}</td>
                <td class="p-4 text-center">
                    <button onclick="window.openTeamRequestDetails('${req.id}')" class="px-3 py-1.5 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white transition-all text-xs font-bold border border-teal-500/20">
                        عرض التفاصيل
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.openTeamRequestDetails = (id) => {
    const req = teamRequestsData.find(r => r.id === id);
    if (!req) return;
    
    document.getElementById('modal-current-team-req-id').value = id;
    document.getElementById('modal-team-req-name').innerText = req.team_name;
    document.getElementById('modal-team-req-leader-email').innerText = req.requester?.email || 'بدون إيميل';
    
    const badge = document.getElementById('modal-team-req-status-badge');
    badge.className = `px-3 py-1 rounded-lg text-xs font-bold ${
        req.status === 'approved' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 
        req.status === 'rejected' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
        req.status === 'archived' ? 'bg-gray-500/10 text-gray-400 border border-gray-500/20' :
        'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
    }`;
    badge.innerText = req.status === 'approved' ? 'معتمد' : 
                      req.status === 'rejected' ? 'مرفوض' : 
                      req.status === 'archived' ? 'مؤرشف' : 'قيد المراجعة';
                      
    const previewImg = document.getElementById('modal-team-req-logo-preview');
    previewImg.src = resolveImageUrl(req.logo_url);
    
    const logoLink = document.getElementById('modal-team-req-logo-link');
    if (req.logo_url) {
        logoLink.href = req.logo_url;
        logoLink.classList.remove('hidden');
    } else {
        logoLink.classList.add('hidden');
    }
    
    document.getElementById('modal-team-req-leader-name').innerText = req.requester?.full_name || 'غير معروف';
    document.getElementById('modal-team-req-date').innerText = new Date(req.submitted_at).toLocaleString('ar-EG');
    document.getElementById('modal-team-req-uni').innerText = req.university || '--';
    document.getElementById('modal-team-req-gov').innerText = req.governorate || '--';
    document.getElementById('modal-team-req-spec').innerText = tracksMap[req.specialization] || req.specialization || '--';
    document.getElementById('modal-team-req-size').innerText = req.expected_size ? `${req.expected_size} أفراد` : '--';
    document.getElementById('modal-team-req-gpa').innerText = req.leader_gpa || '--';
    document.getElementById('modal-team-req-reason').innerText = req.reason || '--';
    document.getElementById('modal-team-req-notes').value = req.rejection_reason || '';
    
    document.getElementById('team-request-details-modal').classList.remove('hidden');
};

window.updateTeamRequestStatus = async (newStatus) => {
    const reqId = document.getElementById('modal-current-team-req-id').value;
    const notes = document.getElementById('modal-team-req-notes').value.trim();
    if (!reqId) return;
    
    const req = teamRequestsData.find(r => r.id === reqId);
    if (!req) return;
    
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("لم يتم العثور على جلسة المشرف الفعالة");
        
        if (newStatus === 'approved') {
            // Check if specialization exists as a valid track UUID
            let specUuid = null;
            const validTrack = tracksList.find(t => t.id === req.specialization || t.name === req.specialization);
            if (validTrack) specUuid = validTrack.id;
            
            // 1. Create team
            const { data: teamData, error: teamErr } = await supabase
                .from('teams')
                .insert([{
                    name: req.team_name,
                    logo_url: req.logo_url,
                    university: req.university,
                    governorate: req.governorate,
                    leader_id: req.requester_id,
                    specialization: specUuid,
                    total_score: 0,
                    courses_plan: [],
                    weekly_tasks: [],
                    requests: []
                }])
                .select()
                .single();
                
            if (teamErr) throw teamErr;
            
            // 2. Update leader profile
            const { error: profErr } = await supabase
                .from('profiles')
                .update({
                    team_id: teamData.id,
                    role: 'leader'
                })
                .eq('id', req.requester_id);
                
            if (profErr) throw profErr;
            
            // 3. Welcome announcements post
            const welcomePost = {
                team_id: teamData.id,
                type: 'announcement',
                title: 'مرحباً بكم في الفريق! 🚀',
                content: `تم اعتماد وتأسيس الفريق الإرشادي بقيادة ${req.requester?.full_name || 'القائد المقترح'}. نتمنى لكم مسيرة تعليمية ممتازة ومليئة بالإنجازات والتقدم في المجالات الهندسية!`,
                creator_name: 'إدارة منصة بُصْلَة',
                is_pinned: true,
                target_members: ['all']
            };
            await supabase.from('team_posts').insert([welcomePost]);
            
            // 4. Send leader notification
            await supabase.from('system_notifications').insert([{
                user_id: req.requester_id,
                title: '✅ تم اعتماد طلب تأسيس فريقك!',
                message: `تهانينا! تمت الموافقة على تأسيس فريق "${req.team_name}" وتعيينك قائداً له. يمكنك الآن البدء في دعوة الطلاب وإسناد الكورسات وإدارة الفريق من لوحتك.`,
                type: 'success'
            }]);
        } else if (newStatus === 'rejected' && !notes) {
            alert("يجب كتابة سبب الرفض في خانة الملاحظات.");
            return;
        }
        
        // Update request record
        const { error: reqErr } = await supabase
            .from('team_requests')
            .update({
                status: newStatus,
                rejection_reason: notes,
                reviewed_by: user.id,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', reqId);
            
        if (reqErr) throw reqErr;
        
        // Notify requester in case of rejection
        if (newStatus === 'rejected') {
            await supabase.from('system_notifications').insert([{
                user_id: req.requester_id,
                title: '❌ تم رفض طلب تأسيس الفريق',
                message: `نعتذر منك، لقد تم رفض طلب تأسيس فريقك للسبب التالي: ${notes}`,
                type: 'error'
            }]);
        }
        
        // Log action in audit logs
        await window.logAdminAction(
            newStatus === 'approved' ? 'teams:approve' : (newStatus === 'rejected' ? 'teams:reject' : 'teams:archive'),
            req.team_name,
            `Requester: ${req.requester?.full_name || ''}. Notes: ${notes}`
        );
        
        alert("تم تحديث حالة الطلب بنجاح.");
        document.getElementById('team-request-details-modal').classList.add('hidden');
        window.fetchTeamRequests();
    } catch (err) {
        console.error("Update Request Error:", err);
        alert("فشل تحديث الطلب: " + err.message);
    }
};

// ==========================================
// 🚀 TAB 3: TEAM INVITATIONS ENGINE
// ==========================================

window.fetchTeamInvitations = async () => {
    const tbody = document.getElementById('team-invitations-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="p-10 text-center"><i class="fas fa-spinner fa-spin text-teal-500 text-2xl"></i></td></tr>`;
    
    try {
        const { data, error } = await supabase
            .from('team_invitations')
            .select('*, teams!team_invitations_from_team_id_fkey(name), leader:profiles!team_invitations_from_leader_id_fkey(full_name, email), invitee:profiles!team_invitations_to_uid_fkey(full_name, email)')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        teamInvitationsData = data || [];
        window.filterTeamInvitations();
    } catch (err) {
        console.error("Fetch Invitations Error:", err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="p-10 text-center text-red-500">حدث خطأ أثناء جلب دعوات الانضمام.</td></tr>`;
    }
};

window.filterTeamInvitations = () => {
    const search = (document.getElementById('team-invitations-search')?.value || '').toLowerCase().trim();
    const status = document.getElementById('team-invitations-status')?.value || 'all';
    
    const filtered = teamInvitationsData.filter(inv => {
        const teamName = inv.teams?.name || '';
        const leaderName = inv.leader?.full_name || '';
        const inviteeName = inv.invitee?.full_name || inv.to_name || '';
        const inviteeEmail = inv.invitee?.email || inv.to_email || '';
        
        const matchSearch = teamName.toLowerCase().includes(search) || 
                            leaderName.toLowerCase().includes(search) || 
                            inviteeName.toLowerCase().includes(search) || 
                            inviteeEmail.toLowerCase().includes(search);
                            
        const matchStatus = status === 'all' || inv.status === status;
        return matchSearch && matchStatus;
    });
    
    renderInvitationsTable(filtered);
};

function renderInvitationsTable(data) {
    const tbody = document.getElementById('team-invitations-table-body');
    if (!tbody) return;
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-10 text-center text-gray-500">لا توجد دعوات مطابقة للبحث.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = data.map(inv => {
        const sentDate = new Date(inv.created_at).toLocaleDateString('ar-EG');
        const teamName = inv.teams?.name || 'فريق محذوف';
        const sender = inv.leader?.full_name || 'ليدر غير معروف';
        
        const recipientName = inv.invitee?.full_name || inv.to_name || 'طالب مسجل حديثاً';
        const recipientEmail = inv.invitee?.email || inv.to_email || '';
        
        let statusBadge = '';
        let responseDateText = '--';
        
        if (inv.status === 'accepted') {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400">مقبولة</span>`;
            responseDateText = 'تم القبول';
        } else if (inv.status === 'rejected') {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400">مرفوضة</span>`;
            responseDateText = 'تم الرفض';
        } else {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">قيد الانتظار</span>`;
        }
        
        const actions = `
            <button onclick="window.resendInvitation('${inv.id}')" class="text-teal-400 hover:text-teal-300 p-1" title="إعادة إرسال"><i class="fas fa-sync-alt"></i></button>
            <button onclick="window.cancelInvitation('${inv.id}')" class="text-red-500 hover:text-red-400 p-1" title="إلغاء الدعوة"><i class="fas fa-times-circle"></i></button>
        `;
        
        return `
            <tr class="hover:bg-white/5 transition-colors border-b border-white/5">
                <td class="p-4 font-bold text-white text-xs">${teamName}</td>
                <td class="p-4 text-center text-xs text-gray-300">${sender}</td>
                <td class="p-4 text-center">
                    <div class="text-xs text-white font-semibold">${recipientName}</div>
                    <div class="text-[10px] text-gray-500 font-mono mt-0.5">${recipientEmail}</div>
                </td>
                <td class="p-4 text-center text-xs font-mono text-gray-500">${sentDate}</td>
                <td class="p-4 text-center">${statusBadge}</td>
                <td class="p-4 text-center text-xs text-gray-400 font-semibold">${responseDateText}</td>
                <td class="p-4 text-left"><div class="flex items-center justify-end gap-2.5">${actions}</div></td>
            </tr>
        `;
    }).join('');
}

window.resendInvitation = async (id) => {
    try {
        const { error } = await supabase
            .from('team_invitations')
            .update({ created_at: new Date().toISOString() })
            .eq('id', id);
            
        if (error) throw error;
        
        alert("تمت إعادة إرسال الدعوة وتحديث تاريخها بنجاح.");
        window.fetchTeamInvitations();
    } catch (err) {
        console.error("Resend Invitation Error:", err);
        alert("فشل إعادة إرسال الدعوة: " + err.message);
    }
};

window.cancelInvitation = async (id) => {
    const confirmed = await window.showCustomConfirm(
        "إلغاء وحذف الدعوة",
        "هل أنت متأكد من إلغاء وحذف هذه الدعوة؟",
        null,
        null,
        'danger'
    );
    if (!confirmed) return;
    try {
        const { error } = await supabase
            .from('team_invitations')
            .delete()
            .eq('id', id);
            
        if (error) throw error;
        
        alert("تم إلغاء وحذف الدعوة بنجاح.");
        window.fetchTeamInvitations();
    } catch (err) {
        console.error("Cancel Invitation Error:", err);
        alert("فشل إلغاء الدعوة: " + err.message);
    }
};

// ==========================================
// 🚀 TAB 4: TEAM ACTIVITY TIMELINE ENGINE
// ==========================================

window.fetchTeamActivities = async () => {
    const list = document.getElementById('team-activity-list');
    if (list) list.innerHTML = `<div class="text-center p-8 text-gray-500"><i class="fas fa-spinner fa-spin text-teal-500 text-2xl mr-2"></i> جاري تحميل سجل الأنشطة...</div>`;
    
    try {
        // Fetch audit logs that relate to teams
        const { data: auditLogs, error } = await supabase
            .from('audit_logs')
            .select('*')
            .or('action.ilike.teams:%,action.ilike.team:%')
            .order('created_at', { ascending: false })
            .limit(50);
            
        if (error) throw error;
        
        teamActivitiesData = auditLogs || [];
        window.filterTeamActivities();
    } catch (err) {
        console.error("Fetch Activities Error:", err);
        if (list) list.innerHTML = `<div class="text-center p-8 text-red-500">حدث خطأ أثناء تحميل سجل الأنشطة.</div>`;
    }
};

window.filterTeamActivities = () => {
    const search = (document.getElementById('team-activity-search')?.value || '').toLowerCase().trim();
    
    const filtered = teamActivitiesData.filter(log => {
        const action = log.action || '';
        const target = log.target || '';
        const details = log.details || '';
        const adminName = log.admin_name || '';
        
        return action.toLowerCase().includes(search) || 
               target.toLowerCase().includes(search) || 
               details.toLowerCase().includes(search) || 
               adminName.toLowerCase().includes(search);
    });
    
    renderTeamActivitiesTimeline(filtered);
};

function renderTeamActivitiesTimeline(data) {
    const container = document.getElementById('team-activity-list');
    if (!container) return;
    
    if (data.length === 0) {
        container.innerHTML = `<div class="text-center p-8 text-gray-500">لا يوجد أنشطة مطابقة للبحث حالياً.</div>`;
        return;
    }
    
    container.innerHTML = data.map(log => {
        const time = new Date(log.created_at).toLocaleString('ar-EG');
        const admin = log.admin_name || 'مشرف النظام';
        
        let actionIcon = '<i class="fas fa-circle-dot text-teal-500"></i>';
        let actionColor = 'text-teal-400';
        
        if (log.action.includes('delete')) {
            actionIcon = '<i class="fas fa-trash-can text-red-500"></i>';
            actionColor = 'text-red-400';
        } else if (log.action.includes('approve') || log.action.includes('create')) {
            actionIcon = '<i class="fas fa-circle-check text-green-500"></i>';
            actionColor = 'text-green-400';
        } else if (log.action.includes('freeze')) {
            actionIcon = '<i class="fas fa-pause-circle text-orange-500"></i>';
            actionColor = 'text-orange-400';
        } else if (log.action.includes('edit')) {
            actionIcon = '<i class="fas fa-edit text-blue-500"></i>';
            actionColor = 'text-blue-400';
        }
        
        return `
            <div class="relative pl-6 pb-6 border-r border-white/10 last:pb-0">
                <!-- Marker -->
                <div class="absolute -right-[11px] top-1.5 w-5 h-5 rounded-full bg-black border-2 border-white/20 flex items-center justify-center text-[10px]">
                    ${actionIcon}
                </div>
                <!-- Content -->
                <div class="bg-white/5 border border-white/5 rounded-xl p-4 mr-2">
                    <div class="flex justify-between items-start gap-4">
                        <span class="text-xs font-bold ${actionColor}">${log.action}</span>
                        <span class="text-[10px] text-gray-500 font-mono">${time}</span>
                    </div>
                    <div class="text-xs text-white font-bold mt-2">المستهدف: ${log.target}</div>
                    <p class="text-xs text-gray-400 mt-1 leading-relaxed">${log.details || 'لا توجد تفاصيل إضافية.'}</p>
                    <div class="text-[9px] text-gray-500 mt-2 font-semibold">بواسطة: ${admin}</div>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// 🚀 DETAILED TEAM VIEW MODAL (7 TABS)
// ==========================================

window.openTeamDetails = async (teamId) => {
    selectedTeam = allTeams.find(t => t.id === teamId);
    if (!selectedTeam) return;
    
    document.getElementById('td-current-team-id').value = teamId;
    
    // Header
    const logo = resolveImageUrl(selectedTeam.logo_url);
    document.getElementById('td-logo').src = logo;
    document.getElementById('td-name').innerText = selectedTeam.name;
    document.getElementById('td-track').innerText = tracksMap[selectedTeam.specialization] || 'تخصص عام / تراك غير محدد';
    
    // Clear details first
    document.querySelectorAll('.td-pane').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.td-nav-btn').forEach(b => {
        b.classList.remove('bg-white/5', 'text-teal-400', 'border-r-2', 'border-teal-500', 'active');
        b.classList.add('text-gray-400', 'hover:bg-white/5', 'hover:text-white');
    });
    
    // Trigger Info tab by default
    const infoBtn = document.querySelector('.td-nav-btn[data-tab="info"]');
    if (infoBtn) {
        infoBtn.classList.add('bg-white/5', 'text-teal-400', 'border-r-2', 'border-teal-500', 'active');
        infoBtn.classList.remove('text-gray-400');
    }
    document.getElementById('td-pane-info').classList.remove('hidden');
    
    // Show modal
    document.getElementById('team-details-modal').classList.remove('hidden');
    
    // Load tab 1
    await loadTeamDetailTabContent('info');
};

async function loadTeamDetailTabContent(tab) {
    const teamId = document.getElementById('td-current-team-id').value;
    if (!teamId || !selectedTeam) return;
    
    if (tab === 'info') {
        const leaderName = selectedTeam.leader?.full_name || 'بدون قائد';
        const membersCount = profilesList.filter(p => p.team_id === teamId).length;
        const createdDate = new Date(selectedTeam.created_at).toLocaleDateString('ar-EG');
        
        const isFrozen = selectedTeam.status === 'frozen';
        const statusText = isFrozen ? '🔴 مجمد وموقوف النشاط' : '🟢 نشط فعال';
        const statusColor = isFrozen ? 'text-red-400' : 'text-green-400';
        
        // Find team leaderboard rank
        const sortedTeams = [...allTeams].sort((a,b) => (b.total_score || 0) - (a.total_score || 0));
        const rankIndex = sortedTeams.findIndex(t => t.id === teamId) + 1;
        
        setText('td-info-uni', selectedTeam.university || '--');
        setText('td-info-gov', selectedTeam.governorate || '--');
        setText('td-info-created', createdDate);
        
        const statusEl = document.getElementById('td-info-status');
        if (statusEl) {
            statusEl.innerText = statusText;
            statusEl.className = `font-bold text-sm ${statusColor}`;
        }
        
        setText('td-info-leader', leaderName);
        setText('td-info-rank', rankIndex > 0 ? `# ${rankIndex} على المنصة` : '--');
        setText('td-info-members', `${membersCount} أعضاء`);
        setText('td-info-score', `${selectedTeam.total_score || 0} XP`);
        
        // Toggle action freeze button layout
        const freezeBtn = document.getElementById('td-btn-toggle-freeze');
        if (freezeBtn) {
            if (isFrozen) {
                freezeBtn.className = "px-4 py-2 bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white border border-green-500/20 rounded-xl text-xs font-bold transition-all";
                freezeBtn.innerHTML = '<i class="fas fa-play ml-1"></i> إعادة تنشيط وتفعيل الفريق';
            } else {
                freezeBtn.className = "px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-xl text-xs font-bold transition-all";
                freezeBtn.innerHTML = '<i class="fas fa-pause ml-1"></i> تجميد نشاط الفريق';
            }
        }
        
        // Delete button visibility
        const deleteBtn = document.getElementById('td-btn-delete');
        if (deleteBtn) {
            const isAdminOwner = window.getAdminProfile()?.role?.toLowerCase() === 'owner';
            const hasDeletePerm = window.hasPermission('teams:delete');
            if (isAdminOwner || hasDeletePerm) {
                deleteBtn.classList.remove('hidden');
            } else {
                deleteBtn.classList.add('hidden');
            }
        }
        
    } else if (tab === 'members') {
        const tbody = document.getElementById('td-members-table-body');
        tbody.innerHTML = `<tr><td colspan="7" class="p-10 text-center"><i class="fas fa-spinner fa-spin text-teal-500 text-xl mr-2"></i> جاري تحميل الأعضاء...</td></tr>`;
        
        try {
            // Load enrollments progress to compute progress
            const teamMembers = profilesList.filter(p => p.team_id === teamId);
            const memberIds = teamMembers.map(m => m.id);
            
            let enrolls = [];
            if (memberIds.length > 0) {
                const { data: enrollData } = await supabase
                    .from('enrollments')
                    .select('*')
                    .in('user_id', memberIds);
                enrolls = enrollData || [];
            }
            
            if (teamMembers.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="p-10 text-center text-gray-500">لا يوجد أعضاء مضافين للفريق حالياً.</td></tr>`;
                return;
            }
            
            tbody.innerHTML = teamMembers.map(m => {
                const avatar = m.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.full_name || 'S')}&background=006A67&color=fff&size=100`;
                
                // Get progress rate
                const userEnrolls = enrolls.filter(e => e.user_id === m.id);
                const avgProgress = userEnrolls.length > 0 ? 
                    Math.round(userEnrolls.reduce((sum, e) => sum + (e.progress || 0), 0) / userEnrolls.length) : 0;
                    
                const lastActivity = m.last_activity ? new Date(m.last_activity).toLocaleDateString('ar-EG') : 'بلا نشاط';
                
                let isLeaderBadge = m.id === selectedTeam.leader_id ? 
                    `<span class="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 text-[9px] px-1.5 py-0.5 rounded font-bold mr-2">قائد</span>` : '';
                    
                const isSuspended = (m.role || '').startsWith('suspended');
                const statusBadge = isSuspended ? 
                    `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400">موقوف</span>` :
                    `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400">نشط</span>`;
                    
                const actions = `
                    <button onclick="window.removeTeamMemberDirect('${m.id}')" class="px-2.5 py-1 text-xs bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 rounded-lg border border-red-500/20 font-bold transition-all">إزالة</button>
                    ${m.id !== selectedTeam.leader_id ? `<button onclick="window.makeLeaderDirect('${m.id}')" class="px-2.5 py-1 text-xs bg-yellow-500/10 hover:bg-yellow-500 hover:text-white text-yellow-500 rounded-lg border border-yellow-500/20 font-bold transition-all mr-1.5">تعيين قائد</button>` : ''}
                `;
                
                return `
                    <tr class="hover:bg-white/5 transition-colors border-b border-white/5">
                        <td class="p-4 flex items-center gap-3">
                            <img src="${avatar}" class="w-8 h-8 rounded-full object-cover border border-white/10" referrerPolicy="no-referrer">
                            <span class="font-bold text-white text-xs">${m.full_name || 'بلا اسم'} ${isLeaderBadge}</span>
                        </td>
                        <td class="p-4 text-center text-xs text-gray-300 font-bold">${m.current_rank || 'Newbie'}</td>
                        <td class="p-4 text-center text-xs text-yellow-500 font-mono font-bold">${m.total_xp || 0}</td>
                        <td class="p-4 text-center">
                            <div class="flex items-center justify-center gap-2">
                                <div class="w-16 bg-white/10 rounded-full h-1.5 overflow-hidden">
                                    <div class="bg-teal-500 h-full" style="width: ${avgProgress}%"></div>
                                </div>
                                <span class="text-xs font-bold text-gray-300 font-mono">${avgProgress}%</span>
                            </div>
                        </td>
                        <td class="p-4 text-center text-xs text-gray-500 font-mono">${lastActivity}</td>
                        <td class="p-4 text-center">${statusBadge}</td>
                        <td class="p-4 text-left"><div class="flex items-center justify-end gap-1.5">${actions}</div></td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error("Load Members Error:", err);
            tbody.innerHTML = `<tr><td colspan="7" class="p-10 text-center text-red-500">فشل تحميل قائمة الأعضاء.</td></tr>`;
        }
        
    } else if (tab === 'courses') {
        const tbody = document.getElementById('td-courses-table-body');
        tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center"><i class="fas fa-spinner fa-spin text-teal-500 text-xl mr-2"></i> جاري تحميل الكورسات...</td></tr>`;
        
        try {
            const courseIds = Array.isArray(selectedTeam.courses_plan) ? selectedTeam.courses_plan : [];
            const teamMembers = profilesList.filter(p => p.team_id === teamId);
            const memberIds = teamMembers.map(m => m.id);
            
            let enrolls = [];
            if (memberIds.length > 0 && courseIds.length > 0) {
                const { data } = await supabase
                    .from('enrollments')
                    .select('*')
                    .in('user_id', memberIds)
                    .in('course_id', courseIds);
                enrolls = data || [];
            }
            
            if (courseIds.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center text-gray-500">لم يتم إسناد أي كورس لخطة الفريق الدراسية بعد.</td></tr>`;
                return;
            }
            
            tbody.innerHTML = courseIds.map(cId => {
                const course = coursesList.find(c => c.id === cId || c.course_id === cId);
                const cName = course ? course.name : 'كورس غير معروف';
                const cTrack = course ? (tracksMap[course.track_id] || 'مسار عام') : '--';
                
                // Stats
                const courseEnrolls = enrolls.filter(e => e.course_id === cId);
                const enrolledCount = courseEnrolls.length;
                const completionRate = enrolledCount > 0 ? 
                    Math.round(courseEnrolls.reduce((sum, e) => sum + (e.progress || 0), 0) / enrolledCount) : 0;
                    
                return `
                    <tr class="hover:bg-white/5 transition-colors border-b border-white/5">
                        <td class="p-4 font-bold text-white text-xs">${cName}</td>
                        <td class="p-4 text-center text-xs text-teal-400 font-bold">${cTrack}</td>
                        <td class="p-4 text-center text-xs text-gray-300 font-bold">${enrolledCount} طلاب</td>
                        <td class="p-4 text-center">
                            <div class="flex items-center justify-center gap-2">
                                <div class="w-16 bg-white/10 rounded-full h-1.5 overflow-hidden">
                                    <div class="bg-purple-500 h-full" style="width: ${completionRate}%"></div>
                                </div>
                                <span class="text-xs font-bold text-gray-300 font-mono">${completionRate}%</span>
                            </div>
                        </td>
                        <td class="p-4 text-center text-xs text-gray-500 font-mono">--</td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error("Load Courses Error:", err);
            tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center text-red-500">فشل تحميل قائمة الكورسات.</td></tr>`;
        }
        
    } else if (tab === 'tasks') {
        const tbody = document.getElementById('td-tasks-table-body');
        tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center"><i class="fas fa-spinner fa-spin text-teal-500 text-xl mr-2"></i> جاري تحميل المهام...</td></tr>`;
        
        try {
            const { data, error } = await supabase
                .from('team_tasks')
                .select('*')
                .eq('team_id', teamId)
                .order('created_at', { ascending: false });
                
            if (error) throw error;
            
            if (!data || data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-gray-500">لا توجد مهام مسندة للفريق حالياً.</td></tr>`;
                return;
            }
            
            tbody.innerHTML = data.map(task => {
                const assignedDate = new Date(task.created_at).toLocaleDateString('ar-EG');
                const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('ar-EG') : 'بلا موعد تسليم';
                
                // Calculate completion rate from stats JSON
                const stats = task.stats || {};
                const total = stats.total_students || 0;
                const completed = stats.completed_count || 0;
                const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
                
                let taskIcon = '<i class="fas fa-tasks text-gray-400"></i>';
                if (task.type === 'video') taskIcon = '<i class="fas fa-play text-red-400"></i>';
                else if (task.type === 'quiz') taskIcon = '<i class="fas fa-question-circle text-yellow-400"></i>';
                else if (task.type === 'course_project') taskIcon = '<i class="fas fa-diagram-project text-purple-400"></i>';
                
                return `
                    <tr class="hover:bg-white/5 transition-colors border-b border-white/5">
                        <td class="p-4">
                            <div class="font-bold text-white text-xs flex items-center gap-2">
                                ${taskIcon}
                                <span>${task.title}</span>
                            </div>
                        </td>
                        <td class="p-4 text-center text-xs text-teal-400 font-bold">${task.type}</td>
                        <td class="p-4 text-center text-xs font-mono text-gray-500">${assignedDate}</td>
                        <td class="p-4 text-center text-xs font-mono text-gray-400">${dueDate}</td>
                        <td class="p-4 text-center">
                            <div class="flex items-center justify-center gap-2">
                                <div class="w-16 bg-white/10 rounded-full h-1.5 overflow-hidden">
                                    <div class="bg-teal-500 h-full" style="width: ${rate}%"></div>
                                </div>
                                <span class="text-xs font-bold text-gray-300 font-mono">${rate}%</span>
                            </div>
                        </td>
                        <td class="p-4 text-left">
                            <button onclick="window.deleteTeamTaskDirect('${task.id}')" class="px-2 py-1 text-xs bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 border border-red-500/20 font-bold rounded-lg transition-all"><i class="fas fa-trash-can"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error("Load Tasks Error:", err);
            tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-red-500">فشل تحميل المهام.</td></tr>`;
        }
        
    } else if (tab === 'posts') {
        const tbody = document.getElementById('td-posts-table-body');
        tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center"><i class="fas fa-spinner fa-spin text-teal-500 text-xl mr-2"></i> جاري تحميل الإعلانات...</td></tr>`;
        
        try {
            const { data, error } = await supabase
                .from('team_posts')
                .select('*')
                .eq('team_id', teamId)
                .order('created_at', { ascending: false });
                
            if (error) throw error;
            
            if (!data || data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center text-gray-500">لا يوجد إعلانات منشورة داخل الفريق حالياً.</td></tr>`;
                return;
            }
            
            tbody.innerHTML = data.map(post => {
                const date = new Date(post.created_at).toLocaleDateString('ar-EG');
                const seenCount = Array.isArray(post.seen_by) ? post.seen_by.length : 0;
                const author = post.creator_name || 'مشرف النظام';
                
                return `
                    <tr class="hover:bg-white/5 transition-colors border-b border-white/5">
                        <td class="p-4">
                            <div class="font-bold text-white text-xs truncate max-w-[200px]" title="${post.title}">${post.title}</div>
                        </td>
                        <td class="p-4 text-center text-xs font-mono text-gray-500">${date}</td>
                        <td class="p-4 text-center text-xs text-teal-400 font-bold">${author}</td>
                        <td class="p-4 text-center text-xs text-gray-300 font-bold">${seenCount} مشاهدة</td>
                        <td class="p-4 text-left">
                            <button onclick="window.deleteTeamPostDirect('${post.id}')" class="px-2 py-1 text-xs bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 border border-red-500/20 font-bold rounded-lg transition-all"><i class="fas fa-trash-can"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error("Load Posts Error:", err);
            tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center text-red-500">فشل تحميل الإعلانات.</td></tr>`;
        }
        
    } else if (tab === 'stats') {
        try {
            const teamMembers = profilesList.filter(p => p.team_id === teamId);
            const memberIds = teamMembers.map(m => m.id);
            
            let avgProgress = 0;
            let projectsCount = 0;
            let quizzesCount = 0;
            let completedTasks = 0;
            let completedVideos = 0;
            
            if (memberIds.length > 0) {
                // Fetch enrollments
                const { data: enrolls } = await supabase.from('enrollments').select('progress').in('user_id', memberIds);
                if (enrolls && enrolls.length > 0) {
                    avgProgress = Math.round(enrolls.reduce((sum, e) => sum + (e.progress || 0), 0) / enrolls.length);
                }
                
                // Fetch completed projects
                const { count: projCount } = await supabase
                    .from('project_submissions')
                    .select('*', { count: 'exact', head: true })
                    .in('user_id', memberIds)
                    .eq('status', 'graded');
                projectsCount = projCount || 0;
                
                // Fetch completed quizzes
                const { count: quizCount } = await supabase
                    .from('quiz_attempts')
                    .select('*', { count: 'exact', head: true })
                    .in('user_id', memberIds)
                    .eq('passed', true);
                quizzesCount = quizCount || 0;
                
                // Fetch completed materials
                const { count: vidCount } = await supabase
                    .from('completed_materials')
                    .select('*', { count: 'exact', head: true })
                    .in('user_id', memberIds);
                completedVideos = vidCount || 0;
            }
            
            // Find team rank index
            const sortedTeams = [...allTeams].sort((a,b) => (b.total_score || 0) - (a.total_score || 0));
            const rankIndex = sortedTeams.findIndex(t => t.id === teamId) + 1;
            
            setText('td-stat-rank', rankIndex > 0 ? `# ${rankIndex}` : '--');
            setText('td-stat-points', `${selectedTeam.total_score || 0} XP`);
            setText('td-stat-avg-progress', `${avgProgress}%`);
            setText('td-stat-projects', `${projectsCount} مشروع`);
            setText('td-stat-quizzes', `${quizzesCount} كويز`);
            setText('td-stat-videos', `${completedVideos} فيديو`);
            setText('td-stat-members', `${teamMembers.length} أعضاء`);
            
            // Count tasks
            const { data: tasks } = await supabase.from('team_tasks').select('id').eq('team_id', teamId);
            setText('td-stat-tasks', `${tasks ? tasks.length : 0} مهمة`);
        } catch (err) {
            console.error("Load Stats Error:", err);
        }
        
    } else if (tab === 'timeline') {
        const timelineList = document.getElementById('td-timeline-list');
        timelineList.innerHTML = `<div class="text-center p-8 text-gray-500"><i class="fas fa-spinner fa-spin text-teal-500 text-xl mr-2"></i> جاري تحميل الجدول الزمني...</div>`;
        
        try {
            const { data: logs, error } = await supabase
                .from('audit_logs')
                .select('*')
                .eq('target', selectedTeam.name)
                .order('created_at', { ascending: false })
                .limit(20);
                
            if (error) throw error;
            
            if (!logs || logs.length === 0) {
                timelineList.innerHTML = `<div class="text-center p-8 text-gray-500">لا يوجد أحداث مسجلة لهذا الفريق.</div>`;
                return;
            }
            
            timelineList.innerHTML = logs.map(log => {
                const time = new Date(log.created_at).toLocaleString('ar-EG');
                const admin = log.admin_name || 'مشرف النظام';
                
                return `
                    <div class="relative pl-6 pb-6 border-r border-white/10 last:pb-0">
                        <div class="absolute -right-[7px] top-1.5 w-3 h-3 rounded-full bg-teal-500 border-2 border-black"></div>
                        <div class="mr-2 text-xs">
                            <div class="flex justify-between items-center text-gray-500 font-mono text-[10px]">
                                <span>${time}</span>
                                <span>بواسطة: ${admin}</span>
                            </div>
                            <div class="font-bold text-white mt-1">${log.action}</div>
                            <p class="text-gray-400 mt-0.5 leading-relaxed">${log.details || ''}</p>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error("Load Timeline Error:", err);
            timelineList.innerHTML = `<div class="text-center p-8 text-red-500">فشل تحميل الجدول الزمني.</div>`;
        }
    }
}

// Helper: Sets text on an ID element
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

// ==========================================
// 🚀 ACTIONS ENGINE (CRUD & EVENTS)
// ==========================================

// --- Freeze Status ---
window.toggleTeamFreezeStatus = async () => {
    if (!selectedTeam) return;
    const isFrozen = selectedTeam.status === 'frozen';
    const nextStatus = isFrozen ? 'active' : 'frozen';
    
    await window.toggleTeamFreezeStatusDirect(selectedTeam.id, nextStatus);
};

window.toggleTeamFreezeStatusDirect = async (teamId, status) => {
    const targetTeam = allTeams.find(t => t.id === teamId);
    const teamName = targetTeam ? targetTeam.name : 'فريق';
    const promptMsg = status === 'frozen' ? 
        `هل أنت متأكد من تجميد فريق "${teamName}" بالكامل؟ سيتم تعطيل إمكانية إسناد كورس أو إضافة مهام.` :
        `هل تريد تفعيل نشاط فريق "${teamName}" وإلغاء التجميد؟`;
        
    const confirmed = await window.showCustomConfirm(
        status === 'frozen' ? "تجميد الفريق" : "تنشيط الفريق",
        promptMsg,
        null,
        null,
        status === 'frozen' ? 'warning' : 'success'
    );
    if (!confirmed) return;
    
    try {
        const { error } = await supabase
            .from('teams')
            .update({ status: status })
            .eq('id', teamId);
            
        if (error) {
            // Check if column not found
            if (error.message.includes('column') && error.message.includes('status')) {
                alert("عذراً، يجب أولاً إضافة عمود الحالة لقاعدة البيانات. يرجى تشغيل هذا الاستعلام في لوحة سوبابيس (SQL Editor):\n\nALTER TABLE public.teams ADD COLUMN status text DEFAULT 'active';");
            } else {
                throw error;
            }
            return;
        }
        
        await window.logAdminAction(
            status === 'frozen' ? 'teams:freeze' : 'teams:activate',
            teamName,
            status === 'frozen' ? 'تجميد نشاط الفريق بالكامل' : 'إعادة تفعيل نشاط الفريق'
        );
        
        alert("تم تحديث حالة الفريق بنجاح.");
        
        // Refresh details modal if it is open
        if (selectedTeam && selectedTeam.id === teamId) {
            selectedTeam.status = status;
            await loadTeamDetailTabContent('info');
        }
        
        // Refresh tables
        window.fetchTeams();
    } catch (err) {
        console.error("Freeze Status Error:", err);
        alert("فشل تغيير حالة تجميد الفريق: " + err.message);
    }
};

// --- Edit Team Data ---
window.openEditTeamModal = () => {
    if (!selectedTeam) return;
    window.openEditTeamModalDirect(selectedTeam.id);
};

window.openEditTeamModalDirect = (teamId) => {
    const team = allTeams.find(t => t.id === teamId);
    if (!team) return;
    
    document.getElementById('edit-team-id').value = teamId;
    document.getElementById('edit-team-name').value = team.name || '';
    document.getElementById('edit-team-logo').value = team.logo_url || '';
    document.getElementById('edit-team-uni').value = team.university || '';
    document.getElementById('edit-team-gov').value = team.governorate || '';
    
    const trackSelect = document.getElementById('edit-team-track');
    if (trackSelect) trackSelect.value = team.specialization || '';
    
    document.getElementById('edit-team-modal').classList.remove('hidden');
};

window.saveTeamData = async (e) => {
    e.preventDefault();
    const teamId = document.getElementById('edit-team-id').value;
    if (!teamId) return;
    
    const team = allTeams.find(t => t.id === teamId);
    if (!team) return;
    
    const name = document.getElementById('edit-team-name').value.trim();
    const logoUrl = document.getElementById('edit-team-logo').value.trim();
    const university = document.getElementById('edit-team-uni').value.trim();
    const governorate = document.getElementById('edit-team-gov').value.trim();
    const specialization = document.getElementById('edit-team-track').value;
    
    try {
        const { error } = await supabase
            .from('teams')
            .update({
                name,
                logo_url: logoUrl,
                university,
                governorate,
                specialization: specialization || null
            })
            .eq('id', teamId);
            
        if (error) throw error;
        
        await window.logAdminAction(
            'teams:edit',
            name,
            `تعديل بيانات الفريق الأساسية. الجامعة: ${university}.`
        );
        
        alert("تم حفظ بيانات الفريق بنجاح.");
        document.getElementById('edit-team-modal').classList.add('hidden');
        
        // Refresh details modal if it is open
        if (selectedTeam && selectedTeam.id === teamId) {
            selectedTeam.name = name;
            selectedTeam.logo_url = logoUrl;
            selectedTeam.university = university;
            selectedTeam.governorate = governorate;
            selectedTeam.specialization = specialization;
            
            document.getElementById('td-logo').src = resolveImageUrl(logoUrl);
            document.getElementById('td-name').innerText = name;
            document.getElementById('td-track').innerText = tracksMap[specialization] || 'عام';
            await loadTeamDetailTabContent('info');
        }
        
        window.fetchTeams();
    } catch (err) {
        console.error("Save Team Error:", err);
        alert("فشل حفظ التغييرات: " + err.message);
    }
};

// --- Members Management ---
window.openManageMembersModal = () => {
    if (!selectedTeam) return;
    window.openManageMembersModalDirect(selectedTeam.id);
};

window.openManageMembersModalDirect = async (teamId) => {
    const team = allTeams.find(t => t.id === teamId);
    if (!team) return;
    
    document.getElementById('mm-team-id').value = teamId;
    
    const teamMembers = profilesList.filter(p => p.team_id === teamId);
    
    // Leader Select
    const leaderSelect = document.getElementById('mm-leader-select');
    leaderSelect.innerHTML = teamMembers.map(m => 
        `<option value="${m.id}" ${m.id === team.leader_id ? 'selected' : ''}>${m.full_name || 'طالب'}</option>`
    ).join('');
    
    // Current Members list UI
    const listContainer = document.getElementById('mm-members-list');
    if (teamMembers.length === 0) {
        listContainer.innerHTML = '<div class="text-xs text-gray-500 text-center py-4">لا يوجد أعضاء في هذا الفريق بعد.</div>';
    } else {
        listContainer.innerHTML = teamMembers.map(m => `
            <div class="flex items-center justify-between bg-white/5 px-3 py-2 rounded-lg text-xs">
                <span class="font-bold text-white">${m.full_name || 'بلا اسم'}</span>
                <div class="flex items-center gap-2">
                    <span class="text-gray-500">${m.email}</span>
                    <button onclick="window.removeTeamMemberDirect('${m.id}')" class="text-red-500 hover:text-red-400 p-1 font-bold">إزالة</button>
                </div>
            </div>
        `).join('');
    }
    
    // Add Member Select (students without team_id)
    const addSelect = document.getElementById('mm-add-member-select');
    const availableStudents = profilesList.filter(p => p.team_id === null && p.role === 'student');
    addSelect.innerHTML = '<option value="">اختر طالباً لإضافته...</option>' + 
        availableStudents.map(s => `<option value="${s.id}">${s.full_name || 'طالب'} (${s.email})</option>`).join('');
        
    document.getElementById('manage-members-modal').classList.remove('hidden');
};

window.submitChangeLeader = async () => {
    const teamId = document.getElementById('mm-team-id').value;
    const newLeaderId = document.getElementById('mm-leader-select').value;
    if (!teamId || !newLeaderId) return;
    
    const team = allTeams.find(t => t.id === teamId);
    if (!team) return;
    
    if (team.leader_id === newLeaderId) {
        alert("هذا الطالب هو القائد الفعلي للفريق حالياً.");
        return;
    }
    
    const oldLeaderId = team.leader_id;
    
    try {
        // 1. Update team table leader_id
        const { error: teamErr } = await supabase
            .from('teams')
            .update({ leader_id: newLeaderId })
            .eq('id', teamId);
            
        if (teamErr) throw teamErr;
        
        // 2. Change roles in profiles
        // Update new leader role to leader
        await supabase.from('profiles').update({ role: 'leader' }).eq('id', newLeaderId);
        
        // Demote old leader to student
        if (oldLeaderId) {
            await supabase.from('profiles').update({ role: 'student' }).eq('id', oldLeaderId);
        }
        
        await window.logAdminAction(
            'teams:change_leader',
            team.name,
            `تغيير القائد من ليدر قديم لليدر جديد.`
        );
        
        alert("تم تغيير القائد بنجاح.");
        
        // Reload modal data
        selectedTeam = allTeams.find(t => t.id === teamId);
        if (selectedTeam) selectedTeam.leader_id = newLeaderId;
        
        window.openManageMembersModalDirect(teamId);
        window.fetchTeams();
        
        if (selectedTeam && selectedTeam.id === teamId) {
            loadTeamDetailTabContent('info');
            loadTeamDetailTabContent('members');
        }
    } catch (err) {
        console.error("Change Leader Error:", err);
        alert("فشل تغيير قائد الفريق: " + err.message);
    }
};

window.makeLeaderDirect = async (memberId) => {
    const teamId = document.getElementById('td-current-team-id').value;
    if (!teamId || !memberId) return;
    
    const team = allTeams.find(t => t.id === teamId);
    if (!team) return;
    
    const confirmed = await window.showCustomConfirm(
        "تعيين قائد للفريق",
        `هل أنت متأكد من جعل هذا العضو قائداً للفريق؟`,
        null,
        null,
        'warning'
    );
    if (!confirmed) return;
    
    const oldLeaderId = team.leader_id;
    
    try {
        await supabase.from('teams').update({ leader_id: memberId }).eq('id', teamId);
        await supabase.from('profiles').update({ role: 'leader' }).eq('id', memberId);
        if (oldLeaderId) {
            await supabase.from('profiles').update({ role: 'student' }).eq('id', oldLeaderId);
        }
        
        await window.logAdminAction('teams:change_leader', team.name, 'تغيير قائد الفريق');
        alert("تم تغيير القائد بنجاح.");
        
        // Refresh local memory and views
        const { data: updatedTeams } = await supabase.from('teams').select('*, leader:profiles!teams_leader_id_fkey(id, full_name, email)');
        if (updatedTeams) allTeams = updatedTeams;
        selectedTeam = allTeams.find(t => t.id === teamId);
        
        loadTeamDetailTabContent('info');
        loadTeamDetailTabContent('members');
        window.fetchTeams();
    } catch (err) {
        console.error(err);
        alert("فشل تعيين القائد.");
    }
};

window.submitAddTeamMember = async () => {
    const teamId = document.getElementById('mm-team-id').value;
    const memberId = document.getElementById('mm-add-member-select').value;
    if (!teamId || !memberId) {
        alert("يرجى اختيار طالب أولاً لإضافته للفريق.");
        return;
    }
    
    const team = allTeams.find(t => t.id === teamId);
    if (!team) return;
    
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ team_id: teamId })
            .eq('id', memberId);
            
        if (error) throw error;
        
        await window.logAdminAction(
            'teams:add_member',
            team.name,
            `إضافة عضو جديد للفريق`
        );
        
        alert("تمت إضافة العضو للفريق بنجاح.");
        
        // Refresh data
        const { data: profs } = await supabase.from('profiles').select('*');
        if (profs) profilesList = profs;
        
        window.openManageMembersModalDirect(teamId);
        window.fetchTeams();
        
        if (selectedTeam && selectedTeam.id === teamId) {
            loadTeamDetailTabContent('info');
            loadTeamDetailTabContent('members');
        }
    } catch (err) {
        console.error("Add Member Error:", err);
        alert("فشل إضافة العضو: " + err.message);
    }
};

window.removeTeamMemberDirect = async (memberId) => {
    const teamId = document.getElementById('mm-team-id').value || document.getElementById('td-current-team-id').value;
    if (!teamId || !memberId) return;
    
    const team = allTeams.find(t => t.id === teamId);
    const member = profilesList.find(p => p.id === memberId);
    const mName = member ? member.full_name : 'العضو';
    
    const confirmed = await window.showCustomConfirm(
        "إزالة عضو من الفريق",
        `هل أنت متأكد من إزالة "${mName}" من الفريق نهائياً؟`,
        null,
        null,
        'danger'
    );
    if (!confirmed) return;
    
    const isLeader = team && team.leader_id === memberId;
    
    try {
        // 1. Reset team_id and demote to student
        const { error } = await supabase
            .from('profiles')
            .update({
                team_id: null,
                role: 'student'
            })
            .eq('id', memberId);
            
        if (error) throw error;
        
        // 2. If it was leader, reset leader_id on teams
        if (isLeader) {
            await supabase.from('teams').update({ leader_id: null }).eq('id', teamId);
            if (selectedTeam) selectedTeam.leader_id = null;
        }
        
        await window.logAdminAction(
            'teams:remove_member',
            team ? team.name : 'فريق',
            `إزالة العضو ${mName} من الفريق`
        );
        
        alert("تمت إزالة العضو من الفريق بنجاح.");
        
        // Refresh
        const { data: profs } = await supabase.from('profiles').select('*');
        if (profs) profilesList = profs;
        
        const { data: teamsData } = await supabase.from('teams').select('*, leader:profiles!teams_leader_id_fkey(id, full_name, email)');
        if (teamsData) allTeams = teamsData;
        if (selectedTeam) selectedTeam = allTeams.find(t => t.id === teamId);
        
        // Refresh active views
        const modal = document.getElementById('manage-members-modal');
        if (modal && !modal.classList.contains('hidden')) {
            window.openManageMembersModalDirect(teamId);
        }
        
        if (selectedTeam && selectedTeam.id === teamId) {
            loadTeamDetailTabContent('info');
            loadTeamDetailTabContent('members');
        }
        
        window.fetchTeams();
    } catch (err) {
        console.error("Remove Member Error:", err);
        alert("فشل إزالة العضو: " + err.message);
    }
};

// --- Courses Management ---
window.openManageCoursesModal = () => {
    if (!selectedTeam) return;
    const teamId = selectedTeam.id;
    
    document.getElementById('mc-team-id').value = teamId;
    
    const assignedCourses = Array.isArray(selectedTeam.courses_plan) ? selectedTeam.courses_plan : [];
    
    // List checkboxes
    const list = document.getElementById('mc-courses-list');
    list.innerHTML = coursesList.map(c => {
        const isChecked = assignedCourses.includes(c.id) || assignedCourses.includes(c.course_id);
        const name = c.name || 'كورس';
        const track = tracksMap[c.track_id] || 'عام';
        
        return `
            <label class="flex items-center gap-3 bg-white/5 px-4 py-2.5 rounded-xl border border-white/5 hover:bg-white/10 transition-all text-xs cursor-pointer select-none text-right">
                <input type="checkbox" name="mc-course" value="${c.id}" ${isChecked ? 'checked' : ''} class="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 accent-teal-500 cursor-pointer">
                <div>
                    <div class="font-bold text-white">${name}</div>
                    <div class="text-[10px] text-gray-500 mt-0.5">التراك: ${track}</div>
                </div>
            </label>
        `;
    }).join('');
    
    document.getElementById('manage-courses-modal').classList.remove('hidden');
};

window.submitSaveTeamCourses = async () => {
    const teamId = document.getElementById('mc-team-id').value;
    if (!teamId) return;
    
    const team = allTeams.find(t => t.id === teamId);
    if (!team) return;
    
    const checkboxes = document.querySelectorAll('input[name="mc-course"]:checked');
    const newCoursesPlan = Array.from(checkboxes).map(c => c.value);
    
    try {
        const { error } = await supabase
            .from('teams')
            .update({ courses_plan: newCoursesPlan })
            .eq('id', teamId);
            
        if (error) throw error;
        
        await window.logAdminAction(
            'teams:assign_courses',
            team.name,
            `تحديث الخطة الدراسية للفريق وإسناد الكورسات.`
        );
        
        alert("تم حفظ الخطة الدراسية وتعديل الكورسات بنجاح.");
        document.getElementById('manage-courses-modal').classList.add('hidden');
        
        // Refresh details modal if it is open
        if (selectedTeam && selectedTeam.id === teamId) {
            selectedTeam.courses_plan = newCoursesPlan;
            loadTeamDetailTabContent('info');
            loadTeamDetailTabContent('courses');
        }
        
        window.fetchTeams();
    } catch (err) {
        console.error("Save Courses Plan Error:", err);
        alert("فشل حفظ خطة الكورسات: " + err.message);
    }
};

// --- Tasks Management ---
window.openManageTasksModal = () => {
    if (!selectedTeam) return;
    const teamId = selectedTeam.id;
    
    document.getElementById('mt-team-id').value = teamId;
    
    // Clear Form inputs
    document.getElementById('mt-task-title').value = '';
    document.getElementById('mt-task-type').value = 'custom';
    document.getElementById('mt-task-desc').value = '';
    document.getElementById('mt-task-due').value = '';
    document.getElementById('mt-content-selector-wrapper').classList.add('hidden');
    
    loadTeamTasksList(teamId);
    
    document.getElementById('manage-tasks-modal').classList.remove('hidden');
};

async function loadTeamTasksList(teamId) {
    const container = document.getElementById('mt-tasks-list');
    container.innerHTML = '<div class="text-xs text-gray-500 text-center py-4">جاري تحميل المهام المسندة...</div>';
    
    try {
        const { data, error } = await supabase
            .from('team_tasks')
            .select('*')
            .eq('team_id', teamId)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="text-xs text-gray-500 text-center py-4">لا توجد مهام مسندة لهذا الفريق بعد.</div>';
            return;
        }
        
        container.innerHTML = data.map(task => {
            const due = task.due_date ? new Date(task.due_date).toLocaleDateString('ar-EG') : 'بلا تسليم';
            
            return `
                <div class="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5 text-xs">
                    <div>
                        <div class="font-bold text-white">${task.title}</div>
                        <div class="text-[10px] text-gray-500 mt-1">النوع: ${task.type} | التسليم: ${due}</div>
                    </div>
                    <button onclick="window.deleteTeamTaskDirect('${task.id}')" class="text-red-500 hover:text-red-400 p-1 font-bold" title="حذف المهمة"><i class="fas fa-trash-can"></i></button>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error("Load Tasks List Error:", err);
        container.innerHTML = '<div class="text-xs text-red-500 text-center py-4">فشل تحميل قائمة المهام.</div>';
    }
}

window.onTaskTypeChange = () => {
    const type = document.getElementById('mt-task-type').value;
    const wrapper = document.getElementById('mt-content-selector-wrapper');
    const select = document.getElementById('mt-task-content');
    
    if (type === 'custom') {
        wrapper.classList.add('hidden');
        select.removeAttribute('required');
        return;
    }
    
    wrapper.classList.remove('hidden');
    select.setAttribute('required', 'required');
    
    if (type === 'course_project') {
        select.innerHTML = projectsList.map(p => `<option value="${p.id}">${p.title || 'مشروع'}</option>`).join('');
    } else if (type === 'quiz') {
        select.innerHTML = quizzesList.map(q => `<option value="${q.quiz_id}">${q.title || 'كويز'}</option>`).join('');
    } else if (type === 'video') {
        // Find course materials that are videos
        const videos = coursesList.flatMap(c => Array.isArray(c.materials) ? c.materials : [])
            .filter(m => m.type === 'video' || m.format === 'video');
            
        if (videos.length === 0) {
            select.innerHTML = '<option value="">لا يوجد فيديوهات مسجلة بالنظام</option>';
        } else {
            select.innerHTML = videos.map(v => `<option value="${v.id}">${v.title || 'فيديو تعليمي'}</option>`).join('');
        }
    }
};

window.submitAssignTask = async (e) => {
    e.preventDefault();
    const teamId = document.getElementById('mt-team-id').value;
    if (!teamId) return;
    
    const team = allTeams.find(t => t.id === teamId);
    if (!team) return;
    
    const title = document.getElementById('mt-task-title').value.trim();
    const type = document.getElementById('mt-task-type').value;
    const description = document.getElementById('mt-task-desc').value.trim();
    const week_id = document.getElementById('mt-task-week').value;
    const due_date = document.getElementById('mt-task-due').value;
    
    let content_id = null;
    if (type !== 'custom') {
        content_id = document.getElementById('mt-task-content').value;
    }
    
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("لم يتم العثور على جلسة المشرف الفعالة");
        
        // 1. Create task row in team_tasks
        const teamMembers = profilesList.filter(p => p.team_id === teamId);
        const taskData = {
            team_id: teamId,
            content_id: content_id,
            title,
            description,
            type,
            week_id,
            due_date: due_date ? new Date(due_date).toISOString() : null,
            assigned_by: user.id,
            stats: {
                started_count: 0,
                total_students: teamMembers.length,
                completed_count: 0
            }
        };
        
        const { data: newTask, error } = await supabase
            .from('team_tasks')
            .insert([taskData])
            .select()
            .single();
            
        if (error) throw error;
        
        // 2. Append to team weekly_tasks JSON array in teams table
        const currentTasks = Array.isArray(team.weekly_tasks) ? team.weekly_tasks : [];
        const updatedTasks = [...currentTasks, newTask.id];
        await supabase.from('teams').update({ weekly_tasks: updatedTasks }).eq('id', teamId);
        team.weekly_tasks = updatedTasks;
        
        // 3. Send system notifications to all members of the team
        if (teamMembers.length > 0) {
            const notifs = teamMembers.map(m => ({
                user_id: m.id,
                title: `📋 مهمة جديدة للفريق: ${title}`,
                message: `تم إسناد مهمة جديدة لفريقك من قبل الإدارة. يرجى المتابعة والتسليم قبل الموعد المحدد.`,
                type: 'info'
            }));
            await supabase.from('system_notifications').insert(notifs);
        }
        
        await window.logAdminAction(
            'teams:assign_task',
            team.name,
            `إسناد مهمة جديدة للفريق: ${title}`
        );
        
        alert("تم إسناد وتعيين المهمة بنجاح.");
        
        // Refresh list
        loadTeamTasksList(teamId);
        
        // Refresh details modal view if open
        if (selectedTeam && selectedTeam.id === teamId) {
            loadTeamDetailTabContent('tasks');
        }
        
        window.fetchTeams();
    } catch (err) {
        console.error("Assign Task Error:", err);
        alert("فشل تعيين المهمة: " + err.message);
    }
};

window.deleteTeamTaskDirect = async (taskId) => {
    const confirmed = await window.showCustomConfirm(
        "حذف المهمة",
        "هل أنت متأكد من حذف وإلغاء هذه المهمة للفريق؟",
        null,
        null,
        'danger'
    );
    if (!confirmed) return;
    
    const teamId = document.getElementById('mt-team-id').value || document.getElementById('td-current-team-id').value;
    const team = allTeams.find(t => t.id === teamId);
    
    try {
        // 1. Delete task row
        const { error } = await supabase
            .from('team_tasks')
            .delete()
            .eq('id', taskId);
            
        if (error) throw error;
        
        // 2. Remove task from team weekly_tasks JSON array
        if (team && Array.isArray(team.weekly_tasks)) {
            const updated = team.weekly_tasks.filter(id => id !== taskId);
            await supabase.from('teams').update({ weekly_tasks: updated }).eq('id', teamId);
            team.weekly_tasks = updated;
        }
        
        await window.logAdminAction(
            'teams:delete_task',
            team ? team.name : 'فريق',
            `حذف مهمة للفريق`
        );
        
        alert("تم حذف المهمة بنجاح.");
        
        const modal = document.getElementById('manage-tasks-modal');
        if (modal && !modal.classList.contains('hidden')) {
            loadTeamTasksList(teamId);
        }
        
        if (selectedTeam && selectedTeam.id === teamId) {
            loadTeamDetailTabContent('tasks');
        }
        
        window.fetchTeams();
    } catch (err) {
        console.error("Delete Task Error:", err);
        alert("فشل حذف المهمة: " + err.message);
    }
};

// --- Delete Announcement ---
window.deleteTeamPostDirect = async (postId) => {
    const confirmed = await window.showCustomConfirm(
        "حذف الإعلان",
        "هل تريد حذف هذا الإعلان نهائياً من الفريق؟",
        null,
        null,
        'danger'
    );
    if (!confirmed) return;
    const teamId = document.getElementById('td-current-team-id').value;
    
    try {
        const { error } = await supabase
            .from('team_posts')
            .delete()
            .eq('id', postId);
            
        if (error) throw error;
        
        alert("تم حذف الإعلان بنجاح.");
        if (selectedTeam && selectedTeam.id === teamId) {
            loadTeamDetailTabContent('posts');
        }
    } catch (err) {
        console.error(err);
        alert("فشل حذف الإعلان.");
    }
};

// --- Send Team Notifications ---
window.openSendNotificationModal = () => {
    if (!selectedTeam) return;
    const teamId = selectedTeam.id;
    
    document.getElementById('sn-team-id').value = teamId;
    document.getElementById('sn-notif-title').value = '';
    document.getElementById('sn-notif-message').value = '';
    document.getElementById('sn-notif-type').value = 'info';
    
    document.getElementById('send-team-notification-modal').classList.remove('hidden');
};

window.submitSendTeamNotification = async (e) => {
    e.preventDefault();
    const teamId = document.getElementById('sn-team-id').value;
    if (!teamId) return;
    
    const team = allTeams.find(t => t.id === teamId);
    if (!team) return;
    
    const title = document.getElementById('sn-notif-title').value.trim();
    const message = document.getElementById('sn-notif-message').value.trim();
    const type = document.getElementById('sn-notif-type').value;
    
    try {
        const teamMembers = profilesList.filter(p => p.team_id === teamId);
        if (teamMembers.length === 0) {
            alert("لا يوجد أعضاء في هذا الفريق لإرسال التنبيه لهم.");
            return;
        }
        
        // 1. Insert notification records
        const notifs = teamMembers.map(m => ({
            user_id: m.id,
            title,
            message,
            type,
            read: false
        }));
        
        const { error } = await supabase.from('system_notifications').insert(notifs);
        if (error) throw error;
        
        // 2. Also insert announcement in team_posts if type is announcement
        if (type === 'announcement') {
            await supabase.from('team_posts').insert([{
                team_id: teamId,
                type: 'announcement',
                title,
                content: message,
                creator_name: 'إدارة منصة بُصْلَة',
                is_pinned: false,
                target_members: ['all']
            }]);
        }
        
        await window.logAdminAction(
            'teams:send_notification',
            team.name,
            `إرسال تنبيه جماعي للأعضاء: "${title}"`
        );
        
        alert("تم إرسال التنبيه الجماعي بنجاح.");
        document.getElementById('send-team-notification-modal').classList.add('hidden');
        
        if (selectedTeam && selectedTeam.id === teamId && type === 'announcement') {
            loadTeamDetailTabContent('posts');
        }
    } catch (err) {
        console.error("Send Notification Error:", err);
        alert("فشل إرسال التنبيه: " + err.message);
    }
};

// --- Delete Team Account ---
window.deleteTeamAccount = async () => {
    if (!selectedTeam) return;
    await window.deleteTeamAccountDirect(selectedTeam.id);
};

window.deleteTeamAccountDirect = async (teamId) => {
    const team = allTeams.find(t => t.id === teamId);
    if (!team) return;
    
    // Check permission
    const isAdminOwner = window.getAdminProfile()?.role?.toLowerCase() === 'owner';
    const hasDeletePerm = window.hasPermission('teams:delete');
    
    if (!isAdminOwner && !hasDeletePerm) {
        alert("عذراً، لا تمتلك الصلاحية الكافية لحذف الفريق.");
        return;
    }
    
    const promptMsg = `⚠️ تحذير شديد الخطورة:\nهل أنت متأكد من حذف فريق "${team.name}" نهائياً من المنصة؟\n\nسيؤدي هذا الإجراء إلى:\n1. إزالة جميع الطلاب من هذا الفريق وتصفير انتمائهم.\n2. حذف جميع مهام وإعلانات ودعوات الفريق.\n3. لا يمكن التراجع عن هذا الإجراء أبداً.`;
    const confirmed = await window.showCustomConfirm(
        "حذف الفريق نهائياً",
        promptMsg,
        null,
        null,
        'danger'
    );
    if (!confirmed) return;
    
    try {
        console.log("Delete team transaction start for ID:", teamId);
        
        // 1. Reset team_id and role on members
        const resMem = await supabase
            .from('profiles')
            .update({
                team_id: null,
                role: 'student'
            })
            .eq('team_id', teamId);
        console.log("Profiles reset result:", resMem);
        if (resMem.error) throw resMem.error;
        
        // 2. Delete tasks, announcements, invites, and logs
        const resTasks = await supabase.from('team_tasks').delete().eq('team_id', teamId);
        console.log("team_tasks delete result:", resTasks);
        const resPosts = await supabase.from('team_posts').delete().eq('team_id', teamId);
        console.log("team_posts delete result:", resPosts);
        const resInv = await supabase.from('team_invitations').delete().eq('from_team_id', teamId);
        console.log("team_invitations delete result:", resInv);
        const resLogs = await supabase.from('team_score_logs').delete().eq('team_id', teamId);
        console.log("team_score_logs delete result:", resLogs);
        
        // 3. Delete team row
        const resTeam = await supabase
            .from('teams')
            .delete({ count: 'exact' })
            .eq('id', teamId);
        console.log("Teams delete result:", resTeam);
        if (resTeam.error) throw resTeam.error;
        
        await window.logAdminAction(
            'teams:delete',
            team.name,
            `حذف الفريق بالكامل وإزالة انتماء الأعضاء`
        );
        
        alert("تم حذف الفريق بالكامل بنجاح.");
        
        // Close modals if open
        document.getElementById('team-details-modal').classList.add('hidden');
        document.getElementById('manage-members-modal').classList.add('hidden');
        
        selectedTeam = null;
        window.fetchTeams();
    } catch (err) {
        console.error("Delete Team Error:", err);
        alert("فشل حذف الفريق: " + err.message);
    }
};
