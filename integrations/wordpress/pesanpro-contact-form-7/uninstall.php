<?php

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

if ( defined( 'PESANPRO_CF7_REMOVE_DATA' ) && true === PESANPRO_CF7_REMOVE_DATA ) {
    global $wpdb;
    delete_option( 'pesanpro_cf7_settings' );
    delete_option( 'pesanpro_cf7_token' );
    $wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}pesanpro_cf7_queue" );
}
