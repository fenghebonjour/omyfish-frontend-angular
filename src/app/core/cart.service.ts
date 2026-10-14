import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import type { CartDto } from './models';
import { peekGuestCartToken } from './guest-cart';

/**
 * Angular twin of contexts/CartContext.tsx — tracks the cart item count shown as a badge on the
 * nav Cart link, plus a short-lived toast message shown after a successful add-to-cart.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  count = signal(0);
  toastMessage = signal<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.auth.ready.then(() => {
      const guestCartToken = this.auth.isAuthenticated() ? undefined : peekGuestCartToken();
      if (!this.auth.isAuthenticated() && !guestCartToken) return;
      firstValueFrom(this.api.shop.cart.get(guestCartToken ?? undefined))
        .then((cart) => this.applyCart(cart))
        .catch(() => {});
    });
  }

  // Re-derives the badge count from a CartDto a component already fetched/mutated, avoiding a
  // redundant round trip to GET /cart.
  applyCart(cart: CartDto): void {
    this.count.set(cart.items.reduce((sum, item) => sum + item.quantity, 0));
  }

  notify(message: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastMessage.set(message);
    this.toastTimer = setTimeout(() => this.toastMessage.set(null), 2500);
  }
}
