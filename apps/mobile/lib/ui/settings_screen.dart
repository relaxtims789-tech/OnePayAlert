import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/config.dart';
import '../l10n/app_localizations.dart';
import '../state/app_state.dart';
import 'bank_alerts_screen.dart';
import 'theme.dart';

const _languages = {'km': 'ខ្មែរ', 'en': 'English', 'zh': '中文'};
String roleLabel(AppLocalizations t, String? role) => switch (role) {
      'OWNER' => t.roleOwner,
      'ADMIN' => t.roleAdmin,
      'MANAGER' => t.roleManager,
      'ACCOUNTANT' => t.roleAccountant,
      'CASHIER' => t.roleCashier,
      _ => role ?? '',
    };

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final me = ref.watch(sessionProvider).requireValue!;
    final locale = ref.watch(localeProvider);
    final sound = ref.watch(soundProvider);
    final push = ref.watch(pushProvider);

    void snack(Object e) => ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(errorMessage(e, network: t.networkError, generic: t.somethingWrong))));

    return Scaffold(
      appBar: AppBar(title: Text(t.settings, style: const TextStyle(fontWeight: FontWeight.w700))),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(
          child: Column(children: [
            ListTile(
              leading: const CircleAvatar(backgroundColor: Color(0xFFEAF2FC), child: Icon(Icons.person_rounded, color: Brand.primary)),
              title: Text(me.fullName, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(me.email),
            ),
            const Divider(height: 1, color: Brand.line),
            ListTile(
              leading: const Icon(Icons.storefront_rounded),
              title: Text(t.company),
              subtitle: Text('${me.activeMembership?.companyName ?? ''} · ${roleLabel(t, me.activeRole)}'),
              trailing: me.memberships.length > 1 ? const Icon(Icons.swap_horiz_rounded) : null,
              onTap: me.memberships.length <= 1
                  ? null
                  : () => showModalBottomSheet<void>(
                        context: context,
                        builder: (_) => SafeArea(
                          child: Column(mainAxisSize: MainAxisSize.min, children: [
                            for (final m in me.memberships)
                              ListTile(
                                title: Text(m.companyName),
                                subtitle: Text(roleLabel(t, m.role)),
                                trailing: m.companyId == me.activeCompanyId ? const Icon(Icons.check_rounded, color: Brand.primary) : null,
                                onTap: () async {
                                  Navigator.pop(context);
                                  try {
                                    await ref.read(sessionProvider.notifier).switchCompany(m.companyId);
                                  } catch (e) {
                                    snack(e);
                                  }
                                },
                              ),
                          ]),
                        ),
                      ),
            ),
          ]),
        ),
        const SizedBox(height: 16),
        Card(
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.translate_rounded),
              title: Text(t.language),
              trailing: DropdownButton<String>(
                key: const Key('language'),
                value: locale,
                underline: const SizedBox.shrink(),
                items: [for (final e in _languages.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                onChanged: (l) async {
                  if (l == null || l == locale) return;
                  try {
                    await ref.read(sessionProvider.notifier).setLocale(l);
                  } catch (e) {
                    snack(e);
                  }
                },
              ),
            ),
            const Divider(height: 1, color: Brand.line),
            SwitchListTile(
              secondary: const Icon(Icons.volume_up_rounded),
              title: Text(t.soundAlerts),
              subtitle: Text(t.soundAlertsHint),
              value: sound,
              onChanged: (v) => ref.read(soundProvider.notifier).set(v),
            ),
            const Divider(height: 1, color: Brand.line),
            ListTile(
              leading: const Icon(Icons.notifications_active_outlined),
              title: Text(t.pushNotifications),
              subtitle: Text(push.enabled ? t.pushOn : t.pushOff),
            ),
          ]),
        ),
        // Phone bank alerts: Android only, set up by owners and admins.
        if (defaultTargetPlatform == TargetPlatform.android && me.can('bank_connection.manage')) ...[
          const SizedBox(height: 16),
          Card(
            child: ListTile(
              key: const Key('bank-alerts-tile'),
              leading: const Icon(Icons.phonelink_ring_rounded, color: Brand.primary),
              title: Text(t.bankAlerts, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(t.bankAlertsHint),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const BankAlertsScreen())),
            ),
          ),
        ],
        const SizedBox(height: 16),
        Card(
          child: ListTile(
            key: const Key('sign-out'),
            leading: const Icon(Icons.logout_rounded, color: Brand.failed),
            title: Text(t.signOut, style: const TextStyle(color: Brand.failed, fontWeight: FontWeight.w600)),
            onTap: () => ref.read(sessionProvider.notifier).signOut(),
          ),
        ),
        const SizedBox(height: 20),
        Center(child: Text('${t.version} ${AppConfig.appVersion}', style: const TextStyle(color: Brand.ink3, fontSize: 12))),
      ]),
    );
  }
}
