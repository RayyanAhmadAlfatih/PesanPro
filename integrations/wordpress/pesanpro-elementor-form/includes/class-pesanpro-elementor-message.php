<?php

defined( 'ABSPATH' ) || exit;

final class PesanPro_Elementor_Message {
    const MAX_BYTES = 4096;

    public static function sanitize_template( $value ) {
        if ( is_array( $value ) || is_object( $value ) ) return '';
        $value = str_replace( array( "\r\n", "\r" ), "\n", (string) $value );
        return self::limit( sanitize_textarea_field( $value ) );
    }

    public static function normalize_fields( $raw ) {
        $fields = array();
        foreach ( (array) $raw as $field ) {
            if ( ! is_array( $field ) ) continue;
            $id = isset( $field['id'] ) ? sanitize_key( $field['id'] ) : '';
            if ( '' === $id || 0 === strpos( $id, '_' ) ) continue;
            $value = isset( $field['value'] ) ? $field['value'] : '';
            if ( is_array( $value ) ) $value = implode( ', ', array_map( 'strval', $value ) );
            $fields[ $id ] = self::limit_field_value( sanitize_textarea_field( (string) $value ) );
            if ( count( $fields ) >= 100 ) break;
        }
        return $fields;
    }

    public static function limit_field_value( $value ) {
        return function_exists( 'mb_substr' ) ? mb_substr( $value, 0, 2000 ) : substr( $value, 0, 2000 );
    }

    public static function default_message( $form_name, $fields ) {
        $lines = array( 'Form ' . ( '' !== trim( (string) $form_name ) ? (string) $form_name : 'Elementor' ) );
        foreach ( (array) $fields as $name => $value ) {
            $lines[] = $name . ': ' . ( '' === (string) $value ? '-' : (string) $value );
        }
        return trim( self::limit( implode( "\n", $lines ) ) );
    }

    /**
     * Render in WordPress, not on the gateway: the token-level messageTemplate
     * only wraps {{message}}, so a literal {{field:nama}} would reach WhatsApp
     * unchanged if the plugin sent the raw template.
     */
    public static function render( $template, $fields, $context = array() ) {
        $template = (string) $template;
        if ( '' === trim( $template ) ) return '';
        $values = array();
        foreach ( (array) $fields as $name => $value ) {
            $values[ (string) $name ] = is_scalar( $value ) ? (string) $value : '';
        }
        $lines = array();
        foreach ( $values as $name => $value ) {
            $lines[] = $name . ': ' . ( '' === $value ? '-' : $value );
        }
        $replacements = array( '{{all_fields}}' => implode( "\n", $lines ) );
        foreach ( (array) $context as $key => $value ) {
            $replacements[ '{{' . $key . '}}' ] = is_scalar( $value ) ? (string) $value : '';
        }
        $message = strtr( $template, $replacements );
        $message = (string) preg_replace_callback(
            '/\{\{field:([A-Za-z0-9_.-]+)\}\}/',
            static function ( $match ) use ( $values ) {
                return isset( $values[ $match[1] ] ) ? $values[ $match[1] ] : '';
            },
            $message
        );
        return trim( self::limit( $message ) );
    }

    public static function limit( $value ) {
        // A 4096-byte cap keeps the rendered text under the gateway's 4096
        // character limit even when it contains multi-byte characters.
        if ( function_exists( 'mb_strcut' ) ) return mb_strcut( $value, 0, self::MAX_BYTES, 'UTF-8' );
        return substr( $value, 0, self::MAX_BYTES );
    }
}
