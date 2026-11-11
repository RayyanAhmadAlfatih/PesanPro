<?php

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

if ( defined( 'PESANPRO_WOO_REMOVE_DATA' ) && true === PESANPRO_WOO_REMOVE_DATA ) {
    global $wpdb;
    delete_option( 'pesanpro_woo_settings' );
    delete_option( 'pesanpro_woo_token' );
    $wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}pesanpro_woo_queue" );
}
