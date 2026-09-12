import React, { useCallback, useEffect, useState } from 'react';
import {
  Gavel, RefreshCw, Save, History, AlertTriangle, ExternalLink, Phone,
  CheckCircle2, Clock, Store,
} from 'lucide-react';

import {
  getRegulatedRates, getRegulatedRateHistory, saveRegulatedRate,
  runPriceCheck, getFlaggedProviders,
} from '../services/adminService';
import {
  PageContainer, PageHeader, Card, CardHeader, SectionHeader, Badge, Button,
  LoadingState, ErrorState, EmptyState,
} from '../components/ui';

/**
 * RegulatedRates — typing in the circular, and reading what it caught.
 * ──────────────────────────────────────────────────────────────────────────
 * BERC re-announces the LPG maximum retail price monthly; BTRC's "One Country
 * One Rate" fixes the entry broadband tiers. Neither number can live in a
 * config file, because a value baked into a deploy goes wrong on OUR release
 * cycle rather than the regulator's. So this page is where an admin types the
 * circular in when it lands.
 *
 * ─── A CAP IS A MAXIMUM, NOT A PRICE ─────────────────────────────────────────
 * The single most important thing on this screen, and the reason the copy keeps
 * saying it. Shops sell below the ceiling constantly, and the cheaper shop is
 * exactly what a tenant is looking for. So entering a number here NEVER:
 *
 *   • sets or rewrites a provider's price
 *   • hides or ranks down a shop for being under the cap
 *   • calls anybody an overcharger — we know what the regulator published, not
 *     what was agreed at the door, and a delivery charge is not a violation
 *
 * It flags a row for a human to look at, and nudges the shopkeeper once a
 * fortnight. That is the whole power of this page.
 *
 * ─── THE FLAGGED LIST IS A REVIEW QUEUE ──────────────────────────────────────
 * Most flags are a forgotten price list, which is why every row shows how old
 * that list is right next to the two numbers. A reviewer who cannot see
 * "prices last touched 90 days ago" reads every flag as dishonesty.
 */

const fmtMoney = (n) => (n == null ? '—' : `৳${Number(n).toLocaleString('en-IN')}`);

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric',
}) : '—');

const daysSince = (d) => (d
  ? Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
  : null);

/** `yyyy-mm-dd` for a date input, in local time rather than UTC. */
const todayISO = () => {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

/**
 * One regulated row: the label, the ceiling on file, and the form to replace it.
 *
 * The price and the date are edited together and saved together, because a new
 * ceiling without the date it takes effect is not an announcement — it is a
 * number with no authority behind it.
 */
function RateRow({ category, row, onSaved }) {
  const [price, setPrice] = useState(row.maxPrice ?? '');
  const [from, setFrom] = useState(todayISO());
  const [source, setSource] = useState(row.sourceUrl || '');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState(null);

  const dirty = String(price) !== String(row.maxPrice ?? '');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await saveRegulatedRate({
        category,
        rowKey: row.rowKey,
        maxPrice: Number(price),
        effectiveFrom: from,
        sourceUrl: source.trim(),
      });
      await onSaved();
      setOpen(false);
    } catch (err) {
      setError(err?.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const loadHistory = async () => {
    if (history) { setHistory(null); return; }
    setHistory(await getRegulatedRateHistory({ category, rowKey: row.rowKey }).catch(() => []));
  };

  return (
    <div className="border-b border-gray-100 last:border-0 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-gray-900">
            {row.label?.bn || row.rowKey}
            {row.unit ? (
              <span className="text-gray-400 font-bold"> · {row.unit.bn || row.unit.en}</span>
            ) : null}
          </p>
          <p className="text-[11px] font-bold text-gray-400">
            {row.label?.en || row.rowKey}
            {row.effectiveFrom ? ` · effective ${fmtDate(row.effectiveFrom)}` : ''}
          </p>
        </div>

        <div className="text-right shrink-0">
          {/* `null` is "no circular on file", NOT a ceiling of zero. Showing a
              dash rather than ৳0 is the difference between "we have not been
              told" and "the regulator set it free". */}
          <p className={`text-base font-black tabular-nums ${
            row.maxPrice == null ? 'text-gray-300' : 'text-gray-900'
          }`}
          >
            {fmtMoney(row.maxPrice)}
          </p>
          {row.maxPrice == null ? (
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider">
              not on file
            </p>
          ) : null}
        </div>

        <div className="flex gap-1.5 shrink-0">
          <Button size="sm" variant="ghost" icon={History} onClick={loadHistory} title="Past circulars" />
          <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
            {open ? 'Cancel' : 'Update'}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="mt-3 bg-gray-50 rounded-xl p-3.5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-[11px] font-black text-gray-600 mb-1">
                Maximum retail price (৳)
              </span>
              <input
                type="number"
                min="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-bold outline-none focus:border-[#ba0036]"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-black text-gray-600 mb-1">
                Effective from
              </span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-bold outline-none focus:border-[#ba0036]"
              />
              {/* The date the circular takes effect, NOT the day it was typed
                  in. An admin entering Tuesday's rate on Thursday must be able
                  to say so, or every compliance check between the two is
                  measured against the wrong number. */}
              <span className="block text-[10px] font-bold text-gray-400 mt-1">
                The circular&apos;s date, not today&apos;s.
              </span>
            </label>
            <label className="block">
              <span className="block text-[11px] font-black text-gray-600 mb-1">
                Source link
              </span>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="berc.portal.gov.bd/…"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-bold outline-none focus:border-[#ba0036]"
              />
              {/* A cap with no citation is a number we made up, and a
                  shopkeeper who disputes it will treat it as one. */}
              <span className="block text-[10px] font-bold text-gray-400 mt-1">
                So a disputing shopkeeper can be shown the circular.
              </span>
            </label>
          </div>

          {error ? (
            <p className="text-[11px] font-bold text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          ) : null}

          <Button
            size="sm" variant="primary" icon={Save}
            loading={busy}
            disabled={!price || Number(price) <= 0}
            onClick={save}
          >
            {dirty ? 'Save new ceiling' : 'Save'}
          </Button>
        </div>
      ) : null}

      {history ? (
        <div className="mt-3 bg-gray-50 rounded-xl p-3.5">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-2">
            Every announcement on file
          </p>
          {!history.length ? (
            <p className="text-[11px] font-bold text-gray-400">Nothing entered yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="font-bold text-gray-600">
                    {fmtDate(h.effectiveFrom)}
                    {h.sourceUrl ? (
                      <a
                        href={h.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-[#ba0036] inline-flex items-center gap-0.5"
                      >
                        source <ExternalLink size={9} />
                      </a>
                    ) : null}
                  </span>
                  <span className="font-black text-gray-900 tabular-nums">{fmtMoney(h.maxPrice)}</span>
                </li>
              ))}
            </ul>
          )}
          {/* Kept rather than overwritten: a compliance check against last
              month has to use last month's ceiling, the same way an order
              freezes its unit prices at placement. */}
          <p className="text-[10px] font-bold text-gray-400 mt-2">
            History is never overwritten — an old order is judged against the ceiling that was in force.
          </p>
        </div>
      ) : null}
    </div>
  );
}

const RegulatedRates = () => {
  const [categories, setCategories] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState(null);

  const hydrate = useCallback(async () => {
    try {
      const [cats, flags] = await Promise.all([
        getRegulatedRates(),
        // Allowed to fail on its own: the form is the job here, and a broken
        // review queue must not take the entry surface down with it.
        getFlaggedProviders().catch(() => ({ providers: [] })),
      ]);
      setCategories(cats);
      setFlagged(flags.providers || []);
      setError('');
    } catch (err) {
      setError(err?.message || 'Could not load rates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { hydrate(); }, [hydrate]);

  const recheck = async () => {
    setChecking(true);
    try {
      const summary = await runPriceCheck();
      setLastCheck(summary);
      await hydrate();
    } catch (err) {
      setError(err?.message || 'Check failed.');
    } finally {
      setChecking(false);
    }
  };

  if (loading) return <LoadingState label="Loading rates…" fullHeight />;
  if (error && !categories.length) {
    return (
      <PageContainer>
        <ErrorState title="Rates unavailable" description={error} onRetry={hydrate} />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Regulated Prices"
        description="BERC publishes a monthly maximum for LPG; BTRC fixes the entry broadband tiers. Type the circular in here when it lands."
        actions={(
          <Button size="sm" variant="secondary" icon={RefreshCw} loading={checking} onClick={recheck}>
            Re-check now
          </Button>
        )}
      />

      {/* The rule the whole feature is built around, stated where somebody
          about to type a number will read it. */}
      <Card className="border-amber-200 bg-amber-50/60 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <Gavel size={17} />
        </div>
        <div>
          <p className="text-sm font-black text-amber-900">A cap is a maximum, not a price.</p>
          <p className="text-[12px] font-bold text-amber-800 mt-1 leading-snug">
            Shops sell below the ceiling all the time, and the cheaper shop is exactly what a
            tenant is looking for. Entering a number here never rewrites anybody&apos;s price,
            never hides a listing, and never accuses anybody — it flags a row for review and
            nudges the shopkeeper once a fortnight.
          </p>
        </div>
      </Card>

      {lastCheck ? (
        <Card className="flex items-center gap-3">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <p className="text-[12px] font-bold text-gray-700">
            Checked <span className="font-black text-gray-900">{lastCheck.swept}</span> live providers ·{' '}
            <span className="font-black text-gray-900">{lastCheck.flagged}</span> over cap ·{' '}
            <span className="font-black text-gray-900">{lastCheck.nudged}</span> nudged
            <span className="text-gray-400">
              {' '}(the rest were inside their 14-day cooldown)
            </span>
          </p>
        </Card>
      ) : null}

      {/* ── The form ───────────────────────────────────────────────────── */}
      {categories.map((cat) => (
        <section key={cat.category} className="space-y-3">
          <SectionHeader
            icon={Gavel}
            tone="amber"
            title={cat.label?.bn || cat.category}
            eyebrow={`${cat.authority} · ${cat.label?.en || ''}`}
          />
          <Card>
            {cat.note ? (
              <p className="text-[11px] font-bold text-gray-500 mb-3 leading-snug">{cat.note}</p>
            ) : null}
            {cat.rows.map((row) => (
              <RateRow
                key={row.rowKey}
                category={cat.category}
                row={row}
                onSaved={hydrate}
              />
            ))}
          </Card>
        </section>
      ))}

      {!categories.length ? (
        <EmptyState
          icon={Gavel}
          title="No regulated categories"
          description="Only categories whose registry entry carries a price.regulated block appear here — today that is LPG (BERC) and entry broadband (BTRC)."
        />
      ) : null}

      {/* ── What the sweep caught ──────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader
          icon={AlertTriangle}
          tone="brand"
          title="Priced above a ceiling"
          eyebrow="a review queue, not an accusation list"
          action={<Badge tone={flagged.length ? 'warning' : 'success'}>{flagged.length} flagged</Badge>}
        />

        {!flagged.length ? (
          <EmptyState
            icon={CheckCircle2}
            tone="success"
            title="Nothing over the cap"
            description="Every live provider in a regulated category is at or below the ceiling on file."
          />
        ) : (
          <div className="space-y-3">
            {flagged.map((p) => {
              const age = daysSince(p.pricesUpdatedAt);
              // The most likely innocent explanation, computed once and shown
              // prominently: a list nobody has touched in months is a forgotten
              // update, not a shopkeeper overcharging.
              const stale = age != null && age > 45;
              return (
                <Card key={p.id} className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-black text-gray-900">{p.name}</h3>
                        <Badge tone="neutral">{p.authority}</Badge>
                        {stale ? (
                          <Badge tone="warning">
                            <Clock size={10} /> prices {age}d old
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-[11px] font-bold text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                        <span>{p.categoryLabel?.bn || p.category}</span>
                        <span className="inline-flex items-center gap-1">
                          <Store size={11} className="text-gray-400" />
                          {[p.area, p.thana].filter(Boolean).join(', ') || '—'}
                        </span>
                        <a
                          href={`tel:${p.phone}`}
                          className="inline-flex items-center gap-1 text-[#ba0036] font-black"
                        >
                          <Phone size={11} /> {p.phone}
                        </a>
                      </p>
                    </div>
                  </div>

                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                        <th className="pb-1">Row</th>
                        <th className="pb-1 text-right">Their price</th>
                        <th className="pb-1 text-right">Ceiling</th>
                        <th className="pb-1 text-right">Over by</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {p.overCapRows.map((r) => (
                        <tr key={r.row} className="text-xs">
                          <td className="py-1.5 font-bold text-gray-800">
                            {r.label?.bn || r.row}
                          </td>
                          <td className="py-1.5 text-right font-black text-gray-900 tabular-nums">
                            {fmtMoney(r.price)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-gray-500">
                            {fmtMoney(r.cap)}
                          </td>
                          <td className="py-1.5 text-right font-black text-[#ba0036] tabular-nums">
                            +{fmtMoney(r.overBy)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <p className="text-[10px] font-bold text-gray-400">
                    {/* Said on every row, because the temptation to read this
                        table as a list of offenders is exactly what it must not
                        become. */}
                    Last checked {fmtDate(p.checkedAt)} · a delivery charge is not a violation, and
                    a stale list is the usual cause.
                  </p>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </PageContainer>
  );
};

export default RegulatedRates;
