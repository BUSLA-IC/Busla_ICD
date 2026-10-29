-- BUSLA ICD - Expert Advice & Insights Management Table Schema
-- Run this script in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.expert_advices (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title text NOT NULL,                                -- عنوان النصيحة
    summary text,                                       -- ملخص النصيحة للكارت الخارجي
    content text NOT NULL,                              -- محتوى النصيحة الكامل المنسق
    source text NOT NULL DEFAULT 'Multiple Experts',   -- المصدر أو المتحدث
    author_name text,                                   -- اسم المهندس / الدكتور المرجع
    category text NOT NULL DEFAULT 'General',           -- التصنيف (General, GP, Verification, RTL, FPGA, Career...)
    tags text[] DEFAULT '{}'::text[],                   -- الوسوم (مثل: #General, #Career, #GP...)
    difficulty text DEFAULT 'beginner',                 -- مستوى الصعوبة: beginner, intermediate, advanced
    priority text DEFAULT 'high',                       -- الأولوية: high, medium, low
    order_index integer DEFAULT 0,                      -- ترتيب العرض
    is_published boolean DEFAULT true,                  -- حالة النشر (true = منشورة للطلاب، false = مسودة)
    
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    
    CONSTRAINT expert_advices_pkey PRIMARY KEY (id)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.expert_advices ENABLE ROW LEVEL SECURITY;

-- 1. Read Policy: Allow everyone (guests and students) to read published advices
DROP POLICY IF EXISTS "Allow public read for published expert_advices" ON public.expert_advices;
CREATE POLICY "Allow public read for published expert_advices" ON public.expert_advices
    FOR SELECT USING (is_published = true);

-- 2. Admin Policy: Allow administrators full access to CRUD
DROP POLICY IF EXISTS "Allow admin write access for expert_advices" ON public.expert_advices;
CREATE POLICY "Allow admin write access for expert_advices" ON public.expert_advices
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

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_expert_advices_published ON public.expert_advices(is_published);
CREATE INDEX IF NOT EXISTS idx_expert_advices_order ON public.expert_advices(order_index);
CREATE INDEX IF NOT EXISTS idx_expert_advices_category ON public.expert_advices(category);
CREATE INDEX IF NOT EXISTS idx_expert_advices_tags ON public.expert_advices USING gin(tags);
