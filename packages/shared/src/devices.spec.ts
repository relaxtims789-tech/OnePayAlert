import { DEVICE_SERIAL_PATTERN, deviceMayAccess, deviceTopics, normaliseClaimCodeInput, parseSoundboxLabel, soundboxLabelPayload } from './devices';

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

describe('soundbox label QR', () => {
  it('round-trips serial and claim code, in any case and with or without the dash', () => {
    const payload = soundboxLabelPayload('SBX-000123', 'K7QF-2M9X');
    expect(payload).toBe('OPASB1:SBX-000123:K7QF-2M9X');
    expect(parseSoundboxLabel(payload)).toEqual({ serialNumber: 'SBX-000123', claimCode: 'K7QF-2M9X' });
    expect(parseSoundboxLabel(' opasb1:sbx-000123:k7qf2m9x \n')).toEqual({ serialNumber: 'SBX-000123', claimCode: 'K7QF-2M9X' });
  });

  it('accepts a bare serial barcode, and rejects anything else', () => {
    expect(parseSoundboxLabel('WQRJ002019001234')).toEqual({ serialNumber: 'WQRJ002019001234', claimCode: null });
    expect(parseSoundboxLabel('https://example.com/pay?x=1')).toBeNull();
    expect(parseSoundboxLabel('OPASB1:SBX-000123')).toBeNull();
    expect(parseSoundboxLabel('OPASB1:SBX-000123:K7QF-2M9I')).toBeNull(); // I is not a claim-code letter
    expect(parseSoundboxLabel('OPASB1:bad serial:K7QF-2M9X')).toBeNull();
  });

  it('normalises typed claim codes', () => {
    expect(normaliseClaimCodeInput('k7qf 2m9x')).toBe('K7QF-2M9X');
    expect(normaliseClaimCodeInput('K7QF-2M9')).toBeNull();
  });
});
