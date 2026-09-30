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

    // 2. Webhook Signature Verification for Event Payloads
    const webhookSecret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
    if (webhookSecret || (signature && timestamp)) {
      const isValid = verifyZoomWebhookSignature(rawBody, timestamp, signature);
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid Zoom webhook signature' }, { status: 401 });
      }
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
