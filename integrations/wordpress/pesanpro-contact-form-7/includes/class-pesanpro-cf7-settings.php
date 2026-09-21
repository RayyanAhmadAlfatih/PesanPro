<?php

defined( 'ABSPATH' ) || exit;

final class PesanPro_CF7_Settings {
    const OPTION = 'pesanpro_cf7_settings';
    const TOKEN_OPTION = 'pesanpro_cf7_token';

    public static function defaults() {
        return array(
            'base_url'        => '',
            'form_id'         => 0,
            'recipient_field' => 'your-phone',
            'static_recipient'=> '',
            'retention_days'  => 7,
        );
    }

    public static function get() {
        return wp_parse_args( get_option( self::OPTION, array() ), self::defaults() );
    }

    public static function token() {
        if ( defined( 'PESANPRO_CF7_TOKEN' ) && is_string( PESANPRO_CF7_TOKEN ) ) {
            return trim( PESANPRO_CF7_TOKEN );
        }
        return trim( (string) get_option( self::TOKEN_OPTION, '' ) );
    }

    public static function init() {
        add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ) );
        add_action( 'admin_init', array( __CLASS__, 'register' ) );
        add_filter( 'site_status_tests', array( __CLASS__, 'site_health_tests' ) );
    }

    public static function admin_menu() {
        add_options_page(
            __( 'PesanPro Contact Form 7', 'pesanpro-cf7' ),
            __( 'PesanPro CF7', 'pesanpro-cf7' ),
            'manage_options',
            'pesanpro-cf7',
            array( __CLASS__, 'render_page' )
        );
    }

    public static function register() {
        register_setting( 'pesanpro_cf7', self::OPTION, array( 'type' => 'array', 'sanitize_callback' => array( __CLASS__, 'sanitize_settings' ), 'default' => self::defaults() ) );
        register_setting( 'pesanpro_cf7', self::TOKEN_OPTION, array( 'type' => 'string', 'sanitize_callback' => array( __CLASS__, 'sanitize_token' ), 'default' => '' ) );
        add_settings_section( 'pesanpro_cf7_main', __( 'Gateway connection', 'pesanpro-cf7' ), array( __CLASS__, 'render_section' ), 'pesanpro-cf7' );
        foreach ( array(
            'base_url'         => __( 'PesanPro base URL', 'pesanpro-cf7' ),
            'token'            => __( 'Integration token', 'pesanpro-cf7' ),
            'form_id'          => __( 'Contact Form 7 form ID', 'pesanpro-cf7' ),
            'recipient_field'  => __( 'Recipient field name', 'pesanpro-cf7' ),
            'static_recipient' => __( 'Static recipient', 'pesanpro-cf7' ),
            'retention_days'   => __( 'Queue retention days', 'pesanpro-cf7' ),
        ) as $field => $label ) {
            add_settings_field( 'pesanpro_cf7_' . $field, $label, array( __CLASS__, 'render_field' ), 'pesanpro-cf7', 'pesanpro_cf7_main', array( 'field' => $field ) );
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
            add_settings_error( self::OPTION, 'invalid_https', __( 'PesanPro base URL must use HTTPS.', 'pesanpro-cf7' ) );
            $base_url = $old['base_url'];
        }
        $recipient_field = isset( $input['recipient_field'] ) ? sanitize_key( wp_unslash( $input['recipient_field'] ) ) : '';
        $static_recipient = isset( $input['static_recipient'] ) ? preg_replace( '/[^0-9+]/', '', wp_unslash( $input['static_recipient'] ) ) : '';
        if ( ! $recipient_field && ! $static_recipient ) {
            add_settings_error( self::OPTION, 'recipient_required', __( 'Configure a recipient field or static recipient.', 'pesanpro-cf7' ) );
            $recipient_field = $old['recipient_field'];
        }
        return array(
            'base_url'         => $base_url,
            'form_id'          => isset( $input['form_id'] ) ? absint( $input['form_id'] ) : 0,
            'recipient_field'  => $recipient_field,
            'static_recipient' => $static_recipient,
            'retention_days'   => isset( $input['retention_days'] ) ? min( 90, max( 1, absint( $input['retention_days'] ) ) ) : 7,
        );
    }

    public static function sanitize_token( $value ) {
        if ( defined( 'PESANPRO_CF7_TOKEN' ) ) {
            return (string) get_option( self::TOKEN_OPTION, '' );
        }
        $token = trim( sanitize_text_field( wp_unslash( $value ) ) );
        if ( '' === $token ) {
            return (string) get_option( self::TOKEN_OPTION, '' );
        }
        if ( ! preg_match( '/^ppint_[A-Za-z0-9_-]{40,100}$/', $token ) ) {
            add_settings_error( self::TOKEN_OPTION, 'invalid_token', __( 'Integration token format is invalid.', 'pesanpro-cf7' ) );
            return (string) get_option( self::TOKEN_OPTION, '' );
        }
        return $token;
    }

    public static function render_section() {
        echo '<p>' . esc_html__( 'Submissions are persisted locally and delivered asynchronously. For best security, define PESANPRO_CF7_TOKEN in wp-config.php.', 'pesanpro-cf7' ) . '</p>';
    }

    public static function render_field( $args ) {
        $settings = self::get();
        $field = sanitize_key( $args['field'] );
        if ( 'token' === $field ) {
            $configured = '' !== self::token();
            printf( '<input class="regular-text" type="password" name="%1$s" value="" autocomplete="new-password" placeholder="%2$s" />', esc_attr( self::TOKEN_OPTION ), esc_attr( $configured ? __( 'Configured; leave blank to keep', 'pesanpro-cf7' ) : 'ppint_...' ) );
            if ( defined( 'PESANPRO_CF7_TOKEN' ) ) echo '<p class="description">' . esc_html__( 'Token is supplied by wp-config.php and cannot be changed here.', 'pesanpro-cf7' ) . '</p>';
            return;
        }
        $name = self::OPTION . '[' . $field . ']';
        if ( in_array( $field, array( 'form_id', 'retention_days' ), true ) ) {
            printf( '<input type="number" min="%1$d" max="%2$d" name="%3$s" value="%4$d" />', 'retention_days' === $field ? 1 : 0, 'retention_days' === $field ? 90 : 999999999, esc_attr( $name ), (int) $settings[ $field ] );
                return;
        }
        printf( '<input class="regular-text" type="text" name="%1$s" value="%2$s" />', esc_attr( $name ), esc_attr( $settings[ $field ] ) );
    }

    public static function render_page() {
        if ( ! current_user_can( 'manage_options' ) ) return;
        $counts = PesanPro_CF7_Queue::counts();
        echo '<div class="wrap"><h1>' . esc_html__( 'PesanPro for Contact Form 7', 'pesanpro-cf7' ) . '</h1>';
        settings_errors();
        echo '<p>' . esc_html( sprintf( __( 'Queue: %1$d pending, %2$d retrying, %3$d failed, %4$d sent.', 'pesanpro-cf7' ), $counts['pending'] ?? 0, $counts['retry'] ?? 0, $counts['failed'] ?? 0, $counts['sent'] ?? 0 ) ) . '</p>';
        echo '<form action="options.php" method="post">';
        settings_fields( 'pesanpro_cf7' );
        do_settings_sections( 'pesanpro-cf7' );
        submit_button();
        echo '</form></div>';
    }

    public static function site_health_tests( $tests ) {
        $tests['direct']['pesanpro_cf7_configuration'] = array( 'label' => __( 'PesanPro Contact Form 7 configuration', 'pesanpro-cf7' ), 'test' => array( __CLASS__, 'site_health_result' ) );
        return $tests;
    }

    public static function site_health_result() {
        $settings = self::get();
        $ready = class_exists( 'WPCF7_Submission' ) && ! empty( $settings['base_url'] ) && '' !== self::token();
        return array(
            'label'       => $ready ? __( 'PesanPro connector is configured', 'pesanpro-cf7' ) : __( 'PesanPro connector needs configuration', 'pesanpro-cf7' ),
            'status'      => $ready ? 'good' : 'recommended',
            'badge'       => array( 'label' => 'PesanPro', 'color' => 'blue' ),
            'description' => '<p>' . esc_html( $ready ? __( 'Contact Form 7 submissions can enter the durable PesanPro queue.', 'pesanpro-cf7' ) : __( 'Check Contact Form 7, HTTPS base URL, integration token, and recipient mapping.', 'pesanpro-cf7' ) ) . '</p>',
            'test'        => 'pesanpro_cf7_configuration',
        );
    }
}
