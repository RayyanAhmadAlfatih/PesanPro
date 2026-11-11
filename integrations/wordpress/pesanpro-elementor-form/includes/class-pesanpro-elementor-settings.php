<?php

defined( 'ABSPATH' ) || exit;

final class PesanPro_Elementor_Settings {
    const OPTION = 'pesanpro_elementor_settings';
    const TOKEN_OPTION = 'pesanpro_elementor_token';
    const FORM_NAMES_OPTION = 'pesanpro_elementor_form_names';

    public static function defaults() {
        return array(
            'base_url'         => '',
            'static_recipient' => '',
            'recipient_field'  => 'whatsapp',
            'default_message'  => '',
            'form_scope'       => 'listed',
            'forms'            => array(),
            'retention_days'   => 7,
        );
    }

    public static function get() {
        return wp_parse_args( get_option( self::OPTION, array() ), self::defaults() );
    }

    public static function token() {
        if ( defined( 'PESANPRO_ELEMENTOR_TOKEN' ) && is_string( PESANPRO_ELEMENTOR_TOKEN ) ) {
            return trim( PESANPRO_ELEMENTOR_TOKEN );
        }
        return trim( (string) get_option( self::TOKEN_OPTION, '' ) );
    }

    public static function row_for( $form_name ) {
        $name = function_exists( 'mb_strtolower' ) ? mb_strtolower( trim( (string) $form_name ) ) : strtolower( trim( (string) $form_name ) );
        $settings = self::get();
        foreach ( (array) $settings['forms'] as $row ) {
            if ( ! is_array( $row ) || empty( $row['name'] ) ) continue;
            $candidate = function_exists( 'mb_strtolower' ) ? mb_strtolower( trim( (string) $row['name'] ) ) : strtolower( trim( (string) $row['name'] ) );
            if ( $candidate === $name ) return $row;
        }
        return null;
    }

    public static function is_form_enabled( $form_name ) {
        $settings = self::get();
        if ( 'all' === $settings['form_scope'] ) return true;
        return null !== self::row_for( $form_name );
    }

    public static function known_form_names() {
        $names = get_option( self::FORM_NAMES_OPTION, array() );
        return is_array( $names ) ? array_values( array_filter( array_map( 'strval', $names ) ) ) : array();
    }

    public static function remember_form_name( $name ) {
        $name = trim( sanitize_text_field( (string) $name ) );
        if ( '' === $name ) return;
        $names = self::known_form_names();
        foreach ( $names as $known ) {
            if ( 0 === strcasecmp( $known, $name ) ) return;
        }
        $names[] = $name;
        if ( count( $names ) > 50 ) $names = array_slice( $names, -50 );
        update_option( self::FORM_NAMES_OPTION, $names, false );
    }

    public static function init() {
        add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ) );
        add_action( 'admin_init', array( __CLASS__, 'register' ) );
        add_action( 'admin_post_pesanpro_elementor_retry_failed', array( __CLASS__, 'handle_retry_failed' ) );
    }

    public static function handle_retry_failed() {
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( esc_html__( 'You are not allowed to retry PesanPro deliveries.', 'pesanpro-elementor' ) );
        }
        check_admin_referer( 'pesanpro_elementor_retry_failed' );
        $retried = PesanPro_Elementor_Queue::retry_failed();
        wp_safe_redirect( add_query_arg(
            array( 'page' => 'pesanpro-elementor', 'pesanpro_retried' => $retried ),
            admin_url( 'options-general.php' )
        ) );
        exit;
    }

    public static function describe_failure_code( $code ) {
        $map = array(
            'http_401'              => __( 'token ditolak (401). Pastikan token bertipe WordPress (form kustom), bukan Contact Form 7 atau WooCommerce.', 'pesanpro-elementor' ),
            'http_403'              => __( 'ditolak (403). Paket tidak mencakup integrasi ini atau token tidak punya izin.', 'pesanpro-elementor' ),
            'http_404'              => __( 'endpoint tidak ditemukan (404). Periksa PesanPro base URL.', 'pesanpro-elementor' ),
            'http_422'              => __( 'data ditolak (422). Nomor tujuan tidak valid atau pesan kosong.', 'pesanpro-elementor' ),
            'recipient_missing'     => __( 'nomor tujuan kosong. Periksa Field penerima pada baris form ini.', 'pesanpro-elementor' ),
            'network_error'         => __( 'server PesanPro tidak bisa dihubungi dari situs ini.', 'pesanpro-elementor' ),
            'configuration_missing' => __( 'base URL atau token belum terisi saat pengiriman dijalankan.', 'pesanpro-elementor' ),
        );
        return isset( $map[ $code ] ) ? $map[ $code ] : $code;
    }

    public static function admin_menu() {
        add_options_page(
            __( 'PesanPro Elementor Form', 'pesanpro-elementor' ),
            __( 'PesanPro Elementor', 'pesanpro-elementor' ),
            'manage_options',
            'pesanpro-elementor',
            array( __CLASS__, 'render_page' )
        );
    }

    public static function register() {
        register_setting( 'pesanpro_elementor', self::OPTION, array( 'type' => 'array', 'sanitize_callback' => array( __CLASS__, 'sanitize_settings' ), 'default' => self::defaults() ) );
        register_setting( 'pesanpro_elementor', self::TOKEN_OPTION, array( 'type' => 'string', 'sanitize_callback' => array( __CLASS__, 'sanitize_token' ), 'default' => '' ) );
        add_settings_section( 'pesanpro_elementor_main', __( 'Gateway connection', 'pesanpro-elementor' ), array( __CLASS__, 'render_section' ), 'pesanpro-elementor' );
        foreach ( array(
            'base_url'         => __( 'PesanPro base URL', 'pesanpro-elementor' ),
            'token'            => __( 'Integration token', 'pesanpro-elementor' ),
            'static_recipient' => __( 'Static recipient', 'pesanpro-elementor' ),
            'recipient_field'  => __( 'Default recipient field ID', 'pesanpro-elementor' ),
            'form_scope'       => __( 'Form yang diproses', 'pesanpro-elementor' ),
            'default_message'  => __( 'Pesan bawaan', 'pesanpro-elementor' ),
            'retention_days'   => __( 'Queue retention days', 'pesanpro-elementor' ),
        ) as $field => $label ) {
            add_settings_field( 'pesanpro_elementor_' . $field, $label, array( __CLASS__, 'render_field' ), 'pesanpro-elementor', 'pesanpro_elementor_main', array( 'field' => $field ) );
        }
        add_settings_section( 'pesanpro_elementor_forms', __( 'Pesan per form Elementor', 'pesanpro-elementor' ), array( __CLASS__, 'render_forms_section' ), 'pesanpro-elementor' );
        add_settings_field( 'pesanpro_elementor_forms', __( 'Daftar form', 'pesanpro-elementor' ), array( __CLASS__, 'render_forms_field' ), 'pesanpro-elementor', 'pesanpro_elementor_forms' );
    }

    public static function sanitize_settings( $input ) {
        $old = self::get();
        $input = is_array( $input ) ? $input : array();
        $base_url = isset( $input['base_url'] ) ? untrailingslashit( esc_url_raw( wp_unslash( $input['base_url'] ) ) ) : '';
        $host = wp_parse_url( $base_url, PHP_URL_HOST );
        $scheme = wp_parse_url( $base_url, PHP_URL_SCHEME );
        $local_debug = defined( 'WP_DEBUG' ) && WP_DEBUG && in_array( $host, array( 'localhost', '127.0.0.1', '::1' ), true );
        if ( $base_url && 'https' !== $scheme && ! $local_debug ) {
            add_settings_error( self::OPTION, 'invalid_https', __( 'PesanPro base URL must use HTTPS.', 'pesanpro-elementor' ) );
            $base_url = $old['base_url'];
        }
        $forms = array();
        $seen = array();
        if ( isset( $input['forms'] ) && is_array( $input['forms'] ) ) {
            foreach ( $input['forms'] as $row ) {
                if ( ! is_array( $row ) || count( $forms ) >= 50 ) continue;
                $name = isset( $row['name'] ) ? trim( sanitize_text_field( wp_unslash( $row['name'] ) ) ) : '';
                if ( '' === $name ) continue;
                $key = function_exists( 'mb_strtolower' ) ? mb_strtolower( $name ) : strtolower( $name );
                if ( isset( $seen[ $key ] ) ) continue;
                $seen[ $key ] = true;
                $forms[] = array(
                    'name'            => $name,
                    'recipient_field' => isset( $row['recipient_field'] ) ? sanitize_key( wp_unslash( $row['recipient_field'] ) ) : '',
                    'message'         => isset( $row['message'] ) ? PesanPro_Elementor_Message::sanitize_template( wp_unslash( $row['message'] ) ) : '',
                );
            }
        }
        $scope = isset( $input['form_scope'] ) && 'all' === $input['form_scope'] ? 'all' : 'listed';
        return array(
            'base_url'         => $base_url,
            'static_recipient' => isset( $input['static_recipient'] ) ? preg_replace( '/[^0-9+]/', '', wp_unslash( $input['static_recipient'] ) ) : '',
            'recipient_field'  => isset( $input['recipient_field'] ) ? sanitize_key( wp_unslash( $input['recipient_field'] ) ) : 'whatsapp',
            'default_message'  => isset( $input['default_message'] ) ? PesanPro_Elementor_Message::sanitize_template( wp_unslash( $input['default_message'] ) ) : '',
            'form_scope'       => $scope,
            'forms'            => $forms,
            'retention_days'   => isset( $input['retention_days'] ) ? min( 90, max( 1, absint( $input['retention_days'] ) ) ) : 7,
        );
    }

    public static function sanitize_token( $value ) {
        if ( defined( 'PESANPRO_ELEMENTOR_TOKEN' ) ) {
            return (string) get_option( self::TOKEN_OPTION, '' );
        }
        $token = trim( sanitize_text_field( wp_unslash( $value ) ) );
        if ( '' === $token ) {
            return (string) get_option( self::TOKEN_OPTION, '' );
        }
        if ( ! preg_match( '/^ppint_[A-Za-z0-9_-]{40,100}$/', $token ) ) {
            add_settings_error( self::TOKEN_OPTION, 'invalid_token', __( 'Integration token format is invalid.', 'pesanpro-elementor' ) );
            return (string) get_option( self::TOKEN_OPTION, '' );
        }
        return $token;
    }

    public static function render_section() {
        echo '<p>' . esc_html__( 'Kiriman Elementor disimpan di situs ini lalu dikirim lewat antrean. Daftar placeholder ada di panduan integrasi.', 'pesanpro-elementor' ) . '</p>';
    }

    public static function render_forms_section() {
        echo '<p>' . esc_html__( 'Satu baris untuk satu form Elementor. Nama form harus sama dengan kolom Form Name di widget. Placeholder: {{field:nama}}, {{all_fields}}, {{formTitle}}, {{formId}}, {{submissionId}}, {{submittedAt}}, {{site}}.', 'pesanpro-elementor' ) . '</p>';
        $names = self::known_form_names();
        if ( $names ) {
            echo '<p class="description">' . esc_html__( 'Nama form yang pernah terkirim:', 'pesanpro-elementor' );
            foreach ( $names as $name ) {
                echo ' <code>' . esc_html( $name ) . '</code>';
            }
            echo '</p>';
        }
    }

    public static function render_field( $args ) {
        $settings = self::get();
        $field = sanitize_key( $args['field'] );
        if ( 'token' === $field ) {
            $configured = '' !== self::token();
            printf( '<input class="regular-text" type="password" name="%1$s" value="" autocomplete="new-password" placeholder="%2$s" />', esc_attr( self::TOKEN_OPTION ), esc_attr( $configured ? __( 'Configured; leave blank to keep', 'pesanpro-elementor' ) : 'ppint_...' ) );
            if ( defined( 'PESANPRO_ELEMENTOR_TOKEN' ) ) echo '<p class="description">' . esc_html__( 'Token is supplied by wp-config.php and cannot be changed here.', 'pesanpro-elementor' ) . '</p>';
            return;
        }
        $name = self::OPTION . '[' . $field . ']';
        if ( 'form_scope' === $field ) {
            printf( '<select name="%1$s">', esc_attr( $name ) );
            printf( '<option value="listed" %1$s>%2$s</option>', selected( $settings['form_scope'], 'listed', false ), esc_html__( 'Hanya form yang ada di daftar', 'pesanpro-elementor' ) );
            printf( '<option value="all" %1$s>%2$s</option>', selected( $settings['form_scope'], 'all', false ), esc_html__( 'Semua form Elementor', 'pesanpro-elementor' ) );
            echo '</select><p class="description">' . esc_html__( 'Pilihan bawaan hanya memproses form yang Anda daftarkan, supaya form login atau pencarian tidak ikut mengirim WhatsApp.', 'pesanpro-elementor' ) . '</p>';
            return;
        }
        if ( 'retention_days' === $field ) {
            printf( '<input type="number" min="1" max="90" name="%1$s" value="%2$d" />', esc_attr( $name ), (int) $settings[ $field ] );
            return;
        }
        if ( 'default_message' === $field ) {
            printf( '<textarea name="%1$s" class="large-text" rows="3" cols="80">%2$s</textarea>', esc_attr( $name ), esc_textarea( (string) $settings[ $field ] ) );
            echo '<p class="description">' . esc_html__( 'Dipakai kalau baris form tidak punya pesan. Kosongkan untuk memakai daftar field bawaan.', 'pesanpro-elementor' ) . '</p>';
            return;
        }
        printf( '<input class="regular-text" type="text" name="%1$s" value="%2$s" />', esc_attr( $name ), esc_attr( $settings[ $field ] ) );
        if ( 'recipient_field' === $field ) {
            echo '<p class="description">' . esc_html__( 'ID field nomor WhatsApp di Elementor. Baris form bisa menimpa nilai ini.', 'pesanpro-elementor' ) . '</p>';
        }
    }

    public static function render_forms_field() {
        $settings = self::get();
        $rows = is_array( $settings['forms'] ) ? array_values( $settings['forms'] ) : array();
        for ( $i = 0; $i < 2; $i++ ) {
            $rows[] = array( 'name' => '', 'recipient_field' => '', 'message' => '' );
        }
        echo '<table class="widefat striped"><thead><tr>';
        echo '<th>' . esc_html__( 'Nama form', 'pesanpro-elementor' ) . '</th>';
        echo '<th>' . esc_html__( 'Field penerima', 'pesanpro-elementor' ) . '</th>';
        echo '<th>' . esc_html__( 'Isi pesan', 'pesanpro-elementor' ) . '</th>';
        echo '</tr></thead><tbody>';
        foreach ( $rows as $index => $row ) {
            $prefix = self::OPTION . '[forms][' . $index . ']';
            echo '<tr>';
            printf( '<td><input type="text" class="regular-text" name="%1$s" value="%2$s" placeholder="Hubungi Kami" /></td>', esc_attr( $prefix . '[name]' ), esc_attr( isset( $row['name'] ) ? (string) $row['name'] : '' ) );
            printf( '<td><input type="text" class="regular-text" name="%1$s" value="%2$s" placeholder="whatsapp" /></td>', esc_attr( $prefix . '[recipient_field]' ), esc_attr( isset( $row['recipient_field'] ) ? (string) $row['recipient_field'] : '' ) );
            printf( '<td><textarea name="%1$s" rows="3" class="large-text">%2$s</textarea></td>', esc_attr( $prefix . '[message]' ), esc_textarea( isset( $row['message'] ) ? (string) $row['message'] : '' ) );
            echo '</tr>';
        }
        echo '</tbody></table>';
        echo '<p class="description">' . esc_html__( 'Kosongkan Nama form pada baris yang tidak dipakai. Simpan pengaturan setelah menambah form.', 'pesanpro-elementor' ) . '</p>';
    }

    public static function render_page() {
        if ( ! current_user_can( 'manage_options' ) ) return;
        $counts = PesanPro_Elementor_Queue::counts();
        echo '<div class="wrap"><h1>' . esc_html__( 'PesanPro for Elementor Form', 'pesanpro-elementor' ) . '</h1>';
        settings_errors();
        echo '<p>' . esc_html( sprintf( __( 'Queue: %1$d pending, %2$d retrying, %3$d failed, %4$d sent.', 'pesanpro-elementor' ), $counts['pending'] ?? 0, $counts['retry'] ?? 0, $counts['failed'] ?? 0, $counts['sent'] ?? 0 ) ) . '</p>';
        $retried = filter_input( INPUT_GET, 'pesanpro_retried', FILTER_VALIDATE_INT );
        if ( null !== $retried && false !== $retried ) {
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html( sprintf( __( '%d kiriman dikembalikan ke antrean. WP-Cron akan mengirimnya dalam beberapa menit.', 'pesanpro-elementor' ), absint( $retried ) ) ) . '</p></div>';
        }
        $failures = PesanPro_Elementor_Queue::failure_codes();
        if ( $failures ) {
            echo '<div class="notice notice-error inline"><p><strong>' . esc_html__( 'Alasan pengiriman gagal', 'pesanpro-elementor' ) . '</strong></p><ul style="margin:0 0 8px 1.4em;list-style:disc">';
            foreach ( $failures as $code => $total ) {
                echo '<li>' . esc_html( sprintf( '%1$d× %2$s', $total, self::describe_failure_code( $code ) ) ) . '</li>';
            }
            echo '</ul>';
            echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
            wp_nonce_field( 'pesanpro_elementor_retry_failed' );
            echo '<input type="hidden" name="action" value="pesanpro_elementor_retry_failed" />';
            submit_button( __( 'Coba kirim ulang yang gagal', 'pesanpro-elementor' ), 'secondary', 'submit', false );
            echo '</form></div>';
        }
        echo '<form action="options.php" method="post">';
        settings_fields( 'pesanpro_elementor' );
        do_settings_sections( 'pesanpro-elementor' );
        submit_button();
        echo '</form></div>';
    }
}
