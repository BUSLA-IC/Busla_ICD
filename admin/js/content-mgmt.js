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
    projects: { pk: 'id', icon: 'fa-laptop-code text-emerald-500', title: 'title' },
    curriculum_documents: { pk: 'id', icon: 'fa-file-pdf text-cyan-500', title: 'title' }
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
    const inputClasses = "w-full bg-black/60 border border-white/10 rounded-lg sm:rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm text-white focus:border-b-primary outline-none transition-colors shadow-inner placeholder-gray-600";
    
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
    if(reload) {
        applyFilters();
    }
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
    
    const mobileCards = document.getElementById('cm-mobile-cards-view');
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="p-10 text-center"><i class="fas fa-spinner fa-spin text-b-primary text-2xl"></i></td></tr>`;
    if (mobileCards) mobileCards.innerHTML = `<div class="p-8 text-center text-b-primary text-xl"><i class="fas fa-spinner fa-spin"></i><p class="text-xs text-gray-400 mt-2 font-bold">جاري تحميل البيانات...</p></div>`;

    try {
        let query;
        if (cmCurrentLevel === 'tracks') {
            thead.innerHTML = `<tr>
                <th class="p-4 w-12 text-center text-gray-400 font-bold">#</th>
                <th class="p-4 text-right min-w-[280px]">اسم المسار (Track)</th>
                <th class="p-4 text-center min-w-[150px]">تاريخ الإنشاء</th>
                <th class="p-4 text-center min-w-[120px]">الحالة</th>
                <th class="p-4 text-center min-w-[180px]">إجراءات</th>
            </tr>`;
            query = supabase.from('tracks').select('*').order('created_at', { ascending: false });
        } else if (cmCurrentLevel === 'phases') {
            thead.innerHTML = `<tr>
                <th class="p-4 w-12 text-center text-gray-400 font-bold">#</th>
                <th class="p-4 text-right min-w-[280px]">المرحلة (Phase)</th>
                <th class="p-4 text-center min-w-[260px]">المسار المرتبط</th>
                <th class="p-4 text-center min-w-[120px]">الحالة</th>
                <th class="p-4 text-center min-w-[180px]">إجراءات</th>
            </tr>`;
            query = supabase.from('phases').select('*, tracks(name)').order('created_at', { ascending: false });
        } else if (cmCurrentLevel === 'courses') {
            thead.innerHTML = `<tr>
                <th class="p-4 w-12 text-center text-gray-400 font-bold">#</th>
                <th class="p-4 text-right min-w-[320px]">الكورس (Course)</th>
                <th class="p-4 text-center min-w-[280px]">المرحلة المرتبطة</th>
                <th class="p-4 text-center min-w-[140px]">النوع</th>
                <th class="p-4 text-center min-w-[120px]">الحالة</th>
                <th class="p-4 text-center min-w-[200px]">إجراءات</th>
            </tr>`;
            query = supabase.from('courses').select('*, phases(title)').order('created_at', { ascending: false });
        } else if (cmCurrentLevel === 'course_materials') {
            thead.innerHTML = `<tr>
                <th class="p-4 w-12 text-center text-gray-400 font-bold">#</th>
                <th class="p-4 text-right min-w-[300px]">المحتوى (Content)</th>
                <th class="p-4 text-center min-w-[260px]">الكورس المرتبط</th>
                <th class="p-4 text-center min-w-[130px]">النوع</th>
                <th class="p-4 text-center min-w-[100px]">الترتيب</th>
                <th class="p-4 text-center min-w-[120px]">الحالة</th>
                <th class="p-4 text-center min-w-[200px]">إجراءات</th>
            </tr>`;
            query = supabase.from('course_materials').select('*, courses(title)').order('order_index', { ascending: true });
        } else if (cmCurrentLevel === 'quizzes') {
            thead.innerHTML = `<tr>
                <th class="p-4 w-12 text-center text-gray-400 font-bold">#</th>
                <th class="p-4 text-right min-w-[300px]">عنوان الاختبار (Quiz)</th>
                <th class="p-4 text-center min-w-[130px]">النقاط (XP)</th>
                <th class="p-4 text-center min-w-[130px]">درجة النجاح</th>
                <th class="p-4 text-center min-w-[180px]">إجراءات</th>
            </tr>`;
            query = supabase.from('quizzes').select('*').order('created_at', { ascending: false });
        } else if (cmCurrentLevel === 'quiz_questions') {
            thead.innerHTML = `<tr>
                <th class="p-4 w-12 text-center text-gray-400 font-bold">#</th>
                <th class="p-4 text-right min-w-[320px]">السؤال (Question)</th>
                <th class="p-4 text-center min-w-[260px]">الاختبار المرتبط</th>
                <th class="p-4 text-center min-w-[130px]">الإجابة الصحيحة</th>
                <th class="p-4 text-center min-w-[180px]">إجراءات</th>
            </tr>`;
            query = supabase.from('quiz_questions').select('*, quizzes(title)').order('created_at', { ascending: false });
        } else if (cmCurrentLevel === 'projects') {
            thead.innerHTML = `<tr>
                <th class="p-4 w-12 text-center text-gray-400 font-bold">#</th>
                <th class="p-4 text-right min-w-[300px]">عنوان المشروع (Project)</th>
                <th class="p-4 text-center min-w-[130px]">النقاط (XP)</th>
                <th class="p-4 text-center min-w-[150px]">طريقة التسليم</th>
                <th class="p-4 text-center min-w-[180px]">إجراءات</th>
            </tr>`;
            query = supabase.from('projects').select('*').order('created_at', { ascending: false });
        } else if (cmCurrentLevel === 'curriculum_documents') {
            thead.innerHTML = `<tr>
                <th class="p-4 w-12 text-center text-gray-400 font-bold">#</th>
                <th class="p-4 text-right min-w-[300px]">اسم المستند (Document)</th>
                <th class="p-4 text-center min-w-[130px]">النوع</th>
                <th class="p-4 text-center min-w-[240px]">الربط بالمنهج</th>
                <th class="p-4 text-center min-w-[140px]">المصدر</th>
                <th class="p-4 text-center min-w-[120px]">العرض</th>
                <th class="p-4 text-center min-w-[180px]">إجراءات</th>
            </tr>`;
            query = supabase.from('curriculum_documents').select('*').order('created_at', { ascending: false });
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

function renderTypeBadge(type) {
    if (!type) return '<span class="text-gray-500 text-xs font-mono">-</span>';
    const t = String(type).toLowerCase();
    if (t === 'youtube') return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs font-bold tracking-wide uppercase shadow-sm"><i class="fab fa-youtube text-[12px]"></i> YouTube</span>';
    if (t === 'custom') return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/25 text-purple-400 text-xs font-bold tracking-wide uppercase shadow-sm"><i class="fas fa-sliders-h text-[11px]"></i> Custom</span>';
    if (t === 'video') return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500/10 border border-teal-500/25 text-teal-400 text-xs font-bold tracking-wide uppercase shadow-sm"><i class="fas fa-play text-[10px]"></i> Video</span>';
    if (t === 'quiz') return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-yellow-500/10 border border-yellow-500/25 text-yellow-400 text-xs font-bold tracking-wide uppercase shadow-sm"><i class="fas fa-question-circle text-[11px]"></i> Quiz</span>';
    if (t === 'project') return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-bold tracking-wide uppercase shadow-sm"><i class="fas fa-laptop-code text-[11px]"></i> Project</span>';
    if (t === 'section') return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-500/10 border border-white/10 text-gray-300 text-xs font-bold tracking-wide uppercase shadow-sm"><i class="fas fa-folder text-[11px]"></i> Section</span>';
    if (t === 'pdf') return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs font-bold tracking-wide uppercase shadow-sm"><i class="fas fa-file-pdf text-[11px]"></i> PDF</span>';
    if (t === 'book') return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-bold tracking-wide uppercase shadow-sm"><i class="fas fa-book text-[11px]"></i> Book</span>';
    return `<span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-xs font-bold uppercase shadow-sm">${type}</span>`;
}


function getCmPermission(action, level, item = null) {
    const can = (perm, ctx) => window.hasPermission ? window.hasPermission(perm, ctx) : true;
    const isOwner = window.getAdminProfile ? (window.getAdminProfile()?.role || '').toLowerCase() === 'owner' : false;
    if (isOwner) return true;
    if (can('manage_content')) return true;

    const ctx = item ? {
        track_id: item.track_id || (level === 'tracks' ? item.id : null),
        phase_id: item.phase_id || (level === 'phases' ? item.phase_id : null),
        course_id: item.course_id || (level === 'courses' ? item.course_id : null)
    } : null;

    if (level === 'tracks') {
        if (action === 'create') return can('content:phase:create') || can('content:track:create');
        if (action === 'edit') return can('content:track:edit', ctx) || can('content:phase:edit');
        if (action === 'delete') return can('content:track:delete', ctx);
    } else if (level === 'phases') {
        if (action === 'create') return can('content:phase:create', ctx);
        if (action === 'edit') return can('content:phase:edit', ctx);
        if (action === 'delete') return can('content:phase:delete', ctx);
    } else if (level === 'courses') {
        if (action === 'create') return can('content:course:create', ctx);
        if (action === 'edit') return can('content:course:edit', ctx);
        if (action === 'delete') return can('content:course:delete', ctx);
    } else if (level === 'course_materials') {
        if (action === 'create') return can('content:material:create', ctx) || can('video:create');
        if (action === 'edit') return can('content:material:edit', ctx) || can('video:edit');
        if (action === 'delete') return can('content:material:delete', ctx) || can('video:delete');
    } else if (level === 'quizzes') {
        if (action === 'create') return can('content:quiz:create', ctx);
        if (action === 'edit') return can('content:quiz:edit', ctx) || can('quiz:edit');
        if (action === 'delete') return can('content:quiz:delete', ctx) || can('quiz:delete');
    } else if (level === 'quiz_questions') {
        if (action === 'create') return can('content:question:create', ctx) || can('content:quiz:edit', ctx);
        if (action === 'edit') return can('content:question:edit', ctx) || can('content:quiz:edit', ctx);
        if (action === 'delete') return can('content:question:delete', ctx) || can('content:quiz:delete', ctx);
    } else if (level === 'projects' || level === 'course_projects') {
        if (action === 'create') return can('content:project:create', ctx);
        if (action === 'edit') return can('content:project:edit', ctx) || can('project:edit');
        if (action === 'delete') return can('content:project:delete', ctx);
    }
    return true;
}

function renderTable() {
    const tbody = document.getElementById('cm-table-body');
    const mobileCards = document.getElementById('cm-mobile-cards-view');

    if (filteredData.length === 0) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="p-10 text-center text-gray-500">لا توجد بيانات مطابقة للبحث أو لم يتم الإضافة بعد.</td></tr>`;
        if (mobileCards) mobileCards.innerHTML = `<div class="p-8 text-center bg-b-surface/60 border border-white/5 rounded-2xl text-gray-500 text-xs">لا توجد بيانات مطابقة للبحث أو لم يتم الإضافة بعد.</div>`;
        return;
    }

    const rendered = filteredData.map((item, index) => {
        const pk = getPrimaryKey();
        const id = item[pk];
        const canEditItem = getCmPermission('edit', cmCurrentLevel, item);
        const canDeleteItem = getCmPermission('delete', cmCurrentLevel, item);
        const titleKey = LEVELS[cmCurrentLevel].title;
        const title = String(item[titleKey] || item.name || item.title || '');
        const icon = LEVELS[cmCurrentLevel].icon;
        
        const isActive = item.hasOwnProperty('is_active') ? item.is_active : item.status;
        const statusHtml = isActive === undefined 
            ? '-' 
            : isActive 
                ? '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> مفعل</span>' 
                : '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-bold shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-red-400"></span> معطل</span>';

        // Columns for Desktop Table
        let middleColumn = '';
        // Metadata for Mobile Cards
        let mobileMetaHtml = '';

        if (cmCurrentLevel === 'tracks') {
            middleColumn = `
                <td class="p-4 text-center text-xs font-mono text-gray-400">${new Date(item.created_at).toLocaleDateString()}</td>
                <td class="p-4 text-center">${statusHtml}</td>
            `;
            mobileMetaHtml = `
                <div class="flex items-center gap-2 text-[11px] text-gray-400">
                    <i class="far fa-calendar-alt text-teal-400"></i>
                    <span>تاريخ الإنشاء: ${new Date(item.created_at).toLocaleDateString()}</span>
                </div>
            `;
        }
        else if (cmCurrentLevel === 'phases') {
            middleColumn = `
                <td class="p-4 text-center">
                    <span class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-bold leading-relaxed max-w-sm text-center shadow-sm hover:bg-purple-500/15 transition-colors">
                        <i class="fas fa-layer-group text-[11px] opacity-70 shrink-0"></i>
                        <span dir="auto" class="break-words">${item.tracks?.name || 'بدون مسار'}</span>
                    </span>
                </td>
                <td class="p-4 text-center">${statusHtml}</td>
            `;
            mobileMetaHtml = `
                <div class="flex items-center gap-2 text-[11px]">
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 font-bold truncate max-w-full">
                        <i class="fas fa-layer-group text-[10px]"></i>
                        <span class="truncate">المسار: ${item.tracks?.name || 'بدون مسار'}</span>
                    </span>
                </div>
            `;
        }
        else if (cmCurrentLevel === 'courses') {
            middleColumn = `
                <td class="p-4 text-center">
                    <span class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold leading-relaxed max-w-sm text-center shadow-sm hover:bg-blue-500/15 transition-colors">
                        <i class="fas fa-sitemap text-[11px] opacity-70 shrink-0"></i>
                        <span dir="auto" class="break-words">${item.phases?.title || 'بدون مرحلة'}</span>
                    </span>
                </td>
                <td class="p-4 text-center">${renderTypeBadge(item.type)}</td>
                <td class="p-4 text-center">${statusHtml}</td>
            `;
            mobileMetaHtml = `
                <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold truncate max-w-[200px]">
                        <i class="fas fa-sitemap text-[10px]"></i>
                        <span class="truncate">${item.phases?.title || 'بدون مرحلة'}</span>
                    </span>
                    ${renderTypeBadge(item.type)}
                </div>
            `;
        }
        else if (cmCurrentLevel === 'course_materials') {
            middleColumn = `
                <td class="p-4 text-center">
                    <span class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold leading-relaxed max-w-sm text-center shadow-sm hover:bg-red-500/15 transition-colors">
                        <i class="fas fa-book-reader text-[11px] opacity-70 shrink-0"></i>
                        <span dir="auto" class="break-words">${item.courses?.title || 'بدون كورس'}</span>
                    </span>
                </td>
                <td class="p-4 text-center">${renderTypeBadge(item.type)}</td>
                <td class="p-4 text-center">
                    <span class="font-mono text-yellow-400 text-xs font-bold bg-yellow-500/10 px-2.5 py-1 rounded-lg border border-yellow-500/20 inline-block shadow-sm">${item.order_index || 0}</span>
                </td>
                <td class="p-4 text-center">${statusHtml}</td>
            `;
            mobileMetaHtml = `
                <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 font-bold truncate max-w-[180px]">
                        <i class="fas fa-book-reader text-[10px]"></i>
                        <span class="truncate">${item.courses?.title || 'بدون كورس'}</span>
                    </span>
                    ${renderTypeBadge(item.type)}
                    <span class="font-mono text-yellow-400 text-xs font-bold bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">الترتيب: #${item.order_index || 0}</span>
                </div>
            `;
        }
        else if (cmCurrentLevel === 'quizzes') {
            middleColumn = `
                <td class="p-4 text-center"><span class="text-xs font-mono text-yellow-400 font-bold bg-yellow-500/10 px-2.5 py-1 rounded-lg border border-yellow-500/20">${item.max_xp || 50} XP</span></td>
                <td class="p-4 text-center"><span class="text-xs font-mono text-gray-300 font-bold">${item.passing_score || 50}%</span></td>
            `;
            mobileMetaHtml = `
                <div class="flex items-center gap-2 text-[11px]">
                    <span class="text-xs font-mono text-yellow-400 font-bold bg-yellow-500/10 px-2.5 py-1 rounded-lg border border-yellow-500/20">${item.max_xp || 50} XP</span>
                    <span class="text-xs font-mono text-gray-300 font-bold bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">درجة النجاح: ${item.passing_score || 50}%</span>
                </div>
            `;
        }
        else if (cmCurrentLevel === 'quiz_questions') {
            middleColumn = `
                <td class="p-4 text-center">
                    <span class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-bold leading-relaxed max-w-sm text-center shadow-sm hover:bg-orange-500/15 transition-colors">
                        <i class="fas fa-question text-[11px] opacity-70 shrink-0"></i>
                        <span dir="auto" class="break-words">${item.quizzes?.title || 'بدون اختبار'}</span>
                    </span>
                </td>
                <td class="p-4 text-center"><span class="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase font-mono tracking-wider">خيار (${item.correct_answer})</span></td>
            `;
            mobileMetaHtml = `
                <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 font-bold truncate max-w-[200px]">
                        <i class="fas fa-question text-[10px]"></i>
                        <span class="truncate">${item.quizzes?.title || 'بدون اختبار'}</span>
                    </span>
                    <span class="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold font-mono">خيار (${item.correct_answer})</span>
                </div>
            `;
        }
        else if (cmCurrentLevel === 'projects') {
            middleColumn = `
                <td class="p-4 text-center"><span class="text-xs font-mono text-yellow-400 font-bold bg-yellow-500/10 px-2.5 py-1 rounded-lg border border-yellow-500/20">${item.max_points || 100} XP</span></td>
                <td class="p-4 text-center text-xs font-mono text-gray-400">${item.submission_method || '-'}</td>
            `;
            mobileMetaHtml = `
                <div class="flex items-center gap-2 text-[11px]">
                    <span class="text-xs font-mono text-yellow-400 font-bold bg-yellow-500/10 px-2.5 py-1 rounded-lg border border-yellow-500/20">${item.max_points || 100} XP</span>
                    <span class="text-xs font-mono text-gray-400 bg-white/5 px-2 py-0.5 rounded border border-white/10">تسليم: ${item.submission_method || '-'}</span>
                </div>
            `;
        }
        else if (cmCurrentLevel === 'curriculum_documents') {
            let linkTarget = 'غير مرتبط';
            if (item.lesson_id) linkTarget = `درس: ${item.lesson_id}`;
            else if (item.course_id) linkTarget = `كورس: ${item.course_id}`;
            else if (item.phase_id) linkTarget = `مرحلة: ${item.phase_id}`;
            else if (item.track_id) linkTarget = `مسار: ${item.track_id}`;
            
            middleColumn = `
                <td class="p-4 text-center">${renderTypeBadge(item.document_type || 'PDF')}</td>
                <td class="p-4 text-center">
                    <span class="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold leading-snug text-center shadow-sm">
                        <i class="fas fa-link text-[10px] opacity-70"></i>
                        <span dir="auto" class="break-words">${linkTarget}</span>
                    </span>
                </td>
                <td class="p-4 text-center text-xs text-gray-400 font-mono">${item.source_type || '-'}</td>
                <td class="p-4 text-center text-xs text-purple-400 font-bold uppercase">${item.view_mode || 'embed'}</td>
            `;
            mobileMetaHtml = `
                <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
                    ${renderTypeBadge(item.document_type || 'PDF')}
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold truncate max-w-[200px]">
                        <i class="fas fa-link text-[10px]"></i>
                        <span class="truncate">${linkTarget}</span>
                    </span>
                    <span class="text-purple-400 font-bold uppercase text-[10px] bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">${item.view_mode || 'embed'}</span>
                </div>
            `;
        }

        // Action Buttons
        let drillDownBtn = '';
        let mobileDrillDownBtn = '';
        if (['tracks', 'phases', 'courses', 'quizzes'].includes(cmCurrentLevel)) {
            drillDownBtn = `<button onclick="window.cmViewDetails('${id}')" class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all shadow-sm" title="استعراض المحتوى الداخلي"><i class="fas fa-folder-open text-xs"></i></button>`;
            mobileDrillDownBtn = `<button onclick="window.cmViewDetails('${id}')" class="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all text-xs font-bold flex items-center gap-1" title="استعراض المحتوى الداخلي"><i class="fas fa-folder-open text-[11px]"></i> <span>محتوى</span></button>`;
        }

        let previewBtn = '';
        let previewQuizOrProjectBtn = '';
        let mobilePreviewBtn = '';

        if (cmCurrentLevel === 'course_materials' && item.type === 'video' && item.video_id) {
            previewBtn = `<button onclick="window.cmPreviewTableRow('${id}', '${item.video_id.replace(/'/g, "\\'")}')" class="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white transition-all shadow-sm" title="معاينة الفيديو"><i class="fas fa-play text-xs"></i></button>`;
            mobilePreviewBtn = `<button onclick="window.cmPreviewTableRow('${id}', '${item.video_id.replace(/'/g, "\\'")}')" class="px-2.5 py-1.5 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white transition-all text-xs font-bold flex items-center gap-1" title="معاينة الفيديو"><i class="fas fa-play text-[11px]"></i> <span>معاينة</span></button>`;
        } else if (cmCurrentLevel === 'quizzes') {
            previewQuizOrProjectBtn = `<button onclick="window.cmPreviewItem('quiz', '${id}')" class="w-8 h-8 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500 hover:text-white transition-all shadow-sm" title="معاينة الاختبار"><i class="fas fa-eye text-xs"></i></button>`;
            mobilePreviewBtn = `<button onclick="window.cmPreviewItem('quiz', '${id}')" class="px-2.5 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500 hover:text-white transition-all text-xs font-bold flex items-center gap-1" title="معاينة الاختبار"><i class="fas fa-eye text-[11px]"></i> <span>معاينة</span></button>`;
        } else if (cmCurrentLevel === 'projects') {
            previewQuizOrProjectBtn = `<button onclick="window.cmPreviewItem('project', '${id}')" class="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500 hover:text-white transition-all shadow-sm" title="معاينة المشروع"><i class="fas fa-eye text-xs"></i></button>`;
            mobilePreviewBtn = `<button onclick="window.cmPreviewItem('project', '${id}')" class="px-2.5 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500 hover:text-white transition-all text-xs font-bold flex items-center gap-1" title="معاينة المشروع"><i class="fas fa-eye text-[11px]"></i> <span>معاينة</span></button>`;
        }

        let reorderBtn = '';
        let mobileReorderBtn = '';
        if (cmCurrentLevel === 'courses') {
            reorderBtn = `<button onclick="window.cmOpenReorderModal('${id}', '${title.replace(/'/g, "\\'")}')" class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white transition-all shadow-sm" title="إعادة ترتيب المحتويات"><i class="fas fa-sort text-xs"></i></button>`;
            mobileReorderBtn = `<button onclick="window.cmOpenReorderModal('${id}', '${title.replace(/'/g, "\\'")}')" class="px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white transition-all text-xs font-bold flex items-center gap-1" title="إعادة ترتيب المحتويات"><i class="fas fa-sort text-[11px]"></i> <span>ترتيب</span></button>`;
        } else if (cmCurrentLevel === 'phases') {
            reorderBtn = `<button onclick="window.cmOpenCoursesReorderModal('${id}', '${title.replace(/'/g, "\\'")}')" class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white transition-all shadow-sm" title="إعادة ترتيب الكورسات داخل هذه المرحلة"><i class="fas fa-sort text-xs"></i></button>`;
            mobileReorderBtn = `<button onclick="window.cmOpenCoursesReorderModal('${id}', '${title.replace(/'/g, "\\'")}')" class="px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white transition-all text-xs font-bold flex items-center gap-1" title="إعادة ترتيب الكورسات"><i class="fas fa-sort text-[11px]"></i> <span>ترتيب</span></button>`;
        } else if (cmCurrentLevel === 'tracks') {
            reorderBtn = `<button onclick="window.cmOpenPhasesReorderModal('${id}', '${title.replace(/'/g, "\\'")}')" class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white transition-all shadow-sm" title="إعادة ترتيب المراحل داخل هذا المسار"><i class="fas fa-sort text-xs"></i></button>`;
            mobileReorderBtn = `<button onclick="window.cmOpenPhasesReorderModal('${id}', '${title.replace(/'/g, "\\'")}')" class="px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white transition-all text-xs font-bold flex items-center gap-1" title="إعادة ترتيب المراحل"><i class="fas fa-sort text-[11px]"></i> <span>ترتيب</span></button>`;
        }

        // Desktop Table Row (100% UNCHANGED)
        const trHtml = `
            <tr class="hover:bg-white/[0.04] transition-colors border-b border-white/5 group">
                <td class="p-4 text-center text-gray-500 font-mono text-xs">${index + 1}</td>
                <td class="p-4">
                    <div class="flex items-start gap-3">
                        <div class="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-b-primary text-sm mt-0.5 group-hover:scale-105 transition-transform">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div class="flex flex-col min-w-0">
                            <span class="font-bold text-white text-sm leading-snug break-words group-hover:text-b-primary transition-colors line-clamp-2" dir="auto" title="${title}">${title}</span>
                            <span class="text-[10px] font-mono text-gray-500 mt-1 flex items-center gap-1.5">
                                <span class="text-gray-600 font-bold uppercase tracking-wider">ID:</span>
                                <span class="text-gray-400 font-mono select-all bg-black/40 px-1.5 py-0.5 rounded border border-white/5">${id}</span>
                            </span>
                        </div>
                    </div>
                </td>
                ${middleColumn}
                <td class="p-4 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                        <button onclick="window.cmShowInfo('${id}')" class="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all shadow-sm" title="عرض التفاصيل"><i class="fas fa-info-circle text-xs"></i></button>
                        ${drillDownBtn}
                        ${reorderBtn}
                        ${previewBtn}
                        ${previewQuizOrProjectBtn}
                        ${canEditItem ? `<button onclick="window.cmEditItem('${id}')" class="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white transition-all shadow-sm" title="تعديل"><i class="fas fa-pen text-xs"></i></button>` : ''}
                        ${canDeleteItem ? `<button onclick="window.cmDeleteItem('${id}')" class="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all shadow-sm" title="حذف"><i class="fas fa-trash text-xs"></i></button>` : ''}
                    </div>
                </td>
            </tr>
        `;

        // Mobile Card (Sleek, Responsive, Touch-Friendly)
        const mobileCardHtml = `
            <div class="bg-b-surface border border-white/10 rounded-2xl p-3.5 shadow-lg flex flex-col gap-3 transition-all hover:border-b-primary/40 relative group">
                <!-- Top Row: Icon + Title + Index & Status Badge -->
                <div class="flex items-start justify-between gap-2.5">
                    <div class="flex items-start gap-2.5 min-w-0 flex-1">
                        <div class="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-b-primary text-sm mt-0.5">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div class="flex flex-col min-w-0 flex-1">
                            <span class="font-bold text-white text-xs sm:text-sm leading-snug break-words" dir="auto">${title}</span>
                            <span class="text-[10px] font-mono text-gray-500 mt-1 flex items-center gap-1">
                                <span class="text-gray-600 font-bold">ID:</span>
                                <span class="text-gray-400 select-all bg-black/40 px-1.5 py-0.5 rounded border border-white/5 truncate max-w-[140px]">${id}</span>
                            </span>
                        </div>
                    </div>
                    <div class="flex flex-col items-end gap-1 shrink-0">
                        <span class="text-[10px] font-mono text-gray-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">#${index + 1}</span>
                        ${statusHtml}
                    </div>
                </div>

                <!-- Metadata Badges Strip -->
                ${mobileMetaHtml}

                <!-- Quick Action Bar -->
                <div class="pt-2 border-t border-white/5 flex items-center justify-between gap-1 flex-wrap">
                    <div class="text-[10px] text-gray-500 font-bold">الإجراءات:</div>
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <button onclick="window.cmShowInfo('${id}')" class="px-2.5 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all text-xs font-bold flex items-center gap-1" title="عرض التفاصيل">
                            <i class="fas fa-info-circle text-[11px]"></i> <span>تفاصيل</span>
                        </button>
                        ${mobileDrillDownBtn}
                        ${mobileReorderBtn}
                        ${mobilePreviewBtn}
                        ${canEditItem ? `<button onclick="window.cmEditItem('${id}')" class="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white transition-all flex items-center justify-center text-xs" title="تعديل">
                            <i class="fas fa-pen text-[11px]"></i>
                        </button>` : ''}
                        ${canDeleteItem ? `<button onclick="window.cmDeleteItem('${id}')" class="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center text-xs" title="حذف">
                            <i class="fas fa-trash text-[11px]"></i>
                        </button>` : ''}
                    </div>
                </div>
            </div>
        `;

        return { trHtml, mobileCardHtml };
    });

    if (tbody) tbody.innerHTML = rendered.map(r => r.trHtml).join('');
    if (mobileCards) mobileCards.innerHTML = rendered.map(r => r.mobileCardHtml).join('');
}

// ==========================================
// 🚀 TREE VIEW & HEALTH CHECK ENGINE
// ==========================================
window.cmSwitchView = async (view) => {
    // Legacy switch view function - now always stays in grid view
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
            <div id="cm-details-modal" class="fixed inset-0 z-[400] hidden bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 lg:p-8 transition-opacity">
                <div class="bg-b-surface border border-white/10 rounded-3xl w-full max-w-5xl xl:max-w-6xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
                    <div class="px-6 py-5 border-b border-white/10 bg-gradient-to-r from-indigo-900/40 to-b-surface flex justify-between items-center shrink-0">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center text-lg">
                                <i class="fas fa-info-circle"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-bold text-white">بطاقة التفاصيل (Record Details)</h3>
                                <p class="text-xs text-gray-400 mt-0.5">عرض تفصيلي لجميع البيانات المرتبطة بالسجل</p>
                            </div>
                        </div>
                        <button onclick="document.getElementById('cm-details-modal').classList.add('hidden')" class="text-gray-400 hover:text-red-400 w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"><i class="fas fa-times text-base"></i></button>
                    </div>
                    <div id="cm-details-content" class="p-6 md:p-8 overflow-y-auto custom-scroll flex-1 bg-[url('../assets/patterns/circuit.png')] bg-opacity-5 text-right"></div>
                    <div class="p-4 sm:p-5 border-t border-white/10 flex justify-end shrink-0 bg-b-surface">
                        <button onclick="document.getElementById('cm-details-modal').classList.add('hidden')" class="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold transition-all">إغلاق النافذة</button>
                    </div>
                </div>
            </div>
        `);
    }
}

// ==========================================
// 🛠️ FULL DATABASE FORMS (نماذج الإدخال)
// ==========================================
window.cmOpenModal = async () => {
    if (!getCmPermission('create', cmCurrentLevel)) {
        window.showToast?.('ليس لديك صلاحية لإضافة سجل جديد في هذا القسم.', 'error');
        return;
    }
    cmCurrentEditId = null;
    document.getElementById('cm-modal-title').innerText = `إضافة سجل جديد`;
    await generateFormFields(null);
    document.getElementById('cm-crud-modal').classList.remove('hidden');
    if (window.initSearchableSelects) window.initSearchableSelects();
};

window.cmCloseModal = () => document.getElementById('cm-crud-modal').classList.add('hidden');

async function generateFormFields(data = null) {
    const container = document.getElementById('cm-form-fields');
    container.innerHTML = '<div class="text-center py-12 text-gray-400"><i class="fas fa-spinner fa-spin text-3xl mb-3 text-b-primary"></i><br><span class="text-sm font-medium">جاري تجهيز حقول النموذج والبيانات...</span></div>';
    
    const hData = await fetchHierarchyData(); // الاعتماد على الذاكرة لسرعة فائقة
    let html = '';
    const inputStyle = "w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-b-primary outline-none transition-all dir-rtl text-right focus:bg-black/80";
    const labelStyle = "text-xs text-gray-300 mb-1.5 font-bold block dir-rtl text-right";
    
    // دالة مساعدة لإنشاء الخيارات (تتجاهل السجلات ذات المعرفات الفارغة)
    const buildOpts = (items, valKey, textKey, selectedVal) => items.filter(i => i && i[valKey] !== undefined && i[valKey] !== null && String(i[valKey]).trim() !== '').map(i => `<option value="${i[valKey]}" ${String(i[valKey]) === String(selectedVal) ? 'selected' : ''}>${i[textKey]}</option>`).join('');

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
            <div class="grid grid-cols-1 md:grid-cols-2 gap-5 dir-rtl text-right">
                <div class="md:col-span-2">
                    <label class="${labelStyle}">اسم المسار التعليمي (Track Name) *</label>
                    <input type="text" id="f-name" required value="${data?.name || ''}" placeholder="مثال: Digital IC Design & Verification" class="${inputStyle}">
                </div>
                <div class="md:col-span-2">
                    <label class="${labelStyle}">الوصف التفصيلي (Description)</label>
                    <textarea id="f-desc" rows="4" placeholder="اكتب نبذة شاملة عن المسار وأهدافه والجمهور المستهدف..." class="${inputStyle}">${data?.description || ''}</textarea>
                </div>
                <div class="md:col-span-2 flex items-center justify-between bg-black/40 p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                    <div>
                        <span class="text-sm font-bold text-white block">حالة التفعيل للطلاب</span>
                        <span class="text-xs text-gray-400 mt-0.5 block">إتاحة هذا المسار التعليمي وظهوره في لوحة الطلاب والمناهج</span>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="f-active" ${!data || data?.is_active ? 'checked' : ''} class="w-5 h-5 rounded text-b-primary bg-black border-white/20 focus:ring-b-primary">
                    </label>
                </div>
            </div>
        `;
    } 
    else if (cmCurrentLevel === 'phases') {
        html += `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-5 dir-rtl text-right">
                <!-- Hierarchy Card -->
                <div class="md:col-span-3 bg-white/[0.02] border border-white/10 rounded-2xl p-5 space-y-3">
                    <div class="flex items-center gap-2 text-purple-400 font-bold text-sm">
                        <i class="fas fa-layer-group"></i>
                        <span>المسار التابع له والمُعرف</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="md:col-span-2">
                            <label class="${labelStyle}">المسار التابع له (Track) *</label>
                            <select id="f-track-id" required class="${inputStyle}">
                                <option value="" disabled ${!data ? 'selected' : ''}>-- اختر المسار التعليمي --</option>
                                ${buildOpts(hData.tracks, 'id', 'name', data?.track_id)}
                            </select>
                        </div>
                        <div>
                            <label class="${labelStyle}">معرف المرحلة (تلقائي)</label>
                            <input type="text" id="f-phase-id" readonly value="${data?.phase_id || generateSystemID('ph')}" class="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-gray-400 font-mono cursor-not-allowed">
                        </div>
                    </div>
                </div>

                <!-- Basic Info -->
                <div class="md:col-span-2">
                    <label class="${labelStyle}">عنوان المرحلة التعليمية *</label>
                    <input type="text" id="f-title" required value="${data?.title || ''}" placeholder="مثال: المرحلة الأولى - الأساسيات الرقمية والتصميم المنطقي" class="${inputStyle}">
                </div>
                <div>
                    <label class="${labelStyle}">المدة الزمنية التقديرية</label>
                    <input type="text" id="f-module-time" value="${data?.['Module Time'] || ''}" placeholder="مثال: 8 أسابيع / شهرين" class="${inputStyle}">
                </div>
                <div class="md:col-span-3">
                    <label class="${labelStyle}">رابط صورة المرحلة (Image URL)</label>
                    <input type="text" id="f-img-url" value="${data?.image_url || ''}" placeholder="https://example.com/phase-cover.jpg" class="${inputStyle} dir-ltr">
                </div>
                <div class="md:col-span-3">
                    <label class="${labelStyle}">الوصف التفصيلي للمرحلة</label>
                    <textarea id="f-desc" rows="3" placeholder="وصف محتوى وأهداف هذه المرحلة التعليمية بالتفصيل..." class="${inputStyle}">${data?.description || ''}</textarea>
                </div>
                <div class="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="${labelStyle}">المتطلبات السابقة (Prerequisites)</label>
                        <textarea id="f-prereq" rows="3" placeholder="المعارف والمهارات المطلوبة من الطالب قبل الالتحاق بهذه المرحلة..." class="${inputStyle}">${data?.prerequisites || ''}</textarea>
                    </div>
                    <div>
                        <label class="${labelStyle}">ماذا ستتعلم في هذه المرحلة؟ (What You'll Learn)</label>
                        <textarea id="f-will-learn" rows="3" placeholder="المهارات والمخرجات التعليمية التي سيكتسبها الطالب..." class="${inputStyle}">${data?.will_learn || ''}</textarea>
                    </div>
                </div>
                <div class="md:col-span-3 flex items-center justify-between bg-black/40 p-5 rounded-2xl border border-white/5">
                    <div>
                        <span class="text-sm font-bold text-white block">تفعيل المرحلة للطلاب</span>
                        <span class="text-xs text-gray-400 mt-0.5 block">ظهور المرحلة للطلاب في خارطة الطريق التعليمية للمسار</span>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="f-active" ${!data || data?.is_active ? 'checked' : ''} class="w-5 h-5 rounded text-purple-500 bg-black border-white/20">
                    </label>
                </div>
            </div>
        `;
    }
    else if (cmCurrentLevel === 'courses') {
        html += `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-5 dir-rtl text-right">
                <!-- Hierarchy Placement Card -->
                <div class="md:col-span-3 bg-white/[0.02] border border-white/10 rounded-2xl p-5 space-y-3">
                    <div class="flex items-center justify-between border-b border-white/5 pb-3">
                        <div class="flex items-center gap-2 text-b-primary font-bold text-sm">
                            <i class="fas fa-sitemap"></i>
                            <span>تحديد موقع الكورس داخل المنهج (Curriculum Placement)</span>
                        </div>
                        <span class="text-xs text-gray-400">حدد المسار لتصفية المراحل التعليمية</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="${labelStyle}">تصفية بالمسار (Track)</label>
                            <select id="modal-filter-track" class="${inputStyle}">
                                <option value="">-- كل المسارات --</option>
                                ${buildOpts(hData.tracks, 'id', 'name', initTrack)}
                            </select>
                        </div>
                        <div>
                            <label class="${labelStyle}">المرحلة التابع لها (Phase) *</label>
                            <select id="f-phase-id" required class="${inputStyle} border-b-primary/50">
                                <option value="">-- اختر المرحلة --</option>
                                ${buildOpts(hData.phases, 'phase_id', 'title', initPhase)}
                            </select>
                        </div>
                        <div>
                            <label class="${labelStyle}">معرف الكورس (تلقائي)</label>
                            <input type="text" id="f-course-id" readonly value="${data?.course_id || generateSystemID('cr')}" class="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-gray-400 font-mono cursor-not-allowed">
                        </div>
                    </div>
                </div>

                <!-- Course Core Info -->
                <div class="md:col-span-2">
                    <label class="${labelStyle}">عنوان الكورس *</label>
                    <input type="text" id="f-title" required value="${data?.title || ''}" placeholder="مثال: Digital IC Design: Front-end to Back-end" class="${inputStyle}">
                </div>
                <div>
                    <label class="${labelStyle}">نوع الكورس</label>
                    <select id="f-type" class="${inputStyle}">
                        <option value="youtube" ${data?.type === 'youtube' ? 'selected' : ''}>يوتيوب (YouTube)</option>
                        <option value="custom" ${data?.type === 'custom' ? 'selected' : ''}>مخصص (Custom)</option>
                    </select>
                </div>
                <div class="md:col-span-2">
                    <label class="${labelStyle}">كورس مرتبط بـ (اختياري)</label>
                    <select id="f-related" class="${inputStyle}">
                        <option value="">بدون ارتباط</option>
                        ${buildOpts(hData.courses, 'course_id', 'title', data?.related_with)}
                    </select>
                </div>
                <div>
                    <label class="${labelStyle}">معرف قائمة اليوتيوب (Playlist ID)</label>
                    <input type="text" id="f-playlist" value="${data?.playlist_id || ''}" placeholder="PL..." class="${inputStyle} dir-ltr">
                </div>
                <div class="md:col-span-3">
                    <label class="${labelStyle}">رابط صورة غلاف الكورس (Image URL)</label>
                    <input type="text" id="f-img-url" value="${data?.image_url || ''}" placeholder="https://example.com/course-thumbnail.jpg" class="${inputStyle} dir-ltr">
                </div>
                <div class="md:col-span-3">
                    <label class="${labelStyle}">الوصف التفصيلي للكورس</label>
                    <textarea id="f-desc" rows="3" placeholder="اكتب نبذة واضحة عن محتوى هذا الكورس وموضوعاته..." class="${inputStyle}">${data?.description || ''}</textarea>
                </div>
                <div class="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="flex items-center justify-between bg-black/40 p-4 rounded-2xl border border-white/5">
                        <div>
                            <span class="text-sm font-bold text-white block">مفعل للطلاب مباشرة</span>
                            <span class="text-xs text-gray-400">إتاحة الكورس للطلاب في لوحة التعلم</span>
                        </div>
                        <input type="checkbox" id="f-active" ${!data || data?.is_active ? 'checked' : ''} class="w-5 h-5 rounded text-blue-500 bg-black border-white/20">
                    </div>
                    <div class="flex items-center justify-between bg-black/40 p-4 rounded-2xl border border-white/5">
                        <div>
                            <span class="text-sm font-bold text-white block">مزامنة تلقائية مع يوتيوب</span>
                            <span class="text-xs text-gray-400">تحديث الفيديوهات والدروس تلقائياً</span>
                        </div>
                        <input type="checkbox" id="f-auto-sync" ${!data || data?.auto_sync ? 'checked' : ''} class="w-5 h-5 rounded text-blue-500 bg-black border-white/20">
                    </div>
                </div>
            </div>
        `;
    }
    else if (cmCurrentLevel === 'course_materials') {
        html += `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-5 dir-rtl text-right">
                <!-- Hierarchy Selection Card -->
                <div class="md:col-span-3 bg-white/[0.02] border border-white/10 rounded-2xl p-5 space-y-3">
                    <div class="flex items-center justify-between border-b border-white/5 pb-3">
                        <div class="flex items-center gap-2 text-b-primary font-bold text-sm">
                            <i class="fas fa-sitemap"></i>
                            <span>تحديد الكورس التابع له الدرس (Course Selection & Hierarchy)</span>
                        </div>
                        <span class="text-xs text-gray-400">اختر المسار والمرحلة لفلترة قائمة الكورسات</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="${labelStyle}">المسار (للفلترة)</label>
                            <select id="modal-filter-track" class="${inputStyle}">
                                <option value="">-- كل المسارات --</option>
                                ${buildOpts(hData.tracks, 'id', 'name', initTrack)}
                            </select>
                        </div>
                        <div>
                            <label class="${labelStyle}">المرحلة (للفلترة)</label>
                            <select id="modal-filter-phase" class="${inputStyle}">
                                <option value="">-- كل المراحل --</option>
                                ${buildOpts(hData.phases, 'phase_id', 'title', initPhase)}
                            </select>
                        </div>
                        <div>
                            <label class="${labelStyle}">الكورس التابع له *</label>
                            <select id="f-course-id" required class="${inputStyle} border-b-primary/50">
                                <option value="">-- اختر الكورس التابع له --</option>
                                ${buildOpts(hData.courses, 'course_id', 'title', initCourse)}
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Lesson Main Info -->
                <div class="md:col-span-3 grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div class="md:col-span-3">
                        <label class="${labelStyle}">معرف المحتوى (تلقائي)</label>
                        <input type="text" id="f-content-id" readonly value="${data?.content_id || generateSystemID('cnt')}" class="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-gray-400 font-mono cursor-not-allowed">
                    </div>
                    <div class="md:col-span-6">
                        <label class="${labelStyle}">عنوان المحتوى (الدرس) *</label>
                        <input type="text" id="f-title" required value="${data?.title || ''}" placeholder="مثال: مقدمة إلى التصميم الرقمي وشرائح السيليكون" class="${inputStyle}">
                    </div>
                    <div class="md:col-span-3">
                        <label class="${labelStyle}">نوع المحتوى *</label>
                        <select id="f-type" required class="${inputStyle}">
                            <option value="video" ${data?.type==='video'?'selected':''}>فيديو (Video)</option>
                            <option value="section" ${data?.type==='section'?'selected':''}>قسم فرعي (Section)</option>
                            <option value="quiz" ${data?.type==='quiz'?'selected':''}>اختبار (Quiz)</option>
                            <option value="project" ${data?.type==='project'?'selected':''}>مشروع (Project)</option>
                        </select>
                    </div>
                </div>

                <!-- Video URL & Live Preview & Auto Metadata -->
                <div class="md:col-span-3 bg-black/30 border border-white/5 rounded-2xl p-5 space-y-4">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                            <i class="fab fa-youtube"></i>
                            <span>رابط الفيديو ومصدر المحتوى التعليمي</span>
                        </div>
                        <span class="text-[11px] text-teal-400/90 font-medium flex items-center gap-1.5 bg-teal-500/10 px-2.5 py-1 rounded-lg border border-teal-500/20">
                            <i class="fas fa-magic text-teal-400"></i> جلب المدة والبيانات تلقائياً عبر API
                        </span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        <div class="md:col-span-8">
                            <label class="${labelStyle}">رابط الفيديو أو معرف اليوتيوب (Video URL / ID)</label>
                            <input type="text" id="f-video-id" placeholder="مثال: https://www.youtube.com/watch?v=... أو معرف الفيديو" value="${data?.video_id || ''}" class="${inputStyle} dir-ltr">
                        </div>
                        <div class="md:col-span-4 flex gap-2">
                            <button type="button" id="btn-fetch-video-meta" onclick="window.fetchAndPreviewAdminVideo(true, false)" class="flex-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm text-xs">
                                <i class="fas fa-wand-magic-sparkles"></i>
                                <span>جلب المدة</span>
                            </button>
                            <button type="button" onclick="window.previewAdminVideo()" class="flex-1 bg-b-primary/10 hover:bg-b-primary/20 border border-b-primary/30 text-b-primary font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm text-xs">
                                <i class="fas fa-play-circle text-sm"></i>
                                <span>معاينة</span>
                            </button>
                        </div>
                    </div>

                    <!-- Live Metadata Detection Badge -->
                    <div id="admin-video-meta-badge" class="hidden text-xs py-2.5 px-4 rounded-xl border transition-all duration-300"></div>

                    <!-- Video Preview Screen -->
                    <div id="admin-video-preview-wrapper" class="hidden bg-black/80 border border-white/10 rounded-2xl p-4 transition-all duration-300 space-y-3">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-xs font-bold text-gray-300 flex items-center gap-2"><i class="fas fa-tv text-teal-400"></i> شاشة المعاينة الفورية</span>
                            <button type="button" onclick="document.getElementById('admin-video-preview-wrapper').classList.add('hidden')" class="text-gray-400 hover:text-red-400 text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">إغلاق المعاينة <i class="fas fa-times ml-1"></i></button>
                        </div>
                        <div id="admin-video-preview-content" class="relative w-full aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center border border-white/10 shadow-inner"></div>
                        <div id="admin-video-preview-details" class="hidden p-3 bg-white/[0.03] border border-white/5 rounded-xl text-xs space-y-1.5"></div>
                    </div>
                </div>

                <!-- Order, Duration & XP -->
                <div class="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label class="${labelStyle}">ترتيب العرض (Index Order)</label>
                        <input type="number" id="f-order" value="${data?.order_index || 0}" class="${inputStyle}">
                    </div>
                    <div>
                        <label class="${labelStyle} flex items-center justify-between">
                            <span>المدة بالدقائق (Duration in Minutes)</span>
                            <span class="text-[10px] text-teal-400 font-normal">تلقائي من الفيديو</span>
                        </label>
                        <input type="number" step="any" id="f-duration" value="${data?.duration ? (data.duration / 60).toFixed(1).replace('.0', '') : 0}" class="${inputStyle}">
                    </div>
                    <div>
                        <label class="${labelStyle} text-yellow-400/90 flex items-center gap-1.5"><i class="fas fa-star text-yellow-400 text-xs"></i> النقاط المكتسبة (XP)</label>
                        <input type="number" id="f-base-xp" min="0" value="${data?.base_xp ?? 10}" placeholder="10" class="${inputStyle} border-yellow-500/30 focus:border-yellow-500 text-yellow-400 font-bold">
                    </div>
                </div>

                <!-- Related Quiz & Project -->
                <div class="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="${labelStyle}">اختبار مرتبط بالدرس (اختياري)</label>
                        <select id="f-ref-quiz" class="${inputStyle}">
                            <option value="">-- بدون اختبار --</option>
                            ${buildOpts(hData.quizzes, 'quiz_id', 'title', data?.ref_quiz_id)}
                        </select>
                    </div>
                    <div>
                        <label class="${labelStyle}">مشروع مرتبط بالدرس (اختياري)</label>
                        <select id="f-ref-project" class="${inputStyle}">
                            <option value="">-- بدون مشروع --</option>
                            ${buildOpts(hData.projects, 'id', 'title', data?.ref_project_id)}
                        </select>
                    </div>
                </div>

                <!-- Active Toggle -->
                <div class="md:col-span-3 flex items-center justify-between bg-black/40 p-5 rounded-2xl border border-white/5">
                    <div>
                        <span class="text-sm font-bold text-white block">تفعيل المحتوى للطلاب مباشرة</span>
                        <span class="text-xs text-gray-400 mt-0.5 block">ظهور هذا الدرس مباشرة للطلاب داخل مشغل الكورس</span>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="f-status" ${!data || data?.status ? 'checked' : ''} class="w-5 h-5 rounded text-b-primary bg-black border-white/20">
                    </label>
                </div>
            </div>
        `;
    }
    else if (cmCurrentLevel === 'quizzes' || cmCurrentLevel === 'projects') {
        let coreFields = '';
        if (cmCurrentLevel === 'quizzes') {
            coreFields = `
                <div class="md:col-span-3">
                    <label class="${labelStyle}">عنوان الاختبار *</label>
                    <input type="text" id="f-title" required value="${data?.title || ''}" placeholder="مثال: اختبار تقييم الفهم - أساسيات المعالجات" class="${inputStyle}">
                </div>
                <div class="md:col-span-3">
                    <label class="${labelStyle}">الوصف والتعليمات</label>
                    <textarea id="f-desc" rows="3" placeholder="وصف موجز لموضوع الاختبار وتعليمات الإجابة..." class="${inputStyle}">${data?.description || ''}</textarea>
                </div>
                <div>
                    <label class="${labelStyle}">نسبة النجاح المطلوبة (%)</label>
                    <input type="number" id="f-pass" value="${data?.passing_score || 50}" class="${inputStyle}">
                </div>
                <div>
                    <label class="${labelStyle} text-yellow-400 font-bold"><i class="fas fa-star text-xs ml-1"></i> النقاط المكتسبة (XP)</label>
                    <input type="number" id="f-max-xp" value="${data?.max_xp || 50}" class="${inputStyle} border-yellow-500/30 text-yellow-400 font-bold">
                </div>
                <div>
                    <label class="${labelStyle}">عدد المحاولات المسموحة</label>
                    <input type="number" id="f-attempts" value="${data?.attempts_allowed || 3}" class="${inputStyle}">
                </div>
                <div class="md:col-span-3">
                    <label class="${labelStyle}">عدد الأسئلة المعروضة للطالب عشوائياً</label>
                    <input type="number" id="f-q-show" value="${data?.questions_to_show || ''}" placeholder="اتركه فارغاً لعرض جميع الأسئلة المسجلة في بنك الأسئلة" class="${inputStyle}">
                </div>
            `;
        } else {
            coreFields = `
                <div class="md:col-span-3">
                    <label class="${labelStyle}">عنوان المشروع *</label>
                    <input type="text" id="f-title" required value="${data?.title || ''}" placeholder="مثال: مشروع تصميم معالج RISC-V مبسط" class="${inputStyle}">
                </div>
                <div class="md:col-span-3">
                    <label class="${labelStyle}">الوصف والمتطلبات الفنية *</label>
                    <textarea id="f-desc" rows="4" required placeholder="المتطلبات التقنية ومعايير التقييم وطريقة العمل..." class="${inputStyle}">${data?.description || ''}</textarea>
                </div>
                <div class="md:col-span-2">
                    <label class="${labelStyle}">رابط المستندات أو ملفات البدء (اختياري)</label>
                    <input type="text" id="f-req-url" value="${data?.requirements_url || ''}" placeholder="https://github.com/... أو Google Drive" class="${inputStyle} dir-ltr">
                </div>
                <div>
                    <label class="${labelStyle} text-yellow-400 font-bold"><i class="fas fa-star text-xs ml-1"></i> النقاط المكتسبة (XP)</label>
                    <input type="number" id="f-max-pts" value="${data?.max_points || 100}" class="${inputStyle} border-yellow-500/30 text-yellow-400 font-bold">
                </div>
                <div class="md:col-span-3">
                    <label class="${labelStyle}">طريقة التسليم المقبولة</label>
                    <input type="text" id="f-method" value="${data?.submission_method || 'github_link'}" placeholder="مثال: github_link أو zip_file أو pull_request" class="${inputStyle} dir-ltr">
                </div>
            `;
        }

        html += `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-5 dir-rtl text-right">
                ${coreFields}
                <div class="md:col-span-3 mt-3 p-5 bg-purple-900/10 border border-purple-500/20 rounded-2xl space-y-4">
                    <div class="flex items-center justify-between border-b border-purple-500/10 pb-3">
                        <h4 class="text-purple-400 font-bold text-sm flex items-center gap-2">
                            <i class="fas fa-link"></i> تعيين مباشر لدرس / محتوى تعليمي (اختياري لتوفير الوقت)
                        </h4>
                        <span class="text-xs text-gray-400">تصفية سريعة للربط المباشر مع درس في الكورس</span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label class="${labelStyle}">تصفية المسار</label>
                            <select id="modal-filter-track" class="${inputStyle}">
                                <option value="">-- كل المسارات --</option>
                                ${buildOpts(hData.tracks, 'id', 'name', initTrack)}
                            </select>
                        </div>
                        <div>
                            <label class="${labelStyle}">تصفية المرحلة</label>
                            <select id="modal-filter-phase" class="${inputStyle}">
                                <option value="">-- كل المراحل --</option>
                                ${buildOpts(hData.phases, 'phase_id', 'title', initPhase)}
                            </select>
                        </div>
                        <div>
                            <label class="${labelStyle}">تصفية الكورس</label>
                            <select id="modal-filter-course" class="${inputStyle}">
                                <option value="">-- كل الكورسات --</option>
                                ${buildOpts(hData.courses, 'course_id', 'title', initCourse)}
                            </select>
                        </div>
                        <div>
                            <label class="${labelStyle}">المحتوى الهدف (الدرس)</label>
                            <select id="f-link-content" class="${inputStyle} border-purple-500/50">
                                <option value="">-- اختر الدرس للربط --</option>
                                ${buildOpts(hData.contents, 'content_id', 'title', '')}
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    else if (cmCurrentLevel === 'quiz_questions') {
        html += `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-5 dir-rtl text-right pb-10">
                <!-- Cascading Filter Bar -->
                <div class="md:col-span-2 p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-3">
                    <div class="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                        <i class="fas fa-filter"></i> فلاتر تصفية الاختبارات
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div><label class="${labelStyle}">تصفية بالمسار</label><select id="modal-filter-track" class="${inputStyle}"><option value="">-- كل المسارات --</option>${buildOpts(hData.tracks, 'id', 'name', initTrack)}</select></div>
                        <div><label class="${labelStyle}">تصفية بالمرحلة</label><select id="modal-filter-phase" class="${inputStyle}"><option value="">-- كل المراحل --</option>${buildOpts(hData.phases, 'phase_id', 'title', initPhase)}</select></div>
                        <div><label class="${labelStyle}">تصفية بالكورس</label><select id="modal-filter-course" class="${inputStyle}"><option value="">-- كل الكورسات --</option>${buildOpts(hData.courses, 'course_id', 'title', initCourse)}</select></div>
                        <div><label class="${labelStyle}">الدرس المرتبط</label><select id="modal-filter-content" class="${inputStyle}"><option value="">-- كل الدروس --</option>${buildOpts(hData.contents, 'content_id', 'title', initContent)}</select></div>
                    </div>
                </div>
                
                <div class="md:col-span-2">
                    <label class="${labelStyle}">الاختبار التابع له (Quiz) *</label>
                    <select id="f-quiz-id" required class="${inputStyle} border-b-primary/50">
                        <option value="" disabled ${!data ? 'selected' : ''}>-- اختر الاختبار التابع له --</option>
                        ${buildOpts(hData.quizzes, 'quiz_id', 'title', data?.quiz_id)}
                    </select>
                </div>
                
                <div class="md:col-span-2">
                    <label class="${labelStyle}">نص السؤال *</label>
                    <textarea id="f-q-text" rows="3" required placeholder="أدخل صيغة السؤال بوضوح تام..." class="${inputStyle}">${data?.question_text || ''}</textarea>
                </div>
                
                <div class="space-y-1">
                    <label class="${labelStyle} text-blue-400 font-bold">الخيار أ (Option A) *</label>
                    <input type="text" id="f-opt-a" required value="${data?.option_a || ''}" class="${inputStyle}">
                </div>
                <div class="space-y-1">
                    <label class="${labelStyle} text-green-400 font-bold">الخيار ب (Option B) *</label>
                    <input type="text" id="f-opt-b" required value="${data?.option_b || ''}" class="${inputStyle}">
                </div>
                <div class="space-y-1">
                    <label class="${labelStyle} text-amber-400 font-bold">الخيار ج (Option C)</label>
                    <input type="text" id="f-opt-c" value="${data?.option_c || ''}" class="${inputStyle}">
                </div>
                <div class="space-y-1">
                    <label class="${labelStyle} text-red-400 font-bold">الخيار د (Option D)</label>
                    <input type="text" id="f-opt-d" value="${data?.option_d || ''}" class="${inputStyle}">
                </div>
                
                <div>
                    <label class="${labelStyle} text-b-primary font-bold">الإجابة الصحيحة *</label>
                    <select id="f-correct" required class="${inputStyle} border-b-primary">
                        <option value="A" ${data?.correct_answer === 'A' ? 'selected' : ''}>الخيار أ (A)</option>
                        <option value="B" ${data?.correct_answer === 'B' ? 'selected' : ''}>الخيار ب (B)</option>
                        <option value="C" ${data?.correct_answer === 'C' ? 'selected' : ''}>الخيار ج (C)</option>
                        <option value="D" ${data?.correct_answer === 'D' ? 'selected' : ''}>الخيار د (D)</option>
                    </select>
                </div>
                <div>
                    <label class="${labelStyle}">تلميح للسؤال (Hint) - اختياري</label>
                    <textarea id="f-hint" rows="1" placeholder="تلميح يظهر للطالب عند الحاجة..." class="${inputStyle}">${data?.hint || ''}</textarea>
                </div>
            </div>
        `;
    }
    else if (cmCurrentLevel === 'curriculum_documents') {
        html += `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-5 dir-rtl text-right pb-10">
                <!-- Basic Data -->
                <div class="md:col-span-3 border-b border-white/10 pb-2">
                    <h4 class="text-sm font-bold text-cyan-400 flex items-center gap-2"><i class="fas fa-file-alt"></i> البيانات الأساسية للوثيقة أو المرجع</h4>
                </div>
                <div class="md:col-span-2">
                    <label class="${labelStyle}">العنوان الكامل للوثيقة / الكتاب *</label>
                    <input type="text" id="f-title" required value="${data?.title || ''}" placeholder="مثال: كتاب تصميم الدوائر الرقمية المتكاملة - Digital Integrated Circuits" class="${inputStyle}">
                </div>
                <div>
                    <label class="${labelStyle}">الاسم المختصر</label>
                    <input type="text" id="f-short-title" value="${data?.short_title || ''}" placeholder="مثال: مرجع ASIC" class="${inputStyle}">
                </div>
                <div class="md:col-span-3">
                    <label class="${labelStyle}">الوصف ومحتوى الوثيقة</label>
                    <textarea id="f-desc" rows="3" placeholder="وصف موجز لمحتويات الملف أو الكتاب..." class="${inputStyle}">${data?.description || ''}</textarea>
                </div>
                <div class="md:col-span-2">
                    <label class="${labelStyle}">رابط صورة الغلاف (Cover URL)</label>
                    <input type="text" id="f-cover-url" value="${data?.cover_url || ''}" placeholder="https://..." class="${inputStyle} dir-ltr">
                </div>
                <div>
                    <label class="${labelStyle}">رابط المصغر (Thumbnail URL)</label>
                    <input type="text" id="f-thumbnail-url" value="${data?.thumbnail_url || ''}" placeholder="https://..." class="${inputStyle} dir-ltr">
                </div>
                <div>
                    <label class="${labelStyle}">نوع الوثيقة *</label>
                    <select id="f-doc-type" required class="${inputStyle}">
                        <option value="PDF" ${data?.document_type === 'PDF'?'selected':''}>PDF</option>
                        <option value="Book" ${data?.document_type === 'Book'?'selected':''}>Book</option>
                        <option value="Notes" ${data?.document_type === 'Notes'?'selected':''}>Notes</option>
                        <option value="Datasheet" ${data?.document_type === 'Datasheet'?'selected':''}>Datasheet</option>
                        <option value="Research Paper" ${data?.document_type === 'Research Paper'?'selected':''}>Research Paper</option>
                        <option value="Documentation" ${data?.document_type === 'Documentation'?'selected':''}>Documentation</option>
                        <option value="Manual" ${data?.document_type === 'Manual'?'selected':''}>Manual</option>
                        <option value="Whitepaper" ${data?.document_type === 'Whitepaper'?'selected':''}>Whitepaper</option>
                        <option value="Specification" ${data?.document_type === 'Specification'?'selected':''}>Specification</option>
                    </select>
                </div>
                <div>
                    <label class="${labelStyle}">الأهمية للطلاب *</label>
                    <select id="f-importance" required class="${inputStyle}">
                        <option value="Required" ${data?.importance === 'Required'?'selected':''}>إلزامي (Required)</option>
                        <option value="Recommended" ${data?.importance === 'Recommended'?'selected':''}>موصى به (Recommended)</option>
                        <option value="Optional" ${data?.importance === 'Optional'?'selected':''}>اختياري (Optional)</option>
                    </select>
                </div>
                <div>
                    <label class="${labelStyle}">ترتيب العرض (Display Order)</label>
                    <input type="number" id="f-order" value="${data?.order_index || 0}" class="${inputStyle}">
                </div>

                <!-- Linking -->
                <div class="md:col-span-3 border-b border-white/10 pb-2 pt-3">
                    <h4 class="text-sm font-bold text-cyan-400 flex items-center gap-2"><i class="fas fa-link"></i> ربط الوثيقة بالمنهج التعليمي (اختياري)</h4>
                </div>
                <div><label class="${labelStyle}">المسار المرتبط (Track)</label><select id="f-track-id" class="${inputStyle}"><option value="">-- بدون ارتباط --</option>${buildOpts(hData.tracks, 'id', 'name', data?.track_id)}</select></div>
                <div><label class="${labelStyle}">المرحلة المرتبطة (Phase)</label><select id="f-phase-id" class="${inputStyle}"><option value="">-- بدون ارتباط --</option>${buildOpts(hData.phases.filter(p => !data?.track_id || p.track_id === data.track_id), 'phase_id', 'title', data?.phase_id)}</select></div>
                <div><label class="${labelStyle}">الكورس المرتبط (Course)</label><select id="f-course-id" class="${inputStyle}"><option value="">-- بدون ارتباط --</option>${buildOpts(hData.courses.filter(c => !data?.phase_id || c.phase_id === data.phase_id), 'course_id', 'title', data?.course_id)}</select></div>
                <div class="md:col-span-3"><label class="${labelStyle}">الدرس المرتبط (Lesson/Content)</label><select id="f-lesson-id" class="${inputStyle}"><option value="">-- بدون ارتباط --</option>${buildOpts(hData.contents.filter(c => !data?.course_id || c.course_id === data.course_id), 'content_id', 'title', data?.lesson_id)}</select></div>

                <!-- Source & View Mode -->
                <div class="md:col-span-3 border-b border-white/10 pb-2 pt-3">
                    <h4 class="text-sm font-bold text-cyan-400 flex items-center gap-2"><i class="fas fa-cloud"></i> المصدر وطريقة العرض</h4>
                </div>
                <div>
                    <label class="${labelStyle}">المصدر *</label>
                    <select id="f-source-type" required class="${inputStyle}">
                        <option value="Direct URL" ${data?.source_type === 'Direct URL'?'selected':''}>رابط مباشر (Direct URL)</option>
                        <option value="Google Drive" ${data?.source_type === 'Google Drive'?'selected':''}>Google Drive</option>
                        <option value="OneDrive" ${data?.source_type === 'OneDrive'?'selected':''}>OneDrive</option>
                        <option value="Dropbox" ${data?.source_type === 'Dropbox'?'selected':''}>Dropbox</option>
                        <option value="GitHub" ${data?.source_type === 'GitHub'?'selected':''}>GitHub</option>
                        <option value="AWS S3" ${data?.source_type === 'AWS S3'?'selected':''}>AWS S3</option>
                        <option value="Supabase Storage" ${data?.source_type === 'Supabase Storage'?'selected':''}>Supabase Storage</option>
                    </select>
                </div>
                <div class="md:col-span-2"><label class="${labelStyle}">رابط أو معرف الملف (Source URL / ID) *</label><input type="text" id="f-source-url" required value="${data?.source_url || ''}" placeholder="https://... أو معرف الملف" class="${inputStyle} dir-ltr"></div>
                <div>
                    <label class="${labelStyle}">طريقة العرض *</label>
                    <select id="f-view-mode" required class="${inputStyle}">
                        <option value="embed" ${data?.view_mode === 'embed'?'selected':''}>تضمين داخل المنصة (Embed)</option>
                        <option value="external" ${data?.view_mode === 'external'?'selected':''}>فتح نافذة خارجية (Open External)</option>
                    </select>
                </div>
                <div class="md:col-span-2">
                    <label class="${labelStyle}">شرط اعتبار المقال مقروءاً (Completion Trigger) *</label>
                    <select id="f-completion-trigger" required class="${inputStyle}">
                        <option value="mark_complete" ${data?.completion_trigger === 'mark_complete'?'selected':''}>الضغط على زر الإكمال (Mark as Complete)</option>
                        <option value="open" ${data?.completion_trigger === 'open'?'selected':''}>بمجرد فتح الملف (Open)</option>
                        <option value="pages" ${data?.completion_trigger === 'pages'?'selected':''}>قراءة عدد محدد من الصفحات (Pages Read)</option>
                        <option value="last_page" ${data?.completion_trigger === 'last_page'?'selected':''}>الوصول لآخر صفحة (Last Page)</option>
                        <option value="time" ${data?.completion_trigger === 'time'?'selected':''}>قضاء وقت محدد من الزمن (Time Spent)</option>
                    </select>
                </div>

                <!-- Gamification -->
                <div class="md:col-span-3 border-b border-white/10 pb-2 pt-3">
                    <h4 class="text-sm font-bold text-yellow-400 flex items-center gap-2"><i class="fas fa-star"></i> إعدادات الإكمال والـ XP</h4>
                </div>
                <div><label class="${labelStyle}">عدد الصفحات المطلوب قراءتها (إن وجد)</label><input type="number" id="f-completion-pages" value="${data?.completion_pages_count || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">الوقت المطلوب بالثواني (إن وجد)</label><input type="number" id="f-completion-time" value="${data?.completion_time_seconds || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">الوقت المتوقع للقراءة بالدقائق</label><input type="number" id="f-reading-time" value="${data?.estimated_reading_time || ''}" class="${inputStyle}"></div>
                <div class="md:col-span-3 p-5 bg-yellow-500/5 border border-yellow-500/20 rounded-2xl flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-yellow-500/10 text-yellow-400 flex items-center justify-center shrink-0"><i class="fas fa-star text-base"></i></div>
                        <div>
                            <span class="text-sm font-bold text-white block">نقاط الـ XP المكتسبة عند إكمال القراءة</span>
                            <span class="text-xs text-gray-400 mt-0.5 block">تُضاف مباشرة لرصيد الطالب عند تحقيق شرط الإكمال</span>
                        </div>
                    </div>
                    <input type="number" id="f-base-xp" min="0" value="${data?.xp_reward ?? 10}" class="${inputStyle} border-yellow-500/40 focus:border-yellow-500 text-yellow-400 font-bold w-32 text-center text-base">
                </div>

                <!-- Permissions -->
                <div class="md:col-span-3 border-b border-white/10 pb-2 pt-3">
                    <h4 class="text-sm font-bold text-cyan-400 flex items-center gap-2"><i class="fas fa-shield-alt"></i> الصلاحيات وتاريخ الصلاحية</h4>
                </div>
                <div class="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-black/40 p-4 rounded-2xl border border-white/5">
                    <label class="flex items-center gap-2 text-white cursor-pointer"><input type="checkbox" id="f-allow-download" ${!data || data?.allow_download ? 'checked' : ''} class="w-4 h-4 rounded text-cyan-500"> السماح بالتحميل</label>
                    <label class="flex items-center gap-2 text-white cursor-pointer"><input type="checkbox" id="f-allow-print" ${!data || data?.allow_print ? 'checked' : ''} class="w-4 h-4 rounded text-cyan-500"> السماح بالطباعة</label>
                    <label class="flex items-center gap-2 text-white cursor-pointer"><input type="checkbox" id="f-allow-copy" ${!data || data?.allow_copy ? 'checked' : ''} class="w-4 h-4 rounded text-cyan-500"> السماح بالنسخ</label>
                </div>
                <div>
                    <label class="${labelStyle}">إخفاء الملف تلقائياً بعد تاريخ</label>
                    <input type="datetime-local" id="f-expiry-date" value="${data?.available_until ? new Date(data.available_until).toISOString().slice(0, 16) : ''}" class="${inputStyle} dir-ltr">
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
    bindModalCascading(hData); // تفعيل الفلاتر المتسلسلة داخل المودال

    // 💡 تفعيل الجلب التلقائي الذكي لبيانات الفيديو ومدته
    if (cmCurrentLevel === 'course_materials') {
        bindVideoMetadataAutoFetch();
    }
}

// 💡 دالة الفلترة المتسلسلة الديناميكية داخل المودال
function bindModalCascading(hData) {
    const tSel = document.getElementById('modal-filter-track') || document.getElementById('f-track-id');
    const pSel = document.getElementById('modal-filter-phase') || document.getElementById('f-phase-id');
    const cSel = document.getElementById('modal-filter-course') || document.getElementById('f-course-id') || document.getElementById('f-related');
    const cntSel = document.getElementById('modal-filter-content') || document.getElementById('f-link-content') || document.getElementById('f-lesson-id');
    const qSel = document.getElementById('f-quiz-id');

    if(tSel) tSel.addEventListener('change', (e) => {
        const v = e.target.value;
        const isFilter = e.target.id === 'modal-filter-track';
        const optDefault = pSel && pSel.id === 'f-phase-id' 
            ? '<option value="">-- اختر المرحلة --</option>' 
            : (isFilter ? '<option value="">-- الكل --</option>' : '<option value="">-- بدون ارتباط --</option>');
        if(pSel) {
            pSel.innerHTML = optDefault + hData.phases.filter(x => x.phase_id && (!v || String(x.track_id) === String(v))).map(x => `<option value="${x.phase_id}">${x.title}</option>`).join('');
            pSel.value = "";
            pSel.dispatchEvent(new Event('change'));
        }
    });

    if(pSel) pSel.addEventListener('change', (e) => {
        const v = e.target.value;
        const isFilter = e.target.id === 'modal-filter-phase';
        const optDefault = cSel && cSel.id === 'f-course-id'
            ? '<option value="">-- اختر الكورس --</option>'
            : (isFilter ? '<option value="">-- الكل --</option>' : (cSel && cSel.id === 'f-related' ? '<option value="">بدون ارتباط</option>' : '<option value="">-- بدون ارتباط --</option>'));
        if(cSel) {
            cSel.innerHTML = optDefault + hData.courses.filter(x => x.course_id && (!v || String(x.phase_id) === String(v))).map(x => `<option value="${x.course_id}">${x.title}</option>`).join('');
            cSel.value = "";
            cSel.dispatchEvent(new Event('change'));
        }
    });

    if(cSel) cSel.addEventListener('change', (e) => {
        const v = e.target.value;
        const isFilter = e.target.id === 'modal-filter-course' || cSel.id === 'f-related';
        const optDefault = isFilter ? '<option value="">-- الكل --</option>' : '<option value="">-- بدون ارتباط --</option>';
        if(cntSel) {
            cntSel.innerHTML = optDefault + hData.contents.filter(x => !v || String(x.course_id) === String(v)).map(x => `<option value="${x.content_id}">${x.title}</option>`).join('');
            cntSel.value = "";
            cntSel.dispatchEvent(new Event('change'));
        }
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

    // التحقق المسبق من الحقول الإجبارية وإظهار تنبيه لطيف إذا كان هناك حقل ناقص
    const reqFields = Array.from(document.querySelectorAll('#cm-form-fields [required]'));
    for (const f of reqFields) {
        if (!f.value || !f.value.trim()) {
            const label = f.closest('div')?.querySelector('label')?.innerText.replace('*', '').trim() || 'أحد الحقول المطلوبة';
            window.showToast(`يرجى تحديد أو إدخال: ${label}`, 'warning');
            return;
        }
    }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    btn.disabled = true;

    try {
        let payload = {};
        const pk = getPrimaryKey();

        if (cmCurrentLevel === 'tracks') { payload = { name: document.getElementById('f-name').value, description: document.getElementById('f-desc').value, is_active: document.getElementById('f-active').checked }; } 
        else if (cmCurrentLevel === 'phases') { payload = { phase_id: document.getElementById('f-phase-id').value, track_id: document.getElementById('f-track-id').value, title: document.getElementById('f-title').value, description: document.getElementById('f-desc').value, image_url: document.getElementById('f-img-url').value, 'Module Time': document.getElementById('f-module-time').value, prerequisites: document.getElementById('f-prereq').value, will_learn: document.getElementById('f-will-learn').value, is_active: document.getElementById('f-active').checked }; } 
        else if (cmCurrentLevel === 'courses') { payload = { course_id: document.getElementById('f-course-id').value, phase_id: document.getElementById('f-phase-id').value, title: document.getElementById('f-title').value, description: document.getElementById('f-desc').value, type: document.getElementById('f-type').value, playlist_id: document.getElementById('f-playlist').value, image_url: document.getElementById('f-img-url').value, related_with: document.getElementById('f-related').value || null, auto_sync: document.getElementById('f-auto-sync').checked, is_active: document.getElementById('f-active').checked }; }
        else if (cmCurrentLevel === 'course_materials') { payload = { content_id: document.getElementById('f-content-id').value, course_id: document.getElementById('f-course-id').value, title: document.getElementById('f-title').value, type: document.getElementById('f-type').value, video_id: document.getElementById('f-video-id').value, duration: Math.round(parseFloat(document.getElementById('f-duration').value) * 60) || 0, order_index: parseInt(document.getElementById('f-order').value) || 0, base_xp: parseInt(document.getElementById('f-base-xp').value) || 0, ref_quiz_id: document.getElementById('f-ref-quiz').value || null, ref_project_id: document.getElementById('f-ref-project').value || null, status: document.getElementById('f-status').checked }; }
        else if (cmCurrentLevel === 'quizzes') { payload = { title: document.getElementById('f-title').value, description: document.getElementById('f-desc').value, passing_score: parseInt(document.getElementById('f-pass').value) || 50, max_xp: parseInt(document.getElementById('f-max-xp').value) || 50, attempts_allowed: parseInt(document.getElementById('f-attempts').value) || 3, questions_to_show: document.getElementById('f-q-show').value ? parseInt(document.getElementById('f-q-show').value) : null }; }
        else if (cmCurrentLevel === 'quiz_questions') { payload = { quiz_id: document.getElementById('f-quiz-id').value, question_text: document.getElementById('f-q-text').value, option_a: document.getElementById('f-opt-a').value, option_b: document.getElementById('f-opt-b').value, option_c: document.getElementById('f-opt-c').value, option_d: document.getElementById('f-opt-d').value, correct_answer: document.getElementById('f-correct').value, hint: document.getElementById('f-hint').value }; }
        else if (cmCurrentLevel === 'projects') { payload = { title: document.getElementById('f-title').value, description: document.getElementById('f-desc').value, requirements_url: document.getElementById('f-req-url').value, max_points: parseInt(document.getElementById('f-max-pts').value) || 100, submission_method: document.getElementById('f-method').value }; }
        else if (cmCurrentLevel === 'curriculum_documents') {
            payload = {
                title: document.getElementById('f-title').value,
                short_title: document.getElementById('f-short-title').value || null,
                description: document.getElementById('f-desc').value || null,
                cover_url: document.getElementById('f-cover-url').value || null,
                thumbnail_url: document.getElementById('f-thumbnail-url').value || null,
                document_type: document.getElementById('f-doc-type').value,
                importance: document.getElementById('f-importance').value,
                track_id: document.getElementById('f-track-id').value || null,
                phase_id: document.getElementById('f-phase-id').value || null,
                course_id: document.getElementById('f-course-id').value || null,
                lesson_id: document.getElementById('f-lesson-id').value || null,
                source_type: document.getElementById('f-source-type').value,
                source_url: document.getElementById('f-source-url').value,
                view_mode: document.getElementById('f-view-mode').value,
                order_index: parseInt(document.getElementById('f-order').value) || 0,
                completion_trigger: document.getElementById('f-completion-trigger').value,
                completion_pages_count: document.getElementById('f-completion-pages').value ? parseInt(document.getElementById('f-completion-pages').value) : null,
                completion_time_seconds: document.getElementById('f-completion-time').value ? parseInt(document.getElementById('f-completion-time').value) : null,
                estimated_reading_time: document.getElementById('f-reading-time').value ? parseInt(document.getElementById('f-reading-time').value) : null,
                xp_reward: parseInt(document.getElementById('f-base-xp').value) || 10,
                allow_download: document.getElementById('f-allow-download').checked,
                allow_print: document.getElementById('f-allow-print').checked,
                allow_copy: document.getElementById('f-allow-copy').checked,
                available_until: document.getElementById('f-expiry-date').value || null
            };
        }

        let insertedId = cmCurrentEditId;

        const isEditing = cmCurrentEditId !== null && cmCurrentEditId !== undefined && cmCurrentEditId !== '';

        if (isEditing) {
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
    if (!getCmPermission('edit', cmCurrentLevel, item)) {
        window.showToast?.('ليس لديك صلاحية لتعديل هذا السجل.', 'error');
        return;
    }
    cmCurrentEditId = id;
    document.getElementById('cm-modal-title').innerText = `تعديل السجل`;
    document.getElementById('cm-crud-modal').classList.remove('hidden');
    await generateFormFields(item);
    if (window.initSearchableSelects) window.initSearchableSelects();
};

// --- Advanced Cascading Delete Logic ---

function ensureDeleteModalExists() {
    if (document.getElementById('cm-delete-modal')) return;
    
    const container = document.createElement('div');
    container.innerHTML = `
        <div id="cm-delete-modal" class="fixed inset-0 z-[1000] hidden bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity dir-rtl">
            <div class="bg-b-surface border border-white/10 rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-fade-in relative text-right">
                <!-- Glowing Accent -->
                <div class="absolute top-0 right-0 w-full h-32 bg-red-500/5 blur-[50px] pointer-events-none"></div>
                
                <div class="p-5 border-b border-white/10 bg-white/5 flex justify-between items-center relative z-10">
                    <h3 class="text-base font-bold text-white flex items-center gap-2">
                        <i class="fas fa-trash-alt text-red-500"></i>
                        <span id="cm-delete-title">تأكيد الحذف المتقدم</span>
                    </h3>
                    <button onclick="document.getElementById('cm-delete-modal').classList.add('hidden')" class="text-gray-400 hover:text-red-400 w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="p-6 space-y-4 relative z-10">
                    <p id="cm-delete-message" class="text-sm text-gray-300 leading-relaxed"></p>
                    
                    <div id="cm-delete-options" class="space-y-2">
                        <!-- Dynamic checkboxes injected here -->
                    </div>
                    
                    <div class="pt-4 border-t border-white/10 flex gap-3">
                        <button type="button" id="cm-delete-btn-cancel" class="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold transition-all text-xs">إلغاء</button>
                        <button type="button" id="cm-delete-btn-confirm" class="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold transition-all text-xs">تأكيد الحذف</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(container);
}

function showCustomDeleteModal(level, itemName) {
    return new Promise((resolve) => {
        ensureDeleteModalExists();
        
        const modal = document.getElementById('cm-delete-modal');
        const titleEl = document.getElementById('cm-delete-title');
        const messageEl = document.getElementById('cm-delete-message');
        const optionsContainer = document.getElementById('cm-delete-options');
        const confirmBtn = document.getElementById('cm-delete-btn-confirm');
        const cancelBtn = document.getElementById('cm-delete-btn-cancel');
        
        titleEl.textContent = "تأكيد الحذف المتقدم";
        
        let levelTitle = LEVELS[level]?.title || level;
        if (level === 'tracks') levelTitle = 'مسار (Track)';
        else if (level === 'phases') levelTitle = 'مرحلة (Phase)';
        else if (level === 'courses') levelTitle = 'كورس (Course)';
        else if (level === 'course_materials') levelTitle = 'مادة تعليمية (Content)';
        else if (level === 'quizzes') levelTitle = 'اختبار (Quiz)';
        else if (level === 'quiz_questions') levelTitle = 'سؤال اختبار';
        else if (level === 'projects') levelTitle = 'مشروع (Project)';
        
        messageEl.innerHTML = `أنت على وشك حذف <strong>${itemName}</strong> (${levelTitle}).<br>برجاء تحديد الإجراء المطلوب للبيانات المرتبطة به:`;
        
        // Dynamic checkboxes based on level
        let optionsHtml = '';
        if (level === 'tracks') {
            optionsHtml = `
                <label class="flex items-center gap-3 text-sm text-gray-300 cursor-pointer bg-white/5 hover:bg-white/10 p-3 rounded-xl border border-white/5 transition-all">
                    <input type="checkbox" id="cm-del-cascade-phases" class="w-4 h-4 rounded border-white/10 text-b-primary bg-black focus:ring-0 focus:ring-offset-0">
                    <span>🔥 حذف جميع المراحل (Phases) المرتبطة بهذا المسار</span>
                </label>
            `;
        } else if (level === 'phases') {
            optionsHtml = `
                <label class="flex items-center gap-3 text-sm text-gray-300 cursor-pointer bg-white/5 hover:bg-white/10 p-3 rounded-xl border border-white/5 transition-all">
                    <input type="checkbox" id="cm-del-cascade-courses" class="w-4 h-4 rounded border-white/10 text-b-primary bg-black focus:ring-0 focus:ring-offset-0">
                    <span>🔥 حذف جميع الكورسات (Courses) المرتبطة بهذه المرحلة</span>
                </label>
            `;
        } else if (level === 'courses') {
            optionsHtml = `
                <div class="space-y-2">
                    <label class="flex items-center gap-3 text-sm text-gray-300 cursor-pointer bg-white/5 hover:bg-white/10 p-3 rounded-xl border border-white/5 transition-all">
                        <input type="checkbox" id="cm-del-cascade-materials" class="w-4 h-4 rounded border-white/10 text-b-primary bg-black focus:ring-0 focus:ring-offset-0" checked>
                        <span>🎬 حذف مواد ومحتويات هذا الكورس (فيديوهات، ملفات، إلخ)</span>
                    </label>
                    <div id="cm-course-child-options" class="mr-6 space-y-2">
                        <label class="flex items-center gap-3 text-sm text-gray-300 cursor-pointer bg-white/5 hover:bg-white/10 p-2.5 rounded-xl border border-white/5 transition-all">
                            <input type="checkbox" id="cm-del-cascade-quizzes" class="w-4 h-4 rounded border-white/10 text-b-primary bg-black focus:ring-0 focus:ring-offset-0" checked>
                            <span>📝 حذف الاختبارات (Quizzes) المرتبطة بمواد هذا الكورس</span>
                        </label>
                        <label class="flex items-center gap-3 text-sm text-gray-300 cursor-pointer bg-white/5 hover:bg-white/10 p-2.5 rounded-xl border border-white/5 transition-all">
                            <input type="checkbox" id="cm-del-cascade-projects" class="w-4 h-4 rounded border-white/10 text-b-primary bg-black focus:ring-0 focus:ring-offset-0" checked>
                            <span>💻 حذف المشاريع (Projects) المرتبطة بمواد هذا الكورس</span>
                        </label>
                    </div>
                </div>
            `;
        } else if (level === 'course_materials') {
            optionsHtml = `
                <div class="space-y-2">
                    <label class="flex items-center gap-3 text-sm text-gray-300 cursor-pointer bg-white/5 hover:bg-white/10 p-3 rounded-xl border border-white/5 transition-all">
                        <input type="checkbox" id="cm-del-cascade-mat-quiz" class="w-4 h-4 rounded border-white/10 text-b-primary bg-black focus:ring-0 focus:ring-offset-0" checked>
                        <span>📝 حذف الاختبار المرتبط (Quiz) إن وجد</span>
                    </label>
                    <label class="flex items-center gap-3 text-sm text-gray-300 cursor-pointer bg-white/5 hover:bg-white/10 p-3 rounded-xl border border-white/5 transition-all">
                        <input type="checkbox" id="cm-del-cascade-mat-project" class="w-4 h-4 rounded border-white/10 text-b-primary bg-black focus:ring-0 focus:ring-offset-0" checked>
                        <span>💻 حذف المشروع المرتبط (Project) إن وجد</span>
                    </label>
                </div>
            `;
        } else {
            optionsHtml = `<p class="text-xs text-yellow-500 font-bold bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-xl"><i class="fas fa-exclamation-triangle"></i> سيتم حذف هذا السجل نهائياً. لا توجد تبعيات معقدة بحاجة للاختيار.</p>`;
        }
        
        optionsContainer.innerHTML = optionsHtml;
        
        // Listeners for Course Cascade Checkboxes
        if (level === 'courses') {
            const matCb = document.getElementById('cm-del-cascade-materials');
            const qCb = document.getElementById('cm-del-cascade-quizzes');
            const pCb = document.getElementById('cm-del-cascade-projects');
            matCb?.addEventListener('change', () => {
                if (qCb) qCb.disabled = !matCb.checked;
                if (pCb) pCb.disabled = !matCb.checked;
                if (!matCb.checked) {
                    if (qCb) qCb.checked = false;
                    if (pCb) pCb.checked = false;
                }
            });
        }
        
        modal.classList.remove('hidden');
        
        const close = () => {
            modal.classList.add('hidden');
        };
        
        confirmBtn.onclick = () => {
            close();
            const selections = {};
            if (level === 'tracks') {
                selections.deletePhases = document.getElementById('cm-del-cascade-phases')?.checked || false;
            } else if (level === 'phases') {
                selections.deleteCourses = document.getElementById('cm-del-cascade-courses')?.checked || false;
            } else if (level === 'courses') {
                selections.deleteMaterials = document.getElementById('cm-del-cascade-materials')?.checked || false;
                selections.deleteQuizzes = document.getElementById('cm-del-cascade-quizzes')?.checked || false;
                selections.deleteProjects = document.getElementById('cm-del-cascade-projects')?.checked || false;
            } else if (level === 'course_materials') {
                selections.deleteQuiz = document.getElementById('cm-del-cascade-mat-quiz')?.checked || false;
                selections.deleteProject = document.getElementById('cm-del-cascade-mat-project')?.checked || false;
            }
            resolve({ confirmed: true, selections });
        };
        
        cancelBtn.onclick = () => {
            close();
            resolve({ confirmed: false });
        };
    });
}

// Helpers for cascading deletes

// Helpers for cascading deletes

async function deleteQuizCascade(quizId) {
    if (!quizId) return;
    // 1. attempts
    const { error: errAttempts } = await supabase.from('quiz_attempts').delete().eq('quiz_id', quizId);
    if (errAttempts) console.warn("Could not delete quiz_attempts:", errAttempts);

    // 2. states
    const { error: errStates } = await supabase.from('active_quiz_states').delete().eq('quiz_id', quizId);
    if (errStates) console.warn("Could not delete active_quiz_states:", errStates);

    // 3. questions
    const { error: errQuestions } = await supabase.from('quiz_questions').delete().eq('quiz_id', quizId);
    if (errQuestions) throw errQuestions;

    // 4. remove references in course_materials
    const { error: errMat } = await supabase.from('course_materials').update({ ref_quiz_id: null }).eq('ref_quiz_id', quizId);
    if (errMat) console.warn("Could not unlink ref_quiz_id from course_materials:", errMat);

    // 5. delete quiz
    const { error: errQuiz } = await supabase.from('quizzes').delete().eq('quiz_id', quizId);
    if (errQuiz) throw errQuiz;
}

async function deleteProjectCascade(projectId) {
    if (!projectId) return;
    // 1. submissions
    const { error: errSub } = await supabase.from('project_submissions').delete().eq('project_id', projectId);
    if (errSub) console.warn("Could not delete project_submissions:", errSub);

    // 2. remove references in course_materials
    const { error: errMat } = await supabase.from('course_materials').update({ ref_project_id: null }).eq('ref_project_id', projectId);
    if (errMat) console.warn("Could not unlink ref_project_id from course_materials:", errMat);

    // 3. delete project
    const { error: errProj } = await supabase.from('projects').delete().eq('id', projectId);
    if (errProj) throw errProj;
}

async function deleteMaterialCascade(contentId, selections = { deleteQuiz: true, deleteProject: true }) {
    if (!contentId) return;
    
    // Fetch material info first to get quiz and project ids
    const { data: material } = await supabase.from('course_materials')
        .select('ref_quiz_id, ref_project_id')
        .eq('content_id', contentId)
        .maybeSingle();
        
    if (material) {
        // 1. completed_materials
        const { error: errComp } = await supabase.from('completed_materials').delete().eq('material_id', contentId);
        if (errComp) console.warn("Could not delete completed_materials:", errComp);

        // 2. team_tasks
        const { error: errTasks } = await supabase.from('team_tasks').update({ content_id: null }).eq('content_id', contentId);
        if (errTasks) console.warn("Could not unlink team_tasks content_id:", errTasks);

        // 3. curriculum_documents
        try {
            await supabase.from('curriculum_documents').delete().eq('lesson_id', contentId);
        } catch (_) {}
        
        // 4. Delete linked quiz if requested
        if (selections.deleteQuiz && material.ref_quiz_id) {
            await deleteQuizCascade(material.ref_quiz_id);
        }
        
        // 5. Delete linked project if requested
        if (selections.deleteProject && material.ref_project_id) {
            await deleteProjectCascade(material.ref_project_id);
        }
    }
    
    // 6. Delete the material itself
    const { error: delMatErr } = await supabase.from('course_materials').delete().eq('content_id', contentId);
    if (delMatErr) throw delMatErr;
}

async function deleteCourseCascade(courseId, selections = { deleteMaterials: true, deleteQuizzes: true, deleteProjects: true }) {
    if (!courseId) return;
    
    // 1. Unlink other courses that reference this course (e.g. related_with)
    await supabase.from('courses').update({ related_with: null }).eq('related_with', courseId);

    // 2. Delete enrollments and completed_materials referencing this course
    const { error: errEnroll } = await supabase.from('enrollments').delete().eq('course_id', courseId);
    if (errEnroll) console.warn("Could not delete enrollments directly:", errEnroll);

    const { error: errComp } = await supabase.from('completed_materials').delete().eq('course_id', courseId);
    if (errComp) console.warn("Could not delete completed_materials directly:", errComp);

    // 3. Unlink team_tasks
    await supabase.from('team_tasks').update({ course_id: null }).eq('course_id', courseId);

    // 4. Delete curriculum_documents linked to this course
    try {
        await supabase.from('curriculum_documents').delete().eq('course_id', courseId);
    } catch (_) {}
    
    if (selections.deleteMaterials) {
        // Find materials
        const { data: materials } = await supabase.from('course_materials')
            .select('content_id, ref_quiz_id, ref_project_id')
            .eq('course_id', courseId);
            
        if (materials && materials.length > 0) {
            const matIds = materials.map(m => m.content_id);
            // Delete completed_materials for these
            await supabase.from('completed_materials').delete().in('material_id', matIds);
            await supabase.from('team_tasks').update({ content_id: null }).in('content_id', matIds);
            try {
                await supabase.from('curriculum_documents').delete().in('lesson_id', matIds);
            } catch (_) {}
            
            // Delete quizzes if checked
            if (selections.deleteQuizzes) {
                const quizIds = materials.map(m => m.ref_quiz_id).filter(Boolean);
                for (const qId of quizIds) {
                    await deleteQuizCascade(qId);
                }
            }
            
            // Delete projects if checked
            if (selections.deleteProjects) {
                const projIds = materials.map(m => m.ref_project_id).filter(Boolean);
                for (const pId of projIds) {
                    await deleteProjectCascade(pId);
                }
            }
            
            // Delete materials
            const { error: delMatErr } = await supabase.from('course_materials').delete().eq('course_id', courseId);
            if (delMatErr) throw delMatErr;
        }
    } else {
        // Just unlink them
        const { error: unlinkMatErr } = await supabase.from('course_materials').update({ course_id: null }).eq('course_id', courseId);
        if (unlinkMatErr) throw unlinkMatErr;
    }
    
    // 5. Delete the course itself
    const { error: delCourseErr } = await supabase.from('courses').delete().eq('course_id', courseId);
    if (delCourseErr) throw delCourseErr;
}

async function deletePhaseCascade(phaseId, selections = { deleteCourses: true }) {
    if (!phaseId) return;

    // 1. Delete curriculum_documents linked to this phase
    try {
        await supabase.from('curriculum_documents').delete().eq('phase_id', phaseId);
    } catch (_) {}
    
    if (selections.deleteCourses) {
        const { data: courses } = await supabase.from('courses')
            .select('course_id')
            .eq('phase_id', phaseId);
            
        if (courses && courses.length > 0) {
            for (const c of courses) {
                await deleteCourseCascade(c.course_id, { deleteMaterials: true, deleteQuizzes: true, deleteProjects: true });
            }
        }
    } else {
        // Unlink courses
        const { error: unlinkErr } = await supabase.from('courses').update({ phase_id: null }).eq('phase_id', phaseId);
        if (unlinkErr) throw unlinkErr;
    }
    
    // Delete phase
    const { error: delPhaseErr } = await supabase.from('phases').delete().eq('phase_id', phaseId);
    if (delPhaseErr) throw delPhaseErr;
}

async function deleteTrackCascade(trackId, selections = { deletePhases: true }) {
    if (!trackId) return;

    // 1. Delete curriculum_documents linked to this track
    try {
        await supabase.from('curriculum_documents').delete().eq('track_id', trackId);
    } catch (_) {}
    
    if (selections.deletePhases) {
        const { data: phases } = await supabase.from('phases')
            .select('phase_id')
            .eq('track_id', trackId);
            
        if (phases && phases.length > 0) {
            for (const p of phases) {
                await deletePhaseCascade(p.phase_id, { deleteCourses: true });
            }
        }
    } else {
        // Unlink phases
        const { error: unlinkErr } = await supabase.from('phases').update({ track_id: null }).eq('track_id', trackId);
        if (unlinkErr) throw unlinkErr;
    }
    
    // Delete track
    const { error: delTrackErr } = await supabase.from('tracks').delete().eq('id', trackId);
    if (delTrackErr) throw delTrackErr;
}

window.cmDeleteItem = async (id) => {
    const item = rawData.find(r => String(r[getPrimaryKey()]) === String(id));
    if (!item) {
        window.showToast("لم يتم العثور على العنصر المراد حذفه.", "error");
        return;
    }
    if (!getCmPermission('delete', cmCurrentLevel, item)) {
        window.showToast?.('ليس لديك صلاحية لحذف هذا السجل.', 'error');
        return;
    }
    
    const titleKey = LEVELS[cmCurrentLevel]?.title || 'title';
    const itemName = item[titleKey] || item.name || id;
    
    const { confirmed, selections } = await showCustomDeleteModal(cmCurrentLevel, itemName);
    if (!confirmed) return;
    
    window.showToast("جاري تنفيذ عملية الحذف...", "info");
    
    try {
        if (cmCurrentLevel === 'tracks') {
            await deleteTrackCascade(id, selections);
        } else if (cmCurrentLevel === 'phases') {
            await deletePhaseCascade(id, selections);
        } else if (cmCurrentLevel === 'courses') {
            await deleteCourseCascade(id, selections);
        } else if (cmCurrentLevel === 'course_materials') {
            await deleteMaterialCascade(id, selections);
        } else if (cmCurrentLevel === 'quizzes') {
            await deleteQuizCascade(id);
        } else if (cmCurrentLevel === 'projects') {
            await deleteProjectCascade(id);
        } else {
            // For other levels (quiz_questions, etc.), delete directly
            const { error } = await supabase.from(cmCurrentLevel).delete().eq(getPrimaryKey(), id);
            if (error) throw error;
        }
        
        // Reset the cache so that filters are reloaded with fresh database values
        hierarchyCache = null;
        
        window.showToast("تم الحذف بنجاح", "success");
        loadTableData();
    } catch (err) {
        console.error("Delete Error:", err);
        const detailMsg = err.details || err.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
        window.showToast("فشل الحذف: " + detailMsg, "error");
    }
};

// AIzaSyAXZGvITGiO_jiP3Ec06dmHYMA1go4VhV4



// ==========================================
// 🚀 YOUTUBE SMART IMPORT ENGINE
// ==========================================




// AIzaSyBAywMAFWf_ESEoWPun0IpY-koelmqzYiE
//////AIzaSyDWVNKHpYGyA5BWNKRZE4T8gQvij6o6ats



const YOUTUBE_API_KEY = 'AIzaSyCWgO83PcbcoWOkZYsBnzsyPHSdrzaaQ7Y'; 
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
                const thumb = snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '../../assets/icons/BUSLA-icon.png';
                const isDeleted = snippet.title === 'Private video' || snippet.title === 'Deleted video';
                return { id: `vid_${Date.now()}_${i}`, videoId: vId, title: snippet.title, duration: durationsMap[vId] || 0, thumbnail: thumb, order_index: i + 1, type: 'video', is_excluded: isDeleted, base_xp: 10 };
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
        const totalXP = activeVideos.filter(v => v.type !== 'section').reduce((acc, curr) => acc + (curr.base_xp || 0), 0);
        const xpEl = document.getElementById('yt-total-xp');
        if (xpEl) xpEl.innerText = totalXP;


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
                <div class="flex items-center gap-2 border-l border-white/10 pl-3">
                    ${vid.type !== 'section' ? `
                    <div class="flex flex-col items-center gap-0.5">
                        <label class="text-[9px] text-yellow-500/70 font-bold uppercase tracking-wider"><i class="fas fa-star text-[8px]"></i> XP</label>
                        <input type="number" min="0" value="${vid.base_xp ?? 10}" onchange="ytImportEngine.updateVidData(${index}, 'base_xp', parseInt(this.value)||0)" class="w-16 bg-black/60 border border-yellow-500/30 rounded-lg px-2 py-1 text-xs text-yellow-400 font-bold text-center outline-none focus:border-yellow-500 transition-colors" ${vid.is_excluded ? 'disabled' : ''}>
                    </div>` : '<div class="w-16"></div>'}
                    <button onclick="ytImportEngine.toggleExclude(${index})" class="w-8 h-8 rounded-lg flex items-center justify-center transition-all ${vid.is_excluded ? 'bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-white/5 text-gray-400 hover:text-red-400'}" title="${vid.is_excluded ? 'Restore' : 'Exclude'}">
                        <i class="fas ${vid.is_excluded ? 'fa-undo' : 'fa-ban'}"></i>
                    </button>
                </div>
            </div>`;
        }).join('');
    },

    updateVidData: (index, key, val) => { ytImportEngine.state.videos[index][key] = val; ytImportEngine.runHealthCheck(); },
    toggleExclude: (index) => { ytImportEngine.state.videos[index].is_excluded = !ytImportEngine.state.videos[index].is_excluded; ytImportEngine.updateVideosUI(); ytImportEngine.runHealthCheck(); },
    applyBulkXP: () => {
        const val = parseInt(document.getElementById('yt-bulk-xp').value) || 10;
        ytImportEngine.state.videos.forEach(vid => { if (vid.type !== 'section') vid.base_xp = val; });
        ytImportEngine.updateVideosUI();
        window.showToast(`تم تطبيق ${val} XP على جميع الفيديوهات`, 'success');
    },
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
                    base_xp: vid.type === 'section' ? 0 : (vid.base_xp ?? 10),
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

        // إخفاء القائمة الأصلية بطريقة آمنة لا تعطل تركيز المتصفح أو الـ HTML5 validation
        select.style.position = 'absolute';
        select.style.opacity = '0';
        select.style.pointerEvents = 'none';
        select.style.width = '1px';
        select.style.height = '1px';
        select.style.margin = '0';
        select.style.padding = '0';
        select.style.border = 'none';

        const ui = document.createElement('div');
        ui.className = 'custom-select-ui relative w-full dir-rtl text-right';

        // الزر الذي يظهر للمستخدم
        const trigger = document.createElement('div');
        trigger.className = 'w-full bg-black/60 border border-white/10 hover:border-white/20 rounded-xl px-4 py-3 text-sm text-white focus:border-b-primary outline-none transition-all cursor-pointer flex justify-between items-center gap-2 shadow-inner';
        
        const textSpan = document.createElement('span');
        textSpan.setAttribute('dir', 'auto');
        textSpan.style.unicodeBidi = 'plaintext';
        textSpan.style.textAlign = 'start';
        textSpan.className = 'flex-1 min-w-0 truncate text-start';
        
        const icon = document.createElement('i');
        icon.className = 'fas fa-chevron-down text-gray-400 text-xs shrink-0 transition-transform duration-200';

        trigger.appendChild(textSpan);
        trigger.appendChild(icon);

        // القائمة المنسدلة وشريط البحث
        const dropdown = document.createElement('div');
        dropdown.className = 'absolute z-[999] right-0 min-w-full w-max max-w-[min(90vw,560px)] bg-[#121212] border border-white/15 rounded-2xl mt-1.5 hidden shadow-2xl flex flex-col max-h-72 overflow-hidden backdrop-blur-xl animate-fade-in';

        const searchWrap = document.createElement('div');
        searchWrap.className = 'p-2.5 border-b border-white/10 bg-[#1a1a1a] shrink-0';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = '🔍 ابحث بالاسم أو المعرف...';
        searchInput.className = 'w-full bg-black/80 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white outline-none focus:border-b-primary dir-rtl text-right placeholder-gray-500';
        searchWrap.appendChild(searchInput);

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'overflow-y-auto custom-scroll p-1.5 flex-1 divide-y divide-white/[0.03]';

        dropdown.appendChild(searchWrap);
        dropdown.appendChild(optionsContainer);

        ui.appendChild(trigger);
        ui.appendChild(dropdown);
        
        select.parentNode.insertBefore(ui, select.nextSibling);

        // دالة تحديث الواجهة عند تغير القائمة الأصلية (مثال: الفلترة الهرمية)
        const updateUI = () => {
            const selectedOpt = select.options[select.selectedIndex];
            const currentText = selectedOpt ? selectedOpt.text : 'اختر...';
            textSpan.innerText = currentText;
            textSpan.title = currentText;
            trigger.title = currentText;
            
            if (selectedOpt && selectedOpt.value === "") {
                textSpan.className = 'text-gray-500 flex-1 min-w-0 truncate text-start text-xs sm:text-sm';
            } else {
                textSpan.className = 'text-white font-bold flex-1 min-w-0 truncate text-start text-xs sm:text-sm';
            }
            
            optionsContainer.innerHTML = '';
            Array.from(select.options).forEach((opt) => {
                if (opt.disabled && opt.value === "") return; // تجاهل الـ Placeholder
                const div = document.createElement('div');
                div.className = 'px-3.5 py-2.5 text-xs sm:text-sm text-gray-300 hover:bg-b-primary/20 hover:text-white cursor-pointer rounded-xl transition-all whitespace-normal break-words leading-relaxed mb-1 border border-transparent flex items-center justify-between gap-2';
                div.setAttribute('dir', 'auto');
                div.style.unicodeBidi = 'plaintext';
                div.style.textAlign = 'start';
                div.title = opt.text;
                
                const optSpan = document.createElement('span');
                optSpan.className = 'flex-1 text-start';
                optSpan.setAttribute('dir', 'auto');
                optSpan.style.unicodeBidi = 'plaintext';
                optSpan.style.textAlign = 'start';
                optSpan.innerText = opt.text;
                div.appendChild(optSpan);

                if (opt.selected) {
                    div.classList.add('bg-b-primary/25', 'text-b-primary', 'font-bold', 'border-b-primary/30');
                    const checkIcon = document.createElement('i');
                    checkIcon.className = 'fas fa-check text-xs text-b-primary shrink-0';
                    div.appendChild(checkIcon);
                }

                div.onclick = (e) => {
                    e.stopPropagation();
                    select.value = opt.value;
                    select.dispatchEvent(new Event('change')); // إطلاق حدث التغيير لتفعيل الفلترة المتسلسلة
                    dropdown.classList.add('hidden');
                    icon.style.transform = 'rotate(0deg)';
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
                item.style.display = text.includes(term) ? 'flex' : 'none';
            });
        });

        // فتح وإغلاق القائمة
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.custom-select-ui .absolute').forEach(d => {
                if (d !== dropdown) {
                    d.classList.add('hidden');
                    const parentTrigger = d.previousElementSibling;
                    if (parentTrigger) {
                        const prevIcon = parentTrigger.querySelector('i');
                        if (prevIcon) prevIcon.style.transform = 'rotate(0deg)';
                    }
                }
            });
            const isHidden = dropdown.classList.toggle('hidden');
            icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
            if (!isHidden) {
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input')); 
                searchInput.focus(); // نقل المؤشر فوراً لشريط البحث
            }
        });

        // إغلاق القائمة عند الضغط خارجها
        document.addEventListener('click', (e) => {
            if (!ui.contains(e.target)) {
                dropdown.classList.add('hidden');
                icon.style.transform = 'rotate(0deg)';
            }
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

// ==========================================
// 🎬 SMART VIDEO METADATA & DURATION ENGINE
// ==========================================

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function extractYouTubeId(source) {
    if (!source) return null;
    const str = source.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
    const match = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
    if (match && match[1]) return match[1];
    return null;
}

function parseISO8601Duration(isoDuration) {
    if (!isoDuration) return 0;
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const h = parseInt(match[1] || 0, 10);
    const m = parseInt(match[2] || 0, 10);
    const s = parseInt(match[3] || 0, 10);
    return (h * 3600) + (m * 60) + s;
}

function formatDurationArabic(seconds) {
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const parts = [];
    if (h > 0) parts.push(`${h} ${h === 1 ? 'ساعة' : (h === 2 ? 'ساعتان' : (h <= 10 ? 'ساعات' : 'ساعة'))}`);
    if (m > 0) parts.push(`${m} ${m === 1 ? 'دقيقة' : (m === 2 ? 'دقيقتان' : (m <= 10 ? 'دقائق' : 'دقيقة'))}`);
    if (sec > 0 && h === 0) parts.push(`${sec} ثانية`);
    return parts.join(' و ') || 'أقل من دقيقة';
}

function formatMinutesValue(seconds) {
    if (!seconds || seconds <= 0) return 0;
    const mins = +(seconds / 60).toFixed(1);
    return (mins % 1 === 0) ? String(mins) : mins.toFixed(1);
}

function ensureYouTubeIframeApi(callback) {
    if (window.YT && window.YT.Player) {
        if (callback) callback();
        return;
    }
    const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (!existing) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
    }
    const checkInterval = setInterval(() => {
        if (window.YT && window.YT.Player) {
            clearInterval(checkInterval);
            if (callback) callback();
        }
    }, 100);
    setTimeout(() => clearInterval(checkInterval), 5000);
}

async function fetchVideoMetadata(source) {
    if (!source || !source.trim()) return null;
    const cleanSource = source.trim();

    // 1. YouTube
    const ytId = extractYouTubeId(cleanSource);
    if (ytId) {
        let meta = {
            type: 'youtube',
            videoId: ytId,
            title: '',
            channelTitle: '',
            durationSec: 0,
            thumbnail: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
            embedUrl: `https://www.youtube.com/embed/${ytId}?enablejsapi=1`
        };

        // Try YouTube Data API v3
        try {
            const apiRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${ytId}&key=${YOUTUBE_API_KEY}`);
            if (apiRes.ok) {
                const apiData = await apiRes.json();
                if (apiData.items && apiData.items.length > 0) {
                    const item = apiData.items[0];
                    meta.title = item.snippet?.title || '';
                    meta.channelTitle = item.snippet?.channelTitle || '';
                    meta.durationSec = parseISO8601Duration(item.contentDetails?.duration);
                    if (item.snippet?.thumbnails?.high?.url) {
                        meta.thumbnail = item.snippet.thumbnails.high.url;
                    }
                    return meta;
                }
            }
        } catch (apiErr) {
            console.warn("YouTube Data API fetch failed or restricted:", apiErr);
        }

        // Fallback: YouTube oEmbed for Title & Author
        try {
            const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`);
            if (oembedRes.ok) {
                const oembedData = await oembedRes.json();
                meta.title = oembedData.title || meta.title;
                meta.channelTitle = oembedData.author_name || meta.channelTitle;
                if (oembedData.thumbnail_url) meta.thumbnail = oembedData.thumbnail_url;
            }
        } catch (oembedErr) {
            console.warn("YouTube oEmbed fetch failed:", oembedErr);
        }

        return meta;
    }

    // 2. Direct Video (mp4, webm, etc.)
    if (cleanSource.match(/\.(mp4|webm|ogg|m4v)(\?.*)?$/i) || cleanSource.startsWith('blob:')) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = cleanSource;
            video.onloadedmetadata = () => {
                const dur = Math.round(video.duration || 0);
                resolve({
                    type: 'direct',
                    videoId: cleanSource,
                    title: cleanSource.split('/').pop().split('?')[0] || 'فيديو مباشر',
                    channelTitle: 'فيديو مباشر',
                    durationSec: dur,
                    thumbnail: '',
                    embedUrl: cleanSource
                });
            };
            video.onerror = () => {
                resolve({
                    type: 'direct',
                    videoId: cleanSource,
                    title: '',
                    channelTitle: '',
                    durationSec: 0,
                    thumbnail: '',
                    embedUrl: cleanSource
                });
            };
            setTimeout(() => {
                resolve({
                    type: 'direct',
                    videoId: cleanSource,
                    title: '',
                    channelTitle: '',
                    durationSec: 0,
                    thumbnail: '',
                    embedUrl: cleanSource
                });
            }, 3000);
        });
    }

    // 3. Google Drive
    if (cleanSource.includes('drive.google.com') || cleanSource.includes('drive.usercontent.google.com')) {
        const idMatch = cleanSource.match(/\/d\/([-\w]{25,})/) || cleanSource.match(/id=([-\w]{25,})/);
        return {
            type: 'drive',
            videoId: idMatch ? idMatch[1] : cleanSource,
            title: '',
            channelTitle: 'Google Drive',
            durationSec: 0,
            thumbnail: '',
            embedUrl: idMatch ? `https://drive.google.com/file/d/${idMatch[1]}/preview` : cleanSource
        };
    }

    return null;
}

function applyVideoMetadataToForm(meta, notify = true) {
    if (!meta) return;

    const durInput = document.getElementById('f-duration');
    const titleInput = document.getElementById('f-title');
    const badgeEl = document.getElementById('admin-video-meta-badge');
    const detailsEl = document.getElementById('admin-video-preview-details');

    // 1. Duration in Minutes
    if (durInput && meta.durationSec > 0) {
        const minVal = formatMinutesValue(meta.durationSec);
        durInput.value = minVal;
        
        // Highlight animation
        durInput.classList.add('ring-2', 'ring-emerald-500', 'bg-emerald-500/10');
        setTimeout(() => durInput.classList.remove('ring-2', 'ring-emerald-500', 'bg-emerald-500/10'), 2500);
    }

    // 2. Title Auto-population
    let titleUpdated = false;
    if (titleInput && meta.title) {
        if (!titleInput.value || !titleInput.value.trim()) {
            titleInput.value = meta.title;
            titleUpdated = true;
            titleInput.classList.add('ring-2', 'ring-cyan-500', 'bg-cyan-500/10');
            setTimeout(() => titleInput.classList.remove('ring-2', 'ring-cyan-500', 'bg-cyan-500/10'), 2500);
        }
    }

    // 3. Clean video ID in input if YouTube
    const videoInput = document.getElementById('f-video-id');
    if (videoInput && meta.type === 'youtube' && meta.videoId) {
        if (videoInput.value.trim() !== meta.videoId && videoInput.value.includes('http')) {
            videoInput.value = meta.videoId;
        }
    }

    // 4. Update Badge below URL input
    if (badgeEl) {
        badgeEl.classList.remove('hidden');
        badgeEl.className = 'text-xs py-2.5 px-4 rounded-xl border transition-all duration-300 bg-teal-500/10 border-teal-500/30 text-teal-300 flex flex-wrap items-center justify-between gap-3';
        
        const durText = meta.durationSec > 0 ? formatDurationArabic(meta.durationSec) : 'جاري فحص المدة...';
        const minsText = meta.durationSec > 0 ? `(${formatMinutesValue(meta.durationSec)} دقيقة)` : '';
        const titleText = meta.title ? `<strong class="text-white">${escapeHtml(meta.title)}</strong>` : 'فيديو تعليمي';
        const authorText = meta.channelTitle ? `<span class="text-gray-400">(${escapeHtml(meta.channelTitle)})</span>` : '';

        let badgeHtml = `
            <div class="flex items-center gap-2 flex-wrap">
                <i class="fas fa-check-circle text-teal-400"></i>
                <span>تم جلب البيانات: ${titleText} ${authorText}</span>
                <span class="text-yellow-400 font-bold mr-2"><i class="fas fa-stopwatch ml-1"></i> ${durText} ${minsText}</span>
            </div>
        `;

        if (titleInput && meta.title && !titleUpdated && titleInput.value.trim() !== meta.title) {
            badgeHtml += `
                <button type="button" id="btn-use-video-title" class="text-[11px] bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 px-2.5 py-1 rounded-lg border border-teal-500/40 transition-colors">
                    اعتماد هذا العنوان للدرس ↩
                </button>
            `;
        }

        badgeEl.innerHTML = badgeHtml;

        const useTitleBtn = document.getElementById('btn-use-video-title');
        if (useTitleBtn) {
            useTitleBtn.onclick = () => {
                if (titleInput) {
                    titleInput.value = meta.title;
                    titleInput.classList.add('ring-2', 'ring-cyan-500', 'bg-cyan-500/10');
                    setTimeout(() => titleInput.classList.remove('ring-2', 'ring-cyan-500', 'bg-cyan-500/10'), 2500);
                    window.showToast("تم اعتماد عنوان الفيديو بنجاح", "success");
                    useTitleBtn.remove();
                }
            };
        }
    }

    // 5. Update Preview Details under the player
    if (detailsEl) {
        detailsEl.classList.remove('hidden');
        detailsEl.innerHTML = `
            <div class="flex items-center justify-between text-gray-300">
                <span class="font-bold text-white"><i class="fab fa-youtube text-red-500 ml-1"></i> ${escapeHtml(meta.title || 'فيديو يوتيوب')}</span>
                <span class="text-teal-400 font-mono text-xs"><i class="fas fa-clock ml-1"></i> ${meta.durationSec > 0 ? formatDurationArabic(meta.durationSec) : 'جاري الفحص...'}</span>
            </div>
            ${meta.channelTitle ? `<p class="text-[11px] text-gray-400 flex items-center gap-1"><i class="fas fa-user-circle"></i> القناة / المصدر: ${escapeHtml(meta.channelTitle)}</p>` : ''}
        `;
    }

    if (notify) {
        if (meta.durationSec > 0) {
            window.showToast(`✓ تم جلب مدة الفيديو: ${formatMinutesValue(meta.durationSec)} دقيقة (${formatDurationArabic(meta.durationSec)})`, "success");
        } else if (meta.title) {
            window.showToast(`✓ تم استخراج بيانات الفيديو: ${meta.title}`, "info");
        }
    }
}

let currentYtAdminPlayer = null;

function renderVideoPreview(meta) {
    const previewWrapper = document.getElementById('admin-video-preview-wrapper');
    const previewContent = document.getElementById('admin-video-preview-content');
    if (!previewWrapper || !previewContent) return;

    previewWrapper.classList.remove('hidden');
    previewContent.innerHTML = '';

    if (meta.type === 'youtube') {
        const playerContainer = document.createElement('div');
        playerContainer.id = 'admin-yt-preview-iframe';
        playerContainer.className = 'w-full h-full';
        previewContent.appendChild(playerContainer);

        ensureYouTubeIframeApi(() => {
            if (window.YT && window.YT.Player) {
                try {
                    if (currentYtAdminPlayer && typeof currentYtAdminPlayer.destroy === 'function') {
                        currentYtAdminPlayer.destroy();
                    }
                    currentYtAdminPlayer = new window.YT.Player('admin-yt-preview-iframe', {
                        videoId: meta.videoId,
                        playerVars: {
                            autoplay: 0,
                            modestbranding: 1,
                            rel: 0
                        },
                        events: {
                            onReady: (e) => {
                                const dur = e.target.getDuration();
                                if (dur && dur > 0 && (!meta.durationSec || meta.durationSec === 0)) {
                                    meta.durationSec = dur;
                                    applyVideoMetadataToForm(meta, false);
                                }
                                if (e.target.getVideoData) {
                                    const vData = e.target.getVideoData();
                                    if (vData && vData.title && !meta.title) {
                                        meta.title = vData.title;
                                        applyVideoMetadataToForm(meta, false);
                                    }
                                }
                            },
                            onStateChange: (e) => {
                                const dur = e.target.getDuration();
                                if (dur && dur > 0 && (!meta.durationSec || meta.durationSec === 0)) {
                                    meta.durationSec = dur;
                                    applyVideoMetadataToForm(meta, false);
                                }
                            }
                        }
                    });
                    return;
                } catch (ytErr) {
                    console.warn("Could not init YT.Player:", ytErr);
                }
            }
        });

        // Fallback standard iframe immediately if YT API is taking time or failed
        setTimeout(() => {
            if (!currentYtAdminPlayer && previewContent.querySelector('#admin-yt-preview-iframe')) {
                const iframe = document.createElement('iframe');
                iframe.src = meta.embedUrl;
                iframe.className = 'w-full h-full border-0';
                iframe.setAttribute('allow', 'autoplay; encrypted-media');
                iframe.setAttribute('allowfullscreen', '');
                previewContent.innerHTML = '';
                previewContent.appendChild(iframe);
            }
        }, 1500);

    } else if (meta.type === 'direct') {
        const video = document.createElement('video');
        video.src = meta.embedUrl;
        video.controls = true;
        video.className = 'w-full h-full object-contain';
        video.onloadedmetadata = () => {
            if (video.duration && (!meta.durationSec || meta.durationSec === 0)) {
                meta.durationSec = Math.round(video.duration);
                applyVideoMetadataToForm(meta, false);
            }
        };
        previewContent.appendChild(video);
    } else if (meta.type === 'drive') {
        const iframe = document.createElement('iframe');
        iframe.src = meta.embedUrl;
        iframe.className = 'w-full h-full border-0';
        iframe.setAttribute('allow', 'autoplay');
        iframe.setAttribute('allowfullscreen', '');
        previewContent.appendChild(iframe);
    } else {
        previewContent.innerHTML = `<p class="text-gray-400 text-sm">عذراً، لم نتمكن من تحديد نوع الرابط للمعاينة.</p>`;
    }
}

window.fetchAndPreviewAdminVideo = async function(isManual = false, showPreview = true) {
    const videoInput = document.getElementById('f-video-id');
    const previewWrapper = document.getElementById('admin-video-preview-wrapper');
    const previewContent = document.getElementById('admin-video-preview-content');
    const badgeEl = document.getElementById('admin-video-meta-badge');
    const fetchBtn = document.getElementById('btn-fetch-video-meta');

    if (!videoInput) return;
    const source = videoInput.value.trim();
    if (!source) {
        if (isManual) window.showToast("برجاء إدخال رابط أو معرف الفيديو أولاً!", "warning");
        return;
    }

    if (fetchBtn) {
        fetchBtn.disabled = true;
        fetchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>جاري الجلب...</span>';
    }

    if (badgeEl) {
        badgeEl.classList.remove('hidden');
        badgeEl.className = 'text-xs py-2 px-3 rounded-xl border bg-cyan-500/10 border-cyan-500/20 text-cyan-300 flex items-center gap-2';
        badgeEl.innerHTML = '<i class="fas fa-spinner fa-spin text-cyan-400"></i> <span>جاري فحص الرابط واستخراج المدة والبيانات عبر الـ API...</span>';
    }

    try {
        const meta = await fetchVideoMetadata(source);
        if (meta) {
            applyVideoMetadataToForm(meta, isManual);
            
            if (showPreview && previewWrapper && previewContent) {
                renderVideoPreview(meta);
            }
        } else {
            if (isManual) window.showToast("لم نتمكن من تحليل هذا الرابط، يمكنك إدخال المدة يدوياً.", "info");
            if (showPreview && previewWrapper && previewContent) {
                previewContent.innerHTML = '';
                previewWrapper.classList.remove('hidden');
                const iframe = document.createElement('iframe');
                iframe.src = source.startsWith('http') ? source : `https://www.youtube.com/embed/${source}`;
                iframe.className = 'w-full h-full border-0';
                iframe.setAttribute('allow', 'autoplay; encrypted-media');
                iframe.setAttribute('allowfullscreen', '');
                previewContent.appendChild(iframe);
            }
        }
    } catch (err) {
        console.error("Error in fetchAndPreviewAdminVideo:", err);
        if (isManual) window.showToast("حدث خطأ أثناء جلب بيانات الفيديو: " + err.message, "error");
    } finally {
        if (fetchBtn) {
            fetchBtn.disabled = false;
            fetchBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> <span>جلب المدة</span>';
        }
    }
};

window.previewAdminVideo = function() {
    window.fetchAndPreviewAdminVideo(true, true);
};

function bindVideoMetadataAutoFetch() {
    const videoInput = document.getElementById('f-video-id');
    if (!videoInput) return;

    let debounceTimer = null;
    const triggerFetch = () => {
        const val = videoInput.value.trim();
        if (!val) return;
        window.fetchAndPreviewAdminVideo(false, false);
    };

    videoInput.addEventListener('paste', () => {
        setTimeout(() => triggerFetch(), 150);
    });

    videoInput.addEventListener('change', () => {
        triggerFetch();
    });

    videoInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const val = videoInput.value.trim();
            if (val.length >= 11 && (val.includes('youtu') || /^[-\w]{11}$/.test(val))) {
                triggerFetch();
            }
        }, 800);
    });
}

window.cmPreviewTableRow = function(contentId, videoId) {
    const source = videoId.trim();
    if (!source) {
        window.showToast("لا يوجد رابط فيديو متوفر لمعاينته!", "error");
        return;
    }

    // 1. Detect source type
    let type = 'youtube';
    let embedUrl = '';

    if (source.includes('drive.google.com') || source.includes('drive.usercontent.google.com')) {
        const idMatch = source.match(/\/d\/([-\w]{25,})/) || source.match(/id=([-\w]{25,})/);
        if (idMatch && idMatch[1]) {
            type = 'drive';
            embedUrl = `https://drive.google.com/file/d/${idMatch[1]}/preview`;
        }
    } else if (source.includes('youtube.com') || source.includes('youtu.be')) {
        type = 'youtube';
        let ytId = source;
        if (ytId.includes('v=')) ytId = ytId.split('v=')[1];
        if (ytId.includes('&')) ytId = ytId.split('&')[0];
        if (ytId.includes('youtu.be/')) ytId = ytId.split('youtu.be/')[1];
        if (ytId.includes('embed/')) ytId = ytId.split('embed/')[1];
        if (ytId.includes('?')) ytId = ytId.split('?')[0];
        embedUrl = `https://www.youtube.com/embed/${ytId.trim()}`;
    } else if (/^[-\w]{11}$/.test(source)) {
        type = 'youtube';
        embedUrl = `https://www.youtube.com/embed/${source}`;
    } else if (source.startsWith('http://') || source.startsWith('https://')) {
        type = 'direct';
        embedUrl = source;
    } else {
        type = 'youtube';
        embedUrl = `https://www.youtube.com/embed/${source}`;
    }

    // 2. Create Modal Overlay Element
    const modalId = 'table-row-preview-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }

    let playerHtml = '';
    if (type === 'youtube' || type === 'drive') {
        playerHtml = `<iframe src="${embedUrl}" class="w-full h-full border-0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    } else if (type === 'direct') {
        playerHtml = `<video src="${embedUrl}" controls autoplay class="w-full h-full object-contain"></video>`;
    }

    modal.innerHTML = `
        <div class="bg-b-surface border border-white/10 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl relative flex flex-col aspect-video">
            <div class="absolute top-3 left-3 z-[10000] flex gap-2">
                <button onclick="document.getElementById('${modalId}').remove()" class="w-8 h-8 rounded-full bg-black/60 text-gray-400 hover:text-white flex items-center justify-center transition-colors">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="flex-1 w-full h-full bg-black">
                ${playerHtml}
            </div>
        </div>
    `;

    // Add click listener outside to close
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    };
};

window.cmPreviewItem = function(type, id) {
    window.open(`../../pages/course-player.html?preview=true&type=${type}&id=${id}`, '_blank');
};

window.cmOpenReorderModal = async function(courseId, courseTitle) {
    // 1. Fetch course materials from Supabase
    const modalId = 'cm-reorder-modal';
    let loadingDiv = document.createElement('div');
    loadingDiv.id = 'cm-reorder-loading';
    loadingDiv.className = 'fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center';
    loadingDiv.innerHTML = '<div class="text-center text-teal-400"><i class="fas fa-spinner fa-spin text-4xl mb-3"></i><p class="text-sm font-bold">جاري تحميل المحتويات للترتيب...</p></div>';
    document.body.appendChild(loadingDiv);

    try {
        const { data: materials, error } = await supabase
            .from('course_materials')
            .select('content_id, title, order_index, type, status')
            .eq('course_id', courseId)
            .order('order_index', { ascending: true });

        loadingDiv.remove();

        if (error) throw error;
        if (!materials || materials.length === 0) {
            window.showToast("هذا الكورس لا يحتوي على أي مواد تعليمية لترتيبها!", "info");
            return;
        }

        // 2. Render Modal
        let modal = document.getElementById(modalId);
        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 text-right';
            modal.setAttribute('dir', 'rtl');
            document.body.appendChild(modal);
        }

        let listItemsHtml = materials.map(item => {
            let icon = 'fa-file-video';
            if (item.type === 'section') icon = 'fa-folder';
            else if (item.type === 'quiz') icon = 'fa-lightbulb';
            else if (item.type === 'project') icon = 'fa-code';

            return `
                <div class="reorder-item flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-3.5 bg-black/40 border border-white/5 rounded-xl hover:border-white/10 transition-all cursor-move group gap-3" draggable="true" data-id="${item.content_id}">
                    <div class="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
                        <div class="drag-handle text-gray-500 group-hover:text-gray-300 cursor-grab p-1 shrink-0" title="اسحب للترتيب"><i class="fas fa-grip-vertical text-sm"></i></div>
                        <div class="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-teal-400 text-xs shrink-0">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div class="flex items-center gap-2 flex-1 min-w-0 flex-wrap sm:flex-nowrap">
                            <span class="text-xs sm:text-sm font-bold text-white break-words whitespace-normal leading-relaxed" dir="auto" title="${item.title}">${item.title}</span>
                            <span class="text-[9px] uppercase tracking-wider text-gray-400 bg-white/5 px-2 py-0.5 rounded border border-white/10 font-mono shrink-0">${item.type}</span>
                        </div>
                    </div>
                    <div class="flex items-center justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t border-white/5 sm:border-t-0">
                        <span class="text-[10px] text-gray-500 font-bold sm:hidden">الترتيب:</span>
                        <button type="button" onclick="window.cmMoveOrderItem(this, 'up')" class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white flex items-center justify-center text-xs transition-colors active:scale-95" title="نقل لأعلى"><i class="fas fa-chevron-up"></i></button>
                        <button type="button" onclick="window.cmMoveOrderItem(this, 'down')" class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white flex items-center justify-center text-xs transition-colors active:scale-95" title="نقل لأسفل"><i class="fas fa-chevron-down"></i></button>
                        <input type="number" value="${item.order_index}" class="w-14 bg-black border border-white/15 rounded-lg px-2 py-1 text-center font-mono text-xs sm:text-sm font-bold text-yellow-400 focus:border-teal-500 outline-none order-input" onchange="window.cmOrderInputChange(this)">
                    </div>
                </div>
            `;
        }).join('');

        modal.innerHTML = `
            <div class="bg-b-surface border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
                <!-- Header -->
                <div class="p-5 border-b border-white/10 flex justify-between items-center bg-black/40 shrink-0">
                    <div>
                        <h3 class="font-bold text-white text-base">إعادة ترتيب محتويات الكورس</h3>
                        <p class="text-xs text-gray-400 mt-1">كورس: ${courseTitle}</p>
                    </div>
                    <button onclick="document.getElementById('${modalId}').remove()" class="w-8 h-8 rounded-full bg-white/5 text-gray-400 hover:text-white flex items-center justify-center transition-colors">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <!-- List Container -->
                <div id="cm-reorder-list" class="flex-1 overflow-y-auto p-3 sm:p-6 space-y-2.5 sm:space-y-3 custom-scroll">
                    ${listItemsHtml}
                </div>
                <!-- Footer -->
                <div class="p-5 border-t border-white/10 bg-black/40 flex gap-3 justify-end shrink-0">
                    <button onclick="document.getElementById('${modalId}').remove()" class="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-white font-bold transition-all text-sm">إلغاء</button>
                    <button id="cm-save-order-btn" class="px-5 py-2.5 rounded-xl bg-b-primary hover:bg-teal-600 text-white font-bold transition-all text-sm flex items-center gap-2">
                        <i class="fas fa-save"></i>
                        <span>حفظ الترتيب الجديد</span>
                    </button>
                </div>
            </div>
        `;

        // Bind drag & drop events
        bindDragEvents();

        // Bind save action
        document.getElementById('cm-save-order-btn').onclick = async () => {
            const saveBtn = document.getElementById('cm-save-order-btn');
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

            const items = Array.from(document.querySelectorAll('.reorder-item'));
            const updates = items.map((item, index) => {
                const contentId = item.getAttribute('data-id');
                const orderIndex = index + 1;
                return supabase
                    .from('course_materials')
                    .update({ order_index: orderIndex })
                    .eq('content_id', contentId);
            });

            try {
                await Promise.all(updates);
                window.showToast("🎉 تم حفظ الترتيب الجديد للمحتويات بنجاح!", "success");
                document.getElementById(modalId).remove();
                if (typeof loadTableData === 'function') loadTableData();
            } catch (e) {
                window.showToast("خطأ أثناء حفظ الترتيب: " + e.message, "error");
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save"></i> <span>حفظ الترتيب الجديد</span>';
            }
        };

    } catch (e) {
        if(document.getElementById('cm-reorder-loading')) document.getElementById('cm-reorder-loading').remove();
        window.showToast("خطأ أثناء جلب البيانات للترتيب: " + e.message, "error");
    }
};

window.cmMoveOrderItem = function(btn, direction) {
    const item = btn.closest('.reorder-item');
    const container = document.getElementById('cm-reorder-list');
    if (!item || !container) return;

    if (direction === 'up' && item.previousElementSibling) {
        container.insertBefore(item, item.previousElementSibling);
    } else if (direction === 'down' && item.nextElementSibling) {
        container.insertBefore(item, item.nextElementSibling.nextElementSibling);
    }
    window.cmRefreshOrderInputs();
};

window.cmOrderInputChange = function(input) {
    const container = document.getElementById('cm-reorder-list');
    if (!container) return;

    const items = Array.from(container.querySelectorAll('.reorder-item'));
    items.sort((a, b) => {
        const valA = parseInt(a.querySelector('.order-input').value) || 0;
        const valB = parseInt(b.querySelector('.order-input').value) || 0;
        return valA - valB;
    });

    container.innerHTML = '';
    items.forEach(item => container.appendChild(item));
    window.cmRefreshOrderInputs();
};

window.cmRefreshOrderInputs = function() {
    const container = document.getElementById('cm-reorder-list');
    if (!container) return;
    const inputs = container.querySelectorAll('.order-input');
    inputs.forEach((input, index) => {
        input.value = index + 1;
    });
};

function bindDragEvents() {
    const container = document.getElementById('cm-reorder-list');
    if (!container) return;

    let dragEl = null;

    container.addEventListener('dragstart', (e) => {
        dragEl = e.target.closest('.reorder-item');
        if (dragEl) {
            dragEl.classList.add('opacity-50', 'border-b-primary');
            e.dataTransfer.effectAllowed = 'move';
        }
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const target = e.target.closest('.reorder-item');
        if (target && target !== dragEl) {
            const rect = target.getBoundingClientRect();
            const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
            container.insertBefore(dragEl, next ? target.nextSibling : target);
        }
    });

    container.addEventListener('dragend', () => {
        if (dragEl) {
            dragEl.classList.remove('opacity-50', 'border-b-primary');
            dragEl = null;
            window.cmRefreshOrderInputs();
        }
    });
}

window.cmOpenCoursesReorderModal = async function(phaseId, phaseTitle) {
    const modalId = 'cm-reorder-modal';
    let loadingDiv = document.createElement('div');
    loadingDiv.id = 'cm-reorder-loading';
    loadingDiv.className = 'fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center';
    loadingDiv.innerHTML = '<div class="text-center text-teal-400"><i class="fas fa-spinner fa-spin text-4xl mb-3"></i><p class="text-sm font-bold">جاري تحميل الكورسات للترتيب...</p></div>';
    document.body.appendChild(loadingDiv);

    try {
        const { data: courses, error } = await supabase
            .from('courses')
            .select('course_id, title, order_index, is_active')
            .eq('phase_id', phaseId)
            .order('order_index', { ascending: true });

        loadingDiv.remove();

        if (error) throw error;
        if (!courses || courses.length === 0) {
            window.showToast("هذه المرحلة لا تحتوي على أي كورسات لترتيبها!", "info");
            return;
        }

        // 2. Render Modal
        let modal = document.getElementById(modalId);
        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 text-right';
            modal.setAttribute('dir', 'rtl');
            document.body.appendChild(modal);
        }

        let listItemsHtml = courses.map(item => {
            let icon = 'fa-book';
            return `
                <div class="reorder-item flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-3.5 bg-black/40 border border-white/5 rounded-xl hover:border-white/10 transition-all cursor-move group gap-3" draggable="true" data-id="${item.course_id}">
                    <div class="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
                        <div class="drag-handle text-gray-500 group-hover:text-gray-300 cursor-grab p-1 shrink-0" title="اسحب للترتيب"><i class="fas fa-grip-vertical text-sm"></i></div>
                        <div class="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-teal-400 text-xs shrink-0">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div class="flex items-center gap-2 flex-1 min-w-0 flex-wrap sm:flex-nowrap">
                            <span class="text-xs sm:text-sm font-bold text-white break-words whitespace-normal leading-relaxed" dir="auto" title="${item.title}">${item.title}</span>
                            <span class="text-[9px] uppercase tracking-wider text-gray-400 bg-white/5 px-2 py-0.5 rounded border border-white/10 font-mono shrink-0">course</span>
                        </div>
                    </div>
                    <div class="flex items-center justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t border-white/5 sm:border-t-0">
                        <span class="text-[10px] text-gray-500 font-bold sm:hidden">الترتيب:</span>
                        <button type="button" onclick="window.cmMoveOrderItem(this, 'up')" class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white flex items-center justify-center text-xs transition-colors active:scale-95" title="نقل لأعلى"><i class="fas fa-chevron-up"></i></button>
                        <button type="button" onclick="window.cmMoveOrderItem(this, 'down')" class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white flex items-center justify-center text-xs transition-colors active:scale-95" title="نقل لأسفل"><i class="fas fa-chevron-down"></i></button>
                        <input type="number" value="${item.order_index || 0}" class="w-14 bg-black border border-white/15 rounded-lg px-2 py-1 text-center font-mono text-xs sm:text-sm font-bold text-yellow-400 focus:border-teal-500 outline-none order-input" onchange="window.cmOrderInputChange(this)">
                    </div>
                </div>
            `;
        }).join('');

        modal.innerHTML = `
            <div class="bg-b-surface border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
                <!-- Header -->
                <div class="p-5 border-b border-white/10 flex justify-between items-center bg-black/40 shrink-0">
                    <div>
                        <h3 class="font-bold text-white text-base">إعادة ترتيب الكورسات</h3>
                        <p class="text-xs text-gray-400 mt-1">المرحلة: ${phaseTitle}</p>
                    </div>
                    <button onclick="document.getElementById('${modalId}').remove()" class="w-8 h-8 rounded-full bg-white/5 text-gray-400 hover:text-white flex items-center justify-center transition-colors">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <!-- List Container -->
                <div id="cm-reorder-list" class="flex-1 overflow-y-auto p-3 sm:p-6 space-y-2.5 sm:space-y-3 custom-scroll">
                    ${listItemsHtml}
                </div>
                <!-- Footer -->
                <div class="p-5 border-t border-white/10 bg-black/40 flex gap-3 justify-end shrink-0">
                    <button onclick="document.getElementById('${modalId}').remove()" class="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-white font-bold transition-all text-sm">إلغاء</button>
                    <button id="cm-save-order-btn" class="px-5 py-2.5 rounded-xl bg-b-primary hover:bg-teal-600 text-white font-bold transition-all text-sm flex items-center gap-2">
                        <i class="fas fa-save"></i>
                        <span>حفظ الترتيب الجديد</span>
                    </button>
                </div>
            </div>
        `;

        bindDragEvents();

        document.getElementById('cm-save-order-btn').onclick = async () => {
            const saveBtn = document.getElementById('cm-save-order-btn');
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

            const items = Array.from(document.querySelectorAll('.reorder-item'));
            const updates = items.map((item, index) => {
                const courseId = item.getAttribute('data-id');
                const orderIndex = index + 1;
                return supabase
                    .from('courses')
                    .update({ order_index: orderIndex })
                    .eq('course_id', courseId);
            });

            try {
                await Promise.all(updates);
                window.showToast("🎉 تم حفظ الترتيب الجديد للكورسات بنجاح!", "success");
                document.getElementById(modalId).remove();
                if (typeof loadTableData === 'function') loadTableData();
            } catch (e) {
                window.showToast("خطأ أثناء حفظ الترتيب: " + e.message, "error");
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save"></i> <span>حفظ الترتيب الجديد</span>';
            }
        };

    } catch (e) {
        if(document.getElementById('cm-reorder-loading')) document.getElementById('cm-reorder-loading').remove();
        window.showToast("خطأ أثناء جلب البيانات للترتيب: " + e.message, "error");
    }
};

window.cmOpenPhasesReorderModal = async function(trackId, trackTitle) {
    const modalId = 'cm-reorder-modal';
    let loadingDiv = document.createElement('div');
    loadingDiv.id = 'cm-reorder-loading';
    loadingDiv.className = 'fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center';
    loadingDiv.innerHTML = '<div class="text-center text-teal-400"><i class="fas fa-spinner fa-spin text-4xl mb-3"></i><p class="text-sm font-bold">جاري تحميل المراحل للترتيب...</p></div>';
    document.body.appendChild(loadingDiv);

    try {
        const { data: phases, error } = await supabase
            .from('phases')
            .select('phase_id, title, order_index, is_active')
            .eq('track_id', trackId)
            .order('order_index', { ascending: true });

        loadingDiv.remove();

        if (error) throw error;
        if (!phases || phases.length === 0) {
            window.showToast("هذا المسار لا يحتوي على أي مراحل لترتيبها!", "info");
            return;
        }

        // 2. Render Modal
        let modal = document.getElementById(modalId);
        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 text-right';
            modal.setAttribute('dir', 'rtl');
            document.body.appendChild(modal);
        }

        let listItemsHtml = phases.map(item => {
            let icon = 'fa-layer-group';
            return `
                <div class="reorder-item flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-3.5 bg-black/40 border border-white/5 rounded-xl hover:border-white/10 transition-all cursor-move group gap-3" draggable="true" data-id="${item.phase_id}">
                    <div class="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
                        <div class="drag-handle text-gray-500 group-hover:text-gray-300 cursor-grab p-1 shrink-0" title="اسحب للترتيب"><i class="fas fa-grip-vertical text-sm"></i></div>
                        <div class="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-teal-400 text-xs shrink-0">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div class="flex items-center gap-2 flex-1 min-w-0 flex-wrap sm:flex-nowrap">
                            <span class="text-xs sm:text-sm font-bold text-white break-words whitespace-normal leading-relaxed" dir="auto" title="${item.title}">${item.title}</span>
                            <span class="text-[9px] uppercase tracking-wider text-gray-400 bg-white/5 px-2 py-0.5 rounded border border-white/10 font-mono shrink-0">phase</span>
                        </div>
                    </div>
                    <div class="flex items-center justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t border-white/5 sm:border-t-0">
                        <span class="text-[10px] text-gray-500 font-bold sm:hidden">الترتيب:</span>
                        <button type="button" onclick="window.cmMoveOrderItem(this, 'up')" class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white flex items-center justify-center text-xs transition-colors active:scale-95" title="نقل لأعلى"><i class="fas fa-chevron-up"></i></button>
                        <button type="button" onclick="window.cmMoveOrderItem(this, 'down')" class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white flex items-center justify-center text-xs transition-colors active:scale-95" title="نقل لأسفل"><i class="fas fa-chevron-down"></i></button>
                        <input type="number" value="${item.order_index || 0}" class="w-14 bg-black border border-white/15 rounded-lg px-2 py-1 text-center font-mono text-xs sm:text-sm font-bold text-yellow-400 focus:border-teal-500 outline-none order-input" onchange="window.cmOrderInputChange(this)">
                    </div>
                </div>
            `;
        }).join('');

        modal.innerHTML = `
            <div class="bg-b-surface border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
                <!-- Header -->
                <div class="p-5 border-b border-white/10 flex justify-between items-center bg-black/40 shrink-0">
                    <div>
                        <h3 class="font-bold text-white text-base">إعادة ترتيب المراحل</h3>
                        <p class="text-xs text-gray-400 mt-1">المسار: ${trackTitle}</p>
                    </div>
                    <button onclick="document.getElementById('${modalId}').remove()" class="w-8 h-8 rounded-full bg-white/5 text-gray-400 hover:text-white flex items-center justify-center transition-colors">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <!-- List Container -->
                <div id="cm-reorder-list" class="flex-1 overflow-y-auto p-3 sm:p-6 space-y-2.5 sm:space-y-3 custom-scroll">
                    ${listItemsHtml}
                </div>
                <!-- Footer -->
                <div class="p-5 border-t border-white/10 bg-black/40 flex gap-3 justify-end shrink-0">
                    <button onclick="document.getElementById('${modalId}').remove()" class="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-white font-bold transition-all text-sm">إلغاء</button>
                    <button id="cm-save-order-btn" class="px-5 py-2.5 rounded-xl bg-b-primary hover:bg-teal-600 text-white font-bold transition-all text-sm flex items-center gap-2">
                        <i class="fas fa-save"></i>
                        <span>حفظ الترتيب الجديد</span>
                    </button>
                </div>
            </div>
        `;

        bindDragEvents();

        document.getElementById('cm-save-order-btn').onclick = async () => {
            const saveBtn = document.getElementById('cm-save-order-btn');
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

            const items = Array.from(document.querySelectorAll('.reorder-item'));
            const updates = items.map((item, index) => {
                const phaseId = item.getAttribute('data-id');
                const orderIndex = index + 1;
                return supabase
                    .from('phases')
                    .update({ order_index: orderIndex })
                    .eq('phase_id', phaseId);
            });

            try {
                await Promise.all(updates);
                window.showToast("🎉 تم حفظ الترتيب الجديد للمراحل بنجاح!", "success");
                document.getElementById(modalId).remove();
                if (typeof loadTableData === 'function') loadTableData();
            } catch (e) {
                window.showToast("خطأ أثناء حفظ الترتيب: " + e.message, "error");
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save"></i> <span>حفظ الترتيب الجديد</span>';
            }
        };

    } catch (e) {
        if(document.getElementById('cm-reorder-loading')) document.getElementById('cm-reorder-loading').remove();
        window.showToast("خطأ أثناء جلب البيانات للترتيب: " + e.message, "error");
    }
};