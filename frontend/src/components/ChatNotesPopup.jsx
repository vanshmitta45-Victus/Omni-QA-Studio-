import React, { useState, useEffect } from 'react';
import { StickyNote, X, Save, Trash2, Loader2, Share2, Clock } from 'lucide-react';
import { notesApi } from '../api/client';

const fmtDate = (v) => {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return '';
  }
};

// Popup panel for writing + saving quick notes from inside chat.
// Clicking a saved note opens a Google Keep-style detail editor.
export function ChatNotesPopup({ onClose }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [notes, setNotes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedTick, setSavedTick] = useState(false);
  const [selected, setSelected] = useState(null);

  const loadNotes = async () => {
    try {
      const res = await notesApi.getAll();
      setNotes(res.data || []);
    } catch {
      // non-blocking; popup still allows writing
    }
  };

  useEffect(() => {
    loadNotes();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title.trim() && !content.trim()) {
      setError('Write a title or some content first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await notesApi.create({ title: title.trim() || 'Untitled', content: content.trim() });
      setTitle('');
      setContent('');
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2000);
      loadNotes();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not save note.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await notesApi.delete(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch {
      setError('Could not delete note.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-card border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2.5 bg-gradient-to-r from-amber-50 to-white">
          <span className="p-2 rounded-xl bg-amber-100 text-amber-600">
            <StickyNote className="w-4 h-4" />
          </span>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Quick Notes</h3>
            <p className="text-xs text-slate-500">Jot it down without leaving chat</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-900 placeholder-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <textarea
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your note here..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
          />
          {error && <p className="text-xs text-rose-500">{error}</p>}
          {savedTick && <p className="text-xs text-emerald-600 font-semibold">Note saved!</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 shadow-glow disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Note'}
          </button>
        </form>

        {notes.length > 0 && (
          <div className="px-5 pb-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Your notes ({notes.length})
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {notes.map((n) => (
                <div
                  key={n.id}
                  onClick={() => setSelected(n)}
                  className="flex items-start gap-2 p-3 rounded-xl bg-amber-50/60 border border-amber-100 hover:border-amber-300 hover:shadow-sm cursor-pointer transition-all"
                  title="Open note"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 truncate">{n.title}</p>
                    <p className="text-xs text-slate-500 line-clamp-2">{n.content}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(n.id);
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                    title="Delete note"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {selected && (
        <NoteDetailModal
          note={selected}
          onClose={() => setSelected(null)}
          onSaved={(updated) => {
            setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
            setSelected(updated);
          }}
          onDeleted={() => {
            setNotes((prev) => prev.filter((n) => n.id !== selected.id));
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

// Google Keep-style detail view: full note, inline editing, timestamps.
function NoteDetailModal({ note, onClose, onSaved, onDeleted }) {
  const [editTitle, setEditTitle] = useState(note.title || '');
  const [editContent, setEditContent] = useState(note.content || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const dirty = editTitle !== (note.title || '') || editContent !== (note.content || '');

  const handleSave = async () => {
    if (!dirty) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await notesApi.update(note.id, { title: editTitle, content: editContent });
      onSaved(res.data || { ...note, title: editTitle, content: editContent });
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not update note.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await notesApi.delete(note.id);
      onDeleted();
    } catch {
      setError('Could not delete note.');
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={handleSave}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-card border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 flex items-center gap-2">
          {note.shared && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
              <Share2 className="w-3 h-3" /> Shared
            </span>
          )}
          <button
            onClick={onClose}
            className="ml-auto p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-2">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Title"
            className="w-full text-lg font-bold text-slate-900 placeholder-slate-300 focus:outline-none bg-transparent"
          />
        </div>
        <div className="px-5">
          <textarea
            rows={8}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            placeholder="Note..."
            className="w-full text-sm text-slate-700 placeholder-slate-300 focus:outline-none resize-none bg-transparent leading-relaxed"
          />
        </div>
        {(note.createdAt || note.updatedAt) && (
          <div className="px-5 pb-2 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Clock className="w-3 h-3" />
            {note.createdAt && <span>Created {fmtDate(note.createdAt)}</span>}
            {note.updatedAt && note.updatedAt !== note.createdAt && (
              <span>• Edited {fmtDate(note.updatedAt)}</span>
            )}
          </div>
        )}
        {error && <p className="px-5 pb-1 text-xs text-rose-500">{error}</p>}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2 bg-slate-50/60">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
            title="Delete note"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
          <span className="text-[11px] text-slate-400">
            {dirty ? 'Unsaved changes' : 'Click outside to close'}
          </span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="ml-auto px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 flex items-center gap-1.5 transition-all"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {dirty ? 'Save' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
