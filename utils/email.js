// utils/email.js
const nodemailer = require("nodemailer");

const { GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_FROM_NAME, EMAIL_FROM_ADDRESS } = process.env;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.warn("Missing GMAIL_USER or GMAIL_APP_PASSWORD in env; emails will fail.");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
  // optional: set TLS options if needed
  // tls: { rejectUnauthorized: false }
});

/**
 * sendMail helper
 * @param {Object} options - { to, subject, text, html }
 */
async function sendMail(options) {
  const from = `${EMAIL_FROM_NAME || "EventSpot"} <${EMAIL_FROM_ADDRESS || GMAIL_USER}>`;

  const mailOptions = {
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  };

  return transporter.sendMail(mailOptions);
}

module.exports = { sendMail };
