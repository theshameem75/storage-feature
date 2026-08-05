# DMS (Document Management System) — Client Spec

> Status: **spec only** — no implementation yet. This document is the contract the planned `DmsCard` component and its supporting modules will follow.

> Adopts the conventions of the existing Construct Console codebase: functional React + hooks, no TypeScript, `iamFetch` via `credentials: 'include'` + `x-blocks-key`, hand-written CSS using the `cx-*` classes, `lucide-react` icons, `i18next` namespaces, and the `apiBus` counter for telemetry.

---

## 1. Scope

Add a **fifth service card** to the existing `Console` view that exposes the platform's Document Management System APIs:

- **Directories** — root/child folders, browse, rename, move, delete
- **Files** — upload (presigned), download, list, version history, copy, move, delete
- **Content** — search, trash + restore, access policies + sharing

The card must follow the same UX pattern as `IamCard`, `DataGatewayCard`, `StorageCard`, `NotificationCard`:
- Collapsible header (`ServiceCard`)
- Live, interactive controls
- Embedded `ApiTrace` panel showing the underlying HTTP calls (cURL chips + JSON)
- Pseudo-SDK narration in the UI (`construct.dms.folders.create(...)`, etc.) — actual calls go through the new client module

Out of scope for this iteration:
- Drag-and-drop file upload (keep `<input type="file">` + a future drop zone)
- Real-time collaboration / presence
- Full-text search indexing UI (the API is `SearchContent` passthrough)
- External share link generation (`ShareContent` is wired but the URL is just displayed)

---

## 2. New Files

```
src/
├── services/
│   └── dms.js                    # all DMS API calls (no React)
├── components/
│   └── DmsCard.jsx               # the new service card
└── styles.css                    # append ~150 lines of `cx-dms-*` rules

docs/
└── dms-spec.md                   # this file
```

`src/main.jsx` gets two surgical changes:
1. Imports `DmsCard` and mounts it inside the existing service-cards grid (after `NotificationCard`).
2. No change to the export surface — `DmsCard` is self-contained.

---

## 3. Endpoint Map

All endpoints are derived from `/api/...` paths in the source spec. They are prefixed with `${apiBaseUrl}/` and filed under three new helpers below.

### 3.1 Endpoints used

| Helper | Method | Path | Notes |
|---|---|---|---|
| `createRootDirectory` | POST | `/api/Directories/CreateRootDirectory` | body: `{ name, ... }` |
| `createDirectory` | POST | `/api/Directories/CreateDirectory` | body: `{ parentDirectoryId, name, ... }` |
| `getDirectory` | GET | `/api/Directories/GetDirectory?directoryId=` | returns `{ directoryId, name, parentDirectoryId, ... }` |
| `getDirectoryChildren` | GET | `/api/Directories/GetDirectoryChildren?DirectoryId=&Cursor=&Limit=&Type=&Search=` | paginated items `{ items, cursor, totalCount }` |
| `updateDirectory` | POST | `/api/Directories/UpdateDirectory` | body: `{ directoryId, name, ... }` |
| `moveDirectory` | POST | `/api/Directories/MoveDirectory` | body: `{ directoryId, newParentDirectoryId }` |
| `deleteDirectory` | POST | `/api/Directories/DeleteDirectory` | body: `{ directoryId }` (trash) |
| `getFile` | GET | `/api/Files/GetFile?FileId=&Version=&ConfigurationName=` | returns signed download URL |
| `getFiles` | POST | `/api/Files/GetFiles` | body: `{ fileIds: [...] }` |
| `getFilesInfo` | POST | `/api/Files/GetFilesInfo` | body: `{ fileIds: [...] }` |
| `getPresignedUrlForUpload` | POST | `/api/Files/GetPreSignedUrlForUpload` | body: `{ fileName, parentDirectoryId, configurationName, ... }` → `{ uploadUrl, fileId }` |
| `uploadFileToLocalStorage` | POST | `/api/Files/UploadFileToLocalStorage` | body: `{ fileId, ... }` (per backend) |
| `updateFileAdditionalInfo` | POST | `/api/Files/UpdateFileAdditionalInfo` | body: `{ fileId, metadata }` |
| `deleteFile` | POST | `/api/Files/DeleteFile` | body: `{ fileId }` |
| `getFileVersions` | GET | `/api/Files/GetFileVersions?FileId=&Cursor=&Limit=` | `{ items, cursor }` |
| `createFileVersion` | POST | `/api/Files/CreateFileVersion` | body: `{ fileId, ... }` |
| `copyFile` | POST | `/api/Files/CopyFile` | body: `{ fileId, targetDirectoryId }` |
| `moveFile` | POST | `/api/Files/MoveFile` | body: `{ fileId, targetDirectoryId }` |
| `searchContent` | GET | `/api/Content/SearchContent?Query=&DirectoryId=&Cursor=&Limit=&Type=` | mixed dirs+files |
| `getTrash` | GET | `/api/Content/GetTrash?Cursor=&Limit=&Type=` | trash listing |
| `restoreFromTrash` | POST | `/api/Content/RestoreFromTrash` | body: `{ id, type }` |
| `deleteFromTrash` | POST | `/api/Content/DeleteFromTrash` | body: `{ id, type }` |
| `getAccessPolicies` | GET | `/api/Content/GetAccessPolicies?ResourceId=&IncludeInherited=` | array of policies |
| `grantAccess` | POST | `/api/Content/GrantAccess` | body: `{ resourceId, principalId, permissions[] }` |
| `updateAccessPolicy` | POST | `/api/Content/UpdateAccessPolicy` | body: `{ policyId, ... }` |
| `revokeAccessPolicy` | POST | `/api/Content/RevokeAccessPolicy` | body: `{ policyId }` |
| `resolveAccess` | GET | `/api/Content/ResolveAccess?resourceId=` | effective permissions |
| `toggleInheritance` | POST | `/api/Content/ToggleInheritance` | body: `{ resourceId, inherit }` |
| `shareContent` | POST | `/api/Content/ShareContent` | body: `{ resourceId, ... }` |

### 3.2 URL constants

Added to the top of `src/services/dms.js` (mirrors the existing `apiBaseUrl` origin in `main.jsx` — import it or duplicate the same regex):

```js
const dmsApiBase = `${apiBaseUrl}/api`;
const dirsBase = `${dmsApiBase}/Directories`;
const dmsFilesBase = `${dmsApiBase}/Files`;
const contentBase = `${dmsApiBase}/Content`;

const urls = {
  createRootDirectory: `${dirsBase}/CreateRootDirectory`,
  createDirectory: `${dirsBase}/CreateDirectory`,
  getDirectory: `${dirsBase}/GetDirectory`,
  getDirectoryChildren: `${dirsBase}/GetDirectoryChildren`,
  updateDirectory: `${dirsBase}/UpdateDirectory`,
  moveDirectory: `${dirsBase}/MoveDirectory`,
  deleteDirectory: `${dirsBase}/DeleteDirectory`,

  getFile: `${dmsFilesBase}/GetFile`,
  getFiles: `${dmsFilesBase}/GetFiles`,
  getFilesInfo: `${dmsFilesBase}/GetFilesInfo`,
  getPresignedUrlForUpload: `${dmsFilesBase}/GetPreSignedUrlForUpload`,
  uploadFileToLocalStorage: `${dmsFilesBase}/UploadFileToLocalStorage`,
  updateFileAdditionalInfo: `${dmsFilesBase}/UpdateFileAdditionalInfo`,
  deleteFile: `${dmsFilesBase}/DeleteFile`,
  getFileVersions: `${dmsFilesBase}/GetFileVersions`,
  createFileVersion: `${dmsFilesBase}/CreateFileVersion`,
  copyFile: `${dmsFilesBase}/CopyFile`,
  moveFile: `${dmsFilesBase}/MoveFile`,

  searchContent: `${contentBase}/SearchContent`,
  getTrash: `${contentBase}/GetTrash`,
  restoreFromTrash: `${contentBase}/RestoreFromTrash`,
  deleteFromTrash: `${contentBase}/DeleteFromTrash`,
  getAccessPolicies: `${contentBase}/GetAccessPolicies`,
  grantAccess: `${contentBase}/GrantAccess`,
  updateAccessPolicy: `${contentBase}/UpdateAccessPolicy`,
  revokeAccessPolicy: `${contentBase}/RevokeAccessPolicy`,
  resolveAccess: `${contentBase}/ResolveAccess`,
  toggleInheritance: `${contentBase}/ToggleInheritance`,
  shareContent: `${contentBase}/ShareContent`,
};
```

---

## 4. Service module — `src/services/dms.js`

### 4.1 Design rules (matching existing code)

- Pure JS, no React imports.
- All helpers are `async function` returning the parsed JSON body.
- Every call routes through `iamFetch` (re-imported from where the existing `iamFetch` lives — see §4.4).
- Each helper builds a `bumpApi` trace entry with `{ method, url, body, fileId? }`.
- Errors: throw a normalized `Error` with the backend message attached (`throw new Error(message || statusText)`).
- File-helper `uploadFile` is the only function that does a **second** raw `fetch` to the presigned URL (no `iamFetch`, no `x-blocks-key`, no `credentials`) — same pattern as the existing `uploadFile` in `main.jsx`.

### 4.2 Function signatures

```js
// Directories
export async function createRootDirectory({ name }) -> Directory
export async function createDirectory({ parentDirectoryId, name }) -> Directory
export async function getDirectory({ directoryId }) -> Directory
export async function getDirectoryChildren({ directoryId, cursor, limit, type, search }) -> { items, cursor, totalCount }
export async function updateDirectory({ directoryId, name }) -> Directory
export async function moveDirectory({ directoryId, newParentDirectoryId }) -> Directory
export async function deleteDirectory({ directoryId }) -> { directoryId }

// Files
export async function getFile({ fileId, version, configurationName }) -> { url | blob }
export async function getFiles({ fileIds }) -> File[]
export async function getFilesInfo({ fileIds }) -> File[]
export async function getPresignedUrlForUpload({ fileName, parentDirectoryId, configurationName }) -> { uploadUrl, fileId }
export async function uploadFileToLocalStorage({ fileId, ... }) -> File
export async function updateFileAdditionalInfo({ fileId, metadata }) -> File
export async function deleteFile({ fileId }) -> { fileId }
export async function getFileVersions({ fileId, cursor, limit }) -> { items, cursor }
export async function createFileVersion({ fileId }) -> File
export async function copyFile({ fileId, targetDirectoryId }) -> File
export async function moveFile({ fileId, targetDirectoryId }) -> File

// Content
export async function searchContent({ query, directoryId, cursor, limit, type }) -> { items, cursor, totalCount }
export async function getTrash({ cursor, limit, type }) -> { items, cursor, totalCount }
export async function restoreFromTrash({ id, type }) -> { id, type }
export async function deleteFromTrash({ id, type }) -> { id, type }
export async function getAccessPolicies({ resourceId, includeInherited }) -> AccessPolicy[]
export async function grantAccess({ resourceId, principalId, permissions }) -> AccessPolicy
export async function updateAccessPolicy({ policyId, ... }) -> AccessPolicy
export async function revokeAccessPolicy({ policyId }) -> { policyId }
export async function resolveAccess({ resourceId }) -> Permission[]
export async function toggleInheritance({ resourceId, inherit }) -> { resourceId, inherit }
export async function shareContent({ resourceId, ... }) -> { shareUrl, ... }
```

### 4.3 Upload flow (the documented two-step pattern)

```js
export async function uploadFile({ file, parentDirectoryId, configurationName, onProgress }) {
  const { uploadUrl, fileId } = await getPresignedUrlForUpload({
    fileName: file.name,
    parentDirectoryId,
    configurationName,
  });

  // PUT raw bytes to the presigned URL (no iamFetch, no credentials)
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });

  // Optional confirmation call
  try {
    await uploadFileToLocalStorage({ fileId });
  } catch (e) {
    // Non-fatal — backend may not require this step; log to apiBus.
  }
  return { fileId, fileName: file.name };
}
```

`onProgress` is wired through `XMLHttpRequest` if `fetch` progress is required (replace the inner `fetch` with an XHR when `onProgress` is provided). Documented here for parity with the existing `StorageCard` upload.

### 4.4 Reusing `iamFetch`

The existing `iamFetch` lives inside `src/main.jsx` and is **not currently exported**. To use it from `dms.js`, do one of:

- **(preferred, minimal)** Export `iamFetch` from `main.jsx`. Because `main.jsx` is mounted as a side-effect entry, exports are still readable at runtime; this is the smallest patch.
- **(clean, future-proof)** Extract `iamFetch`, `commonHeaders`, `readJsonMaybe`, and `bumpApi` into a new `src/services/api.js` and have both `main.jsx` and `dms.js` import from it. Recommended in the same PR if the team is willing to touch `main.jsx`.

This spec assumes option (preferred) for now; the refactor is called out as a follow-up.

### 4.5 Trace helpers

`dms.js` exposes a small trace helper so the UI can show the same cURL chips already used in `ApiTrace`:

```js
export function dmsTraceToCurl({ method, url, body }) {
  // mirror the existing `toCurl` shape in main.jsx (curl -X METHOD -H 'x-blocks-key: …' -H 'Content-Type: application/json' [--data '…'] URL)
}
```

If `toCurl` in `main.jsx` is exported, reuse it instead of duplicating.

---

## 5. Component — `src/components/DmsCard.jsx`

### 5.1 Props

```jsx
<DmsCard calls={calls} setCalls={setCalls} activeOrgId={activeOrgId} />
```

- `calls` / `setCalls` — same shape `ApiTrace` accepts in the existing cards; passed down from `Console`.
- `activeOrgId` — gates calls (DMS queries are org-scoped; the header already owns an active org).

### 5.2 Internal state

```js
const [currentDirId, setCurrentDirId] = useState(null);
const [breadcrumbs, setBreadcrumbs] = useState([]); // [{ id, name }, ...]
const [children, setChildren] = useState([]);      // mixed dirs & files
const [cursor, setCursor] = useState(null);
const [busy, setBusy] = useState(false);
const [search, setSearch] = useState('');
const [tab, setTab] = useState('browse');          // 'browse' | 'search' | 'trash' | 'sharing'
const [selectedResource, setSelectedResource] = useState(null); // for sharing tab
const [policies, setPolicies] = useState([]);
const [pendingAction, setPendingAction] = useState(null); // 'newFolder' | 'rename' | 'move' | 'upload' | 'share' | null
const [uploadFile, setUploadFile] = useState(null);
```

### 5.3 Layout

Inside the existing `ServiceCard`:

```
┌─ DmsCard ───────────────────────────────────────────────────────────┐
│  Filters: [ search input ]  [tab: browse / search / trash / share] │
│  Breadcrumb: root / folder-a / folder-b                             │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  📁  Folder A            [rename] [move] [delete]            │    │
│  │  📁  Folder B            [rename] [move] [delete]            │    │
│  │  📄  report.pdf  12 KB  [download] [versions] [copy] [move]  │    │
│  │  📄  data.csv   4 KB   [download] [versions] [copy] [move]   │    │
│  └──────────────────────────────────────────────────────────────┘    │
│  [ + New folder ]  [ Upload file ]  [ Load more ]                   │
│  ── api trace ──────────────────────────────────────────────────    │
│  curl -X GET '.../GetDirectoryChildren?DirectoryId=…'                │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.4 Tabs

| Tab | Behavior |
|---|---|
| `browse` | Default. Lists children of `currentDirId` via `getDirectoryChildren`.  
| `search` | Calls `searchContent` with `{ query: search, directoryId: currentDirId, type: 'all' }`. Results click → switch to `browse` and navigate. |
| `trash` | Calls `getTrash`; per row: `RestoreFromTrash` / `DeleteFromTrash`. |
| `sharing` | When a row is selected: `GetAccessPolicies`, `GrantAccess`, `UpdateAccessPolicy`, `RevokeAccessPolicy`, `ResolveAccess`, `ToggleInheritance`, `ShareContent`. Per-row "Share" button also available inline. |

### 5.5 Action confirmations

`pendingAction` drives a small modal (use `createPortal` like the existing `InsertRowModal`):

- `newFolder` — name input → `createDirectory`
- `rename` — current name → `updateDirectory` or `updateFileAdditionalInfo`
- `move` — destination directory picker → `moveDirectory` / `moveFile`
- `upload` — file picker → `uploadFile`
- `share` — principal id + permission checkboxes → `grantAccess`

### 5.6 Pseudo-SDK narration

Side panel text (matches existing card style):

```
construct.dms.folders.create({ parentDirectoryId, name })
construct.dms.files.upload({ file, parentDirectoryId })
construct.dms.sharing.grant({ resourceId, principalId, permissions })
construct.dms.trash.restore({ id, type })
```

These are rendered as muted monospace text under the action area; the actual call goes to `dms.js`.

### 5.7 i18n keys

Add to the `construct` namespace (and the UILM export if extending the platform's localization module):

```
dms.title
dms.card.subtitle
dms.tab.browse
dms.tab.search
dms.tab.trash
dms.tab.sharing
dms.action.newFolder
dms.action.upload
dms.action.download
dms.action.rename
dms.action.move
dms.action.copy
dms.action.delete
dms.action.versions
dms.action.share
dms.action.restore
dms.action.permanentDelete
dms.empty.children
dms.empty.search
dms.empty.trash
dms.modal.newFolder.placeholder
dms.modal.upload.placeholder
dms.modal.share.placeholder
dms.modal.share.principalId
dms.modal.share.permissions
dms.modal.share.inherit
dms.modal.confirm
dms.modal.cancel
dms.toast.created
dms.toast.renamed
dms.toast.moved
dms.toast.deleted
dms.toast.uploaded
dms.toast.downloaded
dms.toast.restored
dms.toast.shared
dms.toast.inheritanceToggled
dms.error.generic
dms.error.noActiveOrg
```

---

## 6. Styling — `src/styles.css` (append)

```css
/* === DMS === */
.cx-dms-toolbar { display: flex; gap: var(--gap-2); align-items: center; flex-wrap: wrap; margin-bottom: var(--gap-2); }
.cx-dms-tabs { display: inline-flex; gap: 0; border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
.cx-dms-tab { padding: 4px 10px; background: transparent; color: var(--dim); cursor: pointer; font: inherit; border: 0; border-right: 1px solid var(--line); }
.cx-dms-tab:last-child { border-right: 0; }
.cx-dms-tab.active { background: var(--grn-dim); color: var(--grn); }
.cx-dms-breadcrumb { font-family: var(--font-mono); color: var(--dim); margin-bottom: var(--gap-2); }
.cx-dms-breadcrumb a { color: var(--cyan); cursor: pointer; text-decoration: none; }
.cx-dms-breadcrumb a + a::before { content: ' / '; color: var(--dim); }
.cx-dms-list { border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
.cx-dms-row { display: grid; grid-template-columns: 1fr auto; gap: var(--gap-2); align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--line); }
.cx-dms-row:last-child { border-bottom: 0; }
.cx-dms-row:hover { background: var(--row-hover); }
.cx-dms-row .cx-icon { color: var(--cyan); }
.cx-dms-name { font-family: var(--font-mono); color: var(--fg); }
.cx-dms-meta { color: var(--dim); font-size: 11px; margin-left: 8px; }
.cx-dms-actions { display: inline-flex; gap: 4px; }
.cx-dms-actions .cx-btn { padding: 2px 6px; font-size: 11px; }
.cx-dms-empty { padding: 20px; text-align: center; color: var(--dim); }
.cx-dms-footer { display: flex; gap: var(--gap-2); margin-top: var(--gap-2); }
.cx-dms-policy { display: flex; gap: var(--gap-2); align-items: center; padding: 4px 0; border-bottom: 1px dashed var(--line); }
.cx-dms-policy:last-child { border-bottom: 0; }
.cx-dms-modal-input { width: 100%; }
.cx-dms-modal-actions { display: flex; gap: var(--gap-2); justify-content: flex-end; margin-top: var(--gap-3); }
.cx-dms-perms { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; }
.cx-dms-perms label { display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 12px; }
```

(The spec assumes the existing CSS variables `--gap-2`, `--gap-3`, `--line`, `--row-hover`, `--fg`, `--dim`, `--cyan`, `--grn`, `--grn-dim`, `--font-mono` already exist or are added in the same PR.)

---

## 7. Wiring into `Console`

In `src/main.jsx`, inside the existing `Console` component, after the `NotificationCard`:

```jsx
import DmsCard from './components/DmsCard';
...
<DmsCard
  calls={consoleCalls}
  setCalls={setConsoleCalls}
  activeOrgId={activeOrgId}
/>
```

The card is self-gated: if `!activeOrgId`, render only the `--guard` empty state (matching the existing pattern in `IamCard`).

---

## 8. Vite dev proxy

The current `vite.config.js` already proxies `/blocks-api` → `blocksapi.dev.slsblx.com`. The DMS endpoints live under `/api/...` of the same host, so **no new proxy is needed** — but the existing `cookieDomainRewrite` is correct for the new endpoints.

Optional follow-up: also expose `/dms-api` → `blocksapi.dev.slsblx.com` if the team wants to keep the DMS calls isolated from the rest. Not required by this spec.

---

## 9. Acceptance criteria

- [ ] `src/services/dms.js` exports all 29 helpers listed in §4.2.
- [ ] `src/components/DmsCard.jsx` renders the four tabs (`browse`, `search`, `trash`, `sharing`) and the five modal flows (`newFolder`, `rename`, `move`, `upload`, `share`).
- [ ] Every API call routes through `iamFetch` (so 401 → refresh → retry keeps working).
- [ ] Every call appears in the `ApiTrace` panel as a cURL + JSON chip, in the same visual style as existing cards.
- [ ] `UploadFile` uses the two-step `GetPreSignedUrlForUpload` → `PUT` → `UploadFileToLocalStorage` pattern.
- [ ] `Trash` tab supports both `RestoreFromTrash` and `DeleteFromTrash`.
- [ ] `Sharing` tab supports `GetAccessPolicies`, `GrantAccess`, `UpdateAccessPolicy`, `RevokeAccessPolicy`, `ResolveAccess`, `ToggleInheritance`, `ShareContent`.
- [ ] `move` and `copy` flows show a destination directory picker (a recursive `getDirectoryChildren` driven modal).
- [ ] All new i18n keys added in §5.7 are present in the local `en-US.construct` fallback bundle and shipped via UILM.
- [ ] No new top-level dependencies added.
- [ ] No changes to existing `iamFetch`, `auth.js`, or any of the four existing cards.

---

## 10. Out of scope / follow-ups

- Drag-and-drop upload UI
- Inline file preview (image thumbnails, PDF preview)
- Real-time collaborator indicators
- Bulk operations (multi-select + batch move/delete)
- Recursive directory size calculation
- Test coverage — recommend a follow-up PR to add at least a Vitest suite around `searchContent` pagination and the `uploadFile` two-step flow.

---

## 11. Open questions for the team

1. Does the `ConfigurationName` for upload come from the project's storage config list (already fetched in `StorageCard`) or a per-org setting? — currently spec assumes the same enum exposed via `listStorageConfigs`.
2. Should `searchContent` results include a `highlight` field? The spec doesn't show one — if the backend returns it, render it as a secondary line in the row.
3. Does `ShareContent` return a final URL we should open in a new tab, or only a token? — currently spec opens whatever URL is returned.
4. Should `getDirectoryChildren` infinite-scroll or paginate? Spec assumes "Load more" button for parity with the existing UI density.
