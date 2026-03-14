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
    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            navBtns.forEach(b => { b.classList.remove('active', 'bg-white/10', 'text-white'); b.classList.add('text-gray-400'); });
            const targetBtn = e.currentTarget;
            targetBtn.classList.add('active', 'bg-white/10', 'text-white');
            targetBtn.classList.remove('text-gray-400');
            
            cmCurrentLevel = targetBtn.getAttribute('data-level');
            
            if (['media', 'bulk'].includes(cmCurrentLevel)) {
                renderPlaceholderView();
            } else {
                window.cmResetFilters(false); 
                loadTableData(); 
            }
        });
    });

    document.getElementById('cm-crud-form')?.addEventListener('submit', handleFormSubmit);

    // Inject Health Check Button
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
// 🔍 ADVANCED DYNAMIC FILTER ENGINE
// ==========================================
async function buildDynamicFilters() {
    // Locate or create the filters container dynamically
    let filtersContainer = document.getElementById('cm-dynamic-filters-container');
    if (!filtersContainer) {
        const topBar = document.querySelector('.p-4.border-b.border-white\\/5.bg-black\\/40');
        if (topBar) {
            topBar.innerHTML = '<div id="cm-dynamic-filters-container" class="flex flex-col gap-3 w-full"></div>';
            filtersContainer = document.getElementById('cm-dynamic-filters-container');
        } else return;
    }

    let parentOptions = '<option value="all">كل الارتباطات</option>';
    let typeOptions = '';

    if (cmCurrentLevel === 'phases') {
        const { data: tracks } = await supabase.from('tracks').select('id, name');
        parentOptions = `<option value="all">كل المسارات (Tracks)</option>` + (tracks || []).map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    } else if (cmCurrentLevel === 'courses') {
        const { data: phases } = await supabase.from('phases').select('phase_id, title');
        parentOptions = `<option value="all">كل المراحل (Phases)</option>` + (phases || []).map(p => `<option value="${p.phase_id}">${p.title}</option>`).join('');
        typeOptions = `<select id="filter-type" class="bg-black border border-white/10 rounded-xl px-4 py-2 text-sm text-gray-300 outline-none focus:border-b-primary"><option value="all">كل الأنواع</option><option value="youtube">يوتيوب</option><option value="custom">مخصص</option></select>`;
    } else if (cmCurrentLevel === 'course_materials') {
        const { data: courses } = await supabase.from('courses').select('course_id, title');
        parentOptions = `<option value="all">كل الكورسات (Courses)</option>` + (courses || []).map(c => `<option value="${c.course_id}">${c.title}</option>`).join('');
        typeOptions = `<select id="filter-type" class="bg-black border border-white/10 rounded-xl px-4 py-2 text-sm text-gray-300 outline-none focus:border-b-primary"><option value="all">كل الأنواع</option><option value="video">فيديو</option><option value="quiz">اختبار</option><option value="project">مشروع</option><option value="resource">مورد</option></select>`;
    } else if (cmCurrentLevel === 'quiz_questions') {
        const { data: quizzes } = await supabase.from('quizzes').select('quiz_id, title');
        parentOptions = `<option value="all">كل الاختبارات (Quizzes)</option>` + (quizzes || []).map(q => `<option value="${q.quiz_id}">${q.title}</option>`).join('');
    }

    const parentSelect = !['tracks', 'quizzes', 'projects'].includes(cmCurrentLevel) ? `<select id="filter-parent" class="bg-black border border-white/10 rounded-xl px-4 py-2 text-sm text-gray-300 outline-none focus:border-purple-500 max-w-xs truncate">${parentOptions}</select>` : '<input type="hidden" id="filter-parent" value="all">';

    filtersContainer.innerHTML = `
        <div class="flex flex-wrap items-center gap-3 w-full">
            <div class="relative flex-1 min-w-[200px]">
                <i class="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm"></i>
                <input type="text" id="filter-search" placeholder="بحث بالاسم، الوصف، أو الـ ID..." class="w-full bg-black border border-white/10 rounded-xl pr-9 pl-4 py-2 text-sm text-white focus:border-b-primary outline-none transition-colors shadow-inner">
            </div>
            <select id="filter-status" class="bg-black border border-white/10 rounded-xl px-4 py-2 text-sm text-gray-300 outline-none focus:border-b-primary shadow-inner shrink-0">
                <option value="all">الحالة (الكل)</option>
                <option value="true">🟢 مفعل (Active)</option>
                <option value="false">🔴 معطل (Draft)</option>
            </select>
            ${parentSelect}
            ${typeOptions}
        </div>
        <div class="flex flex-wrap justify-between items-center gap-3 border-t border-white/5 pt-3">
            <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-gray-500"><i class="fas fa-calendar-alt mr-1"></i> من:</span>
                <input type="date" id="filter-date-from" class="bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs text-gray-300 outline-none focus:border-b-primary color-scheme-dark">
                <span class="text-xs font-bold text-gray-500 ml-2">إلى:</span>
                <input type="date" id="filter-date-to" class="bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs text-gray-300 outline-none focus:border-b-primary color-scheme-dark">
                <button onclick="window.cmResetFilters()" class="text-xs text-red-400 hover:text-red-300 font-bold bg-red-500/10 px-3 py-1.5 rounded-lg ml-2 transition-colors"><i class="fas fa-times mr-1"></i> مسح</button>
            </div>
            <div class="flex bg-black rounded-lg p-1 border border-white/10 shrink-0">
                <button onclick="window.cmSwitchView('grid')" id="btn-view-grid" class="px-4 py-1.5 rounded text-xs font-bold bg-white/10 text-white"><i class="fas fa-table mr-1"></i> Grid</button>
                <button onclick="window.cmSwitchView('tree')" id="btn-view-tree" class="px-4 py-1.5 rounded text-xs font-bold text-gray-500 hover:text-white"><i class="fas fa-sitemap mr-1"></i> Tree</button>
            </div>
        </div>
    `;

    ['filter-search', 'filter-status', 'filter-parent', 'filter-type', 'filter-date-from', 'filter-date-to'].forEach(id => {
        const el = document.getElementById(id);
        if(el) { el.addEventListener('input', applyFilters); el.addEventListener('change', applyFilters); }
    });
}

window.cmResetFilters = (reload = true) => {
    ['filter-search', 'filter-date-from', 'filter-date-to'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; });
    ['filter-status', 'filter-parent', 'filter-type'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = 'all'; });
    if(reload) applyFilters();
};

function applyFilters() {
    const searchVal = document.getElementById('filter-search')?.value.toLowerCase() || '';
    const statusVal = document.getElementById('filter-status')?.value || 'all';
    const parentVal = document.getElementById('filter-parent')?.value || 'all';
    const typeVal = document.getElementById('filter-type')?.value || 'all';
    const dateFrom = document.getElementById('filter-date-from')?.value;
    const dateTo = document.getElementById('filter-date-to')?.value;

    filteredData = rawData.filter(item => {
        // Search Filter (Title, Desc, ID)
        const titleKey = LEVELS[cmCurrentLevel]?.title || 'title';
        const pk = getPrimaryKey();
        const textToSearch = `${item[titleKey] || ''} ${item.name || ''} ${item.description || ''} ${item[pk] || ''}`.toLowerCase();
        const matchesSearch = textToSearch.includes(searchVal);

        // Status Filter
        const isActiveField = item.hasOwnProperty('status') ? item.status : item.is_active;
        const matchesStatus = statusVal === 'all' ? true : String(isActiveField) === statusVal;

        // Parent Filter
        let matchesParent = true;
        if (parentVal !== 'all') {
            if (cmCurrentLevel === 'phases') matchesParent = String(item.track_id) === parentVal;
            if (cmCurrentLevel === 'courses') matchesParent = String(item.phase_id) === parentVal;
            if (cmCurrentLevel === 'course_materials') matchesParent = String(item.course_id) === parentVal;
            if (cmCurrentLevel === 'quiz_questions') matchesParent = String(item.quiz_id) === parentVal;
        }

        // Type Filter
        const matchesType = typeVal === 'all' ? true : String(item.type) === typeVal;

        // Date Filter
        let matchesDate = true;
        if (item.created_at) {
            const itemDate = new Date(item.created_at);
            if (dateFrom) matchesDate = matchesDate && (itemDate >= new Date(dateFrom));
            if (dateTo) {
                const toD = new Date(dateTo);
                toD.setHours(23, 59, 59);
                matchesDate = matchesDate && (itemDate <= toD);
            }
        }

        return matchesSearch && matchesStatus && matchesParent && matchesType && matchesDate;
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
        applyFilters();
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

function renderTreeViewHTML() {
    const container = document.getElementById('cm-view-tree');
    if (curriculumTree.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-10">لا توجد بيانات منهجية متاحة.</div>';
        return;
    }

    let html = '<div class="space-y-4 text-left dir-ltr">';
    curriculumTree.forEach(track => {
        html += `
        <div class="bg-black/40 border border-white/10 rounded-xl p-4">
            <h3 class="text-lg font-bold text-white flex items-center gap-2 mb-3"><i class="fas fa-road text-b-primary"></i> ${track.name}</h3>
            <div class="pl-6 border-l-2 border-white/5 space-y-3">
        `;
        track.phases.forEach(phase => {
            html += `
                <div class="bg-black/60 border border-white/5 rounded-lg p-3">
                    <h4 class="text-sm font-bold text-gray-200 flex items-center gap-2 mb-2"><i class="fas fa-layer-group text-purple-500"></i> ${phase.title}</h4>
                    <div class="pl-6 border-l-2 border-white/5 space-y-2">
            `;
            phase.courses.forEach(course => {
                html += `
                    <div class="bg-white/5 border border-white/5 rounded p-2">
                        <h5 class="text-xs font-bold text-blue-400 flex items-center gap-2 mb-2"><i class="fas fa-book"></i> ${course.title}</h5>
                        <ul class="pl-6 space-y-1">
                `;
                course.materials.forEach(mat => {
                    const icon = mat.type === 'video' ? 'fa-play-circle text-red-400' : mat.type === 'quiz' ? 'fa-clipboard-check text-yellow-400' : 'fa-laptop-code text-emerald-400';
                    html += `<li class="text-[11px] text-gray-400 flex items-center gap-2 bg-black/50 p-1.5 rounded"><i class="fas ${icon}"></i> [${mat.order_index}] ${mat.title}</li>`;
                });
                html += `</ul></div>`;
            });
            html += `</div></div>`;
        });
        html += `</div></div>`;
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
    let targetTab = '';
    if (cmCurrentLevel === 'tracks') targetTab = 'phases';
    else if (cmCurrentLevel === 'phases') targetTab = 'courses';
    else if (cmCurrentLevel === 'courses') targetTab = 'course_materials';
    else if (cmCurrentLevel === 'quizzes') targetTab = 'quiz_questions';
    
    if (targetTab) {
        document.querySelector(`[data-level="${targetTab}"]`).click(); 
        setTimeout(() => { 
            const pf = document.getElementById('filter-parent');
            if(pf) { pf.value = id; applyFilters(); window.showToast("تم فتح المحتوى الداخلي بنجاح", "success"); }
        }, 500);
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
};

window.cmCloseModal = () => document.getElementById('cm-crud-modal').classList.add('hidden');

async function generateFormFields(data = null) {
    const container = document.getElementById('cm-form-fields');
    container.innerHTML = '<div class="text-center py-4 text-gray-400"><i class="fas fa-spinner fa-spin text-xl mb-2"></i><br>جاري التجهيز...</div>';
    
    let html = '';
    const inputStyle = "w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-b-primary outline-none transition-colors dir-ltr text-left";
    const labelStyle = "text-xs text-gray-400 mb-1 font-bold block dir-ltr text-left";
    
    if (cmCurrentLevel === 'tracks') {
        html += `
            <div class="grid gap-4">
                <div><label class="${labelStyle}">Track Name *</label><input type="text" id="f-name" required value="${data?.name || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Description</label><textarea id="f-desc" rows="3" class="${inputStyle}">${data?.description || ''}</textarea></div>
                <div class="flex items-center gap-3 bg-black/30 p-4 rounded-xl border border-white/5 dir-ltr"><input type="checkbox" id="f-active" ${!data || data?.is_active ? 'checked' : ''} class="w-4 h-4 rounded text-b-primary bg-black border-white/20"><label class="text-sm font-bold text-white cursor-pointer">Is Active</label></div>
            </div>
        `;
    } 
    else if (cmCurrentLevel === 'phases') {
        const { data: tracks } = await supabase.from('tracks').select('id, name');
        const opts = (tracks || []).map(t => `<option value="${t.id}" ${data?.track_id === t.id ? 'selected' : ''}>${t.name}</option>`).join('');
        html += `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto custom-scroll pr-2">
                <div><label class="${labelStyle}">Phase ID (Auto)</label><input type="text" id="f-phase-id" readonly value="${data?.phase_id || generateSystemID('ph')}" class="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed"></div>
                <div><label class="${labelStyle}">Track *</label><select id="f-track-id" required class="${inputStyle}"><option value="" disabled ${!data ? 'selected' : ''}>-- Select Track --</option>${opts}</select></div>
                <div class="md:col-span-2"><label class="${labelStyle}">Title *</label><input type="text" id="f-title" required value="${data?.title || ''}" class="${inputStyle}"></div>
                <div class="md:col-span-2"><label class="${labelStyle}">Description</label><textarea id="f-desc" rows="2" class="${inputStyle}">${data?.description || ''}</textarea></div>
                <div><label class="${labelStyle}">Image URL</label><input type="text" id="f-img-url" value="${data?.image_url || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Module Time</label><input type="text" id="f-module-time" value="${data?.['Module Time'] || ''}" placeholder="e.g. 2 Months" class="${inputStyle}"></div>
                <div class="md:col-span-2"><label class="${labelStyle}">Prerequisites</label><textarea id="f-prereq" rows="2" class="${inputStyle}">${data?.prerequisites || ''}</textarea></div>
                <div class="md:col-span-2"><label class="${labelStyle}">Will Learn</label><textarea id="f-will-learn" rows="2" class="${inputStyle}">${data?.will_learn || ''}</textarea></div>
                <div class="md:col-span-2"><label class="${labelStyle}">Note</label><input type="text" id="f-note" value="${data?.['Note'] || ''}" class="${inputStyle}"></div>
                <div class="md:col-span-2 flex items-center gap-3 bg-black/30 p-4 rounded-xl border border-white/5 dir-ltr"><input type="checkbox" id="f-active" ${!data || data?.is_active ? 'checked' : ''} class="w-4 h-4 rounded text-purple-500"><label class="text-sm font-bold text-white cursor-pointer">Is Active</label></div>
            </div>
        `;
    }
    else if (cmCurrentLevel === 'courses') {
        const { data: phases } = await supabase.from('phases').select('phase_id, title');
        const opts = (phases || []).map(p => `<option value="${p.phase_id}" ${data?.phase_id === p.phase_id ? 'selected' : ''}>${p.title}</option>`).join('');
        html += `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto custom-scroll pr-2">
                <div><label class="${labelStyle}">Course ID (Auto)</label><input type="text" id="f-course-id" readonly value="${data?.course_id || generateSystemID('cr')}" class="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed"></div>
                <div><label class="${labelStyle}">Phase *</label><select id="f-phase-id" required class="${inputStyle}"><option value="" disabled ${!data ? 'selected' : ''}>-- Select Phase --</option>${opts}</select></div>
                <div class="md:col-span-2"><label class="${labelStyle}">Title *</label><input type="text" id="f-title" required value="${data?.title || ''}" class="${inputStyle}"></div>
                <div class="md:col-span-2"><label class="${labelStyle}">Description</label><textarea id="f-desc" rows="2" class="${inputStyle}">${data?.description || ''}</textarea></div>
                <div><label class="${labelStyle}">Type</label><select id="f-type" class="${inputStyle}"><option value="youtube" ${data?.type === 'youtube' ? 'selected' : ''}>YouTube</option><option value="custom" ${data?.type === 'custom' ? 'selected' : ''}>Custom</option></select></div>
                <div><label class="${labelStyle}">Playlist ID</label><input type="text" id="f-playlist" value="${data?.playlist_id || ''}" placeholder="PL..." class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Image URL</label><input type="text" id="f-img-url" value="${data?.image_url || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Module Time</label><input type="text" id="f-module-time" value="${data?.['Module_Time'] || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Prerequisites (Comma separated)</label><textarea id="f-prereq" rows="2" placeholder="OOP, C++" class="${inputStyle}">${(data?.prerequisites || []).join(', ')}</textarea></div>
                <div><label class="${labelStyle}">Tools Required (Comma separated)</label><textarea id="f-tools" rows="2" placeholder="VS Code, Proteus" class="${inputStyle}">${(data?.tools_required || []).join(', ')}</textarea></div>
                <div class="md:col-span-2"><label class="${labelStyle}">Will Learn</label><textarea id="f-will-learn" rows="2" class="${inputStyle}">${data?.will_learn || ''}</textarea></div>
                <div class="md:col-span-2"><label class="${labelStyle}">Note</label><input type="text" id="f-note" value="${data?.['Note'] || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Related With</label><input type="text" id="f-related" value="${data?.related_with || ''}" class="${inputStyle}"></div>
                <div class="md:col-span-2 flex flex-col gap-3 mt-2 bg-black/30 p-4 rounded-xl border border-white/5 dir-ltr">
                    <label class="flex items-center gap-2 text-white cursor-pointer"><input type="checkbox" id="f-active" ${!data || data?.is_active ? 'checked' : ''} class="w-4 h-4 rounded text-blue-500"> Is Active</label>
                    <label class="flex items-center gap-2 text-white cursor-pointer"><input type="checkbox" id="f-auto-sync" ${!data || data?.auto_sync ? 'checked' : ''} class="w-4 h-4 rounded text-blue-500"> Auto Sync</label>
                </div>
            </div>
        `;
    }
    else if (cmCurrentLevel === 'course_materials') {
        const { data: courses } = await supabase.from('courses').select('course_id, title');
        const opts = (courses || []).map(c => `<option value="${c.course_id}" ${data?.course_id === c.course_id ? 'selected' : ''}>${c.title}</option>`).join('');
        html += `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto custom-scroll pr-2">
                <div><label class="${labelStyle}">Content ID (Auto)</label><input type="text" id="f-content-id" readonly value="${data?.content_id || generateSystemID('cnt')}" class="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed"></div>
                <div><label class="${labelStyle}">Course *</label><select id="f-course-id" required class="${inputStyle}"><option value="" disabled ${!data ? 'selected' : ''}>-- Select Course --</option>${opts}</select></div>
                <div class="md:col-span-2"><label class="${labelStyle}">Title *</label><input type="text" id="f-title" required value="${data?.title || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Type *</label><select id="f-type" required class="${inputStyle}"><option value="video" ${data?.type === 'video' ? 'selected' : ''}>Video</option><option value="quiz" ${data?.type === 'quiz' ? 'selected' : ''}>Quiz</option><option value="project" ${data?.type === 'project' ? 'selected' : ''}>Project</option><option value="resource" ${data?.type === 'resource' ? 'selected' : ''}>Resource</option></select></div>
                <div><label class="${labelStyle}">Video ID</label><input type="text" id="f-video-id" value="${data?.video_id || ''}" placeholder="YouTube Video ID" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Order Index</label><input type="number" id="f-order" value="${data?.order_index || 0}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Base XP</label><input type="number" id="f-xp" value="${data?.base_xp || 0}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Duration (seconds)</label><input type="number" id="f-duration" value="${data?.duration || 0}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Author</label><input type="text" id="f-author" value="${data?.['Author'] || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Link Title</label><input type="text" id="f-link-title" value="${data?.['Link Title'] || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Ref Quiz ID (UUID)</label><input type="text" id="f-ref-quiz" value="${data?.ref_quiz_id || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Ref Project ID (UUID)</label><input type="text" id="f-ref-project" value="${data?.ref_project_id || ''}" class="${inputStyle}"></div>
                <div class="md:col-span-2"><label class="${labelStyle}">Note</label><input type="text" id="f-note" value="${data?.['Note'] || ''}" class="${inputStyle}"></div>
                <div class="md:col-span-2 flex items-center gap-3 bg-black/30 p-4 rounded-xl border border-white/5 dir-ltr"><input type="checkbox" id="f-status" ${!data || data?.status ? 'checked' : ''} class="w-4 h-4 rounded text-red-500"><label class="text-sm font-bold text-white cursor-pointer">Status Active</label></div>
            </div>
        `;
    }
    else if (cmCurrentLevel === 'quizzes') {
        html += `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="md:col-span-2"><label class="${labelStyle}">Quiz Title *</label><input type="text" id="f-title" required value="${data?.title || ''}" class="${inputStyle}"></div>
                <div class="md:col-span-2"><label class="${labelStyle}">Description</label><textarea id="f-desc" rows="2" class="${inputStyle}">${data?.description || ''}</textarea></div>
                <div><label class="${labelStyle}">Passing Score (%)</label><input type="number" id="f-pass" value="${data?.passing_score || 50}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Max XP</label><input type="number" id="f-max-xp" value="${data?.max_xp || 50}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Attempts Allowed</label><input type="number" id="f-attempts" value="${data?.attempts_allowed || 3}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Questions to Show</label><input type="number" id="f-q-show" value="${data?.questions_to_show || ''}" placeholder="Leave empty for all" class="${inputStyle}"></div>
            </div>
        `;
    }
    else if (cmCurrentLevel === 'quiz_questions') {
        const { data: quizzes } = await supabase.from('quizzes').select('quiz_id, title');
        const opts = (quizzes || []).map(q => `<option value="${q.quiz_id}" ${data?.quiz_id === q.quiz_id ? 'selected' : ''}>${q.title}</option>`).join('');
        html += `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto custom-scroll pr-2">
                <div class="md:col-span-2"><label class="${labelStyle}">Select Quiz *</label><select id="f-quiz-id" required class="${inputStyle}"><option value="" disabled ${!data ? 'selected' : ''}>-- Select Quiz --</option>${opts}</select></div>
                <div class="md:col-span-2"><label class="${labelStyle}">Question Text *</label><textarea id="f-q-text" rows="2" required class="${inputStyle}">${data?.question_text || ''}</textarea></div>
                <div><label class="${labelStyle}">Option A *</label><input type="text" id="f-opt-a" required value="${data?.option_a || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Option B *</label><input type="text" id="f-opt-b" required value="${data?.option_b || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Option C</label><input type="text" id="f-opt-c" value="${data?.option_c || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Option D</label><input type="text" id="f-opt-d" value="${data?.option_d || ''}" class="${inputStyle}"></div>
                <div class="md:col-span-2">
                    <label class="${labelStyle}">Correct Answer *</label>
                    <select id="f-correct" required class="${inputStyle}">
                        <option value="A" ${data?.correct_answer === 'A' ? 'selected' : ''}>Option A</option>
                        <option value="B" ${data?.correct_answer === 'B' ? 'selected' : ''}>Option B</option>
                        <option value="C" ${data?.correct_answer === 'C' ? 'selected' : ''}>Option C</option>
                        <option value="D" ${data?.correct_answer === 'D' ? 'selected' : ''}>Option D</option>
                    </select>
                </div>
                <div class="md:col-span-2"><label class="${labelStyle}">Hint (Optional)</label><textarea id="f-hint" rows="2" class="${inputStyle}">${data?.hint || ''}</textarea></div>
            </div>
        `;
    }
    else if (cmCurrentLevel === 'projects') {
        html += `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="md:col-span-2"><label class="${labelStyle}">Project Title *</label><input type="text" id="f-title" required value="${data?.title || ''}" class="${inputStyle}"></div>
                <div class="md:col-span-2"><label class="${labelStyle}">Description *</label><textarea id="f-desc" rows="3" required class="${inputStyle}">${data?.description || ''}</textarea></div>
                <div class="md:col-span-2"><label class="${labelStyle}">Requirements URL</label><input type="text" id="f-req-url" value="${data?.requirements_url || ''}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Max Points</label><input type="number" id="f-max-pts" value="${data?.max_points || 100}" class="${inputStyle}"></div>
                <div><label class="${labelStyle}">Submission Method</label><input type="text" id="f-method" value="${data?.submission_method || 'github_link'}" class="${inputStyle}"></div>
            </div>
        `;
    }

    container.innerHTML = html;
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

        if (cmCurrentLevel === 'tracks') {
            payload = { name: document.getElementById('f-name').value, description: document.getElementById('f-desc').value, is_active: document.getElementById('f-active').checked };
        } 
        else if (cmCurrentLevel === 'phases') {
            payload = { 
                phase_id: document.getElementById('f-phase-id').value, track_id: document.getElementById('f-track-id').value, 
                title: document.getElementById('f-title').value, description: document.getElementById('f-desc').value,
                image_url: document.getElementById('f-img-url').value, 'Module Time': document.getElementById('f-module-time').value,
                prerequisites: document.getElementById('f-prereq').value, will_learn: document.getElementById('f-will-learn').value,
                'Note': document.getElementById('f-note').value, is_active: document.getElementById('f-active').checked 
            };
        } 
        else if (cmCurrentLevel === 'courses') {
            const preqRaw = document.getElementById('f-prereq').value;
            const toolsRaw = document.getElementById('f-tools').value;
            payload = { 
                course_id: document.getElementById('f-course-id').value, phase_id: document.getElementById('f-phase-id').value, 
                title: document.getElementById('f-title').value, description: document.getElementById('f-desc').value,
                type: document.getElementById('f-type').value, playlist_id: document.getElementById('f-playlist').value,
                image_url: document.getElementById('f-img-url').value, 'Module_Time': document.getElementById('f-module-time').value,
                will_learn: document.getElementById('f-will-learn').value, 'Note': document.getElementById('f-note').value,
                related_with: document.getElementById('f-related').value, prerequisites: preqRaw ? preqRaw.split(',').map(s=>s.trim()).filter(Boolean) : [],
                tools_required: toolsRaw ? toolsRaw.split(',').map(s=>s.trim()).filter(Boolean) : [], auto_sync: document.getElementById('f-auto-sync').checked,
                is_active: document.getElementById('f-active').checked 
            };
        }
        else if (cmCurrentLevel === 'course_materials') {
            payload = { 
                content_id: document.getElementById('f-content-id').value, course_id: document.getElementById('f-course-id').value, 
                title: document.getElementById('f-title').value, type: document.getElementById('f-type').value,
                video_id: document.getElementById('f-video-id').value, duration: parseInt(document.getElementById('f-duration').value) || 0,
                order_index: parseInt(document.getElementById('f-order').value) || 0, base_xp: parseInt(document.getElementById('f-xp').value) || 0,
                'Author': document.getElementById('f-author').value, 'Link Title': document.getElementById('f-link-title').value,
                'Note': document.getElementById('f-note').value, ref_quiz_id: document.getElementById('f-ref-quiz').value || null,
                ref_project_id: document.getElementById('f-ref-project').value || null, status: document.getElementById('f-status').checked 
            };
        }
        else if (cmCurrentLevel === 'quizzes') {
            payload = {
                title: document.getElementById('f-title').value, description: document.getElementById('f-desc').value,
                passing_score: parseInt(document.getElementById('f-pass').value) || 50, max_xp: parseInt(document.getElementById('f-max-xp').value) || 50,
                attempts_allowed: parseInt(document.getElementById('f-attempts').value) || 3, 
                questions_to_show: document.getElementById('f-q-show').value ? parseInt(document.getElementById('f-q-show').value) : null
            };
        }
        else if (cmCurrentLevel === 'quiz_questions') {
            payload = {
                quiz_id: document.getElementById('f-quiz-id').value, question_text: document.getElementById('f-q-text').value,
                option_a: document.getElementById('f-opt-a').value, option_b: document.getElementById('f-opt-b').value,
                option_c: document.getElementById('f-opt-c').value, option_d: document.getElementById('f-opt-d').value,
                correct_answer: document.getElementById('f-correct').value, hint: document.getElementById('f-hint').value
            };
        }
        else if (cmCurrentLevel === 'projects') {
            payload = {
                title: document.getElementById('f-title').value, description: document.getElementById('f-desc').value,
                requirements_url: document.getElementById('f-req-url').value, max_points: parseInt(document.getElementById('f-max-pts').value) || 100,
                submission_method: document.getElementById('f-method').value
            };
        }

        if (cmCurrentEditId) {
            const { error } = await supabase.from(cmCurrentLevel).update(payload).eq(pk, cmCurrentEditId);
            if (error) throw error;
            window.showToast("تم تحديث البيانات بنجاح!", "success");
        } else {
            const { error } = await supabase.from(cmCurrentLevel).insert([payload]);
            if (error) throw error;
            window.showToast("تمت الإضافة بنجاح!", "success");
        }

        window.cmCloseModal();
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