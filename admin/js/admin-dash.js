import { supabase, AuthService, UserService } from '../../js/supabase-config.js';

// ==========================================
// 1. GLOBAL STATE & CONFIGURATION
// ==========================================
let currentAdmin = null;
let adminProfile = null;
let adminPermissions = []; // e.g., ['manage_content', 'delete_content']

// ==========================================
// 2. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    AuthService.onAuthStateChange(async (user) => {
        if (user) {
            currentAdmin = user;
            await initAdminDashboard(user.id);
        } else {
            window.location.href = "../../pages/auth.html";
        }
    });

    setupNavigation();
});

async function initAdminDashboard(uid) {
    try {
        const { data: profile, error } = await UserService.getProfile(uid);
        if (error || !profile) throw new Error("Profile not found");

        adminProfile = profile;
        
        // Ensure user is actually an admin/owner
        if (adminProfile.role !== 'owner' && adminProfile.role !== 'admin') {
            showToast("غير مصرح لك بالدخول", "error");
            setTimeout(() => window.location.href = "student-dash.html", 2000);
            return;
        }

        // Load permissions (Assuming we added a 'permissions' jsonb/array column)
        adminPermissions = adminProfile.permissions || [];
        if (adminProfile.role === 'owner') {
            // Owner gets a magic string to bypass all checks
            adminPermissions = ['*']; 
        }

        updateAdminUI();
        applyRoleBasedAccess();

    } catch (err) {
        console.error("Init Error:", err);
        showToast("فشل في تحميل بيانات الأدمن", "error");
    }
}

// ==========================================
// 3. ROLE-BASED ACCESS CONTROL (RBAC)
// ==========================================
function hasPermission(perm) {
    if (adminPermissions.includes('*')) return true;
    return adminPermissions.includes(perm);
}

function applyRoleBasedAccess() {
    // 1. Show/Hide Navigation Menu Items
    document.querySelectorAll('.nav-btn[data-perm]').forEach(btn => {
        const requiredPerm = btn.getAttribute('data-perm');
        if (hasPermission(requiredPerm)) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
            btn.remove(); // Remove entirely from DOM for security
        }
    });

    // 2. Hide specific action buttons globally (e.g., Delete Buttons)
    if (!hasPermission('delete_content')) {
        // We will run this check whenever rendering a table
        document.body.classList.add('no-delete-access');
    }
}

function updateAdminUI() {
    document.getElementById('admin-name').innerText = adminProfile.full_name || "Admin";
    document.getElementById('admin-role-badge').innerText = 
        adminProfile.role === 'owner' ? "Master Owner" : "System Admin";
}

// ==========================================
// 4. NAVIGATION & UI LOGIC
// ==========================================
function setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

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
                if (content.id === targetId) content.classList.add('active');
            });

            // Trigger specific module loads based on tab
            loadModuleData(targetId);
        });
    });

    // Logout handling
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await AuthService.signOut();
    });
}

function loadModuleData(moduleId) {
    // Dynamically load data when tab is clicked to save resources
    if (moduleId === 'content-mgmt') {
        // loadContentData('phases');
    } else if (moduleId === 'team-requests') {
        // loadTeamRequests();
    }
}

// ==========================================
// 5. GLOBAL UTILS (Mirrored from your code)
// ==========================================
window.showToast = (message, type = 'info') => {
    let container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const color = type === 'success' ? 'border-green-500 text-green-400' : type === 'error' ? 'border-red-500 text-red-400' : 'border-blue-500 text-blue-400';
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    
    toast.className = `bg-gray-900 px-6 py-4 rounded-xl border-l-4 ${color} shadow-2xl backdrop-blur flex items-center gap-3 animate-slide-in min-w-[300px] mb-2`;
    toast.innerHTML = `<i class="fas ${icon} text-xl"></i><span class="text-white text-sm font-bold">${message}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
};

window.openAdminConfirmModal = (message, callback) => {
    // Custom confirm logic implementing design system rules
    // ...
};