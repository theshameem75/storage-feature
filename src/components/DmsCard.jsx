import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  Copy as CopyIcon,
  Download,
  File as FileIcon,
  Folder as FolderIcon,
  FolderPlus,
  History,
  Pencil,
  Search,
  Share2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ServiceCard } from './ServiceCard';
import { ApiTrace } from './ApiTrace';
import * as dms from '../services/dms';
import { dmsUrls } from '../services/dms';

const PERMISSIONS = ['read', 'write', 'delete', 'share'];

function pickId(item, ...keys) {
  if (!item) return '';
  for (const k of keys) {
    const v = item[k];
    if (v) return v;
  }
  return '';
}

function pickName(item, ...keys) {
  if (!item) return '';
  for (const k of keys) {
    const v = item[k];
    if (v) return v;
  }
  return '';
}

function isDir(item) {
  if (!item) return false;
  const t = pickName(item, 'type', 'Type', 'itemType', 'ItemType');
  if (!t) return !!pickId(item, 'directoryId', 'DirectoryId', 'parentDirectoryId', 'ParentDirectoryId');
  return /dir|folder/i.test(t);
}

export default function DmsCard({ open, onToggle, activeOrgId }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('browse');
  const [currentDirId, setCurrentDirId] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]); // [{ id, name }]
  const [children, setChildren] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [trashItems, setTrashItems] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  // Sharing tab state
  const [policies, setPolicies] = useState([]);
  const [inherit, setInherit] = useState(true);
  const [resolvePerms, setResolvePerms] = useState([]);

  // Modal state
  const [pending, setPending] = useState(null); // { kind, item? }
  const [modal, setModal] = useState(null); // 'newFolder' | 'rename' | 'move' | 'upload' | 'share' | null
  const [modalItem, setModalItem] = useState(null);
  const [modalText, setModalText] = useState('');
  const [modalError, setModalError] = useState('');

  // Trace accumulator (per-card)
  const [calls, setCalls] = useState([]);

  const pushCall = (entry) => setCalls((c) => [...c, entry]);
  const pushRes = (text) => setCalls((c) => [...c, { res: true, text }]);
  const resetCalls = () => setCalls([]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  async function withBusy(fn) {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      pushRes(`✗ ${e.message || 'request failed'}`);
      setModalError(e.message || String(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }

  // ---- browse tab ----
  async function loadChildren(dirId, resetCrumbs = false) {
    resetCalls();
    await withBusy(async () => {
      pushCall({
        method: 'GET',
        label: 'children',
        url: dmsUrls.getDirectoryChildren,
        note: `→ DirectoryId=${dirId || '<root>'}`,
      });
      const data = await dms.getDirectoryChildren({ directoryId: dirId, limit: 50 });
      pushRes(`200 { items: ${(data?.items || []).length}, cursor: ${data?.cursor || '∅'} }`);
      setChildren(data?.items || []);
      setCursor(data?.cursor || null);
      setCurrentDirId(dirId);
      if (resetCrumbs) setBreadcrumbs(dirId ? [{ id: dirId, name: '…' }] : []);
    }).catch(() => {});
  }

  async function navigateTo(crumb) {
    if (!crumb) return loadChildren(null, true);
    const idx = breadcrumbs.findIndex((b) => b.id === crumb.id);
    const next = idx >= 0 ? breadcrumbs.slice(0, idx + 1) : [...breadcrumbs, crumb];
    setBreadcrumbs(next);
    await loadChildren(crumb.id, false);
  }

  useEffect(() => {
    if (!open || tab !== 'browse') return;
    if (!activeOrgId) return;
    loadChildren(currentDirId, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, activeOrgId]);

  async function loadMore() {
    if (!cursor) return;
    await withBusy(async () => {
      pushCall({
        method: 'GET',
        label: 'children+',
        url: dmsUrls.getDirectoryChildren,
        note: `→ cursor=${cursor}`,
      });
      const data = await dms.getDirectoryChildren({ directoryId: currentDirId, cursor, limit: 50 });
      pushRes(`200 { items+: ${(data?.items || []).length} }`);
      setChildren((c) => [...c, ...(data?.items || [])]);
      setCursor(data?.cursor || null);
    }).catch(() => {});
  }

  // ---- search tab ----
  async function runSearch(e) {
    e?.preventDefault?.();
    if (!search) return;
    resetCalls();
    await withBusy(async () => {
      pushCall({
        method: 'GET',
        label: 'search',
        url: dmsUrls.searchContent,
        note: `→ Query="${search}"`,
      });
      const data = await dms.searchContent({ query: search, directoryId: currentDirId, type: 'all', limit: 50 });
      pushRes(`200 { items: ${(data?.items || []).length} }`);
      setSearchResults(data?.items || []);
    }).catch(() => {});
  }

  function jumpToSearchHit(item) {
    const dirId = pickId(item, 'directoryId', 'DirectoryId');
    if (!dirId) return;
    setTab('browse');
    setBreadcrumbs((b) => [...b, { id: dirId, name: pickName(item, 'name', 'Name') || dirId.slice(0, 8) }]);
    loadChildren(dirId, false);
  }

  // ---- trash tab ----
  async function loadTrash() {
    resetCalls();
    await withBusy(async () => {
      pushCall({ method: 'GET', label: 'trash', url: dmsUrls.getTrash });
      const data = await dms.getTrash({ limit: 50 });
      pushRes(`200 { items: ${(data?.items || []).length} }`);
      setTrashItems(data?.items || []);
    }).catch(() => {});
  }

  useEffect(() => {
    if (!open || tab !== 'trash') return;
    loadTrash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  async function doRestore(item) {
    resetCalls();
    await withBusy(async () => {
      const id = pickId(item, 'id', 'Id', 'itemId', 'ItemId');
      const type = isDir(item) ? 'directory' : 'file';
      pushCall({ method: 'POST', label: 'restore', url: dmsUrls.restoreFromTrash, body: { id, type } });
      await dms.restoreFromTrash({ id, type });
      pushRes('200 { ok }');
      showToast(t('dms.toast.restored'));
      loadTrash();
    }).catch(() => {});
  }

  async function doPurge(item) {
    resetCalls();
    await withBusy(async () => {
      const id = pickId(item, 'id', 'Id', 'itemId', 'ItemId');
      const type = isDir(item) ? 'directory' : 'file';
      pushCall({ method: 'POST', label: 'purge', url: dmsUrls.deleteFromTrash, body: { id, type } });
      await dms.deleteFromTrash({ id, type });
      pushRes('200 { ok }');
      showToast(t('dms.toast.deleted'));
      loadTrash();
    }).catch(() => {});
  }

  // ---- sharing tab ----
  async function loadPolicies(resourceId) {
    if (!resourceId) return;
    resetCalls();
    await withBusy(async () => {
      pushCall({
        method: 'GET',
        label: 'policies',
        url: dmsUrls.getAccessPolicies,
        note: `→ ResourceId=${resourceId}`,
      });
      const [pols, eff] = await Promise.all([
        dms.getAccessPolicies({ resourceId, includeInherited: inherit }),
        dms.resolveAccess({ resourceId }).catch(() => null),
      ]);
      pushRes(`200 { policies: ${(pols || []).length} }`);
      setPolicies(Array.isArray(pols) ? pols : pols?.items || []);
      setResolvePerms(eff?.permissions || eff?.data?.permissions || []);
    }).catch(() => {});
  }

  function openShare(item) {
    const resourceId = pickId(item, 'directoryId', 'DirectoryId', 'fileId', 'FileId');
    setTab('sharing');
    loadPolicies(resourceId);
  }

  async function doToggleInheritance(item) {
    const resourceId = pickId(item, 'directoryId', 'DirectoryId', 'fileId', 'FileId');
    resetCalls();
    await withBusy(async () => {
      const next = !inherit;
      pushCall({
        method: 'POST',
        label: 'inherit',
        url: dmsUrls.toggleInheritance,
        body: { resourceId, inherit: next },
      });
      await dms.toggleInheritance({ resourceId, inherit: next });
      pushRes(`200 { inherit: ${next} }`);
      setInherit(next);
      showToast(t('dms.toast.inheritanceToggled'));
      loadPolicies(resourceId);
    }).catch(() => {});
  }

  async function doShareLink(item) {
    const resourceId = pickId(item, 'directoryId', 'DirectoryId', 'fileId', 'FileId');
    resetCalls();
    await withBusy(async () => {
      pushCall({ method: 'POST', label: 'share', url: dmsUrls.shareContent, body: { resourceId } });
      const out = await dms.shareContent({ resourceId });
      pushRes(`200 { shareUrl: ${out?.shareUrl || '∅'} }`);
      showToast(t('dms.toast.shared'));
      if (out?.shareUrl) window.open(out.shareUrl, '_blank', 'noopener,noreferrer');
    }).catch(() => {});
  }

  async function doRevoke(policy) {
    const policyId = pickId(policy, 'policyId', 'PolicyId', 'id', 'Id');
    resetCalls();
    await withBusy(async () => {
      pushCall({ method: 'POST', label: 'revoke', url: dmsUrls.revokeAccessPolicy, body: { policyId } });
      await dms.revokeAccessPolicy({ policyId });
      pushRes('200 { ok }');
      setPolicies((ps) => ps.filter((p) => pickId(p, 'policyId', 'PolicyId', 'id', 'Id') !== policyId));
    }).catch(() => {});
  }

  // ---- modal handlers ----
  function openModal(kind, item = null) {
    setModal(kind);
    setModalItem(item);
    setModalError('');
    setModalText(kind === 'rename' ? pickName(item, 'name', 'Name') || '' : '');
  }

  function closeModal() {
    setModal(null);
    setModalItem(null);
    setModalText('');
    setModalError('');
  }

  async function submitModal(extra = {}) {
    const kind = modal;
    if (!kind) return;
    try {
      if (kind === 'newFolder') {
        resetCalls();
        await withBusy(async () => {
          pushCall({
            method: 'POST',
            label: 'create',
            url: dmsUrls.createDirectory,
            body: { parentDirectoryId: currentDirId, name: modalText },
          });
          await dms.createDirectory({ parentDirectoryId: currentDirId, name: modalText });
          pushRes('200 { ok }');
        });
        showToast(t('dms.toast.created'));
        loadChildren(currentDirId, false);
      } else if (kind === 'rename') {
        resetCalls();
        await withBusy(async () => {
          if (modalItem && isDir(modalItem)) {
            const id = pickId(modalItem, 'directoryId', 'DirectoryId');
            pushCall({ method: 'POST', label: 'rename', url: dmsUrls.updateDirectory, body: { directoryId: id, name: modalText } });
            await dms.updateDirectory({ directoryId: id, name: modalText });
          } else {
            const id = pickId(modalItem, 'fileId', 'FileId');
            pushCall({ method: 'POST', label: 'rename', url: dmsUrls.updateFileAdditionalInfo, body: { fileId: id, metadata: { name: modalText } } });
            await dms.updateFileAdditionalInfo({ fileId: id, metadata: { name: modalText } });
          }
          pushRes('200 { ok }');
        });
        showToast(t('dms.toast.renamed'));
        loadChildren(currentDirId, false);
      } else if (kind === 'move') {
        const targetId = extra.targetId || null;
        resetCalls();
        await withBusy(async () => {
          if (modalItem && isDir(modalItem)) {
            const id = pickId(modalItem, 'directoryId', 'DirectoryId');
            pushCall({
              method: 'POST',
              label: 'move',
              url: dmsUrls.moveDirectory,
              body: { directoryId: id, newParentDirectoryId: targetId },
            });
            await dms.moveDirectory({ directoryId: id, newParentDirectoryId: targetId });
          } else {
            const id = pickId(modalItem, 'fileId', 'FileId');
            pushCall({
              method: 'POST',
              label: 'move',
              url: dmsUrls.moveFile,
              body: { fileId: id, targetDirectoryId: targetId },
            });
            await dms.moveFile({ fileId: id, targetDirectoryId: targetId });
          }
          pushRes('200 { ok }');
        });
        showToast(t('dms.toast.moved'));
        loadChildren(currentDirId, false);
      } else if (kind === 'upload') {
        const file = extra.file;
        if (!file) return;
        resetCalls();
        await withBusy(async () => {
          pushCall({
            method: 'POST',
            label: 'presign',
            url: dmsUrls.getPresignedUrlForUpload,
            body: { fileName: file.name, parentDirectoryId: currentDirId },
          });
          const { uploadUrl, fileId } = await dms.getPresignedUrlForUpload({
            fileName: file.name,
            parentDirectoryId: currentDirId,
          });
          pushCall({
            method: 'PUT',
            label: 'put-bytes',
            url: '<signed url>',
            noCopy: true,
            note: '(raw bytes)',
          });
          const put = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          });
          if (!put.ok) throw new Error(`PUT failed: ${put.status}`);
          pushRes('200 { uploaded }');
          pushCall({ method: 'POST', label: 'confirm', url: dmsUrls.uploadFileToLocalStorage, body: { fileId } });
          await dms.uploadFileToLocalStorage({ fileId }).catch(() => null);
          pushRes('200 { confirmed }');
        });
        showToast(t('dms.toast.uploaded'));
        loadChildren(currentDirId, false);
      } else if (kind === 'share') {
        const resourceId = extra.resourceId;
        const principalId = modalText;
        const permissions = extra.permissions || ['read'];
        resetCalls();
        await withBusy(async () => {
          pushCall({
            method: 'POST',
            label: 'grant',
            url: dmsUrls.grantAccess,
            body: { resourceId, principalId, permissions },
          });
          await dms.grantAccess({ resourceId, principalId, permissions });
          pushRes('200 { ok }');
        });
        showToast(t('dms.toast.shared'));
        loadPolicies(resourceId);
      }
      closeModal();
    } catch (e) {
      // error already pushed via withBusy
    }
  }

  async function doDownload(item) {
    const fileId = pickId(item, 'fileId', 'FileId');
    resetCalls();
    await withBusy(async () => {
      pushCall({ method: 'GET', label: 'getFile', url: dmsUrls.getFile, note: `→ FileId=${fileId}` });
      const out = await dms.getFile({ fileId });
      const url = typeof out === 'string' ? out : out?.url || out?.preSignedUrl || out?.downloadUrl;
      pushRes(`200 { url: ${url ? '<signed>' : '∅'} }`);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        showToast(t('dms.toast.downloaded'));
      }
    }).catch(() => {});
  }

  async function doVersions(item) {
    const fileId = pickId(item, 'fileId', 'FileId');
    resetCalls();
    await withBusy(async () => {
      pushCall({ method: 'GET', label: 'versions', url: dmsUrls.getFileVersions, note: `→ FileId=${fileId}` });
      const data = await dms.getFileVersions({ fileId, limit: 50 });
      pushRes(`200 { items: ${(data?.items || []).length} }`);
    }).catch(() => {});
  }

  async function doCopy(item) {
    const fileId = pickId(item, 'fileId', 'FileId');
    resetCalls();
    await withBusy(async () => {
      pushCall({
        method: 'POST',
        label: 'copy',
        url: dmsUrls.copyFile,
        body: { fileId, targetDirectoryId: currentDirId },
      });
      await dms.copyFile({ fileId, targetDirectoryId: currentDirId });
      pushRes('200 { ok }');
    }).catch(() => {});
    loadChildren(currentDirId, false);
  }

  async function doDelete(item) {
    resetCalls();
    await withBusy(async () => {
      if (isDir(item)) {
        const id = pickId(item, 'directoryId', 'DirectoryId');
        pushCall({ method: 'POST', label: 'deleteDir', url: dmsUrls.deleteDirectory, body: { directoryId: id } });
        await dms.deleteDirectory({ directoryId: id });
      } else {
        const id = pickId(item, 'fileId', 'FileId');
        pushCall({ method: 'POST', label: 'deleteFile', url: dmsUrls.deleteFile, body: { fileId: id } });
        await dms.deleteFile({ fileId: id });
      }
      pushRes('200 { ok }');
    }).catch(() => {});
    showToast(t('dms.toast.deleted'));
    loadChildren(currentDirId, false);
  }

  const cmdText = useMemo(() => {
    if (tab === 'browse') return 'construct.dms.folders.list({ parentDirectoryId })';
    if (tab === 'search') return 'construct.dms.search.content({ query })';
    if (tab === 'trash') return 'construct.dms.trash.list()';
    return 'construct.dms.sharing.policies({ resourceId })';
  }, [tab]);

  const tabBtn = (key, label) => (
    <button
      type="button"
      key={key}
      className={`cx-dms-tab${tab === key ? ' active' : ''}`}
      onClick={() => setTab(key)}
    >
      {label}
    </button>
  );

  // ---- guards ----
  if (!activeOrgId) {
    return (
      <ServiceCard
        dotColor="var(--violet)"
        name="DMS"
        sub="folders · files · sharing"
        open={open}
        onToggle={onToggle}
        cmd={
          <>
            <span className="p">$</span> construct.dms.folders.list(<span className="arg">"root"</span>)
          </>
        }
      >
        <div className="cx-state">-- guard: no active org. pick an organisation to unlock dms.</div>
      </ServiceCard>
    );
  }

  return (
    <ServiceCard
      dotColor="var(--violet)"
      name="DMS"
      sub="folders · files · sharing"
      open={open}
      onToggle={onToggle}
      cmd={
        <>
          <span className="p">$</span> {cmdText}
        </>
      }
    >
      <div className="cx-dms-toolbar">
        <input
          className="cx-input"
          placeholder={t('dms.search.placeholder', 'search this org…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setTab('search');
              runSearch(e);
            }
          }}
          style={{ minWidth: 220 }}
        />
        <div className="cx-dms-tabs">
          {tabBtn('browse', t('dms.tab.browse', 'browse'))}
          {tabBtn('search', t('dms.tab.search', 'search'))}
          {tabBtn('trash', t('dms.tab.trash', 'trash'))}
          {tabBtn('sharing', t('dms.tab.sharing', 'sharing'))}
        </div>
        {toast ? (
          <span style={{ marginLeft: 'auto', color: 'var(--grn)', fontFamily: 'var(--mono)', fontSize: 11.5 }}>
            ✓ {toast}
          </span>
        ) : null}
      </div>

      {tab === 'browse' && (
        <>
          <div className="cx-dms-breadcrumb">
            <a onClick={() => navigateTo(null)}>root</a>
            {breadcrumbs.map((b) => (
              <a key={b.id} onClick={() => navigateTo(b)}>
                {' '}
                {b.name || b.id.slice(0, 8)}
              </a>
            ))}
          </div>

          <div className="cx-dms-list">
            {children.length === 0 ? (
              <div className="cx-dms-empty">{t('dms.empty.children', 'no items in this folder')}</div>
            ) : (
              children.map((item) => {
                const dir = isDir(item);
                const id = pickId(item, 'directoryId', 'DirectoryId', 'fileId', 'FileId');
                const name = pickName(item, 'name', 'Name', 'fileName', 'FileName') || id.slice(0, 8);
                const size = pickName(item, 'size', 'Size', 'contentLength', 'ContentLength');
                return (
                  <div className="cx-dms-row" key={id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                      {dir ? <FolderIcon size={14} /> : <FileIcon size={14} />}
                      <span className="cx-dms-name">{name}</span>
                      {!dir && size ? <span className="cx-dms-meta">{formatBytes(size)}</span> : null}
                    </div>
                    <div className="cx-dms-actions">
                      {dir ? (
                        <button type="button" className="cx-btn" onClick={() => navigateTo({ id, name })}>
                          open <ChevronRight size={11} style={{ verticalAlign: '-2px' }} />
                        </button>
                      ) : (
                        <>
                          <button type="button" className="cx-btn" onClick={() => doDownload(item)}>
                            <Download size={11} /> {t('dms.action.download', 'download')}
                          </button>
                          <button type="button" className="cx-btn" onClick={() => doVersions(item)}>
                            <History size={11} /> {t('dms.action.versions', 'versions')}
                          </button>
                          <button type="button" className="cx-btn" onClick={() => doCopy(item)}>
                            <CopyIcon size={11} /> {t('dms.action.copy', 'copy')}
                          </button>
                        </>
                      )}
                      <button type="button" className="cx-btn" onClick={() => openModal('rename', item)}>
                        <Pencil size={11} /> {t('dms.action.rename', 'rename')}
                      </button>
                      <button type="button" className="cx-btn" onClick={() => openModal('move', item)}>
                        {t('dms.action.move', 'move')}
                      </button>
                      <button type="button" className="cx-btn" onClick={() => openShare(item)}>
                        <Share2 size={11} /> {t('dms.action.share', 'share')}
                      </button>
                      <button type="button" className="cx-btn" onClick={() => doDelete(item)}>
                        <Trash2 size={11} /> {t('dms.action.delete', 'delete')}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="cx-dms-footer">
            <button type="button" className="cx-btn green" onClick={() => openModal('newFolder')} disabled={busy}>
              <FolderPlus size={13} /> {t('dms.action.newFolder', '+ new folder')}
            </button>
            <button type="button" className="cx-btn" onClick={() => openModal('upload')} disabled={busy}>
              <Upload size={13} /> {t('dms.action.upload', 'upload file')}
            </button>
            {cursor ? (
              <button type="button" className="cx-btn" onClick={loadMore} disabled={busy}>
                load more
              </button>
            ) : null}
          </div>
        </>
      )}

      {tab === 'search' && (
        <>
          <div className="cx-dms-toolbar">
            <button type="button" className="cx-btn green" onClick={runSearch} disabled={busy || !search}>
              <Search size={13} /> run search
            </button>
          </div>
          <div className="cx-dms-list">
            {searchResults.length === 0 ? (
              <div className="cx-dms-empty">{t('dms.empty.search', 'no matches yet — type a query and run')}</div>
            ) : (
              searchResults.map((item) => {
                const id = pickId(item, 'id', 'Id', 'directoryId', 'DirectoryId', 'fileId', 'FileId');
                const name = pickName(item, 'name', 'Name', 'fileName', 'FileName') || id.slice(0, 8);
                return (
                  <div className="cx-dms-row" key={id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isDir(item) ? <FolderIcon size={14} /> : <FileIcon size={14} />}
                      <span className="cx-dms-name">{name}</span>
                    </div>
                    <div className="cx-dms-actions">
                      <button type="button" className="cx-btn" onClick={() => jumpToSearchHit(item)}>
                        open <ChevronRight size={11} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {tab === 'trash' && (
        <div className="cx-dms-list">
          {trashItems.length === 0 ? (
            <div className="cx-dms-empty">{t('dms.empty.trash', 'trash is empty')}</div>
          ) : (
            trashItems.map((item) => {
              const id = pickId(item, 'id', 'Id', 'itemId', 'ItemId');
              const name = pickName(item, 'name', 'Name') || id.slice(0, 8);
              return (
                <div className="cx-dms-row" key={id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isDir(item) ? <FolderIcon size={14} /> : <FileIcon size={14} />}
                    <span className="cx-dms-name">{name}</span>
                  </div>
                  <div className="cx-dms-actions">
                    <button type="button" className="cx-btn green" onClick={() => doRestore(item)}>
                      {t('dms.action.restore', 'restore')}
                    </button>
                    <button type="button" className="cx-btn" onClick={() => doPurge(item)}>
                      <Trash2 size={11} /> {t('dms.action.permanentDelete', 'purge')}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'sharing' && (
        <div className="cx-2col" style={{ marginTop: 12 }}>
          <div className="cx-panel">
            <div className="cx-panel-title">policies</div>
            <div className="cx-panel-desc">access policies on the currently selected resource</div>
            {policies.length === 0 ? (
              <div className="cx-state">no policies — select a row in the browse tab and press share</div>
            ) : (
              policies.map((p) => {
                const pid = pickId(p, 'policyId', 'PolicyId', 'id', 'Id');
                const who = pickName(p, 'principalId', 'PrincipalId', 'principalName', 'PrincipalName');
                const perms = p.permissions || p.Permissions || [];
                return (
                  <div className="cx-dms-policy" key={pid}>
                    <span className="cx-dms-name" style={{ minWidth: 90 }}>{who || pid.slice(0, 8)}</span>
                    <span className="cx-dms-meta">{(perms || []).join(', ')}</span>
                    <span style={{ flex: 1 }} />
                    <button type="button" className="cx-btn" onClick={() => doRevoke(p)}>revoke</button>
                  </div>
                );
              })
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" className="cx-btn" onClick={() => openModal('share')}>
                <Share2 size={11} /> grant new
              </button>
              <button type="button" className="cx-btn" onClick={() => doToggleInheritance({})}>
                toggle inheritance (current: {String(inherit)})
              </button>
              <button type="button" className="cx-btn" onClick={() => doShareLink({})}>share link</button>
            </div>
          </div>
          <div className="cx-panel">
            <div className="cx-panel-title">effective permissions</div>
            <div className="cx-panel-desc">resolved via ResolveAccess</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--txt)' }}>
              {resolvePerms.length ? resolvePerms.join(', ') : <span className="cx-dms-empty">none</span>}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, fontFamily: 'var(--mono)', color: 'var(--dim)', fontSize: 11 }}>
        {tab === 'browse' && (
          <>
            construct.dms.folders.list({`{ parentDirectoryId: ${currentDirId ? `"${currentDirId.slice(0, 8)}…"` : 'null'} }`}) · construct.dms.folders.create({`{ parentDirectoryId, name }`}) · construct.dms.files.upload({`{ file, parentDirectoryId }`})
          </>
        )}
        {tab === 'search' && 'construct.dms.search.content({ query, directoryId, type: "all" })'}
        {tab === 'trash' && 'construct.dms.trash.restore({ id, type }) · construct.dms.trash.purge({ id, type })'}
        {tab === 'sharing' &&
          'construct.dms.sharing.grant({ resourceId, principalId, permissions }) · construct.dms.sharing.resolve({ resourceId }) · construct.dms.sharing.toggleInheritance({ resourceId, inherit })'}
      </div>

      <ApiTrace
        calls={calls}
        note={
          <>
            <b>dms</b> — this card proxies the platform dms api. mutations are gated by the active org; presigned uploads use a raw <code>PUT</code> (no <code>iamFetch</code>).
          </>
        }
      />

      {modal ? (
        <DmsModal
          kind={modal}
          item={modalItem}
          text={modalText}
          setText={setModalText}
          error={modalError}
          onSubmit={submitModal}
          onClose={closeModal}
          currentDirId={currentDirId}
        />
      ) : null}
    </ServiceCard>
  );
}

function formatBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '';
  if (v < 1024) return `${v} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let s = v / 1024;
  let i = 0;
  while (s >= 1024 && i < units.length - 1) {
    s /= 1024;
    i += 1;
  }
  return `${s.toFixed(1)} ${units[i]}`;
}

function DmsModal({ kind, item, text, setText, error, onSubmit, onClose, currentDirId }) {
  const { t } = useTranslation();
  const [targetId, setTargetId] = useState(currentDirId || null);
  const [pickChildren, setPickChildren] = useState([]);
  const [filePick, setFilePick] = useState(null);
  const [perms, setPerms] = useState(['read']);
  const [resourceId, setResourceId] = useState('');

  useEffect(() => {
    if (kind !== 'move') return;
    let cancel = false;
    dms.getDirectoryChildren({ directoryId: null, limit: 50 }).then((d) => {
      if (!cancel) setPickChildren(d?.items || []);
    }).catch(() => {});
    return () => {
      cancel = true;
    };
  }, [kind]);

  useEffect(() => {
    if (kind === 'share' && item) {
      setResourceId(pickId(item, 'directoryId', 'DirectoryId', 'fileId', 'FileId'));
    }
  }, [kind, item]);

  let title = '';
  let body = null;
  if (kind === 'newFolder') {
    title = t('dms.modal.newFolder.title', 'new folder');
    body = (
      <input
        className="cx-input cx-dms-modal-input"
        autoFocus
        placeholder={t('dms.modal.newFolder.placeholder', 'folder name')}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    );
  } else if (kind === 'rename') {
    title = t('dms.modal.rename.title', 'rename');
    body = (
      <input
        className="cx-input cx-dms-modal-input"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    );
  } else if (kind === 'move') {
    title = t('dms.modal.move.title', 'move to…');
    body = (
      <>
        <div className="cx-dms-meta" style={{ marginBottom: 6 }}>destination directory id</div>
        <input
          className="cx-input cx-dms-modal-input"
          placeholder="directoryId (leave empty for root)"
          value={targetId || ''}
          onChange={(e) => setTargetId(e.target.value || null)}
        />
        <div className="cx-dms-list" style={{ marginTop: 8, maxHeight: 180 }}>
          {pickChildren.length === 0 ? (
            <div className="cx-dms-empty">no destinations</div>
          ) : (
            pickChildren.map((c) => {
              const id = pickId(c, 'directoryId', 'DirectoryId');
              const name = pickName(c, 'name', 'Name') || id.slice(0, 8);
              return (
                <div key={id} className="cx-dms-row" onClick={() => setTargetId(id)} style={{ cursor: 'pointer', background: targetId === id ? 'var(--row-hover, rgba(255,255,255,0.03))' : undefined }}>
                  <span className="cx-dms-name"><FolderIcon size={12} /> {name}</span>
                </div>
              );
            })
          )}
        </div>
      </>
    );
  } else if (kind === 'upload') {
    title = t('dms.modal.upload.title', 'upload file');
    body = (
      <input
        className="cx-input cx-dms-modal-input"
        type="file"
        onChange={(e) => setFilePick(e.target.files?.[0] || null)}
      />
    );
  } else if (kind === 'share') {
    title = t('dms.modal.share.title', 'grant access');
    body = (
      <>
        <div className="cx-field-label" style={{ marginBottom: 4 }}>resource id</div>
        <input
          className="cx-input cx-dms-modal-input"
          value={resourceId}
          onChange={(e) => setResourceId(e.target.value)}
          placeholder="resourceId"
        />
        <div className="cx-field-label" style={{ marginTop: 10, marginBottom: 4 }}>
          {t('dms.modal.share.principalId', 'principalId')}
        </div>
        <input
          className="cx-input cx-dms-modal-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('dms.modal.share.placeholder', 'user or group id')}
        />
        <div className="cx-field-label" style={{ marginTop: 10, marginBottom: 4 }}>
          {t('dms.modal.share.permissions', 'permissions')}
        </div>
        <div className="cx-dms-perms">
          {PERMISSIONS.map((p) => (
            <label key={p}>
              <input
                type="checkbox"
                checked={perms.includes(p)}
                onChange={(e) =>
                  setPerms((cur) => (e.target.checked ? [...cur, p] : cur.filter((x) => x !== p)))
                }
              />
              {p}
            </label>
          ))}
        </div>
      </>
    );
  }

  const submit = () => {
    if (kind === 'upload') return onSubmit({ file: filePick });
    if (kind === 'move') return onSubmit({ targetId });
    if (kind === 'share') return onSubmit({ resourceId, permissions: perms });
    return onSubmit();
  };

  return createPortal(
    <div className="cx-modal-backdrop" onMouseDown={onClose}>
      <div className="cx-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cx-modal-head">
          <span className="cx-modal-title">{title}</span>
          <button type="button" className="cx-iconbtn sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="cx-modal-body">{body}</div>
        {error ? <div className="cx-msg error" style={{ margin: '0 16px 8px' }}>{error}</div> : null}
        <div className="cx-modal-foot">
          <button type="button" className="cx-btn" onClick={onClose}>
            {t('dms.modal.cancel', 'cancel')}
          </button>
          <button type="button" className="cx-btn green lg" onClick={submit}>
            ▶ {t('dms.modal.confirm', 'confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}