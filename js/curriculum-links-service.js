/**
 * Supabase adapter for unlimited curriculum links (`public.curriculum_links`).
 *
 * - Reads & writes unlimited M:N links between targets (course, content, phase, track)
 *   and items (quiz, project, document).
 * - Automatically dual-syncs legacy columns (`course_materials.ref_quiz_id`,
 *   `course_materials.ref_project_id`, `curriculum_documents.lesson_id / course_id / phase_id / track_id`)
 *   for 100% backward compatibility with existing views.
 * - Gracefully handles environments where `public.curriculum_links` has not been
 *   created yet (PGRST205 / 42P01), never crashing the app and exposing a clear
 *   `tableReady: false` flag so the Admin UI can offer one-click SQL copy.
 */

import {
    mergeCurriculumLinks,
    uniqueIds,
    uniqueTargets,
    buildTargetSyncPlan,
    buildItemTargetsSyncPlan,
} from './curriculum-links-core.js';

export const CURRICULUM_LINKS_SQL = `-- Run in Supabase SQL Editor (docs/create_curriculum_links.sql)
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

CREATE INDEX IF NOT EXISTS idx_curriculum_links_target ON public.curriculum_links (target_type, target_id, order_index);
CREATE INDEX IF NOT EXISTS idx_curriculum_links_item ON public.curriculum_links (item_type, item_id);

ALTER TABLE public.curriculum_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read for curriculum links" ON public.curriculum_links;
CREATE POLICY "Allow public read for curriculum links" ON public.curriculum_links FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow admin write access for curriculum links" ON public.curriculum_links;
CREATE POLICY "Allow admin write access for curriculum links" ON public.curriculum_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND LOWER(profiles.role) IN ('owner', 'admin', 'master admin', 'content manager', 'leader supervisor', 'project reviewer')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND LOWER(profiles.role) IN ('owner', 'admin', 'master admin', 'content manager', 'leader supervisor', 'project reviewer')
        )
    );

INSERT INTO public.curriculum_links (target_type, target_id, item_type, item_id, order_index)
SELECT 'content', content_id, 'quiz', ref_quiz_id, 0 FROM public.course_materials WHERE ref_quiz_id IS NOT NULL
ON CONFLICT (target_type, target_id, item_type, item_id) DO NOTHING;

INSERT INTO public.curriculum_links (target_type, target_id, item_type, item_id, order_index)
SELECT 'content', content_id, 'project', ref_project_id, 0 FROM public.course_materials WHERE ref_project_id IS NOT NULL
ON CONFLICT (target_type, target_id, item_type, item_id) DO NOTHING;

INSERT INTO public.curriculum_links (target_type, target_id, item_type, item_id, order_index)
SELECT
    CASE
        WHEN lesson_id IS NOT NULL AND TRIM(lesson_id) <> '' THEN 'content'
        WHEN course_id IS NOT NULL AND TRIM(course_id) <> '' THEN 'course'
        WHEN phase_id IS NOT NULL AND TRIM(phase_id) <> '' THEN 'phase'
        WHEN track_id IS NOT NULL THEN 'track'
    END,
    CASE
        WHEN lesson_id IS NOT NULL AND TRIM(lesson_id) <> '' THEN lesson_id
        WHEN course_id IS NOT NULL AND TRIM(course_id) <> '' THEN course_id
        WHEN phase_id IS NOT NULL AND TRIM(phase_id) <> '' THEN phase_id
        WHEN track_id IS NOT NULL THEN track_id::text
    END,
    'document', id, COALESCE(order_index, 0)
FROM public.curriculum_documents
WHERE (lesson_id IS NOT NULL AND TRIM(lesson_id) <> '')
   OR (course_id IS NOT NULL AND TRIM(course_id) <> '')
   OR (phase_id IS NOT NULL AND TRIM(phase_id) <> '')
   OR (track_id IS NOT NULL)
ON CONFLICT (target_type, target_id, item_type, item_id) DO NOTHING;`;

export function isMissingTableError(error) {
    if (!error) return false;
    const code = String(error.code || '');
    const msg = String(error.message || '').toLowerCase();
    return (
        code === 'PGRST205' ||
        code === '42P01' ||
        msg.includes('could not find the table') ||
        (msg.includes('curriculum_links') && msg.includes('does not exist'))
    );
}

/**
 * Fetches all rows from `curriculum_links`. Never throws if the table is missing.
 */
export async function fetchAllCurriculumLinks(supabase) {
    try {
        const { data, error } = await supabase
            .from('curriculum_links')
            .select('*')
            .order('order_index', { ascending: true });

        if (error) {
            if (isMissingTableError(error)) {
                return { tableLinks: [], tableReady: false };
            }
            console.warn('curriculum_links fetch warning:', error.message);
            return { tableLinks: [], tableReady: false };
        }
        return { tableLinks: data || [], tableReady: true };
    } catch (err) {
        console.warn('curriculum_links fetch exception:', err?.message || err);
        return { tableLinks: [], tableReady: false };
    }
}

/**
 * Fetches `curriculum_links` scoped to a course and its material content IDs.
 */
export async function fetchCourseCurriculumLinks(supabase, courseId, contentIds = []) {
    try {
        const queries = [];
        if (courseId) {
            queries.push(
                supabase
                    .from('curriculum_links')
                    .select('*')
                    .eq('target_type', 'course')
                    .eq('target_id', String(courseId))
                    .order('order_index', { ascending: true })
            );
        }
        if (contentIds && contentIds.length > 0) {
            queries.push(
                supabase
                    .from('curriculum_links')
                    .select('*')
                    .eq('target_type', 'content')
                    .in('target_id', contentIds.map(String))
                    .order('order_index', { ascending: true })
            );
        }

        if (queries.length === 0) return { tableLinks: [], tableReady: true };

        const results = await Promise.all(queries);
        for (const res of results) {
            if (res.error) {
                if (isMissingTableError(res.error)) {
                    return { tableLinks: [], tableReady: false };
                }
                console.warn('fetchCourseCurriculumLinks warning:', res.error.message);
                return { tableLinks: [], tableReady: false };
            }
        }

        const combined = results.flatMap(r => r.data || []);
        return { tableLinks: combined, tableReady: true };
    } catch (err) {
        console.warn('fetchCourseCurriculumLinks exception:', err?.message || err);
        return { tableLinks: [], tableReady: false };
    }
}

/**
 * Computes legacy fields for a document based on its first target (so single-column queries still work).
 */
function buildLegacyDocColumnsFromTarget(target, hData) {
    const empty = { track_id: null, phase_id: null, course_id: null, lesson_id: null };
    if (!target) return empty;

    const { target_type, target_id } = target;
    if (target_type === 'track') {
        return { ...empty, track_id: target_id };
    }
    if (target_type === 'phase') {
        const p = (hData?.phases || []).find(x => String(x.phase_id) === String(target_id));
        return { ...empty, track_id: p?.track_id || null, phase_id: target_id };
    }
    if (target_type === 'course') {
        const c = (hData?.courses || []).find(x => String(x.course_id) === String(target_id));
        const p = (hData?.phases || []).find(x => String(x.phase_id) === String(c?.phase_id));
        return { ...empty, track_id: p?.track_id || null, phase_id: c?.phase_id || null, course_id: target_id };
    }
    if (target_type === 'content') {
        const m = (hData?.contents || []).find(x => String(x.content_id) === String(target_id));
        const c = (hData?.courses || []).find(x => String(x.course_id) === String(m?.course_id));
        const p = (hData?.phases || []).find(x => String(x.phase_id) === String(c?.phase_id));
        return {
            track_id: p?.track_id || null,
            phase_id: c?.phase_id || null,
            course_id: m?.course_id || null,
            lesson_id: target_id,
        };
    }
    return empty;
}

/**
 * Syncs ALL attachments (quizzes, projects, documents) for a specific target (Course or Content).
 * - Writes all links into `curriculum_links` when available.
 * - Dual-syncs `course_materials.ref_quiz_id` / `ref_project_id` and `curriculum_documents` legacy columns.
 * Returns `{ tableReady, needsMigrationForExtraLinks }`.
 */
export async function syncTargetAttachments(supabase, targetType, targetId, { quizIds = [], projectIds = [], docIds = [] }, hData = null) {
    const cleanQuizIds = uniqueIds(quizIds);
    const cleanProjectIds = uniqueIds(projectIds);
    const cleanDocIds = uniqueIds(docIds);

    const { tableLinks, tableReady } = await fetchAllCurriculumLinks(supabase);

    let needsMigrationForExtraLinks = false;

    if (tableReady) {
        const { toUpsert, toDelete } = buildTargetSyncPlan(tableLinks, targetType, targetId, {
            quizIds: cleanQuizIds,
            projectIds: cleanProjectIds,
            docIds: cleanDocIds,
        });

        for (const del of toDelete) {
            if (del.id) {
                await supabase.from('curriculum_links').delete().eq('id', del.id);
            } else {
                await supabase
                    .from('curriculum_links')
                    .delete()
                    .eq('target_type', del.target_type)
                    .eq('target_id', del.target_id)
                    .eq('item_type', del.item_type)
                    .eq('item_id', del.item_id);
            }
        }

        if (toUpsert.length > 0) {
            const { error: upsertErr } = await supabase
                .from('curriculum_links')
                .upsert(toUpsert, { onConflict: 'target_type,target_id,item_type,item_id' });
            if (upsertErr) throw upsertErr;
        }
    } else {
        // Table not yet created in Supabase: detect if the user attempted multi-quiz, multi-project, or course-level quiz/project
        if (
            (targetType === 'content' && (cleanQuizIds.length > 1 || cleanProjectIds.length > 1)) ||
            (targetType === 'course' && (cleanQuizIds.length > 0 || cleanProjectIds.length > 0))
        ) {
            needsMigrationForExtraLinks = true;
        }
    }

    // Dual-sync legacy course_materials columns (first quiz & first project)
    if (targetType === 'content') {
        await supabase
            .from('course_materials')
            .update({
                ref_quiz_id: cleanQuizIds[0] || null,
                ref_project_id: cleanProjectIds[0] || null,
            })
            .eq('content_id', targetId);
    }

    // Dual-sync legacy curriculum_documents columns so docs linked to this target also appear in legacy queries
    // 1. Documents currently pointing to this target in legacy columns that were REMOVED -> clear legacy pointer
    const legacyDocsCurrentlyPointingHere = (hData?.documents || []).filter(d => {
        if (targetType === 'content') return String(d.lesson_id || '') === String(targetId);
        if (targetType === 'course') return !d.lesson_id && String(d.course_id || '') === String(targetId);
        return false;
    });

    for (const d of legacyDocsCurrentlyPointingHere) {
        if (!cleanDocIds.includes(String(d.id))) {
            // Only clear if not linked elsewhere in curriculum_links (or repoint to first remaining target)
            const clearPayload = targetType === 'content'
                ? { lesson_id: null }
                : { course_id: null };
            await supabase.from('curriculum_documents').update(clearPayload).eq('id', d.id);
        }
    }

    // 2. Documents newly added to this target -> set legacy columns if they had no legacy link (or when table not ready)
    const legacyTargetCols = buildLegacyDocColumnsFromTarget({ target_type: targetType, target_id: targetId }, hData);
    for (let idx = 0; idx < cleanDocIds.length; idx++) {
        const dId = cleanDocIds[idx];
        const existingDoc = (hData?.documents || []).find(d => String(d.id) === String(dId));
        const hasNoLegacyTarget = !existingDoc || (!existingDoc.lesson_id && !existingDoc.course_id && !existingDoc.phase_id && !existingDoc.track_id);
        const alreadyPointsHere = existingDoc && (
            (targetType === 'content' && String(existingDoc.lesson_id) === String(targetId)) ||
            (targetType === 'course' && !existingDoc.lesson_id && String(existingDoc.course_id) === String(targetId))
        );

        if (!tableReady || hasNoLegacyTarget || alreadyPointsHere) {
            await supabase
                .from('curriculum_documents')
                .update({ ...legacyTargetCols, order_index: idx })
                .eq('id', dId);
        }
    }

    return { tableReady, needsMigrationForExtraLinks };
}

/**
 * Syncs ALL targets (Courses, Contents, Phases, Tracks) for a single Quiz, Project, or Document.
 * NEVER overwrites sibling quizzes/projects/documents on those targets!
 */
export async function syncItemTargets(supabase, itemType, itemId, targets = [], hData = null) {
    const cleanTargets = uniqueTargets(targets);
    const { tableLinks, tableReady } = await fetchAllCurriculumLinks(supabase);

    let needsMigrationForExtraLinks = false;

    if (tableReady) {
        const { toUpsert, toDelete } = buildItemTargetsSyncPlan(tableLinks, itemType, itemId, cleanTargets);

        for (const del of toDelete) {
            if (del.id) {
                await supabase.from('curriculum_links').delete().eq('id', del.id);
            } else {
                await supabase
                    .from('curriculum_links')
                    .delete()
                    .eq('target_type', del.target_type)
                    .eq('target_id', del.target_id)
                    .eq('item_type', del.item_type)
                    .eq('item_id', del.item_id);
            }
        }

        if (toUpsert.length > 0) {
            const { error: upsertErr } = await supabase
                .from('curriculum_links')
                .upsert(toUpsert, { onConflict: 'target_type,target_id,item_type,item_id' });
            if (upsertErr) throw upsertErr;
        }
    } else {
        if (
            cleanTargets.length > 1 ||
            ((itemType === 'quiz' || itemType === 'project') && cleanTargets.some(t => t.target_type !== 'content'))
        ) {
            needsMigrationForExtraLinks = true;
        }
    }

    // Dual-sync legacy columns without clobbering sibling quizzes/projects when tableReady is true
    if (itemType === 'quiz' || itemType === 'project') {
        const col = itemType === 'quiz' ? 'ref_quiz_id' : 'ref_project_id';
        const contentTargetIds = cleanTargets.filter(t => t.target_type === 'content').map(t => t.target_id);

        // Clear legacy column on contents that were UNLINKED from this item
        const prevLegacyContents = (hData?.contents || []).filter(c => String(c[col]) === String(itemId));
        for (const c of prevLegacyContents) {
            if (!contentTargetIds.includes(String(c.content_id))) {
                // Find another remaining quiz/project on that content if any
                const remainingSibling = tableLinks.find(
                    l => l.target_type === 'content' &&
                        String(l.target_id) === String(c.content_id) &&
                        l.item_type === itemType &&
                        String(l.item_id) !== String(itemId)
                );
                await supabase
                    .from('course_materials')
                    .update({ [col]: remainingSibling ? remainingSibling.item_id : null })
                    .eq('content_id', c.content_id);
            }
        }

        // For newly linked contents: populate legacy column ONLY if currently empty (or if table not ready and single target)
        for (const cid of contentTargetIds) {
            const mat = (hData?.contents || []).find(c => String(c.content_id) === String(cid));
            if (!mat || !mat[col]) {
                await supabase.from('course_materials').update({ [col]: itemId }).eq('content_id', cid);
            } else if (!tableReady && String(mat[col]) !== String(itemId)) {
                needsMigrationForExtraLinks = true;
            }
        }
    } else if (itemType === 'document') {
        const primaryTarget = cleanTargets[0] || null;
        const legacyCols = buildLegacyDocColumnsFromTarget(primaryTarget, hData);
        await supabase.from('curriculum_documents').update(legacyCols).eq('id', itemId);
    }

    return { tableReady, needsMigrationForExtraLinks };
}

/**
 * Appends new target links for a newly created Quiz or Project (e.g., from AI Importers)
 * WITHOUT overwriting existing quizzes/projects already attached to those targets!
 */
export async function appendItemTargets(supabase, itemType, itemId, targets = [], hData = null) {
    const cleanTargets = uniqueTargets(targets);
    if (cleanTargets.length === 0) return { tableReady: true, needsMigrationForExtraLinks: false };

    const { tableLinks, tableReady } = await fetchAllCurriculumLinks(supabase);
    let needsMigrationForExtraLinks = false;

    if (tableReady) {
        const { toUpsert } = buildItemTargetsSyncPlan(tableLinks, itemType, itemId, cleanTargets);
        if (toUpsert.length > 0) {
            const { error } = await supabase
                .from('curriculum_links')
                .upsert(toUpsert, { onConflict: 'target_type,target_id,item_type,item_id' });
            if (error) throw error;
        }
    } else {
        needsMigrationForExtraLinks = cleanTargets.length > 1 || cleanTargets.some(t => t.target_type !== 'content');
    }

    if (itemType === 'quiz' || itemType === 'project') {
        const col = itemType === 'quiz' ? 'ref_quiz_id' : 'ref_project_id';
        for (const t of cleanTargets.filter(x => x.target_type === 'content')) {
            const mat = (hData?.contents || []).find(c => String(c.content_id) === String(t.target_id));
            if (!mat || !mat[col]) {
                await supabase.from('course_materials').update({ [col]: itemId }).eq('content_id', t.target_id);
            } else if (!tableReady) {
                needsMigrationForExtraLinks = true;
            }
        }
    }

    return { tableReady, needsMigrationForExtraLinks };
}

/**
 * Cleans up curriculum_links when deleting a target (course, content, phase, track).
 */
export async function deleteLinksForTarget(supabase, targetType, targetId) {
    try {
        await supabase
            .from('curriculum_links')
            .delete()
            .eq('target_type', targetType)
            .eq('target_id', String(targetId));
    } catch (_) {}
}

/**
 * Cleans up curriculum_links when deleting an item (quiz, project, document).
 */
export async function deleteLinksForItem(supabase, itemType, itemId) {
    try {
        await supabase
            .from('curriculum_links')
            .delete()
            .eq('item_type', itemType)
            .eq('item_id', String(itemId));
    } catch (_) {}
}

export { mergeCurriculumLinks };
