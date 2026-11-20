import { AuthService, supabase } from './supabase-config.js';

function translateAuthError(error) {
    const msg = (error.message || error.error_description || error).toString();

    if (msg.includes("Invalid login credentials")) return "Invalid email address or password.";
    if (msg.includes("Email not confirmed")) return "email_not_confirmed";

    if (msg.includes("User already registered")) return "This email address is already registered.";
    if (msg.includes("Password should be at least")) return "Password must be at least 6 characters long.";
    if (msg.includes("invalid email")) return "Please enter a valid email address.";
    if (msg.includes("anonymous_provider_disabled")) return "Sign-in is currently unavailable.";

    if (msg.includes("security purposes") || msg.includes("rate limit")) {
        const secondsMatch = msg.match(/after\s+(\d+)\s+seconds/);
        if (secondsMatch) {
            return `Please wait ${secondsMatch[1]} seconds before trying again.`;
        }
        return "Too many attempts. Please wait a moment and try again.";
    }

    return "Authentication error: " + msg;
}

export async function registerUser(email, password, personalInfo, academicInfo) {
    try {
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

export async function loginUser(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;
        const user = data.user;

        const { data: acceptedApp } = await supabase.from('admin_applications')
            .select('*')
            .eq('email', email)
            .eq('application_status', 'accepted')
            .maybeSingle();

        if (acceptedApp) {
            await supabase.from('profiles').upsert({
                id: user.id,
                email: acceptedApp.email,
                full_name: acceptedApp.full_name,
                role: acceptedApp.role || 'admin',
                university: acceptedApp.university,
                faculty: acceptedApp.faculty,
                department: acceptedApp.department,
                governorate: acceptedApp.governorate,
                academic_year: acceptedApp.academic_year,
                track: acceptedApp.track
            });

            if (acceptedApp.custom_permissions && acceptedApp.custom_permissions.length > 0) {
                const insertRows = acceptedApp.custom_permissions.map(permId => ({
                    admin_id: user.id,
                    permission_id: permId
                }));
                await supabase.from('admin_permissions').upsert(insertRows, { onConflict: 'admin_id,permission_id' });
            }
        } else {
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

        return user;
    } catch (error) {
        throw new Error(translateAuthError(error));
    }
}

export async function resendVerification(email) {
    try {
        const result = await AuthService.resendVerificationEmail(email);

        if (!result.success) {
            throw new Error(result.error?.message || result.error || "Failed to send verification email.");
        }
        return true;
    } catch (error) {
        throw new Error(translateAuthError(error));
    }
}

export async function logoutUser() {
    await AuthService.signOut();
    window.location.href = "auth.html";
}

export async function requestPasswordReset(email) {
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password.html`
        });
        if (error) throw error;
        return true;
    } catch (error) {
        throw new Error(translateAuthError(error));
    }
}

export async function getAvailableTracks() {
    try {
        const { data, error } = await supabase
            .from('tracks')
            .select('id, name')
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error("Error fetching tracks:", error);
        return [];
    }
}