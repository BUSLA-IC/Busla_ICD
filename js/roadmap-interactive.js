import { supabase } from './supabase-config.js';

function getAssetPrefix() {
    const loc = window.location.pathname;
    if (loc.includes('/admin/html/')) return '../../';
    if (loc.includes('/pages/') || loc.includes('/admin/')) return '../';
    return './';
}

function extractYouTubeId(urlOrId) {
    if (!urlOrId || typeof urlOrId !== 'string') return '';
    const str = urlOrId.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
        return str;
    }
    const match = str.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    return (match && match[1]) ? match[1] : '';
}

// Global variables for canvas state
let zoomLevel = 1.0;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let startX = 0, startY = 0;
let activeNode = null;
let computedNodes = [];
let computedLinks = [];
let userProgress = { completedMats: new Set(), passedQuizzes: new Set(), completedProjects: new Set() };
let currentRole = 'student';
// Nodes that have been EXPLICITLY EXPANDED by the user.
// Default state = collapsed. Add an ID here to mark it as open.
let expandedPhases = new Set();
let expandedNodes = new Set();
let expandedRelated = new Set();
let currentGraphData = null;
let cameraAnimFrame = null;

// ── Debounce guards (module-level so they survive re-renders) ──
let _lastToggleTime = 0;       // guards toggle-collapse buttons
let _lastNodeClickTime = 0;    // guards handleRoadmapNodeClick (prevent touch+click double-fire)

// Standard icons for different node types
const ICONS = {
    track: 'fa-map-signs',
    phase: 'fa-layer-group',
    course: 'fa-book-open',
    video: 'fa-play-circle',
    quiz: 'fa-clipboard-question',
    project: 'fa-code-branch',
    document: 'fa-file-pdf'
};

/**
 * Initializes the Interactive Roadmap Engine.
 * @param {string} role - 'student' or 'leader'
 */
export async function initInteractiveRoadmap(role = 'student') {
    currentRole = role;
    const container = role === 'admin' ? document.getElementById('learning-roadmap-container') : document.getElementById('roadmap-tree-container');
    if (!container) return;

    // Check if the HTML elements exist. If not, we will inject our new structure inside the container.
    setupRoadmapHTML(container);

    // Fetch and populate tracks dropdown if our dynamic selector is used
    const selector = document.getElementById('roadmap-track-selector') || document.getElementById('filter-track');
    if (selector && selector.options.length <= 1) {
        try {
            const { data: tracks, error } = await supabase.from('tracks').select('id, name').eq('is_active', true);
            if (!error && tracks) {
                selector.innerHTML = '<option value="">اختر المسار (Select Track)...</option>' + 
                    tracks.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
            }
        } catch (e) {
            console.error("Error populating track selector:", e);
        }
    }

    // Fetch user progress data once to resolve node completion states
    await fetchUserProgress();

    // Re-render when the track is changed
    if (selector) {
        selector.removeEventListener('change', handleTrackChange);
        selector.addEventListener('change', handleTrackChange);
    }

    // Render tree for currently selected track
    await renderInteractiveRoadmapTree();
}

/**
 * Sets up the container layout (adds toolbar, viewport, canvas, controls, minimap, legends)
 */
function setupRoadmapHTML(container) {
    initDetailsPanelSwipeToDismiss();
    if (document.getElementById('roadmap-viewport')) {
        bindViewportEvents();
        return;
    }

    const hasSelector = !!document.getElementById('roadmap-track-selector');
    const trackSelectorHtml = hasSelector ? '' : `
        <div class="flex items-center gap-2">
            <select id="roadmap-track-selector" class="bg-black/50 border border-white/10 text-xs text-white rounded-xl px-3 py-2 outline-none cursor-pointer">
                <option value="">اختر المسار التعليمي...</option>
            </select>
        </div>`;

    container.innerHTML = `
        <div class="roadmap-container-wrapper" style="display:flex;flex-direction:column;height:100%;">
 
            <!-- ── Toolbar ── -->
            <div class="roadmap-toolbar" style="flex-shrink:0;">
                <!-- Track Selector -->
                ${trackSelectorHtml}
 
                <!-- Legend -->
                <div class="roadmap-legend">
                    <div class="roadmap-legend-item"><span class="roadmap-legend-dot" style="background:var(--color-track)"></span><span>مسار</span></div>
                    <div class="roadmap-legend-item"><span class="roadmap-legend-dot" style="background:var(--color-phase)"></span><span>مرحلة</span></div>
                    <div class="roadmap-legend-item"><span class="roadmap-legend-dot" style="background:var(--color-course)"></span><span>كورس</span></div>
                    <div class="roadmap-legend-item"><span class="roadmap-legend-dot" style="background:var(--color-video)"></span><span>درس</span></div>
                    <div class="roadmap-legend-item"><span class="roadmap-legend-dot" style="background:var(--color-quiz)"></span><span>كويز</span></div>
                    <div class="roadmap-legend-item"><span class="roadmap-legend-dot" style="background:var(--color-project)"></span><span>مشروع</span></div>
                </div>

                <!-- Export button -->
                <div class="relative" id="rm-export-wrapper">
                    <button id="rm-export-btn"
                            class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs text-white hover:border-white/25 transition-all">
                        <i class="fas fa-download text-[10px]"></i> تصدير
                    </button>
                    <div id="rm-export-menu"
                         class="hidden absolute left-0 top-full mt-1 z-50 bg-[#0e0e0e] border border-white/10 rounded-xl overflow-hidden shadow-2xl min-w-[160px]">
                        <button onclick="window._rmExport('svg')"
                                class="w-full text-right px-4 py-2.5 text-xs text-white hover:bg-white/5 transition-all flex items-center gap-2">
                            <i class="fas fa-bezier-curve text-cyan-400"></i> تصدير SVG
                        </button>
                        <button onclick="window._rmExport('png1')"
                                class="w-full text-right px-4 py-2.5 text-xs text-white hover:bg-white/5 transition-all flex items-center gap-2">
                            <i class="fas fa-image text-green-400"></i> PNG — جودة عادية (1x)
                        </button>
                        <button onclick="window._rmExport('png2')"
                                class="w-full text-right px-4 py-2.5 text-xs text-white hover:bg-white/5 transition-all flex items-center gap-2">
                            <i class="fas fa-image text-green-400"></i> PNG — جودة عالية (2x)
                        </button>
                        <button onclick="window._rmExport('png4')"
                                class="w-full text-right px-4 py-2.5 text-xs text-white hover:bg-white/5 transition-all flex items-center gap-2">
                            <i class="fas fa-image text-green-400"></i> PNG — جودة ممتازة (4x)
                        </button>
                    </div>
                </div>
            </div>

            <!-- ── Main area: viewport ── -->
            <div style="flex:1;display:flex;overflow:hidden;position:relative;">

                <!-- Viewport ── -->
                <div id="roadmap-viewport" class="roadmap-viewport" style="flex:1;min-width:0;">
                    <!-- Controls -->
                    <div class="roadmap-controls">
                        <button class="roadmap-btn" id="roadmap-zoom-in"  title="Zoom In"><i class="fas fa-plus"></i></button>
                        <button class="roadmap-btn" id="roadmap-zoom-out" title="Zoom Out"><i class="fas fa-minus"></i></button>
                        <button class="roadmap-btn" id="roadmap-zoom-fit" title="Fit Screen"><i class="fas fa-expand"></i></button>
                        <button class="roadmap-btn" id="roadmap-zoom-center" title="Center Graph"><i class="fas fa-crosshairs"></i></button>
                        <button class="roadmap-btn" id="roadmap-zoom-reset" title="Reset View"><i class="fas fa-sync-alt"></i></button>
                    </div>

                    <!-- Placeholder -->
                    <div id="roadmap-placeholder-overlay"
                         class="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-gray-500 bg-[#050505] z-10 hidden"></div>

                    <!-- Canvas -->
                    <div id="roadmap-canvas" class="roadmap-canvas">
                        <svg id="roadmap-svg" class="roadmap-svg-layer"></svg>
                        <div id="roadmap-nodes-container" class="roadmap-nodes-layer"></div>
                    </div>

                    <!-- Mini Map -->
                    <div id="roadmap-minimap" class="roadmap-minimap">
                        <canvas id="roadmap-minimap-canvas" class="roadmap-minimap-canvas"></canvas>
                        <div id="roadmap-minimap-viewport" class="roadmap-minimap-viewport"></div>
                    </div>
                </div>

            </div>
        </div>
    `;


    // Bind nav buttons
    document.getElementById('roadmap-zoom-in').addEventListener('click',  () => adjustZoom(0.1));
    document.getElementById('roadmap-zoom-out').addEventListener('click', () => adjustZoom(-0.1));
    document.getElementById('roadmap-zoom-fit').addEventListener('click', fitRoadmapToScreen);
    document.getElementById('roadmap-zoom-center').addEventListener('click', centerGraph);
    document.getElementById('roadmap-zoom-reset').addEventListener('click', resetRoadmapView);



    // Export toggle
    const exportBtn  = document.getElementById('rm-export-btn');
    const exportMenu = document.getElementById('rm-export-menu');
    exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => exportMenu.classList.add('hidden'));

    bindViewportEvents();
}


/**
 * Binds (or re-binds) pan & zoom mouse events on the viewport.
 * Called on every init so events survive admin tab switches.
 */
let _vpAbortCtrl = null;

function bindViewportEvents() {
    const vp = document.getElementById('roadmap-viewport');
    if (!vp) return;

    // Cancel any previously registered listeners before re-registering
    if (_vpAbortCtrl) _vpAbortCtrl.abort();
    _vpAbortCtrl = new AbortController();
    const sig = { signal: _vpAbortCtrl.signal };

    vp.addEventListener('mousedown',  startPanning,      sig);
    vp.addEventListener('mousemove',  panCanvas,         sig);
    vp.addEventListener('mouseup',    stopPanning,       sig);
    vp.addEventListener('mouseleave', stopPanning,       sig);
    vp.addEventListener('wheel',      handleMouseWheel, { ...sig, passive: false });

    // Touch events for pinching and mobile/tablet dragging
    vp.addEventListener('touchstart', handleTouchStart, { ...sig, passive: false });
    vp.addEventListener('touchmove',  handleTouchMove,  { ...sig, passive: false });
    vp.addEventListener('touchend',    handleTouchEnd,   sig);
    vp.addEventListener('touchcancel', handleTouchEnd,   sig);

    const btnIn  = document.getElementById('roadmap-zoom-in');
    const btnOut = document.getElementById('roadmap-zoom-out');
    const btnFit = document.getElementById('roadmap-zoom-fit');
    const btnCtr = document.getElementById('roadmap-zoom-center');
    const btnRst = document.getElementById('roadmap-zoom-reset');
    if (btnIn)  btnIn.addEventListener('click',  () => adjustZoom(0.1),    sig);
    if (btnOut) btnOut.addEventListener('click', () => adjustZoom(-0.1),   sig);
    if (btnFit) btnFit.addEventListener('click', fitRoadmapToScreen,       sig);
    if (btnCtr) btnCtr.addEventListener('click', centerGraph,              sig);
    if (btnRst) btnRst.addEventListener('click', resetRoadmapView,         sig);

    // Auto-fit on size change / when becoming visible (e.g. switching tabs on mobile)
    if (window.ResizeObserver && !vp._hasResizeObserver) {
        vp._hasResizeObserver = true;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 50 && height > 50) {
                    if (!window._roadmapHasAutoFitted || (offsetX === 0 && offsetY === 0)) {
                        window._roadmapHasAutoFitted = true;
                        requestAnimationFrame(() => {
                            fitRoadmapToScreen();
                            updateMinimap();
                        });
                    }
                }
            }
        });
        ro.observe(vp);
    }
}

/**
 * Handles Track selection changes
 */
async function handleTrackChange() {
    currentGraphData = null;
    expandedPhases.clear();
    expandedNodes.clear(); // reset expanded state when switching track
    expandedRelated.clear();
    await renderInteractiveRoadmapTree();
}

/**
 * Fetches current user progress (materials completed, quizzes passed, projects submitted)
 */
async function fetchUserProgress() {
    if (currentRole === 'admin') {
        userProgress.completedProjects = new Set();
        userProgress.passedQuizzes = new Set();
        userProgress.completedMats = new Set();
        return;
    }
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const uid = session.user.id;

        const [projRes, quizRes, matRes] = await Promise.all([
            supabase.from('project_submissions').select('project_id, status').eq('user_id', uid),
            supabase.from('quiz_attempts').select('quiz_id, passed').eq('user_id', uid),
            supabase.from('completed_materials').select('material_id').eq('user_id', uid)
        ]);

        userProgress.completedProjects = new Set((projRes.data || []).map(p => p.project_id));
        userProgress.passedQuizzes = new Set((quizRes.data || []).filter(q => q.passed).map(q => q.quiz_id));
        userProgress.completedMats = new Set((matRes.data || []).map(m => m.material_id));
    } catch (e) {
        console.error("Error fetching user progress for roadmap:", e);
    }
}

/**
 * Main render function
 */
async function renderInteractiveRoadmapTree() {
    const selector = document.getElementById('roadmap-track-selector') || document.getElementById('filter-track');
    const trackId = selector ? selector.value : 'all';
    if (!trackId || trackId === 'all') {
        renderPlaceholder("الرجاء اختيار مسار محدد (Track) لعرض الخريطة التفاعلية.");
        return;
    }

    const nodesContainer = document.getElementById('roadmap-nodes-container');
    const svgLayer = document.getElementById('roadmap-svg');
    if (!nodesContainer || !svgLayer) return;

    // Show loading
    nodesContainer.innerHTML = '<div class="text-center py-20 text-gray-500"><i class="fas fa-spinner fa-spin text-3xl mb-4"></i><br>جاري رسم شجرة المنهج...</div>';
    svgLayer.innerHTML = '';

    // Fetch and structure raw graph data
    if (!currentGraphData) {
        currentGraphData = await fetchGraphData(trackId);
    }
    const graphData = currentGraphData;
    if (!graphData || graphData.phases.length === 0) {
        renderPlaceholder("لا توجد مراحل (Phases) مضافة في هذا المسار حالياً.");
        return;
    }

    // Hide any showing placeholder overlay
    hidePlaceholder();

    // Build lists of nodes and connection links
    buildGraphStructure(graphData);

    // Calculate layout coordinates (X, Y)
    calculateGraphLayout();

    // Render nodes
    renderHtmlNodes();

    // Render SVG connecting lines
    renderSvgLines();

    // Register global helpers for info panel and export
    initInfoPanelGlobals();
    initExportGlobals();

    // Reset view — defer until element is actually painted and has real dimensions
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            fitRoadmapToScreen();
            updateMinimap();

            // 🔄 استرجاع آخر نود محددة في شجرة المنهج
            const rememberedNodeId = localStorage.getItem('busla_roadmap_active_node_id');
            if (rememberedNodeId) {
                const targetNode = computedNodes.find(n => n.id === rememberedNodeId);
                if (targetNode) {
                    selectNode(targetNode, false, false);
                }
            }
        });
    });
}

/**
 * Renders placeholder text when no track selected or empty
 */
function renderPlaceholder(msg) {
    const overlay = document.getElementById('roadmap-placeholder-overlay');
    const canvas = document.getElementById('roadmap-canvas');
    const minimap = document.getElementById('roadmap-minimap');
    const controls = document.querySelector('.roadmap-controls');

    if (overlay) {
        overlay.innerHTML = `
            <div class="max-w-md mx-auto flex flex-col items-center justify-center">
                <div class="w-16 h-16 bg-[#006A67]/15 text-[#00F5FF] rounded-full flex items-center justify-center text-2xl mb-4 border border-[#006A67]/30 shadow-[0_0_15px_rgba(0,245,255,0.2)]">
                    <i class="fas fa-map-signs"></i>
                </div>
                <h3 class="font-bold text-lg text-white mb-2">${msg}</h3>
                <p class="text-xs text-gray-400 leading-relaxed">الرجاء اختيار أحد المسارات التعليمية المتاحة مثل (Digital IC Design) من القائمة المنسدلة أعلاه لبدء تصفح خريطة التعلم التفاعلية.</p>
            </div>
        `;
        overlay.classList.remove('hidden');
    }
    if (canvas) canvas.classList.add('hidden');
    if (minimap) minimap.classList.add('hidden');
    if (controls) controls.classList.add('hidden');
}

/**
 * Hides placeholder overlay and displays canvas elements
 */
function hidePlaceholder() {
    const overlay = document.getElementById('roadmap-placeholder-overlay');
    const canvas = document.getElementById('roadmap-canvas');
    const minimap = document.getElementById('roadmap-minimap');
    const controls = document.querySelector('.roadmap-controls');

    if (overlay) overlay.classList.add('hidden');
    if (canvas) canvas.classList.remove('hidden');
    if (minimap) minimap.classList.remove('hidden');
    if (controls) controls.classList.remove('hidden');
}

/**
 * Fetches raw Supabase data for the selected track
 */
async function fetchGraphData(trackId) {
    try {
        const [trackRes, phasesRes, coursesRes, materialsRes, quizzesRes, projectsRes, documentsRes] = await Promise.all([
            supabase.from('tracks').select('*').eq('id', trackId).single(),
            supabase.from('phases').select('*').eq('track_id', trackId).order('order_index', { ascending: true }).order('created_at', { ascending: true }),
            supabase.from('courses').select('*').order('order_index', { ascending: true }),
            supabase.from('course_materials').select('*').order('order_index', { ascending: true }),
            supabase.from('quizzes').select('*'),
            supabase.from('projects').select('*'),
            supabase.from('curriculum_documents').select('*').order('order_index', { ascending: true })
        ]);

        if (phasesRes.error) throw phasesRes.error;

        const phases = phasesRes.data || [];
        const phaseIds = phases.map(p => p.phase_id);

        const courses = (coursesRes.data || []).filter(c => phaseIds.includes(c.phase_id));
        const courseIds = courses.map(c => c.course_id);

        const materials = (materialsRes.data || []).filter(m => courseIds.includes(m.course_id));

        return {
            track: trackRes.data,
            phases,
            courses,
            materials,
            quizzes: quizzesRes.data || [],
            projects: projectsRes.data || [],
            documents: documentsRes.data || []
        };
    } catch (e) {
        console.error("Error fetching graph data:", e);
        return null;
    }
}

/**
 * Builds nodes and link relationships from raw database tables
 */
function buildGraphStructure(data) {
    computedNodes = [];
    computedLinks = [];

    // 1. Add Track Node (always visible, never collapsed)
    const trackNode = {
        id: `track-${data.track.id}`,
        dbId: data.track.id,
        type: 'track',
        title: data.track.name,
        description: data.track.description,
        phasesCount: data.phases.length,
        completionRate: calculateTrackCompletion(data),
        rawItem: data.track,
        isCollapsed: false,
        isHidden: false
    };
    computedNodes.push(trackNode);

    let lastPhaseNodeId = trackNode.id;

    // Recursive helper to add courses and their related subtrees
    function addCourseAndSubtree(course, isParentHidden, parentCourseId = null) {
        const courseNodeId = `course-${course.course_id}`;
        
        const isCourseCollapsed = !expandedNodes.has(courseNodeId);
        const isRelatedCollapsed = !expandedRelated.has(courseNodeId);
        const isCourseHidden = isParentHidden;
        
        const courseNode = {
            id: courseNodeId,
            dbId: course.course_id,
            type: 'course',
            title: course.title,
            description: course.description,
            instructor: course.created_by || 'Busla Team',
            duration: course['Module_Time'] || course['Module Time'] || 'غير محدد',
            phaseId: course.phase_id,
            trackId: data.track.id,
            difficulty: course.type || 'Intermediate',
            status: getCourseStatus(course, data.materials),
            videosCount: data.materials.filter(m => m.course_id === course.course_id && m.type === 'video').length,
            quizzesCount: data.materials.filter(m => m.course_id === course.course_id && m.type === 'quiz').length,
            projectsCount: data.materials.filter(m => m.course_id === course.course_id && m.type === 'project').length,
            prerequisites: course.prerequisites || [],
            rawItem: course,
            isCollapsed: isCourseCollapsed,
            isRelatedCollapsed: isRelatedCollapsed,
            isHidden: isCourseHidden,
            relatedWith: course.related_with || null,
            parentCourseId: parentCourseId
        };
        computedNodes.push(courseNode);

        if (Array.isArray(courseNode.prerequisites) && courseNode.prerequisites.length > 0) {
            courseNode.prerequisites.forEach(prereq => {
                const targetId = typeof prereq === 'string' ? prereq : prereq.course_id;
                const relType = prereq.type || 'prerequisite';
                computedLinks.push({
                    from: `course-${targetId}`,
                    to: courseNode.id,
                    relationType: relType
                });
            });
        }

        if (parentCourseId) {
            computedLinks.push({
                from: `course-${parentCourseId}`,
                to: courseNode.id,
                relationType: 'related-course'
            });
        }

        // Materials and course-level documents of this course
        const courseMaterials = data.materials.filter(m => m.course_id === course.course_id);
        const courseDocs = (data.documents || []).filter(d => d.course_id === course.course_id && !d.lesson_id);

        const combinedItems = [
            ...courseMaterials.map(m => ({ itemType: 'material', order: m.order_index || 0, data: m })),
            ...courseDocs.map(d => ({ itemType: 'document', order: d.order_index || 0, data: d }))
        ].sort((a, b) => a.order - b.order);

        let lastMatNodeId = courseNode.id;
        
        combinedItems.forEach((item) => {
            const isMatHidden = isCourseHidden || isCourseCollapsed;
            
            if (item.itemType === 'material') {
                const mat = item.data;
                
                // Subnodes (quizzes/projects/documents linked to this material)
                const subNodes = [];
                if (mat.ref_quiz_id) {
                    const quizObj = data.quizzes.find(q => q.quiz_id === mat.ref_quiz_id);
                    if (quizObj) {
                        subNodes.push({
                            id: `quiz-${quizObj.quiz_id}`,
                            dbId: quizObj.quiz_id,
                            type: 'quiz',
                            title: quizObj.title,
                            description: quizObj.description,
                            status: userProgress.passedQuizzes.has(quizObj.quiz_id) ? 'completed' : 'current',
                            baseXp: quizObj.max_xp || 50,
                            parentMaterialId: mat.content_id,
                            courseId: course.course_id,
                            isHidden: isMatHidden
                        });
                    }
                }
                if (mat.ref_project_id) {
                    const projObj = data.projects.find(p => p.id === mat.ref_project_id);
                    if (projObj) {
                        subNodes.push({
                            id: `project-${projObj.id}`,
                            dbId: projObj.id,
                            type: 'project',
                            title: projObj.title,
                            description: projObj.description,
                            status: userProgress.completedProjects.has(projObj.id) ? 'completed' : 'current',
                            baseXp: projObj.max_points || 100,
                            parentMaterialId: mat.content_id,
                            courseId: course.course_id,
                            isHidden: isMatHidden
                        });
                    }
                }
                
                // Add lesson-level documents
                const linkedDocs = (data.documents || []).filter(d => d.lesson_id === mat.content_id);
                linkedDocs.forEach(docObj => {
                    subNodes.push({
                        id: `doc-${docObj.id}`,
                        dbId: docObj.id,
                        type: 'document',
                        title: docObj.title,
                        description: docObj.description,
                        docType: docObj.document_type || 'PDF',
                        status: userProgress.completedMats.has(`doc_${docObj.id}`) ? 'completed' : 'current',
                        baseXp: docObj.xp_reward || 10,
                        parentMaterialId: mat.content_id,
                        courseId: course.course_id,
                        isHidden: isMatHidden,
                        rawItem: docObj
                    });
                });
                
                const matNode = {
                    id: `material-${mat.content_id}`,
                    dbId: mat.content_id,
                    courseId: course.course_id,
                    phaseId: course.phase_id,
                    type: mat.type || 'video',
                    title: mat.title,
                    duration: mat.duration ? formatDuration(mat.duration) : null,
                    baseXp: mat.base_xp || 10,
                    status: getMaterialStatus(mat),
                    difficulty: courseNode.difficulty,
                    author: mat.author || 'Busla Team',
                    rawItem: mat,
                    isCollapsed: false,
                    isHidden: isMatHidden,
                    subNodesCount: subNodes.length
                };
                computedNodes.push(matNode);

                computedLinks.push({
                    from: lastMatNodeId,
                    to: matNode.id,
                    relationType: lastMatNodeId === courseNode.id ? 'course-to-first-mat' : 'mat-chain'
                });
                
                subNodes.forEach(subNode => {
                    computedNodes.push(subNode);
                    computedLinks.push({
                        from: matNode.id,
                        to: subNode.id,
                        relationType: 'material-to-subnode'
                    });
                });
                
                lastMatNodeId = matNode.id;
            } else {
                // Course-level Document
                const doc = item.data;
                const docNode = {
                    id: `doc-${doc.id}`,
                    dbId: doc.id,
                    courseId: course.course_id,
                    phaseId: course.phase_id,
                    type: 'document',
                    title: doc.title,
                    duration: doc.estimated_reading_time ? `${doc.estimated_reading_time} دقيقة` : null,
                    baseXp: doc.xp_reward || 10,
                    status: userProgress.completedMats.has(`doc_${doc.id}`) ? 'completed' : 'current',
                    difficulty: courseNode.difficulty,
                    author: 'Busla Team',
                    rawItem: doc,
                    isCollapsed: false,
                    isHidden: isMatHidden,
                    subNodesCount: 0
                };
                computedNodes.push(docNode);

                computedLinks.push({
                    from: lastMatNodeId,
                    to: docNode.id,
                    relationType: lastMatNodeId === courseNode.id ? 'course-to-first-mat' : 'mat-chain'
                });

                lastMatNodeId = docNode.id;
            }
        });

        // Recursively add related courses
        const relatedCourses = data.courses.filter(c => c.related_with === course.course_id);
        relatedCourses.forEach(relCourse => {
            const isChildHidden = isCourseHidden || isRelatedCollapsed;
            addCourseAndSubtree(relCourse, isChildHidden, course.course_id);
        });
    }

    // 2. Loop Phases
    data.phases.forEach((phase, phaseIdx) => {
        const phaseNodeId = `phase-${phase.phase_id}`;
        const isPhaseCollapsed = !expandedPhases.has(phaseNodeId);
        const phaseNode = {
            id: phaseNodeId,
            dbId: phase.phase_id,
            type: 'phase',
            title: phase.title,
            description: phase.description,
            orderIndex: phaseIdx + 1,
            time: phase['Module Time'] || phase.module_time,
            coursesCount: data.courses.filter(c => c.phase_id === phase.phase_id).length,
            parentPhaseId: lastPhaseNodeId,
            rawItem: phase,
            isCollapsed: isPhaseCollapsed,
            isHidden: false
        };
        computedNodes.push(phaseNode);

        lastPhaseNodeId = phaseNode.id;

        // Get courses and documents in this phase (not inside courses)
        const phaseCourses = data.courses.filter(c => c.phase_id === phase.phase_id && !c.related_with);
        const phaseDocs = (data.documents || []).filter(d => d.phase_id === phase.phase_id && !d.course_id);
        
        // Merge and sort them
        const phaseItems = [
            ...phaseCourses.map(c => ({ itemType: 'course', order: c.order_index || 0, data: c })),
            ...phaseDocs.map(d => ({ itemType: 'document', order: d.order_index || 0, data: d }))
        ].sort((a, b) => a.order - b.order);
        
        phaseItems.forEach(item => {
            if (item.itemType === 'course') {
                addCourseAndSubtree(item.data, isPhaseCollapsed);
            } else {
                // Add Phase-level Document Node
                const docNodeId = `doc-${item.data.id}`;
                const docNode = {
                    id: docNodeId,
                    dbId: item.data.id,
                    type: 'document',
                    title: item.data.title,
                    description: item.data.description,
                    docType: item.data.document_type || 'PDF',
                    baseXp: item.data.xp_reward || 10,
                    status: userProgress.completedMats.has(`doc_${item.data.id}`) ? 'completed' : 'current',
                    isHidden: isPhaseCollapsed,
                    rawItem: item.data
                };
                computedNodes.push(docNode);
            }
        });
    });

    // 5. Build the main vertical backbone connecting visible track, phase, course, and document nodes in sequence
    const visibleMainNodes = computedNodes.filter(n => (n.type === 'track' || n.type === 'phase' || (n.type === 'course' && !n.relatedWith) || n.type === 'document') && !n.isHidden);
    for (let i = 0; i < visibleMainNodes.length - 1; i++) {
        computedLinks.push({
            from: visibleMainNodes[i].id,
            to: visibleMainNodes[i+1].id,
            relationType: 'core'
        });
    }
}

/**
 * Calculates (X, Y) coordinates of nodes dynamically to prevent overlaps.
 *
 * Layout strategy:
 *  - All positions are relative to a CANVAS_PADDING offset (top + left margins).
 *  - Each hierarchy level is indented further RIGHT to create a clear visual hierarchy.
 *  - Generous vertical gaps ensure connections are clearly visible.
 *  - Canvas dimensions are set AFTER all nodes are placed (accurate sizing).
 */
function calculateGraphLayout() {
    // 1. Find max depth of related courses to adjust X_CENTER and prevent clipping on the left
    let maxDepth = 0;
    computedNodes.forEach(node => {
        if (node.type === 'course' && !node.isHidden) {
            let depth = 0;
            let temp = node;
            while (temp.parentCourseId) {
                depth++;
                const parent = computedNodes.find(n => n.id === `course-${temp.parentCourseId}`);
                if (!parent) break;
                temp = parent;
            }
            if (depth > maxDepth) maxDepth = depth;
        }
    });

    // Canvas padding on all sides
    const PAD = 250;

    // Dynamic X_CENTER to make space for left-branching related courses
    const X_CENTER = maxDepth > 0 ? (PAD + 960 + (maxDepth - 1) * 990) : (PAD + 250);

    // Card heights
    const H = { track: 96, phase: 72, course: 104, material: 74 };

    // Vertical gaps between nodes
    const GAP = {
        afterTrack:           90,
        beforePhase:          60,
        phaseToFirstCourse:   60,
        betweenCourses:       75,
        betweenMaterials:     40,
        afterPhaseBlock:     100,
    };

    let y = PAD;

    function placeNode(height) {
        const cy = y + height / 2;
        y += height;
        return cy;
    }

    // Recursive layout function for a course block
    function layoutCourse(courseNode, startY, depth) {
        courseNode.x = (depth === 0) ? X_CENTER : (X_CENTER - 330 - (depth - 1) * 990);
        courseNode.y = startY + H.course / 2;
        
        const nextY = startY + H.course;
        let materialsBottom = courseNode.y + H.course / 2;
        
        // 1. Layout materials if not collapsed
        if (!courseNode.isCollapsed) {
            const materials = computedNodes.filter(n => n.courseId === courseNode.dbId && n.type !== 'course' && !n.parentMaterialId && !n.isHidden);
            let matY = courseNode.y;
            materials.forEach((mat, mi) => {
                mat.x = (depth === 0) ? (courseNode.x + 330) : (courseNode.x - 330);
                mat.y = matY;
                
                // Subnodes (quizzes/projects linked to this material)
                const subNodes = computedNodes.filter(n => n.parentMaterialId === mat.dbId && !n.isHidden);
                if (subNodes.length > 0) {
                    let subY = matY;
                    subNodes.forEach((sub, si) => {
                        sub.x = (depth === 0) ? (mat.x + 300) : (mat.x - 300);
                        sub.y = subY;
                        if (si < subNodes.length - 1) {
                            subY += H.material + GAP.betweenMaterials;
                        }
                    });
                    const subNodesBottom = subY + H.material / 2;
                    materialsBottom = Math.max(materialsBottom, subNodesBottom);
                    matY = Math.max(matY + H.material + GAP.betweenMaterials, subY + H.material + GAP.betweenMaterials);
                } else {
                    materialsBottom = Math.max(materialsBottom, matY + H.material / 2);
                    matY += H.material + GAP.betweenMaterials;
                }
            });
        }
        
        // 2. Layout related courses if not collapsed
        let relatedBottom = courseNode.y + H.course / 2;
        if (!courseNode.isRelatedCollapsed) {
            const related = computedNodes.filter(n => n.parentCourseId === courseNode.dbId && n.type === 'course' && !n.isHidden);
            let relY = nextY + GAP.betweenCourses;
            related.forEach((relCourse) => {
                const childBottom = layoutCourse(relCourse, relY, depth + 1);
                relatedBottom = Math.max(relatedBottom, childBottom);
                relY = childBottom + GAP.betweenCourses;
            });
        }
        
        const blockBottom = Math.max(courseNode.y + H.course / 2, materialsBottom, relatedBottom);
        return blockBottom;
    }

    // ── Track ────────────────────────────────────────────────────────────────
    const trackNode = computedNodes.find(n => n.type === 'track');
    if (trackNode) {
        trackNode.x = X_CENTER;
        trackNode.y = placeNode(H.track);
        y += GAP.afterTrack;
    }

    // ── Phases ───────────────────────────────────────────────────────────────
    const phases = computedNodes.filter(n => n.type === 'phase');
    phases.forEach((phase, pi) => {
        if (pi > 0) y += GAP.beforePhase;

        phase.x = X_CENTER;
        phase.y = placeNode(H.phase);

        if (phase.isCollapsed) {
            y += GAP.afterPhaseBlock / 4;
            return;
        }

        const courses = computedNodes.filter(n =>
            n.type === 'course' && n.phaseId === phase.dbId && !n.isHidden && !n.relatedWith);

        if (courses.length === 0) {
            y += GAP.afterPhaseBlock / 2;
            return;
        }

        y += GAP.phaseToFirstCourse;

        courses.forEach((course, ci) => {
            if (ci > 0) y += GAP.betweenCourses;
            const courseBottom = layoutCourse(course, y, 0);
            y = courseBottom;
        });

        y += GAP.afterPhaseBlock;
    });

    // Set canvas dimensions AFTER all nodes are placed
    let maxX = X_CENTER;
    const visibleNodes = computedNodes.filter(n => !n.isHidden);
    visibleNodes.forEach(node => {
        const hw = (node.type === 'track') ? 160 : (node.type === 'phase') ? 150 : (node.type === 'course') ? 130 : 120;
        if (node.x + hw > maxX) maxX = node.x + hw;
    });

    const totalHeight = y + PAD;
    const totalWidth  = maxX + PAD;

    const canvas = document.getElementById('roadmap-canvas');
    if (canvas) {
        canvas.style.height = `${totalHeight}px`;
        canvas.style.width  = `${totalWidth}px`;
    }
}


/**
 * Creates and renders the HTML elements for each node
 */
function renderHtmlNodes() {
    const container = document.getElementById('roadmap-nodes-container');
    if (!container) return;

    container.innerHTML = '';

    computedNodes.forEach((node) => {
        // Hidden nodes: don't render an element at all
        if (node.isHidden) return;

        const nodeEl = document.createElement('div');
        nodeEl.id = `node-${node.id}`;

        let typeClass = `node-${node.type}`;
        let lockedClass = (node.status === 'locked' && currentRole === 'student') ? 'node-locked' : '';
        let collapsedClass = node.isCollapsed ? 'node-collapsed' : '';
        let activeClass = (activeNode && activeNode.id === node.id) ? 'node-active-selection' : '';
        nodeEl.className = `roadmap-node ${typeClass} ${lockedClass} ${collapsedClass} ${activeClass}`.trim();
        nodeEl.style.left = `${node.x}px`;
        nodeEl.style.top = `${node.y}px`;

        // Build card HTML with collapse toggles for course nodes
        let collapseBtn = '';
        if (node.type === 'course') {
            const hasMaterials = currentGraphData && currentGraphData.materials.some(m => m.course_id === node.dbId);
            const hasRelated = currentGraphData && currentGraphData.courses.some(c => c.related_with === node.dbId);
            
            let matBtn = '';
            if (hasMaterials) {
                const icon = node.isCollapsed ? 'fa-list' : 'fa-chevron-right';
                const tip = node.isCollapsed ? 'عرض الدروس والمحتويات' : 'إخفاء الدروس والمحتويات';
                const color = node.isCollapsed ? '#9ca3af' : 'var(--color-course)';
                const bg = node.isCollapsed ? 'rgba(255,255,255,0.07)' : 'rgba(34,196,93,0.15)';
                const border = node.isCollapsed ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(34,196,93,0.3)';
                matBtn = `
                    <button class="roadmap-collapse-btn" data-node-id="${node.id}" title="${tip}" onclick="event.stopPropagation(); window._roadmapToggleCollapse('${node.id}')"
                        style="position:absolute;top:6px;left:6px;width:20px;height:20px;border-radius:50%;
                               background:${bg};border:${border};
                               display:flex;align-items:center;justify-content:center;cursor:pointer;
                               color:${color};font-size:9px;z-index:10;transition:all 0.2s"
                        onmouseover="this.style.background='rgba(34,196,93,0.25)';"
                        onmouseout="this.style.background='${bg}';">
                        <i class="fas ${icon}"></i>
                    </button>`;
            }
            
            let relBtn = '';
            if (hasRelated) {
                const icon = node.isRelatedCollapsed ? 'fa-sitemap' : 'fa-chevron-left';
                const tip = node.isRelatedCollapsed ? 'عرض الكورسات المرتبطة' : 'إخفاء الكورسات المرتبطة';
                const color = node.isRelatedCollapsed ? '#9ca3af' : 'var(--color-track)';
                const bg = node.isRelatedCollapsed ? 'rgba(255,255,255,0.07)' : 'rgba(0,245,255,0.15)';
                const border = node.isRelatedCollapsed ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,245,255,0.3)';
                relBtn = `
                    <button class="roadmap-collapse-related-btn" data-node-id="${node.id}" title="${tip}" onclick="event.stopPropagation(); window._roadmapToggleRelatedCollapse('${node.id}')"
                        style="position:absolute;top:6px;left:30px;width:20px;height:20px;border-radius:50%;
                               background:${bg};border:${border};
                               display:flex;align-items:center;justify-content:center;cursor:pointer;
                               color:${color};font-size:9px;z-index:10;transition:all 0.2s"
                        onmouseover="this.style.background='rgba(0,245,255,0.25)';"
                        onmouseout="this.style.background='${bg}';">
                        <i class="fas ${icon}"></i>
                    </button>`;
            }
            
            collapseBtn = matBtn + relBtn;
        }

        // ── Info button (ⓘ) — top-right of every node ──
        const infoBtn = `
            <button class="rm-info-btn" title="عرض التفاصيل"
                    onclick="event.stopPropagation(); window._rmShowInfo('${node.id}')"
                    style="position:absolute;top:6px;right:6px;width:20px;height:20px;border-radius:50%;
                           background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);
                           display:flex;align-items:center;justify-content:center;cursor:pointer;
                           color:#9ca3af;font-size:9px;z-index:10;transition:all 0.2s"
                    onmouseover="this.style.background='rgba(0,245,255,0.12)';this.style.color='#00f5ff'"
                    onmouseout="this.style.background='rgba(255,255,255,0.06)';this.style.color='#9ca3af'">
                <i class="fas fa-circle-info"></i>
            </button>`;

        nodeEl.innerHTML = collapseBtn + infoBtn + getNodeInnerHtml(node);

        // Click = smart drill-down & camera focus
        // Guard: if the click came from inside a <button> let the button's own handler run.
        nodeEl.addEventListener('click', (e) => {
            if (e.target.closest('button')) return; // button handles itself
            e.stopPropagation();
            handleRoadmapNodeClick(node);
        });

        container.appendChild(nodeEl);
    });

    // Expose global toggle functions with debounce protection
    // NOTE: _lastToggleTime is at module scope so it survives re-renders

    window._roadmapToggleCollapse = function(nodeId) {
        if (Date.now() - _lastToggleTime < 350) return;
        _lastToggleTime = Date.now();
        const targetNode = computedNodes.find(n => n.id === nodeId);
        if (targetNode) {
            handleRoadmapNodeClick(targetNode, false);
        }
    };

    window._roadmapTogglePhaseCollapse = function(phaseId) {
        if (Date.now() - _lastToggleTime < 350) return;
        _lastToggleTime = Date.now();
        const phaseNode = computedNodes.find(n => n.id === phaseId);
        if (phaseNode) {
            handleRoadmapNodeClick(phaseNode, false);
        }
    };

    window._roadmapToggleRelatedCollapse = function(nodeId) {
        if (Date.now() - _lastToggleTime < 350) return;
        _lastToggleTime = Date.now();
        if (expandedRelated.has(nodeId)) {
            expandedRelated.delete(nodeId); // collapse it
        } else {
            expandedRelated.add(nodeId);    // expand it
        }
        buildGraphStructure(currentGraphData);
        calculateGraphLayout();
        renderHtmlNodes();
        renderSvgLines();
        const targetNode = computedNodes.find(n => n.id === nodeId);
        if (targetNode) smartFocusOnNodes([targetNode]);
        requestAnimationFrame(updateMinimap);
    };
}

/**
 * Smart Drill-Down click handler on nodes.
 * Debounced at module level to prevent double-fire from touch+click events.
 */
function handleRoadmapNodeClick(node, openDetails = true) {
    const now = Date.now();
    // 400ms debounce: blocks the synthetic 'click' that browsers fire
    // after touchend (even with touch-action:none) from double-triggering
    if (now - _lastNodeClickTime < 400) return;
    _lastNodeClickTime = now;
    if (node.type === 'phase') {
        const willExpand = !expandedPhases.has(node.id);
        if (willExpand) {
            expandedPhases.add(node.id);
        } else {
            expandedPhases.delete(node.id);
        }

        selectNode(node, false, openDetails);

        buildGraphStructure(currentGraphData);
        calculateGraphLayout();
        renderHtmlNodes();
        renderSvgLines();

        requestAnimationFrame(() => {
            if (willExpand) {
                // Focus camera on Phase + revealed courses
                const family = computedNodes.filter(n => !n.isHidden && (n.id === node.id || n.phaseId === node.dbId));
                smartFocusOnNodes(family);
            } else {
                const refreshed = computedNodes.find(n => n.id === node.id) || node;
                smartFocusOnNodes([refreshed]);
            }
            updateMinimap();
        });
        return;
    }

    if (node.type === 'course') {
        const willExpand = !expandedNodes.has(node.id);

        // Ensure parent phase is open
        if (node.phaseId) {
            expandedPhases.add(`phase-${node.phaseId}`);
        }

        if (willExpand) {
            expandedNodes.add(node.id);
        } else {
            expandedNodes.delete(node.id);
        }

        selectNode(node, false, openDetails);

        buildGraphStructure(currentGraphData);
        calculateGraphLayout();
        renderHtmlNodes();
        renderSvgLines();

        requestAnimationFrame(() => {
            if (willExpand) {
                // Smart Focus: Center camera on Course + all its materials
                const family = computedNodes.filter(n => !n.isHidden && (n.id === node.id || n.courseId === node.dbId));
                smartFocusOnNodes(family);
            } else {
                const refreshed = computedNodes.find(n => n.id === node.id) || node;
                smartFocusOnNodes([refreshed]);
            }
            updateMinimap();
        });
        return;
    }

    // Material or Track: Select and focus camera smoothly
    selectNode(node, false, openDetails);
    const refreshed = computedNodes.find(n => n.id === node.id) || node;
    smartFocusOnNodes([refreshed]);
}

/**
 * Returns HTML contents inside node card based on type
 */
function getNodeInnerHtml(node) {
    const icon = ICONS[node.type] || 'fa-info-circle';
    
    // Status Badge/Icon
    let statusBadge = '';
    if (node.status === 'completed') {
        statusBadge = `<i class="fas fa-check-circle text-green-500 text-sm ml-2"></i>`;
    } else if (node.status === 'current') {
        statusBadge = `<i class="fas fa-play-circle text-yellow-500 text-sm ml-2"></i>`;
    } else if (node.status === 'locked') {
        statusBadge = `<i class="fas fa-lock text-gray-500 text-xs ml-2"></i>`;
    }

    if (node.type === 'track') {
        return `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-[#006A67]/20 flex items-center justify-center border border-[#006A67]/30 text-[#00F5FF] leading-none">
                    <i class="fas ${icon} text-lg leading-none"></i>
                </div>
                <div class="flex-1 min-w-0 text-right">
                    <span class="text-[9px] text-gray-400 font-bold uppercase tracking-widest block mb-0.5">مسار تعليمي</span>
                    <h4 class="font-bold text-white text-sm line-clamp-2 leading-normal pb-1 break-words" dir="auto" title="${node.title}">${node.title}</h4>
                </div>
            </div>
            <div class="mt-3 flex items-center justify-between text-[10px] text-gray-400 border-t border-white/5 pt-2">
                <span>المراحل: ${node.phasesCount}</span>
                <span class="text-[#00F5FF] font-bold">إكمال: ${node.completionRate}%</span>
            </div>
        `;
    }

    if (node.type === 'phase') {
        const isCollapsed = node.isCollapsed;
        const toggleIcon = isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';
        const toggleText = isCollapsed ? `عرض الكورسات (${node.coursesCount})` : 'إخفاء الكورسات';
        const toggleBg = isCollapsed ? 'bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/25' : 'bg-white/10 text-white border-white/20 hover:bg-white/20';

        return `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400 leading-none">
                    <i class="fas ${icon} text-lg leading-none"></i>
                </div>
                <div class="flex-1 min-w-0 text-right">
                    <span class="text-[9px] text-blue-400 font-bold uppercase tracking-widest block mb-0.5">المرحلة ${node.orderIndex}</span>
                    <h4 class="font-bold text-white text-sm line-clamp-2 leading-normal pb-1 break-words" dir="auto" title="${node.title}">${node.title}</h4>
                </div>
            </div>
            <div class="mt-3 flex items-center justify-between text-[10px] text-gray-400 border-t border-white/5 pt-2">
                <span class="text-[10px] text-gray-400 font-semibold">الكورسات: <strong class="text-blue-400 font-bold">${node.coursesCount || 0}</strong></span>
                <button onclick="event.stopPropagation(); window._roadmapTogglePhaseCollapse('${node.id}')"
                        class="phase-collapse-btn inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-bold ${toggleBg} cursor-pointer transition-all hover:scale-105 active:scale-95">
                    <span>${toggleText}</span>
                    <i class="fas ${toggleIcon} text-[8px]"></i>
                </button>
            </div>
        `;
    }

    if (node.type === 'course') {
        // Leader activation indicator check
        let isPlanActive = false;
        if (window.currentTeam && Array.isArray(window.currentTeam.courses_plan)) {
            isPlanActive = window.currentTeam.courses_plan.map(String).includes(String(node.dbId));
        }

        const isCollapsed = node.isCollapsed;
        const totalItems = (node.videosCount || 0) + (node.quizzesCount || 0) + (node.projectsCount || 0);

        let leaderToggleBtn = '';
        if (currentRole === 'leader') {
            leaderToggleBtn = `
                <button onclick="event.stopPropagation(); window.leaderToggleCourseActivation('${node.dbId}', ${!isPlanActive})"
                        title="${isPlanActive ? 'إلغاء تفعيل الكورس للفريق' : 'تفعيل الكورس للفريق'}"
                        class="leader-toggle-btn inline-flex items-center gap-1 text-[9px] px-2 h-5 rounded font-bold transition-all hover:scale-105 active:scale-95 ${isPlanActive ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40' : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-teal-500/20 hover:text-teal-300 hover:border-teal-500/30'}">
                    <i class="fas ${isPlanActive ? 'fa-unlock' : 'fa-lock'} text-[8px]"></i>
                    <span>${isPlanActive ? 'مفعّل' : 'تفعيل'}</span>
                </button>
            `;
        }

        return `
            <div class="flex items-center justify-between gap-2 mb-2">
                <div class="flex items-center gap-1.5">
                    <span class="inline-flex items-center justify-center text-[9px] px-2 h-5 rounded bg-green-500/10 text-green-400 border border-green-500/20 uppercase tracking-widest font-bold leading-none">كورس</span>
                    ${totalItems > 0 ? `
                        <button onclick="event.stopPropagation(); window._roadmapToggleCollapse('${node.id}')"
                                class="course-collapse-btn inline-flex items-center gap-1 text-[8px] px-1.5 h-5 rounded font-bold cursor-pointer transition-all hover:scale-105 active:scale-95 ${isCollapsed ? 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/15' : 'bg-green-500/20 text-green-300 border border-green-500/30'}">
                            <i class="fas ${isCollapsed ? 'fa-folder' : 'fa-folder-open'}"></i>
                            ${isCollapsed ? 'المحتوى' : 'مفتوح'}
                        </button>
                    ` : ''}
                </div>
                <div class="flex items-center gap-1">
                    ${leaderToggleBtn}
                    ${statusBadge}
                </div>
            </div>
            <h4 class="font-bold text-white text-sm line-clamp-2 text-right mb-2.5 leading-normal pb-1 break-words" dir="auto" title="${node.title}">${node.title}</h4>
            <div class="grid grid-cols-3 gap-1.5 text-[9px] text-gray-400 border-t border-white/5 pt-2 text-center">
                <div class="${node.videosCount > 0 ? 'text-gray-300 font-semibold' : 'text-gray-600'}"><i class="fas fa-play text-blue-400 ml-0.5"></i> ${node.videosCount}</div>
                <div class="${node.quizzesCount > 0 ? 'text-gray-300 font-semibold' : 'text-gray-600'}"><i class="fas fa-clipboard-question text-purple-400 ml-0.5"></i> ${node.quizzesCount}</div>
                <div class="${node.projectsCount > 0 ? 'text-gray-300 font-semibold' : 'text-gray-600'}"><i class="fas fa-code-branch text-orange-400 ml-0.5"></i> ${node.projectsCount}</div>
            </div>
        `;
    }

    if (node.type === 'document') {
        const docLabel = 'مستند تعليمي';
        const docColor = 'text-cyan-400';
        const docBg    = 'bg-cyan-500/10';
        const docBorder= 'border-cyan-500/25';

        return `
            <div class="flex items-center gap-2.5">
                <div class="flex-shrink-0 w-9 h-9 rounded-xl ${docBg} flex items-center justify-center border ${docBorder} ${docColor} leading-none">
                    <i class="fas ${icon} text-sm leading-none"></i>
                </div>
                <div class="flex-grow min-w-0">
                    <div class="flex items-center justify-between gap-1 mb-0.5">
                        <span class="text-[8px] font-bold uppercase tracking-wider ${docColor}">${docLabel} (${node.docType || node.rawItem?.document_type || 'PDF'})</span>
                        ${statusBadge}
                    </div>
                    <p class="font-semibold text-white text-xs leading-normal line-clamp-2 text-right pb-1 break-words" dir="auto" title="${node.title}">${node.title}</p>
                    ${node.duration ? `<span class="text-[9px] text-gray-500 mt-0.5 block text-right">${node.duration}</span>` : node.rawItem?.estimated_reading_time ? `<span class="text-[9px] text-gray-500 mt-0.5 block text-right">${node.rawItem.estimated_reading_time} دقيقة</span>` : ''}
                </div>
            </div>
        `;
    }

    // For videos, quizzes, and projects (materials)
    const typeLabel = node.type === 'video' ? 'درس فيديو' : node.type === 'quiz' ? 'اختبار' : 'مشروع عملي';
    const typeColor = node.type === 'video' ? 'text-gray-300' : node.type === 'quiz' ? 'text-purple-400' : 'text-orange-400';
    const typeBg    = node.type === 'video' ? 'bg-gray-500/10' : node.type === 'quiz' ? 'bg-purple-500/10' : 'bg-orange-500/10';
    const typeBorder= node.type === 'video' ? 'border-gray-500/20' : node.type === 'quiz' ? 'border-purple-500/25' : 'border-orange-500/25';

    return `
        <div class="flex items-center gap-2.5">
            <div class="flex-shrink-0 w-9 h-9 rounded-xl ${typeBg} flex items-center justify-center border ${typeBorder} ${typeColor} leading-none">
                <i class="fas ${icon} text-sm leading-none"></i>
            </div>
            <div class="flex-grow min-w-0">
                <div class="flex items-center justify-between gap-1 mb-0.5">
                    <span class="text-[8px] font-bold uppercase tracking-wider ${typeColor}">${typeLabel}</span>
                    ${statusBadge}
                </div>
                <p class="font-semibold text-white text-xs leading-normal line-clamp-2 text-right pb-1 break-words" dir="auto" title="${node.title}">${node.title}</p>
                ${node.duration ? `<span class="text-[9px] text-gray-500 mt-0.5 block text-right">${node.duration}</span>` : ''}
            </div>
        </div>
    `;
}

/**
 * Draws the SVG paths linking the nodes together.
 *
 * IMPORTANT: node.x is the LEFT EDGE of the card (set via style.left in renderHtmlNodes).
 *            node.y is the VERTICAL CENTER of the card.
 *            Card widths: track=320, phase=320, course=260, material=240.
 */
function renderSvgLines() {
    const svg = document.getElementById('roadmap-svg');
    if (!svg) return;
    svg.innerHTML = '';

    // ── Full card widths (px) — must match CSS .node-* width rules ──
    const CW = { track: 320, phase: 320, course: 260, material: 240 };
    // ── Card half-heights (exact math based on height: H/2) ──
    const HH = { track: 48, phase: 36, course: 52, material: 37 };

    // Helper: get horizontal CENTER of a node (node.x is already the center)
    const cx = (node) => node.x;
    // Helper: get right edge of a node
    const rx = (node) => node.x + (CW[node.type] || 260) / 2;
    // Helper: get left edge of a node
    const lx = (node) => node.x - (CW[node.type] || 260) / 2;

    // ── Marker defs ──
    const defsEl = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defsEl.innerHTML = `
        <marker id="rm-arrow" viewBox="0 0 10 10" refX="8" refY="5"
                markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="rgba(0,245,255,0.7)"/>
        </marker>`;
    svg.appendChild(defsEl);

    // ── Helper: append a <path> ──
    function addPath(d, className, useArrow) {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('class', `roadmap-link ${className} roadmap-link-animated`);
        if (useArrow) p.setAttribute('marker-end', 'url(#rm-arrow)');
        svg.appendChild(p);

        // Dynamically set stroke-dasharray and stroke-dashoffset to prevent clipping on long paths
        const isDashedOrBackbone = 
            className.includes('link-dependency') || 
            className.includes('link-recommended') || 
            className.includes('link-optional') || 
            className.includes('link-mat-chain') || 
            className.includes('link-backbone');
            
        if (!isDashedOrBackbone) {
            try {
                const length = Math.ceil(p.getTotalLength());
                if (length > 0) {
                    p.style.strokeDasharray = length;
                    p.style.strokeDashoffset = length;
                }
            } catch (e) {
                console.warn("Could not calculate path length:", e);
            }
        }
        return p;
    }

    // ── Helper: vertical-then-horizontal-then-vertical elbow (for cross-column links) ──
    function elbowVH(fromCx, fromBottomY, toCx, toTopY, className) {
        const midY = fromBottomY + Math.round((toTopY - fromBottomY) * 0.5);
        addPath(`M ${fromCx} ${fromBottomY} V ${midY} H ${toCx} V ${toTopY}`, className, false);
    }

    computedLinks.forEach(link => {
        const fn = computedNodes.find(n => n.id === link.from);
        const tn = computedNodes.find(n => n.id === link.to);
        if (!fn || !tn || fn.isHidden || tn.isHidden) return;

        const fnCx = cx(fn), tnCx = cx(tn);
        const fnHH = HH[fn.type] || 40, tnHH = HH[tn.type] || 40;
        const fnBottom = fn.y + fnHH;   // bottom edge of from-node
        const tnTop    = tn.y - tnHH;   // top    edge of to-node

        // ── Backbone Core Path: Track → Phase → Course → Course → Phase ──
        if (link.relationType === 'core') {
            addPath(`M ${fnCx} ${fnBottom} V ${tnTop}`, 'link-backbone', false);
            return;
        }

        // ── Related Course connection elbow ──
        if (link.relationType === 'related-course') {
            const startX = lx(fn); // left edge of parent
            const endX = rx(tn);   // right edge of child
            const midX = Math.round((startX + endX) / 2);
            addPath(`M ${startX} ${fn.y} H ${midX} V ${tn.y} H ${endX}`, 'link-course-branch', false);
            return;
        }

        // ── Course → First Material (branch elbow backbone + first leaf) ──
        if (link.relationType === 'course-to-first-mat') {
            const isToLeft = tn.x < fn.x;
            const startX = isToLeft ? lx(fn) : rx(fn);
            const branchLineX = isToLeft ? (fn.x - 170) : (fn.x + 170);
            const matEdgeX = isToLeft ? rx(tn) : lx(tn);

            const materials = computedNodes.filter(m => m.courseId === fn.dbId && !m.parentMaterialId && !m.isHidden);
            const lastMatY = materials.length > 0 ? Math.max(...materials.map(m => m.y)) : fn.y;

            // 1. Draw Course branch backbone
            addPath(`M ${startX} ${fn.y} H ${branchLineX} V ${lastMatY}`, 'link-course-branch', false);

            // 2. Draw first leaf connection
            addPath(`M ${branchLineX} ${tn.y} H ${matEdgeX}`, 'link-course-branch', false);
            return;
        }

        // ── Material → Material (subsequent leaves of the branch) ──
        if (link.relationType === 'mat-chain') {
            const parentCourse = computedNodes.find(n => n.dbId === tn.courseId && n.type === 'course');
            const isToLeftFromCourse = parentCourse ? (tn.x < parentCourse.x) : false;
            
            const branchLineX = isToLeftFromCourse ? (tn.x + 160) : (tn.x - 160);
            const matEdgeX = isToLeftFromCourse ? rx(tn) : lx(tn);
            
            addPath(`M ${branchLineX} ${tn.y} H ${matEdgeX}`, 'link-course-branch', false);
            return;
        }

        // ── Material → Subnode (Quiz/Project linked to video) ──
        if (link.relationType === 'material-to-subnode') {
            const isChildToLeft = tn.x < fn.x;
            const startX = isChildToLeft ? lx(fn) : rx(fn);
            const endX = isChildToLeft ? rx(tn) : lx(tn);
            const midX = Math.round((startX + endX) / 2);
            const linkClass = tn.type === 'quiz' ? 'link-recommended' : 'link-optional';
            addPath(`M ${startX} ${fn.y} H ${midX} V ${tn.y} H ${endX}`, linkClass, false);
            return;
        }

        // ── Prerequisite / Dependency — orthogonal cross-column elbow ──
        if (link.relationType === 'prerequisite' || link.relationType === 'dependency') {
            elbowVH(fnCx, fnBottom, tnCx, tnTop, 'link-dependency');
            return;
        }

        // ── Fallback: simple vertical line ──
        addPath(`M ${fnCx} ${fnBottom} V ${tnTop}`, 'link-core', false);
    });
}

// ============================================================
// INFO PANEL GLOBALS
// ============================================================

function initInfoPanelGlobals() {
    window._rmShowInfo = function(nodeId) {
        if (typeof window.selectRoadmapNodeById === 'function') {
            window.selectRoadmapNodeById(nodeId);
        }
    };
}

/** Close the info panel */
function closeInfoPanel() {
    const panel = document.getElementById('roadmap-info-panel');
    if (panel) panel.style.display = 'none';
}

/**
 * Builds the HTML content for the info panel for any node type
 */
function buildInfoPanelHTML(node) {
    const typeLabels = { track: 'مسار', phase: 'مرحلة', course: 'كورس', video: 'فيديو', quiz: 'كويز', project: 'مشروع' };
    const typeColors = {
        track: 'var(--color-track)', phase: 'var(--color-phase)',
        course: 'var(--color-course)', video: 'var(--color-video)',
        quiz: 'var(--color-quiz)', project: 'var(--color-project)'
    };
    const color = typeColors[node.type] || '#9ca3af';
    const label = typeLabels[node.type] || node.type;

    // Helper to create a row
    const row = (key, val, mono = false) => `
        <div class="rm-panel-row">
            <span class="rm-panel-key">${key}</span>
            <span class="rm-panel-val${mono ? ' font-mono text-[10px]' : ''}">${val ?? '—'}</span>
        </div>`;

    // ── Type badge ──
    let html = `
        <div class="rm-panel-type-badge" style="border-color:${color};color:${color};">
            <i class="fas ${ICONS[node.type] || 'fa-info-circle'}"></i> ${label}
        </div>`;

    // ── Basic Info ──
    html += `<div class="rm-panel-section-title">البيانات الأساسية</div>`;
    html += row('المعرّف (ID)', node.dbId, true);
    html += row('النوع', label);
    html += row('الترتيب', node.orderIndex ?? '—');
    html += row('الحالة', node.status ?? '—');

    // ── Type-specific ──
    html += `<div class="rm-panel-section-title">بيانات خاصة بالنوع</div>`;

    if (node.type === 'track') {
        html += row('عدد المراحل', node.phasesCount);
        html += row('نسبة الإكمال', node.completionRate ? `${Math.round(node.completionRate)}%` : '—');
        html += row('الوصف', node.description || '—');
    }

    if (node.type === 'phase') {
        const pCourses = computedNodes.filter(n => n.type === 'course' && n.phaseId === node.dbId);
        const pVids = pCourses.reduce((s, c) => s + (c.videosCount || 0), 0);
        const pQz  = pCourses.reduce((s, c) => s + (c.quizzesCount || 0), 0);
        const pPr  = pCourses.reduce((s, c) => s + (c.projectsCount || 0), 0);
        html += row('عدد الكورسات', pCourses.length);
        html += row('المدة الكلية', node.time || '—');
        html += row('عدد الفيديوهات', pVids);
        html += row('عدد الكويزات', pQz);
        html += row('عدد المشاريع', pPr);
        html += row('الوصف', node.description || '—');
    }

    if (node.type === 'course') {
        html += row('الوصف', node.description || '—');
        html += row('المحاضر', node.instructor);
        html += row('المدة', node.duration);
        html += row('المستوى', node.difficulty);
        html += row('عدد الفيديوهات', node.videosCount);
        html += row('عدد الكويزات', node.quizzesCount);
        html += row('عدد المشاريع', node.projectsCount);
        if (node.rawItem?.playlist_url) {
            html += `<div class="rm-panel-row">
                <span class="rm-panel-key">قائمة التشغيل</span>
                <a href="${node.rawItem.playlist_url}" target="_blank" class="rm-panel-val text-cyan-400 hover:underline truncate">رابط ↗</a>
            </div>`;
        }
        if (node.rawItem?.thumbnail_url) {
            html += `<div class="mt-2 rounded-lg overflow-hidden border border-white/10">
                <img src="${node.rawItem.thumbnail_url}" class="w-full h-24 object-cover" onerror="this.onerror=null; this.style.display='none'">
            </div>`;
        }
    }

    if (node.type === 'video') {
        const raw = node.rawItem || {};
        const ytId = extractYouTubeId(raw.video_id);
        const vidUrl = raw.url || (ytId ? `https://www.youtube.com/watch?v=${ytId}` : '');
        html += row('الرابط', vidUrl ? `<a href="${vidUrl}" target="_blank" class="text-cyan-400 hover:underline">رابط ↗</a>` : '—');
        html += row('المدة', node.duration);
        html += row('المؤلف', node.author);
        html += row('الترتيب', raw.order_index ?? '—');
    }

    if (node.type === 'quiz') {
        const raw = node.rawItem || {};
        html += row('عدد الأسئلة', raw.questions_count ?? '—');
        html += row('الدرجة', raw.total_score ?? '—');
        html += row('درجة النجاح', raw.passing_score ?? '—');
        html += row('وقت الحل', raw.time_limit ? `${raw.time_limit} د` : '—');
    }

    if (node.type === 'project') {
        const raw = node.rawItem || {};
        html += row('الوصف', node.description || '—');
        html += row('الدرجة', raw.total_score ?? '—');
        html += row('الملفات المطلوبة', raw.required_files || '—');
    }

    // ── Relationships tree ──
    html += `<div class="rm-panel-section-title">العلاقات</div>`;
    const trackNode  = computedNodes.find(n => n.type === 'track');
    const buildLink  = (n, indent = 0) =>
        `<div class="flex items-center gap-1 py-0.5 cursor-pointer hover:text-cyan-300 transition-all text-xs text-gray-300"
              style="padding-right:${indent * 12}px" data-jump-node="${n.id}">
            ${'└──'.padStart(indent > 0 ? 3 : 0)} <i class="fas ${ICONS[n.type] || 'fa-circle'} text-[9px]" style="color:${typeColors[n.type]||'#9ca3af'}"></i>
            <span class="truncate">${n.title}</span>
         </div>`;

    if (trackNode) html += buildLink(trackNode, 0);

    if (node.type === 'phase' || node.type === 'track') {
        const phases = computedNodes.filter(n => n.type === 'phase');
        phases.forEach(p => {
            html += buildLink(p, 1);
            if (node.id === p.id || node.type === 'track') {
                computedNodes.filter(c => c.type === 'course' && c.phaseId === p.dbId).forEach(c => {
                    html += buildLink(c, 2);
                });
            }
        });
    } else if (node.type === 'course') {
        const phase = computedNodes.find(p => p.type === 'phase' && p.dbId === node.phaseId);
        if (phase) html += buildLink(phase, 1);
        html += buildLink(node, 2);
        computedNodes.filter(m => m.courseId === node.dbId).forEach(m => html += buildLink(m, 3));
    } else {
        // material
        const course = computedNodes.find(c => c.type === 'course' && c.dbId === node.courseId);
        const phase  = course ? computedNodes.find(p => p.type === 'phase' && p.dbId === course?.phaseId) : null;
        if (phase)  html += buildLink(phase, 1);
        if (course) html += buildLink(course, 2);
        html += buildLink(node, 3);
    }

    // ── Raw DB fields ──
    if (node.rawItem && Object.keys(node.rawItem).length > 0) {
        html += `<div class="rm-panel-section-title">قاعدة البيانات (Raw)</div>`;
        Object.entries(node.rawItem).forEach(([k, v]) => {
            if (v === null || v === undefined) return;
            const display = typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v).slice(0, 120);
            html += row(k, display, true);
        });
    }

    return html;
}

// ============================================================
// EXPORT  (SVG  +  PNG via html2canvas)
// ============================================================

function initExportGlobals() {
    window._rmExport = async function(type) {
        const btn = document.getElementById('rm-export-btn');
        const menu = document.getElementById('rm-export-menu');
        if (!btn) return;

        // Close dropdown & show loading
        menu?.classList.add('hidden');
        const origHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin text-[10px]"></i> جاري التصدير...';
        btn.disabled = true;

        try {
            if (type === 'svg') {
                await exportAsSvg();
            } else {
                let scale = 1;
                if (type === 'png8') scale = 8;
                else if (type === 'png4') scale = 4;
                else if (type === 'png2') scale = 2;
                await exportAsPng(scale);
            }
        } catch (err) {
            console.error('Export error:', err);
            alert('حدث خطأ أثناء التصدير: ' + err.message);
        } finally {
            btn.innerHTML = origHTML;
            btn.disabled = false;
        }
    };
}

/** Calculate the exact bounding box of the visible roadmap tree nodes from real DOM measurements */
function getRoadmapBounds(padding = 80) {
    const nodes = document.querySelectorAll('#roadmap-nodes-container .roadmap-node');
    if (!nodes || nodes.length === 0) {
        return { x: 0, y: 0, w: 3000, h: 3000 };
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let foundVisible = false;

    nodes.forEach(el => {
        if (el.style.display === 'none') return;

        const left = parseFloat(el.style.left) || 0;
        const top  = parseFloat(el.style.top)  || 0;
        const w = el.offsetWidth  || 260;
        const h = el.offsetHeight || 90;

        foundVisible = true;
        const nodeMinX = left - w / 2;
        const nodeMaxX = left + w / 2;
        const nodeMinY = top  - h / 2;
        const nodeMaxY = top  + h / 2;

        if (nodeMinX < minX) minX = nodeMinX;
        if (nodeMaxX > maxX) maxX = nodeMaxX;
        if (nodeMinY < minY) minY = nodeMinY;
        if (nodeMaxY > maxY) maxY = nodeMaxY;
    });

    if (!foundVisible || minX === Infinity) {
        return { x: 0, y: 0, w: 3000, h: 3000 };
    }

    const x = Math.max(0, Math.floor(minX - padding));
    const y = Math.max(0, Math.floor(minY - padding));
    const w = Math.ceil((maxX - minX) + padding * 2);
    const h = Math.ceil((maxY - minY) + padding * 2);

    return { x, y, w, h };
}

/** Centers the graph viewport on the bounds of the tree without altering zoom */
function centerGraphBounds() {
    const viewport = document.getElementById('roadmap-viewport');
    if (!viewport || computedNodes.length === 0) return;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;

    const bounds = getRoadmapBounds(0);
    const graphCenterX = bounds.x + bounds.w / 2;
    const graphCenterY = bounds.y + bounds.h / 2;

    offsetX = vw / 2 - graphCenterX * zoomLevel;
    offsetY = vh / 2 - graphCenterY * zoomLevel;

    updateCanvasTransform();
}

/** Export the current canvas as an inline SVG file, cropped to tree bounds */
async function exportAsSvg() {
    const canvas   = document.getElementById('roadmap-canvas');
    const svgLayer = document.getElementById('roadmap-svg');
    const nodesContainer = document.getElementById('roadmap-nodes-container');
    if (!canvas || !svgLayer || !nodesContainer) return;

    // Temporarily hide interactive buttons to measure exact bounds
    const buttonsToHide = canvas.querySelectorAll(
        '.roadmap-collapse-btn, .roadmap-collapse-related-btn, .rm-info-btn, .phase-collapse-btn, .course-collapse-btn, .leader-toggle-btn'
    );
    buttonsToHide.forEach(btn => btn.style.setProperty('display', 'none', 'important'));

    const bounds = getRoadmapBounds(80);

    // Build a root SVG
    const ns   = 'http://www.w3.org/2000/svg';
    const root = document.createElementNS(ns, 'svg');
    root.setAttribute('xmlns', ns);
    root.setAttribute('xmlns:xhtml', 'http://www.w3.org/1999/xhtml');
    root.setAttribute('width',   bounds.w);
    root.setAttribute('height',  bounds.h);
    root.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);
    root.setAttribute('class', 'roadmap-viewport');

    // Embed all document stylesheets for styling foreignObjects and paths
    const styleEl = document.createElementNS(ns, 'style');
    let cssText = `@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap');\n`;
    try {
        for (const sheet of document.styleSheets) {
            try {
                const href = sheet.href;
                if (!href || href.includes('roadmap.css') || href.includes('tailwind') || href.includes('css') || href.includes('style')) {
                    for (const rule of sheet.cssRules) {
                        cssText += rule.cssText + '\n';
                    }
                }
            } catch (e) {
                // Ignore cross-origin stylesheet errors
            }
        }
    } catch (e) {
        console.warn("Could not read stylesheets:", e);
    }

    cssText += `
        .roadmap-node { padding: 18px 18px !important; height: auto !important; }
        .roadmap-node h4, .roadmap-node p { overflow: visible !important; -webkit-line-clamp: unset !important; line-height: 1.55 !important; padding-bottom: 4px !important; }
        .roadmap-collapse-btn, .roadmap-collapse-related-btn, .rm-info-btn, .phase-collapse-btn, .course-collapse-btn, .leader-toggle-btn { display: none !important; }
    `;
    styleEl.textContent = `/* <![CDATA[ */\n${cssText}\n/* ]]> */`;
    root.appendChild(styleEl);

    // Dark background
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('x', bounds.x);
    bg.setAttribute('y', bounds.y);
    bg.setAttribute('width', bounds.w);
    bg.setAttribute('height', bounds.h);
    bg.setAttribute('fill', '#050505');
    root.appendChild(bg);

    // Copy SVG markers and paths (connection lines) directly to root to avoid nested SVG styling issues
    Array.from(svgLayer.childNodes).forEach(child => {
        const clone = child.cloneNode(true);
        root.appendChild(clone);
    });

    // Embed each HTML node as foreignObject
    nodesContainer.querySelectorAll('.roadmap-node').forEach(el => {
        if (el.style.display === 'none') return;
        const left   = parseFloat(el.style.left) || 0;
        const top    = parseFloat(el.style.top)  || 0;
        const w = el.offsetWidth  || 260;
        const h = el.offsetHeight || 90;

        const fo = document.createElementNS(ns, 'foreignObject');
        fo.setAttribute('x', left - w / 2);
        fo.setAttribute('y', top  - h / 2);
        fo.setAttribute('width',  w);
        fo.setAttribute('height', h);

        const body = document.createElement('div');
        body.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        body.style.cssText = el.style.cssText;
        body.className = el.className;
        body.style.setProperty('position', 'relative', 'important');
        body.style.setProperty('width', w + 'px', 'important');
        body.style.setProperty('height', 'auto', 'important');
        body.style.setProperty('left', '0', 'important');
        body.style.setProperty('top', '0', 'important');
        body.style.setProperty('transform', 'none', 'important');
        body.style.setProperty('padding', '18px 18px', 'important');
        body.innerHTML = el.innerHTML;

        // Hide collapse/info/action buttons in the exported SVG to make it clean
        body.querySelectorAll('.roadmap-collapse-btn, .roadmap-collapse-related-btn, .rm-info-btn, .phase-collapse-btn, .course-collapse-btn, .leader-toggle-btn').forEach(btn => {
            btn.style.display = 'none';
        });

        fo.appendChild(body);
        root.appendChild(fo);
    });

    // Restore live DOM buttons
    buttonsToHide.forEach(btn => btn.style.removeProperty('display'));

    // Serialize
    const serializer = new XMLSerializer();
    const svgStr = '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(root);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    _rmDownload(blob, 'roadmap-busla.svg');
}

/** Export as PNG using html2canvas, cropped to tree bounds */
async function exportAsPng(scale = 1) {
    if (!window.html2canvas) {
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('فشل تحميل مكتبة html2canvas'));
            document.head.appendChild(s);
        });
    }

    // Wait for web fonts (Cairo, FontAwesome, etc.) to fully render
    if (document.fonts) {
        try {
            await document.fonts.ready;
        } catch (e) {
            console.warn('Fonts ready check:', e);
        }
    }

    const canvas = document.getElementById('roadmap-canvas');
    if (!canvas) throw new Error('لم يتم العثور على الكانفاس');

    // Suppress noisy browser extension errors during html2canvas temporary iframe creation (e.g. video speed extensions)
    const extErrorHandler = (e) => {
        if (e.reason?.message?.includes?.('rate') || 
            (typeof e.reason?.stack === 'string' && e.reason.stack.includes('contentScript'))) {
            e.preventDefault();
        }
    };
    window.addEventListener('unhandledrejection', extErrorHandler);

    // 1. Temporarily reset transform to avoid html2canvas offset issues
    const origTransform = canvas.style.transform;
    canvas.style.transform = 'none';

    // 2. Hide collapse/info/action buttons during export for a cleaner image
    const buttonsToHide = canvas.querySelectorAll(
        '.roadmap-collapse-btn, .roadmap-collapse-related-btn, .rm-info-btn, .phase-collapse-btn, .course-collapse-btn, .leader-toggle-btn'
    );
    buttonsToHide.forEach(btn => btn.style.setProperty('display', 'none', 'important'));

    // Force style recalculation/repaint so real heights are measurable
    canvas.offsetHeight; 

    // Calculate accurate bounds based on actual rendered card dimensions
    const bounds = getRoadmapBounds(80);

    try {
        const h2c = await window.html2canvas(canvas, {
            scale: Math.min(scale, 4),
            backgroundColor: '#050505',
            useCORS: true,
            allowTaint: true,
            logging: false,
            x: bounds.x,
            y: bounds.y,
            width: bounds.w,
            height: bounds.h,
            windowWidth: Math.max(3200, bounds.x + bounds.w + 200),
            windowHeight: Math.max(3200, bounds.y + bounds.h + 200),
            onclone: (clonedDoc, clonedCanvas) => {
                // Inject custom export stylesheet into the cloned document to guarantee zero text-clipping
                const style = clonedDoc.createElement('style');
                style.textContent = `
                    /* 1. Prevent text clipping by removing line-clamp and overflow restrictions */
                    .roadmap-node,
                    .roadmap-node * {
                        overflow: visible !important;
                        text-overflow: clip !important;
                        -webkit-line-clamp: unset !important;
                        line-clamp: unset !important;
                        max-height: none !important;
                    }

                    /* 2. Proper line-height and bottom padding so letter descenders are never sliced */
                    .roadmap-node h4 {
                        display: block !important;
                        line-height: 1.55 !important;
                        padding-bottom: 6px !important;
                        margin-bottom: 4px !important;
                        white-space: normal !important;
                    }
                    .roadmap-node p {
                        display: block !important;
                        line-height: 1.5 !important;
                        padding-bottom: 4px !important;
                        white-space: normal !important;
                    }

                    /* 3. Balanced, proportional card padding without the gap for hidden top buttons */
                    .roadmap-node {
                        padding: 16px 18px !important;
                        height: auto !important;
                        box-sizing: border-box !important;
                    }
                    .node-track {
                        padding: 20px 22px !important;
                    }
                    .node-phase {
                        padding: 18px 20px !important;
                    }
                    .node-course {
                        padding: 16px 18px !important;
                    }
                    .node-video, .node-quiz, .node-document, .node-project {
                        padding: 12px 14px !important;
                    }

                    /* 4. Hide all interactive controls */
                    .roadmap-collapse-btn,
                    .roadmap-collapse-related-btn,
                    .rm-info-btn,
                    .phase-collapse-btn,
                    .course-collapse-btn,
                    .leader-toggle-btn,
                    .roadmap-controls,
                    .roadmap-minimap,
                    .roadmap-toolbar {
                        display: none !important;
                    }
                `;
                clonedDoc.head.appendChild(style);

                if (clonedCanvas) {
                    clonedCanvas.style.transform = 'none';
                    clonedCanvas.style.overflow = 'visible';
                }
                const clonedViewport = clonedDoc.getElementById('roadmap-viewport');
                if (clonedViewport) {
                    clonedViewport.style.overflow = 'visible';
                }
            }
        });

        const blob = await new Promise(res => h2c.toBlob(res, 'image/png'));
        _rmDownload(blob, `roadmap-busla-${scale}x.png`);
    } finally {
        // 3. Restore original transform and button display properties
        canvas.style.transform = origTransform;
        buttonsToHide.forEach(btn => btn.style.removeProperty('display'));
        window.removeEventListener('unhandledrejection', extErrorHandler);
    }
}

/** Trigger a file download */
function _rmDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    requestAnimationFrame(() => { document.body.removeChild(a); URL.revokeObjectURL(url); });
}

// ============================================================
// ── Standard select node action & Unified Details Panel ──
// ============================================================

function selectNode(node, autoPan = true, openDetails = true) {
    if (node && node.id) {
        localStorage.setItem('busla_roadmap_active_node_id', node.id);
    }
    // Remove previous selection states
    document.querySelectorAll('.roadmap-node').forEach(el => el.classList.remove('node-active-selection'));
    document.querySelectorAll('.roadmap-link').forEach(el => el.classList.remove('highlighted-link'));

    activeNode = node;

    // Highlight clicked card
    const nodeEl = document.getElementById(`node-${node.id}`);
    if (nodeEl) nodeEl.classList.add('node-active-selection');

    // Highlight relationships/links attached to this node
    highlightRelationships(node.id);

    // Update details side panel
    renderNodeDetailsPanel(node, openDetails);

    // Pan camera smoothly to center this node if requested
    if (autoPan) {
        panToNode(node);
    }
}

/**
 * Highlights links directly entering or exiting this node
 */
function highlightRelationships(nodeId) {
    computedLinks.forEach(link => {
        if (link.from === nodeId || link.to === nodeId) {
            const linkEl = document.getElementById(`link-${link.from}-${link.to}`);
            if (linkEl) linkEl.classList.add('highlighted-link');
        }
    });
}

/**
 * Renders the unified details panel content inside '#node-details-container'
 * @param {Object|null} node - The selected node, or null to show placeholder
 * @param {boolean} forceOpenSheet - Whether to open bottom sheet drawer on mobile
 */
export function renderNodeDetailsPanel(node, forceOpenSheet = true) {
    const container = document.getElementById('node-details-container');
    if (!container) return;

    if (!node) {
        container.innerHTML = `
            <div id="node-details-placeholder" class="text-center text-gray-500 my-auto py-20 flex flex-col items-center justify-center">
                <i class="fas fa-mouse-pointer text-4xl mb-4 text-gray-700 animate-bounce"></i>
                <p class="font-bold text-gray-400">حدد عنصراً من الشجرة لعرض التفاصيل.</p>
                <p class="text-xs text-gray-500 mt-2">اضغط على أي مسار أو مرحلة أو كورس أو درس لاستكشاف تفاصيله وعلاقاته.</p>
            </div>
        `;
        container.classList.remove('sheet-open');
        container.style.transform = '';
        container.style.transition = '';
        return;
    }

    // Add sheet-open class on mobile to slide drawer up when requested
    if (forceOpenSheet || window.innerWidth > 767) {
        container.classList.add('sheet-open');
    }

    // Panel close button & header
    let headerHtml = `
        <div class="sticky top-0 bg-[#0e0f12] z-20 pb-2 mb-3 border-b border-white/5 -mt-1 pt-1">
            <div class="sheet-drag-handle-zone md:hidden w-full flex justify-center items-center py-1.5 cursor-grab active:cursor-grabbing select-none" style="touch-action: none;">
                <div class="w-12 h-1.5 bg-white/30 rounded-full hover:bg-white/50 transition-colors"></div>
            </div>
            <div class="flex items-center justify-between pt-1">
                <h3 class="text-sm font-bold text-white flex items-center gap-2">
                    <span class="w-1.5 h-4 bg-teal-500 rounded-full"></span>
                    تفاصيل العنصر
                </h3>
                <button onclick="window.closeRoadmapDetailsPanel()"
                        class="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-red-400 transition-all">
                    <i class="fas fa-times text-xs"></i>
                </button>
            </div>
        </div>
    `;

    // Type Badge details
    const typeColors = {
        track: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
        phase: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        course: 'bg-green-500/10 text-green-400 border-green-500/20',
        video: 'bg-gray-500/10 text-gray-300 border-gray-500/20',
        quiz: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        project: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
        document: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
    };
    const typeNames = {
        track: 'مسار تعليمي',
        phase: 'مرحلة تعليمية',
        course: 'كورس تعليمي',
        video: 'درس فيديو',
        quiz: 'اختبار تقييمي',
        project: 'مشروع عملي',
        document: 'مستند / PDF'
    };
    const colorClass = typeColors[node.type] || 'bg-gray-500/10 text-gray-400';
    const typeName = typeNames[node.type] || node.type;

    let badgeHtml = `
        <span class="inline-flex items-center justify-center text-[10px] px-2.5 py-1 rounded-lg border font-bold uppercase tracking-wider ${colorClass} mb-4">
            ${typeName}
        </span>
    `;

    // Content body depending on type
    let bodyHtml = '';
    let actionButtonsHtml = '';

    if (node.type === 'track') {
        const track = node.rawItem || {};
        const phasesCount = currentGraphData ? currentGraphData.phases.length : 0;
        const coursesCount = currentGraphData ? currentGraphData.courses.length : 0;
        const videosCount = currentGraphData ? currentGraphData.materials.filter(m => m.type === 'video').length : 0;
        const quizzesCount = currentGraphData ? currentGraphData.quizzes.length : 0;
        const projectsCount = currentGraphData ? currentGraphData.projects.length : 0;
        const totalSec = currentGraphData ? currentGraphData.materials.reduce((sum, m) => sum + (m.duration || 0), 0) : 0;
        const totalHours = totalSec > 0 ? formatDuration(totalSec) : 'مرنة';
        const completionRate = node.completionRate || 0;

        bodyHtml = `
            <h2 class="text-2xl font-black text-white leading-tight font-heading mb-4 text-right">${node.title}</h2>
            <p class="text-sm text-gray-300 leading-relaxed text-right mb-6">${node.description || 'لا يوجد وصف مضاف حالياً لهذا المسار.'}</p>
            
            <div class="grid grid-cols-2 gap-2 text-xs mb-6">
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center text-sm"><i class="fas fa-layer-group"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">المراحل</span>
                        <span class="text-white font-bold block">${phasesCount} مراحل</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-green-500/15 text-green-400 flex items-center justify-center text-sm"><i class="fas fa-book-open"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">الكورسات</span>
                        <span class="text-white font-bold block">${coursesCount} كورسات</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center text-sm"><i class="fas fa-play"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">الفيديوهات</span>
                        <span class="text-white font-bold block">${videosCount} فيديوهات</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center text-sm"><i class="fas fa-clipboard-question"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">الكويزات</span>
                        <span class="text-white font-bold block">${quizzesCount} كويزات</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center text-sm"><i class="fas fa-code-branch"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">المشاريع</span>
                        <span class="text-white font-bold block">${projectsCount} مشاريع</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-teal-500/15 text-teal-400 flex items-center justify-center text-sm"><i class="far fa-clock"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">ساعات التعلم</span>
                        <span class="text-white font-bold block">${totalHours}</span>
                    </div>
                </div>
            </div>

            <div class="bg-white/5 border border-white/10 p-4 rounded-xl mb-6 text-right">
                <span class="text-[10px] text-gray-500 block mb-1">نسبة الإكمال للمسار</span>
                <div class="flex items-center gap-3">
                    <span class="text-cyan-400 font-bold font-mono text-sm">${completionRate}%</span>
                    <div class="flex-1 bg-black/50 h-2 rounded-full overflow-hidden">
                        <div class="bg-cyan-400 h-full" style="width: ${completionRate}%"></div>
                    </div>
                </div>
            </div>

            <div class="border-t border-white/5 pt-4 text-right mb-6">
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2 justify-end">
                    <i class="fas fa-graduation-cap text-cyan-400 text-xs"></i> المهارات المكتسبة
                </h4>
                <p class="text-xs text-gray-400 leading-relaxed">${track.what_you_will_learn || 'اكتساب المهارات الأساسية للـ Digital IC Design.'}</p>
            </div>

            <div class="border-t border-white/5 pt-4 text-right">
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2 justify-end">
                    <i class="fas fa-info-circle text-gray-400 text-xs"></i> المتطلبات السابقة للمسار
                </h4>
                <p class="text-xs text-gray-400 leading-relaxed">${track.prerequisites || 'لا توجد متطلبات سابقة للمسار.'}</p>
            </div>
        `;
    } 
    else if (node.type === 'phase') {
        const phase = node.rawItem || {};
        const coursesCount = currentGraphData ? currentGraphData.courses.filter(c => c.phase_id === node.dbId).length : 0;
        
        // Calculate phase completion rate
        let completionRate = 0;
        if (currentGraphData) {
            const phaseCourses = currentGraphData.courses.filter(c => c.phase_id === node.dbId);
            const phaseCourseIds = phaseCourses.map(c => c.course_id);
            const phaseMats = currentGraphData.materials.filter(m => phaseCourseIds.includes(m.course_id));
            const completedPhaseMats = phaseMats.filter(m => userProgress.completedMats.has(m.content_id));
            completionRate = phaseMats.length ? Math.round((completedPhaseMats.length / phaseMats.length) * 100) : 0;
        }

        bodyHtml = `
            <h2 class="text-2xl font-black text-white leading-tight font-heading mb-4 text-right">${node.title}</h2>
            <p class="text-sm text-gray-300 leading-relaxed text-right mb-6">${node.description || 'لا يوجد وصف مضاف حالياً لهذه المرحلة.'}</p>
            
            <div class="grid grid-cols-2 gap-2 text-xs mb-6">
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center text-sm"><i class="fas fa-sort-numeric-up"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">ترتيب المرحلة</span>
                        <span class="text-white font-bold block">المرحلة ${node.orderIndex || phase.order_index || '--'}</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-green-500/15 text-green-400 flex items-center justify-center text-sm"><i class="fas fa-book-open"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">عدد الكورسات</span>
                        <span class="text-white font-bold block">${coursesCount} كورسات</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2 col-span-2">
                    <div class="w-8 h-8 rounded-lg bg-teal-500/15 text-teal-400 flex items-center justify-center text-sm"><i class="far fa-clock"></i></div>
                    <div class="min-w-0 text-right flex-1">
                        <span class="text-[9px] text-gray-500 block">المدة المتوقعة للمرحلة</span>
                        <span class="text-white font-bold block">${node.time || phase['Module Time'] || 'مرنة'}</span>
                    </div>
                </div>
            </div>

            <div class="bg-white/5 border border-white/10 p-4 rounded-xl mb-6 text-right">
                <span class="text-[10px] text-gray-500 block mb-1">نسبة إكمال المرحلة</span>
                <div class="flex items-center gap-3">
                    <span class="text-blue-400 font-bold font-mono text-sm">${completionRate}%</span>
                    <div class="flex-1 bg-black/50 h-2 rounded-full overflow-hidden">
                        <div class="bg-blue-400 h-full" style="width: ${completionRate}%"></div>
                    </div>
                </div>
            </div>

            <div class="border-t border-white/5 pt-4 text-right mb-6">
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2 justify-end">
                    <i class="fas fa-bullseye text-blue-400 text-xs"></i> المهارات المستهدفة
                </h4>
                <p class="text-xs text-gray-400 leading-relaxed">${phase.what_you_will_learn || 'تطوير وتعميق المهارات الهندسية الأساسية.'}</p>
            </div>
        `;
    }
    else if (node.type === 'course') {
        const course = node.rawItem || {};
        const trackName = currentGraphData?.track?.name || 'مسار بوصلة';
        const phase = currentGraphData?.phases?.find(p => p.phase_id === node.phaseId) || {};
        const phaseTitle = phase.title || 'مرحلة غير محددة';
        
        // Calculate course completion
        let completionRate = 0;
        let completedVideos = 0, totalVideos = 0;
        let completedQuizzes = 0, totalQuizzes = 0;
        let completedProjects = 0, totalProjects = 0;
        
        if (currentGraphData) {
            const courseMats = currentGraphData.materials.filter(m => m.course_id === node.dbId);
            
            totalVideos = courseMats.filter(m => m.type === 'video').length;
            completedVideos = courseMats.filter(m => m.type === 'video' && userProgress.completedMats.has(m.content_id)).length;
            
            totalQuizzes = courseMats.filter(m => m.type === 'quiz').length;
            completedQuizzes = courseMats.filter(m => m.type === 'quiz' && userProgress.completedMats.has(m.content_id)).length;
            
            totalProjects = courseMats.filter(m => m.type === 'project').length;
            completedProjects = courseMats.filter(m => m.type === 'project' && userProgress.completedMats.has(m.content_id)).length;
            
            const totalMats = courseMats.length;
            const completedMats = courseMats.filter(m => userProgress.completedMats.has(m.content_id)).length;
            completionRate = totalMats ? Math.round((completedMats / totalMats) * 100) : 0;
        }

        // Prerequisites and next courses HTML
        let prereqsHtml = '';
        const prereqIds = node.prerequisites || [];
        if (prereqIds.length > 0) {
            prereqsHtml = prereqIds.map(prereq => {
                const targetId = typeof prereq === 'string' ? prereq : prereq.course_id;
                const matched = computedNodes.find(n => n.dbId === targetId && n.type === 'course');
                return `<button onclick="window.selectRoadmapNodeById('${matched ? matched.id : 'course-' + targetId}')" class="bg-teal-500/10 border border-teal-500/25 text-teal-400 font-bold px-3 py-1.5 rounded-lg text-[10px] hover:bg-teal-500 hover:text-white transition-all text-right">
                    <i class="fas fa-link ml-1"></i> ${matched ? matched.title : targetId}
                </button>`;
            }).join('');
        } else {
            prereqsHtml = '<span class="text-xs text-gray-500">لا يوجد متطلبات سابقة</span>';
        }

        let nextHtml = '';
        if (currentGraphData) {
            const nextCourses = currentGraphData.courses.filter(c => {
                if (!c.prerequisites) return false;
                let prqs = [];
                try {
                    if (typeof c.prerequisites === 'string') {
                        prqs = c.prerequisites.split(',').map(s => s.trim());
                    } else if (Array.isArray(c.prerequisites)) {
                        prqs = c.prerequisites.map(p => typeof p === 'string' ? p : p.course_id);
                    }
                } catch (e) {}
                return prqs.includes(String(node.dbId));
            });
            
            if (nextCourses.length > 0) {
                nextHtml = nextCourses.map(c => {
                    const matched = computedNodes.find(n => n.dbId === c.course_id && n.type === 'course');
                    return `<button onclick="window.selectRoadmapNodeById('${matched ? matched.id : 'course-' + c.course_id}')" class="bg-blue-500/10 border border-blue-500/25 text-blue-400 font-bold px-3 py-1.5 rounded-lg text-[10px] hover:bg-blue-500 hover:text-white transition-all text-right">
                        <i class="fas fa-link ml-1"></i> ${c.title}
                    </button>`;
                }).join('');
            } else {
                nextHtml = '<span class="text-xs text-gray-500">لا توجد كورسات تالية</span>';
            }
        }

        // Contents Lists HTML
        let contentListsHtml = '';
        if (currentGraphData) {
            const courseMats = currentGraphData.materials.filter(m => m.course_id === node.dbId);
            
            if (courseMats.length > 0) {
                contentListsHtml = `
                    <div class="border-t border-white/5 pt-4 text-right mb-6">
                        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2 justify-end">
                            <i class="fas fa-list-ol text-green-400 text-xs"></i> قائمة المحتوى التفاعلية
                        </h4>
                        <div class="space-y-2 max-h-[300px] overflow-y-auto custom-scroll pr-1">
                            ${courseMats.map((m, idx) => {
                                const isCompleted = userProgress.completedMats.has(m.content_id);
                                const matIcon = m.type === 'video' ? 'fa-play-circle text-gray-400' : m.type === 'quiz' ? 'fa-clipboard-question text-purple-400' : 'fa-code-branch text-orange-400';
                                const checkIcon = isCompleted ? '<i class="fas fa-check-circle text-green-400 mr-2 text-[10px]"></i>' : '<i class="far fa-circle text-gray-600 mr-2 text-[10px]"></i>';
                                
                                return `
                                    <button onclick="window.selectRoadmapNodeById('material-${m.content_id}')" 
                                            class="w-full text-right text-xs bg-white/5 border border-white/10 hover:border-teal-500 p-2.5 rounded-xl text-gray-300 font-bold flex items-center justify-between transition-all">
                                        <div class="flex items-center gap-2">
                                            <i class="fas ${matIcon}"></i>
                                            <span>${idx+1}. ${m.title}</span>
                                        </div>
                                        ${checkIcon}
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }
        }

        // Check if course plan is active
        let isPlanActive = false;
        if (window.currentTeam && Array.isArray(window.currentTeam.courses_plan)) {
            isPlanActive = window.currentTeam.courses_plan.map(String).includes(String(node.dbId));
        }

        let leaderBoxHtml = '';
        if (currentRole === 'leader') {
            leaderBoxHtml = `
                <!-- Leader Team Course Management Section -->
                <div class="bg-gradient-to-r from-teal-500/15 via-emerald-500/10 to-transparent border border-teal-500/30 p-4 rounded-2xl mb-6 text-right shadow-lg">
                    <div class="flex items-center justify-between mb-2.5 pb-2 border-b border-teal-500/20">
                        <span class="text-xs font-bold text-teal-300 flex items-center gap-2">
                            <i class="fas fa-users-cog text-sm"></i> إدارة الكورس للفريق
                        </span>
                        <span class="text-[10px] px-2.5 py-0.5 rounded-full font-black ${isPlanActive ? 'bg-teal-500/25 text-teal-300 border border-teal-500/40 shadow-sm' : 'bg-gray-500/20 text-gray-400 border border-white/10'}">
                            ${isPlanActive ? '<i class="fas fa-check-circle ml-1"></i> مفعّل للفريق' : 'غير مفعّل'}
                        </span>
                    </div>
                    <p class="text-xs text-gray-300 leading-relaxed mb-4">
                        ${isPlanActive 
                            ? 'هذا الكورس مفعّل حالياً لفريقك ويظهر في لوحة الكورسات النشطة وقائمة تعيين المهام.' 
                            : 'فعّل هذا الكورس ليتاح لأعضاء فريقك وتتمكن من تحديد ونشر المهام الأسبوعية منه.'}
                    </p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        ${isPlanActive ? `
                            <button onclick="window.leaderToggleCourseActivation('${node.dbId}', false)"
                                    class="w-full bg-red-500/15 hover:bg-red-500/25 text-red-300 hover:text-white border border-red-500/30 font-bold py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-2 text-xs">
                                <i class="fas fa-lock"></i> إلغاء تفعيل الكورس
                            </button>
                            <button onclick="window.goToCourseAssignments('${node.dbId}')"
                                    class="w-full bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold py-2.5 px-3 rounded-xl shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2 text-xs">
                                <i class="fas fa-tasks"></i> تعيين مهام للفريق
                            </button>
                        ` : `
                            <button onclick="window.leaderToggleCourseActivation('${node.dbId}', true)"
                                    class="w-full bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold py-2.5 px-3 rounded-xl shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2 text-xs">
                                <i class="fas fa-unlock"></i> تفعيل الكورس للفريق
                            </button>
                            <button onclick="window.goToCourseAssignments('${node.dbId}')"
                                    class="w-full bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 font-bold py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-2 text-xs">
                                <i class="fas fa-tasks text-teal-400"></i> تفعيل وتعيين مهام
                            </button>
                        `}
                    </div>
                </div>
            `;
        }

        const assetPrefix = getAssetPrefix();
        bodyHtml = `
            <!-- Banner Image -->
            <div class="relative w-full h-44 shrink-0 rounded-2xl overflow-hidden mb-5 border border-white/10 shadow-2xl">
                <img src="${course.image_url ? course.image_url : (assetPrefix + 'assets/images/1.jpg')}" 
                     class="w-full h-full object-cover" onerror="this.onerror=null; this.src='${assetPrefix}assets/icons/BUSLA-icon.png'">
                <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                ${isPlanActive ? `<span class="absolute top-4 right-4 bg-teal-500/95 backdrop-blur text-white text-[9px] px-2.5 py-1 rounded-lg font-black tracking-widest border border-white/20 uppercase"><i class="fas fa-unlock ml-1"></i> مفعل</span>` : ''}
            </div>

            <h2 class="text-2xl font-black text-white leading-tight font-heading mb-4 text-right">${node.title}</h2>
            <p class="text-sm text-gray-300 leading-relaxed text-right mb-6">${node.description || 'لا يوجد وصف مضاف حالياً لهذا الكورس.'}</p>
            
            ${leaderBoxHtml}

            <div class="grid grid-cols-2 gap-2 text-xs mb-6">
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center text-sm"><i class="fas fa-chalkboard-teacher"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">المدرس</span>
                        <span class="text-white font-bold truncate block">${node.instructor || course.created_by || 'Busla Team'}</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-green-500/15 text-green-400 flex items-center justify-center text-sm"><i class="far fa-clock"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">المدة المقدرة</span>
                        <span class="text-white font-bold truncate block">${node.duration || course['Module Time'] || 'مرنة'}</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center text-sm"><i class="fas fa-brain"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">المستوى</span>
                        <span class="text-white font-bold block">${node.difficulty || course.type || 'Intermediate'}</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center text-sm"><i class="fas fa-fire"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">نقاط XP</span>
                        <span class="text-white font-bold block">${course.base_points || 100} XP</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2 col-span-2">
                    <div class="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center text-sm"><i class="fas fa-layer-group"></i></div>
                    <div class="min-w-0 text-right flex-1">
                        <span class="text-[9px] text-gray-500 block">المسار والمرحلة</span>
                        <span class="text-white font-bold text-xs block truncate">${trackName} — ${phaseTitle}</span>
                    </div>
                </div>
            </div>

            <div class="bg-white/5 border border-white/10 p-4 rounded-xl mb-6 text-right">
                <span class="text-[10px] text-gray-500 block mb-1">نسبة الإنجاز في الكورس</span>
                <div class="flex items-center gap-3">
                    <span class="text-green-400 font-bold font-mono text-sm">${completionRate}%</span>
                    <div class="flex-1 bg-black/50 h-2 rounded-full overflow-hidden">
                        <div class="bg-green-400 h-full" style="width: ${completionRate}%"></div>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-2 mt-3 text-[10px] text-gray-400 text-center border-t border-white/5 pt-2">
                    <div>دروس: ${completedVideos}/${totalVideos}</div>
                    <div>كويزات: ${completedQuizzes}/${totalQuizzes}</div>
                    <div>مشاريع: ${completedProjects}/${totalProjects}</div>
                </div>
            </div>

            <!-- Relationships Visual System -->
            <div class="border-t border-white/5 pt-4 text-right mb-6">
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2 justify-end">
                    <i class="fas fa-long-arrow-left text-teal-400 text-xs"></i> المتطلبات السابقة (Prerequisites)
                </h4>
                <div class="flex flex-wrap gap-2 justify-end mt-1">
                    ${prereqsHtml}
                </div>
            </div>

            <div class="border-t border-white/5 pt-4 text-right mb-6">
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2 justify-end">
                    <i class="fas fa-long-arrow-right text-blue-400 text-xs"></i> الكورسات التالية (Next Courses)
                </h4>
                <div class="flex flex-wrap gap-2 justify-end mt-1">
                    ${nextHtml}
                </div>
            </div>

            ${contentListsHtml}
        `;

        if (currentRole === 'student' || currentRole === 'leader') {
            actionButtonsHtml += `
                <a href="course-player.html?id=${node.dbId}" class="flex-1 bg-b-primary hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm">
                    <i class="fas fa-play"></i> فتح الكورس والتعلم
                </a>
            `;
            if (currentRole === 'leader') {
                actionButtonsHtml += `
                    <button onclick="window.goToCourseAssignments('${node.dbId}')" class="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 text-sm">
                        <i class="fas fa-tasks"></i> تعيين مهام للفريق
                    </button>
                `;
            }
        } else if (currentRole === 'guest') {
            const extUrl = course.playlist_url || 'pages/auth.html?mode=signup';
            const buttonLabel = course.playlist_url ? 'مشاهدة الدورة على يوتيوب ↗' : 'سجل للتعلم مجاناً';
            actionButtonsHtml += `
                <a href="${extUrl}" target="_blank" class="flex-1 bg-b-primary hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm">
                    <i class="fab fa-youtube"></i> ${buttonLabel}
                </a>
            `;
        }
    }
    else if (node.type === 'document') {
        const doc = node.rawItem || {};
        const isRead = userProgress.completedMats.has(`doc_${node.dbId}`);
        const coverImg = doc.cover_url || '';
        const assetPrefix = getAssetPrefix();
        
        bodyHtml = `
            <!-- Document Details Banner -->
            <div class="relative w-full h-44 shrink-0 rounded-2xl overflow-hidden mb-5 border border-white/10 shadow-2xl bg-black/60 flex items-center justify-center">
                ${coverImg ? `<img src="${coverImg}" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='${assetPrefix}assets/images/1.jpg'">` : `
                    <div class="text-center">
                        <i class="fas fa-file-pdf text-6xl text-red-500 mb-2"></i>
                        <div class="text-xs text-gray-500 font-mono">${doc.document_type || 'PDF'}</div>
                    </div>
                `}
                <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
            </div>

            <h2 class="text-xl font-bold text-white leading-tight mb-4 text-right">${node.title}</h2>
            <p class="text-sm text-gray-300 leading-relaxed text-right mb-6">${doc.description || 'لا يوجد وصف تفصيلي مضاف لهذا المستند.'}</p>
            
            <div class="grid grid-cols-2 gap-2 text-xs mb-6 font-sans">
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center text-sm"><i class="far fa-clock"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">وقت القراءة المقدر</span>
                        <span class="text-white font-bold block">${doc.estimated_reading_time || 'مرن'} دقيقة</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center text-sm"><i class="fas fa-fire"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">النقاط المكتسبة</span>
                        <span class="text-white font-bold block">${node.baseXp || doc.xp_reward || 10} XP</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center text-sm"><i class="fas fa-bookmark"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">الأهمية</span>
                        <span class="text-white font-bold block">${doc.importance || 'Optional'}</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-green-500/15 text-green-400 flex items-center justify-center text-sm"><i class="fas fa-check-circle"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">الحالة</span>
                        <span class="text-white font-bold block">${isRead ? 'تمت القراءة بنجاح ✓' : 'لم يقرأ بعد'}</span>
                    </div>
                </div>
            </div>
        `;

        if (currentRole === 'student' || currentRole === 'leader') {
            if (doc.view_mode === 'external') {
                actionButtonsHtml += `
                    <a href="${doc.source_url}" target="_blank" onclick="window.cmMarkDocRead('${doc.id}', ${doc.xp_reward || 10})" class="flex-1 bg-b-primary hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm">
                        <i class="fas fa-external-link-alt"></i> فتح المستند الخارجي
                    </a>
                `;
            } else {
                let cId = node.courseId || doc.course_id || '';
                actionButtonsHtml += `
                    <a href="course-player.html?id=${cId}&content=doc_${node.dbId}" class="flex-1 bg-b-primary hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm">
                        <i class="fas fa-book-open"></i> قراءة المستند
                    </a>
                `;
            }
        } else {
            actionButtonsHtml += `
                <a href="pages/auth.html?mode=signup" class="flex-1 bg-b-primary hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm">
                    <i class="fas fa-user-plus"></i> سجل لفتح المستند
                </a>
            `;
        }
    }
    else if (node.type === 'video') {
        const mat = node.rawItem || {};
        const isWatched = userProgress.completedMats.has(node.dbId);
        const rawVideo = mat.video_id || mat.url || mat.link || '';
        const youtubeId = extractYouTubeId(rawVideo);
        const assetPrefix = getAssetPrefix();
        const thumbUrl = mat.thumbnail_url 
            || (youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : `${assetPrefix}assets/images/1.jpg`);

        bodyHtml = `
            <!-- Video Thumbnail -->
            <div class="relative w-full h-44 shrink-0 rounded-2xl overflow-hidden mb-5 border border-white/10 shadow-2xl">
                <img src="${thumbUrl}" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='${assetPrefix}assets/images/1.jpg'">
                <div class="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div class="w-14 h-14 rounded-full bg-red-600/90 text-white flex items-center justify-center text-xl shadow-2xl border border-white/20"><i class="fas fa-play ml-1"></i></div>
                </div>
            </div>

            <h2 class="text-xl font-bold text-white leading-tight mb-4 text-right">${node.title}</h2>
            <p class="text-sm text-gray-300 leading-relaxed text-right mb-6">${mat.Note || 'لا توجد ملاحظات تفصيلية مضافة لهذا الدرس.'}</p>
            
            <div class="grid grid-cols-2 gap-2 text-xs mb-6">
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center text-sm"><i class="far fa-clock"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">مدة الدرس</span>
                        <span class="text-white font-bold block">${node.duration || mat.Duration || 'مرن'}</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center text-sm"><i class="fas fa-fire"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">النقاط المكتسبة</span>
                        <span class="text-white font-bold block">${node.baseXp || mat.base_points || 10} XP</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-green-500/15 text-green-400 flex items-center justify-center text-sm"><i class="fas fa-sort-numeric-up"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">الترتيب</span>
                        <span class="text-white font-bold block">الدرس ${mat.order_index || '--'}</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center text-sm"><i class="fas fa-check-circle"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">حالة المشاهدة</span>
                        <span class="text-white font-bold block">${isWatched ? 'شوهد بنجاح ✓' : 'لم يشاهد بعد'}</span>
                    </div>
                </div>
            </div>
        `;

        if (currentRole === 'student' || currentRole === 'leader') {
            actionButtonsHtml += `
                <a href="course-player.html?id=${node.courseId}&content=${node.dbId}" class="flex-1 bg-b-primary hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm">
                    <i class="fas fa-play"></i> تشغيل الفيديو المباشر
                </a>
            `;
            if (currentRole === 'leader' && node.courseId) {
                actionButtonsHtml += `
                    <button onclick="window.goToCourseAssignments('${node.courseId}')" class="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm border border-white/20">
                        <i class="fas fa-tasks text-teal-400"></i> تعيين مهام من الكورس
                    </button>
                `;
            }
        } else if (currentRole === 'guest') {
            const extUrl = youtubeId 
                ? `https://www.youtube.com/watch?v=${youtubeId}` 
                : (rawVideo && rawVideo.startsWith('http') ? rawVideo : 'pages/auth.html?mode=signup');
            const buttonLabel = (youtubeId || (rawVideo && rawVideo.startsWith('http'))) ? 'مشاهدة الدرس على يوتيوب ↗' : 'سجل لمشاهدة الدروس';
            actionButtonsHtml += `
                <a href="${extUrl}" target="_blank" class="flex-1 bg-b-primary hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm">
                    <i class="fab fa-youtube"></i> ${buttonLabel}
                </a>
            `;
        }
    }
    else if (node.type === 'quiz') {
        const quizObj = currentGraphData?.quizzes?.find(q => q.quiz_id === node.dbId) || {};
        const isPassed = userProgress.passedQuizzes.has(node.dbId);

        bodyHtml = `
            <div class="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center text-2xl mx-auto mb-4 shadow-[0_0_15px_rgba(139,92,246,0.15)]">
                <i class="fas fa-clipboard-question"></i>
            </div>
            
            <h2 class="text-xl font-bold text-white text-center mb-2 leading-tight">${node.title}</h2>
            <p class="text-sm text-gray-300 text-center leading-relaxed mb-6">${quizObj.description || 'اختبار تقييمي لقياس مدى استيعاب المفاهيم الهندسية المعروضة.'}</p>
            
            <div class="grid grid-cols-2 gap-2 text-xs mb-6">
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center text-sm"><i class="fas fa-list-check"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">عدد الأسئلة</span>
                        <span class="text-white font-bold block">${quizObj.questions_to_show || 'كل الأسئلة'} أسئلة</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center text-sm"><i class="fas fa-fire"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">نقاط الاختبار</span>
                        <span class="text-white font-bold block">${node.baseXp || quizObj.max_points || 50} XP</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-green-500/15 text-green-400 flex items-center justify-center text-sm"><i class="fas fa-award"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">درجة النجاح</span>
                        <span class="text-white font-bold block">%${quizObj.passing_score || 60} أو أكثر</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center text-sm"><i class="fas fa-check-double"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">حالة الاختبار</span>
                        <span class="text-white font-bold block">${isPassed ? 'تم الاجتياز بنجاح ✓' : 'لم يجتز بعد'}</span>
                    </div>
                </div>
            </div>
        `;

        if (currentRole === 'student' || currentRole === 'leader') {
            actionButtonsHtml += `
                <a href="course-player.html?id=${node.courseId}&content=${node.parentMaterialId}" class="flex-1 bg-b-primary hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm">
                    <i class="fas fa-pencil-alt"></i> ابدأ الاختبار الآن
                </a>
            `;
            if (currentRole === 'leader' && node.courseId) {
                actionButtonsHtml += `
                    <button onclick="window.goToCourseAssignments('${node.courseId}')" class="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm border border-white/20">
                        <i class="fas fa-tasks text-teal-400"></i> تعيين مهام من الكورس
                    </button>
                `;
            }
        } else if (currentRole === 'guest') {
            actionButtonsHtml += `
                <a href="pages/auth.html?mode=signup" class="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm">
                    <i class="fas fa-user-plus"></i> سجل لتقديم الاختبارات
                </a>
            `;
        }
    }
    else if (node.type === 'project') {
        const proj = currentGraphData?.projects?.find(p => p.id === node.dbId) || {};
        const isCompleted = userProgress.completedProjects.has(node.dbId);
        
        let rubricHtml = '';
        try {
            if (proj.rubric_json) {
                const rubric = typeof proj.rubric_json === 'string' ? JSON.parse(proj.rubric_json) : proj.rubric_json;
                if (Array.isArray(rubric)) {
                    rubricHtml = `
                        <div class="border-t border-white/5 pt-4 text-right mb-6">
                            <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2 justify-end">
                                <i class="fas fa-list-check text-orange-400 text-xs"></i> معايير التقييم والدرجات (Rubric)
                            </h4>
                            <div class="space-y-2 mt-2">
                                ${rubric.map(r => `
                                    <div class="flex justify-between items-center text-xs bg-white/5 border border-white/10 p-2.5 rounded-xl">
                                        <span class="text-gray-300 font-bold">${r.criterion}</span>
                                        <span class="text-amber-400 font-mono font-bold">${r.points} نقاط</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
            }
        } catch (e) {
            console.error("Error parsing rubric:", e);
        }

        bodyHtml = `
            <div class="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center text-2xl mx-auto mb-4 shadow-[0_0_15px_rgba(249,115,22,0.15)]">
                <i class="fas fa-code-branch"></i>
            </div>
            
            <h2 class="text-xl font-bold text-white text-center mb-2 leading-tight">${node.title}</h2>
            <p class="text-sm text-gray-300 text-center leading-relaxed mb-6">${proj.description || 'مشروع عملي تطبيقي متكامل لقياس المهارات والخبرة.'}</p>
            
            <div class="grid grid-cols-2 gap-2 text-xs mb-6">
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center text-sm"><i class="fas fa-fire"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">نقاط المشروع</span>
                        <span class="text-white font-bold block">${node.baseXp || proj.max_points || 100} XP</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center text-sm"><i class="fas fa-check-circle"></i></div>
                    <div class="min-w-0 text-right">
                        <span class="text-[9px] text-gray-500 block">حالة التقديم</span>
                        <span class="text-white font-bold block">${isCompleted ? 'تم تقديم المشروع ✓' : 'لم يقدم بعد'}</span>
                    </div>
                </div>
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2 col-span-2">
                    <div class="w-8 h-8 rounded-lg bg-green-500/15 text-green-400 flex items-center justify-center text-sm"><i class="fas fa-paperclip"></i></div>
                    <div class="min-w-0 text-right flex-1">
                        <span class="text-[9px] text-gray-500 block">طريقة التسليم المطلوبة</span>
                        <span class="text-white font-bold block truncate">${proj.submission_method || 'مستندات وملفات المشروع'}</span>
                    </div>
                </div>
            </div>

            ${rubricHtml}
        `;

        if (currentRole === 'student' || currentRole === 'leader') {
            actionButtonsHtml += `
                <a href="course-player.html?id=${node.courseId}&content=${node.parentMaterialId}" class="flex-1 bg-b-primary hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm">
                    <i class="fas fa-upload"></i> تسليم المشروع العملي
                </a>
            `;
            if (currentRole === 'leader' && node.courseId) {
                actionButtonsHtml += `
                    <button onclick="window.goToCourseAssignments('${node.courseId}')" class="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm border border-white/20">
                        <i class="fas fa-tasks text-teal-400"></i> تعيين مهام من الكورس
                    </button>
                `;
            }
        } else if (currentRole === 'guest') {
            actionButtonsHtml += `
                <a href="pages/auth.html?mode=signup" class="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm">
                    <i class="fas fa-user-plus"></i> سجل لتسليم المشاريع
                </a>
            `;
        }
    }

    // Role specific buttons for Admin
    if (currentRole === 'admin') {
        actionButtonsHtml += `
            <div class="flex gap-2 mt-4 w-full">
                <button onclick="window.cmEditRoadmapNode('${node.type}', '${node.dbId}')" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-xs">
                    <i class="fas fa-pen"></i> تعديل السجل
                </button>
                <button onclick="window.cmDeleteRoadmapNode('${node.type}', '${node.dbId}')" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-xs">
                    <i class="fas fa-trash"></i> حذف السجل
                </button>
            </div>
        `;
    }

    // Embed all sections into the container
    container.innerHTML = `
        ${headerHtml}
        <div class="flex flex-col flex-1 pr-1">
            ${badgeHtml}
            ${bodyHtml}
            ${actionButtonsHtml ? `<div class="border-t border-white/5 pt-4 mt-6 flex gap-3">${actionButtonsHtml}</div>` : ''}
            <div id="roadmap-node-tools-container" class="mt-6 border-t border-white/5 pt-4 hidden"></div>
            <div id="roadmap-node-references-container" class="mt-6 border-t border-white/5 pt-4 hidden"></div>
        </div>
    `;

    loadRoadmapNodeTools(node);
    loadRoadmapNodeReferences(node);
    initDetailsPanelSwipeToDismiss();
}

/**
 * Queries Supabase and displays published suggested references for the current node (track, phase, course, or lesson)
 * @param {Object} node 
 */
async function loadRoadmapNodeReferences(node) {
    const el = document.getElementById('roadmap-node-references-container');
    if (!el) return;

    let column = '';
    let val = null;

    if (node.type === 'track') {
        column = 'track_ids';
        val = node.dbId;
    } else if (node.type === 'phase') {
        column = 'phase_ids';
        val = String(node.dbId);
    } else if (node.type === 'course') {
        column = 'course_ids';
        val = String(node.dbId);
    } else if (node.type === 'video' || node.type === 'quiz' || node.type === 'project') {
        column = 'content_ids';
        val = String(node.dbId);
    }

    if (!column || !val) {
        el.classList.add('hidden');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('reference_library')
            .select('*')
            .contains(column, [val])
            .eq('status', 'Published')
            .order('order_index', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            el.classList.add('hidden');
            return;
        }

        el.classList.remove('hidden');
        el.innerHTML = `
            <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2 justify-end">
                <i class="fas fa-book text-teal-400 text-xs"></i> المراجع العلمية المقترحة
            </h4>
            <div class="space-y-2">
                ${data.map(ref => {
                    const impBadge = ref.importance === 'Required' ? 'bg-red-500/10 text-red-400 border-red-500/25' : ref.importance === 'Recommended' ? 'bg-teal-500/10 text-teal-400 border-teal-500/25' : 'bg-gray-500/10 text-gray-400 border-gray-500/25';
                    const importanceName = ref.importance === 'Required' ? 'مطلوب' : ref.importance === 'Recommended' ? 'مستحسن' : ref.importance === 'Advanced Reading' ? 'متقدم' : 'اختياري';
                    const assetPrefix = getAssetPrefix();
                    const defaultCover = `${assetPrefix}assets/icons/BUSLA-icon.png`;
                    
                    return `
                        <div onclick="if (typeof window.openReferenceDetailModal === 'function') { window.openReferenceDetailModal('${ref.id}'); } else { window.open('${ref.read_online_url || ref.download_pdf_url || '#'}', '_blank'); }" 
                             class="w-full text-right text-xs bg-white/5 border border-white/10 hover:border-teal-500/50 hover:bg-white/10 p-3 rounded-xl cursor-pointer flex items-center justify-between transition-all group">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-10 bg-white/5 rounded border border-white/5 flex items-center justify-center overflow-hidden shrink-0 shadow">
                                    <img src="${ref.cover_url || defaultCover}" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='${defaultCover}'">
                                </div>
                                <div class="text-right min-w-0">
                                    <span class="text-white font-bold block group-hover:text-teal-400 transition-colors truncate max-w-[140px]" title="${ref.title}">${ref.title}</span>
                                    <span class="text-[9px] text-gray-500 block mt-0.5 truncate max-w-[140px]">${ref.type} • ${ref.author || 'مؤلف غير معروف'}</span>
                                </div>
                            </div>
                            <span class="text-[9px] border px-2 py-0.5 rounded font-black shrink-0 ${impBadge}">${importanceName}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } catch (err) {
        console.error("loadRoadmapNodeReferences error:", err);
        el.classList.add('hidden');
    }
}

/**
 * Queries Supabase and displays published tools recommended for the current node (track, phase, or course)
 * @param {Object} node 
 */
async function loadRoadmapNodeTools(node) {
    const el = document.getElementById('roadmap-node-tools-container');
    if (!el) return;

    if (node.type !== 'track' && node.type !== 'phase' && node.type !== 'course') {
        el.classList.add('hidden');
        return;
    }

    let column = '';
    let val = null;
    if (node.type === 'track') {
        column = 'track_ids';
        val = node.dbId;
    } else if (node.type === 'phase') {
        column = 'phase_ids';
        val = String(node.dbId);
    } else if (node.type === 'course') {
        column = 'course_ids';
        val = String(node.dbId);
    }

    if (!column || !val) {
        el.classList.add('hidden');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('tools')
            .select('*')
            .contains(column, [val])
            .eq('status', 'Published')
            .order('order_index', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            el.classList.add('hidden');
            return;
        }

        el.classList.remove('hidden');
        el.innerHTML = `
            <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2 justify-end">
                <i class="fas fa-toolbox text-teal-400 text-xs"></i> الأدوات والبرمجيات الموصى بها
            </h4>
            <div class="space-y-2">
                ${data.map(tool => {
                    const impBadge = tool.importance === 'Required' ? 'bg-red-500/10 text-red-400 border-red-500/25' : tool.importance === 'Recommended' ? 'bg-teal-500/10 text-teal-400 border-teal-500/25' : 'bg-gray-500/10 text-gray-400 border-gray-500/25';
                    const importanceName = tool.importance === 'Required' ? 'مطلوب' : tool.importance === 'Recommended' ? 'مستحسن' : 'اختياري';
                    const assetPrefix = getAssetPrefix();
                    const defaultIcon = `${assetPrefix}assets/icons/BUSLA-icon.png`;
                    return `
                        <div onclick="if (typeof window.openToolDetailDrawer === 'function') { window.openToolDetailDrawer('${tool.id}'); } else { window.open('${tool.official_website || '#'}', '_blank'); }" 
                             class="w-full text-right text-xs bg-white/5 border border-white/10 hover:border-teal-500/50 hover:bg-white/10 p-3 rounded-xl cursor-pointer flex items-center justify-between transition-all group">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 bg-white/5 rounded-lg border border-white/5 flex items-center justify-center overflow-hidden shrink-0">
                                    <img src="${tool.logo_url || defaultIcon}" class="w-full h-full object-contain p-1" onerror="this.onerror=null; this.src='${defaultIcon}'">
                                </div>
                                <div class="text-right">
                                    <span class="text-white font-bold block group-hover:text-teal-400 transition-colors">${tool.name}</span>
                                    <span class="text-[9px] text-gray-500 block mt-0.5">${tool.type} • مستوى ${tool.experience_level}</span>
                                </div>
                            </div>
                            <span class="text-[9px] border px-2 py-0.5 rounded font-black ${impBadge}">${importanceName}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } catch (err) {
        console.error("loadRoadmapNodeTools error:", err);
        el.classList.add('hidden');
    }
}

// Global helpers for navigation/actions inside Details Panel
window.closeRoadmapDetailsPanel = function(immediate = false) {
    localStorage.removeItem('busla_roadmap_active_node_id');
    const container = document.getElementById('node-details-container');
    if (!container) return;

    if (!immediate && window.innerWidth <= 767 && container.classList.contains('sheet-open')) {
        container.style.setProperty('transition', 'transform 0.28s cubic-bezier(0.32, 1, 0.23, 1)', 'important');
        container.style.setProperty('transform', 'translateY(100%)', 'important');
        setTimeout(() => {
            container.classList.remove('sheet-open');
            container.style.removeProperty('transform');
            container.style.removeProperty('transition');
            renderNodeDetailsPanel(null);
        }, 280);
    } else {
        container.classList.remove('sheet-open');
        container.style.removeProperty('transform');
        container.style.removeProperty('transition');
        renderNodeDetailsPanel(null);
    }
};

/**
 * Enables smooth swipe/drag-to-dismiss on mobile for the Bottom Sheet Details Panel.
 * Tracks user touch or mouse drag downwards and snaps or dismisses.
 */
function initDetailsPanelSwipeToDismiss() {
    const panel = document.getElementById('node-details-container');
    if (!panel || panel._swipeDismissBound) return;
    panel._swipeDismissBound = true;

    let startY = 0;
    let startX = 0;
    let currentDeltaY = 0;
    let isDragging = false;
    let isTopAreaTouch = false;
    let touchStartTime = 0;

    function handleStart(clientY, clientX, target) {
        if (window.innerWidth > 767 || !panel.classList.contains('sheet-open')) return false;

        // Never drag if user tapped directly on an interactive element
        if (target && target.closest && target.closest('button, a, input, select, textarea')) {
            return false;
        }

        startY = clientY;
        startX = clientX;
        currentDeltaY = 0;
        isDragging = false;
        touchStartTime = Date.now();

        const rect = panel.getBoundingClientRect();
        const isHandle = Boolean(target && target.closest && target.closest('.sheet-drag-handle-zone'));
        // Touch is in top area if touching handle or within top 90px of sheet
        isTopAreaTouch = isHandle || ((clientY - rect.top) <= 90);
        return true;
    }

    function handleMove(clientY, clientX, cancelable, preventDefault) {
        if (!panel.classList.contains('sheet-open')) return;
        const diffY = clientY - startY;
        const diffX = clientX - startX;

        // Downward vertical drag detection
        if (diffY > 6 && Math.abs(diffY) > Math.abs(diffX)) {
            if (isTopAreaTouch || panel.scrollTop <= 0) {
                isDragging = true;
                if (cancelable) preventDefault();
                currentDeltaY = diffY;
                panel.style.setProperty('transition', 'none', 'important');
                panel.style.setProperty('transform', `translateY(${diffY}px)`, 'important');
            }
        } else if (isDragging && diffY <= 0) {
            currentDeltaY = 0;
            panel.style.setProperty('transform', 'translateY(0)', 'important');
        }
    }

    function handleEnd() {
        if (!isDragging) return;
        isDragging = false;

        const elapsed = Date.now() - touchStartTime;
        const velocity = currentDeltaY / Math.max(elapsed, 1);

        // Threshold to close: dragged down > 80px OR quick downward flick (> 35px & velocity > 0.35)
        const shouldClose = currentDeltaY > 80 || (velocity > 0.35 && currentDeltaY > 35);

        if (shouldClose) {
            panel.style.setProperty('transition', 'transform 0.28s cubic-bezier(0.32, 1, 0.23, 1)', 'important');
            panel.style.setProperty('transform', 'translateY(100%)', 'important');
            setTimeout(() => {
                window.closeRoadmapDetailsPanel(true);
            }, 290);
        } else {
            panel.style.setProperty('transition', 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)', 'important');
            panel.style.setProperty('transform', 'translateY(0)', 'important');
            setTimeout(() => {
                panel.style.removeProperty('transform');
                panel.style.removeProperty('transition');
            }, 240);
        }
    }

    // Touch events for mobile screens
    panel.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            handleStart(e.touches[0].clientY, e.touches[0].clientX, e.target);
        }
    }, { passive: true });

    panel.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            handleMove(e.touches[0].clientY, e.touches[0].clientX, e.cancelable, () => e.preventDefault());
        }
    }, { passive: false });

    panel.addEventListener('touchend', handleEnd, { passive: true });
    panel.addEventListener('touchcancel', handleEnd, { passive: true });

    // Mouse drag support for testing in desktop DevTools mobile emulator
    panel.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || window.innerWidth > 767 || !panel.classList.contains('sheet-open')) return;
        if (e.target && e.target.closest && e.target.closest('button, a, input, select, textarea')) return;

        const rect = panel.getBoundingClientRect();
        const isHandle = Boolean(e.target && e.target.closest && e.target.closest('.sheet-drag-handle-zone'));
        const inTopArea = (e.clientY - rect.top) <= 90;

        if (isHandle || inTopArea || panel.scrollTop <= 0) {
            if (handleStart(e.clientY, e.clientX, e.target)) {
                const onMouseMove = (me) => handleMove(me.clientY, me.clientX, true, () => me.preventDefault());
                const onMouseUp = () => {
                    handleEnd();
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                };
                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            }
        }
    });
}

window.refreshRoadmapNodeDetails = function() {
    if (activeNode) {
        renderNodeDetailsPanel(activeNode);
    }
};

window.refreshRoadmapCourseNodes = function() {
    computedNodes.forEach(node => {
        if (node.type === 'course') {
            const nodeEl = document.getElementById(`node-${node.id}`);
            if (nodeEl) {
                let collapseBtn = '';
                const hasMaterials = currentGraphData && currentGraphData.materials.some(m => m.course_id === node.dbId);
                const hasRelated = currentGraphData && currentGraphData.courses.some(c => c.related_with === node.dbId);
                if (hasMaterials) {
                    const icon = node.isCollapsed ? 'fa-list' : 'fa-chevron-right';
                    const tip = node.isCollapsed ? 'عرض الدروس والمحتويات' : 'إخفاء الدروس والمحتويات';
                    const color = node.isCollapsed ? '#9ca3af' : 'var(--color-course)';
                    const bg = node.isCollapsed ? 'rgba(255,255,255,0.07)' : 'rgba(34,196,93,0.15)';
                    const border = node.isCollapsed ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(34,196,93,0.3)';
                    collapseBtn += `
                        <button class="roadmap-collapse-btn" data-node-id="${node.id}" title="${tip}" onclick="event.stopPropagation(); window._roadmapToggleCollapse('${node.id}')"
                            style="position:absolute;top:6px;left:6px;width:20px;height:20px;border-radius:50%;
                                   background:${bg};border:${border};
                                   display:flex;align-items:center;justify-content:center;cursor:pointer;
                                   color:${color};font-size:9px;z-index:10;transition:all 0.2s">
                            <i class="fas ${icon}"></i>
                        </button>`;
                }
                if (hasRelated) {
                    const icon = node.isRelatedCollapsed ? 'fa-sitemap' : 'fa-chevron-left';
                    const tip = node.isRelatedCollapsed ? 'عرض الكورسات المرتبطة' : 'إخفاء الكورسات المرتبطة';
                    const color = node.isRelatedCollapsed ? '#9ca3af' : 'var(--color-track)';
                    const bg = node.isRelatedCollapsed ? 'rgba(255,255,255,0.07)' : 'rgba(0,245,255,0.15)';
                    const border = node.isRelatedCollapsed ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,245,255,0.3)';
                    collapseBtn += `
                        <button class="roadmap-collapse-related-btn" data-node-id="${node.id}" title="${tip}" onclick="event.stopPropagation(); window._roadmapToggleRelatedCollapse('${node.id}')"
                            style="position:absolute;top:6px;left:30px;width:20px;height:20px;border-radius:50%;
                                   background:${bg};border:${border};
                                   display:flex;align-items:center;justify-content:center;cursor:pointer;
                                   color:${color};font-size:9px;z-index:10;transition:all 0.2s">
                            <i class="fas ${icon}"></i>
                        </button>`;
                }
                const infoBtn = `
                    <button class="rm-info-btn" title="عرض التفاصيل"
                            onclick="event.stopPropagation(); window._rmShowInfo('${node.id}')"
                            style="position:absolute;top:6px;right:6px;width:20px;height:20px;border-radius:50%;
                                   background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);
                                   display:flex;align-items:center;justify-content:center;cursor:pointer;
                                   color:#9ca3af;font-size:9px;z-index:10;transition:all 0.2s">
                        <i class="fas fa-circle-info"></i>
                    </button>`;
                nodeEl.innerHTML = collapseBtn + infoBtn + getNodeInnerHtml(node);
            }
        }
    });
};

if (!window.leaderToggleCourseActivation) {
    let _lastLeaderToggleTime = 0;
    window.leaderToggleCourseActivation = async (courseId, isChecked) => {
        // Debounce: prevent touch+click double-fire from toggling twice
        if (Date.now() - _lastLeaderToggleTime < 600) return;
        _lastLeaderToggleTime = Date.now();
        if (typeof window.toggleActivate === 'function') {
            await window.toggleActivate(courseId, isChecked);
        }
    };
}

window.selectRoadmapNodeById = (nodeId) => {
    const node = computedNodes.find(n => n.id === nodeId);
    if (node) {
        let changed = false;

        // Ensure phase is expanded if this node is inside a phase
        if (node.phaseId) {
            const phaseId = `phase-${node.phaseId}`;
            if (!expandedPhases.has(phaseId)) {
                expandedPhases.add(phaseId);
                changed = true;
            }
        }

        // Expand parent chain first if the node is hidden!
        let temp = node;
        while (temp.parentCourseId) {
            const parentId = `course-${temp.parentCourseId}`;
            if (!expandedRelated.has(parentId)) {
                expandedRelated.add(parentId);
                changed = true;
            }
            const parent = computedNodes.find(n => n.id === parentId);
            if (!parent) break;
            temp = parent;
        }
        
        // If it's a material, make sure its parent course is expanded!
        if (node.type === 'video' || node.type === 'quiz' || node.type === 'project' || node.type === 'material' || node.type === 'document') {
            if (node.courseId) {
                const courseNodeId = `course-${node.courseId}`;
                if (!expandedNodes.has(courseNodeId)) {
                    expandedNodes.add(courseNodeId);
                    changed = true;
                }
            }
        }
        
        if (changed) {
            buildGraphStructure(currentGraphData);
            calculateGraphLayout();
            renderHtmlNodes();
            renderSvgLines();
            requestAnimationFrame(updateMinimap);
        }
        
        // Select node and smart focus
        selectNode(node, false);
        requestAnimationFrame(() => {
            if (node.type === 'course') {
                const family = computedNodes.filter(n => !n.isHidden && (n.id === node.id || n.courseId === node.dbId));
                smartFocusOnNodes(family);
            } else if (node.type === 'phase') {
                const family = computedNodes.filter(n => !n.isHidden && (n.id === node.id || n.phaseId === node.dbId));
                smartFocusOnNodes(family);
            } else {
                smartFocusOnNodes([node]);
            }
        });
    }
};

window.cmEditRoadmapNode = (type, dbId) => {
    const levelMap = {
        'track': 'tracks',
        'phase': 'phases',
        'course': 'courses',
        'video': 'course_materials',
        'quiz': 'quizzes',
        'project': 'projects'
    };
    const level = levelMap[type];
    if (level && typeof window.cmEditItem === 'function') {
        window.cmCurrentLevel = level;
        window.cmEditItem(dbId);
    }
};

window.cmDeleteRoadmapNode = (type, dbId) => {
    const levelMap = {
        'track': 'tracks',
        'phase': 'phases',
        'course': 'courses',
        'video': 'course_materials',
        'quiz': 'quizzes',
        'project': 'projects'
    };
    const level = levelMap[type];
    if (level && typeof window.cmDeleteItem === 'function') {
        window.cmCurrentLevel = level;
        window.cmDeleteItem(dbId);
    }
};

/**
 * Cancels any active camera animation frame
 */
function cancelCameraAnimation() {
    if (cameraAnimFrame) {
        cancelAnimationFrame(cameraAnimFrame);
        cameraAnimFrame = null;
    }
}

/**
 * Smoothly animates camera to target offsets and zoom with cubic easing
 */
function animateCameraTo(targetOffsetX, targetOffsetY, targetZoom, duration = 380) {
    cancelCameraAnimation();

    const startOffsetX = offsetX;
    const startOffsetY = offsetY;
    const startZoom = zoomLevel;
    const startTime = performance.now();

    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function step(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = easeInOutCubic(progress);

        zoomLevel = startZoom + (targetZoom - startZoom) * ease;
        offsetX = startOffsetX + (targetOffsetX - startOffsetX) * ease;
        offsetY = startOffsetY + (targetOffsetY - startOffsetY) * ease;

        updateCanvasTransform();

        if (progress < 1) {
            cameraAnimFrame = requestAnimationFrame(step);
        } else {
            cameraAnimFrame = null;
            clampOffsets();
            updateCanvasTransform();
        }
    }

    cameraAnimFrame = requestAnimationFrame(step);
}

/**
 * Prevents graph from ever disappearing off-screen.
 * Clamps translation offsets within visible bounds.
 */
function clampOffsets() {
    const viewport = document.getElementById('roadmap-viewport');
    if (!viewport || computedNodes.length === 0) return;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw === 0 || vh === 0) return;

    const visibleNodes = computedNodes.filter(n => !n.isHidden && n.x !== undefined && n.y !== undefined);
    if (visibleNodes.length === 0) return;

    const CW = { track: 320, phase: 320, course: 260, material: 240 };
    const HH = { track: 48, phase: 36, course: 52, material: 37 };

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    visibleNodes.forEach(node => {
        const hw = (CW[node.type] || 260) / 2;
        const hh = HH[node.type] || 40;
        if (node.x - hw < minX) minX = node.x - hw;
        if (node.x + hw > maxX) maxX = node.x + hw;
        if (node.y - hh < minY) minY = node.y - hh;
        if (node.y + hh > maxY) maxY = node.y + hh;
    });

    const marginX = Math.min(vw * 0.35, 180);
    const marginY = Math.min(vh * 0.35, 180);

    const minOffsetX = marginX - maxX * zoomLevel;
    const maxOffsetX = (vw - marginX) - minX * zoomLevel;
    const minOffsetY = marginY - maxY * zoomLevel;
    const maxOffsetY = (vh - marginY) - minY * zoomLevel;

    if (minOffsetX <= maxOffsetX) {
        offsetX = Math.max(minOffsetX, Math.min(maxOffsetX, offsetX));
    } else {
        offsetX = vw / 2 - ((minX + maxX) / 2) * zoomLevel;
    }

    if (minOffsetY <= maxOffsetY) {
        offsetY = Math.max(minOffsetY, Math.min(maxOffsetY, offsetY));
    } else {
        offsetY = vh / 2 - ((minY + maxY) / 2) * zoomLevel;
    }
}

/**
 * Smart Focus: Smoothly frames target node(s) in the center of the viewport
 */
function smartFocusOnNodes(nodes, customMargin = 60) {
    const viewport = document.getElementById('roadmap-viewport');
    if (!viewport) return;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw === 0 || vh === 0) {
        // If viewport is hidden or layout hasn't finished yet (e.g. background tab), retry shortly
        setTimeout(() => smartFocusOnNodes(nodes, customMargin), 100);
        return;
    }

    const targetNodes = Array.isArray(nodes) ? nodes.filter(n => n && !n.isHidden && n.x !== undefined) : [nodes].filter(Boolean);
    if (targetNodes.length === 0) return;

    const CW = { track: 320, phase: 320, course: 260, material: 240 };
    const HH = { track: 48, phase: 36, course: 52, material: 37 };

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    targetNodes.forEach(node => {
        const hw = (CW[node.type] || 260) / 2;
        const hh = HH[node.type] || 40;
        if (node.x - hw < minX) minX = node.x - hw;
        if (node.x + hw > maxX) maxX = node.x + hw;
        if (node.y - hh < minY) minY = node.y - hh;
        if (node.y + hh > maxY) maxY = node.y + hh;
    });

    const contentW = Math.max(10, maxX - minX);
    const contentH = Math.max(10, maxY - minY);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    let targetZoom = zoomLevel;
    const margin = vw < 640 ? Math.min(customMargin, 20) : customMargin;
    if (targetNodes.length === 1) {
        // Single card: comfortable, clear zoom level
        targetZoom = Math.max(0.85, Math.min(1.1, zoomLevel));
    } else {
        // Multi-card group: fit with margin
        const availW = Math.max(150, vw - margin * 2);
        const availH = Math.max(150, vh - margin * 2);
        const fitScale = Math.min(availW / contentW, availH / contentH);
        targetZoom = Math.max(0.35, Math.min(1.05, fitScale));
    }

    const targetOffsetX = vw / 2 - centerX * targetZoom;
    const targetOffsetY = vh / 2 - centerY * targetZoom;

    animateCameraTo(targetOffsetX, targetOffsetY, targetZoom, 420);
}

/**
 * Smooth pan view to target node coordinate
 */
function panToNode(node) {
    if (!node) return;
    smartFocusOnNodes([node]);
}

/**
 * Adjust Zoom Scale smoothly from buttons
 */
function adjustZoom(delta) {
    cancelCameraAnimation();
    const viewport = document.getElementById('roadmap-viewport');
    if (!viewport) return;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const centerX = vw / 2;
    const centerY = vh / 2;

    const oldZoom = zoomLevel;
    const newZoom = Math.max(0.2, Math.min(2.5, zoomLevel + delta));
    if (newZoom === oldZoom) return;

    const worldX = (centerX - offsetX) / oldZoom;
    const worldY = (centerY - offsetY) / oldZoom;

    animateCameraTo(centerX - worldX * newZoom, centerY - worldY * newZoom, newZoom, 220);
}

/**
 * Fits entire roadmap tree in viewport dimensions, centered.
 */
function fitRoadmapToScreen() {
    const visibleNodes = computedNodes.filter(n => !n.isHidden && n.x !== undefined && n.y !== undefined);
    if (visibleNodes.length === 0) return;
    smartFocusOnNodes(visibleNodes, 60);
}
window.fitRoadmapToScreen = fitRoadmapToScreen;
window.centerGraph = centerGraph;
window.smartFocusOnNodes = smartFocusOnNodes;

/**
 * Centers the graph on active node or entire graph
 */
function centerGraph() {
    if (activeNode && !activeNode.isHidden) {
        if (activeNode.type === 'course') {
            const family = computedNodes.filter(n => !n.isHidden && (n.id === activeNode.id || n.courseId === activeNode.dbId));
            smartFocusOnNodes(family);
            return;
        } else if (activeNode.type === 'phase') {
            const family = computedNodes.filter(n => !n.isHidden && (n.id === activeNode.id || n.phaseId === activeNode.dbId));
            smartFocusOnNodes(family);
            return;
        } else {
            smartFocusOnNodes([activeNode]);
            return;
        }
    }
    fitRoadmapToScreen();
}

/**
 * Resets Zoom and Panning offsets
 */
function resetRoadmapView() {
    fitRoadmapToScreen();
}

/**
 * Mouse events dragging/panning viewport
 */
function startPanning(e) {
    // Left click (0) or Middle click (1) only
    if (e.button !== 0 && e.button !== 1) return;

    cancelCameraAnimation();

    if (e.button === 1) {
        e.preventDefault(); // prevent auto scroll on middle mouse click
    }

    // Don't initiate pan on left click if click target is inside a node or control and spacebar is NOT held down
    if (e.button === 0 && !spacePressed) {
        if (e.target.closest('.roadmap-node') || e.target.closest('.roadmap-controls') || e.target.closest('.roadmap-minimap') || e.target.closest('.roadmap-toolbar')) return;
    }

    const canvas = document.getElementById('roadmap-canvas');
    const vp = document.getElementById('roadmap-viewport');
    if (canvas) {
        isDragging = true;
        startX = e.clientX - offsetX;
        startY = e.clientY - offsetY;
        canvas.style.transition = 'none';
        if (vp) vp.style.cursor = 'grabbing';
    }
}

function panCanvas(e) {
    if (!isDragging) return;
    offsetX = e.clientX - startX;
    offsetY = e.clientY - startY;
    clampOffsets();
    updateCanvasTransform();
}

function stopPanning() {
    isDragging = false;
    const vp = document.getElementById('roadmap-viewport');
    if (vp) vp.style.cursor = spacePressed ? 'grab' : '';
}

/**
 * Zoom on mousewheel with true focal point under cursor
 */
function handleMouseWheel(e) {
    e.preventDefault();
    cancelCameraAnimation();

    const viewport = document.getElementById('roadmap-viewport');
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.max(0.2, Math.min(2.5, zoomLevel * factor));
    if (newZoom === zoomLevel) return;

    const worldX = (cursorX - offsetX) / zoomLevel;
    const worldY = (cursorY - offsetY) / zoomLevel;

    zoomLevel = newZoom;
    offsetX = cursorX - worldX * zoomLevel;
    offsetY = cursorY - worldY * zoomLevel;

    clampOffsets();
    updateCanvasTransform();
}

// ── Touch interaction event handlers (Mobile & Tablet Drag / Pinch / Tap) ──
let touchMode = 'none'; // 'none' | 'interactive' | 'pan' | 'pinch'
let lastTouchX = 0, lastTouchY = 0;
let touchStartX = 0, touchStartY = 0;
let touchStartTime = 0;
let touchTarget = null;
let isTouchPanning = false;
let lastPinchDist = 0;

function handleTouchStart(e) {
    cancelCameraAnimation();
    const canvas = document.getElementById('roadmap-canvas');
    if (canvas) canvas.style.transition = 'none';

    if (e.touches.length === 1) {
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        lastTouchX = t.clientX;
        lastTouchY = t.clientY;
        touchStartTime = Date.now();
        touchTarget = e.target;
        isTouchPanning = false;

        // If touch starts on a node, button, or control, mark as interactive
        const isInteractive = !!(e.target.closest('.roadmap-node') || e.target.closest('.roadmap-controls') || e.target.closest('.roadmap-toolbar'));
        touchMode = isInteractive ? 'interactive' : 'pan';
    } else if (e.touches.length === 2) {
        touchMode = 'pinch';
        isTouchPanning = true;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        lastPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        lastTouchX = (t1.clientX + t2.clientX) / 2;
        lastTouchY = (t1.clientY + t2.clientY) / 2;
    }
}

function handleTouchMove(e) {
    const viewport = document.getElementById('roadmap-viewport');
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();

    if ((touchMode === 'pan' || touchMode === 'interactive') && e.touches.length === 1) {
        const touch = e.touches[0];
        const totalDx = touch.clientX - touchStartX;
        const totalDy = touch.clientY - touchStartY;
        const moveDist = Math.hypot(totalDx, totalDy);

        // If on interactive element, require larger movement (14px) before converting to a pan
        const dragThreshold = (touchMode === 'interactive') ? 14 : 6;

        if (!isTouchPanning) {
            if (moveDist >= dragThreshold) {
                isTouchPanning = true;
                touchMode = 'pan';
                lastTouchX = touch.clientX;
                lastTouchY = touch.clientY;
            } else {
                // Within tap threshold: do not cancel click or move canvas
                return;
            }
        }

        if (e.cancelable) e.preventDefault();
        const dx = touch.clientX - lastTouchX;
        const dy = touch.clientY - lastTouchY;
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;

        offsetX += dx;
        offsetY += dy;
        clampOffsets();
        updateCanvasTransform();
    } else if (touchMode === 'pinch' && e.touches.length === 2) {
        if (e.cancelable) e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const currentMidX = (t1.clientX + t2.clientX) / 2;
        const currentMidY = (t1.clientY + t2.clientY) / 2;

        if (lastPinchDist > 0 && currentDist > 0) {
            const factor = currentDist / lastPinchDist;
            const newZoom = Math.max(0.2, Math.min(2.5, zoomLevel * factor));

            const focalX = currentMidX - rect.left;
            const focalY = currentMidY - rect.top;

            const worldX = (focalX - offsetX) / zoomLevel;
            const worldY = (focalY - offsetY) / zoomLevel;

            zoomLevel = newZoom;
            offsetX = focalX - worldX * zoomLevel;
            offsetY = focalY - worldY * zoomLevel;

            const panDx = currentMidX - lastTouchX;
            const panDy = currentMidY - lastTouchY;
            offsetX += panDx;
            offsetY += panDy;

            lastPinchDist = currentDist;
            lastTouchX = currentMidX;
            lastTouchY = currentMidY;

            clampOffsets();
            updateCanvasTransform();
        }
    }
}

function handleTouchEnd(e) {
    if (e.touches.length === 0) {
        // The viewport has touch-action:none so the browser will NOT fire synthetic
        // click events from touches.  We must trigger them manually here.
        if (!isTouchPanning && touchTarget) {
            const elapsed = Date.now() - touchStartTime;
            const totalDx = Math.abs(touchStartX - (e.changedTouches[0]?.clientX ?? touchStartX));
            const totalDy = Math.abs(touchStartY - (e.changedTouches[0]?.clientY ?? touchStartY));
            const moved   = Math.hypot(totalDx, totalDy);

            // Treat as tap only if elapsed < 600ms AND finger moved less than 12px
            if (elapsed < 600 && moved < 12) {
                // Try the closest button first
                const btn = touchTarget.closest('button');
                if (btn && !btn.disabled) {
                    btn.click();
                } else {
                    // Otherwise fire the node click handler
                    const nodeEl = touchTarget.closest('.roadmap-node');
                    if (nodeEl && nodeEl.id) {
                        const nodeId = nodeEl.id.replace('node-', '');
                        const targetNode = computedNodes.find(n => n.id === nodeId);
                        if (targetNode) {
                            handleRoadmapNodeClick(targetNode);
                        }
                    }
                }
            }
        }

        touchMode = 'none';
        isTouchPanning = false;
        lastPinchDist = 0;
        touchTarget = null;
    } else if (e.touches.length === 1) {
        touchMode = 'pan';
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
    }
}

// ── Global spacebar panning event binding ──
let spacePressed = false;
if (typeof window._rmSpaceListenersBound === 'undefined') {
    window._rmSpaceListenersBound = true;
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            // Ignore spacebar if user is typing in an input, textarea, select, or contenteditable element
            const activeEl = document.activeElement;
            if (activeEl && (
                activeEl.tagName === 'INPUT' || 
                activeEl.tagName === 'TEXTAREA' || 
                activeEl.tagName === 'SELECT' || 
                activeEl.isContentEditable
            )) {
                return;
            }
            
            const vp = document.getElementById('roadmap-viewport');
            if (vp && document.body.contains(vp)) {
                e.preventDefault();
                spacePressed = true;
                vp.style.cursor = 'grab';
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            // Ignore spacebar if user is typing in an input, textarea, select, or contenteditable element
            const activeEl = document.activeElement;
            if (activeEl && (
                activeEl.tagName === 'INPUT' || 
                activeEl.tagName === 'TEXTAREA' || 
                activeEl.tagName === 'SELECT' || 
                activeEl.isContentEditable
            )) {
                return;
            }
            
            spacePressed = false;
            const vp = document.getElementById('roadmap-viewport');
            if (vp) vp.style.cursor = '';
        }
    });
}

/**
 * Updates canvas element transformation matrices
 */
function updateCanvasTransform() {
    const canvas = document.getElementById('roadmap-canvas');
    if (canvas) {
        canvas.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoomLevel})`;
    }
    updateMinimap();
}

/**
 * Redraws Mini-Map representing graph layout elements
 */
function updateMinimap() {
    const canvas = document.getElementById('roadmap-minimap-canvas');
    const viewportBox = document.getElementById('roadmap-minimap-viewport');
    const mainViewport = document.getElementById('roadmap-viewport');

    if (!canvas || !viewportBox || !mainViewport || computedNodes.length === 0) return;

    const ctx = canvas.getContext('2d');
    const minimapWidth = canvas.clientWidth;
    const minimapHeight = canvas.clientHeight;
    
    canvas.width = minimapWidth;
    canvas.height = minimapHeight;

    ctx.clearRect(0, 0, minimapWidth, minimapHeight);

    // Get maximum coordinates mapping scale
    const mapScale = minimapWidth / 3000; // fit 3000px virtual canvas horizontally

    // Draw lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    computedLinks.forEach(link => {
        const from = computedNodes.find(n => n.id === link.from);
        const to = computedNodes.find(n => n.id === link.to);
        if (from && to) {
            ctx.beginPath();
            ctx.moveTo(from.x * mapScale, from.y * mapScale);
            ctx.lineTo(to.x * mapScale, to.y * mapScale);
            ctx.stroke();
        }
    });

    // Draw node dots
    computedNodes.forEach(node => {
        let color = '#ccc';
        if (node.type === 'track') color = '#00F5FF';
        else if (node.type === 'phase') color = '#3B82F6';
        else if (node.type === 'course') color = '#22C45D';
        else if (node.type === 'video') color = '#9CA3AF';
        else if (node.type === 'quiz') color = '#8B5CF6';
        else if (node.type === 'project') color = '#F97316';

        ctx.fillStyle = color;
        ctx.beginPath();
        let radius = node.type === 'track' || node.type === 'phase' ? 3 : 2;
        ctx.arc(node.x * mapScale, node.y * mapScale, radius, 0, Math.PI * 2);
        ctx.fill();
    });

    // Calculate locator box dimensions
    const vw = mainViewport.clientWidth;
    const vh = mainViewport.clientHeight;

    const boxWidth = (vw / zoomLevel) * mapScale;
    const boxHeight = (vh / zoomLevel) * mapScale;
    const boxLeft = (-offsetX / zoomLevel) * mapScale;
    const boxTop = (-offsetY / zoomLevel) * mapScale;

    viewportBox.style.width = `${boxWidth}px`;
    viewportBox.style.height = `${boxHeight}px`;
    viewportBox.style.left = `${boxLeft}px`;
    viewportBox.style.top = `${boxTop}px`;
}

/**
 * Searches node title strings, highlights match and centers camera
 */
function handleRoadmapSearch(e) {
    const query = e.target.value.trim().toLowerCase();
    document.querySelectorAll('.roadmap-node').forEach(el => el.classList.remove('node-search-highlight'));

    if (!query) return;

    // Search nodes
    const matched = computedNodes.find(n => n.title.toLowerCase().includes(query) || (n.description && n.description.toLowerCase().includes(query)));
    if (matched) {
        window.selectRoadmapNodeById(matched.id);
        setTimeout(() => {
            const nodeEl = document.getElementById(`node-${matched.id}`);
            if (nodeEl) nodeEl.classList.add('node-search-highlight');
        }, 100);
    }
}

/**
 * Filter roadmap content elements based on status/difficulty
 */
function filterNodes() {
    const statusVal = document.getElementById('roadmap-filter-status').value;
    const difficultyVal = document.getElementById('roadmap-filter-difficulty').value;

    computedNodes.forEach(node => {
        const nodeEl = document.getElementById(`node-${node.id}`);
        if (!nodeEl) return;

        let statusMatch = true;
        let difficultyMatch = true;

        // Status Filter check
        if (statusVal !== 'all') {
            statusMatch = node.status === statusVal;
        }

        // Difficulty Filter check
        if (difficultyVal !== 'all') {
            difficultyMatch = String(node.difficulty).toLowerCase() === difficultyVal;
        }

        if (statusMatch && difficultyMatch) {
            nodeEl.style.opacity = '1.0';
            nodeEl.style.pointerEvents = 'auto';
        } else {
            nodeEl.style.opacity = '0.15';
            nodeEl.style.pointerEvents = 'none'; // disabled clicks
        }
    });
}

/**
 * Helper: computes completion rate of track phases
 */
function calculateTrackCompletion(data) {
    const courseIds = data.courses.map(c => c.course_id);
    const materials = data.materials.filter(m => courseIds.includes(m.course_id));
    if (materials.length === 0) return 0;

    let completed = 0;
    materials.forEach(m => {
        if (m.type === 'video' && userProgress.completedMats.has(m.content_id)) completed++;
        else if (m.type === 'quiz' && userProgress.passedQuizzes.has(m.ref_quiz_id)) completed++;
        else if (m.type === 'project' && userProgress.completedProjects.has(m.ref_project_id)) completed++;
    });

    return Math.round((completed / materials.length) * 100);
}

/**
 * Helper: determines course status
 */
function getCourseStatus(course, materials) {
    if (currentRole === 'admin') {
        const isActive = (typeof course === 'object') ? course.is_active : true;
        return isActive ? 'current' : 'locked';
    }
    const courseId = (typeof course === 'object') ? course.course_id : course;
    const courseMats = materials.filter(m => m.course_id === courseId);
    if (courseMats.length === 0) return 'locked';

    let completed = 0;
    courseMats.forEach(m => {
        if (m.type === 'video' && userProgress.completedMats.has(m.content_id)) completed++;
        else if (m.type === 'quiz' && userProgress.passedQuizzes.has(m.ref_quiz_id)) completed++;
        else if (m.type === 'project' && userProgress.completedProjects.has(m.ref_project_id)) completed++;
    });

    if (completed === courseMats.length) return 'completed';
    if (completed > 0) return 'current';
    return 'locked';
}

/**
 * Helper: determines single material status
 */
function getMaterialStatus(mat) {
    if (currentRole === 'admin') {
        const isPublished = mat.status === true || mat.is_active === true;
        return isPublished ? 'completed' : 'locked';
    }
    if (mat.type === 'video' && userProgress.completedMats.has(mat.content_id)) return 'completed';
    if (mat.type === 'quiz' && userProgress.passedQuizzes.has(mat.ref_quiz_id)) return 'completed';
    if (mat.type === 'project' && userProgress.completedProjects.has(mat.ref_project_id)) return 'completed';
    return 'current';
}

/**
 * Helper: formats duration seconds to nice string
 */
function formatDuration(seconds) {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h} ساعة ${m} د`;
    return `${m} دقيقة`;
}

/**
 * Expose global helper to select nodes from outside the roadmap engine (e.g. from active courses list clicks)
 */
window.selectInteractiveRoadmapNode = (type, dbId) => {
    let prefix = type === 'phase' ? 'phase-' : type === 'course' ? 'course-' : 'material-';
    const node = computedNodes.find(n => n.id === `${prefix}${dbId}` || n.dbId === dbId);
    if (node) {
        // Switch tab visually first if the method exists
        if (typeof window.switchTab === 'function') {
            window.switchTab('roadmap');
        }
        selectNode(node);
    }
};

window.cmMarkDocRead = async (docId, xpReward) => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        await supabase.from('document_progress').upsert({
            user_id: user.id,
            document_id: docId,
            completed: true,
            completed_at: new Date().toISOString(),
            reading_percent: 100,
            last_page: 1,
            last_accessed_at: new Date().toISOString()
        }, { onConflict: 'user_id,document_id' });
        
        const { data: docData } = await supabase.from('curriculum_documents').select('course_id').eq('id', docId).single();
        const courseId = docData?.course_id || null;
        
        await supabase.from('completed_materials').upsert({
            user_id: user.id,
            material_id: `doc_${docId}`,
            course_id: courseId,
            completed_at: new Date().toISOString()
        }, { onConflict: 'user_id,material_id' });
        
        if (xpReward && typeof window.awardXp === 'function') {
            await window.awardXp(xpReward, `قراءة مستند خارجي: ${docId}`);
        }
        
        if (typeof window.showToast === 'function') {
            window.showToast("تم تسجيل قراءة المستند والحصول على نقاط الـ XP!", "success");
        } else {
            alert("تم تسجيل قراءة المستند والحصول على نقاط الـ XP!");
        }
    } catch(err) {
        console.error("cmMarkDocRead error:", err);
    }
};
