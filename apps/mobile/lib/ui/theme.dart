import 'package:flutter/material.dart';

/// One PayAlert brand palette (same tokens as the web dashboards).
class Brand {
  static const primary = Color(0xFF0759B8);
  static const secondary = Color(0xFF1670D5);
  static const surface = Color(0xFFF5F7FA);
  static const ink = Color(0xFF0F1B2D);
  static const ink2 = Color(0xFF475569);
  static const ink3 = Color(0xFF8794A7);
  static const line = Color(0xFFE3E8EF);
  static const success = Color(0xFF16A34A);
  static const successBg = Color(0xFFE9F8EF);
  static const pending = Color(0xFFF97316);
  static const pendingBg = Color(0xFFFFF1E6);
  static const failed = Color(0xFFDC2626);
  static const failedBg = Color(0xFFFDECEC);
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: Brand.primary, primary: Brand.primary, secondary: Brand.secondary, surface: Colors.white);
  final radius = BorderRadius.circular(14);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Brand.surface,
    // Khmer script needs a Khmer-capable font; Android ships Noto Sans Khmer as a fallback.
    fontFamilyFallback: const ['Noto Sans Khmer', 'Khmer OS', 'Noto Sans SC'],
    appBarTheme: const AppBarTheme(backgroundColor: Brand.surface, foregroundColor: Brand.ink, elevation: 0, scrolledUnderElevation: 0, centerTitle: false),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: Brand.line)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: radius, borderSide: const BorderSide(color: Brand.line)),
      enabledBorder: OutlineInputBorder(borderRadius: radius, borderSide: const BorderSide(color: Brand.line)),
      focusedBorder: OutlineInputBorder(borderRadius: radius, borderSide: const BorderSide(color: Brand.secondary, width: 1.5)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), shape: RoundedRectangleBorder(borderRadius: radius)),
    ),
    navigationBarTheme: const NavigationBarThemeData(backgroundColor: Colors.white, indicatorColor: Color(0xFFEAF2FC)),
  );
}
