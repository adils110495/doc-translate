<?php
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!isset($input['mapper']) || !is_array($input['mapper'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid mapper — expected {"mapper": {...}}']);
    exit;
}

$filePath = dirname(__DIR__) . '/translation-links.json';
$json = json_encode(
    $input['mapper'],
    JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);

if (file_put_contents($filePath, $json) === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to write file']);
    exit;
}

echo json_encode(['success' => true, 'saved_to' => 'translation-links.json']);
