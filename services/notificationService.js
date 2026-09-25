const nodemailer = require('nodemailer');

/**
 * Configure Nodemailer transport using environment variables.
 * Defaults to Gmail SMTP (smtp.gmail.com).
 */
function createMailTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    return null;
  }

  // If using Gmail or generic SMTP
  if (process.env.EMAIL_SERVICE === 'gmail' || (!process.env.EMAIL_HOST && user.includes('@gmail.com'))) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT || 465),
    secure: process.env.EMAIL_SECURE === 'true' || Number(process.env.EMAIL_PORT) === 465,
    auth: { user, pass }
  });
}

/**
 * Send real verification code email via SMTP/Gmail
 */
async function sendVerificationEmail(toEmail, recipientName, code) {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    console.warn(`[RailFlow Email] Notice: EMAIL_USER and EMAIL_PASS not set in .env. Real email to ${toEmail} cannot be delivered until Gmail credentials are provided.`);
    return {
      sent: false,
      reason: 'MISSING_EMAIL_CREDENTIALS',
      message: 'Email credentials (EMAIL_USER & EMAIL_PASS) are not yet configured in .env'
    };
  }

  try {
    const transporter = createMailTransporter();
    const fromAddress = process.env.EMAIL_FROM || `"RailFlow Security" <${user}>`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f8fc; margin: 0; padding: 24px; color: #222b45; }
          .container { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 18px rgba(0,0,0,0.06); border: 1px solid #e5e8f0; }
          .header { background: linear-gradient(135deg, #079447, #056a33); padding: 28px 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; }
          .header p { margin: 6px 0 0 0; opacity: 0.9; font-size: 13px; }
          .content { padding: 32px 28px; text-align: center; }
          .code-box { display: inline-block; background: #edf7ee; border: 2px dashed #079447; border-radius: 10px; padding: 16px 36px; margin: 24px 0; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #07833e; font-family: monospace; }
          .footer { background: #f9fafc; padding: 18px 24px; text-align: center; font-size: 11px; color: #8e95a5; border-top: 1px solid #edf0f5; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>RailFlow Ticket Management</h1>
            <p>Bangladesh Railway E-Ticket Portal</p>
          </div>
          <div class="content">
            <h2 style="margin-top:0; font-size:20px; color:#172044;">Password Reset Verification</h2>
            <p style="font-size:14px; color:#5b6478; line-height:1.6;">
              Hello <b>${recipientName || 'RailFlow User'}</b>,<br>
              We received a request to reset your RailFlow account password. Please use the verification code below to complete the reset:
            </p>
            <div class="code-box">${code}</div>
            <p style="font-size:12px; color:#747c8d; margin-bottom:0;">
              This code is valid for <b>10 minutes</b>. If you did not initiate this password reset, please ignore this email or change your password immediately.
            </p>
          </div>
          <div class="footer">
            <p style="margin:0;">&copy; ${new Date().getFullYear()} RailFlow System. Secure Railway Authentication.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject: `Your RailFlow Password Reset Code: ${code}`,
      text: `Hello ${recipientName || 'RailFlow User'},\n\nYour 6-digit password reset verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nRailFlow Railway Security Team`,
      html: htmlContent
    });

    console.log(`[RailFlow Email] Verification email successfully delivered to ${toEmail}. MessageId: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[RailFlow Email] Failed to send email to ${toEmail}:`, error.message);
    return { sent: false, error: error.message };
  }
}

/**
 * Send real SMS verification code via SMS Gateway (e.g. Twilio or BD SMS Provider)
 */
async function sendVerificationSMS(toMobile, code) {
  const smsApiKey = process.env.SMS_API_KEY || process.env.GREENWEB_TOKEN || process.env.BULKSMSBD_API_KEY;
  const smsApiUrl = process.env.SMS_API_URL;
  const smsSenderId = process.env.SMS_SENDER_ID || '';
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_FROM;

  const smsText = `[RailFlow] Your password reset verification code is: ${code}. Valid for 10 minutes. Do not share this code.`;

  // 1. Twilio SMS
  if (twilioSid && twilioToken && twilioFrom) {
    try {
      const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
      const formattedTo = toMobile.startsWith('+') ? toMobile : (toMobile.startsWith('880') ? `+${toMobile}` : `+88${toMobile}`);
      const body = new URLSearchParams({
        To: formattedTo,
        From: twilioFrom,
        Body: smsText
      });

      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      const data = await response.json();
      if (response.ok) {
        console.log(`[RailFlow SMS] Twilio SMS dispatched to ${formattedTo}. SID: ${data.sid}`);
        return { sent: true, sid: data.sid };
      } else {
        console.error(`[RailFlow SMS] Twilio API error:`, data.message);
        return { sent: false, error: data.message };
      }
    } catch (err) {
      console.error(`[RailFlow SMS] Twilio dispatch error:`, err.message);
      return { sent: false, error: err.message };
    }
  }

  // 2. Greenweb BD SMS Gateway
  if (process.env.GREENWEB_TOKEN || (smsApiKey && (smsApiUrl || '').includes('greenweb'))) {
    try {
      const token = process.env.GREENWEB_TOKEN || smsApiKey;
      const cleanPhone = toMobile.replace(/^\+/, '').replace(/^880/, '0');
      const url = `http://api.greenweb.com.bd/api.php?token=${encodeURIComponent(token)}&to=${encodeURIComponent(cleanPhone)}&message=${encodeURIComponent(smsText)}`;
      const response = await fetch(url, { method: 'POST' });
      const text = await response.text();
      console.log(`[RailFlow SMS] Greenweb BD response for ${cleanPhone}:`, text);
      return { sent: true, response: text };
    } catch (err) {
      console.error(`[RailFlow SMS] Greenweb dispatch error:`, err.message);
      return { sent: false, error: err.message };
    }
  }

  // 3. BulkSMS BD Gateway
  if (process.env.BULKSMSBD_API_KEY || (smsApiKey && (smsApiUrl || '').includes('bulksmsbd'))) {
    try {
      const apiKey = process.env.BULKSMSBD_API_KEY || smsApiKey;
      const cleanPhone = toMobile.replace(/^\+/, '').replace(/^88/, '');
      const url = `http://bulksmsbd.net/api/smsapi?api_key=${encodeURIComponent(apiKey)}&type=text&number=${encodeURIComponent(cleanPhone)}&senderid=${encodeURIComponent(smsSenderId)}&message=${encodeURIComponent(smsText)}`;
      const response = await fetch(url, { method: 'POST' });
      const text = await response.text();
      console.log(`[RailFlow SMS] BulkSMS BD response for ${cleanPhone}:`, text);
      return { sent: true, response: text };
    } catch (err) {
      console.error(`[RailFlow SMS] BulkSMS BD dispatch error:`, err.message);
      return { sent: false, error: err.message };
    }
  }

  // 4. Generic SMS Gateway (HTTP GET or POST with url params)
  if (smsApiKey && smsApiUrl) {
    try {
      const formattedPhone = toMobile.replace(/^\+/, '');
      const url = new URL(smsApiUrl);
      url.searchParams.set('api_key', smsApiKey);
      url.searchParams.set('token', smsApiKey);
      url.searchParams.set('to', formattedPhone);
      url.searchParams.set('number', formattedPhone);
      url.searchParams.set('message', smsText);
      if (smsSenderId) url.searchParams.set('senderid', smsSenderId);

      const response = await fetch(url.toString(), { method: 'POST' });
      const text = await response.text();
      console.log(`[RailFlow SMS] SMS gateway responded for ${toMobile}:`, text);
      return { sent: true, response: text };
    } catch (err) {
      console.error(`[RailFlow SMS] SMS Gateway error:`, err.message);
      return { sent: false, error: err.message };
    }
  }

  console.warn(`[RailFlow SMS] Notice: SMS Gateway credentials not set in .env. Real SMS to ${toMobile} cannot be sent.`);
  return {
    sent: false,
    reason: 'MISSING_SMS_CREDENTIALS',
    message: 'SMS Gateway credentials are not yet configured in .env'
  };
}

module.exports = {
  sendVerificationEmail,
  sendVerificationSMS
};
