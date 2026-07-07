/**
 * BUSLA LMS - Global References Detail Modal Utility
 * This file dynamically injects a premium center floating modal into the document
 * to display complete reference details, scientific abstract, and analytics.
 * Accessible globally via window.openReferenceDetailModal(refId).
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
        console.error("References Drawer: Failed to import Supabase config.", err);
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
    if (!document.getElementById('references-drawer-styles')) {
        const style = document.createElement('style');
        style.id = 'references-drawer-styles';
        style.innerHTML = `
            /* Background dim and blur backdrop */
            #reference-detail-drawer-overlay {
                background-color: rgba(0, 0, 0, 0);
                backdrop-filter: blur(0px);
                transition: background-color 0.3s ease, backdrop-filter 0.3s ease, opacity 0.3s ease;
                opacity: 0;
            }
            #reference-detail-drawer-overlay.active {
                background-color: rgba(0, 0, 0, 0.85) !important;
                backdrop-filter: blur(12px) !important;
                opacity: 1 !important;
            }
            
            /* Premium floating modal container */
            #reference-detail-drawer {
                transform: scale(0.95) translateY(10px);
                opacity: 0;
                transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease, border-color 0.3s ease;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
            }
            #reference-detail-drawer.active {
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
            .references-tab-btn {
                position: relative;
                transition: color 0.3s ease;
            }
            .references-tab-btn::after {
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
            .references-tab-btn.active {
                color: #00dec8 !important;
            }
            .references-tab-btn.active::after {
                width: 100%;
            }
            
            /* Tablet layout overrides */
            @media (min-width: 768px) and (max-width: 1024px) {
                #reference-detail-drawer {
                    max-width: 85vw !important;
                    height: 80vh !important;
                }
            }
            
            /* Mobile full screen overrides */
            @media (max-width: 767px) {
                #reference-detail-drawer-overlay {
                    padding: 0px !important;
                }
                #reference-detail-drawer {
                    width: 100% !important;
                    height: 100% !important;
                    max-height: 100vh !important;
                    max-width: 100vw !important;
                    border-radius: 0px !important;
                    border: none !important;
                    transform: translateY(100%);
                    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
                }
                #reference-detail-drawer.active {
                    transform: translateY(0) !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // 4. Inject HTML Modal markup into the body if not already present
    let drawerOverlay = document.getElementById('reference-detail-drawer-overlay');
    if (!drawerOverlay) {
        drawerOverlay = document.createElement('div');
        drawerOverlay.id = 'reference-detail-drawer-overlay';
        drawerOverlay.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] hidden transition-all duration-300 opacity-0 flex items-center justify-center p-4 md:p-6 lg:p-10';
        drawerOverlay.innerHTML = `
            <div id="reference-detail-drawer" class="w-full h-full max-h-[85vh] md:max-h-[80vh] lg:max-h-[85vh] max-w-full md:max-w-[85vw] lg:max-w-[75vw] bg-b-surface border border-white/10 rounded-2xl flex flex-col shadow-2xl relative overflow-hidden transition-all duration-300">
                <!-- Header -->
                <div class="p-6 border-b border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 bg-black/40">
                    <div class="flex items-center gap-4 text-right">
                        <div class="w-12 h-16 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                            <img id="refd-logo" src="" alt="cover" class="w-full h-full object-cover">
                        </div>
                        <div class="space-y-1">
                            <div class="flex flex-wrap items-center gap-2 justify-end md:justify-start">
                                <h2 id="refd-title" class="font-black text-lg md:text-xl text-white tracking-wide">...</h2>
                                <span id="refd-badge-importance" class="text-[9px] font-black border px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border-teal-500/20">...</span>
                                <span id="refd-badge-language" class="text-[9px] font-black border px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border-blue-500/20">...</span>
                                <span id="refd-badge-status" class="text-[9px] font-black border px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border-emerald-500/20">...</span>
                            </div>
                            <p id="refd-subtitle" class="text-xs text-gray-400">...</p>
                            <div class="flex flex-wrap gap-2 text-[10px] text-gray-500 font-mono">
                                <span id="refd-track-name">المسار: جاري التحميل...</span>
                                <span>•</span>
                                <span id="refd-updated-at">تحديث: --/--/----</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-2.5 w-full md:w-auto justify-end">
                        <a id="refd-header-read-btn" href="#" target="_blank" class="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-lg shadow-teal-900/10 shrink-0">
                            <i class="fas fa-eye text-xs"></i>
                            <span>قراءة أونلاين</span>
                        </a>
                        <a id="refd-header-download-btn" href="#" target="_blank" class="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shrink-0">
                            <i class="fas fa-download text-xs text-teal-400"></i>
                            <span>تحميل PDF</span>
                        </a>
                        <button id="refd-close-btn" class="w-10 h-10 rounded-xl bg-white/5 hover:bg-red-500/10 border border-white/10 text-gray-400 hover:text-red-400 transition-colors flex items-center justify-center shrink-0">
                            <i class="fas fa-times text-base"></i>
                        </button>
                    </div>
                </div>

                <!-- Tabs Menu -->
                <div class="flex border-b border-white/5 bg-black/20 shrink-0 overflow-x-auto custom-scroll text-xs md:text-sm font-bold text-gray-400 select-none">
                    <button class="references-tab-btn flex-1 py-3 px-4 text-center whitespace-nowrap active" data-tab="refd-overview">نظرة عامة</button>
                    <button class="references-tab-btn flex-1 py-3 px-4 text-center whitespace-nowrap" data-tab="refd-abstract">الملخص العلمي</button>
                    <button class="references-tab-btn flex-1 py-3 px-4 text-center whitespace-nowrap" data-tab="refd-pubinfo">بيانات النشر</button>
                    <button class="references-tab-btn flex-1 py-3 px-4 text-center whitespace-nowrap" data-tab="refd-links">روابط الوصول</button>
                    <button class="references-tab-btn flex-1 py-3 px-4 text-center whitespace-nowrap" data-tab="refd-curriculum">المسارات المرتبطة</button>
                    <button class="references-tab-btn flex-1 py-3 px-4 text-center whitespace-nowrap" data-tab="refd-related">المصادر المشابهة</button>
                </div>

                <!-- Loader Area -->
                <div id="refd-loader" class="absolute inset-0 bg-b-bg/95 z-50 flex flex-col items-center justify-center gap-3">
                    <div class="w-12 h-12 rounded-full border-4 border-white/10 border-t-teal-500 animate-spin"></div>
                    <p class="text-xs text-gray-400 font-bold">جاري تحميل تفاصيل المرجع...</p>
                </div>

                <!-- Modal Body (Dynamic Tab Panes) -->
                <div class="flex-1 overflow-y-auto custom-scroll p-6 text-right">
                    
                    <!-- TAB 1: Overview -->
                    <div id="refd-overview" class="refd-tab-pane space-y-6">
                        <div class="flex flex-col lg:flex-row gap-6 items-start">
                            <div class="w-full lg:w-44 h-64 bg-black/40 border border-white/10 rounded-2xl overflow-hidden flex items-center justify-center shrink-0 shadow-lg mx-auto lg:mx-0">
                                <img id="refd-body-cover" src="" class="w-full h-full object-cover">
                            </div>
                            <div class="flex-1 space-y-4">
                                <div>
                                    <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">تفاصيل المصدر العلمي</h3>
                                    <p id="refd-full-desc" class="text-gray-300 text-sm leading-relaxed whitespace-pre-line"></p>
                                </div>
                                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div class="bg-black/20 border border-white/5 p-3 rounded-xl">
                                        <span class="text-[10px] text-gray-500 block mb-0.5">مستوى الصعوبة</span>
                                        <span id="refd-experience" class="text-xs font-bold text-white">...</span>
                                    </div>
                                    <div class="bg-black/20 border border-white/5 p-3 rounded-xl">
                                        <span class="text-[10px] text-gray-500 block mb-0.5">نوع المرجع</span>
                                        <span id="refd-type" class="text-xs font-bold text-teal-400">...</span>
                                    </div>
                                    <div class="bg-black/20 border border-white/5 p-3 rounded-xl">
                                        <span class="text-[10px] text-gray-500 block mb-0.5">سنة النشر</span>
                                        <span id="refd-year" class="text-xs font-bold text-white font-mono">...</span>
                                    </div>
                                    <div class="bg-black/20 border border-white/5 p-3 rounded-xl">
                                        <span class="text-[10px] text-gray-500 block mb-0.5">المؤلف الرئيسي</span>
                                        <span id="refd-author" class="text-xs font-bold text-white">...</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div id="refd-why-read-div" class="bg-teal-500/5 border border-teal-500/10 p-5 rounded-2xl space-y-2 hidden">
                            <h4 class="text-xs font-bold text-teal-400 flex items-center gap-1.5 justify-end">
                                <span>لماذا ننصح بقراءة هذا المرجع؟</span>
                                <i class="fas fa-lightbulb"></i>
                            </h4>
                            <p id="refd-why-read" class="text-gray-300 text-xs leading-relaxed"></p>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <!-- Takeaways -->
                            <div id="refd-takeaways-div" class="bg-black/20 border border-white/5 p-5 rounded-2xl flex flex-col h-full hidden">
                                <h4 class="text-xs font-bold text-gray-400 border-b border-white/5 pb-2 mb-3 flex items-center gap-1.5 justify-end">
                                    <span>أهم النقاط المستفادة (Key Takeaways)</span>
                                    <i class="fas fa-check-circle text-emerald-400"></i>
                                </h4>
                                <ul id="refd-takeaways-list" class="space-y-2 text-xs text-gray-300 list-none"></ul>
                            </div>
                            
                            <!-- Learning Benefits -->
                            <div id="refd-benefits-div" class="bg-black/20 border border-white/5 p-5 rounded-2xl flex flex-col h-full hidden">
                                <h4 class="text-xs font-bold text-gray-400 border-b border-white/5 pb-2 mb-3 flex items-center gap-1.5 justify-end">
                                    <span>ماذا ستتعلم من قراءته؟</span>
                                    <i class="fas fa-graduation-cap text-blue-400"></i>
                                </h4>
                                <ul id="refd-benefits-list" class="space-y-2 text-xs text-gray-300 list-none"></ul>
                            </div>
                        </div>
                    </div>

                    <!-- TAB 2: Abstract -->
                    <div id="refd-abstract" class="refd-tab-pane hidden space-y-6">
                        <div class="space-y-3">
                            <h3 class="text-sm font-bold text-white border-b border-white/5 pb-2 flex items-center gap-1.5 justify-end">
                                <span>الملخص العلمي والبحثي للمصدر (Scientific Abstract)</span>
                                <i class="fas fa-quote-right text-teal-500"></i>
                            </h3>
                            <p id="refd-abstract-text" class="text-gray-300 text-xs leading-relaxed font-serif text-justify ltr-text bg-black/30 border border-white/5 p-6 rounded-2xl whitespace-pre-line select-text"></p>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <!-- Key Ideas -->
                            <div id="refd-ideas-div" class="bg-black/20 border border-white/5 p-5 rounded-2xl hidden">
                                <h4 class="text-xs font-bold text-gray-400 border-b border-white/5 pb-2 mb-3 flex items-center gap-1.5 justify-end">
                                    <span>الأفكار والمحاور الرئيسية</span>
                                    <i class="fas fa-layer-group text-purple-400"></i>
                                </h4>
                                <ul id="refd-ideas-list" class="space-y-2 text-xs text-gray-300 list-none"></ul>
                            </div>

                            <!-- Prerequisites -->
                            <div id="refd-prereqs-div" class="bg-black/20 border border-white/5 p-5 rounded-2xl hidden">
                                <h4 class="text-xs font-bold text-gray-400 border-b border-white/5 pb-2 mb-3 flex items-center gap-1.5 justify-end">
                                    <span>المتطلبات السابقة الموصى بها</span>
                                    <i class="fas fa-exclamation-triangle text-amber-500"></i>
                                </h4>
                                <ul id="refd-prereqs-list" class="space-y-2 text-xs text-gray-300 list-none"></ul>
                            </div>
                        </div>
                    </div>

                    <!-- TAB 3: Publication info -->
                    <div id="refd-pubinfo" class="refd-tab-pane hidden space-y-6">
                        <div class="bg-black/20 border border-white/10 rounded-2xl overflow-hidden shadow-lg">
                            <div class="p-4 bg-white/5 border-b border-white/5 text-xs font-bold text-white">بيانات النشر والتوثيق الأكاديمي</div>
                            <div class="divide-y divide-white/5 text-xs">
                                <div class="grid grid-cols-3 p-4">
                                    <span class="text-gray-500 font-bold">المؤلف الرئيسي</span>
                                    <span id="refd-pub-author" class="col-span-2 text-white font-semibold">...</span>
                                </div>
                                <div id="refd-pub-contrib-div" class="grid grid-cols-3 p-4">
                                    <span class="text-gray-500 font-bold">المشاركون</span>
                                    <span id="refd-pub-contributors" class="col-span-2 text-white">...</span>
                                </div>
                                <div id="refd-pub-publisher-div" class="grid grid-cols-3 p-4">
                                    <span class="text-gray-500 font-bold">الناشر</span>
                                    <span id="refd-pub-publisher" class="col-span-2 text-white">...</span>
                                </div>
                                <div id="refd-pub-inst-div" class="grid grid-cols-3 p-4">
                                    <span class="text-gray-500 font-bold">المؤسسة / المنظمة</span>
                                    <span id="refd-pub-institution" class="col-span-2 text-white">...</span>
                                </div>
                                <div id="refd-pub-univ-div" class="grid grid-cols-3 p-4">
                                    <span class="text-gray-500 font-bold">الجامعة</span>
                                    <span id="refd-pub-university" class="col-span-2 text-white">...</span>
                                </div>
                                <div id="refd-pub-journal-div" class="grid grid-cols-3 p-4">
                                    <span class="text-gray-500 font-bold">المجلة العلمية</span>
                                    <span id="refd-pub-journal" class="col-span-2 text-white italic">...</span>
                                </div>
                                <div id="refd-pub-conf-div" class="grid grid-cols-3 p-4">
                                    <span class="text-gray-500 font-bold">المؤتمر العلمي</span>
                                    <span id="refd-pub-conference" class="col-span-2 text-white">...</span>
                                </div>
                                <div id="refd-pub-edition-div" class="grid grid-cols-3 p-4">
                                    <span class="text-gray-500 font-bold">الطبعة / الإصدار</span>
                                    <span id="refd-pub-edition" class="col-span-2 text-white font-mono">...</span>
                                </div>
                                <div id="refd-pub-doi-div" class="grid grid-cols-3 p-4">
                                    <span class="text-gray-500 font-bold">المعرف الرقمي DOI</span>
                                    <span id="refd-pub-doi" class="col-span-2 text-teal-400 font-mono select-text">...</span>
                                </div>
                                <div id="refd-pub-isbn-div" class="grid grid-cols-3 p-4">
                                    <span class="text-gray-500 font-bold">ISBN الرقم القياسي للكتاب</span>
                                    <span id="refd-pub-isbn" class="col-span-2 text-white font-mono select-text">...</span>
                                </div>
                                <div id="refd-pub-issn-div" class="grid grid-cols-3 p-4">
                                    <span class="text-gray-500 font-bold">ISSN الرقم القياسي للدورية</span>
                                    <span id="refd-pub-issn" class="col-span-2 text-white font-mono select-text">...</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- TAB 4: Links -->
                    <div id="refd-links" class="refd-tab-pane hidden space-y-6">
                        <div class="bg-black/30 border border-white/10 p-5 rounded-2xl space-y-3">
                            <h4 class="text-xs font-bold text-gray-400 flex items-center justify-between border-b border-white/5 pb-2 mb-2">
                                <button onclick="window.copyReferenceCitation()" class="px-2.5 py-1 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 rounded border border-teal-500/20 hover:border-teal-500/30 text-[10px] font-bold transition-all flex items-center gap-1"><i class="far fa-copy"></i> نسخ الاقتباس Citation</button>
                                <span class="flex items-center gap-1">روابط تصفح وتحميل المرجع <i class="fas fa-link text-teal-400"></i></span>
                            </h4>
                            <div id="refd-links-buttons-grid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                <!-- Populated in JS -->
                            </div>
                        </div>

                        <!-- Citation box -->
                        <div class="bg-black/40 border border-white/5 p-4 rounded-xl space-y-1.5 text-right">
                            <span class="text-[9px] text-gray-500 font-bold block">IEEE Citation Format</span>
                            <p id="refd-citation-preview" class="text-[11px] font-mono text-gray-300 ltr-text text-left select-all bg-black/50 p-2.5 rounded border border-white/5"></p>
                        </div>
                    </div>

                    <!-- TAB 5: Curriculum -->
                    <div id="refd-curriculum" class="refd-tab-pane hidden space-y-6">
                        <div class="bg-black/30 border border-white/10 p-5 rounded-2xl space-y-4">
                            <div id="refd-curr-tracks-div" class="space-y-2 hidden text-right">
                                <h4 class="text-xs font-bold text-gray-400 flex items-center gap-1.5 justify-end">المسارات الأكاديمية المرتبطة <i class="fas fa-graduation-cap text-teal-500"></i></h4>
                                <div id="refd-curr-tracks-list" class="flex flex-wrap gap-2 justify-end"></div>
                            </div>
                            
                            <div id="refd-curr-courses-div" class="space-y-2 hidden text-right">
                                <h4 class="text-xs font-bold text-gray-400 flex items-center gap-1.5 justify-end">الكورسات المرتبطة <i class="fas fa-book text-blue-400"></i></h4>
                                <div id="refd-curr-courses-list" class="flex flex-wrap gap-2 justify-end"></div>
                            </div>
                        </div>
                    </div>

                    <!-- TAB 6: Related References -->
                    <div id="refd-related" class="refd-tab-pane hidden space-y-4">
                        <h4 class="text-xs font-bold text-gray-400 flex items-center gap-1.5 justify-end mb-4">مراجع ومصادر تعلم مشابهة موصى بها <i class="fas fa-project-diagram text-teal-400"></i></h4>
                        <div id="refd-related-list" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <!-- Populated in JS -->
                        </div>
                    </div>

                </div>
            </div>
        `;
        document.body.appendChild(drawerOverlay);

        // Bind Close Drawer event
        document.getElementById('refd-close-btn').addEventListener('click', closeDrawer);
        drawerOverlay.addEventListener('click', (e) => {
            if (e.target.id === 'reference-detail-drawer-overlay') closeDrawer();
        });

        // Tab Switching Event Listeners
        document.querySelectorAll('.references-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.references-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                document.querySelectorAll('.refd-tab-pane').forEach(p => p.classList.add('hidden'));
                const targetTab = btn.getAttribute('data-tab');
                document.getElementById(targetTab)?.classList.remove('hidden');
            });
        });
    }

    // 5. Drawer animations helpers
    function openDrawer() {
        const overlay = document.getElementById('reference-detail-drawer-overlay');
        const drawer = document.getElementById('reference-detail-drawer');
        overlay.classList.remove('hidden');
        // Force reflow
        overlay.offsetHeight;
        overlay.classList.add('active');
        drawer.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
        const overlay = document.getElementById('reference-detail-drawer-overlay');
        const drawer = document.getElementById('reference-detail-drawer');
        if (!overlay || !drawer) return;

        overlay.classList.remove('active');
        drawer.classList.remove('active');
        
        setTimeout(() => {
            overlay.classList.add('hidden');
            document.body.style.overflow = '';
        }, 300);
    }

    let activeCitationText = '';

    // 6. Primary Action: Open Reference details from anywhere
    window.openReferenceDetailModal = async function(refId) {
        if (!supabase) {
            console.error("References Drawer: Supabase client is not initialized.");
            return;
        }

        // Reset Tab state to Overview
        document.querySelector('.references-tab-btn[data-tab="refd-overview"]').click();

        // Show loader and open drawer container
        document.getElementById('refd-loader').classList.remove('hidden');
        openDrawer();

        try {
            // A. Fetch Reference Data
            const { data: ref, error } = await supabase
                .from('reference_library')
                .select('*')
                .eq('id', refId)
                .maybeSingle();

            if (error) throw error;
            if (!ref) {
                console.error("Reference not found:", refId);
                closeDrawer();
                return;
            }

            // B. Increment Analytics Logs asynchronously (Clicks/Views tracking)
            supabase.from('reference_library')
                .update({ views_count: (ref.views_count || 0) + 1 })
                .eq('id', ref.id)
                .then(); // Fire and forget

            // C. Map basic fields to DOM
            document.getElementById('refd-title').textContent = ref.title;
            document.getElementById('refd-subtitle').textContent = `${ref.type} • ${ref.experience_level || 'Beginner'}`;
            document.getElementById('refd-full-desc').textContent = ref.full_description || ref.short_description || 'لا يوجد وصف تفصيلي متوفر لهذا المرجع حالياً.';
            
            const coverEl = document.getElementById('refd-logo');
            const bodyCoverEl = document.getElementById('refd-body-cover');
            const defaultCover = pathPrefix + 'assets/icons/BUSLA-icon.png';
            coverEl.src = ref.cover_url || defaultCover;
            coverEl.onerror = () => { coverEl.src = defaultCover; };
            bodyCoverEl.src = ref.cover_url || defaultCover;
            bodyCoverEl.onerror = () => { bodyCoverEl.src = defaultCover; };

            document.getElementById('refd-experience').textContent = ref.experience_level || 'Beginner';
            document.getElementById('refd-type').textContent = ref.type;
            document.getElementById('refd-year').textContent = ref.publication_year || '---';
            document.getElementById('refd-author').textContent = ref.author || 'مؤلف غير معروف';

            // D. Set header badges & links
            document.getElementById('refd-badge-importance').textContent = ref.importance || 'Optional';
            document.getElementById('refd-badge-language').textContent = ref.language || 'English';

            let statusText = 'مسودة';
            let statusClass = 'bg-gray-500/10 text-gray-400 border-gray-500/20';
            if (ref.status === 'Published') {
                statusText = 'منشور';
                statusClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            } else if (ref.status === 'Hidden') {
                statusText = 'مخفي';
                statusClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
            }
            const statusEl = document.getElementById('refd-badge-status');
            statusEl.textContent = statusText;
            statusEl.className = `text-[9px] font-black border px-2 py-0.5 rounded-full uppercase tracking-wider ${statusClass}`;

            const trackNames = await getTrackNames(ref.track_ids);
            document.getElementById('refd-track-name').textContent = trackNames.length > 0 ? `المسار: ${trackNames.join('، ')}` : 'مرجع عام';

            const updatedAt = ref.updated_at ? new Date(ref.updated_at).toLocaleDateString('ar-EG') : 'غير متوفر';
            document.getElementById('refd-updated-at').textContent = `تحديث: ${updatedAt}`;

            // E. Read Online & Download Buttons
            const readBtn = document.getElementById('refd-header-read-btn');
            if (ref.read_online_url) {
                readBtn.href = ref.read_online_url;
                readBtn.classList.remove('hidden');
                readBtn.onclick = () => window.trackRefClick(ref.id);
            } else {
                readBtn.classList.add('hidden');
            }

            const downloadBtn = document.getElementById('refd-header-download-btn');
            if (ref.download_pdf_url) {
                downloadBtn.href = ref.download_pdf_url;
                downloadBtn.classList.remove('hidden');
                downloadBtn.onclick = () => window.trackRefClick(ref.id);
            } else {
                downloadBtn.classList.add('hidden');
            }

            // F. Why Read & Educational Benefits
            const whyReadDiv = document.getElementById('refd-why-read-div');
            if (ref.why_read) {
                whyReadDiv.classList.remove('hidden');
                document.getElementById('refd-why-read').textContent = ref.why_read;
            } else {
                whyReadDiv.classList.add('hidden');
            }

            const takeawaysDiv = document.getElementById('refd-takeaways-div');
            const takeawaysList = document.getElementById('refd-takeaways-list');
            takeawaysList.innerHTML = '';
            const takeaways = ref.key_takeaways || [];
            if (takeaways.length > 0) {
                takeawaysDiv.classList.remove('hidden');
                takeaways.forEach(t => {
                    const li = document.createElement('li');
                    li.className = 'flex items-start gap-2 justify-end mb-1.5';
                    li.innerHTML = `<span>${t}</span> <i class="fas fa-check text-emerald-400 mt-1 text-xs shrink-0"></i>`;
                    takeawaysList.appendChild(li);
                });
            } else {
                takeawaysDiv.classList.add('hidden');
            }

            const benefitsDiv = document.getElementById('refd-benefits-div');
            const benefitsList = document.getElementById('refd-benefits-list');
            benefitsList.innerHTML = '';
            const benefits = ref.what_you_will_learn || [];
            if (benefits.length > 0) {
                benefitsDiv.classList.remove('hidden');
                benefits.forEach(b => {
                    const li = document.createElement('li');
                    li.className = 'flex items-start gap-2 justify-end mb-1.5';
                    li.innerHTML = `<span>${b}</span> <i class="fas fa-book-reader text-blue-400 mt-1 text-xs shrink-0"></i>`;
                    benefitsList.appendChild(li);
                });
            } else {
                benefitsDiv.classList.add('hidden');
            }

            // G. Abstract & Key Ideas & Prereqs
            document.getElementById('refd-abstract-text').textContent = ref.abstract || 'No abstract text is available for this reference. You can read it directly from the links tab.';
            
            const ideasDiv = document.getElementById('refd-ideas-div');
            const ideasList = document.getElementById('refd-ideas-list');
            ideasList.innerHTML = '';
            const ideas = ref.key_ideas || [];
            if (ideas.length > 0) {
                ideasDiv.classList.remove('hidden');
                ideas.forEach(id => {
                    const li = document.createElement('li');
                    li.className = 'flex items-start gap-2 justify-end mb-1.5';
                    li.innerHTML = `<span>${id}</span> <i class="fas fa-lightbulb text-purple-400 mt-1 text-xs shrink-0"></i>`;
                    ideasList.appendChild(li);
                });
            } else {
                ideasDiv.classList.add('hidden');
            }

            const prereqsDiv = document.getElementById('refd-prereqs-div');
            const prereqsList = document.getElementById('refd-prereqs-list');
            prereqsList.innerHTML = '';
            const prereqs = ref.prerequisites || [];
            if (prereqs.length > 0) {
                prereqsDiv.classList.remove('hidden');
                prereqs.forEach(p => {
                    const li = document.createElement('li');
                    li.className = 'flex items-start gap-2 justify-end mb-1.5';
                    li.innerHTML = `<span>${p}</span> <i class="fas fa-exclamation-triangle text-amber-500 mt-1 text-xs shrink-0"></i>`;
                    prereqsList.appendChild(li);
                });
            } else {
                prereqsDiv.classList.add('hidden');
            }

            // H. Publication Data mapping
            document.getElementById('refd-pub-author').textContent = ref.author || 'مؤلف غير معروف';
            
            const contribDiv = document.getElementById('refd-pub-contrib-div');
            if (ref.contributors && ref.contributors.length > 0) {
                contribDiv.classList.remove('hidden');
                document.getElementById('refd-pub-contributors').textContent = ref.contributors.join(', ');
            } else {
                contribDiv.classList.add('hidden');
            }

            const publDiv = document.getElementById('refd-pub-publisher-div');
            if (ref.publisher) {
                publDiv.classList.remove('hidden');
                document.getElementById('refd-pub-publisher').textContent = ref.publisher;
            } else {
                publDiv.classList.add('hidden');
            }

            const instDiv = document.getElementById('refd-pub-inst-div');
            if (ref.institution) {
                instDiv.classList.remove('hidden');
                document.getElementById('refd-pub-institution').textContent = ref.institution;
            } else {
                instDiv.classList.add('hidden');
            }

            const univDiv = document.getElementById('refd-pub-univ-div');
            if (ref.university) {
                univDiv.classList.remove('hidden');
                document.getElementById('refd-pub-university').textContent = ref.university;
            } else {
                univDiv.classList.add('hidden');
            }

            const jourDiv = document.getElementById('refd-pub-journal-div');
            if (ref.journal) {
                jourDiv.classList.remove('hidden');
                document.getElementById('refd-pub-journal').textContent = ref.journal;
            } else {
                jourDiv.classList.add('hidden');
            }

            const confDiv = document.getElementById('refd-pub-conf-div');
            if (ref.conference) {
                confDiv.classList.remove('hidden');
                document.getElementById('refd-pub-conference').textContent = ref.conference;
            } else {
                confDiv.classList.add('hidden');
            }

            const editDiv = document.getElementById('refd-pub-edition-div');
            if (ref.edition) {
                editDiv.classList.remove('hidden');
                document.getElementById('refd-pub-edition').textContent = ref.edition;
            } else {
                editDiv.classList.add('hidden');
            }

            const doiDiv = document.getElementById('refd-pub-doi-div');
            if (ref.doi) {
                doiDiv.classList.remove('hidden');
                document.getElementById('refd-pub-doi').textContent = ref.doi;
            } else {
                doiDiv.classList.add('hidden');
            }

            const isbnDiv = document.getElementById('refd-pub-isbn-div');
            if (ref.isbn) {
                isbnDiv.classList.remove('hidden');
                document.getElementById('refd-pub-isbn').textContent = ref.isbn;
            } else {
                isbnDiv.classList.add('hidden');
            }

            const issnDiv = document.getElementById('refd-pub-issn-div');
            if (ref.issn) {
                issnDiv.classList.remove('hidden');
                document.getElementById('refd-pub-issn').textContent = ref.issn;
            } else {
                issnDiv.classList.add('hidden');
            }

            // I. Render Links Buttons Grid
            const linksGrid = document.getElementById('refd-links-buttons-grid');
            linksGrid.innerHTML = '';
            
            const addLinkBtn = (url, text, icon, colorClasses) => {
                if (!url) return;
                const a = document.createElement('a');
                a.href = url;
                a.target = '_blank';
                a.onclick = () => window.trackRefClick(ref.id);
                a.className = `p-3 rounded-xl font-bold text-xs flex items-center justify-between border transition-all ${colorClasses}`;
                a.innerHTML = `<i class="fas fa-chevron-left text-[10px] opacity-60"></i><span class="text-right">${text}</span><i class="${icon} text-base shrink-0"></i>`;
                linksGrid.appendChild(a);
            };

            addLinkBtn(ref.read_online_url, 'تصفح وقراءة المصدر مباشرة', 'fas fa-book-open', 'bg-teal-500/10 hover:bg-teal-500/20 border-teal-500/30 text-teal-400');
            addLinkBtn(ref.download_pdf_url, 'تحميل ملف PDF المرجع', 'fas fa-file-pdf', 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-400');
            addLinkBtn(ref.ieee_url, 'تصفح على موقع IEEE Xplore', 'fas fa-university', 'bg-[#00629B]/10 hover:bg-[#00629B]/20 border-[#00629B]/30 text-[#00629B]');
            addLinkBtn(ref.springer_url, 'تصفح على موقع Springer Link', 'fas fa-external-link-alt', 'bg-[#001E3C]/10 hover:bg-[#001E3C]/20 border-[#001E3C]/30 text-[#001E3C]');
            addLinkBtn(ref.acm_url, 'تصفح في مكتبة ACM الرقمية', 'fas fa-graduation-cap', 'bg-[#002F6C]/10 hover:bg-[#002F6C]/20 border-[#002F6C]/30 text-[#002F6C]');
            addLinkBtn(ref.sciencedirect_url, 'تصفح على موقع ScienceDirect', 'fas fa-journal-whills', 'bg-[#FF6600]/10 hover:bg-[#FF6600]/20 border-[#FF6600]/30 text-[#FF6600]');
            addLinkBtn(ref.github_url, 'مستودع الكود والمشاريع GitHub', 'fab fa-github', 'bg-white/5 hover:bg-white/10 border-white/10 text-white');
            addLinkBtn(ref.official_source_url, 'رابط المصدر الرسمي للمرجع', 'fas fa-link', 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-400');

            if (linksGrid.children.length === 0) {
                linksGrid.innerHTML = '<div class="col-span-full text-center text-xs text-gray-500 py-3">لا توجد روابط وصول خارجية مسجلة لهذا المرجع.</div>';
            }

            // J. Build IEEE Citation
            const authorText = ref.author || 'Unknown';
            const yearText = ref.publication_year ? ` (${ref.publication_year})` : '';
            const publisherText = ref.publisher || ref.journal || ref.university || 'Busla Lib';
            const doiText = ref.doi ? `, doi: ${ref.doi}` : '';
            activeCitationText = `${authorText}, "${ref.title}", ${publisherText}${yearText}${doiText}.`;
            document.getElementById('refd-citation-preview').textContent = activeCitationText;

            // K. Curriculum Integration Rendering
            const currTracksDiv = document.getElementById('refd-curr-tracks-div');
            const currTracksList = document.getElementById('refd-curr-tracks-list');
            currTracksList.innerHTML = '';
            currTracksDiv.classList.add('hidden');

            const currCoursesDiv = document.getElementById('refd-curr-courses-div');
            const currCoursesList = document.getElementById('refd-curr-courses-list');
            currCoursesList.innerHTML = '';
            currCoursesDiv.classList.add('hidden');

            document.getElementById('refd-curriculum').classList.add('hidden');
            let hasCurriculum = false;

            if (trackNames.length > 0) {
                hasCurriculum = true;
                currTracksDiv.classList.remove('hidden');
                trackNames.forEach(tName => {
                    const span = document.createElement('span');
                    span.className = 'px-3 py-1 bg-teal-500/10 border border-teal-500/20 text-teal-400 rounded-lg text-xs font-bold';
                    span.textContent = tName;
                    currTracksList.appendChild(span);
                });
            }

            const courseIds = ref.course_ids || [];
            if (courseIds.length > 0) {
                const { data: courses } = await supabase
                    .from('courses')
                    .select('course_id, title')
                    .in('course_id', courseIds);

                if (courses && courses.length > 0) {
                    hasCurriculum = true;
                    currCoursesDiv.classList.remove('hidden');
                    courses.forEach(course => {
                        const btn = document.createElement('button');
                        btn.className = 'px-3 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/40 text-blue-400 hover:text-blue-300 rounded-lg text-xs font-bold transition-all';
                        btn.textContent = course.title;
                        btn.onclick = () => {
                            closeDrawer();
                            if (typeof window.viewCourseInRoadmap === 'function') {
                                window.viewCourseInRoadmap(course.course_id);
                            } else {
                                window.location.hash = '#roadmap';
                            }
                        };
                        currCoursesList.appendChild(btn);
                    });
                }
            }

            if (hasCurriculum) {
                document.getElementById('refd-curriculum').classList.remove('hidden');
            }

            // L. Similar References Fetch & Render
            const relatedList = document.getElementById('refd-related-list');
            relatedList.innerHTML = '';
            
            // Build query for matching criteria: same tracks or types
            let relatedQuery = supabase
                .from('reference_library')
                .select('id, title, type, cover_url, author, publication_year')
                .eq('status', 'Published')
                .neq('id', ref.id);

            // Manual related references have priority
            const manualRelated = ref.related_references || [];
            if (manualRelated.length > 0) {
                relatedQuery = relatedQuery.in('id', manualRelated);
            } else if (ref.track_ids && ref.track_ids.length > 0) {
                relatedQuery = relatedQuery.contains('track_ids', [ref.track_ids[0]]);
            } else {
                relatedQuery = relatedQuery.eq('type', ref.type);
            }

            const { data: similarRefs } = await relatedQuery.limit(4);

            if (similarRefs && similarRefs.length > 0) {
                similarRefs.forEach(sim => {
                    const card = document.createElement('div');
                    card.onclick = () => window.openReferenceDetailModal(sim.id);
                    card.className = 'flex items-center gap-3 p-3 bg-white/5 border border-white/5 hover:border-teal-500/50 rounded-xl cursor-pointer transition-all';
                    card.innerHTML = `
                        <img src="${sim.cover_url || defaultCover}" class="w-8 h-12 rounded object-cover shadow" onerror="this.src='${defaultCover}'">
                        <div class="flex-1 text-right min-w-0">
                            <p class="text-xs font-bold text-white truncate">${sim.title}</p>
                            <p class="text-[10px] text-gray-400 mt-1 truncate">${sim.author || 'مؤلف غير معروف'} • ${sim.publication_year || '---'}</p>
                            <span class="inline-block text-[9px] text-teal-400 bg-teal-500/5 px-2 py-0.5 rounded border border-teal-500/10 mt-1">${sim.type}</span>
                        </div>
                        <i class="fas fa-chevron-left text-[10px] text-gray-500 shrink-0"></i>
                    `;
                    relatedList.appendChild(card);
                });
            } else {
                relatedList.innerHTML = '<div class="col-span-full text-center text-xs text-gray-500 py-3">لا توجد مراجع مشابهة أو مقترحة حالياً.</div>';
            }

        } catch (err) {
            console.error("References Drawer: Error populating data:", err);
            closeDrawer();
        } finally {
            document.getElementById('refd-loader').classList.add('hidden');
        }
    };

    // Helper: Track Analytics Clicks
    window.trackRefClick = async function(refId) {
        if (!supabase) return;
        try {
            const { data: ref } = await supabase.from('reference_library').select('clicks_count').eq('id', refId).maybeSingle();
            if (ref) {
                await supabase.from('reference_library')
                    .update({ clicks_count: (ref.clicks_count || 0) + 1 })
                    .eq('id', refId);
            }
        } catch(e) {}
    };

    // Helper: Copy citation text
    window.copyReferenceCitation = function() {
        if (!activeCitationText) return;
        navigator.clipboard.writeText(activeCitationText).then(() => {
            if (typeof window.showToast === 'function') {
                window.showToast("تم نسخ الاقتباس العلمي بنجاح", "success");
            } else {
                alert("تم نسخ الاقتباس العلمي بنجاح");
            }
        }).catch(err => {
            console.error("Failed to copy citation:", err);
        });
    };

})();
