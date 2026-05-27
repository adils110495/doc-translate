<?php
header('Content-Type: application/json');

$defaultFile = dirname(__DIR__) . '/translation-links.json';
$customFile  = dirname(__DIR__) . '/custom-link-mapper.json';

$default = null;
if (file_exists($defaultFile)) {
    $d = json_decode(file_get_contents($defaultFile), true);
    if (is_array($d) && !empty($d)) $default = $d;
}

$custom = null;
if (file_exists($customFile)) {
    $c = json_decode(file_get_contents($customFile), true);
    if (is_array($c) && !empty($c)) $custom = $c;
}

echo json_encode([
    'default' => $default,
    'custom'  => $custom,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
