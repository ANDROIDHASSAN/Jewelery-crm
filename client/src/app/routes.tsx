import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { LoginPage } from '@/features/auth/LoginPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { AdminShell } from '@/components/layout/AdminShell';
import { StorefrontLayout } from '@/features/storefront/StorefrontLayout';

import { DashboardPage } from '@/pages/DashboardPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { PosPage } from '@/pages/PosPage';
import { FinancePage } from '@/pages/FinancePage';
import { CrmPage } from '@/pages/CrmPage';
import { EcommerceAdminPage } from '@/pages/EcommerceAdminPage';
import { WebsiteAdminPage } from '@/pages/WebsiteAdminPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';

import { StorefrontHome } from '@/pages/storefront/StorefrontHome';
import { CollectionPage } from '@/pages/storefront/CollectionPage';
import { ProductDetailPage } from '@/pages/storefront/ProductDetailPage';
import { StorePage } from '@/pages/storefront/StorePage';

const router = createBrowserRouter([
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
    ],
  },
  // Legacy /store/* paths still work (storefront internal links use them).
  {
    path: '/store',
    element: <StorefrontLayout />,
    children: [
      { index: true, element: <StorefrontHome /> },
      { path: 'collections', element: <CollectionPage /> },
      { path: 'collections/:slug', element: <CollectionPage /> },
      { path: 'products/:slug', element: <ProductDetailPage /> },
      { path: 'locations', element: <StorePage /> },
    ],
  },
  // Admin login.
  { path: '/admin/login', element: <LoginPage /> },
  // Admin shell — protected.
  {
    path: '/admin',
    element: (
      <RequireAuth>
        <AdminShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'pos', element: <PosPage /> },
      { path: 'finance', element: <FinancePage /> },
      { path: 'crm', element: <CrmPage /> },
      { path: 'ecommerce', element: <EcommerceAdminPage /> },
      { path: 'website', element: <WebsiteAdminPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
    ],
  },
  // Backwards-compat: old /login URL → /admin/login.
  { path: '/login', element: <Navigate to="/admin/login" replace /> },
]);

export function AppRouter(): JSX.Element {
  return <RouterProvider router={router} />;
}
