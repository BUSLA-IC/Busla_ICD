-- ============================================================================
-- BUSLA LMS - FIX FOREIGN KEY CASCADING DELETES & PERMISSIONS
-- Run this script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/cllkrfcyymtenrrjfsed/sql
-- ============================================================================

-- 1. ENROLLMENTS -> COURSES (Cascade on course deletion)
ALTER TABLE public.enrollments 
    DROP CONSTRAINT IF EXISTS enrollments_course_id_fkey,
    ADD CONSTRAINT enrollments_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(course_id) ON DELETE CASCADE;

-- 2. COMPLETED_MATERIALS -> COURSES & COURSE_MATERIALS (Cascade)
ALTER TABLE public.completed_materials 
    DROP CONSTRAINT IF EXISTS completed_materials_course_id_fkey,
    ADD CONSTRAINT completed_materials_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(course_id) ON DELETE CASCADE;

ALTER TABLE public.completed_materials 
    DROP CONSTRAINT IF EXISTS completed_materials_material_id_fkey,
    ADD CONSTRAINT completed_materials_material_id_fkey 
    FOREIGN KEY (material_id) REFERENCES public.course_materials(content_id) ON DELETE CASCADE;

-- 3. COURSE_MATERIALS -> COURSES (Cascade on course deletion)
ALTER TABLE public.course_materials 
    DROP CONSTRAINT IF EXISTS course_materials_course_id_fkey,
    ADD CONSTRAINT course_materials_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(course_id) ON DELETE CASCADE;

-- 4. COURSES -> PHASES (Cascade on phase deletion)
ALTER TABLE public.courses 
    DROP CONSTRAINT IF EXISTS courses_phase_id_fkey,
    ADD CONSTRAINT courses_phase_id_fkey 
    FOREIGN KEY (phase_id) REFERENCES public.phases(phase_id) ON DELETE CASCADE;

-- 5. PHASES -> TRACKS (Cascade on track deletion)
ALTER TABLE public.phases 
    DROP CONSTRAINT IF EXISTS phases_track_id_fkey,
    ADD CONSTRAINT phases_track_id_fkey 
    FOREIGN KEY (track_id) REFERENCES public.tracks(id) ON DELETE CASCADE;

-- 6. QUIZ QUESTIONS & ATTEMPTS -> QUIZZES (Cascade on quiz deletion)
ALTER TABLE public.quiz_questions 
    DROP CONSTRAINT IF EXISTS quiz_questions_quiz_id_fkey,
    ADD CONSTRAINT quiz_questions_quiz_id_fkey 
    FOREIGN KEY (quiz_id) REFERENCES public.quizzes(quiz_id) ON DELETE CASCADE;

ALTER TABLE public.quiz_attempts 
    DROP CONSTRAINT IF EXISTS quiz_attempts_quiz_id_fkey,
    ADD CONSTRAINT quiz_attempts_quiz_id_fkey 
    FOREIGN KEY (quiz_id) REFERENCES public.quizzes(quiz_id) ON DELETE CASCADE;

-- 7. PROJECT SUBMISSIONS -> PROJECTS (Cascade on project deletion)
ALTER TABLE public.project_submissions 
    DROP CONSTRAINT IF EXISTS project_submissions_project_id_fkey,
    ADD CONSTRAINT project_submissions_project_id_fkey 
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- 8. COURSE MATERIALS -> QUIZZES & PROJECTS (Set null if quiz or project deleted)
ALTER TABLE public.course_materials 
    DROP CONSTRAINT IF EXISTS fk_quiz,
    ADD CONSTRAINT fk_quiz 
    FOREIGN KEY (ref_quiz_id) REFERENCES public.quizzes(quiz_id) ON DELETE SET NULL;

ALTER TABLE public.course_materials 
    DROP CONSTRAINT IF EXISTS fk_project,
    ADD CONSTRAINT fk_project 
    FOREIGN KEY (ref_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

-- 9. CURRICULUM DOCUMENTS (Cascade if exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'curriculum_documents') THEN
        ALTER TABLE public.curriculum_documents 
            DROP CONSTRAINT IF EXISTS curriculum_documents_course_id_fkey,
            ADD CONSTRAINT curriculum_documents_course_id_fkey 
            FOREIGN KEY (course_id) REFERENCES public.courses(course_id) ON DELETE CASCADE;

        ALTER TABLE public.curriculum_documents 
            DROP CONSTRAINT IF EXISTS curriculum_documents_phase_id_fkey,
            ADD CONSTRAINT curriculum_documents_phase_id_fkey 
            FOREIGN KEY (phase_id) REFERENCES public.phases(phase_id) ON DELETE CASCADE;

        ALTER TABLE public.curriculum_documents 
            DROP CONSTRAINT IF EXISTS curriculum_documents_track_id_fkey,
            ADD CONSTRAINT curriculum_documents_track_id_fkey 
            FOREIGN KEY (track_id) REFERENCES public.tracks(id) ON DELETE CASCADE;

        ALTER TABLE public.curriculum_documents 
            DROP CONSTRAINT IF EXISTS curriculum_documents_lesson_id_fkey,
            ADD CONSTRAINT curriculum_documents_lesson_id_fkey 
            FOREIGN KEY (lesson_id) REFERENCES public.course_materials(content_id) ON DELETE CASCADE;
    END IF;
END $$;

-- 10. ADMIN RLS DELETE POLICIES
-- Ensure authenticated Admins can delete student records from enrollments and completed_materials
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'enrollments' AND policyname = 'Allow admins to delete enrollments'
    ) THEN
        CREATE POLICY "Allow admins to delete enrollments"
            ON public.enrollments FOR DELETE TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles 
                    WHERE profiles.id = auth.uid() 
                    AND LOWER(profiles.role) IN ('owner', 'admin', 'master admin', 'content manager')
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'completed_materials' AND policyname = 'Allow admins to delete completed_materials'
    ) THEN
        CREATE POLICY "Allow admins to delete completed_materials"
            ON public.completed_materials FOR DELETE TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles 
                    WHERE profiles.id = auth.uid() 
                    AND LOWER(profiles.role) IN ('owner', 'admin', 'master admin', 'content manager')
                )
            );
    END IF;
END $$;
