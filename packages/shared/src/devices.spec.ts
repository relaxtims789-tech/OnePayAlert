import { DEVICE_SERIAL_PATTERN, deviceMayAccess, deviceTopics } from './devices';

describe('soundbox MQTT access rules', () => {
  const t = deviceTopics('SBX-000123');

  it('lets a device read only its own command topic', () => {
    expect(deviceMayAccess('SBX-000123', 'subscribe', t.cmd)).toBe(true);
    expect(deviceMayAccess('SBX-000123', 'subscribe', 'onepay/d/SBX-000999/cmd')).toBe(false);
    expect(deviceMayAccess('SBX-000123', 'subscribe', 'onepay/d/+/cmd')).toBe(false);
    expect(deviceMayAccess('SBX-000123', 'subscribe', '#')).toBe(false);
    expect(deviceMayAccess('SBX-000123', 'subscribe', t.status)).toBe(false);
  });

  it('lets a device publish only its own status and telemetry', () => {
    expect(deviceMayAccess('SBX-000123', 'publish', t.status)).toBe(true);
    expect(deviceMayAccess('SBX-000123', 'publish', t.telemetry)).toBe(true);
    expect(deviceMayAccess('SBX-000123', 'publish', t.cmd)).toBe(false);
    expect(deviceMayAccess('SBX-000123', 'publish', 'onepay/d/SBX-000999/status')).toBe(false);
  });

  it('only accepts serials that are safe as an MQTT topic segment', () => {
    for (const ok of ['SBX-000123', 'OPA1234567']) expect(DEVICE_SERIAL_PATTERN.test(ok)).toBe(true);
    for (const bad of ['sbx-1', 'SBX/1', 'SBX+00001', 'SBX#00001', '-SBX0001', 'AB']) expect(DEVICE_SERIAL_PATTERN.test(bad)).toBe(false);
  });
});
