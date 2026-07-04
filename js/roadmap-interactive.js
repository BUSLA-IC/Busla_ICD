import { supabase } from './supabase-config.js';

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
let expandedNodes = new Set();
let currentGraphData = null;

// Standard icons for different node types
const ICONS = {
    track: 'fa-map-signs',
    phase: 'fa-layer-group',
    course: 'fa-book-open',
    video: 'fa-play-circle',
    quiz: 'fa-clipboard-question',
    project: 'fa-code-branch'
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
    if (document.getElementById('roadmap-info-panel')) {
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

                <!-- Search -->
                <div class="relative w-full md:w-64">
                    <input type="text" id="roadmap-search-input" placeholder="🔍 ابحث في الخريطة..."
                           class="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:border-purple-500 outline-none">
                </div>

                <!-- Filters -->
                <div class="flex items-center gap-2">
                    <select id="roadmap-filter-status" class="bg-black/50 border border-white/10 text-xs text-white rounded-xl px-3 py-2 outline-none cursor-pointer">
                        <option value="all">كل الحالات</option>
                        <option value="completed">مكتمل</option>
                        <option value="inprogress">جاري</option>
                        <option value="locked">مغلق</option>
                    </select>
                    <select id="roadmap-filter-difficulty" class="bg-black/50 border border-white/10 text-xs text-white rounded-xl px-3 py-2 outline-none cursor-pointer">
                        <option value="all">كل المستويات</option>
                        <option value="beginner">مبتدئ</option>
                        <option value="intermediate">متوسط</option>
                        <option value="advanced">متقدم</option>
                    </select>
                </div>

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
                            <i class="fas fa-image text-green-400"></i> PNG — 1x
                        </button>
                        <button onclick="window._rmExport('png2')"
                                class="w-full text-right px-4 py-2.5 text-xs text-white hover:bg-white/5 transition-all flex items-center gap-2">
                            <i class="fas fa-image text-green-400"></i> PNG — 2x
                        </button>
                        <button onclick="window._rmExport('png4')"
                                class="w-full text-right px-4 py-2.5 text-xs text-white hover:bg-white/5 transition-all flex items-center gap-2">
                            <i class="fas fa-image text-green-400"></i> PNG — 4x
                        </button>
                        <button onclick="window._rmExport('png8')"
                                class="w-full text-right px-4 py-2.5 text-xs text-white hover:bg-white/5 transition-all flex items-center gap-2">
                            <i class="fas fa-image text-green-400"></i> PNG — 8x
                        </button>
                    </div>
                </div>
            </div>

            <!-- ── Main area: viewport + info panel ── -->
            <div style="flex:1;display:flex;overflow:hidden;position:relative;">

                <!-- ── Info Side Panel (Placed first to render on the right side in RTL layouts) ── -->
                <div id="roadmap-info-panel" class="roadmap-info-panel" style="display:none;">
                    <!-- Panel header -->
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-sm font-bold text-white" id="rm-panel-title">تفاصيل العنصر</h3>
                        <button id="rm-panel-close"
                                class="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all">
                            <i class="fas fa-times text-xs"></i>
                        </button>
                    </div>
                    <!-- Scrollable content -->
                    <div id="rm-panel-content" class="overflow-y-auto custom-scroll" style="flex:1;"></div>
                </div>

                <!-- Viewport (Placed second to render on the left side in RTL layouts) ── -->
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

    document.getElementById('roadmap-search-input').addEventListener('input', handleRoadmapSearch);
    document.getElementById('roadmap-filter-status').addEventListener('change', filterNodes);
    document.getElementById('roadmap-filter-difficulty').addEventListener('change', filterNodes);

    // Export toggle
    const exportBtn  = document.getElementById('rm-export-btn');
    const exportMenu = document.getElementById('rm-export-menu');
    exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => exportMenu.classList.add('hidden'));

    // Panel close button
    document.getElementById('rm-panel-close').addEventListener('click', closeInfoPanel);

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
}

/**
 * Handles Track selection changes
 */
async function handleTrackChange() {
    currentGraphData = null;
    expandedNodes.clear(); // reset expanded state when switching track
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
        const [trackRes, phasesRes, coursesRes, materialsRes] = await Promise.all([
            supabase.from('tracks').select('*').eq('id', trackId).single(),
            supabase.from('phases').select('*').eq('track_id', trackId).order('order_index', { ascending: true }).order('created_at', { ascending: true }),
            supabase.from('courses').select('*').order('order_index', { ascending: true }),
            supabase.from('course_materials').select('*').order('order_index', { ascending: true })
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
            materials
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
        isCollapsed: false,
        isHidden: false
    };
    computedNodes.push(trackNode);

    let lastPhaseNodeId = trackNode.id;

    // 2. Loop Phases
    // Phases are ALWAYS EXPANDED by default in this new design to keep the main path visible.
    data.phases.forEach((phase, phaseIdx) => {
        const phaseNodeId = `phase-${phase.phase_id}`;
        const isPhaseCollapsed = false;
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
            isCollapsed: isPhaseCollapsed,
            isHidden: false
        };
        computedNodes.push(phaseNode);

        lastPhaseNodeId = phaseNode.id;

        // 3. Loop Courses inside Phase
        // Courses are COLLAPSED by default unless user has explicitly expanded them
        const phaseCourses = data.courses.filter(c => c.phase_id === phase.phase_id && !c.related_with);

        phaseCourses.forEach((course) => {
            const courseNodeId = `course-${course.course_id}`;
            const isCourseCollapsed = !expandedNodes.has(courseNodeId);
            const isCourseHidden = isPhaseCollapsed; // hidden when phase is collapsed
            const courseNode = {
                id: courseNodeId,
                dbId: course.course_id,
                type: 'course',
                title: course.title,
                description: course.description,
                instructor: course.created_by || 'Busla Team',
                duration: course['Module_Time'] || course['Module Time'] || 'غير محدد',
                phaseId: phase.phase_id,
                trackId: data.track.id,
                difficulty: course.type || 'Intermediate',
                status: getCourseStatus(course, data.materials),
                videosCount: data.materials.filter(m => m.course_id === course.course_id && m.type === 'video').length,
                quizzesCount: data.materials.filter(m => m.course_id === course.course_id && m.type === 'quiz').length,
                projectsCount: data.materials.filter(m => m.course_id === course.course_id && m.type === 'project').length,
                prerequisites: course.prerequisites || [],
                rawItem: course,
                isCollapsed: isCourseCollapsed,
                isHidden: isCourseHidden
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

            // 4. Materials — chain sequentially: Course → Mat1 → Mat2 → Mat3 …
            // This eliminates the "fan" of lines all coming from the same course node.
            const courseMaterials = data.materials.filter(m => m.course_id === course.course_id);
            let lastMatNodeId = courseNode.id; // first material connects to the course
            courseMaterials.forEach((mat) => {
                const isMatHidden = isCourseHidden || isCourseCollapsed;
                const matNode = {
                    id: `material-${mat.content_id}`,
                    dbId: mat.content_id,
                    courseId: course.course_id,
                    phaseId: phase.phase_id,
                    type: mat.type || 'video',
                    title: mat.title,
                    duration: mat.duration ? formatDuration(mat.duration) : null,
                    baseXp: mat.base_xp || 10,
                    status: getMaterialStatus(mat),
                    difficulty: courseNode.difficulty,
                    author: mat.author || 'Busla Team',
                    rawItem: mat,
                    isCollapsed: false,
                    isHidden: isMatHidden
                };
                computedNodes.push(matNode);

                // Sequential chain: previous node → this material
                computedLinks.push({
                    from: lastMatNodeId,
                    to: matNode.id,
                    relationType: lastMatNodeId === courseNode.id ? 'course-to-first-mat' : 'mat-chain'
                });
                lastMatNodeId = matNode.id;
            });
        });
    });

    // 5. Build the main vertical backbone connecting visible track, phase, and course nodes in sequence
    const visibleMainNodes = computedNodes.filter(n => (n.type === 'track' || n.type === 'phase' || n.type === 'course') && !n.isHidden);
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

    // ── Canvas padding on all sides ─────────────────────────────────────────
    const PAD   = 250;   // top / left / right / bottom canvas padding (px)

    // ── Horizontal positions relative to canvas ──
    const X_CENTER = PAD + 250;              // Main Path (Track, Phase, Course) — center column
    const X_BRANCH = X_CENTER + 330;         // Materials (Video, Quiz, Project) — branch column (right)

    // ── Card heights (match CSS card sizes exactly) ──────────────────────────
    const H = { track: 96, phase: 72, course: 104, material: 74 };

    // ── Vertical gaps between nodes ──────────────────────────────────────────
    const GAP = {
        afterTrack:           90,   // Space below Track card before first Phase
        beforePhase:          60,   // Space between consecutive Phases
        phaseToFirstCourse:   60,   // Space from Phase card to first Course
        betweenCourses:       75,   // Space between consecutive Course cards
        betweenMaterials:     40,   // Space between consecutive Material cards
        afterPhaseBlock:     100,   // Extra space after the last course of a Phase
    };

    // ── Y cursor starts at top padding ───────────────────────────────────────
    let y = PAD;

    /** Advance Y by the node height and return the node's vertical center */
    function placeNode(height) {
        const cy = y + height / 2;
        y += height;
        return cy;
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

        // If collapsed → leave a small gap and skip children
        if (phase.isCollapsed) {
            y += GAP.afterPhaseBlock / 4;
            return;
        }

        const courses = computedNodes.filter(n =>
            n.type === 'course' && n.phaseId === phase.dbId && !n.isHidden);

        if (courses.length === 0) {
            y += GAP.afterPhaseBlock / 2;
            return;
        }

        y += GAP.phaseToFirstCourse;

        // ── Courses inside Phase ──────────────────────────────────────────
        courses.forEach((course, ci) => {
            if (ci > 0) y += GAP.betweenCourses;

            course.x = X_CENTER;
            course.y = placeNode(H.course);

            if (course.isCollapsed) return;

            // ── Materials (branch to the right) ───────────────────────────
            const materials = computedNodes.filter(n =>
                n.courseId === course.dbId && !n.isHidden);

            if (materials.length === 0) return;

            let matY = course.y; // first material aligns horizontally with the course center
            materials.forEach((mat, mi) => {
                mat.x = X_BRANCH;
                mat.y = matY;
                if (mi < materials.length - 1) {
                    matY += H.material + GAP.betweenMaterials;
                }
            });

            // Adjust vertical cursor to the bottom of the lowest element (course or last material card)
            const maxMatY = materials.length > 0 ? Math.max(...materials.map(m => m.y)) : course.y;
            const branchBottom = maxMatY + H.material / 2;
            const courseBottom = course.y + H.course / 2;
            y = Math.max(courseBottom, branchBottom);
        });

        y += GAP.afterPhaseBlock;
    });

    // ── Set canvas dimensions AFTER all nodes are placed ─────────────────────
    // Height = final Y cursor + bottom padding
    const totalHeight = y + PAD;
    // Width  = material column right-edge + right padding
    const totalWidth  = X_BRANCH + 120 + PAD;   // 120 = half material card width

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

        nodeEl.className = `roadmap-node ${typeClass} ${lockedClass} ${collapsedClass}`;
        nodeEl.style.left = `${node.x}px`;
        nodeEl.style.top = `${node.y}px`;

        // Build card HTML with collapse toggle only for course nodes with materials
        let collapseBtn = '';
        const hasMaterials = node.type === 'course' && computedNodes.some(n => n.courseId === node.dbId);

        if (hasMaterials) {
            const icon = node.isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';
            const tip  = node.isCollapsed ? 'فتح الفروع' : 'طي الفروع';
            collapseBtn = `
                <button class="roadmap-collapse-btn" data-node-id="${node.id}" title="${tip}" onclick="event.stopPropagation(); window._roadmapToggleCollapse('${node.id}')"
                    style="position:absolute;top:6px;left:6px;width:20px;height:20px;border-radius:50%;
                           background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);
                           display:flex;align-items:center;justify-content:center;cursor:pointer;
                           color:#9ca3af;font-size:9px;z-index:10;transition:all 0.2s">
                    <i class="fas ${icon}"></i>
                </button>`;
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

        // Click = select node (details panel / admin modal)
        nodeEl.addEventListener('click', (e) => {
            e.stopPropagation();
            selectNode(node);
        });

        container.appendChild(nodeEl);
    });

    // Expose global toggle function
    // expandedNodes is INVERTED: nodes are collapsed by default.
    // Toggle adds/removes from expandedNodes to mark a node as explicitly open.
    window._roadmapToggleCollapse = function(nodeId) {
        if (expandedNodes.has(nodeId)) {
            expandedNodes.delete(nodeId); // collapse it
        } else {
            expandedNodes.add(nodeId);    // expand it
        }
        // Rebuild graph with new state (data cached — no network call)
        buildGraphStructure(currentGraphData);
        calculateGraphLayout();
        renderHtmlNodes();
        renderSvgLines();
        requestAnimationFrame(updateMinimap);
    };
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
                <div class="w-10 h-10 rounded-xl bg-[#006A67]/20 flex items-center justify-center border border-[#006A67]/30 text-[#00F5FF]">
                    <i class="fas ${icon} text-lg"></i>
                </div>
                <div class="flex-1 min-w-0 text-right">
                    <span class="text-[9px] text-gray-400 font-bold uppercase tracking-widest block mb-0.5">مسار تعليمي</span>
                    <h4 class="font-bold text-white text-sm truncate">${node.title}</h4>
                </div>
            </div>
            <div class="mt-3 flex items-center justify-between text-[10px] text-gray-400 border-t border-white/5 pt-2">
                <span>المراحل: ${node.phasesCount}</span>
                <span class="text-[#00F5FF] font-bold">إكمال: ${node.completionRate}%</span>
            </div>
        `;
    }

    if (node.type === 'phase') {
        return `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
                    <i class="fas ${icon} text-lg"></i>
                </div>
                <div class="flex-1 min-w-0 text-right">
                    <span class="text-[9px] text-blue-400 font-bold uppercase tracking-widest block mb-0.5">المرحلة ${node.orderIndex}</span>
                    <h4 class="font-bold text-white text-sm truncate">${node.title}</h4>
                </div>
            </div>
            <div class="mt-3 flex items-center justify-between text-[10px] text-gray-400 border-t border-white/5 pt-2">
                <span>الوقت: ${node.time || 'مرن'}</span>
                <span>كورس: ${node.coursesCount}</span>
            </div>
        `;
    }

    if (node.type === 'course') {
        // Leader activation indicator check
        let isPlanActive = false;
        if (window.currentTeam && Array.isArray(window.currentTeam.courses_plan)) {
            isPlanActive = window.currentTeam.courses_plan.includes(String(node.dbId));
        }

        return `
            <div class="flex items-center justify-between gap-2 mb-2">
                <span class="text-[9px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 uppercase tracking-widest font-bold">كورس</span>
                <div class="flex items-center">
                    ${isPlanActive ? `<span class="bg-teal-500/10 text-teal-400 text-[9px] px-1.5 py-0.5 rounded border border-teal-500/25 ml-2 font-bold"><i class="fas fa-unlock"></i> مفعل</span>` : ''}
                    ${statusBadge}
                </div>
            </div>
            <h4 class="font-bold text-white text-sm line-clamp-2 text-right mb-3">${node.title}</h4>
            <div class="grid grid-cols-3 gap-1.5 text-[9px] text-gray-400 border-t border-white/5 pt-2 text-center">
                <div><i class="fas fa-play text-blue-400 ml-0.5"></i> ${node.videosCount}</div>
                <div><i class="fas fa-clipboard-question text-purple-400 ml-0.5"></i> ${node.quizzesCount}</div>
                <div><i class="fas fa-code-branch text-orange-400 ml-0.5"></i> ${node.projectsCount}</div>
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
            <div class="flex-shrink-0 w-9 h-9 rounded-xl ${typeBg} flex items-center justify-center border ${typeBorder} ${typeColor}">
                <i class="fas ${icon} text-sm"></i>
            </div>
            <div class="flex-grow min-w-0">
                <div class="flex items-center justify-between gap-1 mb-0.5">
                    <span class="text-[8px] font-bold uppercase tracking-wider ${typeColor}">${typeLabel}</span>
                    ${statusBadge}
                </div>
                <p class="font-semibold text-white text-xs leading-snug line-clamp-2 text-right">${node.title}</p>
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
 *            Card widths: track=320, phase=300, course=260, material=240.
 */
function renderSvgLines() {
    const svg = document.getElementById('roadmap-svg');
    if (!svg) return;
    svg.innerHTML = '';

    // ── Full card widths (px) — must match CSS .node-* width rules ──
    const CW = { track: 320, phase: 300, course: 260, material: 240 };
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
        // Sit in the same X column — draw a clean straight vertical line.
        if (link.relationType === 'core') {
            addPath(`M ${fnCx} ${fnBottom} V ${tnTop}`, 'link-backbone', false);
            return;
        }

        // ── Course → First Material (branch elbow backbone + first leaf) ──
        if (link.relationType === 'course-to-first-mat') {
            const startX = rx(fn);                // right edge of Course card
            const branchLineX = fn.x + 170;       // branch guide line X position
            const matLeftX = lx(tn);             // left edge of material card

            // Find all visible materials belonging to this Course to know the vertical extent
            const materials = computedNodes.filter(m => m.courseId === fn.dbId && !m.isHidden);
            const lastMatY = materials.length > 0 ? Math.max(...materials.map(m => m.y)) : fn.y;

            console.log("DEBUG SVG:", {
                courseId: fn.dbId,
                courseType: fn.type,
                fnId: fn.id,
                materialsCount: materials.length,
                lastMatY: lastMatY,
                firstMatY: tn.y,
                materialsList: materials.map(m => ({ id: m.id, title: m.title.slice(0, 20), y: m.y }))
            });

            // 1. Draw Course branch backbone (horizontal out, then vertical down to last material Y)
            addPath(`M ${startX} ${fn.y} H ${branchLineX} V ${lastMatY}`, 'link-course-branch', false);

            // 2. Draw first leaf connection (horizontal from branch line to first material left edge)
            addPath(`M ${branchLineX} ${tn.y} H ${matLeftX}`, 'link-course-branch', false);
            return;
        }

        // ── Material → Material (subsequent leaves of the branch) ──
        if (link.relationType === 'mat-chain') {
            const branchLineX = tn.x - 160;       // X position of the branch line (tn is at X_BRANCH)
            const matLeftX = lx(tn);             // left edge of material card
            
            // Draw leaf connection from branch guide line to material left edge
            addPath(`M ${branchLineX} ${tn.y} H ${matLeftX}`, 'link-course-branch', false);
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
// INFO SIDE PANEL
// ============================================================

/**
 * Exposes _rmShowInfo globally (called from inline onclick on nodes)
 */
function initInfoPanelGlobals() {
    window._rmShowInfo = function(nodeId) {
        const node = computedNodes.find(n => n.id === nodeId);
        if (node) showNodeInfoPanel(node);
    };
}

/** Open the info panel and populate it for the given node */
function showNodeInfoPanel(node) {
    const panel = document.getElementById('roadmap-info-panel');
    const titleEl = document.getElementById('rm-panel-title');
    const contentEl = document.getElementById('rm-panel-content');
    if (!panel || !contentEl) return;

    titleEl.textContent = node.title || 'تفاصيل العنصر';
    contentEl.innerHTML = buildInfoPanelHTML(node);
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';

    // Make relationship links clickable (pan to node)
    contentEl.querySelectorAll('[data-jump-node]').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.jumpNode;
            const target = computedNodes.find(n => n.id === targetId);
            if (target) panToNode(target);
        });
    });
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
                <img src="${node.rawItem.thumbnail_url}" class="w-full h-24 object-cover" onerror="this.style.display='none'">
            </div>`;
        }
    }

    if (node.type === 'video') {
        const raw = node.rawItem || {};
        html += row('الرابط', raw.url ? `<a href="${raw.url}" target="_blank" class="text-cyan-400 hover:underline">رابط ↗</a>` : '—');
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

/** Calculate the exact bounding box of the visible roadmap tree nodes */
function getRoadmapBounds(padding = 50) {
    // Exact half-widths and half-heights matching CSS/Layout
    const HW = { track: 160, phase: 150, course: 130, material: 120 };
    const HH = { track: 48,  phase: 36,  course: 52,  material: 37  };

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    const visibleNodes = computedNodes.filter(n => !n.isHidden);
    if (visibleNodes.length === 0) {
        return { x: 0, y: 0, w: 3000, h: 3000 };
    }

    visibleNodes.forEach(node => {
        const hw = HW[node.type] || 130;
        const hh = HH[node.type] || 40;
        if (node.x - hw < minX) minX = node.x - hw;
        if (node.x + hw > maxX) maxX = node.x + hw;
        if (node.y - hh < minY) minY = node.y - hh;
        if (node.y + hh > maxY) maxY = node.y + hh;
    });

    const x = Math.max(0, Math.floor(minX - padding));
    const y = Math.max(0, Math.floor(minY - padding));
    const w = Math.ceil((maxX - minX) + padding * 2);
    const h = Math.ceil((maxY - minY) + padding * 2);

    return { x, y, w, h };
}

/** Centers the graph viewport on the bounds of the tree without altering zoom */
function centerGraph() {
    const viewport = document.getElementById('roadmap-viewport');
    if (!viewport || computedNodes.length === 0) return;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;

    // Full card widths and heights
    const CW = { track: 320, phase: 300, course: 260, material: 240 };
    const HH = { track: 48,  phase: 36,  course: 52,  material: 37  };

    const visibleNodes = computedNodes.filter(n => !n.isHidden && n.x !== undefined && n.y !== undefined);
    if (visibleNodes.length === 0) return;

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

    const graphCenterX = (minX + maxX) / 2;
    const graphCenterY = (minY + maxY) / 2;

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

    const bounds = getRoadmapBounds(60);

    // Build a root SVG
    const ns   = 'http://www.w3.org/2000/svg';
    const root = document.createElementNS(ns, 'svg');
    root.setAttribute('xmlns', ns);
    root.setAttribute('xmlns:xhtml', 'http://www.w3.org/1999/xhtml');
    root.setAttribute('width',   bounds.w);
    root.setAttribute('height',  bounds.h);
    root.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);

    // Dark background
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('x', bounds.x);
    bg.setAttribute('y', bounds.y);
    bg.setAttribute('width', bounds.w);
    bg.setAttribute('height', bounds.h);
    bg.setAttribute('fill', '#050505');
    root.appendChild(bg);

    // Clone SVG paths (connection lines)
    const pathsClone = svgLayer.cloneNode(true);
    root.appendChild(pathsClone);

    // Embed each HTML node as foreignObject
    nodesContainer.querySelectorAll('.roadmap-node').forEach(el => {
        const left   = parseFloat(el.style.left) || 0;
        const top    = parseFloat(el.style.top)  || 0;
        const w = el.offsetWidth  || 260;
        const h = el.offsetHeight || 80;

        const fo = document.createElementNS(ns, 'foreignObject');
        fo.setAttribute('x', left - w / 2);
        fo.setAttribute('y', top  - h / 2);
        fo.setAttribute('width',  w);
        fo.setAttribute('height', h);

        const body = document.createElement('div');
        body.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        body.style.cssText = el.style.cssText;
        body.style.position = 'relative';
        body.style.width  = w + 'px';
        body.style.height = h + 'px';
        body.innerHTML = el.innerHTML;

        fo.appendChild(body);
        root.appendChild(fo);
    });

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

    const canvas = document.getElementById('roadmap-canvas');
    if (!canvas) throw new Error('لم يتم العثور على الكانفاس');

    const bounds = getRoadmapBounds(60);

    const h2c = await window.html2canvas(canvas, {
        scale,
        backgroundColor: '#050505',
        useCORS: true,
        allowTaint: true,
        logging: false,
        x: bounds.x,
        y: bounds.y,
        width: bounds.w,
        height: bounds.h,
    });

    const blob = await new Promise(res => h2c.toBlob(res, 'image/png'));
    _rmDownload(blob, `roadmap-busla-${scale}x.png`);
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
// ── Standard select node action ──
// ============================================================

/**
 * Standard select node click action
 */
function selectNode(node) {
    // Remove previous selection states
    document.querySelectorAll('.roadmap-node').forEach(el => el.classList.remove('node-active-selection'));
    document.querySelectorAll('.roadmap-link').forEach(el => el.classList.remove('highlighted-link'));

    activeNode = node;

    // Highlight clicked card
    const nodeEl = document.getElementById(`node-node-${node.id}`);
    if (nodeEl) nodeEl.classList.add('node-active-selection');

    // Highlight relationships/links attached to this node
    highlightRelationships(node.id);

    // Update details side panel or trigger admin details modal
    if (currentRole === 'admin') {
        if (typeof window.cmShowInfo === 'function') {
            window.cmShowInfo(node.dbId);
        }
    } else {
        showSidebarDetails(node);
    }

    // Pan camera smoothly to center this node
    panToNode(node);
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
 * Handles sidebar details loading
 */
function showSidebarDetails(node) {
    const placeholder = document.getElementById('node-details-placeholder');
    const content = document.getElementById('node-details-content');
    if (!content) return;

    if (placeholder) placeholder.classList.add('hidden');
    content.classList.remove('hidden');

    // 1. Breadcrumb calculation
    const breadcrumb = getBreadcrumbPath(node);
    
    // 2. Render details panel dynamically
    content.innerHTML = `
        <!-- Breadcrumb -->
        <div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-4 flex items-center gap-1.5 flex-row-reverse">
            ${breadcrumb.map((b, idx) => `
                <span>${b}</span>
                ${idx < breadcrumb.length - 1 ? '<i class="fas fa-chevron-left text-[8px] opacity-50"></i>' : ''}
            `).join('')}
        </div>

        <!-- Banner Header -->
        <div class="relative w-full h-44 shrink-0 rounded-2xl overflow-hidden mb-5 border border-white/10 shadow-2xl">
            <img src="${node.image_url ? node.image_url : '../assets/images/1.jpg'}" 
                 class="w-full h-full object-cover" onerror="this.src='../assets/icons/BUSLA-icon.png'">
            <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
            <span class="absolute top-4 right-4 bg-b-primary/95 backdrop-blur text-white text-[9px] px-2.5 py-1 rounded-lg font-black tracking-widest border border-white/20 uppercase">
                ${node.type}
            </span>
        </div>

        <!-- Info Body -->
        <div class="space-y-5 flex-1 pr-1">
            <h2 class="text-2xl font-black text-white leading-tight font-heading">${node.title}</h2>
            <p class="text-sm text-gray-300 leading-relaxed text-right">${node.description || 'لا يوجد وصف مضاف حالياً لهذا العنصر.'}</p>
            
            <!-- Metadata Grid -->
            <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center text-sm"><i class="fas fa-chalkboard-teacher"></i></div>
                    <div class="min-w-0">
                        <span class="text-[9px] text-gray-500 block">المدرس</span>
                        <span class="text-white font-bold truncate block">${node.instructor || node.author || 'Busla Team'}</span>
                    </div>
                </div>

                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-green-500/15 text-green-400 flex items-center justify-center text-sm"><i class="far fa-clock"></i></div>
                    <div class="min-w-0">
                        <span class="text-[9px] text-gray-500 block">المدة</span>
                        <span class="text-white font-bold truncate block">${node.duration || 'مرنة'}</span>
                    </div>
                </div>

                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center text-sm"><i class="fas fa-fire"></i></div>
                    <div class="min-w-0">
                        <span class="text-[9px] text-gray-500 block">نقاط XP</span>
                        <span class="text-white font-bold block">${node.baseXp || (node.videosCount * 10) || 50} XP</span>
                    </div>
                </div>

                <div class="bg-white/5 border border-white/10 p-2.5 rounded-xl flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center text-sm"><i class="fas fa-brain"></i></div>
                    <div class="min-w-0">
                        <span class="text-[9px] text-gray-500 block">المستوى</span>
                        <span class="text-white font-bold block">${node.difficulty || 'Intermediate'}</span>
                    </div>
                </div>
            </div>

            <!-- Mini Roadmap (If Course node) -->
            ${node.type === 'course' ? `
                <div class="border-t border-white/5 pt-4">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <i class="fas fa-sitemap text-b-primary"></i> خريطة الكورس المصغرة (Mini Roadmap)
                    </h4>
                    <div class="mini-roadmap-container">
                        ${renderMiniRoadmap(node.dbId)}
                    </div>
                </div>
            ` : ''}

            <!-- Prerequisites list -->
            ${node.type === 'course' && node.prerequisites.length > 0 ? `
                <div class="border-t border-white/5 pt-4 text-right">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">المتطلبات السابقة:</h4>
                    <div class="flex flex-wrap gap-2 justify-end">
                        ${node.prerequisites.map(p => {
                            const name = typeof p === 'string' ? p : p.course_id;
                            const matched = computedNodes.find(n => n.dbId === name);
                            return `<span class="bg-white/5 border border-white/10 text-[10px] px-2 py-1 rounded">${matched ? matched.title : name}</span>`;
                        }).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- Action buttons area -->
            <div class="border-t border-white/5 pt-4 mt-6" id="roadmap-action-buttons">
                ${renderActionButtons(node)}
            </div>
        </div>
    `;
}

/**
 * Compares and gathers the path hierarchy to construct breadcrumbs
 */
function getBreadcrumbPath(node) {
    const path = [];
    if (node.type === 'material') {
        const parentCourse = computedNodes.find(n => n.dbId === node.courseId && n.type === 'course');
        if (parentCourse) {
            const parentPhase = computedNodes.find(n => n.dbId === parentCourse.phaseId && n.type === 'phase');
            if (parentPhase) {
                const track = computedNodes.find(n => n.type === 'track');
                if (track) path.push(track.title);
                path.push(`المرحلة ${parentPhase.orderIndex}`);
            }
            path.push(parentCourse.title);
        }
        path.push(node.title);
    } else if (node.type === 'course') {
        const parentPhase = computedNodes.find(n => n.dbId === node.phaseId && n.type === 'phase');
        if (parentPhase) {
            const track = computedNodes.find(n => n.type === 'track');
            if (track) path.push(track.title);
            path.push(`المرحلة ${parentPhase.orderIndex}`);
        }
        path.push(node.title);
    } else if (node.type === 'phase') {
        const track = computedNodes.find(n => n.type === 'track');
        if (track) path.push(track.title);
        path.push(`المرحلة ${node.orderIndex}`);
    } else {
        path.push(node.title);
    }
    return path;
}

/**
 * Builds HTML for course contents mini roadmap list
 */
function renderMiniRoadmap(courseId) {
    const materials = computedNodes.filter(n => n.courseId === courseId);
    if (materials.length === 0) {
        return '<p class="text-xs text-gray-500 italic">لا توجد دروس أو كويزات مضافة للكورس حالياً.</p>';
    }

    return materials.map((mat) => {
        let isCompleted = mat.status === 'completed';
        let stepClass = isCompleted ? 'step-completed' : mat.status === 'current' ? 'step-current' : 'step-locked';
        let statusIcon = isCompleted ? '<i class="fas fa-check text-green-500"></i>' : mat.type === 'video' ? '<i class="far fa-play-circle text-gray-400"></i>' : mat.type === 'quiz' ? '<i class="fas fa-clipboard-question text-purple-400"></i>' : '<i class="fas fa-code-branch text-orange-400"></i>';

        return `
            <div class="mini-roadmap-step ${stepClass}" onclick="window.selectRoadmapNodeById('${mat.id}')">
                <div class="mini-roadmap-dot"></div>
                <div class="mini-roadmap-content">
                    <div class="flex items-center gap-2">
                        <span class="text-white text-xs font-bold line-clamp-1">${mat.title}</span>
                    </div>
                    <div class="shrink-0 pl-2">
                        ${statusIcon}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Bind global selector callback so mini-roadmap items can click to jump
window.selectRoadmapNodeById = (nodeId) => {
    const matched = computedNodes.find(n => n.id === nodeId);
    if (matched) {
        selectNode(matched);
    }
};

/**
 * Renders the panel buttons dynamically based on roles and selection
 */
function renderActionButtons(node) {
    let html = '';

    if (node.type === 'course') {
        const isActive = window.currentTeam && Array.isArray(window.currentTeam.courses_plan) && window.currentTeam.courses_plan.includes(String(node.dbId));

        if (currentRole === 'leader') {
            // Activate toggle switch for Leader
            html += `
                <div class="flex flex-col gap-3">
                    <div class="flex items-center justify-between bg-white/5 border border-white/10 p-3 rounded-xl">
                        <span class="text-xs text-gray-300 font-bold">تفعيل الكورس للفريق:</span>
                        <div class="relative flex items-center justify-center">
                            <input type="checkbox" id="course-toggle-activation" 
                                   class="appearance-none w-10 h-5 rounded-full bg-white/10 checked:bg-green-500 transition-all cursor-pointer relative"
                                   ${isActive ? 'checked' : ''}>
                        </div>
                    </div>
                    <a href="course-player.html?id=${node.dbId}" class="w-full bg-b-primary hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2">
                        <i class="fas fa-play"></i> فتح الكورس
                    </a>
                </div>
            `;
            
            // Set listener on check toggle asynchronously after rendering
            setTimeout(() => {
                const chk = document.getElementById('course-toggle-activation');
                if (chk) {
                    chk.addEventListener('change', (e) => {
                        if (typeof window.toggleActivate === 'function') {
                            window.toggleActivate(String(node.dbId), e.target.checked);
                        }
                    });
                }
            }, 50);
        } else {
            // Student View open course player
            html += `
                <div class="flex flex-col gap-3">
                    <a href="course-player.html?id=${node.dbId}" class="w-full bg-b-primary hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2">
                        <i class="fas fa-play"></i> فتح الكورس في المشغل
                    </a>
                    ${!isActive ? `<p class="text-[10px] text-yellow-500 text-center"><i class="fas fa-lock mr-1"></i> الكورس غير مفعل من قائد الفريق، لكن يمكنك تصفحه.</p>` : ''}
                </div>
            `;
        }
    } else if (node.type === 'material') {
        // Direct link to material player
        html += `
            <a href="course-player.html?id=${node.courseId}&content=${node.dbId}" class="w-full bg-b-primary hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2">
                <i class="fas fa-external-link-alt"></i> ابدأ الدراسة الآن
            </a>
        `;
    } else {
        html += `<p class="text-xs text-gray-500 text-center">حدد كورس أو مادة دراسية لبدء التعلم.</p>`;
    }

    return html;
}

/**
 * Smooth pan view to target node coordinate
 */
function panToNode(node) {
    const viewport = document.getElementById('roadmap-viewport');
    if (!viewport) return;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;

    // Calculate translation offset centering node
    offsetX = vw / 2 - node.x * zoomLevel;
    offsetY = vh / 2 - node.y * zoomLevel;

    updateCanvasTransform();
}

/**
 * Adjust Zoom Scale
 */
/**
 * Adjust Zoom Scale
 */
function adjustZoom(delta) {
    const oldZoom = zoomLevel;
    zoomLevel += delta;
    zoomLevel = Math.max(0.15, Math.min(3.0, zoomLevel)); // extended boundary cap

    const viewport = document.getElementById('roadmap-viewport');
    if (viewport) {
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;

        // Offset panning shift to zoom relative to center
        offsetX = vw / 2 - ((vw / 2 - offsetX) / oldZoom) * zoomLevel;
        offsetY = vh / 2 - ((vh / 2 - offsetY) / oldZoom) * zoomLevel;
    }

    updateCanvasTransform();
}

/**
 * Fits entire roadmap tree perfectly in view dimensions, centered.
 * node.x = LEFT EDGE, node.y = CENTER; uses full card widths for bounds.
 */
function fitRoadmapToScreen() {
    const viewport = document.getElementById('roadmap-viewport');
    const canvas   = document.getElementById('roadmap-canvas');
    if (!viewport || !canvas || computedNodes.length === 0) return;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw === 0 || vh === 0) return;

    // Full card widths (node.x is left-edge, so right-edge = node.x + CW)
    const CW = { track: 320, phase: 300, course: 260, material: 240 };
    const HH = { track: 44,  phase: 35,  course: 46,  material: 32  };

    const visibleNodes = computedNodes.filter(n => !n.isHidden && n.x !== undefined && n.y !== undefined);
    if (visibleNodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    visibleNodes.forEach(node => {
        const hw = (CW[node.type] || 260) / 2;
        const hh = HH[node.type] || 40;
        if (node.x - hw < minX) minX = node.x - hw;     // left  edge
        if (node.x + hw > maxX) maxX = node.x + hw;     // right edge
        if (node.y - hh < minY) minY = node.y - hh;     // top   edge
        if (node.y + hh > maxY) maxY = node.y + hh;     // bottom edge
    });

    const graphW = maxX - minX;
    const graphH = maxY - minY;
    if (graphW <= 0 || graphH <= 0) return;

    // Fit zoom so the entire tree is visible with comfortable margin
    const MARGIN = 60;
    zoomLevel = Math.max(0.15, Math.min(0.85,
        Math.min((vw - MARGIN * 2) / graphW, (vh - MARGIN * 2) / graphH)
    ));

    // True center of the tree content (canvas coordinates)
    const graphCenterX = (minX + maxX) / 2;
    const graphCenterY = (minY + maxY) / 2;

    // Map that center to the viewport center
    offsetX = vw / 2 - graphCenterX * zoomLevel;
    offsetY = vh / 2 - graphCenterY * zoomLevel;

    updateCanvasTransform();
}

/**
 * Resets Zoom and Panning offsets
 */
function resetRoadmapView() {
    zoomLevel = 1.0;
    offsetX = 0;
    offsetY = 0;
    updateCanvasTransform();
}

/**
 * Mouse events dragging/panning viewport
 */
function startPanning(e) {
    // Left click (0) or Middle click (1) only
    if (e.button !== 0 && e.button !== 1) return;

    if (e.button === 1) {
        e.preventDefault(); // prevent auto scroll on middle mouse click
    }

    // Don't initiate pan on left click if click target is inside a node and spacebar is NOT held down
    if (e.button === 0 && !spacePressed) {
        if (e.target.closest('.roadmap-node') || e.target.closest('.roadmap-controls') || e.target.closest('.roadmap-minimap')) return;
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
    updateCanvasTransform();
}

function stopPanning() {
    isDragging = false;
    const vp = document.getElementById('roadmap-viewport');
    if (vp) vp.style.cursor = spacePressed ? 'grab' : '';
}

/**
 * Zoom on mousewheel
 */
function handleMouseWheel(e) {
    e.preventDefault();
    
    // Smooth scroll wheel delta
    const zoomDelta = e.deltaY < 0 ? 0.08 : -0.08;
    
    const oldZoom = zoomLevel;
    zoomLevel += zoomDelta;
    zoomLevel = Math.max(0.15, Math.min(3.0, zoomLevel)); // extended clamp bounds

    const viewport = document.getElementById('roadmap-viewport');
    const rect = viewport.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    offsetX = cursorX - ((cursorX - offsetX) / oldZoom) * zoomLevel;
    offsetY = cursorY - ((cursorY - offsetY) / oldZoom) * zoomLevel;

    updateCanvasTransform();
}

// ── Touch interaction event handlers (Tablet Pinch & Drag) ──
let initialPinchDist = 0;
let initialZoom = 1.0;
let pinchMidX = 0;
let pinchMidY = 0;
let isTouchPanning = false;

function handleTouchStart(e) {
    if (e.touches.length === 1) {
        // Single finger pan
        const touch = e.touches[0];
        isTouchPanning = true;
        startX = touch.clientX - offsetX;
        startY = touch.clientY - offsetY;
        const canvas = document.getElementById('roadmap-canvas');
        if (canvas) canvas.style.transition = 'none';
    } else if (e.touches.length === 2) {
        // Two finger pinch zoom
        isTouchPanning = false;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        initialPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        initialZoom = zoomLevel;
        pinchMidX = (t1.clientX + t2.clientX) / 2;
        pinchMidY = (t1.clientY + t2.clientY) / 2;
    }
}

function handleTouchMove(e) {
    if (e.touches.length === 1 && isTouchPanning) {
        e.preventDefault(); // prevent background page scroll
        const touch = e.touches[0];
        offsetX = touch.clientX - startX;
        offsetY = touch.clientY - startY;
        updateCanvasTransform();
    } else if (e.touches.length === 2) {
        e.preventDefault(); // prevent browser native pinch-to-zoom
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (initialPinchDist > 0) {
            const scale = currentDist / initialPinchDist;
            const oldZoom = zoomLevel;
            zoomLevel = Math.max(0.15, Math.min(3.0, initialZoom * scale));

            const viewport = document.getElementById('roadmap-viewport');
            const rect = viewport.getBoundingClientRect();
            const midX = pinchMidX - rect.left;
            const midY = pinchMidY - rect.top;

            offsetX = midX - ((midX - offsetX) / oldZoom) * zoomLevel;
            offsetY = midY - ((midY - offsetY) / oldZoom) * zoomLevel;

            updateCanvasTransform();
        }
    }
}

function handleTouchEnd(e) {
    isTouchPanning = false;
    initialPinchDist = 0;
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
        const nodeEl = document.getElementById(`node-node-${matched.id}`);
        if (nodeEl) nodeEl.classList.add('node-search-highlight');
        
        // Center camera viewport smoothly on the matching node
        selectNode(matched);
    }
}

/**
 * Filter roadmap content elements based on status/difficulty
 */
function filterNodes() {
    const statusVal = document.getElementById('roadmap-filter-status').value;
    const difficultyVal = document.getElementById('roadmap-filter-difficulty').value;

    computedNodes.forEach(node => {
        const nodeEl = document.getElementById(`node-node-${node.id}`);
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
