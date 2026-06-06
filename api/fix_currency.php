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
        . '|euroon'
        . '|euroni'
        . '|evra'
        . '|يورو'
        . '|欧'
        . ')';
    $amountPattern = '(\{[a-zA-Z_]+\}|\d+(?:[.,\s]\d+)*)';

    $text = preg_replace('/' . $amountPattern . '\s*' . $euroVariants . '(?![a-zA-Z])/u', '€$1', $text);
    $text = preg_replace('/' . $amountPattern . '\s*€/u', '€$1', $text);

    // "$" and "£" always before amount: "100$" / "100 $" → "$100"
    $text = preg_replace('/' . $amountPattern . '\s*\$/u', '\$$1', $text);
    $text = preg_replace('/' . $amountPattern . '\s*£/u', '£$1', $text);

    // CAD variants → "CAD amount"
    $cadVariants = '(?:Kanada\s+dollar(?:ini|[ıi])|Canadian\s+dollars?|דולר\s+קנדי|دولار\s+كندي|加元|CAD)';
    // "amount variant" → "CAD amount"
    $text = preg_replace('/' . $amountPattern . '\s*' . $cadVariants . '(?![a-zA-Z])/ui', 'CAD $1', $text);
    // "variant amount" → "CAD amount" (for CJK/Arabic where symbol precedes amount)
    $text = preg_replace('/' . $cadVariants . '\s*' . $amountPattern . '/ui', 'CAD $1', $text);

    return $text;
}
