
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password, displayName, createdBy, customRates, allowedFormats, phoneNumber, payLaterEligible } = body;

        if (!email || !password || !displayName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Validate and format phone number
        let formattedPhone: string | undefined = undefined;
        let usePhoneInAuth = true; // Whether to set phone in Firebase Auth
        
        if (phoneNumber && phoneNumber.trim().length > 0) {
            const cleaned = phoneNumber.replace(/\D/g, '');
            if (cleaned.length !== 10) {
                return NextResponse.json({ error: 'Phone number must be exactly 10 digits' }, { status: 400 });
            }
            formattedPhone = `+91${cleaned}`;

            // Check system settings for phone uniqueness
            const settingsSnap = await adminDb.collection('settings').doc('system').get();
            const systemSettings = settingsSnap.exists ? settingsSnap.data() : {};
            const allowDuplicatePhone = systemSettings?.allowDuplicatePhone === true;

            if (!allowDuplicatePhone) {
                // Check if phone number already exists
                const existingUsers = await adminDb.collection('users')
                    .where('phoneNumber', '==', formattedPhone)
                    .limit(1)
                    .get();
                
                if (!existingUsers.empty) {
                    return NextResponse.json({ error: 'This phone number is already registered. Please use a different phone number.' }, { status: 409 });
                }
            } else {
                // When duplicates allowed, don't set phone in Firebase Auth (it enforces uniqueness)
                usePhoneInAuth = false;
            }
        }

        // 1. Create User in Firebase Auth
        const userRecord = await adminAuth.createUser({
            email,
            password,
            displayName,
            phoneNumber: usePhoneInAuth ? formattedPhone : undefined
        });

        // 2. Create User Profile in Firestore
        await adminDb.collection('users').doc(userRecord.uid).set({
            uid: userRecord.uid,
            email,
            displayName,
            role: 'client',
            phoneNumber: formattedPhone || null,
            whatsappNumber: formattedPhone || null,
            photoURL: null,
            createdAt: Date.now(),
            createdBy: createdBy || 'system',
            managedBy: createdBy || null,
            initialPassword: password, // Store for Sales Exec to view/share
            customRates: customRates || null,
            allowedFormats: allowedFormats || null,
            payLater: payLaterEligible || false
        });

        // 3. Set Custom Claim (optional but good for Security Rules)
        await adminAuth.setCustomUserClaims(userRecord.uid, { role: 'client' });

        return NextResponse.json({
            success: true,
            uid: userRecord.uid,
            message: 'Client created successfully'
        });

    } catch (error: any) {
        console.error('Error creating client:', error);

        if (error.code === 'auth/email-already-exists') {
            return NextResponse.json(
                { error: 'This email is already registered. Please use a different email.' },
                { status: 409 }
            );
        }

        return NextResponse.json(
            { error: error.message || 'Failed to create client' },
            { status: 500 }
        );
    }
}
