// Deterministic slug from a display name — shared by the server (deriving
// Category slugs for storefront /store/collections/<slug> URLs) and the client
// CMS (auto-filling tile slugs from their label). Keeping ONE implementation
// means the URL a homepage tile links to and the slug a Category resolves to
// can never drift apart, which is exactly the class of bug that left a
// "Necklaces & Chains" tile pointing at an empty page.
//
// "NECKLACES & CHAINS" → "necklaces-chains"; "9KT Fine Gold" → "9kt-fine-gold".
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
