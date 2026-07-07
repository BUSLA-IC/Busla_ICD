/**
 * BUSLA LMS - Supabase Configuration & Service Layer
 * This file handles all interactions with the Supabase backend.
 * It includes Authentication, Database CRUD, Realtime subscriptions, and Error Handling.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { CONFIG } from './config.js';
// ============================================================================
// 1. CONFIGURATION
// ============================================================================

// ⚠️ REPLACE THESE WITH YOUR ACTUAL SUPABASE PROJECT CREDENTIALS
const SUPABASE_URL = CONFIG.SUPABASE.URL;
const SUPABASE_ANON_KEY = CONFIG.SUPABASE.ANON_KEY;

/**
 * Global Supabase Client Instance
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

// ============================================================================
// 2. HELPER UTILITIES
// ============================================================================

/**
 * Standardized response object for all async operations.
 * @typedef {Object} ServiceResponse
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {any} data - The payload returned from Supabase (or null).
 * @property {string|null} error - Error message if failed (or null).
 */

/**
 * Wrapper to handle async requests and standardize errors.
 * @param {Promise} request - The Supabase promise to await.
 * @returns {Promise<ServiceResponse>}
 */
async function handleRequest(request) {
    try {
        const { data, error } = await request;
        if (error) throw error;
        return { success: true, data, error: null };
    } catch (err) {
        console.error("Supabase Error:", err.message || err);
        return { 
            success: false, 
            data: null, 
            error: err.message || "An unexpected error occurred." 
        };
    }
}

// ============================================================================
// 3. AUTHENTICATION SERVICE
// ============================================================================

export const AuthService = {
    async signUp(email, password, metaData = {}) {
        return handleRequest(
            supabase.auth.signUp({
                email,
                password,
                options: {
                    data: metaData
                }
            })
        );
    },

    async signIn(email, password) {
        return handleRequest(
            supabase.auth.signInWithPassword({ email, password })
        );
    },

    async signOut() {
        return handleRequest(supabase.auth.signOut());
    },

    async getCurrentUser() {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    },

    async resendVerificationEmail(email) {
        return handleRequest(
            supabase.auth.resend({
                type: 'signup',
                email: email,
                options: {
                    emailRedirectTo: window.location.origin + '/auth.html'
                }
            })
        );
    },

    async resetPassword(email) {
        return handleRequest(
            supabase.auth.resetPasswordForEmail(email, {
               redirectTo: 'https://buslaicd.vercel.app/reset-password.html'
            })
        );
    },

    onAuthStateChange: (callback) => {
        return supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_OUT') {
                callback(null);
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                const user = session?.user;
                if (user) {
                    // 1. فحص هل له بروفايل أم لا؟
                    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
                    
                    if (!profile) {
                        // 💡 2. الترقية السحرية: قبل أن نجعله طالباً، نبحث في الطلبات المقبولة أولاً
                        const { data: acceptedApp } = await supabase.from('admin_applications')
                            .select('*')
                            .eq('email', user.email)
                            .eq('application_status', 'accepted')
                            .maybeSingle();

                        if (acceptedApp) {
                            // ✅ إدراج كـ Admin بكامل بياناته من طلب التقديم بالدور المحدد
                            await supabase.from('profiles').insert([{
                                id: user.id,
                                email: acceptedApp.email,
                                full_name: acceptedApp.full_name,
                                role: acceptedApp.role || 'admin', // 👑 الترقية
                                university: acceptedApp.university,
                                faculty: acceptedApp.faculty,
                                department: acceptedApp.department,
                                governorate: acceptedApp.governorate,
                                academic_year: acceptedApp.academic_year,
                                track: acceptedApp.track
                            }]);

                            // إدراج الصلاحيات المخصصة إن وجدت لربطها بالحساب الجديد
                            if (acceptedApp.custom_permissions && acceptedApp.custom_permissions.length > 0) {
                                const insertRows = acceptedApp.custom_permissions.map(permId => ({
                                    admin_id: user.id,
                                    permission_id: permId
                                }));
                                await supabase.from('admin_permissions').upsert(insertRows, { onConflict: 'admin_id,permission_id' });
                            }
                        } else {
                            // ❌ إدراج كـ Student عادي (إذا لم يكن في الطلبات المقبولة)
                            await supabase.from('profiles').insert([{
                                id: user.id,
                                email: user.email,
                                role: 'student'
                            }]);
                        }
                    }
                }
                callback(user);
            } else {
                callback(null);
            }
        });
    }
};

// ============================================================================
// 4. USER & PROFILE SERVICE
// ============================================================================

export const UserService = {
    /**
     * Get full profile data for a specific user ID.
     * @param {string} userId 
     */
    async getProfile(userId) {
        return handleRequest(
            supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single()
        );
    },

    /**
     * Update user profile data.
     * @param {string} userId 
     * @param {Object} updates - Fields to update
     */
    async updateProfile(userId, updates) {
        return handleRequest(
            supabase
                .from('profiles')
                .update(updates)
                .eq('id', userId)
        );
    }
};

// ============================================================================
// 5. COURSE & CONTENT SERVICE
// ============================================================================

export const CourseService = {
    /**
     * Fetch all active courses with their phase details.
     */
    async getAllCourses() {
        return handleRequest(
            supabase
                .from('courses')
                .select(`
                    *,
                    phases (title, order_index)
                `)
                .eq('is_active', true)
                .order('id', { ascending: true })
        );
    },

    /**
     * Get single course details including all materials (videos/quizzes).
     * @param {string} courseId 
     */
    async getCourseDetails(courseId) {
        return handleRequest(
            supabase
                .from('courses')
                .select(`
                    *,
                    course_materials (*)
                `)
                .eq('id', courseId)
                .order('order_index', { foreignTable: 'course_materials', ascending: true })
                .single()
        );
    },

    /**
     * Get user enrollment status for a specific course.
     * @param {string} userId 
     * @param {string} courseId 
     */
    async getEnrollment(userId, courseId) {
        return handleRequest(
            supabase
                .from('enrollments')
                .select('*')
                .eq('user_id', userId)
                .eq('course_id', courseId)
                .single() // Returns error if not found (handled in handleRequest)
        );
    },

    /**
     * Enroll a user in a course.
     * @param {string} userId 
     * @param {string} courseId 
     */
    async enroll(userId, courseId) {
        return handleRequest(
            supabase
                .from('enrollments')
                .insert([{ user_id: userId, course_id: courseId }])
                .select()
        );
    },

    /**
     * Fetch list of all completed materials IDs for a user in a course.
     * @param {string} userId 
     * @param {string} courseId 
     */
    async getCompletedMaterials(userId, courseId) {
        const result = await handleRequest(
            supabase
                .from('completed_materials')
                .select('material_id')
                .eq('user_id', userId)
                .eq('course_id', courseId)
        );
        
        if (result.success && result.data) {
            // Transform array of objects [{material_id: "1"}] to array of strings ["1"]
            result.data = result.data.map(item => item.material_id);
        }
        return result;
    }
};

// ============================================================================
// 6. PROGRESS & GAMIFICATION SERVICE
// ============================================================================

export const ProgressService = {
    /**
     * Mark a material (video) as complete, calculate new progress, and award XP.
     * Note: In a production app, this logic is better handled via a Database Trigger or RPC function.
     * @param {string} userId 
     * @param {string} courseId 
     * @param {string} materialId 
     * @param {number} xpAmount 
     */
    async markMaterialComplete(userId, courseId, materialId, xpAmount = 10) {
        try {
            // 1. Check if already completed
            const { data: existing } = await supabase
                .from('completed_materials')
                .select('id')
                .eq('user_id', userId)
                .eq('material_id', materialId)
                .single();

            if (existing) return { success: true, message: "Already completed" };

            // 2. Insert into completed_materials
            const { error: insertError } = await supabase
                .from('completed_materials')
                .insert({ user_id: userId, course_id: courseId, material_id: materialId });
            
            if (insertError) throw insertError;

            // 3. Award XP (Log it)
            await supabase.from('student_xp_logs').insert({
                user_id: userId,
                amount: xpAmount,
                reason: 'watched_video',
                source_id: materialId
            });

            // 4. Update Profile Total XP (Increment)
            // Using rpc is safer for concurrency, but for simplicity here we assume sequential
            const { data: profile } = await supabase.from('profiles').select('xp_points').eq('id', userId).single();
            await supabase.from('profiles').update({ xp_points: (profile?.xp_points || 0) + xpAmount }).eq('id', userId);

            // 5. Update Course Progress %
            await this._recalculateCourseProgress(userId, courseId);

            return { success: true, data: { added_xp: xpAmount } };

        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    /**
     * Internal helper to recalculate progress percentage.
     * @private
     */
    async _recalculateCourseProgress(userId, courseId) {
        // Count total materials
        const { count: total } = await supabase
            .from('course_materials')
            .select('*', { count: 'exact', head: true })
            .eq('course_id', courseId);

        // Count completed materials
        const { count: completed } = await supabase
            .from('completed_materials')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('course_id', courseId);

        if (total > 0) {
            const percent = Math.round((completed / total) * 100);
            await supabase
                .from('enrollments')
                .update({ 
                    progress_percent: percent, 
                    is_completed: percent === 100,
                    last_accessed_at: new Date()
                })
                .eq('user_id', userId)
                .eq('course_id', courseId);
        }
    }
};

// ============================================================================
// 7. TEAM & LEADERBOARD SERVICE
// ============================================================================

export const TeamService = {
    /**
     * Get team details by ID or by Leader ID.
     * @param {string} leaderId 
     */
/**
     * Get team details by Leader ID (for Leader Dashboard).
     */
    async getTeamByLeader(leaderId) {
        return handleRequest(
            supabase
                .from('teams')
                .select(`
                    *,
                    profiles:profiles!team_id (*) 
                `) 
                .eq('leader_id', leaderId)
                .single()
        );
    },
    /**
     * Get global leaderboard (Top students).
     * @param {number} limit 
     */
    async getLeaderboard(limit = 10) {
        return handleRequest(
            supabase
                .from('profiles')
                .select('id, full_name, avatar_url, university, xp_points, team_id')
                .order('xp_points', { ascending: false })
                .limit(limit)
        );
    },

    /**
     * Submit a request to create a new team.
     * @param {Object} requestData 
     */
    async createTeamRequest(requestData) {
        return handleRequest(
            supabase
                .from('team_requests')
                .insert([requestData])
        );
    }
};

// ============================================================================
// 8. STORAGE UTILS (Images)
// ============================================================================

export const StorageService = {
    /**
     * Upload a file to Supabase Storage.
     * @param {string} bucket - 'avatars' or 'team-logos'
     * @param {string} path - File path/name
     * @param {File} file - The file object
     */
    async uploadFile(bucket, path, file) {
        try {
            const { data, error } = await supabase.storage
                .from(bucket)
                .upload(path, file, { upsert: true });

            if (error) throw error;

            // Get public URL
            const { data: urlData } = supabase.storage
                .from(bucket)
                .getPublicUrl(data.path);

            return { success: true, data: urlData.publicUrl, error: null };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
};

// 💡 معالج تلقائي لصور Imgur لتفادي خطأ 403 Forbidden
if (typeof document !== 'undefined') {
    const fixImgurReferrer = (img) => {
        if (img && img.src && img.src.includes('imgur.com') && img.referrerPolicy !== 'no-referrer') {
            img.referrerPolicy = 'no-referrer';
            
            // إعادة ضبط src لإجبار المتصفح على تحميل الصورة بدون Referer
            const currentSrc = img.src;
            img.src = '';
            img.src = currentSrc;
        }
    };

    // مراقبة التغييرات في شجرة الـ DOM لتطبيق ذلك ديناميكياً
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.tagName === 'IMG') {
                        fixImgurReferrer(node);
                    } else if (node.querySelectorAll) {
                        node.querySelectorAll('img').forEach(fixImgurReferrer);
                    }
                });
            } else if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                if (mutation.target.tagName === 'IMG') {
                    fixImgurReferrer(mutation.target);
                }
            }
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src']
    });

    // تشغيل فوري على الصور الموجودة بالصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('img').forEach(fixImgurReferrer);
        });
    } else {
        document.querySelectorAll('img').forEach(fixImgurReferrer);
    }
}