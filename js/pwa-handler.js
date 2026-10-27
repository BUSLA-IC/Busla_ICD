/**
 * BUSLA LMS - Progressive Web App (PWA) Client Handler & Auto-Update Engine
 * Architecture: Instant Updates, Install Prompts, and Connectivity Monitoring
 * Pure Vanilla JavaScript (ES6+)
 */

(function () {
    if (window.BUSLA_PWA_HANDLER_INITIALIZED) return;
    window.BUSLA_PWA_HANDLER_INITIALIZED = true;

    // 1. Dynamic Path Resolution
    let pathPrefix = './';
    const loc = window.location.pathname;
    if (loc.includes('/admin/html/')) {
        pathPrefix = '../../';
    } else if (loc.includes('/pages/') || loc.includes('/admin/')) {
        pathPrefix = '../';
    }

    let deferredInstallPrompt = null;
    let swRegistration = null;
    let isRefreshing = false;

    // 2. Inject Dynamic PWA CSS
    function injectPWAStyles() {
        if (document.getElementById('busla-pwa-styles')) return;
        const style = document.createElement('style');
        style.id = 'busla-pwa-styles';
        style.innerHTML = `
            /* PWA Offline / Online Notification Banner */
            #busla-network-banner {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 99999;
                transform: translateY(120%);
                opacity: 0;
                transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
                pointer-events: none;
            }
            #busla-network-banner.active {
                transform: translateY(0);
                opacity: 1;
                pointer-events: auto;
            }

            /* Floating Install Banner for Desktop & Mobile */
            #busla-install-banner {
                position: fixed;
                bottom: 24px;
                left: 24px;
                z-index: 99990;
                transform: translateY(150%);
                opacity: 0;
                transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
            }
            #busla-install-banner.active {
                transform: translateY(0);
                opacity: 1;
            }

            /* iOS Install Modal */
            #busla-ios-modal-backdrop {
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s ease;
            }
            #busla-ios-modal-backdrop.active {
                opacity: 1;
                pointer-events: auto;
            }
        `;
        document.head.appendChild(style);
    }

    // 3. Register Service Worker with Strict Auto-Update Engine
    async function initServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.log('PWA: Service Worker is not supported in this browser.');
            return;
        }

        try {
            const swUrl = `${pathPrefix}sw.js`;
            
            // Register with updateViaCache: 'none' to force browser to check server for changes
            swRegistration = await navigator.serviceWorker.register(swUrl, {
                scope: pathPrefix,
                updateViaCache: 'none'
            });

            console.log('✅ PWA: Service Worker registered successfully with scope:', swRegistration.scope);

            // Check for updates immediately on load
            swRegistration.update();

            // Periodic update check every 15 minutes
            setInterval(() => {
                if (swRegistration) {
                    swRegistration.update();
                }
            }, 15 * 60 * 1000);

            // Check for update whenever user switches back to the tab/app
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && swRegistration) {
                    swRegistration.update();
                }
            });

            // Handle when an update is found
            swRegistration.addEventListener('updatefound', () => {
                const newWorker = swRegistration.installing;
                if (!newWorker) return;

                newWorker.addEventListener('statechange', () => {
                    // New worker installed while old one is active -> Trigger skipWaiting
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('🚀 PWA: New version detected! Activating immediately...');
                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                    }
                });
            });

        } catch (err) {
            console.warn('PWA: Service Worker registration failed:', err);
        }

        // Listen for controllerchange: when new Service Worker takes over
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (isRefreshing) return;
            isRefreshing = true;

            showToastNotification({
                icon: 'fas fa-sync-alt fa-spin text-teal-400',
                title: 'تحديث فوري جديد!',
                desc: 'تم استيراد أحدث نسخة من منصة بوصلة بنجاح، جاري تطبيقها...'
            });

            // Smooth reload to apply fresh updates instantly
            setTimeout(() => {
                window.location.reload();
            }, 1200);
        });

        // Listen for messages from SW
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'BUSLA_SW_ACTIVATED') {
                console.log('🌟 PWA: Latest version is active:', event.data.version);
            }
        });
    }

    // 4. Install Prompt Engine (Desktop & Mobile)
    function setupInstallPrompt() {
        // Detect if already running in standalone PWA mode
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                             window.navigator.standalone === true || 
                             document.referrer.includes('android-app://');

        if (isStandalone) {
            document.documentElement.classList.add('is-pwa-standalone');
            console.log('📱 PWA: Running in standalone installed mode.');
            return; // No need to show install prompts inside the installed app
        }

        // Capture Chrome/Edge native install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredInstallPrompt = e;
            window.deferredPWAInstallPrompt = e;

            // Show floating install banner or enable buttons
            showInstallPromotion();
            enableInstallButtons();
        });

        // Listen for successful installation
        window.addEventListener('appinstalled', () => {
            console.log('🎉 PWA: Platform was installed successfully!');
            deferredInstallPrompt = null;
            window.deferredPWAInstallPrompt = null;
            hideInstallPromotion();

            showToastNotification({
                icon: 'fas fa-check-circle text-green-400',
                title: 'تم التثبيت بنجاح!',
                desc: 'منصة بوصلة مثبتة الآن على جهازك، يمكنك فتحها من التطبيقات في أي وقت.'
            });
        });
    }

    // 5. Global Function to trigger installation
    window.installBuslaApp = async function () {
        // 1. Android / Desktop Chrome / Edge
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            console.log(`PWA: User response to install prompt: ${outcome}`);
            deferredInstallPrompt = null;
            hideInstallPromotion();
            return;
        }

        // 2. iOS Safari Detection
        const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
        const isSafari = /safari/.test(window.navigator.userAgent.toLowerCase()) && !/chrome|crios|fxios/.test(window.navigator.userAgent.toLowerCase());

        if (isIos) {
            showIOSInstallModal();
            return;
        }

        // 3. Fallback: Already installed or browser does not support programmatic install
        showToastNotification({
            icon: 'fas fa-info-circle text-blue-400',
            title: 'تثبيت التطبيق',
            desc: 'يمكنك تثبيت بوصلة من خيارات المتصفح (⋮ أو ⫶) ثم اختيار "تثبيت التطبيق" أو "إضافة للشاشة الرئيسية".'
        });
    };

    // 6. UI: Floating Install Banner
    function showInstallPromotion() {
        // Don't show if user dismissed recently in this session
        if (sessionStorage.getItem('busla_install_banner_dismissed')) return;

        let banner = document.getElementById('busla-install-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'busla-install-banner';
            banner.className = 'bg-[#0f1418]/95 border border-teal-500/30 backdrop-blur-xl rounded-2xl p-3 sm:p-4 shadow-2xl flex items-center gap-3 sm:gap-4 max-w-sm font-cairo';
            banner.innerHTML = `
                <img src="${pathPrefix}assets/icons/BUSLA-icon.png" class="w-10 h-10 sm:w-11 sm:h-11 rounded-xl border border-teal-500/40 object-cover shadow shrink-0">
                <div class="min-w-0 flex-1 text-right">
                    <h4 class="text-xs sm:text-sm font-bold text-white leading-tight">تثبيت تطبيق بوصلة</h4>
                    <p class="text-[10px] sm:text-[11px] text-gray-400 truncate mt-0.5">وصول أسرع وتجربة بكامل الشاشة</p>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <button onclick="window.installBuslaApp()" class="px-3 py-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs rounded-xl shadow transition-all cursor-pointer">
                        تثبيت
                    </button>
                    <button onclick="window.dismissBuslaInstallBanner()" class="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors" title="إغلاق">
                        <i class="fas fa-times text-xs"></i>
                    </button>
                </div>
            `;
            document.body.appendChild(banner);
        }

        setTimeout(() => {
            banner.classList.add('active');
        }, 1500);
    }

    window.dismissBuslaInstallBanner = function () {
        const banner = document.getElementById('busla-install-banner');
        if (banner) {
            banner.classList.remove('active');
            sessionStorage.setItem('busla_install_banner_dismissed', 'true');
        }
    };

    function hideInstallPromotion() {
        const banner = document.getElementById('busla-install-banner');
        if (banner) {
            banner.classList.remove('active');
        }
    }

    function enableInstallButtons() {
        document.querySelectorAll('[data-pwa-install], .btn-pwa-install').forEach(btn => {
            btn.classList.remove('hidden');
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                window.installBuslaApp();
            });
        });
    }

    // 7. UI: iOS Safari Install Modal
    function showIOSInstallModal() {
        let modal = document.getElementById('busla-ios-modal-backdrop');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'busla-ios-modal-backdrop';
            modal.className = 'fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4 font-cairo';
            modal.innerHTML = `
                <div class="bg-[#11161b] border border-white/10 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl text-white space-y-4">
                    <div class="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mx-auto text-teal-400 text-2xl shadow-lg">
                        <i class="fas fa-mobile-screen"></i>
                    </div>
                    <h3 class="text-base font-bold">تثبيت بوصلة على آيفون / آيباد</h3>
                    <div class="space-y-3 text-right text-xs text-gray-300 bg-black/30 p-4 rounded-2xl border border-white/5">
                        <div class="flex items-center gap-3">
                            <span class="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-bold text-teal-400 shrink-0">1</span>
                            <span>اضغط على أيقونة المشاركة <i class="fas fa-arrow-up-from-bracket text-teal-400 mx-1"></i> أسفل شاشة المتصفح.</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-bold text-teal-400 shrink-0">2</span>
                            <span>مرر للأسفل واختر <span class="text-white font-bold">"إضافة إلى الشاشة الرئيسية" (Add to Home Screen)</span>.</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-bold text-teal-400 shrink-0">3</span>
                            <span>اضغط على <span class="text-white font-bold">"إضافة" (Add)</span> في الزاوية العلوية.</span>
                        </div>
                    </div>
                    <button onclick="document.getElementById('busla-ios-modal-backdrop').classList.remove('active')" class="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors">
                        فهمت ذلك
                    </button>
                </div>
            `;
            document.body.appendChild(modal);

            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('active');
            });
        }

        modal.classList.add('active');
    }

    // 8. UI: Network Connectivity Monitoring (Online / Offline)
    function setupConnectivityMonitor() {
        let banner = document.getElementById('busla-network-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'busla-network-banner';
            banner.className = 'font-cairo flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border text-xs font-bold transition-all';
            document.body.appendChild(banner);
        }

        function updateNetworkStatus() {
            if (!navigator.onLine) {
                // Offline
                banner.className = 'font-cairo active flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border text-xs font-bold bg-amber-500/15 border-amber-500/30 text-amber-300';
                banner.innerHTML = `
                    <i class="fas fa-wifi-slash text-amber-400 text-sm"></i>
                    <span>وضع عدم الاتصال: المراجع والمحتوى المحفوظ متاح أوفلاين</span>
                `;
            } else {
                // Back Online
                if (banner.classList.contains('active')) {
                    banner.className = 'font-cairo active flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border text-xs font-bold bg-emerald-500/15 border-emerald-500/30 text-emerald-300';
                    banner.innerHTML = `
                        <i class="fas fa-wifi text-emerald-400 text-sm"></i>
                        <span>تمت استعادة الاتصال: متزامن مع أحدث البيانات</span>
                    `;
                    setTimeout(() => {
                        banner.classList.remove('active');
                    }, 3500);
                }
            }
        }

        window.addEventListener('online', updateNetworkStatus);
        window.addEventListener('offline', updateNetworkStatus);
    }

    // 9. Toast Notification Helper
    function showToastNotification({ icon, title, desc }) {
        const toast = document.createElement('div');
        toast.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-[999999] bg-[#0c1014]/95 border border-teal-500/40 backdrop-blur-2xl px-5 py-3.5 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.8)] flex items-center gap-3.5 font-cairo text-right animate-bounce-once';
        toast.innerHTML = `
            <div class="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center shrink-0">
                <i class="${icon}"></i>
            </div>
            <div>
                <h5 class="text-xs sm:text-sm font-bold text-white leading-tight">${title}</h5>
                <p class="text-[11px] text-gray-400 mt-0.5">${desc}</p>
            </div>
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, -20px)';
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    // 10. Initialize Everything
    injectPWAStyles();
    initServiceWorker();
    setupInstallPrompt();
    setupConnectivityMonitor();

})();
