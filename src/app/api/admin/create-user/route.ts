
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
        if (phoneNumber && phoneNumber.trim().length >= 10) {
            // Strip any non-numeric characters for simple length check
            const cleaned = phoneNumber.replace(/\D/g, '');
            if (cleaned.length >= 10) {
                // Ensure it starts with +91 if not specified
                formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${cleaned.slice(-10)}`;
            }
        }

        // 1. Create User in Firebase Auth
        const userRecord = await adminAuth.createUser({
            email,
            password,
            displayName,
            phoneNumber: formattedPhone
        });

        // 2. Create User Profile in Firestore
        await adminDb.collection('users').doc(userRecord.uid).set({
            uid: userRecord.uid,
            email,
            displayName,
            role: role,
            phoneNumber: phoneNumber || null,
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
