const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TwiztedAdmin2026!';

const DATA_DIR = path.join(__dirname, 'storage');
const APK_PATH = path.join(DATA_DIR, 'twizted-tv.apk');
const META_PATH = path.join(DATA_DIR, 'release-meta.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(META_PATH)) {
  fs.writeFileSync(
    META_PATH,
    JSON.stringify(
      {
        versionCode: 1,
        versionName: '1.0.0',
        notes: 'Initial Twizted TV Release',
        portalUrl: '',
        announcement: '',
        updatedAt: new Date().toISOString()
      },
      null,
      2
    )
  );
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  dest: path.join(DATA_DIR, 'tmp'),
  limits: { fileSize: 150 * 1024 * 1024 } // 150 MB max APK
});

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  } catch {
    return { versionCode: 1, versionName: '1.0.0', notes: '', portalUrl: '', announcement: '' };
  }
}

// 1. Endpoint checked by AppUpdateManager in Twizted TV
app.get('/version.json', (req, res) => {
  const meta = readMeta();
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    versionCode: Number(meta.versionCode) || 1,
    versionName: meta.versionName || '1.0.0',
    apkUrl: `${baseUrl}/twizted-tv.apk`,
    notes: meta.notes || 'Bug fixes and performance improvements.'
  });
});

// 2. Optional remote config endpoint (server URL / announcements)
app.get('/config.json', (req, res) => {
  const meta = readMeta();
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    portalUrl: meta.portalUrl || '',
    announcement: meta.announcement || ''
  });
});

// 3. Permanent APK download link for Downloader & In-App OTA
app.get('/twizted-tv.apk', (req, res) => {
  if (!fs.existsSync(APK_PATH)) {
    return res.status(404).send('No APK uploaded yet.');
  }
  res.download(APK_PATH, 'twizted-tv.apk');
});

// 4. Publish new release from the Admin Panel
app.post('/api/publish', upload.single('apkFile'), (req, res) => {
  const { password, versionCode, versionName, notes, portalUrl, announcement } = req.body;
  if (password !== ADMIN_PASSWORD) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(401).json({ error: 'Invalid admin password.' });
  }

  const current = readMeta();
  const updated = {
    versionCode: Number(versionCode) || current.versionCode,
    versionName: (versionName || current.versionName).trim(),
    notes: (notes || '').trim(),
    portalUrl: (portalUrl ?? current.portalUrl).trim(),
    announcement: (announcement ?? current.announcement).trim(),
    updatedAt: new Date().toISOString()
  };

  if (req.file) {
    fs.renameSync(req.file.path, APK_PATH);
  }

  fs.writeFileSync(META_PATH, JSON.stringify(updated, null, 2));
  res.json({ ok: true, release: updated });
});

// 5. Web Admin Panel UI
app.get('/', (req, res) => {
  const meta = readMeta();
  const hasApk = fs.existsSync(APK_PATH);
  const apkSizeMb = hasApk ? (fs.statSync(APK_PATH).size / (1024 * 1024)).toFixed(2) : '0';

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Twizted TV — App Hosting & OTA Panel</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #090d16; color: #fff; margin: 0; padding: 32px; }
    .card { max-width: 680px; margin: 0 auto; background: #101726; border: 1px solid #1f2d47; border-radius: 16px; padding: 28px; }
    h1 { margin-top: 0; color: #00e676; font-size: 24px; }
    .pill { display: inline-block; background: #162238; border: 1px solid #2b426b; padding: 6px 12px; border-radius: 8px; font-size: 13px; margin: 4px 6px 14px 0; }
    label { display: block; font-size: 13px; font-weight: 700; color: #a5b0c2; margin: 14px 0 6px; }
    input, textarea { width: 100%; box-sizing: border-box; background: #0b101b; border: 1px solid #263554; color: #fff; padding: 10px 12px; border-radius: 8px; font-size: 14px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    button { margin-top: 20px; width: 100%; background: #00e676; color: #000; font-weight: 900; border: none; padding: 13px; border-radius: 10px; font-size: 15px; cursor: pointer; }
    button:hover { background: #33eb91; }
    code { color: #00e5ff; }
    #status { margin-top: 14px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🚀 Twizted TV — App Hosting & OTA Panel</h1>
    <div>
      <span class="pill">Live Version: <strong>v${meta.versionName} (Code ${meta.versionCode})</strong></span>
      <span class="pill">Hosted APK: <strong>${hasApk ? apkSizeMb + ' MB' : 'Not uploaded yet'}</strong></span>
    </div>
    <p style="font-size:13px;color:#9fb0c9;">
      Permanent APK URL: <code id="apkUrl"></code><br/>
      Manifest URL: <code id="jsonUrl"></code>
    </p>
    <form id="publishForm">
      <label>Admin Password</label>
      <input type="password" name="password" required placeholder="Enter panel password" />

      <div class="row">
        <div>
          <label>Version Code (Must increase for OTA)</label>
          <input type="number" name="versionCode" value="${meta.versionCode}" required />
        </div>
        <div>
          <label>Version Name</label>
          <input type="text" name="versionName" value="${meta.versionName}" required />
        </div>
      </div>

      <label>Release Notes (Shown in TV Update Popup)</label>
      <textarea name="notes" rows="3">${meta.notes}</textarea>

      <label>Upload New Signed APK (Optional if only updating notes/config)</label>
      <input type="file" name="apkFile" accept=".apk" />

      <label>Remote Xtream Portal URL (Optional)</label>
      <input type="text" name="portalUrl" value="${meta.portalUrl || ''}" placeholder="http://your-dns.com:8080" />

      <label>Global TV Banner Announcement (Optional)</label>
      <input type="text" name="announcement" value="${meta.announcement || ''}" placeholder="e.g. Champions League live in Sport tab tonight!" />

      <button type="submit">⬆ Publish Update to All TVs</button>
      <div id="status"></div>
    </form>
  </div>
  <script>
    const origin = window.location.origin;
    document.getElementById('apkUrl').textContent = origin + '/twizted-tv.apk';
    document.getElementById('jsonUrl').textContent = origin + '/version.json';

    document.getElementById('publishForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = document.getElementById('status');
      status.style.color = '#00e5ff';
      status.textContent = 'Uploading & publishing...';
      const formData = new FormData(e.target);
      const res = await fetch('/api/publish', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.ok) {
        status.style.color = '#00e676';
        status.textContent = '✅ Published v' + data.release.versionName + ' (Code ' + data.release.versionCode + ')!';
      } else {
        status.style.color = '#ff5252';
        status.textContent = '❌ ' + (data.error || 'Upload failed');
      }
    });
  </script>
</body>
</html>`);
});

app.listen(PORT, () => console.log(`Twizted App Panel running on port ${PORT}`));
