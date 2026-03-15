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

// AIzaSyCeiKc-MsUQs3TDOC7yvqD_Qx3mayLqY6Q



// ==========================================
// 🚀 YOUTUBE SMART IMPORT ENGINE
// ==========================================
const YOUTUBE_API_KEY = 'AIzaSyCeiKc-MsUQs3TDOC7yvqD_Qx3mayLqY6Q'; // ضعه هنا لاحقاً
window.ytImportEngine = {
    state: {
        playlistId: '',
        videos: [],
        courseTitle: '',
        courseDesc: '',
        thumbnail: ''
    },
    sortableInst: null,

openWizard: async () => {
        document.getElementById('yt-input-url').value = '';
        document.getElementById('yt-step-1').classList.remove('-translate-x-full', 'translate-x-full');
        document.getElementById('yt-step-2').classList.add('translate-x-full');
        document.getElementById('yt-import-wizard').classList.remove('hidden');
        document.getElementById('yt-wizard-step-text').innerText = 'Step 1: Input Source';
        
        // 1. جلب المسارات (Tracks)
        const { data: tracks } = await supabase.from('tracks').select('id, name');
        const trackSelect = document.getElementById('yt-course-track');
        trackSelect.innerHTML = '<option value="" disabled selected>-- اختر المسار (Track) --</option>' + 
            (tracks || []).map(t => `<option value="${t.id}">${t.name}</option>`).join('');
            
        // 2. جلب الكورسات للارتباط (Related With)
        const { data: courses } = await supabase.from('courses').select('course_id, title');
        const relatedSelect = document.getElementById('yt-course-related');
        if(relatedSelect) {
            relatedSelect.innerHTML = '<option value="">بدون ارتباط (مستقل)</option>' + 
                (courses || []).map(c => `<option value="${c.course_id}">${c.title}</option>`).join('');
        }

        // 3. إعادة تعيين حقل المراحل
        const phaseSelect = document.getElementById('yt-course-phase');
        phaseSelect.innerHTML = '<option value="" disabled selected>-- يرجى اختيار المسار أولاً --</option>';
        phaseSelect.disabled = true;
        phaseSelect.classList.replace('bg-black', 'bg-black/50');
    },
    // 2. تحميل المراحل بناءً على المسار المختار
    loadPhases: async (trackId) => {
        const { data: phases } = await supabase.from('phases').select('phase_id, title').eq('track_id', trackId);
        const phaseSelect = document.getElementById('yt-course-phase');
        phaseSelect.disabled = false;
        phaseSelect.classList.replace('bg-black/50', 'bg-black');
        phaseSelect.innerHTML = '<option value="" disabled selected>-- اختر المرحلة (Phase) --</option>' + 
            (phases || []).map(p => `<option value="${p.phase_id}">${p.title}</option>`).join('');
    },

    closeWizard: () => {
        document.getElementById('yt-import-wizard').classList.add('hidden');
    },

    // 3. الاتصال بيوتيوب الفعلي وجلب البيانات
    fetchPlaylist: async () => {
        const input = document.getElementById('yt-input-url').value.trim();
        const btn = document.getElementById('btn-yt-fetch');
        if(!input) return window.showToast("يرجى إدخال الرابط أولاً", "error");

        const match = input.match(/[?&]list=([^#\&\?]*)/) || input.match(/^([a-zA-Z0-9_-]+)$/);
        const playlistId = match ? match[1] : input;

        if(!YOUTUBE_API_KEY || YOUTUBE_API_KEY.includes('ضع_مفتاح')) {
            return window.showToast("يرجى وضع YOUTUBE_API_KEY في الكود لكي تعمل الميزة.", "error");
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحليل...';
        btn.disabled = true;

        try {
            // أ) جلب اسم ووصف الكورس
            const plRes = await fetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${YOUTUBE_API_KEY}`);
            const plData = await plRes.json();
            if(plData.error) throw new Error(plData.error.message);
            if(!plData.items || plData.items.length === 0) throw new Error("Playlist not found or private");
            
            ytImportEngine.state.playlistId = playlistId;
            ytImportEngine.state.courseTitle = plData.items[0].snippet.title;
            ytImportEngine.state.courseDesc = plData.items[0].snippet.description;

            // ب) جلب كل الفيديوهات (التعامل مع الصفحات لو أكثر من 50 فيديو)
            let allItems = [];
            let nextPageToken = '';
            do {
                const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${YOUTUBE_API_KEY}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
                const res = await fetch(url);
                const data = await res.json();
                if(data.items) allItems.push(...data.items);
                nextPageToken = data.nextPageToken;
            } while(nextPageToken);

            // ج) جلب مدة الفيديوهات (Durations) في دفعات (50 فيديو بالدفعة)
            const videoIds = allItems.map(item => item.contentDetails.videoId);
            let durationsMap = {};
            for (let i = 0; i < videoIds.length; i += 50) {
                const chunk = videoIds.slice(i, i + 50).join(',');
                const vRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${chunk}&key=${YOUTUBE_API_KEY}`);
                const vData = await vRes.json();
                if(vData.items) {
                    vData.items.forEach(v => {
                        durationsMap[v.id] = ytImportEngine.parseDuration(v.contentDetails.duration);
                    });
                }
            }

            // د) تعيين البيانات للحالة (State)
            ytImportEngine.state.videos = allItems.map((item, i) => {
                const vId = item.contentDetails.videoId;
                const snippet = item.snippet;
                const thumb = snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '../assets/icons/icon.jpg';
                const isDeleted = snippet.title === 'Private video' || snippet.title === 'Deleted video';
                return {
                    id: `vid_${Date.now()}_${i}`,
                    videoId: vId,
                    title: snippet.title,
                    duration: durationsMap[vId] || 0,
                    thumbnail: thumb,
                    order_index: i + 1,
                    type: 'video',
                    is_excluded: isDeleted
                };
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
        const h = parseInt(match[1]) || 0;
        const m = parseInt(match[2]) || 0;
        const s = parseInt(match[3]) || 0;
        return (h * 3600) + (m * 60) + s;
    },

    // 4. بناء الشاشة الثانية (السحب والإفلات والمراجعة)
    renderBuilder: () => {
        document.getElementById('yt-step-1').classList.add('-translate-x-full');
        document.getElementById('yt-step-2').classList.remove('translate-x-full');
        document.getElementById('yt-wizard-step-text').innerText = 'Step 2: Review & Build';
        
        document.getElementById('yt-course-title').value = ytImportEngine.state.courseTitle;
        document.getElementById('yt-course-desc').value = ytImportEngine.state.courseDesc;

        ytImportEngine.updateVideosUI();

        // تفعيل السحب والإفلات (SortableJS)
        const listContainer = document.getElementById('yt-builder-list');
        if(ytImportEngine.sortableInst) ytImportEngine.sortableInst.destroy();
        
        ytImportEngine.sortableInst = new Sortable(listContainer, {
            animation: 150,
            handle: '.fa-grip-lines',
            ghostClass: 'opacity-50',
            onEnd: function (evt) {
                // تحديث المصفوفة بعد السحب
                const movedItem = ytImportEngine.state.videos.splice(evt.oldIndex, 1)[0];
                ytImportEngine.state.videos.splice(evt.newIndex, 0, movedItem);
                ytImportEngine.updateVideosUI(); // إعادة الترتيب البصري وتحديث الأرقام
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
            // تحديث الترتيب الفعلي داخل المصفوفة ليتوافق مع الـ UI
            vid.order_index = index + 1; 
            
            return `
            <div class="flex items-center gap-3 p-3 rounded-xl border transition-all ${vid.is_excluded ? 'bg-red-900/10 border-red-500/20 opacity-50' : vid.type === 'section' ? 'bg-purple-900/20 border-purple-500/30 mt-6' : 'bg-white/5 border-white/10 hover:border-white/20'}">
                <div class="flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing text-gray-500 hover:text-white px-2 handle fa-grip-lines-container">
                    <i class="fas fa-grip-lines text-lg"></i>
                    <span class="text-[10px] font-mono">${index + 1}</span>
                </div>
                
                <div class="w-24 h-14 bg-black rounded-lg bg-cover bg-center border border-white/10 shrink-0 relative overflow-hidden" style="background-image: url('${vid.thumbnail}')">
                    ${vid.type === 'section' ? '<div class="absolute inset-0 bg-purple-500/50 flex items-center justify-center"><i class="fas fa-folder-open text-white"></i></div>' : ''}
                </div>

                <div class="flex-1 space-y-2">
                    <input type="text" value="${vid.title}" onchange="ytImportEngine.updateVidData(${index}, 'title', this.value)" class="w-full bg-transparent border-b border-transparent hover:border-white/20 focus:border-b-primary outline-none text-sm font-bold text-white transition-colors px-1" ${vid.is_excluded ? 'disabled' : ''}>
                    
                    <div class="flex items-center gap-2">
                        <select onchange="ytImportEngine.updateVidData(${index}, 'type', this.value)" class="bg-black/50 border border-white/10 rounded px-2 py-0.5 text-[10px] text-gray-300 outline-none" ${vid.is_excluded ? 'disabled' : ''}>
                            <option value="video" ${vid.type === 'video' ? 'selected' : ''}>Video Lesson</option>
                            <option value="demo" ${vid.type === 'demo' ? 'selected' : ''}>Demo/Practical</option>
                            <option value="optional" ${vid.type === 'optional' ? 'selected' : ''}>Optional</option>
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
            </div>
            `;
        }).join('');
    },

    updateVidData: (index, key, val) => {
        ytImportEngine.state.videos[index][key] = val;
        ytImportEngine.runHealthCheck();
    },

    toggleExclude: (index) => {
        ytImportEngine.state.videos[index].is_excluded = !ytImportEngine.state.videos[index].is_excluded;
        ytImportEngine.updateVideosUI();
        ytImportEngine.runHealthCheck();
    },

    autoSplitSections: () => {
        ytImportEngine.state.videos.forEach(vid => {
            const titleLower = vid.title.toLowerCase();
            if (titleLower.includes('part') || titleLower.includes('chapter') || titleLower.includes('module') || titleLower.includes('مقدمة')) {
                vid.type = 'section';
            }
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
        const isActive = document.getElementById('yt-course-active').checked;
        const autoSync = document.getElementById('yt-course-sync').checked;
        
        // 💡 التقاط الحقول الجديدة (النوع والارتباط)
        const courseType = document.getElementById('yt-course-type')?.value || 'course';
        const relatedWith = document.getElementById('yt-course-related')?.value || null;

        const btn = document.getElementById('btn-yt-save');

        if (!title || !phaseId) return window.showToast("يجب إدخال عنوان الكورس واختيار المرحلة (Phase)", "error");

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ والمعالجة...';
        btn.disabled = true;

        try {
            const courseId = 'cr_' + Date.now().toString(36);
            const totalDur = ytImportEngine.state.videos.filter(v=>!v.is_excluded).reduce((a,b)=>a+b.duration, 0);

            // 💡 تحديث الـ Payload لإرسال النوع والارتباط للداتابيز
            const coursePayload = {
                course_id: courseId,
                phase_id: phaseId,
                title: title,
                description: desc,
                type: courseType, 
                related_with: relatedWith,
                playlist_id: ytImportEngine.state.playlistId,
                image_url: ytImportEngine.state.videos[0]?.thumbnail || '',
                is_active: isActive,
                auto_sync: autoSync,
                "Module_Time": `${Math.round(totalDur/3600)} Hours`
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