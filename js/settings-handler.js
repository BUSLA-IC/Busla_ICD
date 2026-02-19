import { supabase } from './supabase-config.js';

let modal, form;
let inputs = {};
let previewImg, displayNamePreview, displayRolePreview;
let confirmCallback = null;

// =========================================================
// UTILITIES (Image Parsing)
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
        console.warn("[Settings] URL Parse Error:", e);
    }
    return url;
}

// =========================================================
// INITIALIZATION
// =========================================================
function resolveImageUrl(url, type = 'course') {
    if (!url || url.trim() === "" || url === "null" || url === "undefined") {
        if (type === 'team') {
            return '../assets/icons/icon.jpg';
        } else if (type === 'user') {
            return '../assets/icons/icon.jpg';
        } else {
            return '../assets/icons/icon.jpg';
        }
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

export function initSettingsModal() {
    console.log("[Settings] --- INITIALIZING SETTINGS MODAL ---");
    
    modal = document.getElementById('settings-modal');
    form = document.getElementById('settings-form');
    
    // Mapping to EXACT IDs from your provided HTML
    inputs = {
        name: document.getElementById('settings-name'),
        email: document.getElementById('settings-email'),
        photo: document.getElementById('settings-photo'),
        uni: document.getElementById('settings-uni'),
        faculty: document.getElementById('settings-faculty'),
        dept: document.getElementById('settings-dept'),
        year: document.getElementById('settings-year'),
        gov: document.getElementById('settings-gov')
    };

    // Mapping preview elements to EXACT IDs from your HTML
    previewImg = document.getElementById('preview-avatar');
    displayNamePreview = document.getElementById('display-name-preview');
    displayRolePreview = document.getElementById('display-role-preview');

    if (!modal || !form) {
        console.error("[Settings] Modal or Form not found in DOM.");
        return;
    }

    // Buttons
    const closeBtn = document.getElementById('close-settings-btn');
    const resetPassBtn = document.getElementById('btn-reset-pass');
    const refreshPhotoBtn = document.getElementById('btn-preview-photo');

    // Event Listeners
    if (closeBtn) closeBtn.addEventListener('click', closeSettings);
    
    if (inputs.name) inputs.name.addEventListener('input', updatePreview);
    if (inputs.photo) inputs.photo.addEventListener('input', updatePreview);
    if (refreshPhotoBtn) refreshPhotoBtn.addEventListener('click', updatePreview);

    form.addEventListener('submit', handleSettingsSubmit);
    if (resetPassBtn) resetPassBtn.addEventListener('click', handleCustomPasswordReset);
}

// =========================================================
// DATA FETCHING & POPULATION
// =========================================================

export async function openSettings() {
    console.log("[Settings] --- OPENING SETTINGS MODAL ---");
    if (!modal) return;
    
    const btn = document.getElementById('open-settings-btn');
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("Auth error or no session");

        const { data: profile, error: dbError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (dbError) throw dbError;

        // Populate Fields
        if (inputs.name) inputs.name.value = profile.full_name || '';
        if (inputs.email) inputs.email.value = profile.email || user.email || '';
        if (inputs.photo) inputs.photo.value = resolveImageUrl(profile.avatar_url, 'user');
        if (inputs.uni) inputs.uni.value = profile.university || '';
        if (inputs.faculty) inputs.faculty.value = profile.faculty || '';
        if (inputs.dept) inputs.dept.value = profile.department || '';
        if (inputs.year) inputs.year.value = profile.academic_year || '';
        if (inputs.gov) inputs.gov.value = profile.governorate || '';

        // Role Preview (Capitalize first letter)
        if (displayRolePreview) {
            const role = profile.role || 'Student';
            displayRolePreview.innerText = role.charAt(0).toUpperCase() + role.slice(1);
        }

        updatePreview();
        modal.classList.remove('hidden');

    } catch (error) {
        console.error("[Settings] FATAL ERROR:", error.message);
        showToast("Error loading data", "error");
    } finally {
        if (btn) btn.innerHTML = '<i class="fas fa-cog"></i> الإعدادات';
    }
}

export function closeSettings() {
    modal?.classList.add('hidden');
}

function updatePreview() {
    if (previewImg && inputs.photo) {
        const url = inputs.photo.value.trim();
        previewImg.src = getDirectImageLink(url);
    }
    if (displayNamePreview && inputs.name) {
        displayNamePreview.innerText = inputs.name.value.trim() || "User Name";
    }
}

// =========================================================
// SAVING DATA
// =========================================================

async function handleSettingsSubmit(e) {
    e.preventDefault();
    
    const btn = document.getElementById('btn-save-settings') || document.querySelector('button[form="settings-form"]');
    const originalText = btn ? btn.innerHTML : "Save";
    
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("No user logged in.");

        const updates = {
            full_name: inputs.name?.value.trim() || null,
            avatar_url: inputs.photo?.value.trim() || null,
            university: inputs.uni?.value.trim() || null,
            faculty: inputs.faculty?.value.trim() || null,
            department: inputs.dept?.value.trim() || null,
            academic_year: inputs.year?.value.trim() || null,
            governorate: inputs.gov?.value.trim() || null
        };

        const { error: dbError } = await supabase.from('profiles').update(updates).eq('id', user.id);
        if (dbError) throw new Error(`DB Update Failed: ${dbError.message}`);

        await supabase.auth.updateUser({ data: updates });

        showToast("Profile updated successfully", "success");
        closeSettings();
        
        setTimeout(() => window.location.reload(), 1500);

    } catch (error) {
        console.error("[Settings] Save Error:", error);
        showToast("Update failed", "error");
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

// =========================================================
// PASSWORD RESET
// =========================================================

async function handleCustomPasswordReset() {
    const email = inputs.email?.value.trim();
    if (!email) {
        return showToast("No email address found", "error");
    }

    showToast("Sending reset link...", "info");

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password.html',
        });
        if (error) throw new Error(error.message);
        
        showToast("Reset link sent to your email", "success");
    } catch (error) {
        console.error("[Settings] Reset Password Error:", error);
        showToast("Failed to send link", "error");
    }
}

// =========================================================
// UI COMPONENTS
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