// Top-level router. Decides between three runtime modes based on the
// hostname or the URL path:
//
//   1. POS subdomain (pos.<host>) → cashier-only PosShell, no admin chrome.
//      Also reachable at /pos/* on the main host so we can demo it without
//      a wildcard DNS setup locally.
//   2. /admin/* → CRM admin shell (RequireAuth + permission-aware sidebar).
//   3. Everything else → public storefront.

import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { LoginPage } from '@/features/auth/LoginPage';
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage';
import { AcceptInvitationPage } from '@/pages/AcceptInvitationPage';
import { RequireAuth, RequirePermission } from '@/features/auth/RequireAuth';
import { AdminShell } from '@/components/layout/AdminShell';
import { StorefrontLayout } from '@/features/storefront/StorefrontLayout';

import { DashboardPage } from '@/pages/DashboardPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { TransfersPage } from '@/pages/TransfersPage';
import { StockRequestsPage } from '@/pages/StockRequestsPage';
import { PrintLabelsPage } from '@/pages/PrintLabelsPage';
import { FinancePage } from '@/pages/FinancePage';
import { CrmPage } from '@/pages/CrmPage';
import { EcommerceAdminPage } from '@/pages/EcommerceAdminPage';
import { WebsiteAdminPage } from '@/pages/WebsiteAdminPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { TeamPage } from '@/pages/TeamPage';
import { CounterPage } from '@/pages/CounterPage';

// POS subdomain app
import { PosShell } from '@/pos-app/PosShell';
import { PosBillingPage } from '@/pos-app/PosBillingPage';
import { ParkedBillsPage } from '@/pos-app/ParkedBillsPage';
import { EstimatesPage } from '@/pos-app/EstimatesPage';
import { RepairsPage } from '@/pos-app/RepairsPage';
import { AdvancesPage } from '@/pos-app/AdvancesPage';
import { CashDrawerPage } from '@/pos-app/CashDrawerPage';
import { PastBillsPage } from '@/pos-app/PastBillsPage';
import { StockRequestPage } from '@/pos-app/StockRequestPage';

import { StorefrontHome } from '@/pages/storefront/StorefrontHome';
import { CollectionPage } from '@/pages/storefront/CollectionPage';
import { ProductDetailPage } from '@/pages/storefront/ProductDetailPage';
import { StorePage } from '@/pages/storefront/StorePage';
import { CartPage } from '@/pages/storefront/CartPage';
import { WishlistPage } from '@/pages/storefront/WishlistPage';
import { AccountPage } from '@/pages/storefront/AccountPage';
import { SearchResultsPage } from '@/pages/storefront/SearchResultsPage';
import { TrackOrderPage } from '@/pages/storefront/TrackOrderPage';
import { OrderSuccessPage } from '@/pages/storefront/OrderSuccessPage';
import { StaticPage } from '@/pages/storefront/StaticPage';
import { BlogIndexPage, BlogDetailPage } from '@/pages/storefront/BlogPage';

const STATIC_PATHS = ['story', 'workshop', 'contact', 'help', 'care', 'hallmark', 'privacy', 'terms'];

/**
 * The POS subdomain has the same Vite bundle as the rest of the app — nginx
 * routes pos.<your-host> here and we detect it at render time. This means a
 * cashier on `pos.yourjewellers.in` never sees admin sidebar, dashboard, etc.
 * The same routes also work at `/pos/*` on the main host for local dev.
 */
export function isPosHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  // pos.localhost (dev), pos.<anything>.in / .com / etc. (prod)
  return h === 'pos.localhost' || h.startsWith('pos.');
}

// Shared POS route subtree — used both for the subdomain (root path) and
// the /pos/* fallback path on the main host.
const posRoutes = [
  {
    element: (
      <RequireAuth>
        <RequirePermission permission="pos.access">
          <PosShell />
        </RequirePermission>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <PosBillingPage /> },
      { path: 'parked', element: <ParkedBillsPage /> },
      { path: 'estimates', element: <EstimatesPage /> },
      { path: 'repairs', element: <RepairsPage /> },
      { path: 'advances', element: <AdvancesPage /> },
      { path: 'cash', element: <CashDrawerPage /> },
      { path: 'bills', element: <PastBillsPage /> },
      { path: 'stock-request', element: <StockRequestPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
];

const POS_HOST_ROUTES = [
  { path: '/login', element: <LoginPage /> },
  { path: '/change-password', element: <RequireAuth><ChangePasswordPage /></RequireAuth> },
  { path: '/', children: posRoutes },
];

const MAIN_HOST_ROUTES = [
  // Storefront at root.
  {
    path: '/',
    element: <StorefrontLayout />,
    children: [
      { index: true, element: <StorefrontHome /> },
      { path: 'collections', element: <CollectionPage /> },
      { path: 'collections/:slug', element: <CollectionPage /> },
      { path: 'products/:slug', element: <ProductDetailPage /> },
      { path: 'locations', element: <StorePage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'wishlist', element: <WishlistPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: 'search', element: <SearchResultsPage /> },
      { path: 'track', element: <TrackOrderPage /> },
      { path: 'track/:id', element: <TrackOrderPage /> },
      { path: 'order/success/:id', element: <OrderSuccessPage /> },
      { path: 'blog', element: <BlogIndexPage /> },
      { path: 'blog/:slug', element: <BlogDetailPage /> },
      ...STATIC_PATHS.map((p) => ({ path: p, element: <StaticPage /> })),
    ],
  },
  // Legacy /store/* paths still work.
  {
    path: '/store',
    element: <StorefrontLayout />,
    children: [
      { index: true, element: <StorefrontHome /> },
      { path: 'collections', element: <CollectionPage /> },
      { path: 'collections/:slug', element: <CollectionPage /> },
      { path: 'products/:slug', element: <ProductDetailPage /> },
      { path: 'locations', element: <StorePage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'wishlist', element: <WishlistPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: 'search', element: <SearchResultsPage /> },
      { path: 'track', element: <TrackOrderPage /> },
      { path: 'track/:id', element: <TrackOrderPage /> },
      { path: 'order/success/:id', element: <OrderSuccessPage /> },
      { path: 'blog', element: <BlogIndexPage /> },
      { path: 'blog/:slug', element: <BlogDetailPage /> },
      ...STATIC_PATHS.map((p) => ({ path: p, element: <StaticPage /> })),
    ],
  },

  // Admin login + password change.
  { path: '/admin/login', element: <LoginPage /> },
  { path: '/admin/change-password', element: <RequireAuth><ChangePasswordPage /></RequireAuth> },

  // Public invitation acceptance — token IS the auth. Server rate-limits the
  // GET/POST so a leaked-link guesser is shut down at the network edge.
  { path: '/accept-invitation/:token', element: <AcceptInvitationPage /> },

  // Admin shell — protected, permission-aware.
  {
    path: '/admin',
    element: (
      <RequireAuth>
        <AdminShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <RequirePermission permission="dashboard.view"><DashboardPage /></RequirePermission> },
      { path: 'inventory', element: <RequirePermission any={['inventory.read', 'inventory.write']}><InventoryPage /></RequirePermission> },
      { path: 'inventory/print-labels', element: <RequirePermission any={['inventory.read', 'inventory.write']}><PrintLabelsPage /></RequirePermission> },
      { path: 'inventory/transfers', element: <RequirePermission any={['inventory.read', 'inventory.transfer']}><TransfersPage /></RequirePermission> },
      { path: 'inventory/stock-requests', element: <RequirePermission any={['inventory.read', 'inventory.transfer']}><StockRequestsPage /></RequirePermission> },
      // Offline-shops monitor: read-only window into every shop's POS
      // (sessions, bills, variances, cashiers). The actual billing surface
      // lives on the POS subdomain — no /admin/pos route by design.
      { path: 'counter', element: <RequirePermission permission="pos.monitor"><CounterPage /></RequirePermission> },
      { path: 'finance', element: <RequirePermission any={['finance.read', 'finance.expense_write']}><FinancePage /></RequirePermission> },
      { path: 'crm', element: <RequirePermission any={['crm.read', 'crm.write']}><CrmPage /></RequirePermission> },
      { path: 'ecommerce', element: <RequirePermission any={['ecommerce.read', 'ecommerce.product_write']}><EcommerceAdminPage /></RequirePermission> },
      { path: 'website', element: <RequirePermission any={['website.read', 'website.write']}><WebsiteAdminPage /></RequirePermission> },
      { path: 'analytics', element: <RequirePermission permission="reports.view"><AnalyticsPage /></RequirePermission> },
      { path: 'team', element: <RequirePermission any={['users.read', 'roles.read']}><TeamPage /></RequirePermission> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },

  // /pos/* on the main host renders the POS app (for local dev without
  // subdomain DNS) — same routes as the subdomain root.
  { path: '/pos', children: posRoutes },

  // Backwards-compat: old /login URL → /admin/login.
  { path: '/login', element: <Navigate to="/admin/login" replace /> },
];

const router = createBrowserRouter(isPosHost() ? POS_HOST_ROUTES : MAIN_HOST_ROUTES);

export function AppRouter(): JSX.Element {
  return <RouterProvider router={router} />;
}
