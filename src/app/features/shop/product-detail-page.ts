import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import type { ProductDto } from '../../core/models';
import { errorMessage } from '../../core/http-error.util';
import { getOrCreateGuestCartToken } from '../../core/guest-cart';

/** Angular twin of app/shop/[id]/page.tsx — add-to-cart works for guests too. */
@Component({
  selector: 'app-product-detail-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './product-detail-page.html',
})
export class ProductDetailPage {
  auth = inject(AuthService);
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  private id = this.route.snapshot.paramMap.get('id')!;

  product = signal<ProductDto | null>(null);
  // Plain field, not a signal — bound two-way via [(ngModel)] like login-page's email/password.
  quantity = 1;
  loading = signal(true);
  error = signal<string | null>(null);
  adding = signal(false);
  added = signal(false);
  imageFailed = signal(false);

  maxQuantity = computed(() => Math.max(1, this.product()?.stockQuantity ?? 1));

  constructor() {
    firstValueFrom(this.api.shop.products.getById(this.id))
      .then((product) => this.product.set(product))
      .catch((e) => this.error.set(errorMessage(e)))
      .finally(() => this.loading.set(false));
  }

  async addToCart(): Promise<void> {
    this.adding.set(true);
    this.added.set(false);
    try {
      const guestCartToken = this.auth.isAuthenticated() ? undefined : getOrCreateGuestCartToken();
      await firstValueFrom(this.api.shop.cart.addItem(this.id, Math.max(1, this.quantity), guestCartToken));
      this.added.set(true);
    } catch (e) {
      alert('Could not add to cart: ' + errorMessage(e));
    } finally {
      this.adding.set(false);
    }
  }
}
