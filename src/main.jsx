import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Bell, Check, CircleCheck, Copy, KeyRound, LogOut, Moon, Sun, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './i18n';
import './styles.css';
import {
  handleAuthorizationCallback,
  logout as oidcLogout,
  refreshSession,
  startAuthorization,
} from './services/auth';

/* ============================================================
   Config
   ============================================================ */
const apiBaseUrl = (import.meta.env.VITE_BLOCKS_API_URL || 'https://api.seliseblocks.com').replace(
  /\/$/,
  '',
);
const projectKey = import.meta.env.VITE_X_BLOCKS_KEY || '';

const iamBaseUrl = `${apiBaseUrl}/iam/v4/iam`;
const authBaseUrl =
  import.meta.env.VITE_OIDC_API_URL ||
  import.meta.env.VITE_OIDC_IAM_URL ||
  import.meta.env.VITE_API_URL ||
  `${apiBaseUrl}/iam/v4`;
const authTenantId = import.meta.env.VITE_OIDC_TENANT_ID || projectKey;

const dataGatewayUrl = `${apiBaseUrl}/data/v4/gateway`;
const schemasUrl = `${apiBaseUrl}/data/v4/schemas`;
const dataFilesBaseUrl = `${apiBaseUrl}/data/v4/Files`;
const filesPresignUrl = `${dataFilesBaseUrl}/GetPreSignedUrlForUpload`;
const filesInfoUrl = `${dataFilesBaseUrl}/GetFilesInfo`;
const fileGetUrl = `${dataFilesBaseUrl}/GetFile`;
const storageConfigsUrl = `${apiBaseUrl}/logic/v4/Storage/Gets`;
const localizationBaseUrl = apiBaseUrl;

const themeStorageKey = 'construct-theme';
const orgStorageKey = 'construct-org';
const langStorageKey = 'blocks-os-language';

/* ============================================================
   api-call counter bus — bumps on every real platform call
   ============================================================ */
const apiBus = { count: 0, subs: new Set() };
function bumpApi() {
  apiBus.count += 1;
  apiBus.subs.forEach((fn) => fn(apiBus.count));
}
function useApiCount() {
  const [count, setCount] = useState(apiBus.count);
  useEffect(() => {
    const fn = (n) => setCount(n);
    apiBus.subs.add(fn);
    return () => apiBus.subs.delete(fn);
  }, []);
  return count;
}

/* ============================================================
   Fetch helpers
   ============================================================ */
function commonHeaders() {
  return { 'Content-Type': 'application/json', 'x-blocks-key': projectKey };
}

async function iamFetch(url, init = {}, retried = false) {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: { ...commonHeaders(), ...init.headers },
  });

  if (response.status === 401 && !retried) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return iamFetch(url, init, true);
    }
  }
  return response;
}

function readJsonMaybe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function findValueByKey(payload, keys) {
  if (!payload || typeof payload !== 'object') return '';
  for (const key of keys) {
    if (typeof payload[key] === 'string' && payload[key]) return payload[key];
  }
  for (const value of Object.values(payload)) {
    if (value && typeof value === 'object') {
      const nested = findValueByKey(value, keys);
      if (nested) return nested;
    }
  }
  return '';
}

const findUploadUrl = (p) =>
  typeof p === 'string'
    ? p.startsWith('http')
      ? p
      : ''
    : findValueByKey(p, ['preSignedUrl', 'presignedUrl', 'PreSignedUrl', 'url', 'Url', 'uploadUrl', 'UploadUrl']);
const findFileId = (p) =>
  typeof p === 'string' && !p.startsWith('http')
    ? p
    : findValueByKey(p, ['fileId', 'FileId', 'id', 'Id', 'itemId', 'ItemId', 'storageFileId', 'StorageFileId']);
const findDownloadUrl = (p) =>
  typeof p === 'string'
    ? p.startsWith('http')
      ? p
      : ''
    : findValueByKey(p, ['url', 'Url', 'downloadUrl', 'DownloadUrl', 'preSignedUrl', 'presignedUrl', 'PreSignedUrl']);

function pickField(item, keys) {
  if (!item || typeof item !== 'object') return undefined;
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

function initials(name, email) {
  const source = (name || '').trim();
  if (source) {
    const parts = source.split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || source[0].toUpperCase();
  }
  return (email || '?').slice(0, 2).toUpperCase();
}

function slug(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function toCurl({ method = 'POST', url, body }) {
  const lines = [`curl -X ${method} '${url}' \\`, `  -H 'x-blocks-key: ${projectKey || '<project-key>'}' \\`];
  if (body !== undefined) {
    lines.push(`  -H 'Content-Type: application/json' \\`);
    lines.push(`  --data '${typeof body === 'string' ? body : JSON.stringify(body)}'`);
  } else {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/ \\$/, '');
  }
  return lines.join('\n');
}

/* ============================================================
   API — IAM
   ============================================================ */
async function getMe(signal) {
  const resp = await iamFetch(`${iamBaseUrl}/me`, { signal });
  if (!resp.ok) throw new Error(`me failed: ${resp.status}`);
  bumpApi();
  const payload = await resp.json();
  return payload.data || null;
}

const orgListQuery = 'Page=0&PageSize=20&Sort.Property=Name&Sort.IsDescending=false';

async function listOrgs(signal) {
  const resp = await iamFetch(`${iamBaseUrl}/organizations?${orgListQuery}`, { signal });
  if (!resp.ok) throw new Error(`orgs failed: ${resp.status}`);
  bumpApi();
  const payload = await resp.json();
  return payload.organizations || [];
}

async function createOrg({ name }) {
  const body = {
    name,
    description: `${name} workspace`,
    defaultRoleForMembers: ['user'],
    defaultPermissionsForMembers: [],
    createdFrom: 1,
  };
  const resp = await iamFetch(`${iamBaseUrl}/organizations/create`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || payload.isSuccess === false) {
    throw new Error(payload.errors ? JSON.stringify(payload.errors) : `create org failed: ${resp.status}`);
  }
  bumpApi();
  return payload.itemId;
}

async function listRoles(signal) {
  const resp = await iamFetch(`${iamBaseUrl}/roles`, {
    method: 'POST',
    body: JSON.stringify({
      page: 0,
      pageSize: 50,
      sort: { property: 'name', isDescending: false },
      filter: { search: '', slugs: [] },
    }),
    signal,
  });
  if (!resp.ok) throw new Error(`roles failed: ${resp.status}`);
  bumpApi();
  const payload = await resp.json();
  return payload.data || [];
}

async function listPermissions(signal) {
  const resp = await iamFetch(`${iamBaseUrl}/permissions`, {
    method: 'POST',
    body: JSON.stringify({
      page: 0,
      pageSize: 50,
      sort: { property: 'name', isDescending: false },
      filter: {},
      roles: [],
    }),
    signal,
  });
  if (!resp.ok) throw new Error(`permissions failed: ${resp.status}`);
  bumpApi();
  const payload = await resp.json();
  return payload.data || [];
}

async function listUsers(orgId, signal) {
  const resp = await iamFetch(`${iamBaseUrl}/users`, {
    method: 'POST',
    body: JSON.stringify({
      page: 0,
      pageSize: 50,
      sort: { property: 'email', isDescending: false },
      filter: { email: '', name: '', userIds: [], org_id: orgId || '' },
    }),
    signal,
  });
  if (!resp.ok) throw new Error(`users failed: ${resp.status}`);
  bumpApi();
  const payload = await resp.json();
  return { data: payload.data || [], totalCount: payload.totalCount || 0 };
}

async function getUserAccess(userId, orgId, signal) {
  const params = orgId ? `?organizationId=${encodeURIComponent(orgId)}` : '';
  const resp = await iamFetch(`${iamBaseUrl}/users/${encodeURIComponent(userId)}${params}`, { signal });
  if (!resp.ok) throw new Error(`user access failed: ${resp.status}`);
  bumpApi();
  const payload = await resp.json();
  const u = payload.data || {};
  return { roles: u.roles || [], permissions: u.permissions || [] };
}

async function setUserRolesPerms(userId, roles, permissions) {
  const resp = await iamFetch(`${iamBaseUrl}/users/roles-and-permissions`, {
    method: 'POST',
    body: JSON.stringify({ userId, roles, permissions }),
  });
  if (!resp.ok) {
    const payload = await resp.json().catch(() => ({}));
    throw new Error(payload.message || `update access failed: ${resp.status}`);
  }
  bumpApi();
}

async function createUser({ name, email, orgId }) {
  const parts = (name || '').trim().split(/\s+/);
  const body = {
    email,
    userName: email,
    password: '',
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
    phoneNumber: '',
    organizationId: orgId,
    userPassType: 1,
    userCreationType: 1,
    verifiedType: 1,
    userMfaType: 1,
    mfaEnabled: false,
    allowedLogInType: [1],
    roles: [],
    permissions: [],
    attributes: {},
  };
  const resp = await iamFetch(`${iamBaseUrl}/users/create`, { method: 'POST', body: JSON.stringify(body) });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || payload.errors?.length) {
    const msg =
      (payload.errors && typeof payload.errors === 'object'
        ? Object.values(payload.errors).flat().join(', ')
        : null) ||
      payload.message ||
      `create user failed: ${resp.status}`;
    throw new Error(msg);
  }
  bumpApi();
}

async function deactivateUser(userId) {
  const resp = await iamFetch(`${iamBaseUrl}/users/deactivate`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  if (!resp.ok) throw new Error(`deactivate failed: ${resp.status}`);
  bumpApi();
}

/* ============================================================
   API — Data Gateway
   ============================================================ */
async function listSchemas(signal) {
  const url = `${schemasUrl}?ProjectKey=${encodeURIComponent(projectKey)}&PageNo=1&PageSize=100`;
  const resp = await iamFetch(url, { signal });
  if (!resp.ok) throw new Error(`schemas failed: ${resp.status}`);
  bumpApi();
  const payload = await resp.json();
  const items = payload?.data?.items || payload?.items || [];
  return items.filter((s) => s.querySchema);
}

const SCALAR_GQL_TYPES = new Set(
  ['string', 'int', 'integer', 'long', 'float', 'double', 'decimal', 'boolean', 'bool', 'datetime', 'date', 'guid', 'id', 'uuid', 'byte', 'short'],
);

// Only leaf/scalar fields can be selected without a sub-selection — an object or
// relation field selected bare makes the gateway throw a generic execution error.
function isScalarField(field) {
  if (!field || !field.name) return false;
  if (field.type == null) return true; // type unknown → assume scalar (safe for most)
  const base = String(field.type).replace(/[![\]]/g, '').toLowerCase();
  return SCALAR_GQL_TYPES.has(base);
}

// Scalar field names for a schema, deduped case-insensitively. ItemId is always
// first; `schema.fields` already contains it, so a naive prepend would select it
// twice — which this gateway rejects with a generic execution error.
function selectedFieldNames(schema) {
  const seen = new Set();
  const out = [];
  const add = (name) => {
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(name);
  };
  add('ItemId');
  (schema.fields || []).filter(isScalarField).forEach((f) => add(f.name));
  return out;
}

// Inline args (where/order/paging) matching the gateway's generated resolver —
// no GraphQL variables, so we don't depend on the exact input type names.
function buildSelectQuery(schema, pageSize = 20) {
  return `query { get${schema.querySchema}(where: {}, order: [], paging: { pageNo: 1, pageSize: ${pageSize} }) { items { ${selectedFieldNames(schema).join(' ')} } totalCount pageNo pageSize totalPages hasNextPage hasPreviousPage } }`;
}

async function gqlQuery(schema, pageSize = 20) {
  const query = buildSelectQuery(schema, pageSize);
  const resp = await fetch(dataGatewayUrl, {
    method: 'POST',
    credentials: 'include',
    headers: commonHeaders(),
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) throw new Error(`query failed: ${resp.status}`);
  const payload = await resp.json();
  if (payload.errors?.length) throw new Error(payload.errors[0].message);
  bumpApi();
  return payload.data?.[`get${schema.querySchema}`] || { items: [], totalCount: 0 };
}

function insertMutationName(schema) {
  return (schema.mutationSchemas || []).find((m) => /^insert/i.test(m)) || `insert${schema.schemaName}`;
}

async function gqlInsert(schema, input) {
  const mutation = insertMutationName(schema);
  const query = `mutation($input: ${schema.schemaName}InsertInput!){ ${mutation}(input:$input){ acknowledged itemId totalImpactedData message } }`;
  const resp = await fetch(dataGatewayUrl, {
    method: 'POST',
    credentials: 'include',
    headers: commonHeaders(),
    body: JSON.stringify({ query, variables: { input } }),
  });
  if (!resp.ok) throw new Error(`insert failed: ${resp.status}`);
  const payload = await resp.json();
  if (payload.errors?.length) throw new Error(payload.errors[0].message);
  bumpApi();
  return payload.data?.[mutation];
}

/* ============================================================
   API — Storage
   ============================================================ */
async function listStorageConfigs(signal) {
  try {
    const resp = await iamFetch(storageConfigsUrl, { signal });
    if (!resp.ok) return [];
    bumpApi();
    const payload = await resp.json();
    const arr = Array.isArray(payload) ? payload : payload.data || payload.items || [];
    return arr;
  } catch {
    return [];
  }
}

async function uploadFile(file, configurationName = 'Default') {
  const resp = await iamFetch(filesPresignUrl, {
    method: 'POST',
    headers: { accept: 'text/plain' },
    body: JSON.stringify({
      metaData: '',
      name: file.name,
      parentDirectoryId: '',
      tags: '',
      accessModifier: 'Public',
      projectKey,
      moduleName: 3,
      configurationName,
    }),
  });
  if (!resp.ok) throw new Error(`presign failed: ${resp.status}`);
  const payload = readJsonMaybe(await resp.text());
  const uploadUrl = findUploadUrl(payload);
  const fileId = findFileId(payload);
  if (!uploadUrl) throw new Error('No upload URL returned.');

  const putHeaders = file.type ? { 'Content-Type': file.type } : {};
  if (/\.blob\.core\.windows\.net/i.test(uploadUrl)) putHeaders['x-ms-blob-type'] = 'BlockBlob';

  const putResp = await fetch(uploadUrl, { method: 'PUT', headers: putHeaders, body: file });
  if (!putResp.ok) throw new Error(`upload failed: ${putResp.status}`);
  bumpApi();
  return fileId;
}

async function fetchStorageFiles(signal) {
  const resp = await iamFetch(filesInfoUrl, {
    method: 'POST',
    body: JSON.stringify({
      page: 0,
      pageSize: 50,
      sort: { property: 'createdDate', isDescending: true },
      filter: {},
      projectKey,
    }),
    signal,
  });
  if (!resp.ok) throw new Error(`files failed: ${resp.status}`);
  bumpApi();
  const payload = await resp.json();
  return Array.isArray(payload.data) ? payload.data : [];
}

async function getStorageFileUrl(fileId, configurationName = 'Default') {
  const resp = await iamFetch(
    `${fileGetUrl}?FileId=${encodeURIComponent(fileId)}&ConfigurationName=${encodeURIComponent(configurationName)}`,
  );
  if (!resp.ok) throw new Error(`get url failed: ${resp.status}`);
  bumpApi();
  return findDownloadUrl(readJsonMaybe(await resp.text()));
}

/* ============================================================
   Localization
   ============================================================ */
async function loadLocalizationModule(i18n, languageCode, moduleName = 'construct') {
  if (!projectKey || !languageCode || i18n.hasResourceBundle(languageCode, moduleName)) return;
  const resp = await fetch(
    `${localizationBaseUrl}/localization/v4/Key/GetUilmFile?Language=${encodeURIComponent(
      languageCode,
    )}&ModuleName=${encodeURIComponent(moduleName)}&ProjectKey=${encodeURIComponent(projectKey)}`,
    { headers: { 'x-blocks-key': projectKey } },
  );
  if (!resp.ok) return;
  const resources = await resp.json();
  if (resources && typeof resources === 'object' && !Array.isArray(resources)) {
    i18n.addResourceBundle(languageCode, moduleName, resources, true, true);
  }
}

/* ============================================================
   Shared UI
   ============================================================ */
function useClock() {
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString('en-GB'));
  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('en-GB')), 1000);
    return () => clearInterval(t);
  }, []);
  return clock;
}

function ThemeToggleBtn({ theme, onToggle, variant = 'icon' }) {
  const isDark = theme === 'dark';
  const icon = isDark ? <Moon size={variant === 'pill' ? 13 : 17} /> : <Sun size={variant === 'pill' ? 13 : 17} />;
  if (variant === 'pill') {
    return (
      <button type="button" className="theme-pill" onClick={onToggle}>
        {icon}
        {theme}
      </button>
    );
  }
  return (
    <button type="button" className="cx-iconbtn" title="toggle theme" onClick={onToggle}>
      {icon}
    </button>
  );
}

// api trace panel. `calls` is the single source of truth for both the rendered
// endpoint lines and the copyable cURLs, so they can never drift apart.
//   request line : { method, url, body?, note?, label?, noCopy? }
//   response line: { res: true, text }
function ApiTrace({ calls = [], sdk, note }) {
  const [copiedKey, setCopiedKey] = useState(null);
  const copyable = calls.filter((c) => !c.res && c.method && c.url && !c.noCopy);

  const doCopy = (e, key, text) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopiedKey(key);
        setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600);
      },
      () => {},
    );
  };

  const methodCounts = {};
  copyable.forEach((c) => {
    methodCounts[c.method] = (methodCounts[c.method] || 0) + 1;
  });
  const labelFor = (c) => {
    if (c.label) return c.label;
    if (methodCounts[c.method] > 1) {
      const seg = c.url.split('?')[0].split('/').filter(Boolean).pop() || '';
      return `${c.method} ${seg.slice(0, 14)}`;
    }
    return c.method;
  };

  const chip = (key, label, text) => (
    <button type="button" className="cx-copy" key={key} onClick={(e) => doCopy(e, key, text)}>
      {copiedKey === key ? (
        <>
          <Check size={11} style={{ verticalAlign: '-2px' }} /> copied
        </>
      ) : (
        <>
          <Copy size={11} style={{ verticalAlign: '-2px' }} /> {label}
        </>
      )}
    </button>
  );

  return (
    <details className="cx-trace">
      <summary>
        <span className="cx-caret">▸</span> api trace &amp; platform notes
        {copyable.length ? (
          <span className="cx-trace-actions">
            {copyable.map((c, i) => chip(`c${i}`, `copy ${labelFor(c)}`, toCurl(c)))}
            {copyable.length > 1 ? chip('all', 'copy all', copyable.map((c) => toCurl(c)).join('\n\n')) : null}
          </span>
        ) : null}
      </summary>
      <pre className="cx-pre cx-scroll">
        {calls.map((c, i) => (
          <React.Fragment key={i}>
            {c.res ? (
              <>
                <span className="out">←</span> {c.text}
              </>
            ) : (
              <>
                <span className="in">→</span> {c.method}  {c.url}
                {c.note ? `   ${c.note}` : ''}
              </>
            )}
            {'\n'}
          </React.Fragment>
        ))}
        {sdk ? (
          <>
            {'\n'}
            {sdk}
          </>
        ) : null}
      </pre>
      {note ? (
        <div className="cx-note">
          <div className="cap">platform notes</div>
          <div className="txt">{note}</div>
        </div>
      ) : null}
    </details>
  );
}

function ServiceCard({ dotColor, name, sub, cmd, open, onToggle, children }) {
  return (
    <section className={`cx-svc${open ? ' open' : ''}`}>
      <div className="cx-svc-head">
        <span className="cx-dot" style={{ background: dotColor, color: dotColor }} />
        <span className="cx-svc-name">{name}</span>
        <span className="cx-svc-sub">{sub}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="cx-btn cyan" onClick={onToggle}>
          {open ? 'collapse ▲' : 'run ▾'}
        </button>
      </div>
      <div className="cx-cmd">{cmd}</div>
      {open ? <div className="cx-body cx-svc-body">{children}</div> : null}
    </section>
  );
}

/* ============================================================
   Login gate
   ============================================================ */
function LoginGate({ theme, onToggleTheme }) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [captchaOn, setCaptchaOn] = useState(false);
  const [captchaSolved, setCaptchaSolved] = useState(false);

  async function signIn(method) {
    if (captchaOn && !captchaSolved) {
      alert('Solve the captcha first.');
      return;
    }
    if (method !== 'oidc') return; // SSO buttons are UI-only
    setStatus('loading');
    setError('');
    try {
      await startAuthorization();
    } catch (err) {
      setError(err.message || 'Login failed');
      setStatus('error');
    }
  }

  return (
    <div className="cx-app">
      <div className="login-wrap">
        <div className="login-inner">
          <div className="login-brand">
            <span className="cx-dot glow" style={{ background: 'var(--grn)', color: 'var(--grn)' }} />
            <div className="cx-wordmark" style={{ fontSize: 18 }}>
              CONSTRUCT<span className="sep"> // </span>CONSOLE
            </div>
          </div>
          <div className="login-sub">iam · secure gateway · sdk v4.0</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} variant="pill" />
          </div>

          <div className="login-card">
            <div className="term-head">
              <span className="term-light" style={{ background: 'var(--red)' }} />
              <span className="term-light" style={{ background: 'var(--amber)' }} />
              <span className="term-light" style={{ background: 'var(--grn)' }} />
              <span style={{ flex: 1 }} />
              <span className="term-title">auth — oidc / sso</span>
            </div>
            <div style={{ padding: 22 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--dim)', marginBottom: 16 }}>
                <span style={{ color: 'var(--grn)' }}>$</span> construct.auth.login
                <span className="cx-cursor" />
              </div>

              {status === 'error' ? <div className="cx-msg error">{error}</div> : null}

              <button
                type="button"
                className="cx-btn green block"
                style={{ marginBottom: 9 }}
                disabled={status === 'loading'}
                onClick={() => signIn('oidc')}
              >
                {status === 'loading' ? 'redirecting…' : 'login --oidc'}
              </button>

              <div className="login-divider">
                <span className="line" />
                <span className="label">or sso</span>
                <span className="line" />
              </div>
              <div style={{ display: 'flex', gap: 9 }}>
                <button type="button" className="cx-btn" style={{ flex: 1, padding: 11 }} onClick={() => signIn('microsoft')}>
                  microsoft
                </button>
                <button type="button" className="cx-btn" style={{ flex: 1, padding: 11 }} onClick={() => signIn('google')}>
                  google
                </button>
              </div>

              {captchaOn ? (
                <label className="captcha-row">
                  <input
                    type="checkbox"
                    checked={captchaSolved}
                    onChange={(e) => setCaptchaSolved(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--grn)' }}
                  />
                  <span>verify: I am not a robot</span>
                  <span className="captcha-tag">CAPTCHA</span>
                </label>
              ) : null}

              <label className="flag-row">
                <input
                  type="checkbox"
                  checked={captchaOn}
                  onChange={(e) => setCaptchaOn(e.target.checked)}
                  style={{ accentColor: 'var(--grn)' }}
                />
                platform config → enable_captcha = {String(captchaOn)}
              </label>

              <ApiTrace
                calls={[
                  { method: 'GET', url: `${authBaseUrl}/idp/initiate?x-blocks-key=${authTenantId}&clientId=…&redirectUri=…`, note: '→ 302 redirect to IdP' },
                  { method: 'GET', url: `${authBaseUrl}/idp/callback?code&state` },
                  { res: true, text: 'id_token (JWT) · httpOnly refresh cookie' },
                ]}
                sdk={'await construct.auth.loginWithOIDC();\nconst user = await construct.auth.currentUser();'}
                note={
                  <>
                    In the console you register an OIDC client (redirect URIs) and toggle SSO providers per tenant. Captcha is a
                    tenant flag — when on, the platform injects a challenge into the auth flow and the SDK surfaces it
                    automatically; no consumer code change needed. Tokens are short-lived JWTs refreshed via a rotating httpOnly
                    cookie.
                  </>
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Callback + activation (ported)
   ============================================================ */
function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    (async () => {
      try {
        await handleAuthorizationCallback();
        navigate('/', { replace: true });
      } catch (err) {
        setError(err.message || 'Authentication failed');
        setTimeout(() => navigate('/', { replace: true }), 3000);
      }
    })();
  }, [navigate]);

  return (
    <div className="cx-app">
      <div className="cx-center-page">
        {error ? (
          <div className="cx-msg error">
            <strong>{error}</strong>
            <div>Redirecting to login…</div>
          </div>
        ) : (
          <>
            <div className="cx-spinner" />
            <p>Completing sign in…</p>
          </>
        )}
      </div>
    </div>
  );
}

function ActivationPage({ theme, onToggleTheme }) {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code') || '';
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const busy = status === 'loading';
  const done = status === 'success';

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters');
    if (password !== confirm) return setError('Passwords do not match');
    setStatus('loading');
    try {
      const resp = await fetch(`${authBaseUrl}/auth/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-blocks-key': authTenantId },
        body: JSON.stringify({ code, password, firstName, lastName }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.message || 'Activation failed.');
      }
      setStatus('success');
      setTimeout(() => navigate('/', { replace: true }), 3000);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  return (
    <div className="cx-app">
      <div className="login-wrap">
        <div className="login-inner">
          <div className="login-brand">
            <span className="cx-dot glow" style={{ background: 'var(--grn)', color: 'var(--grn)' }} />
            <div className="cx-wordmark" style={{ fontSize: 18 }}>
              CONSTRUCT<span className="sep"> // </span>CONSOLE
            </div>
          </div>
          <div className="login-sub">account activation</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} variant="pill" />
          </div>
          <div className="login-card">
            <div className="term-head">
              <span className="term-light" style={{ background: 'var(--red)' }} />
              <span className="term-light" style={{ background: 'var(--amber)' }} />
              <span className="term-light" style={{ background: 'var(--grn)' }} />
              <span style={{ flex: 1 }} />
              <span className="term-title">auth — activate</span>
            </div>
            <div style={{ padding: 22 }}>
              {!code ? <div className="cx-msg error">Invalid activation link.</div> : null}
              {done ? (
                <div style={{ textAlign: 'center', color: 'var(--grn)', fontFamily: 'var(--mono)' }}>
                  <CircleCheck size={40} />
                  <p>Account activated — redirecting…</p>
                </div>
              ) : null}
              {code && !done ? (
                <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input className="cx-input" placeholder="first name" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={busy} required />
                    <input className="cx-input" placeholder="last name" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={busy} required />
                  </div>
                  <input className="cx-input" type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} required />
                  <input className="cx-input" type="password" placeholder="confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy} required />
                  {error ? <div className="cx-msg error">{error}</div> : null}
                  <button type="submit" className="cx-btn green block" disabled={busy}>
                    <KeyRound size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />
                    {busy ? 'activating…' : 'activate account'}
                  </button>
                </form>
              ) : null}

              <ApiTrace
                calls={[
                  {
                    method: 'POST',
                    label: 'activate',
                    url: `${authBaseUrl}/auth/activate`,
                    body: { code: '<from-email>', password: '…', firstName, lastName },
                    note: '→ sets password, activates account',
                  },
                ]}
                sdk={'await construct.auth.activate({ code, password });'}
                note={
                  <>
                    The invitation email links here with a one-time <code>code</code>. Submitting sets the password and activates
                    the account, then redirects to the login gate. This app must be running when the link is opened, or activation
                    can't complete.
                  </>
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Header
   ============================================================ */
const SEED_NOTIFS = [
  { id: 'n1', mode: 'user', title: 'Your export is ready', body: 'customers.csv is ready to download', time: '2m', read: false },
  { id: 'n2', mode: 'user', title: 'Role updated', body: 'Your access was refreshed for this org', time: '1h', read: false },
  { id: 'n4', mode: 'broadcast', title: 'Scheduled maintenance', body: 'Data Gateway upgrade Sat 02:00 UTC', time: '1d', read: false },
  { id: 'n5', mode: 'broadcast', title: 'New region: eu-central', body: 'Storage now available in Frankfurt', time: '2d', read: true },
];

function ConsoleHeader({
  me,
  theme,
  onToggleTheme,
  orgs,
  activeOrgId,
  onOrgChange,
  lang,
  languages,
  onLangChange,
  notifs,
  onMarkAllRead,
  onLogout,
}) {
  const clock = useClock();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const activeOrg = orgs.find((o) => o.itemId === activeOrgId);
  const orgSlug = activeOrg ? activeOrg.shortCode || slug(activeOrg.name) || 'org' : 'org';
  const name = me ? [me.firstName, me.lastName].filter(Boolean).join(' ') || me.email : '—';
  const roleLabel = `${(me?.roles?.[0] || 'member')}@${orgSlug}`;
  const unread = notifs.filter((n) => !n.read).length;

  const profileFields = [
    { k: 'name', v: name, font: 'var(--sans)' },
    { k: 'email', v: me?.email || '—', font: 'var(--mono)' },
    { k: 'phone', v: me?.phoneNumber || '—', font: 'var(--mono)' },
    { k: 'login count', v: String(me?.logInCount ?? '—'), font: 'var(--mono)' },
    { k: 'last login', v: me?.lastLoggedInTime ? new Date(me.lastLoggedInTime).toLocaleString() : '—', font: 'var(--mono)' },
  ];
  const mfaOn = !!me?.mfaEnabled;

  return (
    <header className="cx-header">
      <div className="cx-header-inner">
        <div className="cx-header-brand">
          <span className="cx-dot glow" style={{ background: 'var(--grn)', color: 'var(--grn)' }} />
          <div>
            <div className="cx-wordmark" style={{ fontSize: 17 }}>
              CONSTRUCT<span className="sep"> // </span>CONSOLE
            </div>
            <div className="cx-subhead">cloud platform · consumer reference · sdk v4.0</div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <div className="cx-clock">
          <span className="prompt">local&gt;</span>
          <span className="time">{clock}</span>
        </div>

        <div className="flag-group">
          <label className="bordered">
            <span className="flag-key">--org</span>
            <select className="org" value={activeOrgId || ''} onChange={(e) => onOrgChange(e.target.value)}>
              {orgs.map((o) => (
                <option key={o.itemId} value={o.itemId}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="flag-key">--lang</span>
            <select className="lang" value={lang} onChange={(e) => onLangChange(e.target.value)}>
              {(languages.length ? languages : [{ code: lang, label: lang }]).map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />

        <button
          type="button"
          className="cx-iconbtn"
          style={{ background: 'rgba(255,255,255,.02)' }}
          onClick={() => {
            setNotifOpen((o) => !o);
            setProfileOpen(false);
          }}
        >
          <Bell size={17} />
          {unread > 0 ? <span className="cx-badge-count">{unread}</span> : null}
        </button>

        <div className="cx-profile-cluster">
          <button
            type="button"
            className="cx-profile-btn"
            onClick={() => {
              setProfileOpen((o) => !o);
              setNotifOpen(false);
            }}
          >
            <span className="cx-avatar">{initials(name, me?.email)}</span>
            <span className="cx-profile-meta">
              <span className="name">{name}</span>
              <span className="role">{roleLabel}</span>
            </span>
          </button>
          <button type="button" className="cx-iconbtn sm" title="logout" onClick={onLogout}>
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {profileOpen ? (
        <div className="cx-dropdown profile">
          <div className="dd-head">
            <span className="cx-avatar grad lg">{initials(name, me?.email)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 14, color: 'var(--head)' }}>{name}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)' }}>{roleLabel}</div>
            </div>
            <span
              className="dd-mfa"
              style={{ color: mfaOn ? 'var(--grn)' : 'var(--red)', border: `1px solid ${mfaOn ? 'var(--grn)' : 'var(--red)'}` }}
            >
              {mfaOn ? 'MFA on' : 'MFA off'}
            </span>
          </div>
          <div style={{ padding: '6px 4px' }}>
            {profileFields.map((f) => (
              <div className="dd-field" key={f.k}>
                <span className="k">{f.k}</span>
                <span className="v" style={{ fontFamily: f.font }}>
                  {f.v}
                </span>
              </div>
            ))}
          </div>
          <div style={{ padding: '2px 14px 12px' }}>
            <ApiTrace
              calls={[
                { method: 'GET', label: 'currentUser', url: `${iamBaseUrl}/me`, note: '→ profile (read-only)' },
                { method: 'POST', label: 'refresh', url: `${authBaseUrl}/oidc/token`, body: { grant_type: 'refresh_token', client_id: '…' }, note: '→ rotates session' },
                { method: 'POST', label: 'logout', url: `${authBaseUrl}/auth/Logout`, body: {} },
              ]}
              sdk={'const user = await construct.auth.currentUser();\nawait construct.auth.logout();'}
              note={
                <>
                  The profile panel is read-only, hydrated from <code>currentUser()</code>. The session is a rotating httpOnly
                  cookie the SDK refreshes automatically on a 401; the logout button revokes it server-side and returns you to the
                  login gate.
                </>
              }
            />
          </div>
        </div>
      ) : null}

      {notifOpen ? (
        <div className="cx-dropdown notif">
          <div className="notif-head">
            <span className="title">$ notifications.tail -f</span>
            <button type="button" className="cx-copy" style={{ border: 'none', color: 'var(--cyan)' }} onClick={onMarkAllRead}>
              mark --all-read
            </button>
          </div>
          <div className="cx-scroll" style={{ maxHeight: 340, overflow: 'auto' }}>
            {notifs.map((n) => {
              const cast = n.mode === 'broadcast';
              const dot = n.read ? 'var(--dim3)' : cast ? 'var(--amber)' : 'var(--grn)';
              return (
                <div className="notif-row" key={n.id} style={{ background: n.read ? 'transparent' : 'rgba(63,185,80,.05)' }}>
                  <span
                    className="cx-dot"
                    style={{ marginTop: 6, background: dot, boxShadow: n.read ? 'none' : `0 0 6px ${dot}` }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className="n-title">{n.title}</span>
                      <span
                        className="n-mode"
                        style={{ border: `1px solid ${cast ? 'var(--amber)' : 'var(--line-2)'}`, color: cast ? 'var(--amber)' : 'var(--dim)' }}
                      >
                        {n.mode}
                      </span>
                    </div>
                    <div className="body">{n.body}</div>
                  </div>
                  <span className="n-time">{n.time}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </header>
  );
}

/* ============================================================
   IAM card
   ============================================================ */
function IamCard({ open, onToggle, activeOrgId, orgs, users, usersLoading, reloadUsers, reloadOrgs, onOrgChange }) {
  const [draftName, setDraftName] = useState('');
  const [draftEmail, setDraftEmail] = useState('');
  const [draftOrgName, setDraftOrgName] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);

  const activeOrg = orgs.find((o) => o.itemId === activeOrgId);

  useEffect(() => {
    const c = new AbortController();
    listRoles(c.signal).then(setRoles).catch(() => {});
    listPermissions(c.signal).then(setPerms).catch(() => {});
    return () => c.abort();
  }, [activeOrgId]);

  // keep a valid selected user for the active org
  useEffect(() => {
    if (users.length === 0) {
      setSelectedUserId('');
      setAccess(null);
      return;
    }
    if (!users.some((u) => u.itemId === selectedUserId)) {
      setSelectedUserId(users[0].itemId);
    }
  }, [users]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedUserId) return undefined;
    const c = new AbortController();
    setAccessLoading(true);
    setAccess(null);
    getUserAccess(selectedUserId, activeOrgId, c.signal)
      .then((a) => setAccess(a))
      .catch(() => setAccess({ roles: [], permissions: [] }))
      .finally(() => setAccessLoading(false));
    return () => c.abort();
  }, [selectedUserId, activeOrgId]);

  const selectedUser = users.find((u) => u.itemId === selectedUserId);

  function userName(u) {
    return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
  }

  async function handleCreateOrg() {
    const name = draftOrgName.trim();
    if (!name) return;
    setBusy('org');
    setError('');
    try {
      const newId = await createOrg({ name });
      setDraftOrgName('');
      await reloadOrgs();
      if (newId) onOrgChange(newId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function handleAddUser() {
    const name = draftName.trim();
    const email = draftEmail.trim();
    if (!email) return;
    setBusy('user');
    setError('');
    try {
      await createUser({ name, email, orgId: activeOrgId });
      setDraftName('');
      setDraftEmail('');
      await reloadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function handleDeleteUser(e, userId) {
    e.stopPropagation();
    if (!window.confirm('Deactivate this user? (Blocks has no hard-delete; this disables the account.)')) return;
    setError('');
    try {
      await deactivateUser(userId);
      await reloadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRoleChange(newRoleSlug) {
    if (!selectedUser) return;
    const next = { roles: [newRoleSlug], permissions: access?.permissions || [] };
    setAccess(next);
    try {
      await setUserRolesPerms(selectedUser.itemId, next.roles, next.permissions);
      reloadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handlePermToggle(permName) {
    if (!selectedUser || !access) return;
    const has = access.permissions.includes(permName);
    const permissions = has ? access.permissions.filter((p) => p !== permName) : [...access.permissions, permName];
    const next = { roles: access.roles, permissions };
    setAccess(next);
    try {
      await setUserRolesPerms(selectedUser.itemId, next.roles, next.permissions);
    } catch (err) {
      setError(err.message);
    }
  }

  const currentRoleSlug = access?.roles?.[0] || '';
  const hasOverride = (access?.permissions?.length || 0) > 0;

  return (
    <ServiceCard
      dotColor="var(--grn)"
      name="IAM"
      sub="identity & access"
      open={open}
      onToggle={onToggle}
      cmd={
        <>
          <span className="p">$</span> construct.iam.session --org=<span className="arg">{activeOrg?.shortCode || slug(activeOrg?.name) || '—'}</span>{' '}
          --with=users,roles,tenants
        </>
      }
    >
      <div className="cx-2col">
        {/* Multi-tenant / organizations */}
        <div className="cx-panel full">
          <div className="cx-panel-title">multi-tenant · organizations</div>
          <div className="cx-panel-desc">Switch org — users, roles &amp; permissions all re-scope.</div>
          <div className="org-list">
            {orgs.map((o) => {
              const active = o.itemId === activeOrgId;
              const badges = ['var(--grn)', 'var(--violet)', 'var(--cyan)', 'var(--amber)'];
              const badgeBg = badges[Math.abs(hashStr(o.itemId)) % badges.length];
              return (
                <button type="button" key={o.itemId} className={`org-btn${active ? ' active' : ''}`} onClick={() => onOrgChange(o.itemId)}>
                  <span className="org-badge" style={{ background: badgeBg }}>
                    {(o.name || '?')[0].toUpperCase()}
                  </span>
                  <span style={{ flex: 1 }}>
                    <span className="org-name">{o.name}</span>
                    <span className="org-meta">
                      {o.shortCode || 'organization'}
                      {active ? ` · ${users.length} users` : ''}
                    </span>
                  </span>
                  {active ? <span className="org-active-mark">● active</span> : null}
                </button>
              );
            })}
          </div>
          <div className="inline-form">
            <input className="cx-input" placeholder="new organization name" value={draftOrgName} onChange={(e) => setDraftOrgName(e.target.value)} />
            <button type="button" className="cx-btn green" disabled={busy === 'org'} onClick={handleCreateOrg}>
              {busy === 'org' ? '…' : '+ create'}
            </button>
          </div>
          <ApiTrace
            calls={[
              { method: 'GET', label: 'list', url: `${iamBaseUrl}/organizations?${orgListQuery}`, note: '→ all orgs in project' },
              {
                method: 'POST',
                label: 'create',
                url: `${iamBaseUrl}/organizations/create`,
                body: { name: draftOrgName || 'Acme Inc', description: `${draftOrgName || 'Acme Inc'} workspace`, defaultRoleForMembers: ['user'], createdFrom: 1 },
              },
              { res: true, text: '{ isSuccess, itemId }' },
            ]}
            sdk={'await construct.tenant.create(name);\nawait construct.tenant.switch(orgId);'}
            note={
              <>
                Creating a tenant mints an isolated logical partition. Every subsequent read is keyed by the active org id, so
                data, users, roles, files and notifications are hard-isolated between customers with one codebase. The header{' '}
                <code>--org</code> switch and this list drive the <b>same</b> active-org state.
              </>
            }
          />
        </div>

        {/* Users CRUD */}
        <div className="cx-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="cx-panel-title">users · crud</div>
              <div className="cx-panel-desc" style={{ marginBottom: 0 }}>
                Select a user to manage roles &amp; permissions →
              </div>
            </div>
            <span className="count-pill">{users.length} rows</span>
          </div>
          <div className="user-list cx-scroll">
            {usersLoading ? (
              <div className="cx-state">loading users…</div>
            ) : users.length === 0 ? (
              <div className="cx-state">no users in this org</div>
            ) : (
              users.map((u) => (
                <div
                  key={u.itemId}
                  className={`user-row${u.itemId === selectedUserId ? ' sel' : ''}`}
                  onClick={() => setSelectedUserId(u.itemId)}
                >
                  <span className="user-avatar">{initials(userName(u), u.email)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="user-name">{userName(u)}</div>
                    <div className="user-email">{u.email}</div>
                  </div>
                  <span className="role-chip">{u.roles?.[0] || 'member'}</span>
                  <button type="button" className="del-btn" title="deactivate" onClick={(e) => handleDeleteUser(e, u.itemId)}>
                    <X size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="inline-form">
            <input className="cx-input" placeholder="full name" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
            <input className="cx-input" placeholder="email" value={draftEmail} onChange={(e) => setDraftEmail(e.target.value)} />
            <button type="button" className="cx-btn green" disabled={busy === 'user'} onClick={handleAddUser}>
              {busy === 'user' ? '…' : '+ add'}
            </button>
          </div>
          <ApiTrace
            calls={[
              {
                method: 'POST',
                label: 'list',
                url: `${iamBaseUrl}/users`,
                body: { page: 0, pageSize: 50, sort: { property: 'email', isDescending: false }, filter: { org_id: activeOrgId, name: '', email: '', userIds: [] } },
              },
              {
                method: 'POST',
                label: 'create',
                url: `${iamBaseUrl}/users/create`,
                body: { email: 'ada@example.com', userName: 'ada@example.com', organizationId: activeOrgId, userPassType: 1, userCreationType: 1 },
              },
              { method: 'POST', label: 'deactivate', url: `${iamBaseUrl}/users/deactivate`, body: { userId: '<id>' } },
            ]}
            sdk={'const users = await construct.iam.users.list();'}
            note={
              <>
                User list is scoped by <code>filter.org_id</code>; create posts to <code>/users/create</code> (empty password =
                invite-and-activate email). There is no hard delete — the ✕ calls <code>/users/deactivate</code>, which disables
                the account.
              </>
            }
          />
        </div>

        {/* Roles & permissions */}
        <div className="cx-panel">
          <div className="cx-panel-title">roles · permissions</div>
          <div className="cx-panel-desc">Assigned to the selected user; resolves per organization.</div>

          {selectedUser ? (
            <div>
              <div className="sel-user-head">
                <span className="cx-avatar grad md">{initials(userName(selectedUser), selectedUser.email)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--sans)', fontSize: 13.5, fontWeight: 600, color: 'var(--head)' }}>
                    {userName(selectedUser)}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--dim)' }}>{selectedUser.email}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
                <span className="cx-section-label">role</span>
                <select
                  className="cx-select"
                  style={{ flex: 1, color: 'var(--amber)' }}
                  value={currentRoleSlug}
                  disabled={accessLoading}
                  onChange={(e) => handleRoleChange(e.target.value)}
                >
                  <option value="">{accessLoading ? 'loading…' : '— no role —'}</option>
                  {roles.map((r) => (
                    <option key={r.slug || r.itemId} value={r.slug}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 0 8px' }}>
                <span className="cx-section-label">permissions</span>
                <span
                  className="src-tag"
                  style={{ color: hasOverride ? 'var(--cyan)' : 'var(--dim2)', border: `1px solid ${hasOverride ? 'var(--cyan)' : 'var(--dim2)'}` }}
                >
                  {hasOverride ? 'custom override' : 'role default'}
                </span>
              </div>

              {accessLoading ? (
                <div className="cx-state">loading access…</div>
              ) : (
                <div className="perm-grid cx-scroll" style={{ maxHeight: 200, overflow: 'auto' }}>
                  {(perms.length ? perms.map((p) => p.name) : access?.permissions || []).map((permName) => {
                    const on = access?.permissions?.includes(permName);
                    return (
                      <label key={permName} className={`perm-cell${on ? ' on' : ''}`}>
                        <input type="checkbox" checked={!!on} onChange={() => handlePermToggle(permName)} />
                        {permName}
                      </label>
                    );
                  })}
                  {perms.length === 0 && (access?.permissions?.length || 0) === 0 ? (
                    <div className="cx-state" style={{ gridColumn: '1 / -1' }}>
                      no permissions catalog available for this org
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <div className="cx-state">select a user to view access</div>
          )}

          <ApiTrace
            calls={[
              { method: 'GET', label: 'access', url: `${iamBaseUrl}/users/${selectedUserId || ':id'}`, note: '→ { roles[], permissions[] }' },
              { method: 'POST', label: 'roles', url: `${iamBaseUrl}/roles`, body: { page: 0, pageSize: 50, filter: { search: '', slugs: [] } }, note: '→ role catalog' },
              {
                method: 'POST',
                label: 'assign',
                url: `${iamBaseUrl}/users/roles-and-permissions`,
                body: { userId: selectedUserId || '<id>', roles: access?.roles || [], permissions: access?.permissions || [] },
              },
            ]}
            sdk={"await construct.iam.users.setRole(userId, 'admin');"}
            note={
              <>
                Reading a user returns their merged <code>roles[]</code> + <code>permissions[]</code>. Picking a role or ticking a
                permission writes the full set back via <code>/users/roles-and-permissions</code> (idempotent replace). The same
                identity can carry different access in each org.
              </>
            }
          />
        </div>
      </div>

      {error ? <div className="cx-msg error">{error}</div> : null}
    </ServiceCard>
  );
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < (s || '').length; i += 1) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

/* ============================================================
   Data Gateway card
   ============================================================ */
// Platform-managed fields present on every entity — never user-editable on insert.
const SYSTEM_FIELDS = new Set(
  ['ItemId', 'CreatedDate', 'LastUpdatedDate', 'CreatedBy', 'LastUpdatedBy', 'Language', 'OrganizationId', 'Tags', 'IsDeleted', 'DeletedDate'].map(
    (s) => s.toLowerCase(),
  ),
);

function inputTypeFor(fieldType) {
  const t = (fieldType || '').toLowerCase();
  if (['int', 'long', 'integer'].includes(t)) return 'int';
  if (['float', 'double', 'decimal'].includes(t)) return 'float';
  if (t === 'boolean' || t === 'bool') return 'bool';
  if (t === 'datetime' || t === 'date') return 'datetime';
  return 'text';
}

function DataGatewayCard({ open, onToggle }) {
  const [schemas, setSchemas] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const schema = schemas.find((s) => s.schemaName === selected);

  useEffect(() => {
    if (!open || status !== 'loading') return undefined;
    const c = new AbortController();
    listSchemas(c.signal)
      .then((items) => {
        setSchemas(items);
        setStatus('ready');
        if (items[0]) setSelected(items[0].schemaName);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
        setStatus('error');
      });
    return () => c.abort();
  }, [open, status]);

  const loadRows = useCallback(() => {
    if (!schema) return undefined;
    setRowsLoading(true);
    setRowsError('');
    gqlQuery(schema)
      .then((res) => setRows(res.items || []))
      .catch((err) => {
        setRows([]);
        setRowsError(err.message || 'query failed');
      })
      .finally(() => setRowsLoading(false));
    return undefined;
  }, [schema]);

  useEffect(() => {
    if (schema) loadRows();
  }, [schema, loadRows]);

  const columns = schema ? selectedFieldNames(schema) : [];

  return (
    <ServiceCard
      dotColor="var(--cyan)"
      name="DATA GATEWAY"
      sub="tables · read/write"
      open={open}
      onToggle={onToggle}
      cmd={
        <>
          <span className="p">$</span> construct.data.table(<span className="arg">"{selected || '…'}"</span>).select()
        </>
      }
    >
      {status === 'loading' ? <div className="cx-state">discovering schemas…</div> : null}
      {status === 'error' ? <div className="cx-msg error">Could not load schemas: {error}</div> : null}
      {status === 'ready' ? (
        <>
          <div className="tab-row">
            {schemas.map((s) => (
              <button
                key={s.schemaName}
                type="button"
                className={`tab-btn${s.schemaName === selected ? ' active' : ''}`}
                onClick={() => setSelected(s.schemaName)}
              >
                {s.querySchema?.toLowerCase() || s.schemaName}
              </button>
            ))}
            {schemas.length === 0 ? <span className="cx-state">no tables configured</span> : null}
            <button type="button" className="cx-btn green" style={{ marginLeft: 'auto' }} disabled={!schema} onClick={() => setModalOpen(true)}>
              + insert row
            </button>
          </div>

          {rowsError ? (
            <div className="cx-msg error" style={{ whiteSpace: 'normal' }}>
              <div>Query failed: {rowsError}</div>
              <pre className="cx-pre cx-scroll" style={{ marginTop: 8 }}>{schema ? buildSelectQuery(schema) : ''}</pre>
            </div>
          ) : null}

          <div className="cx-table-wrap cx-scroll">
            <table className="cx-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsLoading ? (
                  <tr>
                    <td colSpan={columns.length || 1}>loading rows…</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length || 1}>no rows</td>
                  </tr>
                ) : (
                  rows.map((row, i) => (
                    <tr key={row.ItemId || i}>
                      {columns.map((c) => (
                        <td key={c}>{formatCell(row[c])}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <ApiTrace
        calls={[
          { method: 'GET', label: 'schemas', url: `${schemasUrl}?ProjectKey=…&PageNo=1&PageSize=100`, note: '→ tables + fields' },
          {
            method: 'POST',
            label: 'query',
            url: dataGatewayUrl,
            body: { query: schema ? buildSelectQuery(schema) : 'query{ getTables }' },
          },
          {
            method: 'POST',
            label: 'insert',
            url: dataGatewayUrl,
            body: { query: schema ? `mutation($input: ${schema.schemaName}InsertInput!){ ${insertMutationName(schema)}(input:$input){ itemId } }` : 'mutation{ insertRow }', variables: { input: {} } },
          },
        ]}
        sdk={`const rows = await construct.data.table('${selected || 'table'}').select();`}
        note={
          <>
            Tables are defined visually in the console; the gateway auto-generates a typed GraphQL interface. Operation names come
            from each schema's <code>querySchema</code>/<code>mutationSchemas</code> — never hand-derived. Insert Row builds a{' '}
            <code>{schema ? `${schema.schemaName}InsertInput` : 'SchemaInsertInput'}</code> from the schema's field types.
          </>
        }
      />

      {modalOpen && schema ? (
        <InsertRowModal
          schema={schema}
          onClose={() => setModalOpen(false)}
          onInserted={() => {
            setModalOpen(false);
            loadRows();
          }}
        />
      ) : null}
    </ServiceCard>
  );
}

function formatCell(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function InsertRowModal({ schema, onClose, onInserted }) {
  const fields = (schema.fields || []).filter((f) => !f.isSystem && !SYSTEM_FIELDS.has((f.name || '').toLowerCase()));
  const [form, setForm] = useState(() =>
    Object.fromEntries(fields.map((f) => [f.name, inputTypeFor(f.type) === 'bool' ? false : ''])),
  );
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  function setValue(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  function buildInput() {
    const input = {};
    for (const f of fields) {
      const raw = form[f.name];
      const kind = inputTypeFor(f.type);
      if (kind === 'bool') {
        input[f.name] = !!raw;
        continue;
      }
      if (raw === '' || raw === null || raw === undefined) continue;
      let val = raw;
      if (kind === 'int') val = parseInt(raw, 10);
      else if (kind === 'float') val = Number(raw);
      if (f.isArray) val = String(raw).split(',').map((x) => x.trim()).filter(Boolean);
      input[f.name] = val;
    }
    return input;
  }

  async function submit(e) {
    e.preventDefault();
    setStatus('saving');
    setError('');
    try {
      await gqlInsert(schema, buildInput());
      onInserted();
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  return createPortal(
    <div className="cx-modal-backdrop" onMouseDown={onClose}>
      <div className="cx-modal cx-scroll" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cx-modal-head">
          <span className="cx-modal-title">insert row → {schema.querySchema?.toLowerCase() || schema.schemaName}</span>
          <button type="button" className="cx-iconbtn sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="cx-modal-body">
            {fields.length === 0 ? <div className="cx-state">this schema exposes no writable fields</div> : null}
            {fields.map((f) => {
              const kind = inputTypeFor(f.type);
              const label = (
                <span className="cx-field-label">
                  {f.name} <span className="muted">// {f.type}{f.isArray ? '[]' : ''}</span>
                </span>
              );
              if (kind === 'bool') {
                return (
                  <label key={f.name} className="cx-inline-toggle" style={{ marginTop: 0 }}>
                    <input type="checkbox" checked={!!form[f.name]} onChange={(e) => setValue(f.name, e.target.checked)} style={{ accentColor: 'var(--grn)' }} />
                    {label}
                  </label>
                );
              }
              return (
                <div className="cx-field" key={f.name}>
                  {label}
                  <input
                    className="cx-input"
                    type={kind === 'int' || kind === 'float' ? 'number' : kind === 'datetime' ? 'datetime-local' : 'text'}
                    step={kind === 'float' ? 'any' : kind === 'int' ? '1' : undefined}
                    placeholder={f.isArray ? 'comma,separated,values' : f.type}
                    value={form[f.name]}
                    onChange={(e) => setValue(f.name, e.target.value)}
                  />
                </div>
              );
            })}
            {error ? <div className="cx-msg error">{error}</div> : null}
          </div>
          <div className="cx-modal-foot">
            <button type="button" className="cx-btn" onClick={onClose}>
              cancel
            </button>
            <button type="submit" className="cx-btn green lg" disabled={status === 'saving'}>
              {status === 'saving' ? 'inserting…' : '▶ insert row'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

/* ============================================================
   Storage card
   ============================================================ */
function providerLabel(strategy) {
  const s = (strategy || '').toLowerCase();
  if (s.includes('azure')) return 'azure blob';
  if (s.includes('s3') || s.includes('aws')) return 'aws s3';
  return strategy || 'default';
}

function StorageCard({ open, onToggle }) {
  const [providers, setProviders] = useState([{ name: 'Default', strategy: 'Default' }]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState('');
  const fileInputRef = useRef(null);

  const activeProvider = providers[activeIdx] || providers[0];

  useEffect(() => {
    if (!open) return undefined;
    const c = new AbortController();
    listStorageConfigs(c.signal).then((configs) => {
      if (configs.length) {
        setProviders(configs.map((cfg) => ({ name: cfg.name || 'Default', strategy: cfg.storageStrategy || 'Default' })));
      }
    });
    return () => c.abort();
  }, [open]);

  const loadFiles = useCallback(() => {
    const c = new AbortController();
    setStatus('loading');
    fetchStorageFiles(c.signal)
      .then((items) => {
        setFiles(items);
        setStatus('ready');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
        setStatus('error');
      });
    return () => c.abort();
  }, []);

  useEffect(() => {
    if (open && status === 'idle') loadFiles();
  }, [open, status, loadFiles]);

  async function handleUpload() {
    fileInputRef.current?.click();
  }

  async function onFileChosen(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      await uploadFile(file, activeProvider.name);
      loadFiles();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function openFile(fileId) {
    if (!fileId) return;
    setOpeningId(fileId);
    try {
      const url = await getStorageFileUrl(fileId, activeProvider.name);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      /* ignore */
    } finally {
      setOpeningId('');
    }
  }

  return (
    <ServiceCard
      dotColor="var(--violet)"
      name="STORAGE"
      sub="azure / aws · files"
      open={open}
      onToggle={onToggle}
      cmd={
        <>
          <span className="p">$</span> construct.storage.list(<span className="arg">"user-uploads"</span>) --provider=
          <span className="arg">{providerLabel(activeProvider?.strategy)}</span>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--dim)' }}>provider:</span>
        <div className="provider-toggle">
          {providers.map((p, i) => (
            <button key={p.name + i} type="button" className={i === activeIdx ? 'active' : ''} onClick={() => setActiveIdx(i)}>
              {providerLabel(p.strategy)}
            </button>
          ))}
        </div>
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={onFileChosen} />
        <button type="button" className="cx-btn green" style={{ marginLeft: 'auto' }} disabled={uploading} onClick={handleUpload}>
          <Upload size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          {uploading ? 'uploading…' : 'upload'}
        </button>
      </div>

      {status === 'loading' ? <div className="cx-state">loading files…</div> : null}
      {status === 'error' ? <div className="cx-msg error">Could not load files: {error}</div> : null}
      {status === 'ready' ? (
        <div className="file-list cx-scroll">
          {files.length === 0 ? (
            <div className="cx-state">no files yet</div>
          ) : (
            files.map((f) => {
              const fileId = pickField(f, ['fileId', 'FileId', 'id', 'Id', 'itemId', 'ItemId']);
              const name = pickField(f, ['name', 'Name', 'fileName', 'FileName']) || 'untitled';
              const size = pickField(f, ['sizeInBytes', 'SizeInBytes', 'size', 'Size']);
              const ext = (name.split('.').pop() || 'bin').slice(0, 4).toUpperCase();
              return (
                <div className="file-row" key={fileId || name}>
                  <span className="file-ext">{ext}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="file-name">{name}</div>
                    <div className="file-meta">
                      {formatFileSize(size)} · {providerLabel(activeProvider?.strategy)}
                    </div>
                  </div>
                  <button type="button" className="file-geturl" disabled={openingId === fileId} onClick={() => openFile(fileId)}>
                    {openingId === fileId ? 'opening…' : 'get_url →'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {error && status === 'ready' ? <div className="cx-msg error">{error}</div> : null}

      <ApiTrace
        calls={[
          { method: 'GET', label: 'configs', url: storageConfigsUrl, note: '→ configs (provider)' },
          {
            method: 'POST',
            label: 'presign',
            url: filesPresignUrl,
            body: { name: 'file.ext', accessModifier: 'Public', projectKey, moduleName: 3, configurationName: activeProvider?.name || 'Default' },
            note: '→ { uploadUrl, fileId }',
          },
          { method: 'PUT', url: '<signed url>', noCopy: true, note: '(raw bytes)' },
          { method: 'GET', label: 'file-url', url: `${fileGetUrl}?FileId=…&ConfigurationName=${activeProvider?.name || 'Default'}`, note: '→ signed download url' },
        ]}
        sdk={"const { id } = await construct.storage.upload(file, { bucket: 'user-uploads' });"}
        note={
          <>
            Provider (Azure Blob / AWS S3) is a <code>configurationName</code> resolved from{' '}
            <code>/logic/v4/Storage/Gets</code> (each config's <code>storageStrategy</code> is the backend). The SDK call is
            identical for both — upload is a two-step presign → PUT, and get_url signs a short-lived download URL. Switching cloud
            never touches consumer code.
          </>
        }
      />
    </ServiceCard>
  );
}

/* ============================================================
   Notification card (UI only)
   ============================================================ */
function NotificationCard({ open, onToggle, users, onSend }) {
  const [mode, setMode] = useState('user');
  const [recipients, setRecipients] = useState([]);
  const [responseKey, setResponseKey] = useState('ClientCreated');
  const [responseValue, setResponseValue] = useState('Client is created');
  const [payload, setPayload] = useState('');
  const [okCount, setOkCount] = useState(null);

  useEffect(() => {
    setRecipients(users.slice(0, 1).map((u) => u.itemId));
  }, [users]);

  function toggleRecipient(id) {
    setRecipients((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  }

  function userName(u) {
    return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
  }

  function send() {
    const count = mode === 'user' ? recipients.length : users.length;
    onSend({ mode, title: responseKey || 'Notification', body: responseValue || '' });
    setOkCount(`${count} ${mode === 'user' ? 'user(s)' : 'members'}`);
    setTimeout(() => setOkCount(null), 3200);
  }

  const modeBtn = (m, label) => (
    <button
      type="button"
      className="cx-btn"
      style={
        mode === m
          ? { borderColor: 'var(--grn-dim)', background: 'rgba(63,185,80,.12)', color: 'var(--grn)', fontWeight: 600 }
          : undefined
      }
      onClick={() => setMode(m)}
    >
      {label}
    </button>
  );

  return (
    <ServiceCard
      dotColor="var(--amber)"
      name="NOTIFICATION"
      sub="user · broadcast"
      open={open}
      onToggle={onToggle}
      cmd={
        <>
          <span className="p">$</span> construct.notifications.send(<span className="arg">payload</span>)
        </>
      }
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <span className="cx-section-label">target</span>
        {modeBtn('user', 'user-specific')}
        {modeBtn('broadcast', 'broadcast')}
      </div>

      <div className="notif-compose">
        {mode === 'user' ? (
          <label>
            <span className="cx-field-label">
              userIds <span className="muted">// recipients</span>
            </span>
            <div className="recipient-list cx-scroll">
              {users.length === 0 ? (
                <div className="cx-state">no users in this org</div>
              ) : (
                users.map((u) => {
                  const on = recipients.includes(u.itemId);
                  return (
                    <label className="recipient-row" key={u.itemId} style={{ background: on ? 'rgba(63,185,80,.07)' : 'transparent' }}>
                      <input type="checkbox" checked={on} onChange={() => toggleRecipient(u.itemId)} />
                      <span className="id">{u.itemId.slice(0, 8)}</span>
                      <span className="nm">· {userName(u)}</span>
                    </label>
                  );
                })
              )}
            </div>
          </label>
        ) : null}

        <label>
          <span className="cx-field-label">responseKey</span>
          <input className="cx-input" value={responseKey} onChange={(e) => setResponseKey(e.target.value)} placeholder="ClientCreated" />
        </label>
        <label>
          <span className="cx-field-label">responseValue</span>
          <input className="cx-input sans" value={responseValue} onChange={(e) => setResponseValue(e.target.value)} placeholder="Client is created" />
        </label>
        <label>
          <span className="cx-field-label">
            denormalizedPayload <span className="muted">// optional json</span>
          </span>
          <textarea className="cx-textarea" rows={2} value={payload} onChange={(e) => setPayload(e.target.value)} placeholder='{ "clientId": "c-1005" }' />
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="cx-btn green lg" onClick={send}>
            ▶ send notification
          </button>
          {okCount ? <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--grn)' }}>✓ 201 · delivered to {okCount}</span> : null}
        </div>
      </div>

      <ApiTrace
        calls={[
          {
            method: 'POST',
            label: 'send',
            url: `${apiBaseUrl}/notifications/send`,
            body: { userIds: mode === 'user' ? recipients : [], denormalizedPayload: payload, responseKey, responseValue },
            note: mode === 'user' ? `→ userIds: ${JSON.stringify(recipients)}` : '→ broadcast (no userIds)',
          },
          { res: true, text: '201 { notificationId, delivered }' },
        ]}
        sdk={'await construct.notifications.send({ userIds, responseKey, responseValue });'}
        note={
          <>
            <b>UI only for now</b> — this composer previews the request shape; sending prepends to the header feed locally. Wiring
            to the live notification service is pending the notification skills. Pass <code>userIds</code> for a targeted send or
            omit to broadcast to the whole tenant; <code>responseKey</code> is the machine event, <code>responseValue</code> the
            human message.
          </>
        }
      />
    </ServiceCard>
  );
}

/* ============================================================
   Console (authenticated)
   ============================================================ */
function Console({ me, theme, onToggleTheme, onSignedOut }) {
  const { i18n } = useTranslation();
  const apiCount = useApiCount();

  const [orgs, setOrgs] = useState([]);
  const [activeOrgId, setActiveOrgId] = useState(() => localStorage.getItem(orgStorageKey) || '');
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [notifs, setNotifs] = useState(SEED_NOTIFS);
  const [lang, setLang] = useState(() => localStorage.getItem(langStorageKey) || 'en');
  const [languages, setLanguages] = useState([]);
  const [open, setOpen] = useState({ iam: true, data: false, storage: false, notif: false });

  const toggle = (k) => setOpen((s) => ({ ...s, [k]: !s[k] }));

  const reloadOrgs = useCallback(async () => {
    const list = await listOrgs().catch(() => []);
    setOrgs(list);
    setActiveOrgId((cur) => {
      if (cur && list.some((o) => o.itemId === cur)) return cur;
      return list[0]?.itemId || '';
    });
    return list;
  }, []);

  useEffect(() => {
    reloadOrgs();
  }, [reloadOrgs]);

  useEffect(() => {
    if (activeOrgId) localStorage.setItem(orgStorageKey, activeOrgId);
  }, [activeOrgId]);

  const reloadUsers = useCallback(async () => {
    if (!activeOrgId) {
      setUsers([]);
      return;
    }
    setUsersLoading(true);
    try {
      const { data } = await listUsers(activeOrgId);
      setUsers(data);
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    reloadUsers();
  }, [reloadUsers]);

  // languages (localization)
  useEffect(() => {
    const c = new AbortController();
    (async () => {
      if (!projectKey) return;
      try {
        const resp = await fetch(
          `${localizationBaseUrl}/localization/v4/Language/Gets?ProjectKey=${encodeURIComponent(projectKey)}`,
          { headers: { 'x-blocks-key': projectKey }, signal: c.signal },
        );
        if (!resp.ok) return;
        const payload = await resp.json();
        const arr = Array.isArray(payload) ? payload : payload.items || payload.data || [];
        const mapped = arr
          .map((l) => ({ code: l.languageCode || l.code || l.culture, label: l.languageName || l.name || l.languageCode || l.code }))
          .filter((l) => l.code);
        if (mapped.length) setLanguages(mapped);
      } catch {
        /* ignore */
      }
    })();
    return () => c.abort();
  }, []);

  const handleLangChange = useCallback(
    async (next) => {
      setLang(next);
      localStorage.setItem(langStorageKey, next);
      try {
        await loadLocalizationModule(i18n, next, 'construct');
      } catch {
        /* ignore */
      }
      i18n.changeLanguage(next);
    },
    [i18n],
  );

  async function handleLogout() {
    try {
      await oidcLogout();
    } catch {
      /* ignore */
    } finally {
      onSignedOut();
    }
  }

  const activeOrg = orgs.find((o) => o.itemId === activeOrgId);
  const orgSlug = activeOrg ? activeOrg.shortCode || slug(activeOrg.name) || 'org' : 'org';
  const name = me ? [me.firstName, me.lastName].filter(Boolean).join(' ') || me.email : '—';

  const langOptions = languages.length
    ? languages
    : [
        { code: 'en', label: 'en' },
        { code: 'de', label: 'de' },
        { code: 'fr', label: 'fr' },
        { code: 'es', label: 'es' },
      ];

  return (
    <div className="cx-app">
      <ConsoleHeader
        me={me}
        theme={theme}
        onToggleTheme={onToggleTheme}
        orgs={orgs}
        activeOrgId={activeOrgId}
        onOrgChange={setActiveOrgId}
        lang={lang}
        languages={langOptions}
        onLangChange={handleLangChange}
        notifs={notifs}
        onMarkAllRead={() => setNotifs((ns) => ns.map((n) => ({ ...n, read: true })))}
        onLogout={handleLogout}
      />

      <main className="cx-main">
        <div className="cx-hero">
          <div style={{ fontFamily: 'var(--mono)' }}>
            <div className="cx-hero-greeting">
              # welcome back, {name} — session scoped to <span style={{ color: 'var(--grn)' }}>{activeOrg?.name || '—'}</span>
            </div>
            <div className="cx-hero-cmd">
              <span style={{ color: 'var(--grn)' }}>construct@{orgSlug}</span>
              <span style={{ color: 'var(--dim2)' }}>:~$</span> <span style={{ color: 'var(--head)' }}>explore --all-services</span>
              <span className="cx-cursor" />
            </div>
            <div className="cx-hero-desc">
              Each module below is a live slice of the consumer SDK. Run the UI, then open{' '}
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--cyan)' }}>api trace &amp; platform notes</span> to see the exact
              calls and the backend work that powers them.
            </div>
          </div>
          <div className="cx-stats">
            <div className="cx-stat">
              <div className="num" style={{ color: 'var(--grn)' }}>
                {String(users.length).padStart(2, '0')}
              </div>
              <div className="lbl">users · {orgSlug}</div>
            </div>
            <div className="cx-stat">
              <div className="num" style={{ color: 'var(--grn)' }}>
                {apiCount}
              </div>
              <div className="lbl">api calls · 200</div>
            </div>
          </div>
        </div>

        <div className="cx-grid">
          <IamCard
            open={open.iam}
            onToggle={() => toggle('iam')}
            activeOrgId={activeOrgId}
            orgs={orgs}
            users={users}
            usersLoading={usersLoading}
            reloadUsers={reloadUsers}
            reloadOrgs={reloadOrgs}
            onOrgChange={setActiveOrgId}
          />
          <DataGatewayCard open={open.data} onToggle={() => toggle('data')} />
          <StorageCard open={open.storage} onToggle={() => toggle('storage')} />
          <NotificationCard
            open={open.notif}
            onToggle={() => toggle('notif')}
            users={users}
            onSend={({ mode, title, body }) =>
              setNotifs((ns) => [{ id: `s${Date.now()}`, mode, title, body, time: 'now', read: false }, ...ns])
            }
          />
        </div>

        <footer className="cx-footer">
          # construct console — reference consumer app · built on the construct cloud platform sdk · exit 0
        </footer>
      </main>
    </div>
  );
}

/* ============================================================
   Root gate + App
   ============================================================ */
function RootGate({ theme, onToggleTheme }) {
  const [me, setMe] = useState(null);
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    const c = new AbortController();
    getMe(c.signal)
      .then((u) => {
        setMe(u);
        setStatus('authed');
      })
      .catch(() => setStatus('anon'));
    return () => c.abort();
  }, []);

  if (status === 'checking') {
    return (
      <div className="cx-app">
        <div className="cx-center-page">
          <div className="cx-spinner" />
          <p>connecting to construct…</p>
        </div>
      </div>
    );
  }

  if (status === 'authed') {
    return <Console me={me} theme={theme} onToggleTheme={onToggleTheme} onSignedOut={() => setStatus('anon')} />;
  }

  return <LoginGate theme={theme} onToggleTheme={onToggleTheme} />;
}

function App() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(themeStorageKey);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootGate theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/callback" element={<AuthCallbackPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/activate" element={<ActivationPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
