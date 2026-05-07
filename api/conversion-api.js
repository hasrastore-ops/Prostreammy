export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            error: 'Method Not Allowed' 
        });
    }

    try {
        const { 
            eventName, 
            eventId, 
            value, 
            currency, 
            customerData, 
            contentData 
        } = req.body;

        if (!eventName || !eventId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: eventName, eventId' 
            });
        }

        const pixelId = '2276519576162204';
        const accessToken = 'EAAcJZCFldLZAYBRJ0UeAUViX0DBqwWoGPdFA5Ej7Pt0zbNeup8DTZAzIhfJvgLlMBXZAt0gllOF7MKIwO7csc6Ap0fYkFJ8kb3g0DsqLm0ehc0kvDPeYxjwUkzy5qXpJrJtyI41ivqDZAzUZBWCUuISVtv0gmFmpttoImfFSoUbqH7PtBhxwlkMtUADgVSmAZDZD';

        // Extract fbp & fbc from cookies for deduplication
        const cookieHeader = req.headers.cookie || '';
        const fbcMatch = cookieHeader.match(/_fbc=([^;]+)/);
        const fbpMatch = cookieHeader.match(/_fbp=([^;]+)/);
        const fbc = fbcMatch ? decodeURIComponent(fbcMatch[1]) : undefined;
        const fbp = fbpMatch ? decodeURIComponent(fbpMatch[1]) : undefined;

        // SHA-256 hash helper
        async function hashData(data) {
            if (!data) return undefined;
            const crypto = await import('crypto');
            const normalized = typeof data === 'string' ? data.trim().toLowerCase() : String(data);
            return crypto.createHash('sha256').update(normalized).digest('hex');
        }

        // Accept both field naming conventions
        const email = customerData?.em || customerData?.email || '';
        const phone = customerData?.ph || customerData?.phone || '';
        const firstName = customerData?.fn || customerData?.firstName || '';
        const lastName = customerData?.ln || customerData?.lastName || '';

        const [hashedEmail, hashedPhone, hashedFn, hashedLn] = await Promise.all([
            hashData(email),
            hashData(phone),
            hashData(firstName),
            hashData(lastName)
        ]);

        // Build user_data
        const userData = {
            client_user_agent: req.headers['user-agent'] || undefined,
            client_ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.connection?.remoteAddress || undefined,
        };

        if (fbp) userData.fbp = fbp;
        if (fbc) userData.fbc = fbc;
        if (hashedEmail) userData.em = [hashedEmail];
        if (hashedPhone) userData.ph = [hashedPhone];
        if (hashedFn) userData.fn = [hashedFn];
        if (hashedLn) userData.ln = [hashedLn];

        // Remove undefined values
        Object.keys(userData).forEach(key => {
            if (userData[key] === undefined || userData[key] === null) {
                delete userData[key];
            }
        });

        // Build custom_data
        const customData = {
            currency: currency || 'MYR',
        };

        if (value && !isNaN(value)) {
            customData.value = parseFloat(value);
        }

        if (contentData?.content_name) customData.content_name = contentData.content_name;
        if (contentData?.content_category) customData.content_category = contentData.content_category;
        if (contentData?.content_ids) customData.content_ids = contentData.content_ids;
        if (contentData?.content_type) customData.content_type = contentData.content_type;

        // Build event
        const event = {
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            action_source: 'website',
            event_source_url: req.headers.referer || 'https://prostreammy.vercel.app/',
            event_id: eventId,
            user_data: userData,
            custom_data: customData
        };

        // Send to Meta
        const response = await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: [event],
                access_token: accessToken
            })
        });

        const result = await response.json();

        if (response.ok && (result.events_received || 0) > 0) {
            return res.status(200).json({ 
                success: true, 
                message: 'Conversion event sent successfully'
            });
        } else {
            return res.status(400).json({ 
                success: false, 
                error: 'Failed to send conversion event.',
                details: result
            });
        }
    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error.',
            details: error.message
        });
    }
}
