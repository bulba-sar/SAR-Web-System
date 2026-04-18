import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON as LeafletGeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const API = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';



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
      <div className="relative bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-3xl z-10 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <div>
            <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">{aoi.name}</p>
            {aoi.description && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{aoi.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
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
      <div className="relative bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg z-10 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">Edit AOI</p>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d]"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Description
            </label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional notes"
              className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d]"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
              GeoJSON
            </label>
            <textarea
              value={form.geojson}
              onChange={e => setForm(f => ({ ...f, geojson: e.target.value }))}
              rows={8}
              className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-xs font-mono bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d] resize-y"
            />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-300 font-medium">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 border border-zinc-200 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 font-bold text-sm py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition"
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

// ── Dataset Section ───────────────────────────────────────────────────────────

const DATASET_YEARS   = [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];
const DATASET_PERIODS = ['Jan-Jun', 'Jul-Dec'];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DatasetSection({ token }) {
  const [datasets, setDatasets]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [year, setYear]               = useState(2021);
  const [period, setPeriod]           = useState('Jan-Jun');
  const [customName, setCustomName]   = useState('');
  const [file, setFile]               = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [deleting, setDeleting]       = useState(null);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');
  const fileRef = useRef(null);

  const computedFilename = customName.trim()
    ? customName.trim().replace(/[^\w-]/g, '_').replace(/\.tif+$/i, '') + '.tif'
    : `${year}-${period}.tif`;

  const fetchDatasets = useCallback(() => {
    setLoading(true);
    fetch(`${API}/admin/datasets`, { headers: authHeaders(token) })
      .then(r => r.json())
      .then(data => { setDatasets(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  useEffect(() => { fetchDatasets(); }, [fetchDatasets]);

  const handleUpload = async () => {
    if (!file) { setError('Please select a .tif file'); return; }
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'tif' && ext !== 'tiff') { setError('File must be a GeoTIFF (.tif or .tiff)'); return; }

    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const fd = new FormData();
      fd.append('year', year);
      fd.append('period', period);
      if (customName.trim()) fd.append('custom_name', customName.trim());
      fd.append('file', file);
      const res = await fetch(`${API}/admin/datasets/upload`, {
        method: 'POST',
        headers: authHeaders(token),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Upload failed');
      setSuccess(data.message);
      setFile(null);
      setCustomName('');
      if (fileRef.current) fileRef.current.value = '';
      fetchDatasets();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename) => {
    if (!window.confirm(`Delete ${filename}? This cannot be undone.`)) return;
    setDeleting(filename);
    try {
      const res = await fetch(`${API}/admin/datasets/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Delete failed'); }
      setDatasets(prev => prev.filter(d => d.filename !== filename));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload card */}
      <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-5 space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Upload LULC Dataset</h3>
        <p className="text-xs text-zinc-500">
          Upload a GeoTIFF exported from GEE. It will be saved as{' '}
          <code className="bg-zinc-100 px-1 rounded text-[11px]">{computedFilename}</code>{' '}
          and the nodata fix will run automatically.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Year</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d] bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
            >
              {DATASET_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Period</label>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d] bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
            >
              {DATASET_PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {/* Optional custom filename */}
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
            Custom Filename <span className="text-zinc-400 normal-case font-normal">(optional — leave blank to use {year}-{period}.tif)</span>
          </label>
          <input
            type="text"
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            placeholder={`${year}-${period}.tif`}
            className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d] bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-500"
          />
          {customName.trim() && (
            <p className="text-[10px] text-zinc-400 mt-1">
              Will be saved as: <span className="font-bold text-zinc-600">{computedFilename}</span>
              {' · '}
              <span className="text-amber-500">Custom names won&apos;t appear on the main map — use the default {year}-{period}.tif format for that.</span>
            </p>
          )}
        </div>

        {/* File picker */}
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">GeoTIFF File (.tif)</label>
          <div
            className="border-2 border-dashed border-zinc-200 dark:border-zinc-600 rounded-xl p-5 text-center cursor-pointer hover:border-[#305d3d]/40 hover:bg-[#305d3d]/5 dark:hover:border-[#305d3d]/60 dark:hover:bg-[#305d3d]/10 transition-all"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
          >
            <svg className="w-8 h-8 text-zinc-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {file ? (
              <p className="text-sm font-bold text-[#305d3d]">{file.name} ({formatBytes(file.size)})</p>
            ) : (
              <>
                <p className="text-sm font-medium text-zinc-500">Drag & drop or click to select</p>
                <p className="text-xs text-zinc-400 mt-1">.tif · .tiff (GeoTIFF)</p>
              </>
            )}
            <input ref={fileRef} type="file" accept=".tif,.tiff" className="hidden" onChange={e => setFile(e.target.files[0] || null)} />
          </div>
        </div>

        {error && <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-300 font-medium">{error}</div>}
        {success && <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-lg px-3 py-2 text-xs text-green-700 dark:text-green-300 font-medium">{success}</div>}

        <button
          onClick={handleUpload}
          disabled={uploading}
          className="w-full bg-[#305d3d] hover:bg-[#254a30] text-white font-bold text-sm py-2.5 rounded-lg transition disabled:opacity-60"
        >
          {uploading ? 'Uploading & fixing nodata…' : 'Upload Dataset'}
        </button>
      </div>

      {/* Existing datasets table */}
      <div>
        <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-3">
          Stored Datasets ({datasets.length})
        </h3>
        {loading ? (
          <div className="text-xs text-zinc-400 py-6 text-center">Loading…</div>
        ) : datasets.length === 0 ? (
          <div className="border border-dashed border-zinc-200 rounded-xl p-10 text-center">
            <p className="text-sm font-bold text-zinc-400">No datasets yet</p>
            <p className="text-xs text-zinc-400 mt-1">Upload a GeoTIFF above to get started.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-700 border-b border-zinc-200 dark:border-zinc-600">
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-400">Filename</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-400">Size</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-400">Last Modified</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((d, i) => (
                  <tr key={d.filename} className={`border-b border-zinc-100 dark:border-zinc-700 last:border-0 ${i % 2 === 0 ? 'bg-white dark:bg-zinc-800' : 'bg-zinc-50/40 dark:bg-zinc-700/40'}`}>
                    <td className="px-4 py-3 text-sm font-bold text-zinc-800 dark:text-zinc-100 font-mono">{d.filename}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">{formatBytes(d.size_bytes)}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">{new Date(d.modified_at).toLocaleString('en-PH')}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(d.filename)}
                        disabled={deleting === d.filename}
                        className="text-xs font-bold text-red-500 hover:text-red-700 transition disabled:opacity-50"
                      >
                        {deleting === d.filename ? 'Deleting…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-5 space-y-4">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
        Upload New AOI
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
            Name *
          </label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Laguna Wetlands"
            className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
            Description
          </label>
          <input
            type="text"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Optional notes"
            className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d]"
          />
        </div>
      </div>

      {/* File picker */}
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
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
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-300 font-medium">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-lg px-3 py-2 text-xs text-green-700 dark:text-green-300 font-medium">
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
      <tr className="border-b border-zinc-100 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors">
        <td className="px-4 py-3">
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{aoi.name}</p>
          {aoi.description && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate max-w-xs">{aoi.description}</p>
          )}
        </td>
        <td className="px-4 py-3">
          <SourceBadge source={aoi.source} />
        </td>
        <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">{formatDate(aoi.created_at)}</td>
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
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition"
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
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition disabled:opacity-40"
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
      <tr className="border-b border-zinc-100 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700">
        <td className="px-4 py-3">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{user.name}</p>
          {user.institution && (
            <p className="text-xs text-zinc-400 mt-0.5">{user.institution}</p>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">{user.email}</td>
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
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-zinc-50 dark:bg-zinc-700 border-b border-zinc-200 dark:border-zinc-600">
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
      <div className="relative bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-md z-10 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
          <div>
            <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">{user.name}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition mt-0.5">
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
              className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d] bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
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
              <div className="space-y-1 border border-zinc-100 dark:border-zinc-700 rounded-xl overflow-hidden">
                {FEATURE_META.map(({ key, label, description }) => (
                  <div key={key} className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition">
                    <div>
                      <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{label}</p>
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
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-300 font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-zinc-100 dark:border-zinc-700 flex gap-2">
          <button onClick={onClose} className="flex-1 border border-zinc-200 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 font-bold text-sm py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition">
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


// ── Model Performance ─────────────────────────────────────────────────────────

const CLASS_ORDER_MODEL = ['Water', 'Urban', 'Forest', 'Agriculture'];
const CLASS_COLORS_MODEL = {
  Water:       '#1d4ed8',
  Urban:       '#dc2626',
  Forest:      '#15803d',
  Agriculture: '#ca8a04',
};

function ConfusionMatrixView({ confusion_matrix }) {
  const classes = confusion_matrix?.classes ?? CLASS_ORDER_MODEL;
  const matrix  = confusion_matrix?.matrix  ?? [];
  const maxVal  = Math.max(1, ...matrix.flat());
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="w-28 text-[10px] text-zinc-400 font-bold text-right pr-3 pb-1">Actual ↓ / Pred →</th>
            {classes.map(cls => (
              <th key={cls} className="px-2 pb-1 text-center">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: CLASS_COLORS_MODEL[cls] }} />
                  <span className="text-[10px] font-black text-zinc-600">{cls}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, ri) => (
            <tr key={ri}>
              <td className="text-right pr-3 py-1">
                <div className="flex items-center justify-end gap-1.5">
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: CLASS_COLORS_MODEL[classes[ri]] }} />
                  <span className="text-[10px] font-black text-zinc-600">{classes[ri]}</span>
                </div>
              </td>
              {row.map((val, ci) => {
                const intensity = val / maxVal;
                const isDiag = ri === ci;
                const bg = isDiag
                  ? `rgba(29,94,58,${0.15 + intensity * 0.75})`
                  : `rgba(220,38,38,${intensity * 0.5})`;
                const textColor = intensity > 0.5 ? '#fff' : isDiag ? '#14532d' : '#7f1d1d';
                return (
                  <td key={ci} className="px-1.5 py-1 text-center">
                    <div className="w-14 h-9 rounded-lg flex items-center justify-center font-mono font-black text-xs"
                      style={{ backgroundColor: bg, color: val > 0 ? textColor : '#d1d5db' }}>
                      {val.toLocaleString()}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-zinc-400 mt-2">Green diagonal = correct · Red off-diagonal = misclassified</p>
    </div>
  );
}

function ModelPerformanceSection() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [jobStatus, setJobStatus] = useState(null); // null | 'running' | 'done' | 'error'
  const [jobError, setJobError]   = useState(null);
  const [jobLog, setJobLog]       = useState([]);
  const pollRef = useRef(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch('http://127.0.0.1:8000/api/v1/analytics/model-performance')
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  };

  const pollStatus = useCallback(() => {
    const authH = { Authorization: `Bearer ${localStorage.getItem('sar_token')}` };
    fetch('http://127.0.0.1:8000/api/v1/admin/run-model-metrics/status', { headers: authH })
      .then(r => r.ok ? r.json() : null)
      .then(s => {
        if (!s) return;
        setJobStatus(s.state);
        setJobError(s.error ?? null);
        setJobLog(s.log ?? []);
        if (s.state === 'done') {
          clearInterval(pollRef.current);
          load();
        } else if (s.state === 'error') {
          clearInterval(pollRef.current);
        }
      })
      .catch(() => {});
  }, []);

  const handleRun = () => {
    const authH = { Authorization: `Bearer ${localStorage.getItem('sar_token')}` };
    setJobStatus('starting');
    setJobError(null);
    fetch('http://127.0.0.1:8000/api/v1/admin/run-model-metrics', { method: 'POST', headers: authH })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(res => {
        setJobStatus(res.status === 'already_running' ? 'running' : 'running');
        clearInterval(pollRef.current);
        pollRef.current = setInterval(pollStatus, 8000);
      })
      .catch(() => { setJobStatus('error'); setJobError('Failed to start script.'); });
  };

  useEffect(() => { load(); return () => clearInterval(pollRef.current); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-zinc-400 text-sm gap-2">
      <div className="w-4 h-4 border-2 border-zinc-300 border-t-[#305d3d] rounded-full animate-spin" />
      Loading model metrics…
    </div>
  );
  if (error) return (
    <div className="flex flex-col items-center justify-center h-48 gap-3 text-center px-6">
      <p className="text-red-500 text-xs">
        Could not load model metrics. Make sure the backend is running and{' '}
        <code className="mx-1 bg-red-50 px-1 rounded">backend/model_metrics.json</code> exists.
      </p>
      <button onClick={load} className="text-xs font-bold text-[#305d3d] underline">Retry</button>
    </div>
  );

  const { model, periods } = data;
  const periodKeys = Object.keys(periods ?? {});
  const pct = v => `${(v * 100).toFixed(1)}%`;

  const filledPeriods = periodKeys.filter(k => (periods[k]?.overall?.accuracy ?? 0) > 0);
  const avg = key => filledPeriods.length
    ? filledPeriods.reduce((s, k) => s + periods[k].overall[key], 0) / filledPeriods.length : 0;
  const avgAccuracy = avg('accuracy');
  const avgKappa    = avg('kappa');
  const avgMse      = avg('mse');

  const activePeriod = selectedPeriod ? periods[selectedPeriod] : null;

  return (
    <div className="space-y-6">

      {/* Run controls */}
      <div className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl">
        <button
          onClick={handleRun}
          disabled={jobStatus === 'running' || jobStatus === 'starting'}
          className="flex items-center gap-2 text-xs font-bold bg-[#305d3d] hover:bg-[#254a30] disabled:opacity-50 text-white px-4 py-2 rounded-lg transition shrink-0"
        >
          {(jobStatus === 'running' || jobStatus === 'starting') ? (
            <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {jobStatus === 'starting' ? 'Starting…' : jobStatus === 'running' ? 'Computing…' : 'Run Compute Script'}
        </button>

        {jobStatus === 'running' && (
          <span className="text-xs text-zinc-500">Script is running (~10–20 min/period). Metrics refresh automatically when done.</span>
        )}
        {jobStatus === 'done' && (
          <span className="text-xs font-bold text-green-700 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
            Done — metrics updated
          </span>
        )}
        {jobStatus === 'error' && (
          <span className="text-xs font-bold text-red-600">{jobError ?? 'Script failed'}</span>
        )}
        {!jobStatus && (
          <span className="text-xs text-zinc-400">Loops all 10 periods and writes results to <code className="font-mono bg-zinc-100 px-1 rounded">model_metrics.json</code></span>
        )}

        <button onClick={load} className="ml-auto text-[10px] font-bold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 border border-zinc-200 dark:border-zinc-600 px-2.5 py-1.5 rounded-lg transition shrink-0">
          Refresh
        </button>
      </div>

      {/* Script log (shown while running or on error) */}
      {(jobStatus === 'running' || jobStatus === 'error') && jobLog.length > 0 && (
        <div className="bg-zinc-900 rounded-xl p-3 overflow-x-auto">
          <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Script output</p>
          <pre className="text-[10px] text-green-400 font-mono whitespace-pre-wrap leading-relaxed">
            {jobLog.join('\n')}
          </pre>
        </div>
      )}

      {/* Model config pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] font-black text-[#305d3d] uppercase tracking-wider">Model:</span>
        {[
          `${model?.type ?? 'Random Forest'}`,
          `${model?.n_estimators ?? 250} trees`,
          `${((model?.train_ratio ?? 0.7) * 100).toFixed(0)}% train / ${((model?.test_ratio ?? 0.3) * 100).toFixed(0)}% test`,
          `${model?.features?.length ?? 26} input features`,
        ].map(tag => (
          <span key={tag} className="bg-green-50 dark:bg-green-900/30 border border-green-100 dark:border-green-900 text-[#305d3d] dark:text-green-300 text-[10px] font-bold px-2 py-0.5 rounded-full">{tag}</span>
        ))}
        <span className="ml-auto text-[10px] text-zinc-400">{filledPeriods.length}/{periodKeys.length} periods recorded</span>
      </div>

      {/* Average stats */}
      <div>
        <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-3">
          Average Performance
          <span className="ml-2 font-normal normal-case text-zinc-400">
            across {filledPeriods.length || '—'} completed periods
          </span>
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Avg Accuracy', value: filledPeriods.length ? pct(avgAccuracy) : '—', sub: 'Correctly classified pixels' },
            { label: 'Avg Kappa',    value: filledPeriods.length ? avgKappa.toFixed(4) : '—', sub: 'Agreement beyond chance' },
            { label: 'Avg MSE',      value: filledPeriods.length ? avgMse.toFixed(4)  : '—', sub: 'Mean squared class error' },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-zinc-900 dark:text-zinc-100">{value}</div>
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">{label}</div>
              <div className="text-[9px] text-zinc-400 mt-0.5">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-period table */}
      <div>
        <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-3">Per-Period Summary</h3>
        <div className="overflow-x-auto rounded-xl border border-zinc-100 dark:border-zinc-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-700 border-b border-zinc-100 dark:border-zinc-600">
                <th className="text-left font-black text-zinc-500 uppercase tracking-wider px-4 py-2.5">Period</th>
                <th className="font-black text-zinc-500 uppercase tracking-wider px-4 py-2.5 text-center">Accuracy</th>
                <th className="font-black text-zinc-500 uppercase tracking-wider px-4 py-2.5 text-center">Kappa</th>
                <th className="font-black text-zinc-500 uppercase tracking-wider px-4 py-2.5 text-center">MSE</th>
                <th className="font-black text-zinc-500 uppercase tracking-wider px-4 py-2.5 text-center">Details</th>
              </tr>
            </thead>
            <tbody>
              {periodKeys.map((key, i) => {
                const p = periods[key];
                const filled = (p?.overall?.accuracy ?? 0) > 0;
                const isActive = selectedPeriod === key;
                return (
                  <tr
                    key={key}
                    onClick={() => filled && setSelectedPeriod(isActive ? null : key)}
                    className={`border-b border-zinc-100 dark:border-zinc-700 last:border-0 transition ${isActive ? 'bg-green-50 dark:bg-green-900/30' : i % 2 === 0 ? 'bg-white dark:bg-zinc-800' : 'bg-zinc-50/40 dark:bg-zinc-700/40'} ${filled ? 'cursor-pointer hover:bg-green-50/60 dark:hover:bg-green-900/20' : ''}`}
                  >
                    <td className="px-4 py-2.5 font-bold text-zinc-800 dark:text-zinc-100">{key}</td>
                    <td className="px-4 py-2.5 text-center font-mono font-bold text-zinc-700 dark:text-zinc-300">
                      {filled ? pct(p.overall.accuracy) : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-zinc-700 dark:text-zinc-300">
                      {filled ? p.overall.kappa.toFixed(4) : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-zinc-700 dark:text-zinc-300">
                      {filled ? p.overall.mse.toFixed(4) : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {filled ? (
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${isActive ? 'bg-[#305d3d] text-white border-[#305d3d]' : 'text-[#305d3d] border-[#305d3d]/30'}`}>
                          {isActive ? 'Hide' : 'View'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-300 italic">pending</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drill-down for selected period */}
      {activePeriod && selectedPeriod && (
        <div className="border border-green-100 dark:border-green-900 bg-green-50/30 dark:bg-green-900/10 rounded-2xl p-4 space-y-5">
          <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-100">
            {selectedPeriod}
            <span className="ml-2 text-xs font-normal text-zinc-500">— detailed metrics</span>
          </h3>

          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-2">Per-Class Metrics</p>
            <div className="overflow-x-auto rounded-xl border border-zinc-100 dark:border-zinc-700 bg-white dark:bg-zinc-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-700 border-b border-zinc-100 dark:border-zinc-600">
                    <th className="text-left font-black text-zinc-500 uppercase tracking-wider px-4 py-2">Class</th>
                    <th className="font-black text-zinc-500 uppercase tracking-wider px-4 py-2 text-center">Precision</th>
                    <th className="font-black text-zinc-500 uppercase tracking-wider px-4 py-2 text-center">Recall</th>
                    <th className="font-black text-zinc-500 uppercase tracking-wider px-4 py-2 text-center">F1 Score</th>
                  </tr>
                </thead>
                <tbody>
                  {CLASS_ORDER_MODEL.map((cls, i) => {
                    const m = activePeriod.per_class?.[cls] ?? { precision: 0, recall: 0, f1: 0 };
                    return (
                      <tr key={cls} className={i % 2 === 0 ? 'bg-white dark:bg-zinc-800' : 'bg-zinc-50/60 dark:bg-zinc-700/40'}>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: CLASS_COLORS_MODEL[cls] }} />
                            <span className="font-bold text-zinc-800 dark:text-zinc-100">{cls}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center font-mono font-bold text-zinc-700 dark:text-zinc-300">{pct(m.precision)}</td>
                        <td className="px-4 py-2 text-center font-mono font-bold text-zinc-700 dark:text-zinc-300">{pct(m.recall)}</td>
                        <td className="px-4 py-2 text-center font-mono font-bold text-zinc-700 dark:text-zinc-300">{pct(m.f1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-2">Confusion Matrix</p>
            <ConfusionMatrixView confusion_matrix={activePeriod.confusion_matrix} />
          </div>
        </div>
      )}

      {/* Input features */}
      {model?.features && (
        <div>
          <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2">
            Input Features ({model.features.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {model.features.map(f => (
              <span key={f} className="bg-zinc-100 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md">{f}</span>
            ))}
          </div>
        </div>
      )}
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
  const [activeTab, setActiveTab] = useState('aois'); // 'aois' | 'users' | 'datasets' | 'model'

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
      <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#305d3d] flex items-center justify-center text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-black text-zinc-900 dark:text-zinc-100 leading-tight">Admin Panel</p>
            <p className="text-xs text-zinc-400">Content Manager · {user?.name}</p>
          </div>
        </div>

        {/* Stats pill */}
        <div className="hidden sm:flex items-center gap-3 text-xs text-zinc-500">
          <span className="bg-zinc-100 dark:bg-zinc-700 dark:text-zinc-300 px-3 py-1 rounded-full font-bold">
            {aois.length} AOI{aois.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-6">
        {[
          { id: 'aois',     label: 'Areas of Interest' },
          { id: 'datasets', label: 'Datasets' },
          { id: 'users',    label: 'Users' },
          { id: 'model',    label: 'Model Performance' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-[#305d3d] text-[#305d3d]'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-5xl mx-auto p-6 space-y-6">

          {activeTab === 'datasets' && (
            <DatasetSection token={token} />
          )}

          {activeTab === 'model' && (
            <ModelPerformanceSection />
          )}

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
                  <div className="border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl p-10 text-center">
                    <svg className="w-10 h-10 text-zinc-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    <p className="text-sm font-bold text-zinc-400">No AOIs yet</p>
                    <p className="text-xs text-zinc-400 mt-1">Upload a GeoJSON or Shapefile above to get started.</p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-zinc-700 border-b border-zinc-200 dark:border-zinc-600">
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
