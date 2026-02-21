import { supabase } from './supabase-config.js';

let currentTeamId = null;
let isEditMode = false;
let currentPostId = null;
let teamMembersCache = [];
let postsCache = [];
let currentUserData = null;
let isArchiveView = false;

const POST_TYPES = {
    'announcement': { label: 'إعلان عام', icon: 'fa-bullhorn', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    'deadline': { label: 'ميعاد تسليم', icon: 'fa-hourglass-half', color: 'text-red-400', bg: 'bg-red-500/10' },
    'meeting': { label: 'اجتماع', icon: 'fa-video', color: 'text-purple-400', bg: 'bg-purple-500/10' },
    'warning': { label: 'تنبيه هام', icon: 'fa-exclamation-triangle', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    'achievement': { label: 'إنجاز', icon: 'fa-trophy', color: 'text-green-400', bg: 'bg-green-500/10' }
};

// ==========================================
// 1. INITIALIZATION
// ==========================================
export async function initNotificationsSystem(teamId) {
    if (!teamId) return;
    currentTeamId = teamId;

    setupEventListeners();
    await fetchCurrentUser();
    await fetchTeamMembers();
    await fetchAndRenderPosts();
}

function setupEventListeners() {
    const form = document.getElementById('post-form');
    if (form) form.onsubmit = handlePostSubmit;
}

// ==========================================
// 2. DATA FETCHING
// ==========================================
async function fetchCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        currentUserData = data || { id: user.id };
    }
}

async function fetchTeamMembers() {
    if (!currentTeamId) return;
    const { data } = await supabase.from('profiles').select('id, full_name, avatar_url').eq('team_id', currentTeamId);
    teamMembersCache = data || [];
}

async function fetchAndRenderPosts() {
    const activeTable = document.getElementById('posts-table-body');
    const archiveTable = document.getElementById('archive-table-body');
    
    if (activeTable) activeTable.innerHTML = '<tr><td colspan=\"5\" class=\"text-center py-8\"><i class=\"fas fa-spinner fa-spin text-b-primary text-2xl\"></i></td></tr>';

    try {
        const { data, error } = await supabase
            .from('team_posts')
            .select('*')
            .eq('team_id', currentTeamId)
            .order('is_pinned', { ascending: false }) // Pinned first
            .order('created_at', { ascending: false });

        if (error) throw error;
        postsCache = data || [];

        // Separation Logic: if expiry_date is past, it goes to archive. Otherwise active.
        const now = new Date();
        const activePosts = [];
        const archivedPosts = [];

        postsCache.forEach(post => {
            if (post.expiry_date && new Date(post.expiry_date) < now) {
                archivedPosts.push(post);
            } else {
                activePosts.push(post);
            }
        });

        if (activeTable) renderTable(activePosts, activeTable, false);
        if (archiveTable) renderTable(archivedPosts, archiveTable, true);

    } catch (error) {
        console.error("Fetch Error:", error);
    }
}

// ==========================================
// 3. TABLE RENDERING
// ==========================================
function renderTable(posts, container, isArchive) {
    if (posts.length === 0) {
        container.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-gray-500">لا توجد إشعارات ${isArchive ? 'في الأرشيف' : 'نشطة'}</td></tr>`;
        return;
    }

    container.innerHTML = posts.map(post => {
        const config = POST_TYPES[post.type] || POST_TYPES['announcement'];
        const seenCount = (post.seen_by || []).length;
        const totalMembers = teamMembersCache.length;
        const dateStr = new Date(post.created_at).toLocaleDateString('ar-EG');
        const safeData = JSON.stringify(post).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
        const pinBadge = post.is_pinned ? `<i class="fas fa-thumbtack text-b-primary mr-2" title="مثبت"></i>` : '';

        return `
            <tr class="hover:bg-white/5 transition-colors group border-b border-white/5 last:border-0">
                <td class="p-4 pr-6">
                    <div class="flex items-center gap-3 cursor-pointer" onclick="window.openPostDetail('${post.id}')">
                        <div class="w-10 h-10 rounded-xl ${config.bg} ${config.color} flex items-center justify-center shrink-0">
                            <i class="fas ${config.icon}"></i>
                        </div>
                        <div class="text-right">
                            <h4 class="text-white font-bold text-sm mb-0.5 group-hover:text-b-primary transition-colors">
                                ${pinBadge}${post.title}
                            </h4>
                            <span class="text-[10px] text-gray-500 line-clamp-1 max-w-[250px]">${post.content}</span>
                        </div>
                    </div>
                </td>
                <td class="p-4 text-center font-mono text-xs text-gray-400">${dateStr}</td>
                <td class="p-4 text-center">
                    <span class="inline-flex items-center gap-1.5 px-2 py-1 bg-black/40 rounded border border-white/5 text-xs text-gray-300">
                        <i class="fas fa-eye text-gray-500"></i> ${seenCount}/${totalMembers}
                    </span>
                </td>
                <td class="p-4 text-center">
                    <span class="px-2 py-1 rounded text-[10px] font-bold ${config.color} ${config.bg}">
                        ${config.label}
                    </span>
                </td>
                <td class="p-4 text-center">
                    <div class="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="window.openPostModal(true, '${safeData}')" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-blue-500/20 text-gray-400 hover:text-blue-400 transition-colors" title="تعديل">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button onclick="window.deletePost('${post.id}')" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors" title="حذف">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ==========================================
// 4. CRUD ACTIONS
// ==========================================
async function handlePostSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-post');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري النشر...';
    btn.disabled = true;

    try {
        const payload = {
            team_id: currentTeamId,
            type: document.getElementById('post-type').value,
            title: document.getElementById('post-title').value.trim(),
            content: document.getElementById('post-content').value.trim(),
            expiry_date: document.getElementById('post-expiry').value || null,
            link_url: document.getElementById('post-link').value.trim() || null,
            is_pinned: document.getElementById('post-pin').checked,
            creator_id: currentUserData.id,
            creator_name: currentUserData.full_name || 'Leader',
            creator_avatar: currentUserData.avatar_url || ''
        };

        if (isEditMode && currentPostId) {
            await supabase.from('team_posts').update(payload).eq('id', currentPostId);
            showToast("تم التعديل بنجاح", "success");
        } else {
            payload.seen_by = [currentUserData.id];
            await supabase.from('team_posts').insert([payload]);
            showToast("تم النشر بنجاح", "success");
        }

        window.closeCreatePostPanel();
        await fetchAndRenderPosts();

    } catch (error) {
        console.error("Save Error:", error);
        showToast("حدث خطأ أثناء الحفظ", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

window.deletePost = async (id) => {
    if (!confirm("هل أنت متأكد من حذف هذا الإشعار؟")) return;
    try {
        await supabase.from('team_posts').delete().eq('id', id);
        showToast("تم الحذف بنجاح", "success");
        fetchAndRenderPosts();
    } catch (e) {
        showToast("فشل الحذف", "error");
    }
};

// ==========================================
// 5. SIDE PANEL & HTML ALIASES
// ==========================================

window.openCreatePostPanel = () => window.openPostModal(false);

window.openPostModal = (isEdit = false, postDataStr = null) => {
    isEditMode = isEdit;
    
    // ربط العناصر مع Side Panel الموجود في ملف HTML
    const panel = document.getElementById('post-side-panel');
    const overlay = document.getElementById('panel-overlay');
    const form = document.getElementById('post-form');
    const titleText = document.getElementById('panel-title');

    if (!panel || !overlay) {
        console.error("Side Panel elements missing in HTML.");
        return;
    }

    if (form) form.reset();

    if (isEditMode && postDataStr) {
        const post = JSON.parse(postDataStr.replace(/&apos;/g, "'").replace(/&quot;/g, '"'));
        currentPostId = post.id;
        
        document.getElementById('post-type').value = post.type;
        document.getElementById('post-title').value = post.title;
        document.getElementById('post-content').value = post.content;
        if(post.expiry_date) document.getElementById('post-expiry').value = post.expiry_date;
        if(post.link_url) document.getElementById('post-link').value = post.link_url;
        if(document.getElementById('post-pin')) document.getElementById('post-pin').checked = post.is_pinned;
        
        if (titleText) titleText.innerHTML = `<i class="fas fa-pen-nib text-b-primary"></i> تعديل الإشعار`;
    } else {
        currentPostId = null;
        if (titleText) titleText.innerHTML = `<i class="fas fa-pen-nib text-b-primary"></i> إنشاء إشعار`;
    }

    // إظهار اللوحة الجانبية بحركة انسيابية
    overlay.classList.remove('hidden');
    setTimeout(() => {
        panel.classList.remove('translate-x-full');
    }, 10);
};

window.closeCreatePostPanel = () => {
    const panel = document.getElementById('post-side-panel');
    const overlay = document.getElementById('panel-overlay');
    
    if (panel) panel.classList.add('translate-x-full');
    if (overlay) setTimeout(() => overlay.classList.add('hidden'), 300); // Wait for animation
    
    isEditMode = false;
    currentPostId = null;
};

// Map the close button call from the HTML to the correct function
window.closePostModal = window.closeCreatePostPanel;

// ==========================================
// 6. ARCHIVE & VIEW DETAILS
// ==========================================

window.toggleArchiveView = (showArchive) => {
    const activeSection = document.getElementById('active-posts-section');
    const archiveSection = document.getElementById('archive-section');
    
    if (showArchive) {
        activeSection.classList.add('hidden');
        archiveSection.classList.remove('hidden');
    } else {
        activeSection.classList.remove('hidden');
        archiveSection.classList.add('hidden');
    }
};
function resolveImageUrl(url) {
    if (!url || url.trim() === "" || url === "null" || url === "undefined") {
        return '../assets/icons/icon.jpg';
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
window.openPostDetail = (postId) => {
    const post = postsCache.find(p => p.id === postId);
    if (!post) return;

    const modal = document.getElementById('post-detail-modal');
    const contentBox = document.getElementById('post-detail-content');
    
    // جلب الإعدادات (الألوان والأيقونات)
    const config = POST_TYPES[post.type] || POST_TYPES['announcement'];
    
    // تنسيق التاريخ
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    const dateStr = new Date(post.created_at).toLocaleDateString('ar-EG', dateOptions);
    
    // بيانات الناشر والمشاهدات
    const avatar = resolveImageUrl(post.creator_avatar, 'user');
    const seenCount = (post.seen_by || []).length;
    const totalMembers = teamMembersCache.length > 0 ? teamMembersCache.length : 1; // تجنب القسمة على صفر
    
    // تجهيز عناصر إضافية (رابط - تاريخ انتهاء - تثبيت)
    const linkHtml = post.link_url ? `
        <a href="${post.link_url}" target="_blank" class="flex-1 flex items-center justify-center gap-2 bg-b-primary/10 hover:bg-b-primary/20 text-b-primary border border-b-primary/20 py-3 px-4 rounded-xl transition-all font-bold text-sm">
            <i class="fas fa-external-link-alt"></i> فتح الرابط المرفق
        </a>` : '';
        
    const expiryHtml = post.expiry_date ? `
        <div class="flex-1 flex items-center justify-center gap-2 bg-red-500/10 text-red-400 border border-red-500/20 py-3 px-4 rounded-xl font-bold text-sm">
            <i class="far fa-calendar-times"></i> ينتهي في: ${new Date(post.expiry_date).toLocaleDateString('ar-EG')}
        </div>` : '';

    const pinBadge = post.is_pinned ? `<span class="bg-white/10 text-white px-3 py-1 rounded-lg text-[10px] font-bold border border-white/10 flex items-center gap-1"><i class="fas fa-thumbtack text-b-primary"></i> مثبت</span>` : '';

    // بناء واجهة الكارت باحترافية
    contentBox.innerHTML = `
        <div class="flex justify-between items-start mb-6 border-b border-white/5 pb-5">
            <div class="flex items-center gap-4">
                <div class="relative">
                    <img src="${avatar}" class="w-14 h-14 rounded-xl object-cover border-2 border-white/10">
                    <div class="absolute -bottom-2 -right-2 w-6 h-6 bg-b-surface rounded-full flex items-center justify-center text-[10px] border border-white/10">
                        <i class="fas fa-crown text-yellow-500"></i>
                    </div>
                </div>
                <div>
                    <h4 class="text-white font-bold text-lg">${post.creator_name || 'قائد الفريق'}</h4>
                    <span class="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5"><i class="far fa-clock"></i> ${dateStr}</span>
                </div>
            </div>
            
            <div class="flex flex-col items-end gap-2">
                <span class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${config.bg} ${config.color} border border-white/5 flex items-center gap-2">
                    <i class="fas ${config.icon}"></i> ${config.label}
                </span>
                ${pinBadge}
            </div>
        </div>
        
        <div class="mb-6">
            <h2 class="text-2xl font-black text-white mb-4 leading-tight">${post.title}</h2>
            <div class="text-gray-300 text-sm leading-loose whitespace-pre-wrap bg-black/40 p-6 rounded-2xl border border-white/5 shadow-inner">
                ${post.content}
            </div>
        </div>

        ${(linkHtml || expiryHtml) ? `
            <div class="flex flex-col sm:flex-row gap-3 mb-6">
                ${linkHtml}
                ${expiryHtml}
            </div>
        ` : ''}

        <div class="bg-white/5 p-4 rounded-xl flex justify-between items-center border border-white/5">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-gray-400">
                    <i class="fas fa-eye text-lg"></i>
                </div>
                <div>
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">حالة القراءة</p>
                    <p class="text-xs text-gray-300">تمت المشاهدة بواسطة أعضاء الفريق</p>
                </div>
            </div>
            <div class="text-white font-bold text-xl font-mono bg-black/50 px-4 py-2 rounded-lg border border-white/10">
                ${seenCount} <span class="text-sm text-gray-500">/ ${totalMembers}</span>
            </div>
        </div>
    `;

    if (modal) modal.classList.remove('hidden');
};

window.closePostDetailModal = () => {
    document.getElementById('post-detail-modal')?.classList.add('hidden');
};

// ==========================================
// 7. TOAST MESSAGES
// ==========================================
function showToast(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-4 left-4 z-50 flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const color = type === 'success' ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400';
    toast.className = `bg-gray-900 px-6 py-4 rounded-xl border-l-4 ${color} shadow-2xl backdrop-blur flex items-center gap-3 animate-slide-in min-w-[300px] mb-2`;
    toast.innerHTML = `<span class="text-white text-sm font-bold">${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}