
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password, displayName, role, createdBy, phoneNumber } = body;

        if (!email || !password || !displayName || !role) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Validate Role
        const validRoles = ['admin', 'manager', 'editor', 'client', 'sales_executive', 'project_manager'];
        if (!validRoles.includes(role)) {
            return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
        }

        let formattedPhone: string | undefined = undefined;
        let usePhoneInAuth = true; // Whether to set phone in Firebase Auth
        
        if (phoneNumber && phoneNumber.trim().length > 0) {
            // Strip any non-numeric characters
            const cleaned = phoneNumber.replace(/\D/g, '');
            // Validate exactly 10 digits
            if (cleaned.length !== 10) {
                return NextResponse.json({ error: 'Phone number must be exactly 10 digits' }, { status: 400 });
            }
            // Format with +91 prefix
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
                // We'll still store it in Firestore for WhatsApp notifications
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
            role: role,
            phoneNumber: formattedPhone || null,
            whatsappNumber: formattedPhone || null,
            photoURL: null,
            createdAt: Date.now(),
            createdBy: createdBy || 'admin',
            initialPassword: password // Storing temporarily for admin visibility (Security Warning: Ideally don't do this in Prod)
        });

        // 3. Set Custom Claim
        await adminAuth.setCustomUserClaims(userRecord.uid, { role: role });

        return NextResponse.json({
            success: true,
            uid: userRecord.uid,
            message: `${role} created successfully`
        });

    } catch (error: any) {
        console.error('Error creating user:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to create user' },
            { status: 500 }
        );
    }
}
