// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Chinese (`zh`).
class AppLocalizationsZh extends AppLocalizations {
  AppLocalizationsZh([String locale = 'zh']) : super(locale);

  @override
  String get appName => 'One PayAlert';

  @override
  String get tagline => '一个平台。多家银行。即时收款提醒。';

  @override
  String get signInTitle => '欢迎回来';

  @override
  String get signInSubtitle => '登录后，每一笔收款到账即知。';

  @override
  String get email => '邮箱';

  @override
  String get password => '密码';

  @override
  String get signIn => '登录';

  @override
  String get invalidCredentials => '邮箱或密码错误';

  @override
  String get networkError => '无法连接服务器，请检查网络后重试。';

  @override
  String get somethingWrong => '出错了';

  @override
  String get retry => '重试';

  @override
  String get sessionExpired => '登录已过期，请重新登录。';

  @override
  String get home => '首页';

  @override
  String get transactions => '交易记录';

  @override
  String get settings => '设置';

  @override
  String greeting(String name) {
    return '您好，$name';
  }

  @override
  String get receivedToday => '今日收款';

  @override
  String paymentsToday(int count) {
    return '今日成功收款 $count 笔';
  }

  @override
  String pendingFailed(int pending, int failed) {
    return '处理中 $pending · 失败 $failed';
  }

  @override
  String get liveFeed => '实时收款';

  @override
  String get live => '实时';

  @override
  String get connecting => '连接中…';

  @override
  String get offline => '离线';

  @override
  String get noPayments => '暂无收款';

  @override
  String get noPaymentsHint => '新的收款会立即显示在这里。';

  @override
  String newPayment(String amount) {
    return '新收款：$amount';
  }

  @override
  String get soundAlerts => '声音与语音提醒';

  @override
  String get soundAlertsHint => '每笔成功收款播放提示音并朗读金额';

  @override
  String get today => '今天';

  @override
  String get last7 => '7 天';

  @override
  String get last30 => '30 天';

  @override
  String get allStatuses => '全部';

  @override
  String get allOutlets => '全部门店';

  @override
  String get statusSuccess => '成功';

  @override
  String get statusPending => '处理中';

  @override
  String get statusFailed => '失败';

  @override
  String get statusReversed => '已冲正';

  @override
  String get noTransactions => '没有找到交易';

  @override
  String get details => '交易详情';

  @override
  String get payer => '付款人';

  @override
  String get payerAccount => '付款账户';

  @override
  String get reference => '参考号';

  @override
  String get provider => '银行 / 网关';

  @override
  String get paidAt => '付款时间';

  @override
  String get providerTxnId => '交易号';

  @override
  String get demo => '演示';

  @override
  String get simulated => '模拟交易（非真实资金）';

  @override
  String get company => '公司';

  @override
  String get role => '角色';

  @override
  String get language => '语言';

  @override
  String get signOut => '退出登录';

  @override
  String get pushNotifications => '推送通知';

  @override
  String get pushOn => '已开启 — 关闭应用也能收到提醒';

  @override
  String get pushOff => '此版本未配置';

  @override
  String get version => '版本';

  @override
  String get account => '账户';

  @override
  String get roleOwner => '所有者';

  @override
  String get roleAdmin => '管理员';

  @override
  String get roleManager => '经理';

  @override
  String get roleAccountant => '会计';

  @override
  String get roleCashier => '收银员';
}
