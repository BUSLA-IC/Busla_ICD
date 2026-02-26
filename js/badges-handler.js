import { supabase } from './supabase-config.js';
import { RANKS_DATA } from './badges-data.js';

// ==========================================
// 1. INJECT CUSTOM STYLES & ANIMATIONS
// ==========================================
const style = document.createElement('style');
style.innerHTML = `
    @keyframes float-slow {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-10px); }
    }
    @keyframes energy-flow {
        0% { background-position: 0% 0%; }
        100% { background-position: 0% 200%; }
    }
    @keyframes reveal-up {
        from { opacity: 0; transform: translateY(30px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .card-spotlight {
        background: radial-gradient(
            600px circle at var(--mouse-x) var(--mouse-y),
            rgba(255, 255, 255, 0.06),
            transparent 40%
        );
    }
    .particle {
        position: absolute;
        background: white;
        border-radius: 50%;
        pointer-events: none;
        opacity: 0;
    }
`;
document.head.appendChild(style);

// ==========================================
// 2. MAIN BADGES UI RENDERER
// ==========================================
export async function initBadgesSystem() {
    const container = document.getElementById('rank-container');
    if (!container) return; 

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-32 space-y-4">
            <div class="relative w-16 h-16">
                <div class="absolute inset-0 border-t-4 border-b-primary rounded-full animate-spin"></div>
                <div class="absolute inset-0 border-b-4 border-b-primary/30 rounded-full animate-pulse"></div>
            </div>
            <p class="text-gray-500 text-sm tracking-[0.2em] animate-pulse">LOADING PROFILE DATA...</p>
        </div>
    `;

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("Auth Failed");

        const { data: userData, error: dbError } = await supabase.from('profiles').select('total_xp, current_rank').eq('id', user.id).single();
        if (dbError) throw dbError;

        const currentPoints = userData?.total_xp || 0;

        let currentRankIndex = 0;
        for (let i = 0; i < RANKS_DATA.length; i++) {
            if (currentPoints >= RANKS_DATA[i].points_required) {
                currentRankIndex = i;
            } else {
                break;
            }
        }

        const currentRank = RANKS_DATA[currentRankIndex];
        const nextRank = RANKS_DATA[currentRankIndex + 1] || null;

        renderCinematicPage(container, currentRank, nextRank, currentPoints, currentRankIndex);
        initVisualEffects();

    } catch (error) {
        console.error("Badges Error:", error);
        container.innerHTML = `<div class="text-red-500 text-center py-20 border border-red-500/20 rounded-xl bg-red-900/10">Failed to load data</div>`;
    }
}

window.loadRankSystem = initBadgesSystem;

// ==========================================
// 3. RENDER THE PAGE (HERO + GRID)
// ==========================================
function renderCinematicPage(container, currentRank, nextRank, points, currentIndex) {
    let progressPercent = 100;
    let pointsNeeded = 0;
    
    if (nextRank) {
        const range = nextRank.points_required - currentRank.points_required;
        const gained = points - currentRank.points_required;
        progressPercent = Math.min(100, Math.max(0, (gained / range) * 100));
        pointsNeeded = nextRank.points_required - points;
    }

    const currentImgUrl = `../assets/user-badge/lv${currentRank.level}.png`;

    // 💡 إنشاء شبكة البادجات (منور ومظلم)
    const badgesGridHtml = RANKS_DATA.map((rank, index) => {
        const isUnlocked = points >= rank.points_required;
        const hexColor = rank.stage_color || '#006A67';
        const badgeUrl = `../assets/user-badge/lv${rank.level}.png`;

        // 💡 التظليم للبادجات التي لم يتم الحصول عليها
        const stateStyle = isUnlocked 
            ? `border-color: ${hexColor}80; box-shadow: 0 0 15px ${hexColor}20; background-color: rgba(0,0,0,0.6);` 
            : `border-color: rgba(255,255,255,0.05); background-color: rgba(0,0,0,0.4); filter: grayscale(100%) opacity(0.4);`;

        const imgStyle = isUnlocked 
            ? `filter: drop-shadow(0 0 15px ${hexColor}80);` 
            : `filter: grayscale(100%) brightness(50%);`;

        return `
            <div onclick="window.openBadgeModal('${rank.key}', ${points})"
                 class="relative p-5 rounded-2xl border cursor-pointer transition-all duration-300 transform hover:-translate-y-2 hover:filter-none hover:opacity-100 group overflow-hidden"
                 style="${stateStyle}">
                 
                ${isUnlocked ? `<div class="absolute inset-0 opacity-10 pointer-events-none" style="background: radial-gradient(circle at center, ${hexColor}, transparent 70%);"></div>` : ''}

                <div class="w-20 h-20 mx-auto mb-4 rounded-[15%] flex items-center justify-center transition-transform duration-500 group-hover:scale-110 relative bg-black"
                     style="border: 2px solid ${isUnlocked ? hexColor : '#333'};">
                    <img src="${badgeUrl}" class="w-full h-full object-cover relative z-10 p-[2px] rounded-2xl" style="${imgStyle}" onerror="this.src='https://placehold.co/200x200/111/FFF?text=Lv${rank.level}'">
                </div>

                <h3 class="text-white font-bold text-center text-sm mb-2 truncate">${rank.title}</h3>
                <div class="text-center">
                    <span class="text-xs font-mono px-3 py-1 rounded-full border" 
                          style="background: ${isUnlocked ? hexColor+'20' : '#222'}; color: ${isUnlocked ? hexColor : '#888'}; border-color: ${isUnlocked ? hexColor+'40' : '#444'}">
                        ${rank.points_required.toLocaleString()} XP
                    </span>
                </div>

                <div class="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-[12px] shadow-lg"
                     style="background: ${isUnlocked ? hexColor+'20' : 'rgba(0,0,0,0.8)'}; border: 1px solid ${isUnlocked ? hexColor+'50' : '#333'}; color: ${isUnlocked ? hexColor : '#666'};">
                    <i class="fas ${isUnlocked ? 'fa-unlock' : 'fa-lock'}"></i>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
<div class="relative w-full mb-16 perspective-1000 group overflow-hidden rounded-[3rem]">
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full blur-[120px] opacity-10 pointer-events-none transition-opacity duration-700 group-hover:opacity-20" style="background-color: ${currentRank.stage_color}"></div>
            <div id="hero-card" class="relative bg-black/40 border border-white/10 backdrop-blur-xl rounded-[3rem] p-10 overflow-hidden shadow-2xl transition-transform duration-100 ease-out">
                <div id="particles-container" class="absolute inset-0 pointer-events-none"></div>
                <div class="card-spotlight absolute inset-0 pointer-events-none z-20"></div>

                <div class="relative z-30 flex flex-col items-center">
                    <div id="hero-badge" class="relative w-56 h-56 md:w-64 md:h-64 mb-8 transition-transform duration-200 ease-out cursor-pointer" onclick="window.openBadgeModal('${currentRank.key}', ${points})" style="animation: float-slow 6s ease-in-out infinite;">
                        <div class="absolute inset-0 rounded-full blur-2xl opacity-40 animate-pulse" style="background-color: ${currentRank.stage_color}"></div>
                        <div class="relative w-full h-full rounded-[12%] overflow-hidden border-4 shadow-2xl bg-black" style="border-color: ${currentRank.stage_color}">
                            <img src="${currentImgUrl}" class="w-full h-full object-cover p-2 rounded-2xl" alt="${currentRank.title}">
                        </div>
                    </div>

                    <div class="text-center space-y-2 mb-8">
                        <div class="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono tracking-widest text-gray-400 backdrop-blur-md">
                            <span class="w-2 h-2 rounded-full animate-pulse" style="background-color: ${currentRank.stage_color}"></span>
                            رتبتك الحالية
                        </div>
                        <h1 class="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-gray-200 to-gray-500 tracking-tight drop-shadow-lg uppercase">
                            ${currentRank.title}
                        </h1>
                        <p class="text-lg text-gray-400 italic max-w-lg mx-auto leading-relaxed border-l-2 pl-4 text-right" style="border-left-color: ${currentRank.stage_color}">
                            "${currentRank.lore}"
                        </p>
                    </div>

                    <div class="w-full max-w-2xl bg-black/50 border border-white/10 rounded-2xl p-6 relative overflow-hidden group/stats hover:border-white/20 transition-all">
                        <div class="absolute top-0 right-0 w-20 h-full" style="background: linear-gradient(to left, ${currentRank.stage_color}1A, transparent)"></div>
                        
                        <div class="flex justify-between items-end mb-3">
                            <div>
                                <span class="block text-xs text-gray-500 uppercase tracking-wider mb-1">نقاط الخبرة (XP)</span>
                                <span class="text-3xl font-black text-white font-mono">${points.toLocaleString()}</span>
                            </div>
                            <div class="text-right">
                                <span class="block text-xs text-gray-500 uppercase tracking-wider mb-1">الهدف القادم</span>
                                <span class="text-base font-bold" style="color: ${currentRank.stage_color}">
                                    ${nextRank ? nextRank.title : 'MAX RANK'}
                                </span>
                            </div>
                        </div>

                        <div class="h-3 bg-white/5 rounded-full overflow-hidden relative">
                            <div class="absolute inset-0 w-full h-full blur-[2px]" style="background-color: ${currentRank.stage_color}33"></div>
                            <div class="h-full transition-all duration-1000 ease-out relative" style="width: ${progressPercent}%; background: linear-gradient(to right, ${currentRank.stage_color}, white)">
                                <div class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-8 bg-white blur-[4px] opacity-70"></div>
                            </div>
                        </div>
                        
                        <p class="text-xs text-gray-400 mt-3 text-right">
                            ${nextRank ? `متبقي <span class="text-white font-bold">${pointsNeeded.toLocaleString()}</span> نقطة للترقية` : 'أنت في القمة!'}
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <div class="mt-10">
            <div class="flex items-center gap-3 mb-8 border-b border-white/10 pb-4">
                <i class="fas fa-medal text-3xl text-b-primary"></i>
                <div>
                    <h2 class="text-2xl font-black text-white">سجل البادجات</h2>
                    <p class="text-sm text-gray-400">جميع الرتب المتاحة. المظلمة لم يتم فتحها بعد!</p>
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                ${badgesGridHtml}
            </div>
        </div>
    `;
}

// ==========================================
// 💡 4. النافذة التفصيلية الذكية (Modal)
// ==========================================
window.openBadgeModal = (badgeKey, userXp) => {
    const badge = RANKS_DATA.find(b => b.key === badgeKey);
    if(!badge) return;

    // توليد الـ Modal برمجياً لكي لا نعدل في الـ HTML الأساسي
    let modal = document.getElementById('cinematic-badge-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cinematic-badge-modal';
        modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-xl hidden transition-opacity duration-300 p-4';
        document.body.appendChild(modal);
    }

    const isUnlocked = userXp >= badge.points_required;
    const pointsLeft = badge.points_required - userXp;
    const progressPercent = isUnlocked ? 100 : Math.min(100, Math.max(0, (userXp / (badge.points_required || 1)) * 100));
    
    const hexColor = badge.stage_color || '#006A67';
    const badgeImgUrl = `../assets/user-badge/lv${badge.level}.png`;
    
    modal.innerHTML = `
        <div class="relative w-full max-w-sm md:max-w-md mx-auto rounded-3xl overflow-hidden shadow-2xl transform transition-all animate-slideUp" 
             style="background: #0a0a0a; border: 1px solid ${hexColor}40; box-shadow: 0 20px 50px -10px ${hexColor}30;">
            
            <div class="absolute top-0 left-0 w-full h-40 opacity-20 pointer-events-none" 
                 style="background: radial-gradient(ellipse at top, ${hexColor}, transparent 70%);"></div>

            <button onclick="document.getElementById('cinematic-badge-modal').classList.add('hidden')" 
                    class="absolute top-4 right-4 text-gray-400 hover:text-white bg-black/50 hover:bg-white/10 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-colors z-10 border border-white/10">
                <i class="fas fa-times text-lg"></i>
            </button>

            <div class="p-8 text-center relative z-0 mt-4">
                
                <div class="w-40 h-40 mx-auto mb-6 rounded-[15%] flex items-center justify-center shadow-2xl transition-all duration-500 relative overflow-hidden bg-black"
                     style="border: 2px solid ${isUnlocked ? hexColor : '#333'}; ${!isUnlocked ? 'filter: grayscale(100%) brightness(50%);' : ''}">
                     
                    ${isUnlocked ? `<div class="absolute inset-0 rounded-[15%] animate-ping opacity-20" style="background: ${hexColor};"></div>` : ''}
                    <img src="${badgeImgUrl}" class="w-full h-full object-cover p-2 rounded-2xl relative z-10" onerror="this.src='https://placehold.co/200x200/111/FFF?text=Lv${badge.level}'">
                </div>

                <h2 class="text-4xl font-black text-white mb-2" style="text-shadow: 0 0 15px ${hexColor}60;">${badge.title}</h2>
                
                <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
                     style="background: ${hexColor}15; color: ${hexColor}; border: 1px solid ${hexColor}30;">
                    <i class="fas fa-layer-group"></i> ${badge.stage_name} | ${badge.rarity}
                </div>

                <div class="bg-black/50 rounded-xl p-5 border border-white/5 mb-6 text-right relative overflow-hidden">
                    <div class="absolute left-0 top-0 w-1 h-full" style="background: ${hexColor};"></div>
                    <p class="text-gray-400 text-xs font-serif italic mb-3 leading-relaxed">"${badge.lore}"</p>
                    <p class="text-gray-200 text-sm leading-relaxed">${badge.description}</p>
                </div>

                <div class="bg-white/5 rounded-2xl p-6 border border-white/10">
                    <div class="flex justify-between text-sm font-bold mb-3">
                        <span class="text-gray-400">نقاطك: <span class="text-white text-base">${userXp.toLocaleString()}</span></span>
                        <span class="text-gray-400">الهدف: <span class="text-white text-base">${badge.points_required.toLocaleString()}</span> XP</span>
                    </div>
                    
                    <div class="w-full h-3 bg-black rounded-full overflow-hidden border border-white/10 mb-4 relative">
                        <div class="absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out" 
                             style="width: ${progressPercent}%; background: ${hexColor}; box-shadow: 0 0 10px ${hexColor};"></div>
                    </div>

                    ${isUnlocked 
                        ? `<div class="text-base font-black animate-pulse mt-2 flex items-center justify-center gap-2" style="color: ${hexColor};"><i class="fas fa-unlock-alt"></i> تم الحصول على البادج بنجاح!</div>`
                        : `<div class="text-yellow-500/90 text-sm font-bold mt-2 flex items-center justify-center gap-2"><i class="fas fa-lock text-xs"></i> متبقي <span class="text-yellow-400 font-mono text-base">${pointsLeft.toLocaleString()}</span> XP للفتح</div>`
                    }
                </div>
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
};

// ==========================================
// 5. VISUAL EFFECTS & INTERACTIONS
// ==========================================
function initVisualEffects() {
    const card = document.getElementById('hero-card');
    const badge = document.getElementById('hero-badge');

    if (card) {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);

            if(badge) {
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = ((y - centerY) / centerY) * -10;
                const rotateY = ((x - centerX) / centerX) * 10;
                badge.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
            }
        });

        card.addEventListener('mouseleave', () => {
            if(badge) badge.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
        });
    }

    const particleContainer = document.getElementById('particles-container');
    if(particleContainer) {
        particleContainer.innerHTML = '';
        for(let i=0; i<25; i++) createParticle(particleContainer);
    }
}

function createParticle(container) {
    const p = document.createElement('div');
    p.classList.add('particle');
    
    const size = Math.random() * 3 + 1;
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const duration = Math.random() * 10 + 5;
    const delay = Math.random() * 5;

    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.left = `${x}%`;
    p.style.top = `${y}%`;
    p.style.opacity = Math.random() * 0.5;
    p.style.animation = `float-slow ${duration}s ease-in-out infinite ${delay}s`;

    container.appendChild(p);
}