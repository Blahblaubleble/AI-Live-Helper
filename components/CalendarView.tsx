import React, { useState, useMemo } from 'react';
import { CalendarEvent, Task, Assignment, Routine } from '../types';
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, AlignLeft, Calendar as CalendarIcon, X } from 'lucide-react';

interface CalendarViewProps {
  events: CalendarEvent[];
  tasks: Task[];
  assignments: Assignment[];
  routines?: Routine[];
  onAddEvent: (event: CalendarEvent) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ events, tasks, assignments, routines = [], onAddEvent }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [viewType, setViewType] = useState<'month' | 'week'>(() => {
    const saved = localStorage.getItem('calendarViewType');
    return (saved === 'month' || saved === 'week') ? saved : 'month';
  });

  const handleSetViewType = (type: 'month' | 'week') => {
    setViewType(type);
    localStorage.setItem('calendarViewType', type);
  };
  
  // New Event State
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventStart, setNewEventStart] = useState('');
  const [newEventEnd, setNewEventEnd] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventLocation, setNewEventLocation] = useState('');

  // Combine all items into a unified event list
  const allEvents = useMemo(() => {
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
          const dayName = current.toLocaleDateString('en-US', { weekday: 'long' });
          if (routine.daysOfWeek && routine.daysOfWeek.includes(dayName)) {
            shouldAdd = true;
          } else if (!routine.daysOfWeek && current.getDay() === 1) { // Default to Monday if no days specified
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
        // Check if the slot overlaps with any occupied slot
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
            const slot = findFreeSlot(60 * 60 * 1000, deadline);
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
            const durationMs = task.estimatedTime ? task.estimatedTime * 60 * 1000 : 60 * 60 * 1000; // Default 1 hour
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
  }, [events, tasks, assignments, routines, currentDate, viewType]);

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const handlePrev = () => {
    if (viewType === 'month') {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() - 7);
        setCurrentDate(newDate);
    }
  };

  const handleNext = () => {
    if (viewType === 'month') {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + 7);
        setCurrentDate(newDate);
    }
  };

  const handleDateClick = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    setSelectedDate(date);
    
    // Pre-fill start date for new event
    const isoDate = date.toISOString().split('T')[0];
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    setNewEventStart(`${isoDate}T${time}`);
    setNewEventEnd(`${isoDate}T${(now.getHours() + 1).toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
  };

  const handleAddEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle || !newEventStart) return;

    const newEvent: CalendarEvent = {
        id: Math.random().toString(36).substring(2, 9),
        title: newEventTitle,
        startDate: new Date(newEventStart).toISOString(),
        endDate: newEventEnd ? new Date(newEventEnd).toISOString() : new Date(new Date(newEventStart).getTime() + 3600000).toISOString(),
        description: newEventDesc,
        location: newEventLocation,
        type: 'event',
        color: 'bg-indigo-500'
    };

    onAddEvent(newEvent);
    setIsAddEventOpen(false);
    setNewEventTitle('');
    setNewEventDesc('');
    setNewEventLocation('');
  };

  const renderMonthView = () => {
    const days = [];
    // Padding
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`pad-${i}`} className="h-24 bg-slate-50/50 dark:bg-white/5 border border-slate-100 dark:border-white/5" />);
    }

    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
      const dayEvents = allEvents.filter(e => {
          const eDate = new Date(e.startDate);
          return eDate.getDate() === d && eDate.getMonth() === currentDate.getMonth() && eDate.getFullYear() === currentDate.getFullYear();
      });

      const isToday = new Date().toDateString() === date.toDateString();
      const isSelected = selectedDate?.toDateString() === date.toDateString();

      days.push(
        <div 
            key={d} 
            onClick={() => handleDateClick(d)}
            className={`h-24 border border-slate-100 dark:border-white/5 p-1 relative group cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${isSelected ? 'bg-blue-50 dark:bg-blue-500/10 ring-1 ring-inset ring-blue-500' : ''}`}
        >
            <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-slate-700 dark:text-white'}`}>
                {d}
            </div>
            <div className="space-y-1 overflow-y-auto max-h-[calc(100%-24px)] custom-scrollbar">
                {dayEvents.map(event => (
                    <div key={event.id} className={`text-[10px] px-1.5 py-0.5 rounded truncate text-white ${event.color || 'bg-slate-500'} bg-opacity-90`}>
                        {event.title}
                    </div>
                ))}
            </div>
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    handleDateClick(d);
                    setIsAddEventOpen(true);
                }}
                className="absolute top-1 right-1 p-0.5 rounded-full bg-slate-200 dark:bg-white/20 text-slate-600 dark:text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-500 hover:text-white"
            >
                <Plus className="w-3 h-3" />
            </button>
        </div>
      );
    }
    return (
        <div className="flex-1 flex flex-col overflow-y-auto">
            <div className="grid grid-cols-7 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="py-2 text-center text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider">
                        {day}
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-7 auto-rows-fr">
                {days}
            </div>
        </div>
    );
  };

  const renderWeekView = () => {
      const startOfWeek = new Date(currentDate);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day; // Adjust when day is Sunday
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      const weekDays = [];
      for (let i = 0; i < 7; i++) {
          const d = new Date(startOfWeek);
          d.setDate(startOfWeek.getDate() + i);
          weekDays.push(d);
      }

      const hours = Array.from({ length: 24 }, (_, i) => i);

      return (
          <div className="flex-1 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-8 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex-shrink-0">
                  <div className="py-2 text-center text-xs font-semibold text-slate-500 dark:text-white/50 border-r border-slate-200 dark:border-white/10">Time</div>
                  {weekDays.map((d, i) => {
                      const isToday = new Date().toDateString() === d.toDateString();
                      return (
                          <div key={i} className={`py-2 text-center border-r border-slate-200 dark:border-white/10 last:border-r-0 ${isToday ? 'bg-blue-50 dark:bg-blue-500/10' : ''}`}>
                              <div className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                              <div className={`text-sm font-bold ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-slate-800 dark:text-white'}`}>{d.getDate()}</div>
                          </div>
                      );
                  })}
              </div>
              
              {/* Time Grid */}
              <div className="flex-1 overflow-y-auto relative">
                  <div className="grid grid-cols-8 min-h-[1440px]"> {/* 60px per hour */}
                      {/* Time Column */}
                      <div className="border-r border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5">
                          {hours.map(h => (
                              <div key={h} className="h-[60px] border-b border-slate-200 dark:border-white/10 text-[10px] text-slate-400 dark:text-white/40 p-1 text-right pr-2">
                                  {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                              </div>
                          ))}
                      </div>

                      {/* Days Columns */}
                      {weekDays.map((dayDate, dayIndex) => {
                          const dayEvents = allEvents.filter(e => {
                              const eDate = new Date(e.startDate);
                              return eDate.toDateString() === dayDate.toDateString();
                          });

                          return (
                              <div key={dayIndex} className="relative border-r border-slate-200 dark:border-white/10 last:border-r-0">
                                  {/* Grid Lines */}
                                  {hours.map(h => (
                                      <div key={h} className="h-[60px] border-b border-slate-200 dark:border-white/10" />
                                  ))}

                                  {/* Events */}
                                  {dayEvents.map(event => {
                                      const start = new Date(event.startDate);
                                      const end = new Date(event.endDate);
                                      const startMinutes = start.getHours() * 60 + start.getMinutes();
                                      const endMinutes = end.getHours() * 60 + end.getMinutes();
                                      const duration = Math.max(30, endMinutes - startMinutes); // Min 30 mins height
                                      
                                      return (
                                          <div
                                              key={event.id}
                                              className={`absolute left-1 right-1 rounded p-1 text-[10px] text-white overflow-hidden shadow-sm hover:z-10 hover:shadow-md transition-all cursor-pointer ${event.color || 'bg-slate-500'}`}
                                              style={{
                                                  top: `${startMinutes}px`,
                                                  height: `${duration}px`,
                                                  opacity: 0.9
                                              }}
                                              onClick={(e) => {
                                                  e.stopPropagation();
                                                  setSelectedDate(dayDate);
                                              }}
                                              title={`${event.title} (${start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})})`}
                                          >
                                              <div className="font-semibold truncate">{event.title}</div>
                                              <div className="truncate opacity-80">{start.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}</div>
                                          </div>
                                      );
                                  })}
                              </div>
                          );
                      })}
                  </div>
                  
                  {/* Current Time Indicator */}
                  {weekDays.some(d => d.toDateString() === new Date().toDateString()) && (
                      <div 
                          className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none flex items-center"
                          style={{ 
                              top: `${new Date().getHours() * 60 + new Date().getMinutes()}px`,
                              left: `${(new Date().getDay() + 1) * (100/8)}%` // Approximate position
                           }}
                      >
                          <div className="w-2 h-2 rounded-full bg-red-500 -ml-1"></div>
                      </div>
                  )}
              </div>
          </div>
      );
  };

  const selectedDayEvents = selectedDate ? allEvents.filter(e => {
      const eDate = new Date(e.startDate);
      return eDate.toDateString() === selectedDate.toDateString();
  }) : [];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#1c1c1e] rounded-xl shadow-sm border border-slate-200 dark:border-white/10 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-black/20">
            <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white min-w-[200px]">
                    {viewType === 'month' 
                        ? currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })
                        : `Week of ${currentDate.toLocaleString('default', { month: 'short', day: 'numeric' })}`
                    }
                </h2>
                <div className="flex items-center bg-white dark:bg-white/10 rounded-lg border border-slate-200 dark:border-white/10">
                    <button onClick={handlePrev} className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-l-lg text-slate-600 dark:text-white"><ChevronLeft className="w-4 h-4" /></button>
                    <div className="w-px h-4 bg-slate-200 dark:bg-white/10"></div>
                    <button onClick={handleNext} className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-r-lg text-slate-600 dark:text-white"><ChevronRight className="w-4 h-4" /></button>
                </div>
                <div className="flex bg-slate-200 dark:bg-black/40 p-1 rounded-lg">
                    <button 
                        onClick={() => handleSetViewType('month')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${viewType === 'month' ? 'bg-white dark:bg-white/20 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-white/40 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                        Month
                    </button>
                    <button 
                        onClick={() => handleSetViewType('week')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${viewType === 'week' ? 'bg-white dark:bg-white/20 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-white/40 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                        Week
                    </button>
                </div>
            </div>
            <button 
                onClick={() => {
                    const now = new Date();
                    setSelectedDate(now);
                    setNewEventStart(now.toISOString().slice(0, 16));
                    setIsAddEventOpen(true);
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
                <Plus className="w-4 h-4" /> Add Event
            </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
            {/* Calendar Grid */}
            {viewType === 'month' ? renderMonthView() : renderWeekView()}

            {/* Side Panel (Selected Day Details) */}
            {selectedDate && viewType === 'month' && (
                <div className="w-80 border-l border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 flex flex-col animate-in slide-in-from-right-10 duration-300">
                    <div className="p-4 border-b border-slate-200 dark:border-white/10 flex justify-between items-center bg-white/50 dark:bg-white/5 backdrop-blur-sm">
                        <div>
                            <div className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider">{selectedDate.toLocaleString('default', { weekday: 'long' })}</div>
                            <div className="text-lg font-bold text-slate-800 dark:text-white">{selectedDate.getDate()} {selectedDate.toLocaleString('default', { month: 'long' })}</div>
                        </div>
                        <button onClick={() => setSelectedDate(null)} className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full text-slate-500 dark:text-white/50">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {selectedDayEvents.length === 0 ? (
                            <div className="text-center py-10 text-slate-400 dark:text-white/40">
                                <CalendarIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">No events for this day</p>
                            </div>
                        ) : (
                            selectedDayEvents.sort((a,b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()).map(event => (
                                <div key={event.id} className="bg-white dark:bg-white/5 p-3 rounded-lg border border-slate-200 dark:border-white/10 shadow-sm hover:shadow-md transition-shadow group">
                                    <div className="flex items-start gap-3">
                                        <div className={`w-1 h-full min-h-[2rem] rounded-full ${event.color || 'bg-slate-500'}`}></div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start">
                                                <h4 className="text-sm font-semibold text-slate-800 dark:text-white truncate">{event.title}</h4>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${
                                                    event.type === 'task' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' :
                                                    event.type === 'assignment' ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300' :
                                                    'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300'
                                                }`}>
                                                    {event.type}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-white/60 mt-1">
                                                <Clock className="w-3 h-3" />
                                                {new Date(event.startDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                            </div>
                                            {event.location && (
                                                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-white/60 mt-0.5">
                                                    <MapPin className="w-3 h-3" />
                                                    {event.location}
                                                </div>
                                            )}
                                            {event.description && (
                                                <p className="text-xs text-slate-600 dark:text-white/70 mt-2 bg-slate-50 dark:bg-black/20 p-2 rounded border border-slate-100 dark:border-white/5">
                                                    {event.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>

        {/* Add Event Modal */}
        {isAddEventOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-white/10">
                    <div className="p-4 border-b border-slate-200 dark:border-white/10 flex justify-between items-center bg-slate-50 dark:bg-white/5">
                        <h3 className="font-bold text-slate-800 dark:text-white">Add New Event</h3>
                        <button onClick={() => setIsAddEventOpen(false)} className="text-slate-500 hover:text-slate-800 dark:text-white/50 dark:hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <form onSubmit={handleAddEventSubmit} className="p-6 space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-white/50 uppercase mb-1">Event Title</label>
                            <input 
                                type="text" 
                                value={newEventTitle}
                                onChange={(e) => setNewEventTitle(e.target.value)}
                                className="w-full bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                placeholder="Meeting, Study Session, etc."
                                autoFocus
                                required
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 dark:text-white/50 uppercase mb-1">Start</label>
                                <input 
                                    type="datetime-local" 
                                    value={newEventStart}
                                    onChange={(e) => setNewEventStart(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 dark:text-white/50 uppercase mb-1">End</label>
                                <input 
                                    type="datetime-local" 
                                    value={newEventEnd}
                                    onChange={(e) => setNewEventEnd(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-white/50 uppercase mb-1">Location</label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input 
                                    type="text" 
                                    value={newEventLocation}
                                    onChange={(e) => setNewEventLocation(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    placeholder="Room 101, Online, etc."
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-white/50 uppercase mb-1">Description</label>
                            <div className="relative">
                                <AlignLeft className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <textarea 
                                    value={newEventDesc}
                                    onChange={(e) => setNewEventDesc(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[80px]"
                                    placeholder="Add details..."
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button 
                                type="button" 
                                onClick={() => setIsAddEventOpen(false)}
                                className="px-4 py-2 text-sm text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit" 
                                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium shadow-lg shadow-blue-500/20 transition-all"
                            >
                                Save Event
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}
    </div>
  );
};

export default CalendarView;
