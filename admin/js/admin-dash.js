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
let hasInitialized = false; // قفل إضافي للحماية المطلقة

document.addEventListener('DOMContentLoaded', async () => {
    // 1. تجهيز أزرار التنقل فوراً
    setupNavigation();

    try {
        // 💡 2. جلب الجلسة الحالية "مرة واحدة فقط" بأمان تام بدلاً من الاعتماد على المراقب المزدوج
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (session && session.user) {
            currentAdmin = session.user;
            
            if (!hasInitialized) {
                hasInitialized = true;
                await initAdminDashboard(currentAdmin.id);
            }
        } else {
            window.location.href = "../../pages/auth.html";
            return;
        }

        // 💡 3. استخدام المراقب "فقط" لمراقبة تسجيل الخروج اليدوي أو انتهاء الجلسة
        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT' || !session) {
                window.location.href = "../../pages/auth.html";
            }
        });

    } catch (err) {
        console.error("Session Check Error:", err);
        window.location.href = "../../pages/auth.html";
    }
});

async function initAdminDashboard(uid) {
    console.log("🚀 [DEBUG 1] بدء تهيئة لوحة التحكم. الـ ID الخاص بك:", uid);
    try {
        console.log("⏳ [DEBUG 2] جاري الاتصال بـ Supabase لجلب البروفايل...");
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', uid)
            .maybeSingle();

        console.log("📊 [DEBUG 3] استجابة قاعدة البيانات:", { profile: profile, error: error });

        if (error) throw error;
        if (!profile) throw new Error("لم يتم العثور على بيانات البروفايل (النتيجة فارغة من الداتابيز)");

        adminProfile = profile;
        
        const userRole = (adminProfile.role || '').trim().toLowerCase();
        console.log("🛡️ [DEBUG 4] الرتبة المستخرجة بعد التنظيف:", userRole);

        if (userRole !== 'owner' && userRole !== 'admin') {
            console.warn("🚫 [DEBUG 5] تم رفض الدخول. الرتبة غير مصرح لها.");
            showToast("غير مصرح لك بالدخول", "error");
            setTimeout(() => window.location.href = "student-dash.html", 2000);
            return;
        }

        adminPermissions = []; 
        let rawPerms = adminProfile.admin_permissions;
        console.log("🔑 [DEBUG 6] الصلاحيات الخام القادمة من الداتابيز:", rawPerms);

        if (typeof rawPerms === 'string') {
            try { 
                rawPerms = JSON.parse(rawPerms); 
                console.log("🔄 [DEBUG 7] تم تحويل الصلاحيات بنجاح من نص إلى كائن:", rawPerms);
            } catch(e) {
                console.error("⚠️ [DEBUG 7] فشل تحويل الصلاحيات النصية:", e);
            }
        }

        if (userRole === 'owner' || (rawPerms && rawPerms['*'])) {
            adminPermissions = ['manage_content', 'manage_requests', 'audit_projects', 'manage_users'];
            console.log("👑 [DEBUG 8] تم منحك كل الصلاحيات لأنك Owner أو تمتلك النجمة");
        } else if (Array.isArray(rawPerms)) {
            adminPermissions = rawPerms;
            console.log("✅ [DEBUG 8] تم اعتماد مصفوفة الصلاحيات العادية:", adminPermissions);
        } else if (rawPerms && Array.isArray(rawPerms.permissions)) {
            adminPermissions = rawPerms.permissions;
            console.log("✅ [DEBUG 8] تم اعتماد الصلاحيات من داخل الكائن:", adminPermissions);
        } else {
            console.warn("⚠️ [DEBUG 8] لم يتم التعرف على صيغة الصلاحيات، تم تعيينها كمصفوفة فارغة مؤقتاً.");
        }

        console.log("🎨 [DEBUG 9] جاري استدعاء دالة تحديث الواجهة (updateAdminUI)...");
        if (typeof updateAdminUI === 'function') {
            updateAdminUI();
        } else {
            console.error("❌ [DEBUG 9] دالة updateAdminUI غير موجودة أو لم يتم قراءتها!");
        }

        console.log("🖱️ [DEBUG 10] جاري البحث عن التاب الافتراضي للضغط عليه...");
        const firstTab = document.querySelector('[data-target="dashboard"]');
        if (firstTab) {
            firstTab.click();
            console.log("✅ [DEBUG 11] تمت عملية التهيئة بالكامل بنجاح تام!");
        } else {
            console.warn("⚠️ [DEBUG 11] لم يتم العثور على التاب الافتراضي (dashboard) في الـ HTML للضغط عليه.");
        }

    } catch (error) {
        console.error("❌ [DEBUG ERROR] حدث خطأ قاتل في الدالة الرئيسية:", error);
        showToast("حدث خطأ أثناء تحميل البيانات", "error");
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
    console.log("⚙️ [DEBUG UI-1] بدء تنفيذ دالة تحديث الواجهة...");
    try {
        // 💡 تم تحديث الـ IDs لتطابق ملف الـ HTML الخاص بك
        const nameEl = document.getElementById('admin-name'); 
        const roleEl = document.getElementById('admin-role-badge');
        
        console.log("📝 [DEBUG UI-2] هل تم العثور على مكان الاسم والرتبة؟", { "الاسم": !!nameEl, "الرتبة": !!roleEl });

        if (nameEl && adminProfile) {
            nameEl.innerText = adminProfile.full_name || 'مدير النظام';
        }
        
        if (roleEl && adminProfile) {
            const r = (adminProfile.role || '').trim().toLowerCase();
            roleEl.innerText = (r === 'owner') ? 'المالك 👑' : 'مشرف 🛡️';
        }

        // 💡 تم تحديث السمة لتطابق data-perm اللي إنت كاتبها
        const restrictedElements = document.querySelectorAll('[data-perm]');
        console.log("🎛️ [DEBUG UI-3] عدد الأزرار التي تم العثور عليها:", restrictedElements.length);
        
        const safePerms = Array.isArray(adminPermissions) ? adminPermissions : [];
        const userRole = (adminProfile && adminProfile.role) ? adminProfile.role.trim().toLowerCase() : '';
        
        restrictedElements.forEach((el) => {
            const requiredPermission = el.getAttribute('data-perm'); // 💡 التعديل هنا
            const isAllowed = (userRole === 'owner' || safePerms.includes(requiredPermission));
            
            if (isAllowed) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });
        
        console.log("✅ [DEBUG UI-4] انتهى تحديث الواجهة بنجاح، الأزرار جاهزة.");

    } catch (err) {
        console.error("❌ [DEBUG UI-ERROR] حدث خطأ أثناء تحديث الواجهة:", err);
    }
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

// 💡 إصلاح زر تسجيل الخروج بالاتصال المباشر
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الخروج...';
                // ✅ استخدام supabase مباشرة
                await supabase.auth.signOut(); 
                window.location.href = "../../pages/auth.html";
            } catch (error) {
                console.error("Logout Error:", error);
                showToast("حدث خطأ أثناء تسجيل الخروج", "error");
            }
        });
    }
}

function loadModuleData(moduleId) {
    if (moduleId === 'content-mgmt') {
        // loadContentData('phases');
    } else if (moduleId === 'member-requests') {
        // 💡 استدعاء جلب البيانات والتراكات عند فتح التاب
        if (typeof window.fetchFilterTracks === 'function') window.fetchFilterTracks();
        if (typeof window.fetchApplications === 'function') window.fetchApplications();
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