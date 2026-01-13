import { useState, useEffect } from 'react';
import api from '../../lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Writeup {
  id: string;
  week: number;
  title: string;
  content: string;
  publish_at: string;
  created_at: string;
}

export default function Writeups() {
  const [writeups, setWriteups] = useState<Writeup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Form state
  const [week, setWeek] = useState(1);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [publishDate, setPublishDate] = useState('');
  const [publishTime, setPublishTime] = useState('08:00');
  const [editingWeek, setEditingWeek] = useState<number | null>(null);

  useEffect(() => {
    fetchWriteups();
  }, []);

  async function fetchWriteups() {
    try {
      const res = await api.get('/admin/writeups');
      // Ensure we have an array (migration may not have run yet)
      setWriteups(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error('Writeups fetch error:', err);
      setError(err.response?.data?.error || 'Failed to fetch writeups');
      setWriteups([]); // Reset to empty array on error
    } finally {
      setLoading(false);
    }
  }

  function loadWriteup(writeup: Writeup) {
    setEditingWeek(writeup.week);
    setWeek(writeup.week);
    setTitle(writeup.title);
    setContent(writeup.content);
    
    // Parse publish_at into date and time
    const publishAt = new Date(writeup.publish_at);
    setPublishDate(publishAt.toISOString().split('T')[0]);
    setPublishTime(publishAt.toTimeString().slice(0, 5));
  }

  function clearForm() {
    setEditingWeek(null);
    setWeek(1);
    setTitle('');
    setContent('');
    setPublishDate('');
    setPublishTime('08:00');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Combine date and time into ISO string
      // Treat input as EST (UTC-5)
      const publishAt = new Date(`${publishDate}T${publishTime}:00-05:00`).toISOString();
      
      await api.post('/admin/writeups', {
        week,
        title,
        content,
        publishAt
      });
      
      setSuccess(`Writeup for week ${week} saved! Will publish at ${publishDate} ${publishTime} EST`);
      clearForm();
      fetchWriteups();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save writeup');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(weekNum: number) {
    if (!confirm(`Delete writeup for week ${weekNum}?`)) return;
    
    try {
      await api.delete(`/admin/writeups/${weekNum}`);
      setSuccess(`Deleted writeup for week ${weekNum}`);
      fetchWriteups();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete writeup');
    }
  }

  function formatPublishTime(publishAt: string) {
    const date = new Date(publishAt);
    const now = new Date();
    const isPast = date <= now;
    
    return (
      <span className={isPast ? 'text-green-400' : 'text-yellow-400'}>
        {isPast ? '✓ Published' : '⏳ Scheduled'}: {date.toLocaleString('en-US', { 
          timeZone: 'America/New_York',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })} EST
      </span>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Weekly Writeups</h1>
        <p className="text-slate-400 mt-1">Create recaps that appear as popups for users</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-green-400">
          {success}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-slate-800/50 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">
          {editingWeek ? `Edit Week ${editingWeek} Writeup` : 'New Writeup'}
        </h2>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Week</label>
            <select
              value={week}
              onChange={(e) => setWeek(parseInt(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
            >
              {[1, 2, 3, 4].map(w => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Week 1 Recap"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Publish Date</label>
            <input
              type="date"
              value={publishDate}
              onChange={(e) => setPublishDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-1">Publish Time (EST)</label>
            <input
              type="time"
              value={publishTime}
              onChange={(e) => setPublishTime(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
              required
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-slate-400">Content (Markdown supported)</label>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs text-amber-400 hover:text-amber-300"
            >
              {showPreview ? 'Hide Preview' : 'Show Preview'}
            </button>
          </div>
          
          <div className={showPreview ? 'grid grid-cols-2 gap-4' : ''}>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={16}
              placeholder={`Paste your writeup here. Supports markdown:

**Bold text** and *italic text*
# Heading 1
## Heading 2  
### Heading 3

- Bullet point
- Another bullet

| NFC | AFC |
|-----|-----|
| Team 1 | Team 2 |`}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm"
              required
            />
            
            {showPreview && (
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 overflow-y-auto max-h-[400px]">
                <div className="text-xs text-slate-500 mb-2 uppercase tracking-wide">Preview</div>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => <h1 className="text-xl font-bold text-white mt-4 mb-2">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-lg font-bold text-white mt-4 mb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-base font-semibold text-amber-400 mt-3 mb-1">{children}</h3>,
                    p: ({ children }) => <p className="text-slate-300 my-2 text-sm leading-relaxed">{children}</p>,
                    strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                    em: ({ children }) => <em className="text-slate-200 italic">{children}</em>,
                    ul: ({ children }) => <ul className="my-2 space-y-1">{children}</ul>,
                    li: ({ children }) => (
                      <li className="text-slate-300 text-sm flex gap-2">
                        <span className="text-amber-400">•</span>
                        <span className="flex-1">{children}</span>
                      </li>
                    ),
                    table: ({ children }) => (
                      <div className="my-3 overflow-x-auto">
                        <table className="w-full border-collapse border border-slate-600 text-sm">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-slate-800">{children}</thead>,
                    tr: ({ children }) => <tr className="border-b border-slate-700">{children}</tr>,
                    th: ({ children }) => <th className="px-3 py-1.5 text-left text-amber-400 font-semibold border-r border-slate-700 last:border-r-0">{children}</th>,
                    td: ({ children }) => <td className="px-3 py-1.5 text-slate-300 border-r border-slate-700 last:border-r-0">{children}</td>,
                  }}
                >
                  {content || '*Start typing to see preview...*'}
                </ReactMarkdown>
              </div>
            )}
          </div>
          
          <div className="mt-2 text-xs text-slate-500">
            Supports: **bold**, *italic*, # headings, - bullets, | tables |
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : (editingWeek ? 'Update Writeup' : 'Create Writeup')}
          </button>
          
          {editingWeek && (
            <button
              type="button"
              onClick={clearForm}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Existing Writeups */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Existing Writeups</h2>
        
        {writeups.length === 0 ? (
          <p className="text-slate-500">No writeups yet</p>
        ) : (
          <div className="space-y-3">
            {writeups.map(writeup => (
              <div key={writeup.id} className="bg-slate-800/50 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">
                    Week {writeup.week}: {writeup.title}
                  </div>
                  <div className="text-sm mt-1">
                    {formatPublishTime(writeup.publish_at)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadWriteup(writeup)}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(writeup.week)}
                    className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
