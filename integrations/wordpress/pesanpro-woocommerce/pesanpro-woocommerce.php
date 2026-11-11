<?php
/**
 * Plugin Name:       PesanPro for WooCommerce
 * Description:       Queues WooCommerce order events for durable WhatsApp delivery through PesanPro, with a message template for each order status.
 * Version:           1.0.0
 * Requires at least: 6.7
 * Requires Plugins:  woocommerce
 * Requires PHP:      7.4
 * Author:            PesanPro
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       pesanpro-woo
 */

defined( 'ABSPATH' ) || exit;

define( 'PESANPRO_WOO_VERSION', '1.0.0' );
define( 'PESANPRO_WOO_FILE', __FILE__ );
define( 'PESANPRO_WOO_DIR', plugin_dir_path( __FILE__ ) );

require_once PESANPRO_WOO_DIR . 'includes/class-pesanpro-woo-message.php';
require_once PESANPRO_WOO_DIR . 'includes/class-pesanpro-woo-settings.php';
require_once PESANPRO_WOO_DIR . 'includes/class-pesanpro-woo-queue.php';
require_once PESANPRO_WOO_DIR . 'includes/class-pesanpro-woo-plugin.php';

register_activation_hook( PESANPRO_WOO_FILE, array( 'PesanPro_Woo_Queue', 'activate' ) );
add_action( 'plugins_loaded', array( 'PesanPro_Woo_Plugin', 'init' ) );
