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
  ChevronDown,
  Boxes,
  LogOut,
  Menu,
  ShieldCheck,
  UserCircle,
  X,
} from 'lucide-react';
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

function LoginPage() {
  const navigate = useNavigate();

  function handleSubmit(event) {
    event.preventDefault();
    navigate('/dashboard');
  }

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="brand-lockup">
          <span className="brand-mark">B</span>
          <div>
            <p className="eyebrow">Blocks OS</p>
            <h1 id="login-title">Sign in</h1>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="username">Username</label>
          <input id="username" name="username" type="text" autoComplete="username" />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
          />

          <button className="primary-button" type="submit">
            Login
          </button>
        </form>
      </section>
    </main>
  );
}

function AppShell({ children }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();

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

        <div className="profile-menu">
          <button
            className="profile-button"
            type="button"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((isOpen) => !isOpen)}
          >
            <UserCircle size={22} />
            <span>Meraj Admin</span>
            <ChevronDown size={16} />
          </button>

          {profileOpen ? (
            <div className="profile-dropdown" role="menu">
              <button type="button" role="menuitem" onClick={() => setProfileOpen(false)}>
                My Profile
              </button>
              <button type="button" role="menuitem" onClick={handleLogout}>
                <LogOut size={16} />
                log out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="dashboard-layout">
        <aside className={`sidebar ${drawerOpen ? 'open' : ''}`} aria-label="Dashboard menu">
          <div className="sidebar-mobile-head">
            <span>Menu</span>
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
              <span>IAM</span>
            </NavLink>
            <NavLink
              className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}
              to="/inventory"
              onClick={closeDrawer}
            >
              <Boxes size={19} />
              <span>Inventory</span>
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

function DashboardPage() {
  return (
    <AppShell>
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

function InventoryPage() {
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
          headers: {
            'Content-Type': 'application/json',
            'x-blocks-key': import.meta.env.VITE_X_BLOCKS_KEY,
          },
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
    <AppShell>
      <section className="workspace-head">
        <p className="eyebrow">Inventory</p>
        <h1>Items</h1>
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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
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
