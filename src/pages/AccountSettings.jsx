import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Phone, Lock, Save, Loader2, ShieldCheck, KeyRound, Smartphone, QrCode, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AdminAuthContext.jsx';
import { changePassword, generate2FASecret, enable2FA, disable2FA } from '../services/adminAuthService.js';

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
  const { user, updateProfile, logout, refresh } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  // 2FA state
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [loading2FA, setLoading2FA] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

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

  // 2FA functions
  const handleGenerate2FA = async () => {
    setLoading2FA(true);
    try {
      const data = await generate2FASecret();
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setShow2FASetup(true);
      setVerifyToken('');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading2FA(false);
    }
  };

  const handleEnable2FA = async (e) => {
    e.preventDefault();
    if (!verifyToken || verifyToken.length !== 6) {
      toast.error('Please enter a 6-digit code.');
      return;
    }
    setLoading2FA(true);
    try {
      await enable2FA({ secret, token: verifyToken });
      await refresh(); // Refresh user data to get updated isGoogleAuthEnabled
      toast.success('Google Authenticator enabled successfully!');
      setShow2FASetup(false);
      setQrCode('');
      setSecret('');
      setVerifyToken('');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading2FA(false);
    }
  };

  const handleDisable2FA = async (e) => {
    e.preventDefault();
    if (!disablePassword) {
      toast.error('Please enter your password.');
      return;
    }
    setLoading2FA(true);
    try {
      await disable2FA({ password: disablePassword });
      await refresh(); // Refresh user data
      toast.success('Google Authenticator disabled.');
      setShowDisableConfirm(false);
      setDisablePassword('');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading2FA(false);
    }
  };

  const cancelSetup = () => {
    setShow2FASetup(false);
    setQrCode('');
    setSecret('');
    setVerifyToken('');
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

      {/* Two-Factor Authentication */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Smartphone size={16} className="text-[#ba0036]" />
          <h2 className="text-sm font-black text-gray-900">Two-Factor Authentication</h2>
        </div>
        <p className="text-[12px] font-bold text-gray-500 -mt-2">
          Add an extra layer of security with Google Authenticator.
        </p>

        {user?.isGoogleAuthEnabled ? (
          // 2FA Enabled State
          <>
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-green-600">
                <ShieldCheck size={20} />
              </div>
              <div>
                <p className="text-sm font-black text-green-900">Two-Factor Authentication is Active</p>
                <p className="text-xs font-bold text-green-700 mt-0.5">Your account is protected with Google Authenticator.</p>
              </div>
            </div>

            {!showDisableConfirm ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowDisableConfirm(true)}
                  className="inline-flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-xl font-black text-xs hover:bg-red-700 transition-all"
                >
                  <X size={14} /> Disable 2FA
                </button>
              </div>
            ) : (
              <form onSubmit={handleDisable2FA} className="space-y-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm font-bold text-red-900">Enter your password to disable 2FA:</p>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Lock size={16} />
                  </div>
                  <input
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputCls} tracking-widest`}
                    required
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDisableConfirm(false);
                      setDisablePassword('');
                    }}
                    disabled={loading2FA}
                    className="px-4 py-2 text-sm font-bold text-gray-700 hover:text-gray-900 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading2FA || !disablePassword}
                    className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-red-700 transition-all disabled:opacity-40"
                  >
                    {loading2FA ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Confirm Disable
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          // 2FA Disabled State
          <>
            {!show2FASetup ? (
              <>
                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-amber-900">Two-Factor Authentication is Off</p>
                    <p className="text-xs font-bold text-amber-700 mt-0.5">Enable 2FA for enhanced security.</p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleGenerate2FA}
                    disabled={loading2FA}
                    className="inline-flex items-center gap-2 bg-[#ba0036] text-white px-5 py-2.5 rounded-xl font-black text-xs hover:bg-[#90002a] transition-all disabled:opacity-40"
                  >
                    {loading2FA ? <Loader2 size={14} className="animate-spin" /> : <Smartphone size={14} />} Enable 2FA
                  </button>
                </div>
              </>
            ) : (
              // Setup Flow
              <form onSubmit={handleEnable2FA} className="space-y-5 p-5 bg-gray-50 border border-gray-200 rounded-xl">
                <div className="space-y-3">
                  <p className="text-sm font-black text-gray-900">Step 1: Scan QR Code</p>
                  <p className="text-xs font-bold text-gray-600">Open Google Authenticator and scan this code:</p>
                  {qrCode && (
                    <div className="flex justify-center p-4 bg-white rounded-xl border border-gray-200">
                      <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                    </div>
                  )}
                  <div className="p-3 bg-white border border-gray-200 rounded-lg">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Manual Entry Key</p>
                    <p className="text-xs font-mono font-bold text-gray-900 break-all select-all">{secret}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-black text-gray-900">Step 2: Enter Verification Code</p>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                      <QrCode size={16} />
                    </div>
                    <input
                      type="text"
                      value={verifyToken}
                      onChange={(e) => setVerifyToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      inputMode="numeric"
                      maxLength={6}
                      className={`${inputCls} tracking-[0.5em] text-center`}
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={cancelSetup}
                    disabled={loading2FA}
                    className="px-4 py-2 text-sm font-bold text-gray-700 hover:text-gray-900 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading2FA || verifyToken.length !== 6}
                    className="inline-flex items-center gap-2 bg-[#ba0036] text-white px-5 py-2.5 rounded-xl font-black text-xs hover:bg-[#90002a] transition-all disabled:opacity-40"
                  >
                    {loading2FA ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Verify & Enable
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AccountSettings;
