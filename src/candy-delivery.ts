// T19 — DoorDash candy checkout: pluggable delivery backend.
//
// Short version:
// DoorDash's only public API ("Drive") is merchant-facing courier dispatch,
// not consumer order placement, and there is no documented consumer-order
// endpoint for arbitrary DoorDash storefronts. The only ToS-safe, zero-auth
// integration is a deep-link handoff to DoorDash's own search UI -- the user
// finishes (and pays for) the real order themselves.
//
// This is defined behind a small adapter interface specifically so a later
// ticket can swap in a real ordering API (Instacart's Developer Platform has
// a documented product/cart-link endpoint and is the strongest candidate --
// see the research notes) without touching the checkout flow that calls it.
import { openUrl } from '@tauri-apps/plugin-opener';

export interface CandyOrderItem {
  id: string;
  name: string;
  size: string;
  qty: number;
}

export interface CandyOrderResult {
  ok: boolean;
  /** Short status line safe to show in the checkout overlay / console log. */
  message: string;
  /** The URL that was (or would have been) opened, for display/logging. */
  url: string;
}

export interface CandyDeliveryAdapter {
  /** Human-readable name shown in logs/UI. */
  readonly name: string;
  /** Hand off `items` (with a best-effort ZIP) to the backend. Never throws. */
  order(items: CandyOrderItem[], zip: string): Promise<CandyOrderResult>;
}

function describeItems(items: CandyOrderItem[]): string {
  return items.map((i) => `${i.qty}x ${i.name} (${i.size})`).join(', ');
}

/**
 * Default backend: builds a DoorDash storefront search URL for the chosen
 * candy names and opens it via the Tauri opener plugin (the system's default
 * browser), so the user lands on DoorDash's own search results near their
 * ZIP and completes checkout there -- no payment or account data ever
 * touches this app. Degrades gracefully (logs + returns ok:false) if the
 * opener plugin isn't available, e.g. running in a plain browser tab during
 * development rather than the packaged Tauri app.
 */
export class DoorDashDeepLinkAdapter implements CandyDeliveryAdapter {
  readonly name = 'DoorDash (deep link)';

  buildUrl(items: CandyOrderItem[], zip: string): string {
    const query = items.map((i) => i.name).join(', ');
    const params = new URLSearchParams();
    if (zip.trim()) params.set('address', zip.trim());
    const qs = params.toString();
    return `https://www.doordash.com/search/store/${encodeURIComponent(query)}/${qs ? `?${qs}` : ''}`;
  }

  async order(items: CandyOrderItem[], zip: string): Promise<CandyOrderResult> {
    const url = this.buildUrl(items, zip);
    console.log(`[CandyDelivery] ${this.name}: ${describeItems(items)} -> ${url}`);
    try {
      await openUrl(url);
      return { ok: true, message: `Opened DoorDash search for: ${describeItems(items)}`, url };
    } catch (err) {
      console.warn('[CandyDelivery] Could not open the system browser (opener plugin unavailable); order logged only.', err);
      return { ok: false, message: `Couldn't open a browser automatically. Search DoorDash for: ${describeItems(items)}`, url };
    }
  }
}

const activeAdapter: CandyDeliveryAdapter = new DoorDashDeepLinkAdapter();

export function getCandyDeliveryAdapter(): CandyDeliveryAdapter {
  return activeAdapter;
}
