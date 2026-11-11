=== PesanPro for Elementor Form ===
Contributors: PesanPro
Requires at least: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPL-2.0-or-later

Queue Elementor Pro form submissions for WhatsApp delivery through PesanPro. Write a separate message for each form.

== Installation ==

1. Create an integration token of type WordPress (form kustom) in PesanPro (Integration > Integration Tokens).
2. Install and activate this plugin. Elementor Pro with the Form widget must be active.
3. Open Settings > PesanPro Elementor and fill in the PesanPro base URL and the integration token.
4. Add one row per form: the Form Name from the Elementor widget, the ID of the phone field, and the message.

The token can also be defined as PESANPRO_ELEMENTOR_TOKEN in wp-config.php. Submissions are stored in a local queue and delivered by WP-Cron, so a temporary gateway outage does not lose a submission.

== Frequently Asked Questions ==

= Which token type do I need? =

WordPress (form kustom). A Contact Form 7, WooCommerce, or Google Forms token will be rejected with 401.

= Will every Elementor form send a message? =

No. By default only the forms listed on the settings page are processed. Change "Form yang diproses" to all forms if you want every Elementor form to notify.

= Which placeholders can I use? =

{{field:nama}}, {{all_fields}}, {{formTitle}}, {{formId}}, {{submissionId}}, {{submittedAt}}, and {{site}}. Field placeholders that do not exist become empty text.

= What happens when the phone field is empty? =

The submission is recorded as failed with the reason recipient_missing. No request is sent to PesanPro.

== Changelog ==

= 1.0.0 =
* First release: per-form message templates and a restart-safe delivery queue.
