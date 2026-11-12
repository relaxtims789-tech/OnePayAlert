import type { Locale } from './enums';
import type { Currency } from './money';

export type DeviceStatus = 'UNASSIGNED' | 'ACTIVE' | 'DISABLED';

/** Serial numbers double as MQTT username, client id and topic segment, so no MQTT wildcards or slashes. */
export const DEVICE_SERIAL_PATTERN = /^[A-Z0-9][A-Z0-9-]{4,31}$/;

/**
 * MQTT topics of one soundbox. The device may only subscribe to its own `cmd` topic and publish
 * to its own `status` (retained "online"/"offline", with "offline" as the last will) and
 * `telemetry` topics. Nothing else.
 */
export function deviceTopics(serial: string) {
  const base = `onepay/d/${serial}`;
  return { cmd: `${base}/cmd`, status: `${base}/status`, telemetry: `${base}/telemetry` };
}
export const DEVICE_STATUS_WILDCARD = 'onepay/d/+/status';
export const DEVICE_TELEMETRY_WILDCARD = 'onepay/d/+/telemetry';

/** Whether a device (MQTT username = serial) may publish/subscribe to `topic`. */
export function deviceMayAccess(serial: string, action: 'publish' | 'subscribe', topic: string): boolean {
  const t = deviceTopics(serial);
  return action === 'subscribe' ? topic === t.cmd : topic === t.status || topic === t.telemetry;
}

/** Messages the platform sends to a soundbox on its `cmd` topic (JSON, QoS 1, not retained). */
export type DeviceCommand =
  | {
      type: 'payment';
      id: string;
      amountMinor: number;
      currency: Currency;
      /** Plain decimal, e.g. "12.50", for devices that compose audio from number clips. */
      amount: string;
      /** What to say/show, in the device language. */
      text: string;
      locale: Locale;
      volume: number;
      simulated: boolean;
      occurredAt: string;
    }
  | { type: 'test'; text: string; locale: Locale; volume: number }
  | { type: 'config'; locale: Locale; volume: number; name: string | null };

/** Telemetry a soundbox publishes (all fields optional). */
export interface DeviceTelemetry {
  firmware?: string;
  batteryPct?: number;
  signalDbm?: number;
}

/** A merchant's view of a device. */
export interface DeviceDto {
  id: string;
  serialNumber: string;
  model: string;
  name: string | null;
  outletId: string | null;
  status: DeviceStatus;
  locale: Locale;
  volume: number;
  online: boolean;
  lastSeenAt: string | null;
  firmware: string | null;
  batteryPct: number | null;
  signalDbm: number | null;
  claimedAt: string | null;
}

/** MysoftKH inventory view. */
export interface PlatformDeviceDto extends DeviceDto {
  companyId: string | null;
  companyName: string | null;
  createdAt: string;
}

/** Returned once when MysoftKH registers a device or rotates its secret; never stored in clear. */
export interface DeviceCredentialsDto {
  device: PlatformDeviceDto;
  /** MQTT password to flash onto the device. */
  mqttPassword: string;
  /** Code to print on the box; the merchant types it to claim the device. Only on registration. */
  claimCode?: string;
  mqttUsername: string;
}

/** POST /devices/:id/test */
export interface DeviceTestResultDto {
  sent: boolean;
  online: boolean;
}

/** Spoken/displayed test sentence. */
export const DEVICE_TEST_TEXT: Record<Locale, string> = {
  km: 'One PayAlert សាកល្បងសំឡេង',
  en: 'One PayAlert sound test',
  zh: 'One PayAlert 声音测试',
};
