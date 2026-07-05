-- BUSLA ICD - Tools Management Table Schema Update
-- Run this script in the Supabase SQL Editor.

-- Drop old tools table if it exists to start fresh
DROP TABLE IF EXISTS public.tools CASCADE;

-- Create the new advanced tools table
CREATE TABLE public.tools (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    short_name text,
    short_description text,
    full_description text,
    logo_url text,
    images text[],                  -- Array of additional image URLs
    banner_url text,
    type text NOT NULL,             -- Software, Website, AI Tool, IDE, etc.
    
    -- Curriculum Links (stored as arrays for multi-linking support)
    track_ids uuid[],               -- References public.tracks(id)
    phase_ids text[],               -- References public.phases(phase_id)
    course_ids text[],              -- References public.courses(course_id)
    module_ids text[],
    content_ids text[],             -- References public.course_materials(content_id)
    
    importance text DEFAULT 'Optional',            -- Required, Recommended, Optional
    experience_level text DEFAULT 'Beginner',      -- Beginner, Intermediate, Advanced, Professional
    supported_os text[],            -- Windows, Linux, macOS, Android, iOS, Web
    
    features text[],                -- Feature list strings
    pros text[],                    -- Pros list strings
    cons text[],                    -- Cons list strings
    alternatives uuid[],            -- Array of other tools.id
    
    -- Links
    official_website text,
    download_links jsonb DEFAULT '[]'::jsonb,      -- Array of objects: [{"platform": "Windows", "url": "..."}]
    documentation_url text,
    tutorials_links text[],         -- Array of tutorial URL strings
    youtube_playlists text[],       -- Array of playlist URL strings
    github_url text,
    community_links jsonb DEFAULT '[]'::jsonb,     -- Array of objects: [{"platform": "Discord", "url": "..."}]
    
    tags text[],                    -- Array of tag strings: RTL, Simulation, etc.
    
    -- SEO
    meta_title text,
    meta_description text,
    meta_keywords text,
    slug text UNIQUE,
    
    -- Status
    status text DEFAULT 'Draft',    -- Published, Draft, Archived, Hidden
    
    -- Analytics & Sorting
    views_count integer DEFAULT 0,
    clicks_count integer DEFAULT 0,
    order_index integer DEFAULT 0,
    
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    
    CONSTRAINT tools_pkey PRIMARY KEY (id)
);

-- Enable Row Level Security
ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;

-- 1. Read Policy: Allow anyone (guests and students) to read Published or Hidden tools
DROP POLICY IF EXISTS "Allow public read for active tools" ON public.tools;
CREATE POLICY "Allow public read for active tools" ON public.tools
    FOR SELECT USING (status = 'Published' OR status = 'Hidden');

-- 2. Write Policy: Allow users with administrative roles to manage tools (case-insensitive check)
DROP POLICY IF EXISTS "Allow admin write access" ON public.tools;
CREATE POLICY "Allow admin write access" ON public.tools
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

-- Create index on track_ids and course_ids for fast filtering
CREATE INDEX IF NOT EXISTS idx_tools_track_ids ON public.tools USING gin(track_ids);
CREATE INDEX IF NOT EXISTS idx_tools_course_ids ON public.tools USING gin(course_ids);
CREATE INDEX IF NOT EXISTS idx_tools_status ON public.tools(status);
CREATE INDEX IF NOT EXISTS idx_tools_slug ON public.tools(slug);
