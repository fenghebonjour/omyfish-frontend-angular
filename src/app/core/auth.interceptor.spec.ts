import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { authInterceptor } from './auth.interceptor';
import { AuthService, SESSION_EXPIRED_KEY } from './auth.service';
import type { TokenResponse } from './models';

const REFRESHED: TokenResponse = { token: 'new-token', userId: 'u1', email: 'a@b.com', role: 'USER' };
const api = (path: string) => `${environment.apiBase}${path}`;
const isRefresh = (r: { url: string }) => r.url.endsWith('/api/v1/auth/refresh');
const UNAUTHORIZED = { status: 401, statusText: 'Unauthorized' };
// refreshSession() resolves through a .then/.catch/.finally promise chain before the retry is
// issued, so wait a macrotask rather than counting microtask ticks.
const settle = () => new Promise<void>((resolve) => setTimeout(resolve));

// The 401 cases mirror omyfish-frontend/src/lib/api.test.ts ("apiFetch 401 handling").
describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    // A stored token keeps AuthService's constructor from firing its own startup refresh.
    localStorage.setItem('omyfish_token', 'stale-token');

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => backend.verify());

  const get = (path: string) => firstValueFrom(http.get(api(path)));

  describe('attaching the bearer token', () => {
    it('adds the current token to API requests', async () => {
      const result = get('/api/v1/observations');
      const req = backend.expectOne(api('/api/v1/observations'));
      expect(req.request.headers.get('Authorization')).toBe('Bearer stale-token');
      req.flush([]);
      await result;
    });

    it('reads the token at request time, so a later request carries the refreshed token', async () => {
      auth.token.set('rotated-token');
      const result = get('/api/v1/observations');
      const req = backend.expectOne(api('/api/v1/observations'));
      expect(req.request.headers.get('Authorization')).toBe('Bearer rotated-token');
      req.flush([]);
      await result;
    });

    it('sends no Authorization header when logged out, and does not try to refresh a 401', async () => {
      auth.token.set(null);
      const result = get('/api/v1/species');
      const rejected = expect(result).rejects.toMatchObject({ status: 401 });
      const req = backend.expectOne(api('/api/v1/species'));
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({}, UNAUTHORIZED);
      await rejected;
      backend.expectNone(isRefresh);
    });

    it('never sends the token to a non-API URL', async () => {
      const result = firstValueFrom(http.get('https://api.bigdatacloud.net/x'));
      const req = backend.expectOne('https://api.bigdatacloud.net/x');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
      await result;
    });

    it('never sends the token to login', async () => {
      const result = firstValueFrom(http.post(api('/api/v1/auth/login'), {}));
      const rejected = expect(result).rejects.toMatchObject({ status: 401 });
      const req = backend.expectOne(api('/api/v1/auth/login'));
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({}, UNAUTHORIZED); // wrong password: must not trigger a refresh
      await rejected;
      backend.expectNone(isRefresh);
    });

    it('leaves an explicitly-set Authorization header alone', async () => {
      const result = firstValueFrom(
        http.get(api('/api/v1/observations'), { headers: { Authorization: 'Bearer explicit' } }),
      );
      const req = backend.expectOne(api('/api/v1/observations'));
      expect(req.request.headers.get('Authorization')).toBe('Bearer explicit');
      req.flush([]);
      await result;
    });
  });

  describe('401 handling', () => {
    it('passes a successful request through unchanged', async () => {
      const result = get('/api/x');
      backend.expectOne(api('/api/x')).flush([{ id: '1' }]);
      expect(await result).toEqual([{ id: '1' }]);
    });

    it('refreshes once on a 401, retries with the new token and syncs auth state', async () => {
      const result = get('/api/x');
      backend.expectOne(api('/api/x')).flush({}, UNAUTHORIZED);

      const refresh = backend.expectOne(isRefresh);
      expect(refresh.request.withCredentials).toBe(true);
      refresh.flush(REFRESHED);

      await settle();
      const retry = backend.expectOne(api('/api/x'));
      expect(retry.request.headers.get('Authorization')).toBe('Bearer new-token');
      retry.flush([{ id: 'obs-1' }]);

      expect(await result).toEqual([{ id: 'obs-1' }]);
      expect(auth.token()).toBe('new-token');
      expect(localStorage.getItem('omyfish_token')).toBe('new-token');
    });

    it('ends the session and rejects when the refresh cookie is dead too', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      const result = get('/api/x');
      const rejected = expect(result).rejects.toMatchObject({ status: 401 });
      backend.expectOne(api('/api/x')).flush({}, UNAUTHORIZED);
      backend.expectOne(isRefresh).flush({}, UNAUTHORIZED);

      await rejected;
      expect(auth.isAuthenticated()).toBe(false);
      expect(localStorage.getItem('omyfish_token')).toBeNull();
      expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBe('1');
      expect(navigate).toHaveBeenCalledWith('/login');
      backend.expectNone(api('/api/x')); // no retry attempted
    });

    it('dedupes concurrent 401s into a single /auth/refresh call', async () => {
      const a = get('/api/a');
      const b = get('/api/b');
      backend.expectOne(api('/api/a')).flush({}, UNAUTHORIZED);
      backend.expectOne(api('/api/b')).flush({}, UNAUTHORIZED);

      backend.expectOne(isRefresh).flush(REFRESHED);

      await settle();
      backend.expectOne(api('/api/a')).flush('a-ok');
      backend.expectOne(api('/api/b')).flush('b-ok');
      expect(await Promise.all([a, b])).toEqual(['a-ok', 'b-ok']);
    });

    it('returns a second 401 to the caller instead of refreshing again', async () => {
      const result = get('/api/x');
      const rejected = expect(result).rejects.toMatchObject({ status: 401 });
      backend.expectOne(api('/api/x')).flush({}, UNAUTHORIZED);
      backend.expectOne(isRefresh).flush(REFRESHED);

      await settle();
      backend.expectOne(api('/api/x')).flush({}, UNAUTHORIZED);

      await rejected;
      backend.expectNone(isRefresh);
    });
  });
});
