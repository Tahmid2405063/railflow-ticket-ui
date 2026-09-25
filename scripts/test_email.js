require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  console.log('--- RailFlow Email Delivery Diagnostic ---');
  console.log('EMAIL_USER configured:', user ? `${user.slice(0, 3)}***@${user.split('@')[1] || ''}` : 'NO (missing)');
  console.log('EMAIL_PASS configured:', pass ? `YES (${pass.length} chars)` : 'NO (missing)');

  if (!user || !pass) {
    console.error('\n[Error] EMAIL_USER and EMAIL_PASS must be configured in .env before running this test.');
    console.error('Please configure your Gmail address and 16-character Google App Password in .env.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });

  console.log('\nTesting connection to Gmail SMTP (smtp.gmail.com:465)...');
  try {
    await transporter.verify();
    console.log('✓ Successfully authenticated with Gmail SMTP servers!');
  } catch (err) {
    console.error('✗ Gmail authentication failed:', err.message);
    if (err.message.includes('Username and Password not accepted') || err.message.includes('Invalid login')) {
      console.error('\nNOTE: Google requires an "App Password" (16 characters), not your regular Gmail password.');
      console.error('Generate one at: https://myaccount.google.com/apppasswords');
    }
    process.exit(1);
  }

  const targetEmail = process.argv[2] || user || 'jarif21012006@gmail.com';
  const testCode = Math.floor(100000 + Math.random() * 900000).toString();

  console.log(`Sending real verification test email to ${targetEmail}...`);
  try {
    const info = await transporter.sendMail({
      from: `"RailFlow Security" <${user}>`,
      to: targetEmail,
      subject: `RailFlow Test Verification Code: ${testCode}`,
      html: `
        <div style="font-family:sans-serif; max-width:500px; margin:20px auto; padding:24px; border:1px solid #e2e8f0; border-radius:12px;">
          <h2 style="color:#079447; margin-top:0;">RailFlow Verification Test</h2>
          <p>Real-life email dispatch is working successfully!</p>
          <div style="font-size:28px; font-weight:bold; letter-spacing:6px; color:#079447; background:#edf7ee; padding:12px 24px; border-radius:8px; display:inline-block;">
            ${testCode}
          </div>
          <p style="font-size:12px; color:#64748b; margin-top:20px;">Bangladesh Railway E-Ticket Portal</p>
        </div>
      `
    });
    console.log(`✓ Real verification email sent successfully! MessageId: ${info.messageId}`);
  } catch (err) {
    console.error('✗ Failed to deliver email:', err.message);
    process.exit(1);
  }
}

testEmail();
