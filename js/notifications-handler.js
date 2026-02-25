import { supabase } from './supabase-config.js';

let currentTeamId = null;
let isEditMode = false;
let currentPostId = null;
let teamMembersCache = [];
let postsCache = [];
let adminMessagesCache = [];
let currentUserData = null;
let currentSelectedType = 'announcement';

const POST_TYPES = {
    'announcement': { label: 'إعلان عام', icon: 'fa-bullhorn', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    'deadline': { label: 'ميعاد تسليم', icon: 'fa-hourglass-half', color: 'text-red-400', bg: 'bg-red-500/10' },
    'meeting': { label: 'اجتماع', icon: 'fa-video', color: 'text-purple-400', bg: 'bg-purple-500/10' },
    'warning': { label: 'تنبيه هام', icon: 'fa-exclamation-triangle', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    'achievement': { label: 'إنجاز', icon: 'fa-trophy', color: 'text-green-400', bg: 'bg-green-500/10' }
};

// ==========================================
// 1. INITIALIZATION & DATA FETCHING
// ==========================================
export async function initNotificationsSystem(teamId) {
    // محاولة جلب الآي دي في حال تأخره
    currentTeamId = teamId || window.currentTeam?.team_id || window.currentTeam?.id;
    
    // جلب المستخدم الحالي
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', authData.user.id).single();
        currentUserData = profile;
    }

    // جلب أعضاء الفريق إذا وجد فريق
    if (currentTeamId) {
        const { data: members } = await supabase.from('profiles').select('id, full_name, avatar_url').eq('team_id', currentTeamId);
        if (members) teamMembersCache = members;
    }

    renderPostTypes();
    if (currentTeamId) {
        await fetchAndRenderPosts();
    }
}

function renderPostTypes() {
    const container = document.getElementById('post-type-selector');
    if (!container) return;
    
    container.innerHTML = Object.entries(POST_TYPES).map(([key, data]) => `
        <label class="flex items-center gap-2 p-2 rounded-lg border border-white/10 cursor-pointer hover:bg-white/5 transition-all">
            <input type="radio" name="post_type" value="${key}" ${key === 'announcement' ? 'checked' : ''} onchange="currentSelectedType='${key}'" class="accent-b-primary w-4 h-4">
            <i class="fas ${data.icon} ${data.color}"></i>
            <span class="text-xs text-gray-300 font-bold">${data.label}</span>
        </label>
    `).join('');
}

// ==========================================
// 2. FETCH & RENDER TEAM POSTS
// ==========================================
async function fetchAndRenderPosts() {
    if (!currentTeamId) return;
    const activeTable = document.getElementById('posts-table-body');
    if (activeTable) activeTable.innerHTML = '<tr><td colspan="5" class="text-center py-8"><i class="fas fa-spinner fa-spin text-b-primary text-2xl"></i></td></tr>';

    try {
        const { data, error } = await supabase
            .from('team_posts')
            .select('*')
            .eq('team_id', currentTeamId)
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;
        postsCache = data || [];
        
        window.filterTeamPosts(false);
        window.filterTeamPosts(true);

    } catch (error) {
        console.error("Fetch Error:", error);
    }
}

function renderTable(posts, tbody, isArchive) {
    if (!tbody) return;
    if (posts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-gray-500 italic">لا توجد إشعارات ${isArchive ? 'في الأرشيف' : 'نشطة'}</td></tr>`;
        return;
    }

    tbody.innerHTML = posts.map(post => {
        const typeData = POST_TYPES[post.type] || POST_TYPES['announcement'];
        const dateStr = new Date(post.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
        const seenCount = post.seen_by ? post.seen_by.length : 0;
        
        const targetBadge = (post.target_members && post.target_members.includes('all')) 
            ? `<span class="bg-white/10 text-gray-400 text-[10px] px-2 py-0.5 rounded border border-white/5 mr-2">للجميع</span>` 
            : `<span class="bg-purple-500/20 text-purple-400 text-[10px] px-2 py-0.5 rounded border border-purple-500/30 mr-2"><i class="fas fa-user-lock"></i> مخصص</span>`;

        return `
        <tr class="hover:bg-white/5 transition-colors group">
            <td class="p-4 pr-6">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full ${typeData.bg} flex items-center justify-center ${typeData.color} shrink-0 shadow-inner">
                        <i class="fas ${typeData.icon}"></i>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            ${post.is_pinned ? '<i class="fas fa-thumbtack text-yellow-500 text-xs"></i>' : ''}
                            <h4 class="font-bold text-white text-sm cursor-pointer hover:text-b-primary transition-colors" onclick="window.openPostDetail('${post.id}')">${post.title}</h4>
                            ${targetBadge}
                        </div>
                        <p class="text-[10px] text-gray-400 mt-1">بواسطة ${post.creator_name}</p>
                    </div>
                </div>
            </td>
            <td class="p-4 text-center text-xs text-gray-300 font-mono">${dateStr}</td>
            <td class="p-4 text-center">
                <span class="bg-black/40 border border-white/5 text-gray-300 text-xs px-2.5 py-1 rounded-lg font-mono">
                    <i class="fas fa-eye text-b-primary mr-1"></i> ${seenCount}
                </span>
            </td>
            <td class="p-4 text-center">
                ${isArchive 
                    ? '<span class="bg-gray-500/20 text-gray-400 text-xs px-3 py-1 rounded-full border border-gray-500/30">مؤرشف</span>' 
                    : '<span class="bg-green-500/20 text-green-400 text-xs px-3 py-1 rounded-full border border-green-500/30">نشط</span>'}
            </td>
            <td class="p-4 text-center">
                <div class="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    ${!isArchive ? `<button onclick="window.openCreatePostModal('${post.id}')" class="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-600 hover:text-white transition-all" title="تعديل"><i class="fas fa-edit text-xs"></i></button>` : ''}
                    <button onclick="window.deletePost('${post.id}')" class="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-600 hover:text-white transition-all" title="حذف"><i class="fas fa-trash text-xs"></i></button>
                    ${!post.is_pinned && !isArchive ? `<button onclick="window.togglePinPost('${post.id}', true)" class="w-8 h-8 rounded-lg bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500 hover:text-black transition-all" title="تثبيت"><i class="fas fa-thumbtack text-xs"></i></button>` : ''}
                    ${post.is_pinned && !isArchive ? `<button onclick="window.togglePinPost('${post.id}', false)" class="w-8 h-8 rounded-lg bg-white/10 text-gray-300 hover:bg-white hover:text-black transition-all" title="إلغاء التثبيت"><i class="fas fa-thumbtack text-xs opacity-50"></i></button>` : ''}
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

// ==========================================
// 3. TABS & ARCHIVE VIEWS & SEARCH FILTERS
// ==========================================
window.switchNotificationTab = (tab) => {
    const teamBtn = document.getElementById('tab-btn-team-notifs');
    const adminBtn = document.getElementById('tab-btn-admin-notifs');
    const teamCont = document.getElementById('team-notifs-container');
    const adminCont = document.getElementById('admin-notifs-container');

    teamBtn.className = "flex-1 py-3 bg-transparent text-gray-500 hover:bg-white/5 hover:text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2";
    adminBtn.className = "flex-1 py-3 bg-transparent text-gray-500 hover:bg-white/5 hover:text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 relative";

    if (tab === 'team') {
        teamBtn.classList.add('bg-b-primary/20', 'text-b-primary', 'border', 'border-b-primary/30');
        teamBtn.classList.remove('text-gray-500', 'bg-transparent');
        teamCont.classList.remove('hidden');
        adminCont.classList.add('hidden');
    } else {
        adminBtn.classList.add('bg-red-500/20', 'text-red-400', 'border', 'border-red-500/30');
        adminBtn.classList.remove('text-gray-500', 'bg-transparent');
        teamCont.classList.add('hidden');
        adminCont.classList.remove('hidden');
        if (window.loadAdminNotifications) window.loadAdminNotifications(); 
    }
};

window.toggleArchiveView = (showArchive, type = 'team') => {
    if (type === 'team') {
        document.getElementById('active-posts-section').classList.toggle('hidden', showArchive);
        document.getElementById('archive-section').classList.toggle('hidden', !showArchive);
    } else if (type === 'admin') {
        document.getElementById('admin-active-section').classList.toggle('hidden', showArchive);
        document.getElementById('admin-archive-section').classList.toggle('hidden', !showArchive);
    }
};

window.filterTeamPosts = (isArchive) => {
    const inputId = isArchive ? 'archive-team-search' : 'active-team-search';
    const queryEl = document.getElementById(inputId);
    const query = queryEl ? queryEl.value.toLowerCase() : '';
    const now = new Date();

    let filtered = postsCache.filter(post => {
        const matchesSearch = post.title.toLowerCase().includes(query) || post.content.toLowerCase().includes(query);
        
        let isArchivedPost = false;
        if (post.expiry_date) {
            // ضبط وقت الانتهاء ليكون في نهاية اليوم لكي لا يختفي الإشعار مبكراً
            const expiry = new Date(post.expiry_date);
            expiry.setHours(23, 59, 59, 999);
            if (expiry < now) isArchivedPost = true;
        }

        return isArchive ? (matchesSearch && isArchivedPost) : (matchesSearch && !isArchivedPost);
    });

    const tbody = document.getElementById(isArchive ? 'archive-table-body' : 'posts-table-body');
    if (tbody) renderTable(filtered, tbody, isArchive);
};

window.filterAdminMessages = (isArchive) => {
    const inputId = isArchive ? 'archive-admin-search' : 'active-admin-search';
    const queryEl = document.getElementById(inputId);
    const query = queryEl ? queryEl.value.toLowerCase() : '';
    const container = document.getElementById(isArchive ? 'admin-archive-list' : 'admin-messages-list');
    
    if (!container) return;

    let filtered = adminMessagesCache.filter(msg => {
        const matchesSearch = msg.title.toLowerCase().includes(query) || msg.content.toLowerCase().includes(query);
        const isMsgArchived = msg.is_read === true;
        return isArchive ? (matchesSearch && isMsgArchived) : (matchesSearch && !isMsgArchived);
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-gray-500 border border-white/5 border-dashed rounded-xl">لا توجد رسائل ${isArchive ? 'في الأرشيف' : 'نشطة'}.</div>`;
        return;
    }

    container.innerHTML = filtered.map(msg => `
        <div class="bg-black/40 border ${isArchive ? 'border-gray-500/20' : 'border-red-500/20'} rounded-xl p-5 hover:bg-white/5 transition-colors relative overflow-hidden group">
            <div class="absolute top-0 right-0 w-1 h-full ${isArchive ? 'bg-gray-500' : 'bg-red-500'}"></div>
            <div class="flex items-center gap-3 mb-3">
                <div class="w-8 h-8 rounded-full ${isArchive ? 'bg-gray-500/20 text-gray-400' : 'bg-red-500/20 text-red-500'} flex items-center justify-center"><i class="fas fa-envelope-open-text"></i></div>
                <h4 class="font-bold ${isArchive ? 'text-gray-300' : 'text-white'} text-lg">${msg.title}</h4>
                <span class="text-[10px] text-gray-500 mr-auto">${new Date(msg.created_at).toLocaleDateString('ar-EG')}</span>
            </div>
            <p class="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap pr-11 mb-3">${msg.content}</p>
            ${!isArchive ? `
            <div class="pr-11">
                <button onclick="window.markAdminMessageAsRead('${msg.id}')" class="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2 rounded-lg transition-all flex items-center gap-2">
                    <i class="fas fa-check-double"></i> تحديد كمقروء (نقل للأرشيف)
                </button>
            </div>
            ` : ''}
        </div>
    `).join('');
};


window.openCreatePostPanel = () => window.openCreatePostModal();


window.openCreatePostModal = (postId = null) => {
    const modal = document.getElementById('create-post-modal');
    if(!modal) return;

    const titleEl = document.getElementById('post-title');
    const contentEl = document.getElementById('post-content');
    const linkEl = document.getElementById('post-link');
    const expiryEl = document.getElementById('post-expiry');
    const targetSelect = document.getElementById('post-target-type');
    const list = document.getElementById('specific-members-list');

    if (postId) {
        // حالة التعديل
        isEditMode = true;
        currentPostId = postId;
        const post = postsCache.find(p => p.id === postId);
        
        if(post) {
            if(titleEl) titleEl.value = post.title || '';
            if(contentEl) contentEl.value = post.content || '';
            if(linkEl) linkEl.value = post.link_url || '';
            if(expiryEl) expiryEl.value = post.expiry_date || '';

            // 💡 تحديد النوع
            currentSelectedType = post.type || 'announcement';
            const typeRadios = document.querySelectorAll('input[name="post_type"]');
            typeRadios.forEach(radio => radio.checked = (radio.value === currentSelectedType));

            // 💡 إصلاح منطق تحديد المستهدفين
            if (post.target_members && !post.target_members.includes('all') && post.target_members.length > 0) {
                if(targetSelect) targetSelect.value = 'specific';
                window.toggleTargetMembers(); // إظهار القائمة
                
                // تحديد الأشخاص المعنيين فقط (بعد تأخير بسيط لضمان رسم القائمة)
                setTimeout(() => {
                    const checkboxes = document.querySelectorAll('.target-member-checkbox');
                    checkboxes.forEach(cb => {
                        cb.checked = post.target_members.includes(cb.value);
                    });
                }, 50);
            } else {
                if(targetSelect) targetSelect.value = 'all';
                if(list) list.classList.add('hidden');
            }

            document.getElementById('post-modal-title').innerHTML = '<i class="fas fa-edit text-b-primary"></i> تعديل الإشعار';
        }
    } else {
        // حالة الإنشاء الجديد (تنظيف كل شيء)
        isEditMode = false;
        currentPostId = null;
        if(titleEl) titleEl.value = '';
        if(contentEl) contentEl.value = '';
        if(linkEl) linkEl.value = '';
        if(expiryEl) expiryEl.value = '';
        
        if(targetSelect) targetSelect.value = 'all';
        if(list) list.classList.add('hidden');
        
        // تنظيف مربعات الاختيار لو كانت مرسومة
        const checkboxes = document.querySelectorAll('.target-member-checkbox');
        checkboxes.forEach(cb => cb.checked = false);
        
        document.getElementById('post-modal-title').innerHTML = '<i class="fas fa-pen-nib text-b-primary"></i> كتابة إشعار';
    }
    
    modal.classList.remove('hidden');
};
window.closeCreatePostModal = () => {
    document.getElementById('create-post-modal')?.classList.add('hidden');
    isEditMode = false;
    currentPostId = null;
};

window.openPostDetail = (postId) => {
    const post = postsCache.find(p => p.id === postId);
    if (!post) return;

    const modal = document.getElementById('post-detail-modal');
    const contentBox = document.getElementById('post-detail-content');
    
    const config = POST_TYPES[post.type] || POST_TYPES['announcement'];
    const dateStr = new Date(post.created_at).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    // 💡 التحقق هل الإشعار مؤرشف أم نشط
    const now = new Date();
    let isArchived = false;
    if (post.expiry_date) {
        const expiry = new Date(post.expiry_date);
        expiry.setHours(23, 59, 59, 999);
        if (expiry < now) isArchived = true;
    }

    // 💡 تحديد قائمة الطلاب المستهدفين
    let targetList = [];
    let isTargetAll = post.target_members && post.target_members.includes('all');
    
    if (isTargetAll) {
        targetList = teamMembersCache; // جميع أفراد الفريق
    } else if (post.target_members) {
        targetList = teamMembersCache.filter(m => post.target_members.includes(m.id)); // أفراد محددين
    }

    // 💡 بناء قائمة الطلاب بحالة المشاهدة والتاريخ
    const membersHtml = targetList.length > 0 ? targetList.map(member => {
        // البحث عن الطالب في سجل المشاهدات (يدعم الـ IDs النصية أو الـ Objects ذات التواريخ)
        let seenData = null;
        if (post.seen_by && Array.isArray(post.seen_by)) {
            seenData = post.seen_by.find(item => typeof item === 'object' ? item.uid === member.id : item === member.id);
        }

        const avatar = (member.avatar_url && member.avatar_url !== 'null') ? member.avatar_url : '../assets/icons/icon.jpg';
        const hasSeen = !!seenData;
        const seenIcon = hasSeen ? '<i class="fas fa-check-double text-green-400"></i>' : '<i class="fas fa-clock text-gray-600"></i>';
        const seenText = hasSeen ? '<span class="text-green-400 font-bold">قرأ الإشعار</span>' : '<span class="text-gray-500">لم يقرأه بعد</span>';
        
        // استخراج وقت المشاهدة إن وجد
        let timeText = '';
        if (hasSeen && typeof seenData === 'object' && seenData.seen_at) {
            timeText = new Date(seenData.seen_at).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } else if (hasSeen) {
            timeText = 'تمت المشاهدة'; // للبيانات القديمة التي لا تحتوي على تاريخ
        }

        return `
            <div class="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-xl hover:bg-white/5 transition-colors">
                <div class="flex items-center gap-3">
                    <img src="${avatar}" class="w-10 h-10 rounded-full object-cover border border-white/10">
                    <span class="text-sm font-bold text-white">${member.full_name}</span>
                </div>
                <div class="text-left flex flex-col items-end">
                    <div class="text-xs flex items-center gap-1.5">${seenText} ${seenIcon}</div>
                    ${timeText ? `<span class="text-[10px] text-gray-400 mt-1 font-mono">${timeText}</span>` : ''}
                </div>
            </div>
        `;
    }).join('') : '<p class="text-center text-gray-500 text-sm py-4">لا يوجد أعضاء مستهدفين أو الفريق فارغ.</p>';

    // إحصائيات عامة
    const seenCount = post.seen_by ? post.seen_by.length : 0;
    const totalCount = targetList.length;

    let avatar = post.creator_avatar || '../assets/icons/icon.jpg';
    if(avatar.includes('null') || avatar.includes('undefined')) avatar = '../assets/icons/icon.jpg';

    // 💡 أزرار التحكم (تعديل / حذف) تختلف حسب الأرشيف
    const actionButtons = `
        <div class="flex items-center gap-2">
            ${!isArchived ? `
                <button onclick="window.editFromDetail('${post.id}')" class="px-4 py-2 bg-blue-500/10 hover:bg-blue-600 text-blue-400 hover:text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2">
                    <i class="fas fa-edit"></i> تعديل
                </button>
            ` : `<span class="px-3 py-1.5 bg-gray-500/20 text-gray-400 text-xs rounded-lg border border-gray-500/30 font-bold"><i class="fas fa-archive"></i> إشعار مؤرشف</span>`}
            
            <button onclick="window.deleteFromDetail('${post.id}')" class="px-4 py-2 bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2">
                <i class="fas fa-trash"></i> حذف
            </button>
        </div>
    `;

    // 💡 بناء الواجهة الشاملة للكارت
    contentBox.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6 border-b border-white/5 pb-5">
            <div class="flex items-center gap-4">
                <img src="${avatar}" class="w-14 h-14 rounded-xl object-cover border-2 border-white/10 bg-black">
                <div>
                    <h4 class="text-white font-bold text-lg">${post.creator_name || 'قائد الفريق'}</h4>
                    <span class="text-xs text-gray-500"><i class="far fa-clock"></i> ${dateStr}</span>
                </div>
            </div>
            <div class="flex flex-col items-end gap-2">
                <span class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${config.bg} ${config.color} border border-white/5"><i class="fas ${config.icon}"></i> ${config.label}</span>
                ${actionButtons}
            </div>
        </div>
        
        <div class="mb-8">
            <h2 class="text-2xl font-black text-white mb-4">${post.title}</h2>
            <div class="text-gray-300 text-sm leading-loose whitespace-pre-wrap bg-black/40 p-6 rounded-2xl border border-white/5 shadow-inner">${post.content}</div>
        </div>

        ${(post.link_url || post.expiry_date) ? `
            <div class="flex flex-col sm:flex-row gap-3 mb-8">
                ${post.link_url ? `<a href="${post.link_url}" target="_blank" class="flex-1 flex items-center justify-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 py-3 px-4 rounded-xl transition-all font-bold text-sm"><i class="fas fa-external-link-alt"></i> فتح الرابط المرفق</a>` : ''}
                ${post.expiry_date ? `<div class="flex-1 flex items-center justify-center gap-2 bg-red-500/10 text-red-400 border border-red-500/20 py-3 px-4 rounded-xl font-bold text-sm"><i class="far fa-calendar-times"></i> ينتهي: ${new Date(post.expiry_date).toLocaleDateString('ar-EG')}</div>` : ''}
            </div>
        ` : ''}

        <div class="border-t border-white/10 pt-6">
            <div class="flex justify-between items-end mb-4">
                <div>
                    <h4 class="text-lg font-bold text-white flex items-center gap-2"><i class="fas fa-users text-b-primary"></i> الموجه إليهم الإشعار</h4>
                    <p class="text-xs text-gray-400 mt-1">${isTargetAll ? 'هذا الإشعار موجه لجميع أفراد الفريق' : 'هذا الإشعار مخصص لأفراد محددين'}</p>
                </div>
                <div class="text-left bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                    <span class="text-xs text-gray-500">تمت المشاهدة</span>
                    <p class="text-white font-mono font-bold text-sm">${seenCount} / ${totalCount}</p>
                </div>
            </div>
            
            <div class="space-y-2 max-h-60 overflow-y-auto custom-scroll pr-2">
                ${membersHtml}
            </div>
        </div>
    `;
    if (modal) modal.classList.remove('hidden');
};

// دوال مساعدة للتحكم من داخل المودل
window.editFromDetail = (postId) => {
    window.closePostDetailModal();
    setTimeout(() => window.openCreatePostModal(postId), 300); // نفتح نافذة التعديل بعد إغلاق التفاصيل
};

window.deleteFromDetail = async (postId) => {
    if (!confirm("هل أنت متأكد من حذف هذا الإشعار؟")) return;
    try {
        await supabase.from('team_posts').delete().eq('id', postId);
        showToast("تم الحذف بنجاح", "success");
        window.closePostDetailModal(); // إغلاق النافذة
        await fetchAndRenderPosts(); // تحديث الجداول
    } catch (e) {
        showToast("فشل الحذف", "error");
    }
};
window.closePostDetailModal = () => document.getElementById('post-detail-modal')?.classList.add('hidden');

// ==========================================
// 5. CRUD ACTIONS
// ==========================================

window.savePost = async () => {
    // حماية لتأكيد وجود المستخدم
    if (!currentUserData || !currentUserData.id) {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user) {
            const { data: p } = await supabase.from('profiles').select('*').eq('id', authData.user.id).single();
            currentUserData = p;
        }
        if (!currentUserData) return showToast('جاري تحميل بياناتك، يرجى المحاولة بعد ثانية...', 'warning');
    }

    const titleEl = document.getElementById('post-title');
    const contentEl = document.getElementById('post-content');
    const linkEl = document.getElementById('post-link');
    const expiryEl = document.getElementById('post-expiry');
    
    const title = titleEl ? titleEl.value.trim() : 'إشعار جديد';
    const content = contentEl ? contentEl.value.trim() : '';
    const linkVal = linkEl ? linkEl.value.trim() : '';
    const expiryVal = expiryEl ? expiryEl.value : '';
    
    const typeSelect = document.getElementById('post-target-type');
    let targetMembers = ['all'];
    if (typeSelect && typeSelect.value === 'specific') {
        const checkboxes = document.querySelectorAll('.target-member-checkbox:checked');
        targetMembers = Array.from(checkboxes).map(cb => cb.value);
        if (targetMembers.length === 0) return showToast('يرجى اختيار عضو واحد على الأقل', 'warning');
    }

    if (!content) return showToast('يرجى كتابة محتوى الإشعار', 'warning');

    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    btn.disabled = true;

    try {
        // 💡 التعديل هنا: تسجيل الليدر كأول شخص قرأ الإشعار في نفس لحظة الإنشاء
        const leaderSeenEntry = {
            uid: currentUserData.id,
            seen_at: new Date().toISOString()
        };

        const postData = {
            team_id: currentTeamId || window.currentTeam?.id,
            type: currentSelectedType,
            title: title,
            content: content,
            link_url: linkVal || null,
            expiry_date: expiryVal || null,
            creator_id: currentUserData.id,
            creator_name: currentUserData.full_name || 'القائد',
            creator_avatar: currentUserData.avatar_url,
            target_members: targetMembers,
            seen_by: [leaderSeenEntry] // إدراج الليدر في قائمة المشاهدات مباشرة
        };

        if (isEditMode && currentPostId) {
            // بما أننا نحدث الإشعار، سيتم تصفير المشاهدات للطلاب، ولكن الليدر سيظل "قرأه"
            await supabase.from('team_posts').update(postData).eq('id', currentPostId);
            showToast('تم تحديث الإشعار وتصفير المشاهدات للطلاب', 'success');
        } else {
            await supabase.from('team_posts').insert([postData]);
            showToast('تم نشر الإشعار بنجاح', 'success');
        }

        window.closeCreatePostModal();
        await fetchAndRenderPosts();
    } catch (e) {
        console.error(e);
        showToast('حدث خطأ أثناء الحفظ', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};
window.deletePost = async (id) => {
    if (!confirm("هل أنت متأكد من حذف هذا الإشعار؟")) return;
    try {
        await supabase.from('team_posts').delete().eq('id', id);
        showToast("تم الحذف بنجاح", "success");
        await fetchAndRenderPosts();
    } catch (e) {
        showToast("فشل الحذف", "error");
    }
};

window.togglePinPost = async (id, isPinned) => {
    try {
        await supabase.from('team_posts').update({ is_pinned: isPinned }).eq('id', id);
        await fetchAndRenderPosts();
    } catch (e) {
        console.error(e);
    }
};

// ==========================================
// 6. TARGET MEMBERS & ADMIN NOTIFICATIONS
// ==========================================
window.toggleTargetMembers = () => {
    const type = document.getElementById('post-target-type').value;
    const list = document.getElementById('specific-members-list');
    
    if (type === 'specific') {
        list.classList.remove('hidden');
        if (teamMembersCache && teamMembersCache.length > 0) {
            list.innerHTML = teamMembersCache.map(m => `
                <label class="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer border border-transparent hover:border-white/10 transition-colors">
                    <input type="checkbox" value="${m.id}" class="target-member-checkbox w-4 h-4 accent-b-primary rounded bg-black border-white/10">
                    <img src="${m.avatar_url ? (m.avatar_url.startsWith('http') ? m.avatar_url : `../assets/icons/icon.jpg`) : '../assets/icons/icon.jpg'}" class="w-6 h-6 rounded-full bg-black object-cover">
                    <span class="text-sm text-gray-300">${m.full_name}</span>
                </label>
            `).join('');
        } else {
            list.innerHTML = '<p class="text-xs text-gray-500 text-center py-2">لا يوجد أعضاء في فريقك حالياً.</p>';
        }
    } else {
        list.classList.add('hidden');
    }
};

// 💡 حماية الاستعلام من الأخطاء إذا كانت المتغيرات فارغة
window.loadAdminNotifications = async () => {
    const container = document.getElementById('admin-messages-list');
    if(!container) return;

    let myId = currentUserData?.id;
    let tId = currentTeamId || window.currentTeam?.team_id || window.currentTeam?.id;

    if (!myId) {
        const { data: u } = await supabase.auth.getUser();
        myId = u?.user?.id;
    }

    if (!myId && !tId) {
        container.innerHTML = '<div class="text-center py-10 text-gray-500 border border-white/5 border-dashed rounded-xl">لا يمكن تحميل الرسائل حالياً.</div>';
        return;
    }

    container.innerHTML = '<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-red-500 text-2xl"></i></div>';

    try {
        // بناء الاستعلام بشكل آمن لتجنب "undefined"
        let orQueries = [];
        if (myId) orQueries.push(`target_leader_id.eq.${myId}`);
        if (tId) orQueries.push(`target_team_id.eq.${tId}`);

        const { data, error } = await supabase.from('system_notifications')
            .select('*')
            .or(orQueries.join(','))
            .order('created_at', { ascending: false });

        if (error) throw error;
        adminMessagesCache = data || [];
        
        window.filterAdminMessages(false);
        window.filterAdminMessages(true);

    } catch (e) {
        console.error("Fetch Admin Notifs Error:", e);
        container.innerHTML = '<div class="text-center py-10 text-red-500">فشل في تحميل رسائل الإدارة.</div>';
    }
};

window.markAdminMessageAsRead = async (msgId) => {
    try {
        await supabase.from('system_notifications').update({ is_read: true }).eq('id', msgId);
        showToast("تم نقل الرسالة للأرشيف", "success");
        await window.loadAdminNotifications(); 
    } catch (e) {
        console.error(e);
        showToast("حدث خطأ", "error");
    }
};

// ==========================================
// 7. HELPERS
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