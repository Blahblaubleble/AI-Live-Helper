import React, { useState, useRef, useEffect } from 'react';
import { Task, Assignment, Routine, LogEntry } from '../types';
import { Calendar, Clock, CheckCircle2, Circle, Repeat, Plus, MessageSquare, ChevronRight, Upload, Trash2, Eye, EyeOff, Edit2 } from 'lucide-react';
import Visualizer from './Visualizer';

interface ManagingDashboardProps {
  tasks: Task[];
  assignments: Assignment[];
  routines: Routine[];
  logs: LogEntry[];
  onAddRoutine: (routine: Routine) => void;
  onEditTask: (taskId: string, updates: Partial<Task>) => void;
  onDeleteTask: (taskId: string) => void;
  onEditAssignment: (assignmentId: string, updates: Partial<Assignment>) => void;
  onDeleteAssignment: (assignmentId: string) => void;
  onEditRoutine: (routineId: string, updates: Partial<Routine>) => void;
  onDeleteRoutine: (routineId: string) => void;
  onToggleRoutineCalendar: (routineId: string) => void;
  onSendText: (text: string) => void;
  audioLevels: { user: number; ai: number };
  isMuted: boolean;
  onMuteToggle: () => void;
  connectionState: string;
}

const ManagingDashboard: React.FC<ManagingDashboardProps> = ({
  tasks,
  assignments,
  routines,
  logs,
  onAddRoutine,
  onEditTask,
  onDeleteTask,
  onEditAssignment,
  onDeleteAssignment,
  onEditRoutine,
  onDeleteRoutine,
  onToggleRoutineCalendar,
  onSendText,
  audioLevels,
  isMuted,
  onMuteToggle,
  connectionState
}) => {
  const [isAddRoutineOpen, setIsAddRoutineOpen] = useState(false);
  const [newRoutine, setNewRoutine] = useState<Partial<Routine>>({ frequency: 'Daily' });
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Combine tasks and assignments for the scrolling bar
  const allItems = [
    ...tasks.map(t => ({ ...t, type: 'task' as const })),
    ...assignments.map(a => ({ ...a, type: 'assignment' as const }))
  ].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const handleRoutineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoutine.title || !newRoutine.frequency || !newRoutine.startTime || !newRoutine.endTime) return;
    
    if (editingRoutineId) {
        onEditRoutine(editingRoutineId, {
          title: newRoutine.title,
          frequency: newRoutine.frequency as 'Daily' | 'Weekly' | 'Monthly',
          startTime: newRoutine.startTime,
          endTime: newRoutine.endTime,
          daysOfWeek: newRoutine.frequency === 'Weekly' ? (newRoutine.daysOfWeek || [1]) : undefined
        });
    } else {
        onAddRoutine({
          id: Math.random().toString(36).substring(2, 9),
          title: newRoutine.title,
          frequency: newRoutine.frequency as 'Daily' | 'Weekly' | 'Monthly',
          startTime: newRoutine.startTime,
          endTime: newRoutine.endTime,
          daysOfWeek: newRoutine.frequency === 'Weekly' ? (newRoutine.daysOfWeek || [1]) : undefined,
          showInCalendar: true,
          createdAt: new Date().toISOString()
        });
    }
    
    setEditingRoutineId(null);
    setNewRoutine({ frequency: 'Daily' });
    setIsAddRoutineOpen(false);
  };

  const handleEditRoutineClick = (r: Routine) => {
      setEditingRoutineId(r.id);
      setNewRoutine(r);
      setIsAddRoutineOpen(true);
  };

  return (
    <div className="flex h-full bg-slate-50 dark:bg-black/20 overflow-hidden">
      {/* Schedule Manager */}
      <div className="w-full flex flex-col p-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            Schedule Manager
          </h2>
          <button
            onClick={() => {
                setEditingRoutineId(null);
                setNewRoutine({ frequency: 'Daily' });
                setIsAddRoutineOpen(true);
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Routine
          </button>
        </div>

        {/* Scrolling Bar for Tasks and Homework */}
        <div className="mb-8 shrink-0">
          <h3 className="text-sm font-medium text-slate-500 dark:text-white/50 mb-3 uppercase tracking-wider">Upcoming Tasks & Homework</h3>
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
            {allItems.length === 0 ? (
              <div className="text-sm text-slate-400 dark:text-white/40 italic">No upcoming items.</div>
            ) : (
              allItems.map(item => (
                <div key={item.id} className="min-w-[200px] max-w-[200px] bg-white dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/10 snap-start shrink-0 group relative">
                  <button 
                    onClick={() => item.type === 'assignment' ? onDeleteAssignment(item.id) : onDeleteTask(item.id)}
                    className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-start justify-between mb-2 pr-6">
                    <h4 className="font-medium text-slate-800 dark:text-white truncate pr-2 text-sm" title={item.title}>{item.title}</h4>
                    {item.type === 'assignment' ? (
                      <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 rounded-full shrink-0">HW</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 rounded-full shrink-0">Task</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-white/50">
                    <Clock className="w-3 h-3" />
                    {new Date(item.dueDate).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Routines Section */}
        <div className="flex-1">
          <h3 className="text-sm font-medium text-slate-500 dark:text-white/50 mb-3 uppercase tracking-wider">Routines & Recurring Events</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {routines.length === 0 ? (
              <div className="text-sm text-slate-400 dark:text-white/40 italic">No routines added yet.</div>
            ) : (
              routines.map(routine => (
                <div key={routine.id} className="bg-white dark:bg-white/5 p-3 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-between group">
                  <div>
                    <h4 className="font-medium text-slate-800 dark:text-white flex items-center gap-2 text-sm">
                      <Repeat className="w-4 h-4 text-emerald-500" />
                      {routine.title}
                    </h4>
                    <div className="text-xs text-slate-500 dark:text-white/50 mt-1 flex items-center gap-2">
                      <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/10 rounded-md">
                        {routine.frequency}
                        {routine.frequency === 'Weekly' && routine.daysOfWeek && (
                          <span className="ml-1 opacity-75">({routine.daysOfWeek.map(d => ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'][d]).join(', ')})</span>
                        )}
                      </span>
                      {(routine.startTime && routine.endTime) && <span>{routine.startTime} - {routine.endTime}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button 
                      onClick={() => handleEditRoutineClick(routine)}
                      className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md transition-all"
                      title="Edit Routine"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => onToggleRoutineCalendar(routine.id)}
                      className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md transition-all"
                      title={routine.showInCalendar !== false ? "Hide in Calendar" : "Show in Calendar"}
                    >
                      {routine.showInCalendar !== false ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button 
                      onClick={() => onDeleteRoutine(routine.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-all"
                      title="Delete Routine"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add Routine Modal */}
      {isAddRoutineOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 dark:border-white/10">
            <div className="p-4 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
              <h3 className="font-semibold text-slate-800 dark:text-white">{editingRoutineId ? 'Edit Routine' : 'Add New Routine'}</h3>
              <button 
                  onClick={() => {
                      setIsAddRoutineOpen(false);
                      setEditingRoutineId(null);
                      setNewRoutine({ frequency: 'Daily' });
                  }} 
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
              >
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleRoutineSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-white/50 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={newRoutine.title || ''}
                  onChange={e => setNewRoutine({...newRoutine, title: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="e.g., Morning Workout"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-white/50 mb-1">Frequency</label>
                  <select
                    value={newRoutine.frequency || 'Daily'}
                    onChange={e => setNewRoutine({...newRoutine, frequency: e.target.value as any})}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-white/50 mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={newRoutine.startTime || ''}
                    onChange={e => setNewRoutine({...newRoutine, startTime: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-white/50 mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={newRoutine.endTime || ''}
                    onChange={e => setNewRoutine({...newRoutine, endTime: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>
              {newRoutine.frequency === 'Weekly' && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-white/50 mb-2">Select Days</label>
                  <div className="flex gap-2">
                    {[{ v: 1, l: 'M' }, { v: 2, l: 'T' }, { v: 3, l: 'W' }, { v: 4, l: 'T' }, { v: 5, l: 'F' }, { v: 6, l: 'S' }, { v: 0, l: 'S' }].map(day => (
                      <button
                        key={day.v}
                        type="button"
                        onClick={() => {
                          const currentDays = newRoutine.daysOfWeek || [1]; // Default Mon
                          if (currentDays.includes(day.v)) {
                            // Don't remove if it's the last selected day
                            if (currentDays.length > 1) {
                              setNewRoutine({ ...newRoutine, daysOfWeek: currentDays.filter(d => d !== day.v) });
                            }
                          } else {
                            setNewRoutine({ ...newRoutine, daysOfWeek: [...currentDays, day.v] });
                          }
                        }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                          (newRoutine.daysOfWeek || [1]).includes(day.v)
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 hover:bg-slate-200 dark:hover:bg-white/20'
                        }`}
                      >
                        {day.l}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddRoutineOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-white/70 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                >
                  Add Routine
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagingDashboard;
