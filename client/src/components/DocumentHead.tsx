// DocumentHead — mutates document.title, favicon, and SEO meta tags at
// runtime from the CMS-controlled brand block. Mounted once at the app root
// (inside the Redux Provider, outside the router) so every screen reflects
// the latest CMS values without each page wiring its own <head> updates.
//
// Why runtime mutation instead of static <head> in index.html: the storefront
// content is multi-tenant and CMS-editable. Editing the brand name or
// favicon in Website CMS → Brand must propagate to the browser tab and
// search-engine surface within one publish, not on the next deploy.
import { useEffect } from 'react';
import { useAppSelector } from '@/app/hooks';

export function DocumentHead(): null {
  const brand = useAppSelector((s) => s.storefrontContent.brand);

  useEffect(() => {
    // Title — falls back to brand.name when no explicit siteTitle is set.
    const title = brand.siteTitle?.trim() || brand.name;
    if (title) document.title = title;

    // Favicon — replace the existing <link rel="icon"> href in place so we
    // don't accumulate stale link nodes across re-renders. Create one if
    // missing (paranoid fallback — index.html ships with one).
    const favicon = brand.favicon?.trim();
    if (favicon) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      if (link.href !== favicon) link.href = favicon;
    }

    setMeta('description', brand.metaDescription);
    setMeta('keywords', brand.metaKeywords);

    setMetaProperty('og:title', title);
    setMetaProperty('og:description', brand.metaDescription);
    setMetaProperty('og:image', brand.ogImage);
  }, [
    brand.siteTitle,
    brand.name,
    brand.favicon,
    brand.metaDescription,
    brand.metaKeywords,
    brand.ogImage,
  ]);

  return null;
}

function setMeta(name: string, content: string | undefined): void {
  const value = content?.trim();
  if (!value) return;
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    document.head.appendChild(el);
  }
  if (el.content !== value) el.content = value;
}

function setMetaProperty(property: string, content: string | undefined): void {
  const value = content?.trim();
  if (!value) return;
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  if (el.content !== value) el.content = value;
}
