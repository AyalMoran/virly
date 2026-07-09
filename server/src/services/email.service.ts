import { Resend } from "resend";
import { config, isProduction } from "../config.js";

type EmailPayload = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

type EmailSender = {
  send(payload: EmailPayload): Promise<{ error?: unknown }>;
};

function logVerificationFallback(email: string, verificationUrl: string, error?: unknown) {
  if (error) {
    console.error("Verification email delivery failed; logging link instead.", error);
  }

  console.log(`Verification link for ${email}: ${verificationUrl}`);
}

function createResendSender(apiKey: string): EmailSender {
  const resend = new Resend(apiKey);

  return {
    async send(payload) {
      const { error } = await resend.emails.send(payload);
      return { error };
    }
  };
}

function createVerificationEmailPayload(email: string, verificationUrl: string) {
  return {
    from: config.email.from,
    to: email,
    subject: "Verify your Virly account",
    text: `Verify your account by opening this link. It expires in 10 minutes: ${verificationUrl}`,
    html: `
      <p>Verify your Virly account by clicking the button below.</p>
      <p><a href="${verificationUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;">Verify account</a></p>
      <p>This link expires in 10 minutes.</p>
    `
  };
}

export async function sendVerificationEmailWithSender(
  email: string,
  verificationUrl: string,
  sender: EmailSender | null
) {
  if (!sender) {
    logVerificationFallback(email, verificationUrl);
    return { delivered: false };
  }

  const result = await sender.send(createVerificationEmailPayload(email, verificationUrl));
  if (result.error) {
    logVerificationFallback(email, verificationUrl, result.error);
    return { delivered: false };
  }

  return { delivered: true };
}

export async function sendVerificationEmail(email: string, verificationUrl: string) {
  const sender = config.email.resendApiKey
    ? createResendSender(config.email.resendApiKey)
    : null;

  return sendVerificationEmailWithSender(email, verificationUrl, sender);
}

export type TransferHoldEmail = {
  amount: number;
  currency: string;
  recipientEmail: string;
  reasons: string[];
  /** One link to the review page; the confirm/cancel actions are POSTs from there. */
  reviewUrl: string;
};

function createTransferHoldPayload(email: string, details: TransferHoldEmail) {
  const amountText = `${details.amount} ${details.currency}`;
  const why = details.reasons.length ? ` Reason flagged: ${details.reasons.join(" ")}` : "";
  return {
    from: config.email.from,
    to: email,
    subject: "Confirm your held Virly transfer",
    text:
      `We held a transfer of ${amountText} to ${details.recipientEmail} for review.${why} ` +
      `Review and confirm or cancel it: ${details.reviewUrl}`,
    html: `
      <p>We held a transfer of <strong>${amountText}</strong> to ${details.recipientEmail} for review.</p>
      ${details.reasons.length ? `<p>Why: ${details.reasons.join(" ")}</p>` : ""}
      <p><a href="${details.reviewUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;">Review transfer</a></p>
    `
  };
}

/**
 * Send the hold-confirmation email. Without a Resend key it falls back to logging
 * the review link — but ONLY outside production, since the link carries a one-time
 * token we don't want in production logs.
 */
export async function sendTransferHoldEmail(email: string, details: TransferHoldEmail) {
  const logFallback = () => {
    if (!isProduction) {
      console.log(`Transfer hold review link for ${email}: ${details.reviewUrl}`);
    } else {
      console.error(`Transfer hold email not delivered for ${email} (no email provider configured).`);
    }
  };
  const sender = config.email.resendApiKey
    ? createResendSender(config.email.resendApiKey)
    : null;
  if (!sender) {
    logFallback();
    return { delivered: false };
  }
  const result = await sender.send(createTransferHoldPayload(email, details));
  if (result.error) {
    console.error("Transfer hold email failed.", result.error);
    logFallback();
    return { delivered: false };
  }
  return { delivered: true };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Send an ops/admin alert via the given sender. Injectable for tests, mirroring
 * sendVerificationEmailWithSender. Falls back to console.error (so the alert is
 * never silently dropped) when there is no sender or no recipient configured.
 */
export async function sendOpsAlertEmailWithSender(
  subject: string,
  text: string,
  to: string | undefined,
  sender: EmailSender | null
): Promise<{ delivered: boolean }> {
  if (!sender || !to) {
    console.error(`[ops-alert] ${subject}\n${text}`);
    return { delivered: false };
  }
  const result = await sender.send({
    from: config.email.from,
    to,
    subject,
    text,
    html: `<pre>${escapeHtml(text)}</pre>`
  });
  if (result.error) {
    console.error("[ops-alert] email delivery failed.", result.error);
    console.error(`[ops-alert] ${subject}\n${text}`);
    return { delivered: false };
  }
  return { delivered: true };
}

/**
 * Email an ops alert to VIRLY_RAG_SYNC_ALERT_EMAIL using Resend when configured.
 * Used by the scheduled RAG sync on a failed run.
 */
export async function sendOpsAlertEmail(
  subject: string,
  text: string
): Promise<{ delivered: boolean }> {
  const sender = config.email.resendApiKey
    ? createResendSender(config.email.resendApiKey)
    : null;
  return sendOpsAlertEmailWithSender(subject, text, config.rag.sync.alertEmail, sender);
}
