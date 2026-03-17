import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { clientId, customRates, allowedFormats } = body;

        if (!clientId || !customRates || !allowedFormats) {
            return NextResponse.json(
                { error: 'Missing required fields: clientId, customRates, allowedFormats' },
                { status: 400 }
            );
        }

        // Update the client's customRates and allowedFormats in Firestore
        await adminDb.collection('users').doc(clientId).update({
            customRates: customRates,
            allowedFormats: allowedFormats,
            updatedAt: Date.now()
        });

        return NextResponse.json({
            success: true,
            message: 'Client pricing updated successfully'
        });

    } catch (error: any) {
        console.error('Error updating client pricing:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to update pricing' },
            { status: 500 }
        );
    }
}
