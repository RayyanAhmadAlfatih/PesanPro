<?php

defined( 'ABSPATH' ) || exit;

final class PesanPro_Elementor_Plugin {
    public static function init() {
        PesanPro_Elementor_Settings::init();
        add_action( PesanPro_Elementor_Queue::CRON_HOOK, array( 'PesanPro_Elementor_Queue', 'process' ) );
        add_action( 'elementor_pro/forms/new_record', array( __CLASS__, 'on_new_record' ), 10, 2 );
        add_action( 'admin_notices', array( __CLASS__, 'dependency_notice' ) );
    }

    public static function dependency_notice() {
        if ( class_exists( 'ElementorPro\Plugin' ) || ! current_user_can( 'activate_plugins' ) ) return;
        echo '<div class="notice notice-warning"><p>' . esc_html__( 'PesanPro for Elementor Form requires Elementor Pro with the Form widget.', 'pesanpro-elementor' ) . '</p></div>';
    }

    public static function on_new_record( $record, $handler = null ) {
        if ( ! is_object( $record ) || ! method_exists( $record, 'get' ) ) return;
        $form_settings = method_exists( $record, 'get_form_settings' ) ? (array) $record->get_form_settings() : array();
        if ( empty( $form_settings ) ) $form_settings = (array) $record->get( 'form_settings' );
        $form_name = isset( $form_settings['form_name'] ) ? sanitize_text_field( (string) $form_settings['form_name'] ) : '';
        $form_id = isset( $form_settings['id'] ) ? (string) $form_settings['id'] : '';
        if ( '' === $form_name ) $form_name = 'Elementor Form';

        PesanPro_Elementor_Settings::remember_form_name( $form_name );
        if ( ! PesanPro_Elementor_Settings::is_form_enabled( $form_name ) ) return;

        $settings = PesanPro_Elementor_Settings::get();
        $row = PesanPro_Elementor_Settings::row_for( $form_name );
        $fields = PesanPro_Elementor_Message::normalize_fields( $record->get( 'fields' ) );
        $recipient_field = is_array( $row ) && ! empty( $row['recipient_field'] ) ? $row['recipient_field'] : $settings['recipient_field'];
        $recipient = ! empty( $settings['static_recipient'] ) ? $settings['static_recipient'] : ( isset( $fields[ $recipient_field ] ) ? $fields[ $recipient_field ] : '' );
        $recipient = preg_replace( '/[^0-9+]/', '', (string) $recipient );

        $site = home_url( '/' );
        $submission_id = hash( 'sha256', $site . '|' . $form_id . '|' . $form_name . '|' . wp_json_encode( $fields ) . '|' . wp_generate_uuid4() );
        $context = array(
            'formTitle'    => $form_name,
            'formId'       => $form_id,
            'submissionId' => $submission_id,
            'submittedAt'  => gmdate( 'c' ),
            'site'         => $site,
        );
        $template = is_array( $row ) && ! empty( $row['message'] ) ? $row['message'] : $settings['default_message'];
        $message = PesanPro_Elementor_Message::render( $template, $fields, $context );
        if ( '' === $message ) $message = PesanPro_Elementor_Message::default_message( $form_name, $fields );

        $payload = array(
            'submissionId' => $submission_id,
            'recipient'    => $recipient,
            'message'      => $message,
            'site'         => $site,
        );
        if ( '' === $recipient ) {
            PesanPro_Elementor_Queue::enqueue_rejected( $payload, 'recipient_missing' );
            return;
        }
        PesanPro_Elementor_Queue::enqueue( $payload );
    }
}
