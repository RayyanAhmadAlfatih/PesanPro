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

/**
 * H-3 dan H-1 dihitung per tanggal kalender, bukan selisih jam, supaya email
 * yang dikirim pagi dan malam untuk tanggal berakhir yang sama tidak berbeda
 * tahap. Huruf kecil dipakai di eventKey.
 */
export type SubscriptionReminderStage = "h3" | "h1";

export type SubscriptionReminderInput = {
  userId: string;
  userName: string | null;
  userEmail: string;
  planName: string;
  endsAt: Date;
  stage: SubscriptionReminderStage;
  /** Hanya terisi kalau user sudah mengirim bukti dan menunggu persetujuan. */
  pending: {
    amount: string;
    currency: string;
    reference: string;
    submittedAt: Date;
  } | null;
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

function formatDateOnly(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
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

export function htmlDocument(input: {
  heading: string;
  greeting?: string;
  paragraphs: string[];
  details?: Array<[string, string]>;
  /** Rendered as one large spaced block. Used for codes the reader must retype. */
  code?: string;
  action?: { label: string; url: string };
}) {
  const detailRows = (input.details ?? []).map(([label, value]) => `
    <tr>
      <td style="padding:6px 12px 6px 0;color:#64748b;vertical-align:top">${escapeHtml(label)}</td>
      <td style="padding:6px 0;color:#0f172a;font-weight:600">${escapeHtml(value)}</td>
    </tr>`).join("");
  const paragraphs = input.paragraphs.map((paragraph) => `<p style="margin:0 0 14px;color:#334155;line-height:1.6">${escapeHtml(paragraph)}</p>`).join("");
  const detailTable = detailRows
    ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin-top:18px">${detailRows}</table>`
    : "";
  const codeBlock = input.code
    ? `<p style="margin:20px 0;padding:14px 18px;border:1px solid #0f172a;border-radius:8px;font-family:'Courier New',monospace;font-size:28px;font-weight:700;letter-spacing:8px;color:#0f172a;text-align:center">${escapeHtml(input.code)}</p>`
    : "";
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
        ${codeBlock}
        ${detailTable}
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

export function buildCapacityAlertEmail(input: {
  statusPercent: number;
  remainingTenants: number | null;
  fullest: string | null;
  /** Bagian paling penuh di antara RAM, CPU, dan disk. */
  fullestResource: string | null;
  bounds: Array<{ label: string; usePercent: number; remainingTenants: number | null }>;
  generatedAt: Date;
}) {
  const dashboardUrl = appUrl("/dashboard/superadmin");
  const subject = emailSubject(`Kapasitas VPS ${input.statusPercent.toFixed(1)}%, periksa sekarang`);
  const boundLines = input.bounds.map((bound) => `${bound.label}: ${bound.usePercent.toFixed(0)}% terpakai, sisa ${bound.remainingTenants ?? "belum bisa dihitung"} tenant`);
  const fullestBound = input.bounds.find((bound) => bound.label === input.fullestResource);
  const fullestLine = `Bagian paling penuh (RAM/CPU/disk): ${input.fullestResource ?? "belum diketahui"}${fullestBound ? ` ${fullestBound.usePercent.toFixed(0)}%` : ""}`;
  const remainingLine = input.remainingTenants === null
    ? "Kira-kira sisa kapasitas tenant: belum bisa dihitung."
    : `Kira-kira masih muat ${input.remainingTenants} tenant lagi.`;
  const textLines = [
    "Halo,",
    "",
    `Waktu: ${formatDate(input.generatedAt)}`,
    `Pemakaian VPS: ${input.statusPercent.toFixed(1)}%`,
    fullestLine,
    remainingLine,
    `Batas kapasitas paling sempit: ${input.fullest ?? "belum diketahui"}.`,
    "",
    ...boundLines,
    ...(dashboardUrl ? ["", `Buka SuperAdmin: ${dashboardUrl}`] : []),
  ];
  return {
    subject,
    textBody: textLines.join("\n"),
    htmlBody: htmlDocument({
      heading: "Kapasitas sistem mendekati batas",
      greeting: "Halo,",
      paragraphs: [
        `Pemakaian VPS sudah mencapai ${input.statusPercent.toFixed(1)}%. Periksa VPS dan batas kapasitas sebelum tenant baru ditolak.`,
        fullestLine,
        remainingLine,
        `Batas kapasitas paling sempit: ${input.fullest ?? "belum diketahui"}.`,
      ],
      details: [
        ["Waktu", formatDate(input.generatedAt)],
        ...input.bounds.map((bound) => [bound.label, `${bound.usePercent.toFixed(0)}% · sisa ${bound.remainingTenants ?? "belum bisa dihitung"} tenant`] as [string, string]),
      ],
      action: dashboardUrl ? { label: "Buka SuperAdmin", url: dashboardUrl } : undefined,
    }),
  };
}

/** Satu email per hari ke alamat ops, walau pemindaian berjalan tiap menit. */
export async function queueCapacityAlertEmails(client: EmailQueueClient, input: {
  statusPercent: number;
  remainingTenants: number | null;
  fullest: string | null;
  fullestResource: string | null;
  bounds: Array<{ label: string; usePercent: number; remainingTenants: number | null }>;
  generatedAt: Date;
}) {
  const configuredEmail = getEnv().CAPACITY_ALERT_EMAIL;
  const admins = await client.user.findMany({
    where: { role: "SUPERADMIN", status: "ACTIVE" },
    select: { id: true, name: true, email: true },
  });
  const recipient = configuredEmail
    ? admins.find((admin) => admin.email.toLowerCase() === configuredEmail.toLowerCase())
      ?? admins[0]
      ?? { id: "ops", name: "Admin", email: configuredEmail }
    : admins[0];
  if (!recipient) return 0;
  const shifted = new Date(input.generatedAt.getTime() + 7 * 60 * 60 * 1000);
  const dayKey = shifted.toISOString().slice(0, 10).replace(/-/g, "");
  const content = buildCapacityAlertEmail(input);
  const queued = await client.emailOutbox.createMany({
    data: [{
      eventKey: `capacity-alert:${dayKey}:${recipient.id}`,
      type: "CAPACITY_ALERT" as const,
      toEmail: recipient.email,
      toName: recipient.name,
      ...content,
    }],
    skipDuplicates: true,
  });
  return queued.count;
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

/**
 * Konfirmasi ke user bahwa bukti transfernya sudah diterima dan sedang
 * diperiksa. Tanpa email ini user hanya melihat status di halaman Tagihan dan
 * sering mengunggah bukti yang sama dua kali.
 */
export function buildPaymentSubmittedUserEmail(input: PaymentEmailBase & {
  userName: string | null;
  submittedAt: Date;
}) {
  const greeting = input.userName?.trim() ? `Halo ${input.userName.trim()},` : "Halo,";
  const amount = formatMoney(input.amount, input.currency);
  const billingUrl = appUrl("/dashboard/billing");
  const subject = emailSubject(`Bukti pembayaran ${input.planName} sudah kami terima`);
  const summary = `Bukti pembayaran Anda untuk paket ${input.planName} sudah masuk dan sedang diperiksa admin. Anda tidak perlu mengunggah ulang.`;
  const textLines = [
    greeting,
    "",
    summary,
    "",
    `Paket: ${input.planName}`,
    `Jumlah: ${amount}`,
    `Referensi: ${input.reference}`,
    `Dikirim: ${formatDate(input.submittedAt)}`,
    "Status: menunggu pemeriksaan admin",
    ...(billingUrl ? ["", `Lihat status: ${billingUrl}`] : []),
  ];
  return {
    subject,
    textBody: textLines.join("\n"),
    htmlBody: htmlDocument({
      heading: "Bukti pembayaran sudah kami terima",
      greeting,
      paragraphs: [summary],
      details: [
        ["Paket", input.planName],
        ["Jumlah", amount],
        ["Referensi", input.reference],
        ["Dikirim", formatDate(input.submittedAt)],
        ["Status", "Menunggu pemeriksaan admin"],
      ],
      action: billingUrl ? { label: "Lihat status pembayaran", url: billingUrl } : undefined,
    }),
  };
}

/**
 * Dikirim tepat satu kali per bukti pembayaran. `eventKey` memakai id
 * verifikasi supaya unggahan ulang tidak menghasilkan email kedua.
 */
export async function queuePaymentSubmittedUserEmail(client: EmailQueueClient, input: PaymentEmailBase & {
  userId: string;
  submittedAt: Date;
}) {
  const user = await client.user.findUnique({
    where: { id: input.userId },
    select: { name: true, email: true },
  });
  if (!user) return 0;
  const content = buildPaymentSubmittedUserEmail({ ...input, userName: user.name });
  const queued = await client.emailOutbox.createMany({
    data: [{
      eventKey: `payment-submitted-user:${input.verificationId}:${input.userId}`,
      type: "PAYMENT_SUBMITTED_USER" as const,
      toEmail: user.email,
      toName: user.name,
      ...content,
    }],
    skipDuplicates: true,
  });
  return queued.count;
}

function reminderLeadLabel(stage: SubscriptionReminderStage) {
  return stage === "h1" ? "besok" : "3 hari lagi";
}

function reminderLeadDetail(stage: SubscriptionReminderStage) {
  return stage === "h1" ? "1 hari" : "3 hari";
}

/** Pengingat ke user bahwa paketnya hampir berakhir. */
export function buildSubscriptionReminderEmail(input: {
  userName: string | null;
  planName: string;
  endsAt: Date;
  stage: SubscriptionReminderStage;
}) {
  const greeting = input.userName?.trim() ? `Halo ${input.userName.trim()},` : "Halo,";
  const lead = reminderLeadLabel(input.stage);
  const endsAt = formatDateOnly(input.endsAt);
  const billingUrl = appUrl("/dashboard/billing");
  const subject = emailSubject(`Paket ${input.planName} berakhir ${lead}`);
  const summary = `Paket ${input.planName} Anda berakhir ${lead}, yaitu ${endsAt}. Perpanjang sebelum tanggal itu supaya pengiriman pesan, balasan otomatis, dan webhook tidak berhenti.`;
  const textLines = [
    greeting,
    "",
    summary,
    "",
    `Paket: ${input.planName}`,
    `Berakhir: ${endsAt}`,
    `Sisa waktu: ${reminderLeadDetail(input.stage)}`,
    "Perpanjangan memakai harga paket Anda yang terkunci, dan masa aktif ditambahkan dari tanggal berakhir sekarang.",
    ...(billingUrl ? ["", `Perpanjang di halaman Tagihan: ${billingUrl}`] : []),
  ];
  return {
    subject,
    textBody: textLines.join("\n"),
    htmlBody: htmlDocument({
      heading: `Paket ${input.planName} berakhir ${lead}`,
      greeting,
      paragraphs: [
        summary,
        "Perpanjangan memakai harga paket Anda yang terkunci, dan masa aktif ditambahkan dari tanggal berakhir sekarang. Sisa hari yang sudah dibayar tidak hangus.",
      ],
      details: [
        ["Paket", input.planName],
        ["Berakhir", endsAt],
        ["Sisa waktu", reminderLeadDetail(input.stage)],
      ],
      action: billingUrl ? { label: "Perpanjang sekarang", url: billingUrl } : undefined,
    }),
  };
}

/**
 * Pengingat ke admin: user sudah mengirim bukti perpanjangan tetapi belum
 * disetujui, padahal paketnya hampir berakhir. Admin yang perlu bertindak,
 * jadi user tidak dikirimi pengingat lagi.
 */
export function buildSubscriptionReminderAdminEmail(input: {
  userName: string | null;
  userEmail: string;
  planName: string;
  endsAt: Date;
  stage: SubscriptionReminderStage;
  pending: NonNullable<SubscriptionReminderInput["pending"]>;
}) {
  const user = input.userName?.trim() || input.userEmail;
  const lead = reminderLeadLabel(input.stage);
  const endsAt = formatDateOnly(input.endsAt);
  const amount = formatMoney(input.pending.amount, input.pending.currency);
  const reviewUrl = appUrl("/dashboard/commercial");
  const subject = emailSubject(`Perpanjangan ${user} menunggu, paket berakhir ${lead}`);
  const summary = `Paket ${input.planName} milik ${user} berakhir ${lead} (${endsAt}), dan bukti perpanjangannya masih menunggu persetujuan admin.`;
  const textLines = [
    "Halo,",
    "",
    summary,
    "",
    `Pengguna: ${user} (${input.userEmail})`,
    `Paket: ${input.planName}`,
    `Berakhir: ${endsAt}`,
    `Jumlah bukti: ${amount}`,
    `Referensi: ${input.pending.reference}`,
    `Dikirim: ${formatDate(input.pending.submittedAt)}`,
    ...(reviewUrl ? ["", `Periksa pembayaran: ${reviewUrl}`] : []),
  ];
  return {
    subject,
    textBody: textLines.join("\n"),
    htmlBody: htmlDocument({
      heading: "Perpanjangan menunggu persetujuan",
      greeting: "Halo,",
      paragraphs: [summary],
      details: [
        ["Pengguna", `${user} (${input.userEmail})`],
        ["Paket", input.planName],
        ["Berakhir", endsAt],
        ["Jumlah bukti", amount],
        ["Referensi", input.pending.reference],
        ["Dikirim", formatDate(input.pending.submittedAt)],
      ],
      action: reviewUrl ? { label: "Periksa pembayaran", url: reviewUrl } : undefined,
    }),
  };
}

/**
 * Satu email per user per tahap per tanggal berakhir. Idempotensi dijaga
 * `eventKey` unik + `skipDuplicates`, jadi pemindaian yang berjalan berkali-kali
 * di hari yang sama tidak bisa mengirim pengingat yang sama dua kali.
 */
export async function queueSubscriptionReminderEmails(
  client: EmailQueueClient,
  input: SubscriptionReminderInput,
  dateKey: string,
) {
  if (input.pending) {
    const admins = await client.user.findMany({
      where: { role: "SUPERADMIN", status: "ACTIVE" },
      select: { id: true, name: true, email: true },
    });
    if (admins.length === 0) return 0;
    const content = buildSubscriptionReminderAdminEmail({ ...input, pending: input.pending });
    const queued = await client.emailOutbox.createMany({
      data: admins.map((admin) => ({
        eventKey: `subscription-reminder-admin:${input.stage}:user:${input.userId}:${dateKey}:${admin.id}`,
        type: "SUBSCRIPTION_REMINDER_ADMIN" as const,
        toEmail: admin.email,
        toName: admin.name,
        ...content,
      })),
      skipDuplicates: true,
    });
    return queued.count;
  }
  const content = buildSubscriptionReminderEmail(input);
  const queued = await client.emailOutbox.createMany({
    data: [{
      eventKey: `subscription-reminder:${input.stage}:user:${input.userId}:${dateKey}`,
      type: "SUBSCRIPTION_REMINDER" as const,
      toEmail: input.userEmail,
      toName: input.userName,
      ...content,
    }],
    skipDuplicates: true,
  });
  return queued.count;
}
