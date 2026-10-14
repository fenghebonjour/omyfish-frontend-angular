import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api.service';
import { errorMessage } from '../../../core/http-error.util';
import type { OrderDto } from '../../../core/models';

const STATUS_STYLES: Record<string, string> = {
  PENDING_PAYMENT: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID: 'bg-green-50 text-green-700 border-green-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
  RETURN_REQUESTED: 'bg-blue-50 text-blue-700 border-blue-200',
  RETURNED: 'bg-gray-100 text-gray-500 border-gray-200',
};

/**
 * Lists every order (any owner) so an admin can find — and approve a return on — one without
 * already having its id in hand, plus a manual-id fallback for when they do (e.g. from a
 * support email). approveReturn itself works on any order id, gated server-side on X-User-Role.
 */
@Component({
  selector: 'app-admin-approve-return',
  imports: [FormsModule],
  templateUrl: './admin-approve-return.html',
})
export class AdminApproveReturn {
  private api = inject(ApiService);

  statusStyles = STATUS_STYLES;
  allOrders = signal<OrderDto[]>([]);
  loadingAll = signal(true);
  listError = signal<string | null>(null);
  busyId = signal<string | null>(null);

  orderId = '';
  status = signal<string | null>(null);
  busy = signal(false);

  constructor() {
    firstValueFrom(this.api.shop.orders.listAllAdmin())
      .then((orders) => this.allOrders.set(orders))
      .catch((e) => this.listError.set(errorMessage(e)))
      .finally(() => this.loadingAll.set(false));
  }

  async approveRow(id: string): Promise<void> {
    this.busyId.set(id);
    try {
      const updated = await firstValueFrom(this.api.shop.orders.approveReturn(id));
      this.allOrders.update((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (e) {
      alert('Could not approve return: ' + errorMessage(e));
    } finally {
      this.busyId.set(null);
    }
  }

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
