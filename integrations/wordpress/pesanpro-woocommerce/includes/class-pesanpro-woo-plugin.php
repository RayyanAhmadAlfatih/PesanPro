<?php

defined( 'ABSPATH' ) || exit;

final class PesanPro_Woo_Plugin {
    const FALLBACK_TEMPLATE = "Pesanan #{{orderId}}: {{event}}.\nTotal: {{orderTotal}}.";

    public static function init() {
        PesanPro_Woo_Settings::init();
        add_action( PesanPro_Woo_Queue::CRON_HOOK, array( 'PesanPro_Woo_Queue', 'process' ) );
        add_action( 'woocommerce_new_order', array( __CLASS__, 'on_new_order' ), 10, 2 );
        add_action( 'woocommerce_order_status_changed', array( __CLASS__, 'on_status_changed' ), 10, 4 );
        add_action( 'admin_notices', array( __CLASS__, 'dependency_notice' ) );
    }

    public static function dependency_notice() {
        if ( class_exists( 'WooCommerce' ) || ! current_user_can( 'activate_plugins' ) ) return;
        echo '<div class="notice notice-warning"><p>' . esc_html__( 'PesanPro for WooCommerce requires WooCommerce to be active.', 'pesanpro-woo' ) . '</p></div>';
    }

    public static function on_new_order( $order_id, $order = null ) {
        self::enqueue_event( self::order( $order_id, $order ), 'order.created' );
    }

    public static function on_status_changed( $order_id, $from, $to, $order = null ) {
        if ( $from === $to || 'checkout-draft' === $to ) return;
        $events = array(
            'processing' => 'order.paid',
            'completed'  => 'order.completed',
            'cancelled'  => 'order.cancelled',
            'refunded'   => 'order.refunded',
        );
        $event = isset( $events[ $to ] ) ? $events[ $to ] : 'order.updated';
        self::enqueue_event( self::order( $order_id, $order ), $event );
    }

    private static function order( $order_id, $order ) {
        if ( is_object( $order ) && method_exists( $order, 'get_id' ) ) return $order;
        return function_exists( 'wc_get_order' ) ? wc_get_order( $order_id ) : null;
    }

    public static function enqueue_event( $order, $event ) {
        if ( ! PesanPro_Woo_Settings::enabled( $event ) ) return;
        if ( ! is_object( $order ) || ! method_exists( $order, 'get_id' ) ) return;
        $settings = PesanPro_Woo_Settings::get();
        $phone = ! empty( $settings['static_recipient'] ) ? $settings['static_recipient'] : ( method_exists( $order, 'get_billing_phone' ) ? $order->get_billing_phone() : '' );
        $phone = preg_replace( '/[^0-9+]/', '', (string) $phone );
        $values = PesanPro_Woo_Message::order_values( $order, $event );
        $message = PesanPro_Woo_Message::render( PesanPro_Woo_Settings::message_for( $event ), $values );
        if ( '' === $message ) $message = PesanPro_Woo_Message::render( self::FALLBACK_TEMPLATE, $values );
        $payload = array(
            'orderId'   => (string) $order->get_id(),
            'event'     => $event,
            'recipient' => $phone,
            'message'   => $message,
        );
        if ( '' === $phone ) {
            PesanPro_Woo_Queue::enqueue_rejected( $payload, 'recipient_missing' );
            return;
        }
        PesanPro_Woo_Queue::enqueue( $payload );
    }
}
