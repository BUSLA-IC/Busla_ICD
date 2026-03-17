import { supabase } from '../../js/supabase-config.js';

// ==========================================
// 🧠 STATE MANAGEMENT & CONFIGURATION
// ==========================================
let cmCurrentLevel = 'tracks'; 
let cmCurrentEditId = null; 
let rawData = [];
let filteredData = [];
let curriculumTree = [];

const LEVELS = {
    tracks: { pk: 'id', icon: 'fa-road text-b-primary', title: 'name' },
    phases: { pk: 'phase_id', icon: 'fa-layer-group text-purple-500', title: 'title' },
    courses: { pk: 'course_id', icon: 'fa-book text-blue-500', title: 'title' },
    course_materials: { pk: 'content_id', icon: 'fa-file-video text-red-500', title: 'title' },
    quizzes: { pk: 'quiz_id', icon: 'fa-clipboard-check text-yellow-500', title: 'title' },
    quiz_questions: { pk: 'id', icon: 'fa-question-circle text-orange-500', title: 'question_text' },
    projects: { pk: 'id', icon: 'fa-laptop-code text-emerald-500', title: 'title' }
};

document.addEventListener('DOMContentLoaded', () => {
    ensureDetailsModalExists();
    initContentManagement();
});

function initContentManagement() {
    const navBtns = document.querySelectorAll('.cm-nav-btn');
    
    // 💡 حلقة التكرار الصحيحة التي تحتوي على كل شيء بداخلها
    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // 1. إعادة تعيين الألوان لجميع الأزرار
            navBtns.forEach(b => { b.classList.remove('active', 'bg-white/10', 'text-white'); b.classList.add('text-gray-400'); });
            
            // 2. تفعيل الزر المضغوط
            const targetBtn = e.currentTarget;
            targetBtn.classList.add('active', 'bg-white/10', 'text-white');
            targetBtn.classList.remove('text-gray-400');
            
            // 3. تحديد المستوى الحالي (التاب)
            cmCurrentLevel = targetBtn.getAttribute('data-level');
            
            // 4. التحكم الذكي في زر الاستيراد (إخفاء وإظهار)
            const smartBtn = document.getElementById('btn-smart-import');
            const aiQuizBtn = document.getElementById('btn-ai-quiz');
            const aiProjectBtn = document.getElementById('btn-ai-project');
            if (smartBtn) {
                if (['tracks', 'phases', 'projects', 'quiz_questions', 'quizzes'].includes(cmCurrentLevel)) {
                    smartBtn.classList.add('hidden');
                    smartBtn.classList.remove('flex');
                } else {
                    smartBtn.classList.remove('hidden');
                    smartBtn.classList.add('flex');
                }
            }
            if (aiQuizBtn) {
                // 💡 إظهار الزر فقط في صفحة الاختبارات
                if (cmCurrentLevel === 'quizzes') {
                    aiQuizBtn.classList.remove('hidden'); aiQuizBtn.classList.add('flex');
                } else {
                    aiQuizBtn.classList.add('hidden'); aiQuizBtn.classList.remove('flex');
                }
            }
            // 5. تحميل البيانات أو عرض الواجهة الفارغة
            if (['media', 'bulk'].includes(cmCurrentLevel)) {
                if (typeof renderPlaceholderView === 'function') renderPlaceholderView();
            } else {
                window.cmResetFilters(false); 
                loadTableData(); 
            }
            if (aiProjectBtn) {
                // 💡 إظهار زر الذكاء الاصطناعي للمشاريع فقط في تبويبة المشاريع
                if (cmCurrentLevel === 'projects') { aiProjectBtn.classList.remove('hidden'); aiProjectBtn.classList.add('flex'); } 
                else { aiProjectBtn.classList.add('hidden'); aiProjectBtn.classList.remove('flex'); }
            }

        });
    }); // <-- إغلاق حلقة التكرار هنا بشكل صحيح

    // ربط حدث إرسال نموذج البيانات
    document.getElementById('cm-crud-form')?.addEventListener('submit', handleFormSubmit);

    // إضافة زر الفحص الشامل (Health Check)
    const actionRow = document.querySelector('.bg-b-surface .flex-wrap.gap-3');
    if(actionRow && !document.getElementById('btn-health-check')) {
        actionRow.insertAdjacentHTML('afterbegin', `
            <button id="btn-health-check" onclick="window.runHealthCheck()" class="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 font-bold px-5 py-2.5 rounded-xl border border-yellow-500/20 transition-all flex items-center gap-2">
                <i class="fas fa-stethoscope"></i> فحص المنهج
            </button>
        `);
    }

    buildDynamicFilters();
    loadTableData();
}

function getPrimaryKey() {
    return LEVELS[cmCurrentLevel]?.pk || 'id';
}

function generateSystemID(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
}

// ==========================================
// 🔍 ADVANCED DYNAMIC FILTER ENGINE (CASCADING)
// ==========================================
let hierarchyCache = null; // تخزين مؤقت للبيانات الهرمية لتقليل طلبات الداتابيز

async function fetchHierarchyData() {
    if (hierarchyCache) return hierarchyCache;
    const [tracks, phases, courses, contents, quizzes, projects] = await Promise.all([
        supabase.from('tracks').select('id, name').order('created_at'),
        supabase.from('phases').select('phase_id, title, track_id'),
        supabase.from('courses').select('course_id, title, phase_id'),
        supabase.from('course_materials').select('content_id, title, course_id, ref_quiz_id, ref_project_id'),
        supabase.from('quizzes').select('quiz_id, title'),
        supabase.from('projects').select('id, title')
    ]);
    hierarchyCache = { 
        tracks: tracks.data || [], 
        phases: phases.data || [], 
        courses: courses.data || [], 
        contents: contents.data || [], 
        quizzes: quizzes.data || [],
        projects: projects.data || []
    };
    return hierarchyCache;
}
async function buildDynamicFilters() {
    const container = document.getElementById('cm-dynamic-filters-container');
    if (!container) return;

    const hData = await fetchHierarchyData();
    
    // بناء واجهة الفلاتر (الحقول + القوائم المنسدلة)
    let selectsHtml = '';
    const inputClasses = "w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-b-primary outline-none transition-colors shadow-inner placeholder-gray-600";
    
    // إظهار قوائم الفلترة حسب المستوى الحالي
    if (['phases', 'courses', 'course_materials', 'quizzes', 'quiz_questions', 'projects'].includes(cmCurrentLevel)) {
        selectsHtml += `<select id="filter-track" class="${inputClasses}"><option value="all">🌍 كل المسارات (Tracks)</option>${hData.tracks.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}</select>`;
    }
    if (['courses', 'course_materials', 'quizzes', 'quiz_questions', 'projects'].includes(cmCurrentLevel)) {
        selectsHtml += `<select id="filter-phase" class="${inputClasses}"><option value="all">📚 كل المراحل (Phases)</option>${hData.phases.map(p => `<option value="${p.phase_id}">${p.title}</option>`).join('')}</select>`;
    }
    if (['course_materials', 'quizzes', 'quiz_questions', 'projects'].includes(cmCurrentLevel)) {
        selectsHtml += `<select id="filter-course" class="${inputClasses}"><option value="all">🎥 كل الكورسات (Courses)</option>${hData.courses.map(c => `<option value="${c.course_id}">${c.title}</option>`).join('')}</select>`;
    }
    if (['quizzes', 'quiz_questions', 'projects'].includes(cmCurrentLevel)) {
        selectsHtml += `<select id="filter-content" class="${inputClasses}"><option value="all">🎬 كل المحتويات (Contents)</option>${hData.contents.map(c => `<option value="${c.content_id}">${c.title}</option>`).join('')}</select>`;
    }
    if (['quiz_questions'].includes(cmCurrentLevel)) {
        selectsHtml += `<select id="filter-quiz" class="${inputClasses}"><option value="all">📝 كل الاختبارات (Quizzes)</option>${hData.quizzes.map(q => `<option value="${q.quiz_id}">${q.title}</option>`).join('')}</select>`;
    }

    // فلتر مخصص لأنواع الكورسات والمحتوى
    let typeFilter = '';
    if (cmCurrentLevel === 'courses') typeFilter = `<select id="filter-type" class="${inputClasses}"><option value="all">كل الأنواع</option><option value="youtube">يوتيوب</option><option value="custom">مخصص</option></select>`;
    if (cmCurrentLevel === 'course_materials') typeFilter = `<select id="filter-type" class="${inputClasses}"><option value="all">كل الأنواع</option><option value="video">فيديو</option><option value="section">سكشن</option><option value="quiz">اختبار</option><option value="project">مشروع</option><option value="resource">مورد</option></select>`;

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div class="relative"><i class="fas fa-heading absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs"></i><input type="text" id="filter-search-name" placeholder="بحث بالاسم أو العنوان..." class="${inputClasses} pr-8"></div>
            <div class="relative"><i class="fas fa-align-left absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs"></i><input type="text" id="filter-search-desc" placeholder="بحث بالوصف..." class="${inputClasses} pr-8"></div>
            <div class="relative"><i class="fas fa-hashtag absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs"></i><input type="text" id="filter-search-id" placeholder="بحث بالـ ID..." class="${inputClasses} pr-8 font-mono"></div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            ${selectsHtml}
            ${typeFilter}
        </div>
    `;

    // تفعيل التحديث التلقائي الهرمي (Cascading)
    document.getElementById('filter-track')?.addEventListener('change', (e) => updateCascadingFilters('track', e.target.value, hData));
    document.getElementById('filter-phase')?.addEventListener('change', (e) => updateCascadingFilters('phase', e.target.value, hData));
    document.getElementById('filter-course')?.addEventListener('change', (e) => updateCascadingFilters('course', e.target.value, hData));
    document.getElementById('filter-content')?.addEventListener('change', (e) => updateCascadingFilters('content', e.target.value, hData));

    // ربط الأحداث لتطبيق الفلاتر
    ['filter-search-name', 'filter-search-desc', 'filter-search-id', 'filter-status', 'filter-track', 'filter-phase', 'filter-course', 'filter-content', 'filter-quiz', 'filter-type', 'filter-date-from', 'filter-date-to'].forEach(id => {
        const el = document.getElementById(id);
        if(el) { el.addEventListener('input', applyFilters); el.addEventListener('change', applyFilters); }
    });
}

// دالة لتحديث القوائم المنسدلة بناءً على الاختيار الأب (Cascading)
function updateCascadingFilters(level, value, hData) {
    if (level === 'track') {
        const phaseSelect = document.getElementById('filter-phase');
        if(phaseSelect) {
            const phases = value === 'all' ? hData.phases : hData.phases.filter(p => String(p.track_id) === String(value));
            phaseSelect.innerHTML = `<option value="all">📚 كل المراحل (Phases)</option>` + phases.map(p => `<option value="${p.phase_id}">${p.title}</option>`).join('');
            phaseSelect.value = 'all'; // Reset child
            updateCascadingFilters('phase', 'all', hData); // Cascade down
        }
    } else if (level === 'phase') {
        const courseSelect = document.getElementById('filter-course');
        if(courseSelect) {
            const courses = value === 'all' ? hData.courses : hData.courses.filter(c => String(c.phase_id) === String(value));
            courseSelect.innerHTML = `<option value="all">🎥 كل الكورسات (Courses)</option>` + courses.map(c => `<option value="${c.course_id}">${c.title}</option>`).join('');
            courseSelect.value = 'all'; 
            updateCascadingFilters('course', 'all', hData);
        }
    } else if (level === 'course') {
        const contentSelect = document.getElementById('filter-content');
        if(contentSelect) {
            const contents = value === 'all' ? hData.contents : hData.contents.filter(c => String(c.course_id) === String(value));
            contentSelect.innerHTML = `<option value="all">🎬 كل المحتويات (Contents)</option>` + contents.map(c => `<option value="${c.content_id}">${c.title}</option>`).join('');
            contentSelect.value = 'all';
            updateCascadingFilters('content', 'all', hData);
        }
    } else if (level === 'content') {
        const quizSelect = document.getElementById('filter-quiz');
        if(quizSelect) {
            // إذا اخترنا محتوى محدد، نظهر الـ Quiz المرتبط به فقط
            const selectedContent = hData.contents.find(c => String(c.content_id) === String(value));
            const quizzes = (selectedContent && selectedContent.ref_quiz_id) ? hData.quizzes.filter(q => String(q.quiz_id) === String(selectedContent.ref_quiz_id)) : hData.quizzes;
            quizSelect.innerHTML = `<option value="all">📝 كل الاختبارات (Quizzes)</option>` + quizzes.map(q => `<option value="${q.quiz_id}">${q.title}</option>`).join('');
            quizSelect.value = 'all';
        }
    }
    applyFilters();
}

window.cmResetFilters = (reload = true) => {
    ['filter-search-name', 'filter-search-desc', 'filter-search-id', 'filter-date-from', 'filter-date-to'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; });
    ['filter-status', 'filter-track', 'filter-phase', 'filter-course', 'filter-content', 'filter-quiz', 'filter-type'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = 'all'; });
    
    // إعادة بناء القوائم المنسدلة للوضع الأصلي
    if(hierarchyCache) updateCascadingFilters('track', 'all', hierarchyCache);
    if(reload) applyFilters();
};

function applyFilters() {
    const searchName = document.getElementById('filter-search-name')?.value.toLowerCase() || '';
    const searchDesc = document.getElementById('filter-search-desc')?.value.toLowerCase() || '';
    const searchId = document.getElementById('filter-search-id')?.value.toLowerCase() || '';
    
    const trackVal = document.getElementById('filter-track')?.value || 'all';
    const phaseVal = document.getElementById('filter-phase')?.value || 'all';
    const courseVal = document.getElementById('filter-course')?.value || 'all';
    const contentVal = document.getElementById('filter-content')?.value || 'all';
    const quizVal = document.getElementById('filter-quiz')?.value || 'all';
    const typeVal = document.getElementById('filter-type')?.value || 'all';
    
    const statusVal = document.getElementById('filter-status')?.value || 'all';
    const dateFrom = document.getElementById('filter-date-from')?.value;
    const dateTo = document.getElementById('filter-date-to')?.value;

    filteredData = rawData.filter(item => {
        // 1. Text Searches
        const titleKey = LEVELS[cmCurrentLevel]?.title || 'title';
        const pk = getPrimaryKey();
        
        const itemName = String(item[titleKey] || item.name || '').toLowerCase();
        const itemDesc = String(item.description || '').toLowerCase();
        const itemId = String(item[pk] || '').toLowerCase();

        if (searchName && !itemName.includes(searchName)) return false;
        if (searchDesc && !itemDesc.includes(searchDesc)) return false;
        if (searchId && !itemId.includes(searchId)) return false;

        // 2. Type & Status & Date
        if (typeVal !== 'all' && String(item.type) !== typeVal) return false;
        const isActiveField = item.hasOwnProperty('status') ? item.status : item.is_active;
        if (statusVal !== 'all' && String(isActiveField) !== statusVal) return false;
        
        if (item.created_at) {
            const itemDate = new Date(item.created_at);
            if (dateFrom && itemDate < new Date(dateFrom)) return false;
            if (dateTo) { const toD = new Date(dateTo); toD.setHours(23, 59, 59); if (itemDate > toD) return false; }
        }

        // 3. Hierarchical Filters (Reverse Mapping using Cache)
        let itemTrackId = null, itemPhaseId = null, itemCourseId = null, itemContentId = null, itemQuizId = null;

        if (hierarchyCache) {
            if (cmCurrentLevel === 'tracks') { itemTrackId = item.id; }
            else if (cmCurrentLevel === 'phases') { itemPhaseId = item.phase_id; itemTrackId = item.track_id; }
            else if (cmCurrentLevel === 'courses') { 
                itemCourseId = item.course_id; itemPhaseId = item.phase_id;
                const parentPhase = hierarchyCache.phases.find(p => p.phase_id === itemPhaseId);
                itemTrackId = parentPhase?.track_id;
            }
            else if (cmCurrentLevel === 'course_materials') {
                itemContentId = item.content_id; itemCourseId = item.course_id;
                const parentCourse = hierarchyCache.courses.find(c => c.course_id === itemCourseId);
                itemPhaseId = parentCourse?.phase_id;
                const parentPhase = hierarchyCache.phases.find(p => p.phase_id === itemPhaseId);
                itemTrackId = parentPhase?.track_id;
            }
            else if (cmCurrentLevel === 'quizzes' || cmCurrentLevel === 'quiz_questions') {
                itemQuizId = item.quiz_id || item.id; // quiz_questions has quiz_id
                if(cmCurrentLevel === 'quizzes') itemQuizId = item.quiz_id;
                
                // البحث العكسي: إيجاد المحتوى الذي يرتبط بهذا الكويز
                const relatedContent = hierarchyCache.contents.find(c => String(c.ref_quiz_id) === String(itemQuizId));
                if (relatedContent) {
                    itemContentId = relatedContent.content_id; itemCourseId = relatedContent.course_id;
                    const parentCourse = hierarchyCache.courses.find(c => c.course_id === itemCourseId);
                    itemPhaseId = parentCourse?.phase_id;
                    const parentPhase = hierarchyCache.phases.find(p => p.phase_id === itemPhaseId);
                    itemTrackId = parentPhase?.track_id;
                }
            }
            else if (cmCurrentLevel === 'projects') {
                const relatedContent = hierarchyCache.contents.find(c => String(c.ref_project_id) === String(item.id));
                if (relatedContent) {
                    itemContentId = relatedContent.content_id; itemCourseId = relatedContent.course_id;
                    const parentCourse = hierarchyCache.courses.find(c => c.course_id === itemCourseId);
                    itemPhaseId = parentCourse?.phase_id;
                    const parentPhase = hierarchyCache.phases.find(p => p.phase_id === itemPhaseId);
                    itemTrackId = parentPhase?.track_id;
                }
            }
        }

        // تطبيق الفلتر الهرمي
        if (trackVal !== 'all' && String(itemTrackId) !== trackVal) return false;
        if (phaseVal !== 'all' && String(itemPhaseId) !== phaseVal) return false;
        if (courseVal !== 'all' && String(itemCourseId) !== courseVal) return false;
        if (contentVal !== 'all' && String(itemContentId) !== contentVal) return false;
        if (quizVal !== 'all' && String(itemQuizId) !== quizVal) return false;

        return true;
    });
    renderTable(); 
}


// ==========================================
// 📊 DATA FETCH & RENDER
// ==========================================
async function loadTableData() {
    await buildDynamicFilters();
    const tbody = document.getElementById('cm-table-body');
    const thead = document.getElementById('cm-table-head');
    
    tbody.innerHTML = `<tr><td colspan="10" class="p-10 text-center"><i class="fas fa-spinner fa-spin text-b-primary text-2xl"></i></td></tr>`;

    try {
        let query;
        if (cmCurrentLevel === 'tracks') {
            thead.innerHTML = `<tr><th class="p-4 w-10">#</th><th class="p-4">اسم المسار (Track)</th><th class="p-4 text-center">التاريخ</th><th class="p-4 text-center">الحالة</th><th class="p-4 text-center">إجراءات</th></tr>`;
            query = supabase.from('tracks').select('*').order('created_at', { ascending: false });
        } else if (cmCurrentLevel === 'phases') {
            thead.innerHTML = `<tr><th class="p-4 w-10">#</th><th class="p-4">المرحلة (Phase)</th><th class="p-4 text-center">المسار المرتبط</th><th class="p-4 text-center">الحالة</th><th class="p-4 text-center">إجراءات</th></tr>`;
            query = supabase.from('phases').select('*, tracks(name)').order('created_at', { ascending: false });
        } else if (cmCurrentLevel === 'courses') {
            thead.innerHTML = `<tr><th class="p-4 w-10">#</th><th class="p-4">الكورس (Course)</th><th class="p-4 text-center">المرحلة المرتبطة</th><th class="p-4 text-center">النوع</th><th class="p-4 text-center">الحالة</th><th class="p-4 text-center">إجراءات</th></tr>`;
            query = supabase.from('courses').select('*, phases(title)').order('created_at', { ascending: false });
        } else if (cmCurrentLevel === 'course_materials') {
            thead.innerHTML = `<tr><th class="p-4 w-10">#</th><th class="p-4">المحتوى (Content)</th><th class="p-4 text-center">الكورس المرتبط</th><th class="p-4 text-center">النوع</th><th class="p-4 text-center">الترتيب</th><th class="p-4 text-center">الحالة</th><th class="p-4 text-center">إجراءات</th></tr>`;
            query = supabase.from('course_materials').select('*, courses(title)').order('order_index', { ascending: true });
        } else if (cmCurrentLevel === 'quizzes') {
            thead.innerHTML = `<tr><th class="p-4 w-10">#</th><th class="p-4">عنوان الاختبار (Quiz)</th><th class="p-4 text-center">أقصى نقاط</th><th class="p-4 text-center">درجة النجاح</th><th class="p-4 text-center">إجراءات</th></tr>`;
            query = supabase.from('quizzes').select('*').order('created_at', { ascending: false });
        } else if (cmCurrentLevel === 'quiz_questions') {
            thead.innerHTML = `<tr><th class="p-4 w-10">#</th><th class="p-4">السؤال (Question)</th><th class="p-4 text-center">الاختبار المرتبط</th><th class="p-4 text-center">الإجابة الصحيحة</th><th class="p-4 text-center">إجراءات</th></tr>`;
            query = supabase.from('quiz_questions').select('*, quizzes(title)').order('created_at', { ascending: false });
        } else if (cmCurrentLevel === 'projects') {
            thead.innerHTML = `<tr><th class="p-4 w-10">#</th><th class="p-4">عنوان المشروع (Project)</th><th class="p-4 text-center">أقصى نقاط</th><th class="p-4 text-center">طريقة التسليم</th><th class="p-4 text-center">إجراءات</th></tr>`;
            query = supabase.from('projects').select('*').order('created_at', { ascending: false });
        }

        const { data, error } = await query;
        if (error) throw error; 
        rawData = data || [];

        // 💡 التعديل الجذري لضمان عمل الفلترة فوراً بعد تحميل البيانات بشكل دقيق
        if (window.pendingDrillDown) {
            const { filterId, value, cascade } = window.pendingDrillDown;
            const dropdown = document.getElementById(filterId);
            if (dropdown) {
                dropdown.value = value; // تعيين قيمة الفلتر
                if (typeof hierarchyCache !== 'undefined' && hierarchyCache) {
                    // تحديث باقي الفلاتر (Cascading) واستدعاء applyFilters تلقائياً
                    updateCascadingFilters(cascade, value, hierarchyCache);
                }
            }
            window.pendingDrillDown = null; // تفريغ الطلب بعد تنفيذه
        } else {
            applyFilters();
        }

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="10" class="p-10 text-center text-red-500">Error: ${err.message}</td></tr>`;
    }
}

function renderTable() {
    const tbody = document.getElementById('cm-table-body');
    if (filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-10 text-center text-gray-500">لا توجد بيانات مطابقة للبحث أو لم يتم الإضافة بعد.</td></tr>`;
        return;
    }

    tbody.innerHTML = filteredData.map((item, index) => {
        const pk = getPrimaryKey();
        const id = item[pk];
        const titleKey = LEVELS[cmCurrentLevel].title;
        const title = item[titleKey] || item.name;
        const icon = LEVELS[cmCurrentLevel].icon;
        
        const isActive = item.hasOwnProperty('is_active') ? item.is_active : item.status;
        const statusHtml = isActive === undefined ? '-' : isActive ? '<span class="bg-green-500/10 border border-green-500/20 text-green-400 px-2 py-1 rounded text-xs font-bold">مفعل</span>' : '<span class="bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-1 rounded text-xs font-bold">معطل</span>';

        let middleColumn = '';
        if (cmCurrentLevel === 'tracks') middleColumn = `<td class="p-4 text-center text-xs font-mono text-gray-500">${new Date(item.created_at).toLocaleDateString()}</td><td class="p-4 text-center">${statusHtml}</td>`;
        if (cmCurrentLevel === 'phases') middleColumn = `<td class="p-4 text-center text-xs text-purple-400 font-bold bg-white/5 rounded-lg border border-white/5">${item.tracks?.name || 'بدون مسار'}</td><td class="p-4 text-center">${statusHtml}</td>`;
        if (cmCurrentLevel === 'courses') middleColumn = `<td class="p-4 text-center text-xs text-blue-400 font-bold bg-white/5 rounded-lg border border-white/5">${item.phases?.title || 'بدون مرحلة'}</td><td class="p-4 text-center text-xs font-bold text-gray-400 uppercase">${item.type || '-'}</td><td class="p-4 text-center">${statusHtml}</td>`;
        if (cmCurrentLevel === 'course_materials') middleColumn = `<td class="p-4 text-center text-xs text-red-400 font-bold bg-white/5 rounded-lg border border-white/5">${item.courses?.title || 'بدون كورس'}</td><td class="p-4 text-center text-xs font-bold text-gray-400 uppercase">${item.type}</td><td class="p-4 text-center font-mono text-yellow-500">${item.order_index || 0}</td><td class="p-4 text-center">${statusHtml}</td>`;
        if (cmCurrentLevel === 'quizzes') middleColumn = `<td class="p-4 text-center text-xs font-mono text-yellow-500">${item.max_xp}</td><td class="p-4 text-center text-xs font-mono">${item.passing_score}</td>`;
        if (cmCurrentLevel === 'quiz_questions') middleColumn = `<td class="p-4 text-center text-xs text-orange-400 font-bold bg-white/5 rounded-lg border border-white/5">${item.quizzes?.title || 'بدون اختبار'}</td><td class="p-4 text-center text-xs font-bold text-green-500">${item.correct_answer}</td>`;
        if (cmCurrentLevel === 'projects') middleColumn = `<td class="p-4 text-center text-xs font-mono text-yellow-500">${item.max_points}</td><td class="p-4 text-center text-xs">${item.submission_method || '-'}</td>`;

        let drillDownBtn = '';
        if (['tracks', 'phases', 'courses', 'quizzes'].includes(cmCurrentLevel)) {
            drillDownBtn = `<button onclick="window.cmViewDetails('${id}')" class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all" title="استعراض المحتوى الداخلي"><i class="fas fa-folder-open text-xs"></i></button>`;
        }

        return `
            <tr class="hover:bg-white/5 transition-colors border-b border-white/5 group">
                <td class="p-4 text-center text-gray-500">${index + 1}</td>
                <td class="p-4">
                    <div class="flex flex-col">
                        <span class="font-bold text-white text-sm truncate max-w-xs"><i class="fas ${icon} mr-2 opacity-70"></i> ${title}</span>
                        <span class="text-[10px] font-mono text-gray-500 mt-1">ID: ${id}</span>
                    </div>
                </td>
                ${middleColumn}
                <td class="p-4 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="window.cmShowInfo('${id}')" class="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all" title="عرض التفاصيل"><i class="fas fa-info-circle text-xs"></i></button>
                        ${drillDownBtn}
                        <button onclick="window.cmEditItem('${id}')" class="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white transition-all" title="تعديل"><i class="fas fa-pen text-xs"></i></button>
                        <button onclick="window.cmDeleteItem('${id}')" class="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all" title="حذف"><i class="fas fa-trash text-xs"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ==========================================
// 🚀 TREE VIEW & HEALTH CHECK ENGINE
// ==========================================
window.cmSwitchView = async (view) => {
    const isGrid = view === 'grid';
    document.getElementById('cm-view-tree').classList.toggle('hidden', isGrid);
    document.getElementById('cm-view-grid').classList.toggle('hidden', !isGrid);
    document.getElementById('btn-view-grid').className = isGrid ? 'px-4 py-1.5 rounded text-xs font-bold bg-white/10 text-white' : 'px-4 py-1.5 rounded text-xs font-bold text-gray-500 hover:text-white';
    document.getElementById('btn-view-tree').className = !isGrid ? 'px-4 py-1.5 rounded text-xs font-bold bg-white/10 text-white' : 'px-4 py-1.5 rounded text-xs font-bold text-gray-500 hover:text-white';

    if (!isGrid) {
        document.getElementById('cm-view-tree').innerHTML = '<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-2xl text-b-primary"></i></div>';
        await loadAndBuildTree();
    }
};

async function loadAndBuildTree() {
    try {
        const [tracksRes, phasesRes, coursesRes, materialsRes] = await Promise.all([
            supabase.from('tracks').select('id, name, is_active'),
            supabase.from('phases').select('phase_id, title, track_id, is_active'),
            supabase.from('courses').select('course_id, title, phase_id, is_active'),
            supabase.from('course_materials').select('content_id, title, course_id, type, order_index, status')
        ]);

        curriculumTree = buildCurriculumTree(tracksRes.data, phasesRes.data, coursesRes.data, materialsRes.data);
        renderTreeViewHTML();
    } catch (err) {
        document.getElementById('cm-view-tree').innerHTML = `<div class="text-red-500 text-center p-6">خطأ في بناء الشجرة: ${err.message}</div>`;
    }
}

function buildCurriculumTree(tracks, phases, courses, materials) {
    const tree = [];
    const phaseMap = {};
    const courseMap = {};

    const trackMap = (tracks||[]).reduce((acc, track) => {
        acc[track.id] = { ...track, type: 'track', phases: [] };
        tree.push(acc[track.id]);
        return acc;
    }, {});

    (phases||[]).forEach(phase => {
        phaseMap[phase.phase_id] = { ...phase, type: 'phase', courses: [] };
        if (trackMap[phase.track_id]) trackMap[phase.track_id].phases.push(phaseMap[phase.phase_id]);
    });

    (courses||[]).forEach(course => {
        courseMap[course.course_id] = { ...course, type: 'course', materials: [] };
        if (phaseMap[course.phase_id]) phaseMap[course.phase_id].courses.push(courseMap[course.course_id]);
    });

    (materials||[]).sort((a, b) => a.order_index - b.order_index).forEach(material => {
        if (courseMap[material.course_id]) courseMap[material.course_id].materials.push({ ...material, type: 'material' });
    });

    return tree;
}

// ==========================================
// 🚀 ROADMAP & CURRICULUM TREE VIEW
// ==========================================
function renderTreeViewHTML() {
    const container = document.getElementById('cm-view-tree');
    if (curriculumTree.length === 0) {
        container.innerHTML = '<div class="text-center py-10 text-gray-500 font-bold border border-dashed border-white/10 rounded-xl bg-black/20">لا توجد بيانات منهجية متاحة. قم بإضافة مسار (Track) للبدء.</div>';
        return;
    }

    let html = '<div class="space-y-12 p-2 dir-ltr text-left">';
    
    curriculumTree.forEach(track => {
        const trackStatus = track.is_active 
            ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20 uppercase tracking-widest ml-3">Active</span>' 
            : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-widest ml-3">Draft</span>';

        html += `
        <div>
            <div class="flex items-center mb-8 border-b border-white/5 pb-4">
                <div class="w-12 h-12 rounded-xl bg-b-primary/20 text-b-primary flex items-center justify-center text-xl shadow-[0_0_15px_rgba(0,106,103,0.3)] mr-4 shrink-0">
                    <i class="fas fa-road"></i>
                </div>
                <div>
                    <h2 class="text-2xl font-black text-white flex items-center">${track.name} ${trackStatus}</h2>
                    <span class="text-xs text-gray-500 font-mono">Track ID: ${String(track.id).split('-')[0]} | ${track.phases.length} Phases</span>
                </div>
            </div>
            
            <div class="ml-4 md:ml-6">
        `;

        if (track.phases.length === 0) {
            html += `<div class="text-xs text-yellow-500/70 italic mb-8 p-3 border border-yellow-500/20 bg-yellow-500/5 rounded-lg">No phases added to this track yet.</div>`;
        }

        track.phases.forEach(phase => {
            const phaseStatus = phase.is_active 
                ? '<span class="text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20 uppercase ml-2">Active</span>' 
                : '<span class="text-[9px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20 uppercase ml-2">Draft</span>';

            html += `
                <div class="mb-8 border-l-4 border-white/10 pl-6 relative transition-all">
                    
                    <div class="absolute -left-[14px] top-0 w-5 h-5 bg-b-primary rounded-full border-4 border-black box-content shadow-[0_0_10px_rgba(0,106,103,0.5)]"></div>
                    
                    <div class="flex items-center justify-between mb-5 select-none group cursor-pointer" 
                         onclick="this.nextElementSibling.classList.toggle('hidden'); const i = this.querySelector('.fa-chevron-down'); if(i) i.classList.toggle('rotate-180');">
                        <div class="flex-1">
                            <h3 class="font-bold text-xl text-white group-hover:text-b-primary transition-colors flex items-center">
                                ${phase.title} ${phaseStatus}
                            </h3>
                            <div class="flex items-center gap-3 mt-1">
                                <span class="text-xs text-gray-400 font-mono">ID: ${phase.phase_id}</span>
                                <span class="text-xs text-blue-400"><i class="fas fa-book mr-1"></i> ${phase.courses.length} Courses</span>
                            </div>
                        </div>
                        <div class="p-2 hover:bg-white/10 rounded-full transition-all">
                            <i class="fas fa-chevron-down text-white transition-transform duration-300"></i>
                        </div>
                    </div>
                    
                    <div class="space-y-4">
            `;

            if (phase.courses.length === 0) {
                html += `<div class="text-sm text-gray-600 italic pl-2 border border-dashed border-white/5 rounded-lg p-3 bg-black/20">No courses in this phase.</div>`;
            }

            phase.courses.forEach(course => {
                const courseStatusIcon = course.is_active 
                    ? '<i class="fas fa-check-circle text-green-400 text-xl" title="Active"></i>' 
                    : '<i class="fas fa-times-circle text-gray-600 text-xl" title="Draft"></i>';

                const hasMaterials = course.materials.length > 0;

                html += `
                        <div class="rounded-xl overflow-hidden border-2 border-white/10 bg-black/40 hover:border-white/30 transition-all duration-300 shadow-sm">
                            <div class="p-4 flex items-center justify-between cursor-pointer select-none" 
                                 onclick="this.nextElementSibling.classList.toggle('hidden'); const i = this.querySelector('.fa-chevron-down'); if(i) i.classList.toggle('rotate-180');">
                                
                                <div class="flex items-center gap-4 overflow-hidden flex-1">
                                    <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-black/40 border border-white/10 shrink-0 text-lg shadow-inner">
                                        ${courseStatusIcon}
                                    </div>
                                    <div class="truncate flex-1">
                                        <h4 class="font-bold text-base text-white truncate">${course.title}</h4>
                                        <div class="flex items-center gap-3 mt-1">
                                            <span class="text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded border border-white/5 font-mono uppercase tracking-wider">${course.type || 'Course'}</span>
                                            <span class="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20"><i class="fas fa-sitemap mr-1"></i>${course.materials.length} Materials</span>
                                        </div>
                                    </div>
                                </div>

                                <div class="flex items-center gap-2 pl-2">
                                    <div class="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors text-gray-400">
                                        <i class="fas fa-chevron-down transition-transform duration-300"></i>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="hidden bg-black/60 border-t border-white/5 p-3 space-y-2">
                `;

                if (!hasMaterials) {
                    html += `<div class="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">Empty course. Add materials to publish.</div>`;
                }

                course.materials.forEach(mat => {
                    const icon = mat.type === 'video' ? 'fa-play' : mat.type === 'quiz' ? 'fa-clipboard-list' : mat.type === 'project' ? 'fa-laptop-code' : 'fa-link';
                    const iconColor = mat.type === 'video' ? 'text-red-400' : mat.type === 'quiz' ? 'text-yellow-400' : mat.type === 'project' ? 'text-emerald-400' : 'text-blue-400';
                    const matStatus = mat.status ? '<i class="fas fa-check text-green-400 text-sm"></i>' : '<i class="fas fa-eye-slash text-gray-600 text-sm" title="Draft"></i>';

                    html += `
                                <div class="flex items-center justify-between p-3 rounded-lg border border-white/5 hover:bg-white/5 transition-colors bg-b-surface md:mr-4 mr-0">
                                    <div class="flex items-center gap-3 flex-1 overflow-hidden">
                                        <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-black/40 border border-white/10 shrink-0">
                                            <i class="fas ${icon} ${iconColor} text-sm"></i>
                                        </div>
                                        <div class="truncate flex-1 pr-2">
                                            <h5 class="font-bold text-sm text-gray-200 truncate">${mat.title}</h5>
                                            <div class="flex items-center gap-2 mt-0.5">
                                                <span class="text-[9px] text-gray-500 font-mono bg-black/50 px-1 rounded">Idx: ${mat.order_index}</span>
                                                ${mat.base_xp > 0 ? `<span class="text-[9px] text-yellow-500 font-bold"><i class="fas fa-star text-[8px]"></i> ${mat.base_xp} XP</span>` : ''}
                                                <span class="text-[8px] font-bold text-gray-500 uppercase tracking-widest">${mat.type}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="pl-3 border-l border-white/10 flex justify-center items-center shrink-0 w-8">
                                        ${matStatus}
                                    </div>
                                </div>
                    `;
                });

                html += `
                            </div>
                        </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        html += `
            </div>
        </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

window.runHealthCheck = async () => {
    if(curriculumTree.length === 0) await loadAndBuildTree();
    const issues = [];
    
    curriculumTree.forEach(track => {
        if (track.phases.length === 0) issues.push({ level: 'Track', name: track.name, severity: 'warning', msg: 'Has no phases connected.' });
        track.phases.forEach(phase => {
            if (phase.courses.length === 0) issues.push({ level: 'Phase', name: phase.title, severity: 'warning', msg: 'Has no courses inside.' });
            phase.courses.forEach(course => {
                if (course.materials.length === 0) issues.push({ level: 'Course', name: course.title, severity: 'critical', msg: 'Zero content. Will crash student player.' });
                course.materials.forEach(mat => {
                    if (mat.type === 'video' && !mat.video_id) issues.push({ level: 'Material', name: mat.title, severity: 'error', msg: 'Video material is missing YouTube ID.' });
                });
            });
        });
    });

    let html = `<h3 class="text-lg font-bold mb-4 text-white">نتائج الفحص الشامل (Health Check)</h3><ul class="space-y-2 dir-ltr text-left">`;
    if(issues.length === 0) {
        html += `<li class="text-green-500 bg-green-500/10 p-4 rounded-xl border border-green-500/20 font-bold"><i class="fas fa-check-circle mr-2"></i> المنهج سليم 100% ولا توجد أخطاء هيكلية!</li>`;
    } else {
        issues.forEach(iss => {
            const color = iss.severity === 'critical' ? 'text-red-500 bg-red-500/10 border-red-500/20' : iss.severity === 'error' ? 'text-orange-500 bg-orange-500/10 border-orange-500/20' : 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
            html += `<li class="text-sm p-3 rounded-lg border ${color}"><span class="font-bold uppercase tracking-wider mr-2">[${iss.severity}]</span> ${iss.level} <b>"${iss.name}"</b>: ${iss.msg}</li>`;
        });
    }
    html += `</ul>`;
    
    document.getElementById('cm-details-content').innerHTML = html;
    document.getElementById('cm-details-modal').classList.remove('hidden');
};

// ==========================================
// 🚀 DRILL-DOWN NAVIGATION & INFO MODAL
// ==========================================
window.cmViewDetails = (id) => {
    const sourceLevel = cmCurrentLevel;
    let targetTab = '';
    let filterIdToSet = '';
    let cascadeLevel = '';

    // تحديد التاب الهدف، واسم الفلتر الذي سيتم تعبئته، ومستوى الفلترة الهرمية
    if (sourceLevel === 'tracks') { 
        targetTab = 'phases'; 
        filterIdToSet = 'filter-track'; 
        cascadeLevel = 'track'; 
    }
    else if (sourceLevel === 'phases') { 
        targetTab = 'courses'; 
        filterIdToSet = 'filter-phase'; 
        cascadeLevel = 'phase'; 
    }
    else if (sourceLevel === 'courses') { 
        targetTab = 'course_materials'; 
        filterIdToSet = 'filter-course'; 
        cascadeLevel = 'course'; 
    }
    else if (sourceLevel === 'quizzes') { 
        targetTab = 'quiz_questions'; 
        filterIdToSet = 'filter-quiz'; 
        cascadeLevel = 'quiz'; 
    }
    
    if (targetTab) {
        // 💡 تسجيل طلب الفلترة في المتغير العام ليتم تنفيذه بدقة بعد انتهاء التحميل
        window.pendingDrillDown = {
            filterId: filterIdToSet,
            value: id,
            cascade: cascadeLevel
        };

        // الانتقال للتاب (الجدول) الخاص بالمحتوى الداخلي
        document.querySelector(`[data-level="${targetTab}"]`).click(); 
        
        if (typeof window.showToast === 'function') {
            window.showToast("جاري فتح وتصفية المحتوى المرتبط...", "info"); 
        }
    }
};
window.cmShowInfo = (id) => {
    const item = rawData.find(r => String(r[getPrimaryKey()]) === String(id));
    if (!item) return;

    let html = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 dir-ltr text-left">';
    for (const [key, value] of Object.entries(item)) {
        if(typeof value === 'object' && value !== null && !Array.isArray(value)) continue; 
        
        let displayValue = value;
        if(value === null || value === '') displayValue = '<span class="text-gray-600">Null/Empty</span>';
        else if (typeof value === 'boolean') displayValue = value ? '<span class="text-green-400">True</span>' : '<span class="text-red-400">False</span>';
        else if (Array.isArray(value)) displayValue = value.join(', ');

        html += `
            <div class="bg-black/50 p-4 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                <span class="block text-[10px] text-gray-500 uppercase tracking-widest mb-1 font-bold">${key.replace(/_/g, ' ')}</span>
                <span class="block text-sm font-bold text-white break-words">${displayValue}</span>
            </div>
        `;
    }
    html += '</div>';
    document.getElementById('cm-details-content').innerHTML = html;
    document.getElementById('cm-details-modal').classList.remove('hidden');
};

function ensureDetailsModalExists() {
    if (!document.getElementById('cm-details-modal')) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="cm-details-modal" class="fixed inset-0 z-[400] hidden bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity">
                <div class="bg-b-surface border border-white/10 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
                    <div class="p-5 border-b border-white/10 bg-gradient-to-r from-indigo-900/40 to-b-surface flex justify-between items-center shrink-0">
                        <h3 class="text-xl font-bold text-white"><i class="fas fa-info-circle text-indigo-400 mr-2"></i> بطاقة التفاصيل (Record Details)</h3>
                        <button onclick="document.getElementById('cm-details-modal').classList.add('hidden')" class="text-gray-400 hover:text-red-400 w-8 h-8 rounded-lg bg-white/5"><i class="fas fa-times"></i></button>
                    </div>
                    <div id="cm-details-content" class="p-6 overflow-y-auto custom-scroll flex-1 bg-[url('../assets/patterns/circuit.png')] bg-opacity-5"></div>
                </div>
            </div>
        `);
    }
}

// ==========================================
// 🛠️ FULL DATABASE FORMS (نماذج الإدخال)
// ==========================================
window.cmOpenModal = async () => {
    cmCurrentEditId = null;
    document.getElementById('cm-modal-title').innerText = `إضافة سجل جديد`;
    await generateFormFields(null);
    document.getElementById('cm-crud-modal').classList.remove('hidden');
    if (window.initSearchableSelects) window.initSearchableSelects();
};

window.cmCloseModal = () => document.getElementById('cm-crud-modal').classList.add('hidden');

async function generateFormFields(data = null) {
    const container = document.getElementById('cm-form-fields');
    container.innerHTML = '<div class="text-center py-4 text-gray-400"><i class="fas fa-spinner fa-spin text-xl mb-2"></i><br>جاري التجهيز...</div>';
    
    const hData = await fetchHierarchyData(); // الاعتماد على الذاكرة لسرعة خيالية
    let html = '';
    const inputStyle = "w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-b-primary outline-none transition-colors dir-rtl text-right";
    const labelStyle = "text-xs text-gray-400 mb-1 font-bold block dir-rtl text-right";
    
    // دالة مساعدة لإنشاء الخيارات
    const buildOpts = (items, valKey, textKey, selectedVal) => items.map(i => `<option value="${i[valKey]}" ${String(i[valKey]) === String(selectedVal) ? 'selected' : ''}>${i[textKey]}</option>`).join('');

    // --- اكتشاف المسار العكسي (لتسهيل التعديل) ---
    let initTrack = '', initPhase = '', initCourse = '', initContent = '';
    if (data) {
        if (cmCurrentLevel === 'phases') initTrack = data.track_id;
        if (cmCurrentLevel === 'courses') { initPhase = data.phase_id; initTrack = hData.phases.find(p => p.phase_id === initPhase)?.track_id; }
        if (cmCurrentLevel === 'course_materials') { initCourse = data.course_id; initPhase = hData.courses.find(c => c.course_id === initCourse)?.phase_id; initTrack = hData.phases.find(p => p.phase_id === initPhase)?.track_id; }
        if (cmCurrentLevel === 'quiz_questions') { initQuiz = data.quiz_id; const relCnt = hData.contents.find(c => String(c.ref_quiz_id) === String(initQuiz)); if(relCnt){ initContent = relCnt.content_id; initCourse = relCnt.course_id; initPhase = hData.courses.find(c => c.course_id === initCourse)?.phase_id; initTrack = hData.phases.find(p => p.phase_id === initPhase)?.track_id; } }
    }

    if (cmCurrentLevel === 'tracks') {
        html += `
            <div class="grid gap-4 dir-rtl text-right">
                <div><label class="${labelStyle}">اسم المسار (Track Name) *</label><input type="text" id="f-name" required value="${data?.name || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">الوصف (Description)</label><textarea id="f-desc" rows="3" class="${inputStyle}">${data?.description || ''}</textarea></div>
                <div class="flex items-center gap-3 bg-black/30 p-4 rounded-xl border border-white/5"><input type="checkbox" id="f-active" ${!data || data?.is_active ? 'checked' : ''} class="w-4 h-4 rounded text-b-primary bg-black border-white/20"><label class="text-sm font-bold text-white cursor-pointer">مفعل للطلاب</label></div>
            </div>
        `;
    } 
    else if (cmCurrentLevel === 'phases') {
        html += `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto custom-scroll pl-2 dir-rtl text-right">
                <div><label class="${labelStyle}">معرف المرحلة (تلقائي)</label><input type="text" id="f-phase-id" readonly value="${data?.phase_id || generateSystemID('ph')}" class="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed"></div>
                <div><label class="${labelStyle}">المسار التابع له (Track) *</label><select id="f-track-id" required class="${inputStyle}"><option value="" disabled ${!data ? 'selected' : ''}>-- اختر المسار --</option>${buildOpts(hData.tracks, 'id', 'name', data?.track_id)}</select></div>
                <div class="md:col-span-2"><label class="${labelStyle}">عنوان المرحلة *</label><input type="text" id="f-title" required value="${data?.title || ''}" class="${inputStyle}"></div>
                <div class="md:col-span-2"><label class="${labelStyle}">الوصف</label><textarea id="f-desc" rows="2" class="${inputStyle}">${data?.description || ''}</textarea></div>
                <div><label class="${labelStyle}">رابط الصورة (Image URL)</label><input type="text" id="f-img-url" value="${data?.image_url || ''}" class="${inputStyle} dir-ltr"></div>
                <div><label class="${labelStyle}">المدة الزمنية (مثال: شهرين)</label><input type="text" id="f-module-time" value="${data?.['Module Time'] || ''}" class="${inputStyle}"></div>
                <div class="md:col-span-2"><label class="${labelStyle}">المتطلبات السابقة</label><textarea id="f-prereq" rows="2" class="${inputStyle}">${data?.prerequisites || ''}</textarea></div>
                <div class="md:col-span-2"><label class="${labelStyle}">ماذا ستتعلم؟</label><textarea id="f-will-learn" rows="2" class="${inputStyle}">${data?.will_learn || ''}</textarea></div>
                <div class="md:col-span-2 flex items-center gap-3 bg-black/30 p-4 rounded-xl border border-white/5"><input type="checkbox" id="f-active" ${!data || data?.is_active ? 'checked' : ''} class="w-4 h-4 rounded text-purple-500"><label class="text-sm font-bold text-white cursor-pointer">مفعل للطلاب</label></div>
            </div>
        `;
    }
    else if (cmCurrentLevel === 'courses') {
        html += `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto custom-scroll pl-2 dir-rtl text-right">
                <div class="md:col-span-2 p-3 bg-white/5 border border-white/10 rounded-xl mb-1 flex flex-col md:flex-row gap-3">
                    <div class="flex-1"><label class="${labelStyle}">تصفية المسار (لتسهيل الاختيار)</label><select id="modal-filter-track" class="${inputStyle}"><option value="">-- كل المسارات --</option>${buildOpts(hData.tracks, 'id', 'name', initTrack)}</select></div>
                    <div class="flex-1"><label class="${labelStyle}">المرحلة (Phase) *</label><select id="f-phase-id" required class="${inputStyle} border-b-primary/50"><option value="">-- اختر المرحلة --</option>${buildOpts(hData.phases, 'phase_id', 'title', initPhase)}</select></div>
                </div>
                <div><label class="${labelStyle}">معرف الكورس (تلقائي)</label><input type="text" id="f-course-id" readonly value="${data?.course_id || generateSystemID('cr')}" class="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed"></div>
                <div><label class="${labelStyle}">عنوان الكورس *</label><input type="text" id="f-title" required value="${data?.title || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">النوع</label><select id="f-type" class="${inputStyle}"><option value="youtube" ${data?.type === 'youtube' ? 'selected' : ''}>يوتيوب</option><option value="custom" ${data?.type === 'custom' ? 'selected' : ''}>مخصص</option></select></div>
                <div><label class="${labelStyle}">كورس مرتبط بـ (اختياري)</label><select id="f-related" class="${inputStyle}"><option value="">بدون ارتباط</option>${buildOpts(hData.courses, 'course_id', 'title', data?.related_with)}</select></div>
                <div><label class="${labelStyle}">رابط قائمة اليوتيوب (Playlist ID)</label><input type="text" id="f-playlist" value="${data?.playlist_id || ''}" class="${inputStyle} dir-ltr"></div>
                <div><label class="${labelStyle}">رابط الصورة (Image URL)</label><input type="text" id="f-img-url" value="${data?.image_url || ''}" class="${inputStyle} dir-ltr"></div>
                <div class="md:col-span-2"><label class="${labelStyle}">الوصف</label><textarea id="f-desc" rows="2" class="${inputStyle}">${data?.description || ''}</textarea></div>
                <div class="md:col-span-2 flex flex-col gap-3 bg-black/30 p-4 rounded-xl border border-white/5">
                    <label class="flex items-center gap-2 text-white cursor-pointer"><input type="checkbox" id="f-active" ${!data || data?.is_active ? 'checked' : ''} class="w-4 h-4 rounded text-blue-500"> مفعل للطلاب</label>
                    <label class="flex items-center gap-2 text-white cursor-pointer"><input type="checkbox" id="f-auto-sync" ${!data || data?.auto_sync ? 'checked' : ''} class="w-4 h-4 rounded text-blue-500"> مزامنة تلقائية مع يوتيوب</label>
                </div>
            </div>
        `;
    }
    else if (cmCurrentLevel === 'course_materials') {
        html += `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto custom-scroll pl-2 dir-rtl text-right">
                <div class="md:col-span-2 p-3 bg-white/5 border border-white/10 rounded-xl mb-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label class="${labelStyle}">المسار (للفلترة)</label><select id="modal-filter-track" class="${inputStyle}"><option value="">-- الكل --</option>${buildOpts(hData.tracks, 'id', 'name', initTrack)}</select></div>
                    <div><label class="${labelStyle}">المرحلة (للفلترة)</label><select id="modal-filter-phase" class="${inputStyle}"><option value="">-- الكل --</option>${buildOpts(hData.phases, 'phase_id', 'title', initPhase)}</select></div>
                    <div><label class="${labelStyle}">الكورس التابع له *</label><select id="f-course-id" required class="${inputStyle} border-b-primary/50"><option value="">-- اختر الكورس --</option>${buildOpts(hData.courses, 'course_id', 'title', initCourse)}</select></div>
                </div>
                <div><label class="${labelStyle}">معرف المحتوى (تلقائي)</label><input type="text" id="f-content-id" readonly value="${data?.content_id || generateSystemID('cnt')}" class="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed"></div>
                <div><label class="${labelStyle}">عنوان المحتوى (الدرس) *</label><input type="text" id="f-title" required value="${data?.title || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">النوع *</label><select id="f-type" required class="${inputStyle}"><option value="video" ${data?.type==='video'?'selected':''}>فيديو (Video)</option><option value="section" ${data?.type==='section'?'selected':''}>قسم فرعي (Section)</option><option value="quiz" ${data?.type==='quiz'?'selected':''}>اختبار (Quiz)</option><option value="project" ${data?.type==='project'?'selected':''}>مشروع (Project)</option></select></div>
                <div><label class="${labelStyle}">معرف يوتيوب (Video ID)</label><input type="text" id="f-video-id" value="${data?.video_id || ''}" class="${inputStyle} dir-ltr"></div>
                <div><label class="${labelStyle}">ترتيب العرض (Index)</label><input type="number" id="f-order" value="${data?.order_index || 0}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">المدة بالثواني (Duration)</label><input type="number" id="f-duration" value="${data?.duration || 0}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">اختبار مرتبط (اختياري)</label><select id="f-ref-quiz" class="${inputStyle}"><option value="">-- بدون اختبار --</option>${buildOpts(hData.quizzes, 'quiz_id', 'title', data?.ref_quiz_id)}</select></div>
                <div><label class="${labelStyle}">مشروع مرتبط (اختياري)</label><select id="f-ref-project" class="${inputStyle}"><option value="">-- بدون مشروع --</option>${buildOpts(hData.projects, 'id', 'title', data?.ref_project_id)}</select></div>
                <div class="md:col-span-2 flex items-center gap-3 bg-black/30 p-4 rounded-xl border border-white/5"><input type="checkbox" id="f-status" ${!data || data?.status ? 'checked' : ''} class="w-4 h-4 rounded text-red-500"><label class="text-sm font-bold text-white cursor-pointer">مفعل للطلاب</label></div>
            </div>
        `;
    }
    else if (cmCurrentLevel === 'quizzes' || cmCurrentLevel === 'projects') {
        // حقول الكويز أو المشروع
        let coreFields = '';
        if (cmCurrentLevel === 'quizzes') {
            coreFields = `
                <div class="md:col-span-2"><label class="${labelStyle}">عنوان الاختبار *</label><input type="text" id="f-title" required value="${data?.title || ''}" class="${inputStyle}"></div>
                <div class="md:col-span-2"><label class="${labelStyle}">الوصف</label><textarea id="f-desc" rows="2" class="${inputStyle}">${data?.description || ''}</textarea></div>
                <div><label class="${labelStyle}">نسبة النجاح المطلوبة (%)</label><input type="number" id="f-pass" value="${data?.passing_score || 50}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">النقاط المكتسبة (XP)</label><input type="number" id="f-max-xp" value="${data?.max_xp || 50}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">عدد المحاولات المسموحة</label><input type="number" id="f-attempts" value="${data?.attempts_allowed || 3}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">عدد الأسئلة المعروضة للطالب</label><input type="number" id="f-q-show" value="${data?.questions_to_show || ''}" placeholder="اتركه فارغاً لعرض الكل" class="${inputStyle}"></div>
            `;
        } else {
            coreFields = `
                <div class="md:col-span-2"><label class="${labelStyle}">عنوان المشروع *</label><input type="text" id="f-title" required value="${data?.title || ''}" class="${inputStyle}"></div>
                <div class="md:col-span-2"><label class="${labelStyle}">الوصف والمتطلبات *</label><textarea id="f-desc" rows="3" required class="${inputStyle}">${data?.description || ''}</textarea></div>
                <div class="md:col-span-2"><label class="${labelStyle}">رابط التفاصيل (اختياري)</label><input type="text" id="f-req-url" value="${data?.requirements_url || ''}" class="${inputStyle} dir-ltr"></div>
                <div><label class="${labelStyle}">النقاط المكتسبة (XP)</label><input type="number" id="f-max-pts" value="${data?.max_points || 100}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">طريقة التسليم</label><input type="text" id="f-method" value="${data?.submission_method || 'github_link'}" class="${inputStyle} dir-ltr"></div>
            `;
        }

        html += `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto custom-scroll pl-2 dir-rtl text-right">
                ${coreFields}
                <div class="md:col-span-2 mt-4 p-4 bg-purple-900/10 border border-purple-500/20 rounded-xl">
                    <h4 class="text-purple-400 font-bold text-sm mb-3"><i class="fas fa-link mr-2"></i> تعيين مباشر لدرس/محتوى (اختياري لتوفير الوقت)</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div><label class="${labelStyle}">تصفية المسار</label><select id="modal-filter-track" class="${inputStyle}"><option value="">-- الكل --</option>${buildOpts(hData.tracks, 'id', 'name', initTrack)}</select></div>
                        <div><label class="${labelStyle}">تصفية المرحلة</label><select id="modal-filter-phase" class="${inputStyle}"><option value="">-- الكل --</option>${buildOpts(hData.phases, 'phase_id', 'title', initPhase)}</select></div>
                        <div><label class="${labelStyle}">تصفية الكورس</label><select id="modal-filter-course" class="${inputStyle}"><option value="">-- الكل --</option>${buildOpts(hData.courses, 'course_id', 'title', initCourse)}</select></div>
                        <div><label class="${labelStyle}">المحتوى الهدف (الدرس)</label><select id="f-link-content" class="${inputStyle} border-purple-500/50"><option value="">-- اختر الدرس للربط --</option>${buildOpts(hData.contents, 'content_id', 'title', '')}</select></div>
                    </div>
                </div>
            </div>
        `;
    }
else if (cmCurrentLevel === 'quiz_questions') {
        html += `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto custom-scroll pl-2 dir-rtl text-right pb-32">
                <div class="md:col-span-2 p-3 bg-white/5 border border-white/10 rounded-xl mb-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    <div><label class="${labelStyle}">تصفية بالمسار</label><select id="modal-filter-track" class="${inputStyle} py-1.5"><option value="">-- الكل --</option>${buildOpts(hData.tracks, 'id', 'name', initTrack)}</select></div>
                    <div><label class="${labelStyle}">تصفية بالمرحلة</label><select id="modal-filter-phase" class="${inputStyle} py-1.5"><option value="">-- الكل --</option>${buildOpts(hData.phases, 'phase_id', 'title', initPhase)}</select></div>
                    <div><label class="${labelStyle}">تصفية بالكورس</label><select id="modal-filter-course" class="${inputStyle} py-1.5"><option value="">-- الكل --</option>${buildOpts(hData.courses, 'course_id', 'title', initCourse)}</select></div>
                    <div><label class="${labelStyle}">الدرس المرتبط (إن وجد)</label><select id="modal-filter-content" class="${inputStyle} py-1.5"><option value="">-- الكل --</option>${buildOpts(hData.contents, 'content_id', 'title', initContent)}</select></div>
                </div>
                <div class="md:col-span-2"><label class="${labelStyle}">الاختبار التابع له (Quiz) *</label><select id="f-quiz-id" required class="${inputStyle} border-b-primary/50"><option value="" disabled ${!data ? 'selected' : ''}>-- اختر الاختبار --</option>${buildOpts(hData.quizzes, 'quiz_id', 'title', data?.quiz_id)}</select></div>
                
                <div class="md:col-span-2"><label class="${labelStyle}">نص السؤال *</label><textarea id="f-q-text" rows="2" required class="${inputStyle}">${data?.question_text || ''}</textarea></div>
                <div><label class="${labelStyle}">الخيار أ (A) *</label><input type="text" id="f-opt-a" required value="${data?.option_a || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">الخيار ب (B) *</label><input type="text" id="f-opt-b" required value="${data?.option_b || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">الخيار ج (C)</label><input type="text" id="f-opt-c" value="${data?.option_c || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">الخيار د (D)</label><input type="text" id="f-opt-d" value="${data?.option_d || ''}" class="${inputStyle}"></div>
                <div class="md:col-span-1">
                    <label class="${labelStyle}">الإجابة الصحيحة *</label>
                    <select id="f-correct" required class="${inputStyle}">
                        <option value="A" ${data?.correct_answer === 'A' ? 'selected' : ''}>الخيار أ (A)</option>
                        <option value="B" ${data?.correct_answer === 'B' ? 'selected' : ''}>الخيار ب (B)</option>
                        <option value="C" ${data?.correct_answer === 'C' ? 'selected' : ''}>الخيار ج (C)</option>
                        <option value="D" ${data?.correct_answer === 'D' ? 'selected' : ''}>الخيار د (D)</option>
                    </select>
                </div>
                <div class="md:col-span-1"><label class="${labelStyle}">تلميح للسؤال (Hint) - اختياري</label><textarea id="f-hint" rows="1" class="${inputStyle}">${data?.hint || ''}</textarea></div>
            </div>
        `;
    }

    container.innerHTML = html;
    bindModalCascading(hData); // تفعيل الفلاتر المتسلسلة داخل المودال
}

// 💡 دالة الفلترة المتسلسلة الديناميكية داخل المودال
function bindModalCascading(hData) {
    const tSel = document.getElementById('modal-filter-track');
    const pSel = document.getElementById('modal-filter-phase') || document.getElementById('f-phase-id');
    const cSel = document.getElementById('modal-filter-course') || document.getElementById('f-course-id') || document.getElementById('f-related');
    const cntSel = document.getElementById('modal-filter-content') || document.getElementById('f-link-content');
    const qSel = document.getElementById('f-quiz-id');

    if(tSel) tSel.addEventListener('change', (e) => {
        const v = e.target.value;
        if(pSel && pSel.id !== 'f-phase-id') pSel.innerHTML = '<option value="">-- الكل --</option>' + hData.phases.filter(x => !v || String(x.track_id) === String(v)).map(x => `<option value="${x.phase_id}">${x.title}</option>`).join('');
        else if (pSel) pSel.innerHTML = '<option value="">-- اختر المرحلة --</option>' + hData.phases.filter(x => !v || String(x.track_id) === String(v)).map(x => `<option value="${x.phase_id}">${x.title}</option>`).join('');
        if(pSel) pSel.dispatchEvent(new Event('change'));
    });

    if(pSel) pSel.addEventListener('change', (e) => {
        const v = e.target.value;
        if(cSel && cSel.id !== 'f-course-id' && cSel.id !== 'f-related') cSel.innerHTML = '<option value="">-- الكل --</option>' + hData.courses.filter(x => !v || String(x.phase_id) === String(v)).map(x => `<option value="${x.course_id}">${x.title}</option>`).join('');
        else if (cSel) cSel.innerHTML = `<option value="">${cSel.id==='f-related'?'بدون ارتباط':'-- اختر الكورس --'}</option>` + hData.courses.filter(x => !v || String(x.phase_id) === String(v)).map(x => `<option value="${x.course_id}">${x.title}</option>`).join('');
        if(cSel) cSel.dispatchEvent(new Event('change'));
    });

    if(cSel) cSel.addEventListener('change', (e) => {
        const v = e.target.value;
        if(cntSel && cntSel.id !== 'f-link-content') cntSel.innerHTML = '<option value="">-- الكل --</option>' + hData.contents.filter(x => !v || String(x.course_id) === String(v)).map(x => `<option value="${x.content_id}">${x.title}</option>`).join('');
        else if (cntSel) cntSel.innerHTML = '<option value="">-- اختر الدرس للربط --</option>' + hData.contents.filter(x => !v || String(x.course_id) === String(v)).map(x => `<option value="${x.content_id}">${x.title}</option>`).join('');
        if(cntSel) cntSel.dispatchEvent(new Event('change'));
    });

    if(cntSel) cntSel.addEventListener('change', (e) => {
        const v = e.target.value;
        if(qSel) qSel.innerHTML = '<option value="">-- اختر الاختبار --</option>' + hData.quizzes.filter(x => {
            if(!v) return true;
            const refContent = hData.contents.find(c => String(c.content_id) === String(v));
            return refContent && String(refContent.ref_quiz_id) === String(x.quiz_id);
        }).map(x => `<option value="${x.quiz_id}">${x.title}</option>`).join('');
    });
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('cm-btn-save');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    btn.disabled = true;

    try {
        let payload = {};
        const pk = getPrimaryKey();

        if (cmCurrentLevel === 'tracks') { payload = { name: document.getElementById('f-name').value, description: document.getElementById('f-desc').value, is_active: document.getElementById('f-active').checked }; } 
        else if (cmCurrentLevel === 'phases') { payload = { phase_id: document.getElementById('f-phase-id').value, track_id: document.getElementById('f-track-id').value, title: document.getElementById('f-title').value, description: document.getElementById('f-desc').value, image_url: document.getElementById('f-img-url').value, 'Module Time': document.getElementById('f-module-time').value, prerequisites: document.getElementById('f-prereq').value, will_learn: document.getElementById('f-will-learn').value, is_active: document.getElementById('f-active').checked }; } 
        else if (cmCurrentLevel === 'courses') { payload = { course_id: document.getElementById('f-course-id').value, phase_id: document.getElementById('f-phase-id').value, title: document.getElementById('f-title').value, description: document.getElementById('f-desc').value, type: document.getElementById('f-type').value, playlist_id: document.getElementById('f-playlist').value, image_url: document.getElementById('f-img-url').value, related_with: document.getElementById('f-related').value || null, auto_sync: document.getElementById('f-auto-sync').checked, is_active: document.getElementById('f-active').checked }; }
        else if (cmCurrentLevel === 'course_materials') { payload = { content_id: document.getElementById('f-content-id').value, course_id: document.getElementById('f-course-id').value, title: document.getElementById('f-title').value, type: document.getElementById('f-type').value, video_id: document.getElementById('f-video-id').value, duration: parseInt(document.getElementById('f-duration').value) || 0, order_index: parseInt(document.getElementById('f-order').value) || 0, ref_quiz_id: document.getElementById('f-ref-quiz').value || null, ref_project_id: document.getElementById('f-ref-project').value || null, status: document.getElementById('f-status').checked }; }
        else if (cmCurrentLevel === 'quizzes') { payload = { title: document.getElementById('f-title').value, description: document.getElementById('f-desc').value, passing_score: parseInt(document.getElementById('f-pass').value) || 50, max_xp: parseInt(document.getElementById('f-max-xp').value) || 50, attempts_allowed: parseInt(document.getElementById('f-attempts').value) || 3, questions_to_show: document.getElementById('f-q-show').value ? parseInt(document.getElementById('f-q-show').value) : null }; }
        else if (cmCurrentLevel === 'quiz_questions') { payload = { quiz_id: document.getElementById('f-quiz-id').value, question_text: document.getElementById('f-q-text').value, option_a: document.getElementById('f-opt-a').value, option_b: document.getElementById('f-opt-b').value, option_c: document.getElementById('f-opt-c').value, option_d: document.getElementById('f-opt-d').value, correct_answer: document.getElementById('f-correct').value, hint: document.getElementById('f-hint').value }; }
        else if (cmCurrentLevel === 'projects') { payload = { title: document.getElementById('f-title').value, description: document.getElementById('f-desc').value, requirements_url: document.getElementById('f-req-url').value, max_points: parseInt(document.getElementById('f-max-pts').value) || 100, submission_method: document.getElementById('f-method').value }; }

        let insertedId = cmCurrentEditId;

        if (cmCurrentEditId) {
            const { error } = await supabase.from(cmCurrentLevel).update(payload).eq(pk, cmCurrentEditId);
            if (error) throw error;
        } else {
            const { data: inserted, error } = await supabase.from(cmCurrentLevel).insert([payload]).select();
            if (error) throw error;
            if (inserted && inserted.length > 0) insertedId = inserted[0][pk];
        }

        // 💡 تحديث الربط المباشر (الكويزات والمشاريع) إن وُجد
        const linkContentId = document.getElementById('f-link-content')?.value;
        if (linkContentId && insertedId && !cmCurrentEditId) {
            let linkPayload = {};
            if (cmCurrentLevel === 'quizzes') linkPayload = { ref_quiz_id: insertedId };
            else if (cmCurrentLevel === 'projects') linkPayload = { ref_project_id: insertedId };
            
            await supabase.from('course_materials').update(linkPayload).eq('content_id', linkContentId);
        }

        window.showToast(cmCurrentEditId ? "تم التحديث بنجاح!" : "تمت الإضافة بنجاح!", "success");
        window.cmCloseModal();
        hierarchyCache = null; // تفريغ الذاكرة لضمان تحديث القوائم في الإضافات القادمة
        loadTableData(); 

    } catch (err) {
        window.showToast("حدث خطأ أثناء الحفظ: " + err.message, "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

window.cmEditItem = async (id) => {
    const item = rawData.find(r => String(r[getPrimaryKey()]) === String(id));
    if (!item) return;
    cmCurrentEditId = id;
    document.getElementById('cm-modal-title').innerText = `تعديل السجل`;
    document.getElementById('cm-crud-modal').classList.remove('hidden');
    await generateFormFields(item);
    if (window.initSearchableSelects) window.initSearchableSelects();
};

window.cmDeleteItem = async (id) => {
    if(!confirm('⚠️ تحذير: هل أنت متأكد من الحذف النهائي؟ سيتم حذف جميع المحتويات المرتبطة!')) return;
    try {
        const { error } = await supabase.from(cmCurrentLevel).delete().eq(getPrimaryKey(), id);
        if (error) throw error;
        window.showToast("تم الحذف بنجاح", "success");
        loadTableData();
    } catch (err) {
        window.showToast("فشل الحذف، قد يكون مرتبطاً ببيانات أخرى.", "error");
    }
};

// AIzaSyAXZGvITGiO_jiP3Ec06dmHYMA1go4VhV4



// ==========================================
// 🚀 YOUTUBE SMART IMPORT ENGINE
// ==========================================




// AIzaSyBAywMAFWf_ESEoWPun0IpY-koelmqzYiE
//////AIzaSyDWVNKHpYGyA5BWNKRZE4T8gQvij6o6ats



const YOUTUBE_API_KEY = 'AIzaSyDWVNKHpYGyA5BWNKRZE4T8gQvij6o6ats'; 
window.ytImportEngine = {
    state: {
        playlistId: '',
        videos: [],
        courseTitle: '',
        courseDesc: '',
        thumbnail: '',
        courseAuthor: '' // 💡 لتخزين اسم المحاضر
    },
    sortableInst: null,
    eventsBound: false, // 💡 لمنع تكرار الأحداث

    openWizard: async () => {
        document.getElementById('yt-input-url').value = '';
        document.getElementById('yt-step-1').classList.remove('-translate-x-full', 'translate-x-full');
        document.getElementById('yt-step-2').classList.add('translate-x-full');
        document.getElementById('yt-import-wizard').classList.remove('hidden');
        document.getElementById('yt-wizard-step-text').innerText = 'خطوة 1: أدخل الرابط';
        
        // جلب المسارات 
        const { data: tracks } = await supabase.from('tracks').select('id, name');
        const trackSelect = document.getElementById('yt-course-track');
        trackSelect.innerHTML = '<option value="" disabled selected>-- اختر المسار (Track) --</option>' + 
            (tracks || []).map(t => `<option value="${t.id}">${t.name}</option>`).join('');
            
        // جلب الكورسات للارتباط
        const { data: courses } = await supabase.from('courses').select('course_id, title');
        const relatedSelect = document.getElementById('yt-course-related');
        if(relatedSelect) {
            relatedSelect.innerHTML = '<option value="">بدون ارتباط (مستقل)</option>' + 
                (courses || []).map(c => `<option value="${c.course_id}">${c.title}</option>`).join('');
        }

        // إعادة تعيين المرحلة
        const phaseSelect = document.getElementById('yt-course-phase');
        phaseSelect.innerHTML = '<option value="" disabled selected>-- يرجى اختيار المسار أولاً --</option>';
        phaseSelect.disabled = true;
        phaseSelect.classList.replace('bg-black', 'bg-black/50');

        // 💡 تفعيل محرك البحث للقوائم داخل نافذة اليوتيوب
        if (window.initSearchableSelects) window.initSearchableSelects();

        // 💡 ربط حدث تحديث الكورسات المرتبطة مرة واحدة فقط
        if (!ytImportEngine.eventsBound) {
            phaseSelect.addEventListener('change', async (e) => {
                const phaseId = e.target.value;
                if (!phaseId) return;
                const { data: relatedCourses } = await supabase.from('courses').select('course_id, title').eq('phase_id', phaseId);
                if(relatedSelect) {
                    relatedSelect.innerHTML = '<option value="">بدون ارتباط (مستقل)</option>' + 
                        (relatedCourses || []).map(c => `<option value="${c.course_id}">${c.title}</option>`).join('');
                    relatedSelect.dispatchEvent(new Event('change')); // لتحديث واجهة البحث المخصصة
                }
            });
            ytImportEngine.eventsBound = true;
        }
    },

    loadPhases: async (trackId) => {
        const { data: phases } = await supabase.from('phases').select('phase_id, title').eq('track_id', trackId);
        const phaseSelect = document.getElementById('yt-course-phase');
        phaseSelect.disabled = false;
        phaseSelect.classList.replace('bg-black/50', 'bg-black');
        phaseSelect.innerHTML = '<option value="" disabled selected>-- اختر المرحلة (Phase) --</option>' + 
            (phases || []).map(p => `<option value="${p.phase_id}">${p.title}</option>`).join('');
        
        phaseSelect.dispatchEvent(new Event('change')); // لتحديث واجهة البحث المخصصة
    },

    closeWizard: () => { document.getElementById('yt-import-wizard').classList.add('hidden'); },

    fetchPlaylist: async () => {
        const input = document.getElementById('yt-input-url').value.trim();
        const btn = document.getElementById('btn-yt-fetch');
        if(!input) return window.showToast("يرجى إدخال الرابط أولاً", "error");

        // 💡 تحقق صارم من صحة الرابط قبل إرسال الطلب
        const match = input.match(/[?&]list=([^#\&\?]*)/) || input.match(/^([a-zA-Z0-9_-]{12,34})$/);
        if (!match) return window.showToast("عفواً، الرابط غير صالح. يرجى التأكد من أنه رابط أو ID لقائمة تشغيل يوتيوب.", "warning");
        const playlistId = match[1];

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحليل...';
        btn.disabled = true;

        try {
            const plRes = await fetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${YOUTUBE_API_KEY}`);
            const plData = await plRes.json();
            if(plData.error) throw new Error(plData.error.message);
            if(!plData.items || plData.items.length === 0) throw new Error("قائمة التشغيل غير موجودة أو خاصة (Private)");
            
            ytImportEngine.state.playlistId = playlistId;
            ytImportEngine.state.courseTitle = plData.items[0].snippet.title;
            ytImportEngine.state.courseDesc = plData.items[0].snippet.description;
            ytImportEngine.state.courseAuthor = plData.items[0].snippet.channelTitle || ''; // 💡 جلب اسم القناة

            let allItems = [];
            let nextPageToken = '';
            do {
 const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${YOUTUBE_API_KEY}${nextPageToken ? '&pageToken=' + nextPageToken : ''}`;
                const res = await fetch(url);
                const data = await res.json();
                if(data.items) allItems.push(...data.items);
                nextPageToken = data.nextPageToken;
            } while(nextPageToken);

            const videoIds = allItems.map(item => item.contentDetails.videoId);
            let durationsMap = {};
            for (let i = 0; i < videoIds.length; i += 50) {
                const chunk = videoIds.slice(i, i + 50).join(',');
                const vRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${chunk}&key=${YOUTUBE_API_KEY}`);
                const vData = await vRes.json();
                if(vData.items) vData.items.forEach(v => { durationsMap[v.id] = ytImportEngine.parseDuration(v.contentDetails.duration); });
            }

            ytImportEngine.state.videos = allItems.map((item, i) => {
                const vId = item.contentDetails.videoId;
                const snippet = item.snippet;
                const thumb = snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '../assets/icons/icon.jpg';
                const isDeleted = snippet.title === 'Private video' || snippet.title === 'Deleted video';
                return { id: `vid_${Date.now()}_${i}`, videoId: vId, title: snippet.title, duration: durationsMap[vId] || 0, thumbnail: thumb, order_index: i + 1, type: 'video', is_excluded: isDeleted };
            });

            ytImportEngine.renderBuilder();

        } catch (err) {
            window.showToast("خطأ: " + err.message, "error");
        } finally {
            btn.innerHTML = 'تحليل <i class="fas fa-magic ml-2"></i>';
            btn.disabled = false;
        }
    },

    parseDuration: (isoDuration) => {
        const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
        if (!match) return 0;
        const h = parseInt(match[1]) || 0; const m = parseInt(match[2]) || 0; const s = parseInt(match[3]) || 0;
        return (h * 3600) + (m * 60) + s;
    },

renderBuilder: () => {
        document.getElementById('yt-step-1').classList.add('-translate-x-full');
        document.getElementById('yt-step-2').classList.remove('translate-x-full');
        document.getElementById('yt-wizard-step-text').innerText = 'خطوة 2: المراجعة والهيكلة';
        
        // 💡 تعبئة جميع الحقول التلقائية
        document.getElementById('yt-course-id').value = 'cr_' + Date.now().toString(36) + Math.random().toString(36).substr(2,4);
        document.getElementById('yt-course-title').value = ytImportEngine.state.courseTitle;
        document.getElementById('yt-course-desc').value = ytImportEngine.state.courseDesc;
        document.getElementById('yt-course-author').value = ytImportEngine.state.courseAuthor;
        document.getElementById('yt-course-playlist-id').value = ytImportEngine.state.playlistId;
        document.getElementById('yt-course-image-url').value = ytImportEngine.state.videos[0]?.thumbnail || '';

        ytImportEngine.updateVideosUI();

        const listContainer = document.getElementById('yt-builder-list');
        if(ytImportEngine.sortableInst) ytImportEngine.sortableInst.destroy();
        ytImportEngine.sortableInst = new Sortable(listContainer, {
            animation: 150, handle: '.fa-grip-lines', ghostClass: 'opacity-50',
            onEnd: function (evt) {
                const movedItem = ytImportEngine.state.videos.splice(evt.oldIndex, 1)[0];
                ytImportEngine.state.videos.splice(evt.newIndex, 0, movedItem);
                ytImportEngine.updateVideosUI(); 
            }
        });
        ytImportEngine.runHealthCheck();
    },

    updateVideosUI: () => {
        const container = document.getElementById('yt-builder-list');
        const activeVideos = ytImportEngine.state.videos.filter(v => !v.is_excluded);
        document.getElementById('yt-videos-count').innerText = activeVideos.length;
        const totalSecs = activeVideos.reduce((acc, curr) => acc + curr.duration, 0);
        document.getElementById('yt-total-time').innerText = new Date(totalSecs * 1000).toISOString().substr(11, 8);

        container.innerHTML = ytImportEngine.state.videos.map((vid, index) => {
            vid.order_index = index + 1; 
            return `
            <div class="flex items-center gap-3 p-3 rounded-xl border transition-all ${vid.is_excluded ? 'bg-red-900/10 border-red-500/20 opacity-50' : vid.type === 'section' ? 'bg-purple-900/20 border-purple-500/30 mt-6' : 'bg-white/5 border-white/10 hover:border-white/20'}">
                <div class="flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing text-gray-500 hover:text-white px-2 handle fa-grip-lines-container">
                    <i class="fas fa-grip-lines text-lg"></i><span class="text-[10px] font-mono">${index + 1}</span>
                </div>
                <div class="w-24 h-14 bg-black rounded-lg bg-cover bg-center border border-white/10 shrink-0 relative overflow-hidden" style="background-image: url('${vid.thumbnail}')">
                    ${vid.type === 'section' ? '<div class="absolute inset-0 bg-purple-500/50 flex items-center justify-center"><i class="fas fa-folder-open text-white"></i></div>' : ''}
                </div>
                <div class="flex-1 space-y-2">
                    <input type="text" value="${vid.title}" onchange="ytImportEngine.updateVidData(${index}, 'title', this.value)" class="w-full bg-transparent border-b border-transparent hover:border-white/20 focus:border-b-primary outline-none text-sm font-bold text-white transition-colors px-1" ${vid.is_excluded ? 'disabled' : ''}>
                    <div class="flex items-center gap-2">
                        <select onchange="ytImportEngine.updateVidData(${index}, 'type', this.value)" class="bg-black/50 border border-white/10 rounded px-2 py-0.5 text-[10px] text-gray-300 outline-none" ${vid.is_excluded ? 'disabled' : ''}>
                            <option value="video" ${vid.type === 'video' ? 'selected' : ''}>Video Lesson</option>
                            <option value="section" ${vid.type === 'section' ? 'selected' : ''}>-- SECTION DIVIDER --</option>
                        </select>
                        <span class="text-[10px] text-gray-500 font-mono"><i class="far fa-clock mr-1"></i>${Math.floor(vid.duration/60)}m</span>
                    </div>
                </div>
                <div class="flex items-center gap-2 pl-3 border-l border-white/10">
                    <button onclick="ytImportEngine.toggleExclude(${index})" class="w-8 h-8 rounded-lg flex items-center justify-center transition-all ${vid.is_excluded ? 'bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-white/5 text-gray-400 hover:text-red-400'}" title="${vid.is_excluded ? 'Restore' : 'Exclude'}">
                        <i class="fas ${vid.is_excluded ? 'fa-undo' : 'fa-ban'}"></i>
                    </button>
                </div>
            </div>`;
        }).join('');
    },

    updateVidData: (index, key, val) => { ytImportEngine.state.videos[index][key] = val; ytImportEngine.runHealthCheck(); },
    toggleExclude: (index) => { ytImportEngine.state.videos[index].is_excluded = !ytImportEngine.state.videos[index].is_excluded; ytImportEngine.updateVideosUI(); ytImportEngine.runHealthCheck(); },
    autoSplitSections: () => {
        ytImportEngine.state.videos.forEach(vid => {
            const t = vid.title.toLowerCase();
            if (t.includes('part') || t.includes('chapter') || t.includes('module') || t.includes('مقدمة') || t.includes('فصل')) vid.type = 'section';
        });
        ytImportEngine.updateVideosUI();
        window.showToast("تم تطبيق التقسيم الذكي بنجاح", "success");
    },
    runHealthCheck: () => {
        const banner = document.getElementById('yt-health-check-banner');
        const activeVids = ytImportEngine.state.videos.filter(v => !v.is_excluded);
        let errors = [];
        if(activeVids.length === 0) errors.push("الكورس لا يحتوي على أي فيديوهات مفعلة!");
        if(activeVids.some(v => v.title.trim() === '')) errors.push("هناك فيديوهات بدون عنوان.");

        if (errors.length > 0) {
            banner.className = "p-3 rounded-xl text-xs font-bold border border-red-500/30 bg-red-500/10 text-red-400 block";
            banner.innerHTML = `<i class="fas fa-exclamation-triangle mr-1"></i> ` + errors.join('<br>');
            document.getElementById('btn-yt-save').disabled = true;
            document.getElementById('btn-yt-save').classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            banner.className = "p-3 rounded-xl text-xs font-bold border border-green-500/30 bg-green-500/10 text-green-400 block";
            banner.innerHTML = `<i class="fas fa-check-circle mr-1"></i> الكورس جاهز للحفظ الهيكلي تماماً.`;
            document.getElementById('btn-yt-save').disabled = false;
            document.getElementById('btn-yt-save').classList.remove('opacity-50', 'cursor-not-allowed');
        }
    },

saveCourse: async () => {
        const title = document.getElementById('yt-course-title').value.trim();
        const phaseId = document.getElementById('yt-course-phase').value;
        const desc = document.getElementById('yt-course-desc').value;
        const author = document.getElementById('yt-course-author').value.trim();
        const isActive = document.getElementById('yt-course-active').checked;
        const autoSync = document.getElementById('yt-course-sync').checked;
        const courseType = document.getElementById('yt-course-type')?.value || 'youtube';
        const relatedWith = document.getElementById('yt-course-related')?.value || null;
        
        // 💡 التقاط الحقول الجديدة القابلة للتعديل
        const courseId = document.getElementById('yt-course-id').value.trim() || ('cr_' + Date.now().toString(36));
        const customPlaylistId = document.getElementById('yt-course-playlist-id').value.trim();
        const customImageUrl = document.getElementById('yt-course-image-url').value.trim();

        const btn = document.getElementById('btn-yt-save');

        if (!title || !phaseId) return window.showToast("يجب إدخال عنوان الكورس واختيار المرحلة (Phase)", "error");

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ والمعالجة...';
        btn.disabled = true;

        try {
            const totalDur = ytImportEngine.state.videos.filter(v=>!v.is_excluded).reduce((a,b)=>a+b.duration, 0);

const coursePayload = {
                course_id: courseId,
                phase_id: phaseId,
                title: title,
                description: desc,
                created_by: author, 
                type: courseType, 
                related_with: relatedWith,
                playlist_id: customPlaylistId,
                image_url: customImageUrl,
                is_active: isActive,
                auto_sync: autoSync
            };

            const { error: crErr } = await supabase.from('courses').insert([coursePayload]);
            if (crErr) throw crErr;

            let actualOrderIndex = 1;
            const materialsPayload = ytImportEngine.state.videos
                .filter(v => !v.is_excluded)
                .map(vid => ({
                    content_id: 'cnt_' + Date.now().toString(36) + Math.random().toString(36).substr(2,4),
                    course_id: courseId,
                    title: vid.title,
                    type: vid.type === 'section' ? 'section' : 'video',
                    video_id: vid.videoId,
                    duration: vid.duration,
                    order_index: actualOrderIndex++,
                    status: isActive,
                    "Note": vid.type === 'section' ? "Section Divider" : ""
                }));

            const { error: matErr } = await supabase.from('course_materials').insert(materialsPayload);
            if (matErr) throw matErr;

            window.showToast("🎉 تم إنشاء الكورس واستيراد جميع الفيديوهات بنجاح!", "success");
            ytImportEngine.closeWizard();
            
            if(typeof loadTableData === 'function') loadTableData();
            if(typeof loadAndBuildTree === 'function') loadAndBuildTree();

        } catch (err) {
            console.error(err);
            window.showToast("فشل الحفظ: " + err.message, "error");
        } finally {
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> اعتماد وحفظ الكورس';
            btn.disabled = false;
        }
    }
};




// ==========================================
// 🔍 SMART SEARCHABLE SELECT ENGINE
// ==========================================
window.initSearchableSelects = () => {
const selects = document.querySelectorAll('#cm-form-fields select, #yt-step-2 select, #quiz-ai-review-container select, #project-ai-review-container select');
    selects.forEach(select => {
        // تجاهل القوائم التي تم تحويلها مسبقاً
        if (select.nextElementSibling && select.nextElementSibling.classList.contains('custom-select-ui')) return;

        select.style.display = 'none'; // إخفاء القائمة الأصلية

        const ui = document.createElement('div');
        ui.className = 'custom-select-ui relative w-full dir-rtl text-right';

        // الزر الذي يظهر للمستخدم
        const trigger = document.createElement('div');
        trigger.className = 'w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-b-primary outline-none transition-colors cursor-pointer flex justify-between items-center shadow-inner';
        
        const textSpan = document.createElement('span');
        textSpan.className = 'truncate pl-2';
        const icon = document.createElement('i');
        icon.className = 'fas fa-chevron-down text-gray-500 text-xs shrink-0';

        trigger.appendChild(textSpan);
        trigger.appendChild(icon);

        // القائمة المنسدلة وشريط البحث
        const dropdown = document.createElement('div');
        dropdown.className = 'absolute z-[999] w-full bg-[#111111] border border-white/10 rounded-xl mt-1 hidden shadow-2xl flex flex-col max-h-60 overflow-hidden';

        const searchWrap = document.createElement('div');
        searchWrap.className = 'p-2 border-b border-white/5 bg-[#1a1a1a]';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'اكتب للبحث والفلتـرة...';
        searchInput.className = 'w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-b-primary dir-rtl';
        searchWrap.appendChild(searchInput);

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'overflow-y-auto custom-scroll p-1 flex-1';

        dropdown.appendChild(searchWrap);
        dropdown.appendChild(optionsContainer);

        ui.appendChild(trigger);
        ui.appendChild(dropdown);
        
        select.parentNode.insertBefore(ui, select.nextSibling);

        // دالة تحديث الواجهة عند تغير القائمة الأصلية (مثال: الفلترة الهرمية)
        const updateUI = () => {
            const selectedOpt = select.options[select.selectedIndex];
            textSpan.innerText = selectedOpt ? selectedOpt.text : 'اختر...';
            textSpan.className = selectedOpt && selectedOpt.value === "" ? 'text-gray-500 truncate pl-2' : 'text-white font-bold truncate pl-2';
            
            optionsContainer.innerHTML = '';
            Array.from(select.options).forEach((opt) => {
                if(opt.disabled && opt.value === "") return; // تجاهل الـ Placeholder
                const div = document.createElement('div');
                div.className = 'px-3 py-2 text-sm text-gray-300 hover:bg-b-primary/20 hover:text-white cursor-pointer rounded-lg transition-colors truncate mb-0.5';
                if (opt.selected) div.classList.add('bg-b-primary/30', 'text-b-primary', 'font-bold', 'border', 'border-b-primary/30');
                div.innerText = opt.text;
                div.onclick = (e) => {
                    e.stopPropagation();
                    select.value = opt.value;
                    select.dispatchEvent(new Event('change')); // إطلاق حدث التغيير لتفعيل الفلترة المتسلسلة
                    dropdown.classList.add('hidden');
                    updateUI();
                };
                optionsContainer.appendChild(div);
            });
        };

        // تفعيل شريط البحث الداخلي
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            Array.from(optionsContainer.children).forEach(item => {
                const text = item.innerText.toLowerCase();
                item.style.display = text.includes(term) ? 'block' : 'none';
            });
        });

        // فتح وإغلاق القائمة
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.custom-select-ui .absolute').forEach(d => {
                if (d !== dropdown) d.classList.add('hidden'); // إغلاق القوائم الأخرى
            });
            dropdown.classList.toggle('hidden');
            if (!dropdown.classList.contains('hidden')) {
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input')); 
                searchInput.focus(); // نقل المؤشر فوراً لشريط البحث
            }
        });

        // إغلاق القائمة عند الضغط خارجها
        document.addEventListener('click', (e) => {
            if (!ui.contains(e.target)) dropdown.classList.add('hidden');
        });

        // مراقبة القائمة الأصلية للتحديث التلقائي
        select.addEventListener('change', updateUI);
        const observer = new MutationObserver(updateUI);
        observer.observe(select, { childList: true });

        updateUI();
    });
};






















// ==========================================
// 🧠 AI QUIZ IMPORTER ENGINE
// ==========================================
window.quizAiEngine = {
    state: { quiz: null, questions: [] },

    openWizard: () => {
        document.getElementById('quiz-ai-json-input').value = '';
        document.getElementById('quiz-ai-step-1').classList.remove('-translate-x-full', 'translate-x-full');
        document.getElementById('quiz-ai-step-2').classList.add('translate-x-full');
        document.getElementById('quiz-ai-wizard').classList.remove('hidden');
        document.getElementById('quiz-ai-step-text').innerText = 'الخطوة 1: إدخال JSON';
    },

    closeWizard: () => document.getElementById('quiz-ai-wizard').classList.add('hidden'),
    
    backToStep1: () => {
        document.getElementById('quiz-ai-step-2').classList.add('translate-x-full');
        document.getElementById('quiz-ai-step-1').classList.remove('-translate-x-full');
        document.getElementById('quiz-ai-step-text').innerText = 'الخطوة 1: إدخال JSON';
    },

    copyPrompt: () => {
        const prompt = `أريد إنشاء اختبار (Quiz) لمنصة تعليمية.
يرجى توفير البيانات بصيغة JSON حصراً، بناءً على الهيكلة التالية بالضبط دون أي نصوص إضافية:

{
  "quiz": {
    "title": "عنوان الاختبار (مثال: اختبار في الأساسيات)",
    "description": "وصف قصير للاختبار",
    "passing_score": 50,
    "max_xp": 100,
    "attempts_allowed": 3,
    "questions_to_show": 10
  },
  "questions": [
    {
      "question_text": "نص السؤال؟",
      "option_a": "الخيار الأول",
      "option_b": "الخيار الثاني",
      "option_c": "الخيار الثالث",
      "option_d": "الخيار الرابع",
      "correct_answer": "A",
      "hint": "تلميح يظهر إذا أخطأ الطالب (اختياري)"
    }
  ]
}

موضوع الاختبار هو: [أدخل الموضوع هنا]
استخرج المعلومات والأسئلة من هذا المصدر: [أدخل المصدر/المحتوى هنا]
عدد الأسئلة المطلوبة: [أدخل العدد]`;

        navigator.clipboard.writeText(prompt);
        window.showToast("تم نسخ أمر الذكاء الاصطناعي! يمكنك لصقه في ChatGPT/Gemini الآن.", "success");
    },

processJSON: async () => {
        const jsonString = document.getElementById('quiz-ai-json-input').value.trim();
        if (!jsonString) return window.showToast("يرجى إدخال كود الـ JSON أولاً", "error");

        try {
            const cleanJson = jsonString.replace(/```json/g, '').replace(/```/g, '');
            const parsed = JSON.parse(cleanJson);

            if (!parsed.quiz || !parsed.questions || !Array.isArray(parsed.questions)) {
                throw new Error("الهيكلة غير صحيحة. يجب أن تحتوي على 'quiz' و 'questions'.");
            }

            quizAiEngine.state.quiz = parsed.quiz;
            quizAiEngine.state.questions = parsed.questions;
            await quizAiEngine.renderReview(); // 💡 استدعاء دالة المراجعة الجديدة

        } catch (e) {
            window.showToast("خطأ في قراءة JSON: " + e.message, "error");
        }
    },

    renderReview: async () => {
        const container = document.getElementById('quiz-ai-review-container');
        const q = quizAiEngine.state.quiz;
        const inputStyle = "w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:border-purple-500 outline-none";
        
        // 💡 جلب البيانات الهرمية للفلاتر
        const hData = await fetchHierarchyData();
        const buildOpts = (items, valKey, textKey) => items.map(i => `<option value="${i[valKey]}">${i[textKey]}</option>`).join('');

        let html = `
            <div class="bg-black/40 border border-white/10 rounded-2xl p-6 mb-6">
                <h3 class="text-xl font-bold text-purple-400 border-b border-white/5 pb-3 mb-4"><i class="fas fa-link mr-2"></i> ربط الاختبار بدرس (اختياري)</h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div><label class="text-xs text-gray-400 mb-1 block font-bold">تصفية المسار</label><select id="ai-q-track" class="${inputStyle}"><option value="">-- الكل --</option>${buildOpts(hData.tracks, 'id', 'name')}</select></div>
                    <div><label class="text-xs text-gray-400 mb-1 block font-bold">تصفية المرحلة</label><select id="ai-q-phase" class="${inputStyle}"><option value="">-- الكل --</option>${buildOpts(hData.phases, 'phase_id', 'title')}</select></div>
                    <div><label class="text-xs text-gray-400 mb-1 block font-bold">تصفية الكورس</label><select id="ai-q-course" class="${inputStyle}"><option value="">-- الكل --</option>${buildOpts(hData.courses, 'course_id', 'title')}</select></div>
                    <div><label class="text-xs text-green-400 mb-1 block font-bold">الدرس الهدف (Content)</label><select id="ai-q-content" class="${inputStyle} border-green-500/50"><option value="">-- بدون ربط --</option>${buildOpts(hData.contents, 'content_id', 'title')}</select></div>
                </div>
            </div>

            <div class="bg-black/40 border border-white/10 rounded-2xl p-6">
                <h3 class="text-xl font-bold text-purple-400 border-b border-white/5 pb-3 mb-4"><i class="fas fa-cogs mr-2"></i> إعدادات الاختبار</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2"><label class="text-xs text-gray-400 mb-1 block font-bold">عنوان الاختبار *</label><input type="text" id="ai-q-title" value="${q.title || ''}" class="${inputStyle}"></div>
                    <div class="md:col-span-2"><label class="text-xs text-gray-400 mb-1 block font-bold">الوصف</label><input type="text" id="ai-q-desc" value="${q.description || ''}" class="${inputStyle}"></div>
                    <div><label class="text-xs text-gray-400 mb-1 block font-bold">نسبة النجاح المطلوبة (%)</label><input type="number" id="ai-q-pass" value="${q.passing_score || 50}" class="${inputStyle}"></div>
                    <div><label class="text-xs text-gray-400 mb-1 block font-bold">النقاط (XP)</label><input type="number" id="ai-q-xp" value="${q.max_xp || 50}" class="${inputStyle}"></div>
                    <div><label class="text-xs text-gray-400 mb-1 block font-bold">عدد المحاولات</label><input type="number" id="ai-q-attempts" value="${q.attempts_allowed || 3}" class="${inputStyle}"></div>
                    <div><label class="text-xs text-gray-400 mb-1 block font-bold">عدد الأسئلة المعروضة</label><input type="number" id="ai-q-show" value="${q.questions_to_show || q.questions?.length || ''}" class="${inputStyle}"></div>
                </div>
            </div>
            
            <h3 class="text-xl font-bold text-white mt-8 mb-4 flex items-center gap-2"><i class="fas fa-list-ol text-purple-500"></i> مراجعة الأسئلة (${quizAiEngine.state.questions.length})</h3>
            <div class="space-y-4">
        `;

        quizAiEngine.state.questions.forEach((question, idx) => {
            html += `
                <div class="bg-black/30 border border-white/5 hover:border-white/10 rounded-2xl p-5 transition-colors" id="ai-question-${idx}">
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-purple-400 font-bold font-mono">Question #${idx + 1}</span>
                    </div>
                    <div class="space-y-3">
                        <div class="dir-ltr text-left"><label class="text-xs text-gray-500 mb-1 block text-right">نص السؤال</label><textarea class="ai-q-text ${inputStyle}" rows="2">${question.question_text || ''}</textarea></div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 dir-ltr text-left">
                            <div><label class="text-xs text-gray-500 mb-1 block text-right">الخيار (A)</label><input type="text" class="ai-q-opt-a ${inputStyle}" value="${question.option_a || ''}"></div>
                            <div><label class="text-xs text-gray-500 mb-1 block text-right">الخيار (B)</label><input type="text" class="ai-q-opt-b ${inputStyle}" value="${question.option_b || ''}"></div>
                            <div><label class="text-xs text-gray-500 mb-1 block text-right">الخيار (C)</label><input type="text" class="ai-q-opt-c ${inputStyle}" value="${question.option_c || ''}"></div>
                            <div><label class="text-xs text-gray-500 mb-1 block text-right">الخيار (D)</label><input type="text" class="ai-q-opt-d ${inputStyle}" value="${question.option_d || ''}"></div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label class="text-xs text-green-400 mb-1 block font-bold">الإجابة الصحيحة</label>
                                <select class="ai-q-correct ${inputStyle}">
                                    <option value="A" ${question.correct_answer === 'A' ? 'selected' : ''}>A</option>
                                    <option value="B" ${question.correct_answer === 'B' ? 'selected' : ''}>B</option>
                                    <option value="C" ${question.correct_answer === 'C' ? 'selected' : ''}>C</option>
                                    <option value="D" ${question.correct_answer === 'D' ? 'selected' : ''}>D</option>
                                </select>
                            </div>
                            <div class="dir-ltr text-left"><label class="text-xs text-blue-400 mb-1 block font-bold text-right">تلميح (Hint)</label><input type="text" class="ai-q-hint ${inputStyle}" value="${question.hint || ''}"></div>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;

        // 💡 تفعيل الفلترة الهرمية (Cascading) لقوائم الربط
        const tSel = document.getElementById('ai-q-track');
        const pSel = document.getElementById('ai-q-phase');
        const cSel = document.getElementById('ai-q-course');
        const cntSel = document.getElementById('ai-q-content');

        tSel.addEventListener('change', (e) => {
            const v = e.target.value;
            pSel.innerHTML = '<option value="">-- الكل --</option>' + hData.phases.filter(x => !v || String(x.track_id) === String(v)).map(x => `<option value="${x.phase_id}">${x.title}</option>`).join('');
            pSel.dispatchEvent(new Event('change'));
        });
        pSel.addEventListener('change', (e) => {
            const v = e.target.value;
            cSel.innerHTML = '<option value="">-- الكل --</option>' + hData.courses.filter(x => !v || String(x.phase_id) === String(v)).map(x => `<option value="${x.course_id}">${x.title}</option>`).join('');
            cSel.dispatchEvent(new Event('change'));
        });
        cSel.addEventListener('change', (e) => {
            const v = e.target.value;
            cntSel.innerHTML = '<option value="">-- بدون ربط --</option>' + hData.contents.filter(x => !v || String(x.course_id) === String(v)).map(x => `<option value="${x.content_id}">${x.title}</option>`).join('');
            cntSel.dispatchEvent(new Event('change'));
        });

        // 💡 تفعيل محرك البحث للقوائم التي تم إنشاؤها
        if (window.initSearchableSelects) window.initSearchableSelects();

        document.getElementById('quiz-ai-step-1').classList.add('-translate-x-full');
        document.getElementById('quiz-ai-step-2').classList.remove('translate-x-full');
        document.getElementById('quiz-ai-step-text').innerText = 'الخطوة 2: المراجعة والتعديل النهائي';
    },

    saveAll: async () => {
        const btn = document.getElementById('btn-quiz-ai-save');
        const title = document.getElementById('ai-q-title').value.trim();
        const linkContentId = document.getElementById('ai-q-content')?.value; // 💡 التقاط الدرس الهدف
        
        if (!title) return window.showToast("يجب إدخال عنوان الاختبار", "error");

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        btn.disabled = true;

        try {
            // 1. حفظ معلومات الكويز
            const quizPayload = {
                title: title,
                description: document.getElementById('ai-q-desc').value,
                passing_score: parseInt(document.getElementById('ai-q-pass').value) || 50,
                max_xp: parseInt(document.getElementById('ai-q-xp').value) || 50,
                attempts_allowed: parseInt(document.getElementById('ai-q-attempts').value) || 3,
                questions_to_show: parseInt(document.getElementById('ai-q-show').value) || null
            };

            const { data: newQuiz, error: quizErr } = await supabase.from('quizzes').insert([quizPayload]).select('quiz_id');
            if (quizErr) throw quizErr;
            const newQuizId = newQuiz[0].quiz_id;

            // 2. تجميع وحفظ الأسئلة
            const questionsElements = document.querySelectorAll('#quiz-ai-review-container > div.space-y-4 > div');
            const questionsPayload = Array.from(questionsElements).map(el => ({
                quiz_id: newQuizId,
                question_text: el.querySelector('.ai-q-text').value,
                option_a: el.querySelector('.ai-q-opt-a').value,
                option_b: el.querySelector('.ai-q-opt-b').value,
                option_c: el.querySelector('.ai-q-opt-c').value,
                option_d: el.querySelector('.ai-q-opt-d').value,
                correct_answer: el.querySelector('.ai-q-correct').value,
                hint: el.querySelector('.ai-q-hint').value
            }));

            const { error: qErr } = await supabase.from('quiz_questions').insert(questionsPayload);
            if (qErr) throw qErr;

            // 3. 💡 ربط الكويز بالدرس (إن وجد)
            if (linkContentId) {
                const { error: linkErr } = await supabase.from('course_materials').update({ ref_quiz_id: newQuizId }).eq('content_id', linkContentId);
                if (linkErr) console.error("Error linking quiz:", linkErr);
            }

            window.showToast("🎉 تم استيراد الاختبار وجميع الأسئلة بنجاح!", "success");
            quizAiEngine.closeWizard();
            
            if(typeof loadTableData === 'function') loadTableData();

        } catch (e) {
            window.showToast("خطأ أثناء الحفظ: " + e.message, "error");
        } finally {
            btn.innerHTML = '<i class="fas fa-save"></i> حفظ الكويز والأسئلة';
            btn.disabled = false;
        }
    }
};



















// ==========================================
// 🛠️ AI PROJECT IMPORTER ENGINE
// ==========================================
window.projectAiEngine = {
    state: { project: null, rubric: [] },

    openWizard: () => {
        document.getElementById('project-ai-json-input').value = '';
        document.getElementById('project-ai-step-1').classList.remove('-translate-x-full', 'translate-x-full');
        document.getElementById('project-ai-step-2').classList.add('translate-x-full');
        document.getElementById('project-ai-wizard').classList.remove('hidden');
        document.getElementById('project-ai-step-text').innerText = 'الخطوة 1: إدخال JSON';
    },

    closeWizard: () => document.getElementById('project-ai-wizard').classList.add('hidden'),
    backToStep1: () => {
        document.getElementById('project-ai-step-2').classList.add('translate-x-full');
        document.getElementById('project-ai-step-1').classList.remove('-translate-x-full');
        document.getElementById('project-ai-step-text').innerText = 'الخطوة 1: إدخال JSON';
    },

    copyPrompt: () => {
        // سيتم تحديث الـ Prompt في الرسالة القادمة
        navigator.clipboard.writeText("سيتم توفير الـ Prompt لاحقاً.");
        window.showToast("تم النسخ", "success");
    },

    processJSON: async () => {
        const jsonString = document.getElementById('project-ai-json-input').value.trim();
        if (!jsonString) return window.showToast("يرجى إدخال كود الـ JSON أولاً", "error");

        try {
            const cleanJson = jsonString.replace(/```json/g, '').replace(/```/g, '');
            const parsed = JSON.parse(cleanJson);

            if (!parsed.project) throw new Error("الهيكلة غير صحيحة. يجب أن تحتوي على مفتاح 'project'.");

            projectAiEngine.state.project = parsed.project;
            projectAiEngine.state.rubric = parsed.rubric || [];
            await projectAiEngine.renderReview();

        } catch (e) {
            window.showToast("خطأ في قراءة JSON: " + e.message, "error");
        }
    },

    renderReview: async () => {
        const container = document.getElementById('project-ai-review-container');
        const p = projectAiEngine.state.project;
        const inputStyle = "w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:border-emerald-500 outline-none";
        
        const hData = await fetchHierarchyData();
        const buildOpts = (items, valKey, textKey) => items.map(i => `<option value="${i[valKey]}">${i[textKey]}</option>`).join('');

        let html = `
            <div class="bg-black/40 border border-white/10 rounded-2xl p-6 mb-6">
                <h3 class="text-xl font-bold text-emerald-400 border-b border-white/5 pb-3 mb-4"><i class="fas fa-link mr-2"></i> ربط المشروع بدرس (اختياري)</h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div><label class="text-xs text-gray-400 mb-1 block font-bold">تصفية المسار</label><select id="ai-p-track" class="${inputStyle}"><option value="">-- الكل --</option>${buildOpts(hData.tracks, 'id', 'name')}</select></div>
                    <div><label class="text-xs text-gray-400 mb-1 block font-bold">تصفية المرحلة</label><select id="ai-p-phase" class="${inputStyle}"><option value="">-- الكل --</option>${buildOpts(hData.phases, 'phase_id', 'title')}</select></div>
                    <div><label class="text-xs text-gray-400 mb-1 block font-bold">تصفية الكورس</label><select id="ai-p-course" class="${inputStyle}"><option value="">-- الكل --</option>${buildOpts(hData.courses, 'course_id', 'title')}</select></div>
                    <div><label class="text-xs text-emerald-400 mb-1 block font-bold">الدرس الهدف (Content)</label><select id="ai-p-content" class="${inputStyle} border-emerald-500/50"><option value="">-- بدون ربط --</option>${buildOpts(hData.contents, 'content_id', 'title')}</select></div>
                </div>
            </div>

            <div class="bg-black/40 border border-white/10 rounded-2xl p-6">
                <h3 class="text-xl font-bold text-emerald-400 border-b border-white/5 pb-3 mb-4"><i class="fas fa-cogs mr-2"></i> تفاصيل المشروع الأساسية</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2"><label class="text-xs text-gray-400 mb-1 block font-bold">عنوان المشروع *</label><input type="text" id="ai-p-title" value="${p.title || ''}" class="${inputStyle}"></div>
                    <div class="md:col-span-2"><label class="text-xs text-gray-400 mb-1 block font-bold">الوصف والمتطلبات (يدعم HTML) *</label><textarea id="ai-p-desc" rows="4" class="${inputStyle}">${p.description || ''}</textarea></div>
                    <div class="md:col-span-2"><label class="text-xs text-gray-400 mb-1 block font-bold">رابط دليل/مرفقات المشروع (اختياري)</label><input type="text" id="ai-p-req-url" value="${p.requirements_url || ''}" class="${inputStyle} dir-ltr text-left"></div>
                    <div><label class="text-xs text-gray-400 mb-1 block font-bold">إجمالي النقاط (XP)</label><input type="number" id="ai-p-xp" value="${p.max_points || 100}" class="${inputStyle}"></div>
                    <div><label class="text-xs text-gray-400 mb-1 block font-bold">طريقة التسليم (مثال: github_link)</label><input type="text" id="ai-p-method" value="${p.submission_method || 'github_link'}" class="${inputStyle} dir-ltr text-left"></div>
                </div>
            </div>
            
            <h3 class="text-xl font-bold text-white mt-8 mb-4 flex items-center gap-2"><i class="fas fa-list-check text-emerald-500"></i> معايير التقييم - Rubrics (${projectAiEngine.state.rubric.length})</h3>
            <div class="space-y-3" id="ai-p-rubric-list">
        `;

        // 💡 توليد حقول معايير التقييم للتعديل اليدوي إن لزم الأمر
        projectAiEngine.state.rubric.forEach((crit, idx) => {
            html += `
                <div class="bg-black/30 border border-white/5 p-4 rounded-xl flex flex-col md:flex-row gap-3 items-start rubric-item">
                    <div class="w-full md:w-1/4"><label class="text-xs text-gray-500 block mb-1">المعيار (Aspect)</label><input type="text" value="${crit.aspect || ''}" class="r-aspect ${inputStyle}"></div>
                    <div class="flex-1 w-full"><label class="text-xs text-gray-500 block mb-1">الوصف (Description)</label><input type="text" value="${crit.description || ''}" class="r-desc ${inputStyle}"></div>
                    <div class="w-full md:w-24"><label class="text-xs text-emerald-400 block font-bold mb-1">النقاط</label><input type="number" value="${crit.points || 0}" class="r-points ${inputStyle} border-emerald-500/30 text-center text-emerald-400 font-bold"></div>
                </div>
            `;
        });

        if (projectAiEngine.state.rubric.length === 0) {
            html += `<div class="text-gray-500 text-center p-4 border border-dashed border-white/10 rounded-xl">لا توجد معايير تقييم. سيتم التقييم بناءً على النقاط الإجمالية فقط.</div>`;
        }

        html += `</div>`;
        container.innerHTML = html;

        // 💡 تفعيل الفلترة الهرمية (Cascading)
        const tSel = document.getElementById('ai-p-track');
        const pSel = document.getElementById('ai-p-phase');
        const cSel = document.getElementById('ai-p-course');
        const cntSel = document.getElementById('ai-p-content');

        tSel.addEventListener('change', (e) => {
            const v = e.target.value;
            pSel.innerHTML = '<option value="">-- الكل --</option>' + hData.phases.filter(x => !v || String(x.track_id) === String(v)).map(x => `<option value="${x.phase_id}">${x.title}</option>`).join('');
            pSel.dispatchEvent(new Event('change'));
        });
        pSel.addEventListener('change', (e) => {
            const v = e.target.value;
            cSel.innerHTML = '<option value="">-- الكل --</option>' + hData.courses.filter(x => !v || String(x.phase_id) === String(v)).map(x => `<option value="${x.course_id}">${x.title}</option>`).join('');
            cSel.dispatchEvent(new Event('change'));
        });
        cSel.addEventListener('change', (e) => {
            const v = e.target.value;
            cntSel.innerHTML = '<option value="">-- بدون ربط --</option>' + hData.contents.filter(x => !v || String(x.course_id) === String(v)).map(x => `<option value="${x.content_id}">${x.title}</option>`).join('');
            cntSel.dispatchEvent(new Event('change'));
        });

        if (window.initSearchableSelects) window.initSearchableSelects();

        document.getElementById('project-ai-step-1').classList.add('-translate-x-full');
        document.getElementById('project-ai-step-2').classList.remove('translate-x-full');
        document.getElementById('project-ai-step-text').innerText = 'الخطوة 2: المراجعة والتعديل النهائي';
    },

    saveAll: async () => {
        const btn = document.getElementById('btn-project-ai-save');
        const title = document.getElementById('ai-p-title').value.trim();
        const linkContentId = document.getElementById('ai-p-content')?.value; 
        
        if (!title) return window.showToast("يجب إدخال عنوان المشروع", "error");

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        btn.disabled = true;

        try {
            // تجميع الـ Rubrics
            const rubricItems = [];
            document.querySelectorAll('.rubric-item').forEach(el => {
                rubricItems.push({
                    aspect: el.querySelector('.r-aspect').value.trim(),
                    description: el.querySelector('.r-desc').value.trim(),
                    points: parseInt(el.querySelector('.r-points').value) || 0
                });
            });

            // 1. حفظ المشروع في الداتابيز (شاملاً الـ Rubrics كـ JSON)
            const projectPayload = {
                title: title,
                description: document.getElementById('ai-p-desc').value,
                requirements_url: document.getElementById('ai-p-req-url').value,
                max_points: parseInt(document.getElementById('ai-p-xp').value) || 100,
                submission_method: document.getElementById('ai-p-method').value || 'github_link',
                rubric_json: rubricItems.length > 0 ? { criteria: rubricItems } : null 
            };

            const { data: newProject, error: projErr } = await supabase.from('projects').insert([projectPayload]).select('id');
            if (projErr) throw projErr;
            const newProjectId = newProject[0].id;

            // 2. ربط المشروع بالدرس (إن وجد)
            if (linkContentId) {
                const { error: linkErr } = await supabase.from('course_materials').update({ ref_project_id: newProjectId }).eq('content_id', linkContentId);
                if (linkErr) console.error("Error linking project:", linkErr);
            }

            window.showToast("🎉 تم استيراد المشروع بنجاح!", "success");
            projectAiEngine.closeWizard();
            
            if(typeof loadTableData === 'function') loadTableData();

        } catch (e) {
            window.showToast("خطأ أثناء الحفظ: " + e.message, "error");
        } finally {
            btn.innerHTML = '<i class="fas fa-save"></i> حفظ المشروع والمعايير';
            btn.disabled = false;
        }
    }
};