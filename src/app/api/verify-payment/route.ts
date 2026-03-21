import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            projectId,
            amount,
            paymentType
        } = body;

        console.log("Verifying payment for project:", projectId, "Amount:", amount);

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !projectId) {
            console.error("Missing fields in verification request");
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const secret = process.env.RAZORPAY_KEY_SECRET;
        if (!secret) {
            console.error("RAZORPAY_KEY_SECRET is not set in environment variables");
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const generated_signature = crypto
            .createHmac('sha256', secret)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            console.error("Signature mismatch. Generated:", generated_signature, "Received:", razorpay_signature);
            return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
        }

        // Prepare Update Data using Admin SDK
        const updateData: any = {
            amountPaid: FieldValue.increment(amount), // Admin SDK syntax
            razorpayPaymentId: razorpay_payment_id,
            updatedAt: Date.now()
        };

        if (paymentType === 'initial') {
            updateData.status = 'pending_assignment';
            updateData.paymentStatus = 'half_paid';
        } else if (paymentType === 'final') {
            updateData.status = 'completed';
            updateData.paymentStatus = 'full_paid';
        }

        console.log("Updating project with:", updateData);

        // Perform Update using Admin SDK (Bypasses rules)
        await adminDb.collection('projects').doc(projectId).update(updateData);

        // --- AUTOMATIC INVOICE GENERATION ---
        try {
            const projectSnap = await adminDb.collection('projects').doc(projectId).get();
            const projectData = projectSnap.data();

            if (projectData && projectData.clientId) {
                const clientSnap = await adminDb.collection('users').doc(projectData.clientId).get();
                const clientData = clientSnap.data();

                const invoiceNumber = `INV-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 100)}`;
                const description = paymentType === 'initial'
                    ? `Upfront Payment for Project: ${projectData.name}`
                    : `Final Balance for Project: ${projectData.name}`;

                const invoiceData = {
                    invoiceNumber,
                    projectId,
                    clientId: projectData.clientId,
                    clientName: clientData?.displayName || projectData.clientName || "Client",
                    clientEmail: clientData?.email || "Unknown",
                    clientAddress: "",
                    items: [{
                        description,
                        quantity: 1,
                        rate: amount,
                        amount: amount
                    }],
                    subtotal: amount,
                    tax: 0,
                    total: amount,
                    status: 'paid', // Automatically marked as paid
                    issueDate: Date.now(),
                    dueDate: Date.now(),
                    notes: `Auto-generated via Razorpay Payment (ID: ${razorpay_payment_id})`,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    razorpayOrderId: razorpay_order_id,
                    razorpayPaymentId: razorpay_payment_id
                };

                await adminDb.collection('invoices').add(invoiceData);
                console.log("Auto-generated invoice:", invoiceNumber);
            }
        } catch (invoiceError) {
            console.error("Failed to auto-generate invoice:", invoiceError);
            // Don't block the response, payment was successful
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("Verification Error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
