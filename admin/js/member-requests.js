import { supabase } from '../../js/supabase-config.js';

// ==========================================
// 🚀 RECRUITMENT & APPLICATIONS ENGINE
// ==========================================

let applicationsData = [];

// 💡 1. جلب التراكات الديناميكية لفلتر المسار الأكاديمي
window.fetchFilterTracks = async () => {
    try {
        const { data, error } = await supabase.from('tracks').select('id, name');
        if (error) throw error;
        const select = document.getElementById('app-filter-academic-track');
        if (select) {
            select.innerHTML = '<option value="all">المسار التقني: الكل</option>' + 
                (data || []).map(t => `<option value="${t.name}">${t.name}</option>`).join('');
        }
    } catch (err) {
        console.error("Error fetching tracks for filter:", err);
    }
};

// 2. جلب البيانات من الداتابيز
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
        if(tbody) tbody.innerHTML = `<tr><td colspan="7" class="p-10 text-center text-red-500">حدث خطأ أثناء جلب البيانات.</td></tr>`;
    }
};

// 3. تحديث الإحصائيات (بما فيها الأرشيف)
function updateAppStats() {
    document.getElementById('stat-total-apps').innerText = applicationsData.length;
    document.getElementById('stat-pending-apps').innerText = applicationsData.filter(a => a.application_status === 'pending').length;
    document.getElementById('stat-accepted-apps').innerText = applicationsData.filter(a => a.application_status === 'accepted').length;
    document.getElementById('stat-rejected-apps').innerText = applicationsData.filter(a => a.application_status === 'rejected').length;
    document.getElementById('stat-archived-apps').innerText = applicationsData.filter(a => a.application_status === 'archived').length;
}

// 4. الفلترة ورسم الجدول
window.filterApplications = () => {
    const search = document.getElementById('app-filter-search')?.value.toLowerCase() || '';
    const status = document.getElementById('app-filter-status')?.value || 'all';
    
    // 💡 الفلاتر الجديدة
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
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-10 text-center text-gray-500">لا توجد طلبات مطابقة للبحث.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(app => {
        const date = new Date(app.submitted_at).toLocaleDateString('en-GB');
        
        let statusBadge = '';
        if (app.application_status === 'accepted') statusBadge = '<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400">مقبول</span>';
        else if (app.application_status === 'rejected') statusBadge = '<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400">مرفوض</span>';
        else if (app.application_status === 'archived') statusBadge = '<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-gray-500/10 border border-gray-500/20 text-gray-400">مؤرشف</span>';
        else statusBadge = '<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">قيد المراجعة</span>';

        const trackMap = { 'content': 'Content', 'operations': 'Operations', 'academic': 'Academic' };

        return `
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
                        عرض التفاصيل
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// 5. فتح بيانات المتقدم بالكامل في الـ Modal (شاملة كافة البيانات)
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
    badge.innerText = app.application_status === 'accepted' ? 'مقبول' : app.application_status === 'rejected' ? 'مرفوض' : app.application_status === 'archived' ? 'مؤرشف' : 'قيد المراجعة';

    // Personal & Academic
    document.getElementById('modal-app-date').innerText = new Date(app.submitted_at).toLocaleString('en-GB');
    document.getElementById('modal-app-age').innerText = app.age || '--';
    document.getElementById('modal-app-gender').innerText = app.gender === 'Male' ? 'ذكر' : app.gender === 'Female' ? 'أنثى' : '--';
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
    const daysMap = { Sat:'السبت', Sun:'الأحد', Mon:'الاثنين', Tue:'الثلاثاء', Wed:'الأربعاء', Thu:'الخميس', Fri:'الجمعة' };
    daysDiv.innerHTML = (app.available_days || []).map(d => `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-gray-300 border border-white/5">${daysMap[d] || d}</span>`).join('');

    // Tech
    const trackMap = { 'content': 'Content Contributor', 'operations': 'Operations Track', 'academic': 'Academic Oversight' };
    document.getElementById('modal-app-general-track').innerText = trackMap[app.track] || app.track || '--';
    document.getElementById('modal-app-track').innerText = app.academic_track || 'لم يحدد';
    const icLevelMap = { studying: 'يدرسه حالياً / متقدم', started: 'بدأ في الأساسيات', curious: 'فضول وحماس للتعلم' };
    document.getElementById('modal-app-ic-level').innerText = icLevelMap[app.ic_interest_level] || app.ic_interest_level || '--';
    
    document.getElementById('modal-app-skills').innerHTML = (app.technical_background || []).map(s => `<span class="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">${s}</span>`).join('');

    // Q&A
    document.getElementById('modal-app-motivation').innerText = app.motivation_text || '--';
    document.getElementById('modal-app-contribution').innerText = app.contribution_text || '--';
    document.getElementById('modal-app-experience').innerText = app.experience_text || 'لا يوجد خبرات سابقة مرفقة.';

    // Notes
    document.getElementById('modal-internal-notes').value = app.internal_notes || '';

    // Show
    document.getElementById('applicant-details-modal').classList.remove('hidden');
};

// 6. اتخاذ القرار وتحديث الداتابيز (محدثة لدعم الإيميلات)
window.updateAppStatus = async (newStatus) => {
    const appId = document.getElementById('modal-current-app-id').value;
    const notes = document.getElementById('modal-internal-notes').value;
    if (!appId) return;

    // 💡 إذا كان القرار "قبول"، نفتح نافذة إدخال رابط الجروب أولاً ولا نحفظ فوراً
    if (newStatus === 'accepted') {
        document.getElementById('accept-group-link').value = '';
        document.getElementById('accept-extra-note').value = '';
        document.getElementById('accept-config-modal').classList.remove('hidden');
        
        // تجهيز زر الإرسال داخل النافذة
        document.getElementById('btn-confirm-accept').onclick = () => executeAcceptance(appId, notes);
        return;
    }

    // إذا كان رفض أو أرشفة، ينفذ الحفظ العادي
    executeStatusUpdate(appId, newStatus, notes);
};

// دالة تنفيذ القبول وإرسال الإيميل
async function executeAcceptance(appId, notes) {
    const groupLink = document.getElementById('accept-group-link').value.trim();
    const extraNote = document.getElementById('accept-extra-note').value.trim();
    const btn = document.getElementById('btn-confirm-accept');

    if (!groupLink) return window.showToast("يجب إدخال رابط الجروب!", "error");

    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
    btn.disabled = true;
try {
        // 1. جلب بيانات المتقدم لإرسال الإيميل له
        const app = applicationsData.find(a => a.id === appId);
        if (!app) throw new Error("بيانات المتقدم غير موجودة");

        // 2. تحديث حالة الطلب في قاعدة البيانات
        await executeStatusUpdate(appId, 'accepted', notes, false);

        // 3. إرسال إيميل القبول عبر EmailJS
        emailjs.init("ejz_KrYv1VtCu9DJq"); // ⚠️ نفس المفتاح العام السابق
        await emailjs.send(
            "service_chpckfz", // ✅ تم وضع الخدمة الخاصة بك
            "template_62mykgf", // ⚠️ انسخه من صفحة Templates للقالب الثاني
            {
                to_name: app.full_name,
                to_email: app.email,
                track_name: app.track === 'content' ? 'Content Contributor' : app.track,
                group_link: groupLink,
                extra_note: extraNote ? extraNote : 'مرحباً بك في فريقنا!'
            }
        );

        window.showToast("تم قبول العضو وإرسال الإيميل بنجاح!", "success");
        document.getElementById('accept-config-modal').classList.add('hidden');
        document.getElementById('applicant-details-modal').classList.add('hidden');
        await fetchApplications();

    } catch (err) {
        console.error(err);
        window.showToast("حدث خطأ أثناء القبول: " + err.message, "error");
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

// دالة التحديث الأساسية للداتابيز
async function executeStatusUpdate(appId, newStatus, notes, showMsg = true) {
    const { error } = await supabase.from('admin_applications').update({
        application_status: newStatus, internal_notes: notes, reviewed_at: new Date()
    }).eq('id', appId);

    if (error) throw error;
    if (showMsg) {
        window.showToast("تم التحديث بنجاح", "success");
        document.getElementById('applicant-details-modal').classList.add('hidden');
        await fetchApplications();
    }
}