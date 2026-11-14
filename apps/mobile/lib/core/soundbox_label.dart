/// The QR on a soundbox box label (same format as `soundboxLabelPayload` in @onepay/shared):
/// `OPASB1:<serial>:<claim code>`. A bare serial (barcode under the device) is accepted too.
library;

const soundboxLabelPrefix = 'OPASB1';
final _serial = RegExp(r'^[A-Z0-9][A-Z0-9-]{4,31}$');
final _claimChars = RegExp(r'^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$');

/// "k7qf2m9x" / "K7QF-2M9X" → "K7QF-2M9X"; null when it cannot be a claim code.
String? normaliseClaimCode(String raw) {
  final c = raw.toUpperCase().replaceAll(RegExp('[^A-Z0-9]'), '');
  return _claimChars.hasMatch(c) ? '${c.substring(0, 4)}-${c.substring(4)}' : null;
}

bool isSoundboxSerial(String s) => _serial.hasMatch(s.trim().toUpperCase());

class SoundboxLabel {
  const SoundboxLabel(this.serialNumber, this.claimCode);
  final String serialNumber;
  final String? claimCode;
}

/// What the camera saw → serial (and claim code), or null when it is not a soundbox label.
SoundboxLabel? parseSoundboxLabel(String scanned) {
  final text = scanned.trim().toUpperCase();
  final parts = text.split(':');
  if (parts.first == soundboxLabelPrefix) {
    if (parts.length != 3 || !_serial.hasMatch(parts[1])) return null;
    final code = normaliseClaimCode(parts[2]);
    return code == null ? null : SoundboxLabel(parts[1], code);
  }
  return _serial.hasMatch(text) ? SoundboxLabel(text, null) : null;
}
