import { apiBaseUrl, bumpApi, iamFetch, toCurl } from './api';

const isDev = import.meta.env.DEV;
// in dev, route /data/v4/Directories|/Files|/Content through the Vite proxy
// (same-origin, avoids CORS); in prod, hit apiBaseUrl directly.
const dmsOrigin = isDev ? '' : apiBaseUrl;
const dirsBase = `${dmsOrigin}/data/v4/Directory`;
const dmsFilesBase = `${dmsOrigin}/data/v4/Files`;
const contentBase = `${dmsOrigin}/data/v4/Content`;

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

async function sendJson(method, url, body) {
  const init = { method };
  if (body !== undefined) init.body = JSON.stringify(body);
  const resp = await iamFetch(url, init);
  if (!resp.ok) {
    let msg = resp.statusText;
    try {
      const t = await resp.text();
      if (t) msg = t;
    } catch {
      // ignore
    }
    throw new Error(msg || `${method} ${url} failed: ${resp.status}`);
  }
  const text = await resp.text();
  bumpApi();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildQuery(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    usp.append(k, String(v));
  }
  const q = usp.toString();
  return q ? `?${q}` : '';
}

// ---- Directories ----

export async function createRootDirectory({ name, ...rest }) {
  return sendJson('POST', urls.createRootDirectory, { name, ...rest });
}

export async function createDirectory({ parentDirectoryId, name, ...rest }) {
  return sendJson('POST', urls.createDirectory, { parentDirectoryId, name, ...rest });
}

export async function getDirectory({ directoryId }) {
  return sendJson('GET', `${urls.getDirectory}${buildQuery({ directoryId })}`);
}

export async function getDirectoryChildren({ directoryId, cursor, limit, type, search }) {
  const raw = await sendJson('GET', `${urls.getDirectoryChildren}${buildQuery({ DirectoryId: directoryId, cursor, limit, type, search })}`);
  return {
    items: raw?.items || raw?.Items || [],
    cursor: raw?.nextCursor || raw?.NextCursor || raw?.cursor || raw?.Cursor || null,
    hasMore: !!(raw?.hasMore ?? raw?.HasMore),
    totalCount: raw?.totalChildCount ?? raw?.TotalChildCount ?? raw?.totalCount ?? raw?.TotalCount ?? null,
  };
}

export async function updateDirectory({ directoryId, name, ...rest }) {
  return sendJson('POST', urls.updateDirectory, { directoryId, name, ...rest });
}

export async function moveDirectory({ directoryId, newParentDirectoryId }) {
  return sendJson('POST', urls.moveDirectory, { directoryId, newParentDirectoryId });
}

export async function deleteDirectory({ directoryId }) {
  return sendJson('POST', urls.deleteDirectory, { directoryId });
}

// ---- Files ----

export async function getFile({ fileId, version, configurationName }) {
  return sendJson('GET', `${urls.getFile}${buildQuery({ FileId: fileId, Version: version, ConfigurationName: configurationName })}`);
}

export async function getFiles({ fileIds }) {
  return sendJson('POST', urls.getFiles, { fileIds });
}

export async function getFilesInfo({ fileIds }) {
  return sendJson('POST', urls.getFilesInfo, { fileIds });
}

export async function getPresignedUrlForUpload({
  fileName,
  parentDirectoryId,
  configurationName,
  tags = '',
  metadata = '',
  ...rest
}) {
  return sendJson('POST', urls.getPresignedUrlForUpload, {
    Name: fileName,
    ParentDirectoryId: parentDirectoryId,
    ConfigurationName: configurationName,
    Tags: tags,
    MetaData: metadata,
    ...rest,
  });
}

export async function uploadFileToLocalStorage(payload) {
  return sendJson('POST', urls.uploadFileToLocalStorage, payload);
}

export async function updateFileAdditionalInfo({ fileId, metadata }) {
  return sendJson('POST', urls.updateFileAdditionalInfo, { fileId, metadata });
}

export async function deleteFile({ fileId }) {
  return sendJson('POST', urls.deleteFile, { fileId });
}

export async function getFileVersions({ fileId, cursor, limit }) {
  return sendJson('GET', `${urls.getFileVersions}${buildQuery({ FileId: fileId, cursor, limit })}`);
}

export async function createFileVersion(payload) {
  return sendJson('POST', urls.createFileVersion, payload);
}

export async function copyFile({ fileId, targetDirectoryId }) {
  return sendJson('POST', urls.copyFile, { fileId, targetDirectoryId });
}

export async function moveFile({ fileId, targetDirectoryId }) {
  return sendJson('POST', urls.moveFile, { fileId, targetDirectoryId });
}

// ---- Content ----

export async function searchContent({ query, directoryId, cursor, limit, type }) {
  const raw = await sendJson('GET', `${urls.searchContent}${buildQuery({ Query: query, DirectoryId: directoryId, cursor, limit, type })}`);
  return {
    items: raw?.items || raw?.Items || [],
    cursor: raw?.nextCursor || raw?.NextCursor || raw?.cursor || raw?.Cursor || null,
    hasMore: !!(raw?.hasMore ?? raw?.HasMore),
    totalCount: raw?.totalChildCount ?? raw?.totalCount ?? null,
  };
}

export async function getTrash({ cursor, limit, type }) {
  const raw = await sendJson('GET', `${urls.getTrash}${buildQuery({ cursor, limit, type })}`);
  return {
    items: raw?.items || raw?.Items || [],
    cursor: raw?.nextCursor || raw?.NextCursor || raw?.cursor || raw?.Cursor || null,
    hasMore: !!(raw?.hasMore ?? raw?.HasMore),
    totalCount: raw?.totalChildCount ?? raw?.totalCount ?? null,
  };
}

export async function restoreFromTrash({ id, type }) {
  return sendJson('POST', urls.restoreFromTrash, { id, type });
}

export async function deleteFromTrash({ id, type }) {
  return sendJson('POST', urls.deleteFromTrash, { id, type });
}

export async function getAccessPolicies({ resourceId, includeInherited }) {
  return sendJson('GET', `${urls.getAccessPolicies}${buildQuery({ ResourceId: resourceId, IncludeInherited: includeInherited })}`);
}

export async function grantAccess({ resourceId, principalId, permissions }) {
  return sendJson('POST', urls.grantAccess, { resourceId, principalId, permissions });
}

export async function updateAccessPolicy(payload) {
  return sendJson('POST', urls.updateAccessPolicy, payload);
}

export async function revokeAccessPolicy({ policyId }) {
  return sendJson('POST', urls.revokeAccessPolicy, { policyId });
}

export async function resolveAccess({ resourceId }) {
  return sendJson('GET', `${urls.resolveAccess}${buildQuery({ resourceId })}`);
}

export async function toggleInheritance({ resourceId, inherit }) {
  return sendJson('POST', urls.toggleInheritance, { resourceId, inherit });
}

export async function shareContent(payload) {
  return sendJson('POST', urls.shareContent, payload);
}

// ---- Upload flow (two-step presigned + raw PUT) ----

export async function uploadFile({ file, parentDirectoryId, configurationName, onProgress }) {
  const { uploadUrl, fileId } = await getPresignedUrlForUpload({
    fileName: file.name,
    parentDirectoryId,
    configurationName,
  });

  if (typeof onProgress === 'function') {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload failed: ${xhr.status}`)));
      xhr.onerror = () => reject(new Error('upload network error'));
      xhr.send(file);
    });
  } else {
    const resp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!resp.ok) throw new Error(`upload failed: ${resp.status}`);
  }

  try {
    await uploadFileToLocalStorage({ fileId });
  } catch (e) {
    // non-fatal — backend may not require confirmation
  }
  return { fileId, fileName: file.name };
}

export function dmsTraceToCurl({ method, url, body }) {
  return toCurl({ method, url, body });
}

export const dmsUrls = urls;