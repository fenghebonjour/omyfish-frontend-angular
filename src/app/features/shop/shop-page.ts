import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { CartService } from '../../core/cart.service';
import type { ProductDto } from '../../core/models';
import { errorMessage } from '../../core/http-error.util';
import { getOrCreateGuestCartToken } from '../../core/guest-cart';
import { resolveImageUrl } from '../../core/image-url.util';

/** Angular twin of app/shop/page.tsx — public catalog browsing, no authGuard; add-to-cart
 * works for guests too (a guest cart token stands in for login). */
@Component({
  selector: 'app-shop-page',
  imports: [RouterLink],
  templateUrl: './shop-page.html',
})
export class ShopPage {
  auth = inject(AuthService);
  private api = inject(ApiService);
  private cart = inject(CartService);

  products = signal<ProductDto[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  addingId = signal<string | null>(null);
  failedImageIds = signal<ReadonlySet<string>>(new Set());

  onImageError(id: string): void {
    this.failedImageIds.update((prev) => new Set(prev).add(id));
  }

  resolveImageUrl(url: string): string {
    return resolveImageUrl(url);
  }

  constructor() {
    firstValueFrom(this.api.shop.products.getAll())
      .then((products) => this.products.set(products))
      .catch((e) => this.error.set(errorMessage(e)))
      .finally(() => this.loading.set(false));
  }

  async addToCart(productId: string): Promise<void> {
    this.addingId.set(productId);
    try {
      const guestCartToken = this.auth.isAuthenticated() ? undefined : getOrCreateGuestCartToken();
      const updated = await firstValueFrom(this.api.shop.cart.addItem(productId, 1, guestCartToken));
      this.cart.applyCart(updated);
      this.cart.notify('Added to cart ✓');
    } catch (e) {
      alert('Could not add to cart: ' + errorMessage(e));
    } finally {
      this.addingId.set(null);
    }
  }
}
