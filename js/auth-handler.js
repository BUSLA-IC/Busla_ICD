import { AuthService, supabase } from './supabase-config.js'; // ✅ أضفنا supabase هنا
function translateAuthError(error) {
    // استخراج نص الرسالة سواء كان كائناً أو نصاً
    const msg = (error.message || error.error_description || error).toString();
    
    // 1. أخطاء تسجيل الدخول
    if (msg.includes("Invalid login credentials")) return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
    if (msg.includes("Email not confirmed")) return "email_not_confirmed"; // كود خاص
    
    // 2. أخطاء التسجيل
    if (msg.includes("User already registered")) return "هذا البريد الإلكتروني مستخدم بالفعل.";
    if (msg.includes("Password should be at least")) return "كلمة المرور يجب أن تكون 6 أحرف على الأقل.";
    if (msg.includes("invalid email")) return "صيغة البريد الإلكتروني غير صحيحة.";
    if (msg.includes("anonymous_provider_disabled")) return "تسجيل الدخول غير متاح حالياً.";

    // 3. أخطاء التكرار (Rate Limits) - الحل لمشكلتك هنا 🚀
    if (msg.includes("security purposes") || msg.includes("rate limit")) {
        // محاولة استخراج عدد الثواني من الرسالة الإنجليزية
        const secondsMatch = msg.match(/after\s+(\d+)\s+seconds/);
        if (secondsMatch) {
            return `عذراً، يجب الانتظار ${secondsMatch[1]} ثانية قبل المحاولة مجدداً.`;
        }
        return "لقد تجاوزت الحد المسموح من المحاولات، يرجى الانتظار قليلاً.";
    }
    
    // 4. أخطاء أخرى
    return "حدث خطأ: " + msg;
}


export async function registerUser(email, password, personalInfo, academicInfo) {
    try {
        // تجميع كل البيانات في كائن واحد (metaData) ليتوافق مع Supabase
        const metaData = {
            full_name: personalInfo.fullName || '',
            avatar_url: personalInfo.photoURL || '',
            university: academicInfo.university || '',
            faculty: academicInfo.faculty || '',
            department: academicInfo.department || '',
            academic_year: academicInfo.year || '',
            governorate: academicInfo.governorate || '',
            track: academicInfo.track || 'Digital IC Design'
        };

        // إرسال كائن واحد فقط للخدمة
        const result = await AuthService.signUp(email, password, metaData);
        if (!result.success) throw new Error(result.error);
        
        return {
            user: result.data.user,
            verificationRequired: true
        };
    } catch (error) {
        throw new Error(translateAuthError(error));
    }
}

// =========================================================
// 2. تسجيل الدخول
// =========================================================
export async function loginUser(email, password) {
    try {
        // 1. تسجيل الدخول العادي
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;
        const user = data.user;

        // 👑 2. الترقية السحرية وتحديث البيانات الإجباري (Force Update) 👑
        // نبحث أولاً: هل هذا الإيميل موجود في طلبات الإدارة المقبولة؟
        const { data: acceptedApp } = await supabase.from('admin_applications')
            .select('*')
            .eq('email', email)
            .eq('application_status', 'accepted')
            .maybeSingle();

        if (acceptedApp) {
            // ✅ إذا كان أدمن: نقوم بـ "فرمتة" الصف الافتراضي الذي أنشأته الداتابيز ونضع البيانات الكاملة
            await supabase.from('profiles').upsert({
                id: user.id,
                email: acceptedApp.email,
                full_name: acceptedApp.full_name,
                role: 'admin', // 👑 الترقية الإجبارية هنا
                university: acceptedApp.university,
                faculty: acceptedApp.faculty,
                department: acceptedApp.department,
                governorate: acceptedApp.governorate,
                academic_year: acceptedApp.academic_year,
                track: acceptedApp.track
            });
        } else {
            // 🎓 3. إذا كان طالباً عادياً: نسحب بياناته المخفية ونحدثها لكي لا تكون Null
            const meta = user.user_metadata;
            if (meta && meta.full_name) {
                await supabase.from('profiles').upsert({
                    id: user.id,
                    email: user.email,
                    full_name: meta.full_name || '',
                    role: 'student',
                    university: meta.university || '',
                    faculty: meta.faculty || '',
                    department: meta.department || '',
                    governorate: meta.governorate || '',
                    academic_year: meta.academic_year || '',
                    track: meta.track || 'Digital IC Design'
                });
            }
        }

        // إرجاع المستخدم لكي تكمل صفحة الدخول عملها وتقوم بالتوجيه
        return user;
        
    } catch (error) {
        throw new Error(translateAuthError(error));
    }
}
// =========================================================
// 3. إعادة إرسال التفعيل (جديد ✨)
// =========================================================
export async function resendVerification(email) {
    try {
        const result = await AuthService.resendVerificationEmail(email);
        
        if (!result.success) {
            throw new Error(result.error?.message || result.error || "فشل الإرسال");
        }
        return true;
    } catch (error) {
        throw new Error(translateAuthError(error));
    }
}


// =========================================================
// 4. وظائف أخرى (Logout, Reset)
// =========================================================

export async function logoutUser() {
    await AuthService.signOut();
    window.location.href = "auth.html";
}

// 💡 دالة طلب إعادة تعيين كلمة المرور
export async function requestPasswordReset(email) {
    try {
        // ✅ نستخدم supabase مباشرة بدلاً من AuthService.supabase
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: 'https://buslaicd.vercel.app/reset-password.html'
        });
        if (error) throw error;
        return true;
    } catch (error) {
        throw new Error(translateAuthError(error));
    }
}

// =========================================================
// 5. جلب المسارات (Tracks) المتاحة للتسجيل
// =========================================================
export async function getAvailableTracks() {
    try {
        const { data, error } = await supabase
            .from('tracks')
            .select('id, name')
            .eq('is_active', true) // جلب المسارات المفعلة فقط
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error("Error fetching tracks:", error);
        return [];
    }
}