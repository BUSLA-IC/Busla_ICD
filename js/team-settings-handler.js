import { supabase } from './supabase-config.js';

let modal, form, nameInput, logoInput, uniInput, govInput;
let previewImg, displayNamePreview;
let currentTeamId = null;

// =========================================================
// UTILITIES
// =========================================================

function getDirectImageLink(url) {
    if (!url || url.trim() === "") return "../assets/icons/icon.jpg";
    try {
        if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
            const idMatch = url.match(/\/d\/(.*?)(?:\/|$)/) || url.match(/id=(.*?)(?:&|$)/);
            if (idMatch && idMatch[1]) {
                return `https://drive.google.com/uc?export=view&id=${idMatch[1]}`; 
            }
        }
    } catch (e) {
        console.warn("[Team Settings] URL Parse Error:", e);
    }
    return url;
}

// =========================================================
// INITIALIZATION
// =========================================================

export function initTeamSettingsModal() {
    console.log("[Team Settings] --- INITIALIZING MODAL ---");
    
    modal = document.getElementById('team-settings-modal');
    form = document.getElementById('team-settings-form');
    
    nameInput = document.getElementById('team-set-name');
    logoInput = document.getElementById('team-set-logo');
    uniInput = document.getElementById('team-set-uni');
    govInput = document.getElementById('team-set-gov');
    previewImg = document.getElementById('team-preview-logo');
    displayNamePreview = document.getElementById('team-name-preview');

    if (!modal || !form) {
        console.warn("[Team Settings] Modal or Form not found in DOM.");
        return;
    }

    const closeBtn = document.getElementById('close-team-settings');
    if (closeBtn) closeBtn.addEventListener('click', closeTeamSettings);

    const previewBtn = document.getElementById('btn-preview-team-logo');
    if (previewBtn) {
        previewBtn.addEventListener('click', () => {
            updateTeamPreviewUI();
            showToast("Preview updated", "info");
        });
    }

    if (nameInput) nameInput.addEventListener('input', updateTeamPreviewUI);
    if (logoInput) logoInput.addEventListener('input', updateTeamPreviewUI);

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        executeTeamSave();
    });
}

// =========================================================
// OPEN / CLOSE LOGIC
// =========================================================

export async function openTeamSettings(teamId, isLeader = false) {
    if (!teamId) {
        showToast("Team ID is missing", "error");
        return;
    }
    if (!isLeader) {
        showToast("Only the Team Leader can edit settings.", "error");
        return;
    }

    currentTeamId = teamId;
    const btn = document.getElementById('open-team-settings-btn');
    const originalContent = btn ? btn.innerHTML : '';
    
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        console.log(`[Team Settings] Fetching data for team: ${teamId}`);
        const { data: teamData, error } = await supabase
            .from('teams')
            .select('*')
            .eq('id', teamId)
            .single();

        if (error) throw error;
        if (!teamData) throw new Error("Team not found in database.");

        populateForm(teamData);
        updateTeamPreviewUI();

        if (modal) modal.classList.remove('hidden');

    } catch (error) {
        console.error("[Team Settings] Load Error:", error);
        showToast("Failed to load team settings.", "error");
    } finally {
        if (btn) btn.innerHTML = originalContent;
    }
}

export function closeTeamSettings() {
    if (modal) modal.classList.add('hidden');
    currentTeamId = null;
}

// =========================================================
// UI UPDATES
// =========================================================

function populateForm(teamData) {
    if (nameInput) nameInput.value = teamData.name || '';
    if (logoInput) logoInput.value = teamData.logo_url || '';
    
    // For selects, setting the value works if the option exists
    if (uniInput) uniInput.value = teamData.university || '';
    if (govInput) govInput.value = teamData.governorate || '';
}

function updateTeamPreviewUI() {
    if (previewImg && logoInput) {
        previewImg.src = getDirectImageLink(logoInput.value.trim());
    }
    if (displayNamePreview && nameInput) {
        displayNamePreview.innerText = nameInput.value.trim() || "Team Name";
    }
}

// =========================================================
// DATA SAVING
// =========================================================

async function executeTeamSave() {
    if (!currentTeamId) return;

    const btn = document.getElementById('btn-save-team') || document.querySelector('button[form="team-settings-form"]');
    const originalText = btn ? btn.innerHTML : "Save";
    
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;
    }

    try {
        const updates = {
            name: nameInput?.value.trim() || null,
            logo_url: logoInput?.value.trim() || null,
            university: uniInput?.value || null,
            governorate: govInput?.value || null
        };

        console.log("[Team Settings] Updating team data:", updates);

        const { error } = await supabase
            .from('teams')
            .update(updates)
            .eq('id', currentTeamId);

        if (error) throw error;

        showToast("Team settings updated successfully!", "success");
        closeTeamSettings();
        
        setTimeout(() => window.location.reload(), 1500);

    } catch (error) {
        console.error("[Team Settings] Save Error:", error);
        showToast(`Update failed: ${error.message}`, "error");
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

// =========================================================
// TOAST NOTIFICATIONS
// =========================================================

function showToast(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-4 left-4 z-50 flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const color = type === 'success' ? 'border-green-500 text-green-400' : 
                  type === 'error' ? 'border-red-500 text-red-400' : 
                  'border-blue-500 text-blue-400';
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-exclamation-circle' : 
                 'fa-info-circle';

    toast.className = `bg-gray-900 px-6 py-4 rounded-xl border-l-4 ${color} shadow-2xl backdrop-blur flex items-center gap-3 animate-slide-in min-w-[300px] mb-2`;
    toast.innerHTML = `<i class="fas ${icon} text-xl"></i><span class="text-white text-sm font-bold">${msg}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}