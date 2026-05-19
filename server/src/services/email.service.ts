import nodemailer from "nodemailer";
import { config } from "../config.js";

function hasSmtpConfig() {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
}

export async function sendVerificationEmail(email: string, verificationUrl: string) {
  if (!hasSmtpConfig()) {
    console.log(`Verification link for ${email}: ${verificationUrl}`);
    return { delivered: false };
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass
    }
  });

  await transporter.sendMail({
    from: config.smtp.from,
    to: email,
    subject: "Verify your Virly account",
    text: `Verify your account by opening this link. It expires in 10 minutes: ${verificationUrl}`,
    html: `
      <p>Verify your Virly account by clicking the button below.</p>
      <p><a href="${verificationUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;">Verify account</a></p>
      <p>This link expires in 10 minutes.</p>
    `
  });

  return { delivered: true };
}
