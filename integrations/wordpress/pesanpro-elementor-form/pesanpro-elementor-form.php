<?php
/**
 * Plugin Name:       PesanPro for Elementor Form
 * Description:       Queues Elementor Pro form submissions for durable WhatsApp delivery through PesanPro, with a message template for each form.
 * Version:           1.0.0
 * Requires at least: 6.7
 * Requires PHP:      7.4
 * Author:            PesanPro
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       pesanpro-elementor
 */

defined( 'ABSPATH' ) || exit;

define( 'PESANPRO_ELEMENTOR_VERSION', '1.0.0' );
define( 'PESANPRO_ELEMENTOR_FILE', __FILE__ );
define( 'PESANPRO_ELEMENTOR_DIR', plugin_dir_path( __FILE__ ) );

require_once PESANPRO_ELEMENTOR_DIR . 'includes/class-pesanpro-elementor-message.php';
require_once PESANPRO_ELEMENTOR_DIR . 'includes/class-pesanpro-elementor-settings.php';
require_once PESANPRO_ELEMENTOR_DIR . 'includes/class-pesanpro-elementor-queue.php';
require_once PESANPRO_ELEMENTOR_DIR . 'includes/class-pesanpro-elementor-plugin.php';

register_activation_hook( PESANPRO_ELEMENTOR_FILE, array( 'PesanPro_Elementor_Queue', 'activate' ) );
add_action( 'plugins_loaded', array( 'PesanPro_Elementor_Plugin', 'init' ) );
