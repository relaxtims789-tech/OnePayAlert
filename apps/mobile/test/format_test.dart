import 'package:flutter_test/flutter_test.dart';
import 'package:onepay_mobile/core/format.dart';

void main() {
  group('formatMoney (integer minor units, no floating point)', () {
    test('USD keeps cents', () {
      expect(formatMoney(1250, 'USD'), r'$12.50');
      expect(formatMoney(5, 'USD'), r'$0.05');
      expect(formatMoney(123456789, 'USD'), r'$1,234,567.89');
      expect(formatMoney(-305, 'USD'), r'-$3.05');
    });

    test('KHR shows whole riel with ៛', () {
      expect(formatMoney(4000000, 'KHR'), '៛40,000');
      expect(formatMoney(0, 'KHR'), '៛0');
      expect(formatMoney(150, 'KHR'), '៛2'); // 1.50 riel rounds half up for display
    });
  });

  group('dates in Phnom Penh time', () {
    final t = DateTime.utc(2026, 11, 11, 7, 12); // 14:12 in Phnom Penh

    test('formats Khmer without relying on device locale data', () {
      expect(formatDateTime(t, 'km'), '11 វិច្ឆិកា 14:12');
      expect(formatDateTime(t, 'en'), '11 Nov 14:12');
      expect(formatDateTime(t, 'zh'), '11月11日 14:12');
    });

    test('business day starts at midnight UTC+7', () {
      final now = DateTime.utc(2026, 11, 11, 18, 30); // 01:30 on the 12th in Phnom Penh
      expect(startOfBusinessDay(0, now), DateTime.utc(2026, 11, 11, 17));
      expect(startOfBusinessDay(6, now), DateTime.utc(2026, 11, 5, 17));
    });
  });

  test('payment alert text matches the server push text', () {
    expect(paymentAlertText('en', 1250, 'USD', 'Sok Dara'), r'Received $12.50 from Sok Dara');
    expect(paymentAlertText('en', 1250, 'USD', '  '), r'Received $12.50');
    expect(paymentAlertText('km', 1250, 'USD', null), r'បានទទួលប្រាក់ $12.50');
    expect(paymentAlertText('zh', 1250, 'USD', 'Li'), r'已收到 Li 付款 $12.50');
  });
}
