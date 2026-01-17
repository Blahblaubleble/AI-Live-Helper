import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Trash2, Calendar, Flag, Circle, CheckCircle2, Clock, CalendarDays, MoreHorizontal, AlertCircle, ArrowUpDown, Check } from 'lucide-react';
import { Task } from '../types';

interface TodoListProps {
  tasks: Task[];
  onAddTask: (task: Task) => void;
  onToggleTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (taskId: string, newTitle: string) => void;
}

type SortOption = 'date' | 'priority' | 'added';

const TodoList: React.FC<TodoListProps> = ({ tasks, onAddTask, onToggleTask, onDeleteTask, onEditTask }) => {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [newDueDate, setNewDueDate] = useState<string>(''); // ISO String
  const [isInputFocused, setIsInputFocused] = useState(false);
  
  // UI State
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('date');
  
  // Edit State
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  
  const datePickerRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (datePickerRef.current && !datePickerRef.current.contains(target)) {
        setIsDatePickerOpen(false);
      }
      if (sortMenuRef.current && !sortMenuRef.current.contains(target)) {
        setIsSortMenuOpen(false);
      }
    };
    if (isDatePickerOpen || isSortMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDatePickerOpen, isSortMenuOpen]);

  // Force re-render every minute to update countdowns
  const [, setTick] = useState(0);
  useEffect(() => {
      const timer = setInterval(() => setTick(t => t + 1), 60000);
      return () => clearInterval(timer);
  }, []);

  // Group tasks logic based on Sort Option
  const groupedTasks = useMemo(() => {
    const completed = tasks.filter(t => t.completed).sort((a, b) => new Date(b.dueDate || b.createdAt).getTime() - new Date(a.dueDate || a.createdAt).getTime());
    const active = tasks.filter(t => !t.completed);

    if (sortBy === 'priority') {
        const high = active.filter(t => t.priority === 'High').sort((a,b) => new Date(a.dueDate || a.createdAt).getTime() - new Date(b.dueDate || b.createdAt).getTime());
        const medium = active.filter(t => t.priority === 'Medium').sort((a,b) => new Date(a.dueDate || a.createdAt).getTime() - new Date(b.dueDate || b.createdAt).getTime());
        const low = active.filter(t => t.priority === 'Low').sort((a,b) => new Date(a.dueDate || a.createdAt).getTime() - new Date(b.dueDate || b.createdAt).getTime());
        
        return [
            { title: 'High Priority', tasks: high, colorClass: 'text-red-500' },
            { title: 'Medium Priority', tasks: medium, colorClass: 'text-amber-500' },
            { title: 'Low Priority', tasks: low, colorClass: 'text-blue-500' },
            { title: 'Completed', tasks: completed, colorClass: 'text-slate-400 opacity-60' }
        ];
    } 
    
    if (sortBy === 'added') {
        const sorted = [...active].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return [
            { title: 'Recently Added', tasks: sorted, colorClass: 'text-indigo-500' },
            { title: 'Completed', tasks: completed, colorClass: 'text-slate-400 opacity-60' }
        ];
    }

    // Default: 'date' (Smart View)
    const now = new Date();
    // Normalize to start of today
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const tomorrowStart = todayStart + 86400000;

    const overdue: Task[] = [];
    const today: Task[] = [];
    const upcoming: Task[] = [];
    const later: Task[] = [];

    active.forEach(task => {
      if (!task.dueDate) {
        later.push(task);
        return;
      }
      const due = new Date(task.dueDate).getTime();
      if (due < todayStart) overdue.push(task);
      else if (due < tomorrowStart) today.push(task);
      else upcoming.push(task);
    });

    const sorter = (a: Task, b: Task) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    overdue.sort(sorter);
    today.sort(sorter);
    upcoming.sort(sorter);
    later.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return [
        { title: 'Overdue', tasks: overdue, colorClass: 'text-red-500' },
        { title: 'Today', tasks: today, colorClass: 'text-blue-500' },
        { title: 'Upcoming', tasks: upcoming, colorClass: 'text-purple-500' },
        { title: 'No Date', tasks: later, colorClass: 'text-slate-400' },
        { title: 'Completed', tasks: completed, colorClass: 'text-slate-400 opacity-60' }
    ];
  }, [tasks, sortBy]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    let dueIsoString = newDueDate;
    if (!dueIsoString) {
        // Default to Today end of day for better UX if they are in the "flow"
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

  const startEditing = (task: Task) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
  };

  const saveEdit = () => {
    if (editingTaskId && editTitle.trim()) {
      onEditTask(editingTaskId, editTitle.trim());
    }
    cancelEdit();
  };

  const cancelEdit = () => {
    setEditingTaskId(null);
    setEditTitle('');
  };

  const cyclePriority = () => {
      if (newPriority === 'Medium') setNewPriority('High');
      else if (newPriority === 'High') setNewPriority('Low');
      else setNewPriority('Medium');
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return 'text-red-500';
      case 'Medium': return 'text-amber-500';
      case 'Low': return 'text-blue-500';
      default: return 'text-slate-400';
    }
  };

  const getPriorityIcon = (priority: string) => {
      return <Flag className={`w-4 h-4 ${getPriorityColor(priority)} fill-current`} />;
  };

  const getTaskTiming = (dateStr: string) => {
    const due = new Date(dateStr);
    if (isNaN(due.getTime())) return { label: '', isOverdue: false, color: '' };

    const diffMs = due.getTime() - new Date().getTime();
    const isOverdue = diffMs < 0;
    
    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    
    let label = '';
    if (due.toDateString() === today.toDateString()) label = 'Today';
    else if (due.toDateString() === tomorrow.toDateString()) label = 'Tomorrow';
    else label = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    const timeStr = due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    
    return { 
        label: `${label} ${timeStr}`, 
        isOverdue,
        color: isOverdue ? 'text-red-500' : 'text-slate-400 dark:text-white/40'
    };
  };

  const renderTaskRow = (task: Task) => {
      const isEditing = editingTaskId === task.id;
      const timing = getTaskTiming(task.dueDate);

      return (
        <div 
          key={task.id}
          className="group relative flex items-start gap-3 py-3 px-3 -mx-3 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
        >
            <button
                onClick={() => onToggleTask(task.id)}
                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center
                    ${task.completed 
                        ? 'bg-blue-500 border-blue-500 text-white' 
                        : `border-slate-300 dark:border-white/20 hover:border-blue-500 ${getPriorityColor(task.priority).replace('text-', 'border-opacity-50 border-')}`
                    }`}
            >
                {task.completed && <CheckCircle2 className="w-3.5 h-3.5" />}
            </button>

            <div className="flex-1 min-w-0">
                {isEditing ? (
                    <input 
                        type="text" 
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit();
                            if (e.key === 'Escape') cancelEdit();
                        }}
                        autoFocus
                        className="w-full bg-transparent border-none p-0 text-sm text-slate-800 dark:text-white focus:ring-0 leading-tight"
                    />
                ) : (
                    <div className="flex flex-col gap-0.5">
                        <span 
                            onClick={() => !task.completed && startEditing(task)}
                            className={`text-sm font-medium leading-tight cursor-text transition-all ${
                                task.completed 
                                ? 'text-slate-400 dark:text-white/30 line-through' 
                                : 'text-slate-700 dark:text-white/90'
                            }`}
                        >
                            {task.title}
                        </span>
                        {!task.completed && (
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] flex items-center gap-1 ${timing.color}`}>
                                   {timing.isOverdue && <AlertCircle className="w-3 h-3" />}
                                   {timing.label}
                                </span>
                                {task.priority === 'High' && (
                                    <span className="text-[10px] text-red-500 font-medium bg-red-500/10 px-1.5 rounded">High</span>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                 <button onClick={() => onDeleteTask(task.id)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                     <Trash2 className="w-4 h-4" />
                 </button>
            </div>
        </div>
      );
  };

  const renderGroup = (title: string, groupTasks: Task[], colorClass: string = 'text-slate-500') => {
      if (groupTasks.length === 0) return null;
      return (
          <div key={title} className="mb-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <h3 className={`text-[10px] font-bold uppercase tracking-widest mb-2 px-1 ${colorClass}`}>
                  {title} <span className="opacity-50 ml-1">({groupTasks.length})</span>
              </h3>
              <div className="flex flex-col">
                  {groupTasks.map(renderTaskRow)}
              </div>
          </div>
      );
  };

  const getInputValue = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().slice(0, 16);
  };

  return (
    <div className="flex flex-col h-full relative">
        {/* Header Area */}
        <div className="px-6 pt-6 pb-2 shrink-0 z-10">
             <div className="flex items-end justify-between mb-6">
                 <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Tasks</h1>
                    <p className="text-xs text-slate-500 dark:text-white/50 font-medium">
                        {tasks.filter(t => !t.completed).length} items remaining
                    </p>
                 </div>
                 <div className="flex gap-1">
                    {/* Sort Menu */}
                    <div className="relative" ref={sortMenuRef}>
                        <button 
                            onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-white/60 transition-colors"
                            title="Sort Tasks"
                        >
                            <ArrowUpDown className="w-4 h-4" />
                        </button>
                        {isSortMenuOpen && (
                            <div className="absolute top-full right-0 mt-2 w-40 bg-white dark:bg-[#1c1c1e] rounded-xl shadow-xl border border-slate-200 dark:border-white/10 p-1 z-50 animate-in fade-in zoom-in-95 duration-200">
                                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 py-1.5">Sort By</div>
                                {['date', 'priority', 'added'].map((opt) => (
                                    <button
                                        key={opt}
                                        onClick={() => { setSortBy(opt as SortOption); setIsSortMenuOpen(false); }}
                                        className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between ${sortBy === opt ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300' : 'text-slate-700 dark:text-white hover:bg-slate-100 dark:hover:bg-white/10'}`}
                                    >
                                        {opt.charAt(0).toUpperCase() + opt.slice(1)}
                                        {sortBy === opt && <Check className="w-3 h-3" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                 </div>
             </div>

             {/* Integrated Input Bar */}
             <form onSubmit={handleSubmit} className="relative group z-20">
                 <div className={`
                    flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 border
                    ${isInputFocused 
                        ? 'bg-white dark:bg-[#1c1c1e] border-blue-500/50 shadow-lg shadow-blue-500/10 scale-[1.01]' 
                        : 'bg-white/50 dark:bg-white/5 border-transparent hover:bg-white dark:hover:bg-white/10 hover:shadow-md'}
                 `}>
                     <div className={`transition-colors duration-300 ${isInputFocused ? 'text-blue-500' : 'text-slate-400'}`}>
                         <Plus className="w-5 h-5" />
                     </div>
                     
                     <input
                        ref={inputRef}
                        type="text"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        onFocus={() => setIsInputFocused(true)}
                        onBlur={() => {
                            if (!newTaskTitle) setIsInputFocused(false);
                        }}
                        placeholder="Add a task..."
                        className="flex-1 bg-transparent border-none p-0 text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:ring-0"
                     />

                     {/* Actions within Input */}
                     <div className={`flex items-center gap-1 transition-all duration-300 ${isInputFocused || newTaskTitle ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'}`}>
                         
                         {/* Date Picker Trigger */}
                         <div className="relative" ref={datePickerRef}>
                            <button 
                                type="button"
                                onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                                className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors ${newDueDate ? 'text-blue-500' : 'text-slate-400'}`}
                                title="Set Due Date"
                            >
                                <CalendarDays className="w-4 h-4" />
                            </button>
                            {isDatePickerOpen && (
                                <div className="absolute top-full right-0 mt-2 p-3 bg-white dark:bg-[#1c1c1e] rounded-xl shadow-xl border border-slate-200 dark:border-white/10 w-64 animate-in fade-in zoom-in-95 duration-200 z-50">
                                    <h4 className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Due Date</h4>
                                    <input 
                                        type="datetime-local"
                                        value={getInputValue(newDueDate)}
                                        onChange={(e) => {
                                            if(e.target.value) {
                                                setNewDueDate(new Date(e.target.value).toISOString());
                                            } else {
                                                setNewDueDate('');
                                            }
                                        }}
                                        className="w-full bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-white [color-scheme:light] dark:[color-scheme:dark]"
                                    />
                                    <div className="flex gap-2 mt-2">
                                        <button type="button" onClick={() => {
                                            const d = new Date(); d.setHours(23,59,59,999);
                                            setNewDueDate(d.toISOString());
                                            setIsDatePickerOpen(false);
                                        }} className="flex-1 py-1 bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 rounded text-[10px] font-medium hover:bg-blue-100">Today</button>
                                        <button type="button" onClick={() => {
                                            const d = new Date(); d.setDate(d.getDate()+1); d.setHours(23,59,59,999);
                                            setNewDueDate(d.toISOString());
                                            setIsDatePickerOpen(false);
                                        }} className="flex-1 py-1 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white rounded text-[10px] font-medium hover:bg-slate-200">Tmrw</button>
                                    </div>
                                </div>
                            )}
                         </div>

                         {/* Priority Trigger */}
                         <button 
                            type="button"
                            onClick={cyclePriority}
                            className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors`}
                            title="Set Priority"
                         >
                            {getPriorityIcon(newPriority)}
                         </button>
                     </div>
                 </div>
             </form>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto px-6 pb-10 space-y-2">
            {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 opacity-40">
                    <CheckCircle2 className="w-12 h-12 text-slate-300 dark:text-white/20 mb-3" />
                    <p className="text-sm text-slate-500 dark:text-white/40">No tasks yet</p>
                </div>
            ) : (
                <>
                    {groupedTasks.map(group => renderGroup(group.title, group.tasks, group.colorClass))}
                </>
            )}
        </div>
    </div>
  );
};

export default TodoList;