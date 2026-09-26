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
  create(userId: string, platform: 'ebay' | 'aliexpress'): string {
    const payload: OAuthStatePayload = {
      userId,
      platform,
      nonce: randomBytes(8).toString('hex'),
      exp: Date.now() + 15 * 60 * 1000,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.sign(encoded, this.secrets(platform)[0])}`;
  }

  read(state: string, platform: 'ebay' | 'aliexpress'): string {
    const [encoded, signature] = state.split('.');
    if (!encoded || !signature) {
      throw new Error('Invalid OAuth state');
    }
    const matched = this.secrets(platform).some((secret) => this.verify(encoded, signature, secret));
    if (!matched) {
      throw new Error('Invalid OAuth state');
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OAuthStatePayload;
    if (payload.platform !== platform || payload.exp < Date.now()) {
      throw new Error('OAuth state expired or mismatched');
    }
    return payload.userId;
  }

  private secrets(platform: 'ebay' | 'aliexpress'): string[] {
    const preferred =
      platform === 'ebay' ? process.env.EBAY_CERT_ID : process.env.ALIEXPRESS_APP_SECRET;
    return [
      ...new Set(
        [process.env.OAUTH_STATE_SECRET, preferred, process.env.EBAY_CERT_ID, process.env.AUTH0_CLIENT_SECRET]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ];
  }

  private sign(value: string, secret: string): string {
    return createHmac('sha256', secret).update(value).digest('base64url');
  }

  private verify(value: string, signature: string, secret: string): boolean {
    const expected = Buffer.from(this.sign(value, secret));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
