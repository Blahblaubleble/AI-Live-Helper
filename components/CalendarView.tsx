import React, { useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { CalendarEvent, Task, Assignment, Routine } from '../types';
import { computeSchedule } from '../utils/scheduler';
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, AlignLeft, Calendar as CalendarIcon, X } from 'lucide-react';

export interface CalendarViewProps {
  events: CalendarEvent[];
  tasks: Task[];
  assignments: Assignment[];
  routines?: Routine[];
  onAddEvent: (event: CalendarEvent) => void;
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  viewType: 'month' | 'week';
}

export interface CalendarViewRef {
  openAddEvent: () => void;
}

const CalendarView = forwardRef<CalendarViewRef, CalendarViewProps>(({ 
    events, tasks, assignments, routines = [], onAddEvent,
    currentDate, setCurrentDate, viewType
}, ref) => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  
  // New Event State
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventStart, setNewEventStart] = useState('');
  const [newEventEnd, setNewEventEnd] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventLocation, setNewEventLocation] = useState('');

  useImperativeHandle(ref, () => ({
      openAddEvent: () => {
          const now = new Date();
          setSelectedDate(now);
          setNewEventStart(now.toISOString().slice(0, 16));
          setIsAddEventOpen(true);
      }
  }));

  // Combine all items into a unified event list
  const allEvents = useMemo(() => {
    return computeSchedule(events, tasks, assignments, routines, currentDate, viewType);
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
      days.push(<div key={`pad-${i}`} className="min-h-[80px] h-full bg-slate-50/50 dark:bg-white/5 border border-slate-100 dark:border-white/5" />);
    }

    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
      const dayEvents = allEvents.filter(e => {
          const eStart = new Date(e.startDate);
          const eEnd = new Date(e.endDate);
          const dayStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
          const dayEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), d, 23, 59, 59, 999);
          return eStart <= dayEnd && eEnd > dayStart;
      });

      const isToday = new Date().toDateString() === date.toDateString();
      const isSelected = selectedDate?.toDateString() === date.toDateString();

      days.push(
        <div 
            key={d} 
            onClick={() => handleDateClick(d)}
            className={`min-h-[80px] h-full border border-slate-100 dark:border-white/5 p-1 relative group cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5 flex flex-col ${isSelected ? 'bg-blue-50 dark:bg-blue-500/10 ring-1 ring-inset ring-blue-500 z-10' : ''}`}
        >
            <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0 ${isToday ? 'bg-blue-600 text-white' : 'text-slate-700 dark:text-white'}`}>
                {d}
            </div>
            <div className="space-y-1 overflow-y-auto flex-1 custom-scrollbar">
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
            <div className="grid grid-cols-7 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex-shrink-0">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="py-2 text-center text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider">
                        {day}
                    </div>
                ))}
            </div>
            <div className="flex-1 grid grid-cols-7 auto-rows-fr">
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
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-black/20">
              {/* Scroll Container */}
              <div className="flex-1 overflow-y-auto relative">
                  {/* Sticky Header */}
                  <div className="sticky top-0 z-30 grid grid-cols-8 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1a1f2e] flex-shrink-0 shadow-sm">
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
                  
                  {/* Time Grid (Main Area) */}
                  <div className="grid grid-cols-8 relative h-[1440px]">
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
                          const dayStart = new Date(dayDate);
                          dayStart.setHours(0, 0, 0, 0);
                          const dayEnd = new Date(dayDate);
                          dayEnd.setHours(23, 59, 59, 999);

                          const dayEvents = allEvents.filter(e => {
                              const eStart = new Date(e.startDate);
                              const eEnd = new Date(e.endDate);
                              // We include the event in this column if it overlaps the current day
                              return eStart <= dayEnd && eEnd > dayStart;
                          });

                          return (
                              <div key={dayIndex} className="relative border-r border-slate-200 dark:border-white/10 last:border-r-0">
                                  {/* Grid Lines */}
                                  {hours.map(h => (
                                      <div key={h} className="h-[60px] border-b border-slate-200 dark:border-white/10 pointer-events-none" />
                                  ))}

                                  {/* Events */}
                                  {(() => {
                                      const mapped = dayEvents.map(event => {
                                          const start = new Date(event.startDate);
                                          const end = new Date(event.endDate);
                                          
                                          const viewStart = start < dayStart ? dayStart : start;
                                          const viewEnd = end > dayEnd ? dayEnd : end;

                                          const startMinutes = viewStart.getHours() * 60 + viewStart.getMinutes();
                                          let durationMinutes = (viewEnd.getTime() - viewStart.getTime()) / (1000 * 60);
                                          const duration = durationMinutes; // exact duration
                                          const endMinutes = startMinutes + duration;
                                          
                                          return { event, start, startMinutes, duration, endMinutes };
                                      }).sort((a, b) => a.startMinutes - b.startMinutes);

                                      const columns: typeof mapped[] = [];
                                      mapped.forEach(evt => {
                                          let placed = false;
                                          for (const col of columns) {
                                              if (!col.some(e => Math.max(evt.startMinutes, e.startMinutes) < Math.min(evt.endMinutes, e.endMinutes))) {
                                                  col.push(evt);
                                                  placed = true;
                                                  break;
                                              }
                                          }
                                          if (!placed) columns.push([evt]);
                                      });

                                      return mapped.map(evt => {
                                          const colIndex = columns.findIndex(col => col.includes(evt));
                                          const numCols = columns.length;
                                          
                                          return (
                                              <div
                                                  key={evt.event.id}
                                                  className={`absolute rounded px-1.5 py-0.5 text-[10px] text-white overflow-hidden shadow-sm hover:z-[20] hover:shadow-md transition-all cursor-pointer border border-black/10 dark:border-white/10 flex flex-col justify-start ${evt.event.color || 'bg-slate-500'}`}
                                                  style={{
                                                      top: `${evt.startMinutes + 1}px`,
                                                      height: `${Math.max(evt.duration - 2, 12)}px`,
                                                      left: `calc(${colIndex * (100 / numCols)}% + 2px)`,
                                                      width: `calc(${100 / numCols}% - 4px)`,
                                                      opacity: 0.95
                                                  }}
                                                  onClick={(e) => {
                                                      e.stopPropagation();
                                                      setSelectedDate(dayDate);
                                                  }}
                                                  title={`${evt.event.title} (${evt.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})})`}
                                              >
                                                  <div className="font-semibold truncate leading-none mt-0.5">{evt.event.title}</div>
                                                  {evt.duration >= 30 && <div className="truncate opacity-80 leading-tight mt-0.5">{evt.start.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}</div>}
                                              </div>
                                          );
                                      });
                                  })()}
                              </div>
                          );
                      })}
                  </div>
                  
                  {/* Current Time Indicator */}
                  {weekDays.some(d => d.toDateString() === new Date().toDateString()) && (
                      <div 
                          className="absolute right-0 border-t-2 border-red-500 z-20 pointer-events-none flex items-center"
                          style={{ 
                              top: `${((new Date().getHours() * 60 + new Date().getMinutes()) / 60) * 60}px`,
                              left: `${(weekDays.findIndex(d => d.toDateString() === new Date().toDateString()) + 1) * (100/8)}%`,
                              width: `${100/8}%`
                           }}
                      >
                          <div className="w-2 h-2 rounded-full bg-red-500 -mt-[5px] -ml-[4px]"></div>
                      </div>
                  )}
              </div>
          </div>
      );
  };

  const selectedDayEvents = selectedDate ? allEvents.filter(e => {
      const eStart = new Date(e.startDate);
      const eEnd = new Date(e.endDate);
      const dayStart = new Date(selectedDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(selectedDate);
      dayEnd.setHours(23, 59, 59, 999);
      return eStart <= dayEnd && eEnd > dayStart;
  }) : [];

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-black/20 overflow-hidden">
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
});

export default CalendarView;
