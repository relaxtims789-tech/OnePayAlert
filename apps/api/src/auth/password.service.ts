import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/** Argon2id password hashing (OWASP recommended parameters). */
@Injectable()
export class PasswordService {
  private readonly options = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

  hash(password: string): Promise<string> {
    return hash(password, this.options);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
