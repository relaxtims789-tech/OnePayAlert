// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Khmer Central Khmer (`km`).
class AppLocalizationsKm extends AppLocalizations {
  AppLocalizationsKm([String locale = 'km']) : super(locale);

  @override
  String get appName => 'One PayAlert';

  @override
  String get tagline => 'វេទិកាតែមួយ។ ធនាគារច្រើន។ ការជូនដំណឹងទូទាត់ភ្លាមៗ។';

  @override
  String get signInTitle => 'សូមស្វាគមន៍ការត្រឡប់មកវិញ';

  @override
  String get signInSubtitle =>
      'ចូលគណនីដើម្បីដឹងរាល់ការទូទាត់ភ្លាមៗពេលប្រាក់ចូល។';

  @override
  String get email => 'អ៊ីមែល';

  @override
  String get password => 'ពាក្យសម្ងាត់';

  @override
  String get signIn => 'ចូលគណនី';

  @override
  String get invalidCredentials => 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ';

  @override
  String get networkError =>
      'មិនអាចភ្ជាប់ទៅម៉ាស៊ីនមេបានទេ។ សូមពិនិត្យការតភ្ជាប់ ហើយព្យាយាមម្តងទៀត។';

  @override
  String get somethingWrong => 'មានបញ្ហាកើតឡើង';

  @override
  String get retry => 'ព្យាយាមម្តងទៀត';

  @override
  String get sessionExpired => 'វគ្គរបស់អ្នកបានបញ្ចប់។ សូមចូលគណនីម្តងទៀត។';

  @override
  String get home => 'ទំព័រដើម';

  @override
  String get transactions => 'ប្រតិបត្តិការ';

  @override
  String get settings => 'ការកំណត់';

  @override
  String greeting(String name) {
    return 'សួស្តី $name';
  }

  @override
  String get receivedToday => 'ទទួលបានថ្ងៃនេះ';

  @override
  String paymentsToday(int count) {
    return 'ការទូទាត់ជោគជ័យ $count ថ្ងៃនេះ';
  }

  @override
  String pendingFailed(int pending, int failed) {
    return 'កំពុងរង់ចាំ $pending · បរាជ័យ $failed';
  }

  @override
  String get liveFeed => 'ការទូទាត់ផ្ទាល់';

  @override
  String get live => 'ផ្ទាល់';

  @override
  String get connecting => 'កំពុងភ្ជាប់…';

  @override
  String get offline => 'ក្រៅបណ្តាញ';

  @override
  String get noPayments => 'មិនទាន់មានការទូទាត់';

  @override
  String get noPaymentsHint => 'ការទូទាត់ថ្មីនឹងបង្ហាញនៅទីនេះភ្លាមៗ។';

  @override
  String newPayment(String amount) {
    return 'ការទូទាត់ថ្មី៖ $amount';
  }

  @override
  String get soundAlerts => 'ការជូនដំណឹងជាសំឡេង';

  @override
  String get soundAlertsHint =>
      'សំឡេងរោទ៍ និងអានចំនួនទឹកប្រាក់សម្រាប់រាល់ការទូទាត់ជោគជ័យ';

  @override
  String get today => 'ថ្ងៃនេះ';

  @override
  String get last7 => '7 ថ្ងៃ';

  @override
  String get last30 => '30 ថ្ងៃ';

  @override
  String get allStatuses => 'ទាំងអស់';

  @override
  String get allOutlets => 'គ្រប់សាខា';

  @override
  String get statusSuccess => 'ជោគជ័យ';

  @override
  String get statusPending => 'កំពុងរង់ចាំ';

  @override
  String get statusFailed => 'បរាជ័យ';

  @override
  String get statusReversed => 'បានបង្វិលសង';

  @override
  String get noTransactions => 'រកមិនឃើញប្រតិបត្តិការ';

  @override
  String get details => 'ព័ត៌មានលម្អិតប្រតិបត្តិការ';

  @override
  String get payer => 'អ្នកបង់ប្រាក់';

  @override
  String get payerAccount => 'គណនីអ្នកបង់ប្រាក់';

  @override
  String get reference => 'លេខយោង';

  @override
  String get provider => 'ធនាគារ / ច្រកទូទាត់';

  @override
  String get paidAt => 'បានបង់នៅ';

  @override
  String get providerTxnId => 'លេខប្រតិបត្តិការ';

  @override
  String get demo => 'សាកល្បង';

  @override
  String get simulated => 'ការសាកល្បង (មិនមែនប្រាក់ពិត)';

  @override
  String get company => 'ក្រុមហ៊ុន';

  @override
  String get role => 'តួនាទី';

  @override
  String get language => 'ភាសា';

  @override
  String get signOut => 'ចាកចេញ';

  @override
  String get pushNotifications => 'ការជូនដំណឹង Push';

  @override
  String get pushOn => 'បើក — ទទួលការជូនដំណឹង ទោះបិទកម្មវិធីក៏ដោយ';

  @override
  String get pushOff => 'មិនទាន់កំណត់សម្រាប់កំណែនេះ';

  @override
  String get version => 'កំណែ';

  @override
  String get account => 'គណនី';

  @override
  String get roleOwner => 'ម្ចាស់';

  @override
  String get roleAdmin => 'អ្នកគ្រប់គ្រងប្រព័ន្ធ';

  @override
  String get roleManager => 'អ្នកគ្រប់គ្រង';

  @override
  String get roleAccountant => 'គណនេយ្យករ';

  @override
  String get roleCashier => 'បេឡាករ';

  @override
  String get collect => 'ទទួលប្រាក់';

  @override
  String get collectTitle => 'ទទួលការទូទាត់';

  @override
  String get collectAccount => 'គណនីទទួលប្រាក់';

  @override
  String collectAmount(String currency) {
    return 'ចំនួនទឹកប្រាក់ ($currency)';
  }

  @override
  String get collectShowQr => 'បង្ហាញ KHQR';

  @override
  String get collectScanHint => 'ស្កេនដោយកម្មវិធីធនាគារណាមួយក្នុងកម្ពុជា';

  @override
  String get collectWaiting => 'កំពុងរង់ចាំអតិថិជនបង់ប្រាក់…';

  @override
  String collectExpiresIn(String time) {
    return 'ផុតកំណត់ក្នុង $time';
  }

  @override
  String get collectCancel => 'បោះបង់';

  @override
  String get collectNew => 'ការទូទាត់ថ្មី';

  @override
  String get collectPaid => 'បានទទួលប្រាក់';

  @override
  String collectPaidFrom(String account) {
    return 'ពី $account';
  }

  @override
  String get collectExpired => 'លេខកូដផុតកំណត់';

  @override
  String get collectExpiredHint =>
      'មិនមានការទូទាត់ទាន់ពេលទេ។ សូមបង្កើតលេខកូដថ្មី ប្រសិនបើអតិថិជននៅតែចង់បង់។';

  @override
  String get collectCanceled => 'បានបោះបង់លេខកូដ';

  @override
  String get collectReview => 'ការទូទាត់ត្រូវពិនិត្យ';

  @override
  String get collectReviewHint =>
      'Bakong រាយការណ៍ការទូទាត់ដែលមិនត្រូវនឹងសំណើនេះ។ វាមិនត្រូវបានរាប់ទេ សូមពិនិត្យក្នុងកម្មវិធីធនាគាររបស់អ្នក។';

  @override
  String get collectDemoMode =>
      'របៀបសាកល្បង៖ Bakong ត្រូវបានក្លែងធ្វើ គ្មានប្រាក់ពិតផ្លាស់ទីទេ។';

  @override
  String get collectSimulatePaid => 'អតិថិជនបានបង់ (សាកល្បង)';

  @override
  String get collectNotAvailable =>
      'ការទូទាត់ KHQR មិនទាន់អាចប្រើបានទេ។ MysoftKH ត្រូវភ្ជាប់ប្រព័ន្ធទៅ Bakong ជាមុនសិន។';

  @override
  String get collectNoAccount =>
      'មិនទាន់មានគណនី Bakong KHQR ភ្ជាប់នៅឡើយទេ។ ម្ចាស់អាចភ្ជាប់វានៅក្នុងផ្ទាំងគ្រប់គ្រងលើវេប។';

  @override
  String get collectAmountInvalid => 'សូមបញ្ចូលចំនួនទឹកប្រាក់ត្រឹមត្រូវ';

  @override
  String get collectAmountInvalidKhr => 'សូមបញ្ចូលចំនួនរៀលគត់';
}
