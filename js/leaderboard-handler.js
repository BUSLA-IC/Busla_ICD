import { supabase } from './supabase-config.js';
import { RANKS_DATA } from './badges-data.js';
import { TEAM_RANKS_DATA } from './team-badges-data.js';

// ==========================================
// 1. STATE & CONFIG
// ==========================================
let currentType = 'students'; 
let currentScope = 'global';
let currentUserData = null;
let currentTeamData = null;
let allFetchedItems = []; // لتخزين البيانات محلياً من أجل البحث

// ==========================================
// 2. MAIN INIT
// ==========================================
export async function initLeaderboard() {
    const container = document.getElementById('leaderboard-list');
    if (!container) return;

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && !currentUserData) {
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            currentUserData = profile;
            
            if (currentUserData && currentUserData.team_id) {
                const { data: team } = await supabase.from('teams').select('*').eq('id', currentUserData.team_id).single();
                currentTeamData = team;
            }
        }
    } catch (e) {
        console.error("Context Load Error:", e);
    }

    await loadGlobalHeroStats();
    await window.fetchAndRenderLeaderboard();
}

// ==========================================
// 3. GLOBAL HERO STATS
// ==========================================
async function loadGlobalHeroStats() {
    if (!currentUserData) return;

    try {
        const { data: students } = await supabase.from('profiles').select('id').in('role', ['student', 'leader']).order('total_xp', { ascending: false });
        let sRank = '--';
        if (students) {
            const idx = students.findIndex(s => s.id === currentUserData.id);
            if (idx !== -1) sRank = `#${idx + 1}`;
        }

        let tRank = '--';
        if (currentTeamData) {
            const { data: teams } = await supabase.from('teams').select('id').order('total_score', { ascending: false });
            if (teams) {
                const idx = teams.findIndex(t => t.id === currentTeamData.id);
                if (idx !== -1) tRank = `#${idx + 1}`;
            }
        }

        const sPts = currentUserData.total_xp || 0;
        const tPts = currentTeamData?.total_score || 0;

        const hSRank = document.getElementById('hero-student-rank');
        const hSBadge = document.getElementById('hero-student-badge');
        const hSPts = document.getElementById('hero-student-points');
        
        if (hSRank) hSRank.innerText = sRank;
        if (hSPts) hSPts.innerText = `${sPts} XP`;
        if (hSBadge) {
            const srData = getRankDataForMember(sPts);
            hSBadge.innerText = srData.title;
            hSBadge.className = `text-sm font-bold uppercase ${srData.color}`;
        }

        const hTRank = document.getElementById('hero-team-rank');
        const hTBadge = document.getElementById('hero-team-badge');
        const hTPts = document.getElementById('hero-team-points');

        if (hTRank) hTRank.innerText = tRank;
        if (hTPts) hTPts.innerText = `${tPts} XP`;
        if (hTBadge) {
            const trData = getRankDataForTeam(tPts);
            hTBadge.innerText = trData.title;
            hTBadge.className = `text-sm font-bold uppercase ${trData.color}`;
        }
    } catch (e) {}
}

// ==========================================
// 4. FETCH & FILTER TABLE DATA
// ==========================================
window.fetchAndRenderLeaderboard = async () => {
    const container = document.getElementById('leaderboard-list');
    const podiumContainer = document.getElementById('podium-container');
    const searchInput = document.getElementById('leaderboard-search');
    
    if (searchInput) searchInput.value = ''; // تصفير البحث عند تبديل التاب
    if (container) container.innerHTML = '<div class="text-center py-20"><i class="fas fa-spinner fa-spin text-b-primary text-3xl"></i></div>';
    if (podiumContainer) podiumContainer.innerHTML = '';

    try {
        let items = [];

        if (currentType === 'students') {
            // 🚀 جلب اسم الفريق مباشرة من قاعدة البيانات مع بيانات الطالب
            let query = supabase.from('profiles').select('*, teams!fk_team(name)').in('role', ['student', 'leader']);
            
            if (currentScope === 'university' && currentUserData?.university) {
                query = query.eq('university', currentUserData.university);
            } else if (currentScope === 'governorate' && currentUserData?.governorate) {
                query = query.eq('governorate', currentUserData.governorate);
            }
            
            const { data } = await query.order('total_xp', { ascending: false }).limit(100);
            items = data || [];

        } else {
            // جلب أسماء القادة للفرق
            let query = supabase.from('teams').select('*, profiles!teams_leader_id_fkey(full_name)');
            
            if (currentScope === 'university' && currentTeamData?.university) {
                query = query.eq('university', currentTeamData.university);
            } else if (currentScope === 'governorate' && currentTeamData?.governorate) {
                query = query.eq('governorate', currentTeamData.governorate);
            }

            const { data } = await query.order('total_score', { ascending: false }).limit(100);
            
            // حساب أعداد الأعضاء
            if (data && data.length > 0) {
                const teamIds = data.map(t => t.id);
                const { data: memberCounts } = await supabase.from('profiles').select('team_id').in('team_id', teamIds);
                
                let countsMap = {};
                memberCounts?.forEach(m => {
                    countsMap[m.team_id] = (countsMap[m.team_id] || 0) + 1;
                });
                
                data.forEach(t => t.member_count = countsMap[t.id] || 0);
            }
            items = data || [];
        }

        allFetchedItems = items; // حفظ البيانات للبحث المحلي
        renderLeaderboard(items);

    } catch (error) {
        console.error("Leaderboard fetch error:", error);
        if (container) container.innerHTML = '<div class="text-center text-red-500 py-10">فشل في تحميل البيانات</div>';
    }
}

// ==========================================
// 5. SEARCH LOGIC (NEW)
// ==========================================
window.filterLeaderboardSearch = () => {
    const input = document.getElementById('leaderboard-search');
    if (!input) return;
    
    const query = input.value.trim().toLowerCase();
    
    // إخفاء/إظهار المنصة حسب البحث
    const podiumContainer = document.getElementById('podium-container');
    if (podiumContainer) {
        podiumContainer.style.display = query.length > 0 ? 'none' : 'flex';
    }

    if (query.length === 0) {
        renderLeaderboard(allFetchedItems);
        return;
    }

    const filtered = allFetchedItems.filter(item => {
        const name = currentType === 'students' ? (item.full_name || '') : (item.name || '');
        const univ = item.university || '';
        let subName = '';
        
        if (currentType === 'students') {
            subName = item.teams?.name || '';
        } else {
            subName = item.profiles?.full_name || '';
        }

        return name.toLowerCase().includes(query) || 
               univ.toLowerCase().includes(query) || 
               subName.toLowerCase().includes(query);
    });

    renderLeaderboard(filtered, true); // true = وضع البحث (إخفاء التميز للأوائل)
};

// ==========================================
// 6. RENDER UI
// ==========================================
function renderLeaderboard(items, isSearchMode = false) {
    const container = document.getElementById('leaderboard-list');
    const contextHeader = document.getElementById('col-header-context');
    const podiumContainer = document.getElementById('podium-container');

    if (!container || !contextHeader) return;
    
    contextHeader.innerText = currentType === 'students' ? 'الفريق / الجامعة' : 'القائد / الجامعة';

    if (items.length === 0) {
        container.innerHTML = `<div class="text-center py-20 text-gray-500">لا توجد نتائج مطابقة للبحث.</div>`;
        if(!isSearchMode && podiumContainer) podiumContainer.innerHTML = '';
        return;
    }

    // رسم المنصة فقط إذا لم نكن في وضع البحث
    if (!isSearchMode) {
        const top3 = items.slice(0, 3);
        renderPodium(top3, podiumContainer);
    }

    let html = '';
    let userRankIndex = -1;

    items.forEach((item, index) => {
        // تحديد الترتيب الفعلي في القائمة الأصلية
        const actualRank = isSearchMode ? (allFetchedItems.findIndex(i => i.id === item.id) + 1) : (index + 1);
        
        const isMe = currentType === 'students' ? (item.id === currentUserData?.id) : (item.id === currentTeamData?.id);
        if (isMe && !isSearchMode) userRankIndex = actualRank;

        const points = currentType === 'students' ? (item.total_xp || 0) : (item.total_score || 0);
        const name = currentType === 'students' ? (item.full_name || 'طالب') : (item.name || 'فريق');
        const avatar = currentType === 'students' ? resolveImageUrl(item.avatar_url, 'user') : resolveImageUrl(item.logo_url, 'team');
        const rankData = currentType === 'students' ? getRankDataForMember(points) : getRankDataForTeam(points);
        
        let contextHTML = '';
        let badgeHTML = '';
        let roleBadge = ''; 
        
        if (currentType === 'students') {
            // استخدام البيانات المجلوبة مباشرة من الـ Join
            const teamName = item.teams?.name || 'بدون فريق';
            const univ = item.university || 'جامعة غير محددة';
            
            const isLeader = item.role === 'leader';
            roleBadge = isLeader 
                ? `<span class="bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded text-[9px] font-bold whitespace-nowrap"><i class="fas fa-crown ml-1 text-[8px]"></i>قائد</span>`
                : `<span class="bg-gray-500/20 text-gray-400 border border-gray-500/30 px-2 py-0.5 rounded text-[9px] font-bold whitespace-nowrap"><i class="fas fa-user ml-1 text-[8px]"></i>طالب</span>`;
            
            contextHTML = `
                <div class="flex flex-col">
                    <span class="text-sm font-bold text-gray-200 truncate" title="${teamName}"><i class="fas fa-shield-alt text-gray-500 ml-1"></i> ${teamName}</span>
                    <span class="text-[11px] text-gray-500 truncate" title="${univ}">${univ}</span>
                </div>
            `;

            badgeHTML = `
                <div class="flex items-center bg-black/40 px-4 py-1.5 rounded-xl border border-white/5 w-fit mr-auto">
                    <span class="text-xs font-bold uppercase tracking-wider ${rankData.color}">${rankData.title}</span>
                </div>
            `;
            
        } else {
            const leaderName = item.profiles?.full_name || 'بدون قائد';
            const univ = item.university || 'جامعة غير محددة';
            
            contextHTML = `
                <div class="flex flex-col">
                    <span class="text-sm font-bold text-gray-200 truncate" title="${leaderName}"><i class="fas fa-user-tie text-gray-500 ml-1"></i> ${leaderName}</span>
                    <span class="text-[11px] text-gray-500 truncate" title="${univ}">${univ}</span>
                </div>
            `;

            const mCount = item.member_count || 0;
            
            badgeHTML = `
                <div class="flex flex-col gap-1.5 items-end">
                    <div class="flex items-center bg-black/40 px-4 py-1 rounded-lg border border-white/5 w-fit">
                        <span class="text-[11px] font-bold uppercase tracking-wider ${rankData.color}">${rankData.title}</span>
                    </div>
                    <div class="text-[10px] font-bold text-gray-400 bg-white/5 px-2 py-0.5 rounded w-fit border border-white/5">
                        <i class="fas fa-users ml-1"></i> الأعضاء: <span class="text-white">${mCount}</span> / 5
                    </div>
                </div>
            `;
        }

        let rowStyles = "hover:bg-white/[0.04] transition-all duration-200 border-r-4 border-r-transparent";
        let rankDisplay = `<span class="text-gray-400 font-black text-base sm:text-lg font-mono">#${actualRank}</span>`;

        // لا نميز الأوائل في وضع البحث لكي يبقى التصميم مرتباً
        if (!isSearchMode) {
            if (actualRank === 1) {
                rowStyles = "bg-gradient-to-l from-amber-500/15 via-amber-500/5 to-transparent border-r-4 border-amber-400 shadow-[inset_0_0_25px_rgba(245,158,11,0.08)] hover:bg-amber-500/20";
                rankDisplay = `<div class="flex flex-col items-center justify-center"><i class="fas fa-crown text-amber-400 text-2xl drop-shadow-[0_0_12px_rgba(245,158,11,0.8)] animate-pulse"></i><span class="text-[10px] font-black text-amber-400 mt-0.5 font-mono">#1</span></div>`;
            } else if (actualRank === 2) {
                rowStyles = "bg-gradient-to-l from-slate-400/10 via-slate-400/5 to-transparent border-r-4 border-slate-300 hover:bg-slate-400/15";
                rankDisplay = `<div class="flex flex-col items-center justify-center"><i class="fas fa-medal text-slate-300 text-2xl drop-shadow-[0_0_10px_rgba(203,213,225,0.6)]"></i><span class="text-[10px] font-black text-slate-300 mt-0.5 font-mono">#2</span></div>`;
            } else if (actualRank === 3) {
                rowStyles = "bg-gradient-to-l from-amber-700/15 via-amber-700/5 to-transparent border-r-4 border-amber-600 hover:bg-amber-700/20";
                rankDisplay = `<div class="flex flex-col items-center justify-center"><i class="fas fa-award text-amber-600 text-2xl drop-shadow-[0_0_10px_rgba(217,119,6,0.6)]"></i><span class="text-[10px] font-black text-amber-600 mt-0.5 font-mono">#3</span></div>`;
            } else if (isMe) {
                rowStyles = "bg-gradient-to-l from-teal-500/20 via-teal-500/10 to-transparent border-r-4 border-teal-400 shadow-[0_0_25px_rgba(20,184,166,0.15)] ring-1 ring-teal-500/30 hover:bg-teal-500/25";
            }
        } else if (isMe) {
            rowStyles = "bg-gradient-to-l from-teal-500/20 via-teal-500/10 to-transparent border-r-4 border-teal-400 shadow-[0_0_25px_rgba(20,184,166,0.15)] ring-1 ring-teal-500/30 hover:bg-teal-500/25";
        }

        const youBadge = isMe ? `<span class="bg-teal-500/20 text-teal-300 border border-teal-500/40 text-[10px] font-black px-2 py-0.5 rounded-full mr-1.5 shadow-sm">أنت</span>` : '';

        html += `
        <div class="flex items-center px-4 sm:px-6 py-4 transition-all ${rowStyles}">
            <div class="w-14 sm:w-16 text-center shrink-0">${rankDisplay}</div>
            
            <div class="flex-1 flex items-center gap-3 sm:gap-4 pr-3 sm:pr-4 border-l border-white/5 pl-4 min-w-0">
                <img src="${avatar}" class="w-12 h-12 rounded-2xl object-cover bg-black border border-white/10 shadow-md shrink-0">
                <div class="min-w-0 flex flex-col justify-center">
                    <div class="flex items-center gap-1.5 mb-1 flex-wrap">
                        <h4 class="font-bold text-white text-sm sm:text-base leading-tight truncate max-w-[180px] sm:max-w-none" title="${name}">${name}</h4>
                        ${youBadge}
                        ${roleBadge}
                    </div>
                    <div class="sm:hidden mt-0.5">${contextHTML}</div>
                </div>
            </div>
            
            <div class="hidden sm:block w-48 text-right px-2 border-l border-white/5 pl-4">
                ${contextHTML}
            </div>
            
            <div class="hidden md:flex w-44 flex-col justify-center text-right px-2 border-l border-white/5 pl-4">
                ${badgeHTML}
            </div>
            
            <div class="w-28 text-left pl-2 shrink-0">
                <div class="flex items-center gap-1.5 bg-amber-400/10 border border-amber-400/25 px-3 py-1.5 rounded-xl w-fit mr-auto shadow-sm">
                    <i class="fas fa-bolt text-amber-400 text-xs"></i>
                    <span class="text-amber-400 text-sm sm:text-base font-mono font-black">${points} XP</span>
                </div>
            </div>
        </div>
        `;
    });

    container.innerHTML = html;
    if (!isSearchMode) updateStickyBar(userRankIndex, items);
}

function renderPodium(top3, container) {
    if (!container || top3.length === 0) return;
    
    // Ordered: 2nd place (right in RTL), 1st place (center), 3rd place (left in RTL)
    const orderedTop3 = [top3[1] || null, top3[0] || null, top3[2] || null];
    
    const positions = [
        { 
            rank: 2, 
            title: 'الوصيف',
            placeholder: 'المركز الثاني شاغر',
            height: 'h-36 sm:h-44', 
            ring: 'ring-4 ring-slate-300/80 shadow-[0_0_25px_rgba(203,213,225,0.4)]', 
            border: 'border-slate-300', 
            badgeBg: 'bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 text-slate-900',
            pedestalBg: 'bg-gradient-to-t from-slate-900/80 via-slate-700/30 to-slate-400/40 border-t-2 border-x border-slate-300/50 shadow-[0_0_30px_rgba(203,213,225,0.15)]',
            rim: 'bg-gradient-to-r from-transparent via-slate-200 to-transparent',
            numColor: 'text-slate-300/30',
            labelColor: 'text-slate-300',
            icon: '<i class="fas fa-medal text-slate-300 text-2xl absolute -top-8 drop-shadow-[0_0_12px_rgba(203,213,225,0.7)]"></i>'
        },
        { 
            rank: 1, 
            title: 'البطل الأول',
            placeholder: 'المركز الأول شاغر',
            height: 'h-48 sm:h-56', 
            ring: 'ring-4 ring-amber-400 shadow-[0_0_40px_rgba(245,158,11,0.6)]', 
            border: 'border-amber-400', 
            badgeBg: 'bg-gradient-to-br from-yellow-300 via-amber-400 to-yellow-600 text-black',
            pedestalBg: 'bg-gradient-to-t from-amber-950/80 via-amber-600/30 to-amber-400/50 border-t-2 border-x border-amber-400/70 shadow-[0_0_45px_rgba(245,158,11,0.3)]',
            rim: 'bg-gradient-to-r from-transparent via-amber-300 to-transparent',
            numColor: 'text-amber-400/30',
            labelColor: 'text-amber-300',
            icon: '<i class="fas fa-crown text-amber-400 text-3xl sm:text-4xl absolute -top-11 animate-bounce drop-shadow-[0_0_20px_rgba(245,158,11,0.9)]"></i>'
        },
        { 
            rank: 3, 
            title: 'المركز الثالث',
            placeholder: 'المركز الثالث شاغر',
            height: 'h-28 sm:h-36', 
            ring: 'ring-4 ring-amber-700/80 shadow-[0_0_25px_rgba(217,119,6,0.4)]', 
            border: 'border-amber-600', 
            badgeBg: 'bg-gradient-to-br from-amber-600 via-amber-700 to-amber-900 text-amber-100',
            pedestalBg: 'bg-gradient-to-t from-amber-950/80 via-amber-800/30 to-amber-700/40 border-t-2 border-x border-amber-600/50 shadow-[0_0_30px_rgba(217,119,6,0.15)]',
            rim: 'bg-gradient-to-r from-transparent via-amber-500 to-transparent',
            numColor: 'text-amber-700/30',
            labelColor: 'text-amber-500',
            icon: '<i class="fas fa-award text-amber-600 text-2xl absolute -top-8 drop-shadow-[0_0_12px_rgba(217,119,6,0.7)]"></i>'
        }
    ];

    let html = '';
    orderedTop3.forEach((item, idx) => {
        const pos = positions[idx];
        
        if (!item) {
            html += `
            <div class="w-1/3 flex flex-col items-center justify-end relative px-1 max-w-[220px]">
                <div class="relative mb-3 flex flex-col items-center">
                    <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-dashed border-white/20 bg-white/[0.02] flex flex-col items-center justify-center text-gray-500 backdrop-blur-sm shadow-inner">
                        <i class="fas fa-lock text-gray-600 text-sm mb-1"></i>
                        <span class="text-[9px] text-gray-500 font-bold">شاغر</span>
                    </div>
                    <div class="absolute -bottom-2.5 w-7 h-7 rounded-full bg-black/80 border border-white/20 flex items-center justify-center text-xs font-black text-gray-500 font-mono shadow">
                        ${pos.rank}
                    </div>
                </div>
                
                <span class="text-xs text-gray-500 font-bold mb-1 truncate w-full text-center">${pos.placeholder}</span>
                <span class="text-[10px] text-gray-600 mb-3 bg-white/5 px-2.5 py-0.5 rounded-full border border-white/5 font-semibold">متاح للمنافسة</span>

                <div class="w-full ${pos.height} bg-gradient-to-t from-white/[0.01] to-white/[0.04] rounded-t-3xl relative flex flex-col items-center justify-start pt-4 border-t border-x border-white/10 border-dashed backdrop-blur-sm">
                    <span class="text-3xl sm:text-5xl font-black text-white/5 font-mono select-none">${pos.rank}</span>
                </div>
            </div>
            `;
            return;
        }

        const points = currentType === 'students' ? (item.total_xp || 0) : (item.total_score || 0);
        const name = currentType === 'students' ? (item.full_name || 'طالب') : (item.name || 'فريق');
        const avatar = currentType === 'students' ? resolveImageUrl(item.avatar_url, 'user') : resolveImageUrl(item.logo_url, 'team');

        let roleBadge = '';
        if (currentType === 'students') {
            const isLeader = item.role === 'leader';
            roleBadge = isLeader 
                ? `<div class="bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded-full text-[9px] font-bold mb-2 w-fit shadow-sm flex items-center gap-1"><i class="fas fa-crown text-[8px]"></i><span>قائد</span></div>`
                : `<div class="bg-gray-500/20 text-gray-300 border border-gray-500/30 px-2 py-0.5 rounded-full text-[9px] font-bold mb-2 w-fit shadow-sm flex items-center gap-1"><i class="fas fa-user-graduate text-[8px]"></i><span>طالب</span></div>`;
        }

        const avatarSize = pos.rank === 1 ? 'w-20 h-20 sm:w-28 sm:h-28' : 'w-16 h-16 sm:w-22 sm:h-22';
        const badgeSize = pos.rank === 1 ? 'w-9 h-9 sm:w-11 sm:h-11 text-sm sm:text-base' : 'w-8 h-8 sm:w-9 sm:h-9 text-xs sm:text-sm';

        html += `
        <div class="w-1/3 flex flex-col items-center justify-end relative group px-1 max-w-[240px]">
            <div class="relative mb-3 flex flex-col items-center">
                ${pos.icon}
                <div class="${avatarSize} rounded-full p-1 ${pos.ring} relative z-10 transform group-hover:scale-105 transition-all duration-300 bg-black">
                    <img src="${avatar}" class="w-full h-full rounded-full object-cover border-2 ${pos.border}">
                </div>
                <div class="absolute -bottom-3 ${badgeSize} rounded-full ${pos.badgeBg} border-2 border-black flex items-center justify-center z-20 shadow-xl font-black font-mono">
                    ${pos.rank}
                </div>
            </div>
            
            <h4 class="text-white font-bold text-xs sm:text-base text-center truncate w-full px-2 mb-1 drop-shadow-md group-hover:text-amber-400 transition-colors" title="${name}">${name}</h4>
            ${roleBadge}
            <div class="flex items-center gap-1 bg-black/70 px-3 py-1 rounded-full border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)] mb-3">
                <i class="fas fa-bolt text-amber-400 text-[10px]"></i>
                <span class="text-xs sm:text-sm font-mono font-black text-amber-400">${points} XP</span>
            </div>

            <div class="w-full ${pos.height} ${pos.pedestalBg} rounded-t-3xl relative flex flex-col items-center justify-start pt-4 backdrop-blur-md overflow-hidden">
                <div class="w-full h-1.5 ${pos.rim} absolute top-0"></div>
                <span class="text-4xl sm:text-6xl font-black ${pos.numColor} font-mono select-none drop-shadow">${pos.rank}</span>
                <span class="text-[10px] sm:text-xs font-black tracking-widest ${pos.labelColor} uppercase mt-1 select-none">${pos.title}</span>
            </div>
        </div>
        `;
    });

    container.innerHTML = html;
}

// ==========================================
// 7. STICKY BAR UPDATE
// ==========================================
function updateStickyBar(rankIndex, items) {
    const stickyBar = document.getElementById('sticky-user-rank');
    if (!stickyBar) return;

    if (rankIndex !== -1 && rankIndex > 3) {
        const myItem = items[rankIndex - 1];
        const nextTarget = items[rankIndex - 2];
        const myPoints = currentType === 'students' ? (myItem.total_xp || 0) : (myItem.total_score || 0);
        const targetPoints = currentType === 'students' ? (nextTarget.total_xp || 0) : (nextTarget.total_score || 0);
        const diff = targetPoints - myPoints + 1;

        document.getElementById('sticky-rank-num').innerText = `#${rankIndex}`;
        document.getElementById('sticky-points').innerText = `${myPoints} XP`;
        document.getElementById('sticky-diff-text').innerText = `تحتاج ${diff} نقطة للتقدم مركزاً واحداً!`;
        
        stickyBar.classList.remove('translate-y-[200%]');
    } else {
        stickyBar.classList.add('translate-y-[200%]');
    }
}

// ==========================================
// 8. GLOBAL WINDOW FUNCTIONS (EVENTS)
// ==========================================
window.switchLeaderboardType = (type) => {
    currentType = type;
    const btnS = document.getElementById('tab-students');
    const btnT = document.getElementById('tab-teams');
    const searchInput = document.getElementById('leaderboard-search');
    if(searchInput) searchInput.value = '';
    
    if (type === 'students') {
        btnS.className = "flex-1 sm:flex-none px-7 py-2.5 rounded-lg text-sm font-bold transition-all bg-white text-black shadow-lg flex items-center justify-center gap-2";
        btnT.className = "flex-1 sm:flex-none px-7 py-2.5 rounded-lg text-sm font-bold text-gray-400 hover:text-white transition-all flex items-center justify-center gap-2";
    } else {
        btnT.className = "flex-1 sm:flex-none px-7 py-2.5 rounded-lg text-sm font-bold transition-all bg-white text-black shadow-lg flex items-center justify-center gap-2";
        btnS.className = "flex-1 sm:flex-none px-7 py-2.5 rounded-lg text-sm font-bold text-gray-400 hover:text-white transition-all flex items-center justify-center gap-2";
    }
    window.fetchAndRenderLeaderboard();
};

window.switchLeaderboardScope = (scope) => {
    currentScope = scope;
    const searchInput = document.getElementById('leaderboard-search');
    if(searchInput) searchInput.value = '';

    document.querySelectorAll('.scope-btn').forEach(btn => {
        btn.className = "scope-btn whitespace-nowrap px-4 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 border border-transparent transition-all flex items-center gap-1.5";
    });
    
    const activeBtn = document.getElementById(`scope-${scope}`);
    if (activeBtn) activeBtn.className = "scope-btn whitespace-nowrap px-4 py-2 rounded-lg text-xs font-bold bg-white/15 text-white border border-white/20 shadow-sm transition-all flex items-center gap-1.5";
    
    window.fetchAndRenderLeaderboard();
};

// ==========================================
// 9. UTILS
// ==========================================
function resolveImageUrl(url, type = 'course') {
    try {
        if (!url || url.trim() === "" || url === "null" || url === "undefined") {
            return '../assets/icons/BUSLA-icon.png';
        }
        if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
            const idMatch = url.match(/\/d\/([-\w]{25,})/) || url.match(/id=([-\w]{25,})/);
            if (idMatch && idMatch[1]) {
                // 💡 استخدام السيرفر البديل والرسمي من جوجل المخصص لعرض الصور لتفادي 403
                return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
            }
        }
        if (url.includes('dropbox.com')) {
            return url.replace('?dl=0', '?raw=1');
        }
    } catch(e) {}
    return url;
}

function getRankDataForMember(points) {
    if (!RANKS_DATA || RANKS_DATA.length === 0) {
        return { title: 'Trainee', color: 'text-gray-400 bg-gray-400/10', icon: 'fa-star' };
    }
    
    let rank = RANKS_DATA[0];
    for (let i = 0; i < RANKS_DATA.length; i++) {
        if (points >= RANKS_DATA[i].points_required) rank = RANKS_DATA[i];
        else break;
    }
    return rank;
}

function getRankDataForTeam(points) {
    if (!TEAM_RANKS_DATA || TEAM_RANKS_DATA.length === 0) {
        return { title: 'Squad', color: 'text-blue-400 bg-blue-400/10', icon: 'fa-shield-alt' };
    }

    let rank = TEAM_RANKS_DATA[0];
    for (let i = 0; i < TEAM_RANKS_DATA.length; i++) {
        if (points >= TEAM_RANKS_DATA[i].points_required) rank = TEAM_RANKS_DATA[i];
        else break;
    }
    return rank;
}