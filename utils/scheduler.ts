import { CalendarEvent, Task, Assignment, Routine } from '../types';

export function computeSchedule(
    events: CalendarEvent[], 
    tasks: Task[], 
    assignments: Assignment[], 
    routines: Routine[], 
    currentDate: Date,
    viewType: 'month' | 'week'
): CalendarEvent[] {
    const combined: CalendarEvent[] = [...events];

    // Map routines to events for the current view
    const startOfView = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const endOfView = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);

    routines.forEach(routine => {
      if (routine.showInCalendar === false && viewType === 'month') return;
      
      let current = new Date(startOfView);
      while (current <= endOfView) {
        let shouldAdd = false;
        if (routine.frequency === 'Daily') {
          shouldAdd = true;
        } else if (routine.frequency === 'Weekly') {
          if (routine.daysOfWeek && routine.daysOfWeek.includes(current.getDay())) {
            shouldAdd = true;
          } else if (!routine.daysOfWeek && current.getDay() === 1) { // Default to Monday
            shouldAdd = true;
          }
        } else if (routine.frequency === 'Monthly') {
          if (current.getDate() === 1) { // Default to 1st of month
            shouldAdd = true;
          }
        }

        if (shouldAdd) {
          const eventDate = new Date(current);
          if (routine.startTime) {
            const [hours, minutes] = routine.startTime.split(':');
            eventDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
          } else {
            eventDate.setHours(9, 0, 0, 0); // Default to 9 AM
          }

          const endDate = new Date(eventDate);
          if (routine.endTime) {
            const [hours, minutes] = routine.endTime.split(':');
            endDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
            if (endDate < eventDate) {
              endDate.setDate(endDate.getDate() + 1);
            }
          } else {
            endDate.setHours(eventDate.getHours() + 1); // Default 1 hour duration
          }

          combined.push({
            id: `routine-${routine.id}-${current.toISOString().split('T')[0]}`,
            title: `Routine: ${routine.title}`,
            startDate: eventDate.toISOString(),
            endDate: endDate.toISOString(),
            type: 'event',
            referenceId: routine.id,
            color: 'bg-emerald-500'
          });
        }
        current.setDate(current.getDate() + 1);
      }
    });

    // Map tasks to events (Deadlines)
    tasks.forEach(task => {
      if (task.dueDate && !task.completed) {
        combined.push({
          id: `task-due-${task.id}`,
          title: `Due: ${task.title}`,
          startDate: task.dueDate,
          endDate: task.dueDate,
          type: 'task',
          referenceId: task.id,
          color: 'bg-red-500'
        });
      }
    });

    // Map assignments to events (Deadlines)
    assignments.forEach(assignment => {
      if (assignment.dueDate && assignment.status !== 'Done') {
        combined.push({
          id: `assign-due-${assignment.id}`,
          title: `Due: ${assignment.title} (${assignment.subject})`,
          startDate: assignment.dueDate,
          endDate: assignment.dueDate,
          type: 'assignment',
          referenceId: assignment.id,
          color: 'bg-red-500'
        });
      }
    });

    // --- Background Agent: Auto-Schedule Work Sessions ---
    // We will find free slots in the next 7 days to work on pending tasks and assignments.
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);

    // Get all occupied time slots in the next 7 days
    const occupiedSlots = combined.filter(e => {
        const start = new Date(e.startDate);
        return start >= now && start <= nextWeek;
    }).map(e => ({
        start: new Date(e.startDate).getTime(),
        end: new Date(e.endDate).getTime()
    })).sort((a, b) => a.start - b.start);

    const isSlotFree = (start: number, end: number) => {
        for (const slot of occupiedSlots) {
            if ((start >= slot.start && start < slot.end) || 
                (end > slot.start && end <= slot.end) ||
                (start <= slot.start && end >= slot.end)) {
                return false;
            }
        }
        return true;
    };

    const findFreeSlot = (durationMs: number, deadline?: Date) => {
        let currentSearchTime = new Date(now);
        // Start searching from the next hour
        currentSearchTime.setMinutes(0, 0, 0);
        currentSearchTime.setHours(currentSearchTime.getHours() + 1);

        const maxSearchTime = deadline && deadline < nextWeek ? deadline : nextWeek;

        while (currentSearchTime < maxSearchTime) {
            // Only schedule between 9 AM and 8 PM
            if (currentSearchTime.getHours() >= 9 && currentSearchTime.getHours() <= 19) {
                const startMs = currentSearchTime.getTime();
                const endMs = startMs + durationMs;
                if (isSlotFree(startMs, endMs)) {
                    // Mark as occupied for subsequent searches
                    occupiedSlots.push({ start: startMs, end: endMs });
                    occupiedSlots.sort((a, b) => a.start - b.start);
                    return { start: new Date(startMs), end: new Date(endMs) };
                }
            }
            // Move to next 30 minutes
            currentSearchTime.setMinutes(currentSearchTime.getMinutes() + 30);
        }
        return null;
    };

    // Schedule Assignments (1 hour each)
    assignments.forEach(assignment => {
        if (assignment.status !== 'Done') {
            const deadline = assignment.dueDate ? new Date(assignment.dueDate) : undefined;
            const hours = assignment.estimatedHours || 1;
            const slot = findFreeSlot(hours * 60 * 60 * 1000, deadline);
            if (slot) {
                combined.push({
                    id: `auto-assign-${assignment.id}`,
                    title: `Work on: ${assignment.title}`,
                    startDate: slot.start.toISOString(),
                    endDate: slot.end.toISOString(),
                    type: 'assignment',
                    referenceId: assignment.id,
                    color: 'bg-purple-400'
                });
            }
        }
    });

    // Schedule Tasks
    tasks.forEach(task => {
        if (!task.completed) {
            const deadline = task.dueDate ? new Date(task.dueDate) : undefined;
            let durationMs = 60 * 60 * 1000;
            if (task.estimatedHours) durationMs = task.estimatedHours * 60 * 60 * 1000;
            else if (task.estimatedTime) durationMs = task.estimatedTime * 60 * 1000;
            
            const slot = findFreeSlot(durationMs, deadline);
            if (slot) {
                combined.push({
                    id: `auto-task-${task.id}`,
                    title: `Work on: ${task.title}`,
                    startDate: slot.start.toISOString(),
                    endDate: slot.end.toISOString(),
                    type: 'task',
                    referenceId: task.id,
                    color: 'bg-blue-400'
                });
            }
        }
    });

    return combined;
}
