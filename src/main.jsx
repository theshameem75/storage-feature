import React, { useEffect, useRef, useState } from 'react';
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
  Building2,
  ChevronDown,
  Boxes,
  CircleCheck,
  KeyRound,
  Languages,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sun,
  Upload,
  UserCircle,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './i18n';
import './styles.css';
import {
  handleAuthorizationCallback,
  logout as oidcLogout,
  refreshSession,
  startAuthorization,
} from './services/auth';

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
const dataGatewayUrl = `${localizationBaseUrl.replace(/\/$/, '')}/data/v4/gateway`;
const filesUploadUrl = `${localizationBaseUrl.replace(/\/$/, '')}/data/v4/Files/GetPreSignedUrlForUpload`;
const authBaseUrl =
  import.meta.env.VITE_OIDC_API_URL ||
  import.meta.env.VITE_API_URL ||
  `${localizationBaseUrl.replace(/\/$/, '')}/iam/v4`;
const authTenantId =
  import.meta.env.VITE_OIDC_TENANT_ID ||
  import.meta.env.VITE_TENANT_ID ||
  import.meta.env.VITE_X_BLOCKS_KEY ||
  '';

const iamBaseUrl = `${localizationBaseUrl.replace(/\/$/, '')}/iam/v4/iam`;
const themeStorageKey = 'blocks-os-theme';
const orgStorageKey = 'blocks-os-org';

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

function getCommonHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-blocks-key': import.meta.env.VITE_X_BLOCKS_KEY,
  };
}

async function iamFetch(url, init = {}, retried = false) {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      ...getCommonHeaders(),
      ...init.headers,
    },
  });

  if (response.status === 401 && !retried) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return iamFetch(url, init, true);
    }
    window.location.replace('/');
  }

  return response;
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

  const response = await fetch(filesUploadUrl, {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'text/plain',
      ...getCommonHeaders(),
    },
    body: JSON.stringify({
      metaData: '',
      name: file.name,
      parentDirectoryId: '',
      tags: '',
      accessModifier: 'Public',
      projectKey: import.meta.env.VITE_X_BLOCKS_KEY,
      moduleName: 11,
      configurationName: 'Default',
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
    headers: {
      ...(file.type ? { 'Content-Type': file.type } : {}),
      'x-ms-blob-type': 'BlockBlob',
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error(`File upload failed with status ${uploadResponse.status}`);
  }

  const uploadedFileId = initialFileId;

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

  const response = await fetch(dataGatewayUrl, {
    method: 'POST',
    credentials: 'include',
    headers: getCommonHeaders(),
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

function OrgSwitcher({ selectedOrgId, onOrgChange }) {
  const [orgs, setOrgs] = useState([]);
  const [open, setOpen] = useState(false);
  const selectedOrg = orgs.find((o) => o.itemId === selectedOrgId);

  useEffect(() => {
    const controller = new AbortController();

    async function loadOrgs() {
      try {
        const resp = await iamFetch(`${iamBaseUrl}/organizations/my`, {
          signal: controller.signal,
        });

        if (!resp.ok) {
          return;
        }

        const data = await resp.json();
        const list = data.organizations || [];
        setOrgs(list);

        if (!selectedOrgId && list.length > 0) {
          onOrgChange(list[0].itemId);
        }
      } catch {
        // ignore
      }
    }

    loadOrgs();

    return () => controller.abort();
  }, []);

  if (orgs.length === 0) {
    return null;
  }

  function handleSelect(orgId) {
    setOpen(false);
    onOrgChange(orgId);
  }

  return (
    <div className="org-switcher-menu">
      <button
        className="profile-button org-button"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Building2 size={18} aria-hidden="true" />
        <span className="org-button-name">{selectedOrg?.name || 'Organization'}</span>
        <ChevronDown size={16} />
      </button>

      {open ? (
        <div className="profile-dropdown org-dropdown" role="menu">
          <p className="dropdown-label">Switch organization</p>
          {orgs.map((org) => (
            <button
              key={org.itemId}
              type="button"
              role="menuitem"
              className={org.itemId === selectedOrgId ? 'active' : ''}
              onClick={() => handleSelect(org.itemId)}
            >
              <Building2 size={15} />
              {org.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LanguageSelector() {
  const { i18n } = useTranslation();
  const [languages, setLanguages] = useState([]);
  const [languageStatus, setLanguageStatus] = useState('loading');
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language || 'en-US');
  const [languageOpen, setLanguageOpen] = useState(false);

  const selectedLanguageLabel =
    languages.find((language) => language.languageCode === selectedLanguage)?.languageName ||
    selectedLanguage;

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
          await Promise.all([
            loadLocalizationModule(i18n, defaultLanguage.languageCode, 'common', controller.signal),
            loadLocalizationModule(
              i18n,
              defaultLanguage.languageCode,
              'inventory',
              controller.signal,
            ),
          ]);
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

  async function handleLanguageChange(nextLanguage) {
    setLanguageOpen(false);

    if (!nextLanguage || nextLanguage === selectedLanguage) {
      return;
    }

    setSelectedLanguage(nextLanguage);
    localStorage.setItem('blocks-os-language', nextLanguage);

    try {
      await Promise.all([
        loadLocalizationModule(i18n, nextLanguage, 'common'),
        loadLocalizationModule(i18n, nextLanguage, 'inventory'),
      ]);
    } catch (error) {
      console.error(error);
    } finally {
      i18n.changeLanguage(nextLanguage);
    }
  }

  return (
    <div className="language-menu">
      <button
        className="profile-button language-button"
        type="button"
        aria-label="Language"
        aria-haspopup="menu"
        aria-expanded={languageOpen}
        disabled={languageStatus !== 'ready' || languages.length === 0}
        onClick={() => setLanguageOpen((isOpen) => !isOpen)}
      >
        <Languages size={18} aria-hidden="true" />
        <span>{languageStatus === 'ready' ? selectedLanguageLabel : 'Language'}</span>
        <ChevronDown size={16} />
      </button>

      {languageOpen ? (
        <div className="profile-dropdown language-dropdown" role="menu">
          {languages.map((language) => (
            <button
              key={language.languageCode}
              className={language.languageCode === selectedLanguage ? 'active' : ''}
              type="button"
              role="menuitem"
              onClick={() => handleLanguageChange(language.languageCode)}
            >
              <span className="language-option-code">{language.languageCode}</span>
              <span>
                {language.languageName}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
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
  const { t } = useTranslation();
  const [loginStatus, setLoginStatus] = useState('idle');
  const [loginError, setLoginError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setLoginStatus('loading');
    setLoginError('');

    try {
      await startAuthorization();
    } catch (error) {
      setLoginError(error.message || 'Login failed');
      setLoginStatus('error');
    }
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
          {loginStatus === 'error' ? (
            <div className="form-message error" role="alert">
              {loginError}
            </div>
          ) : null}

          <button className="primary-button" type="submit" disabled={loginStatus === 'loading'}>
            <LogIn size={18} />
            <span>
              {loginStatus === 'loading'
                ? t('auth.signingIn', { defaultValue: 'Signing in...' })
                : t('auth.login', { defaultValue: 'Login' })}
            </span>
          </button>
        </form>
      </section>
    </main>
  );
}

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) {
      return undefined;
    }

    hasProcessed.current = true;
    let isMounted = true;

    async function completeSignIn() {
      try {
        await handleAuthorizationCallback();
        navigate('/dashboard', { replace: true });
      } catch (callbackError) {
        if (!isMounted) {
          return;
        }

        setError(callbackError.message || 'Authentication failed');
        window.setTimeout(() => navigate('/', { replace: true }), 3000);
      }
    }

    completeSignIn();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return (
    <main className="callback-page">
      {error ? (
        <div className="form-message error callback-message" role="alert">
          <strong>{error}</strong>
          <span>Redirecting to login...</span>
        </div>
      ) : (
        <>
          <div className="spinner" aria-hidden="true" />
          <p>Completing sign in...</p>
        </>
      )}
    </main>
  );
}

function ActivationPage({ theme, onThemeChange }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const searchParams = new URLSearchParams(window.location.search);
  const code = searchParams.get('code') || '';
  const languageCode = searchParams.get('lang') || '';
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [activationStatus, setActivationStatus] = useState('idle');
  const [activationError, setActivationError] = useState('');

  const isActivating = activationStatus === 'loading';
  const isActivated = activationStatus === 'success';

  async function handleSubmit(event) {
    event.preventDefault();
    setActivationError('');

    if (password.length < 8) {
      setActivationError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setActivationError('Passwords do not match');
      return;
    }

    setActivationStatus('loading');

    try {
      const response = await fetch(`${authBaseUrl}/auth/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-blocks-key': authTenantId,
        },
        body: JSON.stringify({
          code,
          password,
          firstName,
          lastName,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Activation failed. Please check your code and try again.');
      }

      setActivationStatus('success');
      window.setTimeout(() => navigate('/', { replace: true }), 3000);
    } catch (error) {
      setActivationError(error.message || 'Network error. Please try again.');
      setActivationStatus('error');
    }
  }

  return (
    <main className="login-shell activation-shell">
      <div className="login-theme-action">
        <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
      </div>

      <section className="login-panel activation-panel" aria-labelledby="activation-title">
        <div className="brand-lockup">
          <span className="brand-mark">
            {isActivated ? <CircleCheck size={26} /> : <KeyRound size={26} />}
          </span>
          <div>
            <p className="eyebrow">
              {t('auth.activation', { defaultValue: 'Account activation' })}
            </p>
            <h1 id="activation-title">
              {isActivated
                ? t('auth.activated', { defaultValue: 'Account activated' })
                : t('auth.setPassword', { defaultValue: 'Set password' })}
            </h1>
          </div>
        </div>

        {!code ? (
          <div className="form-message error" role="alert">
            Invalid activation link. Please check your email for the correct link.
          </div>
        ) : null}

        {isActivated ? (
          <div className="activation-success" role="status">
            <CircleCheck size={48} />
            <strong>Account Activated!</strong>
            <span>Redirecting you to login...</span>
          </div>
        ) : null}

        {code && !isActivated ? (
          <form className="login-form activation-form" onSubmit={handleSubmit}>
            {languageCode ? (
              <input type="hidden" name="lang" value={languageCode} readOnly />
            ) : null}

            <div className="activation-name-grid">
              <label htmlFor="firstName">
                <span>First name</span>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  disabled={isActivating}
                  required
                />
              </label>

              <label htmlFor="lastName">
                <span>Last name</span>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  disabled={isActivating}
                  required
                />
              </label>
            </div>

            <label htmlFor="activationPassword">
              <span>Password</span>
              <input
                id="activationPassword"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isActivating}
                required
              />
            </label>

            <label htmlFor="confirmActivationPassword">
              <span>Confirm password</span>
              <input
                id="confirmActivationPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={isActivating}
                required
              />
            </label>

            {activationError ? (
              <div className="form-message error" role="alert">
                {activationError}
              </div>
            ) : null}

            <button className="primary-button" type="submit" disabled={isActivating}>
              <KeyRound size={18} />
              <span>{isActivating ? 'Activating...' : 'Activate Account'}</span>
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

function AppShell({ children, theme, onThemeChange, selectedOrgId, onOrgChange }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    const controller = new AbortController();

    async function loadMe() {
      try {
        const resp = await iamFetch(`${iamBaseUrl}/me`, {
          signal: controller.signal,
        });

        if (!resp.ok) {
          return;
        }

        const data = await resp.json();
        setCurrentUser(data.data || null);
      } catch {
        // ignore
      }
    }

    loadMe();

    return () => controller.abort();
  }, []);

  async function handleLogout() {
    await oidcLogout();
    navigate('/', { replace: true });
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  const displayName = currentUser
    ? [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ') || currentUser.email
    : t('profile.name', { defaultValue: 'Account' });

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
          <span>Built with Blocks OS</span>
        </div>

        <div className="topbar-actions">
          <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
          <LanguageSelector />

          {onOrgChange ? (
            <OrgSwitcher selectedOrgId={selectedOrgId} onOrgChange={onOrgChange} />
          ) : null}

          <div className="profile-menu">
            <button
              className="profile-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen((isOpen) => !isOpen)}
            >
              <UserCircle size={22} />
              <span>{displayName}</span>
              <ChevronDown size={16} />
            </button>

            {profileOpen ? (
              <div className="profile-dropdown" role="menu">
                {currentUser?.email ? (
                  <p className="dropdown-label">{currentUser.email}</p>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setProfileOpen(false); navigate('/profile'); }}
                >
                  <UserCircle size={16} />
                  {t('profile.myProfile', { defaultValue: 'My profile' })}
                </button>
                <button type="button" role="menuitem" onClick={handleLogout}>
                  <LogOut size={16} />
                  {t('LOGOUT', { ns: 'common', defaultValue: 'Log out' })}
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
              <LayoutDashboard size={19} />
              <span>Dashboard</span>
            </NavLink>
            <NavLink
              className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}
              to="/iam"
              onClick={closeDrawer}
            >
              <ShieldCheck size={19} />
              <span>{t('IAM_DRAWER', { ns: 'common', defaultValue: 'IAM' })}</span>
            </NavLink>
            <NavLink
              className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}
              to="/inventory"
              onClick={closeDrawer}
            >
              <Boxes size={19} />
              <span>{t('INVENTORY_DRAWER', { ns: 'common', defaultValue: 'Inventory' })}</span>
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
  const { t, i18n } = useTranslation('inventory');
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryMeta, setInventoryMeta] = useState(null);
  const [inventoryStatus, setInventoryStatus] = useState('loading');
  const [inventoryError, setInventoryError] = useState('');

  useEffect(() => {
    loadLocalizationModule(i18n, i18n.language, 'inventory').catch((error) => {
      console.error(error);
    });
  }, [i18n, i18n.language]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInventory() {
      setInventoryStatus('loading');
      setInventoryError('');

      try {
        const response = await fetch(dataGatewayUrl, {
          method: 'POST',
          credentials: 'include',
          headers: getCommonHeaders(),
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
          <h1>{t('TITLE', { defaultValue: 'Items' })}</h1>
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

function IAMPage({ theme, onThemeChange, selectedOrgId, onOrgChange }) {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [iamStatus, setIamStatus] = useState('loading');
  const [iamError, setIamError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [selectedOrgId, debouncedSearch]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsers() {
      setIamStatus('loading');
      setIamError('');

      try {
        const resp = await iamFetch(`${iamBaseUrl}/users`, {
          method: 'POST',
          body: JSON.stringify({
            page,
            pageSize: 20,
            sort: { property: 'email', isDescending: false },
            filter: {
              name: debouncedSearch,
              email: '',
              userIds: [],
              org_id: selectedOrgId || '',
            },
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          throw new Error(`Request failed with status ${resp.status}`);
        }

        const payload = await resp.json();

        if (payload.errors?.length) {
          throw new Error(payload.errors[0].message || 'Failed to load users');
        }

        setUsers(payload.data || []);
        setTotalCount(payload.totalCount || 0);
        setIamStatus('ready');
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }

        setIamError(error.message);
        setIamStatus('error');
      }
    }

    loadUsers();

    return () => controller.abort();
  }, [page, debouncedSearch, selectedOrgId]);

  const totalPages = Math.ceil(totalCount / 20);

  const userColumns = [
    { key: 'firstName', label: 'First name' },
    { key: 'lastName', label: 'Last name' },
    { key: 'email', label: 'Email' },
    { key: 'phoneNumber', label: 'Phone' },
    { key: 'active', label: 'Status' },
    { key: 'roles', label: 'Roles' },
  ];

  function renderUserCell(key, value) {
    if (key === 'active') {
      return (
        <span className={`status-badge ${value ? 'status-active' : 'status-inactive'}`}>
          {value ? 'Active' : 'Inactive'}
        </span>
      );
    }

    if (key === 'roles') {
      return Array.isArray(value) && value.length > 0 ? value.join(', ') : '-';
    }

    return value !== null && value !== undefined && value !== '' ? String(value) : '-';
  }

  return (
    <AppShell theme={theme} onThemeChange={onThemeChange} selectedOrgId={selectedOrgId} onOrgChange={onOrgChange}>
      <section className="workspace-head">
        <div>
          <p className="eyebrow">IAM</p>
          <h1>Users</h1>
        </div>
        <button
          className="primary-button inline-action"
          type="button"
          onClick={() => navigate('/iam/new')}
        >
          <UserPlus size={18} />
          <span>Add user</span>
        </button>
      </section>

      <section className="table-section" aria-labelledby="iam-users-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">Identity &amp; access management</p>
            <h2 id="iam-users-title">User list</h2>
          </div>
          <div className="section-actions">
            <label className="search-control" htmlFor="iam-search">
              <Search size={16} aria-hidden="true" />
              <input
                id="iam-search"
                type="search"
                placeholder="Search by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {totalCount > 0 ? (
              <span className="page-pill">{totalCount} user{totalCount !== 1 ? 's' : ''}</span>
            ) : null}
          </div>
        </div>

        {iamStatus === 'loading' ? (
          <div className="table-state">Loading users...</div>
        ) : null}

        {iamStatus === 'error' ? (
          <div className="table-state error">Could not load users: {iamError}</div>
        ) : null}

        {iamStatus === 'ready' ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {userColumns.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length > 0 ? (
                  users.map((user) => (
                    <tr key={user.itemId || user.email}>
                      {userColumns.map((col) => (
                        <td key={col.key}>{renderUserCell(col.key, user[col.key])}</td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={userColumns.length} style={{ textAlign: 'center' }}>
                      {debouncedSearch ? `No users match "${debouncedSearch}".` : 'No users found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {iamStatus === 'ready' && totalPages > 1 ? (
          <div className="pagination-row">
            <button
              className="secondary-button inline-action"
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="page-pill">Page {page + 1} of {totalPages}</span>
            <button
              className="secondary-button inline-action"
              type="button"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function IAMCreatePage({ theme, onThemeChange, selectedOrgId, onOrgChange }) {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState([]);
  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    password: '',
    organizationId: selectedOrgId || '',
  });
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError, setSaveError] = useState('');

  const isSaving = saveStatus === 'saving';

  useEffect(() => {
    const controller = new AbortController();

    async function loadOrgs() {
      try {
        const resp = await iamFetch(
          `${iamBaseUrl}/organizations?Page=0&PageSize=100&Sort.Property=name&Sort.IsDescending=false`,
          { signal: controller.signal },
        );

        if (!resp.ok) {
          // Fallback to my orgs
          const myResp = await iamFetch(`${iamBaseUrl}/organizations/my`, {
            signal: controller.signal,
          });

          if (!myResp.ok) {
            return;
          }

          const myData = await myResp.json();
          setOrgs(myData.organizations || []);
          return;
        }

        const data = await resp.json();
        setOrgs(data.organizations || []);
      } catch {
        // ignore
      }
    }

    loadOrgs();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (selectedOrgId && !form.organizationId) {
      setForm((f) => ({ ...f, organizationId: selectedOrgId }));
    }
  }, [selectedOrgId]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaveStatus('saving');
    setSaveError('');

    try {
      const body = {
        email: form.email,
        userName: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        phoneNumber: form.phoneNumber,
        organizationId: form.organizationId,
        userPassType: form.password ? 2 : 1,
        userCreationType: 1,
        verifiedType: 1,
        userMfaType: 1,
        mfaEnabled: false,
        allowedLogInType: [1],
        roles: [],
        permissions: [],
        attributes: {},
      };

      if (form.password) {
        body.password = form.password;
      }

      const resp = await iamFetch(`${iamBaseUrl}/users/create`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        const msg =
          (data.errors && typeof data.errors === 'object'
            ? Object.values(data.errors).flat().join(', ')
            : null) ||
          data.message ||
          `Request failed with status ${resp.status}`;
        throw new Error(msg);
      }

      const payload = await resp.json();

      if (payload.errors?.length) {
        throw new Error(payload.errors[0].message || 'User creation failed');
      }

      navigate('/iam');
    } catch (error) {
      setSaveError(error.message);
      setSaveStatus('error');
    }
  }

  return (
    <AppShell theme={theme} onThemeChange={onThemeChange} selectedOrgId={selectedOrgId} onOrgChange={onOrgChange}>
      <section className="workspace-head">
        <div>
          <p className="eyebrow">IAM</p>
          <h1>Add user</h1>
        </div>
        <button
          className="secondary-button inline-action"
          type="button"
          onClick={() => navigate('/iam')}
        >
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>
      </section>

      <section className="form-section" aria-labelledby="iam-create-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">New user</p>
            <h2 id="iam-create-title">User details</h2>
          </div>
        </div>

        <form className="inventory-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="field-control" htmlFor="iam-email">
              <span>Email address *</span>
              <input
                id="iam-email"
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                required
                disabled={isSaving}
              />
            </label>

            <label className="field-control" htmlFor="iam-org">
              <span>Organization</span>
              <select
                id="iam-org"
                name="organizationId"
                className="field-select"
                value={form.organizationId}
                onChange={handleChange}
                disabled={isSaving}
              >
                <option value="">— Select organization —</option>
                {orgs.map((org) => (
                  <option key={org.itemId} value={org.itemId}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-control" htmlFor="iam-firstName">
              <span>First name</span>
              <input
                id="iam-firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                value={form.firstName}
                onChange={handleChange}
                disabled={isSaving}
              />
            </label>

            <label className="field-control" htmlFor="iam-lastName">
              <span>Last name</span>
              <input
                id="iam-lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                value={form.lastName}
                onChange={handleChange}
                disabled={isSaving}
              />
            </label>

            <label className="field-control" htmlFor="iam-phone">
              <span>Phone number</span>
              <input
                id="iam-phone"
                name="phoneNumber"
                type="tel"
                autoComplete="tel"
                value={form.phoneNumber}
                onChange={handleChange}
                disabled={isSaving}
              />
            </label>

            <label className="field-control" htmlFor="iam-password">
              <span>Password <small className="field-hint">(leave blank to send activation email)</small></span>
              <input
                id="iam-password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={handleChange}
                disabled={isSaving}
              />
            </label>
          </div>

          {saveStatus === 'error' ? (
            <div className="form-message error" role="alert">
              Could not create user: {saveError}
            </div>
          ) : null}

          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => navigate('/iam')}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button className="primary-button inline-action" type="submit" disabled={isSaving}>
              <Users size={18} />
              <span>{isSaving ? 'Creating...' : 'Create user'}</span>
            </button>
          </div>
        </form>
      </section>
    </AppShell>
  );
}

function ProfilePage({ theme, onThemeChange, selectedOrgId, onOrgChange }) {
  const [me, setMe] = useState(null);
  const [profileStatus, setProfileStatus] = useState('loading');
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadMe() {
      setProfileStatus('loading');
      setProfileError('');

      try {
        const resp = await iamFetch(`${iamBaseUrl}/me`, { signal: controller.signal });

        if (!resp.ok) {
          throw new Error(`Request failed with status ${resp.status}`);
        }

        const payload = await resp.json();

        if (payload.errors?.length) {
          throw new Error(payload.errors[0].message || 'Could not load profile');
        }

        setMe(payload.data || null);
        setProfileStatus('ready');
      } catch (error) {
        if (error.name === 'AbortError') return;
        setProfileError(error.message);
        setProfileStatus('error');
      }
    }

    loadMe();
    return () => controller.abort();
  }, []);

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  }

  return (
    <AppShell theme={theme} onThemeChange={onThemeChange} selectedOrgId={selectedOrgId} onOrgChange={onOrgChange}>
      <section className="workspace-head">
        <div>
          <p className="eyebrow">Account</p>
          <h1>My profile</h1>
        </div>
      </section>

      {profileStatus === 'loading' ? (
        <div className="table-state">Loading profile...</div>
      ) : null}

      {profileStatus === 'error' ? (
        <div className="table-state error">Could not load profile: {profileError}</div>
      ) : null}

      {profileStatus === 'ready' && me ? (
        <div className="profile-sections">
          <section className="profile-card" aria-labelledby="profile-identity">
            <h2 id="profile-identity">Identity</h2>
            <dl className="profile-dl">
              <div className="profile-row">
                <dt>Name</dt>
                <dd>{[me.firstName, me.lastName].filter(Boolean).join(' ') || '—'}</dd>
              </div>
              <div className="profile-row">
                <dt>Email</dt>
                <dd>{me.email || '—'}</dd>
              </div>
              <div className="profile-row">
                <dt>Phone</dt>
                <dd>{me.phoneNumber || '—'}</dd>
              </div>
              <div className="profile-row">
                <dt>Status</dt>
                <dd>
                  <span className={`status-badge ${me.active ? 'status-active' : 'status-inactive'}`}>
                    {me.active ? 'Active' : 'Inactive'}
                  </span>
                </dd>
              </div>
              <div className="profile-row">
                <dt>Verified</dt>
                <dd>
                  <span className={`status-badge ${me.isVerified ? 'status-active' : 'status-inactive'}`}>
                    {me.isVerified ? 'Verified' : 'Unverified'}
                  </span>
                </dd>
              </div>
            </dl>
          </section>

          <section className="profile-card" aria-labelledby="profile-access">
            <h2 id="profile-access">Roles &amp; permissions</h2>
            <dl className="profile-dl">
              <div className="profile-row">
                <dt>Roles</dt>
                <dd>
                  {me.roles?.length ? (
                    <div className="tag-list">
                      {me.roles.map((r) => <span key={r} className="tag">{r}</span>)}
                    </div>
                  ) : '—'}
                </dd>
              </div>
              <div className="profile-row">
                <dt>Permissions</dt>
                <dd>
                  {me.permissions?.length ? (
                    <div className="tag-list">
                      {me.permissions.map((p) => <span key={p} className="tag">{p}</span>)}
                    </div>
                  ) : '—'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="profile-card" aria-labelledby="profile-security">
            <h2 id="profile-security">Security &amp; activity</h2>
            <dl className="profile-dl">
              <div className="profile-row">
                <dt>MFA enabled</dt>
                <dd>
                  <span className={`status-badge ${me.mfaEnabled ? 'status-active' : 'status-inactive'}`}>
                    {me.mfaEnabled ? 'On' : 'Off'}
                  </span>
                </dd>
              </div>
              <div className="profile-row">
                <dt>Login count</dt>
                <dd>{me.logInCount ?? '—'}</dd>
              </div>
              <div className="profile-row">
                <dt>Last login</dt>
                <dd>{formatDate(me.lastLoggedInTime)}</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}
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

  const [selectedOrgId, setSelectedOrgId] = useState(
    () => localStorage.getItem(orgStorageKey) || '',
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  function handleOrgChange(orgId) {
    setSelectedOrgId(orgId);
    localStorage.setItem(orgStorageKey, orgId);
  }

  const sharedProps = { theme, onThemeChange: setTheme, selectedOrgId, onOrgChange: handleOrgChange };

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<LoginPage theme={theme} onThemeChange={setTheme} />}
        />
        <Route path="/callback" element={<AuthCallbackPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route
          path="/activate"
          element={<ActivationPage theme={theme} onThemeChange={setTheme} />}
        />
        <Route
          path="/dashboard"
          element={<DashboardPage theme={theme} onThemeChange={setTheme} />}
        />
        <Route
          path="/profile"
          element={<ProfilePage {...sharedProps} />}
        />
        <Route
          path="/iam"
          element={<IAMPage {...sharedProps} />}
        />
        <Route
          path="/iam/new"
          element={<IAMCreatePage {...sharedProps} />}
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
