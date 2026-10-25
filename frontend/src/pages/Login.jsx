import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSignIn } from '@clerk/clerk-react';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';
import './Login.css';
import './AuthForm.css';

const firstErrorMessage = (err, fallback) =>
  err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || fallback;

const Login = () => {
  const { isLoaded, signIn, setActive } = useSignIn();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleOAuthSignIn = async (strategy) => {
    if (!isLoaded || submitting) return;
    setError('');
    try {
      await signIn.authenticateWithRedirect({
        strategy,
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/home',
      });
    } catch (err) {
      setError(firstErrorMessage(err, 'Failed to start sign-in.'));
    }
  };

  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    if (!isLoaded || submitting) return;
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await signIn.create({ identifier: email.trim(), password });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/home');
      } else {
        setError('Sign-in incomplete — please try again.');
      }
    } catch (err) {
      const msg = firstErrorMessage(err, 'Invalid email or password.');
      // This account was created via Google (or another OAuth provider), so
      // it has no password on file — Clerk's raw wording for that case is
      // confusing, so point the user at the right sign-in method instead.
      if (msg.toLowerCase().includes('verification strategy is not valid')) {
        setError('This account uses Google Sign-In. Please use "Continue with Google" above instead of a password.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-top">
          <div className="login-logo-circle">
            <img src="/logo-mark.webp" alt="Siri Traders" className="login-logo-img" />
          </div>
          <h2 className="login-title">Welcome Back</h2>
          <p className="login-subtitle">Sign in to your Siri Traders account</p>
        </div>

        <div className="auth-oauth-group">
          <button type="button" className="auth-oauth-btn" onClick={() => handleOAuthSignIn('oauth_google')} disabled={submitting}>
            <FcGoogle /> Continue with Google
          </button>
        </div>

        <div className="auth-divider">or</div>

        <form className="auth-form" onSubmit={handleEmailSubmit}>
          <label className="auth-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <div className="auth-field-input">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" required />
              <button type="button" className="auth-field-eye" onClick={() => setShowPassword(p => !p)} aria-label="Toggle password visibility">
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </label>
          <button type="submit" className="auth-submit-btn" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {error && <p className="auth-error">{error}</p>}

        <p className="auth-footer-link">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
