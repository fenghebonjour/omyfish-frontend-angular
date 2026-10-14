import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api.service';
import { errorMessage } from '../../../core/http-error.util';

/**
 * The backend has no endpoint yet to list other customers' orders, so an admin can only act on
 * an order id they already have (e.g. from a support request) — approveReturn works on any
 * order id regardless of who placed it, gated server-side on the X-User-Role header.
 */
@Component({
  selector: 'app-admin-approve-return',
  imports: [FormsModule],
  templateUrl: './admin-approve-return.html',
})
export class AdminApproveReturn {
  private api = inject(ApiService);

  orderId = '';
  status = signal<string | null>(null);
  busy = signal(false);

  async approve(): Promise<void> {
    if (!this.orderId) return;
    this.busy.set(true);
    this.status.set(null);
    try {
      const order = await firstValueFrom(this.api.shop.orders.approveReturn(this.orderId));
      this.status.set(`Order ${order.id.slice(0, 8)}… is now ${order.status}.`);
    } catch (e) {
      this.status.set('Error: ' + errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
