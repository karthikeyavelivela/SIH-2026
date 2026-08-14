import './setup';
import request from 'supertest';
import { app } from '../src/app';

describe('validate middleware', () => {
  it('never echoes the submitted value back in a validation error response, even for a password field', async () => {
    const res = await request(app).post('/api/auth/signup/customer').send({
      name: 'Asha',
      phone: '9000000099',
      password: 'short', // fails isLength({ min: 8 })
    });

    expect(res.status).toBe(400);
    expect(res.body.details).toBeDefined();

    // The plaintext password must not appear anywhere in the response body.
    const bodyText = JSON.stringify(res.body);
    expect(bodyText).not.toContain('short');

    // Each error entry should carry field/message info but no `value` key.
    for (const err of res.body.details) {
      expect(err).not.toHaveProperty('value');
    }
  });
});
