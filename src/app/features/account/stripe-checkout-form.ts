import { Component, ElementRef, OnDestroy, afterNextRender, input, output, signal, viewChild } from '@angular/core';
import { Stripe, StripeElements, loadStripe } from '@stripe/stripe-js';
import { environment } from '../../../environments/environment';

/**
 * No React-style wrapper exists for Angular, so the Payment Element is mounted directly via
 * @stripe/stripe-js — same escape hatch this repo already uses for Leaflet in
 * observation-map.ts (an imperative, non-Angular-aware library needs afterNextRender + a raw
 * element reference, not the declarative template model).
 */
@Component({
  selector: 'app-stripe-checkout-form',
  templateUrl: './stripe-checkout-form.html',
})
export class StripeCheckoutForm implements OnDestroy {
  clientSecret = input.required<string>();
  done = output<void>();

  private paymentElementRef = viewChild.required<ElementRef<HTMLDivElement>>('paymentElement');

  submitting = signal(false);
  error = signal<string | null>(null);
  ready = signal(false);

  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;

  constructor() {
    afterNextRender(() => {
      loadStripe(environment.stripePublishableKey).then((stripe) => {
        if (!stripe) {
          this.error.set('Stripe failed to load.');
          return;
        }
        this.stripe = stripe;
        this.elements = stripe.elements({ clientSecret: this.clientSecret() });
        this.elements.create('payment').mount(this.paymentElementRef().nativeElement);
        this.ready.set(true);
      });
    });
  }

  ngOnDestroy(): void {
    this.elements?.getElement('payment')?.unmount();
  }

  async handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!this.stripe || !this.elements) return;
    this.submitting.set(true);
    this.error.set(null);

    const { error } = await this.stripe.confirmPayment({
      elements: this.elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });

    if (error) {
      this.error.set(error.message ?? 'Payment failed.');
      this.submitting.set(false);
      return;
    }
    this.done.emit();
  }
}
