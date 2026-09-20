import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Angular twin of the 401 handling in src/lib/api.ts's `apiFetch`: an expired access token
 * is silently refreshed (via the httpOnly refresh cookie) and the failed request retried
 * once with the new token, instead of every call site having to know about it.
 *
 * Tokens are still attached per call (see ApiService) — this only reacts to a 401 on a
 * request that carried one. That condition also keeps it off login/refresh/logout (they
 * send no Authorization header), so a wrong password or a dead refresh cookie never loops.
 *
 * The retry goes through `next`, i.e. *past* this interceptor, so a second 401 is returned
 * to the caller rather than triggering another refresh (React's `isRetry` flag).
 *
 * AuthService is looked up lazily: AuthService -> ApiService -> HttpClient -> this
 * interceptor, so injecting it up front would be a circular dependency the first time
 * AuthService's own constructor fires its startup refresh.
 */
export const authRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || !req.headers.has('Authorization')) {
        return throwError(() => err);
      }

      return from(injector.get(AuthService).refreshSession()).pipe(
        // switchMap: swap the failed request for its retry (or the original error).
        switchMap((token) =>
          token
            ? next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }))
            : throwError(() => err),
        ),
      );
    }),
  );
};
