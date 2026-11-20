/**
 * Pure, deterministic, vertically symmetrical hierarchical tree layout &
 * smooth Cubic Bezier SVG edge-routing engine for ZDC's Interactive
 * Curriculum Roadmap.
 *
 * Zero DOM dependencies — runs identically in browser ESM and node:test.
 *
 * Architecture (left-to-right canvas, zero overlaps, true vertical symmetry):
 *   Column 0 (X_SPINE) : Track ──► Phase 1 ──► Phase 2 ──► ... (luminous vertical spine)
 *   Column 1 (Right)   : Phase ──(smooth Bezier)──► Courses & Phase-level Documents
 *   Column 2 (Right)   : Course ──(smooth Bezier)──► Videos/Lessons & Course-level Quizzes/Projects/Docs
 *   Column 3 (Right)   : Lesson ──(smooth Bezier)──► Unlimited Quizzes, Projects & Documents
 *
 * Every parent node is vertically centered against its expanded children,
 * producing mirror-symmetrical curves with zero right-angle kinks and zero
 * colliding mid-air junction dots.
 */

export const DEFAULT_NODE_SIZES = {
    track:    { width: 320, height: 124 },
    phase:    { width: 320, height: 136 },
    course:   { width: 260, height: 156 },
    video:    { width: 240, height: 96 },
    section:  { width: 240, height: 96 },
    material: { width: 240, height: 96 },
    quiz:     { width: 240, height: 94 },
    project:  { width: 240, height: 94 },
    document: { width: 240, height: 96 },
};

export const LAYOUT_SPACING = {
    padX: 160,
    padY: 160,
    afterTrack: 88,
    betweenPhases: 96,
    betweenPhaseChildren: 44,
    betweenCourseChildren: 32,
    betweenAttachments: 24,
    phaseBranchGapX: 112,      // generous horizontal channel for flowing Phase -> Course Bezier curves
    courseBranchGapX: 104,     // generous horizontal channel for flowing Course -> Material Bezier curves
    attachmentBranchGapX: 96,  // generous horizontal channel for flowing Material -> Attachment Bezier curves
    relatedIndentX: 60,        // right indent for related courses underneath their parent course
};

const hasNonEmptyId = (val) => val !== null && val !== undefined && String(val).trim() !== '';

/**
 * Strict predicates preventing Track/Phase/empty-ID nodes from ever being
 * misclassified as children of a Course or Material.
 */
export function isPhaseChild(node, phaseNode) {
    if (!node || !phaseNode || !hasNonEmptyId(phaseNode.dbId) || !hasNonEmptyId(node.phaseId)) {
        return false;
    }
    if (String(node.phaseId) !== String(phaseNode.dbId)) return false;
    return (
        (node.type === 'course' && !node.relatedWith) ||
        (node.type === 'document' && Boolean(node.isPhaseLevel))
    );
}

export function isCourseChild(node, courseNode) {
    if (!node || !courseNode) return false;
    if (node.type === 'track' || node.type === 'phase' || node.type === 'course') return false;
    if (node.isPhaseLevel || node.parentMaterialId) return false;
    if (!hasNonEmptyId(courseNode.dbId) || !hasNonEmptyId(node.courseId)) return false;
    return String(node.courseId) === String(courseNode.dbId);
}

export function isMaterialSubnode(node, matNode) {
    if (!node || !matNode) return false;
    if (node.type === 'track' || node.type === 'phase' || node.type === 'course') return false;
    if (node.isPhaseLevel) return false;
    if (!hasNonEmptyId(matNode.dbId) || !hasNonEmptyId(node.parentMaterialId)) return false;
    if (String(node.parentMaterialId) !== String(matNode.dbId)) return false;
    if (hasNonEmptyId(matNode.courseId) && hasNonEmptyId(node.courseId)) {
        return String(node.courseId) === String(matNode.courseId);
    }
    return true;
}

export function isRelatedCourseChild(node, parentCourse) {
    if (!node || !parentCourse) return false;
    if (node.type !== 'course') return false;
    if (!hasNonEmptyId(parentCourse.dbId) || !hasNonEmptyId(node.parentCourseId)) return false;
    return String(node.parentCourseId) === String(parentCourse.dbId);
}

/**
 * Returns { width, height } for a node using real measured DOM dimensions if available,
 * falling back to safe, generous defaults for its type.
 */
export function getNodeSize(node, measuredSizes = null) {
    if (measuredSizes) {
        const m = typeof measuredSizes.get === 'function'
            ? measuredSizes.get(node.id)
            : measuredSizes[node.id];
        if (m && m.width > 0 && m.height > 0) {
            return { width: Math.ceil(m.width), height: Math.ceil(m.height) };
        }
    }
    return DEFAULT_NODE_SIZES[node.type] || { width: 240, height: 96 };
}

/**
 * Shifts a set of nodes vertically by `deltaY` (preserving internal symmetry).
 */
function shiftNodesY(nodes, deltaY) {
    if (!deltaY || Math.abs(deltaY) < 0.5) return;
    nodes.forEach((n) => {
        if (typeof n.y === 'number') {
            n.y = Math.round(n.y + deltaY);
        }
    });
}

/**
 * Computes vertically centered, overlap-free (x, y) center coordinates for all visible
 * nodes in `computedNodes`, mutating `node.x` and `node.y` in place.
 *
 * Guarantees:
 * - Zero bounding-box overlaps across arbitrary numbers of phases, courses, lessons,
 *   course-level attachments, lesson-level attachments, and related courses.
 * - Track and Phases stay strictly locked to the main vertical spine (`X_SPINE`).
 * - Every parent is symmetrically centered against its children's vertical midpoint.
 * - Courses with empty/missing IDs never hijack unrelated Track/Phase nodes.
 */
export function computeRoadmapLayout(computedNodes, measuredSizes = null) {
    const visible = (computedNodes || []).filter(n => !n.isHidden);
    const padX = LAYOUT_SPACING.padX;
    const padY = LAYOUT_SPACING.padY;

    const trackNode = visible.find(n => n.type === 'track') || null;
    const spineWidth = trackNode
        ? getNodeSize(trackNode, measuredSizes).width
        : DEFAULT_NODE_SIZES.phase.width;

    const X_SPINE = padX + Math.round(spineWidth / 2);

    // Helper: position a material/lesson and all of its attached subnodes (0..N),
    // returning { bottom, placedNodes } with exact vertical symmetry.
    function layoutMaterialBlock(matNode, colX, topY) {
        const matSize = getNodeSize(matNode, measuredSizes);
        const subNodes = visible.filter(n => isMaterialSubnode(n, matNode));

        if (subNodes.length === 0) {
            matNode.x = colX;
            matNode.y = Math.round(topY + matSize.height / 2);
            return { bottom: topY + matSize.height, placedNodes: [matNode] };
        }

        const firstSubSize = getNodeSize(subNodes[0], measuredSizes);
        const subColX = Math.round(
            colX + matSize.width / 2 + LAYOUT_SPACING.attachmentBranchGapX + firstSubSize.width / 2
        );

        let subTop = topY;
        subNodes.forEach((sub, idx) => {
            const subSize = getNodeSize(sub, measuredSizes);
            sub.x = subColX;
            sub.y = Math.round(subTop + subSize.height / 2);
            subTop += subSize.height;
            if (idx < subNodes.length - 1) {
                subTop += LAYOUT_SPACING.betweenAttachments;
            }
        });

        const subTotalHeight = subTop - topY;
        const blockHeight = Math.max(matSize.height, subTotalHeight);

        matNode.x = colX;
        if (subTotalHeight >= matSize.height) {
            // Center parent exactly at the vertical midpoint between its first and last attachment
            const firstY = subNodes[0].y;
            const lastY = subNodes[subNodes.length - 1].y;
            const idealY = Math.round((firstY + lastY) / 2);
            const minY = Math.round(topY + matSize.height / 2);
            const maxY = Math.round(topY + subTotalHeight - matSize.height / 2);
            matNode.y = Math.max(minY, Math.min(maxY, idealY));
        } else {
            // Attachments group is shorter than parent -> center attachments around parent center
            matNode.y = Math.round(topY + matSize.height / 2);
            const subMidY = (subNodes[0].y + subNodes[subNodes.length - 1].y) / 2;
            shiftNodesY(subNodes, matNode.y - subMidY);
        }

        return { bottom: topY + blockHeight, placedNodes: [matNode, ...subNodes] };
    }

    // Helper: position a course, its expanded direct children (lessons + course-level attachments),
    // and any expanded related courses underneath it.
    function layoutCourseBlock(courseNode, colX, topY) {
        const courseSize = getNodeSize(courseNode, measuredSizes);
        const directPlaced = [courseNode];
        let directBottom = topY + courseSize.height;

        const courseItems = !courseNode.isCollapsed
            ? visible.filter(n => isCourseChild(n, courseNode))
            : [];

        courseNode.x = colX;

        if (courseItems.length === 0) {
            courseNode.y = Math.round(topY + courseSize.height / 2);
        } else {
            const firstItemSize = getNodeSize(courseItems[0], measuredSizes);
            const matColX = Math.round(
                colX + courseSize.width / 2 + LAYOUT_SPACING.courseBranchGapX + firstItemSize.width / 2
            );

            let itemTop = topY;
            const childSubtreeNodes = [];

            courseItems.forEach((item, idx) => {
                const res = layoutMaterialBlock(item, matColX, itemTop);
                childSubtreeNodes.push(...res.placedNodes);
                itemTop = res.bottom;
                if (idx < courseItems.length - 1) {
                    itemTop += LAYOUT_SPACING.betweenCourseChildren;
                }
            });

            const itemsTotalHeight = itemTop - topY;
            directBottom = topY + Math.max(courseSize.height, itemsTotalHeight);
            directPlaced.push(...childSubtreeNodes);

            if (itemsTotalHeight >= courseSize.height) {
                // Center Course card symmetrically at the midpoint of its direct children
                const firstY = courseItems[0].y;
                const lastY = courseItems[courseItems.length - 1].y;
                const idealY = Math.round((firstY + lastY) / 2);
                const minY = Math.round(topY + courseSize.height / 2);
                const maxY = Math.round(topY + itemsTotalHeight - courseSize.height / 2);
                courseNode.y = Math.max(minY, Math.min(maxY, idealY));
            } else {
                // Direct children shorter than Course card -> center children around Course card
                courseNode.y = Math.round(topY + courseSize.height / 2);
                const itemsMidY = (courseItems[0].y + courseItems[courseItems.length - 1].y) / 2;
                shiftNodesY(childSubtreeNodes, courseNode.y - itemsMidY);
            }
        }

        let blockBottom = directBottom;

        // Related courses (related_with) placed cleanly below this course's subtree, indented right
        if (!courseNode.isRelatedCollapsed) {
            const relatedCourses = visible.filter(n => isRelatedCourseChild(n, courseNode));
            if (relatedCourses.length > 0) {
                let relTop = blockBottom + LAYOUT_SPACING.betweenPhaseChildren;
                const relColX = colX + LAYOUT_SPACING.relatedIndentX;
                relatedCourses.forEach((relCourse, idx) => {
                    const relRes = layoutCourseBlock(relCourse, relColX, relTop);
                    directPlaced.push(...relRes.placedNodes);
                    blockBottom = Math.max(blockBottom, relRes.bottom);
                    relTop = relRes.bottom;
                    if (idx < relatedCourses.length - 1) {
                        relTop += LAYOUT_SPACING.betweenPhaseChildren;
                    }
                });
            }
        }

        return { bottom: blockBottom, placedNodes: directPlaced };
    }

    let cursorY = padY;

    // 1. Place Track at top of main vertical spine
    if (trackNode) {
        const trackSize = getNodeSize(trackNode, measuredSizes);
        trackNode.x = X_SPINE;
        trackNode.y = Math.round(cursorY + trackSize.height / 2);
        cursorY += trackSize.height + LAYOUT_SPACING.afterTrack;
    }

    // 2. Place each Phase along the main vertical spine, symmetrically centered on its side-branch
    const phases = visible.filter(n => n.type === 'phase');
    phases.forEach((phase, phaseIdx) => {
        if (phaseIdx > 0) {
            cursorY += LAYOUT_SPACING.betweenPhases;
        }

        const phaseSize = getNodeSize(phase, measuredSizes);
        phase.x = X_SPINE;

        const phaseChildren = !phase.isCollapsed
            ? visible.filter(n => isPhaseChild(n, phase))
            : [];

        if (phaseChildren.length === 0) {
            phase.y = Math.round(cursorY + phaseSize.height / 2);
            cursorY += phaseSize.height;
            return;
        }

        const col1RefWidth = DEFAULT_NODE_SIZES.course.width;
        const col1X = Math.round(
            X_SPINE + phaseSize.width / 2 + LAYOUT_SPACING.phaseBranchGapX + col1RefWidth / 2
        );

        let childTop = cursorY;
        const allPhaseSubtreeNodes = [];

        phaseChildren.forEach((child, ci) => {
            let childBottom;
            if (child.type === 'course') {
                const res = layoutCourseBlock(child, col1X, childTop);
                allPhaseSubtreeNodes.push(...res.placedNodes);
                childBottom = res.bottom;
            } else {
                const docSize = getNodeSize(child, measuredSizes);
                child.x = col1X;
                child.y = Math.round(childTop + docSize.height / 2);
                allPhaseSubtreeNodes.push(child);
                childBottom = childTop + docSize.height;
            }

            childTop = childBottom;
            if (ci < phaseChildren.length - 1) {
                childTop += LAYOUT_SPACING.betweenPhaseChildren;
            }
        });

        const childrenTotalHeight = childTop - cursorY;
        const phaseBlockHeight = Math.max(phaseSize.height, childrenTotalHeight);

        if (childrenTotalHeight >= phaseSize.height) {
            // Center Phase card symmetrically between its first and last child on Column 1
            const firstY = phaseChildren[0].y;
            const lastY = phaseChildren[phaseChildren.length - 1].y;
            const idealY = Math.round((firstY + lastY) / 2);
            const minY = Math.round(cursorY + phaseSize.height / 2);
            const maxY = Math.round(cursorY + childrenTotalHeight - phaseSize.height / 2);
            phase.y = Math.max(minY, Math.min(maxY, idealY));
        } else {
            phase.y = Math.round(cursorY + phaseSize.height / 2);
            const midY = (phaseChildren[0].y + phaseChildren[phaseChildren.length - 1].y) / 2;
            shiftNodesY(allPhaseSubtreeNodes, phase.y - midY);
        }

        cursorY += phaseBlockHeight;
    });

    // 3. Compute exact canvas bounding box
    let maxRight = X_SPINE + Math.round(spineWidth / 2);
    let maxBottom = cursorY;

    visible.forEach(node => {
        if (typeof node.x !== 'number' || typeof node.y !== 'number') return;
        const size = getNodeSize(node, measuredSizes);
        maxRight = Math.max(maxRight, node.x + Math.ceil(size.width / 2));
        maxBottom = Math.max(maxBottom, node.y + Math.ceil(size.height / 2));
    });

    return {
        width: Math.max(1200, maxRight + padX),
        height: Math.max(900, maxBottom + padY),
        spineX: X_SPINE,
    };
}

/**
 * Generates smooth, symmetrical Cubic Bezier SVG paths and clean edge-anchored port dots
 * for all visible relationships — zero harsh 90-degree corners, zero colliding mid-air dots.
 */
export function buildRoadmapEdgeGeometry(computedNodes, computedLinks, measuredSizes = null) {
    const visible = (computedNodes || []).filter(n => !n.isHidden && typeof n.x === 'number' && typeof n.y === 'number');
    const nodeById = new Map(visible.map(n => [n.id, n]));

    const paths = [];
    const junctions = [];
    const seenPorts = new Set();

    const addPort = (x, y, color, r = 4) => {
        const key = `${Math.round(x)},${Math.round(y)}`;
        if (seenPorts.has(key)) return;
        seenPorts.add(key);
        junctions.push({ x: Math.round(x), y: Math.round(y), color, r });
    };

    const edge = (node) => {
        const s = getNodeSize(node, measuredSizes);
        const hw = s.width / 2;
        const hh = s.height / 2;
        return {
            cx: node.x,
            cy: node.y,
            lx: Math.round(node.x - hw),
            rx: Math.round(node.x + hw),
            top: Math.round(node.y - hh),
            bottom: Math.round(node.y + hh),
        };
    };

    /**
     * Emits silky-smooth S-shaped Cubic Bezier curves fanning symmetrically
     * from the parent's right-center port (p.rx, p.cy) into each child's left-center port (ce.lx, ce.cy).
     */
    function emitSmoothFan(parentNode, childNodes, { defaultClass, leafClassFn, parentPortColor, childPortColorFn }) {
        if (!parentNode || !childNodes || childNodes.length === 0) return;
        const p = edge(parentNode);

        // One crisp exit port anchored cleanly on the parent card's right edge
        addPort(p.rx, p.cy, parentPortColor, 4.5);

        childNodes.forEach((child) => {
            const ce = edge(child);
            const leafClass = typeof leafClassFn === 'function' ? leafClassFn(child) : defaultClass;
            const childColor = typeof childPortColorFn === 'function' ? childPortColorFn(child) : parentPortColor;

            const dx = Math.max(24, ce.lx - p.rx);
            const dy = ce.cy - p.cy;

            let d;
            if (Math.abs(dy) <= 1.5) {
                // Exact horizontal alignment -> razor-sharp straight line
                d = `M ${p.rx} ${p.cy} L ${ce.lx} ${ce.cy}`;
            } else {
                // Flowing, symmetrical S-curve Bezier (leaves parent horizontally, arrives at child horizontally)
                const tension = 0.54;
                const cp1x = Math.round(p.rx + dx * tension);
                const cp2x = Math.round(ce.lx - dx * tension);
                d = `M ${p.rx} ${p.cy} C ${cp1x} ${p.cy}, ${cp2x} ${ce.cy}, ${ce.lx} ${ce.cy}`;
            }

            paths.push({
                d,
                className: leafClass,
                useArrow: false,
            });

            // Clean entry port anchored on the child card's left edge
            addPort(ce.lx, ce.cy, childColor, 3.8);
        });
    }

    const attachmentColor = (node) => {
        if (node.type === 'quiz') return '#D4CFC6';
        if (node.type === 'project') return '#FFFFFF';
        if (node.type === 'document') return '#B8B4AC';
        return '#EFECE6';
    };

    // 1. Vertical Spine ('core'): Track -> Phase 1 -> Phase 2 -> ...
    (computedLinks || []).forEach(link => {
        if (link.relationType !== 'core') return;
        const fn = nodeById.get(link.from);
        const tn = nodeById.get(link.to);
        if (!fn || !tn) return;
        const fe = edge(fn);
        const te = edge(tn);
        paths.push({
            d: `M ${fe.cx} ${fe.bottom} L ${te.cx} ${te.top}`,
            className: 'link-backbone',
            useArrow: false,
        });
        addPort(fe.cx, fe.bottom, '#FFFFFF', 4.5);
        addPort(te.cx, te.top, '#EFECE6', 4.5);
    });

    // 2. Phase -> Phase Children (Courses & Phase-level Documents)
    visible.filter(n => n.type === 'phase' && !n.isCollapsed).forEach(phase => {
        const children = visible.filter(n => isPhaseChild(n, phase));
        emitSmoothFan(phase, children, {
            defaultClass: 'link-phase-branch',
            leafClassFn: (child) => child.type === 'document' ? 'link-subnode-document' : 'link-phase-branch',
            parentPortColor: '#EFECE6',
            childPortColorFn: (child) => child.type === 'document' ? '#B8B4AC' : '#EFECE6',
        });
    });

    // 3. Course -> Course Children (Materials/Videos & Course-level Quizzes/Projects/Documents)
    visible.filter(n => n.type === 'course' && !n.isCollapsed).forEach(course => {
        const children = visible.filter(n => isCourseChild(n, course));
        emitSmoothFan(course, children, {
            defaultClass: 'link-course-branch',
            leafClassFn: (child) => {
                if (child.isCourseAttachment) {
                    if (child.type === 'quiz') return 'link-recommended';
                    if (child.type === 'project') return 'link-optional';
                    if (child.type === 'document') return 'link-subnode-document';
                }
                return 'link-course-branch';
            },
            parentPortColor: '#EFECE6',
            childPortColorFn: (child) => child.isCourseAttachment ? attachmentColor(child) : '#8E8E8E',
        });
    });

    // 4. Material/Lesson -> Attached Subnodes (Unlimited Quizzes, Projects, Documents)
    visible.filter(n => n.type !== 'track' && n.type !== 'phase' && n.type !== 'course' && !n.parentMaterialId).forEach(mat => {
        const subs = visible.filter(n => isMaterialSubnode(n, mat));
        emitSmoothFan(mat, subs, {
            defaultClass: 'link-subnode-trunk',
            leafClassFn: (sub) => {
                if (sub.type === 'quiz') return 'link-recommended';
                if (sub.type === 'project') return 'link-optional';
                if (sub.type === 'document') return 'link-subnode-document';
                return 'link-subnode-trunk';
            },
            parentPortColor: '#8E8E8E',
            childPortColorFn: attachmentColor,
        });
    });

    // 5. Related Courses (smooth organic curve from parent course's bottom-left into related course's left edge)
    visible.filter(n => n.type === 'course' && !n.isRelatedCollapsed).forEach(parentCourse => {
        const rels = visible.filter(n => isRelatedCourseChild(n, parentCourse));
        if (rels.length === 0) return;
        const pe = edge(parentCourse);
        const startX = pe.lx + 28;
        const startY = pe.bottom;
        addPort(startX, startY, '#EFECE6', 4);

        rels.forEach(rel => {
            const re = edge(rel);
            const dy = Math.max(24, re.cy - startY);
            const cp1y = Math.round(startY + dy * 0.72);
            const cp2x = Math.round(startX + (re.lx - startX) * 0.28);
            paths.push({
                d: `M ${startX} ${startY} C ${startX} ${cp1y}, ${cp2x} ${re.cy}, ${re.lx} ${re.cy}`,
                className: 'link-related-branch',
                useArrow: false,
            });
            addPort(re.lx, re.cy, '#EFECE6', 3.8);
        });
    });

    // 6. Prerequisites / Dependencies (smooth curved arc between courses)
    (computedLinks || []).forEach(link => {
        if (link.relationType !== 'prerequisite' && link.relationType !== 'dependency') return;
        const fn = nodeById.get(link.from);
        const tn = nodeById.get(link.to);
        if (!fn || !tn) return;
        const fe = edge(fn);
        const te = edge(tn);
        const midY = Math.round((fe.bottom + te.top) / 2);
        paths.push({
            d: `M ${fe.cx} ${fe.bottom} C ${fe.cx} ${midY}, ${te.cx} ${midY}, ${te.cx} ${te.top}`,
            className: 'link-dependency',
            useArrow: true,
        });
    });

    return { paths, junctions };
}
