import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';

interface OAuthStatePayload {
  userId: string;
  platform: 'ebay' | 'aliexpress';
  nonce: string;
  exp: number;
}

@Injectable()
export class OAuthStateStore {
  private readonly secret = process.env.AUTH0_CLIENT_SECRET || process.env.EBAY_CERT_ID || 'local-oauth-state';

  create(userId: string, platform: 'ebay' | 'aliexpress'): string {
    const payload: OAuthStatePayload = {
      userId,
      platform,
      nonce: randomBytes(8).toString('hex'),
      exp: Date.now() + 15 * 60 * 1000,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.sign(encoded)}`;
  }

  read(state: string, platform: 'ebay' | 'aliexpress'): string {
    const [encoded, signature] = state.split('.');
    if (!encoded || !signature || !this.verify(encoded, signature)) {
      throw new Error('Invalid OAuth state');
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OAuthStatePayload;
    if (payload.platform !== platform || payload.exp < Date.now()) {
      throw new Error('OAuth state expired or mismatched');
    }
    return payload.userId;
  }

  private sign(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }

  private verify(value: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(value));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
