/**
 * BUSLA LMS - Omni-Search Engine (Ctrl + K)
 * Global Spotlight Search across Courses, Lessons, References, Tools, Experts & Navigation.
 * Vanilla JavaScript (ES6+) with Supabase Integration.
 */

(function () {
    if (window.BUSLA_OMNI_SEARCH_INITIALIZED) return;
    window.BUSLA_OMNI_SEARCH_INITIALIZED = true;

    // 1. Dynamic Path Resolution
    let pathPrefix = './';
    const loc = window.location.pathname;
    if (loc.includes('/admin/html/')) {
        pathPrefix = '../../';
    } else if (loc.includes('/pages/') || loc.includes('/admin/')) {
        pathPrefix = '../';
    }

    // 2. Global State
    let searchIndex = [];
    let isIndexLoaded = false;
    let isIndexLoading = false;
    let activeFilter = 'all';
    let currentFilteredResults = [];
    let selectedResultIndex = 0;
    let supabaseClient = null;

    // 3. Arabic Text Normalization
    function normalizeArabic(text) {
        if (!text) return '';
        return text
            .toString()
            .toLowerCase()
            .trim()
            .replace(/[\u064B-\u065F\u0670]/g, '') // Remove tashkeel/diacritics
            .replace(/[إأآا]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/[ىي]/g, 'ي')
            .replace(/ؤ/g, 'و')
            .replace(/ئ/g, 'ي')
            .replace(/ـ+/g, '') // Remove tatweel
            .replace(/\s+/g, ' ');
    }

    // 4. Highlight matched terms in text
    function highlightMatch(text, query) {
        if (!text || !query) return text || '';
        const normQuery = normalizeArabic(query);
        if (!normQuery) return text;

        const words = normQuery.split(' ').filter(w => w.length > 1);
        if (words.length === 0) return text;

        // Escape regex special characters
        const pattern = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        try {
            const regex = new RegExp(`(${pattern})`, 'gi');
            return text.replace(regex, '<mark class="bg-teal-500/30 text-teal-300 font-bold px-0.5 rounded">$1</mark>');
        } catch (e) {
            return text;
        }
    }

    // 5. Static Core Platform Navigation Shortcuts
    function getStaticNavItems() {
        return [
            {
                id: 'nav-home',
                type: 'nav',
                category: 'nav',
                badgeText: 'تنقل',
                badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
                icon: 'fas fa-home',
                title: 'الصفحة الرئيسية',
                subtitle: 'استكشف منصة بوصلة وأقسامها الأساسية',
                url: `${pathPrefix}index.html#hero`,
                tags: ['رئيسية', 'home', 'بوصلة', 'start']
            },
            {
                id: 'nav-roadmap',
                type: 'nav',
                category: 'nav',
                badgeText: 'المسار',
                badgeClass: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
                icon: 'fas fa-map-signs',
                title: 'خريطة المسار التعليمي (Roadmap)',
                subtitle: 'شجرة ومراحل تخصص Digital IC Design',
                url: `${pathPrefix}index.html#roadmap`,
                tags: ['مسار', 'roadmap', 'خريطة', 'شجرة', 'مراحل', 'phases']
            },
            {
                id: 'nav-courses',
                type: 'nav',
                category: 'nav',
                badgeText: 'الدورات',
                badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
                icon: 'fas fa-graduation-cap',
                title: 'مكتبة الدورات التدريبية',
                subtitle: 'قائمة شاملة لكافة كورسات ومحتويات المنصة',
                url: `${pathPrefix}index.html#courses`,
                tags: ['دورات', 'courses', 'تدريب', 'شروحات', 'فيديوهات']
            },
            {
                id: 'nav-references',
                type: 'nav',
                category: 'nav',
                badgeText: 'المكتبة',
                badgeClass: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
                icon: 'fas fa-book-reader',
                title: 'المكتبة العلمية والمراجع',
                subtitle: 'كتب، أوراق بحثية، وأدلة ومذكرات رقمية',
                url: `${pathPrefix}index.html#references`,
                tags: ['مراجع', 'مكتبة', 'كتب', 'references', 'books', 'papers', 'cheatsheet']
            },
            {
                id: 'nav-tools',
                type: 'nav',
                category: 'nav',
                badgeText: 'الأدوات',
                badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
                icon: 'fas fa-tools',
                title: 'أدوات التصميم البرمجية (EDA Tools)',
                subtitle: 'أدوات المحاكاة والـ Synthesis والـ Layout',
                url: `${pathPrefix}index.html#tools`,
                tags: ['ادوات', 'tools', 'eda', 'modelsim', 'vivado', 'synopsys', 'cadence', 'software']
            },
            {
                id: 'nav-experts',
                type: 'nav',
                category: 'nav',
                badgeText: 'الخبراء',
                badgeClass: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
                icon: 'fas fa-user-astronaut',
                title: 'مجلس الخبراء والنصائح',
                subtitle: 'نصائح مهندسي وخبراء المجال لمشاريع التخرج والعمل',
                url: `${pathPrefix}index.html#experts`,
                tags: ['خبراء', 'experts', 'نصائح', 'ارشاد', 'mentors']
            },
            {
                id: 'nav-student-dash',
                type: 'nav',
                category: 'nav',
                badgeText: 'لوحة التحكم',
                badgeClass: 'bg-green-500/20 text-green-400 border-green-500/30',
                icon: 'fas fa-user-graduate',
                title: 'لوحة تحكم الطالب (Student Dashboard)',
                subtitle: 'المهام الأسبوعية، التقويم، التقدم، ومجموع النقاط',
                url: `${pathPrefix}pages/student-dash.html`,
                tags: ['طالب', 'student', 'dashboard', 'مهام', 'تقويم', 'نقاط', 'xp']
            },
            {
                id: 'nav-leader-dash',
                type: 'nav',
                category: 'nav',
                badgeText: 'لوحة القيادة',
                badgeClass: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
                icon: 'fas fa-user-shield',
                title: 'لوحة تحكم القائد (Leader Dashboard)',
                subtitle: 'إدارة الفريق، تعيين المهام، والتصحيح ورتب الفريق',
                url: `${pathPrefix}pages/leader-dash.html`,
                tags: ['قائد', 'leader', 'فريق', 'squad', 'تصحيح', 'مهام']
            },
            {
                id: 'nav-create-team',
                type: 'nav',
                category: 'nav',
                badgeText: 'الفرق',
                badgeClass: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
                icon: 'fas fa-users-plus',
                title: 'تكوين فريق جديد',
                subtitle: 'إنشاء فريق دراسي لمشاريع التخرج أو الدراسة المشتركة',
                url: `${pathPrefix}pages/create-team.html`,
                tags: ['تكوين فريق', 'انشاء فريق', 'create team', 'فرق', 'team']
            }
        ];
    }

    // 6. Supabase Client Resolver
    async function getSupabase() {
        if (supabaseClient) return supabaseClient;
        if (window.supabase) {
            supabaseClient = window.supabase;
            return supabaseClient;
        }
        try {
            const mod = await import('./supabase-config.js');
            supabaseClient = mod.supabase;
            return supabaseClient;
        } catch (e) {
            console.warn("Omni-Search: Supabase config could not be loaded dynamically", e);
            return null;
        }
    }

    // 7. Load & Build Live Unified Index
    async function buildIndex() {
        if (isIndexLoading) return;
        isIndexLoading = true;

        // Initialize with static navigation items
        searchIndex = [...getStaticNavItems()];

        try {
            const supa = await getSupabase();
            if (!supa) {
                isIndexLoaded = true;
                isIndexLoading = false;
                return;
            }

            // Fetch in parallel for ultimate speed
            const [coursesRes, materialsRes, refsRes, toolsRes, expertsRes] = await Promise.allSettled([
                supa.from('courses').select('course_id, title, description, type, phase_id, is_active').eq('is_active', true),
                supa.from('course_materials').select('content_id, course_id, title, type, duration, base_xp').eq('status', true),
                supa.from('reference_library').select('id, title, short_title, author, type, tags, experience_level, importance').eq('status', 'Published'),
                supa.from('tools').select('id, name, short_name, short_description, tags, type, experience_level, importance').eq('status', 'Published'),
                supa.from('experts').select('id, name, role, linkedin_url')
            ]);

            // Index Courses
            if (coursesRes.status === 'fulfilled' && coursesRes.value.data) {
                coursesRes.value.data.forEach(c => {
                    searchIndex.push({
                        id: `course-${c.course_id}`,
                        type: 'course',
                        category: 'courses',
                        courseId: c.course_id,
                        badgeText: 'دورة',
                        badgeClass: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
                        icon: 'fas fa-graduation-cap',
                        title: c.title,
                        subtitle: c.description || 'دورة تدريبية متخصصة',
                        url: `${pathPrefix}pages/course-player.html?course=${encodeURIComponent(c.course_id)}`,
                        tags: [c.type || '', 'كورس', 'دورة']
                    });
                });
            }

            // Index Materials (Lessons / Quizzes / Projects)
            if (materialsRes.status === 'fulfilled' && materialsRes.value.data) {
                materialsRes.value.data.forEach(m => {
                    let icon = 'fas fa-play-circle';
                    let badge = 'فيديو';
                    let badgeColor = 'bg-blue-500/20 text-blue-300 border-blue-500/30';
                    if (m.type === 'quiz') {
                        icon = 'fas fa-question-circle';
                        badge = 'اختبار';
                        badgeColor = 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
                    } else if (m.type === 'project') {
                        icon = 'fas fa-project-diagram';
                        badge = 'مشروع';
                        badgeColor = 'bg-purple-500/20 text-purple-300 border-purple-500/30';
                    }

                    searchIndex.push({
                        id: `mat-${m.content_id}`,
                        type: 'material',
                        category: 'courses',
                        courseId: m.course_id,
                        contentId: m.content_id,
                        badgeText: badge,
                        badgeClass: badgeColor,
                        icon: icon,
                        title: m.title,
                        subtitle: `${m.duration ? `${m.duration} دقيقة • ` : ''}${m.base_xp ? `${m.base_xp} XP` : 'درس تعليمي'}`,
                        url: `${pathPrefix}pages/course-player.html?course=${encodeURIComponent(m.course_id)}&content=${encodeURIComponent(m.content_id)}`,
                        tags: [m.type, 'درس', 'محتوى']
                    });
                });
            }

            // Index References
            if (refsRes.status === 'fulfilled' && refsRes.value.data) {
                refsRes.value.data.forEach(r => {
                    searchIndex.push({
                        id: `ref-${r.id}`,
                        type: 'reference',
                        category: 'references',
                        refId: r.id,
                        badgeText: r.type || 'مرجع',
                        badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
                        icon: 'fas fa-book',
                        title: r.title,
                        subtitle: `${r.author || 'مؤلف معتمد'} • ${r.experience_level || 'عام'}`,
                        tags: [...(r.tags || []), r.short_title || '', r.type || '', 'كتاب', 'مرجع', 'ورقة علمية']
                    });
                });
            }

            // Index Tools
            if (toolsRes.status === 'fulfilled' && toolsRes.value.data) {
                toolsRes.value.data.forEach(t => {
                    const desc = t.short_description || t.description || '';
                    searchIndex.push({
                        id: `tool-${t.id}`,
                        type: 'tool',
                        category: 'tools',
                        toolId: t.id,
                        badgeText: t.type || 'أداة',
                        badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
                        icon: 'fas fa-screwdriver-wrench',
                        title: t.name,
                        subtitle: desc ? (desc.length > 80 ? desc.substring(0, 80) + '...' : desc) : 'برنامج تصميم EDA',
                        tags: [...(t.tags || []), t.short_name || '', t.type || '', 'برنامج', 'eda', 'اداة'].filter(Boolean)
                    });
                });
            }

            // Index Experts
            if (expertsRes.status === 'fulfilled' && expertsRes.value.data) {
                expertsRes.value.data.forEach(e => {
                    searchIndex.push({
                        id: `expert-${e.id}`,
                        type: 'expert',
                        category: 'nav',
                        badgeText: 'خبير',
                        badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
                        icon: 'fas fa-user-check',
                        title: e.name,
                        subtitle: e.role || 'خبير استشاري في هندسة الرقائق',
                        url: `${pathPrefix}index.html#experts`,
                        tags: [e.role || '', 'خبير', 'نصيحة', 'mentor']
                    });
                });
            }

            isIndexLoaded = true;
        } catch (err) {
            console.error("Omni-Search: Error populating index", err);
        } finally {
            isIndexLoading = false;
        }
    }

    // 8. Inject Stylesheet
    function injectStyles() {
        if (document.getElementById('busla-omni-search-styles')) return;
        const style = document.createElement('style');
        style.id = 'busla-omni-search-styles';
        style.innerHTML = `
            #omni-search-modal-backdrop {
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            }
            #omni-search-modal-backdrop.omni-open {
                opacity: 1;
                pointer-events: auto;
            }
            #omni-search-container {
                transform: scale(0.95) translateY(-15px);
                transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            }
            #omni-search-modal-backdrop.omni-open #omni-search-container {
                transform: scale(1) translateY(0);
            }
            .omni-result-item.omni-selected {
                background: linear-gradient(90deg, rgba(0, 106, 103, 0.25) 0%, rgba(34, 196, 93, 0.1) 100%);
                border-color: rgba(0, 222, 200, 0.4);
            }
            .omni-result-item.omni-selected .omni-action-icon {
                opacity: 1;
                transform: translateX(-3px);
            }
            /* Clean scrollbar for search results */
            #omni-results-list::-webkit-scrollbar {
                width: 6px;
            }
            #omni-results-list::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.2);
            }
            #omni-results-list::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.15);
                border-radius: 9999px;
            }
            #omni-results-list::-webkit-scrollbar-thumb:hover {
                background: rgba(0, 222, 200, 0.4);
            }
        `;
        document.head.appendChild(style);
    }

    // 9. Inject HTML Modal Template
    function injectModal() {
        if (document.getElementById('omni-search-modal-backdrop')) return;

        const modalDiv = document.createElement('div');
        modalDiv.id = 'omni-search-modal-backdrop';
        modalDiv.className = 'fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-start justify-center p-3 sm:p-6 pt-10 sm:pt-20 font-cairo';
        modalDiv.setAttribute('role', 'dialog');
        modalDiv.setAttribute('aria-modal', 'true');
        modalDiv.setAttribute('aria-label', 'لوحة البحث الشامل');

        modalDiv.innerHTML = `
            <div id="omni-search-container" class="w-full max-w-2xl bg-[#0c1014] border border-white/10 rounded-2xl sm:rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[85vh] transition-all">
                
                <!-- Search Input Header -->
                <div class="p-3 sm:p-4 border-b border-white/10 flex items-center gap-3 bg-white/[0.02]">
                    <div class="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
                        <i class="fas fa-search text-sm"></i>
                    </div>
                    <input 
                        type="text" 
                        id="omni-search-input" 
                        class="flex-1 bg-transparent border-0 outline-none text-white text-sm sm:text-base placeholder-gray-500 font-medium font-cairo text-right"
                        placeholder="ابحث عن درس، مرجع، أداة، أو تنقل سريع... (Ctrl + K)"
                        autocomplete="off"
                        spellcheck="false"
                    >
                    <button id="omni-clear-btn" class="hidden text-gray-500 hover:text-white transition-colors p-1 text-sm shrink-0" title="مسح">
                        <i class="fas fa-times-circle"></i>
                    </button>
                    <button onclick="window.closeOmniSearch()" class="text-gray-400 hover:text-white transition-colors w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center text-sm shrink-0" title="إغلاق">
                        <kbd class="hidden sm:inline-block text-[10px] bg-white/10 px-1.5 py-0.5 rounded font-mono text-gray-400 border border-white/10">Esc</kbd>
                        <i class="fas fa-times sm:hidden"></i>
                    </button>
                </div>

                <!-- Category Filters Tabs -->
                <div class="flex items-center gap-1.5 px-3 sm:px-4 py-2 border-b border-white/5 bg-black/40 overflow-x-auto no-scrollbar text-xs">
                    <button class="omni-tab-btn active px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 bg-teal-500/20 text-teal-300 border border-teal-500/30" data-filter="all">
                        <i class="fas fa-asterisk text-[9px] ml-1"></i> الكل
                    </button>
                    <button class="omni-tab-btn px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 text-gray-400 hover:bg-white/5 hover:text-white" data-filter="courses">
                        <i class="fas fa-graduation-cap text-[10px] ml-1"></i> الدورات والدروس
                    </button>
                    <button class="omni-tab-btn px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 text-gray-400 hover:bg-white/5 hover:text-white" data-filter="references">
                        <i class="fas fa-book text-[10px] ml-1"></i> المراجع والكتب
                    </button>
                    <button class="omni-tab-btn px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 text-gray-400 hover:bg-white/5 hover:text-white" data-filter="tools">
                        <i class="fas fa-tools text-[10px] ml-1"></i> الأدوات (EDA)
                    </button>
                    <button class="omni-tab-btn px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 text-gray-400 hover:bg-white/5 hover:text-white" data-filter="nav">
                        <i class="fas fa-compass text-[10px] ml-1"></i> التنقل السريع
                    </button>
                </div>

                <!-- Results List Container -->
                <div id="omni-results-list" class="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1.5 min-h-[160px] max-h-[55vh]">
                    <!-- Rendered Dynamically -->
                </div>

                <!-- Footer Navigation Hints -->
                <div class="px-4 py-2.5 bg-black/60 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-400 shrink-0">
                    <div class="hidden sm:flex items-center gap-3">
                        <span class="flex items-center gap-1.5">
                            <kbd class="bg-white/10 px-1 py-0.5 rounded font-mono text-[9px] border border-white/10">↑</kbd>
                            <kbd class="bg-white/10 px-1 py-0.5 rounded font-mono text-[9px] border border-white/10">↓</kbd>
                            <span>للتنقل</span>
                        </span>
                        <span class="text-white/20">•</span>
                        <span class="flex items-center gap-1.5">
                            <kbd class="bg-white/10 px-1.5 py-0.5 rounded font-mono text-[9px] border border-white/10">Enter ↵</kbd>
                            <span>للاختيار</span>
                        </span>
                        <span class="text-white/20">•</span>
                        <span class="flex items-center gap-1.5">
                            <kbd class="bg-white/10 px-1.5 py-0.5 rounded font-mono text-[9px] border border-white/10">Esc</kbd>
                            <span>للإغلاق</span>
                        </span>
                    </div>
                    <div class="flex items-center gap-1 mr-auto text-teal-400 font-bold" id="omni-results-count">
                        <i class="fas fa-bolt text-[10px]"></i>
                        <span id="omni-count-text">جاهز للبحث</span>
                    </div>
                </div>

            </div>
        `;

        document.body.appendChild(modalDiv);

        // Bind Backdrop Click (close when clicking outside container)
        modalDiv.addEventListener('click', (e) => {
            if (e.target === modalDiv) {
                window.closeOmniSearch();
            }
        });

        // Bind Clear Button
        const clearBtn = document.getElementById('omni-clear-btn');
        const inputEl = document.getElementById('omni-search-input');
        clearBtn.addEventListener('click', () => {
            inputEl.value = '';
            clearBtn.classList.add('hidden');
            performSearch('');
            inputEl.focus();
        });

        // Bind Filter Tabs
        const tabBtns = modalDiv.querySelectorAll('.omni-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => {
                    b.classList.remove('active', 'bg-teal-500/20', 'text-teal-300', 'border', 'border-teal-500/30');
                    b.classList.add('text-gray-400');
                });
                btn.classList.add('active', 'bg-teal-500/20', 'text-teal-300', 'border', 'border-teal-500/30');
                btn.classList.remove('text-gray-400');

                activeFilter = btn.dataset.filter;
                performSearch(inputEl.value);
            });
        });

        // Bind Input Changes
        let debounceTimer = null;
        inputEl.addEventListener('input', (e) => {
            const val = e.target.value;
            if (val.trim()) {
                clearBtn.classList.remove('hidden');
            } else {
                clearBtn.classList.add('hidden');
            }

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                performSearch(val);
            }, 80);
        });

        // Bind Keyboard Navigation
        inputEl.addEventListener('keydown', handleKeyNavigation);
    }

    // 10. Search Execution & Ranking
    function performSearch(query) {
        const rawQuery = (query || '').trim();
        const normQuery = normalizeArabic(rawQuery);
        const tokens = normQuery.split(' ').filter(Boolean);

        let list = searchIndex;

        // 1. Filter by category if not 'all'
        if (activeFilter !== 'all') {
            list = list.filter(item => item.category === activeFilter);
        }

        // 2. If empty query, show featured / quick navigation suggestions
        if (tokens.length === 0) {
            currentFilteredResults = list.slice(0, 15);
            selectedResultIndex = 0;
            renderResults(currentFilteredResults, rawQuery);
            return;
        }

        // 3. Scoring algorithm
        const scored = [];
        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            const normTitle = normalizeArabic(item.title);
            const normSubtitle = normalizeArabic(item.subtitle);
            const normTags = (item.tags || []).map(t => normalizeArabic(t));

            let score = 0;

            // Full phrase match in title
            if (normTitle === normQuery) {
                score += 150;
            } else if (normTitle.startsWith(normQuery)) {
                score += 90;
            } else if (normTitle.includes(normQuery)) {
                score += 60;
            }

            // Token level matches
            let allTokensMatched = true;
            for (let t = 0; t < tokens.length; t++) {
                const token = tokens[t];
                let tokenFound = false;

                if (normTitle.includes(token)) {
                    score += 25;
                    tokenFound = true;
                }
                if (normTags.some(tag => tag.includes(token))) {
                    score += 18;
                    tokenFound = true;
                }
                if (normSubtitle.includes(token)) {
                    score += 10;
                    tokenFound = true;
                }

                if (!tokenFound) {
                    allTokensMatched = false;
                }
            }

            // Only include items where at least one token matched, bonus if all tokens matched
            if (score > 0) {
                if (allTokensMatched) score += 30;
                // Slight boost for navigation items on short queries
                if (item.type === 'nav') score += 5;
                scored.push({ item, score });
            }
        }

        // Sort descending by score
        scored.sort((a, b) => b.score - a.score);
        currentFilteredResults = scored.map(s => s.item).slice(0, 30);
        selectedResultIndex = 0;
        renderResults(currentFilteredResults, rawQuery);
    }

    // 11. Render Results HTML
    function renderResults(results, query) {
        const container = document.getElementById('omni-results-list');
        const countText = document.getElementById('omni-count-text');
        if (!container) return;

        if (countText) {
            countText.textContent = `${results.length} نتيجة`;
        }

        if (results.length === 0) {
            container.innerHTML = `
                <div class="py-12 px-4 text-center">
                    <div class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3 text-gray-500 text-lg">
                        <i class="fas fa-search-minus"></i>
                    </div>
                    <p class="text-white font-bold text-sm">لم نجد أي نتائج مطابقة</p>
                    <p class="text-gray-500 text-xs mt-1">جرّب البحث بكلمات أبسط أو اختر قسماً آخر من الأعلى</p>
                </div>
            `;
            return;
        }

        container.innerHTML = results.map((item, idx) => {
            const isSelected = idx === selectedResultIndex;
            const highlightedTitle = highlightMatch(item.title, query);
            const highlightedSubtitle = highlightMatch(item.subtitle, query);

            return `
                <div 
                    class="omni-result-item ${isSelected ? 'omni-selected' : ''} group flex items-center justify-between p-3 rounded-xl border border-white/5 hover:border-teal-500/30 hover:bg-white/[0.04] transition-all cursor-pointer text-right"
                    data-index="${idx}"
                    onclick="window._handleOmniItemClick(${idx})"
                >
                    <div class="flex items-center gap-3 min-w-0 flex-1">
                        <div class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-teal-400 shrink-0 group-hover:scale-105 transition-transform">
                            <i class="${item.icon} text-sm"></i>
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2 mb-0.5">
                                <span class="text-xs sm:text-sm font-bold text-white group-hover:text-teal-300 transition-colors truncate">
                                    ${highlightedTitle}
                                </span>
                                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${item.badgeClass}">
                                    ${item.badgeText}
                                </span>
                            </div>
                            <p class="text-[11px] text-gray-400 truncate">
                                ${highlightedSubtitle}
                            </p>
                        </div>
                    </div>
                    <div class="omni-action-icon opacity-0 group-hover:opacity-100 transition-all text-teal-400 text-xs mr-2 shrink-0">
                        <i class="fas fa-arrow-left"></i>
                    </div>
                </div>
            `;
        }).join('');

        scrollSelectedIntoView();
    }

    // 12. Keyboard Navigation Handler
    function handleKeyNavigation(e) {
        if (currentFilteredResults.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedResultIndex = (selectedResultIndex + 1) % currentFilteredResults.length;
            updateSelectedVisual();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedResultIndex = (selectedResultIndex - 1 + currentFilteredResults.length) % currentFilteredResults.length;
            updateSelectedVisual();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            selectItem(selectedResultIndex);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            window.closeOmniSearch();
        }
    }

    function updateSelectedVisual() {
        const items = document.querySelectorAll('.omni-result-item');
        items.forEach((el, idx) => {
            if (idx === selectedResultIndex) {
                el.classList.add('omni-selected');
            } else {
                el.classList.remove('omni-selected');
            }
        });
        scrollSelectedIntoView();
    }

    function scrollSelectedIntoView() {
        const selected = document.querySelector('.omni-result-item.omni-selected');
        if (selected) {
            selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    // 13. Select / Execute Item Click
    function selectItem(idx) {
        if (idx < 0 || idx >= currentFilteredResults.length) return;
        const item = currentFilteredResults[idx];
        window.closeOmniSearch();

        if (item.type === 'reference') {
            // Open reference modal if available, otherwise navigate
            if (typeof window.openReferenceDetailModal === 'function') {
                window.openReferenceDetailModal(item.refId);
            } else {
                window.location.href = `${pathPrefix}index.html#references`;
            }
            return;
        }

        if (item.type === 'tool') {
            // Open tool modal if available, otherwise navigate
            if (typeof window.openToolDetailDrawer === 'function') {
                window.openToolDetailDrawer(item.toolId);
            } else {
                window.location.href = `${pathPrefix}index.html#tools`;
            }
            return;
        }

        // Generic URL navigation
        if (item.url) {
            window.location.href = item.url;
        }
    }
    window._handleOmniItemClick = selectItem;

    // 14. Public API: Open & Close Omni-Search
    window.openOmniSearch = function (filter = 'all') {
        injectStyles();
        injectModal();

        const backdrop = document.getElementById('omni-search-modal-backdrop');
        const inputEl = document.getElementById('omni-search-input');

        if (!backdrop || !inputEl) return;

        backdrop.classList.add('omni-open');

        // Reset or set filter tab
        if (filter && filter !== activeFilter) {
            const targetBtn = backdrop.querySelector(`.omni-tab-btn[data-filter="${filter}"]`);
            if (targetBtn) targetBtn.click();
        }

        // Background fetch if not already done
        if (!isIndexLoaded) {
            buildIndex().then(() => {
                performSearch(inputEl.value);
            });
        } else {
            performSearch(inputEl.value);
        }

        setTimeout(() => {
            inputEl.focus();
            inputEl.select();
        }, 80);
    };

    window.closeOmniSearch = function () {
        const backdrop = document.getElementById('omni-search-modal-backdrop');
        if (backdrop) {
            backdrop.classList.remove('omni-open');
        }
    };

    // 15. Global Keyboard Listener (Ctrl + K / Cmd + K)
    document.addEventListener('keydown', (e) => {
        // Check for Ctrl+K or Cmd+K
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            const backdrop = document.getElementById('omni-search-modal-backdrop');
            if (backdrop && backdrop.classList.contains('omni-open')) {
                window.closeOmniSearch();
            } else {
                window.openOmniSearch();
            }
        }
    });

    // 16. Auto-detect and bind any trigger elements with data-omni-search or .btn-omni-search
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-omni-search], .btn-omni-search').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const filter = el.dataset.omniFilter || 'all';
                window.openOmniSearch(filter);
            });
        });

        // Preload index in idle time for instant response
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(() => buildIndex());
        } else {
            setTimeout(() => buildIndex(), 1500);
        }
    });

})();
