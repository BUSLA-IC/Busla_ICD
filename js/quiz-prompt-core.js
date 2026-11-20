/**
 * Pure helper utilities for:
 * 1. Building AI Quiz Importer prompts (question count + multi-content direct links)
 * 2. Building AI Project Importer prompts (rubric count, XP, submission method, multi-content direct links, extra starter links)
 * 3. Parsing & serializing multiple project links backward-compatibly in `projects.requirements_url`
 */

export function normalizeQuestionCount(value, fallback = 10) {
    const parsed = parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(100, Math.max(1, parsed));
}

export function normalizeBoundedInt(value, { min = 1, max = 1000, fallback = 10 } = {}) {
    const parsed = parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed) || parsed < min) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

export function resolveVideoUrl(videoIdOrUrl) {
    const raw = String(videoIdOrUrl ?? '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://www.youtube.com/watch?v=${raw}`;
}

export function resolveDocumentUrl(sourceUrl, sourceType = '') {
    const raw = String(sourceUrl ?? '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    const typeLower = String(sourceType ?? '').toLowerCase();
    if (typeLower.includes('drive')) {
        return `https://drive.google.com/file/d/${raw}/view`;
    }
    return raw;
}

/**
 * Parses `projects.requirements_url` (or an AI JSON array/field) into a normalized array of `{ title, url }`.
 * Backward-compatible with legacy single URL strings, newline-separated URLs, and JSON arrays.
 */
export function parseProjectLinks(rawValue) {
    if (!rawValue) return [];

    const normalizeEntry = (entry, idx) => {
        if (!entry) return null;
        if (typeof entry === 'string') {
            const url = entry.trim();
            if (!url) return null;
            return { title: idx === 0 ? 'Project Guide & Attachments' : `Attached Link ${idx + 1}`, url };
        }
        if (typeof entry === 'object') {
            const url = String(entry.url || entry.href || entry.link || '').trim();
            if (!url) return null;
            const title = String(entry.title || entry.label || entry.name || '').trim() || `Attached Link ${idx + 1}`;
            return { title, url };
        }
        return null;
    };

    if (Array.isArray(rawValue)) {
        return rawValue.map(normalizeEntry).filter(Boolean);
    }

    const str = String(rawValue).trim();
    if (!str) return [];

    if (str.startsWith('[') || str.startsWith('{')) {
        try {
            const parsed = JSON.parse(str);
            if (Array.isArray(parsed)) {
                return parsed.map(normalizeEntry).filter(Boolean);
            }
            if (parsed && typeof parsed === 'object') {
                const single = normalizeEntry(parsed, 0);
                return single ? [single] : [];
            }
        } catch (_) {
            // Fall through to plain string parsing
        }
    }

    const lines = str.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (lines.length > 1) {
        return lines.map((line, idx) => normalizeEntry(line, idx)).filter(Boolean);
    }

    return [{ title: 'Project Guide & Attachments', url: str }];
}

/**
 * Serializes an array of `{ title, url }` project links into `projects.requirements_url` text.
 * Preserves plain URL string when there is a single link without a custom title.
 */
export function serializeProjectLinks(links) {
    if (!Array.isArray(links)) return null;
    const cleaned = [];
    const seenUrls = new Set();

    for (const item of links) {
        const url = String(item?.url ?? '').trim();
        if (!url) continue;
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
        const title = String(item?.title ?? '').trim();
        cleaned.push({ title, url });
    }

    if (cleaned.length === 0) return null;
    if (
        cleaned.length === 1 &&
        (!cleaned[0].title || cleaned[0].title === 'Project Guide & Attachments')
    ) {
        return cleaned[0].url;
    }

    return JSON.stringify(
        cleaned.map((item, idx) => ({
            title: item.title || `Attached Link ${idx + 1}`,
            url: item.url,
        }))
    );
}

function buildCurriculumSourcesSection(selectedVideos = [], selectedDocuments = []) {
    const videos = Array.isArray(selectedVideos) ? selectedVideos : [];
    const docs = Array.isArray(selectedDocuments) ? selectedDocuments : [];
    const sourceLines = [];

    if (videos.length > 0) {
        sourceLines.push('Videos:');
        videos.forEach((v, idx) => {
            const title = String(v?.title || `Video ${idx + 1}`).trim();
            const coursePart = v?.courseTitle ? ` (${v.courseTitle})` : '';
            const url = resolveVideoUrl(v?.video_id);
            sourceLines.push(url ? `${idx + 1}. ${title}${coursePart}\n   Direct Link: ${url}` : `${idx + 1}. ${title}${coursePart}`);
        });
    }

    if (docs.length > 0) {
        if (sourceLines.length > 0) sourceLines.push('');
        sourceLines.push('Documents & Files:');
        docs.forEach((d, idx) => {
            const title = String(d?.title || `Document ${idx + 1}`).trim();
            const docType = d?.document_type ? ` [${d.document_type}]` : '';
            const contextPart = d?.contextLabel ? ` (${d.contextLabel})` : '';
            const url = resolveDocumentUrl(d?.source_url, d?.source_type);
            sourceLines.push(url ? `${idx + 1}. ${title}${docType}${contextPart}\n   Direct Link: ${url}` : `${idx + 1}. ${title}${docType}${contextPart}`);
        });
    }

    const autoTitles = [
        ...videos.map(v => String(v?.title || '').trim()).filter(Boolean),
        ...docs.map(d => String(d?.title || '').trim()).filter(Boolean),
    ];

    return {
        videosCount: videos.length,
        docsCount: docs.length,
        totalSources: videos.length + docs.length,
        hasBoth: videos.length > 0 && docs.length > 0,
        autoTitles,
        sourcesBlock: sourceLines.length > 0 ? sourceLines.join('\n') : '',
    };
}

/**
 * Builds the complete AI quiz generation prompt with exact question count
 * and direct source links for any combination of videos and/or documents.
 */
export function buildQuizPrompt({
    questionCount = 10,
    topic = '',
    selectedVideos = [],
    selectedDocuments = [],
} = {}) {
    const count = normalizeQuestionCount(questionCount, 10);
    const cleanTopic = String(topic ?? '').trim();
    const { totalSources, hasBoth, autoTitles, sourcesBlock } = buildCurriculumSourcesSection(selectedVideos, selectedDocuments);

    const resolvedTopic = cleanTopic
        || (autoTitles.length > 0 ? autoTitles.slice(0, 4).join(' + ') + (autoTitles.length > 4 ? ` (+${autoTitles.length - 4} more)` : '') : '[Enter Quiz Topic Here]');

    const finalSourcesBlock = sourcesBlock || '[Enter Source Material / Content Here]';

    const coverageNote = hasBoth
        ? `\n- Distribute the ${count} questions evenly across the core concepts covered in both the attached videos and documents.`
        : totalSources > 1
            ? `\n- Distribute the ${count} questions evenly to cover all ${totalSources} selected sources above.`
            : '';

    return `I want to create a technical assessment quiz for the ZDC engineering learning platform.
Return ONLY valid JSON strictly matching this exact schema with no extra markdown or commentary:

{
  "quiz": {
    "title": "Quiz Title (e.g. Digital Logic Fundamentals Quiz)",
    "description": "Concise overview of what this quiz tests",
    "passing_score": 50,
    "max_xp": 100,
    "attempts_allowed": 3,
    "questions_to_show": ${count}
  },
  "questions": [
    {
      "question_text": "Write the technical question here?",
      "option_a": "First option",
      "option_b": "Second option",
      "option_c": "Third option",
      "option_d": "Fourth option",
      "correct_answer": "A",
      "hint": "Helpful explanation or hint shown if the student answers incorrectly (optional)"
    }
  ]
}

Generation Requirements:
- Language: Write all titles, questions, options, and hints in clear, professional English.
- Quiz Topic: ${resolvedTopic}
- Exact Question Count: ${count} questions (the "questions" array must contain exactly ${count} items, and "questions_to_show" must equal ${count}).${coverageNote}
- Extract questions accurately from the following learning sources:

${finalSourcesBlock}`;
}

/**
 * Builds the complete AI project generation prompt with rubric criteria count,
 * XP points, submission method, selected curriculum videos/documents direct links,
 * and any extra reference/starter links.
 */
export function buildProjectPrompt({
    criteriaCount = 4,
    maxPoints = 100,
    submissionMethod = 'github_link',
    topic = '',
    selectedVideos = [],
    selectedDocuments = [],
    extraLinks = [],
} = {}) {
    const cleanCriteria = normalizeBoundedInt(criteriaCount, { min: 1, max: 20, fallback: 4 });
    const cleanPoints = normalizeBoundedInt(maxPoints, { min: 10, max: 5000, fallback: 100 });
    const cleanMethod = String(submissionMethod || 'github_link').trim() || 'github_link';
    const cleanTopic = String(topic ?? '').trim();
    const { totalSources, hasBoth, autoTitles, sourcesBlock } = buildCurriculumSourcesSection(selectedVideos, selectedDocuments);

    const parsedExtra = parseProjectLinks(extraLinks);
    const resolvedTopic = cleanTopic
        || (autoTitles.length > 0 ? autoTitles.slice(0, 4).join(' + ') + (autoTitles.length > 4 ? ` (+${autoTitles.length - 4} more)` : '') : '[Enter Project Topic / Idea Here]');

    const exampleLinksJson = parsedExtra.length > 0
        ? JSON.stringify(parsedExtra, null, 6).replace(/\n/g, '\n    ')
        : `[
      { "title": "Specification Guide or Starter Repo", "url": "https://..." }
    ]`;

    const extraLinksBlock = parsedExtra.length > 0
        ? `\n\nAttached Reference & Starter Links (include these inside requirements_links):\n` + parsedExtra.map((l, i) => `${i + 1}. ${l.title}: ${l.url}`).join('\n')
        : '';

    const finalSourcesBlock = (sourcesBlock || '[Enter Learning Sources / Curriculum Content Here]') + extraLinksBlock;

    const coverageNote = hasBoth
        ? `\n- Synthesize practical project requirements combining concepts from both the attached videos and documents.`
        : totalSources > 1
            ? `\n- Align project deliverables to comprehensively cover all ${totalSources} selected sources above.`
            : '';

    return `I want to create a hands-on engineering project with a structured grading rubric for the ZDC learning platform.
Return ONLY valid JSON strictly matching this exact schema with no extra markdown or commentary:

{
  "project": {
    "title": "Hands-On Project Title",
    "description": "Clear, structured project brief covering technical requirements, implementation steps, and expected deliverables (simple HTML like <ul><li>...</li></ul> is supported)",
    "requirements_links": ${exampleLinksJson},
    "max_points": ${cleanPoints},
    "submission_method": "${cleanMethod}"
  },
  "rubric": [
    {
      "aspect": "Criterion Name (e.g. RTL Architecture & Functional Correctness)",
      "description": "Specific evaluation criteria and expected engineering quality for this aspect",
      "points": ${Math.round(cleanPoints / cleanCriteria)}
    }
  ]
}

Generation Requirements:
- Language: Write all project titles, descriptions, link titles, and rubric items in clear, professional English.
- Project Topic: ${resolvedTopic}
- Total XP Points (max_points): ${cleanPoints} points.
- Accepted Submission Method (submission_method): "${cleanMethod}".
- Exact Rubric Criteria Count: ${cleanCriteria} items in "rubric", whose "points" sum to exactly ${cleanPoints}.
- You may include one or more reference/starter links inside "requirements_links" (each item with "title" and "url").${coverageNote}
- Base the project requirements and deliverables on the following learning sources:

${finalSourcesBlock}`;
}

/**
 * Computes deduplicated initial target attachments for Step 2 (Item Targets Editor)
 * based on the videos and documents selected in Step 1.
 */
export function buildInitialQuizTargets({ selectedVideos = [], selectedDocuments = [] } = {}) {
    const targets = [];
    const seen = new Set();

    const pushTarget = (target_type, target_id) => {
        const cleanId = String(target_id ?? '').trim();
        if (!cleanId) return;
        const key = `${target_type}:${cleanId}`;
        if (seen.has(key)) return;
        seen.add(key);
        targets.push({ target_type, target_id: cleanId });
    };

    for (const v of selectedVideos || []) {
        if (v?.content_id) pushTarget('content', v.content_id);
    }
    for (const d of selectedDocuments || []) {
        if (d?.lesson_id) {
            pushTarget('content', d.lesson_id);
        } else if (d?.course_id) {
            pushTarget('course', d.course_id);
        }
    }

    return targets;
}
