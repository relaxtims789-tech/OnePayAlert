import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Every language must define every message, non-empty, with the same placeholders.
void main() {
  Map<String, String> load(String locale) {
    final raw = jsonDecode(File('lib/l10n/app_$locale.arb').readAsStringSync()) as Map<String, dynamic>;
    return {
      for (final e in raw.entries)
        if (!e.key.startsWith('@')) e.key: e.value as String,
    };
  }

  List<String> placeholders(String s) => RegExp(r'\{(\w+)\}').allMatches(s).map((m) => m.group(1)!).toList()..sort();

  final en = load('en');
  for (final locale in ['km', 'zh']) {
    test('$locale matches English keys and placeholders', () {
      final other = load(locale);
      expect(other.keys.toSet(), en.keys.toSet());
      for (final k in en.keys) {
        expect(other[k]!.trim(), isNotEmpty, reason: '$locale.$k is empty');
        expect(placeholders(other[k]!), placeholders(en[k]!), reason: '$locale.$k placeholders');
      }
    });
  }
}
