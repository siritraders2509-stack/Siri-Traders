import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSignUp } from '@clerk/clerk-react';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';
import './Signup.css';
import './AuthForm.css';

const firstErrorMessage = (err, fallback) =>
  err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || fallback;

const Signup = () => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const navigate = useNavigate();

  const [step, setStep] = useState('details'); // 'details' | 'email-otp'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleOAuthSignUp = async (strategy) => {
    if (!isLoaded || submitting) return;
    setError('');
    try {
      await signUp.authenticateWithRedirect({
        strategy,
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/home',
      });
    } catch (err) {
      setError(firstErrorMessage(err, 'Failed to start sign-up.'));
    }
  };

  const advanceVerification = async (attempt) => {
    if (attempt.status === 'complete') {
      await setActive({ session: attempt.createdSessionId });
      navigate('/home');
      return;
    }
    const unverified = attempt.unverifiedFields || [];
    if (unverified.includes('email_address')) {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setOtp('');
      setStep('email-otp');
    } else {
      setError('Additional verification is required to finish signing up. Please contact support.');
    }
  };

  const handleDetailsSubmit = async (event) => {
    event.preventDefault();
    if (!isLoaded || submitting) return;
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Enter your name.');
      return;
    }
    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const [firstName, ...rest] = trimmedName.split(/\s+/);
    const lastName = rest.join(' ');

    setSubmitting(true);
    try {
      const attempt = await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName,
        lastName: lastName || undefined,
      });
      await advanceVerification(attempt);
    } catch (err) {
      setError(firstErrorMessage(err, 'Failed to create your account. Please check your details and try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailOtpSubmit = async (event) => {
    event.preventDefault();
    if (!isLoaded || submitting || otp.trim().length < 4) return;
    setError('');
    setSubmitting(true);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code: otp.trim() });
      await advanceVerification(attempt);
    } catch (err) {
      setError(firstErrorMessage(err, 'Invalid or expired code.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (!isLoaded || submitting) return;
    setError('');
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
    } catch (err) {
      setError(firstErrorMessage(err, 'Failed to resend the code.'));
    }
  };

  return (
    <div className="signup-page">
      <div className="signup-card">
        <div className="signup-top">
          <div className="signup-logo-circle">
            <img src="/logo-mark.webp" alt="Siri Traders" className="signup-logo-img" />
          </div>
          <h2 className="signup-title">Create Account</h2>
          <p className="signup-subtitle">Join Siri Traders for quick grocery delivery</p>
        </div>

        {step === 'details' && (
          <>
            <div className="auth-oauth-group">
              <button type="button" className="auth-oauth-btn" onClick={() => handleOAuthSignUp('oauth_google')} disabled={submitting}>
                <FcGoogle /> Continue with Google
              </button>
            </div>
            <div className="auth-divider">or</div>
          </>
        )}

        {step === 'details' && (
          <form className="auth-form" onSubmit={handleDetailsSubmit}>
            <label className="auth-field">
              <span>Full Name</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" required autoFocus />
            </label>
            <label className="auth-field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <div className="auth-field-input">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" required minLength={8} />
                <button type="button" className="auth-field-eye" onClick={() => setShowPassword(p => !p)} aria-label="Toggle password visibility">
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </label>
            <label className="auth-field">
              <span>Confirm Password</span>
              <div className="auth-field-input">
                <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" required minLength={8} />
                <button type="button" className="auth-field-eye" onClick={() => setShowConfirmPassword(p => !p)} aria-label="Toggle confirm password visibility">
                  {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </label>
            {/* Clerk's bot-protection (Smart CAPTCHA) is enabled on this
                instance — it mounts into this element automatically; the
                custom-flow API errors on signUp.create() without it. */}
            <div id="clerk-captcha" />
            <button type="submit" className="auth-submit-btn" disabled={submitting}>
              {submitting ? 'Creating Account...' : 'Continue'}
            </button>
          </form>
        )}

        {step === 'email-otp' && (
          <form className="auth-form" onSubmit={handleEmailOtpSubmit}>
            <p className="auth-otp-hint">Enter the code sent to {email}</p>
            <label className="auth-field">
              <span>OTP Code</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                className="auth-otp-input"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                required
                autoFocus
              />
            </label>
            <button type="submit" className="auth-submit-btn" disabled={submitting}>
              {submitting ? 'Verifying...' : 'Verify Email'}
            </button>
            <div className="auth-form-links">
              <button type="button" className="auth-link-btn" onClick={handleResendOtp}>Resend OTP</button>
            </div>
          </form>
        )}

        {error && <p className="auth-error">{error}</p>}

        {step === 'details' && (
          <p className="auth-footer-link">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
};

export default Signup;
