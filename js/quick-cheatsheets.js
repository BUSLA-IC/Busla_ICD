/**
 * BUSLA LMS - Offline Quick Cheatsheets Engine & Interactive Drawer
 * Specialized for Digital IC Design (Linux, TCL, Verilog, STA, Git)
 * Architecture: IndexedDB Local Storage + Supabase Realtime Network-First Sync
 * Zero-Stale-Data Guarantee with Offline Fallback
 */

(function () {
    if (window.BUSLA_CHEATSHEETS_INITIALIZED) return;
    window.BUSLA_CHEATSHEETS_INITIALIZED = true;

    // 1. Dynamic Path Resolution
    let pathPrefix = './';
    const loc = window.location.pathname;
    if (loc.includes('/admin/html/')) {
        pathPrefix = '../../';
    } else if (loc.includes('/pages/') || loc.includes('/admin/')) {
        pathPrefix = '../';
    }

    // 2. Constants & DB Config
    const DB_NAME = 'BuslaOfflineDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'cheatsheets';
    const META_STORE = 'sync_meta';

    let currentCategory = 'all';
    let cachedCheatsheets = [];
    let isModalOpen = false;
    let dbInstance = null;
    let supabaseClient = null;

    // 3. Built-in Curated IC Design Cheatsheet Dataset (Offline Seed)
    const SEED_CHEATSHEETS = [
        // ==================== LINUX FOR EDA ====================
        {
            id: 'linux-find-rtl',
            category: 'linux',
            title: 'البحث عن ملفات الـ RTL في مجلد المشروع',
            command: 'find . -type f \\( -name "*.v" -o -name "*.sv" \\)',
            explanation: 'يبحث في المجلد الحالي وكافة المجلدات الفرعية عن جميع ملفات Verilog و SystemVerilog.',
            syntax_example: 'find src/ -name "*.v" | xargs wc -l',
            tags: ['linux', 'find', 'rtl', 'search', 'verilog'],
            importance: 'Essential',
            order_index: 10
        },
        {
            id: 'linux-grep-module',
            category: 'linux',
            title: 'البحث عن اسم Module أو إشارة داخل الأكواد',
            command: 'grep -rn "module\\s\\+alu" ./src',
            explanation: 'يبحث بشكل متكرر (-r) مع إظهار أرقام الأسطر (-n) عن أي تعريف لموديول محدد.',
            syntax_example: 'grep -rn "clk_wiz" . --color=auto',
            tags: ['linux', 'grep', 'search', 'module', 'signal'],
            importance: 'Essential',
            order_index: 20
        },
        {
            id: 'linux-bg-sim',
            category: 'linux',
            title: 'تشغيل المحاكاة في الخلفية دون انقطاع',
            command: 'nohup make run_sim > sim.log 2>&1 &',
            explanation: 'يشغل عملية المحاكاة الطويلة في الخلفية حتى لو أغلقت جلسة الـ SSH، مع حفظ المخرجات في sim.log.',
            syntax_example: 'tail -f sim.log',
            tags: ['linux', 'simulation', 'background', 'nohup', 'jobs'],
            importance: 'Essential',
            order_index: 30
        },
        {
            id: 'linux-kill-eda',
            category: 'linux',
            title: 'إيقاف عمليات برامج الـ EDA المعلقة',
            command: 'ps -ef | grep -E "vcs|vsim|innovus|dc_shell" | awk \'{print $2}\' | xargs kill -9',
            explanation: 'عرض وحذف جميع العمليات المعلقة لبرامج الـ EDA المحتجزة لمساحة الذاكرة أو الرخص (Licenses).',
            syntax_example: 'kill -9 <PID>',
            tags: ['linux', 'kill', 'eda', 'license', 'process'],
            importance: 'Advanced',
            order_index: 40
        },
        {
            id: 'linux-tar-tapeout',
            category: 'linux',
            title: 'ضغط ملفات الـ Tapeout والمشروع للأرشفة',
            command: 'tar -czvf project_tapeout_v1.tar.gz ./gds ./netlist ./reports',
            explanation: 'أرشفة وضغط مجلدات الـ GDSII والـ Netlist والتقارير في ملف مضغوط واحد.',
            syntax_example: 'tar -xzvf project_tapeout_v1.tar.gz',
            tags: ['linux', 'tar', 'tapeout', 'archive', 'compression'],
            importance: 'Recommended',
            order_index: 50
        },
        {
            id: 'linux-disk-mem',
            category: 'linux',
            title: 'فحص الذاكرة ومساحة القرص على سيرفر الـ EDA',
            command: 'df -h . && free -h',
            explanation: 'التأكد من توفر مساحة كافية على الخادم قبل تشغيل الـ Place & Route أو توليد ملفات الـ VCD الضخمة.',
            syntax_example: 'du -sh * | sort -h',
            tags: ['linux', 'disk', 'memory', 'server', 'storage'],
            importance: 'Essential',
            order_index: 60
        },

        // ==================== TCL FOR EDA & SYNTHESIS ====================
        {
            id: 'tcl-read-verilog',
            category: 'tcl',
            title: 'قراءة وتحميل ملفات الـ RTL في برنامج الـ Synthesis',
            command: 'read_verilog -sv [glob src/*.sv src/*.v]',
            explanation: 'أمر أساسي في Synopsys Design Compiler و Vivado لقراءة وتحليل ملفات الـ Verilog و SystemVerilog دفعة واحدة.',
            syntax_example: 'analyze -format sverilog [glob ./rtl/*.sv]\nelaborate top_chip',
            tags: ['tcl', 'synthesis', 'read_verilog', 'design compiler', 'vivado'],
            importance: 'Essential',
            order_index: 100
        },
        {
            id: 'tcl-create-clock',
            category: 'tcl',
            title: 'تعريف نبضة الساعة الرئيسية (Primary Clock Constraint)',
            command: 'create_clock -name sys_clk -period 10.0 [get_ports clk]',
            explanation: 'تعريف التردد المطلوب للدائرة في ملف الـ SDC (هنا دورة 10ns تعادل تردد 100MHz).',
            syntax_example: 'create_clock -name clk_core -period 5.0 -waveform {0 2.5} [get_ports clk_core]',
            tags: ['tcl', 'sdc', 'clock', 'timing', 'constraints', 'sta'],
            importance: 'Essential',
            order_index: 110
        },
        {
            id: 'tcl-io-delays',
            category: 'tcl',
            title: 'تحديد تأخير المداخل والمخارج (Input/Output Delays)',
            command: 'set_input_delay -max 2.0 -clock sys_clk [all_inputs -no_clocks]\nset_output_delay -max 2.0 -clock sys_clk [all_outputs]',
            explanation: 'إخبار برنامج الـ Synthesis بمقدار التأخير الخارجي للأجهزة المتصلة مع الرقاقة لحساب ميزانية التوقيت بدقة.',
            syntax_example: 'set_input_delay 1.5 -clock sys_clk [get_ports data_in*]',
            tags: ['tcl', 'io', 'delay', 'sdc', 'timing'],
            importance: 'Essential',
            order_index: 120
        },
        {
            id: 'tcl-uncertainty',
            category: 'tcl',
            title: 'تحديد هامش الأمان لتردد الساعة (Clock Uncertainty & Jitter)',
            command: 'set_clock_uncertainty 0.25 [all_clocks]',
            explanation: 'إضافة هامش أمان (Clock Uncertainty) يعوض تفاوت نبضات الساعة وتشويش الـ PLL والـ Jitter.',
            syntax_example: 'set_clock_uncertainty -setup 0.3 [get_clocks sys_clk]',
            tags: ['tcl', 'uncertainty', 'jitter', 'clock', 'margin'],
            importance: 'Essential',
            order_index: 125
        },
        {
            id: 'tcl-report-timing',
            category: 'tcl',
            title: 'توليد تقرير أسوأ مسارات التوقيت (Timing Slack Report)',
            command: 'report_timing -delay_type max -max_paths 10 -nworst 1 > timing_setup.rpt',
            explanation: 'توليد تقرير مفصل يوضح Setup Time Slack والتأكد من عدم وجود أي خطأ توقيت (No Violations).',
            syntax_example: 'report_timing -delay_type min -max_paths 5 > timing_hold.rpt',
            tags: ['tcl', 'report', 'slack', 'timing', 'setup', 'hold'],
            importance: 'Essential',
            order_index: 130
        },
        {
            id: 'tcl-report-area',
            category: 'tcl',
            title: 'توليد تقرير مساحة الرقاقة واستهلاك الخلايا (Area Report)',
            command: 'report_area -hierarchy > synthesis_area.rpt',
            explanation: 'حساب عدد البوابات والخلايا المعيارية (Combinational & Sequential Area) في التصميم.',
            syntax_example: 'report_qor',
            tags: ['tcl', 'area', 'gates', 'synthesis', 'cells'],
            importance: 'Recommended',
            order_index: 140
        },

        // ==================== VERILOG & SYSTEMVERILOG ====================
        {
            id: 'v-always-rules',
            category: 'verilog',
            title: 'القاعدة الذهبية للبلوكات (Combinational vs Sequential)',
            command: '// 1. دوائر تتابعية (Sequential): استخدم non-blocking (<=\nalways_ff @(posedge clk or negedge rst_n) begin\n    if (!rst_n) q <= 1\'b0;\n    else        q <= d;\nend\n\n// 2. دوائر تركيبية (Combinational): استخدم blocking (=)\nalways_comb begin\n    out = a & b;\nend',
            explanation: 'من أهم القواعد في صناعة الرقائق لتفادي ظاهرة الـ Race Conditions والـ Simulation Mismatch.',
            syntax_example: 'always @(posedge clk) begin ... end',
            tags: ['verilog', 'systemverilog', 'always_ff', 'always_comb', 'blocking', 'nonblocking'],
            importance: 'Essential',
            order_index: 200
        },
        {
            id: 'v-fsm-3process',
            category: 'verilog',
            title: 'هيكل آلة الحالات المنطقية المعياري (Standard 3-Process FSM)',
            command: 'typedef enum logic [1:0] { IDLE, READ, WRITE } state_t;\nstate_t current_state, next_state;\n\n// Process 1: State Register (Sequential)\nalways_ff @(posedge clk or negedge rst_n) begin\n    if (!rst_n) current_state <= IDLE;\n    else        current_state <= next_state;\nend\n\n// Process 2: Next State Logic (Combinational)\nalways_comb begin\n    next_state = current_state;\n    case (current_state)\n        IDLE:  if (start) next_state = READ;\n        READ:  if (done)  next_state = WRITE;\n        WRITE: next_state = IDLE;\n        default: next_state = IDLE;\n    endcase\nend',
            explanation: 'القالب الاحترافي المعتمد في كبرى الشركات لبناء الـ FSMs الموثوقة والخالية من الـ Glitches.',
            syntax_example: 'case (current_state) ... endcase',
            tags: ['verilog', 'fsm', 'mealy', 'moore', 'state machine'],
            importance: 'Essential',
            order_index: 210
        },
        {
            id: 'v-cdc-sync',
            category: 'verilog',
            title: 'مزامنة الإشارات بين مجالات التردد (2-FF Synchronizer)',
            command: 'module cdc_2ff_sync (\n    input  logic dest_clk,\n    input  logic dest_rst_n,\n    input  logic async_in,\n    output logic sync_out\n);\n    logic meta_reg;\n    always_ff @(posedge dest_clk or negedge dest_rst_n) begin\n        if (!dest_rst_n) begin\n            meta_reg <= 1\'b0;\n            sync_out <= 1\'b0;\n        end else begin\n            meta_reg <= async_in; // First stage absorbs metastability\n            sync_out <= meta_reg; // Second stage outputs stable signal\n        end\n    end\nendmodule',
            explanation: 'حماية التصميم من ظاهرة الاستقرارية غير المستقرة (Metastability) عند انتقال الإشارة بين ساعتين مختلفتين.',
            syntax_example: 'cdc_2ff_sync u_sync (.dest_clk(clk_b), .dest_rst_n(rst_b), .async_in(sig_a), .sync_out(sig_b));',
            tags: ['verilog', 'cdc', 'clock domain crossing', 'metastability', 'synchronizer'],
            importance: 'Essential',
            order_index: 220
        },

        // ==================== STATIC TIMING ANALYSIS (STA) ====================
        {
            id: 'sta-setup-eqn',
            category: 'sta',
            title: 'معادلة التحقق من الـ Setup Time (Max Delay)',
            command: 'T_clk >= T_cq + T_comb_max + T_setup - T_skew + T_jitter\n\nSlack_setup = (T_clk + T_skew - T_jitter) - (T_cq + T_comb_max + T_setup)',
            explanation: 'الشرط الحاسم لعمل الدائرة بأعلى تردد: يجب أن تصل البيانات إلى الـ Flip Flop التالي وتستقر قبل قدوم نبضة الساعة بمقدار زمن الـ Setup.',
            syntax_example: 'Slack >= 0 -> Timing Passed ✓\nSlack < 0  -> Setup Violation ✗ (Reduce logic or increase period)',
            tags: ['sta', 'timing', 'setup', 'slack', 'equations'],
            importance: 'Essential',
            order_index: 300
        },
        {
            id: 'sta-hold-eqn',
            category: 'sta',
            title: 'معادلة التحقق من الـ Hold Time (Min Delay)',
            command: 'T_cq + T_comb_min >= T_hold + T_skew\n\nSlack_hold = (T_cq + T_comb_min) - (T_hold + T_skew)',
            explanation: 'شرط عدم تلف البيانات الجديدة: يجب أن تبقى البيانات ثابتة بعد قدوم نبضة الساعة بمقدار زمن الـ Hold. لا يتأثر بتردد الساعة ولا يمكن حله بإبطاء التردد!',
            syntax_example: 'Fix: Add delay buffers in data path if Hold Slack < 0.',
            tags: ['sta', 'timing', 'hold', 'slack', 'race condition'],
            importance: 'Essential',
            order_index: 310
        },
        {
            id: 'sta-false-path',
            category: 'sta',
            title: 'استثناء المسارات غير التوقيتية (False Path Constraint)',
            command: 'set_false_path -from [get_ports rst_n]\nset_false_path -from [get_clocks clk_a] -to [get_clocks clk_b]',
            explanation: 'يمنع محرك الـ STA من إهدار وقت التحسين ومساحة السيليكون على مسارات لا تتطلب فحص التوقيت (مثل مسارات الريسيت غير المتزامنة ومجالات الساعات المستقلة).',
            syntax_example: 'set_false_path -through [get_pins u_config_reg/Q]',
            tags: ['sta', 'sdc', 'false_path', 'cdc', 'timing'],
            importance: 'Advanced',
            order_index: 320
        },
        {
            id: 'sta-multicycle',
            category: 'sta',
            title: 'تعريف مسار متعدد الدورات (Multicycle Path)',
            command: 'set_multicycle_path 2 -setup -from [get_pins reg_a/CP] -to [get_pins reg_b/D]\nset_multicycle_path 1 -hold -from [get_pins reg_a/CP] -to [get_pins reg_b/D]',
            explanation: 'يُستخدم عندما يكون المسار المنطقي مسموحاً له بالاستغراق لدورتي ساعة أو أكثر بدلاً من دورة واحدة.',
            syntax_example: 'set_multicycle_path 3 -setup ...',
            tags: ['sta', 'multicycle', 'timing', 'sdc', 'slack'],
            importance: 'Advanced',
            order_index: 330
        },

        // ==================== GIT FOR HARDWARE TEAMS ====================
        {
            id: 'git-tapeout-tag',
            category: 'git',
            title: 'توثيق وتثبيت نسخة الـ Tapeout النهائية',
            command: 'git tag -a v1.0-tapeout -m "Final GDSII delivered to fab - Clean DRC/LVS"\ngit push origin v1.0-tapeout',
            explanation: 'إنشاء علامة مميزة (Annotated Tag) دائمة لا تُعدل، لتوثيق النسخة الدقيقة من كود الـ RTL التي أُرسلت للمصنع.',
            syntax_example: 'git checkout v1.0-tapeout',
            tags: ['git', 'tapeout', 'release', 'tag', 'fab'],
            importance: 'Essential',
            order_index: 400
        },
        {
            id: 'git-ip-submodule',
            category: 'git',
            title: 'إدراج كتل الـ IP الخارجية في المشروع',
            command: 'git submodule add https://github.com/team/riscv_core.git src/ip/riscv_core\ngit submodule update --init --recursive',
            explanation: 'إدارة المعالجات ووحدات الـ IP المستقلة داخل مشروع الرقاقة دون نسخ ملفاتها يدوياً.',
            syntax_example: 'git submodule status',
            tags: ['git', 'submodule', 'ip', 'riscv', 'architecture'],
            importance: 'Recommended',
            order_index: 410
        },
        {
            id: 'git-gitignore',
            category: 'git',
            title: 'ملف التجاهل القياسي لمخرجات الـ EDA (.gitignore)',
            command: '*.log\n*.vcd\n*.fsdb\n*.syn\n*.mr\nsimv*\ncsrc/\nwork/\n*.tar.gz',
            explanation: 'تجنب رفع ملفات المحاكاة والمخرجات الضخمة إلى مستودع الكود للحفاظ على سرعة ونظافة المشروع.',
            syntax_example: 'git status -s',
            tags: ['git', 'gitignore', 'eda', 'simulation', 'vcd'],
            importance: 'Essential',
            order_index: 420
        }
    ];

    // 4. IndexedDB Storage Engine
    function openIDB() {
        return new Promise((resolve, reject) => {
            if (dbInstance) return resolve(dbInstance);

            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('category', 'category', { unique: false });
                    store.createIndex('order_index', 'order_index', { unique: false });
                }
                if (!db.objectStoreNames.contains(META_STORE)) {
                    db.createObjectStore(META_STORE, { keyPath: 'key' });
                }
            };

            req.onsuccess = (e) => {
                dbInstance = e.target.result;
                resolve(dbInstance);
            };

            req.onerror = (e) => {
                console.error("IndexedDB Open Error:", e);
                reject(e);
            };
        });
    }

    async function getAllCheatsheetsFromIDB() {
        try {
            const db = await openIDB();
            return new Promise((resolve) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            });
        } catch (e) {
            console.warn("Failed to get from IDB:", e);
            return [];
        }
    }

    async function saveCheatsheetsToIDB(items) {
        try {
            const db = await openIDB();
            const tx = db.transaction([STORE_NAME, META_STORE], 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            
            // Clear and rewrite with fresh items
            store.clear();
            items.forEach(item => store.put(item));

            const metaStore = tx.objectStore(META_STORE);
            metaStore.put({ key: 'last_sync', timestamp: new Date().toISOString() });

            return new Promise(resolve => {
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        } catch (e) {
            console.warn("Failed to save to IDB:", e);
            return false;
        }
    }

    // 5. Supabase Dynamic Resolver
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
            return null;
        }
    }

    // 6. Zero-Stale-Data Synchronization Protocol
    async function syncCheatsheets() {
        let isOnline = navigator.onLine;

        // 1. If Offline -> Read directly from IDB
        if (!isOnline) {
            const localData = await getAllCheatsheetsFromIDB();
            cachedCheatsheets = localData.length > 0 ? localData : SEED_CHEATSHEETS;
            updateSyncBadge(false);
            renderCheatsheets();
            return;
        }

        // 2. If Online -> Fetch fresh from Supabase (Strict Network-First)
        try {
            const supa = await getSupabase();
            if (supa) {
                // Attach Realtime listener once
                if (!window._buslaCheatsheetsRealtimeSubscribed) {
                    window._buslaCheatsheetsRealtimeSubscribed = true;
                    try {
                        supa.channel('busla-cheatsheets-realtime')
                            .on('postgres_changes', { event: '*', schema: 'public', table: 'quick_cheatsheets' }, () => {
                                syncCheatsheets();
                            })
                            .subscribe();
                    } catch (err) {
                        console.warn("Cheatsheets Realtime subscription error:", err);
                    }
                }

                const { data, error } = await supa
                    .from('quick_cheatsheets')
                    .select('*')
                    .order('order_index', { ascending: true });

                if (!error && data && data.length > 0) {
                    // Update cache and IDB with the latest data from server
                    cachedCheatsheets = data;
                    await saveCheatsheetsToIDB(data);
                    updateSyncBadge(true);
                    renderCheatsheets();
                    return;
                }
            }
        } catch (e) {
            console.warn("Cheatsheets: Supabase live fetch failed, using offline seed:", e);
        }

        // 3. Fallback to Local IDB or Seed
        const localData = await getAllCheatsheetsFromIDB();
        if (localData.length > 0) {
            cachedCheatsheets = localData;
        } else {
            cachedCheatsheets = SEED_CHEATSHEETS;
            await saveCheatsheetsToIDB(SEED_CHEATSHEETS);
        }

        updateSyncBadge(navigator.onLine);
        renderCheatsheets();
    }

    function updateSyncBadge(isLive) {
        const badge = document.getElementById('cheatsheets-sync-badge');
        if (!badge) return;

        if (isLive) {
            badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
            badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> متزامن مع السحابة`;
        } else {
            badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20';
            badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> وضع بدون اتصال (أوفلاين)`;
        }
    }

    // 7. Inject Drawer Styles
    function injectStyles() {
        if (document.getElementById('busla-cheatsheets-styles')) return;
        const style = document.createElement('style');
        style.id = 'busla-cheatsheets-styles';
        style.innerHTML = `
            #cheatsheets-drawer-overlay {
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            #cheatsheets-drawer-overlay.active {
                opacity: 1;
                pointer-events: auto;
            }
            #cheatsheets-drawer-panel {
                position: fixed;
                top: 0;
                bottom: 0;
                right: 0;
                width: 100%;
                max-width: 42rem;
                transform: translateX(100%);
                transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            }
            #cheatsheets-drawer-overlay.active #cheatsheets-drawer-panel {
                transform: translateX(0);
            }
            .cs-custom-scroll::-webkit-scrollbar {
                width: 6px;
                height: 6px;
            }
            .cs-custom-scroll::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.02);
                border-radius: 10px;
            }
            .cs-custom-scroll::-webkit-scrollbar-thumb {
                background: rgba(20, 184, 166, 0.25);
                border-radius: 10px;
            }
            .cs-custom-scroll::-webkit-scrollbar-thumb:hover {
                background: rgba(20, 184, 166, 0.5);
            }
            .cheatsheet-card:hover .copy-btn {
                opacity: 1;
            }
        `;
        document.head.appendChild(style);
    }

    // 8. Inject Drawer Template HTML
    function injectDrawer() {
        if (document.getElementById('cheatsheets-drawer-overlay')) return;

        const drawer = document.createElement('div');
        drawer.id = 'cheatsheets-drawer-overlay';
        drawer.className = 'fixed inset-0 z-[99990] bg-black/80 backdrop-blur-md flex justify-end font-cairo';
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-label', 'المراجع السريعة والأوامر');

        drawer.innerHTML = `
            <div id="cheatsheets-drawer-panel" class="w-full max-w-2xl bg-[#0b0e12] border-l border-white/10 h-full flex flex-col shadow-2xl relative">
                
                <!-- Drawer Header -->
                <div class="p-4 sm:p-6 border-b border-white/10 bg-gradient-to-l from-teal-500/10 via-transparent to-transparent flex items-center justify-between gap-4 shrink-0">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 text-lg shadow-lg shrink-0">
                            <i class="fas fa-terminal"></i>
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h3 class="text-base sm:text-lg font-bold text-white leading-tight">المراجع السريعة وأوامر الـ EDA</h3>
                                <span id="cheatsheets-sync-badge"></span>
                            </div>
                            <p class="text-xs text-gray-400 mt-0.5">أوامر وصيغ جاهزة بنقرة نسخ واحدة تعمل في أي وقت أوفلاين</p>
                        </div>
                    </div>
                    <button onclick="window.closeQuickCheatsheets()" class="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center border border-white/10 transition-colors shrink-0" title="إغلاق">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- Search Input Inside Drawer -->
                <div class="p-3 sm:p-4 border-b border-white/5 bg-white/[0.02]">
                    <div class="relative">
                        <i class="fas fa-search absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs"></i>
                        <input 
                            type="text" 
                            id="cheatsheets-search-input" 
                            class="w-full bg-black/50 border border-white/10 focus:border-teal-500/50 rounded-xl pr-9 pl-4 py-2.5 text-xs sm:text-sm text-white placeholder-gray-500 outline-none transition-all"
                            placeholder="ابحث في الأوامر أو المعادلات أو الشرح..."
                        >
                    </div>
                </div>

                <!-- Category Tabs Navigation -->
                <div class="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 border-b border-white/5 bg-black/40 overflow-x-auto no-scrollbar text-xs shrink-0">
                    <button class="cs-tab-btn active px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 bg-teal-500/20 text-teal-300 border border-teal-500/30" data-cat="all">
                        <i class="fas fa-layer-group text-[10px] ml-1"></i> الكل
                    </button>
                    <button class="cs-tab-btn px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 text-gray-400 hover:bg-white/5 hover:text-white" data-cat="linux">
                        <i class="fab fa-linux text-[11px] ml-1"></i> لينكس للـ EDA
                    </button>
                    <button class="cs-tab-btn px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 text-gray-400 hover:bg-white/5 hover:text-white" data-cat="tcl">
                        <i class="fas fa-code text-[10px] ml-1"></i> أوامر TCL & Synthesis
                    </button>
                    <button class="cs-tab-btn px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 text-gray-400 hover:bg-white/5 hover:text-white" data-cat="verilog">
                        <i class="fas fa-microchip text-[10px] ml-1"></i> Verilog & RTL
                    </button>
                    <button class="cs-tab-btn px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 text-gray-400 hover:bg-white/5 hover:text-white" data-cat="sta">
                        <i class="fas fa-stopwatch text-[10px] ml-1"></i> التحليل الزمني (STA)
                    </button>
                    <button class="cs-tab-btn px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 text-gray-400 hover:bg-white/5 hover:text-white" data-cat="git">
                        <i class="fab fa-git-alt text-[11px] ml-1"></i> أوامر Git للفرق
                    </button>
                </div>

                <!-- Cheatsheets List Container -->
                <div id="cheatsheets-items-container" class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scroll cs-custom-scroll">
                    <!-- Rendered dynamically -->
                </div>

                <!-- Footer Summary Bar -->
                <div class="p-3 px-5 bg-black/60 border-t border-white/5 flex items-center justify-between text-xs text-gray-400 shrink-0">
                    <span id="cs-items-count">0 أمر متاح</span>
                    <span class="flex items-center gap-1.5 text-teal-400 text-[11px]">
                        <i class="fas fa-mouse-pointer text-[10px]"></i> انقر على أي كود لنسخه فوراً
                    </span>
                </div>

            </div>
        `;

        document.body.appendChild(drawer);

        // Backdrop click to close
        drawer.addEventListener('click', (e) => {
            if (e.target === drawer) window.closeQuickCheatsheets();
        });

        // Tab switching
        const tabBtns = drawer.querySelectorAll('.cs-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => {
                    b.classList.remove('active', 'bg-teal-500/20', 'text-teal-300', 'border', 'border-teal-500/30');
                    b.classList.add('text-gray-400');
                });
                btn.classList.add('active', 'bg-teal-500/20', 'text-teal-300', 'border', 'border-teal-500/30');
                btn.classList.remove('text-gray-400');

                currentCategory = btn.dataset.cat;
                renderCheatsheets();
            });
        });

        // Search input
        const searchInput = document.getElementById('cheatsheets-search-input');
        searchInput.addEventListener('input', () => {
            renderCheatsheets();
        });
    }

    // 9. Render Cheatsheet Cards
    function renderCheatsheets() {
        const container = document.getElementById('cheatsheets-items-container');
        const countEl = document.getElementById('cs-items-count');
        const searchInput = document.getElementById('cheatsheets-search-input');
        if (!container) return;

        const query = (searchInput?.value || '').toLowerCase().trim();

        let list = cachedCheatsheets;

        // Filter by category
        if (currentCategory !== 'all') {
            list = list.filter(item => item.category === currentCategory);
        }

        // Filter by search query
        if (query) {
            list = list.filter(item => {
                const title = (item.title || '').toLowerCase();
                const cmd = (item.command || '').toLowerCase();
                const exp = (item.explanation || '').toLowerCase();
                const tags = (item.tags || []).join(' ').toLowerCase();
                return title.includes(query) || cmd.includes(query) || exp.includes(query) || tags.includes(query);
            });
        }

        if (countEl) {
            countEl.textContent = `${list.length} مرجع متاح`;
        }

        if (list.length === 0) {
            container.innerHTML = `
                <div class="py-16 text-center text-gray-500">
                    <i class="fas fa-search-minus text-3xl mb-3 text-gray-600"></i>
                    <p class="font-bold text-sm text-gray-300">لم يتم العثور على أوامر مطابقة</p>
                    <p class="text-xs text-gray-500 mt-1">جرّب البحث بكلمة أخرى أو اختر تصنيفاً مختلفاً</p>
                </div>
            `;
            return;
        }

        container.innerHTML = list.map((item, index) => {
            const escapedCmd = item.command.replace(/"/g, '&quot;');
            let catBadge = '';
            if (item.category === 'linux') catBadge = '<span class="text-[9px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-bold">Linux</span>';
            else if (item.category === 'tcl') catBadge = '<span class="text-[9px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold">TCL EDA</span>';
            else if (item.category === 'verilog') catBadge = '<span class="text-[9px] px-2 py-0.5 rounded bg-teal-500/10 text-teal-300 border border-teal-500/20 font-bold">Verilog</span>';
            else if (item.category === 'sta') catBadge = '<span class="text-[9px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-bold">STA</span>';
            else if (item.category === 'git') catBadge = '<span class="text-[9px] px-2 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20 font-bold">Git</span>';

            return `
                <div class="cheatsheet-card bg-black/40 border border-white/10 hover:border-teal-500/40 rounded-2xl p-4 transition-all duration-200 text-right shadow-sm group">
                    <div class="flex items-center justify-between gap-2 mb-2">
                        <div class="flex items-center gap-2">
                            ${catBadge}
                            <h4 class="text-xs sm:text-sm font-bold text-white group-hover:text-teal-300 transition-colors">${item.title}</h4>
                        </div>
                        <button onclick="window._copyCheatsheetCmd(this, \`${escapedCmd}\`)" class="copy-btn opacity-80 group-hover:opacity-100 flex items-center gap-1.5 text-xs bg-white/5 hover:bg-teal-500 hover:text-white text-gray-300 px-2.5 py-1 rounded-lg border border-white/10 hover:border-teal-400 transition-all cursor-pointer">
                            <i class="fas fa-copy text-[10px]"></i>
                            <span>نسخ</span>
                        </button>
                    </div>

                    <!-- Command Snippet Box -->
                    <div class="relative bg-[#06080a] border border-white/5 rounded-xl p-3 my-2 font-mono text-xs text-teal-300 overflow-x-auto text-left" dir="ltr" onclick="window._copyCheatsheetCmd(this, \`${escapedCmd}\`)" title="انقر للنسخ السريع">
                        <pre class="whitespace-pre-wrap select-all cursor-pointer">${item.command}</pre>
                    </div>

                    ${item.explanation ? `<p class="text-xs text-gray-400 leading-relaxed mt-2">${item.explanation}</p>` : ''}
                    ${item.syntax_example ? `
                        <div class="mt-2.5 pt-2 border-t border-white/5 flex items-center gap-2 text-[11px] text-gray-500 font-mono" dir="ltr">
                            <span class="text-gray-600 font-bold"># مثال:</span>
                            <span class="text-gray-400 truncate">${item.syntax_example}</span>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    // 10. Copy Command Helper
    window._copyCheatsheetCmd = function (btn, text) {
        if (!text) return;
        // Clean text decoding
        const parser = new DOMParser();
        const decoded = parser.parseFromString(text, 'text/html').body.textContent;

        navigator.clipboard.writeText(decoded).then(() => {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<i class="fas fa-check text-green-400 text-[10px]"></i> <span class="text-green-300">تم النسخ!</span>`;
            setTimeout(() => {
                btn.innerHTML = originalHTML;
            }, 1800);
        }).catch(() => {
            // Fallback for older browsers
            const textArea = document.createElement("textarea");
            textArea.value = decoded;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alert("تم نسخ الأمر إلى الحافظة!");
        });
    };

    // 11. Public Controls: Open and Close Drawer
    window.openQuickCheatsheets = function (category = 'all') {
        injectStyles();
        injectDrawer();

        const overlay = document.getElementById('cheatsheets-drawer-overlay');
        if (!overlay) return;

        overlay.classList.add('active');
        isModalOpen = true;

        if (category && category !== currentCategory) {
            const targetBtn = overlay.querySelector(`.cs-tab-btn[data-cat="${category}"]`);
            if (targetBtn) targetBtn.click();
        } else {
            syncCheatsheets();
        }

        const input = document.getElementById('cheatsheets-search-input');
        if (input) {
            setTimeout(() => input.focus(), 150);
        }
    };

    window.closeQuickCheatsheets = function () {
        const overlay = document.getElementById('cheatsheets-drawer-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            isModalOpen = false;
        }
    };

    // 12. ESC listener
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isModalOpen) {
            window.closeQuickCheatsheets();
        }
    });

    // 13. Auto-sync on page load and connectivity change
    document.addEventListener('DOMContentLoaded', () => {
        syncCheatsheets();

        // Bind any button with data-cheatsheets
        document.querySelectorAll('[data-cheatsheets]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const cat = el.dataset.cheatsheetsCategory || 'all';
                window.openQuickCheatsheets(cat);
            });
        });

        window.addEventListener('online', () => syncCheatsheets());
        window.addEventListener('offline', () => syncCheatsheets());
    });

})();
