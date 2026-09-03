import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Home, Phone, Lock, Loader2, ShieldCheck, AlertCircle, Eye, EyeOff, ArrowRight, KeyRound,
} from 'lucide-react';
import { useAuth } from '../context/AdminAuthContext.jsx';
import { getSessionEndedReason, clearSessionEndedReason } from '../services/session.js';

/** Strip the leading 0 a BD number often has (01742… → 1742…) + non-digits. */
const normalizePhone = (raw) => raw.replace(/\D/g, '').replace(/^0+/, '');
const toE164 = (local) => `+880${local}`;

/**
 * Why the previous session ended. Being dropped here mid-action with no
 * explanation is the worst part of an involuntary sign-out, and "your access
 * was revoked" is a very different message from "you were signed out".
 */
const ENDED_REASONS = {
  access_revoked: 'Your admin access was removed. Contact a super admin if you think this is a mistake.',
  account_banned: 'Your account has been suspended, so the console signed you out.',
  session_expired: 'Your session expired. Please sign in again.',
};

/**
 * Dedicated admin login — phone + password, with optional 2FA step.
 * If the backend returns requires2FA: true, we show the OTP input and call
 * the /verify-2fa-login endpoint instead.
 */
const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isAuthenticated, booting } = useAuth();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [otpCode, setOtpCode] = useState('');

  // Shown once: read here, consumed by the effect below, dropped on first retry.
  const [endedNotice, setEndedNotice] = useState(() => ENDED_REASONS[getSessionEndedReason()] || '');
  useEffect(() => { clearSessionEndedReason(); }, []);

  const nextUrl = searchParams.get('next');

  const goNext = () => {
    if (nextUrl) {
      try { navigate(decodeURIComponent(nextUrl), { replace: true }); return; } catch { /* fall through */ }
    }
    navigate('/', { replace: true });
  };

  // Already signed in (e.g. opened /login with a live session) → skip the form.
  useEffect(() => {
    if (!booting && isAuthenticated) goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, isAuthenticated]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setError('');
    setEndedNotice('');
    try {
      const result = await login({ phone: toE164(phone), password });
      
      // Check if 2FA is required
      if (result?.requires2FA && result?.tempToken) {
        setRequires2FA(true);
        setTempToken(result.tempToken);
        setIsLoading(false);
        return;
      }
      
      goNext();
    } catch (err) {
      const msg = err?.code === 'admin_required'
        ? "This account doesn't have admin access."
        : err?.code === 'account_locked'
          ? 'Too many attempts. Try again in a few minutes.'
          : err?.serverMessage || 'Login failed. Check your phone and password.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPSubmit = async (e) => {
    e.preventDefault();
    if (isLoading || !otpCode) return;
    setIsLoading(true);
    setError('');
    try {
      await login({ tempToken, token: otpCode, is2FAVerification: true });
      goNext();
    } catch (err) {
      const msg = err?.code === 'invalid_otp'
        ? 'Invalid OTP code. Please try again.'
        : err?.code === 'temp_token_expired'
          ? 'Session expired. Please login again.'
          : err?.serverMessage || 'Verification failed. Please try again.';
      setError(msg);
      
      // If temp token expired, reset to login form
      if (err?.code === 'temp_token_expired') {
        setRequires2FA(false);
        setTempToken('');
        setOtpCode('');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setRequires2FA(false);
    setTempToken('');
    setOtpCode('');
    setError('');
  };

  return (
    <div className="min-h-screen w-full flex bg-[#0b0f1a] text-white font-sans">
      {/* ── Left brand panel (desktop) ── */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden border-r border-white/5">
        <div className="absolute inset-0 bg-gradient-to-br from-[#ba0036]/30 via-[#0b0f1a] to-black" />
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-[#ba0036]/20 rounded-full blur-3xl" />
        <div className="relative z-10 flex flex-col justify-between w-full p-12">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/15">
              <Home size={20} strokeWidth={2.5} className="text-white" />
            </div>
            <span className="text-lg font-black tracking-tight">
              TO-LET <span className="text-white/60">PRO</span>
            </span>
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 bg-white/5 text-white/80 text-[11px] font-bold uppercase tracking-widest py-1.5 px-3 rounded-full ring-1 ring-white/10 mb-5">
              <ShieldCheck size={13} /> Restricted access
            </div>
            <h1 className="text-4xl font-black leading-tight tracking-tight mb-4">
              Admin<br /><span className="text-[#ff5c85]">Control Center</span>
            </h1>
            <p className="text-white/60 text-sm max-w-sm leading-relaxed">
              Moderate listings, verify users, and manage support — all in one
              secure console, separate from the public app.
            </p>
          </div>

          <p className="text-[11px] font-semibold text-white/30">
            Authorized personnel only. Activity may be audited.
          </p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="w-full lg:w-[55%] flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="lg:hidden flex flex-col items-center text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#ba0036] to-[#7a0024] flex items-center justify-center shadow-lg mb-3">
              <Home size={26} strokeWidth={2.5} className="text-white" />
            </div>
            <h1 className="text-lg font-black tracking-tight">
              TO-LET <span className="text-[#ff5c85]">PRO</span>
            </h1>
            <p className="text-xs font-semibold text-white/50 mt-0.5">Admin Console</p>
          </div>

          {!requires2FA ? (
            // ── Phone + Password Form ──
            <>
              <div className="mb-7">
                <h2 className="text-2xl font-black tracking-tight">Sign in</h2>
                <p className="text-sm text-white/50 mt-1">Access the administration console.</p>
              </div>

              {endedNotice && !error && (
                <div className="mb-5 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm font-semibold text-amber-200 flex items-start gap-2" role="status">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" /> {endedNotice}
                </div>
              )}

              {error && (
                <div className="mb-5 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm font-semibold text-red-300 flex items-start gap-2" role="alert">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
                </div>
              )}

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="block text-[11px] font-bold text-white/60 mb-1.5 ml-1 uppercase tracking-wider">
                    Phone number
                  </label>
                  <div className="relative flex items-center bg-white/5 border border-white/10 rounded-xl focus-within:border-[#ba0036] focus-within:bg-white/10 transition-all overflow-hidden">
                    <div className="pl-3.5 pr-2.5 text-white/40"><Phone size={16} /></div>
                    <div className="px-1.5 py-3 border-l border-white/10 text-white/60 font-bold text-sm">+880</div>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(normalizePhone(e.target.value).slice(0, 10))}
                      maxLength={10}
                      placeholder="1XXXXXXXXX"
                      inputMode="numeric"
                      autoComplete="username"
                      className="w-full bg-transparent py-3 pl-2 pr-4 text-sm font-bold text-white placeholder:text-white/30 outline-none tracking-wide"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-white/60 mb-1.5 ml-1 uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-white/40">
                      <Lock size={16} />
                    </div>
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="w-full pl-10 pr-11 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-semibold text-white placeholder:text-white/30 focus:bg-white/10 focus:border-[#ba0036] outline-none tracking-widest transition-all"
                      required
                      minLength={1}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-white/40 hover:text-white/70 transition-colors"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || phone.length < 10 || !password}
                  className="w-full mt-2 flex items-center justify-center gap-2 bg-[#ba0036] text-white py-3.5 rounded-xl font-bold text-sm shadow-[0_6px_20px_rgba(186,0,54,0.35)] hover:bg-[#a5002f] active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={18} /> : <>Sign in <ArrowRight size={16} /></>}
                </button>
              </form>
            </>
          ) : (
            // ── 2FA OTP Form ──
            <>
              <div className="mb-7">
                <h2 className="text-2xl font-black tracking-tight">Two-Factor Authentication</h2>
                <p className="text-sm text-white/50 mt-1">Enter the 6-digit code from your authenticator app.</p>
              </div>

              {error && (
                <div className="mb-5 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm font-semibold text-red-300 flex items-start gap-2" role="alert">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
                </div>
              )}

              <form className="space-y-4" onSubmit={handleOTPSubmit}>
                <div>
                  <label className="block text-[11px] font-bold text-white/60 mb-1.5 ml-1 uppercase tracking-wider">
                    Authentication Code
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-white/40">
                      <KeyRound size={16} />
                    </div>
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-white placeholder:text-white/30 focus:bg-white/10 focus:border-[#ba0036] outline-none tracking-[0.5em] text-center transition-all"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || otpCode.length !== 6}
                  className="w-full mt-2 flex items-center justify-center gap-2 bg-[#ba0036] text-white py-3.5 rounded-xl font-bold text-sm shadow-[0_6px_20px_rgba(186,0,54,0.35)] hover:bg-[#a5002f] active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={18} /> : <>Verify <ArrowRight size={16} /></>}
                </button>

                <button
                  type="button"
                  onClick={handleBackToLogin}
                  disabled={isLoading}
                  className="w-full text-sm text-white/50 hover:text-white/80 transition-colors font-semibold"
                >
                  ← Back to login
                </button>
              </form>
            </>
          )}

          <div className="mt-8 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-white/30">
            <ShieldCheck size={13} /> Secured admin session
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
