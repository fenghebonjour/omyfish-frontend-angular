import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import type { OrderDto } from '../../core/models';
import { errorMessage } from '../../core/http-error.util';
import { AdminApproveReturn } from './admin-approve-return/admin-approve-return';

const STATUS_STYLES: Record<string, string> = {
  PENDING_PAYMENT: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID: 'bg-green-50 text-green-700 border-green-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
  RETURN_REQUESTED: 'bg-blue-50 text-blue-700 border-blue-200',
  RETURNED: 'bg-gray-100 text-gray-500 border-gray-200',
};

/** Angular twin of app/orders/page.tsx — protected by authGuard. */
@Component({
  selector: 'app-orders-page',
  imports: [RouterLink, DatePipe, AdminApproveReturn],
  templateUrl: './orders-page.html',
})
export class OrdersPage {
  auth = inject(AuthService);
  private api = inject(ApiService);

  orders = signal<OrderDto[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  statusStyles = STATUS_STYLES;

  constructor() {
    firstValueFrom(this.api.shop.orders.getAll())
      .then((orders) => this.orders.set(orders))
      .catch((e) => this.error.set(errorMessage(e)))
      .finally(() => this.loading.set(false));
  }

  async requestReturn(orderId: string): Promise<void> {
    const reason = window.prompt('Reason for return:');
    if (!reason) return;
    try {
      const updated = await firstValueFrom(this.api.shop.orders.requestReturn(orderId, reason));
      this.orders.update((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
    } catch (e) {
      alert('Could not request return: ' + errorMessage(e));
    }
  }
}
