import type { Prisma } from "@prisma/client";
import { getEnv } from "./env";

type EmailQueueClient = Pick<Prisma.TransactionClient, "emailOutbox" | "user">;

type PaymentEmailBase = {
  verificationId: string;
  planName: string;
  amount: string;
  currency: string;
  reference: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

function formatMoney(amount: string, currency: string) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return `${currency} ${amount}`;
  try {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency }).format(numericAmount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: getEnv().TZ,
  }).format(value);
}

function emailSubject(value: string) {
  const singleLine = value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return [...singleLine].slice(0, 255).join("");
}

function appUrl(pathname: string) {
  const baseUrl = getEnv().BASE_URL;
  return baseUrl ? new URL(pathname, baseUrl).toString() : null;
}

// PesanPro brand tokens for transactional email (DESIGN.md): warm paper
// background, ink text/buttons, highlight for attention, mint for success.
const EMAIL_PAPER = "#FCFAF5";
const EMAIL_INK = "#1A3300";
const EMAIL_HIGHLIGHT = "#FFE95C";
const EMAIL_MINT = "#D5F5C2";
const EMAIL_LINE = "#B6B6B6";
const EMAIL_MUTED = "#607054";
const EMAIL_WHITE = "#FFFFFF";
const EMAIL_LOGO_PATH = "/brand/pesanpro-icon.png";

type EmailBadge = { text: string; background: string };

function htmlDocument(input: { heading: string; greeting?: string; paragraphs: string[]; details: Array<[string, string]>; action?: { label: string; url: string }; badge?: EmailBadge }) {
  const logoUrl = appUrl(EMAIL_LOGO_PATH);
  const detailRows = input.details.map(([label, value]) => `
    <tr>
      <td style="padding:7px 16px 7px 0;color:${EMAIL_MUTED};font-size:13px;vertical-align:top">${escapeHtml(label)}</td>
      <td style="padding:7px 0;color:${EMAIL_INK};font-size:14px;font-weight:600;vertical-align:top">${escapeHtml(value)}</td>
    </tr>`).join("");
  const paragraphs = input.paragraphs.map((paragraph) => `<p style="margin:0 0 10px;color:${EMAIL_INK};font-size:14px;line-height:1.6">${escapeHtml(paragraph)}</p>`).join("");
  const action = input.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0"><tr><td><a href="${escapeHtml(input.action.url)}" style="display:inline-block;background:${EMAIL_INK};color:${EMAIL_WHITE};text-decoration:none;font-size:14px;font-weight:700;padding:13px 24px;border-radius:6px">${escapeHtml(input.action.label)}</a></td></tr></table>`
    : "";
  const badge = input.badge
    ? `<span style="display:inline-block;background:${escapeHtml(input.badge.background)};color:${EMAIL_INK};font-size:12px;font-weight:700;padding:6px 14px;border-radius:999px;white-space:nowrap">${escapeHtml(input.badge.text)}</span>`
    : "";
  const brandmark = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="PesanPro" width="40" height="40" style="display:inline-block;vertical-align:middle;border:0" /><span style="display:inline-block;vertical-align:middle;color:${EMAIL_INK};font-size:19px;font-weight:800;margin-left:10px;letter-spacing:-0.2px">PesanPro</span>`
    : `<span style="color:${EMAIL_INK};font-size:19px;font-weight:800;letter-spacing:-0.2px">PesanPro</span>`;
  return `<!doctype html>
<html lang="id">
  <body style="margin:0;padding:0;background:${EMAIL_PAPER};font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_PAPER}">
      <tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${EMAIL_WHITE};border:1px solid ${EMAIL_LINE};border-radius:12px">
          <tr><td style="padding:24px 28px 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td align="left" style="vertical-align:middle">${brandmark}</td>
              <td align="right" style="vertical-align:middle">${badge}</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:20px 28px 0"><div style="border-top:1px solid ${EMAIL_LINE};font-size:0;line-height:0">&nbsp;</div></td></tr>
          <tr><td style="padding:20px 28px 0">
            <h1 style="margin:0 0 12px;color:${EMAIL_INK};font-size:20px;line-height:1.35">${escapeHtml(input.heading)}</h1>
            ${input.greeting ? `<p style="margin:0 0 10px;color:${EMAIL_INK};font-size:14px;line-height:1.6">${escapeHtml(input.greeting)}</p>` : ""}
            ${paragraphs}
          </td></tr>
          <tr><td style="padding:16px 28px 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${detailRows}</table>
          </td></tr>
          <tr><td style="padding:24px 28px 28px">${action}</td></tr>
        </table>
        <p style="margin:16px 0 0;color:${EMAIL_MUTED};font-size:12px;text-align:center">Email otomatis dari ${escapeHtml(getEnv().APP_NAME)}.</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function buildPaymentSubmittedEmail(input: PaymentEmailBase & {
  payerName: string | null;
  payerEmail: string;
  submittedAt: Date;
}) {
  const payer = input.payerName?.trim() || input.payerEmail;
  const amount = formatMoney(input.amount, input.currency);
  const reviewUrl = appUrl("/dashboard/commercial");
  const subject = emailSubject(`Bukti pembayaran baru dari ${payer}`);
  const textLines = [
    "Ada bukti pembayaran baru yang perlu diperiksa.",
    "",
    `Pengguna: ${payer} (${input.payerEmail})`,
    `Paket: ${input.planName}`,
    `Jumlah: ${amount}`,
    `Referensi: ${input.reference}`,
    `Dikirim: ${formatDate(input.submittedAt)}`,
    ...(reviewUrl ? ["", `Periksa pembayaran: ${reviewUrl}`] : []),
  ];
  return {
    subject,
    textBody: textLines.join("\n"),
    htmlBody: htmlDocument({
      heading: "Bukti pembayaran baru",
      badge: { text: "Perlu diperiksa", background: EMAIL_HIGHLIGHT },
      paragraphs: ["Ada bukti pembayaran baru yang perlu diperiksa."],
      details: [
        ["Pengguna", `${payer} (${input.payerEmail})`],
        ["Paket", input.planName],
        ["Jumlah", amount],
        ["Referensi", input.reference],
        ["Dikirim", formatDate(input.submittedAt)],
      ],
      action: reviewUrl ? { label: "Periksa pembayaran", url: reviewUrl } : undefined,
    }),
  };
}

export function buildPaymentApprovedEmail(input: PaymentEmailBase & {
  userName: string | null;
  approvedAt: Date;
  activeUntil: Date;
}) {
  const greeting = input.userName?.trim() ? `Halo ${input.userName.trim()},` : "Halo,";
  const amount = formatMoney(input.amount, input.currency);
  const dashboardUrl = appUrl("/dashboard");
  const subject = emailSubject(`Pembayaran dikonfirmasi, paket ${input.planName} aktif`);
  const textLines = [
    greeting,
    "",
    `Pembayaran Anda untuk paket ${input.planName} sudah dikonfirmasi. Paket tersebut sudah aktif dan dapat digunakan sampai ${formatDate(input.activeUntil)}.`,
    "",
    `Jumlah: ${amount}`,
    `Referensi: ${input.reference}`,
    `Dikonfirmasi: ${formatDate(input.approvedAt)}`,
    ...(dashboardUrl ? ["", `Buka dashboard: ${dashboardUrl}`] : []),
  ];
  return {
    subject,
    textBody: textLines.join("\n"),
    htmlBody: htmlDocument({
      heading: "Pembayaran sudah dikonfirmasi",
      badge: { text: "Aktif", background: EMAIL_MINT },
      greeting,
      paragraphs: [`Paket ${input.planName} sudah aktif dan dapat digunakan sampai ${formatDate(input.activeUntil)}.`],
      details: [
        ["Paket", input.planName],
        ["Jumlah", amount],
        ["Referensi", input.reference],
        ["Dikonfirmasi", formatDate(input.approvedAt)],
      ],
      action: dashboardUrl ? { label: "Buka dashboard", url: dashboardUrl } : undefined,
    }),
  };
}

export async function queuePaymentSubmittedEmails(client: EmailQueueClient, input: PaymentEmailBase & {
  payerId: string;
  submittedAt: Date;
}) {
  const [payer, admins] = await Promise.all([
    client.user.findUnique({ where: { id: input.payerId }, select: { name: true, email: true } }),
    client.user.findMany({ where: { role: "SUPERADMIN", status: "ACTIVE" }, select: { id: true, name: true, email: true } }),
  ]);
  if (!payer || admins.length === 0) return 0;
  const content = buildPaymentSubmittedEmail({ ...input, payerName: payer.name, payerEmail: payer.email });
  const queued = await client.emailOutbox.createMany({
    data: admins.map((admin) => ({
      eventKey: `payment-submitted:${input.verificationId}:${admin.id}`,
      type: "PAYMENT_SUBMITTED" as const,
      toEmail: admin.email,
      toName: admin.name,
      ...content,
    })),
    skipDuplicates: true,
  });
  return queued.count;
}

export async function queuePaymentApprovedEmail(client: EmailQueueClient, input: PaymentEmailBase & {
  userId: string;
  userName: string | null;
  userEmail: string;
  approvedAt: Date;
  activeUntil: Date;
}) {
  const content = buildPaymentApprovedEmail(input);
  const queued = await client.emailOutbox.createMany({
    data: [{
      eventKey: `payment-approved:${input.verificationId}:${input.userId}`,
      type: "PAYMENT_APPROVED",
      toEmail: input.userEmail,
      toName: input.userName,
      ...content,
    }],
    skipDuplicates: true,
  });
  return queued.count === 1;
}
