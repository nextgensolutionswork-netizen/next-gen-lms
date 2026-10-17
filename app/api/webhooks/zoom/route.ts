import { NextRequest, NextResponse } from 'next/server';
import {
  verifyZoomWebhookSignature,
  handleZoomEndpointValidation,
  processZoomWebhook,
} from '@/lib/services/meeting-attendance-service';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const timestamp = req.headers.get('x-zm-request-timestamp') || '';
    const signature = req.headers.get('x-zm-signature') || '';

    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    // 1. Zoom URL Validation Challenge
    if (parsedPayload.event === 'endpoint.url_validation') {
      const plainToken = parsedPayload.payload?.plainToken;
      if (!plainToken) {
        return NextResponse.json({ error: 'Missing plainToken' }, { status: 400 });
      }

      // Check signature if provided during challenge
      if (signature && timestamp) {
        const isValid = verifyZoomWebhookSignature(rawBody, timestamp, signature);
        if (!isValid && process.env.NODE_ENV === 'production') {
          return NextResponse.json({ error: 'Unauthorized challenge' }, { status: 401 });
        }
      }

      const challengeResponse = handleZoomEndpointValidation(plainToken);
      return NextResponse.json(challengeResponse, { status: 200 });
    }

    // 2. Webhook Signature Verification & Timestamp Freshness for Event Payloads (G32)
    const webhookSecret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || (process.env.NODE_ENV !== 'production' ? 'zoom_webhook_secret_dev' : undefined);
    if (!webhookSecret) {
      return NextResponse.json({ error: 'Zoom webhook secret token not configured on server' }, { status: 500 });
    }

    if (!signature || !timestamp) {
      return NextResponse.json({ error: 'Missing mandatory Zoom webhook signature or timestamp header' }, { status: 401 });
    }

    const isValid = verifyZoomWebhookSignature(rawBody, timestamp, signature, webhookSecret);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid Zoom webhook signature' }, { status: 401 });
    }

    // Enforce 5-minute timestamp freshness (< 300 seconds) to prevent replay attacks
    const reqTimestampNum = parseInt(timestamp, 10);
    const reqTimestampMs = reqTimestampNum < 1e11 ? reqTimestampNum * 1000 : reqTimestampNum;
    if (isNaN(reqTimestampMs) || Math.abs(Date.now() - reqTimestampMs) > 5 * 60 * 1000) {
      return NextResponse.json({ error: 'Invalid Zoom webhook: timestamp expired outside 5-minute freshness window' }, { status: 401 });
    }

    // 3. Process Meeting Webhook Event
    const result = await processZoomWebhook(parsedPayload);

    return NextResponse.json({
      success: true,
      event: parsedPayload.event,
      result: result.result,
    });
  } catch (error: any) {
    console.error('Zoom webhook error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error processing Zoom webhook' },
      { status: 500 }
    );
  }
}
