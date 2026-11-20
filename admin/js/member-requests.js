import { supabase } from '../../js/supabase-config.js';

// ==========================================
// 🚀 RECRUITMENT & APPLICATIONS ENGINE
// ==========================================

let applicationsData = [];

// 1. Fetch dynamic tracks for academic track filter
window.fetchFilterTracks = async () => {
    try {
        const { data, error } = await supabase.from('tracks').select('id, name');
        if (error) throw error;
        const select = document.getElementById('app-filter-academic-track');
        if (select) {
            select.innerHTML = '<option value="all">Technical Track: All</option>' + 
                (data || []).map(t => `<option value="${t.name}">${t.name}</option>`).join('');
        }
    } catch (err) {
        console.error("Error fetching tracks for filter:", err);
    }
};

// 2. Fetch applications from database
window.fetchApplications = async () => {
    const tbody = document.getElementById('applications-table-body');
    if(tbody) tbody.innerHTML = `<tr><td colspan="7" class="p-10 text-center"><i class="fas fa-spinner fa-spin text-teal-500 text-2xl"></i></td></tr>`;

    try {
        const { data, error } = await supabase
            .from('admin_applications')
            .select('*')
            .order('submitted_at', { ascending: false });

        if (error) throw error;
        
        applicationsData = data || [];
        updateAppStats();
        filterApplications();
        
    } catch (err) {
        console.error("Fetch Applications Error:", err);
        if(tbody) tbody.innerHTML = `<tr><td colspan="7" class="p-10 text-center text-red-500">An error occurred while fetching data.</td></tr>`;
    }
};

// 3. Update statistics (including archive)
function updateAppStats() {
    document.getElementById('stat-total-apps').innerText = applicationsData.length;
    document.getElementById('stat-pending-apps').innerText = applicationsData.filter(a => a.application_status === 'pending').length;
    document.getElementById('stat-accepted-apps').innerText = applicationsData.filter(a => a.application_status === 'accepted').length;
    document.getElementById('stat-rejected-apps').innerText = applicationsData.filter(a => a.application_status === 'rejected').length;
    document.getElementById('stat-archived-apps').innerText = applicationsData.filter(a => a.application_status === 'archived').length;
}

// 4. Filter and render table
window.filterApplications = () => {
    const search = document.getElementById('app-filter-search')?.value.toLowerCase() || '';
    const status = document.getElementById('app-filter-status')?.value || 'all';
    
    // Track filters
    const generalTrack = document.getElementById('app-filter-general-track')?.value || 'all';
    const academicTrack = document.getElementById('app-filter-academic-track')?.value || 'all';

    const filtered = applicationsData.filter(app => {
        const matchSearch = app.full_name.toLowerCase().includes(search) || app.university.toLowerCase().includes(search) || app.email.toLowerCase().includes(search);
        const matchStatus = status === 'all' || app.application_status === status;
        const matchGeneral = generalTrack === 'all' || app.track === generalTrack;
        const matchAcademic = academicTrack === 'all' || app.academic_track === academicTrack;
        
        return matchSearch && matchStatus && matchGeneral && matchAcademic;
    });

    renderApplicationsTable(filtered);
};

function renderApplicationsTable(data) {
    const tbody = document.getElementById('applications-table-body');
    const mobileCards = document.getElementById('applications-mobile-cards');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-10 text-center text-gray-500">No applications match your search criteria.</td></tr>`;
        if (mobileCards) {
            mobileCards.innerHTML = `<div class="p-8 text-center bg-b-surface/60 border border-white/5 rounded-2xl text-gray-500 text-xs">No applications match your search criteria.</div>`;
        }
        return;
    }

    const rendered = data.map(app => {
        const date = new Date(app.submitted_at).toLocaleDateString('en-GB');
        
        let statusBadge = '';
        if (app.application_status === 'accepted') statusBadge = '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400">Accepted</span>';
        else if (app.application_status === 'rejected') statusBadge = '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400">Rejected</span>';
        else if (app.application_status === 'archived') statusBadge = '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-500/10 border border-gray-500/20 text-gray-400">Archived</span>';
        else statusBadge = '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">Under Review</span>';

        const trackMap = { 'content': 'Content', 'operations': 'Operations', 'academic': 'Academic' };

        // Desktop Table Row
        const trHtml = `
            <tr class="hover:bg-white/5 transition-colors border-b border-white/5">
                <td class="p-4">
                    <div class="font-bold text-white text-sm truncate max-w-[150px]">${app.full_name}</div>
                    <div class="text-[10px] text-gray-500 font-mono mt-1">${app.email}</div>
                </td>
                <td class="p-4 text-center">
                    <div class="text-xs text-gray-300">${app.university}</div>
                    <div class="text-[10px] text-gray-500 mt-1 truncate max-w-[120px] mx-auto">${app.faculty || ''} - ${app.status}</div>
                </td>
                <td class="p-4 text-center font-mono text-teal-400 font-bold text-xs">${app.hours_per_week}</td>
                <td class="p-4 text-center text-xs text-gray-300">
                    <span class="bg-white/5 border border-white/10 rounded px-2 py-0.5">${trackMap[app.track] || app.track || '-'}</span>
                </td>
                <td class="p-4 text-center text-xs font-mono text-gray-500">${date}</td>
                <td class="p-4 text-center">${statusBadge}</td>
                <td class="p-4 text-center">
                    <button onclick="openApplicantDetails('${app.id}')" class="px-3 py-1.5 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white transition-all text-xs font-bold border border-teal-500/20">
                        View Details
                    </button>
                </td>
            </tr>
        `;

        // Mobile Touch Card
        const cardHtml = `
            <div class="bg-b-surface border border-white/10 rounded-2xl p-3.5 shadow-lg flex flex-col gap-2.5 transition-all hover:border-teal-500/30 relative">
                <!-- Top Header: Name & Status Badge -->
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                        <h4 class="font-bold text-white text-xs sm:text-sm leading-snug truncate" dir="auto">${app.full_name}</h4>
                        <span class="text-[10px] font-mono text-gray-500 truncate block mt-0.5">${app.email}</span>
                    </div>
                    <div class="shrink-0">${statusBadge}</div>
                </div>

                <!-- Academic Info & Track Strip -->
                <div class="bg-black/40 p-2.5 rounded-xl border border-white/5 flex flex-col gap-1 text-[11px]">
                    <div class="flex items-center justify-between text-gray-300">
                        <span class="truncate"><i class="fas fa-university text-teal-400 mr-1 text-[10px]"></i>${app.university}</span>
                        <span class="font-mono text-teal-400 font-bold">${app.hours_per_week || 0} hrs/wk</span>
                    </div>
                    <div class="flex items-center justify-between text-gray-500 text-[10px] pt-1 border-t border-white/5">
                        <span class="truncate">${app.faculty || ''} • ${app.status || ''}</span>
                        <span class="bg-white/5 px-2 py-0.5 rounded text-gray-300 font-medium">${trackMap[app.track] || app.track || '-'}</span>
                    </div>
                </div>

                <!-- Footer: Date + View Details Button -->
                <div class="pt-2 border-t border-white/5 flex items-center justify-between gap-2 text-[10px]">
                    <span class="text-gray-500 font-mono flex items-center gap-1">
                        <i class="far fa-clock text-gray-600"></i>
                        <span>${date}</span>
                    </span>
                    <button onclick="openApplicantDetails('${app.id}')" class="px-3 py-1.5 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white transition-all text-xs font-bold border border-teal-500/20 flex items-center gap-1 shadow-sm">
                        <i class="fas fa-id-card text-[11px]"></i>
                        <span>View Details</span>
                    </button>
                </div>
            </div>
        `;

        return { trHtml, cardHtml };
    });

    tbody.innerHTML = rendered.map(r => r.trHtml).join('');
    if (mobileCards) {
        mobileCards.innerHTML = rendered.map(r => r.cardHtml).join('');
    }
}

// 5. Open full applicant details modal
window.openApplicantDetails = (id) => {
    const app = applicationsData.find(a => a.id === id);
    if (!app) return;

    document.getElementById('modal-current-app-id').value = id;
    
    // Header
    document.getElementById('modal-app-name').innerText = app.full_name;
    document.getElementById('modal-app-email').innerText = app.email;
    
    const badge = document.getElementById('modal-app-status-badge');
    badge.className = `px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
        app.application_status === 'accepted' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 
        app.application_status === 'rejected' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
        app.application_status === 'archived' ? 'bg-gray-500/10 text-gray-400 border border-gray-500/20' :
        'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
    }`;
    badge.innerText = app.application_status === 'accepted' ? 'Accepted' : app.application_status === 'rejected' ? 'Rejected' : app.application_status === 'archived' ? 'Archived' : 'Under Review';

    // Personal & Academic
    document.getElementById('modal-app-date').innerText = new Date(app.submitted_at).toLocaleString('en-GB');
    document.getElementById('modal-app-age').innerText = app.age || '--';
    document.getElementById('modal-app-gender').innerText = app.gender === 'Male' ? 'Male' : app.gender === 'Female' ? 'Female' : '--';
    document.getElementById('modal-app-phone').innerText = app.phone || '--';
    
    document.getElementById('modal-app-gov').innerText = app.governorate || '--';
    document.getElementById('modal-app-uni').innerText = app.university;
    document.getElementById('modal-app-faculty').innerText = app.faculty || '--';
    document.getElementById('modal-app-dept').innerText = app.department || '--';
    document.getElementById('modal-app-academic-status').innerText = app.status || '--';
    document.getElementById('modal-app-year').innerText = app.academic_year || '--';

    // Links
    const setupLink = (id, url) => {
        const el = document.getElementById(id);
        if (url) { el.href = url; el.classList.remove('hidden'); } 
        else { el.classList.add('hidden'); }
    };
    setupLink('modal-app-linkedin', app.linkedin);
    setupLink('modal-app-github', app.github);
    setupLink('modal-app-portfolio', app.portfolio);

    // Time & Availability
    document.getElementById('modal-app-hours').innerText = app.hours_per_week;
    document.getElementById('modal-app-pref-time').innerText = app.preferred_time ? `(${app.preferred_time})` : '';
    
    const daysDiv = document.getElementById('modal-app-days');
    const daysMap = { Sat:'Saturday', Sun:'Sunday', Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday' };
    daysDiv.innerHTML = (app.available_days || []).map(d => `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-gray-300 border border-white/5">${daysMap[d] || d}</span>`).join('');

    // Tech
    const trackMap = { 'content': 'Content Contributor', 'operations': 'Operations Track', 'academic': 'Academic Oversight' };
    document.getElementById('modal-app-general-track').innerText = trackMap[app.track] || app.track || '--';
    document.getElementById('modal-app-track').innerText = app.academic_track || 'Unspecified';
    const icLevelMap = { studying: 'Currently Studying / Advanced', started: 'Started Fundamentals', curious: 'Curious & Eager to Learn' };
    document.getElementById('modal-app-ic-level').innerText = icLevelMap[app.ic_interest_level] || app.ic_interest_level || '--';
    
    document.getElementById('modal-app-skills').innerHTML = (app.technical_background || []).map(s => `<span class="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">${s}</span>`).join('');

    // Q&A
    document.getElementById('modal-app-motivation').innerText = app.motivation_text || '--';
    document.getElementById('modal-app-contribution').innerText = app.contribution_text || '--';
    document.getElementById('modal-app-experience').innerText = app.experience_text || 'No prior experience listed.';

    // Notes
    document.getElementById('modal-internal-notes').value = app.internal_notes || '';

    // Show
    document.getElementById('applicant-details-modal').classList.remove('hidden');
};

// 6. Decision handling & database updates (with email notifications)
// Dynamically build and render permissions checklist inside acceptance modal
function renderAcceptancePermissions(roles, permissions, rolePermissions) {
    const roleSelect = document.getElementById('accept-admin-role');
    const accordion = document.getElementById('accept-perms-accordion');
    
    if (roleSelect) {
        roleSelect.innerHTML = roles.map(r => `<option value="${r.name}">${r.name}</option>`).join('');
    }

    // Build role-to-permissions map (role_id -> Set of permission_id)
    const rolePermissionsMap = {};
    roles.forEach(r => rolePermissionsMap[r.id] = new Set());
    rolePermissions.forEach(rp => {
        if (rolePermissionsMap[rp.role_id]) {
            rolePermissionsMap[rp.role_id].add(rp.permission_id);
        }
    });

    // Platform permission categories
    const categories = ['Dashboard', 'Users', 'Leaders', 'Teams', 'Content', 'Reviews', 'Notifications', 'Reports', 'Settings'];
    
    accordion.innerHTML = categories.map(cat => {
        const catPerms = permissions.filter(p => p.category === cat && !p.id.includes(':track'));
        if (catPerms.length === 0) return '';
        
        const permsHtml = catPerms.map(p => {
            return `
                <label class="flex items-start gap-2.5 p-2 bg-black/40 border border-white/5 rounded-lg cursor-pointer hover:border-teal-500/30 transition-all text-left">
                    <input type="checkbox" data-accept-perm="${p.id}" class="mt-0.5 accent-teal-500 rounded">
                    <div class="ml-1">
                        <span class="text-xs font-bold text-gray-200 block">${p.name}</span>
                        <span class="text-[9px] text-gray-400 block mt-0.5 leading-tight">${p.description || ''}</span>
                    </div>
                </label>
            `;
        }).join('');

        return `
            <div class="border border-white/10 rounded-xl bg-black/20 overflow-hidden">
                <div class="w-full flex items-center justify-between p-3 bg-black/40 text-left font-bold text-xs text-gray-300">
                    <span>${cat}</span>
                </div>
                <div class="p-3 space-y-2 bg-[#0D0D0D] grid grid-cols-1 gap-2">
                    ${permsHtml}
                </div>
            </div>
        `;
    }).join('');

    // Auto-check default permissions when role selection changes
    if (roleSelect) {
        roleSelect.onchange = () => {
            const selectedRoleName = roleSelect.value;
            const roleRecord = roles.find(r => r.name === selectedRoleName);
            if (roleRecord && rolePermissionsMap[roleRecord.id]) {
                const activePerms = rolePermissionsMap[roleRecord.id];
                document.querySelectorAll('[data-accept-perm]').forEach(cb => {
                    const permId = cb.getAttribute('data-accept-perm');
                    cb.checked = activePerms.has(permId);
                });
            } else {
                document.querySelectorAll('[data-accept-perm]').forEach(cb => cb.checked = false);
            }
        };
        // Trigger once initially
        roleSelect.onchange();
    }
}

window.updateAppStatus = async (newStatus) => {
    const can = (perm) => window.hasPermission ? window.hasPermission(perm) : true;
    const isOwner = window.getAdminProfile ? (window.getAdminProfile()?.role || '').toLowerCase() === 'owner' : false;

    if (newStatus === 'accepted') {
        if (!can('settings:admins') && !can('teams:approve') && !can('manage_requests') && !isOwner) {
            window.showToast?.('You do not have permission to accept applications and assign roles.', 'error');
            return;
        }
    } else if (newStatus === 'rejected') {
        if (!can('teams:reject') && !can('manage_requests') && !isOwner) {
            window.showToast?.('You do not have permission to reject applications.', 'error');
            return;
        }
    }

    const appId = document.getElementById('modal-current-app-id').value;
    const notes = document.getElementById('modal-internal-notes').value;
    if (!appId) return;

    // If accepted, open group link & permissions configuration modal before saving
    if (newStatus === 'accepted') {
        document.getElementById('accept-group-link').value = '';
        document.getElementById('accept-extra-note').value = '';
        
        try {
            const acceptConfigModal = document.getElementById('accept-config-modal');
            const confirmBtn = document.getElementById('btn-confirm-accept');
            
            const accordion = document.getElementById('accept-perms-accordion');
            if (accordion) accordion.innerHTML = `<div class="p-4 text-center text-teal-500"><i class="fas fa-spinner fa-spin mr-1.5"></i> Loading permissions...</div>`;
            
            acceptConfigModal.classList.remove('hidden');
            
            // Fetch roles and permissions directly from database
            const [rolesRes, permsRes, rolePermsRes] = await Promise.all([
                supabase.from('admin_roles').select('*').order('name'),
                supabase.from('permissions').select('*'),
                supabase.from('role_permissions').select('*')
            ]);
            
            if (rolesRes.error) throw rolesRes.error;
            if (permsRes.error) throw permsRes.error;
            if (rolePermsRes.error) throw rolePermsRes.error;
            
            renderAcceptancePermissions(rolesRes.data || [], permsRes.data || [], rolePermsRes.data || []);
            
            confirmBtn.onclick = () => executeAcceptance(appId, notes);
            
        } catch (err) {
            console.error("Error loading roles/permissions for acceptance:", err);
            window.showToast("Error loading roles and permissions: " + err.message, "error");
        }
        return;
    }

    // For rejection or archive, update status directly
    executeStatusUpdate(appId, newStatus, notes);
};

// Execute acceptance and dispatch welcome email
async function executeAcceptance(appId, notes) {
    const groupLink = document.getElementById('accept-group-link').value.trim();
    const extraNote = document.getElementById('accept-extra-note').value.trim();
    const btn = document.getElementById('btn-confirm-accept');

    if (!groupLink) return window.showToast("Please enter the team group link!", "error");

    const roleSelect = document.getElementById('accept-admin-role');
    const selectedRole = roleSelect ? roleSelect.value : 'Admin';
    
    const selectedPermissions = [];
    document.querySelectorAll('[data-accept-perm]:checked').forEach(cb => {
        selectedPermissions.push(cb.getAttribute('data-accept-perm'));
    });

    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1.5"></i> Sending...';
    btn.disabled = true;
    try {
        // 1. Find applicant details for email delivery
        const app = applicationsData.find(a => a.id === appId);
        if (!app) throw new Error("Applicant record not found.");

        // 2. Update application status in database with assigned role & permissions
        await executeStatusUpdate(appId, 'accepted', notes, false, selectedRole, selectedPermissions);

        // 3. Build smart activation link pre-filled with applicant email
        const activationLink = `${window.location.origin}/pages/auth.html?email=${encodeURIComponent(app.email)}`;

        // 4. Send acceptance email via EmailJS
        emailjs.init("ejz_KrYv1VtCu9DJq");
        await emailjs.send(
            "service_xsjpfql",
            "template_62mykgf",
            {
                to_name: app.full_name,
                to_email: app.email,
                track_name: app.track === 'content' ? 'Content Contributor' : app.track,
                group_link: groupLink,
                activation_link: activationLink,
                signup_link: activationLink,
                login_link: activationLink,
                extra_note: extraNote ? extraNote : 'Welcome to the ZDC team!'
            }
        );

        window.showToast("Member accepted and invitation email sent successfully!", "success");
        document.getElementById('accept-config-modal').classList.add('hidden');
        document.getElementById('applicant-details-modal').classList.add('hidden');
        await fetchApplications();

    } catch (err) {
        console.error(err);
        window.showToast("Error during acceptance: " + err.message, "error");
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

// Core database status update
async function executeStatusUpdate(appId, newStatus, notes, showMsg = true, role = null, customPermissions = null) {
    const updatePayload = {
        application_status: newStatus, 
        internal_notes: notes, 
        reviewed_at: new Date()
    };

    if (newStatus === 'accepted') {
        updatePayload.role = role;
        updatePayload.custom_permissions = customPermissions;
    }

    const { error } = await supabase.from('admin_applications').update(updatePayload).eq('id', appId);

    if (error) throw error;
    if (showMsg) {
        window.showToast("Status updated successfully.", "success");
        document.getElementById('applicant-details-modal').classList.add('hidden');
        await fetchApplications();
    }
}