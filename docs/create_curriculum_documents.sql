-- BUSLA ICD - Curriculum Documents & Progress Schema
-- Run this script in the Supabase SQL Editor.

-- Drop old tables if they exist to start fresh
DROP TABLE IF EXISTS public.document_progress CASCADE;
DROP TABLE IF EXISTS public.curriculum_documents CASCADE;

-- Create curriculum_documents table
CREATE TABLE public.curriculum_documents (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title text NOT NULL,
    short_title text,
    description text,
    cover_url text,
    thumbnail_url text,
    document_type text NOT NULL,                      -- PDF, Book, Notes, Datasheet, Research Paper, Documentation, Manual, Whitepaper, Specification
    
    -- Curriculum Links (all optional)
    track_id uuid REFERENCES public.tracks(id) ON DELETE CASCADE,
    phase_id text REFERENCES public.phases(phase_id) ON DELETE CASCADE,
    course_id text REFERENCES public.courses(course_id) ON DELETE CASCADE,
    lesson_id text REFERENCES public.course_materials(content_id) ON DELETE CASCADE,
    
    -- Source settings
    source_type text NOT NULL,                        -- Google Drive, OneDrive, Dropbox, GitHub, AWS S3, Supabase Storage, Direct URL
    source_url text NOT NULL,                         -- Direct URL or ID
    view_mode text DEFAULT 'embed',                   -- embed, external
    
    -- Completion settings
    completion_trigger text DEFAULT 'mark_complete',  -- open, pages, last_page, time, mark_complete
    completion_pages_count integer,
    completion_time_seconds integer,
    
    xp_reward integer DEFAULT 10,
    estimated_reading_time integer,                   -- In minutes
    importance text DEFAULT 'Optional',               -- Required, Optional, Recommended
    
    -- Permissions & Availability
    allow_download boolean DEFAULT true,
    allow_print boolean DEFAULT true,
    allow_copy boolean DEFAULT true,
    available_until timestamp with time zone,         -- Hide/Archive after date
    
    order_index integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    CONSTRAINT curriculum_documents_pkey PRIMARY KEY (id)
);

-- Create document_progress table
CREATE TABLE public.document_progress (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    document_id uuid NOT NULL REFERENCES public.curriculum_documents(id) ON DELETE CASCADE,
    last_page integer DEFAULT 1,
    reading_percent integer DEFAULT 0,
    time_spent integer DEFAULT 0,                     -- in seconds
    completed boolean DEFAULT false,
    completed_at timestamp with time zone,
    last_accessed_at timestamp with time zone DEFAULT now(),
    CONSTRAINT document_progress_pkey PRIMARY KEY (id),
    CONSTRAINT document_progress_user_doc_unique UNIQUE (user_id, document_id)
);

-- Enable RLS
ALTER TABLE public.curriculum_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_progress ENABLE ROW LEVEL SECURITY;

-- curriculum_documents policies
DROP POLICY IF EXISTS "Allow public read for active documents" ON public.curriculum_documents;
CREATE POLICY "Allow public read for active documents" ON public.curriculum_documents
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow admin write access for documents" ON public.curriculum_documents;
CREATE POLICY "Allow admin write access for documents" ON public.curriculum_documents
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (
                LOWER(profiles.role) = 'owner' 
                OR LOWER(profiles.role) = 'admin' 
                OR LOWER(profiles.role) = 'master admin' 
                OR LOWER(profiles.role) = 'content manager'
            )
        )
    );

-- document_progress policies
DROP POLICY IF EXISTS "Users can manage their own document progress" ON public.document_progress;
CREATE POLICY "Users can manage their own document progress" ON public.document_progress
    FOR ALL USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_curr_docs_track_id ON public.curriculum_documents(track_id);
CREATE INDEX IF NOT EXISTS idx_curr_docs_phase_id ON public.curriculum_documents(phase_id);
CREATE INDEX IF NOT EXISTS idx_curr_docs_course_id ON public.curriculum_documents(course_id);
CREATE INDEX IF NOT EXISTS idx_curr_docs_lesson_id ON public.curriculum_documents(lesson_id);
CREATE INDEX IF NOT EXISTS idx_doc_progress_user_id ON public.document_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_doc_progress_doc_id ON public.document_progress(document_id);
