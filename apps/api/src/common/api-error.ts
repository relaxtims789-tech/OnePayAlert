import { HttpException, HttpStatus } from '@nestjs/common';
import { errorMessage, type ApiErrorCode, type ErrorParams } from '@onepay/shared';

/**
 * An error with a stable `code` the clients can branch on. The message is written in English
 * here; the global error filter translates it into the caller's language.
 */
export function apiError(status: HttpStatus, code: ApiErrorCode, params?: ErrorParams): HttpException {
  return new HttpException(
    {
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      code,
      ...(params ? { params } : {}),
      message: errorMessage(code, 'en', params),
    },
    status,
  );
}
