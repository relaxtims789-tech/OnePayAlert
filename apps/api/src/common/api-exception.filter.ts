import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger, type ExceptionFilter } from '@nestjs/common';
import {
  API_ERRORS,
  SUPPORTED_LOCALES,
  errorMessage,
  matchErrorMessage,
  type ApiErrorCode,
  type ErrorParams,
  type Locale,
} from '@onepay/shared';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error?: string;
  message?: string | string[];
  code?: ApiErrorCode | string;
  params?: ErrorParams;
  details?: string[];
  [key: string]: unknown;
}

/** First supported language in Accept-Language ("km-KH,km;q=0.9,en" → km). English otherwise. */
export function pickLocale(header: string | undefined): Locale {
  if (!header) return 'en';
  const tags = header
    .split(',')
    .map((part) => {
      const [tag, ...attrs] = part.trim().split(';');
      const q = attrs.find((a) => a.trim().startsWith('q='));
      return { lang: (tag ?? '').toLowerCase().split('-')[0] ?? '', q: q ? Number(q.split('=')[1]) : 1 };
    })
    .filter((t) => t.lang && !Number.isNaN(t.q))
    .sort((a, b) => b.q - a.q);
  for (const t of tags) {
    if ((SUPPORTED_LOCALES as readonly string[]).includes(t.lang)) return t.lang as Locale;
  }
  return 'en';
}

function prismaBody(e: Prisma.PrismaClientKnownRequestError): ErrorBody | null {
  if (e.code === 'P2002') {
    const target = (e.meta?.target as string[] | string | undefined) ?? 'field';
    return {
      statusCode: HttpStatus.CONFLICT,
      error: 'Conflict',
      message: `A record with this ${Array.isArray(target) ? target.join(', ') : target} already exists`,
    };
  }
  if (e.code === 'P2025') return { statusCode: HttpStatus.NOT_FOUND, error: 'Not Found', message: 'Record not found' };
  return null;
}

/**
 * Every error leaves the API in one shape — `{ statusCode, error, code?, message, details? }` —
 * with `message` in the caller's language (Accept-Language). Internals are never leaked:
 * unexpected errors become a generic 500 and are logged here.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    if (res.headersSent) return;

    let body: ErrorBody;
    if (exception instanceof HttpException) {
      const r = exception.getResponse();
      body =
        typeof r === 'string' ? { statusCode: exception.getStatus(), message: r } : { statusCode: exception.getStatus(), ...(r as object) };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && prismaBody(exception)) {
      body = prismaBody(exception) as ErrorBody;
    } else {
      this.logger.error(
        `Unhandled error on ${req.method} ${req.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      body = { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, error: 'Internal Server Error', message: 'Internal server error' };
    }

    let code = body.code as ApiErrorCode | undefined;
    let params = body.params;
    if (!code) {
      if (Array.isArray(body.message)) {
        // class-validator: keep the field-level detail (English) for developers.
        code = 'VALIDATION_FAILED';
        body.details = body.message;
      } else if (body.statusCode === HttpStatus.TOO_MANY_REQUESTS) {
        code = 'TOO_MANY_REQUESTS';
      } else if (body.statusCode >= 500) {
        code = 'INTERNAL';
      } else if (typeof body.message === 'string') {
        const hit = matchErrorMessage(body.message);
        if (hit) ({ code, params } = hit);
      }
    }
    if (code && code in API_ERRORS) {
      body.code = code;
      body.message = errorMessage(code, pickLocale(req.headers['accept-language']), params);
    }
    delete body.params;
    res.status(body.statusCode).json(body);
  }
}
