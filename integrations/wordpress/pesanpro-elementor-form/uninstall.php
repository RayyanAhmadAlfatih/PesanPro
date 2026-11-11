<?php

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

if ( defined( 'PESANPRO_ELEMENTOR_REMOVE_DATA' ) && true === PESANPRO_ELEMENTOR_REMOVE_DATA ) {
    global $wpdb;
    delete_option( 'pesanpro_elementor_settings' );
    delete_option( 'pesanpro_elementor_token' );
    delete_option( 'pesanpro_elementor_form_names' );
    $wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}pesanpro_elementor_queue" );
}
