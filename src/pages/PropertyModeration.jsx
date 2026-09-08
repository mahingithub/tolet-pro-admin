import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, XCircle, MapPin, DollarSign,
  BedDouble, Bath, Square, User, ShieldAlert, RefreshCw, AlertCircle, Trash2,
} from 'lucide-react';
import { listAdminProperties, moderateProperty, deleteAdminProperty } from '../services/adminService';
import {
  PageContainer, PageHeader, Card, Tabs, Badge, Button, EmptyState, LoadingState,
} from '../components/ui';

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
    <PageContainer className="space-y-6">
      <PageHeader
        title="Property Moderation"
        description="Review listings on the platform."
        meta={<Badge tone="brand">{countLabel}</Badge>}
        actions={(
          <Button icon={RefreshCw} iconClassName={loading ? 'animate-spin' : ''} onClick={hydrate}>
            Refresh
          </Button>
        )}
      />

      <Tabs tabs={STATUS_TABS} value={statusTab} onChange={setStatusTab} />

      {error ? (
        <div className="bg-red-50 border border-red-100 text-red-700 text-sm font-bold p-4 rounded-2xl flex items-center gap-2" role="alert">
          <AlertCircle size={16} /> {error}
        </div>
      ) : null}

      {/* List */}
      <div className="space-y-6">
        {loading ? (
          <LoadingState label="Loading properties" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            tone="success"
            title="All caught up"
            description="No properties in this tab."
          />
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
              <Card key={id} padding="md" hover>
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
                      <Badge tone="brand" icon={DollarSign}>{fmtMoney(property.price)}/mo</Badge>
                      <Badge icon={User}>Host: {property.ownerName || '—'}</Badge>
                      {Number(property.inquiries) > 0 ? (
                        <Badge>{property.inquiries} inquiries</Badge>
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
                      <Button
                        icon={XCircle}
                        loading={actingId === id}
                        onClick={() => handleAction(id, 'remove')}
                        className="flex-1 md:flex-none"
                      >
                        Remove from public
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        icon={CheckCircle2}
                        loading={actingId === id}
                        onClick={() => handleAction(id, 'approve')}
                        className="flex-1 md:flex-none"
                      >
                        Restore to active
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      icon={Trash2}
                      disabled={actingId === id}
                      onClick={() => handleAction(id, 'delete')}
                      title="Permanently delete property"
                      aria-label="Permanently delete property"
                      className="flex-none"
                    />
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </PageContainer>
  );
};

export default PropertyModeration;
