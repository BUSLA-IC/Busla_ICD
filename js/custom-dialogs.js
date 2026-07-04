/**
 * Busla Platform - Custom Dialogs System (Alert & Confirm Override)
 * 
 * Provides highly polished, dark-theme, glassmorphism dialogs styled with Tailwind CSS
 * that override standard browser popups.
 */

(function () {
    // Inject custom modals into the DOM
    function injectDialogs() {
        if (document.getElementById('custom-dialogs-container')) return;

        const container = document.createElement('div');
        container.id = 'custom-dialogs-container';
        container.innerHTML = `
            <!-- Custom Alert Modal -->
            <div id="custom-alert-modal" class="fixed inset-0 z-[100000] flex items-center justify-center bg-black/75 backdrop-blur-md hidden opacity-0 transition-opacity duration-300" dir="rtl">
                <div id="custom-alert-card" class="bg-[#0b0f17]/95 border border-white/10 rounded-[2rem] p-8 max-w-md w-full mx-4 shadow-2xl transform scale-95 transition-all duration-300 relative overflow-hidden text-right">
                    <!-- Glow effect -->
                    <div class="absolute top-0 right-0 w-full h-32 bg-teal-500/10 blur-[50px] pointer-events-none"></div>
                    
                    <div class="flex items-center gap-5 mb-5 relative z-10">
                        <div class="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-500 flex items-center justify-center text-2xl shrink-0 shadow-[0_0_15px_rgba(20,184,166,0.15)]">
                            <i class="fas fa-info-circle"></i>
                        </div>
                        <h3 id="custom-alert-title" class="text-2xl font-black text-white">تنبيه</h3>
                    </div>
                    
                    <p id="custom-alert-message" class="text-gray-300 text-sm leading-relaxed mb-8 relative z-10"></p>
                    
                    <div class="flex relative z-10">
                        <button id="btn-alert-ok" class="w-full bg-[#006A67] hover:bg-[#005250] text-white font-bold py-3.5 rounded-xl transition-all shadow-lg transform hover:-translate-y-0.5">
                            موافق
                        </button>
                    </div>
                </div>
            </div>

            <!-- Custom Confirm Modal -->
            <div id="custom-confirm-modal" class="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-md hidden opacity-0 transition-opacity duration-300" dir="rtl">
                <div id="custom-confirm-card" class="bg-[#0b0f17]/95 border border-white/10 rounded-[2rem] p-8 max-w-md w-full mx-4 shadow-2xl transform scale-95 transition-all duration-300 relative overflow-hidden text-right">
                    <!-- Dynamic glow effect -->
                    <div id="confirm-glow" class="absolute top-0 right-0 w-full h-32 bg-red-500/10 blur-[50px] pointer-events-none"></div>
                    
                    <div class="flex items-center gap-5 mb-5 relative z-10">
                        <div id="confirm-icon-bg" class="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center text-2xl shrink-0 shadow-[0_0_15px_rgba(239,68,68,0.15)]">
                            <i id="confirm-icon" class="fas fa-exclamation-triangle"></i>
                        </div>
                        <h3 id="confirm-title" class="text-2xl font-black text-white">تأكيد الإجراء</h3>
                    </div>
                    
                    <p id="confirm-message" class="text-gray-300 text-sm leading-relaxed mb-8 relative z-10">هل أنت متأكد؟</p>
                    
                    <div class="flex gap-4 relative z-10">
                        <button id="btn-confirm-yes" class="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg transform hover:-translate-y-0.5">
                            تأكيد
                        </button>
                        <button id="btn-confirm-no" class="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3.5 rounded-xl transition-all border border-white/5 hover:border-white/10">
                            تراجع
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(container);
    }

    // Initialize DOM templates
    if (document.body) {
        injectDialogs();
    } else {
        document.addEventListener('DOMContentLoaded', injectDialogs);
    }

    // Helper to trigger alert modal
    window.showCustomAlert = function (title, message, onCloseCallback) {
        // Ensure dialog is injected (backup)
        injectDialogs();
        
        const modal = document.getElementById('custom-alert-modal');
        const card = document.getElementById('custom-alert-card');
        const titleEl = document.getElementById('custom-alert-title');
        const msgEl = document.getElementById('custom-alert-message');
        const okBtn = document.getElementById('btn-alert-ok');

        if (!modal || !card) return;

        titleEl.textContent = title || "تنبيه";
        msgEl.innerHTML = (message || "").replace(/\n/g, '<br>');

        modal.classList.remove('hidden');
        // Force reflow for transitions
        modal.offsetHeight; 
        
        modal.classList.remove('opacity-0');
        modal.classList.add('opacity-100');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');

        const closeModal = () => {
            modal.classList.remove('opacity-100');
            modal.classList.add('opacity-0');
            card.classList.remove('scale-100');
            card.classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                if (onCloseCallback) onCloseCallback();
            }, 300);
        };

        okBtn.onclick = closeModal;
    };

    // Global override for window.alert
    window.alert = function (message) {
        window.showCustomAlert("تنبيه", message);
    };

    // Helper to trigger confirm modal
    window.showCustomConfirm = function (title, message, onConfirm, onCancel, type = 'danger') {
        // Handle Promise-based calls if callbacks are omitted
        if (typeof onConfirm !== 'function') {
            return new Promise((resolve) => {
                window.showCustomConfirm(title, message, () => resolve(true), () => resolve(false), type);
            });
        }

        injectDialogs();

        const modal = document.getElementById('custom-confirm-modal');
        const card = document.getElementById('custom-confirm-card');
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        const yesBtn = document.getElementById('btn-confirm-yes');
        const noBtn = document.getElementById('btn-confirm-no');
        const glowEl = document.getElementById('confirm-glow');
        const iconBgEl = document.getElementById('confirm-icon-bg');
        const iconEl = document.getElementById('confirm-icon');

        if (!modal || !card) return;

        // Apply styles based on dialog type (danger, warning, info/success)
        if (type === 'info' || type === 'success') {
            glowEl.className = "absolute top-0 right-0 w-full h-32 bg-teal-500/10 blur-[50px] pointer-events-none";
            iconBgEl.className = "w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-500 flex items-center justify-center text-2xl shrink-0 shadow-[0_0_15px_rgba(20,184,166,0.15)]";
            iconEl.className = "fas fa-question-circle";
            yesBtn.className = "flex-1 bg-[#006A67] hover:bg-[#005250] text-white font-bold py-3.5 rounded-xl transition-all shadow-lg transform hover:-translate-y-0.5";
            yesBtn.textContent = "موافق";
        } else if (type === 'warning') {
            glowEl.className = "absolute top-0 right-0 w-full h-32 bg-amber-500/10 blur-[50px] pointer-events-none";
            iconBgEl.className = "w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center text-2xl shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.15)]";
            iconEl.className = "fas fa-exclamation-circle";
            yesBtn.className = "flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg transform hover:-translate-y-0.5";
            yesBtn.textContent = "موافق";
        } else { // default: danger
            glowEl.className = "absolute top-0 right-0 w-full h-32 bg-red-500/10 blur-[50px] pointer-events-none";
            iconBgEl.className = "w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center text-2xl shrink-0 shadow-[0_0_15px_rgba(239,68,68,0.15)]";
            iconEl.className = "fas fa-exclamation-triangle";
            yesBtn.className = "flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg transform hover:-translate-y-0.5";
            yesBtn.textContent = "تأكيد";
        }

        titleEl.textContent = title || "تأكيد الإجراء";
        msgEl.innerHTML = (message || "").replace(/\n/g, '<br>');

        modal.classList.remove('hidden');
        modal.offsetHeight;

        modal.classList.remove('opacity-0');
        modal.classList.add('opacity-100');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');

        const closeModal = () => {
            modal.classList.remove('opacity-100');
            modal.classList.add('opacity-0');
            card.classList.remove('scale-100');
            card.classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 300);
        };

        yesBtn.onclick = () => {
            closeModal();
            if (onConfirm) onConfirm();
        };

        noBtn.onclick = () => {
            closeModal();
            if (onCancel) onCancel();
        };
    };

    // Override openConfirmModal for backward compatibility
    window.openConfirmModal = function (message, callback) {
        window.showCustomConfirm("تأكيد الإجراء", message, callback, null, 'danger');
    };

    // Disable synchronous window.confirm with alert reminder
    window.confirm = function (message) {
        console.warn("Native confirm() is disabled on this platform. Message was: ", message);
        alert("تنبيه أمني: تم حظر عملية التأكيد التلقائية. يرجى استخدام نافذة التأكيد المخصصة.");
        return false;
    };
})();
