<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Currency Symbol Fixer</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f5f5f5;
            color: #333;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 24px;
        }

        .card {
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.10);
            padding: 36px 40px;
            width: 100%;
            max-width: 760px;
        }

        .card-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 28px;
        }

        .card-header i {
            font-size: 1.5rem;
            color: #4a90e2;
        }

        .card-header h1 {
            font-size: 1.4rem;
            font-weight: 600;
        }

        .card-header a {
            margin-left: auto;
            font-size: 0.85rem;
            color: #4a90e2;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .card-header a:hover { text-decoration: underline; }

        label {
            display: block;
            font-weight: 600;
            font-size: 0.88rem;
            margin-bottom: 6px;
            color: #555;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        textarea {
            width: 100%;
            height: 160px;
            border: 1.5px solid #ddd;
            border-radius: 8px;
            padding: 12px 14px;
            font-size: 0.97rem;
            font-family: inherit;
            resize: vertical;
            transition: border-color 0.2s;
            outline: none;
            background: #fafafa;
        }

        textarea:focus { border-color: #4a90e2; background: #fff; }

        .output-wrapper {
            position: relative;
            margin-top: 20px;
        }

        #output {
            background: #f8f9fb;
            color: #222;
            cursor: default;
        }

        .copy-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: #fff;
            border: 1.5px solid #ddd;
            border-radius: 6px;
            padding: 5px 10px;
            cursor: pointer;
            font-size: 0.82rem;
            color: #555;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: border-color 0.2s, color 0.2s, background 0.2s;
        }

        .copy-btn:hover { border-color: #4a90e2; color: #4a90e2; }
        .copy-btn.copied { border-color: #28a745; color: #28a745; }

        .actions {
            display: flex;
            gap: 12px;
            margin-top: 20px;
        }

        .btn-clear {
            padding: 11px 20px;
            background: #fff;
            color: #888;
            border: 1.5px solid #ddd;
            border-radius: 8px;
            font-size: 0.95rem;
            cursor: pointer;
            transition: border-color 0.2s, color 0.2s;
        }

        .btn-clear:hover { border-color: #e05050; color: #e05050; }

        .status {
            margin-top: 10px;
            font-size: 0.83rem;
            color: #888;
            min-height: 18px;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="card-header">
            <i class="fas fa-euro-sign"></i>
            <h1>Currency Symbol Fixer</h1>
            <a href="index.php"><i class="fas fa-arrow-left"></i> Back to App</a>
        </div>

        <label for="input">Input Text</label>
        <textarea id="input" placeholder="Paste text containing currency amounts here…"></textarea>

        <div class="actions">
            <button class="btn-clear" onclick="clearAll()">
                <i class="fas fa-times"></i> Clear
            </button>
        </div>

        <div class="output-wrapper">
            <label for="output" style="margin-top:20px;">Output</label>
            <textarea id="output" readonly placeholder="Fixed text will appear here…"></textarea>
            <button class="copy-btn" id="copy-btn" onclick="copyOutput()" title="Copy to clipboard">
                <i class="fas fa-copy"></i> Copy
            </button>
        </div>

        <div class="status" id="status"></div>
    </div>

    <script>
        async function fixCurrency() {
            const text = document.getElementById('input').value;
            if (!text.trim()) {
                setStatus('Paste some text first.', '#e05050');
                return;
            }

            setStatus('Processing…', '#888');

            try {
                const res = await fetch('api/fix_currency.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text })
                });
                const data = await res.json();
                document.getElementById('output').value = data.result;
                setStatus('Done — currency symbols fixed.', '#28a745');
            } catch (e) {
                setStatus('Error: ' + e.message, '#e05050');
            }
        }

        function copyOutput() {
            const output = document.getElementById('output');
            if (!output.value) return;
            navigator.clipboard.writeText(output.value).then(() => {
                const btn = document.getElementById('copy-btn');
                btn.classList.add('copied');
                btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                }, 2000);
            });
        }

        function clearAll() {
            document.getElementById('input').value = '';
            document.getElementById('output').value = '';
            setStatus('');
        }

        function setStatus(msg, color = '#888') {
            const el = document.getElementById('status');
            el.textContent = msg;
            el.style.color = color;
        }

        let debounceTimer = null;

        document.getElementById('input').addEventListener('input', () => {
            const text = document.getElementById('input').value;
            if (!text.trim()) {
                document.getElementById('output').value = '';
                setStatus('');
                return;
            }
            setStatus('Processing…', '#888');
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(fixCurrency, 300);
        });
    </script>
</body>
</html>
