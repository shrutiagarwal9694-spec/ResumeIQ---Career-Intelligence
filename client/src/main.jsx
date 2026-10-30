import React, {useEffect, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import {BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useLocation, useSearchParams} from "react-router-dom";
import {FileText, LayoutDashboard, ScanSearch, History, LogOut, Upload, CheckCircle2, XCircle, Sparkles, Trash2, Download, FileDown, ArrowRight, BriefcaseBusiness, Target, TrendingUp, MessageCircle, SendHorizonal, X, Eye, EyeOff, ShieldCheck, Users as UsersIcon, Activity, BarChart3, FileSearch, Bell, CheckCheck, Circle, ExternalLink} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";
import {ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis, BarChart, Bar, XAxis, YAxis, Tooltip} from "recharts";
import "./styles.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();

const API = "http://localhost:5000/api";
const ADMIN_EMAIL = "shrutiagarwal9694@gmail.com";

function getToken() { return localStorage.getItem("resumeiq_token"); }
function notifyAuthChange() { window.dispatchEvent(new Event("resumeiq-auth-change")); }
function clearExpiredSession(response) {
  if (response.status !== 401 || !getToken()) return;
  localStorage.removeItem("resumeiq_token");
  localStorage.removeItem("resumeiq_user");
  localStorage.removeItem("resumeiq_latest_analysis");
  notifyAuthChange();
}

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
        <Route path="/alerts" element={<Protected><Shell /></Protected>} />
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
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function syncUser() {
      if (!getToken()) {
        setUser({});
        setUnreadCount(0);
        return;
      }
      try {
        const [profile, unread] = await Promise.all([
          api("/profile"),
          api("/notifications/unread-count"),
        ]);
        if (active) {
          setUser(profile);
          setUnreadCount(unread.count);
        }
      } catch {
        if (active && !getToken()) {
          setUser({});
          setUnreadCount(0);
        }
      }
    }
    const handleNotificationUpdate = () => {
      if (!getToken()) {
        setUnreadCount(0);
        return;
      }
      api("/notifications/unread-count")
        .then((result) => { if (active) setUnreadCount(result.count); })
        .catch(() => {});
    };
    syncUser();
    window.addEventListener("resumeiq-auth-change", syncUser);
    window.addEventListener("storage", syncUser);
    window.addEventListener("resumeiq-notifications-updated", handleNotificationUpdate);
    window.addEventListener("resumeiq-analysis-updated", handleNotificationUpdate);
    const poll = window.setInterval(handleNotificationUpdate, 30000);
    return () => {
      active = false;
      window.clearInterval(poll);
      window.removeEventListener("resumeiq-auth-change", syncUser);
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("resumeiq-notifications-updated", handleNotificationUpdate);
      window.removeEventListener("resumeiq-analysis-updated", handleNotificationUpdate);
    };
  }, []);

  function logout() {
    localStorage.removeItem("resumeiq_token");
    localStorage.removeItem("resumeiq_user");
    localStorage.removeItem("resumeiq_latest_analysis");
    notifyAuthChange();
    nav("/");
  }

  const Page = location.pathname === "/analyze" ? Analyze : location.pathname === "/history" ? HistoryPage : location.pathname === "/alerts" ? AlertsPage : location.pathname === "/profile" ? ProfilePage : Dashboard;
  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/analyze", label: "Analyze Resume", icon: ScanSearch },
    { to: "/history", label: "History", icon: History },
    { to: "/alerts", label: "Notifications", icon: Bell },
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
              {to === "/alerts" && unreadCount > 0 && <span className="notification-nav-count" aria-label={`${unreadCount} unread notifications`}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
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
  const jobMatchRows = rows.filter((row) => row.analysis_mode === "job-match" && row.job_match_score !== null);
  const atsRows = rows.filter((row) => row.ats_readability_score !== null);
  const averageJobMatch = jobMatchRows.length
    ? Math.round(jobMatchRows.reduce((sum, row) => sum + row.job_match_score, 0) / jobMatchRows.length)
    : 0;
  const averageAtsReadability = atsRows.length
    ? Math.round(atsRows.reduce((sum, row) => sum + row.ats_readability_score, 0) / atsRows.length)
    : 0;

  return (
    <>
      <PageTitle eyebrow="OVERVIEW" title="Your career command center" desc="Track resume performance and improve your ATS readiness." action={<Link className="primary" to="/analyze"><ScanSearch size={18} /> New Analysis</Link>} />
      <div className="stats">
        <Stat label="Analyses" value={rows.length} />
        <Stat label="Average Job Match" value={jobMatchRows.length ? `${averageJobMatch}%` : "—"} />
        <Stat label="Average ATS Readability" value={atsRows.length ? `${averageAtsReadability}%` : "—"} />
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
                  <strong title={r.analysis_mode === "resume-only" ? "ATS readability score" : r.analysis_mode === "job-match" ? "Job match score" : "Legacy score"} aria-label={`${r.analysis_mode === "resume-only" ? "ATS readability" : r.analysis_mode === "job-match" ? "Job match" : "Legacy"} score ${r.score}%`} className={r.score >= 75 ? "good" : r.score >= 55 ? "mid" : "low"}>{r.score}%</strong>
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
  const [form, setForm] = useState({
    name: "", email: "", phone: "", location: "", experienceLevel: "Student / Fresher (0 years)",
    targetJobTitles: [], atsStandard: "US / Global ATS Standard", targetIndustry: "Software & SaaS",
    technicalSkills: [], alerts: { aiJobMatchAlerts: false, weeklyAtsTips: false, autoTailorBullets: false },
  });
  const [titleInput, setTitleInput] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const resumeInput = useRef(null);

  useEffect(() => {
    let active = true;
    api("/profile")
      .then((data) => {
        if (!active) return;
        setProfile(data);
        setForm({
          name: data.name || "",
          email: data.email || "",
          phone: data.phone || "",
          location: data.location || "",
          experienceLevel: data.experienceLevel || "Student / Fresher (0 years)",
          targetJobTitles: data.targetJobTitles || [],
          atsStandard: data.atsStandard || "US / Global ATS Standard",
          targetIndustry: data.targetIndustry || "Software & SaaS",
          technicalSkills: data.technicalSkills || [],
          alerts: data.alerts || { aiJobMatchAlerts: false, weeklyAtsTips: false, autoTailorBullets: false },
        });
      })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setNotice("");
    setError("");
  }

  function addListItem(key, input, setInput, maximumLength) {
    const values = (key === "targetJobTitles" ? input.split(",") : [input])
      .map((item) => item.trim())
      .filter(Boolean);
    if (!values.length) return;
    if (values.some((value) => value.length > maximumLength)) {
      setError(`Entries must be ${maximumLength} characters or fewer.`);
      return;
    }
    const maximumCount = key === "targetJobTitles" ? 10 : 50;
    const next = [...form[key]];
    for (const value of values) {
      if (!next.some((item) => item.toLowerCase() === value.toLowerCase())) next.push(value);
    }
    if (next.length > maximumCount) {
      setError(`Add up to ${maximumCount} ${key === "targetJobTitles" ? "target job titles" : "skills"}.`);
      return;
    }
    updateForm(key, next);
    setInput("");
    setError("");
    setError("");
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await api("/profile", { method: "PATCH", body: JSON.stringify(form) });
      setProfile(updated);
      setForm({
        ...form,
        name: updated.name,
        email: updated.email,
        phone: updated.phone || "",
        location: updated.location || "",
        targetJobTitles: updated.targetJobTitles || [],
        technicalSkills: updated.technicalSkills || [],
        alerts: updated.alerts,
      });
      let cachedUser = {};
      try { cachedUser = JSON.parse(localStorage.getItem("resumeiq_user") || "{}"); } catch { /* Rebuild the cache below. */ }
      localStorage.setItem("resumeiq_user", JSON.stringify({ ...cachedUser, name: updated.name, email: updated.email }));
      notifyAuthChange();
      setNotice("Profile updated.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadResume(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const extension = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "docx", "txt"].includes(extension)) {
      setError("Supported resume formats: PDF, DOCX, and TXT.");
      return;
    }
    if (!file.size || file.size > 4 * 1024 * 1024) {
      setError("Resume files must be larger than 0 bytes and 4 MB or smaller.");
      return;
    }
    setResumeBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API}/profile/resume`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Resume-File-Name": encodeURIComponent(file.name),
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: file,
      });
      clearExpiredSession(response);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Resume upload failed.");
      const updated = await api("/profile");
      setProfile(updated);
      setNotice("Default resume updated. Existing analysis history was not changed.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setResumeBusy(false);
    }
  }

  async function viewResume() {
    const preview = window.open("about:blank", "_blank");
    if (!preview) {
      setError("Allow pop-ups to preview your stored resume.");
      return;
    }
    preview.document.title = "ResumeIQ resume preview";
    preview.document.body.textContent = "Loading your resume...";
    setError("");
    try {
      const response = await fetch(`${API}/profile/resume`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
      clearExpiredSession(response);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Could not open the stored resume.");
      }
      const blob = await response.blob();
      const name = profile.defaultResume.file_name;
      if (name.toLowerCase().endsWith(".docx")) {
        const extracted = await extractFile(new File([blob], name, { type: blob.type }));
        preview.document.body.replaceChildren();
        const text = preview.document.createElement("pre");
        text.textContent = extracted || "No readable text was found in this document.";
        text.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;padding:24px;font:14px/1.6 system-ui";
        preview.document.body.append(text);
      } else {
        preview.location.href = URL.createObjectURL(blob);
      }
    } catch (requestError) {
      preview.close();
      setError(requestError.message);
    }
  }

  async function exportData(format) {
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API}/profile/export?format=${format}`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
      clearExpiredSession(response);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Could not export profile data.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = format === "csv" ? "resumeiq-analysis-history.csv" : "resumeiq-profile-export.json";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`${format.toUpperCase()} export downloaded.`);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const initial = profile?.name?.trim()?.[0]?.toUpperCase() || "?";
  const scanUsed = profile?.monthlyScans?.used || 0;
  const scanLimit = profile?.monthlyScans?.limit || 0;
  const scanPercent = scanLimit ? Math.min(100, Math.round(scanUsed / scanLimit * 100)) : 0;
  const fileLabel = profile?.defaultResume?.file_name;
  const fileExtension = fileLabel?.split(".").pop()?.toUpperCase();
  const lastAtsScore = profile?.latestAnalysis?.atsReadabilityScore;

  return (
    <>
      <PageTitle eyebrow="ACCOUNT" title="Your profile" desc="View and update your career intelligence preferences." />
      {loading ? <div className="card form-card"><Empty text="Loading your profile..." /></div> : error && !profile ? (
        <div className="error-box" role="alert">{error}</div>
      ) : profile && <form className="profile-page-form" onSubmit={save}>
          {error && <div className="error-box" role="alert">{error}</div>}
          {notice && <div className="success-box" role="status">{notice}</div>}
          <div className="card profile-summary">
            <div className="profile-summary-user">
              <div className="profile-avatar" aria-hidden="true">{initial}</div>
              <div className="profile-identity">
                <h2>{profile.name}</h2>
                <p>{profile.email}</p>
                <div className="profile-badges">
                  {profile.targetJobTitles.length
                    ? profile.targetJobTitles.slice(0, 3).map((title) => <span className="profile-role-badge" key={title}>{title}</span>)
                    : <span className="profile-role-empty">Add your target roles below</span>}
                  <span className="profile-status-badge">Job Seeker ({profile.jobSeekingStatus})</span>
                </div>
              </div>
            </div>
            <div className="profile-summary-meta">
              <div className="profile-account-id"><span>Account ID</span><strong>{profile.id}</strong></div>
              <div className="scan-usage">
                <div className="scan-usage-heading"><span>Monthly Resume Scans</span><strong>{scanUsed} / {scanLimit} ({scanPercent}%)</strong></div>
                <div className="scan-progress" role="progressbar" aria-label="Monthly resume scans used" aria-valuemin="0" aria-valuemax={scanLimit} aria-valuenow={scanUsed}><span style={{ width: `${scanPercent}%` }} /></div>
              </div>
            </div>
          </div>
          <div className="profile-section-grid">
            <div className="profile-section-column">
            <section className="card profile-section profile-personal-section">
              <div className="profile-section-heading"><div><div className="eyebrow">ACCOUNT DETAILS</div><h3>PERSONAL INFORMATION</h3></div></div>
              <div className="profile-fields-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor="profile-name">Full Name</label>
                  <input id="profile-name" autoComplete="name" required maxLength={120} value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="profile-email">Email Address</label>
                  <input id="profile-email" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={(event) => updateForm("email", event.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="profile-phone">Phone Number</label>
                  <input id="profile-phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={20} value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="profile-location">Current Location</label>
                  <input id="profile-location" autoComplete="address-level2" maxLength={120} value={form.location} onChange={(event) => updateForm("location", event.target.value)} />
                </div>
              </div>
            </section>

            <section className="card profile-section profile-resume-section">
              <div className="profile-section-heading"><div><div className="eyebrow">RESUME STORAGE</div><h3>DEFAULT STORED RESUME</h3></div></div>
              {fileLabel ? (
                <div className="stored-resume">
                  <div className="stored-resume-file"><FileText size={22} /><div><strong>{fileLabel}</strong><span>{fileExtension} · {(profile.defaultResume.file_size / 1024 / 1024).toFixed(2)} MB</span></div></div>
                  <div className="stored-resume-meta">
                    {typeof lastAtsScore === "number" && <span>Last ATS score: <strong>{lastAtsScore}%</strong></span>}
                    <span>Last analysis: <strong>{profile.latestAnalysis?.createdAt ? new Date(profile.latestAnalysis.createdAt).toLocaleDateString() : "Not analyzed yet"}</strong></span>
                  </div>
                  <div className="stored-resume-actions">
                    <button className="secondary" type="button" onClick={viewResume}><Eye size={16} /> View</button>
                    <button className="ghost" type="button" disabled={resumeBusy} onClick={() => resumeInput.current?.click()}>{resumeBusy ? <><span className="spinner" />Uploading...</> : <><Upload size={16} /> Change File</>}</button>
                  </div>
                </div>
              ) : (
                <div className="stored-resume-empty"><p>No default resume is stored yet.</p><button className="secondary" type="button" disabled={resumeBusy} onClick={() => resumeInput.current?.click()}>{resumeBusy ? "Uploading..." : "Upload a Resume"}</button></div>
              )}
              <input ref={resumeInput} className="visually-hidden" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={uploadResume} />
              <p className="profile-help-text">PDF, DOCX, or TXT · maximum 4 MB. Replacing this file keeps your analysis history.</p>
            </section>

            <section className="card profile-section profile-account-section">
              <div className="profile-section-heading"><div><div className="eyebrow">ACCOUNT</div><h3>ACCOUNT INFORMATION</h3></div></div>
              <div className="profile-account-id"><span>Account ID</span><strong>{profile.id}</strong></div>
              <div className="profile-account-id"><span>Member Since</span><strong>{profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "—"}</strong></div>
              <div className="profile-export">
                <strong>Export My Resume Data &amp; History</strong>
                <p>Download your profile, preferences, resume metadata, and analysis history.</p>
                <div className="profile-export-actions">
                  <button className="secondary" type="button" onClick={() => exportData("json")}><Download size={16} /> Export JSON</button>
                  <button className="ghost" type="button" onClick={() => exportData("csv")}><Download size={16} /> Export CSV</button>
                </div>
              </div>
              <div className="profile-save-row">
                <button className="primary" type="submit" disabled={saving}>{saving ? <><span className="spinner" />Saving...</> : "Save Changes"}</button>
              </div>
            </section>
            </div>
            <div className="profile-section-column">
            <section className="card profile-section profile-optimizer-section">
              <div className="profile-section-heading preferences-heading">
                <div><div className="eyebrow">CAREER TARGETING</div><h3>AI OPTIMIZER PREFERENCES</h3></div>
                <span className="optimizer-badge">Used for ATS Scoring</span>
              </div>
              <div className="profile-fields-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor="profile-experience">Current Experience Level</label>
                  <select id="profile-experience" value={form.experienceLevel} onChange={(event) => updateForm("experienceLevel", event.target.value)}>
                    {["Student / Fresher (0 years)", "0-1 years", "1-3 years", "3-5 years", "5+ years"].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="profile-ats">ATS Standard &amp; Format</label>
                  <select id="profile-ats" value={form.atsStandard} onChange={(event) => updateForm("atsStandard", event.target.value)}>
                    {["US / Global ATS Standard", "Indian ATS Standard", "UK ATS Standard", "Other"].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
                <div className="field-group profile-skills-field">
                  <label className="field-label" htmlFor="profile-target-title">Primary Target Job Titles</label>
                  <div className="skill-add-row">
                    <input id="profile-target-title" value={titleInput} maxLength={500} placeholder="e.g. Frontend Developer, AI Engineer" onChange={(event) => setTitleInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addListItem("targetJobTitles", titleInput, setTitleInput, 100); } }} />
                    <button className="secondary" type="button" onClick={() => addListItem("targetJobTitles", titleInput, setTitleInput, 100)}>Add Title</button>
                  </div>
                  <div className="skill-tag-list" aria-label="Target job titles">
                    {form.targetJobTitles.map((title) => <span className="profile-skill-tag" key={title}>{title}<button type="button" aria-label={`Remove ${title}`} onClick={() => updateForm("targetJobTitles", form.targetJobTitles.filter((item) => item !== title))}><X size={13} /></button></span>)}
                  </div>
                </div>
                <div className="field-group profile-skills-field">
                  <label className="field-label" htmlFor="profile-industry">Target Industry</label>
                  <select id="profile-industry" value={form.targetIndustry} onChange={(event) => updateForm("targetIndustry", event.target.value)}>
                    {["Software & SaaS", "Artificial Intelligence / Machine Learning", "IT Services", "Finance & Banking", "Healthcare", "Education", "E-commerce", "Other"].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
                <div className="field-group profile-skills-field">
                  <label className="field-label" htmlFor="profile-skill-input">Core Technical Skills</label>
                  <div className="skill-add-row">
                    <input id="profile-skill-input" value={skillInput} maxLength={80} placeholder="Add a skill, e.g. React" onChange={(event) => setSkillInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addListItem("technicalSkills", skillInput, setSkillInput, 80); } }} />
                    <button className="secondary" type="button" onClick={() => addListItem("technicalSkills", skillInput, setSkillInput, 80)}>Add Skill</button>
                  </div>
                  <div className="skill-tag-list" aria-label="Core technical skills">
                    {form.technicalSkills.map((skill) => <span className="profile-skill-tag" key={skill}>{skill}<button type="button" aria-label={`Remove ${skill}`} onClick={() => updateForm("technicalSkills", form.technicalSkills.filter((item) => item !== skill))}><X size={13} /></button></span>)}
                  </div>
                </div>
              </div>
              <p className="profile-help-text">Profile skills are treated as self-reported context; they do not count as resume evidence unless they appear in the resume.</p>
            </section>
            <section className="card profile-section profile-alerts-section">
              <div className="profile-section-heading"><div><div className="eyebrow">PREFERENCES</div><h3>AI ANALYSIS &amp; ALERTS</h3></div></div>
              <div className="profile-alert-list">
                {[
                  ["aiJobMatchAlerts", "AI Job Match Alerts", "Receive notification suggestions tailored to your resume."],
                  ["weeklyAtsTips", "Weekly ATS Improvement Tips", "Highlight impactful keyword suggestions every Monday."],
                  ["autoTailorBullets", "Auto-tailor Bullet Points", "Highlight quantifiable metrics with AI assistance."],
                ].map(([key, label, description]) => (
                  <label className="profile-alert-option" key={key}>
                    <input type="checkbox" checked={form.alerts[key]} onChange={(event) => updateForm("alerts", { ...form.alerts, [key]: event.target.checked })} />
                    <span><strong>{label}</strong><small>{description}</small></span>
                  </label>
                ))}
              </div>
              <p className="profile-help-text">In-app alerts and weekly tips appear in Notifications. Bullet suggestions preserve existing resume text; no email, push, or automatic resume edits are performed.</p>
            </section>
            </div>
          </div>
        </form>}
    </>
  );
}

function Analyze() {
  const [file, setFile] = useState(null);
  const [storedResume, setStoredResume] = useState(null);
  const [loadingStoredResume, setLoadingStoredResume] = useState(false);
  const [text, setText] = useState("");
  const [jd, setJd] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let active = true;
    api("/profile").then((profile) => {
      if (!active) return;
      setStoredResume(profile.defaultResume);
      if (profile.targetJobTitles?.[0]) setTitle((current) => current || profile.targetJobTitles[0]);
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    });
    return () => { active = false; };
  }, []);

  async function loadStoredResume() {
    setLoadingStoredResume(true);
    setError("");
    try {
      const response = await fetch(`${API}/profile/resume`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
      clearExpiredSession(response);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Could not load your stored resume.");
      }
      const blob = await response.blob();
      const storedFile = new File([blob], storedResume.file_name, { type: blob.type });
      const extracted = await extractFile(storedFile);
      setFile(storedFile);
      setText(extracted);
      setResult(null);
      if (!extracted.trim()) setError("No readable text was extracted. This file may be scanned or image-only.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingStoredResume(false);
    }
  }

  async function choose(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError("");
    setResult(null);
    try {
      setFile(f);
      const extracted = await extractFile(f);
      setText(extracted);
      if (!extracted.trim()) setError("No readable text was extracted. This file may be scanned or image-only.");
    } catch (e) {
      setText("");
      setError(e.message);
    }
  }

  async function run() {
    if (!text.trim()) return setError("Upload a readable resume or provide its extracted text.");
    if (text.trim().length < 80) return setError("The extracted resume text is too short for reliable analysis. Check the file or its text extraction.");
    setLoading(true);
    setError("");
    setResult(null);
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
                setError("");
                setResult(null);
                setFile(droppedFile);
                extractFile(droppedFile).then((extracted) => {
                  setText(extracted);
                  if (!extracted.trim()) setError("No readable text was extracted. This file may be scanned or image-only.");
                }).catch((err) => {
                  setText("");
                  setError(err.message);
                });
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
          {storedResume && <button className="ghost stored-resume-load" type="button" disabled={loadingStoredResume} onClick={loadStoredResume}>{loadingStoredResume ? <><span className="spinner" />Loading...</> : `Use saved resume: ${storedResume.file_name}`}</button>}

          <div className="field-group">
            <label className="field-label">Target job title</label>
            <input placeholder="e.g. Frontend Developer" value={title} onChange={(e) => { setTitle(e.target.value); setResult(null); }} />
          </div>

          <div className="field-group">
            <label className="field-label">Resume text preview</label>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} placeholder="Extracted resume text appears here..." />
          </div>
        </div>

        <div className="card form-card">
          <h3>2. Paste job description</h3>
          <p className="muted">Use the exact description from the job posting. Leave blank for resume-only readability analysis.</p>
          <textarea className="jd" value={jd} onChange={(e) => { setJd(e.target.value); setResult(null); }} placeholder="Paste responsibilities, requirements, skills and qualifications..." />
          <button className="primary full" onClick={run} disabled={loading} type="button">
            {loading ? <><span className="spinner" />Analyzing your resume...</> : <>Analyze Resume<ScanSearch size={18} /></>}
          </button>
        </div>
      </div>

      {result && <Results result={result} onDownload={download} />}
    </>
  );
}

function Results({
  result,
  onDownload,
  heading = "Your resume analysis report",
  eyebrow = "ANALYSIS COMPLETE",
  downloadLabel = "JSON Report",
  downloadLoading = false,
}) {
  const score = result.overallJobMatchScore ?? result.atsReadabilityScore ?? result.overallScore ?? 0;
  const scoreLabel = result.analysisMode === "resume-only"
    ? "ATS Readability"
    : result.analysisMode === "job-match"
      ? "Job Match Score"
      : "Legacy Score";
  const bars = result.scoreBreakdown?.length
    ? result.scoreBreakdown.map((item) => ({
      name: item.dimension,
      value: item.score,
      status: item.status,
      effectiveWeight: item.effectiveWeight,
      weightedContribution: item.weightedContribution,
      reason: item.reason,
    }))
    : [
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
        <button className="secondary" onClick={onDownload} disabled={downloadLoading} type="button">
          {downloadLoading ? <><span className="spinner" />Generating PDF...</> : downloadLabel === "JSON Report" ? <><Download size={16} />{downloadLabel}</> : <><FileDown size={16} />{downloadLabel}</>}
        </button>
      </div>

      <div className="result-grid">
        <div className="card score-card">
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={245}>
              <RadialBarChart data={[{ name: scoreLabel, value: score, fill: "var(--primary)" }]} innerRadius="68%" outerRadius="100%" startAngle={90} endAngle={-270}>
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={18} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="score-center">
              <b>{score}%</b>
              <span>{scoreLabel}</span>
            </div>
          </div>
          <ScoreLabel score={score} resumeOnly={result.analysisMode === "resume-only"} legacy={!result.analysisMode} />
        </div>

        <div className="card result-breakdown-card">
          <h3>Score Breakdown</h3>
          <div className="breakdown-stack">
            {bars.map((item) => (
              <div key={item.name} className="mini-progress">
                <div className="mini-progress-head">
                  <span>{item.name}{item.effectiveWeight !== undefined && item.effectiveWeight !== null ? ` · ${item.effectiveWeight}% weight` : ""}</span>
                  <strong>{item.status === "unavailable" || item.value === null ? "N/A" : `${item.value}%${item.weightedContribution === null || item.weightedContribution === undefined ? "" : ` · ${item.weightedContribution} pts`}`}</strong>
                </div>
                <div className="mini-progress-track"><span style={{ width: `${item.value ?? 0}%` }} /></div>
                {item.reason && <p className="muted">{item.reason}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-two">
        <KeywordCard title="Matched Keywords" items={result.matchedKeywords || []} ok />
        <KeywordCard title="Missing Keywords" items={result.missingKeywords || []} />
      </div>

      {result.analysisMode === "resume-only" && (
        <div className="card section-card">
          <h3>Resume-only analysis</h3>
          <p className="muted">No job description was supplied. This report does not include job match, skill gap, or role-specific scoring.</p>
        </div>
      )}

      {result.jobRequirements?.skills?.length > 0 && (
        <div className="card section-card">
          <h3>Job Skill Evidence</h3>
          <div className="recommend-list">
            {result.jobRequirements.skills.map((item) => (
              <div key={`${item.skill}-${item.requirementType}`}>
                <strong>{item.skill}</strong> · {item.requirementType} · {item.status}
                <p className="muted">{item.explanation}</p>
                {item.evidence?.map((evidence, index) => <p className="muted" key={`${item.skill}-evidence-${index}`}>“{evidence.text}” · {evidence.section}</p>)}
              </div>
            ))}
          </div>
        </div>
      )}

      {result.experienceAnalysis?.responsibilities?.length > 0 && (
        <div className="card section-card">
          <h3>Responsibility Evidence</h3>
          <ul className="recommend-list">
            {result.experienceAnalysis.responsibilities.map((item, index) => (
              <li key={`responsibility-${index}`}>
                <strong>{item.status}</strong>: {item.requirement}
                {item.evidence?.map((evidence, evidenceIndex) => <p className="muted" key={`responsibility-${index}-${evidenceIndex}`}>“{evidence.text}”</p>)}
              </li>
            ))}
          </ul>
        </div>
      )}

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
        {result.atsReadabilityAnalysis && (
          <p className="muted">
            Estimated ATS readability: {result.atsReadabilityScore}% · {result.resumeParsingStatus} text extraction · {result.atsReadabilityAnalysis.recognizedSections}/{result.atsReadabilityAnalysis.assessedSections} common sections recognized.
            {" "}{result.atsReadabilityAnalysis.formula}
          </p>
        )}
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
          {result.improvementRecommendations?.length ? (
            <ul className="recommend-list">
              {result.improvementRecommendations.map((item, index) => (
                <li key={`recommendation-${index}`}><strong>{item.priority}: {item.action}</strong> — {item.reason} <span className="muted">Section: {item.section}. {item.changeType}.</span></li>
              ))}
            </ul>
          ) : <ul className="recommend-list">{(result.recommendations || []).map((item) => <li key={item}>{item}</li>)}</ul>}
        </div>
      </div>

      {result.projectAnalysis?.projects?.length > 0 && (
        <div className="card section-card">
          <h3>Project Relevance</h3>
          <ul className="recommend-list">
            {result.projectAnalysis.projects.map((project, index) => (
              <li key={`project-${index}`}>
                <strong>{project.name}</strong> · {project.technologies.join(", ") || "No recognized technologies"}
                <p className="muted">{project.description}</p>
                {project.demonstratedSkills.length > 0 && <p className="muted">JD skills evidenced: {project.demonstratedSkills.join(", ")}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.educationAnalysis?.requirements?.length > 0 && (
        <div className="card section-card">
          <h3>Education and Eligibility</h3>
          <ul className="recommend-list">
            {result.educationAnalysis.requirements.map((item) => <li key={item.requirement}>{item.requirement} · {item.requirementType} · {item.status}</li>)}
          </ul>
        </div>
      )}

      {result.eligibilityWarnings?.length > 0 && (
        <div className="card section-card">
          <h3>Eligibility Warnings</h3>
          <ul className="recommend-list">{result.eligibilityWarnings.map((item, index) => <li key={`eligibility-${index}`}>{item.status}: {item.message}</li>)}</ul>
        </div>
      )}

      {result.achievementAnalysis?.statements?.length > 0 && (
        <div className="card section-card">
          <h3>Achievement Evidence</h3>
          <ul className="recommend-list">
            {result.achievementAnalysis.statements.map((item, index) => <li key={`achievement-${index}`}>{item.original}{item.suggestion && <p className="muted">{item.suggestion}</p>}</li>)}
          </ul>
        </div>
      )}

      {result.softSkillsAnalysis?.length > 0 && (
        <div className="card section-card">
          <h3>Soft Skills Evidence</h3>
          <ul className="recommend-list">
            {result.softSkillsAnalysis.map((item) => <li key={item.skill}>{item.skill}: {item.status}{item.evidence?.map((evidence, index) => <p className="muted" key={`${item.skill}-${index}`}>{evidence}</p>)}</li>)}
          </ul>
        </div>
      )}

      {result.strengths?.length > 0 && (
        <div className="card section-card">
          <h3>Strengths</h3>
          <ul className="recommend-list">{result.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}

      {result.criticalGaps?.length > 0 && (
        <div className="card section-card">
          <h3>Critical Gaps</h3>
          <ul className="recommend-list">{result.criticalGaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        </div>
      )}

      {result.limitationsAndUncertainty?.length > 0 && (
        <div className="card section-card">
          <h3>Analysis Limitations</h3>
          <ul className="recommend-list">{result.limitationsAndUncertainty.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

function ScoreLabel({ score, resumeOnly, legacy }) {
  const label = legacy ? "Previously saved score" : resumeOnly ? "Estimated parsing readability" : score >= 80 ? "Strong Match" : score >= 65 ? "Competitive" : score >= 50 ? "Needs Improvement" : "Limited Match";
  const text = legacy
    ? "This report predates separate job-match and ATS readability scoring."
    : resumeOnly
    ? "This estimates text parsing and section recognition; it is not a job-match score or ATS vendor prediction."
    : "This evidence-based estimate compares extracted resume evidence with the supplied job description; it does not predict an ATS decision.";

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

const NOTIFICATION_CATEGORY_LABELS = {
  job_match: "Job Match",
  weekly_ats_tips: "Weekly ATS Tips",
  bullet_point_suggestions: "Bullet Point Suggestions",
};

function AlertsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [readFilter, setReadFilter] = useState("all");
  const [category, setCategory] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyAction, setBusyAction] = useState("");

  async function loadNotifications() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (readFilter === "unread") params.set("read", "false");
      if (readFilter === "read") params.set("read", "true");
      if (category !== "all") params.set("category", category);
      const data = await api(`/notifications?${params}`);
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
      setTotal(data.total);
      setPages(data.pages);
      if (page > data.pages) setPage(data.pages || 1);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const params = new URLSearchParams({ page: String(page), limit: "20" });
        if (readFilter === "unread") params.set("read", "false");
        if (readFilter === "read") params.set("read", "true");
        if (category !== "all") params.set("category", category);
        const data = await api(`/notifications?${params}`);
        if (!active) return;
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
        setTotal(data.total);
        setPages(data.pages);
        if (page > data.pages) setPage(data.pages || 1);
        setError("");
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    setLoading(true);
    refresh();
    const handleRefresh = () => refresh();
    window.addEventListener("resumeiq-notifications-updated", handleRefresh);
    const poll = window.setInterval(handleRefresh, 30000);
    return () => {
      active = false;
      window.clearInterval(poll);
      window.removeEventListener("resumeiq-notifications-updated", handleRefresh);
    };
  }, [page, readFilter, category]);

  function changeReadFilter(value) {
    setReadFilter(value);
    setPage(1);
  }

  function changeCategory(value) {
    setCategory(value);
    setPage(1);
  }

  async function updateRead(notification, makeRead) {
    const key = `${notification.id}:${makeRead ? "read" : "unread"}`;
    if (busyAction) return;
    setBusyAction(key);
    setActionError("");
    try {
      await api(`/notifications/${notification.id}/${makeRead ? "read" : "unread"}`, { method: "PATCH" });
      await loadNotifications();
      window.dispatchEvent(new Event("resumeiq-notifications-updated"));
      return true;
    } catch (requestError) {
      setActionError(requestError.message);
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function markAllRead() {
    if (busyAction || unreadCount === 0) return;
    setBusyAction("read-all");
    setActionError("");
    try {
      await api("/notifications/read-all", { method: "PATCH" });
      await loadNotifications();
      window.dispatchEvent(new Event("resumeiq-notifications-updated"));
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusyAction("");
    }
  }

  async function deleteNotification(notification) {
    if (busyAction) return;
    setBusyAction(`${notification.id}:delete`);
    setActionError("");
    try {
      await api(`/notifications/${notification.id}`, { method: "DELETE" });
      if (expandedId === notification.id) setExpandedId(null);
      await loadNotifications();
      window.dispatchEvent(new Event("resumeiq-notifications-updated"));
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusyAction("");
    }
  }

  async function openNotification(notification) {
    setExpandedId((current) => current === notification.id ? null : notification.id);
    if (!notification.isRead) await updateRead(notification, true);
  }

  async function openAnalysis(notification) {
    const analysisId = notification.analysisId || notification.actionData?.analysisId;
    if (!analysisId) return;
    if (!notification.isRead && !(await updateRead(notification, true))) return;
    navigate(`/history?id=${encodeURIComponent(analysisId)}`);
  }

  return (
    <>
      <PageTitle
        eyebrow="YOUR ACCOUNT"
        title="Notifications"
        desc="Review analysis alerts and personalized improvement suggestions."
        action={<button className="secondary" type="button" disabled={Boolean(busyAction) || unreadCount === 0} onClick={markAllRead}><CheckCheck size={16} /> Mark all as read</button>}
      />
      {actionError && <div className="error-box" role="alert">{actionError}</div>}
      <div className="card notifications-shell">
        <div className="notifications-toolbar">
          <div className="notifications-unread"><Bell size={18} /><strong>{unreadCount}</strong><span>unread</span></div>
          <div className="notification-filters" aria-label="Notification read status">
            {[["all", "All"], ["unread", "Unread"], ["read", "Read"]].map(([value, label]) => (
              <button key={value} type="button" className={readFilter === value ? "notification-filter active" : "notification-filter"} onClick={() => changeReadFilter(value)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="notification-category-filters" aria-label="Notification categories">
          {[
            ["all", "All categories"],
            ["job_match", "Job Match"],
            ["weekly_ats_tips", "Weekly ATS Tips"],
            ["bullet_point_suggestions", "Bullet Point Suggestions"],
          ].map(([value, label]) => (
            <button key={value} type="button" className={category === value ? "notification-category-filter active" : "notification-category-filter"} onClick={() => changeCategory(value)}>{label}</button>
          ))}
        </div>
        {loading ? (
          <div className="notification-state"><span className="spinner" /> Loading notifications...</div>
        ) : error ? (
          <div className="notification-state" role="alert"><p>{error}</p><button className="secondary small" type="button" onClick={loadNotifications}>Retry</button></div>
        ) : notifications.length === 0 ? (
          <div className="notification-empty"><Bell size={24} /><strong>No notifications here</strong><span>{total ? "Try a different filter to see more notifications." : "Your analysis alerts and improvement tips will appear here."}</span></div>
        ) : (
          <div className="notification-list">
            {notifications.map((notification) => {
              const expanded = expandedId === notification.id;
              const suggestions = Array.isArray(notification.actionData?.suggestions) ? notification.actionData.suggestions : [];
              const tips = Array.isArray(notification.actionData?.tips) ? notification.actionData.tips : [];
              return (
                <article className={`notification-item${notification.isRead ? "" : " unread"}${expanded ? " expanded" : ""}`} key={notification.id}>
                  <button className="notification-main" type="button" onClick={() => openNotification(notification)} aria-expanded={expanded}>
                    <span className="notification-status-icon">{notification.isRead ? <Circle size={10} /> : <span aria-label="Unread" />}</span>
                    <span className="notification-copy">
                      <span className="notification-item-heading"><strong>{notification.title}</strong><span className={`notification-category ${notification.category}`}>{NOTIFICATION_CATEGORY_LABELS[notification.category] || "Notification"}</span></span>
                      <span className="notification-message">{notification.message}</span>
                      <span className="notification-date">{new Date(`${notification.createdAt}Z`).toLocaleString()}</span>
                    </span>
                  </button>
                  {expanded && (
                    <div className="notification-details">
                      {notification.actionData?.jobTitle && <p><strong>Target job:</strong> {notification.actionData.jobTitle}</p>}
                      {tips.length > 0 && <ul>{tips.map((tip, index) => <li key={`${notification.id}-tip-${index}`}>{tip}</li>)}</ul>}
                      {suggestions.map((suggestion, index) => (
                        <div className="notification-suggestion" key={`${notification.id}-suggestion-${index}`}>
                          <strong>Original resume evidence{suggestion.source ? ` · ${suggestion.source}` : ""}</strong><p>{suggestion.original}</p>
                          <strong>Fact-preserving suggestion</strong><p>{suggestion.suggested}</p>
                          <strong>Why it is relevant</strong><p>{suggestion.why}</p>
                        </div>
                      ))}
                      {notification.analysisId && <button className="secondary small" type="button" onClick={() => openAnalysis(notification)}><ExternalLink size={14} /> View related analysis</button>}
                      {!notification.analysisId && <p className="muted">The related analysis is no longer available.</p>}
                    </div>
                  )}
                  <div className="notification-actions">
                    {notification.isRead
                      ? <button className="ghost small" type="button" disabled={Boolean(busyAction)} onClick={() => updateRead(notification, false)}>Mark unread</button>
                      : <button className="ghost small" type="button" disabled={Boolean(busyAction)} onClick={() => updateRead(notification, true)}>Mark read</button>}
                    <button className="ghost danger small" type="button" disabled={Boolean(busyAction)} onClick={() => deleteNotification(notification)}><Trash2 size={14} /> Delete</button>
                    {notification.analysisId && <button className="ghost small" type="button" onClick={() => openAnalysis(notification)}>Open analysis</button>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {pages > 1 && (
          <div className="notification-pagination">
            <span>Page {page} of {pages}</span>
            <div>
              <button className="secondary small" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button>
              <button className="secondary small" type="button" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>
    </>
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
  const [reportDownloadError, setReportDownloadError] = useState("");
  const [reportDownloadLoading, setReportDownloadLoading] = useState(false);
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

  async function downloadSelected() {
    if (!selectedId || reportDownloadLoading) return;
    setReportDownloadLoading(true);
    setReportDownloadError("");
    try {
      const report = await api(`/analyses/${encodeURIComponent(selectedId)}`);
      if (String(report.id) !== String(selectedId)) {
        throw new Error("The returned report does not match the selected analysis.");
      }
      const { downloadAnalysisReport } = await import("./analysis-report-pdf.js");
      await downloadAnalysisReport(report);
    } catch (error) {
      setReportDownloadError(error.message || "Could not generate the PDF report. Try again.");
    } finally {
      setReportDownloadLoading(false);
    }
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
                  <span title={r.analysis_mode === "resume-only" ? "ATS readability score" : r.analysis_mode === "job-match" ? "Job match score" : "Legacy score"} aria-label={`${r.analysis_mode === "resume-only" ? "ATS readability" : r.analysis_mode === "job-match" ? "Job match" : "Legacy"} score ${r.score}%`} className={r.score >= 75 ? "pill success" : r.score >= 55 ? "pill warn" : "pill danger"}>{r.score}%</span>
                </div>

                <div className="history-meta">

                  <div><span>{r.analysis_mode === "resume-only" || r.analysis_mode === "legacy" ? "Score type" : "Job match"}</span><strong>{r.analysis_mode === "resume-only" ? "ATS readability" : r.analysis_mode === "legacy" ? "Legacy score" : r.score >= 75 ? "Strong" : r.score >= 55 ? "Review" : "Needs work"}</strong></div>
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
                {reportDownloadError && <div className="error-box" role="alert">{reportDownloadError}</div>}
                <Results
                  result={selected.result || {}}
                  onDownload={downloadSelected}
                  downloadLabel="Download Analysis Report"
                  downloadLoading={reportDownloadLoading}
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
    ["Average Job Match", metrics.averageJobMatchScore === null ? "—" : `${metrics.averageJobMatchScore}%`],
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
      <AdminBarChart title="ATS readability distribution" data={overview.atsScoreDistribution} xKey="band" dataKey="count" color="#16a34a" emptyText="No valid ATS readability scores recorded." />
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
      <PageTitle eyebrow="USAGE" title="Usage & statistics" desc="Platform activity, job-match scores, and estimated ATS readability." />
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
      <PageTitle eyebrow="ANALYSES" title="Resume analyses" desc="Review analysis metadata and score types without exposing resume contents." />
      <form className="card admin-filters admin-analysis-search" onSubmit={applySearch}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user, email, resume, or role" aria-label="Search resume analyses" />
        <button className="primary" type="submit">Search</button>
      </form>
      {error && <div className="error-box" role="alert">{error}</div>}
      <section className="card admin-table-card">
        {loading ? <div className="admin-loading"><span className="spinner" /> Loading analyses...</div> : !result?.analyses.length ? <Empty text="No resume analyses match this search." /> : (
          <div className="admin-table-scroll"><table className="admin-table">
            <thead><tr><th>Analysis ID</th><th>User</th><th>Resume file</th><th>Target role</th><th>Analysis score</th><th>Created</th></tr></thead>
            <tbody>{result.analyses.map((analysis) => <tr key={analysis.id}>
              <td>{analysis.id}</td><td><strong>{analysis.user_name}</strong><small>{analysis.user_email}</small></td><td>{analysis.resume_name}</td><td>{analysis.job_title}</td>
              <td><span title={analysis.analysis_mode === "resume-only" ? "ATS readability" : analysis.analysis_mode === "job-match" ? "Job match" : "Legacy score"} className={analysis.score >= 75 ? "admin-score high" : analysis.score >= 55 ? "admin-score medium" : "admin-score low"}>{analysis.score}%</span></td><td>{formatAdminDate(analysis.created_at)}</td>
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
