import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Phone, Lock, Save, Loader2, ShieldCheck, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AdminAuthContext.jsx';
import { changePassword } from '../services/adminAuthService.js';

const ROLE_LABEL = {
  super_admin: 'Super Admin',
  moderator: 'Moderator',
  support_agent: 'Support Agent',
};

const errMsg = (err) => {
  const map = {
    wrong_password: 'Your current password is incorrect.',
    weak_password: 'New password must be at least 8 characters.',
    missing_fields: 'Please fill in both password fields.',
    invalid_email: 'That email address looks invalid.',
    invalid_name: 'Name must be at least 2 characters.',
  };
  return map[err?.code] || err?.serverMessage || err?.message || 'Something went wrong.';
};

const AccountSettings = () => {
  const navigate = useNavigate();
  const { user, updateProfile, logout } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const roleLabel =
    ROLE_LABEL[user?.role] ||
    (user?.roles || []).map((r) => ROLE_LABEL[r]).find(Boolean) ||
    'Admin';

  const profileDirty =
    name.trim() !== (user?.name || '') || email.trim() !== (user?.email || '');

  const saveProfile = async (e) => {
    e.preventDefault();
    if (savingProfile || !profileDirty) return;
    if (name.trim().length < 2) { toast.error('Name must be at least 2 characters.'); return; }
    setSavingProfile(true);
    try {
      await updateProfile({ name: name.trim(), email: email.trim() });
      toast.success('Profile updated.');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    if (changingPw) return;
    if (newPw !== confirmPw) { toast.error('New password and confirmation do not match.'); return; }
    if (newPw.length < 8) { toast.error('New password must be at least 8 characters.'); return; }
    setChangingPw(true);
    try {
      await changePassword({ currentPassword: curPw, newPassword: newPw });
      toast.success('Password changed. Please sign in again.');
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setChangingPw(false);
    }
  };

  const inputCls =
    'w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 placeholder:text-gray-400 focus:bg-white focus:border-[#ba0036] outline-none transition-all';

  return (
    <div className="max-w-2xl mx-auto pt-4 pb-12 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Account Settings</h1>
        <p className="text-sm font-bold text-gray-500 mt-2">Manage your profile and password.</p>
      </div>

      {/* Profile */}
      <form onSubmit={saveProfile} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#ba0036] to-[#d11147] flex items-center justify-center text-white font-black overflow-hidden shrink-0">
            {user?.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <User size={18} />
            )}
          </div>
          <div>
            <h2 className="text-sm font-black text-gray-900">Profile</h2>
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#ba0036] bg-[#ba0036]/10 border border-[#ba0036]/20 px-2 py-0.5 rounded-lg mt-1">
              <ShieldCheck size={11} /> {roleLabel}
            </span>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Full name</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400"><User size={16} /></div>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={80} required />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Email</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400"><Mail size={16} /></div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} maxLength={254} />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Phone (read-only)</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400"><Phone size={16} /></div>
            <input value={user?.phone || ''} disabled className={`${inputCls} opacity-60 cursor-not-allowed`} />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingProfile || !profileDirty}
            className="inline-flex items-center gap-2 bg-[#ba0036] text-white px-5 py-2.5 rounded-xl font-black text-xs hover:bg-[#90002a] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {savingProfile ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save changes
          </button>
        </div>
      </form>

      {/* Security */}
      <form onSubmit={submitPassword} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2">
          <KeyRound size={16} className="text-[#ba0036]" />
          <h2 className="text-sm font-black text-gray-900">Change password</h2>
        </div>
        <p className="text-[12px] font-bold text-gray-500 -mt-2">
          For security, changing your password signs you out of all devices — you'll log in again.
        </p>

        {[
          { label: 'Current password', val: curPw, set: setCurPw, ac: 'current-password' },
          { label: 'New password', val: newPw, set: setNewPw, ac: 'new-password' },
          { label: 'Confirm new password', val: confirmPw, set: setConfirmPw, ac: 'new-password' },
        ].map((f) => (
          <div key={f.label}>
            <label className="block text-[11px] font-bold text-gray-700 mb-1.5 uppercase tracking-wider">{f.label}</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400"><Lock size={16} /></div>
              <input
                type="password"
                value={f.val}
                onChange={(e) => f.set(e.target.value)}
                autoComplete={f.ac}
                placeholder="••••••••"
                className={`${inputCls} tracking-widest`}
                required
                minLength={f.ac === 'new-password' ? 8 : 1}
              />
            </div>
          </div>
        ))}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={changingPw || !curPw || !newPw || !confirmPw}
            className="inline-flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-xl font-black text-xs hover:bg-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {changingPw ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Change password
          </button>
        </div>
      </form>
    </div>
  );
};

export default AccountSettings;
