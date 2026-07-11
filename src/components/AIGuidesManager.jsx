import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Video, Save, X, Eye, EyeOff } from 'lucide-react';
import { listAdminGuides, createGuide, updateGuide, deleteGuide } from '../services/aiGuideService';
import LoadingState from './common/LoadingState';

// Default shape for a blank guide (placement/audience included so future
// fields don't get missed across the init + reset paths).
const EMPTY_GUIDE = {
  title: '',
  suggestionText: '',
  videoUrl: '',
  isActive: true,
  order: 0,
  placement: 'assistant',
  audience: 'all',
};

const AIGuidesManager = () => {
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isEditing, setIsEditing] = useState(false);
  const [currentGuide, setCurrentGuide] = useState(EMPTY_GUIDE);

  useEffect(() => {
    fetchGuides();
  }, []);

  const fetchGuides = async () => {
    try {
      setLoading(true);
      const data = await listAdminGuides();
      setGuides(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error('Error fetching AI guides:', err);
      setError('Failed to load AI guides.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (currentGuide._id) {
        await updateGuide(currentGuide._id, currentGuide);
      } else {
        await createGuide(currentGuide);
      }
      setIsEditing(false);
      setCurrentGuide(EMPTY_GUIDE);
      fetchGuides();
    } catch (err) {
      console.error('Error saving AI guide:', err);
      alert('Failed to save AI guide.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this guide?')) return;
    try {
      await deleteGuide(id);
      fetchGuides();
    } catch (err) {
      console.error('Error deleting AI guide:', err);
      alert('Failed to delete guide.');
    }
  };

  if (loading) return <LoadingState label="Loading AI Guides..." />;

  return (
    <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Video className="text-[#ba0036]" /> AI Video Guides
          </h2>
          <p className="text-xs font-bold text-gray-500 mt-1">Upload videos for the AI Assistant, Welcome Robot, the How it Works page and the Help &amp; Support page.</p>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 bg-[#ba0036] hover:bg-[#d91a4d] text-white px-4 py-2 rounded-xl text-xs font-black shadow-md transition-colors"
          >
            <Plus size={16} /> Add Guide
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold mb-4">{error}</div>}

      {isEditing ? (
        <form onSubmit={handleSave} className="bg-[#f8f9fa] rounded-2xl p-5 border border-gray-200">
          <h3 className="text-sm font-black text-gray-800 mb-4">{currentGuide._id ? 'Edit Guide' : 'New Guide'}</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1.5">Category / Title</label>
              <input
                type="text"
                required
                value={currentGuide.title}
                onChange={(e) => setCurrentGuide({ ...currentGuide, title: e.target.value })}
                placeholder="e.g. How to Add Property"
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-[#ba0036]/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1.5">Suggestion Button Text</label>
              <input
                type="text"
                required
                value={currentGuide.suggestionText}
                onChange={(e) => setCurrentGuide({ ...currentGuide, suggestionText: e.target.value })}
                placeholder="e.g. আপনি কি বাসা ছাড়তে চান?"
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-[#ba0036]/20 outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1.5">Video URL (YouTube or MP4)</label>
              <input
                type="url"
                required
                value={currentGuide.videoUrl}
                onChange={(e) => setCurrentGuide({ ...currentGuide, videoUrl: e.target.value })}
                placeholder="e.g. https://www.youtube.com/watch?v=..."
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-[#ba0036]/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1.5">Placement</label>
              <select
                value={currentGuide.placement || 'assistant'}
                onChange={(e) => setCurrentGuide({ ...currentGuide, placement: e.target.value })}
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-[#ba0036]/20 outline-none"
              >
                <option value="assistant">AI Assistant (suggestion list)</option>
                <option value="welcome">Welcome Robot (after login)</option>
                <option value="how_it_works">How it Works page</option>
                <option value="support">Help &amp; Support page</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1.5">Audience</label>
              <select
                value={currentGuide.audience || 'all'}
                onChange={(e) => setCurrentGuide({ ...currentGuide, audience: e.target.value })}
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-[#ba0036]/20 outline-none"
              >
                <option value="all">Everyone</option>
                <option value="tenant">Tenant only</option>
                <option value="landlord">Landlord only</option>
              </select>
              <p className="text-[10px] font-bold text-gray-400 mt-1.5 leading-snug">
                Welcome ও How-it-Works ভিডিওর জন্য Tenant ও Landlord আলাদা করে টার্গেট করুন।
              </p>
            </div>
            <div>
              <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1.5">Sort Order</label>
              <input
                type="number"
                value={currentGuide.order}
                onChange={(e) => setCurrentGuide({ ...currentGuide, order: Number(e.target.value) })}
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-[#ba0036]/20 outline-none"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={currentGuide.isActive}
                  onChange={(e) => setCurrentGuide({ ...currentGuide, isActive: e.target.checked })}
                  className="w-4 h-4 text-[#ba0036] rounded focus:ring-[#ba0036]"
                />
                <span className="text-sm font-bold text-gray-700">Active (Visible to users)</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 justify-end mt-6">
            <button
              type="button"
              onClick={() => { setIsEditing(false); setCurrentGuide(EMPTY_GUIDE); }}
              className="px-4 py-2 bg-white text-gray-600 rounded-xl text-xs font-black hover:bg-gray-50 transition-colors flex items-center gap-1.5"
            >
              <X size={16} /> Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#ba0036] text-white rounded-xl text-xs font-black shadow-md hover:bg-[#d91a4d] transition-colors flex items-center gap-1.5"
            >
              <Save size={16} /> Save Guide
            </button>
          </div>
        </form>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400">
                <th className="pb-3 pl-2">Order</th>
                <th className="pb-3">Title & Suggestion</th>
                <th className="pb-3">Placement</th>
                <th className="pb-3">Video URL</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right pr-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {guides.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-sm font-bold text-gray-400">No guides created yet.</td>
                </tr>
              ) : (
                guides.map((g) => (
                  <tr key={g._id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 pl-2 font-black text-gray-500">{g.order}</td>
                    <td className="py-3">
                      <div className="font-bold text-gray-900 text-sm">{g.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5">&quot;{g.suggestionText}&quot;</div>
                    </td>
                    <td className="py-3">
                      {(() => {
                        const PLACEMENTS = {
                          welcome:      { label: 'Welcome',      cls: 'text-[#ba0036] bg-[#ba0036]/10' },
                          how_it_works: { label: 'How it Works', cls: 'text-indigo-600 bg-indigo-50' },
                          support:      { label: 'Support',      cls: 'text-emerald-600 bg-emerald-50' },
                          assistant:    { label: 'Assistant',    cls: 'text-gray-500 bg-gray-100' },
                        };
                        const meta = PLACEMENTS[g.placement] || PLACEMENTS.assistant;
                        const showAudience = g.placement === 'welcome' || g.placement === 'how_it_works';
                        return (
                          <div className="flex flex-col gap-1 w-max">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                            {showAudience && (
                              <span className="text-[10px] font-bold text-gray-500 capitalize">{g.audience || 'all'}</span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3 max-w-[200px] truncate text-xs text-blue-600">
                      <a href={g.videoUrl} target="_blank" rel="noreferrer" className="hover:underline">{g.videoUrl}</a>
                    </td>
                    <td className="py-3">
                      {g.isActive ? (
                        <span className="flex items-center gap-1 text-[10px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded-full w-max">
                          <Eye size={12} /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-black text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full w-max">
                          <EyeOff size={12} /> Hidden
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right pr-2">
                      <button
                        onClick={() => { setCurrentGuide(g); setIsEditing(true); }}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors mr-1"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(g._id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AIGuidesManager;
