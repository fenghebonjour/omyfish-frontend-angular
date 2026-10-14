import { environment } from '../../environments/environment';

// Angular twin of resolveImageUrl in src/lib/api.ts. ProductDto.imageUrl is either an inline
// data: URI (seeded placeholders) or a path relative to the gateway (an uploaded photo, served
// from shop-service's own serve-image endpoint) — this resolves the latter to an absolute URL
// so <img src> doesn't request it against the frontend's own origin instead.
export function resolveImageUrl(url: string): string {
  return url.startsWith('/') ? `${environment.apiBase}${url}` : url;
}
