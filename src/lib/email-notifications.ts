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

function htmlDocument(input: { heading: string; greeting?: string; paragraphs: string[]; details: Array<[string, string]>; action?: { label: string; url: string } }) {
  const detailRows = input.details.map(([label, value]) => `
    <tr>
      <td style="padding:6px 12px 6px 0;color:#64748b;vertical-align:top">${escapeHtml(label)}</td>
      <td style="padding:6px 0;color:#0f172a;font-weight:600">${escapeHtml(value)}</td>
    </tr>`).join("");
  const paragraphs = input.paragraphs.map((paragraph) => `<p style="margin:0 0 14px;color:#334155;line-height:1.6">${escapeHtml(paragraph)}</p>`).join("");
  const action = input.action
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:700">${escapeHtml(input.action.label)}</a></p>`
    : "";
  return `<!doctype html>
<html lang="id">
  <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif">
    <div style="max-width:620px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
        <h1 style="margin:0 0 18px;color:#0f172a;font-size:22px;line-height:1.35">${escapeHtml(input.heading)}</h1>
        ${input.greeting ? `<p style="margin:0 0 14px;color:#334155;line-height:1.6">${escapeHtml(input.greeting)}</p>` : ""}
        ${paragraphs}
        <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:18px">${detailRows}</table>
        ${action}
      </div>
      <p style="margin:14px 0 0;color:#64748b;font-size:12px;text-align:center">Email otomatis dari ${escapeHtml(getEnv().APP_NAME)}.</p>
    </div>
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
