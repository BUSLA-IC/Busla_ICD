import { AuthService } from './supabase-config.js';


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


// =========================================================
// 1. تسجيل حساب جديد
// =========================================================
export async function registerUser(email, password, personalInfo, academicInfo) {
    try {
        const result = await AuthService.signUp(email, password, {
            full_name: personalInfo.fullName,
            avatar_url: personalInfo.photoURL,
            university: academicInfo.university,
            faculty: academicInfo.faculty,
            governorate: academicInfo.governorate,
            department: academicInfo.department,
            academic_year: academicInfo.year
        });

        if (!result.success) throw new Error(result.error);
        return { user: result.data, verificationRequired: true };

    } catch (error) {
        throw new Error(translateAuthError(error));
    }
}

// =========================================================
// 2. تسجيل الدخول
// =========================================================
export async function loginUser(email, password) {
    try {
        const result = await AuthService.signIn(email, password);
        if (!result.success) throw new Error(result.error);
        return result.data.user;
    } catch (error) {
        // نمرر رسالة الخطأ المترجمة للواجهة
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

export async function resetPassword(email) {
    const { error } = await AuthService.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password.html',
    });
    if (error) throw new Error(translateAuthError(error));
}