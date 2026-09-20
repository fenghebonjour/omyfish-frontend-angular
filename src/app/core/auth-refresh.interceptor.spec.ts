import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { authRefreshInterceptor } from './auth-refresh.interceptor';
import { AuthService, SESSION_EXPIRED_KEY } from './auth.service';
import type { TokenResponse } from './models';

const REFRESHED: TokenResponse = { token: 'new-token', userId: 'u1', email: 'a@b.com', role: 'USER' };
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
// refreshSession() resolves through a .then/.catch/.finally promise chain before the retry is
// issued, so wait a macrotask rather than counting microtask ticks.
const settle = () => new Promise<void>((resolve) => setTimeout(resolve));

// Mirrors omyfish-frontend/src/lib/api.test.ts ("apiFetch 401 handling").
describe('authRefreshInterceptor', () => {
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
        provideHttpClient(withInterceptors([authRefreshInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => backend.verify());

  const get = (url: string, token = 'stale-token') =>
    firstValueFrom(http.get(url, { headers: bearer(token) }));

  it('passes a successful request through unchanged', async () => {
    const result = get('/api/x');
    backend.expectOne('/api/x').flush([{ id: '1' }]);
    expect(await result).toEqual([{ id: '1' }]);
  });

  it('refreshes once on a 401, retries with the new token and syncs auth state', async () => {
    const result = get('/api/x');
    backend.expectOne('/api/x').flush({}, { status: 401, statusText: 'Unauthorized' });

    const refresh = backend.expectOne((r) => r.url.endsWith('/api/v1/auth/refresh'));
    expect(refresh.request.withCredentials).toBe(true);
    refresh.flush(REFRESHED);

    // The retry is scheduled after the refresh promise resolves.
    await settle();
    const retry = backend.expectOne('/api/x');
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
    backend.expectOne('/api/x').flush({}, { status: 401, statusText: 'Unauthorized' });
    backend
      .expectOne((r) => r.url.endsWith('/api/v1/auth/refresh'))
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    await rejected;
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('omyfish_token')).toBeNull();
    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBe('1');
    expect(navigate).toHaveBeenCalledWith('/login');
    backend.expectNone('/api/x'); // no retry attempted
  });

  it('dedupes concurrent 401s into a single /auth/refresh call', async () => {
    const a = get('/api/a');
    const b = get('/api/b');
    backend.expectOne('/api/a').flush({}, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/b').flush({}, { status: 401, statusText: 'Unauthorized' });

    backend.expectOne((r) => r.url.endsWith('/api/v1/auth/refresh')).flush(REFRESHED);

    await settle();
    backend.expectOne('/api/a').flush('a-ok');
    backend.expectOne('/api/b').flush('b-ok');
    expect(await Promise.all([a, b])).toEqual(['a-ok', 'b-ok']);
  });

  it('does not refresh for a 401 on a request that carried no token (e.g. wrong password)', async () => {
    const result = firstValueFrom(http.post('/api/v1/auth/login', {}));
    const rejected = expect(result).rejects.toMatchObject({ status: 401 });
    backend.expectOne('/api/v1/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    await rejected;
    backend.expectNone((r) => r.url.endsWith('/api/v1/auth/refresh'));
  });

  it('returns a second 401 to the caller instead of refreshing again', async () => {
    const result = get('/api/x');
    const rejected = expect(result).rejects.toMatchObject({ status: 401 });
    backend.expectOne('/api/x').flush({}, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne((r) => r.url.endsWith('/api/v1/auth/refresh')).flush(REFRESHED);

    await settle();
    backend.expectOne('/api/x').flush({}, { status: 401, statusText: 'Unauthorized' });

    await rejected;
    backend.expectNone((r) => r.url.endsWith('/api/v1/auth/refresh'));
  });
});
