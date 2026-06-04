<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$input = json_decode(file_get_contents('php://input'), true);
$text = $input['text'] ?? '';

if ($text === '') {
    echo json_encode(['result' => '']);
    exit;
}

echo json_encode(['result' => fixEuroSymbolPosition($text)]);

function fixEuroSymbolPosition(string $text): string {
    $text = str_replace(["\u{201C}", "\u{201D}", "\u{201E}", "\u{201F}"], '', $text);
    $euroVariants = '(?:'
        . '[Aa]vroya'
        . '|[Aa]vro'
        . '|eurót'
        . '|[Ee]urot'
        . '|euroa'
        . '|euron'
        . '|evrum'
        . '|evrov'
        . '|euró'
        . '|eurų'
        . '|ευρώ'
        . '|евро'
        . '|евра'
        . '|євро'
        . '|եվրո'
        . '|ევრო'
        . '|אירו'
        . '|欧元'
        . '|[Ee]uro'
        . '|EUR'
        . '|eiro'
        . '|euroni'
        . '|evra'
        . '|يورو'
        . '|欧'
        . ')';
    $amountPattern = '(\{[a-zA-Z_]+\}|\d+(?:[.,\s]\d+)*)';

    $text = preg_replace('/' . $amountPattern . '\s*' . $euroVariants . '\b/u', '€$1', $text);
    $text = preg_replace('/' . $amountPattern . '\s*€/u', '€$1', $text);

    // "$" and "£" always before amount: "100$" / "100 $" → "$100"
    $text = preg_replace('/' . $amountPattern . '\s*\$/u', '\$$1', $text);
    $text = preg_replace('/' . $amountPattern . '\s*£/u', '£$1', $text);

    // CAD variants → "CAD amount"
    $cadVariants = '(?:Kanada\s+dollar[ıi]|Canadian\s+dollars?|CAD)';
    $text = preg_replace('/' . $amountPattern . '\s*' . $cadVariants . '\b/ui', 'CAD $1', $text);
    $text = preg_replace('/\bCAD\s+(' . substr($amountPattern, 1, -1) . ')/u', 'CAD $1', $text);

    return $text;
}
