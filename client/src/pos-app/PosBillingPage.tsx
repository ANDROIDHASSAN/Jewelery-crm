// Gold-OS style billing surface for the POS subdomain. Wraps the OpenRegister
// gate so the cashier must count opening float before any billing happens.
//
// The old admin-shell PosPage is no longer routed (we removed /admin/pos when
// POS moved fully to the subdomain) — this counter page is the canonical
// billing screen for cashiers.

export { PosCounterPage as PosBillingPage } from './PosCounterPage';
