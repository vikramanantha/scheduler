// Define Types
type Term = 'Fall' | 'Winter' | 'Both';
type SemesterId = 'fa26' | 'wi27' | 'fa27' | 'wi28';

interface Course {
    id: string;
    code: string;
    name: string;
    credits: number;
    workload: number; // e.g., 1.0 is standard, 2.0 is heavy
    offered: Term;
    prereqs: string[]; // List of course IDs
    when: string;
}

let courseCatalog: Course[] = [];
let exportButton: HTMLButtonElement | null = null;
let exportStatusElement: HTMLElement | null = null;

// State Management
// Maps container IDs (pool, fa26, etc) to arrays of course IDs
let scheduleState: { [key: string]: string[] } = createEmptyScheduleState();

// Semester Order for Prereq checking
const semesterOrder: SemesterId[] = ['fa26', 'wi27', 'fa27', 'wi28'];

document.addEventListener('DOMContentLoaded', () => {
    exportButton = document.getElementById('export-json-btn') as HTMLButtonElement | null;
    exportStatusElement = document.getElementById('export-status');
    exportButton?.addEventListener('click', () => {
        exportCourseData();
    });
    initializeScheduler();
});

function createEmptyScheduleState(): { [key: string]: string[] } {
    return {
        pool: [],
        fa26: [],
        wi27: [],
        fa27: [],
        wi28: []
    };
}

function normalizeSemesterId(value?: string): SemesterId | null {
    const normalized = (value || '').trim().toLowerCase();
    if (normalized === 'wn27') {
        return 'wi27';
    }

    if (semesterOrder.indexOf(normalized as SemesterId) !== -1) {
        return normalized as SemesterId;
    }

    return null;
}

function buildInitialScheduleState(courses: Course[]): { [key: string]: string[] } {
    const nextState = createEmptyScheduleState();

    courses.forEach(course => {
        const semesterId = normalizeSemesterId(course.when);
        if (semesterId) {
            nextState[semesterId].push(course.id);
        } else {
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

        const loadedCourses = await response.json() as Partial<Course>[];
        courseCatalog = loadedCourses.map(course => ({
            ...course,
            prereqs: course.prereqs || [],
            when: course.when || ''
        })) as Course[];
        scheduleState = buildInitialScheduleState(courseCatalog);
        render();
    } catch (error) {
        console.error(error);
    }
}

function buildExportCourses(): Course[] {
    const whenByCourseId: { [key: string]: string } = {};

    semesterOrder.forEach(semesterId => {
        scheduleState[semesterId].forEach(courseId => {
            whenByCourseId[courseId] = semesterId;
        });
    });

    return courseCatalog.map(course => ({
        ...course,
        when: whenByCourseId[course.id] || ''
    }));
}

function setExportStatus(message: string, isError = false) {
    if (!exportStatusElement) return;
    exportStatusElement.textContent = message;
    exportStatusElement.classList.toggle('error', isError);
}

function downloadCoursesJson(payload: string) {
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
    const pickerWindow = window as Window & {
        showSaveFilePicker?: (options?: unknown) => Promise<any>;
    };

    exportButton?.setAttribute('disabled', 'true');
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
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            setExportStatus('Export canceled.');
            return;
        }

        console.error(error);
    } finally {
        exportButton?.removeAttribute('disabled');
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

function createCourseCard(course: Course, currentZoneId: string): HTMLElement {
    const div = document.createElement('div');
    div.classList.add('course-card');
    div.setAttribute('draggable', 'true');
    div.dataset.courseId = course.id;

    // Workload Visual
    let workloadClass = 'medium';
    if(course.workload > 2.0) workloadClass = 'heavy';
    if(course.workload < 1.0) workloadClass = 'light';

    // Check specific semester constraints (Offering Season)
    const errors: string[] = [];
    if (currentZoneId !== 'pool') {
        const zoneElement = document.querySelector(`[data-semester-id="${currentZoneId}"]`);
        const term = zoneElement?.getAttribute('data-term') as Term;
        
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
    if (errors.length > 0) div.classList.add('card-error');

    // Drag Events
    div.addEventListener('dragstart', handleDragStart);
    return div;
}

function updateSemesterStats(zoneId: string) {
    const courseIds = scheduleState[zoneId];
    const courses = courseIds.map(id => courseCatalog.find(c => c.id === id)!);
    
    const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);
    const container = document.querySelector(`[data-semester-id="${zoneId}"]`)?.parentElement;
    const statsEl = container?.querySelector('.credits-count');

    if (statsEl) {
        statsEl.textContent = `${totalCredits}/18 Credits`;
        if (totalCredits > 18) {
            statsEl.classList.add('over-limit');
            statsEl.classList.remove('good-limit');
        } else {
            statsEl.classList.remove('over-limit');
            statsEl.classList.add('good-limit');
        }
    }
}

// --- Drag & Drop Handlers ---

let draggedCourseId: string | null = null;
let sourceZoneId: string | null = null;

function handleDragStart(e: DragEvent) {
    const target = e.target as HTMLElement;
    draggedCourseId = target.dataset.courseId || null;
    sourceZoneId = target.parentElement?.dataset.semesterId || null;
    e.dataTransfer!.effectAllowed = 'move';
}

const dropzones = document.querySelectorAll('.course-list');
dropzones.forEach(zone => {
    zone.addEventListener('dragover', (e) => {
        e.preventDefault(); // Necessary to allow dropping
        (e.target as HTMLElement).classList.add('drag-over');
    });

    zone.addEventListener('dragleave', (e) => {
        (e.target as HTMLElement).classList.remove('drag-over');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        const zoneEl = e.currentTarget as HTMLElement;
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