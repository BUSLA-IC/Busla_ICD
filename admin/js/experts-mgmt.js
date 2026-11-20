import { supabase } from '../../js/supabase-config.js';

// ==========================================
// 🚀 GLOBAL VARIABLES & STATE
// ==========================================
let allAdvices = [];
let advicesFilterCategory = 'all';
let advicesFilterStatus = 'all';
let advicesSearchTerm = '';
let currentEditingAdviceId = null;
let isHtmlMode = false;

const CATEGORIES = [
    { id: 'General', name: 'General Advice' },
    { id: 'GP', name: 'Graduation Project' },
    { id: 'Career', name: 'Career Path' },
    { id: 'Verification', name: 'Verification' },
    { id: 'RTL', name: 'RTL & Design' },
    { id: 'FPGA', name: 'FPGA' },
    { id: 'MATLAB', name: 'MATLAB' },
    { id: 'Presentation', name: 'Presentation Skills' },
    { id: 'Tools', name: 'Tools & Websites' },
    { id: 'Training', name: 'Training & Internships' },
    { id: 'ChatGPT', name: 'ChatGPT & AI' },
    { id: 'Study', name: 'Study & Learning' },
    { id: 'Resources', name: 'Resources & Courses' }
];

// ==========================================
// 🚀 INITIALIZATION
// ==========================================
export async function initExpertsMgmt() {
    setupEventListeners();
    populateCategoryFilters();
    await fetchAdvices();
}

// ==========================================
// 🚀 EVENT LISTENERS SETUP
// ==========================================
function setupEventListeners() {
    const searchInput = document.getElementById('admin-advices-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            advicesSearchTerm = e.target.value.toLowerCase().trim();
            filterAndRenderAdvices();
        });
    }

    const catFilter = document.getElementById('admin-advices-category-filter');
    if (catFilter) {
        catFilter.addEventListener('change', (e) => {
            advicesFilterCategory = e.target.value;
            filterAndRenderAdvices();
        });
    }

    const statusFilter = document.getElementById('admin-advices-status-filter');
    if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
            advicesFilterStatus = e.target.value;
            filterAndRenderAdvices();
        });
    }

    // Two-Way Sync Listeners
    setupTwoWayLiveSync();

    // Form Submit
    const form = document.getElementById('admin-advice-form');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
}

function setupTwoWayLiveSync() {
    const titleInput = document.getElementById('advice-form-title');
    const previewTitle = document.getElementById('preview-advice-title');

    const sourceInput = document.getElementById('advice-form-source');
    const previewSource = document.getElementById('preview-advice-source');

    const tagsInput = document.getElementById('advice-form-tags');
    const categorySelect = document.getElementById('advice-form-category');

    const visualEditor = document.getElementById('advice-visual-editor');
    const previewContent = document.getElementById('preview-advice-content');
    const rawEditor = document.getElementById('advice-form-content-raw');

    // Title Sync (Both Ways)
    if (titleInput && previewTitle) {
        titleInput.addEventListener('input', () => {
            previewTitle.textContent = titleInput.value.trim() || 'Advice title appears here...';
        });

        previewTitle.addEventListener('input', () => {
            titleInput.value = previewTitle.innerText.trim();
        });
    }

    // Source Sync (Both Ways)
    if (sourceInput && previewSource) {
        sourceInput.addEventListener('input', () => {
            updateSourcePreview();
        });

        previewSource.addEventListener('input', () => {
            let clean = previewSource.innerText.replace(/^Source:\s*/i, '').trim();
            sourceInput.value = clean;
        });
    }

    // Tags & Category
    if (tagsInput) {
        tagsInput.addEventListener('input', updateTagsPreview);
    }
    if (categorySelect) {
        categorySelect.addEventListener('change', () => {
            // Suggest category tag if empty
            if (tagsInput && !tagsInput.value.trim()) {
                tagsInput.value = `#${categorySelect.value}`;
                updateTagsPreview();
            }
        });
    }

    // Content Sync (Visual Editor <-> Preview Content <-> Raw HTML)
    if (visualEditor) {
        visualEditor.addEventListener('input', () => syncContent('visual'));
        visualEditor.addEventListener('mouseup', saveActiveSelection);
        visualEditor.addEventListener('keyup', saveActiveSelection);
    }
    if (previewContent) {
        previewContent.addEventListener('input', () => syncContent('preview'));
        previewContent.addEventListener('mouseup', saveActiveSelection);
        previewContent.addEventListener('keyup', saveActiveSelection);
    }
    if (rawEditor) {
        rawEditor.addEventListener('input', () => syncContent('raw'));
    }

    document.addEventListener('selectionchange', saveActiveSelection);
}

// Track active selection range so clicking toolbar buttons doesn't lose highlighted text
let savedSelectionRange = null;

function saveActiveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const visualEditor = document.getElementById('advice-visual-editor');
        const previewContent = document.getElementById('preview-advice-content');
        const node = sel.anchorNode;
        if ((visualEditor && visualEditor.contains(node)) || (previewContent && previewContent.contains(node))) {
            savedSelectionRange = sel.getRangeAt(0).cloneRange();
        }
    }
}

// Synchronizes content across Visual Editor, Preview Content, Raw Textarea, and Hidden Input
export function syncContent(origin = 'visual') {
    const visualEditor = document.getElementById('advice-visual-editor');
    const previewContent = document.getElementById('preview-advice-content');
    const rawEditor = document.getElementById('advice-form-content-raw');
    const hiddenInput = document.getElementById('advice-form-content');

    let currentHtml = '';

    if (origin === 'visual' && visualEditor) {
        currentHtml = visualEditor.innerHTML;
        if (previewContent && previewContent.innerHTML !== currentHtml) {
            previewContent.innerHTML = currentHtml;
        }
        if (rawEditor) rawEditor.value = currentHtml;
    } else if (origin === 'preview' && previewContent) {
        currentHtml = previewContent.innerHTML;
        if (visualEditor && visualEditor.innerHTML !== currentHtml) {
            visualEditor.innerHTML = currentHtml;
        }
        if (rawEditor) rawEditor.value = currentHtml;
    } else if (origin === 'raw' && rawEditor) {
        currentHtml = rawEditor.value;
        if (visualEditor) visualEditor.innerHTML = currentHtml;
        if (previewContent) previewContent.innerHTML = currentHtml;
    }

    if (hiddenInput) {
        hiddenInput.value = cleanHtmlForSave(currentHtml);
    }
}

function updateSourcePreview() {
    const sourceInput = document.getElementById('advice-form-source');
    const previewSource = document.getElementById('preview-advice-source');
    if (!previewSource) return;

    const sourceVal = (sourceInput && sourceInput.value.trim()) ? sourceInput.value.trim() : 'Engineers & Experts';
    previewSource.innerHTML = `<i class="fas fa-user-graduate mr-1.5 text-teal-400"></i> Source: ${sourceVal}`;
}

function updateTagsPreview() {
    const tagsInput = document.getElementById('advice-form-tags');
    const previewTags = document.getElementById('preview-advice-tags');
    if (!previewTags) return;

    const raw = tagsInput ? tagsInput.value : '';
    const list = raw.split(',')
        .map(t => t.trim())
        .filter(Boolean)
        .map(t => t.startsWith('#') ? t : `#${t}`);

    if (list.length === 0) {
        previewTags.innerHTML = `<span class="px-3 py-1 rounded-full text-xs font-semibold bg-white/5 text-gray-400">#General_Advice</span>`;
        return;
    }

    previewTags.innerHTML = list.map(t => `
        <span class="px-3 py-1 rounded-full text-xs font-semibold bg-pink-500/10 text-pink-300 border border-pink-500/20">${t}</span>
    `).join('');
}

function populateCategoryFilters() {
    const filter = document.getElementById('admin-advices-category-filter');
    const formCat = document.getElementById('advice-form-category');
    
    if (filter) {
        filter.innerHTML = '<option value="all">All Categories</option>' + 
            CATEGORIES.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }

    if (formCat) {
        formCat.innerHTML = CATEGORIES.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
}

// ==========================================
// 🚀 FETCH DATA (No Auto-Seed)
// ==========================================
export async function fetchAdvices() {
    const tbody = document.getElementById('admin-advices-table-body');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-12 text-center text-gray-500"><i class="fas fa-spinner fa-spin text-teal-500 text-3xl mb-3"></i><p>Loading engineers & experts advice...</p></td></tr>`;
    }

    try {
        const { data, error } = await supabase
            .from('expert_advices')
            .select('*')
            .order('order_index', { ascending: true })
            .order('created_at', { ascending: false });

        if (error) {
            console.warn("fetchAdvices warning/error:", error);
            allAdvices = [];
        } else {
            allAdvices = data || [];
        }

        updateStats();
        filterAndRenderAdvices();
    } catch (err) {
        console.error("Fetch Advices Error:", err);
        allAdvices = [];
        updateStats();
        filterAndRenderAdvices();
    }
}

// ==========================================
// 🚀 STATS CALCULATION
// ==========================================
function updateStats() {
    const total = allAdvices.length;
    const published = allAdvices.filter(a => a.is_published).length;
    const draft = total - published;
    const categoriesCount = new Set(allAdvices.map(a => a.category)).size;

    const elTotal = document.getElementById('stat-advices-total');
    const elPub = document.getElementById('stat-advices-published');
    const elDraft = document.getElementById('stat-advices-draft');
    const elCats = document.getElementById('stat-advices-categories');

    if (elTotal) elTotal.textContent = total;
    if (elPub) elPub.textContent = published;
    if (elDraft) elDraft.textContent = draft;
    if (elCats) elCats.textContent = categoriesCount;
}

// ==========================================
// 🚀 FILTER & RENDER TABLE
// ==========================================
function filterAndRenderAdvices() {
    const tbody = document.getElementById('admin-advices-table-body');
    const mobileCards = document.getElementById('admin-advices-mobile-cards');
    if (!tbody) return;

    let filtered = allAdvices.filter(advice => {
        if (advicesFilterCategory !== 'all' && advice.category !== advicesFilterCategory) {
            return false;
        }
        if (advicesFilterStatus === 'published' && !advice.is_published) return false;
        if (advicesFilterStatus === 'draft' && advice.is_published) return false;

        if (advicesSearchTerm) {
            const matchTitle = (advice.title || '').toLowerCase().includes(advicesSearchTerm);
            const matchSource = (advice.source || '').toLowerCase().includes(advicesSearchTerm);
            const matchSummary = (advice.summary || '').toLowerCase().includes(advicesSearchTerm);
            const matchTags = (advice.tags || []).some(t => t.toLowerCase().includes(advicesSearchTerm));
            if (!matchTitle && !matchSource && !matchSummary && !matchTags) return false;
        }

        return true;
    });

    if (filtered.length === 0) {
        const emptyTitle = allAdvices.length === 0
            ? "No expert advice items in the database yet."
            : "No advice items match the current search or filter.";
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="p-12 text-center text-gray-500">
                    <i class="fas fa-inbox text-4xl mb-3 text-gray-600 block"></i>
                    <p class="font-bold text-gray-400">${emptyTitle}</p>
                </td>
            </tr>
        `;
        if (mobileCards) {
            mobileCards.innerHTML = `
                <div class="p-8 text-center bg-b-surface/60 border border-white/5 rounded-2xl text-gray-500 text-xs">
                    <i class="fas fa-inbox text-3xl mb-2 text-gray-600 block"></i>
                    <p class="font-bold text-gray-400">${emptyTitle}</p>
                </div>
            `;
        }
        return;
    }

    const rendered = filtered.map((advice, index) => {
        const catObj = CATEGORIES.find(c => c.id === advice.category);
        const catName = catObj ? catObj.name : (advice.category || 'General');
        const tags = advice.tags || [];

        // Desktop Table Row
        const trHtml = `
            <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                <td class="p-3 text-center text-gray-500 font-mono text-xs w-16">
                    <div class="flex items-center justify-center gap-1">
                        <button onclick="window.moveAdviceOrder('${advice.id}', -1)" title="Move Up" class="p-1 hover:text-teal-400 transition-colors ${index === 0 ? 'opacity-20 cursor-not-allowed' : ''}">
                            <i class="fas fa-chevron-up text-[10px]"></i>
                        </button>
                        <span class="font-bold text-gray-300">${advice.order_index ?? index + 1}</span>
                        <button onclick="window.moveAdviceOrder('${advice.id}', 1)" title="Move Down" class="p-1 hover:text-teal-400 transition-colors ${index === filtered.length - 1 ? 'opacity-20 cursor-not-allowed' : ''}">
                            <i class="fas fa-chevron-down text-[10px]"></i>
                        </button>
                    </div>
                </td>
                <td class="p-3">
                    <div class="font-bold text-white text-sm max-w-xs md:max-w-md line-clamp-2">${advice.title}</div>
                    <div class="text-xs text-gray-400 mt-0.5 line-clamp-1">${advice.summary || 'No external summary'}</div>
                </td>
                <td class="p-3 text-xs whitespace-nowrap">
                    <span class="px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-300 border border-teal-500/20 font-semibold">${catName}</span>
                </td>
                <td class="p-3 text-xs text-gray-400">
                    <div class="flex flex-wrap gap-1 max-w-[180px]">
                        ${tags.slice(0, 3).map(t => `<span class="px-2 py-0.5 rounded-full bg-white/5 text-gray-300 text-[10px]">${t}</span>`).join('')}
                        ${tags.length > 3 ? `<span class="text-[10px] text-gray-500 self-center">+${tags.length - 3}</span>` : ''}
                    </div>
                </td>
                <td class="p-3 text-xs text-gray-300 whitespace-nowrap font-medium">
                    <span class="flex items-center gap-1.5">
                        <i class="fas fa-user-graduate text-teal-400 text-[11px]"></i>
                        <span>${advice.source || 'Unspecified'}</span>
                    </span>
                </td>
                <td class="p-3 text-center whitespace-nowrap">
                    <button onclick="window.toggleAdvicePublish('${advice.id}', ${!advice.is_published})" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${advice.is_published ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25' : 'bg-yellow-500/15 text-yellow-500 border border-yellow-500/30 hover:bg-yellow-500/25'}">
                        ${advice.is_published ? '<i class="fas fa-check-circle mr-1"></i>Published' : '<i class="fas fa-pause-circle mr-1"></i>Draft'}
                    </button>
                </td>
                <td class="p-3 text-center whitespace-nowrap">
                    <div class="flex items-center justify-center gap-1.5">
                        <button onclick="window.previewAdviceModal('${advice.id}')" title="Preview Advice" class="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white flex items-center justify-center transition-colors">
                            <i class="fas fa-eye text-xs"></i>
                        </button>
                        <button onclick="window.openEditAdviceModal('${advice.id}')" title="Edit" class="w-7 h-7 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 flex items-center justify-center transition-colors">
                            <i class="fas fa-edit text-xs"></i>
                        </button>
                        <button onclick="window.deleteAdvice('${advice.id}')" title="Delete" class="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-colors">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;

        // Mobile Touch Card
        const cardHtml = `
            <div class="bg-b-surface border border-white/10 rounded-2xl p-3.5 shadow-lg flex flex-col gap-2.5 transition-all hover:border-teal-500/30 relative">
                <!-- Top Header: Title + Status + Order -->
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5 mb-1">
                            <span class="px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-300 border border-teal-500/20 text-[10px] font-bold">${catName}</span>
                            <span class="text-[10px] font-mono text-gray-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">#${advice.order_index ?? index + 1}</span>
                        </div>
                        <h4 class="font-bold text-white text-xs sm:text-sm leading-snug line-clamp-2" dir="auto">${advice.title}</h4>
                    </div>
                    <button onclick="window.toggleAdvicePublish('${advice.id}', ${!advice.is_published})" class="shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${advice.is_published ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-yellow-500/15 text-yellow-500 border border-yellow-500/30'}">
                        ${advice.is_published ? '<i class="fas fa-check-circle mr-0.5"></i>Published' : '<i class="fas fa-pause-circle mr-0.5"></i>Draft'}
                    </button>
                </div>

                <!-- Summary snippet -->
                <p class="text-[11px] text-gray-400 leading-relaxed line-clamp-2 bg-black/40 p-2 rounded-xl border border-white/5">${advice.summary || 'No external summary'}</p>

                <!-- Tags & Source Strip -->
                <div class="flex items-center justify-between gap-2 text-[10px] text-gray-400 flex-wrap">
                    <span class="flex items-center gap-1 text-gray-300 font-medium truncate max-w-[150px]">
                        <i class="fas fa-user-graduate text-teal-400"></i>
                        <span class="truncate">${advice.source || 'Unspecified'}</span>
                    </span>
                    <div class="flex items-center gap-1">
                        ${tags.slice(0, 2).map(t => `<span class="px-1.5 py-0.5 rounded bg-white/5 text-gray-400 text-[9px]">${t}</span>`).join('')}
                        ${tags.length > 2 ? `<span class="text-[9px] text-gray-500">+${tags.length - 2}</span>` : ''}
                    </div>
                </div>

                <!-- Quick Action Bar -->
                <div class="pt-2 border-t border-white/5 flex items-center justify-between gap-1">
                    <!-- Reorder Up/Down -->
                    <div class="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-lg border border-white/5 text-[11px]">
                        <span class="text-gray-500 text-[10px] font-bold">Order:</span>
                        <button onclick="window.moveAdviceOrder('${advice.id}', -1)" title="Move Up" class="px-1.5 py-0.5 hover:text-teal-400 ${index === 0 ? 'opacity-20 cursor-not-allowed' : ''}">
                            <i class="fas fa-arrow-up text-[10px]"></i>
                        </button>
                        <button onclick="window.moveAdviceOrder('${advice.id}', 1)" title="Move Down" class="px-1.5 py-0.5 hover:text-teal-400 ${index === filtered.length - 1 ? 'opacity-20 cursor-not-allowed' : ''}">
                            <i class="fas fa-arrow-down text-[10px]"></i>
                        </button>
                    </div>

                    <div class="flex items-center gap-1.5">
                        <button onclick="window.previewAdviceModal('${advice.id}')" class="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all text-xs font-bold flex items-center gap-1">
                            <i class="fas fa-eye text-[11px]"></i> <span>Preview</span>
                        </button>
                        <button onclick="window.openEditAdviceModal('${advice.id}')" class="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white transition-all flex items-center justify-center text-xs" title="Edit">
                            <i class="fas fa-edit text-[11px]"></i>
                        </button>
                        <button onclick="window.deleteAdvice('${advice.id}')" class="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center text-xs" title="Delete">
                            <i class="fas fa-trash-alt text-[11px]"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        return { trHtml, cardHtml };
    });

    tbody.innerHTML = rendered.map(r => r.trHtml).join('');
    if (mobileCards) {
        mobileCards.innerHTML = rendered.map(r => r.cardHtml).join('');
    }
}

// ==========================================
// 🚀 MODAL MANAGEMENT
// ==========================================
export function openAddAdviceModal() {
    currentEditingAdviceId = null;
    document.getElementById('admin-advice-modal-title').textContent = "Add New Expert Advice";
    
    // Reset Form
    document.getElementById('advice-form-id').value = '';
    document.getElementById('advice-form-title').value = '';
    document.getElementById('advice-form-source').value = 'Multiple Engineers & Professors';
    document.getElementById('advice-form-author').value = '';
    document.getElementById('advice-form-category').value = 'General';
    document.getElementById('advice-form-tags').value = '#General, #Career';
    document.getElementById('advice-form-difficulty').value = 'beginner';
    document.getElementById('advice-form-priority').value = 'high';
    document.getElementById('advice-form-order').value = allAdvices.length + 1;
    document.getElementById('advice-form-summary').value = '';
    document.getElementById('advice-form-published').checked = true;

    // Reset HTML mode to visual
    if (isHtmlMode) toggleHtmlMode();

    // Default Visual Template (Friendly starter content)
    const starterTemplate = `
<p class="text-gray-200 text-base leading-relaxed mb-4">
Write your advice introduction here... Explain the core idea or a common question students ask.
</p>

<ul class="advice-block group relative space-y-2 text-gray-300 my-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
    <button type="button" onclick="this.closest('.advice-block').remove(); window.syncContent('visual');" title="Delete this list" class="advice-block-del absolute top-2 right-2 w-6 h-6 rounded-md bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
    <li class="flex items-start gap-2"><span class="text-emerald-400 font-bold">✔</span> <span><strong>First Point:</strong> Focus on hands-on skills and real engineering projects.</span></li>
    <li class="flex items-start gap-2"><span class="text-emerald-400 font-bold">✔</span> <span><strong>Second Point:</strong> Master the fundamentals before diving into complex EDA tools.</span></li>
</ul>

<div class="advice-block group relative bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-4 my-4">
    <button type="button" onclick="this.closest('.advice-block').remove(); window.syncContent('visual');" title="Delete this box" class="advice-block-del absolute top-2 right-2 w-6 h-6 rounded-md bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
    <p class="font-bold text-emerald-400 mb-1 flex items-center gap-2">
        <span>💡</span> Pro Tip:
    </p>
    <p class="text-gray-300 text-sm">Never hesitate to ask engineers and mentors for guidance—most industry professionals are happy to support dedicated learners.</p>
</div>`;

    const visualEditor = document.getElementById('advice-visual-editor');
    const previewContent = document.getElementById('preview-advice-content');
    const rawEditor = document.getElementById('advice-form-content-raw');

    if (visualEditor) visualEditor.innerHTML = starterTemplate;
    if (previewContent) previewContent.innerHTML = starterTemplate;
    if (rawEditor) rawEditor.value = starterTemplate;

    const previewTitle = document.getElementById('preview-advice-title');
    if (previewTitle) previewTitle.textContent = "Advice title appears here...";

    updateSourcePreview();
    updateTagsPreview();
    syncContent('visual');

    document.getElementById('admin-advice-modal').classList.remove('hidden');
}

export function openEditAdviceModal(adviceId) {
    const advice = allAdvices.find(a => a.id === adviceId);
    if (!advice) return;

    currentEditingAdviceId = advice.id;
    document.getElementById('admin-advice-modal-title').textContent = `Edit Advice: ${advice.title}`;

    document.getElementById('advice-form-id').value = advice.id;
    document.getElementById('advice-form-title').value = advice.title || '';
    document.getElementById('advice-form-source').value = advice.source || '';
    document.getElementById('advice-form-author').value = advice.author_name || '';
    document.getElementById('advice-form-category').value = advice.category || 'General';
    document.getElementById('advice-form-tags').value = (advice.tags || []).join(', ');
    document.getElementById('advice-form-difficulty').value = advice.difficulty || 'beginner';
    document.getElementById('advice-form-priority').value = advice.priority || 'high';
    document.getElementById('advice-form-order').value = advice.order_index ?? 0;
    document.getElementById('advice-form-summary').value = advice.summary || '';
    document.getElementById('advice-form-published').checked = advice.is_published ?? true;

    // Reset HTML mode to visual
    if (isHtmlMode) toggleHtmlMode();

    const content = advice.content || '<p class="text-gray-300">Write advice content here...</p>';
    const visualEditor = document.getElementById('advice-visual-editor');
    const previewContent = document.getElementById('preview-advice-content');
    const rawEditor = document.getElementById('advice-form-content-raw');

    if (visualEditor) visualEditor.innerHTML = content;
    if (previewContent) previewContent.innerHTML = content;
    if (rawEditor) rawEditor.value = content;

    const previewTitle = document.getElementById('preview-advice-title');
    if (previewTitle) previewTitle.textContent = advice.title || 'Advice Title';

    updateSourcePreview();
    updateTagsPreview();
    syncContent('visual');

    document.getElementById('admin-advice-modal').classList.remove('hidden');
}

export function closeAdviceModal() {
    document.getElementById('admin-advice-modal').classList.add('hidden');
    currentEditingAdviceId = null;
}

// ==========================================
// 🚀 QUICK TOOLBAR INSERTIONS (Visual WYSIWYG Snippets)
// ==========================================
export function insertSnippet(type) {
    let snippetHtml = '';

    switch(type) {
        case 'tip': // Green Callout
            snippetHtml = `
<div class="advice-block group relative bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-4 my-3">
    <button type="button" onclick="this.closest('.advice-block').remove(); window.syncContent('visual');" title="Delete this box" class="advice-block-del absolute top-2 right-2 w-6 h-6 rounded-md bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
    <p class="font-bold text-emerald-400 mb-1 flex items-center gap-2">
        <span>💡</span> Pro Tip:
    </p>
    <p class="text-gray-300 text-sm">Write your key takeaway or important note for students here...</p>
</div>
`;
            break;

        case 'stats': // Cyan Callout
            snippetHtml = `
<div class="advice-block group relative bg-cyan-950/30 border border-cyan-500/30 rounded-xl p-4 my-3">
    <button type="button" onclick="this.closest('.advice-block').remove(); window.syncContent('visual');" title="Delete this box" class="advice-block-del absolute top-2 right-2 w-6 h-6 rounded-md bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
    <p class="font-bold text-cyan-400 mb-2 flex items-center gap-2">
        <span>📈</span> Industry Stats & Career Opportunities:
    </p>
    <ul class="space-y-1.5 text-gray-300 text-sm list-disc list-inside">
        <li>Hiring demand in this specialization grows significantly for candidates with hands-on project portfolios.</li>
        <li>Top requirements: Verified RTL/Verification projects and structured summer internships.</li>
    </ul>
</div>
`;
            break;

        case 'code': // Purple Callout
            snippetHtml = `
<div class="advice-block group relative bg-purple-950/30 border border-purple-500/30 rounded-xl p-4 my-3">
    <button type="button" onclick="this.closest('.advice-block').remove(); window.syncContent('visual');" title="Delete this box" class="advice-block-del absolute top-2 right-2 w-6 h-6 rounded-md bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
    <p class="font-bold text-purple-400 mb-1 flex items-center gap-2">
        <span>&lt;/&gt;</span> Languages & Tools Used:
    </p>
    <p class="text-gray-300 text-sm"><strong class="text-purple-300">SystemVerilog</strong> and <strong class="text-purple-300">UVM</strong> methodology are adopted by over 80% of semiconductor companies.</p>
</div>
`;
            break;

        case 'warning': // Amber Callout
            snippetHtml = `
<div class="advice-block group relative bg-amber-950/30 border border-amber-500/30 rounded-xl p-4 my-3">
    <button type="button" onclick="this.closest('.advice-block').remove(); window.syncContent('visual');" title="Delete this box" class="advice-block-del absolute top-2 right-2 w-6 h-6 rounded-md bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
    <p class="font-bold text-amber-400 mb-1 flex items-center gap-2">
        <span>⚠️</span> Common Challenge / Mistake:
    </p>
    <p class="text-gray-300 text-sm">Avoid relying solely on theory—practical implementation and debugging are what decide technical interviews.</p>
</div>
`;
            break;

        case 'checklist': // Colored Checklist
            snippetHtml = `
<ul class="advice-block group relative space-y-2 text-gray-300 my-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
    <button type="button" onclick="this.closest('.advice-block').remove(); window.syncContent('visual');" title="Delete this list" class="advice-block-del absolute top-2 right-2 w-6 h-6 rounded-md bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
    <li class="flex items-start gap-2"><span class="text-emerald-400 font-bold">✔</span> <span><strong>Step 1:</strong> Choose your target track and commit to a clear roadmap.</span></li>
    <li class="flex items-start gap-2"><span class="text-emerald-400 font-bold">✔</span> <span><strong>Step 2:</strong> Build a practical project after completing each learning phase.</span></li>
    <li class="flex items-start gap-2"><span class="text-emerald-400 font-bold">✔</span> <span><strong>Step 3:</strong> Document and showcase your work on GitHub and LinkedIn.</span></li>
</ul>
`;
            break;

        case 'list-bullet': // Bullet List
            snippetHtml = `
<ul class="advice-block group relative list-disc list-inside space-y-1.5 text-gray-300 my-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
    <button type="button" onclick="this.closest('.advice-block').remove(); window.syncContent('visual');" title="Delete this list" class="advice-block-del absolute top-2 right-2 w-6 h-6 rounded-md bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
    <li>Item 1: Explain the core concept or detail here.</li>
    <li>Item 2: Add supporting engineering insight here.</li>
</ul>
`;
            break;

        case 'table': // Comparison Table
            snippetHtml = `
<div class="advice-block group relative bg-black/40 border border-white/10 rounded-xl overflow-hidden my-3">
    <button type="button" onclick="this.closest('.advice-block').remove(); window.syncContent('visual');" title="Delete this table" class="advice-block-del absolute top-2 right-2 w-6 h-6 rounded-md bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">×</button>
    <table class="w-full text-sm text-left text-gray-300">
        <thead class="bg-white/5 text-teal-400 font-bold border-b border-white/10">
            <tr>
                <th class="p-3">Feature</th>
                <th class="p-3">Open-Source Alternative</th>
                <th class="p-3">Commercial Tools</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-white/5">
            <tr>
                <td class="p-3 font-semibold text-white">Price & Licensing</td>
                <td class="p-3 text-emerald-400 font-semibold">Completely Free</td>
                <td class="p-3 text-red-400">Expensive & requires license servers</td>
            </tr>
            <tr>
                <td class="p-3 font-semibold text-white">Best Use Case</td>
                <td class="p-3">Self-study & university projects</td>
                <td class="p-3">Industry & tape-out production</td>
            </tr>
        </tbody>
    </table>
</div>
`;
            break;
    }

    if (!snippetHtml) return;

    // Check if HTML mode is active
    if (isHtmlMode) {
        const rawEditor = document.getElementById('advice-form-content-raw');
        if (rawEditor) {
            const start = rawEditor.selectionStart;
            const end = rawEditor.selectionEnd;
            rawEditor.setRangeText(snippetHtml, start, end, 'end');
            syncContent('raw');
        }
        return;
    }

    // Insert into Visual Editor or active editable area
    insertHtmlAtCursor(snippetHtml);
    syncContent('visual');
}

// In-Place Inline Text Formatting (Bold, Green, Red, Teal, Clear)
export function formatSelectedText(style) {
    if (isHtmlMode) {
        showToast("Inline formatting is available in Visual Editor mode. Please switch back to it.", "info");
        return;
    }

    let sel = window.getSelection();

    // If selection was lost or collapsed upon button click, restore saved selection
    if ((!sel || sel.rangeCount === 0 || sel.isCollapsed) && savedSelectionRange) {
        sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedSelectionRange);
    }

    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        showToast("Please highlight the word or sentence you want to format first.", "info");
        return;
    }

    const visualEditor = document.getElementById('advice-visual-editor');
    const previewContent = document.getElementById('preview-advice-content');
    let target = visualEditor;
    if (previewContent && sel.anchorNode && previewContent.contains(sel.anchorNode)) {
        target = previewContent;
    }

    switch(style) {
        case 'bold':
            document.execCommand('bold', false, null);
            break;

        case 'green':
            document.execCommand('styleWithCSS', false, false);
            document.execCommand('foreColor', false, '#EFECE6');
            if (target) {
                target.querySelectorAll('font[color="#EFECE6"], span[style*="239, 236, 230"], span[style*="#EFECE6"]').forEach(f => {
                    const s = document.createElement('span');
                    s.className = 'text-emerald-400 font-bold';
                    s.innerHTML = f.innerHTML;
                    f.replaceWith(s);
                });
            }
            break;

        case 'red':
            document.execCommand('styleWithCSS', false, false);
            document.execCommand('foreColor', false, '#8E8E8E');
            if (target) {
                target.querySelectorAll('font[color="#8E8E8E"], span[style*="142, 142, 142"], span[style*="#8E8E8E"]').forEach(f => {
                    const s = document.createElement('span');
                    s.className = 'text-red-400 font-bold';
                    s.innerHTML = f.innerHTML;
                    f.replaceWith(s);
                });
            }
            break;

        case 'teal':
            document.execCommand('styleWithCSS', false, false);
            document.execCommand('foreColor', false, '#FFFFFF');
            if (target) {
                target.querySelectorAll('font[color="#FFFFFF"], span[style*="255, 255, 255"], span[style*="#FFFFFF"]').forEach(f => {
                    const s = document.createElement('span');
                    s.className = 'text-teal-300 font-bold';
                    s.innerHTML = f.innerHTML;
                    f.replaceWith(s);
                });
            }
            break;

        case 'clear':
            document.execCommand('removeFormat', false, null);
            break;
    }

    saveActiveSelection();
    syncContent(target === previewContent ? 'preview' : 'visual');
}

// Helper to insert HTML cleanly at current DOM selection
function insertHtmlAtCursor(html) {
    const visualEditor = document.getElementById('advice-visual-editor');
    const previewContent = document.getElementById('preview-advice-content');
    
    let sel = window.getSelection();

    // Restore saved selection if available
    if ((!sel || sel.rangeCount === 0) && savedSelectionRange) {
        sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedSelectionRange);
    }

    let targetContainer = visualEditor;

    // Check if user has cursor inside previewContent or visualEditor
    if (sel && sel.rangeCount > 0) {
        const node = sel.anchorNode;
        if (previewContent && (previewContent === node || previewContent.contains(node))) {
            targetContainer = previewContent;
        } else if (visualEditor && (visualEditor === node || visualEditor.contains(node))) {
            targetContainer = visualEditor;
        }
    }

    if (sel && sel.rangeCount > 0 && targetContainer.contains(sel.anchorNode)) {
        let range = sel.getRangeAt(0);
        range.deleteContents();
        const el = document.createElement("div");
        el.innerHTML = html;
        const frag = document.createDocumentFragment();
        let node, lastNode;
        while ((node = el.firstChild)) {
            lastNode = frag.appendChild(node);
        }
        range.insertNode(frag);
        if (lastNode) {
            range = range.cloneRange();
            range.setStartAfter(lastNode);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            savedSelectionRange = range;
        }
    } else {
        if (visualEditor) {
            visualEditor.innerHTML += html;
        }
    }
}

// Toggle between Visual WYSIWYG Editor and Raw HTML textarea
export function toggleHtmlMode() {
    isHtmlMode = !isHtmlMode;
    const visualEditor = document.getElementById('advice-visual-editor');
    const rawEditor = document.getElementById('advice-form-content-raw');
    const label = document.getElementById('btn-toggle-html-label');

    if (isHtmlMode) {
        // Switch to Raw HTML
        if (visualEditor && rawEditor) {
            rawEditor.value = visualEditor.innerHTML;
            visualEditor.classList.add('hidden');
            rawEditor.classList.remove('hidden');
            rawEditor.focus();
        }
        if (label) label.textContent = "Back to Visual Editor (WYSIWYG)";
    } else {
        // Switch to Visual
        if (visualEditor && rawEditor) {
            visualEditor.innerHTML = rawEditor.value;
            rawEditor.classList.add('hidden');
            visualEditor.classList.remove('hidden');
            syncContent('visual');
        }
        if (label) label.textContent = "HTML Code Mode";
    }
}

// Quick Preset Helpers
export function setAdviceSource(val) {
    const input = document.getElementById('advice-form-source');
    if (input) {
        input.value = val;
        updateSourcePreview();
    }
}

export function toggleAdviceTag(tag) {
    const input = document.getElementById('advice-form-tags');
    if (!input) return;

    let current = input.value.split(',').map(t => t.trim()).filter(Boolean);
    const cleanTag = tag.startsWith('#') ? tag : `#${tag}`;
    const idx = current.indexOf(cleanTag);

    if (idx > -1) {
        current.splice(idx, 1);
    } else {
        current.push(cleanTag);
    }

    input.value = current.join(', ');
    updateTagsPreview();
}

// Cleans HTML for database storage (strips temporary block delete buttons and extra wrappers)
function cleanHtmlForSave(html) {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Remove any delete buttons injected for UI
    temp.querySelectorAll('.advice-block-del').forEach(btn => btn.remove());

    return temp.innerHTML.trim();
}

// ==========================================
// 🚀 SAVE / SUBMIT ADVICE
// ==========================================
async function handleFormSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('advice-submit-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Saving...`;

    try {
        const title = document.getElementById('advice-form-title').value.trim();
        const source = document.getElementById('advice-form-source').value.trim() || 'Multiple Engineers & Professors';
        const authorName = document.getElementById('advice-form-author').value.trim();
        const category = document.getElementById('advice-form-category').value;
        const rawTags = document.getElementById('advice-form-tags').value;
        const difficulty = document.getElementById('advice-form-difficulty').value;
        const priority = document.getElementById('advice-form-priority').value;
        const orderIndex = parseInt(document.getElementById('advice-form-order').value, 10) || 0;
        const summary = document.getElementById('advice-form-summary').value.trim();
        const isPublished = document.getElementById('advice-form-published').checked;

        // Ensure latest content is captured
        syncContent(isHtmlMode ? 'raw' : 'visual');
        const visualEditor = document.getElementById('advice-visual-editor');
        const rawContent = isHtmlMode ? document.getElementById('advice-form-content-raw').value : (visualEditor ? visualEditor.innerHTML : '');
        const content = cleanHtmlForSave(rawContent);

        if (!title || !content) {
            showToast("Please fill in at least the advice title and content.", "error");
            btn.disabled = false;
            btn.innerHTML = originalText;
            return;
        }

        const tags = rawTags.split(',')
            .map(t => t.trim())
            .filter(Boolean)
            .map(t => t.startsWith('#') ? t : `#${t}`);

        const payload = {
            title,
            summary: summary || title,
            content,
            source,
            author_name: authorName,
            category,
            tags,
            difficulty,
            priority,
            order_index: orderIndex,
            is_published: isPublished,
            updated_at: new Date().toISOString()
        };

        let res;
        if (currentEditingAdviceId) {
            res = await supabase
                .from('expert_advices')
                .update(payload)
                .eq('id', currentEditingAdviceId);
        } else {
            res = await supabase
                .from('expert_advices')
                .insert([payload]);
        }

        if (res.error) throw res.error;

        showToast(currentEditingAdviceId ? "Advice updated and saved successfully!" : "Advice added to the database successfully!", "success");
        closeAdviceModal();
        await fetchAdvices();
    } catch (err) {
        console.error("Save Advice Error:", err);
        showToast(`Failed to save advice: ${err.message || 'Unknown error'}`, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ==========================================
// 🚀 ACTIONS: DELETE, TOGGLE, REORDER, PREVIEW
// ==========================================
export async function deleteAdvice(adviceId) {
    let confirmed = false;
    if (typeof window.confirmAction === 'function') {
        confirmed = await window.confirmAction(
            "Are you sure you want to permanently delete this advice? This action cannot be undone.",
            "Delete Advice",
            "danger"
        );
    } else {
        confirmed = true;
    }

    if (!confirmed) return;

    try {
        const { error } = await supabase
            .from('expert_advices')
            .delete()
            .eq('id', adviceId);

        if (error) throw error;
        showToast("Advice deleted successfully.", "success");
        await fetchAdvices();
    } catch (err) {
        console.error("Delete Error:", err);
        showToast("Failed to delete advice from server.", "error");
    }
}

export async function deleteAllAdvices() {
    const { data: liveRows, error: listErr } = await supabase
        .from('expert_advices')
        .select('id');

    const ids = (!listErr && Array.isArray(liveRows))
        ? liveRows.map(r => r.id).filter(Boolean)
        : (allAdvices || []).map(a => a.id).filter(Boolean);

    if (ids.length === 0) {
        showToast("There are no advice entries to delete.", "info");
        return;
    }

    let confirmed = false;
    if (typeof window.confirmAction === 'function') {
        confirmed = await window.confirmAction(
            `Are you sure you want to permanently delete all ${ids.length} expert advice entries from the database? This cannot be undone.`,
            "Delete All Expert Advice",
            "danger"
        );
    }

    if (!confirmed) return;

    const btn = document.getElementById('btn-delete-all-advices');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Deleting...</span>';
    }

    try {
        let deletedTotal = 0;
        const chunkSize = 50;
        for (let i = 0; i < ids.length; i += chunkSize) {
            const chunk = ids.slice(i, i + chunkSize);
            const { data: deletedRows, error } = await supabase
                .from('expert_advices')
                .delete()
                .in('id', chunk)
                .select('id');
            if (error) throw error;
            deletedTotal += Array.isArray(deletedRows) ? deletedRows.length : 0;
        }

        if (deletedTotal === 0) {
            throw new Error("Permission denied or database policy blocked deletion. Ensure your account has admin delete permissions on expert_advices.");
        }

        allAdvices = [];
        showToast(`Deleted ${deletedTotal} expert advice entries permanently.`, "success");
        await fetchAdvices();
    } catch (err) {
        console.error("Delete All Advices Error:", err);
        showToast(`Failed to delete all advice entries: ${err.message || 'Unknown error'}`, "error");
        await fetchAdvices();
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }
}

export async function toggleAdvicePublish(adviceId, newStatus) {
    try {
        const { error } = await supabase
            .from('expert_advices')
            .update({ is_published: newStatus, updated_at: new Date().toISOString() })
            .eq('id', adviceId);

        if (error) throw error;
        showToast(newStatus ? "Advice published for students." : "Advice moved to drafts.", "success");
        await fetchAdvices();
    } catch (err) {
        console.error("Toggle Publish Error:", err);
        showToast("Could not update publish status.", "error");
    }
}

export async function moveAdviceOrder(adviceId, direction) {
    const idx = allAdvices.findIndex(a => a.id === adviceId);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= allAdvices.length) return;

    const currentAdvice = allAdvices[idx];
    const targetAdvice = allAdvices[targetIdx];

    const currentOrder = currentAdvice.order_index ?? idx;
    const targetOrder = targetAdvice.order_index ?? targetIdx;

    try {
        await Promise.all([
            supabase.from('expert_advices').update({ order_index: targetOrder }).eq('id', currentAdvice.id),
            supabase.from('expert_advices').update({ order_index: currentOrder }).eq('id', targetAdvice.id)
        ]);

        await fetchAdvices();
    } catch (err) {
        console.error("Move Order Error:", err);
        showToast("Could not update advice order.", "error");
    }
}

export function previewAdviceModal(adviceId) {
    const advice = allAdvices.find(a => a.id === adviceId);
    if (!advice) return;

    const modal = document.getElementById('admin-advice-preview-modal');
    if (!modal) return;

    document.getElementById('modal-preview-title').textContent = advice.title;
    document.getElementById('modal-preview-source').innerHTML = `<i class="fas fa-user-graduate mr-1.5 text-teal-400"></i> Source: ${advice.source}`;
    
    const tagsContainer = document.getElementById('modal-preview-tags');
    if (tagsContainer) {
        tagsContainer.innerHTML = (advice.tags || []).map(t => `
            <span class="px-3 py-1 rounded-full text-xs font-semibold bg-pink-500/10 text-pink-300 border border-pink-500/20">${t}</span>
        `).join('');
    }

    document.getElementById('modal-preview-body').innerHTML = advice.content;
    modal.classList.remove('hidden');
}

export function closePreviewModal() {
    document.getElementById('admin-advice-preview-modal')?.classList.add('hidden');
}

// Toast Notification Helper
function showToast(msg, type = "info") {
    if (typeof window.showToast === 'function') {
        window.showToast(msg, type);
    } else if (typeof window.showCustomAlert === 'function') {
        window.showCustomAlert("Notice", msg);
    } else {
        console.log(`[${type}] ${msg}`);
    }
}

// ==========================================
// 🚀 EXPOSE GLOBALS FOR INLINE ONCLICK EVENTS
// ==========================================
window.initExpertsMgmt = initExpertsMgmt;
window.fetchAdvices = fetchAdvices;
window.openAddAdviceModal = openAddAdviceModal;
window.openEditAdviceModal = openEditAdviceModal;
window.closeAdviceModal = closeAdviceModal;
window.insertSnippet = insertSnippet;
window.formatSelectedText = formatSelectedText;
window.toggleHtmlMode = toggleHtmlMode;
window.setAdviceSource = setAdviceSource;
window.toggleAdviceTag = toggleAdviceTag;
window.syncContent = syncContent;
window.deleteAdvice = deleteAdvice;
window.deleteAllAdvices = deleteAllAdvices;
window.toggleAdvicePublish = toggleAdvicePublish;
window.moveAdviceOrder = moveAdviceOrder;
window.previewAdviceModal = previewAdviceModal;
window.closePreviewModal = closePreviewModal;
