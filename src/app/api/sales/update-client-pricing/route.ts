import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { clientId, customRates, multiTierRates, allowedFormats } = body;

        if (!clientId || !allowedFormats) {
            return NextResponse.json(
                { error: 'Missing required fields: clientId, allowedFormats' },
                { status: 400 }
            );
        }

        // Prepare update object
        const updateData: any = {
            allowedFormats: allowedFormats,
            updatedAt: Date.now()
        };

        // Include customRates if provided (for backward compatibility)
        if (customRates) {
            updateData.customRates = customRates;
        }

        // Include multiTierRates if provided (new feature)
        if (multiTierRates && Object.keys(multiTierRates).length > 0) {
            updateData.multiTierRates = multiTierRates;
        }

        // Update the client's pricing in Firestore
        await adminDb.collection('users').doc(clientId).update(updateData);

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
