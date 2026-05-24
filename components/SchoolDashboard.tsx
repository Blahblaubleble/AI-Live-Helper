import React, { useState } from 'react';
import { Assignment, SchoolNote } from '../types';
import { Book, FileText, Plus, Calendar, Clock, ChevronRight, Edit2 } from 'lucide-react';

interface SchoolDashboardProps {
  assignments: Assignment[];
  schoolNotes: SchoolNote[];
  onAddAssignment: (assignment: Assignment) => void;
  onEditAssignment?: (assignmentId: string, updates: Partial<Assignment>) => void;
  onAddNote: (note: SchoolNote) => void;
}

const SchoolDashboard: React.FC<SchoolDashboardProps> = ({
  assignments,
  schoolNotes,
  onAddAssignment,
  onEditAssignment,
  onAddNote
}) => {
  const [activeTab, setActiveTab] = useState<'assignments' | 'notes'>('assignments');

  // Assignment State
  const [isAddAssignmentOpen, setIsAddAssignmentOpen] = useState(false);
  const [newAssignment, setNewAssignment] = useState<Partial<Assignment>>({ priority: 'Medium', status: 'To Do' });
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);

  // Note State
  const [selectedNote, setSelectedNote] = useState<SchoolNote | null>(null);

  const handleAssignmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssignment.title || !newAssignment.subject) return;

    if (editingAssignmentId && onEditAssignment) {
        onEditAssignment(editingAssignmentId, {
            title: newAssignment.title,
            subject: newAssignment.subject,
            dueDate: newAssignment.dueDate,
            priority: (newAssignment.priority as any),
            details: newAssignment.details,
            estimatedHours: newAssignment.estimatedHours
        });
    } else {
        const assignment: Assignment = {
          id: Math.random().toString(36).substring(2, 9),
          title: newAssignment.title,
          subject: newAssignment.subject,
          dueDate: newAssignment.dueDate || '',
          status: 'To Do',
          priority: (newAssignment.priority as any) || 'Medium',
          details: newAssignment.details || '',
          estimatedHours: newAssignment.estimatedHours,
          createdAt: new Date().toISOString()
        };
        onAddAssignment(assignment);
    }
    
    setIsAddAssignmentOpen(false);
    setNewAssignment({ priority: 'Medium', status: 'To Do' });
    setEditingAssignmentId(null);
  };

  const handleEditClick = (a: Assignment) => {
      setEditingAssignmentId(a.id);
      setNewAssignment(a);
      setIsAddAssignmentOpen(true);
  };

  const renderAssignments = () => {
    return (
      <div className="h-full flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Assignments</h2>
          <button
            onClick={() => {
                setEditingAssignmentId(null);
                setNewAssignment({ priority: 'Medium', status: 'To Do' });
                setIsAddAssignmentOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Assignment
          </button>
        </div>

        {isAddAssignmentOpen && (
          <div className="mb-6 bg-white dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/10 animate-in slide-in-from-top-2">
            <form onSubmit={handleAssignmentSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Subject (e.g. Math)"
                  className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  value={newAssignment.subject || ''}
                  onChange={e => setNewAssignment({ ...newAssignment, subject: e.target.value })}
                  required
                />
                <input
                  type="text"
                  placeholder="Title"
                  className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  value={newAssignment.title || ''}
                  onChange={e => setNewAssignment({ ...newAssignment, title: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <input
                  type="datetime-local"
                  className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  value={newAssignment.dueDate || ''}
                  onChange={e => setNewAssignment({ ...newAssignment, dueDate: e.target.value })}
                />
                <select
                  className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  value={newAssignment.priority}
                  onChange={e => setNewAssignment({ ...newAssignment, priority: e.target.value as any })}
                >
                  <option value="Low">Low Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="High">High Priority</option>
                </select>
                <input
                  type="number"
                  step="0.5"
                  placeholder="Est. Hours"
                  className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  value={newAssignment.estimatedHours || ''}
                  onChange={e => setNewAssignment({ ...newAssignment, estimatedHours: parseFloat(e.target.value) || undefined })}
                />
              </div>
              <textarea
                placeholder="Details..."
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 min-h-[80px]"
                value={newAssignment.details || ''}
                onChange={e => setNewAssignment({ ...newAssignment, details: e.target.value })}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddAssignmentOpen(false)}
                  className="px-3 py-1.5 text-slate-500 hover:text-slate-700 dark:text-white/50 dark:hover:text-white text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-3 overflow-y-auto flex-1">
          {assignments.length === 0 ? (
            <div className="text-center text-slate-400 dark:text-white/40 py-10">
              No assignments yet.
            </div>
          ) : (
            assignments.map(a => (
              <div key={a.id} className="relative bg-white dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/10 hover:border-blue-500/50 transition-colors group">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-full mb-1 inline-block">
                      {a.subject}
                    </span>
                    <h3 className="font-semibold text-slate-800 dark:text-white">{a.title}</h3>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                    a.priority === 'High' ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20' :
                    a.priority === 'Medium' ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' :
                    'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20'
                  }`}>
                    {a.priority}
                  </div>
                </div>
                {a.details && (
                  <p className="text-sm text-slate-600 dark:text-white/70 mb-3 line-clamp-2">{a.details}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-white/50">
                  {a.dueDate && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(a.dueDate).toLocaleDateString()}
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {a.status}
                  </div>
                  {a.estimatedHours && (
                    <div className="flex items-center gap-1">
                       {a.estimatedHours}h est.
                    </div>
                  )}
                </div>
                {onEditAssignment && (
                    <button 
                         onClick={() => handleEditClick(a)}
                         className="absolute top-4 right-20 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-blue-500"
                    >
                        <Edit2 className="w-4 h-4" />
                    </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderNotes = () => {
    
    if (selectedNote) {
      return (
        <div className="h-full flex flex-col animate-in fade-in slide-in-from-right-4">
          <button 
            onClick={() => setSelectedNote(null)}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-800 dark:text-white/50 dark:hover:text-white mb-4 transition-colors"
          >
            <ChevronRight className="w-4 h-4 rotate-180" /> Back to Notes
          </button>
          <div className="bg-white dark:bg-white/5 flex-1 rounded-2xl border border-slate-200 dark:border-white/10 p-8 overflow-y-auto shadow-sm">
            <div className="mb-6 border-b border-slate-100 dark:border-white/10 pb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-white/40">{selectedNote.subject}</span>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{selectedNote.title}</h1>
              <div className="text-xs text-slate-400 mt-2">{new Date(selectedNote.createdAt).toLocaleString()}</div>
            </div>
            <div className="prose dark:prose-invert max-w-none">
              <p className="whitespace-pre-wrap text-slate-700 dark:text-white/80 leading-relaxed">{selectedNote.content}</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">Study Notes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pb-10">
          {schoolNotes.length === 0 ? (
            <div className="col-span-full text-center text-slate-400 dark:text-white/40 py-10">
              No notes yet. Ask the agent to create one!
            </div>
          ) : (
            schoolNotes.map(note => (
              <button
                key={note.id}
                onClick={() => setSelectedNote(note)}
                className="text-left bg-white dark:bg-white/5 p-5 rounded-xl border border-slate-200 dark:border-white/10 hover:border-blue-500/50 hover:shadow-md transition-all group h-48 flex flex-col"
              >
                <div className="flex justify-between items-start w-full mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/40 group-hover:text-blue-500 transition-colors">
                    {note.subject}
                  </span>
                </div>
                <h3 className="font-bold text-slate-800 dark:text-white mb-2 line-clamp-2">{note.title}</h3>
                <p className="text-sm text-slate-500 dark:text-white/60 line-clamp-3 flex-1">{note.content}</p>
                <div className="text-[10px] text-slate-400 mt-3 pt-3 border-t border-slate-100 dark:border-white/5 w-full">
                  {new Date(note.createdAt).toLocaleDateString()}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full bg-slate-50 dark:bg-black/20">
      {/* Sidebar Navigation */}
      <div className="w-16 bg-white dark:bg-[#1c1c1e] border-r border-slate-200 dark:border-white/10 flex flex-col items-center py-6 gap-6 shrink-0 z-20">
        <button
          onClick={() => setActiveTab('assignments')}
          className={`p-3 rounded-xl transition-all ${activeTab === 'assignments' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'}`}
          title="Assignments"
        >
          <Book className="w-5 h-5" />
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`p-3 rounded-xl transition-all ${activeTab === 'notes' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'}`}
          title="Notes"
        >
          <FileText className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-hidden relative">
        {activeTab === 'assignments' && renderAssignments()}
        {activeTab === 'notes' && renderNotes()}
      </div>
    </div>
  );
};

export default SchoolDashboard;
