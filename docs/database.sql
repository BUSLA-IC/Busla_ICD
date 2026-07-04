-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text,
  email text,
  avatar_url text,
  role text DEFAULT 'student'::text,
  university text,
  faculty text,
  governorate text,
  academic_year text,
  total_xp integer DEFAULT 0,
  current_rank text DEFAULT 'Newbie'::text,
  team_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  department text,
  track text DEFAULT 'Digital IC Design'::text,
  admin_permissions jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT fk_team FOREIGN KEY (team_id) REFERENCES public.teams(id)
);
CREATE TABLE public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  university text,
  leader_id uuid,
  total_score integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  governorate text,
  courses_plan jsonb DEFAULT '[]'::jsonb,
  weekly_tasks jsonb DEFAULT '[]'::jsonb,
  requests jsonb DEFAULT '[]'::jsonb,
  specialization uuid,
  status text DEFAULT 'active'::text,
  CONSTRAINT teams_pkey PRIMARY KEY (id),
  CONSTRAINT teams_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.profiles(id),
  CONSTRAINT teams_specialization_fkey FOREIGN KEY (specialization) REFERENCES public.tracks(id)
);
CREATE TABLE public.team_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  team_name text NOT NULL,
  logo_url text,
  reason text,
  status text DEFAULT 'pending'::text,
  submitted_at timestamp with time zone DEFAULT now(),
  university text,
  governorate text,
  expected_size integer,
  specialization text,
  leader_gpa text,
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  CONSTRAINT team_requests_pkey PRIMARY KEY (id),
  CONSTRAINT team_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(id),
  CONSTRAINT team_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.phases (
  phase_id text NOT NULL,
  title text NOT NULL,
  description text,
  image_url text,
  is_active boolean DEFAULT true,
  Module Time text,
  Note text,
  prerequisites text,
  will_learn text,
  created_by text,
  created_at timestamp with time zone,
  track_id uuid,
  CONSTRAINT phases_pkey PRIMARY KEY (phase_id),
  CONSTRAINT phases_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.tracks(id)
);
CREATE TABLE public.courses (
  course_id text NOT NULL,
  phase_id text,
  title text NOT NULL,
  description text,
  playlist_id text,
  image_url text,
  prerequisites jsonb DEFAULT '[]'::jsonb,
  tools_required jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  auto_sync boolean DEFAULT true,
  type text,
  related_with text,
  Module_Time text,
  Note text,
  will_learn text,
  created_by text,
  CONSTRAINT courses_pkey PRIMARY KEY (course_id),
  CONSTRAINT courses_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.phases(phase_id)
);
CREATE TABLE public.course_materials (
  content_id text NOT NULL,
  course_id text,
  title text NOT NULL,
  type text NOT NULL,
  video_id text,
  duration integer,
  order_index integer,
  base_xp integer DEFAULT 0,
  ref_quiz_id uuid,
  ref_project_id uuid,
  Author text,
  Link Title text,
  Note text,
  status boolean DEFAULT true,
  created_by text,
  created_at timestamp with time zone,
  CONSTRAINT course_materials_pkey PRIMARY KEY (content_id),
  CONSTRAINT course_materials_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(course_id),
  CONSTRAINT fk_quiz FOREIGN KEY (ref_quiz_id) REFERENCES public.quizzes(quiz_id),
  CONSTRAINT fk_project FOREIGN KEY (ref_project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.quizzes (
  quiz_id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  passing_score integer DEFAULT 50,
  max_xp integer DEFAULT 50,
  attempts_allowed integer DEFAULT 3,
  created_at timestamp with time zone DEFAULT now(),
  created_by text,
  questions_to_show smallint,
  CONSTRAINT quizzes_pkey PRIMARY KEY (quiz_id)
);
CREATE TABLE public.quiz_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quiz_id uuid,
  question_text text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text,
  option_d text,
  correct_answer character NOT NULL,
  hint text,
  created_by text,
  created_at timestamp with time zone,
  CONSTRAINT quiz_questions_pkey PRIMARY KEY (id),
  CONSTRAINT quiz_questions_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(quiz_id)
);
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  requirements_url text,
  max_points integer DEFAULT 100,
  rubric_json jsonb,
  created_at timestamp with time zone DEFAULT now(),
  created_by text,
  submission_method text,
  CONSTRAINT projects_pkey PRIMARY KEY (id)
);
CREATE TABLE public.enrollments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id text NOT NULL,
  progress_percent integer DEFAULT 0,
  is_completed boolean DEFAULT false,
  started_at timestamp with time zone DEFAULT now(),
  last_accessed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT enrollments_pkey PRIMARY KEY (id),
  CONSTRAINT enrollments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(course_id)
);
CREATE TABLE public.completed_materials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  material_id text NOT NULL,
  course_id text,
  completed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT completed_materials_pkey PRIMARY KEY (id),
  CONSTRAINT completed_materials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT completed_materials_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.course_materials(content_id),
  CONSTRAINT completed_materials_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(course_id)
);
CREATE TABLE public.quiz_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_id uuid NOT NULL,
  score integer NOT NULL,
  passed boolean DEFAULT false,
  attempt_number integer DEFAULT 1,
  submitted_at timestamp with time zone DEFAULT now(),
  answers jsonb,
  CONSTRAINT quiz_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT quiz_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT quiz_attempts_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(quiz_id)
);
CREATE TABLE public.project_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  submission_link text NOT NULL,
  status text DEFAULT 'submitted'::text,
  grade integer,
  feedback_text text,
  submitted_at timestamp with time zone DEFAULT now(),
  graded_at timestamp with time zone,
  rubric_scores jsonb,
  graded_by uuid,
  graded_by_name text,
  CONSTRAINT project_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT project_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT project_submissions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.student_xp_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  reason text NOT NULL,
  source_id text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT student_xp_logs_pkey PRIMARY KEY (id),
  CONSTRAINT student_xp_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.team_score_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  contributor_id uuid,
  amount integer NOT NULL,
  reason text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT team_score_logs_pkey PRIMARY KEY (id),
  CONSTRAINT team_score_logs_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT team_score_logs_contributor_id_fkey FOREIGN KEY (contributor_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.experts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text,
  role text,
  image_url text,
  linkedin_url text,
  CONSTRAINT experts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.tools (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text,
  description text,
  link_url text,
  icon_url text,
  CONSTRAINT tools_pkey PRIMARY KEY (id)
);
CREATE TABLE public.roadmap_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text,
  description text,
  step_number integer,
  status text,
  CONSTRAINT roadmap_steps_pkey PRIMARY KEY (id)
);
CREATE TABLE public.team_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  to_uid uuid,
  to_email text NOT NULL,
  to_name text,
  from_team_id uuid NOT NULL,
  from_leader_id uuid NOT NULL,
  status text DEFAULT 'pending'::text,
  team_snapshot jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT team_invitations_pkey PRIMARY KEY (id),
  CONSTRAINT team_invitations_to_uid_fkey FOREIGN KEY (to_uid) REFERENCES public.profiles(id),
  CONSTRAINT team_invitations_from_team_id_fkey FOREIGN KEY (from_team_id) REFERENCES public.teams(id),
  CONSTRAINT team_invitations_from_leader_id_fkey FOREIGN KEY (from_leader_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.team_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  content_id text,
  course_id text,
  title text,
  description text,
  duration text,
  type text NOT NULL,
  week_id text NOT NULL,
  due_date timestamp with time zone,
  assigned_by uuid,
  stats jsonb DEFAULT '{"started_count": 0, "total_students": 0, "completed_count": 0}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT team_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT team_tasks_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT team_tasks_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.team_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  creator_id uuid,
  creator_name text,
  creator_avatar text,
  seen_by jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  is_pinned boolean DEFAULT false,
  expiry_date date,
  link_url text,
  target_members jsonb DEFAULT '["all"]'::jsonb,
  CONSTRAINT team_posts_pkey PRIMARY KEY (id),
  CONSTRAINT team_posts_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT team_posts_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.active_quiz_states (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_id uuid NOT NULL,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_attempt integer NOT NULL DEFAULT 1,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT active_quiz_states_pkey PRIMARY KEY (id),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT fk_quiz FOREIGN KEY (quiz_id) REFERENCES public.quizzes(quiz_id)
);
CREATE TABLE public.system_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  type text DEFAULT 'info'::text,
  target_team_id uuid,
  target_leader_id uuid,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  seen_by jsonb DEFAULT '[]'::jsonb,
  CONSTRAINT system_notifications_pkey PRIMARY KEY (id)
);
CREATE TABLE public.tracks (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tracks_pkey PRIMARY KEY (id)
);
CREATE TABLE public.admin_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  gender text,
  age integer,
  university text NOT NULL,
  faculty text,
  department text,
  academic_year text,
  status text,
  hours_per_week text NOT NULL,
  available_days jsonb DEFAULT '[]'::jsonb,
  preferred_time text,
  ic_interest_level text,
  technical_background jsonb DEFAULT '[]'::jsonb,
  motivation_text text,
  contribution_text text,
  experience_text text,
  linkedin text,
  github text,
  portfolio text,
  track text DEFAULT 'content'::text,
  application_status text DEFAULT 'pending'::text,
  internal_notes text,
  submitted_at timestamp with time zone DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  governorate text,
  academic_track text,
  CONSTRAINT admin_applications_pkey PRIMARY KEY (id),
  CONSTRAINT admin_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id)
);






////////////////////////////////
////////////////////////////////
////////////////////////////////
////////////////////////////////
////////////////////////////////



auto_fill_admin_profile



DECLARE
    v_email TEXT;
    app_data RECORD;
BEGIN
    -- استخراج الإيميل بشكل دقيق من نظام المصادقة
    SELECT email INTO v_email FROM auth.users WHERE id = NEW.id;
    IF v_email IS NULL THEN v_email := NEW.email; END IF;

    -- 💡 تحديد مسار الجدول بدقة (public.admin_applications) لمنع أي توهان للداتابيز
    SELECT * INTO app_data FROM public.admin_applications 
    WHERE email = v_email AND application_status = 'accepted' LIMIT 1;

    -- إذا كان أدمن مقبول، نقوم بفرمتة الصف وملء البيانات الصحيحة بالقوة قبل الحفظ
    IF FOUND THEN
        NEW.role := 'admin';
        NEW.email := v_email;
        NEW.full_name := app_data.full_name;
        NEW.university := app_data.university;
        NEW.faculty := app_data.faculty;
        NEW.department := app_data.department;
        NEW.governorate := app_data.governorate;
        NEW.academic_year := app_data.academic_year;
        NEW.track := app_data.track;
        -- منح جميع الصلاحيات
        NEW.admin_permissions := '["manage_content", "manage_requests", "audit_projects", "manage_users"]'::jsonb;
    END IF;

    RETURN NEW;
END;

////////////////////////////////
////////////////////////////////
check_email_availability


DECLARE
    status_result TEXT;
BEGIN
    -- التحقق إذا كان مسجلاً كحساب فعلي
    IF EXISTS (SELECT 1 FROM profiles WHERE email = email_to_check) THEN
        RETURN 'exists';
    -- التحقق إذا كان له طلب معلق
    ELSIF EXISTS (SELECT 1 FROM admin_applications WHERE email = email_to_check AND application_status = 'pending') THEN
        RETURN 'pending';
    ELSE
        RETURN 'available';
    END IF;
END;

////////////////////////////////
////////////////////////////////

claim_admin_role
DECLARE
    v_email TEXT;
    app_data RECORD;
BEGIN
    -- 1. الحصول على إيميل المستخدم الذي سجل دخوله الآن
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
    IF v_email IS NULL THEN RETURN 'failed'; END IF;

    -- 2. البحث عنه في الطلبات المقبولة
    SELECT * INTO app_data FROM public.admin_applications 
    WHERE email = v_email AND application_status = 'accepted' LIMIT 1;

    -- 3. لو لقيناه، نعمل Update صريح وإجباري لكل بياناته
    IF FOUND THEN
        UPDATE public.profiles
        SET role = 'admin',
            full_name = app_data.full_name,
            university = app_data.university,
            faculty = app_data.faculty,
            department = app_data.department,
            governorate = app_data.governorate,
            academic_year = app_data.academic_year,
            track = app_data.track,
            admin_permissions = '["manage_content", "manage_requests", "audit_projects", "manage_users"]'::jsonb
        WHERE id = auth.uid();
        
        RETURN 'upgraded';
    END IF;

    RETURN 'not_admin';
END;

////////////////////////////////
////////////////////////////////

handle_new_user

BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, avatar_url, university, faculty, department, academic_year, governorate, track
  )
  VALUES (
    new.id,
    new.email, -- ✅ تم إصلاح مشكلة الإيميل هنا
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'university',
    new.raw_user_meta_data->>'faculty',
    new.raw_user_meta_data->>'department',
    new.raw_user_meta_data->>'academic_year',
    new.raw_user_meta_data->>'governorate',
    new.raw_user_meta_data->>'track'
  );
  RETURN new;
END;


////////////////////////////////
////////////////////////////////
handle_new_user_with_application


DECLARE
  app_record RECORD;
BEGIN
  -- البحث: هل هذا الإيميل الذي يسجل الآن له طلب "مقبول" مسبقاً؟
  SELECT * INTO app_record 
  FROM public.admin_applications 
  WHERE email = new.email AND application_status = 'accepted'
  LIMIT 1;

  IF FOUND THEN
    -- 💡 الشخص مقبول! ننشئ له بروفايل كـ Admin ونعطيه الصلاحيات
    INSERT INTO public.profiles (id, full_name, email, role, admin_permissions, university, faculty, department, track, governorate, academic_year)
    VALUES (
      new.id, 
      app_record.full_name, 
      new.email, 
      'admin', -- تم التعديل هنا ليكون Admin
      '{"manage_content": true, "manage_requests": true}'::jsonb, -- إعطاء صلاحيات الإدارة المبدئية
      app_record.university,
      app_record.faculty,
      app_record.department,
      app_record.academic_track,
      app_record.governorate,
      app_record.academic_year
    );
  ELSE
    -- 👤 الشخص طالب عادي يسجل في المنصة
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (
      new.id, 
      new.raw_user_meta_data->>'full_name', 
      new.email, 
      'student'
    );
  END IF;

  RETURN new;
END;

////////////////////////////////
////////////////////////////////
rls_auto_enable

DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;



//////////////////////////////
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
BEGIN
    SELECT id INTO owner_role_id FROM public.admin_roles WHERE name = 'Owner' LIMIT 1;
    IF owner_role_id IS NOT NULL THEN
        FOR perm_record IN SELECT id FROM public.permissions LOOP
            INSERT INTO public.role_permissions (role_id, permission_id)
            VALUES (owner_role_id, perm_record.id)
            ON CONFLICT (role_id, permission_id) DO NOTHING;
        END LOOP;
    END IF;
END;
$$;
