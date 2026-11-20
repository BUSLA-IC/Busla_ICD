import { supabase } from './supabase-config.js';

let currentUser = null;
let currentRequestId = null;
let isEditMode = false;

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuthAndLoadState();
    setupCheckboxes();
    
    document.getElementById('team-request-form').addEventListener('submit', handleFormSubmit);
});

async function checkAuthAndLoadState() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = 'auth.html';
        return;
    }
    currentUser = user;

    const { data: request, error } = await supabase
        .from('team_requests')
        .select('*')
        .eq('requester_id', currentUser.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    document.getElementById('loading-state').classList.add('hidden');

    if (!request) {
        showFormView();
    } else {
        // Fetch track name from tracks table using stored ID
        let displayTrackName = request.specialization;
        if (request.specialization) {
            const { data: trackData } = await supabase
                .from('tracks')
                .select('name')
                .eq('id', request.specialization)
                .maybeSingle();
                
            if (trackData && trackData.name) {
                displayTrackName = trackData.name;
            }
        }
        // Store display name on request object
        request.display_specialization = displayTrackName;

        const submittedDate = new Date(request.submitted_at);
        const now = new Date();
        const diffTime = Math.abs(now - submittedDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const daysLeft = 30 - diffDays;

        if (daysLeft <= 0) {
            showFormView();
        } else {
            if (request.status === 'approved') {
                window.location.href = 'leader-dash.html';
            } else {
                currentRequestId = request.id;
                showStatusView(request, daysLeft);
            }
        }
    }
}

async function showFormView(requestData = null) {
    document.getElementById('status-view').classList.add('hidden');
    document.getElementById('form-view').classList.remove('hidden');
    
    await loadAvailableTracks();

    if (requestData) {
        isEditMode = true;
        document.getElementById('req-name').value = requestData.team_name || '';
        
        const trackSelect = document.getElementById('team-track');
        if (trackSelect) {
            trackSelect.value = requestData.track_id || requestData.specialization || '';
        }
        
        document.getElementById('req-logo').value = requestData.logo_url || '';
        document.getElementById('req-uni').value = requestData.university || '';
        document.getElementById('req-gov').value = requestData.governorate || '';
        document.getElementById('req-size').value = requestData.expected_size || '';
        
        let gpaRaw = requestData.leader_gpa || '';
        document.getElementById('req-gpa').value = gpaRaw.replace('%', '').trim();
        
        document.getElementById('req-reason').value = requestData.reason || '';
        document.getElementById('btn-submit-req').innerText = "Update Application";
    } else {
        isEditMode = false;
    }
}

function showStatusView(request, daysLeft) {
    document.getElementById('form-view').classList.add('hidden');
    document.getElementById('status-view').classList.remove('hidden');

    document.getElementById('status-team-name').innerText = request.team_name;
    document.getElementById('status-logo').src = resolveImageUrl(request.logo_url, 'team');
    document.getElementById('sv-uni').innerText = request.university;
    document.getElementById('sv-gov').innerText = request.governorate;
    
    document.getElementById('sv-spec').innerText = request.display_specialization || request.specialization;
    
    document.getElementById('sv-size').innerText = `${request.expected_size} members`;
    document.getElementById('sv-gpa').innerText = request.leader_gpa; 

    document.getElementById('status-countdown').innerText = `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`;

    const badgeContainer = document.getElementById('status-badge-container');
    const headerBg = document.getElementById('status-header-bg');
    const rejectionAlert = document.getElementById('rejection-alert');
    const actionBtns = document.getElementById('action-buttons-container');

    if (request.status === 'pending') {
        badgeContainer.innerHTML = '<span class="bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 px-3 py-1 rounded-lg text-xs font-bold"><i class="fas fa-hourglass-half mr-1"></i> Under Admin Review</span>';
        headerBg.style.background = 'linear-gradient(to right, #EFECE6, transparent)';
        rejectionAlert.classList.add('hidden');
        actionBtns.classList.remove('hidden');
    } 
    else if (request.status === 'rejected') {
        badgeContainer.innerHTML = '<span class="bg-red-500/20 text-red-500 border border-red-500/30 px-3 py-1 rounded-lg text-xs font-bold"><i class="fas fa-times-circle mr-1"></i> Application Rejected</span>';
        headerBg.style.background = 'linear-gradient(to right, #8E8E8E, transparent)';
        
        rejectionAlert.classList.remove('hidden');
        document.getElementById('rejection-reason-text').innerText = request.rejection_reason || 'No specific reason provided.';
        actionBtns.classList.add('hidden');
    }
    else if (request.status === 'cancelled') {
        badgeContainer.innerHTML = '<span class="bg-gray-500/20 text-gray-400 border border-gray-500/30 px-3 py-1 rounded-lg text-xs font-bold"><i class="fas fa-ban mr-1"></i> Application Cancelled</span>';
        headerBg.style.background = 'linear-gradient(to right, #5A5A5A, transparent)';
        rejectionAlert.classList.add('hidden');
        actionBtns.classList.add('hidden'); 
    }
}

function setupCheckboxes() {
    const chk1 = document.getElementById('chk-privacy');
    const chk2 = document.getElementById('chk-terms');
    const chk3 = document.getElementById('chk-declare');
    const btnSubmit = document.getElementById('btn-submit-req');

    const checkState = () => {
        btnSubmit.disabled = !(chk1.checked && chk2.checked && chk3.checked);
    };

    chk1.addEventListener('change', checkState);
    chk2.addEventListener('change', checkState);
    chk3.addEventListener('change', checkState);
    checkState();
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const btn = document.getElementById('btn-submit-req');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    btn.disabled = true;

    const gpaVal = document.getElementById('req-gpa').value.trim();
    const formattedGpa = gpaVal + '%';

    // Get value from track selector
    const selectedTrack = document.getElementById('team-track')?.value || '';

const requestData = {
        requester_id: currentUser.id,
        team_name: document.getElementById('req-name').value.trim(),
        
        specialization: selectedTrack, 
        
        logo_url: document.getElementById('req-logo').value.trim(),
        university: document.getElementById('req-uni').value,
        governorate: document.getElementById('req-gov').value,
        expected_size: parseInt(document.getElementById('req-size').value),
        leader_gpa: formattedGpa,
        reason: document.getElementById('req-reason').value.trim(),
        status: 'pending'
    };

    try {
        if (isEditMode && currentRequestId) {
            const { error } = await supabase.from('team_requests').update(requestData).eq('id', currentRequestId);
            if (error) throw error;
            showToast("Application updated successfully", "success");
        } else {
            const { error } = await supabase.from('team_requests').insert([requestData]);
            if (error) throw error;
            showToast("Application submitted to Admin successfully", "success");
        }

        setTimeout(() => location.reload(), 1500);

    } catch (error) {
        console.error(error);
        showToast("Error submitting application", "error");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

window.editRequest = async () => {
    const { data: request } = await supabase.from('team_requests').select('*').eq('id', currentRequestId).single();
    if (request) {
        showFormView(request);
        document.getElementById('chk-privacy').checked = true;
        document.getElementById('chk-terms').checked = true;
        document.getElementById('chk-declare').checked = true;
        document.getElementById('btn-submit-req').disabled = false;
    }
};

// Custom Confirm Modal is now managed globally by custom-dialogs.js

// ==========================================
// ACTIONS (EDIT & CANCEL)
// ==========================================
window.editRequest = async () => {
    const { data: request } = await supabase.from('team_requests').select('*').eq('id', currentRequestId).single();
    if (request) {
        showFormView(request);
        document.getElementById('chk-privacy').checked = true;
        document.getElementById('chk-terms').checked = true;
        document.getElementById('chk-declare').checked = true;
        document.getElementById('btn-submit-req').disabled = false;
    }
};

window.cancelRequest = () => {
    window.showCustomConfirm(
        "Cancel Current Application",
        "Are you sure you want to cancel your application? You won't be able to submit a new squad request for 30 days from this submission date.",
        async () => {
            try {
                const { error } = await supabase.from('team_requests').update({ status: 'cancelled' }).eq('id', currentRequestId);
                if (error) throw error;
                
                window.showToast("Application cancelled successfully", "info");
                setTimeout(() => location.reload(), 1500);
            } catch (error) {
                console.error(error);
                window.showToast("Error cancelling application", "error");
            }
        }
    );
};
window.showToast = (msg, type = 'info') => {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const colorClass = type === 'success' ? 'border-green-500 text-green-400' : type === 'error' ? 'border-red-500 text-red-400' : 'border-blue-500 text-blue-400';
    const iconClass = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.className = `bg-black/80 px-6 py-4 rounded-xl border-l-4 ${colorClass} shadow-2xl backdrop-blur-md flex items-center gap-3 animate-[slideIn_0.3s_ease-out] transition-opacity duration-300`;
    toast.innerHTML = `<i class="fas ${iconClass} text-lg"></i><span class="text-white text-sm font-bold">${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// =========================================================
// Fetch available tracks for squad creation
// =========================================================
async function loadAvailableTracks() {
    const trackSelect = document.getElementById('team-track');
    if (!trackSelect) return;

    trackSelect.innerHTML = '<option value="" disabled selected>Loading tracks...</option>';

    try {
        const { data: tracks, error } = await supabase
            .from('tracks')
            .select('id, name')
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (tracks && tracks.length > 0) {
            trackSelect.innerHTML = '<option value="" disabled selected>-- Select Squad Engineering Track --</option>';
            tracks.forEach(track => {
                const option = document.createElement('option');
                option.value = track.id;
                option.textContent = track.name;
                trackSelect.appendChild(option);
            });
        } else {
            trackSelect.innerHTML = '<option value="" disabled selected>No tracks currently available</option>';
        }
    } catch (err) {
        console.error("Error loading tracks:", err);
        trackSelect.innerHTML = '<option value="" disabled selected>Error loading tracks</option>';
    }
}

function resolveImageUrl(url, type = 'course') {
    try {
        if (!url || url.trim() === "" || url === "null" || url === "undefined") {
            return '../assets/icons/zdc-icon-192.png';
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
