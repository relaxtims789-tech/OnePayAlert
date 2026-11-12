import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { API, bearer, createTestApp, registerMerchant } from './helpers';

describe('Request ids and metrics (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
  });
  afterAll(() => app.close());

  it('gives every response a request id, keeping a well-formed incoming one', async () => {
    const fresh = await request(http).get(`${API}/health`).expect(200);
    expect(fresh.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const kept = await request(http).get(`${API}/health`).set('X-Request-Id', 'edge-proxy-abc123').expect(200);
    expect(kept.headers['x-request-id']).toBe('edge-proxy-abc123');
    // Anything odd (log injection, overlong) is replaced, never echoed.
    const replaced = await request(http).get(`${API}/health`).set('X-Request-Id', 'bad id; drop table').expect(200);
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('serves Prometheus metrics only with the metrics token', async () => {
    const shop = await registerMerchant(app, 'Metrics Shop');
    await request(http).get(`${API}/outlets/00000000-0000-4000-8000-000000000000`).set('Authorization', bearer(shop.tokens)).expect(404);

    await request(http).get(`${API}/metrics`).expect(404);
    await request(http).get(`${API}/metrics`).set('Authorization', 'Bearer wrong-token-wrong-token-wrong').expect(404);
    const res = await request(http).get(`${API}/metrics`).set('Authorization', `Bearer ${process.env.METRICS_TOKEN}`).expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    // Route patterns, never raw ids, keep label cardinality bounded.
    expect(res.text).toMatch(/onepay_http_request_duration_seconds_count\{[^}]*method="GET",route="\/api\/v1\/outlets\/:id",status="404"\}/);
    expect(res.text).not.toContain('00000000-0000-4000-8000-000000000000');
    expect(res.text).toMatch(/onepay_dependency_up\{[^}]*dependency="database"[^}]*\} 1/);
  });
});
