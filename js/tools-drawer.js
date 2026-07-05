/**
 * BUSLA LMS - Global Tools Detail Modal Utility
 * This file dynamically injects a premium center floating modal into the document
 * to display complete tool details and analytics.
 * Accessible globally via window.openToolDetailDrawer(toolId).
 */

(async () => {
    // 1. Dynamic path prefix (used only for icon fallbacks if needed)
    let pathPrefix = './';
    const loc = window.location.pathname;
    if (loc.includes('/admin/html/')) {
        pathPrefix = '../../';
    } else if (loc.includes('/pages/') || loc.includes('/admin/')) {
        pathPrefix = '../';
    }

    // 2. Import Supabase Client dynamically
    let supabase;
    try {
        const configModule = await import('./supabase-config.js');
        supabase = configModule.supabase;
    } catch (err) {
        console.error("Tools Drawer: Failed to import Supabase config.", err);
    }

    // Cache for track names mapping
    let tracksCache = null;
    async function getTrackNames(trackIds) {
        if (!supabase) return [];
        if (!tracksCache) {
            try {
                const { data } = await supabase.from('tracks').select('id, name').eq('is_active', true);
                if (data) {
                    tracksCache = {};
                    data.forEach(t => {
                        tracksCache[t.id] = t.name;
                    });
                }
            } catch (e) {
                console.error("Error fetching tracks:", e);
            }
        }
        if (!tracksCache) return [];
        return (trackIds || []).map(id => tracksCache[id]).filter(Boolean);
    }

    // 3. Inject CSS styling for modal animations if not already present
    if (!document.getElementById('tools-drawer-styles')) {
        const style = document.createElement('style');
        style.id = 'tools-drawer-styles';
        style.innerHTML = `
            /* Background dim and blur backdrop */
            #tool-detail-drawer-overlay {
                background-color: rgba(0, 0, 0, 0);
                backdrop-filter: blur(0px);
                transition: background-color 0.3s ease, backdrop-filter 0.3s ease, opacity 0.3s ease;
                opacity: 0;
            }
            #tool-detail-drawer-overlay.active {
                background-color: rgba(0, 0, 0, 0.85) !important;
                backdrop-filter: blur(12px) !important;
                opacity: 1 !important;
            }
            
            /* Premium floating modal container */
            #tool-detail-drawer {
                transform: scale(0.95) translateY(10px);
                opacity: 0;
                transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease, border-color 0.3s ease;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
            }
            #tool-detail-drawer.active {
                transform: scale(1) translateY(0) !important;
                opacity: 1 !important;
            }
            
            /* Smooth custom scrolling for tabs & lists */
            .custom-scroll::-webkit-scrollbar {
                width: 6px;
                height: 6px;
            }
            .custom-scroll::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.02);
                border-radius: 10px;
            }
            .custom-scroll::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 10px;
            }
            .custom-scroll::-webkit-scrollbar-thumb:hover {
                background: #00dec8;
            }
            
            /* Active tab indicator styles */
            .tools-tab-btn {
                position: relative;
                transition: color 0.3s ease;
            }
            .tools-tab-btn::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                width: 0;
                height: 2.5px;
                background: #00dec8;
                box-shadow: 0 0 10px rgba(0, 222, 200, 0.5);
                transition: width 0.3s ease;
            }
            .tools-tab-btn.active {
                color: #00dec8 !important;
            }
            .tools-tab-btn.active::after {
                width: 100%;
            }
            
            /* Tablet layout overrides */
            @media (min-width: 768px) and (max-width: 1024px) {
                #tool-detail-drawer {
                    max-width: 85vw !important;
                    height: 80vh !important;
                }
            }
            
            /* Mobile full screen overrides */
            @media (max-width: 767px) {
                #tool-detail-drawer-overlay {
                    padding: 0px !important;
                }
                #tool-detail-drawer {
                    width: 100% !important;
                    height: 100% !important;
                    max-height: 100vh !important;
                    max-width: 100vw !important;
                    border-radius: 0px !important;
                    border: none !important;
                    transform: translateY(100%);
                    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
                }
                #tool-detail-drawer.active {
                    transform: translateY(0) !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // 4. Inject HTML Modal markup into the body if not already present
    let drawerOverlay = document.getElementById('tool-detail-drawer-overlay');
    if (!drawerOverlay) {
        drawerOverlay = document.createElement('div');
        drawerOverlay.id = 'tool-detail-drawer-overlay';
        drawerOverlay.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] hidden transition-all duration-300 opacity-0 flex items-center justify-center p-4 md:p-6 lg:p-10';
        drawerOverlay.innerHTML = `
            <div id="tool-detail-drawer" class="w-full h-full max-h-[85vh] md:max-h-[80vh] lg:max-h-[85vh] max-w-full md:max-w-[85vw] lg:max-w-[75vw] bg-b-surface border border-white/10 rounded-2xl flex flex-col shadow-2xl relative overflow-hidden transition-all duration-300">
                <!-- Header -->
                <div class="p-6 border-b border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 bg-black/40">
                    <div class="flex items-center gap-4 text-right">
                        <div class="w-16 h-16 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                            <img id="td-logo" src="" alt="logo" class="w-full h-full object-contain p-1.5 error-fallback">
                        </div>
                        <div class="space-y-1">
                            <div class="flex flex-wrap items-center gap-2 justify-end md:justify-start">
                                <h2 id="td-name" class="font-black text-xl md:text-2xl text-white tracking-wide">...</h2>
                                <span id="td-badge-importance" class="text-[9px] font-black border px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border-teal-500/20">...</span>
                                <span id="td-badge-status" class="text-[9px] font-black border px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border-emerald-500/20">...</span>
                            </div>
                            <p id="td-subtitle" class="text-xs md:text-sm text-gray-400">...</p>
                            <div class="flex flex-wrap gap-2 text-[10px] text-gray-500 font-mono">
                                <span id="td-track-name">المسار: جاري التحميل...</span>
                                <span>•</span>
                                <span id="td-updated-at">تحديث: --/--/----</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-2.5 w-full md:w-auto justify-end">
                        <a id="td-header-website-btn" href="#" target="_blank" class="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-lg shadow-teal-900/10 shrink-0">
                            <i class="fas fa-globe text-xs"></i>
                            <span>الموقع الرسمي</span>
                        </a>
                        <button id="td-header-download-btn" class="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shrink-0">
                            <i class="fas fa-download text-xs text-teal-400"></i>
                            <span>تحميل الأداة</span>
                        </button>
                        <button id="td-close-btn" class="w-10 h-10 rounded-xl bg-white/5 hover:bg-red-500/10 border border-white/10 text-gray-400 hover:text-red-400 transition-colors flex items-center justify-center shrink-0">
                            <i class="fas fa-times text-base"></i>
                        </button>
                    </div>
                </div>

                <!-- Tabs Menu -->
                <div class="flex border-b border-white/5 bg-black/20 shrink-0 overflow-x-auto custom-scroll text-xs md:text-sm font-bold text-gray-400 select-none">
                    <button class="tools-tab-btn flex-1 py-3 px-4 text-center whitespace-nowrap active" data-tab="td-overview">نظرة عامة</button>
                    <button class="tools-tab-btn flex-1 py-3 px-4 text-center whitespace-nowrap" data-tab="td-features">المميزات والعيوب</button>
                    <button class="tools-tab-btn flex-1 py-3 px-4 text-center whitespace-nowrap" data-tab="td-downloads">التحميل والتوثيق</button>
                    <button class="tools-tab-btn flex-1 py-3 px-4 text-center whitespace-nowrap" data-tab="td-learning">الشروحات والمجتمع</button>
                    <button class="tools-tab-btn flex-1 py-3 px-4 text-center whitespace-nowrap" data-tab="td-alternatives">البدائل ومقترحات</button>
                </div>

                <!-- Scrollable Content -->
                <div class="flex-1 overflow-y-auto p-6 space-y-6 custom-scroll text-right">
                    <!-- Loading Spinner -->
                    <div id="td-loader" class="absolute inset-0 bg-b-surface/95 z-50 flex flex-col items-center justify-center gap-3">
                        <i class="fas fa-spinner fa-spin text-4xl text-teal-400"></i>
                        <p class="font-bold text-sm text-gray-400">جاري تحميل بيانات الأداة...</p>
                    </div>

                    <!-- Tab Content: Overview -->
                    <div id="td-overview" class="td-tab-content space-y-6">
                        <div class="space-y-3">
                            <h3 class="text-sm font-bold text-gray-400 flex items-center gap-2 justify-end">
                                <span>الوصف الكامل</span> <i class="fas fa-align-right text-teal-500"></i>
                            </h3>
                            <p id="td-full-desc" class="text-sm text-gray-300 leading-relaxed font-light whitespace-pre-line"></p>
                        </div>

                        <!-- Info grid -->
                        <div class="grid grid-cols-2 gap-3 text-xs">
                            <div class="bg-white/5 border border-white/10 p-3 rounded-xl">
                                <span class="text-gray-500 block mb-1">أهمية الاستخدام</span>
                                <span id="td-importance" class="font-bold text-white">--</span>
                            </div>
                            <div class="bg-white/5 border border-white/10 p-3 rounded-xl">
                                <span class="text-gray-500 block mb-1">مستوى الخبرة</span>
                                <span id="td-experience" class="font-bold text-white">--</span>
                            </div>
                            <div class="bg-white/5 border border-white/10 p-3 rounded-xl col-span-2">
                                <span class="text-gray-500 block mb-1">أنظمة التشغيل المدعومة</span>
                                <div id="td-os-container" class="flex flex-wrap gap-2 justify-end mt-1"></div>
                            </div>
                        </div>

                        <!-- Curriculum container -->
                        <div id="td-curriculum-container" class="space-y-4 border-t border-white/5 pt-4 hidden">
                            <h3 class="text-sm font-bold text-gray-400 flex items-center gap-2 justify-end">
                                <span>المسارات والمراحل التعليمية المرتبطة</span> <i class="fas fa-graduation-cap text-teal-400"></i>
                            </h3>
                            <div class="space-y-3 text-right">
                                <div id="td-related-tracks-div" class="hidden">
                                    <span class="text-xs text-gray-500 block mb-1">المسارات:</span>
                                    <div id="td-related-tracks-list" class="flex flex-wrap gap-2 justify-end"></div>
                                </div>
                                <div id="td-related-courses-div" class="hidden">
                                    <span class="text-xs text-gray-500 block mb-1">الكورسات والدورات:</span>
                                    <div id="td-related-courses-list" class="flex flex-wrap gap-2 justify-end"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Screenshots gallery -->
                        <div id="td-screenshots-container" class="space-y-3 border-t border-white/5 pt-4 hidden">
                            <h3 class="text-sm font-bold text-gray-400 flex items-center gap-2 justify-end">
                                <span>لقطات شاشة للأداة (Screenshots)</span> <i class="fas fa-images text-teal-400"></i>
                            </h3>
                            <div id="td-screenshots-gallery" class="grid grid-cols-2 sm:grid-cols-3 gap-3"></div>
                        </div>
                    </div>

                    <!-- Tab Content: Features -->
                    <div id="td-features" class="td-tab-content hidden space-y-6">
                        <div class="space-y-3">
                            <h3 class="text-sm font-bold text-gray-400 flex items-center gap-2 justify-end">
                                <span>المميزات والخصائص</span> <i class="fas fa-star text-yellow-500"></i>
                            </h3>
                            <ul id="td-features-list" class="space-y-2 text-xs md:text-sm text-gray-300"></ul>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/5">
                            <div class="space-y-3">
                                <h4 class="text-xs font-bold text-emerald-400 flex items-center gap-2 justify-end">
                                    <span>الخصائص الإيجابية Pros</span> <i class="fas fa-check-circle"></i>
                                </h4>
                                <ul id="td-pros-list" class="space-y-1.5 text-xs text-gray-300"></ul>
                            </div>
                            <div class="space-y-3">
                                <h4 class="text-xs font-bold text-amber-500 flex items-center gap-2 justify-end">
                                    <span>العيوب Cons</span> <i class="fas fa-exclamation-triangle"></i>
                                </h4>
                                <ul id="td-cons-list" class="space-y-1.5 text-xs text-gray-300"></ul>
                            </div>
                        </div>
                    </div>

                    <!-- Tab Content: Downloads -->
                    <div id="td-downloads" class="td-tab-content hidden space-y-6">
                        <div class="space-y-4">
                            <h3 class="text-sm font-bold text-gray-400 flex items-center gap-2 justify-end">
                                <span>روابط التحميل المباشرة</span> <i class="fas fa-download text-teal-400"></i>
                            </h3>
                            <div id="td-downloads-list" class="grid grid-cols-1 gap-2.5"></div>
                        </div>

                        <div class="border-t border-white/5 pt-6 space-y-4">
                            <h3 class="text-sm font-bold text-gray-400 flex items-center gap-2 justify-end">
                                <span>المستندات والتوثيق</span> <i class="fas fa-book text-blue-400"></i>
                            </h3>
                            <a id="td-doc-url" href="#" target="_blank" class="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all">
                                <span>تصفح التوثيق الرسمي (Documentation)</span>
                                <i class="fas fa-external-link-alt text-blue-400"></i>
                            </a>
                        </div>
                    </div>

                    <!-- Tab Content: Learning & Community -->
                    <div id="td-learning" class="td-tab-content hidden space-y-6">
                        <div class="space-y-3">
                            <h3 class="text-sm font-bold text-gray-400 flex items-center gap-2 justify-end">
                                <span>شروحات ومصادر تعلم</span> <i class="fab fa-youtube text-red-500"></i>
                            </h3>
                            <div id="td-learning-list" class="space-y-2"></div>
                        </div>

                        <div class="border-t border-white/5 pt-6 space-y-3">
                            <h3 class="text-sm font-bold text-gray-400 flex items-center gap-2 justify-end">
                                <span>مستودع الكود والمجتمع</span> <i class="fab fa-github text-white"></i>
                            </h3>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <a id="td-github-url" href="#" target="_blank" class="hidden py-3 bg-[#24292e] hover:bg-[#2f363d] rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all">
                                    <span>المشروع على GitHub</span>
                                    <i class="fab fa-github"></i>
                                </a>
                                <div id="td-community-links" class="col-span-full grid grid-cols-1 gap-2 mt-2"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Tab Content: Alternatives & Recommendations -->
                    <div id="td-alternatives" class="td-tab-content hidden space-y-6">
                        <div class="space-y-3">
                            <h3 class="text-sm font-bold text-gray-400 flex items-center gap-2 justify-end">
                                <span>بدائل لهذه الأداة</span> <i class="fas fa-exchange-alt text-teal-400"></i>
                            </h3>
                            <div id="td-alternatives-list" class="grid grid-cols-1 gap-2.5"></div>
                        </div>

                        <div class="border-t border-white/5 pt-6 space-y-3">
                            <h3 class="text-sm font-bold text-gray-400 flex items-center gap-2 justify-end">
                                <span>أدوات مشابهة قد تحتاجها</span> <i class="fas fa-puzzle-piece text-purple-400"></i>
                            </h3>
                            <div id="td-similar-list" class="grid grid-cols-1 sm:grid-cols-2 gap-2.5"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(drawerOverlay);

        // Bind overlay event listeners once
        drawerOverlay.addEventListener('click', (e) => {
            if (e.target === drawerOverlay) closeDrawer();
        });

        document.getElementById('td-close-btn').addEventListener('click', closeDrawer);
        
        // Bind header download button to click the Downloads tab
        document.getElementById('td-header-download-btn').addEventListener('click', () => {
            const dlTab = document.querySelector('.tools-tab-btn[data-tab="td-downloads"]');
            if (dlTab) dlTab.click();
        });

        // Close on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !drawerOverlay.classList.contains('hidden')) {
                closeDrawer();
            }
        });

        // Bind Tabs Switching
        document.querySelectorAll('.tools-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tools-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                document.querySelectorAll('.td-tab-content').forEach(content => content.classList.add('hidden'));
                const tabId = btn.getAttribute('data-tab');
                document.getElementById(tabId).classList.remove('hidden');
            });
        });
    }

    // 5. Open and Close Drawer (Modal) Functions
    function openDrawer() {
        drawerOverlay.classList.remove('hidden');
        setTimeout(() => {
            drawerOverlay.classList.add('active');
            document.getElementById('tool-detail-drawer').classList.add('active');
        }, 10);
        document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
        drawerOverlay.classList.remove('active');
        document.getElementById('tool-detail-drawer').classList.remove('active');
        setTimeout(() => {
            drawerOverlay.classList.add('hidden');
        }, 300);
        document.body.style.overflow = '';
    }

    // 6. Primary Action: Open Tool details from anywhere
    window.openToolDetailDrawer = async function(toolId) {
        if (!supabase) {
            console.error("Tools Drawer: Supabase client is not initialized.");
            return;
        }

        // Reset Tab state to Overview
        document.querySelector('.tools-tab-btn[data-tab="td-overview"]').click();

        // Show loader and open drawer container
        document.getElementById('td-loader').classList.remove('hidden');
        openDrawer();

        try {
            // A. Fetch Tool Data
            const { data: tool, error } = await supabase
                .from('tools')
                .select('*')
                .eq('id', toolId)
                .maybeSingle();

            if (error) throw error;
            if (!tool) {
                console.error("Tool not found:", toolId);
                closeDrawer();
                return;
            }

            // B. Increment Analytics Logs asynchronously (Clicks/Views tracking)
            supabase.from('tools')
                .update({ views_count: (tool.views_count || 0) + 1 })
                .eq('id', tool.id)
                .then(); // Fire and forget

            // C. Map basic fields to DOM
            document.getElementById('td-name').textContent = tool.name;
            document.getElementById('td-subtitle').textContent = `${tool.type} • ${tool.experience_level || 'Beginner'}`;
            document.getElementById('td-full-desc').textContent = tool.full_description || tool.short_description || 'لا يوجد وصف كامل متوفر لهذه الأداة حالياً.';
            
            const logoEl = document.getElementById('td-logo');
            logoEl.src = tool.logo_url || (pathPrefix + 'assets/icons/BUSLA-icon.png');
            logoEl.onerror = () => { logoEl.src = pathPrefix + 'assets/icons/BUSLA-icon.png'; };

            document.getElementById('td-importance').textContent = tool.importance || 'Optional';
            document.getElementById('td-experience').textContent = tool.experience_level || 'Beginner';

            // D. Set header badges & links
            const impEl = document.getElementById('td-badge-importance');
            if (impEl) {
                impEl.textContent = tool.importance || 'Optional';
            }

            let statusText = 'مسودة';
            let statusClass = 'bg-gray-500/10 text-gray-400 border-gray-500/20';
            if (tool.status === 'Published') {
                statusText = 'منشور';
                statusClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            } else if (tool.status === 'Hidden') {
                statusText = 'مخفي';
                statusClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
            }
            const statusEl = document.getElementById('td-badge-status');
            if (statusEl) {
                statusEl.textContent = statusText;
                statusEl.className = `text-[9px] font-black border px-2 py-0.5 rounded-full uppercase tracking-wider ${statusClass}`;
            }

            const trackNames = await getTrackNames(tool.track_ids);
            const trackNameEl = document.getElementById('td-track-name');
            if (trackNameEl) {
                trackNameEl.textContent = trackNames.length > 0 ? `المسار: ${trackNames.join('، ')}` : 'أداة عامة';
            }

            const updatedAt = tool.updated_at ? new Date(tool.updated_at).toLocaleDateString('ar-EG') : 'غير متوفر';
            const updatedEl = document.getElementById('td-updated-at');
            if (updatedEl) {
                updatedEl.textContent = `تحديث: ${updatedAt}`;
            }

            const webBtn = document.getElementById('td-header-website-btn');
            if (webBtn) {
                if (tool.official_website) {
                    webBtn.href = tool.official_website;
                    webBtn.classList.remove('hidden');
                } else {
                    webBtn.classList.add('hidden');
                }
            }

            // E. Operating Systems Icons
            const osContainer = document.getElementById('td-os-container');
            osContainer.innerHTML = '';
            const osList = tool.supported_os || [];
            if (osList.length > 0) {
                const osIcons = {
                    'windows': '<i class="fab fa-windows ml-1.5 text-blue-400"></i> Windows',
                    'linux': '<i class="fab fa-linux ml-1.5 text-amber-500"></i> Linux',
                    'macos': '<i class="fab fa-apple ml-1.5 text-white"></i> macOS',
                    'android': '<i class="fab fa-android ml-1.5 text-emerald-400"></i> Android',
                    'ios': '<i class="fab fa-app-store-ios ml-1.5 text-blue-500"></i> iOS',
                    'web': '<i class="fas fa-globe ml-1.5 text-teal-400"></i> Web'
                };
                osList.forEach(os => {
                    const cleanOS = os.toLowerCase().trim();
                    const pill = document.createElement('span');
                    pill.className = 'px-3 py-1 bg-white/5 rounded-full border border-white/5 flex items-center';
                    pill.innerHTML = osIcons[cleanOS] || `<i class="fas fa-laptop ml-1.5"></i> ${os}`;
                    osContainer.appendChild(pill);
                });
            } else {
                osContainer.innerHTML = '<span class="text-gray-500">غير محدد</span>';
            }

            // F. Related Curriculum (Tracks & Courses)
            const trackDiv = document.getElementById('td-related-tracks-div');
            const trackListEl = document.getElementById('td-related-tracks-list');
            const courseDiv = document.getElementById('td-related-courses-div');
            const courseListEl = document.getElementById('td-related-courses-list');
            const currContainer = document.getElementById('td-curriculum-container');

            trackListEl.innerHTML = '';
            courseListEl.innerHTML = '';
            trackDiv.classList.add('hidden');
            courseDiv.classList.add('hidden');
            currContainer.classList.add('hidden');

            let hasCurriculum = false;

            if (trackNames.length > 0) {
                hasCurriculum = true;
                trackDiv.classList.remove('hidden');
                trackNames.forEach(tName => {
                    const chip = document.createElement('span');
                    chip.className = 'px-3 py-1 bg-teal-500/10 border border-teal-500/20 text-teal-400 rounded-lg text-xs font-bold';
                    chip.textContent = tName;
                    trackListEl.appendChild(chip);
                });
            }

            const courseIds = tool.course_ids || [];
            if (courseIds.length > 0) {
                const { data: courses } = await supabase
                    .from('courses')
                    .select('course_id, title')
                    .in('course_id', courseIds);

                if (courses && courses.length > 0) {
                    hasCurriculum = true;
                    courseDiv.classList.remove('hidden');
                    courses.forEach(course => {
                        const chip = document.createElement('button');
                        chip.className = 'px-3 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/40 text-blue-400 hover:text-blue-300 rounded-lg text-xs font-bold transition-all';
                        chip.textContent = course.title;
                        chip.onclick = () => {
                            closeDrawer();
                            if (typeof window.viewCourseInRoadmap === 'function') {
                                window.viewCourseInRoadmap(course.course_id);
                            } else {
                                window.location.hash = '#roadmap';
                            }
                        };
                        courseListEl.appendChild(chip);
                    });
                }
            }

            if (hasCurriculum) {
                currContainer.classList.remove('hidden');
            }

            // G. Screenshots Gallery
            const screenshotContainer = document.getElementById('td-screenshots-container');
            const galleryEl = document.getElementById('td-screenshots-gallery');
            galleryEl.innerHTML = '';
            screenshotContainer.classList.add('hidden');

            const images = tool.images || [];
            if (images.length > 0) {
                screenshotContainer.classList.remove('hidden');
                images.forEach(imgUrl => {
                    if (imgUrl) {
                        const img = document.createElement('img');
                        img.src = imgUrl;
                        img.className = 'w-full h-24 object-cover rounded-xl border border-white/10 hover:border-teal-500 hover:scale-105 cursor-pointer transition-all duration-300';
                        img.onclick = () => window.open(imgUrl, '_blank');
                        galleryEl.appendChild(img);
                    }
                });
            }

            // H. Features List
            const featuresList = document.getElementById('td-features-list');
            featuresList.innerHTML = '';
            const features = tool.features || [];
            if (features.length > 0) {
                features.forEach(feat => {
                    const li = document.createElement('li');
                    li.className = 'flex items-start gap-2 justify-end mb-2';
                    li.innerHTML = `<span>${feat}</span> <i class="fas fa-circle text-teal-500 mt-1.5 text-[8px] flex-shrink-0"></i>`;
                    featuresList.appendChild(li);
                });
            } else {
                featuresList.innerHTML = '<li class="text-gray-500">لا توجد مميزات مضافة.</li>';
            }

            // I. Pros & Cons Lists
            const prosList = document.getElementById('td-pros-list');
            prosList.innerHTML = '';
            const pros = tool.pros || [];
            if (pros.length > 0) {
                pros.forEach(item => {
                    const li = document.createElement('li');
                    li.className = 'flex items-start gap-2 justify-end mb-1.5';
                    li.innerHTML = `<span>${item}</span> <i class="fas fa-check text-emerald-400 mt-1 text-xs shrink-0"></i>`;
                    prosList.appendChild(li);
                });
            } else {
                prosList.innerHTML = '<li class="text-gray-500">غير حدد</li>';
            }

            const consList = document.getElementById('td-cons-list');
            consList.innerHTML = '';
            const cons = tool.cons || [];
            if (cons.length > 0) {
                cons.forEach(item => {
                    const li = document.createElement('li');
                    li.className = 'flex items-start gap-2 justify-end mb-1.5';
                    li.innerHTML = `<span>${item}</span> <i class="fas fa-minus text-amber-500 mt-1 text-xs shrink-0"></i>`;
                    consList.appendChild(li);
                });
            } else {
                consList.innerHTML = '<li class="text-gray-500">غير حدد</li>';
            }

            // J. Download Links
            const downloadsList = document.getElementById('td-downloads-list');
            downloadsList.innerHTML = '';
            let rawDownloads = tool.download_links || [];
            if (typeof rawDownloads === 'string') {
                try { rawDownloads = JSON.parse(rawDownloads); } catch(e) {}
            }
            if (Array.isArray(rawDownloads) && rawDownloads.length > 0) {
                rawDownloads.forEach(dl => {
                    if (dl.url) {
                        const btn = document.createElement('a');
                        btn.href = dl.url;
                        btn.target = '_blank';
                        btn.className = 'w-full py-3 bg-b-primary/20 hover:bg-b-primary border border-b-primary/30 hover:border-b-primary hover:text-white rounded-xl text-xs font-bold text-teal-400 flex items-center justify-center gap-2 transition-all';
                        btn.onclick = () => trackClickAnalytics(tool.id);
                        btn.innerHTML = `
                            <span>تنزيل نسخة ${dl.platform || 'عشوائية'}</span>
                            <i class="fas fa-cloud-download-alt"></i>
                        `;
                        downloadsList.appendChild(btn);
                    }
                });
            } else if (tool.official_website) {
                downloadsList.innerHTML = `
                    <a href="${tool.official_website}" target="_blank" onclick="window.trackClickAnalytics('${tool.id}')" class="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2 transition-all">
                        <span>رابط التحميل عبر الموقع الرسمي</span>
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                `;
            } else {
                downloadsList.innerHTML = '<div class="text-center text-xs text-gray-500 py-2">لا تتوفر روابط تنزيل حالياً.</div>';
            }

            // K. Documentation URL
            const docBtn = document.getElementById('td-doc-url');
            if (tool.documentation_url) {
                docBtn.href = tool.documentation_url;
                docBtn.classList.remove('hidden');
            } else {
                docBtn.classList.add('hidden');
            }

            // L. YouTube & Learning Resources
            const learningList = document.getElementById('td-learning-list');
            learningList.innerHTML = '';
            
            const tutorials = tool.tutorials_links || [];
            const playlists = tool.youtube_playlists || [];

            if (tutorials.length === 0 && playlists.length === 0) {
                learningList.innerHTML = '<div class="text-center text-xs text-gray-500 py-2">لا توجد شروحات مضافة بعد.</div>';
            } else {
                playlists.forEach((playlist, i) => {
                    if (playlist) {
                        const link = document.createElement('a');
                        link.href = playlist;
                        link.target = '_blank';
                        link.className = 'flex items-center justify-between p-3 bg-red-600/5 hover:bg-red-600/10 border border-red-600/10 rounded-xl text-xs text-right font-bold transition-all';
                        link.innerHTML = `
                            <i class="fas fa-play text-red-500 text-xs"></i>
                            <span class="text-white">قائمة تشغيل يوتيوب رقم ${i + 1}</span>
                            <i class="fab fa-youtube text-red-500 text-base"></i>
                        `;
                        learningList.appendChild(link);
                    }
                });

                tutorials.forEach((tut, i) => {
                    if (tut) {
                        const link = document.createElement('a');
                        link.href = tut;
                        link.target = '_blank';
                        link.className = 'flex items-center justify-between p-3 bg-white/5 border border-white/10 hover:border-teal-500/30 rounded-xl text-xs text-right font-bold transition-all';
                        link.innerHTML = `
                            <i class="fas fa-external-link-alt text-teal-400 text-xs"></i>
                            <span class="text-white">دليل تعليمي خارجي رقم ${i + 1}</span>
                            <i class="fas fa-graduation-cap text-teal-400 text-base"></i>
                        `;
                        learningList.appendChild(link);
                    }
                });
            }

            // M. GitHub & Community Links
            const ghBtn = document.getElementById('td-github-url');
            if (tool.github_url) {
                ghBtn.href = tool.github_url;
                ghBtn.classList.remove('hidden');
            } else {
                ghBtn.classList.add('hidden');
            }

            const communityList = document.getElementById('td-community-links');
            communityList.innerHTML = '';
            let rawCommunity = tool.community_links || [];
            if (typeof rawCommunity === 'string') {
                try { rawCommunity = JSON.parse(rawCommunity); } catch(e) {}
            }
            if (Array.isArray(rawCommunity) && rawCommunity.length > 0) {
                rawCommunity.forEach(cl => {
                    if (cl.url) {
                        const link = document.createElement('a');
                        link.href = cl.url;
                        link.target = '_blank';
                        
                        let comIcon = 'fa-comments';
                        let comBg = 'bg-white/5 hover:bg-white/10 border-white/10';
                        if (cl.platform.toLowerCase().includes('discord')) {
                            comIcon = 'fa-discord';
                            comBg = 'bg-[#5865F2]/10 hover:bg-[#5865F2]/20 border-[#5865F2]/30 text-[#5865F2]';
                        } else if (cl.platform.toLowerCase().includes('reddit')) {
                            comIcon = 'fa-reddit-alien';
                            comBg = 'bg-[#FF4500]/10 hover:bg-[#FF4500]/20 border-[#FF4500]/30 text-[#FF4500]';
                        }
                        
                        link.className = `w-full py-3 ${comBg} border rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all`;
                        link.innerHTML = `
                            <span>رابط مجتمع ${cl.platform}</span>
                            <i class="fab ${comIcon} text-base"></i>
                        `;
                        communityList.appendChild(link);
                    }
                });
            }

            // N. Fetch Alternatives Tools
            const altList = document.getElementById('td-alternatives-list');
            altList.innerHTML = '';
            const altIds = tool.alternatives || [];
            if (altIds.length > 0) {
                const { data: alts } = await supabase
                    .from('tools')
                    .select('id, name, type, logo_url, short_description')
                    .in('id', altIds);

                if (alts && alts.length > 0) {
                    alts.forEach(alt => {
                        const card = document.createElement('div');
                        card.onclick = () => window.openToolDetailDrawer(alt.id);
                        card.className = 'flex items-center gap-3 p-3 bg-white/5 border border-white/5 hover:border-teal-500/50 rounded-xl cursor-pointer transition-all';
                        card.innerHTML = `
                            <img src="${alt.logo_url || (pathPrefix + 'assets/icons/BUSLA-icon.png')}" class="w-8 h-8 rounded object-cover" onerror="this.src='${pathPrefix}assets/icons/BUSLA-icon.png'">
                            <div class="flex-1 text-right min-w-0">
                                <p class="text-xs font-bold text-white truncate">${alt.name}</p>
                                <p class="text-[10px] text-gray-400 truncate">${alt.type} • ${alt.short_description || ''}</p>
                            </div>
                            <i class="fas fa-chevron-left text-[10px] text-gray-500"></i>
                        `;
                        altList.appendChild(card);
                    });
                } else {
                    altList.innerHTML = '<div class="text-center text-xs text-gray-500 py-2">لا تتوفر أدوات بديلة مسجلة حالياً.</div>';
                }
            } else {
                altList.innerHTML = '<div class="text-center text-xs text-gray-500 py-2">لا تتوفر أدوات بديلة مسجلة حالياً.</div>';
            }

            // O. Fetch Similar Tools (Matching Tracks / Type, Limit 4)
            const simList = document.getElementById('td-similar-list');
            simList.innerHTML = '';
            
            let query = supabase.from('tools')
                .select('id, name, type, logo_url, importance')
                .eq('status', 'Published')
                .neq('id', tool.id);

            if (tool.track_ids && tool.track_ids.length > 0) {
                query = query.contains('track_ids', [tool.track_ids[0]]);
            } else {
                query = query.eq('type', tool.type);
            }

            const { data: similarTools } = await query.limit(4);

            if (similarTools && similarTools.length > 0) {
                similarTools.forEach(sim => {
                    const card = document.createElement('div');
                    card.onclick = () => window.openToolDetailDrawer(sim.id);
                    card.className = 'flex items-center gap-2 p-2 bg-white/5 border border-white/5 hover:border-teal-500/50 rounded-xl cursor-pointer transition-all';
                    card.innerHTML = `
                        <img src="${sim.logo_url || (pathPrefix + 'assets/icons/BUSLA-icon.png')}" class="w-6 h-6 rounded object-cover" onerror="this.src='${pathPrefix}assets/icons/BUSLA-icon.png'">
                        <div class="flex-1 text-right min-w-0">
                            <p class="text-[11px] font-bold text-white truncate">${sim.name}</p>
                            <p class="text-[9px] text-gray-400 truncate">${sim.type}</p>
                        </div>
                    `;
                    simList.appendChild(card);
                });
            } else {
                simList.innerHTML = '<div class="text-center text-xs text-gray-500 py-2 col-span-2">لا توجد مقترحات مشابهة.</div>';
            }

        } catch (err) {
            console.error("Tools Drawer: Error populating data:", err);
            closeDrawer();
        } finally {
            document.getElementById('td-loader').classList.add('hidden');
        }
    };

    // Helper: Track Analytics Clicks
    window.trackClickAnalytics = async function(toolId) {
        if (!supabase) return;
        try {
            const { data: tool } = await supabase.from('tools').select('clicks_count').eq('id', toolId).maybeSingle();
            if (tool) {
                await supabase.from('tools')
                    .update({ clicks_count: (tool.clicks_count || 0) + 1 })
                    .eq('id', toolId);
            }
        } catch(e) {}
    };

})();
