import type { INestApplication } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import type { AuthTokens, DeviceCommand, DeviceCredentialsDto, DeviceDto, PaymentProviderDto } from '@onepay/shared';
import { connect, type MqttClient } from 'mqtt';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import request from 'supertest';
import { MqttClientBridge } from '../src/devices/mqtt.bridge';
import { API, PASSWORD, bearer, createTestApp, login, prismaOf, registerMerchant, uniqueEmail, waitFor } from './helpers';

const HOOK_SECRET = process.env.MQTT_HOOK_SECRET as string;
const API_MQTT_PASSWORD = process.env.MQTT_PASSWORD as string;

/** Starts the in-process aedes broker (test/mqtt-broker.mjs) and resolves with its port. */
function startBroker(): Promise<{ proc: ChildProcess; port: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [join(__dirname, 'mqtt-broker.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    proc.stdout!.on('data', (d: Buffer) => {
      const m = /PORT (\d+)/.exec(d.toString());
      if (m) resolve({ proc, port: Number(m[1]) });
    });
    proc.on('error', reject);
  });
}

/** A test soundbox: connects to the broker and records the commands it receives. */
async function soundbox(port: number, serial: string): Promise<{ client: MqttClient; commands: DeviceCommand[] }> {
  const client = connect(`mqtt://127.0.0.1:${port}`, { protocolVersion: 4, clientId: serial, username: serial, password: 'x' });
  const commands: DeviceCommand[] = [];
  client.on('message', (_t, payload) => commands.push(JSON.parse(payload.toString()) as DeviceCommand));
  await new Promise<void>((r) => client.once('connect', () => r()));
  await client.subscribeAsync(`onepay/d/${serial}/cmd`, { qos: 1 });
  return { client, commands };
}

const settle = (ms = 700) => new Promise((r) => setTimeout(r, ms));
let serialCounter = 0;
const newSerial = () => `SBX-T${Date.now().toString(36).toUpperCase()}${serialCounter++}`;

describe('Soundbox devices and MQTT (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let broker: { proc: ChildProcess; port: number };
  let bridge: MqttClientBridge;
  let superAdmin: AuthTokens;
  let support: AuthTokens;
  const devices: MqttClient[] = [];

  const register = async (serial = newSerial()) =>
    (await request(http).post(`${API}/platform/devices`).set('Authorization', bearer(superAdmin)).send({ serialNumber: serial, model: 'OPA-SB1' }).expect(201))
      .body as DeviceCredentialsDto;
  const claim = (t: AuthTokens, body: Record<string, unknown>) => request(http).post(`${API}/devices/claim`).set('Authorization', bearer(t)).send(body);
  const hook = (path: 'auth' | 'acl', body: Record<string, unknown>, secret: string | null = HOOK_SECRET) => {
    const r = request(http).post(`${API}/mqtt/${path}`);
    if (secret) r.set('x-onepay-hook-secret', secret);
    return r.send(body);
  };

  async function staff(role: 'SUPER_ADMIN' | 'SUPPORT') {
    const email = uniqueEmail(`device.${role.toLowerCase()}`);
    await prismaOf(app).user.create({
      data: { email, fullName: `MysoftKH ${role}`, passwordHash: await hash(PASSWORD), platformRole: role, locale: 'en' },
    });
    return login(app, email);
  }

  beforeAll(async () => {
    broker = await startBroker();
    // aedes speaks MQTT 3.1.1 only; production uses MQTT 5 (EMQX) for command expiry.
    bridge = new MqttClientBridge(`mqtt://127.0.0.1:${broker.port}`, 'onepay-api', 'unused-by-aedes', { protocolVersion: 4 });
    app = await createTestApp({ mqttBridge: bridge });
    http = app.getHttpServer();
    await waitFor(async () => bridge.connected());
    superAdmin = await staff('SUPER_ADMIN');
    support = await staff('SUPPORT');
  });
  afterAll(async () => {
    for (const d of devices) d.end(true);
    await app.close();
    bridge.onApplicationShutdown();
    broker.proc.kill('SIGTERM');
  });

  describe('MysoftKH inventory', () => {
    it('registers a device and shows its MQTT password and claim code exactly once', async () => {
      const creds = await register();
      expect(creds.device).toMatchObject({ status: 'UNASSIGNED', companyId: null, online: false });
      expect(creds.mqttUsername).toBe(creds.device.serialNumber);
      expect(creds.mqttPassword.length).toBeGreaterThanOrEqual(32);
      expect(creds.claimCode).toMatch(/^[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/);
      const row = await prismaOf(app).device.findUniqueOrThrow({ where: { id: creds.device.id } });
      expect(row.secretHash).not.toContain(creds.mqttPassword);
      const list = await request(http).get(`${API}/platform/devices?search=${creds.device.serialNumber}`).set('Authorization', bearer(support)).expect(200);
      expect(JSON.stringify(list.body)).not.toContain(creds.mqttPassword);
      expect(list.body.items).toHaveLength(1);
    });

    it('rejects serials that are unsafe as MQTT topics, duplicates, and non-admin staff', async () => {
      await request(http).post(`${API}/platform/devices`).set('Authorization', bearer(superAdmin)).send({ serialNumber: 'SBX/1#', model: 'X1' }).expect(400);
      const creds = await register();
      await request(http).post(`${API}/platform/devices`).set('Authorization', bearer(superAdmin)).send({ serialNumber: creds.device.serialNumber, model: 'X1' }).expect(409);
      await request(http).post(`${API}/platform/devices`).set('Authorization', bearer(support)).send({ serialNumber: newSerial(), model: 'X1' }).expect(403);
      const merchant = await registerMerchant(app, 'Inventory Peek');
      await request(http).get(`${API}/platform/devices`).set('Authorization', bearer(merchant.tokens)).expect(403);
    });
  });

  describe('EMQX hooks', () => {
    it('lets in only real devices with their own password, and the API as superuser', async () => {
      const creds = await register();
      const serial = creds.device.serialNumber;
      expect((await hook('auth', { username: serial, clientid: serial, password: creds.mqttPassword }).expect(200)).body).toEqual({ result: 'allow', is_superuser: false });
      expect((await hook('auth', { username: serial, clientid: serial, password: 'wrong' })).body.result).toBe('deny');
      expect((await hook('auth', { username: serial, clientid: 'someone-else', password: creds.mqttPassword })).body.result).toBe('deny');
      expect((await hook('auth', { username: 'SBX-NOPE01', clientid: 'SBX-NOPE01', password: 'x' })).body.result).toBe('deny');
      expect((await hook('auth', { username: serial, clientid: serial, password: creds.mqttPassword }, null)).body.result).toBe('deny');
      expect((await hook('auth', { username: serial, clientid: serial, password: creds.mqttPassword }, 'wrong-secret-wrong-secret-x')).body.result).toBe('deny');

      expect((await hook('auth', { username: 'onepay-api', clientid: 'onepay-api-1', password: API_MQTT_PASSWORD })).body).toEqual({ result: 'allow', is_superuser: true });
      expect((await hook('auth', { username: 'onepay-api', clientid: 'onepay-api-1', password: 'guess' })).body.result).toBe('deny');

      // Rotating the secret retires the old password; disabling refuses the device entirely.
      const rotated = (await request(http).post(`${API}/platform/devices/${creds.device.id}/rotate-secret`).set('Authorization', bearer(superAdmin)).expect(200))
        .body as DeviceCredentialsDto;
      expect((await hook('auth', { username: serial, clientid: serial, password: creds.mqttPassword })).body.result).toBe('deny');
      expect((await hook('auth', { username: serial, clientid: serial, password: rotated.mqttPassword })).body.result).toBe('allow');
      await request(http).patch(`${API}/platform/devices/${creds.device.id}`).set('Authorization', bearer(superAdmin)).send({ disabled: true }).expect(200);
      expect((await hook('auth', { username: serial, clientid: serial, password: rotated.mqttPassword })).body.result).toBe('deny');
    });

    it('confines a device to its own topics', async () => {
      const s = 'SBX-ACL001';
      const acl = async (action: string, topic: string, clientid = s) => (await hook('acl', { username: s, clientid, action, topic })).body.result;
      expect(await acl('subscribe', `onepay/d/${s}/cmd`)).toBe('allow');
      expect(await acl('publish', `onepay/d/${s}/status`)).toBe('allow');
      expect(await acl('publish', `onepay/d/${s}/telemetry`)).toBe('allow');
      expect(await acl('publish', `onepay/d/${s}/cmd`)).toBe('deny');
      expect(await acl('subscribe', 'onepay/d/SBX-OTHER1/cmd')).toBe('deny');
      expect(await acl('subscribe', 'onepay/#')).toBe('deny');
      expect(await acl('subscribe', `onepay/d/${s}/cmd`, 'impostor')).toBe('deny');
      expect((await hook('acl', { username: s, clientid: s, action: 'subscribe', topic: `onepay/d/${s}/cmd` }, null)).body.result).toBe('deny');
    });
  });

  describe('merchant devices and announcements', () => {
    let owner: AuthTokens;
    let companyId: string;
    let riverside: string;
    let bkk: string;
    let connectionId: string;

    beforeAll(async () => {
      const shop = await registerMerchant(app, 'Soundbox Cafe');
      owner = shop.tokens;
      companyId = shop.companyId;
      riverside = (await request(http).post(`${API}/outlets`).set('Authorization', bearer(owner)).send({ name: 'Riverside', code: 'RIVER' }).expect(201)).body.id;
      bkk = (await request(http).post(`${API}/outlets`).set('Authorization', bearer(owner)).send({ name: 'BKK1', code: 'BKK1' }).expect(201)).body.id;
      const providers = (await request(http).get(`${API}/payment-providers`).set('Authorization', bearer(owner))).body as PaymentProviderDto[];
      connectionId = (
        await request(http)
          .post(`${API}/bank-connections`)
          .set('Authorization', bearer(owner))
          .send({ providerId: providers.find((p) => p.code === 'DEMO_SIMULATOR')!.id, displayName: 'Counter', currency: 'USD' })
          .expect(201)
      ).body.id;
    });

    const pay = (amount: string, outletCode: string, type = 'payment.succeeded') =>
      request(http).post(`${API}/bank-connections/${connectionId}/simulate-payment`).set('Authorization', bearer(owner)).send({ amount, outletCode, type }).expect(202);

    it('claims with the box code (any case, with or without the dash) and refuses everything else alike', async () => {
      const creds = await register();
      const bad = await claim(owner, { serialNumber: creds.device.serialNumber, claimCode: 'ZZZZ-ZZZZ' }).expect(400);
      expect(bad.body.code).toBe('DEVICE_CLAIM_INVALID');
      const unknown = await claim(owner, { serialNumber: 'SBX-UNKNOWN9', claimCode: creds.claimCode }).expect(400);
      expect(unknown.body.message).toBe(bad.body.message);

      const d = (await claim(owner, {
        serialNumber: creds.device.serialNumber.toLowerCase(),
        claimCode: ` ${creds.claimCode!.replace('-', '').toLowerCase()} `,
        name: 'Front counter',
        outletId: riverside,
        locale: 'en',
      }).expect(201)).body as DeviceDto;
      expect(d).toMatchObject({ status: 'ACTIVE', name: 'Front counter', outletId: riverside, locale: 'en' });

      const other = await registerMerchant(app, 'Box Thief');
      expect((await claim(other.tokens, { serialNumber: creds.device.serialNumber, claimCode: creds.claimCode }).expect(400)).body.code).toBe('DEVICE_CLAIM_INVALID');
      await request(http).get(`${API}/devices`).set('Authorization', bearer(other.tokens)).expect(200).expect((r) => expect(r.body).toEqual([]));
      await request(http).post(`${API}/devices/${d.id}/test`).set('Authorization', bearer(other.tokens)).expect(404);
    });

    it('counts devices toward the plan', async () => {
      const shop = await registerMerchant(app, 'Small Shop', { plan: 'STARTER' });
      const first = await register();
      const second = await register();
      await claim(shop.tokens, { serialNumber: first.device.serialNumber, claimCode: first.claimCode }).expect(201);
      const res = await claim(shop.tokens, { serialNumber: second.device.serialNumber, claimCode: second.claimCode }).expect(403);
      expect(res.body.code).toBe('PLAN_LIMIT_DEVICES');
      // Releasing frees the slot and puts the box back up for claiming.
      const mine = (await request(http).get(`${API}/devices`).set('Authorization', bearer(shop.tokens))).body as DeviceDto[];
      await request(http).delete(`${API}/devices/${mine[0]!.id}`).set('Authorization', bearer(shop.tokens)).expect(204);
      await claim(shop.tokens, { serialNumber: second.device.serialNumber, claimCode: second.claimCode }).expect(201);
      await claim(owner, { serialNumber: first.device.serialNumber, claimCode: first.claimCode }).expect(201);
    });

    it('announces successful payments on the devices that cover that outlet only', async () => {
      const mk = async (outletId: string | null, locale: 'km' | 'en' | 'zh') => {
        const c = await register();
        const d = (await claim(owner, { serialNumber: c.device.serialNumber, claimCode: c.claimCode, ...(outletId ? { outletId } : {}), locale }).expect(201))
          .body as DeviceDto;
        const box = await soundbox(broker.port, d.serialNumber);
        devices.push(box.client);
        return { d, box };
      };
      const river = await mk(riverside, 'km');
      const city = await mk(bkk, 'en');
      const shopWide = await mk(null, 'zh');
      await settle();
      for (const b of [river, city, shopWide]) b.box.commands.length = 0;

      await pay('12.50', 'RIVER');
      await waitFor(async () => river.box.commands.length > 0 && shopWide.box.commands.length > 0);
      await settle();
      expect(river.box.commands).toEqual([
        expect.objectContaining({ type: 'payment', amountMinor: 1250, amount: '12.50', currency: 'USD', locale: 'km', simulated: true, volume: 80 }),
      ]);
      expect((river.box.commands[0] as { text: string }).text).toContain('បានទទួលប្រាក់');
      expect((shopWide.box.commands[0] as { text: string }).text).toContain('已收到付款');
      expect(city.box.commands).toEqual([]);

      // Pending payments are never announced as money received.
      for (const b of [river, city, shopWide]) b.box.commands.length = 0;
      await pay('3.00', 'BKK1', 'payment.pending');
      await settle(1200);
      expect([...river.box.commands, ...city.box.commands, ...shopWide.box.commands]).toEqual([]);
    });

    it('pushes setting changes and test sounds to the device', async () => {
      const c = await register();
      const d = (await claim(owner, { serialNumber: c.device.serialNumber, claimCode: c.claimCode }).expect(201)).body as DeviceDto;
      const box = await soundbox(broker.port, d.serialNumber);
      devices.push(box.client);
      await settle();

      const updated = await request(http).patch(`${API}/devices/${d.id}`).set('Authorization', bearer(owner)).send({ volume: 35, locale: 'zh', name: 'Bar' }).expect(200);
      expect(updated.body).toMatchObject({ volume: 35, locale: 'zh', name: 'Bar' });
      await request(http).post(`${API}/devices/${d.id}/test`).set('Authorization', bearer(owner)).expect(200).expect((r) => expect(r.body.sent).toBe(true));
      await waitFor(async () => box.commands.length >= 2);
      expect(box.commands).toEqual([
        { type: 'config', locale: 'zh', volume: 35, name: 'Bar' },
        { type: 'test', text: 'One PayAlert 声音测试', locale: 'zh', volume: 35 },
      ]);
      await request(http).patch(`${API}/devices/${d.id}`).set('Authorization', bearer(owner)).send({ volume: 101 }).expect(400);
    });

    it('tracks online status and telemetry reported by the device', async () => {
      const c = await register();
      const d = (await claim(owner, { serialNumber: c.device.serialNumber, claimCode: c.claimCode }).expect(201)).body as DeviceDto;
      const box = await soundbox(broker.port, d.serialNumber);
      devices.push(box.client);
      await box.client.publishAsync(`onepay/d/${d.serialNumber}/status`, 'online', { qos: 1, retain: true });
      await box.client.publishAsync(`onepay/d/${d.serialNumber}/telemetry`, JSON.stringify({ firmware: '1.4.2', batteryPct: 140, signalDbm: -67 }), { qos: 1 });
      const row = await waitFor(async () => {
        const r = await prismaOf(app).device.findUniqueOrThrow({ where: { id: d.id } });
        return r.online && r.firmware === '1.4.2' ? r : null;
      });
      expect(row).toMatchObject({ batteryPct: 100, signalDbm: -67 });
      expect(row.lastSeenAt).not.toBeNull();
      await box.client.publishAsync(`onepay/d/${d.serialNumber}/status`, 'offline', { qos: 1, retain: true });
      await waitFor(async () => !(await prismaOf(app).device.findUniqueOrThrow({ where: { id: d.id } })).online);
    });

    it('shows outlet-restricted staff only their outlet’s devices', async () => {
      const email = uniqueEmail('river.manager');
      await request(http)
        .post(`${API}/employees`)
        .set('Authorization', bearer(owner))
        .send({ email, fullName: 'River Manager', role: 'MANAGER', initialPassword: PASSWORD, outletIds: [riverside] })
        .expect(201);
      const manager = await login(app, email);
      const theirs = (await request(http).get(`${API}/devices`).set('Authorization', bearer(manager)).expect(200)).body as DeviceDto[];
      expect(theirs.length).toBeGreaterThan(0);
      expect(theirs.every((d) => d.outletId === riverside)).toBe(true);
      const all = (await request(http).get(`${API}/devices`).set('Authorization', bearer(owner))).body as DeviceDto[];
      expect(all.length).toBeGreaterThan(theirs.length);
      expect(await prismaOf(app).auditLog.count({ where: { companyId, action: 'device.claimed' } })).toBeGreaterThan(0);
    });
  });
});
