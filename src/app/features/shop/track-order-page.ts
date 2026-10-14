import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import type { OrderDto } from '../../core/models';

const STATUS_STYLES: Record<string, string> = {
  PENDING_PAYMENT: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID: 'bg-green-50 text-green-700 border-green-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
  RETURN_REQUESTED: 'bg-blue-50 text-blue-700 border-blue-200',
  RETURNED: 'bg-gray-100 text-gray-500 border-gray-200',
};

/** Angular twin of app/orders/track/page.tsx — public guest order tracking, no authGuard. */
@Component({
  selector: 'app-track-order-page',
  imports: [FormsModule, DatePipe],
  templateUrl: './track-order-page.html',
})
export class TrackOrderPage {
  private api = inject(ApiService);

  orderId = '';
  email = '';
  order = signal<OrderDto | null>(null);
  error = signal<string | null>(null);
  loading = signal(false);
  statusStyles = STATUS_STYLES;

  constructor() {
    // Right after a guest's Stripe checkout succeeds, the cart page stashes the order id it
    // already has (handed back when the checkout session was created) so this page can look it
    // up automatically instead of making the guest copy it down themselves.
    if (new URLSearchParams(window.location.search).get('checkout') !== 'success') return;
    const raw = sessionStorage.getItem('omyfish_guest_order_lookup');
    if (!raw) return;
    sessionStorage.removeItem('omyfish_guest_order_lookup');
    try {
      const saved = JSON.parse(raw) as { orderId: string; email: string };
      this.orderId = saved.orderId;
      this.email = saved.email;
      this.lookup(saved.orderId, saved.email);
    } catch {
      // ignore malformed value
    }
  }

  async lookup(orderId: string, email: string): Promise<void> {
    this.error.set(null);
    this.order.set(null);
    this.loading.set(true);
    try {
      const found = await firstValueFrom(this.api.shop.orders.lookup(orderId, email));
      this.order.set(found);
    } catch {
      this.error.set('No matching order found — check the order id and email.');
    } finally {
      this.loading.set(false);
    }
  }

  handleSubmit(event: SubmitEvent): void {
    event.preventDefault();
    this.lookup(this.orderId.trim(), this.email.trim());
  }
}
