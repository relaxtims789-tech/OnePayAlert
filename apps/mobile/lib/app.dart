import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'l10n/app_localizations.dart';
import 'state/app_state.dart';
import 'ui/collect_screen.dart';
import 'ui/home_screen.dart';
import 'ui/login_screen.dart';
import 'ui/settings_screen.dart';
import 'ui/theme.dart';
import 'ui/transactions_screen.dart';
import 'ui/widgets.dart';

class OnePayAlertApp extends ConsumerWidget {
  const OnePayAlertApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider);
    return MaterialApp(
      title: 'One PayAlert',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      locale: Locale(locale),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const _AuthGate(),
    );
  }
}

class _AuthGate extends ConsumerWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    return session.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) {
        final t = AppLocalizations.of(context);
        return Scaffold(
          body: Center(
            child: ErrorView(
              message: errorMessage(e, network: t.networkError, generic: t.somethingWrong),
              onRetry: () => ref.invalidate(sessionProvider),
            ),
          ),
        );
      },
      data: (me) => me == null ? const LoginScreen() : const _Shell(),
    );
  }
}

class _Shell extends ConsumerStatefulWidget {
  const _Shell();
  @override
  ConsumerState<_Shell> createState() => _ShellState();
}

class _ShellState extends ConsumerState<_Shell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    // Collecting with KHQR is for members allowed to take payments (not e.g. accountants).
    final canCollect = ref.watch(sessionProvider.select((s) => s.value?.can('payment.collect') ?? false));
    final tabs = <(Widget, NavigationDestination)>[
      (const HomeScreen(), NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home_rounded), label: t.home)),
      if (canCollect)
        (
          const CollectScreen(),
          NavigationDestination(
            key: const Key('nav-collect'),
            icon: const Icon(Icons.qr_code_2_outlined),
            selectedIcon: const Icon(Icons.qr_code_2_rounded),
            label: t.collect,
          ),
        ),
      (
        const TransactionsScreen(),
        NavigationDestination(icon: const Icon(Icons.receipt_long_outlined), selectedIcon: const Icon(Icons.receipt_long_rounded), label: t.transactions),
      ),
      (const SettingsScreen(), NavigationDestination(icon: const Icon(Icons.settings_outlined), selectedIcon: const Icon(Icons.settings_rounded), label: t.settings)),
    ];
    final index = _index.clamp(0, tabs.length - 1);
    return Scaffold(
      body: IndexedStack(index: index, children: [for (final tab in tabs) tab.$1]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [for (final tab in tabs) tab.$2],
      ),
    );
  }
}
