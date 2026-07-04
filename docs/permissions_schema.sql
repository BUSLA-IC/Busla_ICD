-- ============================================================================
-- BUSLA LMS - PERMISSION MANAGEMENT SYSTEM DATABASE SCHEMA
-- Execute this script in your Supabase SQL Editor to initialize the tables.
-- ============================================================================

-- 1. Helper Security Functions (to avoid recursion in RLS policies)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN ('owner', 'admin', 'master admin', 'leader supervisor', 'content manager', 'team reviewer', 'project reviewer', 'support')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND LOWER(role) = 'owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Alter Profiles Table to include Admin Metadata Columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login timestamp with time zone;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_activity timestamp with time zone;

-- 3. Create admin_roles Table
CREATE TABLE IF NOT EXISTS public.admin_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text UNIQUE NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

-- 4. Create permissions Table
CREATE TABLE IF NOT EXISTS public.permissions (
    id text PRIMARY KEY,
    name text NOT NULL,
    category text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- 5. Create role_permissions Table
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id uuid REFERENCES public.admin_roles(id) ON DELETE CASCADE,
    permission_id text REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (role_id, permission_id)
);

-- Enable RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- 6. Create admin_permissions Table
CREATE TABLE IF NOT EXISTS public.admin_permissions (
    admin_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    permission_id text REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (admin_id, permission_id)
);

-- Enable RLS
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

-- 7. Create audit_logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    admin_name text,
    action text NOT NULL,
    target text,
    details text,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- policies for admin_roles
CREATE POLICY "Allow authenticated users to read roles" 
    ON public.admin_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admins to manage roles" 
    ON public.admin_roles FOR ALL TO authenticated USING (public.is_admin());

-- policies for permissions
CREATE POLICY "Allow authenticated users to read permissions" 
    ON public.permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admins to manage permissions" 
    ON public.permissions FOR ALL TO authenticated USING (public.is_admin());

-- policies for role_permissions
CREATE POLICY "Allow authenticated users to read role_permissions" 
    ON public.role_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admins to manage role_permissions" 
    ON public.role_permissions FOR ALL TO authenticated USING (public.is_admin());

-- policies for admin_permissions
CREATE POLICY "Allow authenticated users to read admin_permissions" 
    ON public.admin_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admins to manage admin_permissions" 
    ON public.admin_permissions FOR ALL TO authenticated USING (public.is_admin());

-- policies for audit_logs
CREATE POLICY "Allow admins to read audit logs" 
    ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Allow authenticated users to insert audit logs" 
    ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Only owner can clear audit logs" 
    ON public.audit_logs FOR DELETE TO authenticated USING (public.is_owner());


-- ============================================================================
-- INITIAL DATA POPULATION
-- ============================================================================

-- Insert default roles
INSERT INTO public.admin_roles (name, description) VALUES
('Owner', 'مالك المنصة - صلاحيات كاملة ومطلقة'),
('Master Admin', 'مدير النظام الرئيسي'),
('Admin', 'مدير مساعد'),
('Leader Supervisor', 'مشرف الليدرز والفرق'),
('Content Manager', 'مسؤول إدارة المحتوى'),
('Team Reviewer', 'مصحح ومراجع الفرق'),
('Project Reviewer', 'مصحح ومراجع المشاريع'),
('Support', 'الدعم الفني والخدمة')
ON CONFLICT (name) DO NOTHING;

-- Insert standard static permissions
INSERT INTO public.permissions (id, name, category, description) VALUES
-- Dashboard
('dashboard:view', 'مشاهدة Dashboard', 'Dashboard', 'عرض الصفحة الرئيسية للوحة التحكم'),
('dashboard:stats', 'مشاهدة الإحصائيات', 'Dashboard', 'مشاهدة إحصائيات المنصة بالتفصيل'),
('dashboard:export', 'تصدير التقارير', 'Dashboard', 'تصدير بيانات لوحة التحكم'),
-- Users
('users:view', 'مشاهدة الطلاب', 'Users', 'عرض قائمة الطلاب المقيدين'),
('users:edit', 'تعديل الطلاب', 'Users', 'تعديل بيانات الطلاب'),
('users:suspend', 'إيقاف الطلاب', 'Users', 'حظر أو تجميد حسابات الطلاب'),
('users:reset_pwd', 'إعادة تعيين كلمة المرور', 'Users', 'تغيير كلمة مرور الطالب'),
('users:notify', 'إرسال إشعارات للطلاب', 'Users', 'إرسال إشعارات مخصصة للطلاب'),
('users:delete', 'حذف الطلاب', 'Users', 'حذف حساب الطالب نهائياً'),
-- Leaders
('leaders:view', 'مشاهدة الليدرز', 'Leaders', 'عرض قائمة الليدرز'),
('leaders:edit', 'تعديل الليدرز', 'Leaders', 'تعديل بيانات الليدر'),
('leaders:suspend', 'إيقاف الليدر', 'Leaders', 'حظر أو تجميد حساب الليدر'),
('leaders:change_team', 'تغيير الفريق', 'Leaders', 'نقل الليدر إلى فريق آخر'),
('leaders:delete', 'حذف الليدر', 'Leaders', 'حذف حساب الليدر نهائياً'),
-- Teams
('teams:view', 'مشاهدة الفرق', 'Teams', 'عرض قائمة الفرق'),
('teams:create', 'إنشاء فرق', 'Teams', 'إنشاء فريق جديد'),
('teams:edit', 'تعديل الفرق', 'Teams', 'تعديل بيانات الفرق'),
('teams:delete', 'حذف الفرق', 'Teams', 'حذف فريق نهائياً'),
('teams:approve', 'قبول طلبات إنشاء الفرق', 'Teams', 'الموافقة على طلبات الليدرز لإنشاء فرق'),
('teams:reject', 'رفض الطلبات', 'Teams', 'رفض طلبات إنشاء الفرق'),
('teams:freeze', 'تجميد فريق', 'Teams', 'تجميد نشاط فريق بالكامل'),
-- Content Generic Permissions
('content:phase:view', 'مشاهدة المراحل', 'Content', 'عرض المراحل التعليمية (Phases)'),
('content:phase:create', 'إنشاء مراحل', 'Content', 'إضافة مرحلة تعليمية جديدة'),
('content:phase:edit', 'تعديل مراحل', 'Content', 'تعديل بيانات مرحلة تعليمية'),
('content:phase:delete', 'حذف مراحل', 'Content', 'حذف مرحلة تعليمية'),

('content:course:view', 'مشاهدة الكورسات', 'Content', 'عرض الكورسات التعليمية'),
('content:course:create', 'إنشاء كورسات', 'Content', 'إضافة كورس تعليمي جديد'),
('content:course:edit', 'تعديل كورسات', 'Content', 'تعديل بيانات كورس'),
('content:course:delete', 'حذف كورسات', 'Content', 'حذف كورس تعليمي'),

('content:material:view', 'مشاهدة المحتويات', 'Content', 'عرض محتويات الكورس (فيديوهات وغيرها)'),
('content:material:create', 'إضافة فيديوهات ومواد', 'Content', 'إضافة فيديو أو مادة تعليمية لكورس'),
('content:material:edit', 'تعديل فيديوهات ومواد', 'Content', 'تعديل محتوى كورس'),
('content:material:delete', 'حذف فيديوهات ومواد', 'Content', 'حذف محتوى من كورس'),

('content:quiz:view', 'مشاهدة الكويزات', 'Content', 'عرض الكويزات'),
('content:quiz:create', 'إنشاء كويزات', 'Content', 'إنشاء كويز جديد'),
('content:quiz:edit', 'تعديل كويزات', 'Content', 'تعديل كويز موجود'),
('content:quiz:delete', 'حذف كويزات', 'Content', 'حذف كويز'),

('content:question:view', 'مشاهدة أسئلة الكويز', 'Content', 'عرض أسئلة الكويزات'),
('content:question:create', 'إضافة أسئلة كويز', 'Content', 'إضافة أسئلة جديدة لكويز'),
('content:question:edit', 'تعديل أسئلة كويز', 'Content', 'تعديل أسئلة كويز'),
('content:question:delete', 'حذف أسئلة كويز', 'Content', 'حذف أسئلة من كويز'),

('content:project:view', 'مشاهدة المشاريع', 'Content', 'عرض المشاريع المطلوبة'),
('content:project:create', 'إنشاء مشاريع', 'Content', 'إضافة مشروع جديد'),
('content:project:edit', 'تعديل مشاريع', 'Content', 'تعديل متطلبات وتقييم مشروع'),
('content:project:delete', 'حذف مشاريع', 'Content', 'حذف مشروع'),
-- Reviews
('reviews:submissions', 'مراجعة المشاريع', 'Reviews', 'تصحيح ومراجعة تسليمات مشاريع الطلاب'),
('reviews:grades:edit', 'تعديل الدرجات', 'Reviews', 'تعديل درجات الطلاب'),
('reviews:regrade', 'إعادة التصحيح', 'Reviews', 'إعادة تصحيح مشروع لطالب'),
('reviews:leaders', 'مراجعة تقييمات الليدرز', 'Reviews', 'مراجعة درجات وتقييمات الليدرز للطلاب'),
('reviews:grades:approve', 'اعتماد الدرجة', 'Reviews', 'الموافقة على درجة الطالب النهائية'),
('reviews:grades:reject', 'رفض الدرجة', 'Reviews', 'رفض درجة الطالب وإعادتها للتصحيح'),
-- Notifications
('notifications:all', 'إرسال إشعار عام', 'Notifications', 'إرسال إشعارات عامة لكافة مستخدمي المنصة'),
('notifications:team', 'إرسال إشعار لفريق', 'Notifications', 'إرسال إشعار لفريق محدد'),
('notifications:student', 'إرسال إشعار لطالب', 'Notifications', 'إرسال إشعار مخصص لطالب معين'),
('notifications:leader', 'إرسال إشعار لليدر', 'Notifications', 'إرسال إشعار لليدر محدد'),
-- Reports
('reports:view', 'مشاهدة التقارير', 'Reports', 'عرض التقارير الإحصائية والبيانية'),
('reports:export:excel', 'تصدير Excel', 'Reports', 'تصدير البيانات بصيغة Excel'),
('reports:export:pdf', 'تصدير PDF', 'Reports', 'تصدير البيانات بصيغة PDF'),
-- Settings
('settings:edit', 'تعديل إعدادات المنصة', 'Settings', 'تعديل إعدادات المنصة العامة'),
('settings:admins', 'إدارة الأدمنز', 'Settings', 'إضافة وتعديل حسابات المدراء'),
('settings:permissions', 'إدارة الصلاحيات', 'Settings', 'تعديل وتوزيع صلاحيات المدراء'),
('settings:backup', 'النسخ الاحتياطي', 'Settings', 'عمل نسخ احتياطي لقاعدة البيانات واستعادتها'),
('settings:logs', 'مشاهدة الـ Logs', 'Settings', 'عرض سجل العمليات والـ Audit Logs')
ON CONFLICT (id) DO NOTHING;

-- Populate Owner role with all standard permissions by default
DO $$
DECLARE
    owner_role_id uuid;
    perm_record record;
END;
$$;
