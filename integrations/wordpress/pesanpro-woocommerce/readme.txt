=== PesanPro for WooCommerce ===
Contributors: PesanPro
Requires at least: 6.7
Requires PHP: 7.4
Requires Plugins: woocommerce
Stable tag: 1.0.0
License: GPL-2.0-or-later

Queue WooCommerce order events for WhatsApp delivery through PesanPro. Write a separate message for each order status.

== Installation ==

1. Create a WooCommerce integration token in PesanPro (Integration > Integration Tokens).
2. Install and activate this plugin.
3. Open Settings > PesanPro WooCommerce and fill in the PesanPro base URL and the integration token.
4. Edit the message for each order status, then save.

The integration token can also be defined as PESANPRO_WOO_TOKEN in wp-config.php. Order events are stored in a local queue and delivered by WP-Cron, so a temporary gateway outage does not lose a notification.

== Frequently Asked Questions ==

= Where do I get the token? =

In PesanPro, open Integration > Integration Tokens and create a token of type WooCommerce. The secret is shown once.

= Can I turn off one status? =

Yes. Clear the checkbox beside that status in Settings > PesanPro WooCommerce.

= Which placeholders can I use? =

{{orderId}}, {{orderNumber}}, {{customerName}}, {{orderTotal}}, {{currency}}, {{status}}, {{event}}, {{items}}, {{site}}, {{all_fields}}, and {{field:orderId}}. Field placeholders that do not exist become empty text.

= Will the same status send twice? =

No. Each order and event has one stable queue row. A status that changes back and forth does not send the same notification again.

== Changelog ==

= 1.0.0 =
* First release: per-status message templates and a restart-safe delivery queue.
