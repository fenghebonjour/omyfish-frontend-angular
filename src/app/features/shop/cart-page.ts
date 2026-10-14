import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { CartService } from '../../core/cart.service';
import type { CartDto, ProductDto } from '../../core/models';
import { errorMessage } from '../../core/http-error.util';
import { getOrCreateGuestCartToken } from '../../core/guest-cart';
import { resolveImageUrl } from '../../core/image-url.util';

/** Angular twin of app/cart/page.tsx — open to guests (no authGuard); checkout accepts either
 * an account token or a guest email. */
@Component({
  selector: 'app-cart-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './cart-page.html',
})
export class CartPage {
  auth = inject(AuthService);
  private api = inject(ApiService);
  private cartBadge = inject(CartService);

  cart = signal<CartDto | null>(null);
  products = signal<Record<string, ProductDto>>({});
  loading = signal(true);
  error = signal<string | null>(null);
  checkingOut = signal(false);
  guestEmail = '';

  items = computed(() => this.cart()?.items ?? []);
  totalCents = computed(() =>
    this.items().reduce((sum, item) => {
      const product = this.products()[item.productId];
      return sum + (product ? product.priceCents * item.quantity : 0);
    }, 0),
  );

  constructor() {
    this.auth.ready
      .then(() => {
        const guestCartToken = this.auth.isAuthenticated() ? undefined : getOrCreateGuestCartToken();
        return Promise.all([
          firstValueFrom(this.api.shop.cart.get(guestCartToken)),
          firstValueFrom(this.api.shop.products.getAll()),
        ]);
      })
      .then(([cart, productList]) => {
        this.cart.set(cart);
        this.cartBadge.applyCart(cart);
        this.products.set(Object.fromEntries(productList.map((p) => [p.id, p])));
      })
      .catch((e) => this.error.set(errorMessage(e)))
      .finally(() => this.loading.set(false));
  }

  async updateQuantity(productId: string, quantity: number): Promise<void> {
    try {
      const guestCartToken = this.auth.isAuthenticated() ? undefined : getOrCreateGuestCartToken();
      const updated = await firstValueFrom(
        this.api.shop.cart.updateItem(productId, Math.max(0, quantity), guestCartToken),
      );
      this.cart.set(updated);
      this.cartBadge.applyCart(updated);
    } catch (e) {
      alert('Could not update cart: ' + errorMessage(e));
    }
  }

  onQuantityChange(productId: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.updateQuantity(productId, value);
  }

  resolveImageUrl(url: string): string {
    return resolveImageUrl(url);
  }

  async checkout(): Promise<void> {
    const isGuest = !this.auth.isAuthenticated();
    if (isGuest && !this.guestEmail.trim()) {
      this.error.set('Enter your email to check out as a guest.');
      return;
    }
    this.checkingOut.set(true);
    this.error.set(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const guestCartToken = isGuest ? getOrCreateGuestCartToken() : undefined;
      const successUrl = isGuest
        ? `${window.location.origin}/orders/track?checkout=success`
        : `${window.location.origin}/orders?checkout=success`;
      const result = await firstValueFrom(
        this.api.shop.checkout(
          successUrl,
          `${window.location.origin}/cart?checkout=cancelled`,
          idempotencyKey,
          guestCartToken,
          isGuest ? this.guestEmail.trim() : undefined,
        ),
      );
      if (isGuest) {
        // The track-order page reads this on the Stripe success redirect so a guest doesn't
        // have to copy down their own order id.
        sessionStorage.setItem(
          'omyfish_guest_order_lookup',
          JSON.stringify({ orderId: result.orderId, email: this.guestEmail.trim() }),
        );
      }
      window.location.href = result.checkoutUrl;
    } catch (e) {
      this.error.set(errorMessage(e));
      this.checkingOut.set(false);
    }
  }
}
