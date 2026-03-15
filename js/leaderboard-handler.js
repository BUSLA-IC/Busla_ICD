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

        let rowStyles = "hover:bg-white/5 border-r-4 border-r-transparent";
        let rankDisplay = `<span class="text-gray-500 font-black text-xl">#${actualRank}</span>`;

        // لا نميز الأوائل في وضع البحث لكي يبقى التصميم مرتباً
        if (!isSearchMode) {
            if (actualRank === 1) {
                rowStyles = "bg-yellow-500/10 border-r-4 border-r-yellow-500 shadow-[inset_0_0_20px_rgba(234,179,8,0.1)]";
                rankDisplay = `<i class="fas fa-crown text-yellow-500 text-3xl drop-shadow-md"></i>`;
            } else if (actualRank === 2) {
                rowStyles = "bg-gray-400/10 border-r-4 border-r-gray-400";
                rankDisplay = `<i class="fas fa-medal text-gray-300 text-3xl drop-shadow-md"></i>`;
            } else if (actualRank === 3) {
                rowStyles = "bg-orange-500/10 border-r-4 border-r-orange-500";
                rankDisplay = `<i class="fas fa-award text-orange-400 text-3xl drop-shadow-md"></i>`;
            } else if (isMe) {
                rowStyles = "bg-b-primary/10 border-r-4 border-r-b-primary";
            }
        } else if (isMe) {
            rowStyles = "bg-b-primary/10 border-r-4 border-r-b-primary";
        }

        html += `
        <div class="flex items-center px-4 sm:px-6 py-4 transition-all ${rowStyles}">
            <div class="w-12 sm:w-16 text-center">${rankDisplay}</div>
            
            <div class="flex-1 flex items-center gap-4 pr-4 border-l border-white/5 pl-4">
                <img src="${avatar}" class="w-12 h-12 rounded-xl object-cover bg-black border border-white/10 shadow-md shrink-0">
                <div class="min-w-0 flex flex-col justify-center">
                    <div class="flex items-center gap-2 mb-1">
                        <h4 class="font-bold text-white text-base leading-tight truncate">${name}</h4>
                        ${roleBadge}
                    </div>
                    <div class="sm:hidden">${contextHTML}</div>
                </div>
            </div>
            
            <div class="hidden sm:block w-48 text-right px-2 border-l border-white/5 pl-4">
                ${contextHTML}
            </div>
            
            <div class="hidden md:flex w-48 flex-col justify-center text-right px-2 border-l border-white/5 pl-4">
                ${badgeHTML}
            </div>
            
            <div class="w-24 text-left pl-2">
                <span class="text-xl sm:text-2xl font-black text-white font-mono">${points}</span>
                <span class="text-xs text-yellow-500 block font-bold">XP</span>
            </div>
        </div>
        `;
    });

    container.innerHTML = html;
    if (!isSearchMode) updateStickyBar(userRankIndex, items);
}

function renderPodium(top3, container) {
    if (!container || top3.length === 0) return;
    
    const orderedTop3 = [top3[1], top3[0], top3[2]];
    
    const positions = [
        { rank: 2, height: 'h-32 sm:h-40', color: 'from-gray-400/20 to-gray-600/50', border: 'border-gray-400', badge: 'text-gray-300' },
        { rank: 1, height: 'h-40 sm:h-48', color: 'from-yellow-400/20 to-yellow-600/50', border: 'border-yellow-400', badge: 'text-yellow-300' },
        { rank: 3, height: 'h-24 sm:h-32', color: 'from-orange-400/20 to-orange-700/50', border: 'border-orange-500', badge: 'text-orange-400' }
    ];

    let html = '';
    orderedTop3.forEach((item, idx) => {
        const pos = positions[idx];
        
        if (!item) {
            html += `<div class="w-1/3 flex flex-col justify-end items-center"><div class="w-full ${pos.height} bg-white/5 rounded-t-2xl"></div></div>`;
            return;
        }

        const points = currentType === 'students' ? (item.total_xp || 0) : (item.total_score || 0);
        const name = currentType === 'students' ? (item.full_name || 'طالب') : (item.name || 'فريق');
        const avatar = currentType === 'students' ? resolveImageUrl(item.avatar_url, 'user') : resolveImageUrl(item.logo_url, 'team');

        let roleBadge = '';
        if (currentType === 'students') {
            const isLeader = item.role === 'leader';
            roleBadge = isLeader 
                ? `<div class="bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-full text-[9px] font-bold mb-2 w-fit"><i class="fas fa-crown ml-1 text-[8px]"></i>قائد</div>`
                : `<div class="bg-gray-500/20 text-gray-400 border border-gray-500/30 px-2 py-0.5 rounded-full text-[9px] font-bold mb-2 w-fit"><i class="fas fa-user ml-1 text-[8px]"></i>طالب</div>`;
        }

        html += `
        <div class="w-1/3 flex flex-col items-center justify-end relative group px-1">
            <div class="relative mb-4 flex flex-col items-center">
                ${pos.rank === 1 ? '<i class="fas fa-crown text-yellow-400 text-3xl absolute -top-10 animate-bounce"></i>' : ''}
                <div class="w-16 h-16 sm:w-24 sm:h-24 rounded-full p-1 bg-gradient-to-tr ${pos.color} shadow-2xl relative z-10 transform group-hover:scale-110 transition-transform">
                    <img src="${avatar}" class="w-full h-full rounded-full object-cover border-4 ${pos.border}">
                </div>
                <div class="absolute -bottom-4 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black border border-white/20 flex items-center justify-center z-20 shadow-lg text-sm sm:text-lg font-black ${pos.badge}">
                    ${pos.rank}
                </div>
            </div>
            
            <h4 class="text-white font-bold text-xs sm:text-base text-center truncate w-full px-2 mb-1 drop-shadow-md">${name}</h4>
            ${roleBadge}
            <span class="text-[10px] sm:text-sm font-mono font-bold text-yellow-500 mb-5 bg-black/50 px-3 py-0.5 rounded-full border border-white/5">${points} XP</span>

            <div class="w-full ${pos.height} bg-gradient-to-t ${pos.color} rounded-t-3xl relative flex items-start justify-center pt-5 border-x border-t border-white/10 backdrop-blur-sm">
                <div class="absolute inset-0 bg-black/30 rounded-t-3xl"></div>
                <span class="text-4xl sm:text-6xl font-black text-white/20 relative z-10">${pos.rank}</span>
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
        btnS.className = "flex-1 lg:flex-none px-8 py-3 rounded-lg text-sm font-bold transition-all bg-white text-black shadow-lg";
        btnT.className = "flex-1 lg:flex-none px-8 py-3 rounded-lg text-sm font-bold text-gray-500 hover:text-white transition-all";
    } else {
        btnT.className = "flex-1 lg:flex-none px-8 py-3 rounded-lg text-sm font-bold transition-all bg-white text-black shadow-lg";
        btnS.className = "flex-1 lg:flex-none px-8 py-3 rounded-lg text-sm font-bold text-gray-500 hover:text-white transition-all";
    }
    window.fetchAndRenderLeaderboard();
};

window.switchLeaderboardScope = (scope) => {
    currentScope = scope;
    const searchInput = document.getElementById('leaderboard-search');
    if(searchInput) searchInput.value = '';

    document.querySelectorAll('.scope-btn').forEach(btn => {
        btn.className = "scope-btn whitespace-nowrap px-5 py-3 rounded-lg text-xs font-bold text-gray-500 hover:bg-white/5 border border-transparent transition-all";
    });
    
    const activeBtn = document.getElementById(`scope-${scope}`);
    if (activeBtn) activeBtn.className = "scope-btn whitespace-nowrap px-5 py-3 rounded-lg text-xs font-bold bg-white/10 text-white border border-white/20 shadow-md transition-all";
    
    window.fetchAndRenderLeaderboard();
};

// ==========================================
// 9. UTILS
// ==========================================
function resolveImageUrl(url, type = 'course') {
    try {
        if (!url || url.trim() === "" || url === "null" || url === "undefined") {
            return '../assets/icons/icon.jpg';
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