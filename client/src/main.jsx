import React, {useEffect, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import {BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useLocation, useSearchParams} from "react-router-dom";
import {FileText, LayoutDashboard, ScanSearch, History, LogOut, Upload, CheckCircle2, XCircle, Sparkles, Trash2, Download, ArrowRight, BriefcaseBusiness, Target, TrendingUp, MessageCircle, SendHorizonal, X, Eye, EyeOff, ShieldCheck, Users as UsersIcon, Activity, BarChart3, FileSearch} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";
import {ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis, BarChart, Bar, XAxis, YAxis, Tooltip} from "recharts";
import "./styles.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();

const API = "http://localhost:5000/api";
const ADMIN_EMAIL = "shrutiagarwal9694@gmail.com";

function getToken() { return localStorage.getItem("resumeiq_token"); }
function notifyAuthChange() { window.dispatchEvent(new Event("resumeiq-auth-change")); }

async function api(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    localStorage.removeItem("resumeiq_token");
    localStorage.removeItem("resumeiq_user");
    localStorage.removeItem("resumeiq_latest_analysis");
    notifyAuthChange();
  }
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

async function extractFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "txt") return await file.text();
  const buf = await file.arrayBuffer();
  if (ext === "docx") {
    const out = await mammoth.extractRawText({ arrayBuffer: buf });
    return out.value;
  }
  if (ext === "pdf") {
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((x) => x.str).join(" ") + "\n";
    }
    return text;
  }
  throw new Error("Supported formats: PDF, DOCX, TXT");
}

function Protected({ children }) { return getToken() ? children : <Navigate to="/login" replace />; }
function getCachedRole() {
  try { return JSON.parse(localStorage.getItem("resumeiq_user") || "{}").role; } catch { return null; }
}
function PublicOnly({ children }) { return getToken() ? <Navigate to={getCachedRole() === "admin" ? "/admin/dashboard" : "/dashboard"} replace /> : children; }

function AdminGate({ children }) {
  const [state, setState] = useState("checking");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const handleAuthChange = () => {
      if (!getToken() && active) setState("signed-out");
    };
    window.addEventListener("resumeiq-auth-change", handleAuthChange);
    if (!getToken()) {
      setState("signed-out");
      return () => {
        active = false;
        window.removeEventListener("resumeiq-auth-change", handleAuthChange);
      };
    }
    api("/auth/me")
      .then((user) => { if (active) setState(user.role === "admin" ? "allowed" : "denied"); })
      .catch(() => { if (active) setState(getToken() ? "error" : "signed-out"); });
    return () => {
      active = false;
      window.removeEventListener("resumeiq-auth-change", handleAuthChange);
    };
  }, [retry]);

  if (state === "signed-out") return <Navigate to="/" replace />;
  if (state === "checking") return <div className="admin-gate-state"><span className="spinner" /> Verifying administrator access...</div>;
  if (state === "denied") return <AdminAccessDenied />;
  if (state === "error") {
    return <div className="admin-gate-state" role="alert"><p>Administrator access could not be verified.</p><button className="secondary" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>;
  }
  return children;
}

function App() {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getToken()));

  useEffect(() => {
    const syncAuth = () => setIsAuthenticated(Boolean(getToken()));
    window.addEventListener("resumeiq-auth-change", syncAuth);
    window.addEventListener("storage", syncAuth);
    return () => {
      window.removeEventListener("resumeiq-auth-change", syncAuth);
      window.removeEventListener("storage", syncAuth);
    };
  }, []);

  return (
    <>
      <Routes>
        <Route path="/" element={getToken() ? <Navigate to={getCachedRole() === "admin" ? "/admin/dashboard" : "/dashboard"} replace /> : <LandingPage />} />
        <Route path="/login" element={<PublicOnly><Auth mode="login" /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><Auth mode="register" /></PublicOnly>} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/dashboard" element={<AdminGate><AdminShell page="overview" /></AdminGate>} />
        <Route path="/admin/users" element={<AdminGate><AdminShell page="users" /></AdminGate>} />
        <Route path="/admin/analyses" element={<AdminGate><AdminShell page="analyses" /></AdminGate>} />
        <Route path="/admin/usage" element={<AdminGate><AdminShell page="usage" /></AdminGate>} />
        <Route path="/dashboard" element={<Protected><Shell /></Protected>} />
        <Route path="/analyze" element={<Protected><Shell /></Protected>} />
        <Route path="/history" element={<Protected><Shell /></Protected>} />
        <Route path="/profile" element={<Protected><Shell /></Protected>} />
        <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/"} replace />} />
      </Routes>
      {isAuthenticated && !location.pathname.startsWith("/admin") && <CareerAssistant />}
    </>
  );
}

function Shell() {
  const nav = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState({});

  useEffect(() => {
    const syncUser = () => {
      if (!getToken()) {
        setUser({});
        return;
      }
      api("/profile").then(setUser).catch(() => setUser({}));
    };
    syncUser();
    window.addEventListener("resumeiq-auth-change", syncUser);
    window.addEventListener("storage", syncUser);
    return () => {
      window.removeEventListener("resumeiq-auth-change", syncUser);
      window.removeEventListener("storage", syncUser);
    };
  }, []);

  function logout() {
    localStorage.removeItem("resumeiq_token");
    localStorage.removeItem("resumeiq_user");
    localStorage.removeItem("resumeiq_latest_analysis");
    notifyAuthChange();
    nav("/");
  }

  const Page = location.pathname === "/analyze" ? Analyze : location.pathname === "/history" ? HistoryPage : location.pathname === "/profile" ? ProfilePage : Dashboard;
  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/analyze", label: "Analyze Resume", icon: ScanSearch },
    { to: "/history", label: "History", icon: History },
    { to: "/profile", label: "Profile", icon: BriefcaseBusiness },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">R</div>
          <div>
            <b>ResumeIQ</b>
            <span>Career Intelligence</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Sidebar navigation">
          {navItems.map(({to, label, icon: Icon}) => (
            <Link key={label} to={to} className={location.pathname === to ? "nav-item active" : "nav-item"}>
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="side-bottom">
          <div className="user-mini">
            <div className="avatar">{(user.name || "U")[0]}</div>
            <div>
              <b>{user.name}</b>
              <small>{user.email}</small>
            </div>
          </div>
          <button onClick={logout} className="sidebar-logout" type="button"><LogOut size={17} /> Logout</button>
        </div>
      </aside>

      <main className="main">
        <Page />
      </main>
    </div>
  );
}

function Auth({ mode }) {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [requestedRole, setRequestedRole] = useState("user");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      const requestBody = mode === "login" ? { ...form, requestedRole } : form;
      const d = await api(`/auth/${mode}`, { method: "POST", body: JSON.stringify(requestBody) });
      localStorage.removeItem("resumeiq_latest_analysis");
      localStorage.setItem("resumeiq_token", d.token);
      localStorage.setItem("resumeiq_user", JSON.stringify(d.user));
      notifyAuthChange();
      nav(d.user.role === "admin" ? "/admin/dashboard" : "/dashboard");
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <div className="auth-brand-panel">
          <div className="brand-wrap">
            <div className="brand-icon">R</div>
            <div>
              <b>ResumeIQ</b>
              <span>Career Intelligence</span>
            </div>
          </div>

          <div className="auth-copy">
            <div className="eyebrow dark">SMART CAREER GROWTH</div>
            <h1>Make your resume stand out.</h1>
            <p>Build a stronger application strategy with ATS insights, smarter keyword targeting, and focused career guidance.</p>
          </div>

          <div className="auth-stats">
            <div>
              <strong>82%</strong>
              <span>Avg. ATS readiness</span>
            </div>
            <div>
              <strong>2x</strong>
              <span>More keyword coverage</span>
            </div>
          </div>
        </div>

        <div className="auth-form-panel">
          <div className="auth-form-head">
            <div>
              <div className="eyebrow dark">{mode === "login" ? "WELCOME BACK" : "CREATE ACCOUNT"}</div>
              <h2>{mode === "login" ? "Sign in to ResumeIQ" : "Create your account"}</h2>
            </div>
            <ShieldCheck size={18} className="auth-lock" />
          </div>

          {mode === "login" && searchParams.get("reset") === "success" && <div className="success-box" role="status">Your password has been reset successfully.</div>}
          {error && <div className="error-box">{error}</div>}

          <form className="auth-form" onSubmit={submit}>
            {mode === "login" && (
              <div className="field-wrap">
                <label htmlFor="login-role">Select Role</label>
                <select
                  id="login-role"
                  value={requestedRole}
                  onChange={(event) => {
                    const role = event.target.value;
                    setRequestedRole(role);
                    setForm((current) => ({ ...current, email: role === "admin" ? ADMIN_EMAIL : current.email === ADMIN_EMAIL ? "" : current.email }));
                  }}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                {requestedRole === "admin" && <small className="auth-role-note">Administrator access is limited to the configured account.</small>}
              </div>
            )}

            {mode === "register" && (
              <div className="field-wrap">
                <label htmlFor="name">Full name</label>
                <input id="name" aria-label="Full name" placeholder="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
            )}

            <div className="field-wrap">
              <label htmlFor="email">Email address</label>
              <input id="email" type="email" aria-label="Email address" placeholder="name@email.com" required readOnly={mode === "login" && requestedRole === "admin"} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>

            <div className="field-wrap">
              <label htmlFor="password">Password</label>
              <div className="password-wrap">
                <input id="password" type={showPassword ? "text" : "password"} aria-label="Password" placeholder="Password (6+ characters)" required minLength="6" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((prev) => !prev)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <button className="primary full auth-submit" type="submit" disabled={false}>
              {mode === "login" ? "Sign in" : "Create account"}
              <ArrowRight size={17} />
            </button>
          </form>

          {mode === "login" && requestedRole === "user" && <Link className="forgot-password-link" to="/forgot-password" state={{ fromUserLogin: true }}>Forgot Password?</Link>}

          <p className="switch-text">
            {mode === "login" ? "New to ResumeIQ? " : "Already have an account? "}
            <Link to={mode === "login" ? "/register" : "/login"}>{mode === "login" ? "Create one" : "Sign in"}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function RecoveryFrame({ eyebrow, title, description, children }) {
  return (
    <div className="auth-page">
      <div className="auth-shell recovery-shell">
        <div className="auth-brand-panel">
          <div className="brand-wrap">
            <div className="brand-icon">R</div>
            <div><b>ResumeIQ</b><span>Career Intelligence</span></div>
          </div>
          <div className="auth-copy">
            <div className="eyebrow dark">ACCOUNT SECURITY</div>
            <h1>Get back to your career workspace.</h1>
            <p>Your account recovery link is private, temporary, and can only be used once.</p>
          </div>
          <div className="auth-stats"><div><strong>30 min</strong><span>Reset link lifetime</span></div><div><strong>One time</strong><span>Secure link usage</span></div></div>
        </div>
        <div className="auth-form-panel recovery-form-panel">
          <div className="auth-form-head"><div><div className="eyebrow dark">{eyebrow}</div><h2>{title}</h2></div><ShieldCheck size={18} className="auth-lock" /></div>
          <p className="recovery-description">{description}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function ForgotPasswordPage() {
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const result = await api("/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) });
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  if (location.state?.fromUserLogin !== true) return <Navigate to="/login" replace />;

  return (
    <RecoveryFrame eyebrow="PASSWORD RECOVERY" title="Forgot Password?" description="Enter your registered email address to reset your password.">
      {message ? <div className="success-box recovery-message" role="status">{message}</div> : (
        <form className="auth-form" onSubmit={submit}>
          {error && <div className="error-box" role="alert">{error}</div>}
          <div className="field-wrap">
            <label htmlFor="recovery-email">Registered Email Address</label>
            <input id="recovery-email" type="email" autoComplete="email" required maxLength="254" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <button className="primary full auth-submit" type="submit" disabled={loading}>{loading ? <><span className="spinner" />Sending...</> : <>Continue<ArrowRight size={17} /></>}</button>
        </form>
      )}
      <Link className="recovery-back-link" to="/login">Back to Login</Link>
    </RecoveryFrame>
  );
}

function ResetPasswordPage() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (token) nav("/reset-password", { replace: true });
  }, []);

  const passwordStrength = [
    password.length >= 8,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  const passwordsMatch = password === confirmation;

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!token) return setError("This reset link is invalid or expired. Request a new one.");
    if (password.length < 8) return setError("Use a password with at least 8 characters.");
    if (passwordStrength < 4) return setError("Use uppercase and lowercase letters, a number, and a symbol.");
    if (!passwordsMatch) return setError("The passwords do not match.");
    setLoading(true);
    try {
      await api("/auth/password-reset/complete", { method: "POST", body: JSON.stringify({ token, password }) });
      localStorage.removeItem("resumeiq_token");
      localStorage.removeItem("resumeiq_user");
      localStorage.removeItem("resumeiq_latest_analysis");
      notifyAuthChange();
      setSuccess(true);
      window.setTimeout(() => nav("/login?reset=success", { replace: true }), 1200);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <RecoveryFrame eyebrow="SECURE YOUR ACCOUNT" title="Create New Password" description="Choose a new password for your ResumeIQ account.">
      {success ? <div className="success-box recovery-message" role="status">Your password has been reset successfully. Redirecting to login...</div> : (
        <form className="auth-form" onSubmit={submit}>
          {error && <div className="error-box" role="alert">{error}</div>}
          {!token && <div className="error-box" role="alert">This reset link is missing or invalid. Request a new one.</div>}
          <div className="field-wrap">
            <label htmlFor="new-password">New Password</label>
            <div className="password-wrap">
              <input id="new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength="8" maxLength="128" value={password} onChange={(event) => setPassword(event.target.value)} />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide new password" : "Show new password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
            <div className="password-strength" aria-live="polite"><span className={`strength-meter strength-${passwordStrength}`}><i /></span><small>{password.length < 8 ? "At least 8 characters" : passwordStrength === 4 ? "Strong password" : "Add mixed case, a number, and a symbol"}</small></div>
          </div>
          <div className="field-wrap">
            <label htmlFor="confirm-password">Confirm New Password</label>
            <div className="password-wrap">
              <input id="confirm-password" type={showConfirmation ? "text" : "password"} autoComplete="new-password" required minLength="8" maxLength="128" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              <button type="button" className="password-toggle" onClick={() => setShowConfirmation((value) => !value)} aria-label={showConfirmation ? "Hide confirmation password" : "Show confirmation password"}>{showConfirmation ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
            {confirmation && !passwordsMatch && <small className="password-match-error">Passwords do not match.</small>}
          </div>
          <button className="primary full auth-submit" type="submit" disabled={loading || !token}>{loading ? <><span className="spinner" />Resetting...</> : <>Reset Password<ArrowRight size={17} /></>}</button>
        </form>
      )}
      {!success && <Link className="recovery-back-link" to="/login">Back to Login</Link>}
    </RecoveryFrame>
  );
}

function PageTitle({ eyebrow, title, desc, action }) {
  return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{desc}</p></div>{action}</div>;
}

function Dashboard() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const loadRows = () => api("/analyses").then(setRows).catch(() => {});
    loadRows();
    window.addEventListener("resumeiq-analysis-updated", loadRows);
    return () => window.removeEventListener("resumeiq-analysis-updated", loadRows);
  }, []);
  const avg = rows.length ? Math.round(rows.reduce((a, b) => a + b.score, 0) / rows.length) : 0;

  return (
    <>
      <PageTitle eyebrow="OVERVIEW" title="Your career command center" desc="Track resume performance and improve your ATS readiness." action={<Link className="primary" to="/analyze"><ScanSearch size={18} /> New Analysis</Link>} />
      <div className="stats">
        <Stat label="Analyses" value={rows.length} />
        <Stat label="Average ATS score" value={`${avg}%`} />
        <Stat label="Best score" value={`${rows.length ? Math.max(...rows.map((x) => x.score)) : 0}%`} />
        <Stat label="Status" value={rows.length ? "Active" : "Ready"} />
      </div>

      <div className="dashboard-grid">
        <div className="card hero-card">
          <div className="icon-badge"><Sparkles /></div>
          <h2>Make every application count.</h2>
          <p>Upload your resume, compare it with a target job description, and get a practical ATS-oriented improvement plan.</p>
          <Link to="/analyze" className="text-link">Analyze a resume <ArrowRight size={16} /></Link>
        </div>

        <div className="card recent-card">
          <h3>Recent analyses</h3>
          {rows.length ? (
            <div className="list">
              {rows.slice(0, 5).map((r) => (
                <Link to={`/history?id=${r.id}`} className="list-row" key={r.id}>
                  <div>
                    <b>{r.job_title}</b>
                    <small>{r.resume_name}</small>
                  </div>
                  <strong className={r.score >= 75 ? "good" : r.score >= 55 ? "mid" : "low"}>{r.score}%</strong>
                </Link>
              ))}
            </div>
          ) : (
            <Empty text="No analyses yet. Start with your first resume." />
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }) { return <div className="stat"><span>{label}</span><b>{value}</b></div>; }
function Empty({ text }) { return <div className="empty">{text}</div>; }

function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ name: "", email: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    api("/profile")
      .then((data) => {
        if (!active) return;
        setProfile(data);
        setForm({ name: data.name, email: data.email });
      })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await api("/profile", { method: "PATCH", body: JSON.stringify(form) });
      setProfile(updated);
      setForm({ name: updated.name, email: updated.email });
      localStorage.setItem("resumeiq_user", JSON.stringify(updated));
      notifyAuthChange();
      setNotice("Profile updated.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageTitle eyebrow="ACCOUNT" title="Your profile" desc="View and update your account information." />
      {loading ? <div className="card form-card"><Empty text="Loading your profile..." /></div> : error && !profile ? (
        <div className="error-box" role="alert">{error}</div>
      ) : profile && (
        <form className="card form-card profile-card" onSubmit={save}>
          {error && <div className="error-box" role="alert">{error}</div>}
          {notice && <div className="success-box" role="status">{notice}</div>}
          <div className="field-group">
            <label className="field-label" htmlFor="profile-name">Full name</label>
            <input id="profile-name" autoComplete="name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="profile-email">Email address</label>
            <input id="profile-email" type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </div>
          <div className="profile-account-id"><span>Account ID</span><strong>{profile.id}</strong></div>
          <button className="primary" type="submit" disabled={saving}>{saving ? <><span className="spinner" />Saving...</> : "Save changes"}</button>
        </form>
      )}
    </>
  );
}

function Analyze() {
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [jd, setJd] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  async function choose(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError("");
    try {
      setFile(f);
      setText(await extractFile(f));
    } catch (e) {
      setError(e.message);
    }
  }

  async function run() {
    if (!text || !jd) return setError("Upload a readable resume and paste a job description.");
    setLoading(true);
    setError("");
    try {
      const data = await api("/analyze", {
        method: "POST",
        body: JSON.stringify({ resumeText: text, resumeName: file?.name || "Resume", jobDescription: jd, jobTitle: title || "Target Role" })
      });
      const saved = { ...data, resumeName: file?.name || "Resume", jobTitle: title || "Target Role" };
      setResult(saved);
      localStorage.setItem("resumeiq_latest_analysis", JSON.stringify(saved));
      window.dispatchEvent(new Event("resumeiq-analysis-updated"));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "resumeiq-analysis.json";
    a.click();
  }

  return (
    <>
      <PageTitle eyebrow="ANALYZER" title="ATS Resume Analyzer" desc="Compare your resume with a target role and uncover what needs improvement." />
      {error && <div className="error-box">{error}</div>}

      <div className="analyze-grid">
        <div className="card form-card">
          <h3>1. Upload resume</h3>
          <p className="muted">Drag & Drop Resume</p>
          <label
            className={dragging ? "upload-box dragging" : "upload-box"}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const droppedFile = e.dataTransfer.files?.[0];
              if (droppedFile) {
                setFile(droppedFile);
                extractFile(droppedFile).then(setText).catch((err) => setError(err.message));
              }
            }}
          >
            <Upload size={22} />
            <div>
              <b>{file ? file.name : "Choose your resume"}</b>
              <span>{file ? "Resume text extracted successfully" : "PDF, DOCX, or TXT"}</span>
            </div>
            <input type="file" accept=".pdf,.docx,.txt" onChange={choose} />
          </label>

          <div className="field-group">
            <label className="field-label">Target job title</label>
            <input placeholder="e.g. Frontend Developer" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="field-group">
            <label className="field-label">Resume text preview</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Extracted resume text appears here..." />
          </div>
        </div>

        <div className="card form-card">
          <h3>2. Paste job description</h3>
          <p className="muted">Use the exact description from the job posting.</p>
          <textarea className="jd" value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste responsibilities, requirements, skills and qualifications..." />
          <button className="primary full" onClick={run} disabled={loading} type="button">
            {loading ? <><span className="spinner" />Analyzing your resume...</> : <>Analyze Resume<ScanSearch size={18} /></>}
          </button>
        </div>
      </div>

      {result && <Results result={result} onDownload={download} />}
    </>
  );
}

function Results({ result, onDownload, heading = "Your ATS readiness report", eyebrow = "ANALYSIS COMPLETE" }) {
  const bars = [
    { name: "Keyword Match", value: result.keywordScore ?? 0 },
    { name: "Skills Match", value: result.skillScore ?? 0 },
    { name: "Sections", value: result.sectionScore ?? 0 },
    { name: "Formatting", value: result.formattingScore ?? Math.max(0, 100 - (result.formattingRisks || []).length * 10) },
  ];

  return (
    <section className="results">
      <div className="result-head">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2>{heading}</h2>
        </div>
        <button className="secondary" onClick={onDownload} type="button"><Download size={16} /> JSON Report</button>
      </div>

      <div className="result-grid">
        <div className="card score-card">
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={245}>
              <RadialBarChart data={[{ name: "ATS", value: result.overallScore ?? 0, fill: "var(--primary)" }]} innerRadius="68%" outerRadius="100%" startAngle={90} endAngle={-270}>
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={18} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="score-center">
              <b>{result.overallScore ?? 0}%</b>
              <span>ATS Score</span>
            </div>
          </div>
          <ScoreLabel score={result.overallScore ?? 0} />
        </div>

        <div className="card result-breakdown-card">
          <h3>Score Breakdown</h3>
          <div className="breakdown-stack">
            {bars.map((item) => (
              <div key={item.name} className="mini-progress">
                <div className="mini-progress-head">
                  <span>{item.name}</span>
                  <strong>{item.value}%</strong>
                </div>
                <div className="mini-progress-track"><span style={{ width: `${item.value}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-two">
        <KeywordCard title="Matched Keywords" items={result.matchedKeywords || []} ok />
        <KeywordCard title="Missing Keywords" items={result.missingKeywords || []} />
      </div>

      <div className="card section-card">
        <h3>Resume Sections</h3>
        <div className="section-grid">
          {(result.sections || []).map((s) => (
            <div className="section-item" key={s.name}>
              {s.present ? <CheckCircle2 className="state ok" /> : <XCircle className="state bad" />}
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card formatting-card">
        <h3>Formatting Risks</h3>
        {(result.formattingRisks || []).length ? (
          <ul className="recommend-list">
            {result.formattingRisks.map((risk) => <li key={risk}>{risk}</li>)}
          </ul>
        ) : (
          <p className="muted">No formatting risks were detected.</p>
        )}
      </div>

      <div className="grid-two">
        <div className="card skill-card">
          <h3>Detected Skills</h3>
          <div className="chips">
            {(result.detectedSkills || []).map((x) => <span className="chip" key={x}>{x}</span>)}
          </div>
        </div>

        <div className="card recommendation-card">
          <h3>Recommendations</h3>
          <ul className="recommend-list">
            {(result.recommendations || []).map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}

function ScoreLabel({ score }) {
  const label = score >= 80 ? "Strong Match" : score >= 65 ? "Competitive" : score >= 50 ? "Needs Improvement" : "High Risk";
  const text = score >= 65 ? "Strong ATS alignment, with room to optimize keywords and presentation." : "Improve keyword and section alignment before applying.";

  return <div className="score-label"><b>{label}</b><span>{text}</span></div>;
}

function KeywordCard({ title, items, ok }) {
  return (
    <div className="card keyword-card">
      <h3>{title}</h3>
      <div className="chips">
        {items.length ? items.map((x) => <span className={`chip ${ok ? "ok" : "warn"}`} key={x}>{x}</span>) : <span className="muted">None detected.</span>}
      </div>
    </div>
  );
}

function HistoryPage() {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [actionError, setActionError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("id");

  async function load() {
    setLoading(true);
    setListError("");
    try {
      setRows(await api("/analyses"));
    } catch (error) {
      setListError(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    window.addEventListener("resumeiq-analysis-updated", load);
    return () => window.removeEventListener("resumeiq-analysis-updated", load);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      setDetailError("");
      setDetailLoading(false);
      return;
    }

    let active = true;
    setSelected(null);
    setDetailError("");
    setDetailLoading(true);
    api(`/analyses/${encodeURIComponent(selectedId)}`)
      .then((data) => { if (active) setSelected(data); })
      .catch((error) => { if (active) setDetailError(error.message); })
      .finally(() => { if (active) setDetailLoading(false); });

    return () => { active = false; };
  }, [selectedId, detailAttempt]);

  useEffect(() => {
    if (!selectedId) return undefined;

    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, [selectedId]);

  function open(id) {
    setSearchParams({ id: String(id) });
  }

  function downloadSelected() {
    const blob = new Blob([JSON.stringify(selected, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "resumeiq-analysis.json";
    link.click();
  }

  async function del(id) {
    if (!confirm("Delete this analysis?")) return;
    setActionError("");
    try {
      await api(`/analyses/${id}`, { method: "DELETE" });
      if (selectedId === String(id)) setSearchParams({}, { replace: true });
      await load();
    } catch (error) {
      setActionError(error.message);
    }
  }

  const filteredRows = rows
    .filter((r) => {
      const matchesQuery = [r.job_title, r.resume_name].join(" ").toLowerCase().includes(query.toLowerCase());
      const matchesFilter = filter === "all" || (filter === "strong" ? r.score >= 75 : filter === "average" ? r.score >= 55 && r.score < 75 : r.score < 55);
      return matchesQuery && matchesFilter;
    })
    .sort((a, b) => {
      if (sort === "score-high") return b.score - a.score;
      if (sort === "score-low") return a.score - b.score;
      if (sort === "oldest") return new Date(a.created_at) - new Date(b.created_at);
      return new Date(b.created_at) - new Date(a.created_at);
    });

  return (
    <>
      <PageTitle eyebrow="HISTORY" title="Analysis history" desc="Review your previous resume checks and track progress." />
      {actionError && <div className="error-box" role="alert">{actionError}</div>}

      <div className="card history-shell">
        <div className="history-toolbar">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search analyses" aria-label="Search analyses" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter analyses">
            <option value="all">All results</option>
            <option value="strong">Strong</option>
            <option value="average">Average</option>
            <option value="low">Low</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort analyses">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="score-high">Highest score</option>
            <option value="score-low">Lowest score</option>
          </select>
        </div>

        {loading ? (
          <Empty text="Loading analyses..." />
        ) : listError ? (
          <div className="history-load-error" role="alert">
            <span>{listError}</span>
            <button className="secondary small" type="button" onClick={load}>Retry</button>
          </div>
        ) : !filteredRows.length ? (
          <Empty text={rows.length ? "No saved analyses match your current search." : "No analysis history found. Analyze your first resume to get started."} />
        ) : (
          <div className="history-grid">
            {filteredRows.map((r) => (
              <div className="history-card" key={r.id}>
                <div className="history-card-head">
                  <div>
                    <p className="history-label">Job Title</p>
                    <h3>{r.job_title}</h3>
                  </div>
                  <span className={r.score >= 75 ? "pill success" : r.score >= 55 ? "pill warn" : "pill danger"}>{r.score}%</span>
                </div>

                <div className="history-meta">

                  <div><span>Status</span><strong>{r.score >= 75 ? "Strong" : r.score >= 55 ? "Review" : "Needs work"}</strong></div>
                   <div><span>Date</span><strong>{new Date(r.created_at + "Z").toLocaleDateString()}</strong></div>
                </div>

                <div className="history-actions">
                  <button className="secondary small" type="button" onClick={() => open(r.id)}><ArrowRight size={15} /> View</button>
                  <button className="ghost danger small" type="button" onClick={() => del(r.id)}><Trash2 size={15} /> Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedId && (
        <div className="modal-backdrop" onClick={() => setSearchParams({}, { replace: true })}>
          <div className="modal history-report-modal" role="dialog" aria-modal="true" aria-label="Saved analysis report" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSearchParams({}, { replace: true })} type="button" aria-label="Close report"><X size={18} /></button>
            {detailLoading ? (
              <Empty text="Loading saved analysis..." />
            ) : detailError ? (
              <div className="history-detail-error" role="alert">
                <p>{detailError}</p>
                <button className="secondary small" type="button" onClick={() => setDetailAttempt((attempt) => attempt + 1)}>Retry</button>
              </div>
            ) : selected && (
              <>
                <div className="history-report-meta">
                  <div><span>Resume</span><strong>{selected.resume_name || "Resume"}</strong></div>
                  <div><span>Analyzed</span><strong>{new Date(`${selected.created_at}Z`).toLocaleString()}</strong></div>
                </div>
                <Results
                  result={selected.result || {}}
                  onDownload={downloadSelected}
                  heading={selected.job_title || "Saved analysis"}
                  eyebrow="SAVED ANALYSIS"
                />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function AdminAccessDenied() {
  return (
    <main className="admin-gate-state">
      <ShieldCheck size={32} />
      <h1>Access denied</h1>
      <p>This account does not have administrator permissions.</p>
      <Link className="primary" to="/dashboard">Return to ResumeIQ</Link>
    </main>
  );
}

function AdminShell({ page }) {
  const nav = useNavigate();
  const location = useLocation();
  const [admin, setAdmin] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api("/auth/me").then((user) => { if (active) setAdmin(user); }).catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, []);

  function logout() {
    localStorage.removeItem("resumeiq_token");
    localStorage.removeItem("resumeiq_user");
    localStorage.removeItem("resumeiq_latest_analysis");
    notifyAuthChange();
    nav("/");
  }

  const links = [
    { to: "/admin/dashboard", label: "Overview", icon: LayoutDashboard },
    { to: "/admin/users", label: "Users", icon: UsersIcon },
    { to: "/admin/analyses", label: "Resume Analyses", icon: FileSearch },
    { to: "/admin/usage", label: "Usage & Statistics", icon: Activity },
  ];
  const Page = page === "users" ? AdminUsersPage : page === "analyses" ? AdminAnalysesPage : page === "usage" ? AdminUsagePage : AdminOverviewPage;

  return (
    <div className="app-shell admin-app-shell">
      <aside className="sidebar admin-sidebar">
        <div className="brand">
          <div className="brand-icon">R</div>
          <div><b>ResumeIQ</b><span>Platform Admin</span></div>
        </div>
        <nav className="sidebar-nav" aria-label="Admin navigation">
          {links.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className={location.pathname === to ? "nav-item active" : "nav-item"}>
              <Icon size={18} /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="user-mini">
            <div className="avatar">{(admin?.name || "A")[0].toUpperCase()}</div>
            <div><b>{admin?.name || "Administrator"}</b><small>{admin?.email || error || "Verifying session..."}</small></div>
          </div>
          <button onClick={logout} className="sidebar-logout" type="button"><LogOut size={17} /> Logout</button>
        </div>
      </aside>
      <main className="main admin-main">
        <nav className="admin-mobile-nav" aria-label="Admin navigation">
          {links.map(({ to, label, icon: Icon }) => <Link key={to} to={to} className={location.pathname === to ? "active" : ""}><Icon size={16} />{label}</Link>)}
        </nav>
        <Page />
      </main>
    </div>
  );
}

function AdminOverviewPage() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try { setOverview(await api("/admin/overview")); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);
  const metrics = overview?.metrics;
  const cards = metrics ? [
    ["Registered users", metrics.totalUsers],
    ["Resume analyses", metrics.totalAnalyses],
    ["Resumes uploaded", metrics.totalResumesUploaded],
    ["Active users · 30 days", metrics.activeUsers30Days],
    ["Analyses today", metrics.analysesToday],
    ["Average ATS score", `${metrics.averageAtsScore}%`],
    ["New users this month", metrics.newUsersThisMonth],
    ["Analyses per user", metrics.averageAnalysesPerUser],
  ] : [];

  return (
    <>
      <PageTitle eyebrow="ADMINISTRATION" title="Platform overview" desc="Live account, analysis, and usage metrics." action={<button className="secondary" type="button" onClick={load} disabled={loading}><Activity size={16} /> Refresh</button>} />
      {loading ? <div className="card admin-loading"><span className="spinner" /> Loading platform metrics...</div> : error ? <div className="error-box" role="alert">{error}</div> : overview && (
        <>
          <div className="stats admin-stats">{cards.map(([label, value]) => <Stat key={label} label={label} value={value} />)}</div>
          <p className="admin-data-note">Resume uploads are counted from stored analysis records. Activity and daily metrics use UTC.</p>
          <AdminAnalyticsCharts overview={overview} compact />
        </>
      )}
    </>
  );
}

function AdminBarChart({ title, data, xKey, dataKey, color = "#2563eb", emptyText = "No data available yet." }) {
  const hasValues = data?.some((item) => Number(item[dataKey]) > 0);
  return (
    <section className="card admin-chart-card">
      <div className="admin-chart-heading"><h3>{title}</h3><BarChart3 size={17} /></div>
      {hasValues ? (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 2 }}>
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      ) : <Empty text={emptyText} />}
    </section>
  );
}

function AdminAnalyticsCharts({ overview, compact = false }) {
  const titleData = (overview.topTargetJobTitles || []).map((item) => ({ ...item, label: item.title }));
  return (
    <div className="admin-chart-grid">
      <AdminBarChart title="User registrations · 12 months" data={overview.monthlyTrends} xKey="label" dataKey="registrations" color="#0e7490" emptyText="No registrations in this period." />
      <AdminBarChart title="Resume analyses · 12 months" data={overview.monthlyTrends} xKey="label" dataKey="analyses" color="#2563eb" emptyText="No analyses in this period." />
      <AdminBarChart title="ATS score distribution" data={overview.atsScoreDistribution} xKey="band" dataKey="count" color="#16a34a" emptyText="No valid ATS scores recorded." />
      {!compact && <AdminBarChart title="Popular target job titles" data={titleData} xKey="label" dataKey="count" color="#ea580c" emptyText="No target job titles have been selected." />}
    </div>
  );
}

function AdminUsagePage() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/admin/overview").then(setOverview).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageTitle eyebrow="USAGE" title="Usage & statistics" desc="Platform activity and ATS score trends based on stored records." />
      {loading ? <div className="card admin-loading"><span className="spinner" /> Loading usage statistics...</div> : error ? <div className="error-box" role="alert">{error}</div> : overview && <AdminAnalyticsCharts overview={overview} />}
    </>
  );
}

function formatAdminDate(value) {
  return value ? new Date(`${value.replace(" ", "T")}Z`).toLocaleString() : "Never";
}

function AdminUsersPage() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [activity, setActivity] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) params.set("q", search);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (activity) params.set("activity", activity);
    setLoading(true);
    api(`/admin/users?${params}`)
      .then((data) => { if (active) setResult(data); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search, from, to, activity]);

  async function viewUser(id) {
    setSelected({ loading: true });
    try { setSelected(await api(`/admin/users/${id}`)); }
    catch (requestError) { setSelected({ error: requestError.message }); }
  }

  function applySearch(event) {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
  }

  return (
    <>
      <PageTitle eyebrow="ACCOUNTS" title="Users" desc="Search registered accounts and review basic account activity." />
      <form className="card admin-filters" onSubmit={applySearch}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" aria-label="Search users by name or email" />
        <label>From <input type="date" value={from} onChange={(event) => { setPage(1); setFrom(event.target.value); }} /></label>
        <label>To <input type="date" value={to} onChange={(event) => { setPage(1); setTo(event.target.value); }} /></label>
        <select aria-label="Filter by activity" value={activity} onChange={(event) => { setPage(1); setActivity(event.target.value); }}>
          <option value="">All activity</option><option value="30d">Active in 30 days</option><option value="90d">Active in 90 days</option><option value="inactive">Inactive 90+ days</option>
        </select>
        <button className="primary" type="submit">Search</button>
      </form>
      {error && <div className="error-box" role="alert">{error}</div>}
      <section className="card admin-table-card">
        {loading ? <div className="admin-loading"><span className="spinner" /> Loading users...</div> : !result?.users.length ? <Empty text="No users match these filters." /> : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead><tr><th>ID</th><th>User</th><th>Role</th><th>Registered</th><th>Analyses</th><th>Last active</th><th /></tr></thead>
              <tbody>{result.users.map((user) => (
                <tr key={user.id}>
                  <td>{user.id}</td><td><strong>{user.name}</strong><small>{user.email}</small></td><td><span className="admin-role-pill">User</span></td>
                  <td>{formatAdminDate(user.created_at)}</td><td>{user.analyses_count}</td><td>{formatAdminDate(user.last_active_at)}</td>
                  <td><button className="secondary small" type="button" onClick={() => viewUser(user.id)}>Details</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {result?.total > 0 && <AdminPagination page={result.page} pages={result.pages} total={result.total} onChange={setPage} />}
      </section>
      {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><section className="modal admin-user-modal" role="dialog" aria-modal="true" aria-label="User details" onClick={(event) => event.stopPropagation()}>
        <button className="close-btn" type="button" onClick={() => setSelected(null)} aria-label="Close user details"><X size={18} /></button>
        {selected.loading ? <div className="admin-loading"><span className="spinner" /> Loading user...</div> : selected.error ? <div className="error-box" role="alert">{selected.error}</div> : <>
          <div className="eyebrow">USER ACCOUNT</div><h2>{selected.name}</h2><p className="muted">{selected.email}</p>
          <dl className="admin-user-details"><div><dt>User ID</dt><dd>{selected.id}</dd></div><div><dt>Role</dt><dd>{selected.role}</dd></div><div><dt>Registered</dt><dd>{formatAdminDate(selected.created_at)}</dd></div><div><dt>Last active</dt><dd>{formatAdminDate(selected.last_active_at)}</dd></div><div><dt>Total analyses</dt><dd>{selected.analyses_count}</dd></div></dl>
        </>}
      </section></div>}
    </>
  );
}

function AdminAnalysesPage() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) params.set("q", search);
    setLoading(true);
    api(`/admin/analyses?${params}`)
      .then((data) => { if (active) setResult(data); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search]);

  function applySearch(event) { event.preventDefault(); setPage(1); setSearch(query.trim()); }

  return (
    <>
      <PageTitle eyebrow="ANALYSES" title="Resume analyses" desc="Review analysis metadata and ATS scores without exposing resume contents." />
      <form className="card admin-filters admin-analysis-search" onSubmit={applySearch}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user, email, resume, or role" aria-label="Search resume analyses" />
        <button className="primary" type="submit">Search</button>
      </form>
      {error && <div className="error-box" role="alert">{error}</div>}
      <section className="card admin-table-card">
        {loading ? <div className="admin-loading"><span className="spinner" /> Loading analyses...</div> : !result?.analyses.length ? <Empty text="No resume analyses match this search." /> : (
          <div className="admin-table-scroll"><table className="admin-table">
            <thead><tr><th>Analysis ID</th><th>User</th><th>Resume file</th><th>Target role</th><th>ATS score</th><th>Created</th></tr></thead>
            <tbody>{result.analyses.map((analysis) => <tr key={analysis.id}>
              <td>{analysis.id}</td><td><strong>{analysis.user_name}</strong><small>{analysis.user_email}</small></td><td>{analysis.resume_name}</td><td>{analysis.job_title}</td>
              <td><span className={analysis.score >= 75 ? "admin-score high" : analysis.score >= 55 ? "admin-score medium" : "admin-score low"}>{analysis.score}%</span></td><td>{formatAdminDate(analysis.created_at)}</td>
            </tr>)}</tbody>
          </table></div>
        )}
        {result?.total > 0 && <AdminPagination page={result.page} pages={result.pages} total={result.total} onChange={setPage} />}
      </section>
    </>
  );
}

function AdminPagination({ page, pages, total, onChange }) {
  return <div className="admin-pagination"><span>{total} records · Page {page} of {Math.max(1, pages)}</span><div>
    <button className="secondary small" type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
    <button className="secondary small" type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
  </div></div>;
}

function FeatureCard({ icon: Icon, title, text }) {
  return (
    <div className="feature-card">
      <div className="feature-icon"><Icon size={22} /></div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function ChatSuggestions({ onSelect }) {
  const suggestions = [
    "How can I improve my ATS score?",
    "What keywords should I add to my resume?",
    "How should I prepare for an interview?",
    "Review my resume strategy",
    "How can I make my resume more professional?",
  ];

  return (
    <div className="chat-suggestions">
      {suggestions.map((suggestion) => <button key={suggestion} type="button" className="suggestion-btn" onClick={() => onSelect(suggestion)}>{suggestion}</button>)}
    </div>
  );
}

function CareerAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ id: "welcome", role: "assistant", text: "Hi! I can help with resume improvements, ATS optimization, interview prep, job-search strategy, and career growth." }]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [analysisContext, setAnalysisContext] = useState(null);
  const chatRef = useRef(null);

  useEffect(() => {
    const syncAnalysis = () => {
      try {
        setAnalysisContext(JSON.parse(localStorage.getItem("resumeiq_latest_analysis") || "null"));
      } catch {
        setAnalysisContext(null);
      }
    };

    syncAnalysis();
    window.addEventListener("resumeiq-analysis-updated", syncAnalysis);
    const handleOpen = () => setOpen(true);
    window.addEventListener("resumeiq-open-chat", handleOpen);
    return () => {
      window.removeEventListener("resumeiq-analysis-updated", syncAnalysis);
      window.removeEventListener("resumeiq-open-chat", handleOpen);
    };
  }, []);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, isLoading, open]);

  async function sendMessage(messageText) {
    const text = (messageText || input).trim();
    if (!text || isLoading) return;
    const userMessage = { id: `${Date.now()}-${Math.random()}`, role: "user", text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const data = await api("/chat", { method: "POST", body: JSON.stringify({ message: text, context: { analysis: analysisContext || {} } }) });
      setMessages((prev) => [...prev, { id: `${Date.now()}-assistant`, role: "assistant", text: data.reply || "I'm here to help with your resume and career plan." }]);
    } catch {
      setMessages((prev) => [...prev, { id: `${Date.now()}-assistant-error`, role: "assistant", text: "Career Assistant is temporarily unavailable. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  }

  const showSuggestions = messages.length === 1 && !isLoading;

  return (
    <div className="career-assistant-wrapper">
      {!open && (
        <button className="career-toggle" onClick={() => setOpen(true)} type="button" aria-label="Open ResumeIQ Career Assistant">
          <Sparkles size={17} />
          <span>Career AI</span>
        </button>
      )}

      {open && (
        <div className="career-panel" role="dialog" aria-label="ResumeIQ Career Assistant dialog" aria-live="polite">
          <div className="chat-header">
            <div>
              <h3>ResumeIQ Career Assistant</h3>
              <small>Online</small>
            </div>
            <button className="close-chat" type="button" onClick={() => setOpen(false)} aria-label="Close Career Assistant"><X size={18} /></button>
          </div>
          <div className="chat-subtitle">Your personal career & resume assistant</div>
          <div className="chat-body" ref={chatRef}>
            {messages.map((message) => (
              <div key={message.id} className={`message-row ${message.role}`}>
                <div className={`message-bubble ${message.role}`}>{message.text}</div>
              </div>
            ))}
            {isLoading && (
              <div className="message-row assistant">
                <div className="message-bubble assistant typing-indicator"><span /><span /><span /></div>
              </div>
            )}
          </div>
          {showSuggestions && <ChatSuggestions onSelect={sendMessage} />}
          <div className="chat-input-row">
            <textarea aria-label="Ask about your resume, ATS, interview or career" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your resume, ATS, interview or career..." rows={1} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} />
            <button className="send-btn" type="button" onClick={() => sendMessage()} disabled={isLoading || !input.trim()} aria-label="Send message"><SendHorizonal size={17} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function LandingPage() {
  const nav = useNavigate();

  const features = [
    { icon: Target, title: "ATS Score", text: "Get a clear resume readiness score from 0 to 100." },
    { icon: Sparkles, title: "Keyword Analysis", text: "Find important keywords matched and missing from your resume." },
    { icon: BriefcaseBusiness, title: "Skill Detection", text: "Identify technical skills relevant to your target job." },
    { icon: FileText, title: "Section Analysis", text: "Check whether important resume sections are present." },
    { icon: TrendingUp, title: "Smart Recommendations", text: "Get actionable suggestions to improve your resume." },
    { icon: History, title: "Analysis History", text: "Track and review previous resume analyses." },
  ];

  const steps = [
    { number: "01", title: "Upload Resume", text: "Add your PDF, DOCX, or TXT resume file." },
    { number: "02", title: "Add Job Description", text: "Paste the target role description you want to match." },
    { number: "03", title: "Analyze", text: "Run the ATS check to compare skills, wording, and sections." },
    { number: "04", title: "Improve", text: "Review keyword gaps, missing sections, and suggestions." },
    { number: "05", title: "Apply With Confidence", text: "Submit a stronger resume with better ATS readiness." },
  ];

  const benefits = [
    "Save time",
    "Improve keyword matching",
    "Understand ATS readiness",
    "Identify missing skills",
    "Get actionable recommendations",
    "Keep analysis history",
  ];

  useEffect(() => {
    const items = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  const handleAssistantClick = () => {
    if (getToken()) {
      window.dispatchEvent(new Event("resumeiq-open-chat"));
      return;
    }
    nav("/register");
  };

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="nav-shell">
          <Link to="/" className="landing-brand" aria-label="ResumeIQ home">
            <span className="brand-icon">R</span>
            <span className="brand-copy">
              <strong>ResumeIQ</strong>
              <small>Career Intelligence</small>
            </span>
          </Link>

          <nav className="landing-nav" aria-label="Main navigation">
            <a href="#home">Home</a>
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#benefits">Benefits</a>
            <a href="#about">About</a>
          </nav>

          <div className="nav-actions">
            <Link to="/login" className="nav-login">Login</Link>
            <Link to="/register" className="nav-primary">Sign Up</Link>
          </div>
        </div>
      </header>

      <main className="landing-main">
        <section id="home" className="landing-hero reveal">
          <div className="hero-copy">
            <div className="hero-badge">Smart Resume Analysis - ATS Ready</div>
            <h1>Build a Resume That Gets Noticed.</h1>
            <p>Analyze your resume against real job descriptions, discover missing keywords, and improve your ATS readiness with ResumeIQ.</p>
            <div className="hero-actions">
              <Link to="/register" className="primary large">Analyze My Resume</Link>
              <a href="#features" className="secondary large">Explore Features</a>
            </div>
          </div>

          <div className="hero-visual" aria-label="ATS score preview">
            <div className="report-card">
              <div className="report-topbar">
                <span className="report-pill">ATS Ready</span>
                <span className="report-status">Live preview</span>
              </div>

              <div className="report-body">
                <div className="score-ring" style={{ "--progress": 82 }}>
                  <div className="score-ring-inner">
                    <strong>82%</strong>
                    <span>ATS Score</span>
                  </div>
                </div>

                <div className="metric-stack">
                  <MetricBar label="Keyword Match" value={84} />
                  <MetricBar label="Skills" value={92} />
                  <MetricBar label="Formatting" value={88} />
                </div>
              </div>

              <div className="mini-summary">
                <div>
                  <span>Keyword Match</span>
                  <strong>84%</strong>
                </div>
                <div>
                  <span>Skills</span>
                  <strong>92%</strong>
                </div>
                <div>
                  <span>Formatting</span>
                  <strong>88%</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="feature-section reveal">
          <div className="section-heading">
            <div className="eyebrow dark">WHY RESUMEIQ</div>
            <h2>Everything You Need to Improve Your Resume</h2>
          </div>

          <div className="feature-grid">
            {features.map((feature) => (
              <FeatureCard key={feature.title} icon={feature.icon} title={feature.title} text={feature.text} />
            ))}
          </div>
        </section>

        <section id="how-it-works" className="steps-section reveal">
          <div className="section-heading center">
            <div className="eyebrow dark">HOW IT WORKS</div>
            <h2>How ResumeIQ Works</h2>
          </div>

          <div className="steps-grid">
            {steps.map((step) => (
              <div className="step-card" key={step.number}>
                <span className="step-number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="score-visual reveal">
          <div className="score-visual-copy">
            <div className="eyebrow dark">ATS VISUAL</div>
            <h2>Know Your Resume Strength</h2>
            <p>Preview the score breakdown to understand where your resume performs well and where it can improve.</p>
          </div>

          <div className="score-visual-card">
            <div className="score-main">
              <div className="score-main-ring" style={{ "--progress": 82 }}>
                <div>
                  <strong>82</strong>
                  <span>/ 100</span>
                </div>
              </div>
              <div>
                <div className="score-badge">Strong Match</div>
                <p>Visual ATS preview data only, shown for UI demonstration.</p>
              </div>
            </div>

            <div className="breakdown-list">
              <MetricBar label="Keyword Match" value={84} />
              <MetricBar label="Skills Match" value={92} />
              <MetricBar label="Section Quality" value={88} />
              <MetricBar label="Formatting" value={90} />
            </div>
          </div>
        </section>

        <section id="benefits" className="benefits-section reveal">
          <div className="section-heading center">
            <div className="eyebrow dark">BENEFITS</div>
            <h2>Why Use ResumeIQ?</h2>
          </div>

          <div className="benefits-grid">
            {benefits.map((item) => (
              <div className="benefit-item" key={item}>
                <span className="benefit-check"><CheckCircle2 size={17} aria-hidden="true" /></span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="about" className="about-block reveal">
          <div className="about-card">
            <div>
              <div className="eyebrow dark">ABOUT</div>
              <h2>Career-focused insights for smarter applications.</h2>
            </div>
            <p>ResumeIQ helps you improve job-fit, identify weak spots, and build a more confident application strategy with practical ATS guidance.</p>
          </div>
        </section>

        <section className="final-cta reveal">
          <div>
            <h2>Ready to Improve Your Resume?</h2>
            <p>Analyze your resume and discover what you can improve before applying.</p>
          </div>
          <Link to="/login" className="primary large">Start Resume Analysis</Link>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-brand">
          <span className="brand-icon">R</span>
          <span className="brand-copy">
            <strong>ResumeIQ</strong>
            <small>Career Intelligence</small>
          </span>
        </div>
        <p>Build better. Apply smarter.</p>
        <small>(c) 2026 ResumeIQ</small>
      </footer>
    </div>
  );
}

function MetricBar({ label, value }) {
  return (
    <div className="metric-bar">
      <div className="metric-meta">
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="progress-track">
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<BrowserRouter><App /></BrowserRouter>);
