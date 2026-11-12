import { Injectable, Logger, type OnApplicationShutdown, type Provider } from '@nestjs/common';
import { DEVICE_STATUS_WILDCARD, DEVICE_TELEMETRY_WILDCARD } from '@onepay/shared';
import { connect, type MqttClient } from 'mqtt';
import { AppConfig } from '../config/app-config.service';

export const MQTT_BRIDGE = Symbol('MQTT_BRIDGE');

/** How long the broker keeps an undelivered command for an offline device (seconds). */
export const COMMAND_EXPIRY_SECONDS = 60;

export type DeviceMessageHandler = (topic: string, payload: Buffer) => void;

/** The API's connection to the soundbox broker. */
export interface MqttBridge {
  readonly enabled: boolean;
  connected(): boolean;
  /** Publishes a command; resolves false when the broker is not reachable (never throws). */
  publish(topic: string, payload: unknown): Promise<boolean>;
  /** Called for every device status/telemetry message. */
  onDeviceMessage(handler: DeviceMessageHandler): void;
}

/** Used when MQTT_URL is not configured: nothing is sent, and the dashboards say so. */
export class DisabledMqttBridge implements MqttBridge {
  readonly enabled = false;
  connected(): boolean {
    return false;
  }
  async publish(): Promise<boolean> {
    return false;
  }
  onDeviceMessage(): void {}
}

/**
 * MQTT 5 client to EMQX. Commands are QoS 1, not retained, and expire after a minute, so a
 * soundbox that was offline never announces a payment from an hour ago when it reconnects.
 */
@Injectable()
export class MqttClientBridge implements MqttBridge, OnApplicationShutdown {
  readonly enabled = true;
  private readonly logger = new Logger('MqttBridge');
  private readonly client: MqttClient;
  private handler: DeviceMessageHandler | null = null;
  private readonly v5: boolean;

  /** `protocolVersion: 4` is only for brokers without MQTT 5 (the in-process test broker). */
  constructor(url: string, username: string, password: string, opts: { protocolVersion?: 4 | 5 } = {}) {
    this.v5 = (opts.protocolVersion ?? 5) === 5;
    this.client = connect(url, {
      protocolVersion: this.v5 ? 5 : 4,
      clientId: `onepay-api-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
      username,
      password,
      reconnectPeriod: 3_000,
      // EMQX asks this API to authenticate us, so the first attempt can be refused while the API
      // is still starting up. Keep retrying instead of giving up.
      reconnectOnConnackError: true,
      connectTimeout: 10_000,
      clean: true,
    });
    this.client.on('connect', () => {
      this.logger.log(`Connected to ${url}`);
      this.client.subscribe([DEVICE_STATUS_WILDCARD, DEVICE_TELEMETRY_WILDCARD], { qos: 1 }, (err) => {
        if (err) this.logger.error(`Subscribe failed: ${err.message}`);
      });
    });
    this.client.on('error', (e) => this.logger.warn(`MQTT error: ${e.message}`));
    this.client.on('message', (topic, payload) => this.handler?.(topic, payload));
  }

  connected(): boolean {
    return this.client.connected;
  }

  publish(topic: string, payload: unknown): Promise<boolean> {
    if (!this.client.connected) return Promise.resolve(false);
    return new Promise((resolve) => {
      this.client.publish(
        topic,
        JSON.stringify(payload),
        {
          qos: 1,
          retain: false,
          ...(this.v5 ? { properties: { messageExpiryInterval: COMMAND_EXPIRY_SECONDS, contentType: 'application/json' } } : {}),
        },
        (err) => {
          if (err) this.logger.warn(`Publish to ${topic} failed: ${err.message}`);
          resolve(!err);
        },
      );
    });
  }

  onDeviceMessage(handler: DeviceMessageHandler): void {
    this.handler = handler;
  }

  onApplicationShutdown(): void {
    this.client.end(true);
  }
}

export const mqttBridgeProvider: Provider = {
  provide: MQTT_BRIDGE,
  inject: [AppConfig],
  useFactory: (config: AppConfig): MqttBridge => {
    const url = config.get('MQTT_URL');
    const password = config.get('MQTT_PASSWORD');
    if (!url || !password) {
      new Logger('MqttBridge').log('MQTT_URL not set: soundbox announcements are disabled');
      return new DisabledMqttBridge();
    }
    return new MqttClientBridge(url, config.get('MQTT_USERNAME'), password);
  },
};
