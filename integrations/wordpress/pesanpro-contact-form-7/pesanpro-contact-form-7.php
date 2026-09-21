<?php
/**
 * Plugin Name:       PesanPro for Contact Form 7
 * Description:       Queues successful Contact Form 7 submissions for durable WhatsApp delivery through PesanPro.
 * Version:           1.0.0
 * Requires at least: 6.7
 * Requires Plugins:  contact-form-7
 * Requires PHP:      7.4
 * Author:            PesanPro
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       pesanpro-cf7
 */

defined( 'ABSPATH' ) || exit;

define( 'PESANPRO_CF7_VERSION', '1.0.0' );
define( 'PESANPRO_CF7_FILE', __FILE__ );
define( 'PESANPRO_CF7_DIR', plugin_dir_path( __FILE__ ) );

require_once PESANPRO_CF7_DIR . 'includes/class-pesanpro-cf7-queue.php';
require_once PESANPRO_CF7_DIR . 'includes/class-pesanpro-cf7-settings.php';
require_once PESANPRO_CF7_DIR . 'includes/class-pesanpro-cf7-plugin.php';

register_activation_hook( PESANPRO_CF7_FILE, array( 'PesanPro_CF7_Queue', 'activate' ) );
add_action( 'plugins_loaded', array( 'PesanPro_CF7_Plugin', 'init' ) );
