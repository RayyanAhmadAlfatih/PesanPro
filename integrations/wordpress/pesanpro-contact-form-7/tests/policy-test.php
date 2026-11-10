<?php

define( 'ABSPATH', __DIR__ );
define( 'HOUR_IN_SECONDS', 3600 );

if ( ! function_exists( '__' ) ) {
    function __( $text, $domain = '' ) { return $text; }
}
if ( ! function_exists( 'sanitize_textarea_field' ) ) {
    function sanitize_textarea_field( $value ) {
        $value = preg_replace( '@<(script|style)[^>]*>.*?</\1>@si', '', (string) $value );
        return trim( strip_tags( $value ) );
    }
}
if ( ! function_exists( 'sanitize_key' ) ) {
    function sanitize_key( $key ) { return strtolower( preg_replace( '/[^a-z0-9_-]/i', '', (string) $key ) ); }
}

class PesanProCF7FakeForm {
    public $properties = array();

    public function set_properties( $properties ) {
        $defaults = $this->properties;
        $properties = array_merge( $defaults, $properties );
        $this->properties = array_intersect_key( $properties, $defaults );
    }

    public function prop( $name ) {
        return isset( $this->properties[ $name ] ) ? $this->properties[ $name ] : null;
    }

    public function scan_form_tags() {
        return array( (object) array( 'name' => 'nama' ), (object) array( 'name' => 'your-phone' ), (object) array( 'name' => '' ) );
    }
}

require dirname( __DIR__ ) . '/includes/class-pesanpro-cf7-queue.php';
require dirname( __DIR__ ) . '/includes/class-pesanpro-cf7-form-message.php';

$failures = array();
foreach ( array( 408, 425, 429, 500, 503 ) as $status ) {
    if ( ! PesanPro_CF7_Queue::is_retryable_status( $status ) ) $failures[] = "Expected retry for {$status}";
}
foreach ( array( 200, 201, 400, 401, 403, 404, 409, 422 ) as $status ) {
    if ( PesanPro_CF7_Queue::is_retryable_status( $status ) ) $failures[] = "Expected terminal status for {$status}";
}
if ( 30 !== PesanPro_CF7_Queue::retry_delay( 1 ) ) $failures[] = 'Attempt 1 delay mismatch';
if ( 60 !== PesanPro_CF7_Queue::retry_delay( 2 ) ) $failures[] = 'Attempt 2 delay mismatch';
if ( 3600 !== PesanPro_CF7_Queue::retry_delay( 20 ) ) $failures[] = 'Retry cap mismatch';

$plugin_source = file_get_contents( dirname( __DIR__ ) . '/includes/class-pesanpro-cf7-plugin.php' );
if ( false === strpos( $plugin_source, "get_posted_data_hash" ) ) $failures[] = 'CF7 submission id must use a stable posted-data hash';
if ( false === strpos( $plugin_source, "\$payload['message']" ) ) $failures[] = 'Custom per-form messages must be sent as the message payload field';
$queue_source = file_get_contents( dirname( __DIR__ ) . '/includes/class-pesanpro-cf7-queue.php' );
if ( false === strpos( $queue_source, "DATE_ADD(locked_at, INTERVAL 5 MINUTE)" ) ) $failures[] = 'Processing rows must be rescheduled at stale-lock time, not immediately';

$panels = PesanPro_CF7_Form_Message::editor_panels( array( 'form-panel' => array( 'title' => 'Form' ) ) );
if ( empty( $panels['pesanpro-panel']['callback'] ) ) $failures[] = 'CF7 editor must expose the PesanPro tab';

$properties = PesanPro_CF7_Form_Message::register_property( array( 'form' => '' ) );
if ( ! array_key_exists( 'pesanpro_message', $properties ) ) $failures[] = 'Per-form message must be a registered CF7 property';

$form = new PesanProCF7FakeForm();
$form->properties = $properties;
PesanPro_CF7_Form_Message::save_template( $form, array( 'pesanpro-cf7-message' => "Halo {{field:nama}}\n<script>alert(1)</script>" ) );
if ( 'Halo {{field:nama}}' !== $form->prop( 'pesanpro_message' ) ) $failures[] = 'Saved template must be sanitized and keep placeholders';
if ( 'Halo {{field:nama}}' !== PesanPro_CF7_Form_Message::template( $form ) ) $failures[] = 'Saved template must be readable from the contact form';
if ( array( 'nama', 'your-phone' ) !== PesanPro_CF7_Form_Message::field_names( $form ) ) $failures[] = 'Tab must list only named form fields';

$fields = array( 'nama' => 'Ayu', 'pesan' => '', 'topik' => array( 'Harga', 'Stok' ) );
$context = array( 'formTitle' => 'Hubungi Kami', 'formId' => '7', 'submissionId' => 's-1', 'submittedAt' => '2026-11-10T10:00:00+00:00', 'site' => 'https://toko.example' );

$cases = array(
    array( 'Halo {{field:nama}}: {{field:topik}}', 'Halo Ayu: Harga, Stok' ),
    array( '{{field:tidak-ada}}|{{field:pesan}}|selesai', '||selesai' ),
    array( '{{all_fields}}', "nama: Ayu\npesan: -\ntopik: Harga, Stok" ),
    array( 'Form {{formTitle}} ({{formId}}) #{{submissionId}} di {{site}} pada {{submittedAt}}', 'Form Hubungi Kami (7) #s-1 di https://toko.example pada 2026-11-10T10:00:00+00:00' ),
    array( '', '' ),
    array( '{{field:tidak-ada}}', '' ),
);
foreach ( $cases as $index => $case ) {
    if ( PesanPro_CF7_Form_Message::render( $case[0], $fields, $context ) !== $case[1] ) $failures[] = "Render case {$index} mismatch";
}

$long = PesanPro_CF7_Form_Message::render( str_repeat( 'é', 5000 ) . ' {{field:nama}}', $fields, $context );
if ( strlen( $long ) > 4096 || ! mb_check_encoding( $long, 'UTF-8' ) ) $failures[] = 'Rendered message must stay within the 4096 limit without breaking UTF-8';

if ( $failures ) {
    fwrite( STDERR, implode( PHP_EOL, $failures ) . PHP_EOL );
    exit( 1 );
}
echo "PesanPro Contact Form 7 policy tests passed." . PHP_EOL;
