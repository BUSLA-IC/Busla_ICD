-- BUSLA ICD - References Management Table Schema
-- Run this script in the Supabase SQL Editor.

-- Drop old reference_library table if it exists to start fresh
DROP TABLE IF EXISTS public.reference_library CASCADE;

-- Create the new advanced reference_library table
CREATE TABLE public.reference_library (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title text NOT NULL,
    short_title text,
    short_description text,
    full_description text,
    cover_url text,                                 -- صورة الغلاف للمرجع
    banner_url text,                                -- صورة البانر (اختياري)
    type text NOT NULL,                             -- نوع المرجع (Research Paper, Book, Article, etc.)
    
    -- بيانات النشر
    author text,                                    -- المؤلف الرئيسي
    contributors text[],                            -- المؤلفون المشاركون
    institution text,                               -- المؤسسة البحثية
    university text,                                -- الجامعة
    publisher text,                                 -- الناشر أو دار النشر
    journal text,                                   -- المجلة العلمية
    conference text,                                -- المؤتمر العلمي
    publication_year integer,                       -- سنة النشر
    edition text,                                   -- الإصدار أو النسخة
    doi text,                                       -- رقم التعريف الرقمي DOI
    isbn text,                                      -- الرقم الدولي المعياري للكتاب
    issn text,                                      -- الرقم الدولي المعياري للدوريات
    
    -- ربط المرجع بالمنهج التعليمي (Curriculum Links)
    track_ids uuid[],                               -- معرفات المسارات التعليمية المرتبطة
    phase_ids text[],                               -- معرفات المراحل التعليمية المرتبطة
    course_ids text[],                              -- معرفات الكورسات المرتبطة
    module_ids text[],                              -- معرفات الوحدات المرتبطة
    content_ids text[],                             -- معرفات الدروس المرتبطة (course_materials.content_id)
    
    experience_level text DEFAULT 'Beginner',       -- مستوى الخبرة (Beginner, Intermediate, Advanced, Professional)
    importance text DEFAULT 'Optional',             -- مستوى الأهمية (Required, Recommended, Optional, Advanced Reading)
    tags text[],                                    -- وسوم/كلمات مفتاحية (RTL, STA, FPGA, CMOS...)
    language text DEFAULT 'English',                -- لغة المرجع (Arabic, English, etc.)
    
    -- روابط المرجع
    read_online_url text,                           -- رابط القراءة أونلاين
    download_pdf_url text,                          -- رابط تحميل ملف الـ PDF
    ieee_url text,                                  -- رابط المرجع على موقع IEEE Explorer
    springer_url text,                              -- رابط المرجع على موقع Springer
    acm_url text,                                   -- رابط المرجع على موقع ACM
    sciencedirect_url text,                         -- رابط المرجع على موقع ScienceDirect
    github_url text,                                -- رابط المشروع أو الكود على GitHub
    official_source_url text,                       -- رابط المصدر الرسمي الآخر
    
    -- الملخص العلمي
    abstract text,                                  -- ملخص المرجع (Abstract)
    key_takeaways text[],                           -- أهم النقاط المستفادة (Key Takeaways)
    key_ideas text[],                               -- الأفكار الرئيسية المذكورة
    why_read text,                                  -- لماذا يجب قراءته؟
    
    -- الفوائد التعليمية والمتطلبات
    what_you_will_learn text[],                     -- ماذا سيتعلم الطالب؟
    prerequisites text[],                           -- المتطلبات السابقة
    
    -- العلاقات والمراجع المتشابهة
    related_references uuid[],                      -- المراجع المرتبطة يدوياً (مصفوفة من معرفات reference_library)
    
    -- معايير الفلترة والترتيب والـ SEO
    slug text UNIQUE,                               -- الرابط اللطيف للمرجع
    meta_title text,
    meta_description text,
    meta_keywords text,
    
    -- حالة النشر والتحليلات
    status text DEFAULT 'Draft',                    -- (Draft, Published, Hidden, Archived)
    views_count integer DEFAULT 0,
    clicks_count integer DEFAULT 0,
    order_index integer DEFAULT 0,
    
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    
    CONSTRAINT reference_library_pkey PRIMARY KEY (id)
);

-- Enable Row Level Security
ALTER TABLE public.reference_library ENABLE ROW LEVEL SECURITY;

-- 1. Read Policy: Allow anyone (guests and students) to read Published or Hidden references
DROP POLICY IF EXISTS "Allow public read for active references" ON public.reference_library;
CREATE POLICY "Allow public read for active references" ON public.reference_library
    FOR SELECT USING (status = 'Published' OR status = 'Hidden');

-- 2. Write Policy: Allow users with administrative roles to manage references (case-insensitive check)
DROP POLICY IF EXISTS "Allow admin write access for references" ON public.reference_library;
CREATE POLICY "Allow admin write access for references" ON public.reference_library
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

-- Create indexes on track_ids, course_ids, and content_ids for fast filtering
CREATE INDEX IF NOT EXISTS idx_ref_library_track_ids ON public.reference_library USING gin(track_ids);
CREATE INDEX IF NOT EXISTS idx_ref_library_course_ids ON public.reference_library USING gin(course_ids);
CREATE INDEX IF NOT EXISTS idx_ref_library_content_ids ON public.reference_library USING gin(content_ids);
CREATE INDEX IF NOT EXISTS idx_ref_library_status ON public.reference_library(status);
CREATE INDEX IF NOT EXISTS idx_ref_library_slug ON public.reference_library(slug);
