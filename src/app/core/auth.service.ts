import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import type { TokenResponse } from './models';

export const SESSION_EXPIRED_KEY = 'omyfish_session_expired';

const KEY_TOKEN = 'omyfish_token';
const KEY_USER_ID = 'omyfish_userId';
const KEY_EMAIL = 'omyfish_email';

/**
 * Angular twin of contexts/AuthContext.tsx.
 *
 * React needs a Context + <AuthProvider> wrapper component so descendants
 * can useContext() it, plus a useAuth() hook that throws if you forgot the
 * wrapper. Angular's DI container makes a service a singleton just by
 * declaring `providedIn: 'root'` — any component can `inject(AuthService)`
 * directly, no wrapping component in the template and no "did you forget
 * the Provider" runtime check required, because the injector always has one.
 *
 * React's `useState` + `useEffect` becomes Angular `signal()` — a
 * `signal()` read inside a template auto-subscribes that binding, so
 * updating `token.set(...)` re-renders only the DOM that reads `token()`,
 * not the whole component tree (React's default is the opposite: a state
 * update re-renders the whole component function, and you opt out with
 * memoization, not in like Angular does with fine-grained signals).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  // Three separate signals mirror the three separate useState fields
  // React kept in one `AuthState` object.
  token = signal<string | null>(null);
  userId = signal<string | null>(null);
  email = signal<string | null>(null);
  isLoading = signal(true);

  // `computed()` is Angular's useMemo: it only recalculates when a signal
  // it reads (`token`) actually changes, and it's read the same way as a
  // plain signal — `isAuthenticated()` — from templates or code.
  isAuthenticated = computed(() => !!this.token());

  // authGuard awaits this before letting a protected route activate — the
  // guard's replacement for the `if (authLoading) return;` early-out that
  // every protected React page repeats at the top of its useEffect.
  readonly ready: Promise<void>;

  constructor() {
    // A service body runs once, at first injection — the direct analog of
    // AuthProvider's `useEffect(..., [])` mount-only effect.
    const token = localStorage.getItem(KEY_TOKEN);
    const userId = localStorage.getItem(KEY_USER_ID);
    const email = localStorage.getItem(KEY_EMAIL);

    if (token) {
      this.token.set(token);
      this.userId.set(userId);
      this.email.set(email);
      this.isLoading.set(false);
      this.ready = Promise.resolve();
    } else {
      // No access token in localStorage — try the httpOnly refresh cookie, if any. The
      // refresh token is no longer readable from JS (BACKLOG.md item F, WEAKNESS_AUDIT.md
      // §1.3); a 401 here just means the user isn't logged in.
      this.ready = firstValueFrom(this.api.auth.refresh())
        .then((resp) => {
          this.persist(resp);
          this.token.set(resp.token);
          this.userId.set(resp.userId);
          this.email.set(resp.email);
        })
        .catch(() => this.clearStorage())
        .finally(() => this.isLoading.set(false));
    }
  }

  private persist(resp: TokenResponse) {
    localStorage.setItem(KEY_TOKEN, resp.token);
    localStorage.setItem(KEY_USER_ID, resp.userId);
    localStorage.setItem(KEY_EMAIL, resp.email);
  }

  private clearStorage() {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem('omyfish_refresh'); // legacy key from before the cookie change
    localStorage.removeItem(KEY_USER_ID);
    localStorage.removeItem(KEY_EMAIL);
  }

  async login(email: string, password: string): Promise<void> {
    // firstValueFrom subscribes to the Observable and hands back a Promise
    // for exactly one value — the bridge Angular code reaches for whenever
    // it wants React-style `await api.call()` instead of `.subscribe()`.
    const resp = await firstValueFrom(this.api.auth.login(email, password));
    this.persist(resp);
    this.token.set(resp.token);
    this.userId.set(resp.userId);
    this.email.set(resp.email);
  }

  logout(): void {
    this.clearStorage();
    this.token.set(null);
    this.userId.set(null);
    this.email.set(null);
    // Clears the httpOnly refresh cookie server-side; nothing to do if it fails.
    firstValueFrom(this.api.auth.logout()).catch(() => {});
  }

  // Shared in-flight refresh: several authenticated calls 401ing at once (e.g. on the same
  // page load) collapse into a single /auth/refresh — the React twin's `refreshOnce()`.
  // Resolves to the new access token, or null if the refresh cookie is dead too, in which
  // case the session is ended (see expireSession). Used by core/auth.interceptor.ts.
  private refreshInFlight: Promise<string | null> | null = null;

  refreshSession(): Promise<string | null> {
    this.refreshInFlight ??= firstValueFrom(this.api.auth.refresh())
      .then((resp) => {
        this.persist(resp);
        this.token.set(resp.token);
        this.userId.set(resp.userId);
        this.email.set(resp.email);
        return resp.token;
      })
      .catch(() => {
        this.expireSession();
        return null;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });
    return this.refreshInFlight;
  }

  // The refresh cookie is dead: clear local state and send the user to /login, where the
  // page shows a "session expired" message (the React twin's `onSessionExpired`).
  private expireSession(): void {
    this.clearStorage();
    this.token.set(null);
    this.userId.set(null);
    this.email.set(null);
    sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
    this.router.navigateByUrl('/login');
  }
}
