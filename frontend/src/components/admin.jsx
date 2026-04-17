import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON as LeafletGeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const API = 'http://127.0.0.1:8000';



function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function authJsonHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ── Badge ──────────────────────────────────────────────────────────────────────

function SourceBadge({ source }) {
  const styles = {
    geojson:   'bg-blue-50 text-blue-700 border-blue-200',
    shapefile: 'bg-purple-50 text-purple-700 border-purple-200',
    manual:    'bg-zinc-100 text-zinc-600 border-zinc-200',
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded border uppercase tracking-wider ${styles[source] ?? styles.manual}`}>
      {source}
    </span>
  );
}

// ── Map preview (auto-fit bounds) ────────────────────────────────────────────

function FitBounds({ geojsonData }) {
  const map = useMap();
  useEffect(() => {
    if (!geojsonData) return;
    try {
      const L = window.L || require('leaflet');
      const layer = L.geoJSON(geojsonData);
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    } catch {
      // If bounds fail, default to Philippines
      map.setView([14.1, 121.2], 8);
    }
  }, [geojsonData, map]);
  return null;
}

function MapPreviewModal({ aoi, onClose }) {
  let geojsonData = null;
  try {
    geojsonData = JSON.parse(aoi.geojson);
  } catch {
    geojsonData = null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl z-10 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <div>
            <p className="text-sm font-black text-zinc-900">{aoi.name}</p>
            {aoi.description && (
              <p className="text-xs text-zinc-500 mt-0.5">{aoi.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="h-96">
          {geojsonData ? (
            <MapContainer
              center={[14.1, 121.2]}
              zoom={8}
              className="h-full w-full"
              key={aoi.id}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
              <LeafletGeoJSON
                data={geojsonData}
                style={{ color: '#305d3d', weight: 2, fillOpacity: 0.2, fillColor: '#305d3d' }}
              />
              <FitBounds geojsonData={geojsonData} />
            </MapContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-zinc-400">
              Could not parse GeoJSON
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({ aoi, token, onSaved, onClose }) {
  const [form, setForm] = useState({
    name: aoi.name,
    description: aoi.description || '',
    geojson: aoi.geojson,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    try { JSON.parse(form.geojson); } catch { setError('GeoJSON is not valid JSON'); return; }

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API}/admin/aois/${aoi.id}`, {
        method: 'PUT',
        headers: authJsonHeaders(token),
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          geojson: form.geojson,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Update failed');
      onSaved(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg z-10 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <p className="text-sm font-black text-zinc-900">Edit AOI</p>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
              Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d]"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
              Description
            </label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional notes"
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d]"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
              GeoJSON
            </label>
            <textarea
              value={form.geojson}
              onChange={e => setForm(f => ({ ...f, geojson: e.target.value }))}
              rows={8}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d] resize-y"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 border border-zinc-200 text-zinc-600 font-bold text-sm py-2 rounded-lg hover:bg-zinc-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-[#305d3d] hover:bg-[#254a30] text-white font-bold text-sm py-2 rounded-lg transition disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Upload Section ────────────────────────────────────────────────────────────

function UploadSection({ token, onUploaded }) {
  const [form, setForm] = useState({ name: '', description: '' });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef(null);

  const handleUpload = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!file) { setError('Please select a file'); return; }

    const allowedExts = ['.geojson', '.json', '.zip'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedExts.includes(ext)) {
      setError('Unsupported file. Upload .geojson, .json, or .zip (Shapefile)');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const fd = new FormData();
      fd.append('name', form.name.trim());
      fd.append('description', form.description.trim());
      fd.append('file', file);

      const res = await fetch(`${API}/admin/aois/upload`, {
        method: 'POST',
        headers: authHeaders(token),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Upload failed');

      setSuccess(`"${data.name}" uploaded successfully`);
      setForm({ name: '', description: '' });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onUploaded(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
        Upload New AOI
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
            Name *
          </label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Laguna Wetlands"
            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
            Description
          </label>
          <input
            type="text"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Optional notes"
            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d]"
          />
        </div>
      </div>

      {/* File picker */}
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
          File — .geojson / .json / .zip (Shapefile)
        </label>
        <div
          className="border-2 border-dashed border-zinc-200 rounded-xl p-5 text-center cursor-pointer hover:border-[#305d3d]/40 hover:bg-[#305d3d]/5 transition-all"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const dropped = e.dataTransfer.files[0];
            if (dropped) setFile(dropped);
          }}
        >
          <svg className="w-8 h-8 text-zinc-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          {file ? (
            <p className="text-sm font-bold text-[#305d3d]">{file.name}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-zinc-500">Drag & drop or click to select</p>
              <p className="text-xs text-zinc-400 mt-1">.geojson · .json · .zip (Shapefile)</p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".geojson,.json,.zip"
            className="hidden"
            onChange={e => setFile(e.target.files[0] || null)}
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 font-medium">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700 font-medium">
          {success}
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={uploading}
        className="w-full bg-[#305d3d] hover:bg-[#254a30] text-white font-bold text-sm py-2.5 rounded-lg transition disabled:opacity-60"
      >
        {uploading ? 'Uploading…' : 'Upload AOI'}
      </button>
    </div>
  );
}

// ── AOI Row ───────────────────────────────────────────────────────────────────

function AOIRow({ aoi, token, onUpdated, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${aoi.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/admin/aois/${aoi.id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Delete failed');
      }
      onDeleted(aoi.id);
    } catch (err) {
      alert(err.message);
      setDeleting(false);
    }
  };

  return (
    <>
      <tr className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
        <td className="px-4 py-3">
          <p className="text-sm font-bold text-zinc-900">{aoi.name}</p>
          {aoi.description && (
            <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-xs">{aoi.description}</p>
          )}
        </td>
        <td className="px-4 py-3">
          <SourceBadge source={aoi.source} />
        </td>
        <td className="px-4 py-3 text-xs text-zinc-500">{formatDate(aoi.created_at)}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            {/* Preview */}
            <button
              onClick={() => setPreviewOpen(true)}
              title="Preview on map"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-[#305d3d] hover:bg-[#305d3d]/10 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </button>
            {/* Edit */}
            <button
              onClick={() => setEditOpen(true)}
              title="Edit"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            {/* Delete */}
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Delete"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </td>
      </tr>

      {editOpen && (
        <EditModal
          aoi={aoi}
          token={token}
          onSaved={updated => { onUpdated(updated); setEditOpen(false); }}
          onClose={() => setEditOpen(false)}
        />
      )}
      {previewOpen && (
        <MapPreviewModal aoi={aoi} onClose={() => setPreviewOpen(false)} />
      )}
    </>
  );
}

// ── Users Panel ───────────────────────────────────────────────────────────────

const ALL_ROLES = ['Researcher', 'Student', 'Farmer', 'Government Official', 'Admin'];

function UserRow({ user, token, onUpdated }) {
  const [editOpen, setEditOpen] = useState(false);
  const isPrivileged = ['Admin', 'Government Official'].includes(user.role);

  return (
    <>
      <tr className="border-b border-zinc-100 hover:bg-zinc-50">
        <td className="px-4 py-3">
          <p className="text-sm font-medium text-zinc-900">{user.name}</p>
          {user.institution && (
            <p className="text-xs text-zinc-400 mt-0.5">{user.institution}</p>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-zinc-500">{user.email}</td>
        <td className="px-4 py-3">
          <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded border uppercase tracking-wider ${
            isPrivileged
              ? 'bg-[#305d3d]/10 text-[#305d3d] border-[#305d3d]/20'
              : 'bg-zinc-100 text-zinc-600 border-zinc-200'
          }`}>
            {user.role}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-zinc-500">{formatDate(user.created_at)}</td>
        <td className="px-4 py-3">
          <button
            onClick={() => setEditOpen(true)}
            title="Edit user"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </td>
      </tr>

      {editOpen && (
        <EditUserModal
          user={user}
          token={token}
          onSaved={updated => { onUpdated(updated); setEditOpen(false); }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

function UsersPanel({ token }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/admin/users`, { headers: authHeaders(token) })
      .then(r => r.json())
      .then(data => { setUsers(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  const handleUpdated = updated =>
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));

  if (loading) return <div className="text-xs text-zinc-400 py-4">Loading users…</div>;

  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-zinc-50 border-b border-zinc-200">
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-400">Name</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-400">Email</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-400">Role</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-400">Registered</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-400">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <UserRow key={u.id} user={u} token={token} onUpdated={handleUpdated} />
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-400">
                No users found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Access Denied ─────────────────────────────────────────────────────────────

function AccessDenied({ reason }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-200">
          <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <p className="text-base font-black text-zinc-900 mb-1">Access Denied</p>
        <p className="text-sm text-zinc-500">{reason}</p>
      </div>
    </div>
  );
}

// ── Per-user Edit / Permissions Modal ────────────────────────────────────────

const FEATURE_META = [
  { key: 'analysis_tab',    label: 'Analysis Tab',            description: 'Access to the Analysis page' },
  { key: 'save_aois',       label: 'Save Areas of Interest',  description: 'Save and load AOIs from the Profile page' },
  { key: 'protected_areas', label: 'Protected Areas Layer',   description: 'Toggle the Protected Areas overlay on the map' },
  { key: 'crop_suitability',label: 'Crop Suitability Layer',  description: 'Toggle the Crop Suitability overlay on the map' },
  { key: 'lulc_analysis',   label: 'LULC Change Analysis',    description: 'Run LULC Change analysis in the Analysis tab' },
  { key: 'crop_intensity',  label: 'Crop Intensity Analysis', description: 'Run Crop Intensity analysis in the Analysis tab' },
  { key: 'compare_view',    label: 'Comparison View',         description: 'Access the side-by-side map comparison view' },
];

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-[#305d3d]' : 'bg-zinc-300'
      }`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

function EditUserModal({ user, token, onSaved, onClose }) {
  const [role, setRole] = useState(user.role);
  const [perms, setPerms] = useState(null);
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/admin/users/${user.id}/permissions`, { headers: authHeaders(token) })
      .then(r => r.json())
      .then(data => {
        setPerms(data.permissions);
        setIsCustom(data.is_custom);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user.id, token]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API}/admin/users/${user.id}/permissions`, {
        method: 'PUT',
        headers: authJsonHeaders(token),
        body: JSON.stringify({ role, ...perms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Save failed');
      onSaved(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API}/admin/users/${user.id}/permissions`, {
        method: 'PUT',
        headers: authJsonHeaders(token),
        body: JSON.stringify({ role, reset: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Reset failed');
      // Re-fetch effective permissions after reset
      const p = await fetch(`${API}/admin/users/${user.id}/permissions`, { headers: authHeaders(token) });
      const pd = await p.json();
      setPerms(pd.permissions);
      setIsCustom(false);
      onSaved(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md z-10 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-200 shrink-0">
          <div>
            <p className="text-sm font-black text-zinc-900">{user.name}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Role */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d] bg-white"
            >
              {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Feature permissions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Feature Access</label>
              {isCustom && (
                <button
                  onClick={handleReset}
                  disabled={saving}
                  className="text-[10px] font-bold text-zinc-400 hover:text-red-500 transition"
                >
                  Reset to role defaults
                </button>
              )}
            </div>

            {loading ? (
              <div className="text-xs text-zinc-400 py-4 text-center">Loading…</div>
            ) : (
              <div className="space-y-1 border border-zinc-100 rounded-xl overflow-hidden">
                {FEATURE_META.map(({ key, label, description }) => (
                  <div key={key} className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 transition">
                    <div>
                      <p className="text-sm font-bold text-zinc-800">{label}</p>
                      <p className="text-xs text-zinc-400">{description}</p>
                    </div>
                    <Toggle
                      checked={perms?.[key] ?? true}
                      onChange={val => setPerms(p => ({ ...p, [key]: val }))}
                      disabled={saving}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-zinc-100 flex gap-2">
          <button onClick={onClose} className="flex-1 border border-zinc-200 text-zinc-600 font-bold text-sm py-2 rounded-lg hover:bg-zinc-50 transition">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || loading} className="flex-1 bg-[#305d3d] hover:bg-[#254a30] text-white font-bold text-sm py-2 rounded-lg transition disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ── Main Admin Component ──────────────────────────────────────────────────────

export default function Admin() {
  const [token] = useState(localStorage.getItem('sar_token'));
  const [user, setUser] = useState(null);
  const [authState, setAuthState] = useState('loading'); // 'loading' | 'ok' | 'denied' | 'no_token'

  const [aois, setAois] = useState([]);
  const [aoiLoading, setAoiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('aois'); // 'aois' | 'users'

  // ── Verify token and role ──────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setAuthState('no_token'); return; }

    fetch(`${API}/profile/me`, { headers: authHeaders(token) })
      .then(async res => {
        if (res.status === 401) { setAuthState('no_token'); return; }
        const data = await res.json();
        setUser(data);
        if (['Admin', 'Government Official'].includes(data.role)) {
          setAuthState('ok');
        } else {
          setAuthState('denied');
        }
      })
      .catch(() => setAuthState('no_token'));
  }, [token]);

  // ── Load AOIs once authenticated ───────────────────────────────────────────
  useEffect(() => {
    if (authState !== 'ok') return;
    setAoiLoading(true);
    fetch(`${API}/admin/aois`, { headers: authHeaders(token) })
      .then(r => r.json())
      .then(data => { setAois(Array.isArray(data) ? data : []); setAoiLoading(false); })
      .catch(() => setAoiLoading(false));
  }, [authState, token]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleUploaded = newAOI => setAois(prev => [newAOI, ...prev]);
  const handleUpdated  = updated => setAois(prev => prev.map(a => a.id === updated.id ? updated : a));
  const handleDeleted  = id => setAois(prev => prev.filter(a => a.id !== id));

  // ── Render guards ──────────────────────────────────────────────────────────
  if (authState === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-sm text-zinc-400">Verifying access…</div>
      </div>
    );
  }

  if (authState === 'no_token') {
    return (
      <AccessDenied reason="You must be signed in to access the admin panel. Sign in via the Profile page first." />
    );
  }

  if (authState === 'denied') {
    return (
      <AccessDenied reason={`Your account (${user?.role}) does not have admin privileges. Contact the system administrator to upgrade your role.`} />
    );
  }

  // ── Admin Dashboard ────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col">

      {/* Header */}
      <div className="shrink-0 border-b border-zinc-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#305d3d] flex items-center justify-center text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-black text-zinc-900 leading-tight">Admin Panel</p>
            <p className="text-xs text-zinc-400">Content Manager · {user?.name}</p>
          </div>
        </div>

        {/* Stats pill */}
        <div className="hidden sm:flex items-center gap-3 text-xs text-zinc-500">
          <span className="bg-zinc-100 px-3 py-1 rounded-full font-bold">
            {aois.length} AOI{aois.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-zinc-200 bg-white px-6">
        {[
          { id: 'aois',  label: 'Areas of Interest' },
          { id: 'users', label: 'Users' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-[#305d3d] text-[#305d3d]'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-zinc-50">
        <div className="max-w-5xl mx-auto p-6 space-y-6">

          {activeTab === 'aois' && (
            <>
              {/* Upload section */}
              <UploadSection token={token} onUploaded={handleUploaded} />

              {/* AOI Table */}
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-3">
                  Managed AOIs ({aois.length})
                </h3>

                {aoiLoading ? (
                  <div className="text-xs text-zinc-400 py-6 text-center">Loading…</div>
                ) : aois.length === 0 ? (
                  <div className="border border-dashed border-zinc-200 rounded-xl p-10 text-center">
                    <svg className="w-10 h-10 text-zinc-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    <p className="text-sm font-bold text-zinc-400">No AOIs yet</p>
                    <p className="text-xs text-zinc-400 mt-1">Upload a GeoJSON or Shapefile above to get started.</p>
                  </div>
                ) : (
                  <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200">
                          <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-400">Name</th>
                          <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-400">Source</th>
                          <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-400">Created</th>
                          <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-400">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aois.map(aoi => (
                          <AOIRow
                            key={aoi.id}
                            aoi={aoi}
                            token={token}
                            onUpdated={handleUpdated}
                            onDeleted={handleDeleted}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'users' && (
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-3">
                Registered Users
              </h3>
              <UsersPanel token={token} />
            </div>
          )}



        </div>
      </div>
    </div>
  );
}
