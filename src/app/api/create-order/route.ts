
import { NextResponse } from 'next/server';
import { CURRENCY } from '@/lib/razorpay';
import { db } from '@/lib/firebase/config'; // Client SDK for now, but better to use Admin SDK in API routes if possible. 
// Using Admin SDK for consistency in API routes if available, or just standard check.
// Using Admin SDK for consistency in API routes if available, or just standard check.
// import { adminAuth } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { amount, projectId } = body;

        // Validate request
        if (!amount || !projectId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Verify user is authenticated (optional but recommended)
        // const authHeader = request.headers.get('Authorization');
        // if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        // const token = authHeader.split('Bearer ')[1];
        // await adminAuth.verifyIdToken(token);

        // Validate minimal amount (Razorpay requires at least 1 INR)
        if (amount < 1) {
            return NextResponse.json({ error: 'Amount must be at least ₹1' }, { status: 400 });
        }

        const options = {
            amount: Math.round(amount * 100), // Razorpay handles amount in subunits (paise for INR)
            currency: CURRENCY,
            // standard Firestore IDs are ~20 chars + timestamp (13) + prefix. Maximum is 40 chars.
            // We truncate projectId to ensure we fit.
            receipt: `rcpt_${projectId.slice(0, 15)}_${Date.now().toString().slice(-6)}`,
            notes: {
                projectId: projectId
            }
        };

        const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!keyId || !keySecret) {
            return NextResponse.json({ error: 'Razorpay credentials are not configured' }, { status: 500 });
        }

        const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const response = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${basicAuth}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(options)
        });

        const rawBody = await response.text();
        let order: any = null;
        try {
            order = JSON.parse(rawBody);
        } catch {
            order = { raw: rawBody };
        }

        if (!response.ok) {
            console.error('Razorpay order API failed', {
                status: response.status,
                body: order
            });
            return NextResponse.json(
                { error: 'Error creating order', details: order },
                { status: response.status }
            );
        }

        return NextResponse.json(order);
    } catch (error: any) {
        console.error('Error creating Razorpay order:', error);
        return NextResponse.json(
            { error: 'Error creating order', details: error.message },
            { status: 500 }
        );
    }
}
