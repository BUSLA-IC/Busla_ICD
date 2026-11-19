import test from 'node:test';
import assert from 'node:assert/strict';
import {
    computeRoadmapLayout,
    buildRoadmapEdgeGeometry,
    getNodeSize,
} from './roadmap-layout-core.js';

function findOverlaps(nodes, measuredSizes = null) {
    const visible = nodes.filter(n => !n.isHidden);
    const overlaps = [];
    for (let i = 0; i < visible.length; i++) {
        for (let j = i + 1; j < visible.length; j++) {
            const a = visible[i];
            const b = visible[j];
            const sa = getNodeSize(a, measuredSizes);
            const sb = getNodeSize(b, measuredSizes);

            const aL = a.x - sa.width / 2, aR = a.x + sa.width / 2;
            const aT = a.y - sa.height / 2, aB = a.y + sa.height / 2;
            const bL = b.x - sb.width / 2, bR = b.x + sb.width / 2;
            const bT = b.y - sb.height / 2, bB = b.y + sb.height / 2;

            const overlapX = aL < bR && aR > bL;
            const overlapY = aT < bB && aB > bT;
            if (overlapX && overlapY) {
                overlaps.push([a.id, b.id]);
            }
        }
    }
    return overlaps;
}

test('Symmetrical layout centers parents on children and emits smooth Bezier curves without right angles', () => {
    const nodes = [
        { id: 'track-t1', dbId: 't1', type: 'track', isHidden: false },
        { id: 'phase-p1', dbId: 'p1', type: 'phase', isCollapsed: false, isHidden: false },
        { id: 'course-c1', dbId: 'c1', phaseId: 'p1', type: 'course', isCollapsed: false, isRelatedCollapsed: true, isHidden: false },
        { id: 'material-v1', dbId: 'v1', courseId: 'c1', type: 'video', isHidden: false },
        // 2 Quizzes + 1 Project + 3 Docs on Video 1
        { id: 'quiz-v1-q1', dbId: 'q1', courseId: 'c1', parentMaterialId: 'v1', type: 'quiz', isHidden: false },
        { id: 'quiz-v1-q2', dbId: 'q2', courseId: 'c1', parentMaterialId: 'v1', type: 'quiz', isHidden: false },
        { id: 'project-v1-pr1', dbId: 'pr1', courseId: 'c1', parentMaterialId: 'v1', type: 'project', isHidden: false },
        { id: 'doc-v1-d1', dbId: 'd1', courseId: 'c1', parentMaterialId: 'v1', type: 'document', isHidden: false },
        { id: 'doc-v1-d2', dbId: 'd2', courseId: 'c1', parentMaterialId: 'v1', type: 'document', isHidden: false },
        { id: 'doc-v1-d3', dbId: 'd3', courseId: 'c1', parentMaterialId: 'v1', type: 'document', isHidden: false },
        { id: 'material-v2', dbId: 'v2', courseId: 'c1', type: 'video', isHidden: false },
        { id: 'quiz-v2-q3', dbId: 'q3', courseId: 'c1', parentMaterialId: 'v2', type: 'quiz', isHidden: false },
        // Course-level attachments on Course 1
        { id: 'quiz-course-c1-qc', dbId: 'qc', courseId: 'c1', isCourseAttachment: true, type: 'quiz', isHidden: false },
        { id: 'project-course-c1-pc', dbId: 'pc', courseId: 'c1', isCourseAttachment: true, type: 'project', isHidden: false },
        { id: 'doc-course-c1-dc', dbId: 'dc', courseId: 'c1', isCourseAttachment: true, type: 'document', isHidden: false },
        // Course 2 in Phase 1
        { id: 'course-c2', dbId: 'c2', phaseId: 'p1', type: 'course', isCollapsed: true, isRelatedCollapsed: true, isHidden: false },
        // Phase 2 on spine
        { id: 'phase-p2', dbId: 'p2', type: 'phase', isCollapsed: false, isHidden: false },
        { id: 'course-c3', dbId: 'c3', phaseId: 'p2', type: 'course', isCollapsed: true, isRelatedCollapsed: true, isHidden: false },
    ];

    const links = [
        { from: 'track-t1', to: 'phase-p1', relationType: 'core' },
        { from: 'phase-p1', to: 'phase-p2', relationType: 'core' },
    ];

    const layout = computeRoadmapLayout(nodes);

    // 1. ZERO bounding-box overlaps anywhere in the entire tree
    const overlaps = findOverlaps(nodes);
    assert.deepEqual(overlaps, [], `Expected zero overlaps, found: ${JSON.stringify(overlaps)}`);

    // 2. Track, Phase 1, Phase 2 locked to exact vertical spine X
    const track = nodes.find(n => n.id === 'track-t1');
    const p1 = nodes.find(n => n.id === 'phase-p1');
    const p2 = nodes.find(n => n.id === 'phase-p2');
    assert.equal(track.x, layout.spineX);
    assert.equal(p1.x, layout.spineX);
    assert.equal(p2.x, layout.spineX);

    // 3. True vertical symmetry at EVERY level!
    const v1 = nodes.find(n => n.id === 'material-v1');
    const q1 = nodes.find(n => n.id === 'quiz-v1-q1');
    const d3 = nodes.find(n => n.id === 'doc-v1-d3');
    assert.ok(Math.abs(v1.y - (q1.y + d3.y) / 2) <= 1, 'Video 1 must be vertically centered between its first & last attachment');

    const v2 = nodes.find(n => n.id === 'material-v2');
    const q3 = nodes.find(n => n.id === 'quiz-v2-q3');
    assert.equal(v2.y, q3.y, 'Video 2 with 1 attachment must share exact center Y');

    const c1 = nodes.find(n => n.id === 'course-c1');
    const c2 = nodes.find(n => n.id === 'course-c2');
    const lastC1Child = nodes.find(n => n.id === 'doc-course-c1-dc');
    assert.ok(Math.abs(c1.y - (v1.y + lastC1Child.y) / 2) <= 1, 'Course 1 must be vertically centered across its direct children');
    assert.ok(Math.abs(p1.y - (c1.y + c2.y) / 2) <= 1, 'Phase 1 must be vertically centered between Course 1 and Course 2');

    // 4. Courses in Phase 1 align in Column 1 to the right of Phase 1
    assert.ok(c1.x > p1.x + 250);
    assert.equal(c1.x, c2.x);

    // 5. Phase 2 sits cleanly below Phase 1's entire expanded subtree
    assert.ok(p2.y > c2.y + 100);

    // 6. Smooth Cubic Bezier curves (`C ...`) — NO harsh right-angle H/V elbows!
    const { paths, junctions } = buildRoadmapEdgeGeometry(nodes, links);
    const backbonePaths = paths.filter(p => p.className === 'link-backbone');
    assert.equal(backbonePaths.length, 2, 'Only Track->Phase1 and Phase1->Phase2 should be backbone lines');

    const branchPaths = paths.filter(p => p.className !== 'link-backbone');
    assert.ok(branchPaths.some(p => p.d.includes(' C ')), 'Branch connectors must use smooth Cubic Bezier curves');
    assert.ok(branchPaths.every(p => !p.d.includes(' V ') && !p.d.includes(' H ')), 'No harsh right-angle H/V elbows on horizontal branches');
    assert.ok(paths.some(p => p.className === 'link-phase-branch'));
    assert.ok(paths.some(p => p.className === 'link-course-branch'));
    assert.ok(paths.some(p => p.className === 'link-recommended'));
    assert.ok(paths.some(p => p.className === 'link-optional'));
    assert.ok(paths.some(p => p.className === 'link-subnode-document'));
    assert.ok(junctions.length > 0, 'Edge-anchored port dots must be emitted');
});

test('Expanding a course with empty/falsy dbId NEVER hijacks Track or Phase nodes', () => {
    const nodes = [
        { id: 'track-t1', dbId: 't1', type: 'track', isHidden: false },
        { id: 'phase-p1', dbId: 'p1', type: 'phase', isCollapsed: false, isHidden: false },
        { id: 'course-c1', dbId: 'c1', phaseId: 'p1', type: 'course', isCollapsed: false, isRelatedCollapsed: true, isHidden: false },
        { id: 'material-v1', dbId: 'v1', courseId: 'c1', type: 'video', isHidden: false },
        // Regression case from user screenshot: Course 2 has empty dbId and is expanded!
        { id: 'course-', dbId: '', phaseId: 'p1', type: 'course', isCollapsed: false, isRelatedCollapsed: true, isHidden: false },
    ];
    const links = [{ from: 'track-t1', to: 'phase-p1', relationType: 'core' }];

    const layout = computeRoadmapLayout(nodes);
    const track = nodes.find(n => n.id === 'track-t1');
    const phase = nodes.find(n => n.id === 'phase-p1');
    const c1 = nodes.find(n => n.id === 'course-c1');
    const c2 = nodes.find(n => n.id === 'course-');

    assert.equal(track.x, layout.spineX, 'Track must stay locked on main vertical spine');
    assert.equal(phase.x, layout.spineX, 'Phase must stay locked on main vertical spine');
    assert.ok(track.y < phase.y, 'Track must remain above Phase');
    assert.equal(c1.x, c2.x, 'Course 2 must remain cleanly aligned in Column 1');
    assert.deepEqual(findOverlaps(nodes), []);

    const { paths } = buildRoadmapEdgeGeometry(nodes, links);
    const courseBranchPaths = paths.filter(p => p.className === 'link-course-branch');
    // Only Course 1 -> Video 1 should exist, NEVER Course 2 -> Track/Phase!
    assert.equal(courseBranchPaths.length, 1);
});

test('Layout respects real measured DOM sizes and prevents overlaps even with tall 3-line cards', () => {
    const nodes = [
        { id: 'track-t1', dbId: 't1', type: 'track', isHidden: false },
        { id: 'phase-p1', dbId: 'p1', type: 'phase', isCollapsed: false, isHidden: false },
        { id: 'course-c1', dbId: 'c1', phaseId: 'p1', type: 'course', isCollapsed: false, isRelatedCollapsed: false, isHidden: false },
        { id: 'material-v1', dbId: 'v1', courseId: 'c1', type: 'video', isHidden: false },
        { id: 'doc-v1-d1', dbId: 'd1', courseId: 'c1', parentMaterialId: 'v1', type: 'document', isHidden: false },
        { id: 'quiz-v1-q1', dbId: 'q1', courseId: 'c1', parentMaterialId: 'v1', type: 'quiz', isHidden: false },
        { id: 'course-rel', dbId: 'c_rel', phaseId: 'p1', parentCourseId: 'c1', relatedWith: 'c1', type: 'course', isCollapsed: true, isRelatedCollapsed: true, isHidden: false },
        { id: 'doc-phase-p1', dbId: 'dp1', phaseId: 'p1', isPhaseLevel: true, type: 'document', isHidden: false },
    ];

    const measured = new Map([
        ['phase-p1', { width: 320, height: 180 }],
        ['course-c1', { width: 260, height: 195 }],
        ['doc-v1-d1', { width: 240, height: 140 }],
        ['quiz-v1-q1', { width: 240, height: 130 }],
    ]);

    computeRoadmapLayout(nodes, measured);
    const overlaps = findOverlaps(nodes, measured);
    assert.deepEqual(overlaps, []);

    const d1 = nodes.find(n => n.id === 'doc-v1-d1');
    const q1 = nodes.find(n => n.id === 'quiz-v1-q1');
    const gap = (q1.y - 65) - (d1.y + 70);
    assert.ok(gap >= 24, `Expected >=24px gap between tall measured cards, got ${gap}px`);
});
