import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import type { SubscriptionDto } from '../../core/models';
import { errorMessage } from '../../core/http-error.util';
import { StripeCheckoutForm } from './stripe-checkout-form';

const PLAN_LABELS: Record<string, string> = {
  monthly: '5 CAD / month',
  yearly: '29 CAD / year',
};

/**
 * Angular twin of app/account/page.tsx.
 *
 * React's version does the auth check itself:
 * `if (authLoading) return; if (!isAuthenticated) router.push('/login')`
 * inside a useEffect. That's gone here — the `authGuard` on this route in
 * app.routes.ts already guarantees the component never even constructs
 * unless the user is authenticated, so the constructor below can go
 * straight to loading the subscription.
 */
@Component({
  selector: 'app-account-page',
  imports: [DatePipe, StripeCheckoutForm],
  templateUrl: './account-page.html',
})
export class AccountPage {
  auth = inject(AuthService);
  private api = inject(ApiService);

  sub = signal<SubscriptionDto | null>(null);
  error = signal<string | null>(null);
  busy = signal(false);
  clientSecret = signal<string | null>(null);
  finalizing = signal(false);
  planLabels = PLAN_LABELS;
  plans: Array<'monthly' | 'yearly'> = ['monthly', 'yearly'];
  private pendingCheckout: { plan: string; key: string } | null = null;

  constructor() {
    firstValueFrom(this.api.billing.me())
      .then((s) => this.sub.set(s))
      .catch((e) => this.error.set(errorMessage(e)));
  }

  async subscribe(plan: 'monthly' | 'yearly'): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    // Reuse the same key when the user retries the same plan after a failure, so the backend's
    // idempotency handling (and Stripe's) actually sees a retry instead of a brand-new attempt.
    const idempotencyKey =
      this.pendingCheckout?.plan === plan ? this.pendingCheckout.key : crypto.randomUUID();
    this.pendingCheckout = { plan, key: idempotencyKey };
    try {
      const { processor, clientSecret } =
        await firstValueFrom(this.api.billing.checkout(plan, idempotencyKey));
      if (processor !== 'stripe') {
        this.error.set("This payment method isn't supported yet.");
        this.busy.set(false);
        return;
      }
      this.clientSecret.set(clientSecret);
    } catch (e) {
      // React detects this by string-matching "503" inside the Error's
      // message (apiFetch's `${res.status}: ${text}` text). HttpErrorResponse
      // carries the status as a real number instead, so no string-sniffing needed.
      this.error.set(
        e instanceof HttpErrorResponse && e.status === 503
          ? 'Payments are not configured on this deployment.'
          : errorMessage(e),
      );
      this.busy.set(false);
    }
  }

  async onCheckoutDone(): Promise<void> {
    this.clientSecret.set(null);
    this.pendingCheckout = null;
    this.busy.set(false);
    this.finalizing.set(true);
    try {
      this.sub.set(await firstValueFrom(this.api.billing.me()));
    } finally {
      this.finalizing.set(false);
    }
  }

  trialDaysLeft(): number {
    const trialEnd = this.sub()?.trialEnd;
    return trialEnd ? Math.max(0, Math.ceil((new Date(trialEnd).getTime() - Date.now()) / 86_400_000)) : 0;
  }
}
