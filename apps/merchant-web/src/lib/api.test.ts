import { describe, expect, it } from 'vitest';
import { errorMessage } from './api';

describe('errorMessage', () => {
  it('reads NestJS validation arrays and plain messages', () => {
    expect(errorMessage({ message: ['email must be an email', 'password too short'] }, 'x')).toBe('email must be an email\npassword too short');
    expect(errorMessage({ message: 'Outlet not found' }, 'x')).toBe('Outlet not found');
  });
  it('falls back for empty or unknown bodies', () => {
    expect(errorMessage(null, 'fallback')).toBe('fallback');
    expect(errorMessage({ message: '  ' }, 'fallback')).toBe('fallback');
    expect(errorMessage('oops', 'fallback')).toBe('fallback');
  });
});
