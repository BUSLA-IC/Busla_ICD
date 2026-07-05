import { supabase } from '../../js/supabase-config.js';

// ==========================================
// 🚀 GLOBAL VARIABLES & STATE
// ==========================================
let allTools = [];
let allTracks = [];
let allPhases = [];
let allCourses = [];
let selectedTracks = new Set();
let selectedPhases = new Set();

let toolsViewMode = 'table'; // 'table' or 'grid'

// ==========================================
// 🚀 INITIALIZATION
// ==========================================
async function initToolsMgmt() {
    setupToolsEventListeners();
    await loadInitialData();
    await fetchTools();
}

async function loadInitialData() {
    try {
        const [tracksRes, phasesRes, coursesRes] = await Promise.all([
            supabase.from('tracks').select('*').eq('is_active', true).order('name'),
            supabase.from('phases').select('*').eq('is_active', true).order('order_index'),
            supabase.from('courses').select('*').eq('is_active', true).order('title')
        ]);

        if (tracksRes.error) throw tracksRes.error;
        if (phasesRes.error) throw phasesRes.error;
        if (coursesRes.error) throw coursesRes.error;

        allTracks = tracksRes.data || [];
        allPhases = phasesRes.data || [];
        allCourses = coursesRes.data || [];

        populateTypeFilter();
        renderTracksChecklist();
    } catch (err) {
        console.error("Tools Mgmt Initial Data Load Error:", err);
        showToast("حدث خطأ أثناء تحميل بيانات التصنيفات والمسارات", "error");
    }
}

// ==========================================
// 🚀 UI RENDERERS & CHECKS
// ==========================================
function populateTypeFilter() {
    const filter = document.getElementById('admin-tools-type-filter');
    if (!filter) return;

    const types = [
        'Software', 'Website', 'Online Platform', 'IDE', 'Simulator', 
        'CAD Tool', 'AI Tool', 'Documentation', 'Library', 'Framework', 
        'Extension', 'Plugin', 'Learning Platform', 'Community', 'Other'
    ];

    filter.innerHTML = '<option value="all">كل الأنواع</option>' + 
        types.map(t => `<option value="${t}">${t}</option>`).join('');
}

// Fetch Tools List
async function fetchTools() {
    const tbody = document.getElementById('admin-tools-table-body');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-gray-500"><i class="fas fa-spinner fa-spin text-teal-500 text-3xl mb-3"></i><p>جاري تحميل قائمة الأدوات...</p></td></tr>`;
    }

    try {
        const { data, error } = await supabase
            .from('tools')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;

        allTools = data || [];
        updateStats();
        filterAndRenderTools();
    } catch (err) {
        console.error("Fetch Tools Error:", err);
        showToast("فشل تحميل قائمة الأدوات من السيرفر", "error");
    }
}

function updateStats() {
    const total = allTools.length;
    const published = allTools.filter(t => t.status === 'Published').length;
    const draft = allTools.filter(t => t.status === 'Draft').length;
    const clicks = allTools.reduce((sum, t) => sum + (t.clicks_count || 0), 0);

    const elTotal = document.getElementById('stat-tools-total');
    const elPub = document.getElementById('stat-tools-published');
    const elDraft = document.getElementById('stat-tools-draft');
    const elClicks = document.getElementById('stat-tools-clicks');

    if (elTotal) elTotal.textContent = total;
    if (elPub) elPub.textContent = published;
    if (elDraft) elDraft.textContent = draft;
    if (elClicks) elClicks.textContent = clicks;
}

// Filter and Render Tools List
function filterAndRenderTools() {
    const searchVal = document.getElementById('admin-tools-search')?.value.toLowerCase().trim() || '';
    const typeVal = document.getElementById('admin-tools-type-filter')?.value || 'all';
    const statusVal = document.getElementById('admin-tools-status-filter')?.value || 'all';

    const filtered = allTools.filter(t => {
        const matchesSearch = !searchVal || 
            t.name.toLowerCase().includes(searchVal) ||
            (t.short_description && t.short_description.toLowerCase().includes(searchVal)) ||
            (t.tags && t.tags.some(tag => tag.toLowerCase().includes(searchVal)));
        const matchesType = typeVal === 'all' || t.type === typeVal;
        const matchesStatus = statusVal === 'all' || t.status === statusVal;

        return matchesSearch && matchesType && matchesStatus;
    });

    if (toolsViewMode === 'table') {
        renderToolsTable(filtered);
    } else {
        renderToolsGrid(filtered);
    }
}

function renderToolsTable(tools) {
    const tbody = document.getElementById('admin-tools-table-body');
    const tableCont = document.getElementById('admin-tools-table-container');
    const gridCont = document.getElementById('admin-tools-grid-container');

    if (!tbody || !tableCont || !gridCont) return;

    tableCont.classList.remove('hidden');
    gridCont.classList.add('hidden');

    if (tools.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-10 text-center text-gray-500 font-bold">لا توجد أدوات مطابقة للبحث حالياً.</td></tr>`;
        return;
    }

    tbody.innerHTML = tools.map(tool => {
        const clicks = tool.clicks_count || 0;
        const views = tool.views_count || 0;
        
        let statusColor = 'bg-gray-500/10 text-gray-400 border-gray-500/20';
        if (tool.status === 'Published') statusColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
        else if (tool.status === 'Draft') statusColor = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
        else if (tool.status === 'Hidden') statusColor = 'bg-purple-500/10 text-purple-400 border-purple-500/20';

        const updatedDate = tool.updated_at ? new Date(tool.updated_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '---';

        return `
            <tr class="hover:bg-white/5 transition-all">
                <td class="p-4 text-center">
                    <div class="w-10 h-10 bg-white/5 rounded-xl border border-white/5 flex items-center justify-center text-2xl overflow-hidden mx-auto shrink-0">
                        <img src="${tool.logo_url || '../../assets/icons/BUSLA-icon.png'}" class="w-full h-full object-contain p-1" onerror="this.src='../../assets/icons/BUSLA-icon.png'">
                    </div>
                </td>
                <td class="p-4 font-bold text-white">
                    <span class="hover:text-teal-400 cursor-pointer" onclick="window.editTool('${tool.id}')">${tool.name}</span>
                    <span class="text-[10px] text-gray-500 block mt-1">${tool.short_description || ''}</span>
                </td>
                <td class="p-4"><span class="text-xs font-mono bg-white/5 px-2.5 py-1 rounded border border-white/5">${tool.type}</span></td>
                <td class="p-4 text-xs font-semibold text-gray-300">${tool.importance || 'Optional'}</td>
                <td class="p-4 text-center font-mono">
                    <span class="text-white font-bold" title="زيارات">${views}</span>
                    <span class="text-gray-600 mx-1">/</span>
                    <span class="text-teal-400 font-bold" title="ضغطات">${clicks}</span>
                </td>
                <td class="p-4 text-xs text-gray-400">${updatedDate}</td>
                <td class="p-4"><span class="text-[10px] border px-2.5 py-0.5 rounded font-bold uppercase tracking-wider ${statusColor}">${tool.status}</span></td>
                <td class="p-4 text-left">
                    <div class="flex items-center gap-1.5 justify-start">
                        <button onclick="window.editTool('${tool.id}')" class="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white transition-all text-xs" title="تعديل"><i class="fas fa-edit"></i></button>
                        <button onclick="window.duplicateTool('${tool.id}')" class="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white transition-all text-xs" title="نسخ"><i class="far fa-copy"></i></button>
                        <button onclick="window.toggleToolPublish('${tool.id}', '${tool.status}')" class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white transition-all text-xs" title="${tool.status === 'Published' ? 'إلغاء النشر' : 'نشر'}">
                            <i class="${tool.status === 'Published' ? 'fas fa-eye-slash' : 'fas fa-eye'}"></i>
                        </button>
                        <button onclick="window.deleteTool('${tool.id}')" class="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all text-xs" title="حذف"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderToolsGrid(tools) {
    const tableCont = document.getElementById('admin-tools-table-container');
    const gridCont = document.getElementById('admin-tools-grid-container');

    if (!tableCont || !gridCont) return;

    tableCont.classList.add('hidden');
    gridCont.classList.remove('hidden');

    if (tools.length === 0) {
        gridCont.innerHTML = `<div class="col-span-full text-center text-gray-500 py-10 font-bold">لا توجد أدوات مطابقة للبحث حالياً.</div>`;
        return;
    }

    gridCont.innerHTML = tools.map(tool => {
        const clicks = tool.clicks_count || 0;
        const views = tool.views_count || 0;
        
        let statusColor = 'bg-gray-500/10 text-gray-400 border-gray-500/20';
        if (tool.status === 'Published') statusColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
        else if (tool.status === 'Draft') statusColor = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
        else if (tool.status === 'Hidden') statusColor = 'bg-purple-500/10 text-purple-400 border-purple-500/20';

        return `
            <div class="bg-b-surface border border-white/10 rounded-2xl p-5 flex flex-col justify-between h-full hover:border-teal-500/30 transition-all duration-300 shadow-xl group relative">
                <div>
                    <!-- Status Badge -->
                    <span class="absolute top-4 left-4 text-[9px] border px-2 py-0.5 rounded font-bold uppercase tracking-wider ${statusColor}">${tool.status}</span>
                    
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-12 h-12 bg-white/5 rounded-xl border border-white/5 flex items-center justify-center text-3xl overflow-hidden shrink-0">
                            <img src="${tool.logo_url || '../../assets/icons/BUSLA-icon.png'}" class="w-full h-full object-contain p-1" onerror="this.src='../../assets/icons/BUSLA-icon.png'">
                        </div>
                        <div class="text-right">
                            <h3 class="text-base font-bold text-white leading-tight hover:text-teal-400 cursor-pointer" onclick="window.editTool('${tool.id}')">${tool.name}</h3>
                            <span class="text-[10px] text-gray-500 mt-1 block">${tool.type} • ${tool.importance}</span>
                        </div>
                    </div>
                    
                    <p class="text-gray-400 text-xs text-right leading-relaxed line-clamp-3 mb-4">${tool.short_description || 'لا يوجد وصف مختصر.'}</p>
                </div>
                
                <div class="border-t border-white/5 pt-4 mt-auto">
                    <div class="flex justify-between items-center text-xs text-gray-400 mb-4">
                        <span class="font-mono">زيارات: <b class="text-white">${views}</b> • ضغطات: <b class="text-teal-400">${clicks}</b></span>
                        <span>مستوى: <b class="text-gray-300">${tool.experience_level}</b></span>
                    </div>
                    
                    <div class="flex justify-end gap-1.5">
                        <button onclick="window.editTool('${tool.id}')" class="flex-1 py-2 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white transition-all text-xs font-bold flex items-center justify-center gap-1"><i class="fas fa-edit"></i> تعديل</button>
                        <button onclick="window.duplicateTool('${tool.id}')" class="px-3 py-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white transition-all text-xs" title="نسخ"><i class="far fa-copy"></i></button>
                        <button onclick="window.toggleToolPublish('${tool.id}', '${tool.status}')" class="px-3 py-2 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white transition-all text-xs" title="${tool.status === 'Published' ? 'إلغاء النشر' : 'نشر'}">
                            <i class="${tool.status === 'Published' ? 'fas fa-eye-slash' : 'fas fa-eye'}"></i>
                        </button>
                        <button onclick="window.deleteTool('${tool.id}')" class="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all text-xs" title="حذف"><i class="fas fa-trash-alt"></i></button>
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
    const container = document.getElementById('tc-tracks-list');
    if (!container) return;

    container.innerHTML = allTracks.map(track => `
        <label class="flex items-center gap-2 justify-end cursor-pointer text-xs text-gray-300">
            <span>${track.name}</span>
            <input type="checkbox" name="tool-tracks" value="${track.id}" class="track-chk rounded border-white/10 bg-black text-teal-600 focus:ring-teal-500">
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
    const container = document.getElementById('tc-phases-list');
    if (!container) return;

    if (selectedTracks.size === 0) {
        container.innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">أختر مساراً أولاً لتعبئة المراحل</div>`;
        document.getElementById('tc-courses-list').innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">أختر مرحلة أولاً لتعبئة الكورسات</div>`;
        selectedPhases.clear();
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
            <input type="checkbox" name="tool-phases" value="${phase.phase_id}" class="phase-chk rounded border-white/10 bg-black text-teal-600 focus:ring-teal-500">
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
    const container = document.getElementById('tc-courses-list');
    if (!container) return;

    if (selectedPhases.size === 0) {
        container.innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">أختر مرحلة أولاً لتعبئة الكورسات</div>`;
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
            <input type="checkbox" name="tool-courses" value="${course.course_id}" class="course-chk rounded border-white/10 bg-black text-teal-600 focus:ring-teal-500">
        </label>
    `).join('');
}

// Populate alternatives checkboxes in form
function renderAlternativesChecklist(currentToolId) {
    const container = document.getElementById('tc-alternatives-list');
    if (!container) return;

    const availableTools = allTools.filter(t => t.id !== currentToolId && t.status === 'Published');
    if (availableTools.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-[10px] py-2 text-center col-span-2">لا توجد أدوات أخرى منشورة لتحديدها كبدائل.</div>';
        return;
    }

    container.innerHTML = availableTools.map(t => `
        <label class="flex items-center gap-2 justify-end cursor-pointer text-[11px] text-gray-300">
            <span>${t.name}</span>
            <input type="checkbox" name="tool-alternatives" value="${t.id}" class="alt-chk rounded border-white/10 bg-black text-teal-600 focus:ring-teal-500">
        </label>
    `).join('');
}

// ==========================================
// 🚀 CRUD FORM OPERATIONS
// ==========================================
function openAddToolModal() {
    resetToolForm();
    document.getElementById('admin-tool-modal-title').innerText = "إضافة أداة جديدة";
    document.getElementById('admin-tool-modal').classList.remove('hidden');
}

function closeToolModal() {
    document.getElementById('admin-tool-modal').classList.add('hidden');
}

function resetToolForm() {
    document.getElementById('tool-id').value = '';
    document.getElementById('admin-tool-form').reset();
    
    // Select first tab in form modal
    document.querySelector('.tool-form-tab[data-formtab="tf-basic"]').click();

    selectedTracks.clear();
    selectedPhases.clear();

    document.getElementById('tc-phases-list').innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">أختر مساراً أولاً لتعبئة المراحل</div>`;
    document.getElementById('tc-courses-list').innerHTML = `<div class="text-gray-500 text-[10px] py-4 text-center">أختر مرحلة أولاً لتعبئة الكورسات</div>`;
    
    renderAlternativesChecklist('');
}

async function editTool(toolId) {
    resetToolForm();
    const tool = allTools.find(t => t.id === toolId);
    if (!tool) return;

    document.getElementById('admin-tool-modal-title').innerText = `تعديل بيانات الأداة: ${tool.name}`;
    
    // Basic Info mapping
    document.getElementById('tool-id').value = tool.id;
    document.getElementById('tool-name').value = tool.name;
    document.getElementById('tool-short-name').value = tool.short_name || '';
    document.getElementById('tool-short-desc').value = tool.short_description || '';
    document.getElementById('tool-full-desc').value = tool.full_description || '';
    document.getElementById('tool-type').value = tool.type || 'Software';
    document.getElementById('tool-importance').value = tool.importance || 'Optional';
    document.getElementById('tool-experience').value = tool.experience_level || 'Beginner';
    document.getElementById('tool-logo-url').value = tool.logo_url || '';
    document.getElementById('tool-banner-url').value = tool.banner_url || '';

    // Features, Pros & Cons Textareas mapping (array to newlines text)
    document.getElementById('tool-features').value = (tool.features || []).join('\n');
    document.getElementById('tool-pros').value = (tool.pros || []).join('\n');
    document.getElementById('tool-cons').value = (tool.cons || []).join('\n');

    // OS mapping
    const osList = tool.supported_os || [];
    document.querySelectorAll('input[name="tool-os"]').forEach(chk => {
        chk.checked = osList.includes(chk.value);
    });

    // Links mapping
    document.getElementById('tool-website').value = tool.official_website || '';
    document.getElementById('tool-doc-url').value = tool.documentation_url || '';
    document.getElementById('tool-github').value = tool.github_url || '';

    let downloads = tool.download_links || [];
    if (typeof downloads === 'string') {
        try { downloads = JSON.parse(downloads); } catch(e) {}
    }
    downloads.forEach(dl => {
        if (dl.platform === 'Windows') document.getElementById('tool-dl-win').value = dl.url;
        else if (dl.platform === 'Linux') document.getElementById('tool-dl-linux').value = dl.url;
        else if (dl.platform === 'macOS') document.getElementById('tool-dl-mac').value = dl.url;
    });

    // Community mapping
    let community = tool.community_links || [];
    if (typeof community === 'string') {
        try { community = JSON.parse(community); } catch(e) {}
    }
    if (community.length > 0) {
        document.getElementById('tool-community').value = community[0].url || '';
        document.getElementById('tool-community-platform').value = community[0].platform || 'Discord';
    }

    document.getElementById('tool-tutorials').value = (tool.tutorials_links || []).join('\n');
    document.getElementById('tool-youtube').value = (tool.youtube_playlists || []).join('\n');

    // Content connections mapping (Tracks / Phases / Courses)
    selectedTracks = new Set(tool.track_ids || []);
    selectedPhases = new Set(tool.phase_ids || []);
    
    // Checked Tracks
    document.querySelectorAll('.track-chk').forEach(chk => {
        chk.checked = selectedTracks.has(chk.value);
    });

    // Build Phases checkboxes and check them
    renderPhasesChecklist();
    document.querySelectorAll('.phase-chk').forEach(chk => {
        chk.checked = selectedPhases.has(chk.value);
    });

    // Build Courses checkboxes and check them
    renderCoursesChecklist();
    const courseIds = new Set(tool.course_ids || []);
    document.querySelectorAll('.course-chk').forEach(chk => {
        chk.checked = courseIds.has(chk.value);
    });

    // Alternatives checklist mapping
    renderAlternativesChecklist(tool.id);
    const altIds = new Set(tool.alternatives || []);
    document.querySelectorAll('.alt-chk').forEach(chk => {
        chk.checked = altIds.has(chk.value);
    });

    // SEO mapping
    document.getElementById('tool-slug').value = tool.slug || '';
    document.getElementById('tool-order-index').value = tool.order_index || 0;
    document.getElementById('tool-meta-title').value = tool.meta_title || '';
    document.getElementById('tool-meta-desc').value = tool.meta_description || '';
    document.getElementById('tool-meta-keywords').value = tool.meta_keywords || '';
    document.getElementById('tool-status').value = tool.status || 'Draft';

    const tags = tool.tags || [];
    document.getElementById('tool-tags').value = tags.join(', ');

    document.getElementById('admin-tool-modal').classList.remove('hidden');
}

async function submitToolForm(e) {
    e.preventDefault();

    const toolId = document.getElementById('tool-id').value;
    const name = document.getElementById('tool-name').value.trim();
    const shortName = document.getElementById('tool-short-name').value.trim();
    const shortDesc = document.getElementById('tool-short-desc').value.trim();
    const fullDesc = document.getElementById('tool-full-desc').value.trim();
    const type = document.getElementById('tool-type').value;
    const importance = document.getElementById('tool-importance').value;
    const experience = document.getElementById('tool-experience').value;
    const logoUrl = document.getElementById('tool-logo-url').value.trim();
    const bannerUrl = document.getElementById('tool-banner-url').value.trim();

    // Map checkboxes / textareas to arrays
    const supportedOS = Array.from(document.querySelectorAll('input[name="tool-os"]:checked')).map(chk => chk.value);
    
    const features = document.getElementById('tool-features').value.split('\n').map(s => s.trim()).filter(Boolean);
    const pros = document.getElementById('tool-pros').value.split('\n').map(s => s.trim()).filter(Boolean);
    const cons = document.getElementById('tool-cons').value.split('\n').map(s => s.trim()).filter(Boolean);

    // Dynamic checkboxes (linked curriculum contents)
    const trackIds = Array.from(document.querySelectorAll('.track-chk:checked')).map(chk => chk.value);
    const phaseIds = Array.from(document.querySelectorAll('.phase-chk:checked')).map(chk => chk.value);
    const courseIds = Array.from(document.querySelectorAll('.course-chk:checked')).map(chk => chk.value);

    // Links parsing
    const website = document.getElementById('tool-website').value.trim();
    const docUrl = document.getElementById('tool-doc-url').value.trim();
    const github = document.getElementById('tool-github').value.trim();

    const downloadLinks = [];
    const dlWin = document.getElementById('tool-dl-win').value.trim();
    if (dlWin) downloadLinks.push({ platform: 'Windows', url: dlWin });
    const dlLinux = document.getElementById('tool-dl-linux').value.trim();
    if (dlLinux) downloadLinks.push({ platform: 'Linux', url: dlLinux });
    const dlMac = document.getElementById('tool-dl-mac').value.trim();
    if (dlMac) downloadLinks.push({ platform: 'macOS', url: dlMac });

    const communityLinks = [];
    const commUrl = document.getElementById('tool-community').value.trim();
    const commPlatform = document.getElementById('tool-community-platform').value.trim() || 'Discord';
    if (commUrl) {
        communityLinks.push({ platform: commPlatform, url: commUrl });
    }

    const tutorials = document.getElementById('tool-tutorials').value.split('\n').map(s => s.trim()).filter(Boolean);
    const youtubePlaylists = document.getElementById('tool-youtube').value.split('\n').map(s => s.trim()).filter(Boolean);
    
    // Alternatives
    const alternatives = Array.from(document.querySelectorAll('.alt-chk:checked')).map(chk => chk.value);

    // SEO & Status
    const slug = document.getElementById('tool-slug').value.trim();
    const orderIndex = parseInt(document.getElementById('tool-order-index').value) || 0;
    const metaTitle = document.getElementById('tool-meta-title').value.trim();
    const metaDesc = document.getElementById('tool-meta-desc').value.trim();
    const metaKeywords = document.getElementById('tool-meta-keywords').value.trim();
    const status = document.getElementById('tool-status').value;
    
    const tags = document.getElementById('tool-tags').value.split(',').map(s => s.trim()).filter(Boolean);

    const payload = {
        name,
        short_name: shortName || null,
        short_description: shortDesc,
        full_description: fullDesc || null,
        type,
        importance,
        experience_level: experience,
        logo_url: logoUrl || null,
        banner_url: bannerUrl || null,
        supported_os: supportedOS,
        features,
        pros,
        cons,
        track_ids: trackIds,
        phase_ids: phaseIds,
        course_ids: courseIds,
        official_website: website || null,
        documentation_url: docUrl || null,
        github_url: github || null,
        download_links: downloadLinks,
        community_links: communityLinks,
        tutorials_links: tutorials,
        youtube_playlists: youtubePlaylists,
        alternatives,
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
        if (toolId) {
            // Update
            const { error } = await supabase
                .from('tools')
                .update(payload)
                .eq('id', toolId);

            if (error) throw error;
            showToast("تم تحديث بيانات الأداة بنجاح", "success");
        } else {
            // Insert
            payload.created_at = new Date();
            const { error } = await supabase
                .from('tools')
                .insert([payload]);

            if (error) throw error;
            showToast("تم إضافة الأداة الجديدة بنجاح", "success");
        }

        closeToolModal();
        await fetchTools();
    } catch (err) {
        console.error("Save Tool Form Error:", err);
        showToast("حدث خطأ أثناء حفظ بيانات الأداة: " + (err.message || err), "error");
    }
}

async function duplicateTool(toolId) {
    const tool = allTools.find(t => t.id === toolId);
    if (!tool) return;

    const confirm = window.confirmDialog || window.confirm;
    const isApproved = confirm ? await window.confirmAction(`هل ترغب في إنشاء نسخة مكررة من الأداة "${tool.name}"؟`) : true;
    if (!isApproved) return;

    // Clone tool fields
    const copyPayload = { ...tool };
    delete copyPayload.id;
    copyPayload.name = tool.name + " - Copy";
    copyPayload.slug = (tool.slug || '') ? tool.slug + "-copy-" + Math.floor(Math.random() * 1000) : null;
    copyPayload.views_count = 0;
    copyPayload.clicks_count = 0;
    copyPayload.status = 'Draft'; // Reset status to draft
    copyPayload.created_at = new Date();
    copyPayload.updated_at = new Date();

    try {
        const { error } = await supabase
            .from('tools')
            .insert([copyPayload]);

        if (error) throw error;

        showToast("تم تكرار الأداة كمسودة بنجاح", "success");
        await fetchTools();
    } catch (err) {
        console.error("Duplicate Tool Error:", err);
        showToast("حدث خطأ أثناء نسخ الأداة", "error");
    }
}

async function toggleToolPublish(toolId, currentStatus) {
    const newStatus = currentStatus === 'Published' ? 'Draft' : 'Published';
    
    try {
        const { error } = await supabase
            .from('tools')
            .update({ status: newStatus, updated_at: new Date() })
            .eq('id', toolId);

        if (error) throw error;

        showToast(newStatus === 'Published' ? "تم نشر الأداة بنجاح" : "تم إلغاء نشر الأداة بنجاح", "success");
        await fetchTools();
    } catch (err) {
        console.error("Toggle Publish Error:", err);
        showToast("حدث خطأ أثناء تعديل حالة النشر للأداة", "error");
    }
}

async function deleteTool(toolId) {
    const tool = allTools.find(t => t.id === toolId);
    if (!tool) return;

    const isApproved = await window.confirmAction(`⚠️ تحذير: هل أنت متأكد من رغبتك في حذف الأداة "${tool.name}" نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.`);
    if (!isApproved) return;

    try {
        const { error } = await supabase
            .from('tools')
            .delete()
            .eq('id', toolId);

        if (error) throw error;

        showToast("تم حذف الأداة بنجاح", "success");
        await fetchTools();
    } catch (err) {
        console.error("Delete Tool Error:", err);
        showToast("حدث خطأ أثناء حذف الأداة", "error");
    }
}

// ==========================================
// 🚀 EVENT LISTENERS & SETUP
// ==========================================
function setupToolsEventListeners() {
    // Toolbar search and filters
    document.getElementById('admin-tools-search')?.addEventListener('input', filterAndRenderTools);
    document.getElementById('admin-tools-type-filter')?.addEventListener('change', filterAndRenderTools);
    document.getElementById('admin-tools-status-filter')?.addEventListener('change', filterAndRenderTools);

    // View toggles
    const gridBtn = document.getElementById('btn-admin-tools-grid');
    const tableBtn = document.getElementById('btn-admin-tools-table');

    gridBtn?.addEventListener('click', () => {
        toolsViewMode = 'grid';
        gridBtn.classList.add('border-teal-500/20', 'bg-teal-500/10', 'text-teal-400');
        tableBtn.classList.remove('border-teal-500/20', 'bg-teal-500/10', 'text-teal-400');
        filterAndRenderTools();
    });

    tableBtn?.addEventListener('click', () => {
        toolsViewMode = 'table';
        tableBtn.classList.add('border-teal-500/20', 'bg-teal-500/10', 'text-teal-400');
        gridBtn.classList.remove('border-teal-500/20', 'bg-teal-500/10', 'text-teal-400');
        filterAndRenderTools();
    });

    // Form Modal Tab Switching
    document.querySelectorAll('.tool-form-tab').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => {
            document.querySelectorAll('.tool-form-tab').forEach(b => {
                b.classList.remove('active', 'border-teal-500', 'text-teal-400');
                b.classList.add('border-transparent');
            });
            tabBtn.classList.add('active', 'border-teal-500', 'text-teal-400');
            tabBtn.classList.remove('border-transparent');

            document.querySelectorAll('.tool-tab-pane').forEach(pane => pane.classList.add('hidden'));
            const targetPaneId = tabBtn.getAttribute('data-formtab');
            document.getElementById(targetPaneId)?.classList.remove('hidden');
        });
    });

    // Auto-generate Slug on name change
    document.getElementById('tool-name')?.addEventListener('input', (e) => {
        const slugInput = document.getElementById('tool-slug');
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
window.initToolsMgmt = initToolsMgmt;
window.openAddToolModal = openAddToolModal;
window.closeToolModal = closeToolModal;
window.submitToolForm = submitToolForm;
window.editTool = editTool;
window.deleteTool = deleteTool;
window.duplicateTool = duplicateTool;
window.toggleToolPublish = toggleToolPublish;
