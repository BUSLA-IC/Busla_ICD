
        import { supabase } from '../../js/supabase-config.js'; 
import { getAvailableTracks } from '../../js/auth-handler.js';
        window.showToast = (message, type = 'info') => {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            const color = type === 'success' ? 'border-green-500 text-green-400' : type === 'error' ? 'border-red-500 text-red-400' : 'border-blue-500 text-blue-400';
            toast.className = `bg-gray-900 px-6 py-4 rounded-xl border-l-4 ${color} shadow-2xl flex items-center gap-3 transition-all duration-300 transform translate-y-10 opacity-0 mb-2`;
            toast.innerHTML = `<span class="text-white text-sm font-bold">${message}</span>`;
            container.appendChild(toast);
            setTimeout(() => { toast.classList.remove('translate-y-10', 'opacity-0'); }, 10);
            setTimeout(() => { toast.remove(); }, 4000);
        };

        window.startApplication = (trackName) => {
            document.getElementById('f-general-track').value = trackName;
            document.getElementById('tracks-section').classList.add('hidden');
            const appContainer = document.getElementById('application-container');
            appContainer.classList.remove('hidden');
            appContainer.classList.add('animate-fade-in');
            window.scrollTo(0, 0);
            updateStepUI();
        };

        let currentStep = 1;
        const totalSteps = 5;
        const stepTitles = [ "البيانات الأساسية", "البيانات الجغرافية والأكاديمية", "الالتزام الزمني", "الاهتمام التقني", "الأسئلة الشخصية والإقرار" ];

        window.nextStep = () => {
            const currentStepDiv = document.getElementById(`step-${currentStep}`);
            const inputs = currentStepDiv.querySelectorAll('input[required], select[required], textarea[required]');
            
            let isValid = true;
            for (let input of inputs) {
                if (input.classList.contains('searchable-select')) {
                    if (input.value.trim() === "") {
                        window.showToast(`يرجى إكمال الحقل الخاص بـ: ${input.parentElement.querySelector('label').innerText.replace('*', '')}`, "error");
                        isValid = false; break;
                    }
                } else if (!input.checkValidity()) {
                    input.reportValidity(); 
                    isValid = false; break;
                }
            }

            if (currentStep === 3 && isValid) {
                const daysChecked = document.querySelectorAll('.chk-day:checked').length;
                if (daysChecked === 0) { window.showToast("يرجى اختيار يوم واحد على الأقل للعمل.", "error"); isValid = false; }
            }

            if (isValid && currentStep < totalSteps) {
                document.getElementById(`step-${currentStep}`).classList.add('hidden');
                currentStep++;
                updateStepUI();
                window.scrollTo(0, document.getElementById('application-container').offsetTop - 50);
            }
        };

        window.prevStep = () => {
            if (currentStep > 1) {
                document.getElementById(`step-${currentStep}`).classList.add('hidden');
                currentStep--;
                updateStepUI();
            }
        };

        function updateStepUI() {
            document.getElementById(`step-${currentStep}`).classList.remove('hidden');
            const percentage = (currentStep / totalSteps) * 100;
            document.getElementById('step-progress-bar').style.width = `${percentage}%`;
            document.getElementById('step-percentage').innerText = `${Math.round(percentage)}%`;
            document.getElementById('step-indicator-text').innerText = `الخطوة ${currentStep} من ${totalSteps}: ${stepTitles[currentStep - 1]}`;

            document.getElementById('btn-prev').classList.toggle('hidden', currentStep === 1);
            document.getElementById('btn-next').classList.toggle('hidden', currentStep === totalSteps);
            document.getElementById('btn-submit').classList.toggle('hidden', currentStep !== totalSteps);
        }

async function fetchDynamicTracks() {
    try {
        const { data, error } = await supabase.from('tracks').select('id, name');
        if (error) throw error;
        const trackSelect = document.getElementById('f-academic-track');
        if (data && data.length > 0) {
            trackSelect.innerHTML = '<option value="" disabled selected>-- اختر المسار الذي يناسبك --</option>' + 
                data.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
        }
    } catch (err) { console.error(err); }
}

        window.showDynamicSkills = () => {
            const trackName = document.getElementById('f-academic-track').value;
            if (trackName) {
                document.getElementById('dynamic-skills-container').classList.remove('hidden');
                document.getElementById('lbl-custom-skills').innerText = `أخبرنا بمهاراتك التقنية المتعلقة بمسار (${trackName}):`;
            }
        };

        function initSearchableSelects() {
            const selects = document.querySelectorAll('.searchable-select');
            selects.forEach(select => {
                select.style.display = 'none';
                const ui = document.createElement('div'); ui.className = 'relative w-full dir-rtl text-right';
                const trigger = document.createElement('div'); trigger.className = 'w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm cursor-pointer flex justify-between items-center';
                const textSpan = document.createElement('span'); textSpan.className = 'truncate pl-2'; 
                trigger.appendChild(textSpan); trigger.innerHTML += '<i class="fas fa-chevron-down text-gray-500 text-xs"></i>';
                const textSpanRef = trigger.querySelector('span'); 
                const dropdown = document.createElement('div'); dropdown.className = 'absolute z-[999] w-full bg-[#111111] border border-white/10 rounded-xl mt-1 hidden shadow-2xl flex flex-col max-h-60 overflow-hidden';
                const searchInput = document.createElement('input'); searchInput.type = 'text'; searchInput.placeholder = 'ابحث هنا...'; searchInput.className = 'm-2 bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500';
                const optionsContainer = document.createElement('div'); optionsContainer.className = 'overflow-y-auto custom-scroll p-1 flex-1';
                dropdown.appendChild(searchInput); dropdown.appendChild(optionsContainer);
                ui.appendChild(trigger); ui.appendChild(dropdown); select.parentNode.insertBefore(ui, select.nextSibling);

                const createOpt = (opt) => {
                    const div = document.createElement('div'); div.className = 'px-3 py-2 text-sm text-gray-300 hover:bg-teal-500/20 hover:text-white cursor-pointer rounded-lg mb-0.5 opt-item'; div.innerText = opt.text;
                    div.onclick = (e) => { e.stopPropagation(); select.value = opt.value; textSpanRef.innerText = opt.text; textSpanRef.className = 'text-white font-bold truncate pl-2'; dropdown.classList.add('hidden'); select.dispatchEvent(new Event('change')); }; optionsContainer.appendChild(div);
                };

                Array.from(select.children).forEach(child => {
                    if (child.tagName === 'OPTGROUP') {
                        const grp = document.createElement('div'); grp.className = 'px-3 py-1 mt-2 text-[10px] font-bold text-teal-500 uppercase bg-black/40 rounded'; grp.innerText = child.label; optionsContainer.appendChild(grp);
                        Array.from(child.children).forEach(opt => createOpt(opt));
                    } else { if(!child.disabled && child.value !== "") createOpt(child); }
                });

                const sel = select.options[select.selectedIndex];
                textSpanRef.innerText = sel && sel.value !== "" ? sel.text : select.options[0].text;
                textSpanRef.className = sel && sel.value !== "" ? 'text-white font-bold truncate pl-2' : 'text-gray-400 truncate pl-2';

                searchInput.addEventListener('input', (e) => {
                    const term = e.target.value.toLowerCase();
                    Array.from(optionsContainer.querySelectorAll('.opt-item')).forEach(item => { item.style.display = item.innerText.toLowerCase().includes(term) ? 'block' : 'none'; });
                });
                trigger.addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('.absolute.z-\\[999\\]').forEach(d => { if(d !== dropdown) d.classList.add('hidden'); });
                    dropdown.classList.toggle('hidden');
                    if (!dropdown.classList.contains('hidden')) { searchInput.value = ''; searchInput.dispatchEvent(new Event('input')); searchInput.focus(); }
                });
                document.addEventListener('click', (e) => { if (!ui.contains(e.target)) dropdown.classList.add('hidden'); });
            });
        }

        window.handleApplicationSubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-submit');
            
            if(!document.getElementById('f-agree').checked) return;

            const availableDays = [];
            document.querySelectorAll('.chk-day:checked').forEach(cb => availableDays.push(cb.value));

            // 💡 تحديث البيانات لتشمل كل الحقول الدقيقة وتجنب خطأ الـ 400
            const payload = {
                full_name: document.getElementById('f-name').value.trim(),
                email: document.getElementById('f-email').value.trim(),
                phone: document.getElementById('f-phone').value.trim(),
                age: parseInt(document.getElementById('f-age').value) || null,
                gender: document.getElementById('f-gender').value || null,
                
                governorate: document.getElementById('f-gov').value || null, 
                university: document.getElementById('f-uni').value,
                faculty: document.getElementById('f-faculty').value,
                department: document.getElementById('f-dept').value,
                academic_year: document.getElementById('f-year').value,
                status: document.getElementById('f-year').value === 'Graduated' ? 'Graduate' : 'Student',
                
                hours_per_week: document.getElementById('f-hours').value,
                available_days: availableDays,
                preferred_time: document.getElementById('f-pref-time').value || null,
                
                academic_track: document.getElementById('f-academic-track').value || null,
                ic_interest_level: document.getElementById('f-ic-interest').value,
                technical_background: [document.getElementById('f-custom-skills').value.trim()],
                
                motivation_text: document.getElementById('f-motivation').value.trim(),
                contribution_text: document.getElementById('f-contribution').value.trim(),
                experience_text: document.getElementById('f-experience').value.trim() || null,
                
                linkedin: document.getElementById('f-linkedin').value.trim() || null,
                github: document.getElementById('f-github').value.trim() || null,
                portfolio: document.getElementById('f-portfolio').value.trim() || null,
                
                track: document.getElementById('f-general-track').value || 'content',
                application_status: 'pending'
            };

            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin text-xl"></i> جاري الإرسال...';
            btn.disabled = true;

try {
    // 💡 1. التحقق من الإيميل أولاً عبر الدالة الآمنة (RPC)
    const checkEmail = payload.email;
    const { data: emailStatus, error: checkError } = await supabase.rpc('check_email_availability', { email_to_check: checkEmail });

    if (checkError) throw checkError;

    // معالجة إذا كان الإيميل له طلب معلق
    if (emailStatus === 'pending') {
        window.showToast("يوجد طلب انضمام معلق بهذا البريد بالفعل. يرجى انتظار الرد.", "error");
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
        return; // إيقاف الإرسال
    }

    // معالجة إذا كان الإيميل مسجل كحساب في المنصة
    if (emailStatus === 'exists') {
        window.showToast("هذا البريد مسجل كحساب في المنصة مسبقاً (طالب أو مسؤول). لا يمكن التقديم به.", "error");
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
        return; // إيقاف الإرسال
    }

    // 💡 2. حفظ الطلب في قاعدة البيانات
    const { error } = await supabase.from('admin_applications').insert([payload]);
    if (error) throw error;
    
    // 💡 3. إرسال إيميل تأكيد الاستلام للطالب (الجزء الذي كان مفقوداً)
    try {
        emailjs.init("ejz_KrYv1VtCu9DJq"); // ⚠️ انسخه من Account في EmailJS
        await emailjs.send(
            "service_xsjpfql", // ✅ الخدمة الخاصة بك
            "template_7oginph", // ⚠️ انسخه من Templates
            {
                to_name: payload.full_name,
                to_email: payload.email,
                track_name: payload.track === 'content' ? 'Content Contributor' : payload.track
            }
        );
    } catch (emailErr) {
        console.error("EmailJS Error:", emailErr);
    }

    window.showToast("تم إرسال طلبك بنجاح! سيتم مراجعة بياناتك والتواصل معك.", "success");
    
    // إعادة التهيئة وتحديث الواجهة للبداية
    document.getElementById('joinForm').reset();
    document.getElementById('application-container').classList.add('hidden');
    document.getElementById('tracks-section').classList.remove('hidden');
    currentStep = 1;
    window.location.reload();
    
} catch (error) {
    console.error("Submission Error:", error);
    window.showToast("حدث خطأ أثناء إرسال الطلب: " + error.message, "error");
} finally {
    // في حالة النجاح أو خطأ غير متوقع (غير الشيك)
    if (document.getElementById('application-container').classList.contains('hidden') === false) {
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
    }
}
        };



        document.addEventListener('DOMContentLoaded', async () => {
            await fetchDynamicTracks();
            initSearchableSelects();
        });
