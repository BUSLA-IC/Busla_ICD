import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeQuestionCount,
    resolveVideoUrl,
    resolveDocumentUrl,
    buildQuizPrompt,
    buildProjectPrompt,
    buildInitialQuizTargets,
    parseProjectLinks,
    serializeProjectLinks,
} from './quiz-prompt-core.js';

test('normalizeQuestionCount clamps and defaults cleanly', () => {
    assert.equal(normalizeQuestionCount(15), 15);
    assert.equal(normalizeQuestionCount('25'), 25);
    assert.equal(normalizeQuestionCount(0, 10), 10);
    assert.equal(normalizeQuestionCount(-5, 10), 10);
    assert.equal(normalizeQuestionCount('abc', 12), 12);
    assert.equal(normalizeQuestionCount(250), 100);
});

test('resolveVideoUrl converts YouTube IDs and preserves full URLs', () => {
    assert.equal(resolveVideoUrl('dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(resolveVideoUrl('https://youtu.be/abc123'), 'https://youtu.be/abc123');
    assert.equal(resolveVideoUrl('   '), '');
});

test('resolveDocumentUrl handles direct URLs and raw Google Drive IDs', () => {
    assert.equal(resolveDocumentUrl('https://example.com/lecture1.pdf', 'Direct URL'), 'https://example.com/lecture1.pdf');
    assert.equal(
        resolveDocumentUrl('1AbCdEfGhIjKlMnOp', 'Google Drive'),
        'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view'
    );
    assert.equal(resolveDocumentUrl('', 'Direct URL'), '');
});

test('buildQuizPrompt includes exact question count and direct links for multiple videos and documents', () => {
    const prompt = buildQuizPrompt({
        questionCount: 15,
        topic: 'Logic Gates & Boolean Algebra',
        selectedVideos: [
            { content_id: 'cnt_1', title: 'Lecture 1 - Gates', video_id: 'vidAAA111', courseTitle: 'Logic Design' },
            { content_id: 'cnt_2', title: 'Lecture 2 - K-Maps', video_id: 'vidBBB222', courseTitle: 'Logic Design' },
        ],
        selectedDocuments: [
            { id: 'doc_1', title: 'Chapter 1 Slides', document_type: 'PDF', source_type: 'Direct URL', source_url: 'https://cdn.example.com/ch1.pdf' },
            { id: 'doc_2', title: 'Lab Sheet', document_type: 'Notes', source_type: 'Google Drive', source_url: 'driveFileXYZ' },
        ],
    });

    assert.match(prompt, /"questions_to_show": 15/);
    assert.match(prompt, /Exact Question Count: 15 questions/);
    assert.match(prompt, /Quiz Topic: Logic Gates & Boolean Algebra/);
    assert.match(prompt, /https:\/\/www\.youtube\.com\/watch\?v=vidAAA111/);
    assert.match(prompt, /https:\/\/www\.youtube\.com\/watch\?v=vidBBB222/);
    assert.match(prompt, /https:\/\/cdn\.example\.com\/ch1\.pdf/);
    assert.match(prompt, /https:\/\/drive\.google\.com\/file\/d\/driveFileXYZ\/view/);
    assert.match(prompt, /both the attached videos and documents/);
});

test('buildQuizPrompt works with single video, single document, or no content selected', () => {
    const singleVideo = buildQuizPrompt({
        questionCount: 5,
        selectedVideos: [{ content_id: 'cnt_9', title: 'Intro Video', video_id: 'xyz987' }],
    });
    assert.match(singleVideo, /"questions_to_show": 5/);
    assert.match(singleVideo, /Quiz Topic: Intro Video/);
    assert.match(singleVideo, /https:\/\/www\.youtube\.com\/watch\?v=xyz987/);
    assert.doesNotMatch(singleVideo, /Documents & Files:/);

    const empty = buildQuizPrompt({ questionCount: 8 });
    assert.match(empty, /"questions_to_show": 8/);
    assert.match(empty, /\[Enter Source Material \/ Content Here\]/);
});

test('buildProjectPrompt injects rubric count, XP, submission method, videos, documents, and extra links', () => {
    const prompt = buildProjectPrompt({
        criteriaCount: 5,
        maxPoints: 150,
        submissionMethod: 'github_link',
        topic: '4-bit ALU Design',
        selectedVideos: [
            { content_id: 'cnt_1', title: 'ALU Architecture', video_id: 'aluVid1', courseTitle: 'Digital IC' },
        ],
        selectedDocuments: [
            { id: 'doc_1', title: 'ALU Spec Sheet', document_type: 'PDF', source_type: 'Direct URL', source_url: 'https://example.com/alu.pdf' },
        ],
        extraLinks: [
            { title: 'Starter Repo', url: 'https://github.com/zdc/alu-starter' },
            { title: 'Testbench Guide', url: 'https://docs.example.com/tb' },
        ],
    });

    assert.match(prompt, /"max_points": 150/);
    assert.match(prompt, /"submission_method": "github_link"/);
    assert.match(prompt, /Exact Rubric Criteria Count: 5 items in "rubric"/);
    assert.match(prompt, /https:\/\/www\.youtube\.com\/watch\?v=aluVid1/);
    assert.match(prompt, /https:\/\/example\.com\/alu\.pdf/);
    assert.match(prompt, /https:\/\/github\.com\/zdc\/alu-starter/);
    assert.match(prompt, /https:\/\/docs\.example\.com\/tb/);
});

test('parseProjectLinks & serializeProjectLinks support legacy single URL and multi-links seamlessly', () => {
    // Legacy plain URL
    assert.deepEqual(parseProjectLinks('https://github.com/org/repo'), [
        { title: 'Project Guide & Attachments', url: 'https://github.com/org/repo' },
    ]);

    // Multi-link JSON roundtrip
    const multi = [
        { title: 'GitHub Starter', url: 'https://github.com/org/starter' },
        { title: 'PDF Spec', url: 'https://drive.google.com/file/d/abc/view' },
    ];
    const serialized = serializeProjectLinks(multi);
    assert.equal(typeof serialized, 'string');
    assert.deepEqual(parseProjectLinks(serialized), multi);

    // Single unnamed link serializes cleanly to plain URL for backward compatibility
    assert.equal(serializeProjectLinks([{ title: '', url: 'https://example.com/a' }]), 'https://example.com/a');
    assert.equal(serializeProjectLinks([]), null);

    // Deduplicates identical URLs
    const deduped = parseProjectLinks(serializeProjectLinks([
        { title: 'Link 1', url: 'https://a.com' },
        { title: 'Link 1 dup', url: 'https://a.com' },
        { title: 'Link 2', url: 'https://b.com' },
    ]));
    assert.equal(deduped.length, 2);
});

test('buildInitialQuizTargets deduplicates video lessons and document parent targets', () => {
    const targets = buildInitialQuizTargets({
        selectedVideos: [
            { content_id: 'cnt_1' },
            { content_id: 'cnt_2' },
        ],
        selectedDocuments: [
            { id: 'doc_1', lesson_id: 'cnt_1', course_id: 'cr_1' },
            { id: 'doc_2', lesson_id: null, course_id: 'cr_1' },
        ],
    });
    assert.deepEqual(targets, [
        { target_type: 'content', target_id: 'cnt_1' },
        { target_type: 'content', target_id: 'cnt_2' },
        { target_type: 'course', target_id: 'cr_1' },
    ]);
});
