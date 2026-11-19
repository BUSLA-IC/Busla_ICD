-- ============================================================================
-- BUSLA ICD - Unlimited Multi-Attachment Curriculum Links Schema
-- Run this script in the Supabase SQL Editor to enable linking multiple
-- quizzes, projects, and documents to any Course, Content (Video/Lesson),
-- Phase, or Track (and linking the same item to multiple targets).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.curriculum_links (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    target_type text NOT NULL CHECK (target_type IN ('track', 'phase', 'course', 'content')),
    target_id text NOT NULL,
    item_type text NOT NULL CHECK (item_type IN ('quiz', 'project', 'document')),
    item_id uuid NOT NULL,
    order_index integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    CONSTRAINT curriculum_links_pkey PRIMARY KEY (id),
    CONSTRAINT curriculum_links_unique UNIQUE (target_type, target_id, item_type, item_id)
);

-- Indexes for fast lookups in both directions (Target -> Items, Item -> Targets)
CREATE INDEX IF NOT EXISTS idx_curriculum_links_target
    ON public.curriculum_links (target_type, target_id, order_index);

CREATE INDEX IF NOT EXISTS idx_curriculum_links_item
    ON public.curriculum_links (item_type, item_id);

-- Enable Row Level Security
ALTER TABLE public.curriculum_links ENABLE ROW LEVEL SECURITY;

-- Public / authenticated read access (matching curriculum_documents)
DROP POLICY IF EXISTS "Allow public read for curriculum links" ON public.curriculum_links;
CREATE POLICY "Allow public read for curriculum links" ON public.curriculum_links
    FOR SELECT USING (true);

-- Admin write access (matching curriculum_documents & permissions system)
DROP POLICY IF EXISTS "Allow admin write access for curriculum links" ON public.curriculum_links;
CREATE POLICY "Allow admin write access for curriculum links" ON public.curriculum_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND LOWER(profiles.role) IN (
                  'owner', 'admin', 'master admin', 'content manager',
                  'leader supervisor', 'project reviewer'
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND LOWER(profiles.role) IN (
                  'owner', 'admin', 'master admin', 'content manager',
                  'leader supervisor', 'project reviewer'
              )
        )
    );

-- ============================================================================
-- AUTOMATIC DATA BACKFILL FROM LEGACY SINGLE-LINK COLUMNS (IDEMPOTENT)
-- ============================================================================

-- 1. Backfill existing course_materials.ref_quiz_id -> curriculum_links
INSERT INTO public.curriculum_links (target_type, target_id, item_type, item_id, order_index)
SELECT 'content', cm.content_id, 'quiz', cm.ref_quiz_id, 0
FROM public.course_materials cm
WHERE cm.ref_quiz_id IS NOT NULL
ON CONFLICT (target_type, target_id, item_type, item_id) DO NOTHING;

-- 2. Backfill existing course_materials.ref_project_id -> curriculum_links
INSERT INTO public.curriculum_links (target_type, target_id, item_type, item_id, order_index)
SELECT 'content', cm.content_id, 'project', cm.ref_project_id, 0
FROM public.course_materials cm
WHERE cm.ref_project_id IS NOT NULL
ON CONFLICT (target_type, target_id, item_type, item_id) DO NOTHING;

-- 3. Backfill existing curriculum_documents (most specific target wins)
INSERT INTO public.curriculum_links (target_type, target_id, item_type, item_id, order_index)
SELECT
    CASE
        WHEN d.lesson_id IS NOT NULL AND TRIM(d.lesson_id) <> '' THEN 'content'
        WHEN d.course_id IS NOT NULL AND TRIM(d.course_id) <> '' THEN 'course'
        WHEN d.phase_id IS NOT NULL AND TRIM(d.phase_id) <> '' THEN 'phase'
        WHEN d.track_id IS NOT NULL THEN 'track'
    END AS target_type,
    CASE
        WHEN d.lesson_id IS NOT NULL AND TRIM(d.lesson_id) <> '' THEN d.lesson_id
        WHEN d.course_id IS NOT NULL AND TRIM(d.course_id) <> '' THEN d.course_id
        WHEN d.phase_id IS NOT NULL AND TRIM(d.phase_id) <> '' THEN d.phase_id
        WHEN d.track_id IS NOT NULL THEN d.track_id::text
    END AS target_id,
    'document' AS item_type,
    d.id AS item_id,
    COALESCE(d.order_index, 0) AS order_index
FROM public.curriculum_documents d
WHERE (d.lesson_id IS NOT NULL AND TRIM(d.lesson_id) <> '')
   OR (d.course_id IS NOT NULL AND TRIM(d.course_id) <> '')
   OR (d.phase_id IS NOT NULL AND TRIM(d.phase_id) <> '')
   OR (d.track_id IS NOT NULL)
ON CONFLICT (target_type, target_id, item_type, item_id) DO NOTHING;
