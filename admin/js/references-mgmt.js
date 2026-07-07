import { supabase } from '../../js/supabase-config.js';

// ==========================================
// 🚀 GLOBAL VARIABLES & STATE
// ==========================================
let allReferences = [];
let allTracks = [];
let allPhases = [];
let allCourses = [];
let allLessons = [];
let selectedTracks = new Set();
let selectedPhases = new Set();
let selectedCourses = new Set();

let referencesViewMode = 'table'; // 'table' or 'grid'

// ==========================================
// 🚀 INITIALIZATION
// ==========================================
async function initReferencesMgmt() {
    setupReferencesEventListeners();
    await loadInitialData();
    await fetchReferences();
}

async function loadInitialData() {
    try {
        const [tracksRes, phasesRes, coursesRes, lessonsRes] = await Promise.all([
            supabase.from('tracks').select('*').eq('is_active', true).order('name'),
            supabase.from('phases').select('*').eq('is_active', true).order('order_index'),
            supabase.from('courses').select('*').eq('is_active', true).order('title'),
            supabase.from('course_materials').select('*').eq('status', true).order('order_index')
        ]);

        if (tracksRes.error) throw tracksRes.error;
        if (phasesRes.error) throw phasesRes.error;
        if (coursesRes.error) throw coursesRes.error;
        if (lessonsRes.error) throw lessonsRes.error;

        allTracks = tracksRes.data || [];
        allPhases = phasesRes.data || [];
        allCourses = coursesRes.data || [];
        allLessons = lessonsRes.data || [];

        populateTypeFilter();
        renderTracksChecklist();
    } catch (err) {
        console.error("References Mgmt Initial Data Load Error:", err);
        showToast("حدث خطأ أثناء تحميل بيانات التصنيفات والمسارات", "error");
    }
}

// ==========================================
// 🚀 UI RENDERERS & CHECKS
// ==========================================
function populateTypeFilter() {
    const filter = document.getElementById('admin-references-type-filter');
    if (!filter) return;

    const types = [
        'Research Paper', 'Scientific Article', 'PDF Book', 'Reference Book', 
        'Lecture Notes', 'Documentation', 'Standard', 'White Paper', 
        'Technical Report', 'Datasheet', 'Application Note', 'User Manual', 
        'Specification', 'Academic Thesis', 'Magazine', 'Journal', 
        'Blog Article', 'External Learning Resource', 'Other'
    ];

    filter.innerHTML = '<option value="all">كل الأنواع</option>' + 
        types.map(t => `<option value="${t}">${t}</option>`).join('');
}

// Fetch References List
async function fetchReferences() {
    const tbody = document.getElementById('admin-references-table-body');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-12 text-center text-gray-500"><i class="fas fa-spinner fa-spin text-teal-500 text-3xl mb-3"></i><p>جاري تحميل مكتبة المراجع العلمية...</p></td></tr>`;
    }

    try {
        const { data, error } = await supabase
            .from('reference_library')
            .select('*')
            .order('title', { ascending: true });

        if (error) throw error;

        allReferences = data || [];
        updateStats();
        filterAndRenderReferences();
    } catch (err) {
        console.error("Fetch References Error:", err);
        showToast("فشل تحميل قائمة المراجع من السيرفر", "error");
    }
}

function updateStats() {
    const total = allReferences.length;
    const papers = allReferences.filter(r => r.type === 'Research Paper' || r.type === 'Journal').length;
    const books = allReferences.filter(r => r.type === 'PDF Book' || r.type === 'Reference Book').length;
    const articles = allReferences.filter(r => r.type === 'Scientific Article' || r.type === 'Article' || r.type === 'Blog Article').length;

    // Most viewed
    let maxViewRef = { title: '---', views_count: 0 };
    if (total > 0) {
        maxViewRef = allReferences.reduce((max, r) => (r.views_count || 0) > (max.views_count || 0) ? r : max, allReferences[0]);
    }

    // Top author (count occurrences)
    let topAuthor = '---';
    if (total > 0) {
        const authors = allReferences.map(r => r.author).filter(Boolean);
        if (authors.length > 0) {
            const counts = {};
            authors.forEach(a => counts[a] = (counts[a] || 0) + 1);
            topAuthor = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
        }
    }

    const elTotal = document.getElementById('stat-refs-total');
    const elPapers = document.getElementById('stat-refs-papers');
    const elBooks = document.getElementById('stat-refs-books');
    const elArticles = document.getElementById('stat-refs-articles');
    const elMostViewed = document.getElementById('stat-refs-most-viewed');
    const elTopAuthor = document.getElementById('stat-refs-top-author');

    if (elTotal) elTotal.textContent = total;
    if (elPapers) elPapers.textContent = papers;
    if (elBooks) elBooks.textContent = books;
    if (elArticles) elArticles.textContent = articles;
    if (elMostViewed) elMostViewed.textContent = maxViewRef.title.length > 25 ? maxViewRef.title.substring(0, 22) + '...' : maxViewRef.title;
    if (elTopAuthor) elTopAuthor.textContent = topAuthor;
}

// Filter and Render References List
function filterAndRenderReferences() {
    const searchVal = document.getElementById('admin-references-search')?.value.toLowerCase().trim() || '';
    const typeVal = document.getElementById('admin-references-type-filter')?.value || 'all';
    const statusVal = document.getElementById('admin-references-status-filter')?.value || 'all';

    const filtered = allReferences.filter(r => {
        const matchesSearch = !searchVal || 
            r.title.toLowerCase().includes(searchVal) ||
            (r.short_title && r.short_title.toLowerCase().includes(searchVal)) ||
            (r.author && r.author.toLowerCase().includes(searchVal)) ||
            (r.publisher && r.publisher.toLowerCase().includes(searchVal)) ||
            (r.abstract && r.abstract.toLowerCase().includes(searchVal)) ||
            (r.tags && r.tags.some(tag => tag.toLowerCase().includes(searchVal)));
        const matchesType = typeVal === 'all' || r.type === typeVal;
        const matchesStatus = statusVal === 'all' || r.status === statusVal;

        return matchesSearch && matchesType && matchesStatus;
    });

    if (referencesViewMode === 'table') {
        renderReferencesTable(filtered);
    } else {
        renderReferencesGrid(filtered);
    }
}

function renderReferencesTable(refs) {
    const tbody = document.getElementById('admin-references-table-body');
    const tableCont = document.getElementById('admin-references-table-container');
    const gridCont = document.getElementById('admin-references-grid-container');

    if (!tbody || !tableCont || !gridCont) return;

    tableCont.classList.remove('hidden');
    gridCont.classList.add('hidden');

    if (refs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-10 text-center text-gray-500 font-bold">لا توجد مراجع علمية مطابقة للبحث حالياً.</td></tr>`;
        return;
    }

    tbody.innerHTML = refs.map(ref => {
        const clicks = ref.clicks_count || 0;
        const views = ref.views_count || 0;
        
        let statusColor = 'bg-gray-500/10 text-gray-400 border-gray-500/20';
        if (ref.status === 'Published') statusColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
        else if (ref.status === 'Draft') statusColor = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
        else if (ref.status === 'Hidden') statusColor = 'bg-purple-500/10 text-purple-400 border-purple-500/20';

        const updatedDate = ref.updated_at ? new Date(ref.updated_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '---';

        return `
            <tr class="hover:bg-white/5 transition-all">
                <td class="p-4 text-center">
                    <div class="w-10 h-14 bg-white/5 rounded-lg border border-white/5 flex items-center justify-center overflow-hidden mx-auto shrink-0 shadow">
                        <img src="${ref.cover_url || '../../assets/icons/BUSLA-icon.png'}" class="w-full h-full object-cover" onerror="this.src='../../assets/icons/BUSLA-icon.png'">
                    </div>
                </td>
                <td class="p-4 font-bold text-white max-w-[200px]">
                    <span class="hover:text-teal-400 cursor-pointer block truncate" onclick="window.editReference('${ref.id}')" title="${ref.title}">${ref.title}</span>
                    <span class="text-[10px] text-gray-500 block mt-1 truncate">${ref.author || 'مؤلف غير معروف'} • ${ref.publication_year || '---'}</span>
                </td>
                <td class="p-4"><span class="text-xs bg-white/5 px-2.5 py-1 rounded border border-white/5 block text-center truncate max-w-[120px]">${ref.type}</span></td>
                <td class="p-4 text-xs font-semibold text-gray-300 text-center">${ref.importance || 'Optional'}</td>
                <td class="p-4 text-xs text-gray-300 text-center">${ref.experience_level || 'Beginner'}</td>
                <td class="p-4 text-center font-mono">
                    <span class="text-white font-bold" title="زيارات">${views}</span>
                    <span class="text-gray-600 mx-1">/</span>
                    <span class="text-teal-400 font-bold" title="ضغطات">${clicks}</span>
                </td>
                <td class="p-4 text-xs text-gray-400 text-center">${updatedDate}</td>
                <td class="p-4 text-center"><span class="text-[10px] border px-2.5 py-0.5 rounded font-bold uppercase tracking-wider ${statusColor}">${ref.status}</span></td>
                <td class="p-4 text-left">
                    <div class="flex items-center gap-1.5 justify-start">
                        <button onclick="window.editReference('${ref.id}')" class="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white transition-all text-xs" title="تعديل"><i class="fas fa-edit"></i></button>
                        <button onclick="window.duplicateReference('${ref.id}')" class="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white transition-all text-xs" title="نسخ"><i class="far fa-copy"></i></button>
                        <button onclick="window.toggleReferencePublish('${ref.id}', '${ref.status}')" class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white transition-all text-xs" title="${ref.status === 'Published' ? 'إلغاء النشر' : 'نشر'}">
                            <i class="${ref.status === 'Published' ? 'fas fa-eye-slash' : 'fas fa-eye'}"></i>
                        </button>
                        <button onclick="window.deleteReference('${ref.id}')" class="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all text-xs" title="حذف"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderReferencesGrid(refs) {
    const tableCont = document.getElementById('admin-references-table-container');
    const gridCont = document.getElementById('admin-references-grid-container');

    if (!tableCont || !gridCont) return;

    tableCont.classList.add('hidden');
    gridCont.classList.remove('hidden');

    if (refs.length === 0) {
        gridCont.innerHTML = `<div class="col-span-full text-center text-gray-500 py-10 font-bold">لا توجد مراجع علمية مطابقة للبحث حالياً.</div>`;
        return;
    }

    gridCont.innerHTML = refs.map(ref => {
        const clicks = ref.clicks_count || 0;
        const views = ref.views_count || 0;
        
        let statusColor = 'bg-gray-500/10 text-gray-400 border-gray-500/20';
        if (ref.status === 'Published') statusColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
        else if (ref.status === 'Draft') statusColor = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
        else if (ref.status === 'Hidden') statusColor = 'bg-purple-500/10 text-purple-400 border-purple-500/20';

        return `
            <div class="bg-b-surface border border-white/10 rounded-2xl p-5 flex flex-col justify-between h-full hover:border-teal-500/30 transition-all duration-300 shadow-xl group relative">
                <div>
                    <!-- Status Badge -->
                    <span class="absolute top-4 left-4 text-[9px] border px-2 py-0.5 rounded font-bold uppercase tracking-wider ${statusColor}">${ref.status}</span>
                    
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-12 h-16 bg-white/5 rounded-lg border border-white/5 flex items-center justify-center overflow-hidden shrink-0 shadow">
                            <img src="${ref.cover_url || '../../assets/icons/BUSLA-icon.png'}" class="w-full h-full object-cover" onerror="this.src='../../assets/icons/BUSLA-icon.png'">
                        </div>
                        <div class="text-right flex-1 min-w-0">
                            <h3 class="text-base font-bold text-white leading-tight hover:text-teal-400 cursor-pointer block truncate" onclick="window.editReference('${ref.id}')">${ref.title}</h3>
                            <span class="text-[10px] text-gray-500 mt-1 block truncate">${ref.author || 'مؤلف غير معروف'} • ${ref.publication_year || '---'}</span>
                            <span class="text-[9px] text-teal-500 mt-0.5 block">${ref.type} • ${ref.importance}</span>
                        </div>
                    </div>
                    
                    <p class="text-gray-400 text-xs text-right leading-relaxed line-clamp-3 mb-4">${ref.short_description || 'لا يوجد وصف مختصر.'}</p>
                </div>
                
                <div class="border-t border-white/5 pt-4 mt-auto">
                    <div class="flex justify-between items-center text-xs text-gray-400 mb-4">
                        <span class="font-mono">زيارات: <b class="text-white">${views}</b> • ضغطات: <b class="text-teal-400">${clicks}</b></span>
                        <span>مستوى: <b class="text-gray-300">${ref.experience_level}</b></span>
                    </div>
                    
                    <div class="flex justify-end gap-1.5">
                        <button onclick="window.editReference('${ref.id}')" class="flex-1 py-2 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white transition-all text-xs font-bold flex items-center justify-center gap-1"><i class="fas fa-edit"></i> تعديل</button>
                        <button onclick="window.duplicateReference('${ref.id}')" class="px-3 py-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white transition-all text-xs" title="نسخ"><i class="far fa-copy"></i></button>
                        <button onclick="window.toggleReferencePublish('${ref.id}', '${ref.status}')" class="px-3 py-2 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white transition-all text-xs" title="${ref.status === 'Published' ? 'إلغاء النشر' : 'نشر'}">
                            <i class="${ref.status === 'Published' ? 'fas fa-eye-slash' : 'fas fa-eye'}"></i>
                        </button>
                        <button onclick="window.deleteReference('${ref.id}')" class="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all text-xs" title="حذف"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// 🚀 DYNAMIC CHECKBOX LIST BUILDERS
// ==========================================
function renderTracksChecklist() {
    const container = document.getElementById('rc-tracks-list');
    if (!container) return;

    container.innerHTML = allTracks.map(track => `
        <label class="flex items-center gap-2 justify-end cursor-pointer text-xs text-gray-300">
            <span>${track.name}</span>
            <input type="checkbox" name="ref-tracks" value="${track.id}" class="track-chk rounded border-white/10 bg-black text-teal-600 focus:ring-teal-500">
        </label>
    `).join('');

    // Bind change listener
    document.querySelectorAll('.track-chk').forEach(chk => {
        chk.addEventListener('change', () => {
            if (chk.checked) selectedTracks.add(chk.value);
            else selectedTracks.delete(chk.value);
            renderPhasesChecklist();
        });
    });
}

function renderPhasesChecklist() {
    const container = document.getElementById('rc-phases-list');
    if (!container) return;

    if (selectedTracks.size === 0) {
        container.innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">أختر مساراً أولاً لتعبئة المراحل</div>`;
        document.getElementById('rc-courses-list').innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">أختر مرحلة أولاً لتعبئة الكورسات</div>`;
        document.getElementById('rc-lessons-list').innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">أختر كورساً أولاً لتعبئة الدروس</div>`;
        selectedPhases.clear();
        selectedCourses.clear();
        return;
    }

    const filteredPhases = allPhases.filter(phase => selectedTracks.has(phase.track_id));

    if (filteredPhases.length === 0) {
        container.innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">لا توجد مراحل مسجلة لهذه المسارات</div>`;
        return;
    }

    container.innerHTML = filteredPhases.map(phase => `
        <label class="flex items-center gap-2 justify-end cursor-pointer text-xs text-gray-300">
            <span>${phase.title}</span>
            <input type="checkbox" name="ref-phases" value="${phase.phase_id}" class="phase-chk rounded border-white/10 bg-black text-teal-600 focus:ring-teal-500">
        </label>
    `).join('');

    // Bind change listener
    document.querySelectorAll('.phase-chk').forEach(chk => {
        chk.addEventListener('change', () => {
            if (chk.checked) selectedPhases.add(chk.value);
            else selectedPhases.delete(chk.value);
            renderCoursesChecklist();
        });
    });
}

function renderCoursesChecklist() {
    const container = document.getElementById('rc-courses-list');
    if (!container) return;

    if (selectedPhases.size === 0) {
        container.innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">أختر مرحلة أولاً لتعبئة الكورسات</div>`;
        document.getElementById('rc-lessons-list').innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">أختر كورساً أولاً لتعبئة الدروس</div>`;
        selectedCourses.clear();
        return;
    }

    const filteredCourses = allCourses.filter(c => selectedPhases.has(c.phase_id));

    if (filteredCourses.length === 0) {
        container.innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">لا توجد كورسات مسجلة لهذه المراحل</div>`;
        return;
    }

    container.innerHTML = filteredCourses.map(course => `
        <label class="flex items-center gap-2 justify-end cursor-pointer text-xs text-gray-300 font-light">
            <span>${course.title}</span>
            <input type="checkbox" name="ref-courses" value="${course.course_id}" class="course-chk rounded border-white/10 bg-black text-teal-600 focus:ring-teal-500">
        </label>
    `).join('');

    // Bind change listener
    document.querySelectorAll('.course-chk').forEach(chk => {
        chk.addEventListener('change', () => {
            if (chk.checked) selectedCourses.add(chk.value);
            else selectedCourses.delete(chk.value);
            renderLessonsChecklist();
        });
    });
}

function renderLessonsChecklist() {
    const container = document.getElementById('rc-lessons-list');
    if (!container) return;

    if (selectedCourses.size === 0) {
        container.innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">أختر كورساً أولاً لتعبئة الدروس</div>`;
        return;
    }

    const filteredLessons = allLessons.filter(lesson => selectedCourses.has(lesson.course_id));

    if (filteredLessons.length === 0) {
        container.innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">لا توجد دروس مسجلة لهذه الكورسات</div>`;
        return;
    }

    container.innerHTML = filteredLessons.map(lesson => `
        <label class="flex items-center gap-2 justify-end cursor-pointer text-xs text-gray-300 font-light text-right">
            <span>${lesson.title}</span>
            <input type="checkbox" name="ref-lessons" value="${lesson.content_id}" class="lesson-chk rounded border-white/10 bg-black text-teal-600 focus:ring-teal-500">
        </label>
    `).join('');
}

// Populate related references checklist in form
function renderRelatedReferencesChecklist(currentRefId) {
    const container = document.getElementById('rc-related-list');
    if (!container) return;

    const availableRefs = allReferences.filter(r => r.id !== currentRefId && r.status === 'Published');
    if (availableRefs.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-[10px] py-2 text-center col-span-2">لا توجد مراجع أخرى منشورة لتحديدها كمراجع مرتبطة.</div>';
        return;
    }

    container.innerHTML = availableRefs.map(r => `
        <label class="flex items-center gap-2 justify-end cursor-pointer text-[11px] text-gray-300">
            <span class="truncate block max-w-[140px] text-right" title="${r.title}">${r.title}</span>
            <input type="checkbox" name="ref-related" value="${r.id}" class="related-chk rounded border-white/10 bg-black text-teal-600 focus:ring-teal-500">
        </label>
    `).join('');
}

// ==========================================
// 🚀 CRUD FORM OPERATIONS
// ==========================================
function openAddReferenceModal() {
    resetReferenceForm();
    document.getElementById('admin-reference-modal-title').innerText = "إضافة مرجع علمي جديد";
    document.getElementById('admin-reference-modal').classList.remove('hidden');
}

function closeReferenceModal() {
    document.getElementById('admin-reference-modal').classList.add('hidden');
}

function resetReferenceForm() {
    document.getElementById('reference-id').value = '';
    document.getElementById('admin-reference-form').reset();
    
    // Select first tab in form modal
    document.querySelector('.reference-form-tab[data-formtab="rf-basic"]').click();

    selectedTracks.clear();
    selectedPhases.clear();
    selectedCourses.clear();

    document.getElementById('rc-phases-list').innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">أختر مساراً أولاً لتعبئة المراحل</div>`;
    document.getElementById('rc-courses-list').innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">أختر مرحلة أولاً لتعبئة الكورسات</div>`;
    document.getElementById('rc-lessons-list').innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">أختر كورساً أولاً لتعبئة الدروس</div>`;
    
    renderRelatedReferencesChecklist('');
}

async function editReference(refId) {
    resetReferenceForm();
    const ref = allReferences.find(r => r.id === refId);
    if (!ref) return;

    document.getElementById('admin-reference-modal-title').innerText = `تعديل بيانات المرجع: ${ref.title}`;
    
    // Basic Info mapping
    document.getElementById('reference-id').value = ref.id;
    document.getElementById('ref-title').value = ref.title;
    document.getElementById('ref-short-title').value = ref.short_title || '';
    document.getElementById('ref-short-desc').value = ref.short_description || '';
    document.getElementById('ref-full-desc').value = ref.full_description || '';
    document.getElementById('ref-type').value = ref.type || 'Research Paper';
    
    document.getElementById('ref-cover-url').value = ref.cover_url || '';
    document.getElementById('ref-banner-url').value = ref.banner_url || '';

    // Publication Info mapping
    document.getElementById('ref-author').value = ref.author || '';
    document.getElementById('ref-contributors').value = (ref.contributors || []).join(', ');
    document.getElementById('ref-institution').value = ref.institution || '';
    document.getElementById('ref-university').value = ref.university || '';
    document.getElementById('ref-publisher').value = ref.publisher || '';
    document.getElementById('ref-journal').value = ref.journal || '';
    document.getElementById('ref-conference').value = ref.conference || '';
    document.getElementById('ref-pub-year').value = ref.publication_year || '';
    document.getElementById('ref-edition').value = ref.edition || '';
    document.getElementById('ref-doi').value = ref.doi || '';
    document.getElementById('ref-isbn').value = ref.isbn || '';
    document.getElementById('ref-issn').value = ref.issn || '';

    // Level, Importance, Language
    document.getElementById('ref-experience').value = ref.experience_level || 'Beginner';
    document.getElementById('ref-importance').value = ref.importance || 'Optional';
    document.getElementById('ref-language').value = ref.language || 'English';

    // Abstract info mapping
    document.getElementById('ref-abstract').value = ref.abstract || '';
    document.getElementById('ref-key-takeaways').value = (ref.key_takeaways || []).join('\n');
    document.getElementById('ref-key-ideas').value = (ref.key_ideas || []).join('\n');
    document.getElementById('ref-why-read').value = ref.why_read || '';
    document.getElementById('ref-what-learn').value = (ref.what_you_will_learn || []).join('\n');
    document.getElementById('ref-prereqs').value = (ref.prerequisites || []).join('\n');

    // Links mapping
    document.getElementById('ref-read-online').value = ref.read_online_url || '';
    document.getElementById('ref-download-pdf').value = ref.download_pdf_url || '';
    document.getElementById('ref-ieee').value = ref.ieee_url || '';
    document.getElementById('ref-springer').value = ref.springer_url || '';
    document.getElementById('ref-acm').value = ref.acm_url || '';
    document.getElementById('ref-sciencedirect').value = ref.sciencedirect_url || '';
    document.getElementById('ref-github').value = ref.github_url || '';
    document.getElementById('ref-official-source').value = ref.official_source_url || '';

    // Content connections mapping (Tracks / Phases / Courses / Lessons)
    selectedTracks = new Set(ref.track_ids || []);
    selectedPhases = new Set(ref.phase_ids || []);
    selectedCourses = new Set(ref.course_ids || []);
    
    // Checked Tracks
    document.querySelectorAll('#rc-tracks-list .track-chk').forEach(chk => {
        chk.checked = selectedTracks.has(chk.value);
    });

    // Build Phases checkboxes and check them
    renderPhasesChecklist();
    document.querySelectorAll('#rc-phases-list .phase-chk').forEach(chk => {
        chk.checked = selectedPhases.has(chk.value);
    });

    // Build Courses checkboxes and check them
    renderCoursesChecklist();
    document.querySelectorAll('#rc-courses-list .course-chk').forEach(chk => {
        chk.checked = selectedCourses.has(chk.value);
    });

    // Build Lessons/Content checkboxes and check them
    renderLessonsChecklist();
    const lessonIds = new Set(ref.content_ids || []);
    document.querySelectorAll('#rc-lessons-list .lesson-chk').forEach(chk => {
        chk.checked = lessonIds.has(chk.value);
    });

    // Related references checklist mapping
    renderRelatedReferencesChecklist(ref.id);
    const relatedIds = new Set(ref.related_references || []);
    document.querySelectorAll('#rc-related-list .related-chk').forEach(chk => {
        chk.checked = relatedIds.has(chk.value);
    });

    // SEO mapping
    document.getElementById('ref-slug').value = ref.slug || '';
    document.getElementById('ref-order-index').value = ref.order_index || 0;
    document.getElementById('ref-meta-title').value = ref.meta_title || '';
    document.getElementById('ref-meta-desc').value = ref.meta_description || '';
    document.getElementById('ref-meta-keywords').value = ref.meta_keywords || '';
    document.getElementById('ref-status').value = ref.status || 'Draft';

    const tags = ref.tags || [];
    document.getElementById('ref-tags').value = tags.join(', ');

    document.getElementById('admin-reference-modal').classList.remove('hidden');
}

async function submitReferenceForm(e) {
    e.preventDefault();

    const refId = document.getElementById('reference-id').value;
    const title = document.getElementById('ref-title').value.trim();
    const shortTitle = document.getElementById('ref-short-title').value.trim();
    const shortDesc = document.getElementById('ref-short-desc').value.trim();
    const fullDesc = document.getElementById('ref-full-desc').value.trim();
    const type = document.getElementById('ref-type').value;
    
    const coverUrl = document.getElementById('ref-cover-url').value.trim();
    const bannerUrl = document.getElementById('ref-banner-url').value.trim();

    // Publication Info
    const author = document.getElementById('ref-author').value.trim();
    const contributors = document.getElementById('ref-contributors').value.split(',').map(s => s.trim()).filter(Boolean);
    const institution = document.getElementById('ref-institution').value.trim();
    const university = document.getElementById('ref-university').value.trim();
    const publisher = document.getElementById('ref-publisher').value.trim();
    const journal = document.getElementById('ref-journal').value.trim();
    const conference = document.getElementById('ref-conference').value.trim();
    const pubYearStr = document.getElementById('ref-pub-year').value.trim();
    const publicationYear = pubYearStr ? parseInt(pubYearStr) : null;
    const edition = document.getElementById('ref-edition').value.trim();
    const doi = document.getElementById('ref-doi').value.trim();
    const isbn = document.getElementById('ref-isbn').value.trim();
    const issn = document.getElementById('ref-issn').value.trim();

    // Classification
    const experience = document.getElementById('ref-experience').value;
    const importance = document.getElementById('ref-importance').value;
    const language = document.getElementById('ref-language').value;

    // Abstract info
    const abstract = document.getElementById('ref-abstract').value.trim();
    const takeaways = document.getElementById('ref-key-takeaways').value.split('\n').map(s => s.trim()).filter(Boolean);
    const ideas = document.getElementById('ref-key-ideas').value.split('\n').map(s => s.trim()).filter(Boolean);
    const whyRead = document.getElementById('ref-why-read').value.trim();
    const whatLearn = document.getElementById('ref-what-learn').value.split('\n').map(s => s.trim()).filter(Boolean);
    const prereqs = document.getElementById('ref-prereqs').value.split('\n').map(s => s.trim()).filter(Boolean);

    // Dynamic checkboxes (linked curriculum contents)
    const trackIds = Array.from(document.querySelectorAll('#rc-tracks-list .track-chk:checked')).map(chk => chk.value);
    const phaseIds = Array.from(document.querySelectorAll('#rc-phases-list .phase-chk:checked')).map(chk => chk.value);
    const courseIds = Array.from(document.querySelectorAll('#rc-courses-list .course-chk:checked')).map(chk => chk.value);
    const lessonIds = Array.from(document.querySelectorAll('#rc-lessons-list .lesson-chk:checked')).map(chk => chk.value);

    // Links
    const readOnline = document.getElementById('ref-read-online').value.trim();
    const downloadPdf = document.getElementById('ref-download-pdf').value.trim();
    const ieee = document.getElementById('ref-ieee').value.trim();
    const springer = document.getElementById('ref-springer').value.trim();
    const acm = document.getElementById('ref-acm').value.trim();
    const sciencedirect = document.getElementById('ref-sciencedirect').value.trim();
    const github = document.getElementById('ref-github').value.trim();
    const officialSource = document.getElementById('ref-official-source').value.trim();

    // Related references
    const related = Array.from(document.querySelectorAll('#rc-related-list .related-chk:checked')).map(chk => chk.value);

    // SEO & Status
    const slug = document.getElementById('ref-slug').value.trim();
    const orderIndex = parseInt(document.getElementById('ref-order-index').value) || 0;
    const metaTitle = document.getElementById('ref-meta-title').value.trim();
    const metaDesc = document.getElementById('ref-meta-desc').value.trim();
    const metaKeywords = document.getElementById('ref-meta-keywords').value.trim();
    const status = document.getElementById('ref-status').value;
    
    const tags = document.getElementById('ref-tags').value.split(',').map(s => s.trim()).filter(Boolean);

    const payload = {
        title,
        short_title: shortTitle || null,
        short_description: shortDesc || null,
        full_description: fullDesc || null,
        cover_url: coverUrl || null,
        banner_url: bannerUrl || null,
        type,
        
        author: author || null,
        contributors: contributors,
        institution: institution || null,
        university: university || null,
        publisher: publisher || null,
        journal: journal || null,
        conference: conference || null,
        publication_year: publicationYear,
        edition: edition || null,
        doi: doi || null,
        isbn: isbn || null,
        issn: issn || null,

        experience_level: experience,
        importance,
        language,

        abstract: abstract || null,
        key_takeaways: takeaways,
        key_ideas: ideas,
        why_read: whyRead || null,
        what_you_will_learn: whatLearn,
        prerequisites: prereqs,

        track_ids: trackIds,
        phase_ids: phaseIds,
        course_ids: courseIds,
        content_ids: lessonIds,

        read_online_url: readOnline || null,
        download_pdf_url: downloadPdf || null,
        ieee_url: ieee || null,
        springer_url: springer || null,
        acm_url: acm || null,
        sciencedirect_url: sciencedirect || null,
        github_url: github || null,
        official_source_url: officialSource || null,

        related_references: related,
        slug: slug || null,
        order_index: orderIndex,
        meta_title: metaTitle || null,
        meta_description: metaDesc || null,
        meta_keywords: metaKeywords || null,
        status,
        tags,
        updated_at: new Date()
    };

    try {
        if (refId) {
            // Update
            const { error } = await supabase
                .from('reference_library')
                .update(payload)
                .eq('id', refId);

            if (error) throw error;
            showToast("تم تحديث بيانات المرجع بنجاح", "success");
        } else {
            // Insert
            payload.created_at = new Date();
            const { error } = await supabase
                .from('reference_library')
                .insert([payload]);

            if (error) throw error;
            showToast("تم إضافة المرجع الجديد بنجاح", "success");
        }

        closeReferenceModal();
        await fetchReferences();
    } catch (err) {
        console.error("Save Reference Form Error:", err);
        showToast("حدث خطأ أثناء حفظ بيانات المرجع: " + (err.message || err), "error");
    }
}

async function duplicateReference(refId) {
    const ref = allReferences.find(r => r.id === refId);
    if (!ref) return;

    const confirm = window.confirmDialog || window.confirm;
    const isApproved = confirm ? await window.confirmAction(`هل ترغب في إنشاء نسخة مكررة من المرجع "${ref.title}"؟`) : true;
    if (!isApproved) return;

    // Clone ref fields
    const copyPayload = { ...ref };
    delete copyPayload.id;
    copyPayload.title = ref.title + " - Copy";
    copyPayload.slug = (ref.slug || '') ? ref.slug + "-copy-" + Math.floor(Math.random() * 1000) : null;
    copyPayload.views_count = 0;
    copyPayload.clicks_count = 0;
    copyPayload.status = 'Draft'; // Reset status to draft
    copyPayload.created_at = new Date();
    copyPayload.updated_at = new Date();

    try {
        const { error } = await supabase
            .from('reference_library')
            .insert([copyPayload]);

        if (error) throw error;

        showToast("تم تكرار المرجع كمسودة بنجاح", "success");
        await fetchReferences();
    } catch (err) {
        console.error("Duplicate Reference Error:", err);
        showToast("حدث خطأ أثناء نسخ المرجع", "error");
    }
}

async function toggleReferencePublish(refId, currentStatus) {
    const newStatus = currentStatus === 'Published' ? 'Draft' : 'Published';
    
    try {
        const { error } = await supabase
            .from('reference_library')
            .update({ status: newStatus, updated_at: new Date() })
            .eq('id', refId);

        if (error) throw error;

        showToast(newStatus === 'Published' ? "تم نشر المرجع بنجاح" : "تم إلغاء نشر المرجع بنجاح", "success");
        await fetchReferences();
    } catch (err) {
        console.error("Toggle Publish Error:", err);
        showToast("حدث خطأ أثناء تعديل حالة النشر للمرجع", "error");
    }
}

async function deleteReference(refId) {
    const ref = allReferences.find(r => r.id === refId);
    if (!ref) return;

    const isApproved = await window.confirmAction(`⚠️ تحذير: هل أنت متأكد من رغبتك في حذف المرجع "${ref.title}" نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.`);
    if (!isApproved) return;

    try {
        const { error } = await supabase
            .from('reference_library')
            .delete()
            .eq('id', refId);

        if (error) throw error;

        showToast("تم حذف المرجع بنجاح", "success");
        await fetchReferences();
    } catch (err) {
        console.error("Delete Reference Error:", err);
        showToast("حدث خطأ أثناء حذف المرجع", "error");
    }
}

// ==========================================
// 🚀 EVENT LISTENERS & SETUP
// ==========================================
function setupReferencesEventListeners() {
    // Toolbar search and filters
    document.getElementById('admin-references-search')?.addEventListener('input', filterAndRenderReferences);
    document.getElementById('admin-references-type-filter')?.addEventListener('change', filterAndRenderReferences);
    document.getElementById('admin-references-status-filter')?.addEventListener('change', filterAndRenderReferences);

    // View toggles
    const gridBtn = document.getElementById('btn-admin-references-grid');
    const tableBtn = document.getElementById('btn-admin-references-table');

    gridBtn?.addEventListener('click', () => {
        referencesViewMode = 'grid';
        gridBtn.classList.add('border-teal-500/20', 'bg-teal-500/10', 'text-teal-400');
        tableBtn.classList.remove('border-teal-500/20', 'bg-teal-500/10', 'text-teal-400');
        filterAndRenderReferences();
    });

    tableBtn?.addEventListener('click', () => {
        referencesViewMode = 'table';
        tableBtn.classList.add('border-teal-500/20', 'bg-teal-500/10', 'text-teal-400');
        gridBtn.classList.remove('border-teal-500/20', 'bg-teal-500/10', 'text-teal-400');
        filterAndRenderReferences();
    });

    // Form Modal Tab Switching
    document.querySelectorAll('.reference-form-tab').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => {
            document.querySelectorAll('.reference-form-tab').forEach(b => {
                b.classList.remove('active', 'border-teal-500', 'text-teal-400');
                b.classList.add('border-transparent');
            });
            tabBtn.classList.add('active', 'border-teal-500', 'text-teal-400');
            tabBtn.classList.remove('border-transparent');

            document.querySelectorAll('.reference-tab-pane').forEach(pane => pane.classList.add('hidden'));
            const targetPaneId = tabBtn.getAttribute('data-formtab');
            document.getElementById(targetPaneId)?.classList.remove('hidden');
        });
    });

    // Auto-generate Slug on title change
    document.getElementById('ref-title')?.addEventListener('input', (e) => {
        const slugInput = document.getElementById('ref-slug');
        if (slugInput && !slugInput.value) {
            slugInput.value = generateSlug(e.target.value);
        }
    });
}

function generateSlug(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\u0621-\u064A\w\-]+/g, '') // Remove non-word and non-Arabic chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start
        .replace(/-+$/, '');            // Trim - from end
}

// Expose CRUD helper functions globally on window
window.initReferencesMgmt = initReferencesMgmt;
window.openAddReferenceModal = openAddReferenceModal;
window.closeReferenceModal = closeReferenceModal;
window.submitReferenceForm = submitReferenceForm;
window.editReference = editReference;
window.deleteReference = deleteReference;
window.duplicateReference = duplicateReference;
window.toggleReferencePublish = toggleReferencePublish;
