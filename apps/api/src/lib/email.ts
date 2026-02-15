import nodemailer from "nodemailer";

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  replyTo?: string;
};

type EmailAttachment = {
  filename: string;
  path: string;
};

let transporter: nodemailer.Transporter | null = null;

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || "587");
  if (!host || !Number.isFinite(port)) return null;

  const secure = (process.env.SMTP_SECURE || "").toLowerCase() === "true";
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();

  if (!from) return null;

  return {
    host,
    port,
    secure,
    user: user || undefined,
    pass: pass || undefined,
    from,
    replyTo: replyTo || undefined,
  };
}

function getTransporter(config: SmtpConfig) {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
  });
  return transporter;
}

export function isEmailConfigured() {
  return Boolean(getSmtpConfig());
}

export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
}) {
  const config = getSmtpConfig();
  if (!config) {
    throw new Error("SMTP configuration missing");
  }

  const { to, resetUrl, expiresInMinutes } = params;
  const subject = "Reset your password";
  const text = [
    "You requested a password reset.",
    `This link expires in ${expiresInMinutes} minutes.`,
    "",
    resetUrl,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">
      <h2 style="margin:0 0 12px 0;">Reset your password</h2>
      <p>You requested a password reset. This link expires in ${expiresInMinutes} minutes.</p>
      <p><a href="${resetUrl}">Reset password</a></p>
      <p style="font-size:12px;color:#555;">If you did not request this, you can ignore this email.</p>
    </div>
  `;

  const mail = {
    from: config.from,
    to,
    subject,
    text,
    html,
    replyTo: config.replyTo,
  };

  const transport = getTransporter(config);
  await transport.sendMail(mail);
}

export async function sendOperationalEmail(params: {
  to: string;
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}) {
  const config = getSmtpConfig();
  if (!config) {
    throw new Error("SMTP configuration missing");
  }
  const transport = getTransporter(config);
  await transport.sendMail({
    from: config.from,
    to: params.to,
    cc: params.cc && params.cc.length > 0 ? params.cc : undefined,
    subject: params.subject,
    text: params.text,
    html: params.html,
    attachments: params.attachments,
    replyTo: config.replyTo,
  });
}
