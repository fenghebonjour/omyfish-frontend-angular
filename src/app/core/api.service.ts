import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
// Explicit (not the ambient `GeoJSON` global): the unit-test build doesn't pull in Leaflet's
// types, which is the only thing that made the global visible in the app build.
import type { FeatureCollection } from 'geojson';
import { environment } from '../../environments/environment';
import * as M from './models';

/**
 * Angular twin of src/lib/api.ts. Same method names, same paths. One deliberate
 * difference: no per-call `token` parameter — core/auth.interceptor.ts attaches the
 * current bearer token to every API request (and refreshes it on a 401), so call sites
 * don't thread it through. Beyond that, the structural difference that matters for
 * comparison:
 *
 *   React `fetch`             Angular `HttpClient`
 *   -----------------------   ------------------------------------------
 *   returns a Promise<T>      returns an Observable<T>
 *   fires the instant you     fires only once something calls
 *     call it (eager/"hot")     .subscribe() (lazy/"cold") — an
 *                                Observable you never subscribe to never
 *                                runs, unlike a Promise you never await.
 *   you must check res.ok     non-2xx responses are pushed down the
 *     and throw yourself        error channel automatically as an
 *                                HttpErrorResponse — no manual ok-check.
 *   body must be response      response body is parsed for you based on
 *     .json()'d by hand          the inferred/declared generic type.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = environment.apiBase;

  auth = {
    // withCredentials on login/refresh/logout: the backend sets and reads the refresh token
    // as an httpOnly cookie, which the browser only stores/attaches on cross-origin
    // requests when this is set (the React twin's `credentials: "include"`).
    login: (email: string, password: string): Observable<M.TokenResponse> =>
      this.http.post<M.TokenResponse>(`${this.base}/api/v1/auth/login`, { email, password }, { withCredentials: true }),

    register: (email: string, password: string, displayName?: string): Observable<M.UserDto> =>
      this.http.post<M.UserDto>(`${this.base}/api/v1/auth/register`, { email, password, displayName }),

    // No body: the refresh token is the httpOnly cookie, not a value the client holds.
    refresh: (): Observable<M.TokenResponse> =>
      this.http.post<M.TokenResponse>(`${this.base}/api/v1/auth/refresh`, null, { withCredentials: true }),

    logout: (): Observable<string> =>
      this.http.post(`${this.base}/api/v1/auth/logout`, null, { withCredentials: true, responseType: 'text' }),

    me: (): Observable<M.UserDto> => this.http.get<M.UserDto>(`${this.base}/api/v1/auth/me`),
  };

  species = {
    identify: (image: File, topK = 5): Observable<M.IdentifyFishResult> => {
      const form = new FormData();
      form.append('image', image);
      form.append('topK', String(topK));
      return this.http.post<M.IdentifyFishResult>(`${this.base}/api/v1/species/identify`, form);
    },

    getAll: (northAmericanFreshwater?: boolean): Observable<M.PredictionDto[]> => {
      let params = new HttpParams();
      if (northAmericanFreshwater !== undefined) {
        params = params.set('northAmericanFreshwater', String(northAmericanFreshwater));
      }
      return this.http.get<M.PredictionDto[]>(`${this.base}/api/v1/species`, { params });
    },
  };

  biteScore = {
    // species accepts a profile key or any common/scientific name from a
    // confirmed fish ID — the backend resolves it (general fallback).
    today: (lat: number, lon: number, species = 'general'): Observable<M.BiteForecast> =>
      this.http.get<M.BiteForecast>(`${this.base}/api/v1/species/bite-score/today`, {
        params: { lat, lon, species },
      }),

    forecast: (lat: number, lon: number, species = 'general', hours = 336): Observable<M.BiteForecast> =>
      this.http.get<M.BiteForecast>(`${this.base}/api/v1/species/bite-score/forecast`, {
        params: { lat, lon, species, hours },
      }),
  };

  // Quebec fishing regs/consumption advisor — proxied from omyfish-ai by
  // every backend at the same path, chatbot/retrieval logic lives there only.
  regs = {
    limits: (lat: number, lon: number, species = 'general'): Observable<M.RegsLimits> =>
      this.http.get<M.RegsLimits>(`${this.base}/api/v1/species/regs/limits`, { params: { lat, lon, species } }),

    zonesGeoJson: (): Observable<FeatureCollection> =>
      this.http.get<FeatureCollection>(`${this.base}/api/v1/species/regs/zones/geojson`),

    consumptionStations: (lat: number, lon: number, limit = 5): Observable<M.RegsStation[]> =>
      this.http.get<M.RegsStation[]>(`${this.base}/api/v1/species/regs/consumption/stations`, {
        params: { lat, lon, limit },
      }),

    consumption: (lat: number, lon: number, species = 'general'): Observable<M.RegsConsumption> =>
      this.http.get<M.RegsConsumption>(`${this.base}/api/v1/species/regs/consumption`, {
        params: { lat, lon, species },
      }),

    ask: (question: string): Observable<M.RegsAskResponse> =>
      this.http.post<M.RegsAskResponse>(`${this.base}/api/v1/species/regs/ask`, { question }),
  };

  notifications = {
    getAll: (): Observable<M.NotificationDto[]> =>
      this.http.get<M.NotificationDto[]>(`${this.base}/api/v1/notifications`),

    markRead: (id: string): Observable<void> =>
      this.http
        .put(`${this.base}/api/v1/notifications/${id}/read`, null, { responseType: 'text' })
        .pipe(map(() => undefined)),
  };

  billing = {
    me: (): Observable<M.SubscriptionDto> => this.http.get<M.SubscriptionDto>(`${this.base}/api/v1/billing/me`),

    checkout: (plan: 'monthly' | 'yearly'): Observable<{ checkoutUrl: string }> =>
      this.http.post<{ checkoutUrl: string }>(`${this.base}/api/v1/billing/checkout`, { plan }),
  };

  admin = {
    stats: (): Observable<M.AdminStats> => this.http.get<M.AdminStats>(`${this.base}/api/v1/admin/stats`),

    subscriptions: (): Observable<M.AdminSubscriptionRow[]> =>
      this.http.get<M.AdminSubscriptionRow[]>(`${this.base}/api/v1/admin/subscriptions`),

    grant: (userId: string, days = 365, plan = 'yearly'): Observable<M.SubscriptionDto> =>
      this.http.post<M.SubscriptionDto>(`${this.base}/api/v1/admin/subscriptions/${userId}/grant`, { days, plan }),

    revoke: (userId: string): Observable<M.SubscriptionDto> =>
      this.http.post<M.SubscriptionDto>(`${this.base}/api/v1/admin/subscriptions/${userId}/revoke`, null),

    extendTrial: (userId: string, days = 7): Observable<M.SubscriptionDto> =>
      this.http.post<M.SubscriptionDto>(`${this.base}/api/v1/admin/subscriptions/${userId}/extend-trial`, { days }),
  };

  observations = {
    getAll: (myOnly = true): Observable<M.ObservationDto[]> =>
      this.http.get<M.ObservationDto[]>(`${this.base}/api/v1/observations`, { params: { myOnly } }),

    getById: (id: string): Observable<M.ObservationDto> =>
      this.http.get<M.ObservationDto>(`${this.base}/api/v1/observations/${id}`),

    delete: (id: string): Observable<void> =>
      this.http
        .delete(`${this.base}/api/v1/observations/${id}`, { responseType: 'text' })
        .pipe(map(() => undefined)),

    getGeoJson: (): Observable<object> => this.http.get<object>(`${this.base}/api/v1/observations/geojson`),
  };
}
