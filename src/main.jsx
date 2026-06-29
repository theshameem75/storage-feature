import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  Boxes,
  Languages,
  LogOut,
  Menu,
  Moon,
  Plus,
  Save,
  ShieldCheck,
  Sun,
  Upload,
  UserCircle,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './i18n';
import './styles.css';

const inventoryQuery = `
query {
  getInventoryItems(
    where: {}
    order: []
    paging: {
      pageNo: 1
      pageSize: 10
    }
  ) {
    items {
      IsDeleted
      ItemId
      CreatedDate
      LastUpdatedDate
      CreatedBy
      Language
      LastUpdatedBy
      OrganizationId
      Tags
      DeletedDate
      ItemName
      ItemImageFileId
      ItemImageFileIds
      Category
      Supplier
      ItemLoc
      Stock
      Price
      Status
      EligibleWarranty
      EligibleReplacement
      Discount
    }
    totalCount
    pageNo
    pageSize
    totalPages
    hasNextPage
    hasPreviousPage
  }
}
`;

const inventoryColumns = [
  { key: 'ItemName', label: 'Item' },
  { key: 'Category', label: 'Category' },
  { key: 'Supplier', label: 'Supplier' },
  { key: 'ItemLoc', label: 'Location' },
  { key: 'Stock', label: 'Stock' },
  { key: 'Price', label: 'Price' },
  { key: 'Status', label: 'Status' },
  { key: 'EligibleWarranty', label: 'Warranty' },
  { key: 'EligibleReplacement', label: 'Replacement' },
  { key: 'Discount', label: 'Discount' },
];

const localizationBaseUrl =
  import.meta.env.VITE_BLOCKS_API_URL || 'https://dev-api.blocksdevelopers.com';
const storageBaseUrl =
  import.meta.env.VITE_BLOCKS_LOGIC_URL || 'https://dev-logic.blocksdevelopers.com';

const themeStorageKey = 'blocks-os-theme';

const inventoryInitialForm = {
  ItemName: '',
  Category: '',
  Supplier: '',
  ItemLoc: '',
  Stock: '',
  Price: '',
  Status: '',
  EligibleWarranty: false,
  EligibleReplacement: false,
  Discount: '',
};

const inventoryFormFields = [
  { key: 'ItemName', label: 'Item name', type: 'text', required: true },
  { key: 'Category', label: 'Category', type: 'text' },
  { key: 'Supplier', label: 'Supplier', type: 'text' },
  { key: 'ItemLoc', label: 'Location', type: 'text' },
  { key: 'Stock', label: 'Stock', type: 'number', min: '0', step: '1' },
  { key: 'Price', label: 'Price', type: 'number', min: '0', step: '0.01' },
  { key: 'Status', label: 'Status', type: 'text' },
  { key: 'Discount', label: 'Discount', type: 'number', min: '0', step: '0.01' },
];

const inventoryBooleanFields = [
  { key: 'EligibleWarranty', label: 'Eligible warranty' },
  { key: 'EligibleReplacement', label: 'Eligible replacement' },
];

function getAuthHeaders() {
  const token =
    import.meta.env.VITE_AUTH_TOKEN ||
    localStorage.getItem('access_token') ||
    localStorage.getItem('accessToken') ||
    localStorage.getItem('authToken') ||
    localStorage.getItem('token') ||
    localStorage.getItem('blocks-os-token');

  return token ? { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` } : {};
}

function getDataHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-blocks-key': import.meta.env.VITE_X_BLOCKS_KEY,
    ...getAuthHeaders(),
  };
}

function toNumberOrNull(value) {
  return value === '' ? null : Number(value);
}

function compactInventoryInput(formData, imageFileId) {
  const input = {
    ...formData,
    Stock: toNumberOrNull(formData.Stock),
    Price: toNumberOrNull(formData.Price),
    Discount: toNumberOrNull(formData.Discount),
    ItemImageFileId: imageFileId || null,
  };

  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  );
}

function toGraphQLInput(value) {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => toGraphQLInput(item)).join(', ')}]`;
  }

  if (typeof value === 'object') {
    return `{ ${Object.entries(value)
      .map(([key, nestedValue]) => `${key}: ${toGraphQLInput(nestedValue)}`)
      .join(', ')} }`;
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  return String(value);
}

function readJsonMaybe(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function findValueByKey(payload, keys) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  for (const key of keys) {
    if (typeof payload[key] === 'string' && payload[key]) {
      return payload[key];
    }
  }

  for (const value of Object.values(payload)) {
    if (value && typeof value === 'object') {
      const nestedValue = findValueByKey(value, keys);

      if (nestedValue) {
        return nestedValue;
      }
    }
  }

  return '';
}

function findUploadUrl(payload) {
  if (typeof payload === 'string') {
    return payload.startsWith('http') ? payload : '';
  }

  return findValueByKey(payload, [
    'preSignedUrl',
    'presignedUrl',
    'PreSignedUrl',
    'url',
    'Url',
    'uploadUrl',
    'UploadUrl',
  ]);
}

function findFileId(payload) {
  if (typeof payload === 'string' && !payload.startsWith('http')) {
    return payload;
  }

  return findValueByKey(payload, [
    'fileId',
    'FileId',
    'id',
    'Id',
    'itemId',
    'ItemId',
    'storageFileId',
    'StorageFileId',
  ]);
}

async function loadLocalizationModule(i18n, languageCode, moduleName, signal) {
  const blocksKey = import.meta.env.VITE_X_BLOCKS_KEY;

  if (!blocksKey || !languageCode || i18n.hasResourceBundle(languageCode, moduleName)) {
    return;
  }

  const response = await fetch(
    `${localizationBaseUrl}/localization/v4/Key/GetUilmFile?Language=${encodeURIComponent(
      languageCode,
    )}&ModuleName=${encodeURIComponent(moduleName)}&ProjectKey=${encodeURIComponent(blocksKey)}`,
    {
      headers: {
        'x-blocks-key': blocksKey,
      },
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const resources = await response.json();

  if (resources && typeof resources === 'object' && !Array.isArray(resources)) {
    i18n.addResourceBundle(languageCode, moduleName, resources, true, true);
  }
}

async function uploadInventoryFile(file) {
  if (!file) {
    return '';
  }

  const itemId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${file.name}`;
  const response = await fetch(`${storageBaseUrl}/api/Storage/GetPreSignedUrlForUpload`, {
    method: 'POST',
    headers: {
      accept: 'text/plain',
      'Content-Type': 'application/json',
      'x-blocks-key': import.meta.env.VITE_X_BLOCKS_KEY,
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      itemId,
      metaData: JSON.stringify({
        source: 'inventory',
        contentType: file.type,
        size: file.size,
      }),
      name: file.name,
      parentDirectoryId: import.meta.env.VITE_STORAGE_PARENT_DIRECTORY_ID || '',
      tags: 'inventory',
      accessModifier: import.meta.env.VITE_STORAGE_ACCESS_MODIFIER || 'Private',
      configurationName: import.meta.env.VITE_STORAGE_CONFIGURATION_NAME || '',
      projectKey: import.meta.env.VITE_X_BLOCKS_KEY,
      moduleName: 11,
      additionalProperties: {
        inventory: 'true',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Upload URL request failed with status ${response.status}`);
  }

  const uploadPayload = readJsonMaybe(await response.text());
  const uploadUrl = findUploadUrl(uploadPayload);
  const initialFileId = findFileId(uploadPayload);

  if (!uploadUrl) {
    if (initialFileId) {
      return initialFileId;
    }

    throw new Error('Storage service did not return an upload URL.');
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: file.type ? { 'Content-Type': file.type } : undefined,
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error(`File upload failed with status ${uploadResponse.status}`);
  }

  const uploadedPayload = readJsonMaybe(await uploadResponse.text());
  const uploadedFileId = findFileId(uploadedPayload) || initialFileId;

  if (!uploadedFileId) {
    throw new Error('Storage service did not return a file id.');
  }

  return uploadedFileId;
}

async function insertInventoryItem(input) {
  const query = `
mutation {
  insertInventoryItem(input: ${toGraphQLInput(input)}) {
    message
  }
}
`;

  const response = await fetch(import.meta.env.VITE_BLOCKS_DATA_URL, {
    method: 'POST',
    headers: getDataHeaders(),
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Inventory save failed with status ${response.status}`);
  }

  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message || 'Inventory save failed');
  }

  return payload.data?.insertInventoryItem;
}

function getLanguageLabel(language) {
  return language.languageName || language.name || language.languageCode || language.code;
}

function getLanguageCode(language) {
  return language.languageCode || language.code || language.culture || language.id;
}

function LanguageSelector() {
  const { i18n } = useTranslation();
  const [languages, setLanguages] = useState([]);
  const [languageStatus, setLanguageStatus] = useState('loading');
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language || 'en-US');

  useEffect(() => {
    const controller = new AbortController();
    const blocksKey = import.meta.env.VITE_X_BLOCKS_KEY;

    async function loadLanguages() {
      if (!blocksKey) {
        setLanguageStatus('error');
        return;
      }

      try {
        const response = await fetch(
          `${localizationBaseUrl}/localization/v4/Language/Gets?ProjectKey=${encodeURIComponent(
            blocksKey,
          )}`,
          {
            headers: {
              'x-blocks-key': blocksKey,
            },
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        const languageList = Array.isArray(payload) ? payload : payload.items || payload.data || [];
        const normalizedLanguages = languageList
          .map((language) => ({
            ...language,
            languageCode: getLanguageCode(language),
            languageName: getLanguageLabel(language),
          }))
          .filter((language) => language.languageCode);

        setLanguages(normalizedLanguages);

        const savedLanguage = localStorage.getItem('blocks-os-language');
        const defaultLanguage =
          normalizedLanguages.find((language) => language.languageCode === savedLanguage) ||
          normalizedLanguages.find((language) => language.isDefault) ||
          normalizedLanguages[0];

        if (defaultLanguage) {
          await loadLocalizationModule(
            i18n,
            defaultLanguage.languageCode,
            'common',
            controller.signal,
          );
          setSelectedLanguage(defaultLanguage.languageCode);
          i18n.changeLanguage(defaultLanguage.languageCode);
        }

        setLanguageStatus('ready');
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }

        setLanguageStatus('error');
      }
    }

    loadLanguages();

    return () => controller.abort();
  }, [i18n]);

  async function handleLanguageChange(event) {
    const nextLanguage = event.target.value;
    setSelectedLanguage(nextLanguage);
    localStorage.setItem('blocks-os-language', nextLanguage);

    try {
      await loadLocalizationModule(i18n, nextLanguage, 'common');
    } catch (error) {
      console.error(error);
    } finally {
      i18n.changeLanguage(nextLanguage);
    }
  }

  return (
    <label className="language-control" title="Language">
      <Languages size={18} aria-hidden="true" />
      <span className="sr-only">Language</span>
      <select
        value={selectedLanguage}
        onChange={handleLanguageChange}
        disabled={languageStatus !== 'ready' || languages.length === 0}
        aria-label="Language"
      >
        {languageStatus === 'loading' ? (
          <option value={selectedLanguage}>Loading languages</option>
        ) : null}
        {languageStatus === 'error' ? (
          <option value={selectedLanguage}>Languages unavailable</option>
        ) : null}
        {languageStatus === 'ready'
          ? languages.map((language) => (
              <option key={language.languageCode} value={language.languageCode}>
                {language.languageName}
              </option>
            ))
          : null}
      </select>
    </label>
  );
}

function ThemeToggle({ theme, onThemeChange }) {
  const isDark = theme === 'dark';

  return (
    <button
      className="icon-button theme-toggle"
      type="button"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}

function formatCellValue(key, value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (key === 'Price') {
    return Number(value).toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
    });
  }

  if (key === 'Stock') {
    return Number(value).toLocaleString();
  }

  return value;
}

function LoginPage({ theme, onThemeChange }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  function handleSubmit(event) {
    event.preventDefault();
    navigate('/dashboard');
  }

  return (
    <main className="login-shell">
      <div className="login-theme-action">
        <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
      </div>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="brand-lockup">
          <span className="brand-mark">B</span>
          <div>
            <p className="eyebrow">Blocks OS</p>
            <h1 id="login-title">{t('auth.signIn', { defaultValue: 'Sign in' })}</h1>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="username">{t('auth.username', { defaultValue: 'Username' })}</label>
          <input id="username" name="username" type="text" autoComplete="username" />

          <label htmlFor="password">{t('auth.password', { defaultValue: 'Password' })}</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
          />

          <button className="primary-button" type="submit">
            {t('auth.login', { defaultValue: 'Login' })}
          </button>
        </form>
      </section>
    </main>
  );
}

function AppShell({ children, theme, onThemeChange }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  function handleLogout() {
    navigate('/');
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="icon-button mobile-only"
          type="button"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={20} />
        </button>

        <div className="topbar-brand">
          <span className="brand-mark small">B</span>
          <span>Blocks OS</span>
        </div>

        <div className="topbar-actions">
          <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
          <LanguageSelector />

          <div className="profile-menu">
            <button
              className="profile-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen((isOpen) => !isOpen)}
            >
              <UserCircle size={22} />
              <span>{t('profile.name', { defaultValue: 'Meraj Admin' })}</span>
              <ChevronDown size={16} />
            </button>

            {profileOpen ? (
              <div className="profile-dropdown" role="menu">
                <button type="button" role="menuitem" onClick={() => setProfileOpen(false)}>
                  {t('profile.myProfile', { defaultValue: 'My Profile' })}
                </button>
                <button type="button" role="menuitem" onClick={handleLogout}>
                  <LogOut size={16} />
                  {t('LOGOUT', { ns: 'common', defaultValue: 'log out' })}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="dashboard-layout">
        <aside className={`sidebar ${drawerOpen ? 'open' : ''}`} aria-label="Dashboard menu">
          <div className="sidebar-mobile-head">
            <span>{t('navigation.menu', { defaultValue: 'Menu' })}</span>
            <button
              className="icon-button"
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
            >
              <X size={20} />
            </button>
          </div>

          <nav className="drawer-nav">
            <NavLink
              className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}
              to="/dashboard"
              onClick={closeDrawer}
            >
              <ShieldCheck size={19} />
              <span>{t('navigation.iam', { defaultValue: 'IAM' })}</span>
            </NavLink>
            <NavLink
              className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}
              to="/inventory"
              onClick={closeDrawer}
            >
              <Boxes size={19} />
              <span>{t('navigation.inventory', { defaultValue: 'Inventory' })}</span>
            </NavLink>
          </nav>
        </aside>

        {drawerOpen ? (
          <button
            className="drawer-backdrop"
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          />
        ) : null}

        <main className="dashboard-content">{children}</main>
      </div>
    </div>
  );
}

function DashboardPage({ theme, onThemeChange }) {
  return (
    <AppShell theme={theme} onThemeChange={onThemeChange}>
      <section className="workspace-head">
        <p className="eyebrow">Dashboard</p>
        <h1>Blocks OS Console</h1>
      </section>

      <section className="summary-grid" aria-label="Dashboard summary">
        <article className="summary-card">
          <span>IAM</span>
          <strong>Identity & access</strong>
          <p>Manage users, roles, and permissions when Blocks OS integration is connected.</p>
        </article>
        <article className="summary-card">
          <span>Inventory</span>
          <strong>Items workspace</strong>
          <p>Open Inventory from the drawer to review live item data.</p>
        </article>
      </section>
    </AppShell>
  );
}

function InventoryPage({ theme, onThemeChange }) {
  const navigate = useNavigate();
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryMeta, setInventoryMeta] = useState(null);
  const [inventoryStatus, setInventoryStatus] = useState('loading');
  const [inventoryError, setInventoryError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadInventory() {
      setInventoryStatus('loading');
      setInventoryError('');

      try {
        const response = await fetch(import.meta.env.VITE_BLOCKS_DATA_URL, {
          method: 'POST',
          headers: getDataHeaders(),
          body: JSON.stringify({ query: inventoryQuery }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();

        if (payload.errors?.length) {
          throw new Error(payload.errors[0].message || 'Inventory query failed');
        }

        const inventory = payload.data?.getInventoryItems;
        setInventoryItems(inventory?.items ?? []);
        setInventoryMeta(inventory ?? null);
        setInventoryStatus('ready');
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }

        setInventoryError(error.message);
        setInventoryStatus('error');
      }
    }

    loadInventory();

    return () => controller.abort();
  }, []);

  return (
    <AppShell theme={theme} onThemeChange={onThemeChange}>
      <section className="workspace-head">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1>Items</h1>
        </div>
        <button className="primary-button inline-action" type="button" onClick={() => navigate('/inventory/new')}>
          <Plus size={18} />
          <span>Add</span>
        </button>
      </section>

      <section className="table-section" aria-labelledby="inventory-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">Inventory</p>
            <h2 id="inventory-title">Item List</h2>
          </div>
          {inventoryMeta ? (
            <span className="page-pill">
              Page {inventoryMeta.pageNo} of {inventoryMeta.totalPages}
            </span>
          ) : null}
        </div>

        {inventoryStatus === 'loading' ? (
          <div className="table-state">Loading inventory...</div>
        ) : null}

        {inventoryStatus === 'error' ? (
          <div className="table-state error">Could not load inventory: {inventoryError}</div>
        ) : null}

        {inventoryStatus === 'ready' ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {inventoryColumns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inventoryItems.length > 0 ? (
                  inventoryItems.map((item) => (
                    <tr key={item.ItemId}>
                      {inventoryColumns.map((column) => (
                        <td key={column.key}>{formatCellValue(column.key, item[column.key])}</td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={inventoryColumns.length}>No inventory items found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function InventoryCreatePage({ theme, onThemeChange }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState(inventoryInitialForm);
  const [imageFile, setImageFile] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError, setSaveError] = useState('');

  const isSaving = saveStatus === 'saving';

  function handleInputChange(event) {
    const { checked, name, type, value } = event.target;
    setFormData((currentData) => ({
      ...currentData,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveStatus('saving');
    setSaveError('');

    try {
      const fileId = await uploadInventoryFile(imageFile);
      await insertInventoryItem(compactInventoryInput(formData, fileId));
      setSaveStatus('saved');
      navigate('/inventory');
    } catch (error) {
      setSaveError(error.message);
      setSaveStatus('error');
    }
  }

  return (
    <AppShell theme={theme} onThemeChange={onThemeChange}>
      <section className="workspace-head">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1>Add Item</h1>
        </div>
        <button className="secondary-button inline-action" type="button" onClick={() => navigate('/inventory')}>
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>
      </section>

      <section className="form-section" aria-labelledby="inventory-create-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">Create entry</p>
            <h2 id="inventory-create-title">Item details</h2>
          </div>
        </div>

        <form className="inventory-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            {inventoryFormFields.map((field) => (
              <label className="field-control" key={field.key} htmlFor={field.key}>
                <span>{field.label}</span>
                <input
                  id={field.key}
                  name={field.key}
                  type={field.type}
                  min={field.min}
                  step={field.step}
                  value={formData[field.key]}
                  onChange={handleInputChange}
                  required={field.required}
                  disabled={isSaving}
                />
              </label>
            ))}

            <label className="field-control file-control" htmlFor="ItemImageFile">
              <span>Item image</span>
              <span className="file-input-shell">
                <Upload size={18} />
                <span>{imageFile ? imageFile.name : 'Choose file'}</span>
                <input
                  id="ItemImageFile"
                  name="ItemImageFile"
                  type="file"
                  accept="image/*"
                  onChange={(event) => setImageFile(event.target.files?.[0] || null)}
                  disabled={isSaving}
                />
              </span>
            </label>
          </div>

          <div className="toggle-grid">
            {inventoryBooleanFields.map((field) => (
              <label className="toggle-control" key={field.key}>
                <input
                  name={field.key}
                  type="checkbox"
                  checked={formData[field.key]}
                  onChange={handleInputChange}
                  disabled={isSaving}
                />
                <span>{field.label}</span>
              </label>
            ))}
          </div>

          {saveStatus === 'error' ? (
            <div className="form-message error" role="alert">
              Could not save inventory item: {saveError}
            </div>
          ) : null}

          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={() => navigate('/inventory')} disabled={isSaving}>
              Cancel
            </button>
            <button className="primary-button inline-action" type="submit" disabled={isSaving}>
              <Save size={18} />
              <span>{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </form>
      </section>
    </AppShell>
  );
}

function App() {
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem(themeStorageKey);

    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<LoginPage theme={theme} onThemeChange={setTheme} />}
        />
        <Route
          path="/dashboard"
          element={<DashboardPage theme={theme} onThemeChange={setTheme} />}
        />
        <Route
          path="/inventory"
          element={<InventoryPage theme={theme} onThemeChange={setTheme} />}
        />
        <Route
          path="/inventory/new"
          element={<InventoryCreatePage theme={theme} onThemeChange={setTheme} />}
        />
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
