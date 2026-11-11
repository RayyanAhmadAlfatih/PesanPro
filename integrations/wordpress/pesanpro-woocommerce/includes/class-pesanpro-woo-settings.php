<?php

defined( 'ABSPATH' ) || exit;

final class PesanPro_Woo_Settings {
    const OPTION = 'pesanpro_woo_settings';
    const TOKEN_OPTION = 'pesanpro_woo_token';

    public static function defaults() {
        $messages = array();
        $enabled = array();
        foreach ( PesanPro_Woo_Message::events() as $event => $definition ) {
            $messages[ $event ] = $definition['default'];
            // Generic status changes would double most order notifications.
            if ( 'order.updated' !== $event ) $enabled[] = $event;
        }
        return array(
            'base_url'         => '',
            'static_recipient' => '',
            'enabled_events'   => $enabled,
            'messages'         => $messages,
            'retention_days'   => 7,
        );
    }

    public static function get() {
        return wp_parse_args( get_option( self::OPTION, array() ), self::defaults() );
    }

    public static function token() {
        if ( defined( 'PESANPRO_WOO_TOKEN' ) && is_string( PESANPRO_WOO_TOKEN ) ) {
            return trim( PESANPRO_WOO_TOKEN );
        }
        return trim( (string) get_option( self::TOKEN_OPTION, '' ) );
    }

    public static function enabled( $event ) {
        $settings = self::get();
        $enabled = is_array( $settings['enabled_events'] ) ? $settings['enabled_events'] : array();
        return in_array( $event, $enabled, true );
    }

    public static function message_for( $event ) {
        $settings = self::get();
        $messages = is_array( $settings['messages'] ) ? $settings['messages'] : array();
        if ( isset( $messages[ $event ] ) && '' !== trim( (string) $messages[ $event ] ) ) return (string) $messages[ $event ];
        return PesanPro_Woo_Message::default_template( $event );
    }

    public static function init() {
        add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ) );
        add_action( 'admin_init', array( __CLASS__, 'register' ) );
        add_action( 'admin_post_pesanpro_woo_retry_failed', array( __CLASS__, 'handle_retry_failed' ) );
    }

    public static function handle_retry_failed() {
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( esc_html__( 'You are not allowed to retry PesanPro deliveries.', 'pesanpro-woo' ) );
        }
        check_admin_referer( 'pesanpro_woo_retry_failed' );
        $retried = PesanPro_Woo_Queue::retry_failed();
        wp_safe_redirect( add_query_arg(
            array( 'page' => 'pesanpro-woo', 'pesanpro_retried' => $retried ),
            admin_url( 'options-general.php' )
        ) );
        exit;
    }

    public static function describe_failure_code( $code ) {
        $map = array(
            'http_401'              => __( 'token ditolak (401). Token salah tipe, sudah dicabut, kedaluwarsa, atau tersalin tidak lengkap.', 'pesanpro-woo' ),
            'http_403'              => __( 'ditolak (403). Paket tidak mencakup integrasi ini atau token tidak punya izin.', 'pesanpro-woo' ),
            'http_404'              => __( 'endpoint tidak ditemukan (404). Periksa PesanPro base URL.', 'pesanpro-woo' ),
            'http_422'              => __( 'data ditolak (422). Nomor tujuan tidak valid atau pesan kosong.', 'pesanpro-woo' ),
            'recipient_missing'     => __( 'nomor tujuan kosong. Isi nomor billing pelanggan atau Static recipient.', 'pesanpro-woo' ),
            'network_error'         => __( 'server PesanPro tidak bisa dihubungi dari situs ini.', 'pesanpro-woo' ),
            'configuration_missing' => __( 'base URL atau token belum terisi saat pengiriman dijalankan.', 'pesanpro-woo' ),
        );
        return isset( $map[ $code ] ) ? $map[ $code ] : $code;
    }

    public static function admin_menu() {
        add_options_page(
            __( 'PesanPro WooCommerce', 'pesanpro-woo' ),
            __( 'PesanPro WooCommerce', 'pesanpro-woo' ),
            'manage_options',
            'pesanpro-woo',
            array( __CLASS__, 'render_page' )
        );
    }

    public static function register() {
        register_setting( 'pesanpro_woo', self::OPTION, array( 'type' => 'array', 'sanitize_callback' => array( __CLASS__, 'sanitize_settings' ), 'default' => self::defaults() ) );
        register_setting( 'pesanpro_woo', self::TOKEN_OPTION, array( 'type' => 'string', 'sanitize_callback' => array( __CLASS__, 'sanitize_token' ), 'default' => '' ) );
        add_settings_section( 'pesanpro_woo_main', __( 'Gateway connection', 'pesanpro-woo' ), array( __CLASS__, 'render_section' ), 'pesanpro-woo' );
        foreach ( array(
            'base_url'         => __( 'PesanPro base URL', 'pesanpro-woo' ),
            'token'            => __( 'Integration token', 'pesanpro-woo' ),
            'static_recipient' => __( 'Static recipient', 'pesanpro-woo' ),
            'retention_days'   => __( 'Queue retention days', 'pesanpro-woo' ),
        ) as $field => $label ) {
            add_settings_field( 'pesanpro_woo_' . $field, $label, array( __CLASS__, 'render_field' ), 'pesanpro-woo', 'pesanpro_woo_main', array( 'field' => $field ) );
        }
        add_settings_section( 'pesanpro_woo_events', __( 'Pesan per status pesanan', 'pesanpro-woo' ), array( __CLASS__, 'render_events_section' ), 'pesanpro-woo' );
        foreach ( PesanPro_Woo_Message::events() as $event => $definition ) {
            add_settings_field( 'pesanpro_woo_event_' . sanitize_key( $event ), $definition['label'], array( __CLASS__, 'render_event_field' ), 'pesanpro-woo', 'pesanpro_woo_events', array( 'event' => $event ) );
        }
    }

    public static function sanitize_settings( $input ) {
        $old = self::get();
        $input = is_array( $input ) ? $input : array();
        $base_url = isset( $input['base_url'] ) ? untrailingslashit( esc_url_raw( wp_unslash( $input['base_url'] ) ) ) : '';
        $host = wp_parse_url( $base_url, PHP_URL_HOST );
        $scheme = wp_parse_url( $base_url, PHP_URL_SCHEME );
        $local_debug = defined( 'WP_DEBUG' ) && WP_DEBUG && in_array( $host, array( 'localhost', '127.0.0.1', '::1' ), true );
        if ( $base_url && 'https' !== $scheme && ! $local_debug ) {
            add_settings_error( self::OPTION, 'invalid_https', __( 'PesanPro base URL must use HTTPS.', 'pesanpro-woo' ) );
            $base_url = $old['base_url'];
        }
        $enabled = array();
        if ( isset( $input['enabled_events'] ) && is_array( $input['enabled_events'] ) ) {
            foreach ( $input['enabled_events'] as $event ) {
                if ( in_array( $event, PesanPro_Woo_Message::event_keys(), true ) ) $enabled[ $event ] = true;
            }
        }
        $messages = array();
        foreach ( PesanPro_Woo_Message::event_keys() as $event ) {
            $raw = isset( $input['messages'][ $event ] ) ? wp_unslash( $input['messages'][ $event ] ) : '';
            $messages[ $event ] = PesanPro_Woo_Message::sanitize_template( $raw );
        }
        return array(
            'base_url'         => $base_url,
            'static_recipient' => isset( $input['static_recipient'] ) ? preg_replace( '/[^0-9+]/', '', wp_unslash( $input['static_recipient'] ) ) : '',
            'enabled_events'   => array_keys( $enabled ),
            'messages'         => $messages,
            'retention_days'   => isset( $input['retention_days'] ) ? min( 90, max( 1, absint( $input['retention_days'] ) ) ) : 7,
        );
    }

    public static function sanitize_token( $value ) {
        if ( defined( 'PESANPRO_WOO_TOKEN' ) ) {
            return (string) get_option( self::TOKEN_OPTION, '' );
        }
        $token = trim( sanitize_text_field( wp_unslash( $value ) ) );
        if ( '' === $token ) {
            return (string) get_option( self::TOKEN_OPTION, '' );
        }
        if ( ! preg_match( '/^ppint_[A-Za-z0-9_-]{40,100}$/', $token ) ) {
            add_settings_error( self::TOKEN_OPTION, 'invalid_token', __( 'Integration token format is invalid.', 'pesanpro-woo' ) );
            return (string) get_option( self::TOKEN_OPTION, '' );
        }
        return $token;
    }

    public static function render_section() {
        echo '<p>' . esc_html__( 'Order events are persisted locally and delivered asynchronously. For best security, define PESANPRO_WOO_TOKEN in wp-config.php.', 'pesanpro-woo' ) . '</p>';
    }

    public static function render_events_section() {
        echo '<p>' . esc_html__( 'Tulis pesan untuk tiap status. Kosongkan untuk memakai pesan bawaan, atau matikan centang supaya status itu tidak mengirim WhatsApp.', 'pesanpro-woo' ) . '</p>';
        echo '<p class="description">' . esc_html__( 'Placeholder: {{orderId}}, {{customerName}}, {{orderTotal}}, {{status}}, {{event}}, {{items}}, {{site}}, {{all_fields}}, dan {{field:orderId}}. Placeholder field yang tidak ada diganti teks kosong.', 'pesanpro-woo' ) . '</p>';
    }

    public static function render_field( $args ) {
        $settings = self::get();
        $field = sanitize_key( $args['field'] );
        if ( 'token' === $field ) {
            $configured = '' !== self::token();
            printf( '<input class="regular-text" type="password" name="%1$s" value="" autocomplete="new-password" placeholder="%2$s" />', esc_attr( self::TOKEN_OPTION ), esc_attr( $configured ? __( 'Configured; leave blank to keep', 'pesanpro-woo' ) : 'ppint_...' ) );
            if ( defined( 'PESANPRO_WOO_TOKEN' ) ) echo '<p class="description">' . esc_html__( 'Token is supplied by wp-config.php and cannot be changed here.', 'pesanpro-woo' ) . '</p>';
            return;
        }
        $name = self::OPTION . '[' . $field . ']';
        if ( 'retention_days' === $field ) {
            printf( '<input type="number" min="1" max="90" name="%1$s" value="%2$d" />', esc_attr( $name ), (int) $settings[ $field ] );
            return;
        }
        printf( '<input class="regular-text" type="text" name="%1$s" value="%2$s" />', esc_attr( $name ), esc_attr( $settings[ $field ] ) );
        if ( 'static_recipient' === $field ) {
            echo '<p class="description">' . esc_html__( 'Isi kalau semua notifikasi dikirim ke nomor admin. Kosongkan untuk memakai nomor billing pembeli.', 'pesanpro-woo' ) . '</p>';
        }
    }

    public static function render_event_field( $args ) {
        $settings = self::get();
        $event = $args['event'];
        $enabled = self::enabled( $event );
        $messages = is_array( $settings['messages'] ) ? $settings['messages'] : array();
        $value = isset( $messages[ $event ] ) ? (string) $messages[ $event ] : PesanPro_Woo_Message::default_template( $event );
        printf(
            '<label><input type="checkbox" name="%1$s[]" value="%2$s" %3$s /> %4$s</label>',
            esc_attr( self::OPTION . '[enabled_events]' ),
            esc_attr( $event ),
            checked( $enabled, true, false ),
            esc_html__( 'Kirim notifikasi untuk status ini', 'pesanpro-woo' )
        );
        printf(
            '<br /><textarea name="%1$s" class="large-text" rows="3" cols="80">%2$s</textarea>',
            esc_attr( self::OPTION . '[messages][' . $event . ']' ),
            esc_textarea( $value )
        );
    }

    public static function render_page() {
        if ( ! current_user_can( 'manage_options' ) ) return;
        $counts = PesanPro_Woo_Queue::counts();
        echo '<div class="wrap"><h1>' . esc_html__( 'PesanPro for WooCommerce', 'pesanpro-woo' ) . '</h1>';
        settings_errors();
        echo '<p>' . esc_html( sprintf( __( 'Queue: %1$d pending, %2$d retrying, %3$d failed, %4$d sent.', 'pesanpro-woo' ), $counts['pending'] ?? 0, $counts['retry'] ?? 0, $counts['failed'] ?? 0, $counts['sent'] ?? 0 ) ) . '</p>';
        $retried = filter_input( INPUT_GET, 'pesanpro_retried', FILTER_VALIDATE_INT );
        if ( null !== $retried && false !== $retried ) {
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html( sprintf( __( '%d notifikasi dikembalikan ke antrean. WP-Cron akan mengirimnya dalam beberapa menit.', 'pesanpro-woo' ), absint( $retried ) ) ) . '</p></div>';
        }
        $failures = PesanPro_Woo_Queue::failure_codes();
        if ( $failures ) {
            echo '<div class="notice notice-error inline"><p><strong>' . esc_html__( 'Alasan pengiriman gagal', 'pesanpro-woo' ) . '</strong></p><ul style="margin:0 0 8px 1.4em;list-style:disc">';
            foreach ( $failures as $code => $total ) {
                echo '<li>' . esc_html( sprintf( '%1$d× %2$s', $total, self::describe_failure_code( $code ) ) ) . '</li>';
            }
            echo '</ul>';
            echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
            wp_nonce_field( 'pesanpro_woo_retry_failed' );
            echo '<input type="hidden" name="action" value="pesanpro_woo_retry_failed" />';
            submit_button( __( 'Coba kirim ulang yang gagal', 'pesanpro-woo' ), 'secondary', 'submit', false );
            echo '</form><p class="description">' . esc_html__( 'Perbaiki dulu penyebabnya, lalu kirim ulang. Baris yang gagal tidak dicoba lagi secara otomatis.', 'pesanpro-woo' ) . '</p></div>';
        }
        echo '<form action="options.php" method="post">';
        settings_fields( 'pesanpro_woo' );
        do_settings_sections( 'pesanpro-woo' );
        submit_button();
        echo '</form></div>';
    }
}
