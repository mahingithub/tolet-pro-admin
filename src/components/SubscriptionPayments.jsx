// SubscriptionPayments.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Payments to verify: hosts who paid for a plan by bKash / Nagad Send Money.
// Most are accepted automatically when the wallet phone forwards the "money
// received" SMS; what waits here is what that check couldn't match, shown
// next to the SMS (if one came) and the reason, so the reviewer can decide
// without opening the wallet app. Approve turns the plan on; Reject tells the
// host why and lets them send the details again.
//
// Settings (super admins): plan prices, the payment methods hosts pay into
// ("Add Payment System": bKash / Nagad / Rocket / bank), and the key for the
// wallet phone's SMS forwarder (the automatic check).

import React, { useCallback, useEffect, useState } from 'react';
import {
  Check, X, Wallet, ImageIcon, AlertTriangle, Settings, Copy, KeyRound, Plus, Pencil, Trash2, Landmark,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  listSubscriptionPayments, approveSubscriptionPayment, rejectSubscriptionPayment,
  addPaymentMethod, updatePaymentMethod, deletePaymentMethod, updatePlanPrices, createSmsKey, removeSmsKey,
} from '../services/adminService';
import { API_BASE } from '../services/apiClient.js';
import { useAuth } from '../context/AdminAuthContext.jsx';
import { Card, Tabs, Badge, Button } from './ui';

const STATUS_TABS = [
  { value: 'pending', label: 'To verify' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const WALLET = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', bank: 'Bank' };

// Brand colours, so a method is recognisable at a glance in the list.
const METHOD_TYPES = [
  { type: 'bkash', name: 'bKash', dot: 'bg-[#e2136e]' },
  { type: 'nagad', name: 'Nagad', dot: 'bg-[#f7941d]' },
  { type: 'rocket', name: 'Rocket', dot: 'bg-[#8c3494]' },
  { type: 'bank', name: 'Bank account', dot: 'bg-slate-700' },
];
const typeInfo = (type) => METHOD_TYPES.find((t) => t.type === type) || METHOD_TYPES[0];

// Why the automatic check left a claim here — services/subscriptionPayment.service.js → issueWith().
const ISSUE = {
  '': 'No SMS with this TrxID has arrived',
  already_used: 'This SMS already paid for another claim',
  method_mismatch: 'The SMS came on the other wallet',
  too_old: 'The SMS is from long before the claim',
  amount_short: 'The SMS amount is less than the plan price',
  sender_mismatch: 'The SMS came from a different number',
};

const fmtTime = (v) => (v
  ? new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '');

const copyText = async (text, what) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error(`Could not copy — select it and copy by hand`);
  }
};

export default function SubscriptionPayments() {
  const [status, setStatus] = useState('pending');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(() => {
    listSubscriptionPayments(status)
      .then((res) => {
        setData(res);
        // Nobody can pay until a number is set — open the settings straight away.
        if (!(res.methods || []).some((m) => m.enabled)) setShowSettings(true);
      })
      .catch((err) => toast.error(err.message || 'Could not load payments'));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const approve = async (p) => {
    if (!window.confirm(`Approve ৳${p.amount} ${WALLET[p.method]} ${p.trxId}? This turns on ${p.planId} for ${p.userName || p.userPhone}.`)) return;
    setBusy(p.id);
    try {
      await approveSubscriptionPayment(p.id);
      toast.success('Approved — the plan is active');
      load();
    } catch (err) {
      toast.error(err.message || 'Could not approve');
    } finally {
      setBusy('');
    }
  };

  const reject = async (p) => {
    const reason = window.prompt(`Why can't ${p.trxId} be accepted? The host sees this message.`, 'টাকা আমাদের নম্বরে পৌঁছায়নি।');
    if (!reason || !reason.trim()) return;
    setBusy(p.id);
    try {
      await rejectSubscriptionPayment(p.id, reason.trim());
      toast.success('Rejected — the host was notified');
      load();
    } catch (err) {
      toast.error(err.message || 'Could not reject');
    } finally {
      setBusy('');
    }
  };

  const payments = data?.payments || [];
  const smsCheck = data?.smsCheck;
  const methods = data?.methods || [];

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Wallet size={14} className="text-gray-400" />
          <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Plan payments</p>
          {smsCheck && (smsCheck.configured
            ? <Badge tone="success" size="sm">Auto-check on{smsCheck.lastSmsAt ? ` · last SMS ${fmtTime(smsCheck.lastSmsAt)}` : ' · no SMS yet'}</Badge>
            : <Badge tone="warning" size="sm">Auto-check off — approve by hand</Badge>)}
          {data && !methods.some((m) => m.enabled) && (
            <Badge tone="danger" size="sm">No payment method on — hosts can't pay</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={showSettings ? 'primary' : 'secondary'} icon={Settings} onClick={() => setShowSettings((v) => !v)}>
            Settings
          </Button>
          <Tabs tabs={STATUS_TABS} value={status} onChange={setStatus} />
        </div>
      </div>

      {showSettings && data && (
        <>
          <PlanPrices plans={data.plans || []} onSaved={load} />
          <PaymentSettings methods={methods} smsCheck={smsCheck} onSaved={load} />
        </>
      )}

      {data && payments.length === 0 && (
        <p className="px-4 py-6 text-[13px] font-bold text-gray-400 text-center">
          {status === 'pending' ? 'Nothing waiting — every payment is checked.' : 'None yet.'}
        </p>
      )}

      <div className="divide-y divide-gray-100">
        {payments.map((p) => (
          <div key={p.id} className="px-4 py-3 flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 space-y-1">
              <p className="text-[13px] font-black text-gray-900">
                {p.userName || '(no name)'} <span className="text-gray-400 font-bold">{p.userPhone}</span>
              </p>
              <p className="text-[12px] font-bold text-gray-600">
                {p.planId} · ৳{p.amount} · {WALLET[p.method]} from <span className="font-mono">{p.sender}</span>
                {p.paidTo ? <span className="text-gray-400"> → {p.paidTo}</span> : null}
              </p>
              <p className="text-[12px] font-bold text-gray-600">
                TrxID <span className="font-mono text-gray-900">{p.trxId}</span>
                <span className="text-gray-400"> · sent {fmtTime(p.createdAt)}{p.submissions > 1 ? ` · ${p.submissions} times` : ''}</span>
              </p>
              {p.sms ? (
                <p className="text-[11px] font-bold text-gray-500" title={p.sms.text}>
                  SMS: ৳{p.sms.amount} on {WALLET[p.sms.method]} from <span className="font-mono">{p.sms.sender}</span> · {fmtTime(p.sms.receivedAt)}
                  {p.sms.usedByOther ? ' · already used by another claim' : ''}
                </p>
              ) : null}
              {p.status === 'pending' && (
                <p className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {p.method === 'rocket' || p.method === 'bank'
                    ? `${WALLET[p.method]} messages aren't read automatically — check your statement, then approve.`
                    : (ISSUE[p.issue] ?? p.issue)}
                </p>
              )}
              {p.status === 'approved' && (
                <Badge tone="success" size="sm">{p.verifiedBy === 'sms' ? 'Matched by SMS' : 'Approved by admin'} · {fmtTime(p.reviewedAt)}</Badge>
              )}
              {p.status === 'rejected' && (
                <p className="text-[11px] font-bold text-red-600">Rejected: {p.rejectionReason}</p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {p.screenshotUrl && (
                <a href={p.screenshotUrl} target="_blank" rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-black text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <ImageIcon size={13} /> Screenshot
                </a>
              )}
              {p.status === 'pending' && (
                <>
                  <Button size="sm" variant="danger" icon={X} disabled={!!busy} onClick={() => reject(p)}>Reject</Button>
                  <Button size="sm" variant="primary" icon={Check} loading={busy === p.id} disabled={!!busy} onClick={() => approve(p)}>Approve</Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings: what each plan costs.
// ─────────────────────────────────────────────────────────────────────────────
const PRICE_ROWS = [
  { tier: 'plus', label: 'Plus' },
  { tier: 'pro', label: 'Pro' },
];
const DISCOUNT_PRESETS = [0, 10, 20];

function PlanPrices({ plans, onSaved }) {
  const { hasRole } = useAuth();
  const isSuper = hasRole('super_admin');
  const [monthly, setMonthly] = useState(() => Object.fromEntries(
    plans.filter((p) => p.interval === 'month').map((p) => [p.id, String(p.price)]),
  ));
  const [discount, setDiscount] = useState(() => String(plans.find((p) => p.interval === 'year')?.discount ?? 20));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updatePlanPrices(monthly, discount);
      toast.success('Prices saved — hosts see them right away');
      onSaved();
    } catch (err) {
      toast.error(err.message || 'Could not save prices');
    } finally {
      setSaving(false);
    }
  };

  // The same sum the server does (subscriptionPayment.service → getPlans).
  const yearly = (tier) => {
    const month = Number(monthly[`${tier}_monthly`]);
    const pct = Number(discount);
    if (!(month > 0) || !(pct >= 0 && pct <= 50)) return null;
    return { list: month * 12, price: Math.round(month * 12 * (100 - pct) / 100) };
  };

  const input = 'w-full pl-7 pr-3 py-2 text-[13px] font-bold text-gray-900 border border-gray-200 rounded-lg bg-white disabled:bg-gray-50 disabled:text-gray-500';

  return (
    <div className="px-4 py-4 border-b border-gray-100 bg-gray-50/60 space-y-3">
      <p className="text-[12px] font-black text-gray-900">Plan prices</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {PRICE_ROWS.map(({ tier, label }) => {
          const id = `${tier}_monthly`;
          const y = yearly(tier);
          return (
            <div key={tier}>
              <label htmlFor={`price-${id}`} className="block text-[11px] font-black text-gray-500 mb-1">{label} · per month</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-gray-400">৳</span>
                <input id={`price-${id}`} type="text" inputMode="numeric" value={monthly[id] ?? ''} disabled={!isSuper}
                  onChange={(e) => setMonthly((m) => ({ ...m, [id]: e.target.value }))} className={input} />
              </div>
              {y && (
                <p className="text-[11px] font-bold text-gray-500 mt-1">
                  Yearly: {y.price < y.list && <span className="line-through text-gray-400">৳{y.list.toLocaleString('en-IN')}</span>}{' '}
                  <span className="text-gray-900">৳{y.price.toLocaleString('en-IN')}</span>
                </p>
              )}
            </div>
          );
        })}
        <div>
          <label htmlFor="price-discount" className="block text-[11px] font-black text-gray-500 mb-1">Yearly discount</label>
          <div className="flex items-center gap-1.5">
            {DISCOUNT_PRESETS.map((pct) => (
              <button key={pct} type="button" disabled={!isSuper} onClick={() => setDiscount(String(pct))}
                aria-pressed={Number(discount) === pct}
                className={`px-2.5 py-2 rounded-lg border text-[12px] font-black ${Number(discount) === pct ? 'border-[#ba0036] bg-[#ba0036]/5 text-[#ba0036]' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'}`}>
                {pct === 0 ? 'None' : `${pct}%`}
              </button>
            ))}
            <div className="relative w-20">
              <input id="price-discount" type="text" inputMode="numeric" value={discount} disabled={!isSuper}
                onChange={(e) => setDiscount(e.target.value)}
                className="w-full pl-3 pr-6 py-2 text-[13px] font-bold text-gray-900 border border-gray-200 rounded-lg bg-white disabled:bg-gray-50" />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-gray-400">%</span>
            </div>
          </div>
          <p className="text-[11px] font-bold text-gray-500 mt-1">Off 12 months when a host pays for a year (0–50%). Hosts see it as “save {Number(discount) || 0}%”.</p>
        </div>
      </div>
      {isSuper
        ? <Button size="sm" variant="primary" icon={Check} loading={saving} onClick={save}>Save prices</Button>
        : <p className="text-[11px] font-bold text-amber-700">Only a super admin can change prices.</p>}
      <p className="text-[11px] font-bold text-gray-400">A payment already submitted keeps the price it was asked for.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings: the payment methods hosts pay into, and the automatic SMS check.
// ─────────────────────────────────────────────────────────────────────────────
function PaymentSettings({ methods, smsCheck, onSaved }) {
  const { hasRole } = useAuth();
  const isSuper = hasRole('super_admin');
  const [keyBusy, setKeyBusy] = useState(false);
  // Shown once, right after it is made — the server keeps only a hash.
  const [newKey, setNewKey] = useState('');
  const webhook = `${API_BASE}/billing/payments/sms`;

  const makeKey = async () => {
    if (smsCheck?.configured && !window.confirm('Make a new key? The phone stops forwarding until you paste the new key into it.')) return;
    setKeyBusy(true);
    try {
      setNewKey(await createSmsKey());
      onSaved();
    } catch (err) {
      toast.error(err.message || 'Could not make a key');
    } finally {
      setKeyBusy(false);
    }
  };

  const turnOff = async () => {
    if (!window.confirm('Turn off the automatic check? Every payment will then wait for an admin to approve it.')) return;
    setKeyBusy(true);
    try {
      await removeSmsKey();
      setNewKey('');
      toast.success('Automatic check is off');
      onSaved();
    } catch (err) {
      toast.error(err.message || 'Could not turn it off');
    } finally {
      setKeyBusy(false);
    }
  };

  return (
    <div className="px-4 py-4 border-b border-gray-100 bg-gray-50/60 grid gap-6 lg:grid-cols-2">
      <PaymentMethods methods={methods} isSuper={isSuper} onSaved={onSaved} />

      <div className="space-y-3">
        <p className="text-[12px] font-black text-gray-900">2. Automatic check (optional)</p>
        <p className="text-[11px] font-bold text-gray-500">
          An Android phone with the wallet SIM forwards each &ldquo;money received&rdquo; SMS here. A payment whose TrxID,
          amount and number match is approved instantly. Without it, you approve every payment by hand above.
        </p>
        <p className="text-[11px] font-bold text-gray-700">
          Status: {smsCheck?.configured ? `on — key made ${fmtTime(smsCheck.keyCreatedAt)}` : 'off'}
        </p>
        {isSuper ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant={smsCheck?.configured ? 'secondary' : 'primary'} icon={KeyRound} loading={keyBusy} onClick={makeKey}>
              {smsCheck?.configured ? 'Make new key' : 'Turn on — make key'}
            </Button>
            {smsCheck?.configured && <Button size="sm" variant="danger" icon={X} disabled={keyBusy} onClick={turnOff}>Turn off</Button>}
          </div>
        ) : (
          <p className="text-[11px] font-bold text-amber-700">Only a super admin can turn this on or off.</p>
        )}

        {newKey && (
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 space-y-2">
            <p className="text-[11px] font-black text-amber-800">Copy this key now — it is shown only once.</p>
            <CopyRow label="Key" value={newKey} />
            <CopyRow label="URL" value={webhook} />
            <ol className="list-decimal pl-4 text-[11px] font-bold text-gray-700 space-y-1">
              <li>On the phone with the bKash / Nagad SIM, install <b>Incoming SMS to URL forwarder</b> (GitHub / F-Droid).</li>
              <li>Add a rule for sender <b>bKash</b> and one for <b>NAGAD</b>: method POST, the URL above.</li>
              <li>Add the header <span className="font-mono">Authorization: Bearer &lt;key&gt;</span>. Leave the message body as it is.</li>
              <li>Turn off battery saving for the app, then send yourself ৳1 to check it shows here as &ldquo;last SMS&rdquo;.</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment methods: the accounts hosts can pay into ("Add Payment System").
// ─────────────────────────────────────────────────────────────────────────────
function PaymentMethods({ methods, isSuper, onSaved }) {
  // null = closed, 'new' = adding, a method = editing it.
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState('');

  const run = async (id, fn, ok) => {
    setBusy(id);
    try {
      await fn();
      toast.success(ok);
      onSaved();
    } catch (err) {
      toast.error(err.message || 'Could not save');
    } finally {
      setBusy('');
    }
  };

  const toggle = (m) => run(m.id, () => updatePaymentMethod(m.id, { ...m, enabled: !m.enabled }),
    m.enabled ? `${m.name} is hidden from checkout` : `${m.name} is back at checkout`);
  const remove = (m) => {
    if (!window.confirm(`Delete ${m.name} ${m.accountNumber}? Hosts won't see it any more. Payments already made to it stay in the list.`)) return;
    run(m.id, () => deletePaymentMethod(m.id), `${m.name} deleted`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-black text-gray-900">1. Payment methods</p>
        {isSuper && !editing && (
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add Payment System</Button>
        )}
      </div>
      <p className="text-[11px] font-bold text-gray-500">The accounts hosts can pay into. Only methods that are on appear at checkout.</p>

      {methods.length === 0 && !editing && (
        <p className="text-[12px] font-bold text-gray-400 py-2">No payment method yet — add one so hosts can pay.</p>
      )}

      <div className="space-y-2">
        {methods.map((m) => (
          <div key={m.id} className={`flex items-start gap-3 p-3 rounded-lg border bg-white ${m.enabled ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-70'}`}>
            <span className={`mt-0.5 w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-white text-[11px] font-black ${typeInfo(m.type).dot}`}>
              {m.type === 'bank' ? <Landmark size={14} /> : m.name.charAt(0)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-black text-gray-900">
                {m.type === 'bank' ? m.bankName : m.name} <span className="font-mono font-bold text-gray-700">{m.accountNumber}</span>
              </p>
              <p className="text-[11px] font-bold text-gray-500">
                {[m.accountName, m.type === 'bank' ? m.branchName : (m.accountType === 'merchant' ? 'Merchant (Payment)' : 'Personal (Send Money)')].filter(Boolean).join(' · ')}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <Badge size="sm" tone={m.enabled ? 'success' : 'neutral'}>{m.enabled ? 'On' : 'Off'}</Badge>
                <Badge size="sm" tone={m.autoCheck ? 'info' : 'neutral'}>{m.autoCheck ? 'SMS auto-check' : 'Approve by hand'}</Badge>
              </div>
            </div>
            {isSuper && (
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" disabled={!!busy} loading={busy === m.id} onClick={() => toggle(m)}>{m.enabled ? 'Turn off' : 'Turn on'}</Button>
                <Button size="sm" variant="ghost" icon={Pencil} aria-label={`Edit ${m.name}`} disabled={!!busy} onClick={() => setEditing(m)} />
                <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete ${m.name}`} disabled={!!busy} onClick={() => remove(m)} />
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <MethodForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); onSaved(); }}
        />
      )}

      {!isSuper && <p className="text-[11px] font-bold text-amber-700">Only a super admin can change where the money goes.</p>}
    </div>
  );
}

const EMPTY_METHOD = {
  type: 'bkash', accountNumber: '', accountName: '', accountType: 'personal',
  bankName: '', branchName: '', routingNumber: '', instructions: '', enabled: true,
};

function MethodForm({ initial, onCancel, onSaved }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_METHOD, ...(initial || {}) }));
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const isBank = form.type === 'bank';

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (initial) await updatePaymentMethod(initial.id, form);
      else await addPaymentMethod(form);
      toast.success(initial ? 'Payment method updated' : 'Payment method added — hosts see it at checkout');
      onSaved();
    } catch (err) {
      toast.error(err.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full px-3 py-2 text-[13px] font-bold text-gray-900 border border-gray-200 rounded-lg bg-white focus:border-[#ba0036] outline-none';
  const label = 'block text-[11px] font-black text-gray-500 mb-1';

  return (
    <form onSubmit={submit} className="p-3 rounded-lg border border-gray-200 bg-white space-y-3">
      <p className="text-[12px] font-black text-gray-900">{initial ? 'Edit payment method' : 'Add Payment System'}</p>
      <div role="radiogroup" aria-label="Payment type" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {METHOD_TYPES.map((t) => (
          <button key={t.type} type="button" role="radio" aria-checked={form.type === t.type}
            onClick={() => setForm((f) => ({ ...f, type: t.type }))}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] font-black ${form.type === t.type ? 'border-[#ba0036] bg-[#ba0036]/5 text-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${t.dot}`} /> {t.name}
          </button>
        ))}
      </div>

      {isBank ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pm-bank" className={label}>Bank name</label>
            <input id="pm-bank" required placeholder="e.g. Dutch-Bangla Bank" value={form.bankName} onChange={set('bankName')} className={input} />
          </div>
          <div>
            <label htmlFor="pm-holder" className={label}>Account holder name</label>
            <input id="pm-holder" required value={form.accountName} onChange={set('accountName')} className={input} />
          </div>
          <div>
            <label htmlFor="pm-number" className={label}>Account number</label>
            <input id="pm-number" required inputMode="numeric" value={form.accountNumber} onChange={set('accountNumber')} className={input} />
          </div>
          <div>
            <label htmlFor="pm-branch" className={label}>Branch (optional)</label>
            <input id="pm-branch" value={form.branchName} onChange={set('branchName')} className={input} />
          </div>
          <div>
            <label htmlFor="pm-routing" className={label}>Routing number (optional)</label>
            <input id="pm-routing" inputMode="numeric" value={form.routingNumber} onChange={set('routingNumber')} className={input} />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pm-number" className={label}>{typeInfo(form.type).name} number</label>
            <input id="pm-number" required type="tel" inputMode="numeric" placeholder={form.type === 'rocket' ? '01XXXXXXXXX(X)' : '01XXXXXXXXX'}
              value={form.accountNumber} onChange={set('accountNumber')} className={input} />
          </div>
          <div>
            <label htmlFor="pm-kind" className={label}>Account type</label>
            <select id="pm-kind" value={form.accountType || 'personal'} onChange={set('accountType')} className={input}>
              <option value="personal">Personal — hosts use Send Money</option>
              <option value="merchant">Merchant — hosts use Payment</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="pm-holder" className={label}>Account name (optional — shown so hosts know it's you)</label>
            <input id="pm-holder" value={form.accountName} onChange={set('accountName')} className={input} />
          </div>
        </div>
      )}

      <div>
        <label htmlFor="pm-note" className={label}>Note for hosts (optional)</label>
        <textarea id="pm-note" rows={2} maxLength={300} placeholder="e.g. Write your phone number as the reference."
          value={form.instructions} onChange={set('instructions')} className={input} />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="primary" icon={Check} loading={saving}>{initial ? 'Save changes' : 'Add method'}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function CopyRow({ label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-[10px] font-black text-gray-500 uppercase">{label}</span>
      <code className="flex-1 min-w-0 truncate px-2 py-1 rounded bg-white border border-gray-200 text-[12px]">{value}</code>
      <Button size="sm" variant="ghost" icon={Copy} aria-label={`Copy ${label}`} onClick={() => copyText(value, label)} />
    </div>
  );
}
