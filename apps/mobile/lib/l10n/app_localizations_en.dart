// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'One PayAlert';

  @override
  String get tagline => 'One Platform. Multiple Banks. Instant Payment Alerts.';

  @override
  String get signInTitle => 'Welcome back';

  @override
  String get signInSubtitle =>
      'Sign in to hear every payment the moment it lands.';

  @override
  String get email => 'Email';

  @override
  String get password => 'Password';

  @override
  String get signIn => 'Sign in';

  @override
  String get invalidCredentials => 'Invalid email or password';

  @override
  String get networkError =>
      'Cannot reach the server. Check your connection and try again.';

  @override
  String get somethingWrong => 'Something went wrong';

  @override
  String get retry => 'Try again';

  @override
  String get sessionExpired => 'Your session has ended. Please sign in again.';

  @override
  String get home => 'Home';

  @override
  String get transactions => 'Transactions';

  @override
  String get settings => 'Settings';

  @override
  String greeting(String name) {
    return 'Hello, $name';
  }

  @override
  String get receivedToday => 'Received today';

  @override
  String paymentsToday(int count) {
    return '$count successful payments today';
  }

  @override
  String pendingFailed(int pending, int failed) {
    return 'Pending $pending · Failed $failed';
  }

  @override
  String get liveFeed => 'Live payments';

  @override
  String get live => 'Live';

  @override
  String get connecting => 'Connecting…';

  @override
  String get offline => 'Offline';

  @override
  String get noPayments => 'No payments yet';

  @override
  String get noPaymentsHint => 'New payments appear here instantly.';

  @override
  String newPayment(String amount) {
    return 'New payment: $amount';
  }

  @override
  String get soundAlerts => 'Sound and voice alerts';

  @override
  String get soundAlertsHint =>
      'Chime and spoken amount for every successful payment';

  @override
  String get today => 'Today';

  @override
  String get last7 => '7 days';

  @override
  String get last30 => '30 days';

  @override
  String get allStatuses => 'All';

  @override
  String get allOutlets => 'All outlets';

  @override
  String get statusSuccess => 'Successful';

  @override
  String get statusPending => 'Pending';

  @override
  String get statusFailed => 'Failed';

  @override
  String get statusReversed => 'Reversed';

  @override
  String get noTransactions => 'No transactions found';

  @override
  String get details => 'Transaction details';

  @override
  String get payer => 'Payer';

  @override
  String get payerAccount => 'Payer account';

  @override
  String get reference => 'Reference';

  @override
  String get provider => 'Bank / gateway';

  @override
  String get paidAt => 'Paid at';

  @override
  String get providerTxnId => 'Transaction ID';

  @override
  String get demo => 'Demo';

  @override
  String get simulated => 'Simulated (not real money)';

  @override
  String get company => 'Company';

  @override
  String get role => 'Role';

  @override
  String get language => 'Language';

  @override
  String get signOut => 'Sign out';

  @override
  String get pushNotifications => 'Push notifications';

  @override
  String get pushOn => 'On — alerts arrive even when the app is closed';

  @override
  String get pushOff => 'Not configured for this build';

  @override
  String get version => 'Version';

  @override
  String get account => 'Account';

  @override
  String get roleOwner => 'Owner';

  @override
  String get roleAdmin => 'Admin';

  @override
  String get roleManager => 'Manager';

  @override
  String get roleAccountant => 'Accountant';

  @override
  String get roleCashier => 'Cashier';
}
