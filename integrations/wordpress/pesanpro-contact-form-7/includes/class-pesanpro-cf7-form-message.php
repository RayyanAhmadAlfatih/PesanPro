<?php

defined( 'ABSPATH' ) || exit;

final class PesanPro_CF7_Form_Message {
    const PROPERTY = 'pesanpro_message';
    const FIELD = 'pesanpro-cf7-message';
    const PANEL = 'pesanpro-panel';
    const MAX_BYTES = 4096;

    public static function init() {
        add_filter( 'wpcf7_editor_panels', array( __CLASS__, 'editor_panels' ) );
        add_filter( 'wpcf7_pre_construct_contact_form_properties', array( __CLASS__, 'register_property' ) );
        add_action( 'wpcf7_save_contact_form', array( __CLASS__, 'save_template' ), 10, 2 );
    }

    public static function editor_panels( $panels ) {
        $panels = is_array( $panels ) ? $panels : array();
        $panels[ self::PANEL ] = array(
            'title'    => __( 'PesanPro', 'pesanpro-cf7' ),
            'callback' => array( __CLASS__, 'render_panel' ),
        );
        return $panels;
    }

    public static function register_property( $properties ) {
        $properties = is_array( $properties ) ? $properties : array();
        if ( ! isset( $properties[ self::PROPERTY ] ) ) $properties[ self::PROPERTY ] = '';
        return $properties;
    }

    /**
     * CF7 checks the edit capability before this action and passes the unslashed
     * editor data in $data. Its own save() then writes every registered property,
     * so the template needs neither raw superglobals nor a separate meta write.
     */
    public static function save_template( $contact_form, $data ) {
        if ( ! is_array( $data ) || ! array_key_exists( self::FIELD, $data ) ) return;
        if ( ! is_object( $contact_form ) || ! method_exists( $contact_form, 'set_properties' ) ) return;
        $contact_form->set_properties( array( self::PROPERTY => self::sanitize_template( $data[ self::FIELD ] ) ) );
    }

    public static function sanitize_template( $value ) {
        if ( is_array( $value ) || is_object( $value ) ) return '';
        $value = str_replace( array( "\r\n", "\r" ), "\n", (string) $value );
        return self::limit( sanitize_textarea_field( $value ) );
    }

    public static function template( $contact_form ) {
        if ( ! is_object( $contact_form ) ) return '';
        $value = method_exists( $contact_form, 'prop' ) ? $contact_form->prop( self::PROPERTY ) : null;
        if ( ! is_string( $value ) || '' === trim( $value ) ) {
            $form_id = method_exists( $contact_form, 'id' ) ? absint( $contact_form->id() ) : 0;
            $stored = $form_id ? get_post_meta( $form_id, '_' . self::PROPERTY, true ) : '';
            $value = is_string( $stored ) ? $stored : '';
        }
        return trim( $value );
    }

    public static function field_names( $contact_form ) {
        if ( ! is_object( $contact_form ) || ! method_exists( $contact_form, 'scan_form_tags' ) ) return array();
        $names = array();
        foreach ( (array) $contact_form->scan_form_tags() as $tag ) {
            if ( empty( $tag->name ) ) continue;
            $names[ sanitize_key( $tag->name ) ] = true;
        }
        return array_keys( $names );
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
            $values[ (string) $name ] = self::field_value( $value );
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

    private static function field_value( $value ) {
        if ( is_array( $value ) ) return implode( ', ', array_map( 'strval', $value ) );
        return is_scalar( $value ) ? (string) $value : '';
    }

    public static function render_panel( $contact_form ) {
        $template = self::template( $contact_form );
        echo '<h2>' . esc_html__( 'Pesan WhatsApp', 'pesanpro-cf7' ) . '</h2>';
        echo '<fieldset><legend>' . esc_html__( 'Pesan yang dikirim PesanPro setelah form ini berhasil dikirim. Kosongkan untuk memakai pesan bawaan PesanPro.', 'pesanpro-cf7' ) . '</legend>';
        printf(
            '<p><label for="%1$s">%2$s</label><br /><textarea id="%1$s" name="%1$s" class="large-text" rows="10" cols="100">%3$s</textarea></p>',
            esc_attr( self::FIELD ),
            esc_html__( 'Isi pesan', 'pesanpro-cf7' ),
            esc_textarea( $template )
        );
        echo '<p class="description">' . esc_html__( 'Sisipkan isi field dengan {{field:nama}}, atau semua field sekaligus dengan {{all_fields}}. Placeholder lain: {{formTitle}}, {{formId}}, {{submissionId}}, {{submittedAt}}, {{site}}.', 'pesanpro-cf7' ) . '</p>';
        $names = self::field_names( $contact_form );
        if ( $names ) {
            echo '<p class="description">' . esc_html__( 'Field di form ini:', 'pesanpro-cf7' ) . '</p><ul>';
            foreach ( $names as $name ) {
                echo '<li><code>{{field:' . esc_html( $name ) . '}}</code></li>';
            }
            echo '</ul>';
        } else {
            echo '<p class="description">' . esc_html__( 'Belum ada field bernama di form ini. Tambahkan field di tab Form, lalu simpan.', 'pesanpro-cf7' ) . '</p>';
        }
        echo '<p class="description">' . esc_html__( 'Klik Save pada Contact Form 7 untuk menyimpan pesan ini.', 'pesanpro-cf7' ) . '</p>';
        echo '<p class="description">' . esc_html__( 'Kalau token integrasi punya Template pesan (messageTemplate), template itu tetap membungkus pesan dari tab ini lewat {{message}}.', 'pesanpro-cf7' ) . '</p>';
        echo '</fieldset>';
    }
}
