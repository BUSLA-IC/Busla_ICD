-- ============================================================================
-- BUSLA LMS - PROJECT REVIEW & SUPERVISION DATABASE SCHEMA
-- Execute this script in your Supabase SQL Editor to initialize the tables.
-- ============================================================================

-- 1. Create project_appeals Table
CREATE TABLE IF NOT EXISTS public.project_appeals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id uuid NOT NULL REFERENCES public.project_submissions(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    leader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason text NOT NULL,
    comments text,
    attachments jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'pending'::text, -- pending, resolved_approved (accepted), resolved_rejected (rejected)
    decision_text text,
    resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT unique_submission_appeal UNIQUE (submission_id)
);

-- Enable RLS
ALTER TABLE public.project_appeals ENABLE ROW LEVEL SECURITY;

-- Policies for project_appeals
CREATE POLICY "Allow authenticated users to read appeals"
    ON public.project_appeals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admins to manage appeals"
    ON public.project_appeals FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Allow students to insert appeals"
    ON public.project_appeals FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);


-- 2. Create project_audits Table
CREATE TABLE IF NOT EXISTS public.project_audits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id uuid NOT NULL REFERENCES public.project_submissions(id) ON DELETE CASCADE,
    reason text NOT NULL, -- e.g. "grade_100", "same_score", "fast_grading", "random", "appeal", "difference", "flagged"
    admin_grade integer,
    admin_rubric_scores jsonb DEFAULT '{}'::jsonb,
    admin_feedback text,
    status text DEFAULT 'pending'::text, -- pending, completed
    resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT unique_submission_audit UNIQUE (submission_id)
);

-- Enable RLS
ALTER TABLE public.project_audits ENABLE ROW LEVEL SECURITY;

-- Policies for project_audits
CREATE POLICY "Allow authenticated users to read audits"
    ON public.project_audits FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admins to manage audits"
    ON public.project_audits FOR ALL TO authenticated USING (public.is_admin());
