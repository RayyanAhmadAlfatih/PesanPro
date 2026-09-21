<?php

defined( 'ABSPATH' ) || exit;

final class PesanPro_CF7_Queue {
    const CRON_HOOK = 'pesanpro_cf7_process_queue';
    const MAX_ATTEMPTS = 8;

    public static function table_name() {
        global $wpdb;
        return $wpdb->prefix . 'pesanpro_cf7_queue';
    }

    public static function activate() {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $table = self::table_name();
        $charset_collate = $wpdb->get_charset_collate();
        $sql = "CREATE TABLE {$table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            submission_key varchar(191) NOT NULL,
            payload longtext NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'pending',
            attempts smallint(5) unsigned NOT NULL DEFAULT 0,
            available_at datetime NOT NULL,
            locked_at datetime NULL,
            claim_token varchar(64) NULL,
            last_error_code varchar(100) NULL,
            created_at datetime NOT NULL,
            updated_at datetime NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY submission_key (submission_key),
            KEY due_queue (status,available_at),
            KEY locked_queue (status,locked_at)
        ) {$charset_collate};";
        dbDelta( $sql );
        add_option( PesanPro_CF7_Settings::OPTION, PesanPro_CF7_Settings::defaults(), '', false );
        add_option( PesanPro_CF7_Settings::TOKEN_OPTION, '', '', false );
    }

    public static function enqueue( array $payload ) {
        global $wpdb;
        $submission_key = hash( 'sha256', (string) $payload['submissionId'] );
        $now = current_time( 'mysql', true );
        $inserted = $wpdb->query(
            $wpdb->prepare(
                'INSERT IGNORE INTO ' . self::table_name() . ' (submission_key,payload,status,attempts,available_at,created_at,updated_at) VALUES (%s,%s,%s,%d,%s,%s,%s)',
                $submission_key,
                wp_json_encode( $payload ),
                'pending',
                0,
                $now,
                $now,
                $now
            )
        );
        if ( false === $inserted ) {
            return new WP_Error( 'pesanpro_queue_insert_failed', __( 'Unable to queue the PesanPro submission.', 'pesanpro-cf7' ) );
        }
        self::schedule( 1 );
        return true;
    }

    public static function schedule( $delay_seconds ) {
        if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
            wp_schedule_single_event( time() + max( 1, absint( $delay_seconds ) ), self::CRON_HOOK );
        }
    }

    public static function process() {
        $processed = 0;
        while ( $processed < 10 ) {
            $row = self::claim();
            if ( ! $row ) {
                break;
            }
            self::deliver( $row );
            ++$processed;
        }
        self::cleanup();
        self::schedule_next_due();
    }

    private static function claim() {
        global $wpdb;
        $table = self::table_name();
        $now = current_time( 'mysql', true );
        $stale = gmdate( 'Y-m-d H:i:s', time() - 5 * MINUTE_IN_SECONDS );
        $claim_token = str_replace( '-', '', wp_generate_uuid4() );
        $changed = $wpdb->query(
            $wpdb->prepare(
                "UPDATE {$table} SET status='processing', claim_token=%s, locked_at=%s, updated_at=%s
                 WHERE ((status IN ('pending','retry') AND available_at <= %s) OR (status='processing' AND locked_at < %s))
                 ORDER BY available_at ASC, id ASC LIMIT 1",
                $claim_token,
                $now,
                $now,
                $now,
                $stale
            )
        );
        if ( 1 !== $changed ) {
            return null;
        }
        return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE claim_token=%s LIMIT 1", $claim_token ) );
    }

    private static function deliver( $row ) {
        $settings = PesanPro_CF7_Settings::get();
        $token = PesanPro_CF7_Settings::token();
        if ( empty( $token ) || empty( $settings['base_url'] ) ) {
            self::retry_or_fail( $row, 'configuration_missing', true );
            return;
        }
        $response = wp_safe_remote_post(
            trailingslashit( $settings['base_url'] ) . 'api/v1/integrations/contact-form-7',
            array(
                'timeout'     => 10,
                'redirection' => 0,
                'headers'     => array(
                    'Content-Type'        => 'application/json; charset=utf-8',
                    'X-Integration-Token' => $token,
                    'Idempotency-Key'     => 'cf7-' . $row->submission_key,
                ),
                'body'        => $row->payload,
                'data_format' => 'body',
            )
        );
        if ( is_wp_error( $response ) ) {
            self::retry_or_fail( $row, 'network_error', false );
            return;
        }
        $status_code = (int) wp_remote_retrieve_response_code( $response );
        if ( $status_code >= 200 && $status_code < 300 ) {
            self::mark_sent( $row );
            return;
        }
        self::retry_or_fail( $row, 'http_' . $status_code, ! self::is_retryable_status( $status_code ) );
    }

    public static function is_retryable_status( $status_code ) {
        return in_array( (int) $status_code, array( 408, 425, 429 ), true ) || (int) $status_code >= 500;
    }

    public static function retry_delay( $attempt ) {
        return min( HOUR_IN_SECONDS, 30 * ( 2 ** max( 0, (int) $attempt - 1 ) ) );
    }

    private static function mark_sent( $row ) {
        global $wpdb;
        $wpdb->update(
            self::table_name(),
            array( 'status' => 'sent', 'claim_token' => null, 'locked_at' => null, 'last_error_code' => null, 'updated_at' => current_time( 'mysql', true ) ),
            array( 'id' => (int) $row->id, 'claim_token' => $row->claim_token ),
            array( '%s', '%s', '%s', '%s', '%s' ),
            array( '%d', '%s' )
        );
    }

    private static function retry_or_fail( $row, $safe_code, $permanent ) {
        global $wpdb;
        $attempts = (int) $row->attempts + 1;
        $failed = $permanent || $attempts >= self::MAX_ATTEMPTS;
        $wpdb->update(
            self::table_name(),
            array(
                'status'          => $failed ? 'failed' : 'retry',
                'attempts'        => $attempts,
                'available_at'    => gmdate( 'Y-m-d H:i:s', time() + self::retry_delay( $attempts ) ),
                'claim_token'     => null,
                'locked_at'       => null,
                'last_error_code' => sanitize_key( $safe_code ),
                'updated_at'      => current_time( 'mysql', true ),
            ),
            array( 'id' => (int) $row->id, 'claim_token' => $row->claim_token ),
            array( '%s', '%d', '%s', '%s', '%s', '%s', '%s' ),
            array( '%d', '%s' )
        );
    }

    private static function schedule_next_due() {
        global $wpdb;
        $table = self::table_name();
        $next_due = $wpdb->get_var( "SELECT MIN(available_at) FROM {$table} WHERE status IN ('pending','retry')" );
        $next_stale = $wpdb->get_var( "SELECT MIN(DATE_ADD(locked_at, INTERVAL 5 MINUTE)) FROM {$table} WHERE status='processing' AND locked_at IS NOT NULL" );
        $candidates = array_filter( array( $next_due, $next_stale ) );
        if ( $candidates ) {
            $next = min( array_map( 'strtotime', array_map( static function( $value ) { return $value . ' UTC'; }, $candidates ) ) );
            self::schedule( max( 1, $next - time() ) );
        }
    }

    private static function cleanup() {
        global $wpdb;
        $settings = PesanPro_CF7_Settings::get();
        $cutoff = gmdate( 'Y-m-d H:i:s', time() - absint( $settings['retention_days'] ) * DAY_IN_SECONDS );
        $wpdb->query( $wpdb->prepare( "DELETE FROM " . self::table_name() . " WHERE status IN ('sent','failed') AND updated_at < %s", $cutoff ) );
    }

    public static function counts() {
        global $wpdb;
        $rows = $wpdb->get_results( "SELECT status, COUNT(*) AS total FROM " . self::table_name() . ' GROUP BY status' );
        $counts = array();
        foreach ( (array) $rows as $row ) {
            $counts[ sanitize_key( $row->status ) ] = (int) $row->total;
        }
        return $counts;
    }
}
