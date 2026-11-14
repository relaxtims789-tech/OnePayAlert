/// API data models (mirroring `@onepay/shared` types). Money is integer minor units.
library;

class AuthTokens {
  const AuthTokens({required this.accessToken, required this.refreshToken, required this.expiresIn});
  final String accessToken;
  final String refreshToken;
  final int expiresIn;

  factory AuthTokens.fromJson(Map<String, dynamic> j) => AuthTokens(
        accessToken: j['accessToken'] as String,
        refreshToken: j['refreshToken'] as String,
        expiresIn: (j['accessTokenExpiresIn'] as num).toInt(),
      );
}

class Membership {
  const Membership({required this.companyId, required this.companyName, required this.role});
  final String companyId;
  final String companyName;
  final String role;

  factory Membership.fromJson(Map<String, dynamic> j) =>
      Membership(companyId: j['companyId'] as String, companyName: j['companyName'] as String, role: j['role'] as String);
}

class Me {
  const Me({
    required this.id,
    required this.email,
    required this.fullName,
    required this.locale,
    required this.activeCompanyId,
    required this.activeRole,
    required this.permissions,
    required this.memberships,
  });
  final String id;
  final String email;
  final String fullName;
  final String locale;
  final String? activeCompanyId;
  final String? activeRole;
  final List<String> permissions;
  final List<Membership> memberships;

  bool can(String permission) => permissions.contains(permission);

  Membership? get activeMembership {
    for (final m in memberships) {
      if (m.companyId == activeCompanyId) return m;
    }
    return null;
  }

  factory Me.fromJson(Map<String, dynamic> j) => Me(
        id: j['id'] as String,
        email: j['email'] as String,
        fullName: j['fullName'] as String,
        locale: j['locale'] as String,
        activeCompanyId: j['activeCompanyId'] as String?,
        activeRole: j['activeRole'] as String?,
        permissions: (j['permissions'] as List).cast<String>(),
        memberships: (j['memberships'] as List).map((m) => Membership.fromJson(Map<String, dynamic>.from(m as Map))).toList(),
      );
}

class Txn {
  const Txn({
    required this.id,
    required this.outletId,
    required this.providerCode,
    required this.providerTxnId,
    required this.status,
    required this.amountMinor,
    required this.currency,
    required this.payerName,
    required this.payerAccountMasked,
    required this.reference,
    required this.isSimulated,
    this.reported = false,
    required this.occurredAt,
  });
  final String id;
  final String? outletId;
  final String providerCode;
  final String providerTxnId;
  final String status;
  final int amountMinor;
  final String currency;
  final String? payerName;
  final String? payerAccountMasked;
  final String? reference;
  final bool isSimulated;
  /// Read from a bank app notification on a merchant phone (not confirmed by the bank).
  final bool reported;
  final DateTime occurredAt;

  factory Txn.fromJson(Map<String, dynamic> j) => Txn(
        id: j['id'] as String,
        outletId: j['outletId'] as String?,
        providerCode: j['providerCode'] as String,
        providerTxnId: j['providerTxnId'] as String,
        status: j['status'] as String,
        amountMinor: (j['amountMinor'] as num).toInt(),
        currency: j['currency'] as String,
        payerName: j['payerName'] as String?,
        payerAccountMasked: j['payerAccountMasked'] as String?,
        reference: j['reference'] as String?,
        isSimulated: j['isSimulated'] as bool? ?? false,
        reported: j['verification'] == 'REPORTED',
        occurredAt: DateTime.parse(j['occurredAt'] as String),
      );
}

class CurrencySummary {
  const CurrencySummary({
    required this.currency,
    required this.successCount,
    required this.successAmountMinor,
    required this.pendingCount,
    required this.failedCount,
  });
  final String currency;
  final int successCount;
  final int successAmountMinor;
  final int pendingCount;
  final int failedCount;

  factory CurrencySummary.fromJson(Map<String, dynamic> j) => CurrencySummary(
        currency: j['currency'] as String,
        successCount: (j['successCount'] as num).toInt(),
        successAmountMinor: (j['successAmountMinor'] as num).toInt(),
        pendingCount: (j['pendingCount'] as num).toInt(),
        failedCount: (j['failedCount'] as num).toInt(),
      );
}

class Summary {
  const Summary(this.byCurrency);
  final List<CurrencySummary> byCurrency;

  CurrencySummary? of(String currency) {
    for (final c in byCurrency) {
      if (c.currency == currency) return c;
    }
    return null;
  }

  int get successCount => byCurrency.fold(0, (a, c) => a + c.successCount);
  int get pendingCount => byCurrency.fold(0, (a, c) => a + c.pendingCount);
  int get failedCount => byCurrency.fold(0, (a, c) => a + c.failedCount);

  factory Summary.fromJson(Map<String, dynamic> j) =>
      Summary((j['byCurrency'] as List).map((c) => CurrencySummary.fromJson(Map<String, dynamic>.from(c as Map))).toList());
}

class Page<T> {
  const Page({required this.items, required this.total, required this.page, required this.pageSize});
  final List<T> items;
  final int total;
  final int page;
  final int pageSize;

  bool get hasMore => page * pageSize < total;

  static Page<T> fromJson<T>(Map<String, dynamic> j, T Function(Map<String, dynamic>) item) => Page<T>(
        items: (j['items'] as List).map((e) => item(Map<String, dynamic>.from(e as Map))).toList(),
        total: (j['total'] as num).toInt(),
        page: (j['page'] as num).toInt(),
        pageSize: (j['pageSize'] as num).toInt(),
      );
}

/// A branch/shop of the active company, as far as this member may see.
class Outlet {
  const Outlet({required this.id, required this.name, required this.code});
  final String id;
  final String name;
  final String code;

  factory Outlet.fromJson(Map<String, dynamic> j) =>
      Outlet(id: j['id'] as String, name: j['name'] as String, code: j['code'] as String);
}

/// A Bakong account the member can show a KHQR code for (GET /khqr/accounts).
class KhqrAccount {
  const KhqrAccount({
    required this.id,
    required this.displayName,
    required this.accountId,
    required this.merchantName,
    required this.currency,
    required this.outletId,
  });
  final String id;
  final String displayName;
  final String accountId;
  final String merchantName;
  final String currency;
  final String? outletId;

  factory KhqrAccount.fromJson(Map<String, dynamic> j) => KhqrAccount(
        id: j['id'] as String,
        displayName: j['displayName'] as String,
        accountId: j['accountId'] as String,
        merchantName: j['merchantName'] as String? ?? '',
        currency: j['currency'] as String,
        outletId: j['outletId'] as String?,
      );
}

/// A KHQR payment request. [status] is PENDING, PAID, EXPIRED, CANCELED or REVIEW.
class KhqrCharge {
  const KhqrCharge({
    required this.id,
    required this.reference,
    required this.amountMinor,
    required this.currency,
    required this.qr,
    required this.status,
    required this.merchantName,
    required this.expiresAt,
    required this.payerAccount,
    required this.simulated,
  });
  final String id;
  final String reference;
  final int amountMinor;
  final String currency;
  final String qr;
  final String status;
  final String merchantName;
  final DateTime expiresAt;
  final String? payerAccount;
  final bool simulated;

  bool get isPending => status == 'PENDING';

  factory KhqrCharge.fromJson(Map<String, dynamic> j) => KhqrCharge(
        id: j['id'] as String,
        reference: j['reference'] as String,
        amountMinor: (j['amountMinor'] as num).toInt(),
        currency: j['currency'] as String,
        qr: j['qr'] as String,
        status: j['status'] as String,
        merchantName: j['merchantName'] as String? ?? '',
        expiresAt: DateTime.parse(j['expiresAt'] as String),
        payerAccount: j['payerAccount'] as String?,
        simulated: j['simulated'] as bool? ?? false,
      );
}

/// A "Bank alerts on your phone" connection this phone can forward to.
class RelayConnection {
  const RelayConnection({required this.id, required this.displayName, required this.currency});
  final String id;
  final String displayName;
  final String currency;
}

/// Returned once when this phone is set up; the secret stays on the phone.
class RelayEnrollment {
  const RelayEnrollment({required this.relayId, required this.secret});
  final String relayId;
  final String secret;
}

/// A soundbox of the company (GET /devices).
class Soundbox {
  const Soundbox({
    required this.id,
    required this.serialNumber,
    required this.name,
    required this.outletId,
    required this.status,
    required this.locale,
    required this.online,
    required this.batteryPct,
  });
  final String id;
  final String serialNumber;
  final String? name;
  final String? outletId;
  final String status;
  final String locale;
  final bool online;
  final int? batteryPct;

  String get label => (name == null || name!.isEmpty) ? serialNumber : name!;

  factory Soundbox.fromJson(Map<String, dynamic> j) => Soundbox(
        id: j['id'] as String,
        serialNumber: j['serialNumber'] as String,
        name: j['name'] as String?,
        outletId: j['outletId'] as String?,
        status: j['status'] as String,
        locale: j['locale'] as String,
        online: j['online'] as bool? ?? false,
        batteryPct: (j['batteryPct'] as num?)?.toInt(),
      );
}
