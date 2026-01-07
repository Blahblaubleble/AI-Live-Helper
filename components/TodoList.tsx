import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Check, Trash2, Calendar, AlertCircle, ListTodo, Clock, X } from 'lucide-react';
import { Task } from '../types';

interface TodoListProps {
  tasks: Task[];
  onAddTask: (task: Task) => void;
  onToggleTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
}

const TodoList: React.FC<TodoListProps> = ({ tasks, onAddTask, onToggleTask, onDeleteTask }) => {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [newDueDate, setNewDueDate] = useState<string>(''); // ISO String
  const [hideCompleted, setHideCompleted] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  
  const datePickerRef = useRef<HTMLDivElement>(null);

  // Close date picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setIsDatePickerOpen(false);
      }
    };
    if (isDatePickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDatePickerOpen]);

  // Force re-render every minute to update countdowns
  const [, setTick] = useState(0);
  useEffect(() => {
      const timer = setInterval(() => setTick(t => t + 1), 60000);
      return () => clearInterval(timer);
  }, []);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      // 1. Incomplete first
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      // 2. Due Date ascending (Overdue first)
      const dateA = new Date(a.dueDate).getTime();
      const dateB = new Date(b.dueDate).getTime();
      // Handle invalid dates by pushing them to the end
      if (isNaN(dateA)) return 1;
      if (isNaN(dateB)) return -1;
      return dateA - dateB;
    });
  }, [tasks]);

  const filteredTasks = sortedTasks.filter(t => !hideCompleted || !t.completed);
  const pendingCount = tasks.filter(t => !t.completed).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    let dueIsoString = newDueDate;
    if (!dueIsoString) {
        // Default to end of today if not selected
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        dueIsoString = today.toISOString();
    }

    const newTask: Task = {
      id: Math.random().toString(36).substring(2, 9),
      title: newTaskTitle.trim(),
      completed: false,
      priority: newPriority,
      dueDate: dueIsoString,
      createdAt: new Date().toISOString(),
    };

    onAddTask(newTask);
    setNewTaskTitle('');
    setNewPriority('Medium');
    setNewDueDate('');
    setIsDatePickerOpen(false);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'Medium': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'Low': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      default: return 'bg-slate-700 text-slate-400';
    }
  };

  const getTaskTiming = (dateStr: string) => {
    const due = new Date(dateStr);
    
    // Safety check for invalid dates
    if (isNaN(due.getTime())) {
        return { friendlyDate: 'Invalid Date', countdown: '--', isOverdue: false };
    }

    const now = new Date();
    
    const diffMs = due.getTime() - now.getTime();
    const isOverdue = diffMs < 0;
    const absDiff = Math.abs(diffMs);
    
    const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
    
    // Calendar Date Label
    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    
    let friendlyDate = '';
    try {
        friendlyDate = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) {
        friendlyDate = 'Invalid Date';
    }

    if (due.toDateString() === today.toDateString()) friendlyDate = 'Today';
    else if (due.toDateString() === tomorrow.toDateString()) friendlyDate = 'Tomorrow';
    else if (due.toDateString() === yesterday.toDateString()) friendlyDate = 'Yesterday';

    const timeStr = due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const fullDate = `${friendlyDate}, ${timeStr}`;

    // Countdown string
    let countdown = '';
    if (days > 0) countdown = `${days}d ${hours}h`;
    else if (hours > 0) countdown = `${hours}h ${minutes}m`;
    else countdown = `${minutes}m`;
    
    if (diffMs === 0) countdown = "Now";
    else countdown = isOverdue ? `${countdown} late` : `${countdown} left`;

    return { friendlyDate: fullDate, countdown, isOverdue };
  };

  const getDueDateLabel = () => {
      if (!newDueDate) return "Today";
      const timing = getTaskTiming(newDueDate);
      return timing.friendlyDate;
  };

  // Convert UTC ISO string to "YYYY-MM-DDThh:mm" (Local Time) for input value
  const getInputValue = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    
    // We want the input to show the LOCAL time corresponding to this UTC timestamp.
    // datetime-local expects "YYYY-MM-DDThh:mm" representing local time.
    // date.toISOString() returns UTC.
    // To get a string that looks like local time but formatted as ISO, we can shift the time by the timezone offset.
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().slice(0, 16);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Header / Quick Add */}
      <div className="p-4 bg-slate-800/50 border-b border-slate-700 space-y-4 z-20">
        <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <ListTodo className="w-4 h-4 text-blue-400" />
                Tasks
            </h3>
            <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Hide Done</span>
                <button 
                  onClick={() => setHideCompleted(!hideCompleted)}
                  className={`w-8 h-4 rounded-full relative transition-colors ${hideCompleted ? 'bg-blue-600' : 'bg-slate-600'}`}
                >
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${hideCompleted ? 'left-4.5' : 'left-0.5'}`} style={{ left: hideCompleted ? '1.125rem' : '0.125rem'}} />
                </button>
            </div>
        </div>

        {/* Improved Add Task Form */}
        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 transition-all relative">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="What needs to be done?"
            className="w-full bg-transparent text-sm text-slate-200 focus:outline-none placeholder-slate-600 mb-3"
          />
          
          <div className="flex items-center justify-between gap-2 relative">
             {/* Date Picker Trigger */}
             <div className="relative" ref={datePickerRef}>
                <button
                    type="button"
                    onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        newDueDate 
                        ? 'bg-blue-500/10 text-blue-300 border-blue-500/30 hover:bg-blue-500/20' 
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-slate-200'
                    }`}
                >
                    <Calendar className="w-3.5 h-3.5" />
                    {getDueDateLabel()}
                    {newDueDate && (
                        <div 
                            onClick={(e) => { e.stopPropagation(); setNewDueDate(''); }}
                            className="ml-1 p-0.5 hover:bg-blue-500/30 rounded-full"
                        >
                            <X className="w-3 h-3" />
                        </div>
                    )}
                </button>

                {/* Custom Popover (Redesigned) */}
                {isDatePickerOpen && (
                    <div className="absolute top-full left-0 mt-2 p-4 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-left min-w-[300px]">
                        <label className="block text-xs font-semibold text-slate-400 mb-3 flex items-center gap-2">
                             <Clock className="w-4 h-4 text-blue-400" />
                             Pick a Date & Time
                        </label>
                        <input 
                            type="datetime-local"
                            value={getInputValue(newDueDate)}
                            max="9999-12-31T23:59"
                            onChange={(e) => {
                                if(e.target.value) {
                                    const date = new Date(e.target.value);
                                    if (!isNaN(date.getTime()) && date.getFullYear() <= 9999) {
                                        setNewDueDate(date.toISOString());
                                    }
                                } else {
                                    setNewDueDate('');
                                }
                            }}
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all [color-scheme:dark]"
                            autoFocus
                        />
                        <div className="mt-3 flex justify-end">
                            <button 
                                type="button"
                                onClick={() => setIsDatePickerOpen(false)}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors shadow-lg"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                )}
             </div>
             
             {/* Priority & Submit */}
             <div className="flex items-center gap-2 shrink-0">
                 <div className="relative">
                    <select 
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="appearance-none bg-slate-800 text-xs font-medium text-slate-300 border border-slate-700 rounded-lg py-1.5 pl-3 pr-8 focus:outline-none focus:border-blue-500/50 cursor-pointer hover:bg-slate-750"
                    title="Priority"
                    >
                        <option value="High">High Priority</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                    </select>
                    <div className="absolute right-2 top-1.5 pointer-events-none text-slate-500 text-[10px]">
                        ▼
                    </div>
                 </div>

                 <button
                    type="submit"
                    disabled={!newTaskTitle.trim()}
                    className="p-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors shadow-lg flex items-center justify-center"
                 >
                    <Plus className="w-4 h-4" />
                 </button>
             </div>
          </div>
        </form>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filteredTasks.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2 opacity-50">
                <Check className="w-12 h-12" />
                <p className="text-sm">All caught up!</p>
            </div>
        )}

        {filteredTasks.map(task => {
            const timing = getTaskTiming(task.dueDate);
            
            return (
                <div 
                  key={task.id}
                  className={`group flex items-start p-3 rounded-lg border transition-all duration-300 ${
                      task.completed 
                      ? 'bg-slate-900/50 border-transparent opacity-50 grayscale' 
                      : 'bg-slate-800 border-slate-700 hover:border-slate-600 shadow-sm'
                  } ${timing.isOverdue && !task.completed ? 'border-l-4 border-l-red-500 bg-red-900/5' : ''}`}
                >
                   <button
                     onClick={() => onToggleTask(task.id)}
                     className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                         task.completed 
                         ? 'bg-blue-600 border-blue-600 text-white' 
                         : 'border-slate-500 hover:border-blue-400 text-transparent'
                     }`}
                   >
                     <Check className="w-3.5 h-3.5" />
                   </button>
                   
                   <div className="ml-3 flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                          <span className={`text-sm truncate font-medium ${task.completed ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                              {task.title}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wide font-bold shrink-0 ${getPriorityColor(task.priority)}`}>
                              {task.priority}
                          </span>
                      </div>
                      
                      <div className="flex flex-wrap items-center mt-1 gap-x-3 gap-y-1">
                          <div className={`flex items-center text-xs ${timing.isOverdue && !task.completed ? 'text-red-400' : 'text-slate-500'}`} title={timing.friendlyDate}>
                              <Calendar className="w-3 h-3 mr-1" />
                              {timing.friendlyDate}
                          </div>
                          {!task.completed && (
                            <div className={`flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                timing.isOverdue 
                                ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                                : 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                            }`}>
                                <Clock className="w-3 h-3 mr-1" />
                                {timing.countdown}
                            </div>
                          )}
                      </div>
                   </div>

                   <button 
                     onClick={() => onDeleteTask(task.id)}
                     className="ml-2 opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                   >
                       <Trash2 className="w-4 h-4" />
                   </button>
                </div>
            );
        })}
      </div>

      {/* Footer Stats */}
      <div className="p-3 bg-slate-900 border-t border-slate-800 text-[10px] text-slate-500 flex justify-between uppercase tracking-wider font-medium">
          <span>{pendingCount} Pending</span>
          <span>Auto-Refreshes</span>
      </div>
    </div>
  );
};

export default TodoList;