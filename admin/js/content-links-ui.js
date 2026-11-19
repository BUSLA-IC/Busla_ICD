/**
 * Modular UI widgets for unlimited curriculum linking (Quizzes, Projects, Documents
 * <-> Courses, Contents/Videos, Phases, Tracks) in the Busla Admin Dashboard.
 */

import {
    getAttachmentsForTarget,
    getAttachmentCountsForTarget,
    getTargetsForItem,
} from '../../js/curriculum-links-core.js';
import { CURRICULUM_LINKS_SQL } from '../../js/curriculum-links-service.js';

function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Resolves a human-readable label and subtitle for any curriculum target.
 */
export function describeTarget(target, hData) {
    if (!target) return { badge: 'غير محدد', colorClass: 'bg-white/5 border-white/10 text-gray-400', icon: 'fa-link', title: '-', subtitle: '' };
    const { target_type, target_id } = target;

    if (target_type === 'content') {
        const mat = (hData?.contents || []).find(c => String(c.content_id) === String(target_id));
        const course = mat ? (hData?.courses || []).find(c => String(c.course_id) === String(mat.course_id)) : null;
        return {
            badge: 'درس',
            colorClass: 'bg-teal-500/10 border-teal-500/25 text-teal-300',
            icon: mat?.type === 'section' ? 'fa-folder' : 'fa-play-circle',
            title: mat?.title || target_id,
            subtitle: course ? `كورس: ${course.title}` : '',
        };
    }

    if (target_type === 'course') {
        const course = (hData?.courses || []).find(c => String(c.course_id) === String(target_id));
        const phase = course ? (hData?.phases || []).find(p => String(p.phase_id) === String(course.phase_id)) : null;
        return {
            badge: 'كورس',
            colorClass: 'bg-blue-500/10 border-blue-500/25 text-blue-300',
            icon: 'fa-book',
            title: course?.title || target_id,
            subtitle: phase ? `مرحلة: ${phase.title || phase.name}` : '',
        };
    }

    if (target_type === 'phase') {
        const phase = (hData?.phases || []).find(p => String(p.phase_id) === String(target_id));
        const track = phase ? (hData?.tracks || []).find(t => String(t.id) === String(phase.track_id)) : null;
        return {
            badge: 'مرحلة',
            colorClass: 'bg-purple-500/10 border-purple-500/25 text-purple-300',
            icon: 'fa-layer-group',
            title: phase?.title || phase?.name || target_id,
            subtitle: track ? `مسار: ${track.name}` : '',
        };
    }

    if (target_type === 'track') {
        const track = (hData?.tracks || []).find(t => String(t.id) === String(target_id));
        return {
            badge: 'مسار',
            colorClass: 'bg-indigo-500/10 border-indigo-500/25 text-indigo-300',
            icon: 'fa-road',
            title: track?.name || target_id,
            subtitle: '',
        };
    }

    return {
        badge: target_type,
        colorClass: 'bg-white/5 border-white/10 text-gray-300',
        icon: 'fa-link',
        title: target_id,
        subtitle: '',
    };
}

/**
 * Renders clickable attachment count pills for a Course or Content table row.
 */
export function renderTargetAttachmentsSummaryHtml(targetType, targetId, targetTitle, allLinks) {
    const counts = getAttachmentCountsForTarget(allLinks, targetType, targetId);
    const safeTitle = esc(targetTitle || '').replace(/'/g, '&#039;');
    const safeId = esc(targetId);

    if (counts.total === 0) {
        return `
            <button type="button"
                onclick="window.cmOpenAttachmentsModal('${targetType}', '${safeId}', '${safeTitle}')"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-teal-500/15 border border-white/10 hover:border-teal-500/30 text-gray-400 hover:text-teal-300 text-xs font-bold transition-all cursor-pointer"
                title="إدارة وربط الكويزات والمشاريع والمستندات">
                <i class="fas fa-plus-circle text-[11px]"></i>
                <span>ربط مرفقات</span>
            </button>
        `;
    }

    const pills = [];
    if (counts.quizzes > 0) {
        pills.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-yellow-500/10 border border-yellow-500/25 text-yellow-400 text-[11px] font-bold"><i class="fas fa-clipboard-check text-[10px]"></i> ${counts.quizzes} كويز</span>`);
    }
    if (counts.projects > 0) {
        pills.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] font-bold"><i class="fas fa-laptop-code text-[10px]"></i> ${counts.projects} مشروع</span>`);
    }
    if (counts.documents > 0) {
        pills.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 text-[11px] font-bold"><i class="fas fa-file-pdf text-[10px]"></i> ${counts.documents} مستند</span>`);
    }

    return `
        <button type="button"
            onclick="window.cmOpenAttachmentsModal('${targetType}', '${safeId}', '${safeTitle}')"
            class="inline-flex flex-wrap items-center justify-center gap-1.5 p-1.5 rounded-xl bg-black/30 hover:bg-white/5 border border-white/5 hover:border-teal-500/30 transition-all cursor-pointer max-w-[260px]"
            title="اضغط لإدارة وتعديل المرفقات المرتبطة">
            ${pills.join('')}
        </button>
    `;
}

/**
 * Renders linked target badges for a Quiz, Project, or Document row in the table.
 */
export function renderItemLinkedTargetsHtml(itemType, itemId, allLinks, hData) {
    const targets = getTargetsForItem(allLinks, itemType, itemId);
    if (targets.length === 0) {
        return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.03] border border-white/10 text-gray-500 text-xs font-bold"><i class="fas fa-unlink text-[10px]"></i> غير مرتبط</span>`;
    }

    const visible = targets.slice(0, 3);
    const remaining = targets.length - visible.length;

    const badges = visible.map(t => {
        const info = describeTarget(t, hData);
        const tooltip = info.subtitle ? `${info.badge}: ${info.title} (${info.subtitle})` : `${info.badge}: ${info.title}`;
        return `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold max-w-[165px] shadow-sm ${info.colorClass}" title="${esc(tooltip)}">
                <i class="fas ${info.icon} text-[9px] shrink-0 opacity-80"></i>
                <span class="opacity-75 shrink-0">${info.badge}:</span>
                <span dir="auto" class="truncate">${esc(info.title)}</span>
            </span>
        `;
    });

    if (remaining > 0) {
        const allTitles = targets.map(t => {
            const info = describeTarget(t, hData);
            return `${info.badge}: ${info.title}`;
        }).join('\n');
        badges.push(`
            <span class="inline-flex items-center px-1.5 py-0.5 rounded-lg bg-white/10 border border-white/15 text-gray-200 text-[10px] font-bold" title="${esc(allTitles)}">
                +${remaining} أخرى
            </span>
        `);
    }

    return `<div class="flex flex-wrap items-center justify-center gap-1 max-w-[180px] mx-auto">${badges.join('')}</div>`;
}

// ============================================================================
// WIDGET A: TARGET ATTACHMENTS EDITOR (Course or Content -> Unlimited Quizzes, Projects, Docs)
// ============================================================================

const CATEGORY_META = {
    quizzes: {
        label: 'الاختبارات (Quizzes)',
        singular: 'اختبار',
        emptyText: 'لا توجد اختبارات مرتبطة حالياً (اختياري)',
        icon: 'fa-clipboard-check',
        accentText: 'text-yellow-400',
        accentBorder: 'border-yellow-500/25',
        accentBg: 'bg-yellow-500/10',
        btnClass: 'bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-300 border-yellow-500/30',
        idKey: 'quiz_id',
        titleKey: 'title',
        metaText: (item) => `${item.max_xp || 50} XP`,
    },
    projects: {
        label: 'المشاريع (Projects)',
        singular: 'مشروع',
        emptyText: 'لا توجد مشاريع مرتبطة حالياً (اختياري)',
        icon: 'fa-laptop-code',
        accentText: 'text-emerald-400',
        accentBorder: 'border-emerald-500/25',
        accentBg: 'bg-emerald-500/10',
        btnClass: 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30',
        idKey: 'id',
        titleKey: 'title',
        metaText: (item) => `${item.max_points || 100} XP`,
    },
    documents: {
        label: 'المستندات والملفات (Docs)',
        singular: 'مستند',
        emptyText: 'لا توجد مستندات مرتبطة حالياً (اختياري)',
        icon: 'fa-file-pdf',
        accentText: 'text-cyan-400',
        accentBorder: 'border-cyan-500/25',
        accentBg: 'bg-cyan-500/10',
        btnClass: 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border-cyan-500/30',
        idKey: 'id',
        titleKey: 'title',
        metaText: (item) => item.document_type || 'PDF',
    },
};

/**
 * Mounts an interactive multi-attachment manager inside `container` for a Course or Content target.
 * Stores state directly on `container._attachmentsState` and exposes `getTargetAttachmentsValue(container)`.
 */
export function mountTargetAttachmentsEditor(container, { targetType, initialAttachments, hData }) {
    if (!container) return;

    const state = {
        quizzes: [...(initialAttachments?.quizzes || [])].map(String),
        projects: [...(initialAttachments?.projects || [])].map(String),
        documents: [...(initialAttachments?.documents || [])].map(String),
        searchTerms: { quizzes: '', projects: '', documents: '' },
    };
    container._attachmentsState = state;

    const catalogs = {
        quizzes: hData?.quizzes || [],
        projects: hData?.projects || [],
        documents: hData?.documents || [],
    };

    const headingTitle = targetType === 'course'
        ? 'المرفقات المرتبطة بالكورس مباشرة (اختياري — بدون حد أقصى)'
        : 'المرفقات المرتبطة بهذا المحتوى / الدرس (اختياري — بدون حد أقصى)';

    const headingDesc = targetType === 'course'
        ? 'يمكنك ربط أكثر من اختبار، مشروع، أو مستند على مستوى الكورس ككل، أو تركه بدون مرفقات.'
        : 'يمكنك ربط أكثر من اختبار ومشروع ومستند بنفس الفيديو/الدرس (مثلاً: كويزين + مشروع + 3 ملفات) أو تركه بدون ربط.';

    function render() {
        const total = state.quizzes.length + state.projects.length + state.documents.length;

        const sectionsHtml = ['quizzes', 'projects', 'documents'].map((cat) => {
            const meta = CATEGORY_META[cat];
            const selectedIds = state[cat];
            const catalog = catalogs[cat];
            const term = (state.searchTerms[cat] || '').trim().toLowerCase();

            const filteredCatalog = catalog.filter(item => {
                const title = String(item[meta.titleKey] || '').toLowerCase();
                const id = String(item[meta.idKey] || '').toLowerCase();
                return !term || title.includes(term) || id.includes(term);
            });

            const availableOptions = filteredCatalog.map(item => {
                const id = String(item[meta.idKey]);
                const alreadyLinked = selectedIds.includes(id);
                return `<option value="${esc(id)}" ${alreadyLinked ? 'disabled' : ''}>${esc(item[meta.titleKey])} (${esc(meta.metaText(item))})${alreadyLinked ? ' — ✓ مرتبط' : ''}</option>`;
            }).join('');

            const listHtml = selectedIds.length === 0
                ? `<div class="text-xs text-gray-500 bg-black/30 border border-dashed border-white/10 rounded-xl p-3 text-center">${meta.emptyText}</div>`
                : selectedIds.map((id, idx) => {
                    const obj = catalog.find(x => String(x[meta.idKey]) === String(id));
                    const title = obj ? obj[meta.titleKey] : id;
                    const badge = obj ? meta.metaText(obj) : '';
                    return `
                        <div class="flex items-center justify-between gap-2 bg-black/50 border border-white/10 rounded-xl px-3 py-2 hover:border-white/20 transition-colors" data-attached-cat="${cat}" data-attached-id="${esc(id)}">
                            <div class="flex items-center gap-2.5 min-w-0 flex-1">
                                <span class="text-[10px] font-mono text-gray-500 bg-white/5 px-1.5 py-0.5 rounded shrink-0">#${idx + 1}</span>
                                <i class="fas ${meta.icon} ${meta.accentText} text-xs shrink-0"></i>
                                <span dir="auto" class="text-xs font-bold text-white truncate" title="${esc(title)}">${esc(title)}</span>
                                ${badge ? `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded ${meta.accentBg} ${meta.accentText} border ${meta.accentBorder} shrink-0">${esc(badge)}</span>` : ''}
                            </div>
                            <div class="flex items-center gap-1 shrink-0">
                                <button type="button" data-action="move-up" data-cat="${cat}" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''} aria-label="نقل ${esc(title)} لأعلى" class="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 disabled:opacity-30 text-gray-300 flex items-center justify-center text-[10px] transition-colors cursor-pointer"><i class="fas fa-chevron-up"></i></button>
                                <button type="button" data-action="move-down" data-cat="${cat}" data-idx="${idx}" ${idx === selectedIds.length - 1 ? 'disabled' : ''} aria-label="نقل ${esc(title)} لأسفل" class="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 disabled:opacity-30 text-gray-300 flex items-center justify-center text-[10px] transition-colors cursor-pointer"><i class="fas fa-chevron-down"></i></button>
                                <button type="button" data-action="remove" data-cat="${cat}" data-idx="${idx}" aria-label="إزالة ${esc(title)}" class="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500 hover:text-white text-red-400 flex items-center justify-center text-xs transition-colors cursor-pointer"><i class="fas fa-times"></i></button>
                            </div>
                        </div>
                    `;
                }).join('');

            return `
                <div class="bg-black/40 border border-white/10 rounded-2xl p-3.5 space-y-2.5" data-attachment-section="${cat}">
                    <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2 ${meta.accentText} font-bold text-xs sm:text-sm">
                            <i class="fas ${meta.icon}"></i>
                            <span>${meta.label}</span>
                        </div>
                        <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono ${meta.accentBg} ${meta.accentText} border ${meta.accentBorder}" data-count-badge="${cat}">
                            ${selectedIds.length} مرتبط
                        </span>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div class="sm:col-span-4 relative">
                            <i class="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-[11px]"></i>
                            <input type="search" data-search-cat="${cat}" value="${esc(state.searchTerms[cat])}" placeholder="تصفية ${meta.label}..." aria-label="تصفية ${meta.label}" class="w-full bg-black/70 border border-white/10 rounded-xl pr-8 pl-3 py-2 text-xs text-white placeholder-gray-500 focus:border-b-primary outline-none">
                        </div>
                        <div class="sm:col-span-6">
                            <select data-no-custom-select="true" data-picker-cat="${cat}" aria-label="اختر ${meta.singular} للربط" class="w-full bg-black/70 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-b-primary outline-none">
                                <option value="">-- اختر ${meta.singular} لإضافته (${filteredCatalog.length}) --</option>
                                ${availableOptions}
                            </select>
                        </div>
                        <div class="sm:col-span-2">
                            <button type="button" data-action="add" data-cat="${cat}" class="w-full py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${meta.btnClass}">
                                <i class="fas fa-plus text-[10px]"></i>
                                <span>ربط</span>
                            </button>
                        </div>
                    </div>

                    <div class="space-y-2" data-selected-list="${cat}">
                        ${listHtml}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="bg-white/[0.02] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4 dir-rtl text-right" data-testid="target-attachments-editor">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                    <div>
                        <h4 class="text-sm font-bold text-teal-400 flex items-center gap-2">
                            <i class="fas fa-layer-group"></i>
                            <span>${headingTitle}</span>
                        </h4>
                        <p class="text-xs text-gray-400 mt-0.5">${headingDesc}</p>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0 text-[11px] font-bold">
                        <span class="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300">الإجمالي: <span class="text-white font-mono" data-testid="attachments-total-count">${total}</span></span>
                    </div>
                </div>
                <div class="space-y-3.5">
                    ${sectionsHtml}
                </div>
            </div>
        `;

        // Bind search inputs (preserving cursor focus on re-filter)
        container.querySelectorAll('input[data-search-cat]').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const cat = e.target.getAttribute('data-search-cat');
                state.searchTerms[cat] = e.target.value;
                // Update only the corresponding <select> options without losing input focus!
                const selectEl = container.querySelector(`select[data-picker-cat="${cat}"]`);
                if (selectEl) {
                    const meta = CATEGORY_META[cat];
                    const term = state.searchTerms[cat].trim().toLowerCase();
                    const filtered = catalogs[cat].filter(item => {
                        const title = String(item[meta.titleKey] || '').toLowerCase();
                        const id = String(item[meta.idKey] || '').toLowerCase();
                        return !term || title.includes(term) || id.includes(term);
                    });
                    selectEl.innerHTML = `<option value="">-- اختر ${meta.singular} لإضافته (${filtered.length}) --</option>` +
                        filtered.map(item => {
                            const id = String(item[meta.idKey]);
                            const alreadyLinked = state[cat].includes(id);
                            return `<option value="${esc(id)}" ${alreadyLinked ? 'disabled' : ''}>${esc(item[meta.titleKey])} (${esc(meta.metaText(item))})${alreadyLinked ? ' — ✓ مرتبط' : ''}</option>`;
                        }).join('');
                }
            });
        });

        // Bind Add, Remove, Move Up/Down
        container.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                const cat = btn.getAttribute('data-cat');

                if (action === 'add') {
                    const selectEl = container.querySelector(`select[data-picker-cat="${cat}"]`);
                    const val = selectEl?.value;
                    if (!val) {
                        window.showToast?.(`يرجى اختيار ${CATEGORY_META[cat].singular} أولاً من القائمة`, 'warning');
                        return;
                    }
                    if (!state[cat].includes(val)) {
                        state[cat].push(val);
                        render();
                    }
                } else if (action === 'remove') {
                    const idx = Number(btn.getAttribute('data-idx'));
                    state[cat].splice(idx, 1);
                    render();
                } else if (action === 'move-up') {
                    const idx = Number(btn.getAttribute('data-idx'));
                    if (idx > 0) {
                        [state[cat][idx - 1], state[cat][idx]] = [state[cat][idx], state[cat][idx - 1]];
                        render();
                    }
                } else if (action === 'move-down') {
                    const idx = Number(btn.getAttribute('data-idx'));
                    if (idx < state[cat].length - 1) {
                        [state[cat][idx + 1], state[cat][idx]] = [state[cat][idx], state[cat][idx + 1]];
                        render();
                    }
                }
            });
        });
    }

    render();
}

export function getTargetAttachmentsValue(container) {
    const st = container?._attachmentsState;
    if (!st) return { quizIds: [], projectIds: [], docIds: [] };
    return {
        quizIds: [...st.quizzes],
        projectIds: [...st.projects],
        docIds: [...st.documents],
    };
}

// ============================================================================
// WIDGET B: MULTI-TARGET CURRICULUM LINKER (Quiz / Project / Document -> 0..N Courses or Contents)
// ============================================================================

/**
 * Mounts an interactive Multi-Target Curriculum Linker inside `container`.
 * Lets the admin link a Quiz, Project, or Document to ANY combination of:
 * - Courses (directly at the course level)
 * - Contents / Videos / Lessons (inside any course)
 * - Optionally Phases and Tracks (for Documents)
 * Or leave it with 0 targets.
 */
export function mountItemTargetsEditor(container, { itemType, initialTargets = [], hData, allowTrackPhase = false }) {
    if (!container) return;

    const state = {
        targets: (initialTargets || []).map(t => ({
            target_type: String(t.target_type),
            target_id: String(t.target_id),
        })),
        selectedTrack: '',
        selectedPhase: '',
        selectedCourse: '',
        selectedContent: '',
    };
    container._itemTargetsState = state;

    const itemLabel = itemType === 'quiz' ? 'الاختبار' : itemType === 'project' ? 'المشروع' : 'المستند';
    const accentColor = itemType === 'quiz' ? 'text-yellow-400' : itemType === 'project' ? 'text-emerald-400' : 'text-cyan-400';
    const borderAccent = itemType === 'quiz' ? 'border-yellow-500/20' : itemType === 'project' ? 'border-emerald-500/20' : 'border-cyan-500/20';
    const bgAccent = itemType === 'quiz' ? 'bg-yellow-500/[0.03]' : itemType === 'project' ? 'bg-emerald-500/[0.03]' : 'bg-cyan-500/[0.03]';

    const selectCls = 'w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:border-b-primary outline-none';

    function addTarget(targetType, targetId) {
        if (!targetId) {
            window.showToast?.('يرجى تحديد العنصر من القائمة أولاً قبل الضغط على ربط', 'warning');
            return;
        }
        const exists = state.targets.some(t => t.target_type === targetType && String(t.target_id) === String(targetId));
        if (exists) {
            window.showToast?.('هذا الارتباط مضاف بالفعل في القائمة', 'info');
            return;
        }
        state.targets.push({ target_type: targetType, target_id: String(targetId) });
        render();
    }

    function render() {
        const phasesFiltered = (hData?.phases || []).filter(p => !state.selectedTrack || String(p.track_id) === String(state.selectedTrack));
        const coursesFiltered = (hData?.courses || []).filter(c => {
            if (state.selectedPhase) return String(c.phase_id) === String(state.selectedPhase);
            if (state.selectedTrack) {
                const phaseIds = phasesFiltered.map(p => String(p.phase_id));
                return phaseIds.includes(String(c.phase_id));
            }
            return true;
        });
        const contentsFiltered = (hData?.contents || []).filter(m => {
            if (state.selectedCourse) return String(m.course_id) === String(state.selectedCourse);
            if (state.selectedPhase || state.selectedTrack) {
                const cIds = coursesFiltered.map(c => String(c.course_id));
                return cIds.includes(String(m.course_id));
            }
            return true;
        });

        const listHtml = state.targets.length === 0
            ? `<div class="text-xs text-gray-500 bg-black/30 border border-dashed border-white/10 rounded-xl p-3.5 text-center">غير مرتبط بأي كورس أو درس حالياً — يمكنك تركه بدون ربط أو إضافة ارتباط واحد أو أكثر من الأعلى.</div>`
            : state.targets.map((t, idx) => {
                const info = describeTarget(t, hData);
                return `
                    <div class="flex items-center justify-between gap-2 bg-black/50 border border-white/10 rounded-xl px-3.5 py-2.5 hover:border-white/20 transition-colors" data-linked-target-type="${esc(t.target_type)}" data-linked-target-id="${esc(t.target_id)}">
                        <div class="flex items-center gap-2.5 min-w-0 flex-1">
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold shrink-0 ${info.colorClass}">
                                <i class="fas ${info.icon} text-[9px]"></i>
                                <span>${info.badge}</span>
                            </span>
                            <div class="min-w-0 flex-1">
                                <div dir="auto" class="text-xs font-bold text-white truncate">${esc(info.title)}</div>
                                ${info.subtitle ? `<div dir="auto" class="text-[10px] text-gray-400 truncate">${esc(info.subtitle)}</div>` : ''}
                            </div>
                        </div>
                        <button type="button" data-remove-target="${idx}" aria-label="إزالة الارتباط بـ ${esc(info.title)}" class="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500 hover:text-white text-red-400 flex items-center justify-center text-xs shrink-0 transition-colors cursor-pointer">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
            }).join('');

        container.innerHTML = `
            <div class="p-4 sm:p-5 rounded-2xl border ${borderAccent} ${bgAccent} space-y-4 dir-rtl text-right" data-testid="item-targets-editor">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                    <div>
                        <h4 class="font-bold text-sm flex items-center gap-2 ${accentColor}">
                            <i class="fas fa-link"></i>
                            <span>ربط ${itemLabel} بالمنهج (كورس أو درس/فيديو — ارتباطات متعددة)</span>
                        </h4>
                        <p class="text-xs text-gray-400 mt-0.5">يمكنك ربط هذا ${itemLabel} بكورس مباشر أو بفيديو/درس داخله (أو بأكثر من مكان في نفس الوقت دون مسح المرفقات الأخرى).</p>
                    </div>
                    <span class="px-2.5 py-1 rounded-lg bg-black/50 border border-white/10 text-xs font-bold text-gray-300 shrink-0">
                        الارتباطات: <span class="text-white font-mono" data-testid="item-targets-count">${state.targets.length}</span>
                    </span>
                </div>

                <!-- Cascading Filter Pickers -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                        <label class="text-[11px] text-gray-400 mb-1 block font-bold">1. المسار (Track)</label>
                        <select data-no-custom-select="true" data-mt-sel="track" aria-label="تصفية المسار" class="${selectCls}">
                            <option value="">-- كل المسارات --</option>
                            ${(hData?.tracks || []).map(t => `<option value="${esc(t.id)}" ${String(state.selectedTrack) === String(t.id) ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="text-[11px] text-gray-400 mb-1 block font-bold">2. المرحلة (Phase)</label>
                        <select data-no-custom-select="true" data-mt-sel="phase" aria-label="تصفية المرحلة" class="${selectCls}">
                            <option value="">-- كل المراحل --</option>
                            ${phasesFiltered.map(p => `<option value="${esc(p.phase_id)}" ${String(state.selectedPhase) === String(p.phase_id) ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="text-[11px] text-blue-300 mb-1 block font-bold">3. الكورس (Course)</label>
                        <select data-no-custom-select="true" data-mt-sel="course" aria-label="اختيار الكورس" class="${selectCls} border-blue-500/30">
                            <option value="">-- اختر كورساً --</option>
                            ${coursesFiltered.map(c => `<option value="${esc(c.course_id)}" ${String(state.selectedCourse) === String(c.course_id) ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="text-[11px] text-teal-300 mb-1 block font-bold">4. الدرس / الفيديو (Content)</label>
                        <select data-no-custom-select="true" data-mt-sel="content" aria-label="اختيار الدرس" class="${selectCls} border-teal-500/30">
                            <option value="">-- اختر درساً / فيديو --</option>
                            ${contentsFiltered.map(m => `<option value="${esc(m.content_id)}" ${String(state.selectedContent) === String(m.content_id) ? 'selected' : ''}>${esc(m.title)}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <!-- Quick Link Action Buttons -->
                <div class="flex flex-wrap items-center gap-2">
                    <button type="button" data-add-target="content" class="px-3.5 py-2 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95">
                        <i class="fas fa-plus text-[10px]"></i>
                        <span>ربط بالدرس المحدد</span>
                    </button>
                    <button type="button" data-add-target="course" class="px-3.5 py-2 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95">
                        <i class="fas fa-plus text-[10px]"></i>
                        <span>ربط بالكورس المحدد</span>
                    </button>
                    ${allowTrackPhase ? `
                        <button type="button" data-add-target="phase" class="px-3 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95">
                            <i class="fas fa-plus text-[10px]"></i>
                            <span>ربط بالمرحلة</span>
                        </button>
                        <button type="button" data-add-target="track" class="px-3 py-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95">
                            <i class="fas fa-plus text-[10px]"></i>
                            <span>ربط بالمسار</span>
                        </button>
                    ` : ''}
                </div>

                <!-- Linked Targets List -->
                <div class="space-y-2" data-testid="item-targets-list">
                    ${listHtml}
                </div>
            </div>
        `;

        container.querySelector('[data-mt-sel="track"]')?.addEventListener('change', (e) => {
            state.selectedTrack = e.target.value;
            state.selectedPhase = '';
            state.selectedCourse = '';
            state.selectedContent = '';
            render();
        });
        container.querySelector('[data-mt-sel="phase"]')?.addEventListener('change', (e) => {
            state.selectedPhase = e.target.value;
            state.selectedCourse = '';
            state.selectedContent = '';
            render();
        });
        container.querySelector('[data-mt-sel="course"]')?.addEventListener('change', (e) => {
            state.selectedCourse = e.target.value;
            state.selectedContent = '';
            render();
        });
        container.querySelector('[data-mt-sel="content"]')?.addEventListener('change', (e) => {
            state.selectedContent = e.target.value;
        });

        container.querySelectorAll('button[data-add-target]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tType = btn.getAttribute('data-add-target');
                if (tType === 'content') addTarget('content', state.selectedContent);
                else if (tType === 'course') addTarget('course', state.selectedCourse);
                else if (tType === 'phase') addTarget('phase', state.selectedPhase);
                else if (tType === 'track') addTarget('track', state.selectedTrack);
            });
        });

        container.querySelectorAll('button[data-remove-target]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.getAttribute('data-remove-target'));
                state.targets.splice(idx, 1);
                render();
            });
        });
    }

    render();
}

export function getItemTargetsValue(container) {
    const st = container?._itemTargetsState;
    if (!st) return [];
    const list = [...st.targets];
    // UX convenience: if the user selected a lesson or course in the dropdown and hit Save
    // without clicking "+ ربط" when the list was still empty, include it automatically?
    // Wait: NO — the user explicitly asked to allow leaving an item UNLINKED ("أو كل واحد مش مرتبط بحاجة")!
    // Only return explicitly added targets so 0 targets is always respected.
    return list;
}

// ============================================================================
// MODAL C: DEDICATED QUICK ATTACHMENTS ORGANIZER MODAL
// ============================================================================

export function openQuickAttachmentsModal({ targetType, targetId, targetTitle, hData, allLinks, onSave }) {
    const modalId = 'cm-attachments-organizer-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'fixed inset-0 z-[450] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5';
        modal.setAttribute('dir', 'rtl');
        document.body.appendChild(modal);
    }

    const typeLabel = targetType === 'course' ? 'كورس (Course)' : 'درس / محتوى (Content)';
    const typeIcon = targetType === 'course' ? 'fa-book text-blue-400' : 'fa-file-video text-teal-400';

    modal.innerHTML = `
        <div class="bg-b-surface border border-white/10 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh] text-right">
            <div class="px-6 py-4 border-b border-white/10 bg-white/[0.03] flex justify-between items-center shrink-0">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/25 flex items-center justify-center shrink-0">
                        <i class="fas ${typeIcon} text-base"></i>
                    </div>
                    <div class="min-w-0">
                        <h3 class="text-base sm:text-lg font-bold text-white truncate">إدارة وتنظيم المرفقات — ${esc(targetTitle || targetId)}</h3>
                        <p class="text-xs text-gray-400 mt-0.5">${typeLabel} • اربط أي عدد من الاختبارات والمشاريع والمستندات بدون قيود</p>
                    </div>
                </div>
                <button type="button" id="cm-att-modal-close" aria-label="إغلاق نافذة المرفقات" class="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer shrink-0">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div id="cm-att-modal-body" class="p-5 sm:p-6 overflow-y-auto custom-scroll flex-1"></div>
            <div class="px-6 py-4 border-t border-white/10 bg-black/40 flex justify-end gap-3 shrink-0">
                <button type="button" id="cm-att-modal-cancel" class="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-sm transition-all cursor-pointer">إلغاء</button>
                <button type="button" id="cm-att-modal-save" class="px-6 py-2.5 rounded-xl bg-b-primary hover:bg-teal-600 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-teal-900/30 transition-all cursor-pointer">
                    <i class="fas fa-save"></i>
                    <span>حفظ المرفقات</span>
                </button>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');

    const bodyEl = document.getElementById('cm-att-modal-body');
    const initialAttachments = getAttachmentsForTarget(allLinks, targetType, targetId);
    mountTargetAttachmentsEditor(bodyEl, { targetType, initialAttachments, hData });

    const close = () => modal.remove();
    document.getElementById('cm-att-modal-close').onclick = close;
    document.getElementById('cm-att-modal-cancel').onclick = close;

    document.getElementById('cm-att-modal-save').onclick = async () => {
        const saveBtn = document.getElementById('cm-att-modal-save');
        const origHtml = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        try {
            const values = getTargetAttachmentsValue(bodyEl);
            await onSave(values);
            close();
        } catch (err) {
            window.showToast?.('حدث خطأ أثناء حفظ المرفقات: ' + (err?.message || err), 'error');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = origHtml;
            }
        }
    };
}

// ============================================================================
// HELPER E: NON-INTRUSIVE SQL SETUP BANNER (ONLY IF `curriculum_links` NOT YET CREATED)
// ============================================================================

export function renderMigrationBanner(tableReady) {
    const existing = document.getElementById('cm-curriculum-links-sql-banner');
    if (tableReady) {
        if (existing) existing.remove();
        return;
    }

    const host = document.getElementById('content-mgmt');
    if (!host || existing) return;

    const banner = document.createElement('div');
    banner.id = 'cm-curriculum-links-sql-banner';
    banner.className = 'mx-3 sm:mx-5 mt-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-right';
    banner.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                <i class="fas fa-database text-sm"></i>
            </div>
            <div>
                <p class="text-xs sm:text-sm font-bold text-amber-300">لتفعيل حفظ الروابط المتعددة في قاعدة البيانات (أكثر من كويز/مشروع لنفس المحتوى أو على مستوى الكورس)</p>
                <p class="text-[11px] text-gray-300 mt-0.5">يرجى تشغيل ملف <code class="font-mono text-amber-200 bg-black/50 px-1.5 py-0.5 rounded">docs/create_curriculum_links.sql</code> مرة واحدة في Supabase SQL Editor.</p>
            </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
            <button type="button" id="btn-copy-curriculum-links-sql" class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer">
                <i class="fas fa-copy"></i>
                <span>نسخ كود SQL</span>
            </button>
            <button type="button" id="btn-dismiss-sql-banner" aria-label="إخفاء التنبيه" class="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer">
                <i class="fas fa-times text-xs"></i>
            </button>
        </div>
    `;

    // Insert right after sub-tabs strip inside #content-mgmt
    const filtersBar = host.querySelector('#advanced-filters-wrapper')?.closest('div.p-2\\.5') || host.children[2];
    if (filtersBar && filtersBar.parentNode === host) {
        host.insertBefore(banner, filtersBar);
    } else {
        host.prepend(banner);
    }

    document.getElementById('btn-copy-curriculum-links-sql')?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(CURRICULUM_LINKS_SQL);
            window.showToast?.('تم نسخ كود SQL بنجاح! الصقه في Supabase SQL Editor وشغّله.', 'success');
        } catch {
            window.showToast?.('الكود موجود في ملف docs/create_curriculum_links.sql', 'info');
        }
    });

    document.getElementById('btn-dismiss-sql-banner')?.addEventListener('click', () => {
        banner.remove();
    });
}
