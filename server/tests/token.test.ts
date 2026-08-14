import './setup';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../src/services/token.service';

describe('token service', () => {
  it('signs and verifies an access token round-trip', () => {
    const token = signAccessToken({ id: 'user1', role: 'customer' });
    const payload = verifyAccessToken(token);
    expect(payload.id).toBe('user1');
    expect(payload.role).toBe('customer');
  });

  it('signs and verifies a refresh token round-trip', () => {
    const token = signRefreshToken({ id: 'user1', tokenVersion: 0 });
    const payload = verifyRefreshToken(token);
    expect(payload.id).toBe('user1');
    expect(payload.tokenVersion).toBe(0);
  });

  it('rejects a tampered access token', () => {
    const token = signAccessToken({ id: 'user1', role: 'customer' });
    expect(() => verifyAccessToken(token + 'x')).toThrow();
  });
});
