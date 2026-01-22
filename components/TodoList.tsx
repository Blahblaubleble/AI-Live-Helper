import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Trash2, Calendar as CalendarIcon, Flag, CheckCircle2, AlertCircle, ArrowUpDown, Check, ChevronRight, ChevronDown, X, ChevronLeft, Clock, CornerDownRight, CalendarOff, Sun, Sunset, Moon } from 'lucide-react';
import { Task } from '../types';

interface TodoListProps {
  tasks: Task[];
  onAddTask: (task: Task) => void;
  onToggleTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (taskId: string, newTitle: string) => void;
  onAddSubtask: (parentId: string, subtaskTitle: string) => void;
  onToggleSubtask: (parentId: string, subtaskId: string) => void;
  onDeleteSubtask: (parentId: string, subtaskId: string) => void;
}

type SortOption = 'date' | 'priority' | 'added';
type Priority = 'Low' | 'Medium' | 'High';

// --- Custom Date & Priority Picker Component ---
interface DatePriorityPickerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date | null;
  onDateChange: (date: Date | null) => void;
  selectedPriority: Priority;
  onPriorityChange: (p: Priority) => void;
}

const DatePriorityPicker: React.FC<DatePriorityPickerProps> = ({ 
  isOpen, onClose, selectedDate, onDateChange, selectedPriority, onPriorityChange 
}) => {
  const [viewDate, setViewDate] = useState(selectedDate || new Date());
  // Time state (HH, MM strings)
  const [hour, setHour] = useState(selectedDate ? selectedDate.getHours().toString().padStart(2, '0') : '23');
  const [minute, setMinute] = useState(selectedDate ? selectedDate.getMinutes().toString().padStart(2, '0') : '59');

  // Reset view when opened
  useEffect(() => {
    if (isOpen) {
        if (selectedDate) {
            setViewDate(selectedDate);
            setHour(selectedDate.getHours().toString().padStart(2, '0'));
            setMinute(selectedDate.getMinutes().toString().padStart(2, '0'));
        } else {
            setViewDate(new Date());
            setHour('23');
            setMinute('59');
        }
    }
  }, [isOpen, selectedDate]);

  if (!isOpen) return null;

  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const startDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay(); // 0 = Sunday
  
  const generateGrid = () => {
    const grid = [];
    // Padding for previous month
    for (let i = 0; i < startDay; i++) {
      grid.push(<div key={`pad-${i}`} className="w-8 h-8" />);
    }
    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      const currentDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), d);
      // Compare only dates, ignore time
      const isSelected = selectedDate && currentDate.toDateString() === selectedDate.toDateString();
      const isToday = new Date().toDateString() === currentDate.toDateString();
      
      grid.push(
        <button
          key={`day-${d}`}
          type="button"
          onMouseDown={(e) => e.preventDefault()} // Prevent blur
          onClick={() => {
             const newDate = new Date(currentDate);
             newDate.setHours(parseInt(hour), parseInt(minute));
             onDateChange(newDate);
          }}
          className={`w-8 h-8 text-xs rounded-full flex items-center justify-center transition-all
            ${isSelected ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-white'}
            ${isToday && !isSelected ? 'ring-1 ring-blue-500 font-bold text-blue-500' : ''}
          `}
        >
          {d}
        </button>
      );
    }
    return grid;
  };

  const changeMonth = (delta: number) => {
    const newDate = new Date(viewDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setViewDate(newDate);
  };
  
  const changeYear = (delta: number) => {
    const newDate = new Date(viewDate);
    newDate.setFullYear(newDate.getFullYear() + delta);
    setViewDate(newDate);
  };

  const handleTimeUpdate = (newH: string, newM: string) => {
      setHour(newH);
      setMinute(newM);
      if (selectedDate) {
          const d = new Date(selectedDate);
          d.setHours(parseInt(newH), parseInt(newM));
          onDateChange(d);
      }
  };

  const setPresetTime = (h: number, m: number) => {
      handleTimeUpdate(h.toString().padStart(2, '0'), m.toString().padStart(2, '0'));
  };

  const handleQuickSelect = (type: 'today' | 'tomorrow' | 'none') => {
      if (type === 'none') {
          onDateChange(null);
      } else {
          const d = new Date();
          if (type === 'tomorrow') d.setDate(d.getDate() + 1);
          // Default to end of day
          d.setHours(23, 59, 59, 999);
          setHour('23'); setMinute('59');
          onDateChange(d);
          setViewDate(d);
      }
  };

  const getPriorityColor = (p: Priority) => {
      switch(p) {
          case 'High': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30';
          case 'Medium': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30';
          case 'Low': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30';
      }
  };

  const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const MINUTES = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

  return (
    <div 
        onClick={(e) => e.stopPropagation()} 
        onMouseDown={(e) => e.preventDefault()} // Prevent losing focus on parent input
        className="absolute top-full right-0 mt-2 p-4 bg-white dark:bg-[#1c1c1e] rounded-xl shadow-2xl border border-slate-200 dark:border-white/10 w-72 animate-in fade-in zoom-in-95 duration-200 z-50 select-none"
    >
       {/* Quick Select Row */}
       <div className="flex gap-2 mb-3">
           <button 
             type="button" 
             onClick={() => handleQuickSelect('today')}
             className="flex-1 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-md text-[10px] font-medium text-slate-700 dark:text-white transition-colors"
           >
             Today
           </button>
           <button 
             type="button" 
             onClick={() => handleQuickSelect('tomorrow')}
             className="flex-1 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-md text-[10px] font-medium text-slate-700 dark:text-white transition-colors"
           >
             Tomorrow
           </button>
           <button 
             type="button" 
             onClick={() => handleQuickSelect('none')}
             className={`flex-1 py-1.5 rounded-md text-[10px] font-medium transition-colors flex items-center justify-center gap-1 ${!selectedDate ? 'bg-slate-800 text-white dark:bg-white dark:text-black shadow-sm' : 'bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10'}`}
           >
             <CalendarOff className="w-3 h-3" /> No Date
           </button>
       </div>

       {/* Header: Month & Year Navigation */}
       <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-1">
             <button type="button" onClick={() => changeMonth(-1)} className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500"><ChevronLeft className="w-4 h-4" /></button>
             <span className="text-sm font-bold text-slate-800 dark:text-white w-20 text-center">{viewDate.toLocaleString('default', { month: 'short' })}</span>
             <button type="button" onClick={() => changeMonth(1)} className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500"><ChevronRight className="w-4 h-4" /></button>
          </div>
          
          <div className="h-4 w-px bg-slate-200 dark:bg-white/10 mx-1"></div>

          <div className="flex items-center gap-1">
             <button type="button" onClick={() => changeYear(-1)} className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500"><ChevronLeft className="w-4 h-4" /></button>
             <span className="text-sm font-bold text-slate-800 dark:text-white w-12 text-center">{viewDate.getFullYear()}</span>
             <button type="button" onClick={() => changeYear(1)} className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500"><ChevronRight className="w-4 h-4" /></button>
          </div>
       </div>

       {/* Days Header */}
       <div className="grid grid-cols-7 mb-2 text-center border-b border-slate-100 dark:border-white/5 pb-2">
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
              <span key={d} className="text-[10px] text-slate-400 dark:text-white/40 font-medium uppercase">{d}</span>
          ))}
       </div>

       {/* Calendar Grid */}
       <div className="grid grid-cols-7 gap-y-1 justify-items-center mb-4">
          {generateGrid()}
       </div>

       {/* Time & Priority Section */}
       <div className="space-y-3 bg-slate-50 dark:bg-white/5 p-3 rounded-lg border border-slate-100 dark:border-white/5">
           {/* Time Selector - Only show if date is selected */}
           {selectedDate && (
            <div className="flex items-center justify-between animate-in fade-in slide-in-from-top-1">
               <div className="flex gap-1.5">
                    <button type="button" onClick={() => setPresetTime(9, 0)} className="p-1.5 rounded hover:bg-white dark:hover:bg-white/10 text-slate-500 dark:text-white/60 transition-colors" title="Morning (9:00)">
                        <Sun className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setPresetTime(13, 0)} className="p-1.5 rounded hover:bg-white dark:hover:bg-white/10 text-slate-500 dark:text-white/60 transition-colors" title="Afternoon (13:00)">
                        <Sunset className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setPresetTime(17, 0)} className="p-1.5 rounded hover:bg-white dark:hover:bg-white/10 text-slate-500 dark:text-white/60 transition-colors" title="Evening (17:00)">
                        <Moon className="w-4 h-4" />
                    </button>
               </div>
               
               <div className="flex items-center gap-1 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded px-1.5 py-0.5">
                  <select 
                    value={hour} 
                    onChange={(e) => handleTimeUpdate(e.target.value, minute)}
                    className="bg-transparent text-xs font-mono text-slate-800 dark:text-white outline-none appearance-none cursor-pointer py-1 text-center w-8 hover:text-blue-500"
                  >
                     {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span className="text-slate-400 text-xs">:</span>
                  <select 
                    value={minute} 
                    onChange={(e) => handleTimeUpdate(hour, e.target.value)}
                    className="bg-transparent text-xs font-mono text-slate-800 dark:text-white outline-none appearance-none cursor-pointer py-1 text-center w-8 hover:text-blue-500"
                  >
                     {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
               </div>
            </div>
           )}

           {/* Priority Selector */}
           <div className="space-y-1.5 pt-1">
               <div className="flex items-center justify-between">
                   <span className="text-[10px] text-slate-400 dark:text-white/40 uppercase tracking-wider font-semibold">Priority</span>
               </div>
               <div className="flex gap-2">
                   {(['Low', 'Medium', 'High'] as Priority[]).map(p => (
                       <button
                          key={p}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => onPriorityChange(p)}
                          className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-all ${selectedPriority === p ? getPriorityColor(p) : 'bg-white dark:bg-white/5 border-transparent text-slate-500 hover:bg-white dark:hover:bg-white/10'}`}
                       >
                           {p}
                       </button>
                   ))}
               </div>
           </div>
       </div>
       
       {/* Actions */}
       <div className="mt-4">
           <button 
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClose}
              className="w-full bg-slate-900 dark:bg-white text-white dark:text-black rounded-lg text-xs font-semibold py-2 shadow-sm hover:opacity-90 transition-opacity"
           >
               Done
           </button>
       </div>
    </div>
  );
};


// --- Main Component ---

const TodoList: React.FC<TodoListProps> = ({ 
    tasks, 
    onAddTask, 
    onToggleTask, 
    onDeleteTask, 
    onEditTask, 
    onAddSubtask,
    onToggleSubtask,
    onDeleteSubtask
}) => {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('Medium');
  const [newDueDate, setNewDueDate] = useState<Date | null>(null);
  
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // Controls the unified date/priority popover
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  
  // Edit State
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Subtask Adding State (Inline)
  const [addingSubtaskTo, setAddingSubtaskTo] = useState<string | null>(null);
  const [subtaskInput, setSubtaskInput] = useState('');
  
  const settingsRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (settingsRef.current && !settingsRef.current.contains(target)) {
        setIsSettingsOpen(false);
      }
      if (sortMenuRef.current && !sortMenuRef.current.contains(target)) {
        setIsSortMenuOpen(false);
      }
    };
    if (isSettingsOpen || isSortMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSettingsOpen, isSortMenuOpen]);

  // Force re-render every minute to update countdowns
  const [, setTick] = useState(0);
  useEffect(() => {
      const timer = setInterval(() => setTick(t => t + 1), 60000);
      return () => clearInterval(timer);
  }, []);

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

    const now = new Date();
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
      if (isNaN(due)) {
          later.push(task);
          return;
      }
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

    let finalDueDate = newDueDate ? newDueDate.toISOString() : '';
    if (!finalDueDate && newDueDate === null) {
        // Optional: leave empty if user didn't select one
    }

    const newTask: Task = {
      id: Math.random().toString(36).substring(2, 9),
      title: newTaskTitle.trim(),
      completed: false,
      priority: newPriority,
      dueDate: finalDueDate,
      createdAt: new Date().toISOString(),
      subtasks: []
    };

    onAddTask(newTask);
    setNewTaskTitle('');
    setNewPriority('Medium');
    setNewDueDate(null);
    setIsSettingsOpen(false);
    // Keep focus
    if(inputRef.current) inputRef.current.focus();
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

  const toggleExpand = (taskId: string) => {
      const newSet = new Set(expandedTaskIds);
      if (newSet.has(taskId)) {
          newSet.delete(taskId);
      } else {
          newSet.add(taskId);
      }
      setExpandedTaskIds(newSet);
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

  const handleInlineSubtaskSubmit = (e: React.FormEvent, taskId: string) => {
      e.preventDefault();
      if (subtaskInput.trim()) {
          onAddSubtask(taskId, subtaskInput.trim());
          setSubtaskInput('');
          // Keep input open for rapid adding
          // setAddingSubtaskTo(null); 
      }
  };

  const renderTaskRow = (task: Task) => {
      const isEditing = editingTaskId === task.id;
      const timing = getTaskTiming(task.dueDate);
      const isExpanded = expandedTaskIds.has(task.id);
      const isAddingSubtask = addingSubtaskTo === task.id;
      const subtasks = task.subtasks || [];
      const completedSubtasks = subtasks.filter(st => st.completed).length;

      return (
        <div key={task.id} className="flex flex-col">
            {/* Main Task Row */}
            <div className="group relative flex items-start gap-3 py-3 px-3 -mx-3 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                
                <button 
                    onClick={() => toggleExpand(task.id)}
                    className={`mt-1 -ml-1 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors ${subtasks.length === 0 && !isAddingSubtask ? 'opacity-0 group-hover:opacity-50' : ''}`}
                >
                    {(isExpanded || isAddingSubtask) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>

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
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] flex items-center gap-1 ${timing.color}`}>
                                        {timing.isOverdue && <AlertCircle className="w-3 h-3" />}
                                        {timing.label}
                                        </span>
                                        {task.priority === 'High' && (
                                            <span className="text-[10px] text-red-500 font-medium bg-red-500/10 px-1.5 rounded">High</span>
                                        )}
                                    </div>
                                    {subtasks.length > 0 && (
                                        <span className="text-[10px] text-slate-400 dark:text-white/40">
                                            {completedSubtasks}/{subtasks.length} subtasks
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                     <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!isExpanded) toggleExpand(task.id);
                            setAddingSubtaskTo(task.id);
                            setSubtaskInput('');
                        }} 
                        className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors"
                        title="Add Subtask"
                     >
                         <Plus className="w-4 h-4" />
                     </button>
                     <button onClick={() => onDeleteTask(task.id)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                         <Trash2 className="w-4 h-4" />
                     </button>
                </div>
            </div>

            {/* Subtasks Section */}
            {(isExpanded || isAddingSubtask) && (
                <div className="ml-11 mb-2 space-y-1 animate-in slide-in-from-top-1 duration-200">
                    {subtasks.map(subtask => (
                        <div key={subtask.id} className="flex items-center gap-3 py-1.5 group/sub">
                            <button
                                onClick={() => onToggleSubtask(task.id, subtask.id)}
                                className={`flex-shrink-0 w-3.5 h-3.5 rounded-full border transition-all duration-200 flex items-center justify-center
                                    ${subtask.completed 
                                        ? 'bg-slate-400 border-slate-400 text-white' 
                                        : 'border-slate-300 dark:border-white/20 hover:border-slate-500'
                                    }`}
                            >
                                {subtask.completed && <Check className="w-2.5 h-2.5" />}
                            </button>
                            <span className={`text-xs flex-1 ${subtask.completed ? 'text-slate-400 dark:text-white/30 line-through' : 'text-slate-600 dark:text-white/80'}`}>
                                {subtask.title}
                            </span>
                            <button 
                                onClick={() => onDeleteSubtask(task.id, subtask.id)}
                                className="opacity-0 group-hover/sub:opacity-100 p-0.5 text-slate-400 hover:text-red-500 transition-opacity"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                    
                    {/* Inline Subtask Input */}
                    {isAddingSubtask ? (
                        <form onSubmit={(e) => handleInlineSubtaskSubmit(e, task.id)} className="flex items-center gap-3 py-1.5">
                            <CornerDownRight className="w-3.5 h-3.5 text-slate-300 dark:text-white/30" />
                            <input 
                                autoFocus
                                type="text"
                                value={subtaskInput}
                                onChange={(e) => setSubtaskInput(e.target.value)}
                                onBlur={() => {
                                    if(!subtaskInput.trim()) setAddingSubtaskTo(null);
                                }}
                                onKeyDown={(e) => {
                                    if(e.key === 'Escape') setAddingSubtaskTo(null);
                                }}
                                placeholder="Type a subtask..."
                                className="flex-1 bg-transparent border-b border-slate-200 dark:border-white/10 text-xs text-slate-700 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 pb-1"
                            />
                        </form>
                    ) : (
                         subtasks.length === 0 && (
                            <div className="text-[10px] text-slate-400 dark:text-white/30 italic py-1">
                                No subtasks added yet.
                            </div>
                         )
                    )}
                </div>
            )}
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

  return (
    <div className="flex flex-col h-full relative">
        <div className="px-6 pt-6 pb-2 shrink-0 z-10">
             <div className="flex items-end justify-between mb-6">
                 <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Tasks</h1>
                    <p className="text-xs text-slate-500 dark:text-white/50 font-medium">
                        {tasks.filter(t => !t.completed).length} items remaining
                    </p>
                 </div>
                 <div className="flex gap-1">
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
                            if (!newTaskTitle && !isSettingsOpen) setIsInputFocused(false);
                        }}
                        placeholder="Add a task..."
                        className="flex-1 bg-transparent border-none p-0 text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:ring-0"
                     />

                     <div className={`flex items-center gap-1 transition-all duration-300 ${isInputFocused || newTaskTitle ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'}`}>
                         
                         <div className="relative" ref={settingsRef}>
                            <button 
                                type="button"
                                onMouseDown={(e) => e.preventDefault()} // Critical: prevents input blur which would hide this button
                                onClick={() => {
                                    setIsSettingsOpen(!isSettingsOpen);
                                    if(inputRef.current) inputRef.current.focus();
                                }}
                                className={`flex items-center gap-1 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors ${newDueDate || newPriority !== 'Medium' ? 'text-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'text-slate-400'}`}
                                title="Set Due Date & Priority"
                            >
                                <CalendarIcon className="w-4 h-4" />
                                {(newDueDate || newPriority !== 'Medium') && (
                                    <span className="text-[10px] font-bold">
                                        {newDueDate ? newDueDate.getDate() : ''}
                                        {newPriority !== 'Medium' ? '!' : ''}
                                    </span>
                                )}
                            </button>
                            
                            <DatePriorityPicker 
                                isOpen={isSettingsOpen}
                                onClose={() => setIsSettingsOpen(false)}
                                selectedDate={newDueDate}
                                onDateChange={setNewDueDate}
                                selectedPriority={newPriority}
                                onPriorityChange={setNewPriority}
                            />
                         </div>

                         <div className={`p-1.5 rounded-lg pointer-events-none ${getPriorityColor(newPriority)} opacity-50`}>
                            <Flag className="w-4 h-4 fill-current" />
                         </div>
                     </div>
                 </div>
             </form>
        </div>

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