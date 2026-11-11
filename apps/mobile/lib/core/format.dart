/// Money and date formatting shared by every screen.
///
/// Money is always an integer count of minor units (e.g. USD cents). No floating point is
/// used anywhere in the conversion. Dates are shown in Asia/Phnom_Penh (UTC+7, no DST).
library;

const _exponent = {'USD': 2, 'KHR': 2};
const _displayDecimals = {'USD': 2, 'KHR': 0};
const _symbols = {'USD': r'$', 'KHR': '៛'};

String _group(int n) {
  final s = n.toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return b.toString();
}

/// 1250, 'USD' → "$12.50"; 4000000, 'KHR' → "៛40,000" (riel has no sub-unit in circulation).
String formatMoney(int minor, String currency) {
  final exp = _exponent[currency] ?? 2;
  final decimals = _displayDecimals[currency] ?? 2;
  var divisor = 1;
  for (var i = 0; i < exp; i++) {
    divisor *= 10;
  }
  final negative = minor < 0;
  final abs = minor.abs();
  var whole = abs ~/ divisor;
  final frac = abs % divisor;
  String fracText = '';
  if (decimals == 0) {
    if (frac * 2 >= divisor) whole += 1; // round half up for display only
  } else {
    fracText = '.${frac.toString().padLeft(exp, '0').substring(0, decimals)}';
  }
  return '${negative ? '-' : ''}${_symbols[currency] ?? '$currency '}${_group(whole)}$fracText';
}

const khmerMonths = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
const _englishMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _ppOffset = Duration(hours: 7);

DateTime toPhnomPenh(DateTime t) => t.toUtc().add(_ppOffset);

String _two(int n) => n.toString().padLeft(2, '0');

/// "11 វិច្ឆិកា 14:12" / "11 Nov 14:12" / "11月11日 14:12" in Phnom Penh time.
String formatDateTime(DateTime t, String locale) {
  final p = toPhnomPenh(t);
  final time = '${_two(p.hour)}:${_two(p.minute)}';
  switch (locale) {
    case 'km':
      return '${p.day} ${khmerMonths[p.month - 1]} $time';
    case 'zh':
      return '${p.month}月${p.day}日 $time';
    default:
      return '${p.day} ${_englishMonths[p.month - 1]} $time';
  }
}

/// Start of a Phnom Penh business day, [daysAgo] days back, as a UTC instant.
DateTime startOfBusinessDay(int daysAgo, [DateTime? now]) {
  final local = (now ?? DateTime.now()).toUtc().add(_ppOffset);
  return DateTime.utc(local.year, local.month, local.day - daysAgo).subtract(_ppOffset);
}

/// Spoken / notification text for a successful payment (mirrors the server's push text).
String paymentAlertText(String locale, int amountMinor, String currency, String? payerName) {
  final amount = formatMoney(amountMinor, currency);
  final payer = (payerName ?? '').trim();
  switch (locale) {
    case 'km':
      return payer.isEmpty ? 'បានទទួលប្រាក់ $amount' : 'បានទទួលប្រាក់ $amount ពី $payer';
    case 'zh':
      return payer.isEmpty ? '已收到付款 $amount' : '已收到 $payer 付款 $amount';
    default:
      return payer.isEmpty ? 'Received $amount' : 'Received $amount from $payer';
  }
}
