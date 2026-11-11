<?php

define( 'ABSPATH', __DIR__ );
define( 'HOUR_IN_SECONDS', 3600 );
define( 'DAY_IN_SECONDS', 86400 );
define( 'MINUTE_IN_SECONDS', 60 );

if ( ! function_exists( '__' ) ) {
    function __( $text, $domain = '' ) { return $text; }
}
if ( ! function_exists( 'sanitize_textarea_field' ) ) {
    function sanitize_textarea_field( $value ) {
        $value = preg_replace( '@<(script|style)[^>]*>.*?</\1>@si', '', (string) $value );
        return trim( strip_tags( $value ) );
    }
}
if ( ! function_exists( 'sanitize_key' ) ) {
    function sanitize_key( $key ) { return strtolower( preg_replace( '/[^a-z0-9_-]/i', '', (string) $key ) ); }
}

$root = dirname( __DIR__ );
require $root . '/includes/class-pesanpro-elementor-message.php';
require $root . '/includes/class-pesanpro-elementor-queue.php';

$failures = array();
foreach ( array( 408, 425, 429, 500, 503 ) as $status ) {
    if ( ! PesanPro_Elementor_Queue::is_retryable_status( $status ) ) $failures[] = "Expected retry for {$status}";
}
foreach ( array( 200, 201, 400, 401, 403, 404, 409, 422 ) as $status ) {
    if ( PesanPro_Elementor_Queue::is_retryable_status( $status ) ) $failures[] = "Expected terminal status for {$status}";
}
if ( 30 !== PesanPro_Elementor_Queue::retry_delay( 1 ) ) $failures[] = 'Attempt 1 delay mismatch';
if ( 3600 !== PesanPro_Elementor_Queue::retry_delay( 20 ) ) $failures[] = 'Retry cap mismatch';

$key = PesanPro_Elementor_Queue::submission_key( array( 'submissionId' => 's-1' ) );
if ( $key !== PesanPro_Elementor_Queue::submission_key( array( 'submissionId' => 's-1', 'message' => 'changed' ) ) ) {
    $failures[] = 'Submission idempotency key must not depend on the rendered message';
}

$raw = array(
    array( 'id' => 'nama', 'value' => 'Ayu' ),
    array( 'id' => 'topik', 'value' => array( 'Harga', 'Stok' ) ),
    array( 'id' => 'kosong', 'value' => '' ),
    array( 'id' => '_wpcf7', 'value' => 'ignored' ),
    'not-an-array',
);
$normalized = PesanPro_Elementor_Message::normalize_fields( $raw );
if ( array( 'nama' => 'Ayu', 'topik' => 'Harga, Stok', 'kosong' => '' ) !== $normalized ) $failures[] = 'Elementor field normalization mismatch';

if ( 'Halo {{field:nama}} #{{formId}}' !== PesanPro_Elementor_Message::sanitize_template( "Halo {{field:nama}} #{{formId}}\n<script>alert(1)</script>" ) ) {
    $failures[] = 'Saved template must be sanitized and keep placeholders';
}

$fields = array( 'nama' => 'Ayu', 'pesan' => '', 'topik' => 'Harga, Stok' );
$context = array( 'formTitle' => 'Hubungi Kami', 'formId' => 'e7', 'submissionId' => 's-1', 'submittedAt' => '2026-11-10T10:00:00+00:00', 'site' => 'https://toko.example' );
$cases = array(
    array( 'Halo {{field:nama}}: {{field:topik}}', 'Halo Ayu: Harga, Stok' ),
    array( '{{field:tidak-ada}}|{{field:pesan}}|selesai', '||selesai' ),
    array( '{{all_fields}}', "nama: Ayu\npesan: -\ntopik: Harga, Stok" ),
    array( 'Form {{formTitle}} ({{formId}}) #{{submissionId}} di {{site}} pada {{submittedAt}}', 'Form Hubungi Kami (e7) #s-1 di https://toko.example pada 2026-11-10T10:00:00+00:00' ),
    array( '', '' ),
    array( '{{field:tidak-ada}}', '' ),
);
foreach ( $cases as $index => $case ) {
    if ( PesanPro_Elementor_Message::render( $case[0], $fields, $context ) !== $case[1] ) $failures[] = "Render case {$index} mismatch";
}

if ( "Form Hubungi Kami\nnama: Ayu\npesan: -" !== PesanPro_Elementor_Message::default_message( 'Hubungi Kami', array( 'nama' => 'Ayu', 'pesan' => '' ) ) ) {
    $failures[] = 'Default message must list every field';
}

$long = PesanPro_Elementor_Message::render( str_repeat( 'é', 5000 ) . ' {{field:nama}}', $fields, $context );
if ( strlen( $long ) > 4096 || ! mb_check_encoding( $long, 'UTF-8' ) ) $failures[] = 'Rendered message must stay within the 4096 limit without breaking UTF-8';

$sources = array(
    '/pesanpro-elementor-form.php',
    '/includes/class-pesanpro-elementor-plugin.php',
    '/includes/class-pesanpro-elementor-settings.php',
    '/includes/class-pesanpro-elementor-queue.php',
    '/includes/class-pesanpro-elementor-message.php',
    '/uninstall.php',
);
$source = '';
foreach ( $sources as $file ) {
    $source .= file_get_contents( $root . $file ) . "\n";
}
foreach ( array(
    'elementor_pro/forms/new_record',
    'api/v1/integrations/wordpress',
    "'message'      => \$message",
    'PesanPro_Elementor_Message::render(',
    'row_for(',
    'form_scope',
    'register_setting(',
    "current_user_can( 'manage_options' )",
    'wp_safe_remote_post(',
    'wp_schedule_single_event(',
    'ORDER BY available_at ASC, id ASC LIMIT 1',
    "redirection' => 0",
    'DATE_ADD(locked_at, INTERVAL 5 MINUTE)',
    'PESANPRO_ELEMENTOR_REMOVE_DATA',
    'const MAX_BYTES = 4096',
    'autocomplete="new-password"',
) as $needle ) {
    if ( false === strpos( $source, $needle ) ) $failures[] = "Missing package invariant: {$needle}";
}
foreach ( array(
    '/\$_(?:POST|GET|REQUEST)/',
    '/curl_(?:init|exec|setopt)/i',
    '/response_body|responseBody/',
    '/value=["\'][^"\']*ppint_/',
    '/api\/v1\/integrations\/(?:contact-form-7|woocommerce|google-forms)/',
) as $pattern ) {
    if ( preg_match( $pattern, $source ) ) $failures[] = "Forbidden pattern in package: {$pattern}";
}

if ( $failures ) {
    fwrite( STDERR, implode( PHP_EOL, $failures ) . PHP_EOL );
    exit( 1 );
}
echo "PesanPro Elementor Form policy tests passed." . PHP_EOL;
