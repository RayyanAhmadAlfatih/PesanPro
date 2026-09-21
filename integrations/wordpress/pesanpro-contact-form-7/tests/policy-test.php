<?php

define( 'ABSPATH', __DIR__ );
define( 'HOUR_IN_SECONDS', 3600 );
require dirname( __DIR__ ) . '/includes/class-pesanpro-cf7-queue.php';

$failures = array();
foreach ( array( 408, 425, 429, 500, 503 ) as $status ) {
    if ( ! PesanPro_CF7_Queue::is_retryable_status( $status ) ) $failures[] = "Expected retry for {$status}";
}
foreach ( array( 200, 201, 400, 401, 403, 404, 409, 422 ) as $status ) {
    if ( PesanPro_CF7_Queue::is_retryable_status( $status ) ) $failures[] = "Expected terminal status for {$status}";
}
if ( 30 !== PesanPro_CF7_Queue::retry_delay( 1 ) ) $failures[] = 'Attempt 1 delay mismatch';
if ( 60 !== PesanPro_CF7_Queue::retry_delay( 2 ) ) $failures[] = 'Attempt 2 delay mismatch';
if ( 3600 !== PesanPro_CF7_Queue::retry_delay( 20 ) ) $failures[] = 'Retry cap mismatch';

$plugin_source = file_get_contents( dirname( __DIR__ ) . '/includes/class-pesanpro-cf7-plugin.php' );
if ( false === strpos( $plugin_source, "get_posted_data_hash" ) ) $failures[] = 'CF7 submission id must use a stable posted-data hash';
$queue_source = file_get_contents( dirname( __DIR__ ) . '/includes/class-pesanpro-cf7-queue.php' );
if ( false === strpos( $queue_source, "DATE_ADD(locked_at, INTERVAL 5 MINUTE)" ) ) $failures[] = 'Processing rows must be rescheduled at stale-lock time, not immediately';

if ( $failures ) {
    fwrite( STDERR, implode( PHP_EOL, $failures ) . PHP_EOL );
    exit( 1 );
}
echo "PesanPro Contact Form 7 policy tests passed." . PHP_EOL;
