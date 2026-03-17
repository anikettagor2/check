import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { doc, updateDoc } from 'firebase/firestore';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { clientId, customRates } = body;

        if (!clientId || !customRates) {
            return NextResponse.json(
                { error: 'Missing required fields: clientId, customRates' },
                { status: 400 }
            );
        }

        // Update the client's customRates in Firestore
        await adminDb.collection('users').doc(clientId).update({
            customRates: customRates,
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
