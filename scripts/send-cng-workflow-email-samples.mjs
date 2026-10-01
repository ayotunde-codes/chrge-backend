const apiKey = process.env.RESEND_API_KEY?.trim();
const from = process.env.RESEND_FROM_EMAIL?.trim();
const to = process.argv[2] || 'team@chrge.com';
if (!apiKey || !from) throw new Error('RESEND_API_KEY and RESEND_FROM_EMAIL are required');

const common = [
  ['Application', 'CNG-2026-DEMO1234'],
  ['View dashboard', 'https://chrge-frontend-staging.vercel.app/cng/dashboard/demo'],
];
const samples = [
  ['Inspection appointment booked', 'Your CHRGE vehicle inspection appointment has been scheduled.', [['Date and time', 'Monday, 5 October 2026 at 10:00 WAT'], ['Conversion centre', 'CHRGE Yaba Centre, Lagos'], ...common]],
  ['CNG financing approved — deposit required', 'Your financing is approved. Sign in to your dashboard to review the plan and initiate your deposit payment.', [['Deposit due', '₦300,000'], ...common]],
  ['Deposit confirmed', 'We have confirmed your deposit. CHRGE will now arrange your conversion appointment.', common],
  ['Conversion appointment booked', 'Your vehicle conversion appointment has been booked.', [['Date and time', 'Thursday, 8 October 2026 at 09:00 WAT'], ['Conversion centre', 'CHRGE Yaba Centre, Lagos'], ...common]],
  ['Financing disbursed', 'Your financing has been disbursed and your CNG conversion has been paid for.', common],
  ['CNG conversion completed', 'Your vehicle conversion has been recorded as completed. Your weekly repayment schedule is available in your dashboard.', common],
  ['CNG financing fully paid', 'Congratulations—your CNG conversion financing has been fully repaid. Thank you for choosing CHRGE. We encourage you to share CHRGE with other drivers ready for cleaner, more affordable mobility.', common],
];

for (const [title, intro, rows] of samples) {
  const rowHtml = rows.map(([label, value]) => `<tr><td style="padding:8px 0;color:#65736b">${label}</td><td style="padding:8px 0;text-align:right;font-weight:700">${value}</td></tr>`).join('');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: `CHRGE Staging <${from}>`, to: [to], subject: `[STAGING SAMPLE] ${title}`,
      text: `${title}\n\n${intro}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}`,
      html: `<!doctype html><html><body style="margin:0;background:#f4f7f4;color:#17211b;font-family:Arial,sans-serif"><div style="max-width:680px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border:1px solid #dfe7e1;border-radius:16px;padding:28px"><p style="color:#087a50;font-size:12px;font-weight:800;letter-spacing:.08em">CHRGE · STAGING SAMPLE</p><h1 style="font-size:25px">${title}</h1><p style="color:#526159;line-height:1.6">${intro}</p><table style="width:100%;border-collapse:collapse">${rowHtml}</table></div></div></body></html>`,
      tags: [{ name: 'purpose', value: 'cng_workflow_sample' }, { name: 'environment', value: 'staging' }],
    }),
  });
  if (!response.ok) throw new Error(`${title}: ${response.status} ${await response.text()}`);
  const result = await response.json();
  console.log(`${title}: ${result.id}`);
}
