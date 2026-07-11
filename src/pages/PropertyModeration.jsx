import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, XCircle, MapPin, DollarSign,
  BedDouble, Bath, Square, User, ShieldAlert, RefreshCw, AlertCircle, Trash2, Loader2
} from 'lucide-react';
import { listAdminProperties, moderateProperty, deleteAdminProperty } from '../services/adminService';

// Default to "active" so the moderation page shows what's currently live.
const STATUS_TABS = [
  { value: 'active',   label: 'Active' },
  { value: 'paused',   label: 'Paused' },
  { value: 'rented',   label: 'Rented' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'draft',    label: 'Draft' },
];

const fmtMoney = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `৳${v.toLocaleString('en-IN')}`;
};

const PropertyModeration = () => {
  const [statusTab, setStatusTab] = useState('active');
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [actingId, setActingId]   = useState(null);

  const hydrate = async () => {
    setLoading(true);
    try {
      const data = await listAdminProperties({ status: statusTab, limit: 50 });
      setItems(Array.isArray(data.properties) ? data.properties : []);
      setError('');
    } catch (err) {
      setError(err?.message || 'Failed to load properties.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusTab]);

  const handleAction = async (id, action) => {
    setActingId(id);
    try {
      if (action === 'delete') {
        if (!window.confirm("Are you sure you want to permanently delete this property? This cannot be undone.")) {
          setActingId(null);
          return;
        }
        await deleteAdminProperty(id);
        setItems((prev) => prev.filter((p) => String(p._id || p.id) !== String(id)));
      } else {
        await moderateProperty(id, action);
        setItems((prev) => prev.filter((p) => String(p._id || p.id) !== String(id)));
      }
    } catch (err) {
      setError(err?.message || `Moderation failed (${action}).`);
    } finally {
      setActingId(null);
    }
  };

  const countLabel = useMemo(() => {
    if (loading) return 'Loading…';
    if (items.length === 0) return '0 in this tab';
    return `${items.length} in this tab`;
  }, [items.length, loading]);

  return (
    <div className="max-w-5xl mx-auto pt-4 pb-12">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Property Moderation</h1>
          <p className="text-sm font-bold text-gray-500 mt-2">
            Review listings on the platform.{' '}
            <span className="text-[#ba0036] bg-[#ba0036]/10 px-2 py-0.5 rounded-lg ml-1">
              {countLabel}
            </span>
          </p>
        </div>
        <button
          onClick={hydrate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-gray-700 text-xs font-black shadow-sm hover:shadow-md transition-all self-start"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusTab(tab.value)}
            className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide transition-all ${
              statusTab === tab.value
                ? 'bg-[#ba0036] text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="bg-red-50 text-red-700 text-sm font-bold p-4 rounded-2xl mb-6 flex items-center gap-2" role="alert">
          <AlertCircle size={16} /> {error}
        </div>
      ) : null}

      {/* List */}
      <div className="space-y-6">
        {!loading && items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} />
            </div>
            <h3 className="text-xl font-black text-gray-900">All Caught Up!</h3>
            <p className="text-gray-500 font-bold mt-2 text-sm">No properties in this tab.</p>
          </div>
        ) : (
          items.map((property) => {
            const id = String(property._id || property.id);
            const allImages = [];
            if (property.coverPhoto && typeof property.coverPhoto === 'string') {
              allImages.push(property.coverPhoto);
            }
            const extractImages = (source) => {
              if (Array.isArray(source)) {
                source.forEach((img) => {
                  const url = typeof img === 'string' ? img : img?.url;
                  if (url && typeof url === 'string' && !allImages.includes(url)) {
                    allImages.push(url);
                  }
                });
              }
            };
            extractImages(property.images);
            extractImages(property.roomPhotos);

            return (
              <div
                key={id}
                className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow duration-300"
              >
                {/* Images grid */}
                <div className="mb-5">
                  {allImages.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {allImages.map((url, idx) => (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="relative aspect-[4/3] bg-gray-100 rounded-xl overflow-hidden border border-gray-200 shadow-sm group block"
                        >
                          <img src={url} alt={`${property.title} - ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none"></div>
                          <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md text-white text-[10px] font-black px-2 py-1 rounded-md z-10 pointer-events-none">
                            {idx + 1}/{allImages.length}
                          </div>
                          {idx === 0 && (
                            <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md pointer-events-none">
                              {property.status || 'unknown'}
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="w-full h-32 bg-gray-50 rounded-xl border border-dashed border-gray-200 flex items-center justify-center text-gray-400 font-bold text-sm">
                      No photos available
                    </div>
                  )}
                </div>

                {/* Info + actions */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="bg-red-50 border border-red-100 px-2.5 py-1 rounded-md text-[11px] font-black text-[#ba0036] flex items-center gap-1.5 uppercase tracking-wide">
                        <DollarSign size={12} /> {fmtMoney(property.price)}/mo
                      </span>
                      <span className="bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-md text-[11px] font-bold text-gray-600 flex items-center gap-1.5">
                        <User size={12} className="text-gray-400" /> Host: {property.ownerName || '—'}
                      </span>
                      {Number(property.inquiries) > 0 ? (
                        <span className="bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-md text-[11px] font-bold text-gray-600">
                          {property.inquiries} inquiries
                        </span>
                      ) : null}
                    </div>

                    <h3 className="text-lg font-black text-gray-900 mb-1">{property.title}</h3>
                    <p className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-4">
                      <MapPin size={14} className="text-gray-400" /> {property.location || property.address || '—'}
                    </p>

                    <div className="flex items-center gap-4 text-xs font-bold text-gray-600 bg-gray-50 w-max px-4 py-2 rounded-lg border border-gray-100">
                      <span className="flex items-center gap-1.5"><BedDouble size={14} className="text-gray-400" /> {property.beds ?? '—'} Beds</span>
                      <div className="w-px h-3 bg-gray-300"></div>
                      <span className="flex items-center gap-1.5"><Bath size={14} className="text-gray-400" /> {property.baths ?? '—'} Baths</span>
                      <div className="w-px h-3 bg-gray-300"></div>
                      <span className="flex items-center gap-1.5"><Square size={14} className="text-gray-400" /> {property.sqft ?? '—'} sqft</span>
                    </div>

                    {property.moderationReason ? (
                      <p className="text-[11px] font-bold text-amber-600 mt-3 flex items-center gap-1.5 bg-amber-50 px-3 py-2 rounded-lg border border-amber-100 w-max">
                        <ShieldAlert size={12} /> Reason: {property.moderationReason}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-gray-100 mt-4 md:mt-0">
                    {property.status === 'active' ? (
                      <button
                        onClick={() => handleAction(id, 'remove')}
                        disabled={actingId === id}
                        className="flex-1 md:flex-none px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg font-black text-xs hover:border-gray-300 hover:bg-gray-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {actingId === id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Remove from public
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAction(id, 'approve')}
                        disabled={actingId === id}
                        className="flex-1 md:flex-none px-4 py-2.5 bg-[#ba0036] text-white rounded-lg font-black text-xs hover:bg-[#90002a] transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
                      >
                        {actingId === id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Restore to active
                      </button>
                    )}
                    <button
                      onClick={() => handleAction(id, 'delete')}
                      disabled={actingId === id}
                      className="flex-none px-3 py-2.5 bg-white border border-red-200 text-red-600 rounded-lg font-black hover:bg-red-50 transition-all flex items-center justify-center disabled:opacity-50"
                      title="Permanently Delete Property"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default PropertyModeration;
