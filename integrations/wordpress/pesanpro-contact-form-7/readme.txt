=== PesanPro for Contact Form 7 ===
Contributors: pesanpro
Tags: contact form 7, whatsapp, gateway, webhook, forms
Requires at least: 6.7
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Durably queues successful Contact Form 7 submissions for WhatsApp delivery through PesanPro.

== Description ==

The plugin listens to the server-side `wpcf7_mail_sent` action, reads Contact Form 7 processed data, and writes a local queue record. WP-Cron claims one record atomically and sends it with WordPress HTTP API. PesanPro then performs entitlement, quota, suppression, idempotency, and durable message-queue checks.

No browser JavaScript receives the integration token. Response bodies and tokens are not stored in plugin delivery history.

== Installation ==

1. Create a PesanPro integration token with type `CONTACT_FORM_7` and choose a WhatsApp device.
2. Upload the `pesanpro-contact-form-7` directory to `/wp-content/plugins/` and activate it.
3. Open **Settings > PesanPro CF7**.
4. Set the HTTPS PesanPro base URL, optional Contact Form 7 form ID, and recipient field name or static recipient.
5. Prefer defining the token in `wp-config.php`: `define( 'PESANPRO_CF7_TOKEN', 'ppint_...' );`. Otherwise enter it once in the password field.
6. Save, verify **Tools > Site Health**, submit the form, and confirm the job in PesanPro Message Queue.

WordPress loopback/cron must work. For reliable production processing, invoke `wp-cron.php` from a real server cron and disable request-driven WP-Cron according to your hosting policy.

== Frequently Asked Questions ==

= Does the plugin send WhatsApp directly? =

No. It only calls the tenant-scoped Contact Form 7 connector. PesanPro creates a Phase 3 message job.

= What happens during an outage? =

Network errors, HTTP 408/425/429, and 5xx responses retry with bounded exponential backoff. A stable idempotency key prevents duplicate queue jobs.

= Is form data stored? =

The local durable queue temporarily stores the selected submission fields. Completed and failed rows are deleted after the configured retention period. Configure the form privacy notice for this external processing.

= How do I remove all plugin data? =

Data is preserved on uninstall by default. Define `PESANPRO_CF7_REMOVE_DATA` as `true` before uninstalling to remove options and the queue table.

== Privacy ==

When enabled, this plugin sends Contact Form 7 field values, form metadata, site URL, and the selected recipient to the configured PesanPro server. Site owners must document the processing purpose, lawful basis, retention, and recipients in their privacy notice.

== Changelog ==

= 1.0.0 =
* Initial durable Contact Form 7 connector with Settings API, Site Health, atomic claim, retry, and idempotency.
