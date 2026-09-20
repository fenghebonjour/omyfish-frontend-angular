import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

// The token endpoints themselves: they carry no bearer token (login/register are anonymous,
// refresh/logout use the httpOnly cookie), so a 401 from them must never trigger a refresh.
const TOKEN_ENDPOINTS = /\/api\/v1\/auth\/(login|register|refresh|logout)(\?|$)/;

/**
 * Angular twin of `apiFetch` in src/lib/api.ts, in two parts:
 *
 * 1. Attaches `Authorization: Bearer <current token>` to requests for our API, so call sites
 *    no longer thread a `token` argument through ApiService. Only requests to
 *    `environment.apiBase` get it (never a third-party URL), never the token endpoints above,
 *    and never over an Authorization header the caller set explicitly. The token is read from
 *    AuthService at request time, so a request made after a refresh already carries the new one.
 *
 * 2. On a 401 for a request that carried a token, silently refreshes (via the httpOnly
 *    refresh cookie) and retries once with the new token. Concurrent 401s share one refresh
 *    (AuthService.refreshSession); a dead refresh cookie ends the session. The retry goes
 *    through `next`, i.e. *past* this interceptor, so a second 401 is returned to the caller
 *    instead of triggering another refresh (React's `isRetry` flag).
 *
 * AuthService is looked up lazily, and only for requests that need it: AuthService ->
 * ApiService -> HttpClient -> this interceptor, so injecting it up front (or looking it up for
 * its own startup /auth/refresh) would be a circular dependency.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBase) || TOKEN_ENDPOINTS.test(req.url)) {
    return next(req);
  }

  const injector = inject(Injector);

  let authed = req;
  if (!req.headers.has('Authorization')) {
    const token = injector.get(AuthService).token();
    if (token) authed = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  // Anonymous request (not logged in): nothing to attach and nothing to refresh.
  if (!authed.headers.has('Authorization')) return next(authed);

  return next(authed).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) {
        return throwError(() => err);
      }

      return from(injector.get(AuthService).refreshSession()).pipe(
        // switchMap: swap the failed request for its retry (or the original error).
        switchMap((token) =>
          token
            ? next(authed.clone({ setHeaders: { Authorization: `Bearer ${token}` } }))
            : throwError(() => err),
        ),
      );
    }),
  );
};
