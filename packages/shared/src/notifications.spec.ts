import { paymentAlertMessage } from './notifications';

describe('paymentAlertMessage', () => {
  it('renders English with payer and outlet', () => {
    const m = paymentAlertMessage('en', {
      amountMinor: 1250,
      currency: 'USD',
      payerName: 'Sok Dara',
      outletName: 'BKK1',
    });
    expect(m.body).toBe('Received $12.50 from Sok Dara · BKK1');
    expect(m.title).toContain('Payment received');
  });

  it('renders Khmer and Chinese', () => {
    expect(paymentAlertMessage('km', { amountMinor: 1250, currency: 'USD' }).body).toContain('បានទទួលប្រាក់');
    const zh = paymentAlertMessage('zh', { amountMinor: 1250, currency: 'USD', payerName: 'Li' });
    expect(zh.body).toContain('已收到 Li 付款');
  });

  it('ignores blank payer names', () => {
    expect(paymentAlertMessage('en', { amountMinor: 100, currency: 'USD', payerName: '  ' }).body).toBe(
      'Received $1.00',
    );
  });
});
