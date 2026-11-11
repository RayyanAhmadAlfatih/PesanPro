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
require $root . '/includes/class-pesanpro-woo-message.php';
require $root . '/includes/class-pesanpro-woo-queue.php';

$failures = array();
foreach ( array( 408, 425, 429, 500, 503 ) as $status ) {
    if ( ! PesanPro_Woo_Queue::is_retryable_status( $status ) ) $failures[] = "Expected retry for {$status}";
}
foreach ( array( 200, 201, 400, 401, 403, 404, 409, 422 ) as $status ) {
    if ( PesanPro_Woo_Queue::is_retryable_status( $status ) ) $failures[] = "Expected terminal status for {$status}";
}
if ( 30 !== PesanPro_Woo_Queue::retry_delay( 1 ) ) $failures[] = 'Attempt 1 delay mismatch';
if ( 60 !== PesanPro_Woo_Queue::retry_delay( 2 ) ) $failures[] = 'Attempt 2 delay mismatch';
if ( 3600 !== PesanPro_Woo_Queue::retry_delay( 20 ) ) $failures[] = 'Retry cap mismatch';

$key = PesanPro_Woo_Queue::submission_key( array( 'orderId' => '1042', 'event' => 'order.paid' ) );
if ( $key !== PesanPro_Woo_Queue::submission_key( array( 'orderId' => '1042', 'event' => 'order.paid', 'message' => 'changed' ) ) ) {
    $failures[] = 'Order idempotency key must not depend on the rendered message';
}

if ( array( 'order.created', 'order.updated', 'order.paid', 'order.completed', 'order.cancelled', 'order.refunded' ) !== PesanPro_Woo_Message::event_keys() ) {
    $failures[] = 'All six WooCommerce events must have their own template';
}

if ( 'Halo {{customerName}} #{{orderId}}' !== PesanPro_Woo_Message::sanitize_template( "Halo {{customerName}} #{{orderId}}\n<script>alert(1)</script>" ) ) {
    $failures[] = 'Saved template must be sanitized and keep placeholders';
}

$values = array(
    'orderId'      => '1042',
    'customerName' => 'Ayu',
    'orderTotal'   => '150000',
    'status'       => 'processing',
    'items'        => '',
);
$cases = array(
    array( 'Halo {{customerName}}, pesanan #{{orderId}} total {{orderTotal}}.', 'Halo Ayu, pesanan #1042 total 150000.' ),
    array( '{{field:orderId}}|{{field:tidak-ada}}|selesai', '1042||selesai' ),
    array( '{{all_fields}}', "orderId: 1042\ncustomerName: Ayu\norderTotal: 150000\nstatus: processing\nitems: -" ),
    array( '', '' ),
    array( '{{field:tidak-ada}}', '' ),
);
foreach ( $cases as $index => $case ) {
    if ( PesanPro_Woo_Message::render( $case[0], $values ) !== $case[1] ) $failures[] = "Render case {$index} mismatch";
}

$long = PesanPro_Woo_Message::render( str_repeat( 'é', 5000 ) . ' {{customerName}}', $values );
if ( strlen( $long ) > 4096 || ! mb_check_encoding( $long, 'UTF-8' ) ) $failures[] = 'Rendered message must stay within the 4096 limit without breaking UTF-8';

$sources = array(
    '/pesanpro-woocommerce.php',
    '/includes/class-pesanpro-woo-plugin.php',
    '/includes/class-pesanpro-woo-settings.php',
    '/includes/class-pesanpro-woo-queue.php',
    '/includes/class-pesanpro-woo-message.php',
    '/uninstall.php',
);
$source = '';
foreach ( $sources as $file ) {
    $source .= file_get_contents( $root . $file ) . "\n";
}
foreach ( array(
    'woocommerce_new_order',
    'woocommerce_order_status_changed',
    "'message'   => \$message",
    'PesanPro_Woo_Message::render(',
    'enabled_events',
    'PesanPro_Woo_Message::default_template',
    'register_setting(',
    "current_user_can( 'manage_options' )",
    'wp_safe_remote_post(',
    'wp_schedule_single_event(',
    'ORDER BY available_at ASC, id ASC LIMIT 1',
    "redirection' => 0",
    'DATE_ADD(locked_at, INTERVAL 5 MINUTE)',
    'PESANPRO_WOO_REMOVE_DATA',
    'Requires Plugins:  woocommerce',
    'const MAX_BYTES = 4096',
) as $needle ) {
    if ( false === strpos( $source, $needle ) ) $failures[] = "Missing package invariant: {$needle}";
}
foreach ( array( '/\$_(?:POST|GET|REQUEST)/', '/curl_(?:init|exec|setopt)/i', '/response_body|responseBody/', '/value=["\'][^"\']*ppint_/' ) as $pattern ) {
    if ( preg_match( $pattern, $source ) ) $failures[] = "Forbidden pattern in package: {$pattern}";
}
if ( false === strpos( $source, 'autocomplete="new-password"' ) ) $failures[] = 'Token field must not be prefilled by the browser';

if ( $failures ) {
    fwrite( STDERR, implode( PHP_EOL, $failures ) . PHP_EOL );
    exit( 1 );
}
echo "PesanPro WooCommerce policy tests passed." . PHP_EOL;
