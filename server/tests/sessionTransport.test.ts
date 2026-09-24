import './setup';
import http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { app } from '../src/app';
import { initRealtime } from '../src/realtime';
import {
  signAccessToken,
  signSocketToken,
  verifyAccessToken,
  verifySocketToken,
} from '../src/services/token.service';

/*
 * The web client now reaches the REST API through its own origin, so its
 * session cookie is first-party there and never reaches this host's socket
 * handshake. These cover the replacement credential and — the part that
 * matters for security — that it cannot be used as the thing it replaces.
 */

describe('socket token', () => {
  it('round-trips as a socket token', () => {
    const t = signSocketToken({ id: 'u1', role: 'customer' });
    expect(verifySocketToken(t)).toMatchObject({ id: 'u1', role: 'customer' });
  });

  it('is refused as an access token, so it can never stand in for the session cookie', () => {
    const t = signSocketToken({ id: 'u1', role: 'customer' });
    expect(() => verifyAccessToken(t)).toThrow();
  });

  it('refuses a real access token presented as a socket token', () => {
    const t = signAccessToken({ id: 'u1', role: 'customer' });
    expect(() => verifySocketToken(t)).toThrow();
  });

  it('is only issued to a signed-in caller', async () => {
    const anon = await request(app).post('/api/auth/socket-token');
    expect(anon.status).toBe(401);

    const agent = request.agent(app);
    await agent.post('/api/auth/signup/customer').send({ name: 'S', phone: '9000000501', password: 'Passw0rd!' });
    const res = await agent.post('/api/auth/socket-token');
    expect(res.status).toBe(200);
    expect(verifySocketToken(res.body.token).role).toBe('customer');
  });
});

describe('socket handshake', () => {
  let httpServer: http.Server;
  let baseUrl: string;

  beforeAll((done) => {
    httpServer = http.createServer(app);
    initRealtime(httpServer);
    httpServer.listen(0, () => {
      baseUrl = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
      done();
    });
  });
  afterAll((done) => {
    httpServer.close(() => done());
  });

  function connect(opts: Parameters<typeof ioClient>[1]): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const s = ioClient(baseUrl, { forceNew: true, transports: ['polling', 'websocket'], ...opts });
      s.on('connect', () => resolve(s));
      s.on('connect_error', (e) => {
        s.close();
        reject(e);
      });
    });
  }

  it('accepts a socket token in the handshake, with no cookie at all', async () => {
    const s = await connect({ auth: { token: signSocketToken({ id: 'u2', role: 'customer' }) } });
    expect(s.connected).toBe(true);
    s.close();
  });

  it('refuses an access token passed where the socket token goes', async () => {
    await expect(
      connect({ auth: { token: signAccessToken({ id: 'u2', role: 'customer' }) } })
    ).rejects.toThrow();
  });

  it('still accepts the cookie, for PWAs running a build cached from before the proxy', async () => {
    const cookie = `accessToken=${signAccessToken({ id: 'u3', role: 'customer' })}`;
    const s = await connect({ extraHeaders: { Cookie: cookie } });
    expect(s.connected).toBe(true);
    s.close();
  });

  it('refuses a handshake with neither', async () => {
    await expect(connect({})).rejects.toThrow();
  });
});

describe('per-account login limit', () => {
  it('stops password guessing on one account regardless of source address', async () => {
    await request(app).post('/api/auth/signup/customer').send({ name: 'L', phone: '9000000502', password: 'Passw0rd!' });

    // Each attempt claims a different forwarded address — the thing a caller
    // hitting this host directly could forge. The account limit ignores it.
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const r = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `10.0.${i}.1`)
        .send({ phone: '9000000502', password: `wrong-${i}` });
      last = r.status;
    }
    expect(last).toBe(429);
  });

  it('does not count successful logins against the person', async () => {
    await request(app).post('/api/auth/signup/customer').send({ name: 'M', phone: '9000000503', password: 'Passw0rd!' });
    for (let i = 0; i < 12; i++) {
      const r = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `10.1.${i}.1`)
        .send({ phone: '9000000503', password: 'Passw0rd!' });
      expect(r.status).toBe(200);
    }
  });
});
