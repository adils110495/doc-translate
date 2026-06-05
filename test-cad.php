<?php
header('Content-Type: text/plain; charset=utf-8');

$amountPattern = '(\{[a-zA-Z_]+\}|\d+(?:[.,\s]\d+)*)';
$cadVariants   = '(?:Kanada\s+dollar(?:ini|[ıi])|Canadian\s+dollars?|דולר\s+קנדי|دولار\s+كندي|加元|CAD)';

$tests = [
    '100 加元',
    '100加元',
    '加元100',
    '加元 100',
    '1,000 加元',
    'Price: 500 加元 total',
    '被拒绝登机的乘客可按延误情况获得最高 2400 加元赔偿。',
];

foreach ($tests as $t) {
    $r = $t;
    $r = preg_replace('/' . $amountPattern . '\s*' . $cadVariants . '(?!\w)/ui', 'CAD $1', $r);
    $r = preg_replace('/' . $cadVariants   . '\s*' . $amountPattern             . '/ui',   'CAD $1', $r);

    $match1 = preg_match('/' . $amountPattern . '\s*' . $cadVariants . '(?!\w)/ui', $t);
    $match2 = preg_match('/' . $cadVariants   . '\s*' . $amountPattern             . '/ui', $t);

    echo "Input:   $t\n";
    echo "Output:  $r\n";
    echo "Pattern1 matched: " . ($match1 ? 'YES' : 'NO') . "\n";
    echo "Pattern2 matched: " . ($match2 ? 'YES' : 'NO') . "\n";
    echo str_repeat('-', 40) . "\n";
}
