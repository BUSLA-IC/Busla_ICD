import { supabase } from '../../js/supabase-config.js';

// ============================================================================
// 🚀 STATE MANAGEMENT
// ============================================================================
let submissionsData = [];
let appealsData = [];
let auditsData = [];
let teamsList = [];
let coursesList = [];
let phasesList = [];
let projectsList = [];
let tracksList = [];
let leadersList = [];

let currentActiveTab = 'pending-review';

// Currently selected submission details
let selectedSubmission = null;
let selectedSubmissionAppeal = null;
let selectedSubmissionAudit = null;
let currentDrawerTab = 'submission';
let currentAdminUser = null;
let currentAdminProfile = null;

// ============================================================================
// ⚙️ INITIALIZATION
// ============================================================================
window.initProjectAudit = async () => {
    console.log("🔍 [Project Audit] Initializing module...");
    
    try {
        const { data: { user } } = await supabase.auth.getUser();
        currentAdminUser = user;
        if (user) {
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
            currentAdminProfile = profile;
        }
    } catch(err) {
        console.error("Auth Fetch Error in Project Audit:", err);
    }
    
    // Bind Tab switching
    const tabButtons = document.querySelectorAll('.audit-tab-btn');
    const tabContents = document.querySelectorAll('.audit-tab-content');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            currentActiveTab = targetTab;
            
            tabButtons.forEach(b => {
                b.classList.remove('bg-white/10', 'text-white');
                b.classList.add('text-gray-400', 'hover:bg-white/5', 'hover:text-white');
            });
            tabContents.forEach(c => c.classList.add('hidden'));
            
            btn.classList.add('bg-white/10', 'text-white');
            btn.classList.remove('text-gray-400', 'hover:bg-white/5', 'hover:text-white');
            
            const targetEl = document.getElementById(`audit-tab-content-${targetTab}`);
            if (targetEl) targetEl.classList.remove('hidden');
            
            filterAuditSubmissions();
        });
    });
    
    // Bind Drawer Subtabs switching
    const drawerTabBtns = document.querySelectorAll('.drawer-subtab-btn');
    drawerTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetSubtab = btn.getAttribute('data-tab');
            switchDrawerSubtab(targetSubtab);
        });
    });

    // Populate filter university dropdown with defaults
    const uniSelect = document.getElementById('audit-filter-uni');
    if (uniSelect && uniSelect.options.length <= 1) {
        const universities = ["جامعة القاهرة", "جامعة عين شمس", "جامعة حلوان", "جامعة المنصورة", "جامعة الإسكندرية", "جامعة أسيوط", "جامعة طنطا", "جامعة الزقازيق", "جامعة بنها", "جامعة المنوفية"];
        uniSelect.innerHTML = '<option value="all">الجامعة: الكل</option>' + 
            universities.map(u => `<option value="${u}">${u}</option>`).join('');
    }
    
    await fetchAuditDashboardData();
};

// ============================================================================
// 📊 DATA FETCHING & SYNCHRONIZATION
// ============================================================================
window.fetchAuditDashboardData = async () => {
    // Show spinner in all table bodies
    const bodies = ['pending-review', 'leader-reviews', 'audit-queue', 'leader-performance', 'appeals'];
    bodies.forEach(b => {
        const el = document.getElementById(`table-body-${b}`);
        if (el) el.innerHTML = `<tr><td colspan="12" class="p-10 text-center"><i class="fas fa-spinner fa-spin text-teal-500 text-2xl"></i></td></tr>`;
    });

    try {
        // Fetch submissions, appeals, audits, teams, courses, phases, projects, tracks, profiles
        const [subsRes, appealsRes, auditsRes, teamsRes, coursesRes, phasesRes, projectsRes, tracksRes, profilesRes] = await Promise.all([
            supabase.from('project_submissions').select(`
                *,
                user:profiles!user_id(id, full_name, email, avatar_url, university, team_id, track),
                project:projects(id, title, max_points, rubric_json, submission_method)
            `).order('submitted_at', { ascending: false }),
            supabase.from('project_appeals').select('*'),
            supabase.from('project_audits').select('*'),
            supabase.from('teams').select('*'),
            supabase.from('courses').select('course_id, title, phase_id'),
            supabase.from('phases').select('phase_id, title, track_id'),
            supabase.from('projects').select('id, title, max_points'),
            supabase.from('tracks').select('id, name'),
            supabase.from('profiles').select('id, full_name, email, role')
        ]);

        if (subsRes.error) throw subsRes.error;
        
        submissionsData = subsRes.data || [];
        appealsData = appealsRes.data || [];
        auditsData = auditsRes.data || [];
        teamsList = teamsRes.data || [];
        coursesList = coursesRes.data || [];
        phasesList = phasesRes.data || [];
        projectsList = projectsRes.data || [];
        tracksList = tracksRes.data || [];
        
        const allProfiles = profilesRes.data || [];
        leadersList = allProfiles.filter(p => ['leader', 'admin', 'owner', 'leader supervisor', 'project reviewer'].includes(String(p.role).toLowerCase()));

        // Map grader profiles manually from allProfiles
        submissionsData.forEach(sub => {
            if (sub.graded_by) {
                sub.grader = allProfiles.find(p => p.id === sub.graded_by) || null;
            }
        });

        // Run client-side analysis to process audit rules
        analyzeAndTagAudits();
        
        // Update stats
        updateStatsBoard();
        
        // Populate filter options dynamically
        populateFilters();
        
        // Render current active tab
        filterAuditSubmissions();

    } catch (err) {
        console.error("Fetch Audit Dashboard Data Error:", err);
        window.showToast("حدث خطأ أثناء تحميل بيانات الإشراف والمراجعة", "error");
    }
};

// Analyse submissions and tag them with audit reasons dynamically
function analyzeAndTagAudits() {
    // Group graded submissions by team and project to detect "same_score" rule
    const teamProjectGrades = {}; // "teamId_projectId" -> [grade1, grade2, ...]
    
    submissionsData.forEach(sub => {
        if (sub.status === 'graded' || sub.status === 'approved') {
            const teamId = sub.user?.team_id;
            const projectId = sub.project_id;
            if (teamId && projectId) {
                const key = `${teamId}_${projectId}`;
                if (!teamProjectGrades[key]) teamProjectGrades[key] = [];
                teamProjectGrades[key].push(sub.grade);
            }
        }
    });

    submissionsData.forEach(sub => {
        sub.auditReasons = [];
        sub.needsAudit = false;
        sub.hasAppeal = false;

        // Rule 1: Student Appeal (Has active record in project_appeals)
        const appeal = appealsData.find(a => a.submission_id === sub.id);
        if (appeal) {
            sub.hasAppeal = true;
            sub.needsAudit = true;
            sub.appealRecord = appeal;
            sub.auditReasons.push("appeal");
        }

        // Rule 2: Grade is 100%
        const maxPoints = sub.project?.max_points || 100;
        if (sub.grade === maxPoints && (sub.status === 'graded' || sub.status === 'approved')) {
            sub.needsAudit = true;
            sub.auditReasons.push("grade_100");
        }

        // Rule 3: Fast grading (< 2 minutes)
        if (sub.graded_at && sub.submitted_at && (sub.status === 'graded' || sub.status === 'approved')) {
            const submitTime = new Date(sub.submitted_at).getTime();
            const gradeTime = new Date(sub.graded_at).getTime();
            const durationSec = (gradeTime - submitTime) / 1000;
            if (durationSec > 0 && durationSec < 120) {
                sub.needsAudit = true;
                sub.auditReasons.push("fast_grading");
                sub.gradingDurationSec = durationSec;
            }
        }

        // Rule 4: All graded members in same team got same score (min 3 members)
        const teamId = sub.user?.team_id;
        const projectId = sub.project_id;
        if (teamId && projectId && (sub.status === 'graded' || sub.status === 'approved')) {
            const key = `${teamId}_${projectId}`;
            const gradesList = teamProjectGrades[key] || [];
            if (gradesList.length >= 3) {
                // Check if all grades are identical
                const allSame = gradesList.every(g => g === gradesList[0]);
                if (allSame) {
                    sub.needsAudit = true;
                    if (!sub.auditReasons.includes("same_score")) {
                        sub.auditReasons.push("same_score");
                    }
                }
            }
        }

        // Rule 5: Random Audit (5% deterministic chance based on ID hash)
        const seed = parseInt(sub.id.substring(0, 8), 16);
        if (seed % 20 === 0) {
            sub.needsAudit = true;
            if (!sub.auditReasons.includes("random")) {
                sub.auditReasons.push("random");
            }
        }

        // Check if there is a manual audit entry
        const audit = auditsData.find(a => a.submission_id === sub.id);
        if (audit) {
            sub.auditRecord = audit;
            if (audit.admin_grade !== undefined && audit.admin_grade !== null) {
                // Rule 6: Big difference between Leader and Admin grade (> 5 marks)
                const diff = Math.abs((sub.grade || 0) - audit.admin_grade);
                if (diff > 5) {
                    sub.needsAudit = true;
                    if (!sub.auditReasons.includes("difference")) {
                        sub.auditReasons.push("difference");
                    }
                }
            }
        }
    });
}

// Update Top Statistics Board
function updateStatsBoard() {
    // 1. Pending Grading
    const pendingGradingCount = submissionsData.filter(s => s.status === 'pending').length;
    document.getElementById('stat-pending-grading').innerText = pendingGradingCount;

    // 2. Pending Review (Graded by Leader but not yet approved or audited)
    const pendingReviewCount = submissionsData.filter(s => s.status === 'graded').length;
    document.getElementById('stat-pending-review').innerText = pendingReviewCount;

    // 3. Approved Projects
    const approvedCount = submissionsData.filter(s => s.status === 'approved').length;
    document.getElementById('stat-approved-projects').innerText = approvedCount;

    // 4. Rejected Projects
    const rejectedCount = submissionsData.filter(s => s.status === 'rejected').length;
    document.getElementById('stat-rejected-projects').innerText = rejectedCount;

    // 5. Appeals
    document.getElementById('stat-appeals-count').innerText = appealsData.length;

    // 6. Random Audits
    const randomCount = submissionsData.filter(s => s.auditReasons?.includes('random')).length;
    document.getElementById('stat-random-audits').innerText = randomCount;

    // 7. Average Grading Time (for graded submissions)
    const gradedSubs = submissionsData.filter(s => s.graded_at && s.submitted_at && s.status !== 'pending');
    if (gradedSubs.length > 0) {
        let totalMs = 0;
        gradedSubs.forEach(s => {
            totalMs += new Date(s.graded_at).getTime() - new Date(s.submitted_at).getTime();
        });
        const avgHours = totalMs / (1000 * 60 * 60 * gradedSubs.length);
        if (avgHours < 24) {
            document.getElementById('stat-avg-grading-time').innerText = `${Math.round(avgHours)} ساعة`;
        } else {
            document.getElementById('stat-avg-grading-time').innerText = `${(avgHours / 24).toFixed(1)} يوم`;
        }
    } else {
        document.getElementById('stat-avg-grading-time').innerText = '--';
    }

    // 8. Average Projects Grade
    const gradedScores = submissionsData.filter(s => (s.status === 'graded' || s.status === 'approved') && s.grade !== null);
    if (gradedScores.length > 0) {
        let sumPct = 0;
        gradedScores.forEach(s => {
            const maxPoints = s.project?.max_points || 100;
            sumPct += (s.grade / maxPoints) * 100;
        });
        document.getElementById('stat-avg-projects-grade').innerText = `${Math.round(sumPct / gradedScores.length)}%`;
    } else {
        document.getElementById('stat-avg-projects-grade').innerText = '0%';
    }

    // 9. Active Leaders in Grading (Graded at least 1 project)
    const activeLeaderIds = new Set(submissionsData.filter(s => s.graded_by).map(s => s.graded_by));
    document.getElementById('stat-active-leaders').innerText = activeLeaderIds.size;
}

// Populate filter select options dynamically
function populateFilters() {
    // 1. Teams
    const teamSelect = document.getElementById('audit-filter-team');
    if (teamSelect) {
        teamSelect.innerHTML = '<option value="all">الفريق: الكل</option>' +
            teamsList.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }

    // 2. Leaders
    const leaderSelect = document.getElementById('audit-filter-leader');
    if (leaderSelect) {
        leaderSelect.innerHTML = '<option value="all">الليدر: الكل</option>' +
            leadersList.map(l => `<option value="${l.id}">${l.full_name || l.email}</option>`).join('');
    }

    // 3. Courses
    const courseSelect = document.getElementById('audit-filter-course');
    if (courseSelect) {
        courseSelect.innerHTML = '<option value="all">الكورس: الكل</option>' +
            coursesList.map(c => `<option value="${c.course_id}">${c.title}</option>`).join('');
    }

    // 4. Phases
    const phaseSelect = document.getElementById('audit-filter-phase');
    if (phaseSelect) {
        phaseSelect.innerHTML = '<option value="all">المرحلة: الكل</option>' +
            phasesList.map(p => `<option value="${p.phase_id}">${p.title}</option>`).join('');
    }

    // 5. Projects
    const projectSelect = document.getElementById('audit-filter-project');
    if (projectSelect) {
        projectSelect.innerHTML = '<option value="all">المشروع: الكل</option>' +
            projectsList.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
    }

    // 6. Tracks
    const trackSelect = document.getElementById('audit-filter-track');
    if (trackSelect) {
        trackSelect.innerHTML = '<option value="all">المسار: الكل</option>' +
            tracksList.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
    }
}

// Reset filters to defaults
window.resetAuditFilters = () => {
    document.getElementById('audit-filter-search').value = '';
    document.getElementById('audit-filter-uni').value = 'all';
    document.getElementById('audit-filter-team').value = 'all';
    document.getElementById('audit-filter-leader').value = 'all';
    document.getElementById('audit-filter-course').value = 'all';
    document.getElementById('audit-filter-phase').value = 'all';
    document.getElementById('audit-filter-project').value = 'all';
    document.getElementById('audit-filter-track').value = 'all';
    document.getElementById('audit-filter-status').value = 'all';
    document.getElementById('audit-filter-audit').value = 'all';
    document.getElementById('audit-filter-appeal').value = 'all';
    
    filterAuditSubmissions();
};

// ============================================================================
// 🔍 FILTER & RENDER ENGINE
// ============================================================================
window.filterAuditSubmissions = () => {
    const searchVal = document.getElementById('audit-filter-search')?.value.toLowerCase() || '';
    const uniVal = document.getElementById('audit-filter-uni')?.value || 'all';
    const teamVal = document.getElementById('audit-filter-team')?.value || 'all';
    const leaderVal = document.getElementById('audit-filter-leader')?.value || 'all';
    const courseVal = document.getElementById('audit-filter-course')?.value || 'all';
    const phaseVal = document.getElementById('audit-filter-phase')?.value || 'all';
    const projectVal = document.getElementById('audit-filter-project')?.value || 'all';
    const trackVal = document.getElementById('audit-filter-track')?.value || 'all';
    const statusVal = document.getElementById('audit-filter-status')?.value || 'all';
    const auditVal = document.getElementById('audit-filter-audit')?.value || 'all';
    const appealVal = document.getElementById('audit-filter-appeal')?.value || 'all';

    // Filter submissions array
    const filtered = submissionsData.filter(sub => {
        const studentName = sub.user?.full_name || '';
        const projectTitle = sub.project?.title || '';
        const teamId = sub.user?.team_id || '';
        const teamObj = teamsList.find(t => t.id === teamId);
        const teamName = teamObj?.name || '';
        const university = sub.user?.university || '';
        const leaderId = teamObj?.leader_id || '';
        
        // Course/Phase matching
        // In database, course_materials has ref_project_id. We map project back to course/phase if needed.
        // For simplicity, we match projects. Wait, we can find materials referencing this project.
        // Let's do simple matching.
        
        const matchesSearch = studentName.toLowerCase().includes(searchVal) ||
                            projectTitle.toLowerCase().includes(searchVal) ||
                            teamName.toLowerCase().includes(searchVal);
                            
        const matchesUni = uniVal === 'all' || university === uniVal;
        const matchesTeam = teamVal === 'all' || teamId === teamVal;
        const matchesLeader = leaderVal === 'all' || leaderId === leaderVal || sub.graded_by === leaderVal;
        
        // Filter track
        const matchesTrack = trackVal === 'all' || sub.user?.track === trackVal;
        
        // Filter status
        let matchesStatus = true;
        if (statusVal !== 'all') {
            if (statusVal === 'appealed') {
                matchesStatus = sub.hasAppeal;
            } else {
                matchesStatus = sub.status === statusVal;
            }
        }
        
        // Filter needs audit
        const matchesAudit = auditVal === 'all' || 
            (auditVal === 'need_audit' && sub.needsAudit) || 
            (auditVal === 'not_need_audit' && !sub.needsAudit);
            
        // Filter has appeal
        const matchesAppeal = appealVal === 'all' || 
            (appealVal === 'yes' && sub.hasAppeal) || 
            (appealVal === 'no' && !sub.hasAppeal);

        return matchesSearch && matchesUni && matchesTeam && matchesLeader && matchesTrack && matchesStatus && matchesAudit && matchesAppeal;
    });

    // Render respective table based on active tab
    if (currentActiveTab === 'pending-review') {
        renderPendingReviewTable(filtered.filter(s => s.status === 'pending'));
    } else if (currentActiveTab === 'leader-reviews') {
        renderLeaderReviewsTable(filtered.filter(s => s.status === 'graded' || s.status === 'approved' || s.status === 'rejected'));
    } else if (currentActiveTab === 'audit-queue') {
        renderAuditQueueTable(filtered.filter(s => s.needsAudit));
    } else if (currentActiveTab === 'leader-performance') {
        renderLeaderPerformanceTable();
    } else if (currentActiveTab === 'appeals-tab') {
        renderAppealsTable(filtered.filter(s => s.hasAppeal));
    }
};

// Tab 1: Pending Review Table
function renderPendingReviewTable(data) {
    const tbody = document.getElementById('table-body-pending-review');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-gray-500">لا توجد مشاريع معلقة بانتظار المراجعة.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(sub => {
        const studentName = sub.user?.full_name || 'طالب غير معروف';
        const avatar = sub.user?.avatar_url || 'https://ui-avatars.com/api/?name=Admin&background=006A67&color=fff';
        const projectTitle = sub.project?.title || 'مشروع بدون عنوان';
        const teamObj = teamsList.find(t => t.id === sub.user?.team_id);
        const teamName = teamObj?.name || 'بدون فريق';
        
        // Find leader of the team
        const leaderObj = leadersList.find(l => l.id === teamObj?.leader_id);
        const leaderName = leaderObj?.full_name || 'غير محدد';
        
        const dateStr = new Date(sub.submitted_at).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        
        // Time elapsed since submission
        const daysElapsed = Math.floor((new Date().getTime() - new Date(sub.submitted_at).getTime()) / (1000 * 60 * 60 * 24));
        let timeElapsedText = '';
        let priorityBadge = '';
        
        if (daysElapsed === 0) {
            timeElapsedText = 'اليوم';
            priorityBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400">Normal</span>';
        } else {
            timeElapsedText = `منذ ${daysElapsed} يوم`;
            if (daysElapsed >= 3) {
                priorityBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400">High</span>';
            } else {
                priorityBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">Medium</span>';
            }
        }

        return `
            <tr class="hover:bg-white/5 border-b border-white/5 transition-colors">
                <td class="p-4 flex items-center gap-3">
                    <img src="${avatar}" class="w-9 h-9 rounded-full object-cover border border-white/10" onerror="this.src='../../assets/icons/BUSLA-icon.png'">
                    <div>
                        <div class="font-bold text-white text-sm">${studentName}</div>
                        <div class="text-[10px] text-gray-500">${sub.user?.university || ''}</div>
                    </div>
                </td>
                <td class="p-4 text-center font-bold text-gray-200 text-xs">${projectTitle}</td>
                <td class="p-4 text-center text-xs">
                    <div class="text-white font-bold">${teamName}</div>
                </td>
                <td class="p-4 text-center text-xs text-gray-300 font-bold">${leaderName}</td>
                <td class="p-4 text-center text-xs text-gray-400">---</td>
                <td class="p-4 text-center text-xs font-mono text-gray-400">${dateStr}</td>
                <td class="p-4 text-center text-xs text-gray-300">${timeElapsedText}</td>
                <td class="p-4 text-center">${priorityBadge}</td>
                <td class="p-4 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">⏳ المعلق</span>
                </td>
                <td class="p-4 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                        <button onclick="window.openProjectDetailsDrawer('${sub.id}')" class="px-2.5 py-1.5 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white transition-all text-xs font-bold border border-teal-500/20" title="فتح المشروع">
                            فتح التسليم
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Tab 2: Leader Reviews Table
function renderLeaderReviewsTable(data) {
    const tbody = document.getElementById('table-body-leader-reviews');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-gray-500">لا توجد مراجعات مصححة مطابقة.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(sub => {
        const studentName = sub.user?.full_name || 'طالب غير معروف';
        const avatar = sub.user?.avatar_url || 'https://ui-avatars.com/api/?name=Admin&background=006A67&color=fff';
        const projectTitle = sub.project?.title || 'مشروع بدون عنوان';
        const teamObj = teamsList.find(t => t.id === sub.user?.team_id);
        const teamName = teamObj?.name || 'بدون فريق';
        
        const graderName = sub.grader?.full_name || sub.graded_by_name || 'ليدر غير معروف';
        const gradingDate = sub.graded_at ? new Date(sub.graded_at).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '---';

        // Calculation of grading duration
        let durationText = '---';
        if (sub.graded_at && sub.submitted_at) {
            const minutes = Math.floor((new Date(sub.graded_at).getTime() - new Date(sub.submitted_at).getTime()) / (1000 * 60));
            if (minutes < 60) {
                durationText = `${minutes} دقيقة`;
            } else if (minutes < 24 * 60) {
                durationText = `${Math.floor(minutes / 60)} ساعة`;
            } else {
                durationText = `${Math.floor(minutes / (24 * 60))} يوم`;
            }
        }

        // Review status badge
        let statusBadge = '';
        if (sub.status === 'approved') {
            statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400">✅ معتمد</span>';
        } else if (sub.status === 'rejected') {
            statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400">❌ مرفوض</span>';
        } else {
            statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">⏳ بانتظار المراجعة</span>';
        }

        return `
            <tr class="hover:bg-white/5 border-b border-white/5 transition-colors">
                <td class="p-4 flex items-center gap-3">
                    <img src="${avatar}" class="w-9 h-9 rounded-full object-cover border border-white/10" onerror="this.src='../../assets/icons/BUSLA-icon.png'">
                    <div>
                        <div class="font-bold text-white text-sm">${studentName}</div>
                        <div class="text-[10px] text-gray-500">${sub.user?.university || ''}</div>
                    </div>
                </td>
                <td class="p-4 text-center font-bold text-gray-200 text-xs">${projectTitle}</td>
                <td class="p-4 text-center text-xs text-white">${teamName}</td>
                <td class="p-4 text-center text-xs text-purple-400 font-bold">${graderName}</td>
                <td class="p-4 text-center font-mono font-bold text-sm text-white">${sub.grade} / ${sub.project?.max_points || 100}</td>
                <td class="p-4 text-center text-xs font-mono text-gray-400">${gradingDate}</td>
                <td class="p-4 text-center text-xs text-gray-300 font-mono">${durationText}</td>
                <td class="p-4 text-center">${statusBadge}</td>
                <td class="p-4 text-center">
                    <button onclick="window.openProjectDetailsDrawer('${sub.id}')" class="px-2.5 py-1.5 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white transition-all text-xs font-bold border border-teal-500/20" title="مراجعة التقييم">
                        مراجعة
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Tab 3: Audit Queue Table
function renderAuditQueueTable(data) {
    const tbody = document.getElementById('table-body-audit-queue');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500">طابور التدقيق فارغ حالياً.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(sub => {
        const studentName = sub.user?.full_name || 'طالب غير معروف';
        const projectTitle = sub.project?.title || 'مشروع بدون عنوان';
        const teamObj = teamsList.find(t => t.id === sub.user?.team_id);
        const leaderObj = leadersList.find(l => l.id === teamObj?.leader_id);
        const leaderName = leaderObj?.full_name || 'غير معروف';

        // Translate audit reasons
        const reasonsLabels = {
            appeal: '<span class="bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded text-[10px] font-bold">⚠️ اعتراض طالب</span>',
            grade_100: '<span class="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded text-[10px] font-bold">💯 درجة 100%</span>',
            fast_grading: '<span class="bg-orange-500/10 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded text-[10px] font-bold">⚡ تصحيح سريع جداً</span>',
            same_score: '<span class="bg-purple-500/10 text-purple-500 border border-purple-500/20 px-2 py-0.5 rounded text-[10px] font-bold">👥 درجات متطابقة للفريق</span>',
            random: '<span class="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-[10px] font-bold">🎲 مراجعة عشوائية</span>',
            difference: '<span class="bg-pink-500/10 text-pink-400 border border-pink-500/20 px-2 py-0.5 rounded text-[10px] font-bold">⚖️ تباين في تقييم الأدمن</span>'
        };

        const auditBadges = (sub.auditReasons || []).map(r => reasonsLabels[r] || r).join(' ');
        
        let auditStatus = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">معلق للتدقيق</span>';
        if (sub.auditRecord?.status === 'completed') {
            auditStatus = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400">✅ تم التدقيق</span>';
        }

        return `
            <tr class="hover:bg-white/5 border-b border-white/5 transition-colors">
                <td class="p-4">
                    <div class="font-bold text-white text-sm">${studentName}</div>
                    <div class="text-[10px] text-gray-500 mt-0.5">${projectTitle}</div>
                </td>
                <td class="p-4 text-center text-xs text-gray-300 font-bold">${leaderName}</td>
                <td class="p-4 text-center"><div class="flex flex-wrap gap-1 justify-center">${auditBadges}</div></td>
                <td class="p-4 text-center font-mono font-bold text-white text-sm">${sub.grade || 0} / ${sub.project?.max_points || 100}</td>
                <td class="p-4 text-center">${auditStatus}</td>
                <td class="p-4 text-center">
                    <button onclick="window.openProjectDetailsDrawer('${sub.id}', 'admin-review')" class="px-2.5 py-1.5 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white transition-all text-xs font-bold border border-teal-500/20" title="بدء التدقيق">
                        تدقيق التقييم
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Tab 4: Leader Performance Table
function renderLeaderPerformanceTable() {
    const tbody = document.getElementById('table-body-leader-performance');
    if (!tbody) return;

    // Aggregate performance data by leader ID
    const perfMap = {}; // leaderId -> data
    
    submissionsData.forEach(sub => {
        const leaderId = sub.graded_by;
        if (!leaderId) return;

        if (!perfMap[leaderId]) {
            const leaderObj = leadersList.find(l => l.id === leaderId);
            const teamObj = teamsList.find(t => t.leader_id === leaderId);
            
            perfMap[leaderId] = {
                id: leaderId,
                name: leaderObj?.full_name || sub.graded_by_name || 'قائد غير معروف',
                team: teamObj?.name || 'بدون فريق',
                gradedCount: 0,
                totalScoreGiven: 0,
                totalDurationMs: 0,
                appealsCount: 0,
                regradedCount: 0,
                matchingCount: 0,
                auditedCount: 0
            };
        }

        const stats = perfMap[leaderId];
        stats.gradedCount++;
        stats.totalScoreGiven += sub.grade || 0;

        if (sub.graded_at && sub.submitted_at) {
            stats.totalDurationMs += new Date(sub.graded_at).getTime() - new Date(sub.submitted_at).getTime();
        }

        if (sub.hasAppeal) {
            stats.appealsCount++;
        }

        if (sub.auditRecord) {
            stats.auditedCount++;
            if (sub.auditRecord.admin_grade !== undefined && sub.auditRecord.admin_grade !== null) {
                if (sub.auditRecord.admin_grade === sub.grade) {
                    stats.matchingCount++;
                } else {
                    stats.regradedCount++;
                }
            }
        }
    });

    const perfArray = Object.values(perfMap);
    if (perfArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-gray-500">لا تتوفر بيانات أداء لليدرز حالياً.</td></tr>`;
        return;
    }

    tbody.innerHTML = perfArray.map(stats => {
        const avgGrade = Math.round(stats.totalScoreGiven / stats.gradedCount);
        
        // Avg Grading Time calculation
        let avgTimeText = '--';
        const avgMs = stats.totalDurationMs / stats.gradedCount;
        if (avgMs > 0) {
            const hours = avgMs / (1000 * 60 * 60);
            if (hours < 24) {
                avgTimeText = `${Math.round(hours)} ساعة`;
            } else {
                avgTimeText = `${(hours / 24).toFixed(1)} يوم`;
            }
        }

        // Match rate calculation
        const matchRate = stats.auditedCount > 0 ? Math.round((stats.matchingCount / stats.auditedCount) * 100) : 100;

        // Trust Score calculation
        const appealRate = stats.appealsCount / stats.gradedCount;
        const discrepencyRate = stats.regradedCount / Math.max(1, stats.auditedCount);
        
        let trustScore = 100;
        trustScore -= (appealRate * 35);
        trustScore -= (discrepencyRate * 45);
        
        // Deduct if average grading speed is abnormally fast (< 30 minutes)
        if (avgMs > 0 && avgMs < 1000 * 60 * 30) {
            trustScore -= 15;
        }

        trustScore = Math.max(10, Math.min(100, Math.round(trustScore)));

        // Trust Score badge
        let trustBadge = '';
        let statusBadge = '';
        if (trustScore >= 90) {
            trustBadge = `<span class="text-green-400 font-black">${trustScore}%</span>`;
            statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400">Excellent</span>';
        } else if (trustScore >= 70) {
            trustBadge = `<span class="text-yellow-500 font-black">${trustScore}%</span>`;
            statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">Needs Review</span>';
        } else {
            trustBadge = `<span class="text-red-500 font-black">${trustScore}%</span>`;
            statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400">High Risk</span>';
        }

        return `
            <tr class="hover:bg-white/5 border-b border-white/5 transition-colors">
                <td class="p-4 font-bold text-white">${stats.name}</td>
                <td class="p-4 text-center text-xs text-gray-300 font-bold">${stats.team}</td>
                <td class="p-4 text-center font-bold text-sm text-white">${stats.gradedCount}</td>
                <td class="p-4 text-center text-sm font-mono text-gray-300">${avgGrade} / 100</td>
                <td class="p-4 text-center text-xs text-gray-300 font-mono">${avgTimeText}</td>
                <td class="p-4 text-center text-sm font-bold text-red-400">${stats.appealsCount}</td>
                <td class="p-4 text-center text-sm font-bold text-orange-400">${stats.regradedCount}</td>
                <td class="p-4 text-center text-sm font-mono font-bold text-gray-300">${matchRate}%</td>
                <td class="p-4 text-center text-base font-mono font-black">${trustBadge}</td>
                <td class="p-4 text-center">${statusBadge}</td>
            </tr>
        `;
    }).join('');
}

// Tab 5: Appeals Table
function renderAppealsTable(data) {
    const tbody = document.getElementById('table-body-appeals');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-gray-500">لا توجد اعتراضات مقدمة حالياً.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(sub => {
        const studentName = sub.user?.full_name || 'طالب غير معروف';
        const projectTitle = sub.project?.title || 'مشروع بدون عنوان';
        const teamObj = teamsList.find(t => t.id === sub.user?.team_id);
        const leaderObj = leadersList.find(l => l.id === teamObj?.leader_id);
        const leaderName = leaderObj?.full_name || 'غير معروف';
        
        const appeal = sub.appealRecord || {};
        const reason = appeal.reason || 'تظلم عام';
        const comments = appeal.comments || 'لا توجد تعليقات إضافية.';
        
        // Final decision badge
        let decisionBadge = '';
        if (appeal.status === 'resolved_approved') {
            decisionBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400">✅ تم قبول التظلم</span>';
        } else if (appeal.status === 'resolved_rejected') {
            decisionBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400">❌ تم رفض التظلم</span>';
        } else {
            decisionBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">⏳ قيد الفحص</span>';
        }

        return `
            <tr class="hover:bg-white/5 border-b border-white/5 transition-colors">
                <td class="p-4">
                    <div class="font-bold text-white text-sm">${studentName}</div>
                    <div class="text-[10px] text-gray-500 mt-0.5">${projectTitle}</div>
                </td>
                <td class="p-4 text-center text-xs text-gray-300 font-bold">${leaderName}</td>
                <td class="p-4 text-center text-xs text-red-400 font-bold">${reason}</td>
                <td class="p-4 text-right text-xs text-gray-300 max-w-[200px] truncate" title="${comments}">${comments}</td>
                <td class="p-4 text-center text-xs">
                    <a href="${sub.submission_link}" target="_blank" class="text-blue-400 hover:underline">الملفات</a>
                </td>
                <td class="p-4 text-center">${decisionBadge}</td>
                <td class="p-4 text-center">
                    <button onclick="window.openProjectDetailsDrawer('${sub.id}', 'admin-review')" class="px-2.5 py-1.5 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white transition-all text-xs font-bold border border-teal-500/20" title="البدء في حل التظلم">
                        حل الاعتراض
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================================================
// 🚪 DRAWER CONTROL
// ============================================================================
window.openProjectDetailsDrawer = (subId, targetTab = 'submission') => {
    const sub = submissionsData.find(s => s.id === subId);
    if (!sub) return;

    selectedSubmission = sub;
    selectedSubmissionAppeal = appealsData.find(a => a.submission_id === sub.id) || null;
    selectedSubmissionAudit = auditsData.find(a => a.submission_id === sub.id) || null;

    // Fill Header
    document.getElementById('drawer-project-title').innerText = sub.project?.title || 'مشروع بدون عنوان';
    document.getElementById('drawer-student-subtext').innerText = `الطالب: ${sub.user?.full_name || 'غير معروف'} | الجامعة: ${sub.user?.university || 'غير معروف'}`;

    // Fill Submission Tab
    document.getElementById('sub-student-name').innerText = sub.user?.full_name || 'غير معروف';
    const teamObj = teamsList.find(t => t.id === sub.user?.team_id);
    document.getElementById('sub-team-name').innerText = `فريق: ${teamObj?.name || 'بدون فريق'}`;
    
    // Course and Phase details mapping
    document.getElementById('sub-course-title').innerText = 'IC Course';
    document.getElementById('sub-phase-title').innerText = 'المرحلة الحالية';
    
    const mainLink = document.getElementById('sub-main-link');
    mainLink.href = sub.submission_link;
    document.getElementById('sub-main-link-text').innerText = sub.submission_link;
    
    // Auxiliary links (GitHub / Demo) - Mocked from submission link or defaults if empty
    let githubUrl = sub.submission_link.includes('github.com') ? sub.submission_link : 'https://github.com';
    let demoUrl = sub.submission_link.includes('github') ? 'https://demo.com' : sub.submission_link;
    
    document.getElementById('sub-github-link').href = githubUrl;
    document.getElementById('sub-demo-link').href = demoUrl;
    document.getElementById('sub-images-link').href = sub.submission_link;
    document.getElementById('sub-video-link').href = sub.submission_link;

    // Fill Leader Review Tab
    document.getElementById('leader-review-grade').innerText = sub.grade !== null ? sub.grade : '--';
    document.getElementById('leader-review-by').innerText = sub.grader?.full_name || sub.graded_by_name || 'لم يصحح بعد';
    
    const gradingDate = sub.graded_at ? new Date(sub.graded_at).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'لم يصحح';
    document.getElementById('leader-review-date').innerText = gradingDate;

    // Calculation of grading duration
    let durationText = '---';
    if (sub.graded_at && sub.submitted_at) {
        const diffMs = new Date(sub.graded_at).getTime() - new Date(sub.submitted_at).getTime();
        const minutes = Math.floor(diffMs / (1000 * 60));
        durationText = minutes < 60 ? `${minutes} دقيقة` : `${Math.floor(minutes / 60)} ساعة`;
    }
    document.getElementById('leader-review-duration').innerText = durationText;
    document.getElementById('leader-review-feedback').innerText = sub.feedback_text || 'لا توجد تعليقات مكتوبة.';

    // Populate Leader Rubric
    populateLeaderRubricGrid(sub);

    // Populate Admin Review Tab Form
    populateAdminRubricForm(sub);

    // Populate Comparison
    populateComparisonTab(sub);

    // Populate History Timeline
    populateHistoryTimeline(sub);

    // Adjust Drawer Footer Action Buttons based on status
    adjustFooterButtons(sub);

    // Open Drawer UI
    const drawer = document.getElementById('project-details-drawer');
    const overlay = document.getElementById('drawer-overlay');
    const panel = document.getElementById('project-drawer-panel');

    drawer.classList.remove('hidden');
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        panel.classList.remove('translate-x-full');
    }, 50);

    switchDrawerSubtab(targetTab);
};

window.closeProjectDetailsDrawer = () => {
    const overlay = document.getElementById('drawer-overlay');
    const panel = document.getElementById('project-drawer-panel');
    const drawer = document.getElementById('project-details-drawer');

    overlay.classList.add('opacity-0');
    panel.classList.add('translate-x-full');
    setTimeout(() => {
        drawer.classList.add('hidden');
        selectedSubmission = null;
        selectedSubmissionAppeal = null;
        selectedSubmissionAudit = null;
    }, 300);
};

// Switch sub-tabs inside Drawer
function switchDrawerSubtab(tabName) {
    currentDrawerTab = tabName;
    
    const btns = document.querySelectorAll('.drawer-subtab-btn');
    btns.forEach(b => {
        if (b.getAttribute('data-tab') === tabName) {
            b.classList.add('bg-white/10', 'text-white');
            b.classList.remove('text-gray-400', 'hover:bg-white/5');
        } else {
            b.classList.remove('bg-white/10', 'text-white');
            b.classList.add('text-gray-400', 'hover:bg-white/5');
        }
    });

    const contents = document.querySelectorAll('.drawer-tab-content');
    contents.forEach(c => {
        if (c.id === `drawer-content-${tabName}`) {
            c.classList.remove('hidden');
        } else {
            c.classList.add('hidden');
        }
    });
}

// Populate leader rubric display inside Leader Review Tab
function populateLeaderRubricGrid(sub) {
    const container = document.getElementById('leader-review-rubric-container');
    if (!container) return;

    let rubricScores = {};
    if (sub.rubric_scores) {
        rubricScores = typeof sub.rubric_scores === 'string' ? JSON.parse(sub.rubric_scores) : sub.rubric_scores;
    }

    let criteria = [];
    try {
        const rubricRaw = sub.project?.rubric_json;
        if (typeof rubricRaw === 'string') criteria = JSON.parse(rubricRaw).criteria || [];
        else if (typeof rubricRaw === 'object') criteria = rubricRaw?.criteria || [];
    } catch(e) {}

    if (criteria && criteria.length > 0) {
        container.innerHTML = criteria.map(c => {
            const score = rubricScores[c.aspect] !== undefined ? rubricScores[c.aspect] : '--';
            return `
                <div class="bg-black/30 p-3 rounded-xl border border-white/5 flex justify-between items-center">
                    <div>
                        <h5 class="font-bold text-white text-xs">${c.aspect}</h5>
                        <p class="text-[10px] text-gray-400 mt-0.5">${c.description}</p>
                    </div>
                    <div class="font-mono font-bold text-xs text-white bg-black/60 px-3 py-1 rounded-lg">
                        ${score} / ${c.points}
                    </div>
                </div>
            `;
        }).join('');
    } else {
        container.innerHTML = `<p class="text-xs text-gray-500 italic">هذا المشروع لا يحتوي على معايير تقييم مفصلة. تم رصد الدرجة إجمالياً.</p>`;
    }
}

// Populate Admin rubric form fields inside Admin Review Tab
function populateAdminRubricForm(sub) {
    const formContainer = document.getElementById('admin-rubric-form-container');
    const manualContainer = document.getElementById('admin-manual-grade-container');
    if (!formContainer || !manualContainer) return;

    let criteria = [];
    try {
        const rubricRaw = sub.project?.rubric_json;
        if (typeof rubricRaw === 'string') criteria = JSON.parse(rubricRaw).criteria || [];
        else if (typeof rubricRaw === 'object') criteria = rubricRaw?.criteria || [];
    } catch(e) {}

    // Load admin's past scores if already audited, otherwise load leader scores
    let activeScores = {};
    if (selectedSubmissionAudit && selectedSubmissionAudit.admin_rubric_scores) {
        activeScores = typeof selectedSubmissionAudit.admin_rubric_scores === 'string' ? JSON.parse(selectedSubmissionAudit.admin_rubric_scores) : selectedSubmissionAudit.admin_rubric_scores;
    } else if (sub.rubric_scores) {
        activeScores = typeof sub.rubric_scores === 'string' ? JSON.parse(sub.rubric_scores) : sub.rubric_scores;
    }

    if (criteria && criteria.length > 0) {
        formContainer.classList.remove('hidden');
        manualContainer.classList.add('hidden');
        
        formContainer.innerHTML = criteria.map((c, idx) => {
            const val = activeScores[c.aspect] !== undefined ? activeScores[c.aspect] : c.points;
            return `
                <div class="bg-black/35 p-4 rounded-xl border border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div class="flex-1">
                        <h4 class="font-bold text-white text-xs">${c.aspect}</h4>
                        <p class="text-[10px] text-gray-400 mt-1">${c.description}</p>
                    </div>
                    <div class="flex items-center gap-3 shrink-0" dir="ltr">
                        <input type="number" id="admin-score-input-${idx}" class="admin-rubric-input w-20 bg-black border border-white/20 rounded-lg text-center text-white py-1.5 focus:border-b-primary outline-none font-mono text-xs" min="0" max="${c.points}" value="${val}" data-aspect="${c.aspect}" data-max="${c.points}" oninput="window.updateAdminReviewTotalScore()">
                        <span class="text-xs text-gray-500 font-mono">/ ${c.points}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        window.updateAdminReviewTotalScore();
    } else {
        formContainer.classList.add('hidden');
        manualContainer.classList.remove('hidden');
        
        const maxPoints = sub.project?.max_points || 100;
        document.getElementById('admin-manual-max-points').innerText = maxPoints;
        
        const manualInput = document.getElementById('admin-manual-score-input');
        manualInput.max = maxPoints;
        manualInput.value = selectedSubmissionAudit?.admin_grade !== undefined ? selectedSubmissionAudit.admin_grade : (sub.grade !== null ? sub.grade : maxPoints);
    }

    document.getElementById('admin-review-feedback').value = selectedSubmissionAudit?.admin_feedback || '';
}

// Calculate Admin score on rubric inputs change
window.updateAdminReviewTotalScore = () => {
    const inputs = document.querySelectorAll('.admin-rubric-input');
    let total = 0;
    inputs.forEach(input => {
        const val = parseInt(input.value) || 0;
        const max = parseInt(input.getAttribute('data-max')) || 0;
        if (val > max) input.value = max;
        if (val < 0) input.value = 0;
        total += parseInt(input.value) || 0;
    });
    
    // We can display the cumulative score dynamically in the UI
    const scoreTitle = document.getElementById('drawer-project-title');
    if (scoreTitle && selectedSubmission) {
        const maxPoints = selectedSubmission.project?.max_points || 100;
        // Optionally update subtitle
    }
};

// Populate Comparison tab layout
function populateComparisonTab(sub) {
    const tbody = document.getElementById('comparison-table-body');
    const compLeaderEl = document.getElementById('comp-leader-score');
    const compAdminEl = document.getElementById('comp-admin-score');
    const compVarianceEl = document.getElementById('comp-variance-badge');
    
    if (!tbody) return;

    let leaderScores = {};
    if (sub.rubric_scores) {
        leaderScores = typeof sub.rubric_scores === 'string' ? JSON.parse(sub.rubric_scores) : sub.rubric_scores;
    }

    // Get admin scores
    let adminScores = {};
    let adminTotalGrade = selectedSubmissionAudit?.admin_grade;

    if (selectedSubmissionAudit && selectedSubmissionAudit.admin_rubric_scores) {
        adminScores = typeof selectedSubmissionAudit.admin_rubric_scores === 'string' ? JSON.parse(selectedSubmissionAudit.admin_rubric_scores) : selectedSubmissionAudit.admin_rubric_scores;
    } else {
        // If not audited, fall back to leader review as default
        adminScores = leaderScores;
    }

    let criteria = [];
    try {
        const rubricRaw = sub.project?.rubric_json;
        if (typeof rubricRaw === 'string') criteria = JSON.parse(rubricRaw).criteria || [];
        else if (typeof rubricRaw === 'object') criteria = rubricRaw?.criteria || [];
    } catch(e) {}

    // Fill header scores
    compLeaderEl.innerText = sub.grade !== null ? `${sub.grade} / ${sub.project?.max_points || 100}` : '--';
    compAdminEl.innerText = adminTotalGrade !== undefined && adminTotalGrade !== null ? `${adminTotalGrade} / ${sub.project?.max_points || 100}` : 'بانتظار المراجعة';

    // Calculate Variance
    if (sub.grade !== null && adminTotalGrade !== undefined && adminTotalGrade !== null) {
        const variance = Math.abs(sub.grade - adminTotalGrade);
        compVarianceEl.innerText = `${variance} درجات`;
        compVarianceEl.className = `font-mono font-black text-lg px-4 py-2 rounded-xl border ${variance > 5 ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20'}`;
    } else {
        compVarianceEl.innerText = '-- درجة';
        compVarianceEl.className = 'bg-white/5 border border-white/10 text-white font-mono font-black text-lg px-4 py-2 rounded-xl';
    }

    if (criteria && criteria.length > 0) {
        tbody.innerHTML = criteria.map(c => {
            const lScore = leaderScores[c.aspect] !== undefined ? leaderScores[c.aspect] : 0;
            const aScore = adminScores[c.aspect] !== undefined ? adminScores[c.aspect] : lScore;
            const diff = aScore - lScore;
            
            let diffHTML = '';
            if (diff > 0) {
                diffHTML = `<span class="text-green-400 font-bold font-mono">+${diff}</span>`;
            } else if (diff < 0) {
                diffHTML = `<span class="text-red-400 font-bold font-mono">${diff}</span>`;
            } else {
                diffHTML = `<span class="text-gray-500 font-mono">0</span>`;
            }

            return `
                <tr class="hover:bg-white/5 border-b border-white/5 transition-colors">
                    <td class="p-3 font-bold text-white">${c.aspect}</td>
                    <td class="p-3 text-center font-mono font-bold text-gray-300">${lScore} / ${c.points}</td>
                    <td class="p-3 text-center font-mono font-bold text-teal-400">${aScore} / ${c.points}</td>
                    <td class="p-3 text-center">${diffHTML}</td>
                </tr>
            `;
        }).join('');
    } else {
        tbody.innerHTML = `
            <tr class="border-b border-white/5">
                <td class="p-4 font-bold text-white">الدرجة الإجمالية للمشروع</td>
                <td class="p-4 text-center font-mono font-bold text-gray-300">${sub.grade || 0}</td>
                <td class="p-4 text-center font-mono font-bold text-teal-400">${adminTotalGrade || '--'}</td>
                <td class="p-4 text-center">
                    ${adminTotalGrade !== undefined && adminTotalGrade !== null ? (adminTotalGrade - (sub.grade || 0)) : '--'}
                </td>
            </tr>
        `;
    }
}

// Populate History Timeline
function populateHistoryTimeline(sub) {
    const container = document.getElementById('drawer-history-timeline');
    if (!container) return;

    const timelineEvents = [];
    
    // 1. Submitted event
    timelineEvents.push({
        title: "تم تسليم المشروع من الطالب",
        detail: "قام الطالب برفع رابط المشروع الأساسي بنجاح.",
        date: sub.submitted_at,
        icon: "fa-paper-plane",
        color: "text-blue-400 bg-blue-500/10 border-blue-500/20"
    });

    // 2. Graded by leader event
    if (sub.graded_at) {
        const grader = sub.grader?.full_name || sub.graded_by_name || 'الليدر';
        timelineEvents.push({
            title: `تم رصد التقييم بواسطة الليدر: ${grader}`,
            detail: `رصد درجة (${sub.grade}) مع إعطاء تعليق: "${sub.feedback_text || ''}"`,
            date: sub.graded_at,
            icon: "fa-check-circle",
            color: "text-purple-400 bg-purple-500/10 border-purple-500/20"
        });
    }

    // 3. Appeal filed event
    if (sub.hasAppeal) {
        timelineEvents.push({
            title: "تقديم تظلم واعتراض من الطالب",
            detail: `سبب الاعتراض: "${sub.appealRecord?.reason || ''}" | تفاصيل: "${sub.appealRecord?.comments || ''}"`,
            date: sub.appealRecord?.created_at,
            icon: "fa-exclamation-triangle",
            color: "text-red-400 bg-red-500/10 border-red-500/20"
        });
    }

    // 4. Audited by admin event
    if (selectedSubmissionAudit && selectedSubmissionAudit.status === 'completed') {
        const resolver = 'الإدارة العامة';
        timelineEvents.push({
            title: "تم إنهاء التدقيق والمراجعة الإدارية",
            detail: `رصد الأدمن درجة (${selectedSubmissionAudit.admin_grade}) مع المبررات: "${selectedSubmissionAudit.admin_feedback || ''}"`,
            date: selectedSubmissionAudit.resolved_at,
            icon: "fa-user-shield",
            color: "text-teal-400 bg-teal-500/10 border-teal-500/20"
        });
    }

    // Sort by date ascending
    timelineEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    container.innerHTML = timelineEvents.map(e => {
        const timeStr = new Date(e.date).toLocaleString('ar-EG');
        return `
            <div class="relative mb-5 last:mb-0">
                <div class="absolute -right-[33px] top-0 w-8 h-8 rounded-full border flex items-center justify-center text-xs ${e.color}">
                    <i class="fas ${e.icon}"></i>
                </div>
                <div class="bg-black/30 border border-white/5 rounded-xl p-4">
                    <h5 class="font-bold text-white text-xs flex justify-between items-center">
                        <span>${e.title}</span>
                        <span class="text-[10px] text-gray-500 font-mono font-normal">${timeStr}</span>
                    </h5>
                    <p class="text-xs text-gray-400 mt-2 leading-relaxed">${e.detail}</p>
                </div>
            </div>
        `;
    }).join('');
}

// Adjust drawer footer buttons based on submission status
function adjustFooterButtons(sub) {
    const btnApprove = document.getElementById('btn-drawer-approve');
    const btnSaveAudit = document.getElementById('btn-drawer-save-audit');
    const btnReject = document.getElementById('btn-drawer-reject');
    
    // Default show/hide configuration
    if (sub.status === 'pending') {
        btnApprove.classList.add('hidden');
        btnSaveAudit.classList.add('hidden');
        btnReject.classList.add('hidden');
    } else if (sub.status === 'graded') {
        btnApprove.classList.remove('hidden');
        btnSaveAudit.classList.remove('hidden');
        btnReject.classList.remove('hidden');
    } else if (sub.status === 'approved') {
        btnApprove.classList.add('hidden');
        btnSaveAudit.classList.remove('hidden'); // allow audit updates
        btnReject.classList.remove('hidden'); // allow rejection
    } else if (sub.status === 'rejected') {
        btnApprove.classList.add('hidden');
        btnSaveAudit.classList.add('hidden');
        btnReject.classList.add('hidden');
    }
}

// Copy helper
window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    window.showToast("تم نسخ الرابط للحافظة!", "success");
};

// ============================================================================
// 💼 ACTIONS & WRITING TO SUPABASE
// ============================================================================

// Action 1: Approve Leader Grading directly
window.approveLeaderGradingAction = async () => {
    if (!selectedSubmission) return;
    
    const btn = document.getElementById('btn-drawer-approve');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    btn.disabled = true;

    try {
        const sub = selectedSubmission;
        
        // Update submission status to 'approved'
        const { error } = await supabase.from('project_submissions').update({
            status: 'approved'
        }).eq('id', sub.id);

        if (error) throw error;

        // If there's an audit record, resolve it
        if (selectedSubmissionAudit) {
            await supabase.from('project_audits').update({
                status: 'completed',
                admin_grade: sub.grade,
                admin_rubric_scores: sub.rubric_scores,
                admin_feedback: "تم اعتماد درجة الليدر مباشرة بدون تعديل.",
                resolved_by: currentAdminUser?.id || null,
                resolved_at: new Date()
            }).eq('id', selectedSubmissionAudit.id);
        } else {
            // Create a completed audit record
            await supabase.from('project_audits').insert({
                submission_id: sub.id,
                reason: sub.auditReasons?.join(',') || 'direct_approval',
                admin_grade: sub.grade,
                admin_rubric_scores: sub.rubric_scores,
                admin_feedback: "اعتماد مباشر",
                status: 'completed',
                resolved_by: currentAdminUser?.id || null,
                resolved_at: new Date()
            });
        }

        // If there's an appeal, resolve it as rejected (original grade kept)
        if (selectedSubmissionAppeal) {
            await supabase.from('project_appeals').update({
                status: 'resolved_rejected',
                decision_text: "تم فحص الاعتراض واعتماد التقييم الأصلي بنجاح.",
                resolved_by: currentAdminUser?.id || null,
                resolved_at: new Date()
            }).eq('id', selectedSubmissionAppeal.id);
        }

        window.showToast("تم اعتماد درجة الليدر بنجاح!", "success");
        window.closeProjectDetailsDrawer();
        await window.fetchAuditDashboardData();

    } catch (err) {
        console.error("Approve Grading Error:", err);
        window.showToast("فشل اعتماد التقييم", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// Action 2: Save Administrative Review/Audit Grading
window.saveAdminAuditAction = async () => {
    if (!selectedSubmission) return;

    const btn = document.getElementById('btn-drawer-save-audit');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري رصد الدرجة...';
    btn.disabled = true;

    try {
        const sub = selectedSubmission;
        let finalAdminGrade = 0;
        let rubricScores = {};
        const maxPoints = sub.project?.max_points || 100;

        let criteria = [];
        try {
            const rubricRaw = sub.project?.rubric_json;
            if (typeof rubricRaw === 'string') criteria = JSON.parse(rubricRaw).criteria || [];
            else if (typeof rubricRaw === 'object') criteria = rubricRaw?.criteria || [];
        } catch(e) {}

        const inputs = document.querySelectorAll('.admin-rubric-input');
        if (criteria.length > 0 && inputs.length > 0) {
            inputs.forEach(input => {
                const aspect = input.getAttribute('data-aspect');
                const score = parseInt(input.value) || 0;
                rubricScores[aspect] = score;
                finalAdminGrade += score;
            });
        } else {
            finalAdminGrade = parseInt(document.getElementById('admin-manual-score-input').value) || 0;
        }

        if (finalAdminGrade > maxPoints) finalAdminGrade = maxPoints;
        if (finalAdminGrade < 0) finalAdminGrade = 0;

        const feedback = document.getElementById('admin-review-feedback').value.trim();
        if (!feedback) {
            window.showToast("يرجى كتابة ملاحظات الأدمن ومبررات التعديل", "warning");
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        // 1. Calculate Grade Difference for Student XP adjustments
        const originalGrade = sub.grade || 0;
        const gradeDiff = finalAdminGrade - originalGrade;

        // 2. Update project_submissions final grade
        const { error: subErr } = await supabase.from('project_submissions').update({
            status: 'approved',
            grade: finalAdminGrade,
            feedback_text: feedback,
            rubric_scores: rubricScores
        }).eq('id', sub.id);

        if (subErr) throw subErr;

        // 3. Upsert/Update project_audits
        if (selectedSubmissionAudit) {
            await supabase.from('project_audits').update({
                status: 'completed',
                admin_grade: finalAdminGrade,
                admin_rubric_scores: rubricScores,
                admin_feedback: feedback,
                resolved_by: currentAdminUser?.id || null,
                resolved_at: new Date()
            }).eq('id', selectedSubmissionAudit.id);
        } else {
            await supabase.from('project_audits').insert({
                submission_id: sub.id,
                reason: sub.auditReasons?.join(',') || 'administrative_audit',
                admin_grade: finalAdminGrade,
                admin_rubric_scores: rubricScores,
                admin_feedback: feedback,
                status: 'completed',
                resolved_by: currentAdminUser?.id || null,
                resolved_at: new Date()
            });
        }

        // 4. Update Appeal if exists
        if (selectedSubmissionAppeal) {
            const appealStatus = gradeDiff > 0 ? 'resolved_approved' : 'resolved_rejected';
            await supabase.from('project_appeals').update({
                status: appealStatus,
                decision_text: `تم فحص الاعتراض ورصد درجة مراجعة إدارية نهائية (${finalAdminGrade}). ملاحظات: ${feedback}`,
                resolved_by: currentAdminUser?.id || null,
                resolved_at: new Date()
            }).eq('id', selectedSubmissionAppeal.id);
        }

        // 5. Adjust Student XP and logs if there is a grade difference
        if (gradeDiff !== 0) {
            const studentId = sub.user_id;
            const { data: studentProf } = await supabase.from('profiles').select('total_xp').eq('id', studentId).single();
            const newXp = Math.max(0, (studentProf?.total_xp || 0) + gradeDiff);
            
            await supabase.from('profiles').update({ total_xp: newXp }).eq('id', studentId);
            
            // Log the adjustment in XP logs
            await supabase.from('student_xp_logs').insert({
                user_id: studentId,
                amount: gradeDiff,
                reason: `تعديل تقييم مشروع (مراجعة إدارية): ${sub.project?.title}`,
                source_id: sub.project_id
            });

            // Adjust Team Score if student belongs to a team
            const teamId = sub.user?.team_id;
            if (teamId) {
                const { data: teamProf } = await supabase.from('teams').select('total_score').eq('id', teamId).single();
                const newTeamScore = Math.max(0, (teamProf?.total_score || 0) + gradeDiff);
                await supabase.from('teams').update({ total_score: newTeamScore }).eq('id', teamId);
                
                await supabase.from('team_score_logs').insert({
                    team_id: teamId,
                    contributor_id: studentId,
                    amount: gradeDiff,
                    reason: `تعديل رصيد مشروع العضو (مراجعة إدارية)`
                });
            }
        }

        window.showToast("تم حفظ التقييم الإداري وتحديث الدرجة بنجاح!", "success");
        window.closeProjectDetailsDrawer();
        await window.fetchAuditDashboardData();

    } catch (err) {
        console.error("Save Admin Audit Error:", err);
        window.showToast("حدث خطأ أثناء حفظ التقييم الإداري", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// Action 3: Reject Grading and return project to Leader
window.rejectLeaderGradingAction = async () => {
    if (!selectedSubmission) return;

    const confirmed = await window.showCustomConfirm(
        "تأكيد رفض التصحيح",
        "هل أنت متأكد من رفض تصحيح هذا الليدر وإعادة المشروع له للتصحيح مرة أخرى؟",
        null,
        null,
        'danger'
    );
    if (!confirmed) return;

    const btn = document.getElementById('btn-drawer-reject');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإعادة...';
    btn.disabled = true;

    try {
        const sub = selectedSubmission;
        const feedback = document.getElementById('admin-review-feedback').value.trim() || 'إعادة التقييم لوجود تباين أو خطأ في معايير التصحيح.';

        // Deduct Leader's original score from Student XP before resetting!
        if (sub.grade && sub.grade > 0) {
            const studentId = sub.user_id;
            const { data: studentProf } = await supabase.from('profiles').select('total_xp').eq('id', studentId).single();
            const newXp = Math.max(0, (studentProf?.total_xp || 0) - sub.grade);
            await supabase.from('profiles').update({ total_xp: newXp }).eq('id', studentId);
            
            await supabase.from('student_xp_logs').insert({
                user_id: studentId,
                amount: -sub.grade,
                reason: `سحب تقييم مشروع ملغي للتدقيق: ${sub.project?.title}`,
                source_id: sub.project_id
            });

            // Deduct Team XP
            const teamId = sub.user?.team_id;
            if (teamId) {
                const { data: teamProf } = await supabase.from('teams').select('total_score').eq('id', teamId).single();
                const newTeamScore = Math.max(0, (teamProf?.total_score || 0) - sub.grade);
                await supabase.from('teams').update({ total_score: newTeamScore }).eq('id', teamId);
                
                await supabase.from('team_score_logs').insert({
                    team_id: teamId,
                    contributor_id: studentId,
                    amount: -sub.grade,
                    reason: `سحب نقاط تقييم ملغي`
                });
            }
        }

        // Reset project submission status to 'pending' to allow leader to re-grade it
        const { error } = await supabase.from('project_submissions').update({
            status: 'pending',
            grade: null,
            rubric_scores: null,
            feedback_text: `[إرجاع من الإدارة]: ${feedback}`
        }).eq('id', sub.id);

        if (error) throw error;

        // If there's an audit, update it
        if (selectedSubmissionAudit) {
            await supabase.from('project_audits').update({
                status: 'completed',
                admin_feedback: `تم رفض التقييم وإعادة التصحيح لليدر. مبررات: ${feedback}`,
                resolved_by: currentAdminUser?.id || null,
                resolved_at: new Date()
            }).eq('id', selectedSubmissionAudit.id);
        }

        window.showToast("تم رفض التصحيح وإرجاع المشروع لليدر بنجاح!", "success");
        window.closeProjectDetailsDrawer();
        await window.fetchAuditDashboardData();

    } catch (err) {
        console.error("Reject Grading Error:", err);
        window.showToast("حدث خطأ أثناء رفض تصحيح الليدر", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// Action 4: Transfer/Reassign Reviewer
window.openReassignReviewerModal = () => {
    if (!selectedSubmission) return;

    const selectEl = document.getElementById('reassign-reviewer-select');
    if (!selectEl) return;

    // Populate active leaders options
    selectEl.innerHTML = leadersList.map(l => `<option value="${l.id}">${l.full_name || l.email} (${l.role})</option>`).join('');

    document.getElementById('reassign-reason-textarea').value = '';
    document.getElementById('reassign-reviewer-modal').classList.remove('hidden');
};

window.submitReassignReviewer = async () => {
    if (!selectedSubmission) return;

    const selectEl = document.getElementById('reassign-reviewer-select');
    const reasonText = document.getElementById('reassign-reason-textarea').value.trim();
    const newGraderId = selectEl.value;
    const newGraderName = selectEl.options[selectEl.selectedIndex].text;

    if (!newGraderId) return;

    try {
        // Update graded_by and graded_by_name in submission (or reset to allow grader to grade it)
        const { error } = await supabase.from('project_submissions').update({
            graded_by: newGraderId,
            graded_by_name: newGraderName.split('(')[0].trim(),
            status: 'pending' // reset to pending for the new grader
        }).eq('id', selectedSubmission.id);

        if (error) throw error;

        // Log the change in audit log
        await window.logAdminAction(
            currentAdminUser?.id,
            currentAdminProfile?.full_name || 'Admin',
            'Transfer Reviewer',
            selectedSubmission.project?.title,
            `تحويل تصحيح المشروع لليدر (${newGraderName}). السبب: ${reasonText || 'بدون تفاصيل'}`
        );

        window.showToast("تم تحويل مراجع المشروع بنجاح!", "success");
        document.getElementById('reassign-reviewer-modal').classList.add('hidden');
        window.closeProjectDetailsDrawer();
        await window.fetchAuditDashboardData();

    } catch (err) {
        console.error("Transfer Reviewer Error:", err);
        window.showToast("حدث خطأ أثناء تحويل المراجع", "error");
    }
};

// Action 5: Add Internal Audit Note
window.openAddAuditNoteModal = () => {
    if (!selectedSubmission) return;
    document.getElementById('add-audit-note-textarea').value = '';
    document.getElementById('add-audit-note-modal').classList.remove('hidden');
};

window.submitAddAuditNote = async () => {
    if (!selectedSubmission) return;
    const note = document.getElementById('add-audit-note-textarea').value.trim();
    if (!note) return;

    try {
        // Save note by writing to audit log or updating audit details
        await window.logAdminAction(
            currentAdminUser?.id,
            currentAdminProfile?.full_name || 'Admin',
            'Add Audit Note',
            selectedSubmission.project?.title,
            `ملاحظة إدارية داخلية: ${note}`
        );

        window.showToast("تم تسجيل الملاحظة الإدارية بنجاح!", "success");
        document.getElementById('add-audit-note-modal').classList.add('hidden');
        
        // Refresh history timeline in Drawer
        populateHistoryTimeline(selectedSubmission);

    } catch (err) {
        console.error("Add Audit Note Error:", err);
        window.showToast("حدث خطأ أثناء تسجيل الملاحظة", "error");
    }
};
