#!/usr/bin/env node
// One PayAlert soundbox simulator — behaves like a real device on the MQTT broker, for
// development and demos. It never touches the database; it only talks MQTT.
//
//   node tools/soundbox-sim.mjs --serial SBX-000123 --password <mqtt password> [options]
//
// Options:
//   --url <mqtt url>      Broker (default mqtt://localhost:1883)
//   --password-env <VAR>  Read the password from an environment variable instead of --password
//   --battery <0-100>     Battery level to report (default 87)
//   --speak               Also speak announcements aloud (Windows: System.Speech)
//   --exit-after <n>      Exit after receiving n commands (for scripted checks)
//   --probe               Try topics a device must NOT be able to use and report the broker's answer
import { execFile } from 'node:child_process';
import { connect } from 'mqtt';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const serial = opt('serial');
const password = opt('password') ?? (opt('password-env') ? process.env[opt('password-env')] : undefined);
const url = opt('url', 'mqtt://localhost:1883');
const battery = Number(opt('battery', '87'));
const exitAfter = Number(opt('exit-after', '0'));
if (!serial || !password) {
  console.error('Usage: node tools/soundbox-sim.mjs --serial <SERIAL> --password <MQTT password> [--url mqtt://host:1883] [--speak]');
  process.exit(2);
}

const topics = { cmd: `onepay/d/${serial}/cmd`, status: `onepay/d/${serial}/status`, telemetry: `onepay/d/${serial}/telemetry` };
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

function speak(text) {
  if (!flag('speak') || process.platform !== 'win32') return;
  const script = `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak($env:SOUNDBOX_TEXT)`;
  execFile('powershell.exe', ['-NoProfile', '-Command', script], { env: { ...process.env, SOUNDBOX_TEXT: text } }, () => {});
}

const client = connect(url, {
  protocolVersion: 5,
  clientId: serial,
  username: serial,
  password,
  clean: true,
  reconnectPeriod: 3000,
  // If the device drops off, the broker tells everyone it is offline.
  will: { topic: topics.status, payload: 'offline', qos: 1, retain: true },
});

let received = 0;
const telemetry = () =>
  client.publish(topics.telemetry, JSON.stringify({ firmware: 'sim-1.0.0', batteryPct: battery, signalDbm: -61 }), { qos: 1 });

client.on('connect', async () => {
  log(`connected to ${url} as ${serial}`);
  await client.publishAsync(topics.status, 'online', { qos: 1, retain: true });
  telemetry();
  const granted = await client.subscribeAsync(topics.cmd, { qos: 1 });
  log(`listening on ${topics.cmd} (granted QoS ${granted.map((g) => g.qos).join(',')})`);

  if (flag('probe')) {
    const other = 'onepay/d/SBX-OTHER1/cmd';
    try {
      const sub = await client.subscribeAsync([other, 'onepay/#'], { qos: 1 });
      log(`probe subscribe ${other} and onepay/# → ALLOWED (reason codes ${sub.map((g) => g.qos).join(',')}) — this is a security problem`);
    } catch (e) {
      log(`probe subscribe ${other} and onepay/# → refused (reason codes ${e.packet?.granted?.join(',') ?? e.message}; 135 = not authorized)`);
    }
    try {
      const res = await client.publishAsync(`onepay/d/${serial}/cmd`, '{"type":"test","text":"forged"}', { qos: 1 });
      log(`probe publish to own cmd topic → reason code ${res?.reasonCode ?? 0} (135 = not authorized)`);
    } catch (e) {
      log(`probe publish to own cmd topic → refused (${e.message})`);
    }
  }
});

setInterval(() => client.connected && telemetry(), 60_000).unref();

client.on('message', (topic, payload) => {
  if (topic !== topics.cmd) return;
  let cmd;
  try {
    cmd = JSON.parse(payload.toString('utf8'));
  } catch {
    return log('ignored a malformed command');
  }
  if (cmd.type === 'payment') {
    log(`🔊 ${cmd.simulated ? '[DEMO] ' : ''}${cmd.text}   (${cmd.amount} ${cmd.currency}, ${cmd.locale}, volume ${cmd.volume})`);
    speak(cmd.text);
  } else if (cmd.type === 'test') {
    log(`🔊 TEST: ${cmd.text}   (${cmd.locale}, volume ${cmd.volume})`);
    speak(cmd.text);
  } else if (cmd.type === 'config') {
    log(`⚙️  settings: name=${cmd.name ?? '—'}, language=${cmd.locale}, volume=${cmd.volume}`);
  }
  received++;
  if (exitAfter && received >= exitAfter) shutdown(0);
});

client.on('error', (e) => log(`error: ${e.message}`));
client.on('close', () => log('disconnected'));

async function shutdown(code) {
  // A clean disconnect does not fire the will, so report offline ourselves.
  if (client.connected) await client.publishAsync(topics.status, 'offline', { qos: 1, retain: true }).catch(() => {});
  client.end(false, () => process.exit(code));
}
process.on('SIGINT', () => shutdown(0));
