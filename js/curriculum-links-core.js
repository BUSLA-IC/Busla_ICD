/**
 * Pure domain logic for unlimited curriculum links (M:N between targets and items).
 * Zero DOM or network dependencies — safe for both browser ESM and node:test.
 *
 * Target types: 'track' | 'phase' | 'course' | 'content'
 * Item types:   'quiz'  | 'project' | 'document'
 */

export const TARGET_TYPES = ['track', 'phase', 'course', 'content'];
export const ITEM_TYPES = ['quiz', 'project', 'document'];

/**
 * Generates a canonical deduplication key for a link record.
 */
export function makeLinkKey(targetType, targetId, itemType, itemId) {
    return `${String(targetType)}::${String(targetId)}::${String(itemType)}::${String(itemId)}`;
}

/**
 * Normalizes a raw link object to a standard shape, or returns null if invalid.
 */
export function normalizeLink(raw) {
    if (!raw) return null;
    const target_type = String(raw.target_type || '').trim().toLowerCase();
    const target_id = raw.target_id !== undefined && raw.target_id !== null ? String(raw.target_id).trim() : '';
    const item_type = String(raw.item_type || '').trim().toLowerCase();
    const item_id = raw.item_id !== undefined && raw.item_id !== null ? String(raw.item_id).trim() : '';

    if (!TARGET_TYPES.includes(target_type) || !target_id || !ITEM_TYPES.includes(item_type) || !item_id) {
        return null;
    }

    return {
        id: raw.id || null,
        target_type,
        target_id,
        item_type,
        item_id,
        order_index: Number.isFinite(Number(raw.order_index)) ? Number(raw.order_index) : 0,
        source: raw.source || 'table',
    };
}

/**
 * Merges links from the `curriculum_links` table with legacy columns on
 * `course_materials` (ref_quiz_id, ref_project_id) and `curriculum_documents`
 * (lesson_id, course_id, phase_id, track_id).
 *
 * When `tableReady` is true, explicit `curriculum_links` records are authoritative
 * for items/targets that exist in the table, while still merging legacy records
 * if a legacy column has a value not yet migrated (unless excluded).
 * Deduplicates strictly by (target_type, target_id, item_type, item_id).
 */
export function mergeCurriculumLinks({
    tableLinks = [],
    materials = [],
    documents = [],
    tableReady = false,
} = {}) {
    const map = new Map();

    // 1. Add explicit curriculum_links first (they hold exact order_index & DB id)
    for (const raw of (tableLinks || [])) {
        const norm = normalizeLink({ ...raw, source: 'table' });
        if (!norm) continue;
        const key = makeLinkKey(norm.target_type, norm.target_id, norm.item_type, norm.item_id);
        map.set(key, norm);
    }

    // 2. Merge legacy course_materials.ref_quiz_id / ref_project_id
    for (const mat of (materials || [])) {
        if (!mat || !mat.content_id) continue;
        const cid = String(mat.content_id).trim();

        if (mat.ref_quiz_id) {
            const qid = String(mat.ref_quiz_id).trim();
            const key = makeLinkKey('content', cid, 'quiz', qid);
            if (!map.has(key)) {
                map.set(key, {
                    id: null,
                    target_type: 'content',
                    target_id: cid,
                    item_type: 'quiz',
                    item_id: qid,
                    order_index: 0,
                    source: 'legacy',
                });
            }
        }

        if (mat.ref_project_id) {
            const pid = String(mat.ref_project_id).trim();
            const key = makeLinkKey('content', cid, 'project', pid);
            if (!map.has(key)) {
                map.set(key, {
                    id: null,
                    target_type: 'content',
                    target_id: cid,
                    item_type: 'project',
                    item_id: pid,
                    order_index: 0,
                    source: 'legacy',
                });
            }
        }
    }

    // 3. Merge legacy curriculum_documents columns (most specific non-empty level)
    for (const doc of (documents || [])) {
        if (!doc || !doc.id) continue;
        const did = String(doc.id).trim();
        let target_type = null;
        let target_id = null;

        if (doc.lesson_id && String(doc.lesson_id).trim()) {
            target_type = 'content';
            target_id = String(doc.lesson_id).trim();
        } else if (doc.course_id && String(doc.course_id).trim()) {
            target_type = 'course';
            target_id = String(doc.course_id).trim();
        } else if (doc.phase_id && String(doc.phase_id).trim()) {
            target_type = 'phase';
            target_id = String(doc.phase_id).trim();
        } else if (doc.track_id && String(doc.track_id).trim()) {
            target_type = 'track';
            target_id = String(doc.track_id).trim();
        }

        if (target_type && target_id) {
            const key = makeLinkKey(target_type, target_id, 'document', did);
            if (!map.has(key)) {
                map.set(key, {
                    id: null,
                    target_type,
                    target_id,
                    item_type: 'document',
                    item_id: did,
                    order_index: Number.isFinite(Number(doc.order_index)) ? Number(doc.order_index) : 0,
                    source: 'legacy',
                });
            }
        }
    }

    // Sort deterministically by order_index, then item_id
    return Array.from(map.values()).sort((a, b) => {
        if (a.order_index !== b.order_index) return a.order_index - b.order_index;
        return String(a.item_id).localeCompare(String(b.item_id));
    });
}

/**
 * Returns all attachments grouped by item_type for a given target (e.g., course or content).
 */
export function getAttachmentsForTarget(links, targetType, targetId) {
    const tType = String(targetType);
    const tId = String(targetId);

    const matching = (links || [])
        .filter(l => String(l.target_type) === tType && String(l.target_id) === tId)
        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    return {
        quizzes: matching.filter(l => l.item_type === 'quiz').map(l => l.item_id),
        projects: matching.filter(l => l.item_type === 'project').map(l => l.item_id),
        documents: matching.filter(l => l.item_type === 'document').map(l => l.item_id),
        links: matching,
    };
}

/**
 * Returns counts of attached quizzes, projects, and documents for a target.
 */
export function getAttachmentCountsForTarget(links, targetType, targetId) {
    const att = getAttachmentsForTarget(links, targetType, targetId);
    return {
        quizzes: att.quizzes.length,
        projects: att.projects.length,
        documents: att.documents.length,
        total: att.quizzes.length + att.projects.length + att.documents.length,
    };
}

/**
 * Returns all targets linked to a specific item (quiz, project, or document).
 */
export function getTargetsForItem(links, itemType, itemId) {
    const iType = String(itemType);
    const iId = String(itemId);

    return (links || [])
        .filter(l => String(l.item_type) === iType && String(l.item_id) === iId)
        .map(l => ({
            target_type: l.target_type,
            target_id: l.target_id,
            order_index: l.order_index || 0,
        }));
}

/**
 * Deduplicates an ordered list of item IDs while preserving order.
 */
export function uniqueIds(ids = []) {
    const seen = new Set();
    const out = [];
    for (const raw of (ids || [])) {
        if (raw === null || raw === undefined) continue;
        const val = String(raw).trim();
        if (!val || seen.has(val)) continue;
        seen.add(val);
        out.push(val);
    }
    return out;
}

/**
 * Deduplicates a list of targets ({ target_type, target_id }) while preserving order.
 */
export function uniqueTargets(targets = []) {
    const seen = new Set();
    const out = [];
    for (const t of (targets || [])) {
        if (!t) continue;
        const target_type = String(t.target_type || '').trim().toLowerCase();
        const target_id = t.target_id !== undefined && t.target_id !== null ? String(t.target_id).trim() : '';
        if (!TARGET_TYPES.includes(target_type) || !target_id) continue;
        const key = `${target_type}::${target_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ target_type, target_id });
    }
    return out;
}

/**
 * Computes the DB rows to insert/upsert/delete when syncing all attachments for a single target.
 */
export function buildTargetSyncPlan(existingTableLinks, targetType, targetId, desiredByType) {
    const tType = String(targetType);
    const tId = String(targetId);

    const desiredRows = [];
    const desiredKeys = new Set();

    const groups = [
        ['quiz', uniqueIds(desiredByType?.quizIds || [])],
        ['project', uniqueIds(desiredByType?.projectIds || [])],
        ['document', uniqueIds(desiredByType?.docIds || [])],
    ];

    for (const [itemType, ids] of groups) {
        ids.forEach((itemId, idx) => {
            const key = makeLinkKey(tType, tId, itemType, itemId);
            desiredKeys.add(key);
            desiredRows.push({
                target_type: tType,
                target_id: tId,
                item_type: itemType,
                item_id: itemId,
                order_index: idx,
            });
        });
    }

    const currentForTarget = (existingTableLinks || []).filter(
        l => String(l.target_type) === tType && String(l.target_id) === tId
    );

    const toDelete = currentForTarget.filter(
        l => !desiredKeys.has(makeLinkKey(l.target_type, l.target_id, l.item_type, l.item_id))
    );

    return {
        toUpsert: desiredRows,
        toDelete,
    };
}

/**
 * Computes the DB rows to upsert/delete when syncing all targets for a single item (quiz/project/document).
 */
export function buildItemTargetsSyncPlan(existingTableLinks, itemType, itemId, desiredTargets) {
    const iType = String(itemType);
    const iId = String(itemId);
    const cleanTargets = uniqueTargets(desiredTargets);

    const currentForItem = (existingTableLinks || []).filter(
        l => String(l.item_type) === iType && String(l.item_id) === iId
    );

    const existingOrderByKey = new Map();
    for (const l of currentForItem) {
        existingOrderByKey.set(`${l.target_type}::${l.target_id}`, l.order_index || 0);
    }

    const desiredKeys = new Set();
    const toUpsert = cleanTargets.map((t) => {
        const tKey = `${t.target_type}::${t.target_id}`;
        desiredKeys.add(makeLinkKey(t.target_type, t.target_id, iType, iId));

        // Preserve existing order_index if already linked; otherwise append at the end of that target's list
        let orderIndex = existingOrderByKey.get(tKey);
        if (orderIndex === undefined) {
            const siblings = (existingTableLinks || []).filter(
                l => String(l.target_type) === t.target_type &&
                    String(l.target_id) === t.target_id &&
                    String(l.item_type) === iType
            );
            const maxOrder = siblings.reduce((acc, s) => Math.max(acc, Number(s.order_index) || 0), -1);
            orderIndex = maxOrder + 1;
        }

        return {
            target_type: t.target_type,
            target_id: t.target_id,
            item_type: iType,
            item_id: iId,
            order_index: orderIndex,
        };
    });

    const toDelete = currentForItem.filter(
        l => !desiredKeys.has(makeLinkKey(l.target_type, l.target_id, l.item_type, l.item_id))
    );

    return {
        toUpsert,
        toDelete,
    };
}

/**
 * Resolves the full hierarchy ancestor IDs (trackId, phaseId, courseId, contentId)
 * for any single link target ({ target_type, target_id }) using hierarchy cache data.
 */
export function resolveTargetAncestors(target, hData) {
    if (!target || !hData) return { trackId: null, phaseId: null, courseId: null, contentId: null };
    const { target_type, target_id } = target;
    let trackId = null;
    let phaseId = null;
    let courseId = null;
    let contentId = null;

    if (target_type === 'track') {
        trackId = target_id;
    } else if (target_type === 'phase') {
        phaseId = target_id;
        const p = (hData.phases || []).find(x => String(x.phase_id) === String(phaseId));
        trackId = p?.track_id || null;
    } else if (target_type === 'course') {
        courseId = target_id;
        const c = (hData.courses || []).find(x => String(x.course_id) === String(courseId));
        phaseId = c?.phase_id || null;
        const p = (hData.phases || []).find(x => String(x.phase_id) === String(phaseId));
        trackId = p?.track_id || null;
    } else if (target_type === 'content') {
        contentId = target_id;
        const m = (hData.contents || []).find(x => String(x.content_id) === String(contentId));
        courseId = m?.course_id || null;
        const c = (hData.courses || []).find(x => String(x.course_id) === String(courseId));
        phaseId = c?.phase_id || null;
        const p = (hData.phases || []).find(x => String(x.phase_id) === String(phaseId));
        trackId = p?.track_id || null;
    }

    return { trackId, phaseId, courseId, contentId };
}

/**
 * Checks whether a quiz, project, document, or quiz_question matches active
 * hierarchical filter dropdowns across ALL of its linked targets.
 */
export function itemMatchesHierarchicalFilters(itemType, itemId, filters, hData, allLinks) {
    const { trackVal = 'all', phaseVal = 'all', courseVal = 'all', contentVal = 'all' } = filters || {};
    const hasFilter = trackVal !== 'all' || phaseVal !== 'all' || courseVal !== 'all' || contentVal !== 'all';
    if (!hasFilter) return true;

    const targets = getTargetsForItem(allLinks, itemType, itemId);
    if (targets.length === 0) return false;

    return targets.some(t => {
        const anc = resolveTargetAncestors(t, hData);
        if (trackVal !== 'all' && String(anc.trackId) !== String(trackVal)) return false;
        if (phaseVal !== 'all' && String(anc.phaseId) !== String(phaseVal)) return false;
        if (courseVal !== 'all' && String(anc.courseId) !== String(courseVal)) return false;
        if (contentVal !== 'all' && String(anc.contentId) !== String(contentVal)) return false;
        return true;
    });
}

/**
 * Builds the flat, ordered playable items structure for a Course Player given:
 * - `materials`: course_materials rows ordered by order_index
 * - `courseId`: string course_id
 * - `mergedLinks`: normalized merged curriculum links
 * - `lookups`: { quizzes: { [id]: quizObj }, projects: { [id]: projObj }, documents: { [id]: docObj } }
 *
 * Returns:
 * - `playlist`: ordered list of playable entries (sections, videos, lesson attachments, course-level attachments)
 * - `lessonAttachmentsMap`: map of content_id -> { quizzes: [...items], projects: [...items], documents: [...items] }
 * - `courseAttachments`: { quizzes: [...items], projects: [...items], documents: [...items] }
 */
export function buildCoursePlayerStructure({
    courseId,
    materials = [],
    mergedLinks = [],
    quizzesLookup = {},
    projectsLookup = {},
    documentsLookup = {},
} = {}) {
    const lessonAttachmentsMap = {};
    const flatPlayable = [];

    const makeQuizItem = (parentKey, quizId, parentMaterial = null) => {
        const q = quizzesLookup[quizId] || {};
        return {
            content_id: `${parentKey}_quiz_${quizId}`,
            legacy_content_id: parentMaterial ? `${parentMaterial.content_id}_quiz` : null,
            ref_quiz_id: quizId,
            parent_content_id: parentMaterial ? parentMaterial.content_id : null,
            is_course_level: !parentMaterial,
            course_id: courseId || null,
            title: 'اختبار: ' + (q.title || 'تقييم الدرس'),
            raw_title: q.title || 'تقييم الدرس',
            type: 'quiz',
            base_xp: q.max_xp || 0,
            Author: parentMaterial?.Author || null,
        };
    };

    const makeProjectItem = (parentKey, projectId, parentMaterial = null) => {
        const p = projectsLookup[projectId] || {};
        return {
            content_id: `${parentKey}_project_${projectId}`,
            legacy_content_id: parentMaterial ? `${parentMaterial.content_id}_project` : null,
            ref_project_id: projectId,
            parent_content_id: parentMaterial ? parentMaterial.content_id : null,
            is_course_level: !parentMaterial,
            course_id: courseId || null,
            title: 'مشروع: ' + (p.title || 'تطبيق عملي'),
            raw_title: p.title || 'تطبيق عملي',
            type: 'project',
            base_xp: p.max_points || 0,
            Author: parentMaterial?.Author || null,
        };
    };

    const makeDocItem = (docId, parentMaterial = null) => {
        const d = documentsLookup[docId];
        if (!d) return null;
        return {
            content_id: `doc_${d.id}`,
            unique_playlist_id: parentMaterial ? `doc_${d.id}_on_${parentMaterial.content_id}` : `doc_${d.id}`,
            parent_content_id: parentMaterial ? parentMaterial.content_id : null,
            is_course_level: !parentMaterial,
            course_id: courseId || d.course_id || null,
            title: d.title,
            type: 'document',
            order_index: d.order_index || 0,
            base_xp: d.xp_reward || 0,
            rawDoc: d,
        };
    };

    // Standalone material rows that are themselves type==='quiz' or type==='project'
    const standaloneQuizIds = new Set();
    const standaloneProjectIds = new Set();

    const orderedMaterials = [...(materials || [])].sort(
        (a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0)
    );

    for (const mat of orderedMaterials) {
        if (mat.type === 'quiz' && mat.ref_quiz_id) standaloneQuizIds.add(String(mat.ref_quiz_id));
        if (mat.type === 'project' && mat.ref_project_id) standaloneProjectIds.add(String(mat.ref_project_id));
    }

    for (const mat of orderedMaterials) {
        flatPlayable.push(mat);

        // If the material itself is a standalone quiz/project row, don't duplicate its own ref_quiz_id/ref_project_id as a child
        const att = getAttachmentsForTarget(mergedLinks, 'content', mat.content_id);

        const childQuizzes = att.quizzes
            .filter(qId => !(mat.type === 'quiz' && String(mat.ref_quiz_id) === String(qId)))
            .map(qId => makeQuizItem(mat.content_id, qId, mat));

        const childProjects = att.projects
            .filter(pId => !(mat.type === 'project' && String(mat.ref_project_id) === String(pId)))
            .map(pId => makeProjectItem(mat.content_id, pId, mat));

        const childDocuments = att.documents
            .map(dId => makeDocItem(dId, mat))
            .filter(Boolean);

        lessonAttachmentsMap[mat.content_id] = {
            quizzes: childQuizzes,
            projects: childProjects,
            documents: childDocuments,
        };

        // Order right under the lesson: Documents -> Quizzes -> Projects (or keep deterministic sequence)
        for (const docItem of childDocuments) flatPlayable.push(docItem);
        for (const quizItem of childQuizzes) flatPlayable.push(quizItem);
        for (const projItem of childProjects) flatPlayable.push(projItem);
    }

    // Course-level attachments (attached directly to the Course itself!)
    const courseAttRaw = courseId
        ? getAttachmentsForTarget(mergedLinks, 'course', courseId)
        : { quizzes: [], projects: [], documents: [] };

    const courseQuizzes = courseAttRaw.quizzes
        .filter(qId => !standaloneQuizIds.has(String(qId)))
        .map(qId => makeQuizItem(`course_${courseId}`, qId, null));

    const courseProjects = courseAttRaw.projects
        .filter(pId => !standaloneProjectIds.has(String(pId)))
        .map(pId => makeProjectItem(`course_${courseId}`, pId, null));

    const courseDocuments = courseAttRaw.documents
        .map(dId => makeDocItem(dId, null))
        .filter(Boolean);

    const courseAttachments = {
        quizzes: courseQuizzes,
        projects: courseProjects,
        documents: courseDocuments,
    };

    for (const docItem of courseDocuments) flatPlayable.push(docItem);
    for (const quizItem of courseQuizzes) flatPlayable.push(quizItem);
    for (const projItem of courseProjects) flatPlayable.push(projItem);

    return {
        orderedMaterials,
        lessonAttachmentsMap,
        courseAttachments,
        flatPlayable,
    };
}

/**
 * Resolves a URL `?content=...` parameter against the built flatPlayable list,
 * supporting new unique IDs (`cnt_1_quiz_<uuid>`, `course_cr1_project_<uuid>`)
 * as well as legacy IDs (`cnt_1_quiz`, `cnt_1_project`, raw quiz/project UUID, `doc_<uuid>`).
 */
export function resolveTargetPlayableItem(flatPlayable, targetContentId) {
    if (!targetContentId || !Array.isArray(flatPlayable) || flatPlayable.length === 0) return null;
    const tid = String(targetContentId);

    // 1. Exact content_id or unique_playlist_id match
    let found = flatPlayable.find(
        item => String(item.content_id) === tid || (item.unique_playlist_id && String(item.unique_playlist_id) === tid)
    );
    if (found) return found;

    // 2. Legacy content_id match (e.g. cnt_123_quiz or cnt_123_project)
    found = flatPlayable.find(item => item.legacy_content_id && String(item.legacy_content_id) === tid);
    if (found) return found;

    // 3. Direct quiz_id or project_id match
    found = flatPlayable.find(
        item => (item.type === 'quiz' && String(item.ref_quiz_id) === tid) ||
                (item.type === 'project' && String(item.ref_project_id) === tid)
    );
    if (found) return found;

    return null;
}
