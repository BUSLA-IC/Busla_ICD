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
        window.location.href = 'login.html';
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
        // 💡 جلب اسم المسار من جدول التراكات باستخدام الـ ID المخزن
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
        // حفظ الاسم في الكائن لاستخدامه في العرض
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

async function showFormView(requestData = null) { // 💡 جعل الدالة async
    document.getElementById('status-view').classList.add('hidden');
    document.getElementById('form-view').classList.remove('hidden');
    
    await loadAvailableTracks(); // 💡 ننتظر تحميل التراكات أولاً

    if (requestData) {
        isEditMode = true;
        document.getElementById('req-name').value = requestData.team_name || '';
        
        // 💡 استخدام team-track بدلاً من req-specialization القديم
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
        document.getElementById('btn-submit-req').innerText = "تحديث بيانات الطلب";
    } else {
        isEditMode = false;
    }
}

function showStatusView(request, daysLeft) {
    document.getElementById('form-view').classList.add('hidden');
    document.getElementById('status-view').classList.remove('hidden');

    document.getElementById('status-team-name').innerText = request.team_name;
    document.getElementById('status-logo').src = request.logo_url || '../assets/icons/icon.jpg';
    document.getElementById('sv-uni').innerText = request.university;
    document.getElementById('sv-gov').innerText = request.governorate;
    
    // 💡 عرض الاسم الفعلي للتراك بدلاً من الـ ID
    document.getElementById('sv-spec').innerText = request.display_specialization || request.specialization;
    
    document.getElementById('sv-size').innerText = `${request.expected_size} أفراد`;
    document.getElementById('sv-gpa').innerText = request.leader_gpa; 

    document.getElementById('status-countdown').innerText = `${daysLeft} يوم`;

    const badgeContainer = document.getElementById('status-badge-container');
    const headerBg = document.getElementById('status-header-bg');
    const rejectionAlert = document.getElementById('rejection-alert');
    const actionBtns = document.getElementById('action-buttons-container');

    if (request.status === 'pending') {
        badgeContainer.innerHTML = '<span class="bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 px-3 py-1 rounded-lg text-xs font-bold"><i class="fas fa-hourglass-half mr-1"></i> قيد المراجعة من الإدارة</span>';
        headerBg.style.background = 'linear-gradient(to right, #eab308, transparent)';
        rejectionAlert.classList.add('hidden');
        actionBtns.classList.remove('hidden');
    } 
    else if (request.status === 'rejected') {
        badgeContainer.innerHTML = '<span class="bg-red-500/20 text-red-500 border border-red-500/30 px-3 py-1 rounded-lg text-xs font-bold"><i class="fas fa-times-circle mr-1"></i> تم رفض الطلب</span>';
        headerBg.style.background = 'linear-gradient(to right, #ef4444, transparent)';
        
        rejectionAlert.classList.remove('hidden');
        document.getElementById('rejection-reason-text').innerText = request.rejection_reason || 'لم يتم كتابة سبب محدد.';
        actionBtns.classList.add('hidden');
    }
    else if (request.status === 'cancelled') {
        badgeContainer.innerHTML = '<span class="bg-gray-500/20 text-gray-400 border border-gray-500/30 px-3 py-1 rounded-lg text-xs font-bold"><i class="fas fa-ban mr-1"></i> قمت بإلغاء الطلب</span>';
        headerBg.style.background = 'linear-gradient(to right, #6b7280, transparent)';
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
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
    btn.disabled = true;

    const gpaVal = document.getElementById('req-gpa').value.trim();
    const formattedGpa = gpaVal + '%';

    // 💡 جلب القيمة من السلكتور الجديد
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
            showToast("تم تحديث الطلب بنجاح", "success");
        } else {
            const { error } = await supabase.from('team_requests').insert([requestData]);
            if (error) throw error;
            showToast("تم إرسال الطلب للإدارة بنجاح", "success");
        }

        setTimeout(() => location.reload(), 1500);

    } catch (error) {
        console.error(error);
        showToast("حدث خطأ أثناء الإرسال", "error");
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

// ==========================================
// 💡 نظام نافذة التأكيد المخصصة (Custom Confirm)
// ==========================================
window.showCustomConfirm = (title, message, onConfirmCallback) => {
    const modal = document.getElementById('custom-confirm-modal');
    const card = document.getElementById('custom-confirm-card');
    
    // تعيين النصوص
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerText = message;
    
    // إظهار النافذة مع أنيميشن الدخول
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
    }, 10);

    // دالة إغلاق النافذة
    const closeModal = () => {
        modal.classList.add('opacity-0');
        card.classList.remove('scale-100');
        card.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    };

    // ربط الأزرار
    document.getElementById('btn-confirm-no').onclick = closeModal;
    
    document.getElementById('btn-confirm-yes').onclick = () => {
        closeModal();
        if (onConfirmCallback) onConfirmCallback();
    };
};

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
    // 💡 استخدام النافذة المخصصة بدلاً من confirm() الخاصة بالمتصفح
    window.showCustomConfirm(
        "إلغاء الطلب الحالي",
        "هل أنت متأكد من إلغاء الطلب؟ لن تتمكن من التقديم لفريق جديد حتى مرور 30 يوم من تاريخ هذا الطلب.",
        async () => {
            try {
                const { error } = await supabase.from('team_requests').update({ status: 'cancelled' }).eq('id', currentRequestId);
                if (error) throw error;
                
                window.showToast("تم إلغاء الطلب بنجاح", "info");
                setTimeout(() => location.reload(), 1500);
            } catch (error) {
                console.error(error);
                window.showToast("حدث خطأ أثناء الإلغاء", "error");
            }
        }
    );
};
window.showToast = (msg, type = 'info') => {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-6 left-6 z-[9999] flex flex-col gap-3 pointer-events-none';
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
// 💡 جلب المسارات المتاحة لتأسيس الفريق
// =========================================================
async function loadAvailableTracks() {
    const trackSelect = document.getElementById('team-track');
    if (!trackSelect) return;

    trackSelect.innerHTML = '<option value="" disabled selected>جاري تحميل المسارات...</option>';

    try {
        const { data: tracks, error } = await supabase
            .from('tracks')
            .select('id, name')
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (tracks && tracks.length > 0) {
            trackSelect.innerHTML = '<option value="" disabled selected>-- اختر المسار التخصصي للفريق --</option>';
            tracks.forEach(track => {
                const option = document.createElement('option');
                option.value = track.id; // سيتم حفظ ID المسار في بيانات الفريق
                option.textContent = track.name;
                trackSelect.appendChild(option);
            });
        } else {
            trackSelect.innerHTML = '<option value="" disabled selected>لا توجد مسارات متاحة حالياً</option>';
        }
    } catch (err) {
        console.error("Error loading tracks:", err);
        trackSelect.innerHTML = '<option value="" disabled selected>خطأ في تحميل المسارات</option>';
    }
}