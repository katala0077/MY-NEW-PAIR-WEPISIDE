<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot Session Generator</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f0f2f5;
            margin: 0;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .container {
            max-width: 600px;
            width: 100%;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 20px rgba(0,0,0,0.1);
            padding: 30px;
            text-align: center;
        }
        h2 {
            color: #075e54;
            margin-bottom: 10px;
        }
        p {
            color: #555;
            margin-bottom: 20px;
        }
        input {
            width: 100%;
            padding: 14px;
            font-size: 16px;
            border: 2px solid #ddd;
            border-radius: 8px;
            box-sizing: border-box;
            margin-bottom: 20px;
        }
        button {
            background: #25D366;
            color: white;
            border: none;
            padding: 14px 30px;
            font-size: 16px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            transition: background 0.3s;
        }
        button:hover {
            background: #128C7E;
        }
        #result {
            margin-top: 25px;
            padding: 20px;
            border-radius: 8px;
            background: #f9f9f9;
            text-align: left;
        }
        .pair-code {
            background: #e8f5e8;
            padding: 15px;
            border-left: 5px solid #25D366;
            font-size: 24px;
            font-weight: bold;
            text-align: center;
            margin: 15px 0;
            border-radius: 6px;
        }
        #sessionBox {
            display: none;
            margin-top: 20px;
        }
        textarea {
            width: 100%;
            height: 120px;
            padding: 12px;
            font-family: monospace;
            font-size: 14px;
            border: 1px solid #ccc;
            border-radius: 6px;
            resize: vertical;
            box-sizing: border-box;
        }
        .note {
            font-size: 14px;
            color: #555;
            margin-top: 10px;
        }
        .loader {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #25D366;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .error {
            color: #d32f2f;
            background: #ffebee;
            padding: 10px;
            border-radius: 6px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>🔐 WhatsApp Bot Session Generator</h2>
        <p>Enter your WhatsApp number (with country code, no + or spaces)</p>
        <input type="text" id="phone" placeholder="e.g., 923307092214" />
        <button onclick="startPairing()">Get Pair Code</button>

        <div id="result"></div>
        <div id="sessionBox">
            <h3>✅ Your Session ID (base64):</h3>
            <textarea id="sessionId" readonly></textarea>
            <p class="note">
                Copy this string and set it as the environment variable <strong>SESSION_ID</strong> in your bot's hosting panel.
                Then restart the bot – it will connect without asking for a number.
            </p>
        </div>
    </div>

    <script>
        let currentSessionId = null;
        let pollInterval = null;

        async function startPairing() {
            const phone = document.getElementById('phone').value.trim();
            if (!phone) {
                alert('Please enter your phone number');
                return;
            }

            // Reset UI
            document.getElementById('sessionBox').style.display = 'none';
            document.getElementById('result').innerHTML = '<div class="loader"></div><p>⏳ Requesting pairing code...</p>';

            try {
                const response = await fetch('/pair', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phoneNumber: phone })
                });

                const data = await response.json();
                if (data.error) {
                    document.getElementById('result').innerHTML = `<p class="error">❌ ${data.error}</p>`;
                    return;
                }

                // Show pairing code
                document.getElementById('result').innerHTML = `
                    <p>📲 Your pairing code:</p>
                    <div class="pair-code">${data.pairingCode}</div>
                    <p>Open WhatsApp → Settings → Linked Devices → "Link a Device" and enter this code.</p>
                    <p>⏳ Waiting for you to complete pairing...</p>
                `;
                currentSessionId = data.sessionId;

                // Start polling for result
                if (pollInterval) clearInterval(pollInterval);
                pollInterval = setInterval(checkResult, 3000);
            } catch (err) {
                document.getElementById('result').innerHTML = `<p class="error">❌ Network error: ${err.message}</p>`;
            }
        }

        async function checkResult() {
            if (!currentSessionId) return;

            try {
                const response = await fetch(`/result/${currentSessionId}`);
                if (response.status === 404) return; // Not ready yet
                const data = await response.json();
                if (data.ready) {
                    clearInterval(pollInterval);
                    pollInterval = null;
                    document.getElementById('result').innerHTML += '<p style="color:green">✅ Pairing successful!</p>';
                    document.getElementById('sessionId').value = data.session;
                    document.getElementById('sessionBox').style.display = 'block';
                    currentSessionId = null;
                }
            } catch (err) {
                console.error('Poll error:', err);
            }
        }
    </script>
</body>
</html>
