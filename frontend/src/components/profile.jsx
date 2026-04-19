import { useState, useEffect, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

const ROLES = ['Researcher', 'Student', 'Farmer', 'Government Official', 'NGO'];

// ============================================================
//  HELPERS
// ============================================================

function authHeaders(token) {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// ============================================================
//  SUB-COMPONENTS
// ============================================================

const SectionHeader = ({ title }) => (
  <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-3">{title}</h3>
);

const Field = ({ label, value }) => (
  <div>
    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{label}</span>
    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100 mt-0.5">{value || <span className="text-zinc-400 italic">Not set</span>}</p>
  </div>
);

// ============================================================
//  LOGIN / REGISTER FORM
// ============================================================

function AuthForm({ onSuccess }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', institution: '', role: 'Researcher' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url = mode === 'login' ? `${API}/auth/login` : `${API}/auth/register`;
      const body = mode === 'login'
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password, institution: form.institution, role: form.role };

      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();

      if (!res.ok) throw new Error(data.detail || 'Something went wrong');
      localStorage.setItem('sar_token', data.access_token);
      onSuccess(data.access_token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo3.png" alt="Sakahang Lupa" className="w-12 h-12 object-contain mb-3" />
          <h1 className="text-lg font-bold" style={{ fontFamily: 'Georgia, serif' }}>
            <span className="text-[#1f602e] dark:text-[#a2df87]">Sakahang </span>
            <span className="text-[#d4a017]">Lupa</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">Sign in to save your areas of interest</p>
        </div>

        {/* Toggle */}
        <div className="flex bg-zinc-100 dark:bg-zinc-700 rounded-lg p-1 mb-6">
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }}
              className={`flex-1 py-2 text-xs font-bold rounded-md transition-all capitalize ${mode === m ? 'bg-white dark:bg-zinc-600 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}>
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-300 mb-1">Full Name</label>
                <input type="text" required value={form.name} onChange={e => update('name', e.target.value)}
                  placeholder="Juan dela Cruz"
                  className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-300 mb-1">Institution</label>
                <input type="text" value={form.institution} onChange={e => update('institution', e.target.value)}
                  placeholder="BSU-Alangilan, UPLB, DA-CALABARZON, or N/A"
                  className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-300 mb-1">Role</label>
                <select value={form.role} onChange={e => update('role', e.target.value)}
                  className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d] bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100">
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-bold text-zinc-600 mb-1">Email</label>
            <input type="email" required value={form.email} onChange={e => update('email', e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d]" />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-600 mb-1">Password</label>
            <input type="password" required value={form.password} onChange={e => update('password', e.target.value)}
              placeholder=""
              className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d]" />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-300 font-medium">{error}</div>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-[#305d3d] hover:bg-[#254a30] text-white font-bold text-sm py-2.5 rounded-lg transition-all disabled:opacity-60">
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================
//  SAVE AOI FORM (inline)
// ============================================================

function SaveAOIForm({ token, drawnPolygon, onSaved }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  if (!drawnPolygon) return null;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/profile/aois`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: name.trim(), description: desc.trim() || null, geojson: JSON.stringify(drawnPolygon) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      onSaved(data);
      setName(''); setDesc(''); setOpen(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-[#305d3d]/30 dark:border-[#305d3d]/50 bg-[#305d3d]/5 dark:bg-[#305d3d]/10 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-xs font-bold text-[#305d3d]">Active drawing — {drawnPolygon.length} vertices</span>
        </div>
        <button onClick={() => setOpen(o => !o)}
          className="text-xs font-bold text-[#305d3d] hover:underline">
          {open ? 'Cancel' : 'Save this Area'}
        </button>
      </div>

      {open && (
        <div className="space-y-3 pt-2 border-t border-[#305d3d]/20">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Area Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Batangas Rice Fields"
              className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d]" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Notes (optional)</label>
            <input type="text" value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="e.g. Near Taal Lake, irrigated"
              className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d]" />
          </div>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="w-full bg-[#305d3d] hover:bg-[#254a30] text-white font-bold text-xs py-2 rounded-lg transition-all disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Area'}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
//  AOI CARD
// ============================================================

function AOICard({ aoi, onLoad, onDelete }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${aoi.name}"?`)) return;
    setDeleting(true);
    onDelete(aoi.id);
  };

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-xl p-4 hover:border-zinc-300 dark:hover:border-zinc-500 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 shrink-0 bg-[#305d3d]/10 rounded-lg flex items-center justify-center mt-0.5">
            <svg className="w-4 h-4 text-[#305d3d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{aoi.name}</p>
            {aoi.description && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{aoi.description}</p>}
            <p className="text-[10px] text-zinc-400 mt-1">{formatDate(aoi.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onLoad(aoi)}
            className="px-3 py-1.5 text-xs font-bold bg-[#305d3d] hover:bg-[#254a30] text-white rounded-lg transition-all">
            Load
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all disabled:opacity-40">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  MAIN PROFILE COMPONENT
// ============================================================

// ============================================================
//  CONFIRMATION MODAL
// ============================================================

function ConfirmModal({ title, message, confirmLabel, confirmClass, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-sm z-10 p-6 space-y-4">
        <div>
          <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">{title}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 border border-zinc-200 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 font-bold text-sm py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 text-white font-bold text-sm py-2 rounded-lg transition ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  MAIN PROFILE COMPONENT
// ============================================================

export default function Profile({ drawnPolygon, onLoadAOI, permissions = null, onAuthChange, darkMode = false, toggleDark = null }) {
  const can = (feature) => permissions === null || permissions?.[feature] !== false;
  const [token, setToken] = useState(localStorage.getItem('sar_token'));
  const [user, setUser] = useState(null);
  const [aois, setAois] = useState([]);
  const [loadingUser, setLoadingUser] = useState(false);

  // Edit profile state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  // Confirmation modals
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('sar_token');
    setToken(null);
    setUser(null);
    setAois([]);
    onAuthChange?.();
  }, [onAuthChange]);

  // Fetch user + AOIs when token is present
  useEffect(() => {
    if (!token) return;
    setLoadingUser(true);
    Promise.all([
      fetch(`${API}/profile/me`, { headers: authHeaders(token) }),
      fetch(`${API}/profile/aois`, { headers: authHeaders(token) }),
    ])
      .then(async ([meRes, aoisRes]) => {
        if (meRes.status === 401) { handleLogout(); return; }
        const meData = await meRes.json();
        const aoisData = await aoisRes.json();
        setUser(meData);
        setAois(Array.isArray(aoisData) ? aoisData : []);
        setEditForm({ name: meData.name, institution: meData.institution || '', role: meData.role });
      })
      .catch(() => handleLogout())
      .finally(() => setLoadingUser(false));
  }, [token, handleLogout]);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await fetch(`${API}/profile/me`, { method: 'DELETE', headers: authHeaders(token) });
      handleLogout();
    } catch {
      alert('Failed to delete account. Please try again.');
      setDeleting(false);
    }
  };

  const handleAuthSuccess = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    setEditForm({ name: newUser.name, institution: newUser.institution || '', role: newUser.role });
    onAuthChange?.();
    // Fetch AOIs after login
    fetch(`${API}/profile/aois`, { headers: authHeaders(newToken) })
      .then(r => r.json())
      .then(data => setAois(Array.isArray(data) ? data : []));
  };

  const handleSaveProfile = async () => {
    setEditSaving(true);
    try {
      const res = await fetch(`${API}/profile/me`, {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify(editForm),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.detail);
      setUser(updated);
      setEditOpen(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleLoadAOI = (aoi) => {
    try {
      const points = JSON.parse(aoi.geojson);
      onLoadAOI(points);
    } catch {
      alert('Could not load this area — coordinates may be corrupted.');
    }
  };

  const handleDeleteAOI = async (aoiId) => {
    try {
      await fetch(`${API}/profile/aois/${aoiId}`, { method: 'DELETE', headers: authHeaders(token) });
      setAois(prev => prev.filter(a => a.id !== aoiId));
    } catch {
      alert('Failed to delete. Please try again.');
    }
  };

  const handleAOISaved = (newAOI) => {
    setAois(prev => [newAOI, ...prev]);
  };

  // ── Not logged in ──
  if (!token) return <AuthForm onSuccess={handleAuthSuccess} />;

  // ── Loading ──
  if (loadingUser && !user) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-sm text-zinc-400">Loading profile…</div>
      </div>
    );
  }

  // ── Dashboard ──
  return (
    <div className="h-full flex flex-col">

      {/* Header bar */}
      <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#305d3d] flex items-center justify-center text-white font-black text-sm">
            {getInitials(user?.name)}
          </div>
          <div>
            <p className="text-sm font-black text-zinc-900 dark:text-zinc-100 leading-tight">{user?.name}</p>
            <p className="text-xs text-zinc-400">{user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {toggleDark && (
            <button onClick={toggleDark} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition">
              {darkMode
                ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              }
            </button>
          )}
          <button onClick={() => setShowSignOutConfirm(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-8">

          {/* ── Profile Info ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title="Profile" />
              <button onClick={() => setEditOpen(o => !o)}
                className="text-xs font-bold text-[#305d3d] hover:underline">
                {editOpen ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {editOpen ? (
              <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-5 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Full Name</label>
                  <input type="text" value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d]" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Institution</label>
                  <input type="text" value={editForm.institution || ''} onChange={e => setEditForm(f => ({ ...f, institution: e.target.value }))}
                    placeholder="e.g. UPLB, DA-CALABARZON"
                    className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d]" />
                </div>
                <button onClick={handleSaveProfile} disabled={editSaving}
                  className="w-full bg-[#305d3d] hover:bg-[#254a30] text-white font-bold text-sm py-2 rounded-lg transition-all disabled:opacity-60">
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-5 grid grid-cols-2 gap-5">
                <Field label="Name" value={user?.name} />
                <Field label="Role" value={user?.role} />
                <Field label="Institution" value={user?.institution} />
                <Field label="Member Since" value={formatDate(user?.created_at)} />
              </div>
            )}
          </div>

          {/* ── Saved Areas of Interest ── */}
          {can('save_aois') && (
            <div>
              <SectionHeader title={`Saved Areas (${aois.length})`} />

              {/* Save current drawing */}
              <SaveAOIForm token={token} drawnPolygon={drawnPolygon} onSaved={handleAOISaved} />

              {/* No drawing hint when list is empty */}
              {aois.length === 0 && !drawnPolygon && (
                <div className="border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl p-8 text-center">
                  <svg className="w-10 h-10 text-zinc-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  <p className="text-sm font-bold text-zinc-400">No saved areas yet</p>
                  <p className="text-xs text-zinc-400 mt-1">Go to <strong>Analysis</strong>, draw a polygon on the map, then come back here to save it.</p>
                </div>
              )}

              {/* AOI list */}
              {aois.length > 0 && (
                <div className="space-y-3">
                  {aois.map(aoi => (
                    <AOICard key={aoi.id} aoi={aoi} onLoad={handleLoadAOI} onDelete={handleDeleteAOI} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Danger Zone ── */}
          <div>
            <SectionHeader title="Danger Zone" />
            <div className="border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 rounded-xl p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Delete Account</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Permanently remove your account and all saved areas. This cannot be undone.</p>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleting}
                className="shrink-0 px-4 py-2 text-xs font-bold text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Delete Account'}
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── Sign Out Confirmation ── */}
      {showSignOutConfirm && (
        <ConfirmModal
          title="Sign out?"
          message="You will be returned to the login screen. Your saved areas will remain in your account."
          confirmLabel="Sign Out"
          confirmClass="bg-zinc-800 hover:bg-zinc-900"
          onConfirm={() => { setShowSignOutConfirm(false); handleLogout(); }}
          onCancel={() => setShowSignOutConfirm(false)}
        />
      )}

      {/* ── Delete Account Confirmation ── */}
      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete your account?"
          message={`This will permanently delete your account (${user?.email}) and all your saved areas. This action cannot be undone.`}
          confirmLabel="Yes, Delete My Account"
          confirmClass="bg-red-600 hover:bg-red-700"
          onConfirm={() => { setShowDeleteConfirm(false); handleDeleteAccount(); }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

    </div>
  );
}
