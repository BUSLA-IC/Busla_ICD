-- ==============================================================================
-- BUSLA LMS - Quick Cheatsheets Table Schema
-- For Offline & Instant Synchronized Technical References (Linux, TCL, Verilog, STA, Git)
-- Execute this script in the Supabase SQL Editor.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.quick_cheatsheets (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    category text NOT NULL,                    -- 'linux', 'tcl', 'verilog', 'sta', 'git'
    title text NOT NULL,                       -- e.g. 'Setup Time Equation', 'Process Management'
    command text NOT NULL,                     -- Code or Command snippet
    explanation text,                          -- Explanation in Arabic
    syntax_example text,                       -- Practical example
    tags text[],                               -- Search keywords ['timing', 'slack', 'setup']
    importance text DEFAULT 'Essential',      -- 'Essential', 'Advanced', 'Recommended'
    order_index integer DEFAULT 0,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.quick_cheatsheets ENABLE ROW LEVEL SECURITY;

-- Allow Public Read Access for all users (Authenticated & Guests)
CREATE POLICY "Allow public read access on quick_cheatsheets" 
ON public.quick_cheatsheets FOR SELECT 
USING (true);

-- Allow Admins & Authorized Staff to Insert/Update/Delete
CREATE POLICY "Allow admin full access on quick_cheatsheets" 
ON public.quick_cheatsheets FOR ALL 
USING (
    auth.role() = 'authenticated' AND (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND (profiles.role ILIKE '%admin%' OR profiles.role IN ('owner', 'content manager'))
        )
    )
);

-- Realtime Publication for Instant Updates across active clients
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'quick_cheatsheets'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.quick_cheatsheets;
    END IF;
END $$;

-- ==============================================================================
-- Curated Initial Seed Data (Optional - Execute if table is empty)
-- ==============================================================================
INSERT INTO public.quick_cheatsheets (category, title, command, explanation, syntax_example, tags, importance, order_index)
VALUES
-- Linux
('linux', 'البحث عن ملفات الـ RTL في مجلد المشروع', 'find . -type f \( -name "*.v" -o -name "*.sv" \)', 'يبحث في المجلد الحالي وكافة المجلدات الفرعية عن جميع ملفات Verilog و SystemVerilog.', 'find src/ -name "*.v" | xargs wc -l', ARRAY['linux', 'find', 'rtl', 'search', 'verilog'], 'Essential', 10),
('linux', 'البحث عن اسم Module أو إشارة داخل الأكواد', 'grep -rn "module\s\+alu" ./src', 'يبحث بشكل متكرر (-r) مع إظهار أرقام الأسطر (-n) عن أي تعريف لموديول محدد.', 'grep -rn "clk_wiz" . --color=auto', ARRAY['linux', 'grep', 'search', 'module', 'signal'], 'Essential', 20),
('linux', 'تشغيل المحاكاة في الخلفية دون انقطاع', 'nohup make run_sim > sim.log 2>&1 &', 'يشغل عملية المحاكاة الطويلة في الخلفية حتى لو أغلقت جلسة الـ SSH، مع حفظ المخرجات في sim.log.', 'tail -f sim.log', ARRAY['linux', 'simulation', 'background', 'nohup', 'jobs'], 'Essential', 30),
('linux', 'إيقاف عمليات برامج الـ EDA المعلقة', 'ps -ef | grep -E "vcs|vsim|innovus|dc_shell" | awk ''{print $2}'' | xargs kill -9', 'عرض وحذف جميع العمليات المعلقة لبرامج الـ EDA المحتجزة لمساحة الذاكرة أو الرخص (Licenses).', 'kill -9 <PID>', ARRAY['linux', 'kill', 'eda', 'license', 'process'], 'Advanced', 40),
('linux', 'ضغط ملفات الـ Tapeout والمشروع للأرشفة', 'tar -czvf project_tapeout_v1.tar.gz ./gds ./netlist ./reports', 'أرشفة وضغط مجلدات الـ GDSII والـ Netlist والتقارير في ملف مضغوط واحد.', 'tar -xzvf project_tapeout_v1.tar.gz', ARRAY['linux', 'tar', 'tapeout', 'archive', 'compression'], 'Recommended', 50),
('linux', 'فحص الذاكرة ومساحة القرص على سيرفر الـ EDA', 'df -h . && free -h', 'التأكد من توفر مساحة كافية على الخادم قبل تشغيل الـ Place & Route أو توليد ملفات الـ VCD الضخمة.', 'du -sh * | sort -h', ARRAY['linux', 'disk', 'memory', 'server', 'storage'], 'Essential', 60),

-- TCL EDA
('tcl', 'قراءة وتحميل ملفات الـ RTL في برنامج الـ Synthesis', 'read_verilog -sv [glob src/*.sv src/*.v]', 'أمر أساسي في Synopsys Design Compiler و Vivado لقراءة وتحليل ملفات الـ Verilog و SystemVerilog دفعة واحدة.', 'analyze -format sverilog [glob ./rtl/*.sv]\nelaborate top_chip', ARRAY['tcl', 'synthesis', 'read_verilog', 'design compiler', 'vivado'], 'Essential', 100),
('tcl', 'تعريف نبضة الساعة الرئيسية (Primary Clock Constraint)', 'create_clock -name sys_clk -period 10.0 [get_ports clk]', 'تعريف التردد المطلوب للدائرة في ملف الـ SDC (هنا دورة 10ns تعادل تردد 100MHz).', 'create_clock -name clk_core -period 5.0 -waveform {0 2.5} [get_ports clk_core]', ARRAY['tcl', 'sdc', 'clock', 'timing', 'constraints', 'sta'], 'Essential', 110),
('tcl', 'تحديد تأخير المداخل والمخارج (Input/Output Delays)', E'set_input_delay -max 2.0 -clock sys_clk [all_inputs -no_clocks]\nset_output_delay -max 2.0 -clock sys_clk [all_outputs]', 'إخبار برنامج الـ Synthesis بمقدار التأخير الخارجي للأجهزة المتصلة مع الرقاقة لحساب ميزانية التوقيت بدقة.', 'set_input_delay 1.5 -clock sys_clk [get_ports data_in*]', ARRAY['tcl', 'io', 'delay', 'sdc', 'timing'], 'Essential', 120),
('tcl', 'تحديد هامش الأمان لتردد الساعة (Clock Uncertainty & Jitter)', 'set_clock_uncertainty 0.25 [all_clocks]', 'إضافة هامش أمان (Clock Uncertainty) يعوض تفاوت نبضات الساعة وتشويش الـ PLL والـ Jitter.', 'set_clock_uncertainty -setup 0.3 [get_clocks sys_clk]', ARRAY['tcl', 'uncertainty', 'jitter', 'clock', 'margin'], 'Essential', 125),
('tcl', 'توليد تقرير أسوأ مسارات التوقيت (Timing Slack Report)', 'report_timing -delay_type max -max_paths 10 -nworst 1 > timing_setup.rpt', 'توليد تقرير مفصل يوضح Setup Time Slack والتأكد من عدم وجود أي خطأ توقيت (No Violations).', 'report_timing -delay_type min -max_paths 5 > timing_hold.rpt', ARRAY['tcl', 'report', 'slack', 'timing', 'setup', 'hold'], 'Essential', 130),
('tcl', 'توليد تقرير مساحة الرقاقة واستهلاك الخلايا (Area Report)', 'report_area -hierarchy > synthesis_area.rpt', 'حساب عدد البوابات والخلايا المعيارية (Combinational & Sequential Area) في التصميم.', 'report_qor', ARRAY['tcl', 'area', 'gates', 'synthesis', 'cells'], 'Recommended', 140),

-- Verilog
('verilog', 'القاعدة الذهبية للبلوكات (Combinational vs Sequential)', E'// 1. دوائر تتابعية (Sequential): استخدم non-blocking (<=)\nalways_ff @(posedge clk or negedge rst_n) begin\n    if (!rst_n) q <= 1''b0;\n    else        q <= d;\nend\n\n// 2. دوائر تركيبية (Combinational): استخدم blocking (=)\nalways_comb begin\n    out = a & b;\nend', 'من أهم القواعد في صناعة الرقائق لتفادي ظاهرة الـ Race Conditions والـ Simulation Mismatch.', 'always @(posedge clk) begin ... end', ARRAY['verilog', 'systemverilog', 'always_ff', 'always_comb', 'blocking', 'nonblocking'], 'Essential', 200),
('verilog', 'هيكل آلة الحالات المنطقية المعياري (Standard 3-Process FSM)', E'typedef enum logic [1:0] { IDLE, READ, WRITE } state_t;\nstate_t current_state, next_state;\n\n// Process 1: State Register (Sequential)\nalways_ff @(posedge clk or negedge rst_n) begin\n    if (!rst_n) current_state <= IDLE;\n    else        current_state <= next_state;\nend\n\n// Process 2: Next State Logic (Combinational)\nalways_comb begin\n    next_state = current_state;\n    case (current_state)\n        IDLE:  if (start) next_state = READ;\n        READ:  if (done)  next_state = WRITE;\n        WRITE: next_state = IDLE;\n        default: next_state = IDLE;\n    endcase\nend', 'القالب الاحترافي المعتمد في كبرى الشركات لبناء الـ FSMs الموثوقة والخالية من الـ Glitches.', 'case (current_state) ... endcase', ARRAY['verilog', 'fsm', 'mealy', 'moore', 'state machine'], 'Essential', 210),
('verilog', 'مزامنة الإشارات بين مجالات التردد (2-FF Synchronizer)', E'module cdc_2ff_sync (\n    input  logic dest_clk,\n    input  logic dest_rst_n,\n    input  logic async_in,\n    output logic sync_out\n);\n    logic meta_reg;\n    always_ff @(posedge dest_clk or negedge dest_rst_n) begin\n        if (!dest_rst_n) begin\n            meta_reg <= 1''b0;\n            sync_out <= 1''b0;\n        end else begin\n            meta_reg <= async_in; // First stage absorbs metastability\n            sync_out <= meta_reg; // Second stage outputs stable signal\n        end\n    end\nendmodule', 'حماية التصميم من ظاهرة الاستقرارية غير المستقرة (Metastability) عند انتقال الإشارة بين ساعتين مختلفتين.', 'cdc_2ff_sync u_sync (.dest_clk(clk_b), .dest_rst_n(rst_b), .async_in(sig_a), .sync_out(sig_b));', ARRAY['verilog', 'cdc', 'clock domain crossing', 'metastability', 'synchronizer'], 'Essential', 220),

-- STA
('sta', 'معادلة التحقق من الـ Setup Time (Max Delay)', E'T_clk >= T_cq + T_comb_max + T_setup - T_skew + T_jitter\n\nSlack_setup = (T_clk + T_skew - T_jitter) - (T_cq + T_comb_max + T_setup)', 'الشرط الحاسم لعمل الدائرة بأعلى تردد: يجب أن تصل البيانات إلى الـ Flip Flop التالي وتستقر قبل قدوم نبضة الساعة بمقدار زمن الـ Setup.', E'Slack >= 0 -> Timing Passed ✓\nSlack < 0  -> Setup Violation ✗ (Reduce logic or increase period)', ARRAY['sta', 'timing', 'setup', 'slack', 'equations'], 'Essential', 300),
('sta', 'معادلة التحقق من الـ Hold Time (Min Delay)', E'T_cq + T_comb_min >= T_hold + T_skew\n\nSlack_hold = (T_cq + T_comb_min) - (T_hold + T_skew)', 'شرط عدم تلف البيانات الجديدة: يجب أن تبقى البيانات ثابتة بعد قدوم نبضة الساعة بمقدار زمن الـ Hold. لا يتأثر بتردد الساعة ولا يمكن حله بإبطاء التردد!', 'Fix: Add delay buffers in data path if Hold Slack < 0.', ARRAY['sta', 'timing', 'hold', 'slack', 'race condition'], 'Essential', 310),
('sta', 'استثناء المسارات غير التوقيتية (False Path Constraint)', E'set_false_path -from [get_ports rst_n]\nset_false_path -from [get_clocks clk_a] -to [get_clocks clk_b]', 'يمنع محرك الـ STA من إهدار وقت التحسين ومساحة السيليكون على مسارات لا تتطلب فحص التوقيت (مثل مسارات الريسيت غير المتزامنة ومجالات الساعات المستقلة).', 'set_false_path -through [get_pins u_config_reg/Q]', ARRAY['sta', 'sdc', 'false_path', 'cdc', 'timing'], 'Advanced', 320),
('sta', 'تعريف مسار متعدد الدورات (Multicycle Path)', E'set_multicycle_path 2 -setup -from [get_pins reg_a/CP] -to [get_pins reg_b/D]\nset_multicycle_path 1 -hold -from [get_pins reg_a/CP] -to [get_pins reg_b/D]', 'يُستخدم عندما يكون المسار المنطقي مسموحاً له بالاستغراق لدورتي ساعة أو أكثر بدلاً من دورة واحدة.', 'set_multicycle_path 3 -setup ...', ARRAY['sta', 'multicycle', 'timing', 'sdc', 'slack'], 'Advanced', 330),

-- Git
('git', 'توثيق وتثبيت نسخة الـ Tapeout النهائية', E'git tag -a v1.0-tapeout -m "Final GDSII delivered to fab - Clean DRC/LVS"\ngit push origin v1.0-tapeout', 'إنشاء علامة مميزة (Annotated Tag) دائمة لا تُعدل، لتوثيق النسخة الدقيقة من كود الـ RTL التي أُرسلت للمصنع.', 'git checkout v1.0-tapeout', ARRAY['git', 'tapeout', 'release', 'tag', 'fab'], 'Essential', 400),
('git', 'إدراج كتل الـ IP الخارجية في المشروع', E'git submodule add https://github.com/team/riscv_core.git src/ip/riscv_core\ngit submodule update --init --recursive', 'إدارة المعالجات ووحدات الـ IP المستقلة داخل مشروع الرقاقة دون نسخ ملفاتها يدوياً.', 'git submodule status', ARRAY['git', 'submodule', 'ip', 'riscv', 'architecture'], 'Recommended', 410),
('git', 'ملف التجاهل القياسي لمخرجات الـ EDA (.gitignore)', E'*.log\n*.vcd\n*.fsdb\n*.syn\n*.mr\nsimv*\ncsrc/\nwork/\n*.tar.gz', 'تجنب رفع ملفات المحاكاة والمخرجات الضخمة إلى مستودع الكود للحفاظ على سرعة ونظافة المشروع.', 'git status -s', ARRAY['git', 'gitignore', 'eda', 'simulation', 'vcd'], 'Essential', 420)
ON CONFLICT (id) DO NOTHING;
