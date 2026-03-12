<?php
header("Content-Type: application/json");

require_once __DIR__ . "/translator.php";

// Get text from query
$text = isset($_GET["text"]) ? $_GET["text"] : "";
$lang = isset($_GET["lang"]) ? $_GET["lang"] : "DA";

if (empty($text)) {
    echo json_encode(["error" => "Please provide ?text=your+text&lang=DA"]);
    exit;
}

// Load env for API key
$envFile = dirname(__DIR__) . "/.env";
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), "#") === 0) continue;
        if (strpos($line, "=") !== false) {
            list($key, $value) = explode("=", $line, 2);
            putenv(trim($key) . "=" . trim($value));
        }
    }
}

$apiKey = getenv("DEEPL_API_KEY");
$apiUrl = getenv("DEEPL_API_URL") ?: "https://api-free.deepl.com";

// Make direct API call
$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $apiUrl . "/v2/translate",
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => "target_lang=" . urlencode($lang) . "&text=" . urlencode($text),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: DeepL-Auth-Key " . $apiKey,
        "Content-Type: application/x-www-form-urlencoded"
    ]
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$result = json_decode($response, true);

echo json_encode([
    "input_text" => $text,
    "input_length" => strlen($text),
    "target_lang" => $lang,
    "http_code" => $httpCode,
    "translation" => isset($result["translations"][0]["text"]) ? $result["translations"][0]["text"] : null,
    "detected_source" => isset($result["translations"][0]["detected_source_language"]) ? $result["translations"][0]["detected_source_language"] : null
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
