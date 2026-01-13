import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Trash2, Calendar, Clock, X, Pencil } from 'lucide-react';
import { Task } from '../types';

interface TodoListProps {
  tasks: Task[];
  onAddTask: (task: Task) => void;
  onToggleTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (taskId: string, newTitle: string) => void;
}

const TodoList: React.FC<TodoListProps> = ({ tasks, onAddTask, onToggleTask, onDeleteTask, onEditTask }) => {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [newDueDate, setNewDueDate] = useState<string>(''); // ISO String
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  
  // Edit State
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  
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
      if (isNaN(dateA)) return 1;
      if (isNaN(dateB)) return -1;
      return dateA - dateB;
    });
  }, [tasks]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    let dueIsoString = newDueDate;
    if (!dueIsoString) {
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return 'text-red-500 dark:text-red-400';
      case 'Medium': return 'text-yellow-600 dark:text-yellow-400';
      case 'Low': return 'text-blue-600 dark:text-blue-400';
      default: return 'text-slate-400 dark:text-gray-400';
    }
  };

  const getPriorityDots = (priority: string) => {
    switch (priority) {
        case 'High': return '!!!';
        case 'Medium': return '!!';
        default: return '!';
    }
  }

  const getTaskTiming = (dateStr: string) => {
    const due = new Date(dateStr);
    if (isNaN(due.getTime())) return { friendlyDate: '', isOverdue: false };

    const diffMs = due.getTime() - new Date().getTime();
    const isOverdue = diffMs < 0;
    
    // Calendar Date Label
    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    
    let friendlyDate = '';
    try {
        friendlyDate = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) {
        friendlyDate = '';
    }

    if (due.toDateString() === today.toDateString()) friendlyDate = 'Today';
    else if (due.toDateString() === tomorrow.toDateString()) friendlyDate = 'Tomorrow';
    else if (due.toDateString() === yesterday.toDateString()) friendlyDate = 'Yesterday';

    const timeStr = due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return { friendlyDate: `${friendlyDate}, ${timeStr}`, isOverdue };
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
    <div className="flex flex-col h-full">
      {/* Reminders Header */}
      <div className="p-6 pb-2">
          <h1 className="text-3xl font-bold text-blue-600 dark:text-blue-500 tracking-tight">Reminders</h1>
          <div className="text-slate-500 dark:text-white/40 text-sm font-medium mt-1">{tasks.filter(t => !t.completed).length} Pending</div>
      </div>

      {/* Task List - Apple Style */}
      <div className="flex-1 overflow-y-auto px-6 py-2 space-y-1">
        {sortedTasks.map(task => {
            const timing = getTaskTiming(task.dueDate);
            const isEditing = editingTaskId === task.id;
            
            return (
                <div 
                  key={task.id}
                  className="group flex items-start py-3 border-b border-slate-200 dark:border-white/5 last:border-0 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg px-2 transition-colors"
                >
                   {/* Apple Style Check Circle */}
                   <button
                     onClick={() => onToggleTask(task.id)}
                     className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                         task.completed 
                         ? 'bg-blue-500 border-blue-500' 
                         : 'border-slate-300 dark:border-white/30 hover:border-blue-500 hover:bg-blue-500/10'
                     }`}
                   >
                     {task.completed && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                   </button>
                   
                   <div className="ml-3 flex-1 min-w-0">
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
                            className="w-full bg-transparent border-none p-0 text-slate-800 dark:text-white text-base focus:ring-0"
                        />
                      ) : (
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <span className={`font-medium text-xs tracking-wider ${getPriorityColor(task.priority)}`}>
                                    {getPriorityDots(task.priority)}
                                </span>
                                <span 
                                    onClick={() => !task.completed && startEditing(task)}
                                    className={`text-base cursor-text ${task.completed ? 'text-slate-400 dark:text-white/30 line-through' : 'text-slate-800 dark:text-white/90'}`}
                                >
                                    {task.title}
                                </span>
                            </div>
                            
                            <div className={`flex items-center gap-2 mt-0.5 text-xs ${timing.isOverdue && !task.completed ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-white/40'}`}>
                                <span>{timing.friendlyDate}</span>
                            </div>
                        </div>
                      )}
                   </div>

                   <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                       {!task.completed && (
                         <button onClick={() => startEditing(task)} className="p-1.5 text-slate-400 dark:text-white/40 hover:text-blue-500 dark:hover:text-blue-400">
                            <Pencil className="w-4 h-4" />
                         </button>
                       )}
                       <button onClick={() => onDeleteTask(task.id)} className="p-1.5 text-slate-400 dark:text-white/40 hover:text-red-500 dark:hover:text-red-400">
                           <Trash2 className="w-4 h-4" />
                       </button>
                   </div>
                </div>
            );
        })}
        
        {/* Empty State */}
        {tasks.length === 0 && (
             <div className="py-10 text-center text-slate-400 dark:text-white/20 text-sm font-medium">No Reminders</div>
        )}
        
        {/* Quick Add at Bottom of List */}
        <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-3 px-2 py-2 opacity-60 hover:opacity-100 transition-opacity border-t border-transparent hover:border-slate-200 dark:hover:border-white/5">
             <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-white/20" />
             <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="New Reminder"
                className="bg-transparent border-none p-0 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-0 flex-1"
             />
             
             <div className="relative" ref={datePickerRef}>
                <button
                    type="button"
                    onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                    className={`text-xs px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${newDueDate ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-white/30'}`}
                >
                    {newDueDate ? new Date(newDueDate).toLocaleDateString(undefined, {month:'short', day:'numeric'}) : 'Date'}
                </button>
                 {isDatePickerOpen && (
                    <div className="absolute bottom-full right-0 mb-2 p-3 bg-white dark:bg-[#2a2a2a]/90 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl z-50 w-64">
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
                            className="w-full bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-2 py-1 text-xs text-slate-900 dark:text-white [color-scheme:light] dark:[color-scheme:dark]"
                            autoFocus
                        />
                    </div>
                )}
             </div>
             
             <select 
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as any)}
                className="bg-transparent text-xs text-slate-400 dark:text-white/30 border-none focus:ring-0 cursor-pointer"
             >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
             </select>
             
             {newTaskTitle && (
                 <button type="submit" className="text-blue-600 dark:text-blue-500 hover:text-blue-500 dark:hover:text-blue-400">
                     <Plus className="w-5 h-5" />
                 </button>
             )}
        </form>
      </div>
    </div>
  );
};

export default TodoList;