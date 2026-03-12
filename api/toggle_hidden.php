<?php
header('Content-Type: application/json');

$hiddenFile = dirname(__DIR__) . '/hidden-items.json';

function loadHiddenItems($file) {
    if (file_exists($file)) {
        $data = json_decode(file_get_contents($file), true);
        if ($data) return $data;
    }
    return ['projects' => [], 'topics' => []];
}

function saveHiddenItems($file, $data) {
    return file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT)) !== false;
}

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        // Return current hidden items
        echo json_encode(['success' => true, 'hidden' => loadHiddenItems($hiddenFile)]);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception('Invalid request method');
    }

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        throw new Exception('Invalid JSON input');
    }

    $action = $input['action'] ?? '';   // 'hide' or 'unhide'
    $type   = $input['type']   ?? '';   // 'project' or 'topic'
    $name   = trim($input['name'] ?? '');

    if (!in_array($action, ['hide', 'unhide'])) throw new Exception('Invalid action');
    if (!in_array($type, ['project', 'topic']))  throw new Exception('Invalid type');
    if ($name === '')                             throw new Exception('Name is required');

    $key  = $type . 's'; // 'projects' or 'topics'
    $data = loadHiddenItems($hiddenFile);

    if ($action === 'hide') {
        if (!in_array($name, $data[$key])) {
            $data[$key][] = $name;
        }
    } else {
        $data[$key] = array_values(array_filter($data[$key], fn($v) => $v !== $name));
    }

    if (!saveHiddenItems($hiddenFile, $data)) {
        throw new Exception('Failed to save hidden items');
    }

    echo json_encode(['success' => true, 'hidden' => $data]);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
