-- ============================================================================
-- BUSLA LMS - Schema Update & Trigger Customization for Member Applications
-- Run this script in the Supabase SQL Editor.
-- ============================================================================

-- 1. Add role and custom_permissions columns to admin_applications table
ALTER TABLE public.admin_applications ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.admin_applications ADD COLUMN IF NOT EXISTS custom_permissions jsonb;

-- 2. Enable Row Level Security (RLS) and define policies for admin_applications
ALTER TABLE public.admin_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert to admin_applications" ON public.admin_applications;
DROP POLICY IF EXISTS "Allow anyone to read admin_applications" ON public.admin_applications;
DROP POLICY IF EXISTS "Allow authenticated to read admin_applications" ON public.admin_applications;
DROP POLICY IF EXISTS "Allow admins to manage admin_applications" ON public.admin_applications;

CREATE POLICY "Allow public insert to admin_applications" 
    ON public.admin_applications FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow anyone to read admin_applications" 
    ON public.admin_applications FOR SELECT USING (true);

CREATE POLICY "Allow admins to manage admin_applications" 
    ON public.admin_applications FOR ALL TO authenticated USING (public.is_admin());

-- 3. Redefine handle_new_user_with_application trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user_with_application()
RETURNS trigger AS $$
DECLARE
  app_record RECORD;
  perm_val jsonb;
  perm_id text;
BEGIN
  -- Search if there is an accepted admin application for this email
  SELECT * INTO app_record 
  FROM public.admin_applications 
  WHERE email = new.email AND application_status = 'accepted'
  LIMIT 1;

  IF FOUND THEN
    -- Insert profile with the assigned role
    INSERT INTO public.profiles (
      id, 
      full_name, 
      email, 
      role, 
      university, 
      faculty, 
      department, 
      track, 
      governorate, 
      academic_year,
      status
    )
    VALUES (
      new.id, 
      app_record.full_name, 
      new.email, 
      COALESCE(app_record.role, 'Admin'), -- default to Admin if role is null
      app_record.university,
      app_record.faculty,
      app_record.department,
      app_record.academic_track,
      app_record.governorate,
      app_record.academic_year,
      'active'
    )
    ON CONFLICT (id) DO UPDATE
    SET 
      role = EXCLUDED.role,
      full_name = EXCLUDED.full_name,
      university = EXCLUDED.university,
      faculty = EXCLUDED.faculty,
      department = EXCLUDED.department,
      track = EXCLUDED.track,
      governorate = EXCLUDED.governorate,
      academic_year = EXCLUDED.academic_year,
      status = EXCLUDED.status;

    -- Insert custom permissions into public.admin_permissions if any
    IF app_record.custom_permissions IS NOT NULL THEN
      -- Delete any existing custom permissions for safety
      DELETE FROM public.admin_permissions WHERE admin_id = new.id;
      
      FOR perm_val IN SELECT jsonb_array_elements(app_record.custom_permissions) LOOP
        perm_id := perm_val#>>'{}'; -- extract string value from jsonb
        -- Make sure the permission exists in permissions table before inserting
        IF EXISTS (SELECT 1 FROM public.permissions WHERE id = perm_id) THEN
          INSERT INTO public.admin_permissions (admin_id, permission_id)
          VALUES (new.id, perm_id)
          ON CONFLICT (admin_id, permission_id) DO NOTHING;
        END IF;
      END LOOP;
    END IF;

  ELSE
    -- Default behavior: normal student registration
    INSERT INTO public.profiles (
      id, 
      full_name, 
      email, 
      role,
      university,
      faculty,
      department,
      governorate,
      academic_year,
      track,
      status
    )
    VALUES (
      new.id, 
      new.raw_user_meta_data->>'full_name', 
      new.email, 
      'student',
      new.raw_user_meta_data->>'university',
      new.raw_user_meta_data->>'faculty',
      new.raw_user_meta_data->>'department',
      new.raw_user_meta_data->>'governorate',
      new.raw_user_meta_data->>'academic_year',
      new.raw_user_meta_data->>'track',
      'active'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Redefine claim_admin_role function
CREATE OR REPLACE FUNCTION public.claim_admin_role()
RETURNS text AS $$
DECLARE
    v_email TEXT;
    app_data RECORD;
    perm_val jsonb;
    perm_id text;
BEGIN
    -- 1. Obtain current user's email
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
    IF v_email IS NULL THEN RETURN 'failed'; END IF;

    -- 2. Find their accepted application
    SELECT * INTO app_data FROM public.admin_applications 
    WHERE email = v_email AND application_status = 'accepted' LIMIT 1;

    -- 3. If found, upgrade their profile details
    IF FOUND THEN
        UPDATE public.profiles
        SET role = COALESCE(app_data.role, 'admin'),
            full_name = app_data.full_name,
            university = app_data.university,
            faculty = app_data.faculty,
            department = app_data.department,
            governorate = app_data.governorate,
            academic_year = app_data.academic_year,
            track = app_data.track
        WHERE id = auth.uid();

        -- Insert custom permissions into public.admin_permissions if any
        IF app_data.custom_permissions IS NOT NULL THEN
            -- Delete any existing custom permissions for safety
            DELETE FROM public.admin_permissions WHERE admin_id = auth.uid();

            FOR perm_val IN SELECT jsonb_array_elements(app_data.custom_permissions) LOOP
                perm_id := perm_val#>>'{}';
                IF EXISTS (SELECT 1 FROM public.permissions WHERE id = perm_id) THEN
                    INSERT INTO public.admin_permissions (admin_id, permission_id)
                    VALUES (auth.uid(), perm_id)
                    ON CONFLICT (admin_id, permission_id) DO NOTHING;
                END IF;
            END LOOP;
        END IF;
        
        RETURN 'upgraded';
    END IF;

    RETURN 'not_admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
