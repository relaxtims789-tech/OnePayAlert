import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/format.dart';
import '../data/models.dart';
import '../l10n/app_localizations.dart';
import '../services/realtime_service.dart';
import '../state/app_state.dart';
import 'theme.dart';
import 'widgets.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final locale = ref.watch(localeProvider);
    final me = ref.watch(sessionProvider).requireValue!;
    final summary = ref.watch(todaySummaryProvider);
    final feed = ref.watch(feedProvider);
    final status = ref.watch(realtimeStatusProvider).maybeWhen(data: (s) => s, orElse: () => RealtimeStatus.connecting);
    final sound = ref.watch(soundProvider);

    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(t.greeting(me.fullName.split(' ').first), style: const TextStyle(fontWeight: FontWeight.w700)),
          Text(me.activeMembership?.companyName ?? '', style: const TextStyle(fontSize: 12.5, color: Brand.ink2)),
        ]),
        actions: [
          IconButton(
            key: const Key('sound-toggle'),
            tooltip: t.soundAlerts,
            icon: Icon(sound ? Icons.volume_up_rounded : Icons.volume_off_rounded, color: sound ? Brand.primary : Brand.ink3),
            onPressed: () => ref.read(soundProvider.notifier).set(!sound),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(feedProvider.notifier).reload(),
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
          _TodayCard(summary: summary),
          const SizedBox(height: 16),
          Card(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
                child: Row(children: [
                  Expanded(child: Text(t.liveFeed, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
                  LiveDot(status),
                ]),
              ),
              feed.when(
                loading: () => const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator())),
                error: (e, _) => ErrorView(
                  message: errorMessage(e, network: t.networkError, generic: t.somethingWrong),
                  onRetry: () => ref.invalidate(feedProvider),
                ),
                data: (items) => items.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.all(32),
                        child: Column(children: [
                          const Icon(Icons.notifications_none_rounded, size: 36, color: Brand.primary),
                          const SizedBox(height: 8),
                          Text(t.noPayments, style: const TextStyle(fontWeight: FontWeight.w600)),
                          Text(t.noPaymentsHint, textAlign: TextAlign.center, style: const TextStyle(color: Brand.ink2)),
                        ]),
                      )
                    : Column(
                        key: const Key('live-feed'),
                        children: [
                          for (final txn in items) ...[
                            TxnTile(txn, locale: locale, onTap: () => showTxnDetails(context, txn, locale)),
                            if (txn != items.last) const Divider(height: 1, indent: 70, color: Brand.line),
                          ],
                        ],
                      ),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _TodayCard extends StatelessWidget {
  const _TodayCard({required this.summary});
  final AsyncValue<Summary> summary;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final s = summary.hasValue ? summary.requireValue : null;
    Widget amount(String currency) => Text(
          formatMoney(s?.of(currency)?.successAmountMinor ?? 0, currency),
          key: Key('today-$currency'),
          style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w700),
        );
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(colors: [Brand.secondary, Brand.primary], begin: Alignment.topLeft, end: Alignment.bottomRight),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(t.receivedToday, style: TextStyle(color: Colors.white.withValues(alpha: 0.85))),
        const SizedBox(height: 8),
        if (summary.isLoading && s == null)
          const SizedBox(height: 34, child: LinearProgressIndicator(color: Colors.white24, backgroundColor: Colors.transparent))
        else
          Wrap(spacing: 22, runSpacing: 4, children: [amount('USD'), amount('KHR')]),
        const SizedBox(height: 12),
        Text(
          s == null ? '' : '${t.paymentsToday(s.successCount)} · ${t.pendingFailed(s.pendingCount, s.failedCount)}',
          style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 12.5),
        ),
      ]),
    );
  }
}
