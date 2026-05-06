"use strict";
let courseCatalog = [];
let exportButton = null;
let exportStatusElement = null;
// State Management
// Maps container IDs (pool, fa26, etc) to arrays of course IDs
let scheduleState = createEmptyScheduleState();
// Semester Order for Prereq checking
const semesterOrder = ['fa26', 'wi27', 'fa27', 'wi28'];
document.addEventListener('DOMContentLoaded', () => {
    exportButton = document.getElementById('export-json-btn');
    exportStatusElement = document.getElementById('export-status');
    exportButton === null || exportButton === void 0 ? void 0 : exportButton.addEventListener('click', () => {
        exportCourseData();
    });
    initializeScheduler();
});
function createEmptyScheduleState() {
    return {
        pool: [],
        fa26: [],
        wi27: [],
        fa27: [],
        wi28: []
    };
}
function normalizeSemesterId(value) {
    const normalized = (value || '').trim().toLowerCase();
    if (normalized === 'wn27') {
        return 'wi27';
    }
    if (semesterOrder.indexOf(normalized) !== -1) {
        return normalized;
    }
    return null;
}
function buildInitialScheduleState(courses) {
    const nextState = createEmptyScheduleState();
    courses.forEach(course => {
        const semesterId = normalizeSemesterId(course.when);
        if (semesterId) {
            nextState[semesterId].push(course.id);
        }
        else {
            nextState.pool.push(course.id);
        }
    });
    return nextState;
}
async function initializeScheduler() {
    try {
        const response = await fetch('./umich_courses.json');
        if (!response.ok) {
            throw new Error(`Failed to load course data: ${response.status}`);
        }
        const loadedCourses = await response.json();
        courseCatalog = loadedCourses.map(course => (Object.assign(Object.assign({}, course), { prereqs: course.prereqs || [], when: course.when || '' })));
        scheduleState = buildInitialScheduleState(courseCatalog);
        render();
    }
    catch (error) {
        console.error(error);
    }
}
function buildExportCourses() {
    const whenByCourseId = {};
    semesterOrder.forEach(semesterId => {
        scheduleState[semesterId].forEach(courseId => {
            whenByCourseId[courseId] = semesterId;
        });
    });
    return courseCatalog.map(course => (Object.assign(Object.assign({}, course), { when: whenByCourseId[course.id] || '' })));
}
function setExportStatus(message, isError = false) {
    if (!exportStatusElement)
        return;
    exportStatusElement.textContent = message;
    exportStatusElement.classList.toggle('error', isError);
}
function downloadCoursesJson(payload) {
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'umich_courses.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
async function exportCourseData() {
    if (!courseCatalog.length) {
        setExportStatus('No courses loaded yet.', true);
        return;
    }
    const payload = JSON.stringify(buildExportCourses(), null, 2);
    const pickerWindow = window;
    exportButton === null || exportButton === void 0 ? void 0 : exportButton.setAttribute('disabled', 'true');
    setExportStatus('Preparing export...');
    try {
        if (pickerWindow.showSaveFilePicker) {
            const fileHandle = await pickerWindow.showSaveFilePicker({
                suggestedName: 'umich_courses.json',
                types: [
                    {
                        description: 'JSON Files',
                        accept: {
                            'application/json': ['.json']
                        }
                    }
                ]
            });
            const writable = await fileHandle.createWritable();
            await writable.write(payload);
            await writable.close();
            setExportStatus('Saved JSON file.');
            return;
        }
    }
    catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            setExportStatus('Export canceled.');
            return;
        }
        console.error(error);
    }
    finally {
        exportButton === null || exportButton === void 0 ? void 0 : exportButton.removeAttribute('disabled');
    }
    downloadCoursesJson(payload);
    setExportStatus('Downloaded replacement JSON file.');
}
// --- Rendering Logic ---
function render() {
    // Clear all zones
    Object.keys(scheduleState).forEach(zoneId => {
        const container = document.querySelector(`[data-semester-id="${zoneId}"]`);
        if (container) {
            container.innerHTML = '';
            // Render Courses
            scheduleState[zoneId].forEach(courseId => {
                const course = courseCatalog.find(c => c.id === courseId);
                if (course) {
                    const card = createCourseCard(course, zoneId);
                    container.appendChild(card);
                }
            });
            // Update Header Stats (Credits)
            if (zoneId !== 'pool') {
                updateSemesterStats(zoneId);
            }
        }
    });
}
function createCourseCard(course, currentZoneId) {
    const div = document.createElement('div');
    div.classList.add('course-card');
    div.setAttribute('draggable', 'true');
    div.dataset.courseId = course.id;
    // Workload Visual
    let workloadClass = 'medium';
    if (course.workload > 2.0)
        workloadClass = 'heavy';
    if (course.workload < 1.0)
        workloadClass = 'light';
    // Check specific semester constraints (Offering Season)
    const errors = [];
    if (currentZoneId !== 'pool') {
        const zoneElement = document.querySelector(`[data-semester-id="${currentZoneId}"]`);
        const term = zoneElement === null || zoneElement === void 0 ? void 0 : zoneElement.getAttribute('data-term');
        // Check Offered Term
        if (course.offered !== 'Both' && course.offered !== term) {
            errors.push(`Only offered in ${course.offered}`);
        }
    }
    // Build HTML
    div.innerHTML = `
        <div class="course-header">
            <span class="course-code">${course.code}</span>
            <span class="course-credits">${course.credits} Cr</span>
        </div>
        <div class="course-name">${course.name}</div>
        <div class="course-meta">
            <span class="workload-badge ${workloadClass}">Workload: ${course.workload}x</span>
            ${errors.length > 0 ? `<div class="error-msg"><i class="fas fa-exclamation-triangle"></i> ${errors.join(', ')}</div>` : ''}
        </div>
    `;
    // Add Error Styling if needed
    if (errors.length > 0)
        div.classList.add('card-error');
    // Drag Events
    div.addEventListener('dragstart', handleDragStart);
    return div;
}
function updateSemesterStats(zoneId) {
    var _a;
    const courseIds = scheduleState[zoneId];
    const courses = courseIds.map(id => courseCatalog.find(c => c.id === id));
    const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);
    const container = (_a = document.querySelector(`[data-semester-id="${zoneId}"]`)) === null || _a === void 0 ? void 0 : _a.parentElement;
    const statsEl = container === null || container === void 0 ? void 0 : container.querySelector('.credits-count');
    if (statsEl) {
        statsEl.textContent = `${totalCredits}/18 Credits`;
        if (totalCredits > 18) {
            statsEl.classList.add('over-limit');
            statsEl.classList.remove('good-limit');
        }
        else {
            statsEl.classList.remove('over-limit');
            statsEl.classList.add('good-limit');
        }
    }
}
// --- Drag & Drop Handlers ---
let draggedCourseId = null;
let sourceZoneId = null;
function handleDragStart(e) {
    var _a;
    const target = e.target;
    draggedCourseId = target.dataset.courseId || null;
    sourceZoneId = ((_a = target.parentElement) === null || _a === void 0 ? void 0 : _a.dataset.semesterId) || null;
    e.dataTransfer.effectAllowed = 'move';
}
const dropzones = document.querySelectorAll('.course-list');
dropzones.forEach(zone => {
    zone.addEventListener('dragover', (e) => {
        e.preventDefault(); // Necessary to allow dropping
        e.target.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', (e) => {
        e.target.classList.remove('drag-over');
    });
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        const zoneEl = e.currentTarget;
        const targetZoneId = zoneEl.dataset.semesterId;
        zoneEl.classList.remove('drag-over');
        if (draggedCourseId && sourceZoneId && targetZoneId && sourceZoneId !== targetZoneId) {
            // Remove from old
            scheduleState[sourceZoneId] = scheduleState[sourceZoneId].filter(id => id !== draggedCourseId);
            // Add to new
            scheduleState[targetZoneId].push(draggedCourseId);
            // Re-render
            render();
        }
    });
});
