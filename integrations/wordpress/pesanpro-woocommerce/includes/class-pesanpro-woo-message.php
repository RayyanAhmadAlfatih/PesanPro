<?php

defined( 'ABSPATH' ) || exit;

final class PesanPro_Woo_Message {
    const MAX_BYTES = 4096;

    public static function events() {
        return array(
            'order.created'   => array(
                'label'   => __( 'Pesanan dibuat', 'pesanpro-woo' ),
                'default' => "Halo {{customerName}}, pesanan #{{orderId}} sudah kami terima.\nTotal: {{orderTotal}}.",
            ),
            'order.updated'   => array(
                'label'   => __( 'Status berubah', 'pesanpro-woo' ),
                'default' => "Halo {{customerName}}, status pesanan #{{orderId}} sekarang {{status}}.",
            ),
            'order.paid'      => array(
                'label'   => __( 'Pesanan dibayar', 'pesanpro-woo' ),
                'default' => "Halo {{customerName}}, pembayaran pesanan #{{orderId}} sebesar {{orderTotal}} sudah kami terima.",
            ),
            'order.completed' => array(
                'label'   => __( 'Pesanan selesai', 'pesanpro-woo' ),
                'default' => "Halo {{customerName}}, pesanan #{{orderId}} sudah selesai. Terima kasih sudah berbelanja di {{site}}.",
            ),
            'order.cancelled' => array(
                'label'   => __( 'Pesanan dibatalkan', 'pesanpro-woo' ),
                'default' => "Halo {{customerName}}, pesanan #{{orderId}} dibatalkan. Hubungi kami kalau ini tidak benar.",
            ),
            'order.refunded'  => array(
                'label'   => __( 'Pesanan dikembalikan', 'pesanpro-woo' ),
                'default' => "Halo {{customerName}}, dana pesanan #{{orderId}} sudah dikembalikan.",
            ),
        );
    }

    public static function event_keys() {
        return array_keys( self::events() );
    }

    public static function default_template( $event ) {
        $events = self::events();
        return isset( $events[ $event ] ) ? $events[ $event ]['default'] : '';
    }

    public static function sanitize_template( $value ) {
        if ( is_array( $value ) || is_object( $value ) ) return '';
        $value = str_replace( array( "\r\n", "\r" ), "\n", (string) $value );
        return self::limit( sanitize_textarea_field( $value ) );
    }

    public static function order_values( $order, $event ) {
        if ( ! is_object( $order ) || ! method_exists( $order, 'get_id' ) ) return array();
        $items = array();
        if ( method_exists( $order, 'get_items' ) ) {
            foreach ( (array) $order->get_items( 'line_item' ) as $item ) {
                $name = is_object( $item ) && method_exists( $item, 'get_name' ) ? $item->get_name() : '';
                $qty = is_object( $item ) && method_exists( $item, 'get_quantity' ) ? $item->get_quantity() : 1;
                if ( '' !== $name ) $items[] = $name . ' x' . (int) $qty;
            }
        }
        $values = array(
            'orderId'           => (string) $order->get_id(),
            'orderNumber'       => method_exists( $order, 'get_order_number' ) ? (string) $order->get_order_number() : (string) $order->get_id(),
            'event'             => (string) $event,
            'status'            => method_exists( $order, 'get_status' ) ? (string) $order->get_status() : '',
            'customerName'      => method_exists( $order, 'get_billing_first_name' ) ? (string) $order->get_billing_first_name() : '',
            'customerLastName'  => method_exists( $order, 'get_billing_last_name' ) ? (string) $order->get_billing_last_name() : '',
            'customerPhone'     => method_exists( $order, 'get_billing_phone' ) ? (string) $order->get_billing_phone() : '',
            'customerEmail'     => method_exists( $order, 'get_billing_email' ) ? (string) $order->get_billing_email() : '',
            'orderTotal'        => method_exists( $order, 'get_total' ) ? (string) $order->get_total() : '',
            'currency'          => method_exists( $order, 'get_currency' ) ? (string) $order->get_currency() : '',
            'paymentMethod'     => method_exists( $order, 'get_payment_method_title' ) ? (string) $order->get_payment_method_title() : '',
            'shippingMethod'    => method_exists( $order, 'get_shipping_method' ) ? (string) $order->get_shipping_method() : '',
            'billingCity'       => method_exists( $order, 'get_billing_city' ) ? (string) $order->get_billing_city() : '',
            'shippingCity'      => method_exists( $order, 'get_shipping_city' ) ? (string) $order->get_shipping_city() : '',
            'items'             => implode( ', ', $items ),
            'site'              => function_exists( 'home_url' ) ? home_url( '/' ) : '',
            'submittedAt'       => gmdate( 'c' ),
        );
        foreach ( $values as $key => $value ) {
            $values[ $key ] = self::limit_field_value( function_exists( 'sanitize_text_field' ) ? sanitize_text_field( $value ) : strip_tags( $value ) );
        }
        return $values;
    }

    public static function limit_field_value( $value ) {
        return function_exists( 'mb_substr' ) ? mb_substr( $value, 0, 2000 ) : substr( $value, 0, 2000 );
    }

    /**
     * Render in WordPress, not on the gateway: the token-level messageTemplate
     * only wraps {{message}}, so a literal {{orderId}} would reach WhatsApp
     * unchanged if the plugin sent the raw template.
     */
    public static function render( $template, $values ) {
        $template = (string) $template;
        if ( '' === trim( $template ) ) return '';
        $lines = array();
        $replacements = array();
        foreach ( (array) $values as $key => $value ) {
            $value = is_scalar( $value ) ? (string) $value : '';
            $lines[] = $key . ': ' . ( '' === $value ? '-' : $value );
            $replacements[ '{{' . $key . '}}' ] = $value;
            $replacements[ '{{field:' . $key . '}}' ] = $value;
        }
        $replacements['{{all_fields}}'] = implode( "\n", $lines );
        $message = strtr( $template, $replacements );
        $message = (string) preg_replace_callback(
            '/\{\{field:([A-Za-z0-9_.-]+)\}\}/',
            static function ( $match ) { return ''; },
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
