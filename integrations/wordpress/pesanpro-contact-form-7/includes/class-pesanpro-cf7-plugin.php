<?php

defined( 'ABSPATH' ) || exit;

final class PesanPro_CF7_Plugin {
    public static function init() {
        PesanPro_CF7_Settings::init();
        add_action( PesanPro_CF7_Queue::CRON_HOOK, array( 'PesanPro_CF7_Queue', 'process' ) );
        add_action( 'wpcf7_mail_sent', array( __CLASS__, 'on_mail_sent' ), 10, 1 );
        add_action( 'admin_notices', array( __CLASS__, 'dependency_notice' ) );
    }

    public static function dependency_notice() {
        if ( class_exists( 'WPCF7_Submission' ) || ! current_user_can( 'activate_plugins' ) ) return;
        echo '<div class="notice notice-warning"><p>' . esc_html__( 'PesanPro for Contact Form 7 requires the Contact Form 7 plugin to be active.', 'pesanpro-cf7' ) . '</p></div>';
    }

    public static function on_mail_sent( $contact_form ) {
        if ( ! class_exists( 'WPCF7_Submission' ) || ! is_object( $contact_form ) ) return;
        $settings = PesanPro_CF7_Settings::get();
        $form_id = method_exists( $contact_form, 'id' ) ? absint( $contact_form->id() ) : 0;
        if ( ! empty( $settings['form_id'] ) && (int) $settings['form_id'] !== $form_id ) return;
        $submission = WPCF7_Submission::get_instance();
        if ( ! $submission ) return;
        $posted = $submission->get_posted_data();
        if ( ! is_array( $posted ) ) return;

        $fields = array();
        foreach ( array_slice( $posted, 0, 100, true ) as $key => $value ) {
            $key = sanitize_key( $key );
            if ( '' === $key || 0 === strpos( $key, '_' ) ) continue;
            $values = array_map( 'sanitize_textarea_field', array_map( 'strval', (array) $value ) );
            $fields[ $key ] = array_map( array( __CLASS__, 'limit_field_value' ), $values );
            if ( 1 === count( $fields[ $key ] ) ) $fields[ $key ] = reset( $fields[ $key ] );
        }
        $recipient = ! empty( $settings['static_recipient'] ) ? $settings['static_recipient'] : ( $fields[ $settings['recipient_field'] ] ?? '' );
        if ( is_array( $recipient ) ) $recipient = reset( $recipient );
        $posted_data_hash = method_exists( $submission, 'get_posted_data_hash' ) ? (string) $submission->get_posted_data_hash() : '';
        $timestamp = method_exists( $submission, 'get_meta' ) ? (string) $submission->get_meta( 'timestamp' ) : '';
        $submission_id = $posted_data_hash ?: hash( 'sha256', $form_id . '|' . $timestamp . '|' . wp_json_encode( $fields ) );
        $payload = array(
            'submissionId' => $submission_id,
            'formId'       => (string) $form_id,
            'formTitle'    => method_exists( $contact_form, 'title' ) ? sanitize_text_field( $contact_form->title() ) : '',
            'submittedAt'  => gmdate( 'c' ),
            'site'         => home_url( '/' ),
            'recipient'    => preg_replace( '/[^0-9+]/', '', (string) $recipient ),
            'fields'       => $fields,
        );
        PesanPro_CF7_Queue::enqueue( $payload );
    }

    public static function limit_field_value( $value ) {
        return function_exists( 'mb_substr' ) ? mb_substr( $value, 0, 2000 ) : substr( $value, 0, 2000 );
    }
}
