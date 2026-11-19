import test from 'node:test';
import assert from 'node:assert/strict';
import {
    mergeCurriculumLinks,
    getAttachmentsForTarget,
    getAttachmentCountsForTarget,
    getTargetsForItem,
    buildTargetSyncPlan,
    buildItemTargetsSyncPlan,
    itemMatchesHierarchicalFilters,
    buildCoursePlayerStructure,
    resolveTargetPlayableItem,
} from './curriculum-links-core.js';

const SAMPLE_HIERARCHY = {
    tracks: [{ id: 'tr_1', name: 'Digital IC Design' }],
    phases: [{ phase_id: 'ph_1', title: 'Phase 1', track_id: 'tr_1' }],
    courses: [
        { course_id: 'cr_1', title: 'Intro to IC', phase_id: 'ph_1' },
        { course_id: 'cr_2', title: 'Verilog RTL', phase_id: 'ph_1' },
    ],
    contents: [
        { content_id: 'cnt_1', title: 'Video 1', course_id: 'cr_1', type: 'video', order_index: 1, ref_quiz_id: 'q_1', ref_project_id: 'p_1' },
        { content_id: 'cnt_2', title: 'Video 2', course_id: 'cr_1', type: 'video', order_index: 2, ref_quiz_id: null, ref_project_id: null },
        { content_id: 'cnt_3', title: 'Verilog Video 1', course_id: 'cr_2', type: 'video', order_index: 1, ref_quiz_id: null, ref_project_id: null },
    ],
};

test('merges legacy columns and curriculum_links without duplicates', () => {
    const merged = mergeCurriculumLinks({
        tableLinks: [
            { id: 'l1', target_type: 'content', target_id: 'cnt_1', item_type: 'quiz', item_id: 'q_1', order_index: 0 },
            { id: 'l2', target_type: 'content', target_id: 'cnt_1', item_type: 'quiz', item_id: 'q_2', order_index: 1 },
            { id: 'l3', target_type: 'content', target_id: 'cnt_1', item_type: 'document', item_id: 'd_2', order_index: 1 },
            { id: 'l4', target_type: 'content', target_id: 'cnt_1', item_type: 'document', item_id: 'd_3', order_index: 2 },
            { id: 'l5', target_type: 'course', target_id: 'cr_1', item_type: 'quiz', item_id: 'q_course', order_index: 0 },
        ],
        materials: SAMPLE_HIERARCHY.contents,
        documents: [
            { id: 'd_1', title: 'Slides PDF', lesson_id: 'cnt_1', course_id: 'cr_1', order_index: 0 },
            { id: 'd_course', title: 'Syllabus', lesson_id: null, course_id: 'cr_1', order_index: 0 },
        ],
        tableReady: true,
    });

    const cnt1 = getAttachmentsForTarget(merged, 'content', 'cnt_1');
    assert.deepEqual(cnt1.quizzes, ['q_1', 'q_2']);
    assert.deepEqual(cnt1.projects, ['p_1']);
    assert.deepEqual(cnt1.documents, ['d_1', 'd_2', 'd_3']);

    const counts = getAttachmentCountsForTarget(merged, 'content', 'cnt_1');
    assert.deepEqual(counts, { quizzes: 2, projects: 1, documents: 3, total: 6 });

    const cnt2 = getAttachmentCountsForTarget(merged, 'content', 'cnt_2');
    assert.deepEqual(cnt2, { quizzes: 0, projects: 0, documents: 0, total: 0 });

    const cr1 = getAttachmentsForTarget(merged, 'course', 'cr_1');
    assert.deepEqual(cr1.quizzes, ['q_course']);
    assert.deepEqual(cr1.documents, ['d_course']);
});

test('buildTargetSyncPlan computes exact upserts and deletes while preserving ordering', () => {
    const existing = [
        { id: 'l1', target_type: 'content', target_id: 'cnt_1', item_type: 'quiz', item_id: 'q_1', order_index: 0 },
        { id: 'l2', target_type: 'content', target_id: 'cnt_1', item_type: 'quiz', item_id: 'q_old', order_index: 1 },
        { id: 'l3', target_type: 'course', target_id: 'cr_1', item_type: 'quiz', item_id: 'q_course', order_index: 0 },
    ];

    const plan = buildTargetSyncPlan(existing, 'content', 'cnt_1', {
        quizIds: ['q_2', 'q_1', 'q_2'], // duplicate q_2 should be deduped, order preserved
        projectIds: ['p_1', 'p_2'],
        docIds: ['d_1', 'd_2', 'd_3'],
    });

    assert.equal(plan.toDelete.length, 1);
    assert.equal(plan.toDelete[0].item_id, 'q_old');

    const quizUpserts = plan.toUpsert.filter(r => r.item_type === 'quiz');
    assert.deepEqual(quizUpserts.map(r => [r.item_id, r.order_index]), [
        ['q_2', 0],
        ['q_1', 1],
    ]);
    assert.equal(plan.toUpsert.filter(r => r.item_type === 'project').length, 2);
    assert.equal(plan.toUpsert.filter(r => r.item_type === 'document').length, 3);
});

test('buildItemTargetsSyncPlan allows linking one quiz to multiple targets without overwriting siblings', () => {
    const existing = [
        { id: 'l1', target_type: 'content', target_id: 'cnt_1', item_type: 'quiz', item_id: 'q_existing', order_index: 0 },
        { id: 'l2', target_type: 'content', target_id: 'cnt_2', item_type: 'quiz', item_id: 'q_new', order_index: 0 },
    ];

    const plan = buildItemTargetsSyncPlan(existing, 'quiz', 'q_new', [
        { target_type: 'content', target_id: 'cnt_1' },
        { target_type: 'course', target_id: 'cr_1' },
    ]);

    // Old link on cnt_2 is deleted; sibling q_existing on cnt_1 is untouched; q_new gets order_index 1 on cnt_1
    assert.equal(plan.toDelete.length, 1);
    assert.equal(plan.toDelete[0].target_id, 'cnt_2');
    assert.equal(plan.toUpsert.length, 2);

    const onCnt1 = plan.toUpsert.find(r => r.target_id === 'cnt_1');
    const onCr1 = plan.toUpsert.find(r => r.target_id === 'cr_1');
    assert.equal(onCnt1.order_index, 1);
    assert.equal(onCr1.order_index, 0);
});

test('itemMatchesHierarchicalFilters matches across ALL linked courses and contents', () => {
    const links = [
        { target_type: 'content', target_id: 'cnt_1', item_type: 'quiz', item_id: 'q_shared', order_index: 0 },
        { target_type: 'course', target_id: 'cr_2', item_type: 'quiz', item_id: 'q_shared', order_index: 0 },
    ];

    assert.equal(itemMatchesHierarchicalFilters('quiz', 'q_shared', { courseVal: 'cr_1' }, SAMPLE_HIERARCHY, links), true);
    assert.equal(itemMatchesHierarchicalFilters('quiz', 'q_shared', { courseVal: 'cr_2' }, SAMPLE_HIERARCHY, links), true);
    assert.equal(itemMatchesHierarchicalFilters('quiz', 'q_shared', { contentVal: 'cnt_1' }, SAMPLE_HIERARCHY, links), true);
    assert.equal(itemMatchesHierarchicalFilters('quiz', 'q_shared', { contentVal: 'cnt_2' }, SAMPLE_HIERARCHY, links), false);
    assert.equal(itemMatchesHierarchicalFilters('quiz', 'q_unlinked', { courseVal: 'cr_1' }, SAMPLE_HIERARCHY, links), false);
    assert.equal(itemMatchesHierarchicalFilters('quiz', 'q_unlinked', { courseVal: 'all' }, SAMPLE_HIERARCHY, links), true);
});

test('buildCoursePlayerStructure renders 2 quizzes, 1 project, 3 docs on a video + course-level items with unique IDs', () => {
    const mergedLinks = mergeCurriculumLinks({
        tableLinks: [
            { target_type: 'content', target_id: 'cnt_1', item_type: 'quiz', item_id: 'q_1', order_index: 0 },
            { target_type: 'content', target_id: 'cnt_1', item_type: 'quiz', item_id: 'q_2', order_index: 1 },
            { target_type: 'content', target_id: 'cnt_1', item_type: 'project', item_id: 'p_1', order_index: 0 },
            { target_type: 'content', target_id: 'cnt_1', item_type: 'document', item_id: 'd_1', order_index: 0 },
            { target_type: 'content', target_id: 'cnt_1', item_type: 'document', item_id: 'd_2', order_index: 1 },
            { target_type: 'content', target_id: 'cnt_1', item_type: 'document', item_id: 'd_3', order_index: 2 },
            { target_type: 'course', target_id: 'cr_1', item_type: 'quiz', item_id: 'q_final', order_index: 0 },
            { target_type: 'course', target_id: 'cr_1', item_type: 'project', item_id: 'p_final', order_index: 0 },
            { target_type: 'course', target_id: 'cr_1', item_type: 'document', item_id: 'd_course', order_index: 0 },
        ],
        materials: SAMPLE_HIERARCHY.contents.filter(c => c.course_id === 'cr_1'),
        documents: [],
        tableReady: true,
    });

    const structure = buildCoursePlayerStructure({
        courseId: 'cr_1',
        materials: SAMPLE_HIERARCHY.contents.filter(c => c.course_id === 'cr_1'),
        mergedLinks,
        quizzesLookup: {
            q_1: { quiz_id: 'q_1', title: 'Quiz 1', max_xp: 25 },
            q_2: { quiz_id: 'q_2', title: 'Quiz 2', max_xp: 40 },
            q_final: { quiz_id: 'q_final', title: 'Course Final Exam', max_xp: 100 },
        },
        projectsLookup: {
            p_1: { id: 'p_1', title: 'Lab 1', max_points: 50 },
            p_final: { id: 'p_final', title: 'Capstone', max_points: 200 },
        },
        documentsLookup: {
            d_1: { id: 'd_1', title: 'Doc 1', xp_reward: 10 },
            d_2: { id: 'd_2', title: 'Doc 2', xp_reward: 10 },
            d_3: { id: 'd_3', title: 'Doc 3', xp_reward: 10 },
            d_course: { id: 'd_course', title: 'Course Syllabus', xp_reward: 15 },
        },
    });

    assert.equal(structure.lessonAttachmentsMap['cnt_1'].quizzes.length, 2);
    assert.equal(structure.lessonAttachmentsMap['cnt_1'].projects.length, 1);
    assert.equal(structure.lessonAttachmentsMap['cnt_1'].documents.length, 3);
    assert.equal(structure.lessonAttachmentsMap['cnt_2'].quizzes.length, 0);

    assert.equal(structure.courseAttachments.quizzes.length, 1);
    assert.equal(structure.courseAttachments.projects.length, 1);
    assert.equal(structure.courseAttachments.documents.length, 1);

    // Every quiz/project item in flatPlayable has a unique content_id
    const quizItems = structure.flatPlayable.filter(x => x.type === 'quiz');
    const uniqueQuizContentIds = new Set(quizItems.map(x => x.content_id));
    assert.equal(uniqueQuizContentIds.size, 3);

    // Resolving Quiz 2 by new unique ID finds Quiz 2 specifically
    const resolvedQ2 = resolveTargetPlayableItem(structure.flatPlayable, 'cnt_1_quiz_q_2');
    assert.equal(resolvedQ2?.ref_quiz_id, 'q_2');

    // Resolving legacy URL `cnt_1_quiz` still finds Quiz 1
    const resolvedLegacy = resolveTargetPlayableItem(structure.flatPlayable, 'cnt_1_quiz');
    assert.equal(resolvedLegacy?.ref_quiz_id, 'q_1');

    // Resolving course-level final project finds Capstone
    const resolvedFinal = resolveTargetPlayableItem(structure.flatPlayable, 'course_cr_1_project_p_final');
    assert.equal(resolvedFinal?.ref_project_id, 'p_final');
});

test('getTargetsForItem returns all attached targets across courses and contents', () => {
    const links = [
        { target_type: 'course', target_id: 'cr_1', item_type: 'document', item_id: 'd_1', order_index: 0 },
        { target_type: 'content', target_id: 'cnt_1', item_type: 'document', item_id: 'd_1', order_index: 2 },
    ];
    const targets = getTargetsForItem(links, 'document', 'd_1');
    assert.equal(targets.length, 2);
    assert.deepEqual(targets.map(t => `${t.target_type}:${t.target_id}`), ['course:cr_1', 'content:cnt_1']);
});
