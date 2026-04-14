// File: /api/create-bill.js

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            error: 'Method Not Allowed' 
        });
    }

    try {
        // Get current time for debugging
        const now = new Date();
        console.log('=== Payment Request Started ===');
        console.log('Request Body:', JSON.stringify(req.body, null, 2));

        // Get data from the frontend request
        const { name, email, phone, amount, billDescription, orderId } = req.body;

        // Validate required fields
        if (!name || !email || !phone || !amount) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: name, email, phone, amount' 
            });
        }

        // === Register order in Google Sheets (THIS IS NOW MANDATORY) ===
        let googleOrderId = orderId;
        
        // If no orderId provided, create one and register in Google Sheets
        if (!googleOrderId) {
            try {
                // IMPORTANT: Ensure this URL matches your Google Apps Script
                // If your main system uses a different script, update this URL.
                const googleScriptUrl = 'https://script.google.com/macros/s/AKfycbwoSrlYQew7kuo75fbJtjy-Z019Z4q5pTo8wDBoRqGUSmJE-PvsgpTepoy6jYFoqTh4oA/exec';
                
                const formData = new URLSearchParams();
                formData.append('action', 'createOrder');
                formData.append('name', name);
                formData.append('email', email);
                formData.append('phone', phone);
                formData.append('package', billDescription || 'PROSTREAM Package');
                formData.append('paymentMethod', 'toyyibpay');
                formData.append('amount', amount.toString());
                
                const googleResponse = await fetch(googleScriptUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData
                });
                
                const googleResult = await googleResponse.json();
                
                // --- FIX 1: Be strict. If creating the order fails, STOP the process. ---
                if (googleResult.status !== 'success' || !googleResult.orderId) {
                    console.error('CRITICAL: Failed to register order in Google Sheets or did not receive a valid ID.', googleResult);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Could not create order in our system. Please try again.',
                        details: googleResult.message || 'No valid order ID received from Google Sheets.'
                    });
                }
                
                googleOrderId = googleResult.orderId;
                console.log('Order registered in Google Sheets with ID:', googleOrderId);

            } catch (error) {
                console.error('CRITICAL: Error registering order in Google Sheets:', error);
                return res.status(500).json({ 
                    success: false, 
                    error: 'A critical error occurred while creating your order. Please contact support.',
                    details: error.message
                });
            }
        }

        // Your SECRET data is now safe on the server
        // IMPORTANT: Replace 'b2kcp05o-b5m0-q000-55i7-w3j57riufv7h' with your actual ToyyibPay Secret Key
        const userSecretKey = 'b2kcp05o-b5m0-q000-55i7-w3j57riufv7h';
        
        // Your Category Code
        const categoryCode = '8f5ynfpt';
        
        const billName = 'PROSTREAM';
        const billPriceSetting = '1';
        const billPayorInfo = '1';
        const billAmount = `${amount * 100}`; // Convert to cents
        const billReturnUrl = 'https://prostreammy.vercel.app/payment-successful.html'; // CRITICAL: Matches your frontend file name
        const billCallbackUrl = 'https://prostreammy.vercel.app/api/payment-callback'; // Ensure you have this endpoint configured in Toyyibpay dashboard
        
        // --- FIX 2: Use the confirmed ID from Google Sheets. No fallback. ---
        const billExternalReferenceNo = googleOrderId;
        
        const billTo = name;
        const billEmail = email;
        const billPhone = phone;
        const billSplitPayment = '0';
        const billPaymentChannel = '0';
        const billChargeToCustomer = '1';

        // Create the form data for ToyyibPay
        const body = new FormData();
        body.append('userSecretKey', userSecretKey);
        body.append('categoryCode', categoryCode);
        body.append('billName', billName);
        body.append('billDescription', billDescription || `Pembelian PROSTREAM Package - RM${amount}`);
        body.append('billPriceSetting', billPriceSetting);
        body.append('billPayorInfo', billPayorInfo);
        body.append('billAmount', billAmount);
        body.append('billReturnUrl', billReturnUrl);
        body.append('billCallbackUrl', billCallbackUrl);
        body.append('billExternalReferenceNo', billExternalReferenceNo);
        body.append('billTo', billTo);
        body.append('billEmail', billEmail);
        body.append('billPhone', billPhone);
        body.append('billSplitPayment', billSplitPayment);
        body.append('billSplitPaymentArgs', '');
        body.append('billPaymentChannel', billPaymentChannel);
        body.append('billChargeToCustomer', billChargeToCustomer);
        
        // --- FIX 3: Set bill expiry to 1 day as per official documentation ---
        body.append('billExpiryDays', '1');
        
        body.append('billContentEmail', 'Terima kasih atas pembayaran anda. Kami berbesar hati untuk mengesahkan bahawa pesanan anda, Sila tekan link untuk melihat paduan pemasangan dan CODE DOWNLOAD BESERTA CODE LOGIN : https://tinyurl.com/ProstreamGuide-Code1 ');

        // Log the data being sent (without the secret key)
        const logData = {};
        for (let [key, value] of body.entries()) {
            if (key !== 'userSecretKey') {
                logData[key] = value;
            } else {
                logData[key] = '***HIDDEN***';
            }
        }
        console.log('Data being sent to ToyyibPay:', JSON.stringify(logData, null, 2));

        // Make the API call to ToyyibPay from the server
        console.log('Making API call to ToyyibPay...');
        const response = await fetch('https://toyyibpay.com/index.php/api/createBill', {
            method: 'POST',
            body: body,
        });

        console.log('ToyyibPay Response Status:', response.status);
        console.log('ToyyibPay Response Headers:', Object.fromEntries(response.headers.entries()));

        const textResult = await response.text();
        console.log('ToyyibPay Raw Response:', textResult);

        let result;
        try {
            result = JSON.parse(textResult);
            console.log('Parsed ToyyibPay Response:', JSON.stringify(result, null, 2));
        } catch (e) {
            console.error("Failed to parse ToyyibPay response:", e);
            console.error("Raw response that failed to parse:", textResult);
            return res.status(500).json({ 
                success: false, 
                error: 'Invalid response from payment provider.',
                details: textResult
            });
        }

        // Check if the bill was created successfully
        if (result && result.length > 0 && result[0].BillCode) {
            const billCode = result[0].BillCode;
            const billUrl = `https://toyyibpay.com/${billCode}`;

            console.log('Bill created successfully!');
            console.log('Bill Code:', billCode);
            console.log('Bill URL:', billUrl);

            // Send InitiateCheckout event to Facebook Conversions API (fire-and-forget)
            try {
                const pixelId = '2276519576162204';
                const accessToken = 'EAAcJZCFldLZAYBP2Rt17ob7AJUEAPnCZCdiIOHZBereJjCRiofT1SottrBAL8EjPME1L6LANNoRN5I0yootHZCYioBgN2SUZBHPbUU93iRd54xOSeM7RbiHHIqemm6zM5p6GLIZAHNOezCVLROwIER8spOyZB3iC4wYTB1qZBADgHpWlZCpcZC0VA3Hi26sRJ85fwZDZD';
                
                // Prepare the event payload
                const event = {
                    event_name: 'InitiateCheckout',
                    event_time: Math.floor(Date.now() / 1000),
                    action_source: 'website',
                    event_source_url: 'https://prostreammy.vercel.app/',
                    event_id: `checkout_${billExternalReferenceNo}`, // Use Order ID as event ID
                    user_data: {
                        em: Buffer.from(email).toString('base64'),
                        ph: Buffer.from(phone).toString('base64'),
                        fn: Buffer.from(name.split(' ')[0]).toString('base64'),
                        ln: Buffer.from(name.split(' ').slice(1).join(' ')).toString('base64'),
                        client_user_agent: req.headers['user-agent'],
                        client_ip_address: req.headers['x-forwarded-for'] || req.connection.remoteAddress
                    },
                    custom_data: {
                        currency: 'MYR',
                        value: (amount * 100).toString(),
                        content_name: 'PROSTREAM 4 App Power Package',
                        content_category: 'Streaming',
                        content_ids: ['prostream_4app_package'],
                        content_type: 'product'
                    }
                };

                const payload = {
                    username: "PROSTREAM Bot",
                    avatar_url: "https://cdn-icons-png.flaticon.com/512/2991/2991148.png",
                    embeds: [event]
                };

                const caPiResponse = await fetch(`https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        data: [event],
                    })
                });

                console.log('Facebook InitiateCheckout event sent successfully.');
            } catch (error) {
                console.error('Error setting up Facebook event:', error);
                // Do not block payment flow if Pixel fails
            }

            // Send the successful response back to the frontend
            return res.status(200).json({ 
                success: true, 
                billCode: billCode,
                billUrl: billUrl,
                billExternalReferenceNo: billExternalReferenceNo,
                orderId: googleOrderId // Include the Google Order ID in the response
            });
        } else {
            console.error("ToyyibPay API Error:", result);
            return res.status(400).json({ 
                success: false, 
                error: 'Failed to create payment bill.',
                details: result
            });
        }
    } catch (error) {
        console.error('Server Error:', error);
        console.error('Error Stack:', error.stack);
        return res.status(500).json({ 
            success: false, 
            error: 'An internal server error occurred.',
            details: error.message
        });
    }
}
