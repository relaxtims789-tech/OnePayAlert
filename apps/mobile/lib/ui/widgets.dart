import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/format.dart';
import '../data/models.dart';
import '../l10n/app_localizations.dart';
import '../services/realtime_service.dart';
import '../state/app_state.dart';
import 'theme.dart';

String statusLabel(AppLocalizations t, String status) => switch (status) {
      'SUCCESS' => t.statusSuccess,
      'PENDING' => t.statusPending,
      'FAILED' => t.statusFailed,
      _ => t.statusReversed,
    };

(Color, Color) statusColors(String status) => switch (status) {
      'SUCCESS' => (Brand.success, Brand.successBg),
      'PENDING' => (Brand.pending, Brand.pendingBg),
      'FAILED' => (Brand.failed, Brand.failedBg),
      _ => (Brand.ink2, Brand.surface),
    };

class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, required this.fg, required this.bg});
  final String text;
  final Color fg;
  final Color bg;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
        child: Text(text, style: TextStyle(color: fg, fontSize: 11.5, fontWeight: FontWeight.w600)),
      );
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (fg, bg) = statusColors(status);
    return Pill(statusLabel(AppLocalizations.of(context), status), fg: fg, bg: bg);
  }
}

class DemoPill extends StatelessWidget {
  const DemoPill({super.key});
  @override
  Widget build(BuildContext context) => Pill(AppLocalizations.of(context).demo, fg: Brand.pending, bg: Brand.pendingBg);
}

/// A payment read from a bank app notification on a merchant phone, not confirmed by the bank.
class FromPhonePill extends StatelessWidget {
  const FromPhonePill({super.key});
  @override
  Widget build(BuildContext context) => Pill(AppLocalizations.of(context).fromPhone, fg: Brand.ink2, bg: Brand.surface);
}

class LiveDot extends StatelessWidget {
  const LiveDot(this.status, {super.key});
  final RealtimeStatus status;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final (color, label) = switch (status) {
      RealtimeStatus.live => (Brand.success, t.live),
      RealtimeStatus.connecting => (Brand.pending, t.connecting),
      RealtimeStatus.offline => (Brand.ink3, t.offline),
    };
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 9, height: 9, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
      const SizedBox(width: 6),
      Text(label, key: const Key('live-status'), style: const TextStyle(fontSize: 12.5, color: Brand.ink2, fontWeight: FontWeight.w500)),
    ]);
  }
}

class TxnTile extends StatelessWidget {
  const TxnTile(this.txn, {super.key, required this.locale, this.onTap});
  final Txn txn;
  final String locale;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final (fg, bg) = statusColors(txn.status);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
            child: Icon(Icons.south_west_rounded, color: fg, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(
                  child: Text(txn.payerName ?? txn.reference ?? txn.providerTxnId,
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, color: Brand.ink)),
                ),
                if (txn.isSimulated) ...[const SizedBox(width: 6), const DemoPill()],
                if (txn.reported) ...[const SizedBox(width: 6), const FromPhonePill()],
              ]),
              const SizedBox(height: 2),
              Text('${formatDateTime(txn.occurredAt, locale)} · ${txn.providerCode}',
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Brand.ink3)),
            ]),
          ),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text('${txn.status == 'SUCCESS' ? '+' : ''}${formatMoney(txn.amountMinor, txn.currency)}',
                style: TextStyle(fontWeight: FontWeight.w700, color: txn.status == 'SUCCESS' ? Brand.success : Brand.ink, fontFeatures: const [FontFeature.tabularFigures()])),
            const SizedBox(height: 4),
            StatusPill(txn.status),
          ]),
        ]),
      ),
    );
  }
}

Future<void> showTxnDetails(BuildContext context, Txn txn, String locale) {
  final t = AppLocalizations.of(context);
  Widget row(String k, String? v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Text(k, style: const TextStyle(color: Brand.ink2))),
          const SizedBox(width: 12),
          Flexible(child: Text(v ?? '—', textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w600))),
        ]),
      );
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    backgroundColor: Colors.white,
    builder: (_) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(t.details, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(color: Brand.surface, borderRadius: BorderRadius.circular(16)),
            child: Column(children: [
              Text(formatMoney(txn.amountMinor, txn.currency), style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                StatusPill(txn.status),
                if (txn.isSimulated) ...[const SizedBox(width: 6), const DemoPill()],
                if (txn.reported) ...[const SizedBox(width: 6), const FromPhonePill()],
              ]),
            ]),
          ),
          const SizedBox(height: 8),
          row(t.payer, txn.payerName),
          row(t.payerAccount, txn.payerAccountMasked),
          row(t.reference, txn.reference),
          row(t.provider, txn.providerCode),
          row(t.paidAt, formatDateTime(txn.occurredAt, locale)),
          row(t.providerTxnId, txn.providerTxnId),
          if (txn.isSimulated) row(t.demo, t.simulated),
        ]),
      ),
    ),
  );
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.wifi_off_rounded, color: Brand.failed, size: 36),
        const SizedBox(height: 10),
        Text(t.somethingWrong, style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Brand.ink2)),
        const SizedBox(height: 12),
        OutlinedButton(onPressed: onRetry, child: Text(t.retry)),
      ]),
    );
  }
}

/// "All outlets / Outlet A / Outlet B" switch. Hidden when the member sees one outlet or fewer.
class OutletChips extends ConsumerWidget {
  const OutletChips({super.key, this.padding = const EdgeInsets.fromLTRB(16, 0, 16, 8)});
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final outlets = ref.watch(outletsProvider).value ?? const <Outlet>[];
    if (outlets.length < 2) return const SizedBox.shrink();
    final t = AppLocalizations.of(context);
    final selected = ref.watch(selectedOutletProvider);
    Widget chip(String? id, String label) => Padding(
          padding: const EdgeInsets.only(right: 8),
          child: ChoiceChip(
            key: Key('outlet-${id ?? 'all'}'),
            avatar: id == null ? const Icon(Icons.storefront_rounded, size: 18) : null,
            label: Text(label),
            selected: selected == id,
            onSelected: (_) => ref.read(outletChoiceProvider.notifier).set(id),
          ),
        );
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: padding,
      child: Row(children: [chip(null, t.allOutlets), for (final o in outlets) chip(o.id, o.name)]),
    );
  }
}
