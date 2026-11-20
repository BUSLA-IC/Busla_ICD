import { supabase } from '../../js/supabase-config.js';

// ==========================================
// 🚀 TEAM CREATION REQUESTS ENGINE
// ==========================================

let teamRequestsData = [];
let tracksMap = {};

// 1. Initialize and load specialization tracks
async function loadTracks() {
    try {
        const { data, error } = await supabase.from('tracks').select('id, name');
        if (error) throw error;
        tracksMap = {};
        (data || []).forEach(t => {
            tracksMap[t.id] = t.name;
        });
    } catch (err) {
        console.error("Error loading tracks:", err);
    }
}

// 2. Fetch requests from database
window.fetchTeamRequests = async () => {
    const tbody = document.getElementById('team-requests-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center"><i class="fas fa-spinner fa-spin text-teal-500 text-2xl"></i></td></tr>`;

    try {
        await loadTracks();

        const { data, error } = await supabase
            .from('team_requests')
            .select('*, requester:profiles!team_requests_requester_id_fkey(id, full_name, email)')
            .order('submitted_at', { ascending: false });

        if (error) throw error;
        
        teamRequestsData = data || [];
        updateTeamStats();
        filterTeamRequests();
        
    } catch (err) {
        console.error("Fetch Team Requests Error:", err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-red-500">An error occurred while fetching data.</td></tr>`;
    }
};

// 3. Update live statistics
function updateTeamStats() {
    document.getElementById('stat-total-teams').innerText = teamRequestsData.length;
    document.getElementById('stat-pending-teams').innerText = teamRequestsData.filter(t => t.status === 'pending').length;
    document.getElementById('stat-accepted-teams').innerText = teamRequestsData.filter(t => t.status === 'approved').length;
    document.getElementById('stat-rejected-teams').innerText = teamRequestsData.filter(t => t.status === 'rejected').length;
    document.getElementById('stat-archived-teams').innerText = teamRequestsData.filter(t => t.status === 'archived').length;
}

// 4. Live filtering
window.filterTeamRequests = () => {
    const search = document.getElementById('team-filter-search')?.value.toLowerCase() || '';
    const status = document.getElementById('team-filter-status')?.value || 'all';

    const filtered = teamRequestsData.filter(req => {
        const leaderName = req.requester?.full_name || '';
        const teamName = req.team_name || '';
        const uni = req.university || '';
        
        const matchSearch = leaderName.toLowerCase().includes(search) || 
                            teamName.toLowerCase().includes(search) || 
                            uni.toLowerCase().includes(search);
                            
        const matchStatus = status === 'all' || req.status === status;
        
        return matchSearch && matchStatus;
    });

    renderTeamRequestsTable(filtered);
};

// 5. Render requests table
function renderTeamRequestsTable(data) {
    const tbody = document.getElementById('team-requests-table-body');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-gray-500">No requests match your search criteria.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(req => {
        const date = new Date(req.submitted_at).toLocaleDateString('en-GB');
        
        let statusBadge = '';
        if (req.status === 'approved') {
            statusBadge = '<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400">Approved</span>';
        } else if (req.status === 'rejected') {
            statusBadge = '<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400">Rejected</span>';
        } else if (req.status === 'archived') {
            statusBadge = '<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-gray-500/10 border border-gray-500/20 text-gray-400">Archived</span>';
        } else if (req.status === 'cancelled') {
            statusBadge = '<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-gray-500/10 border border-gray-500/20 text-gray-400">Cancelled</span>';
        } else {
            statusBadge = '<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">Under Review</span>';
        }

        const leaderName = req.requester?.full_name || 'Unknown';

        return `
            <tr class="hover:bg-white/5 transition-colors border-b border-white/5">
                <td class="p-4">
                    <div class="font-bold text-white text-sm truncate max-w-[150px]">${leaderName}</div>
                    <div class="text-[10px] text-gray-500 font-mono mt-1">${req.requester?.email || ''}</div>
                </td>
                <td class="p-4 text-center font-bold text-gray-200 text-xs">${req.team_name}</td>
                <td class="p-4 text-center text-xs text-gray-300">${req.university || ''}</td>
                <td class="p-4 text-center text-xs font-mono text-gray-500">${date}</td>
                <td class="p-4 text-center">${statusBadge}</td>
                <td class="p-4 text-center">
                    <button onclick="openTeamRequestDetails('${req.id}')" class="px-3 py-1.5 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white transition-all text-xs font-bold border border-teal-500/20">
                        View Details
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// 6. Open full team request details modal
window.openTeamRequestDetails = (id) => {
    const req = teamRequestsData.find(r => r.id === id);
    if (!req) return;

    document.getElementById('modal-current-team-req-id').value = id;
    
    // Header
    document.getElementById('modal-team-req-name').innerText = req.team_name;
    document.getElementById('modal-team-req-leader-email').innerText = req.requester?.email || 'No email';
    
    const badge = document.getElementById('modal-team-req-status-badge');
    badge.className = `px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
        req.status === 'approved' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 
        req.status === 'rejected' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
        req.status === 'archived' ? 'bg-gray-500/10 text-gray-400 border border-gray-500/20' :
        req.status === 'cancelled' ? 'bg-gray-500/10 text-gray-400 border border-gray-500/20' :
        'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
    }`;
    badge.innerText = req.status === 'approved' ? 'Approved' : 
                      req.status === 'rejected' ? 'Rejected' : 
                      req.status === 'archived' ? 'Archived' : 
                      req.status === 'cancelled' ? 'Cancelled' : 'Under Review';

    // Logo & Preview
    const previewImg = document.getElementById('modal-team-req-logo-preview');
    const directLogoUrl = resolveImageUrl(req.logo_url);
    previewImg.src = directLogoUrl;
    
    const logoLink = document.getElementById('modal-team-req-logo-link');
    if (req.logo_url) {
        logoLink.href = req.logo_url;
        logoLink.classList.remove('hidden');
    } else {
        logoLink.classList.add('hidden');
    }

    // Basic details
    document.getElementById('modal-team-req-leader-name').innerText = req.requester?.full_name || 'Unknown';
    document.getElementById('modal-team-req-date').innerText = new Date(req.submitted_at).toLocaleString('en-GB');
    document.getElementById('modal-team-req-uni').innerText = req.university || '--';
    document.getElementById('modal-team-req-gov').innerText = req.governorate || '--';

    // Advanced Info
    document.getElementById('modal-team-req-spec').innerText = tracksMap[req.specialization] || req.specialization || '--';
    document.getElementById('modal-team-req-size').innerText = req.expected_size ? `${req.expected_size} members` : '--';
    document.getElementById('modal-team-req-gpa').innerText = req.leader_gpa || '--';

    // Reason Text
    document.getElementById('modal-team-req-reason').innerText = req.reason || '--';

    // Notes/Feedback
    document.getElementById('modal-team-req-notes').value = req.rejection_reason || '';

    // Show modal
    document.getElementById('team-request-details-modal').classList.remove('hidden');
};

// 7. Admin decision & actions
window.updateTeamRequestStatus = async (newStatus) => {
    const reqId = document.getElementById('modal-current-team-req-id').value;
    const decisionNote = document.getElementById('modal-team-req-notes').value.trim();
    if (!reqId) return;

    const req = teamRequestsData.find(r => r.id === reqId);
    if (!req) return;

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Active admin session not found.");

        if (newStatus === 'approved') {
            // Verify notes or use default approval message
            const finalNote = decisionNote || 'Congratulations, your team has been approved!';
            
            // 1. Create team in teams table
            const { data: newTeam, error: teamError } = await supabase
                .from('teams')
                .insert([{
                    name: req.team_name,
                    logo_url: req.logo_url,
                    university: req.university,
                    governorate: req.governorate,
                    leader_id: req.requester_id,
                    specialization: req.specialization
                }])
                .select()
                .single();

            if (teamError) throw teamError;

            // 2. Promote requester to Leader and link to team
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    role: 'leader',
                    team_id: newTeam.id
                })
                .eq('id', req.requester_id);

            if (profileError) throw profileError;

            // 3. Update request status
            const { error: reqError } = await supabase
                .from('team_requests')
                .update({
                    status: 'approved',
                    rejection_reason: finalNote,
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString()
                })
                .eq('id', reqId);

            if (reqError) throw reqError;

            window.showToast("Team approved and leader assigned successfully!", "success");

        } else if (newStatus === 'rejected') {
            if (!decisionNote) {
                window.showToast("Please enter a rejection reason in the notes field!", "error");
                return;
            }

            const { error: reqError } = await supabase
                .from('team_requests')
                .update({
                    status: 'rejected',
                    rejection_reason: decisionNote,
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString()
                })
                .eq('id', reqId);

            if (reqError) throw reqError;

            window.showToast("Team creation request rejected and reason logged.", "success");

        } else if (newStatus === 'archived') {
            const { error: reqError } = await supabase
                .from('team_requests')
                .update({
                    status: 'archived',
                    rejection_reason: decisionNote,
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString()
                })
                .eq('id', reqId);

            if (reqError) throw reqError;

            window.showToast("Team creation request moved to archive.", "success");
        }

        // Close modal and refresh table
        document.getElementById('team-request-details-modal').classList.add('hidden');
        await window.fetchTeamRequests();

    } catch (err) {
        console.error(err);
        window.showToast("Error executing action: " + err.message, "error");
    }
};

// Resolve Google Drive / Dropbox team logo URL for direct display
function resolveImageUrl(url) {
    try {
        if (!url || url.trim() === "" || url === "null" || url === "undefined") {
            return '../../assets/icons/zdc-icon-192.png';
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
    } catch(e) {}
    return url;
}
