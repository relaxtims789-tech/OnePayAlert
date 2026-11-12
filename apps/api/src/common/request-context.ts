import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { httpDuration } from './metrics';
import type { AuthUser } from './auth-user';

export type RequestWithId = Request & { id?: string; user?: AuthUser };

/** Accept a caller's request id only if it is short and harmless; otherwise make one. */
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;
const QUIET = /^\/api\/v1\/(health|metrics)\b/;
const logger = new Logger('HTTP');

/**
 * Gives every request an id (echoed in `X-Request-Id` and in 5xx error bodies), records its
 * duration, and logs one line per request: method, route pattern, status, duration, user and
 * company. Never the body, query string, headers or tokens.
 */
export function requestContext(req: RequestWithId, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    // Express knows the matched pattern ("/api/v1/outlets/:id") only after routing.
    const route = (req.route?.path as string | undefined) ? `${req.baseUrl}${req.route.path as string}` : 'unmatched';
    httpDuration.observe({ method: req.method, route, status: String(res.statusCode) }, seconds);
    if (QUIET.test(req.path)) return;
    const entry = {
      msg: 'request',
      requestId: req.id,
      method: req.method,
      route,
      status: res.statusCode,
      durationMs: Math.round(seconds * 1000),
      userId: req.user?.userId ?? null,
      companyId: req.user?.companyId ?? null,
    };
    if (res.statusCode >= 500) logger.error(entry);
    else if (res.statusCode >= 400) logger.warn(entry);
    else logger.log(entry);
  });
  next();
}
