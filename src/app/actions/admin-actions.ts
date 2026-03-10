'use server';

import * as admin from 'firebase-admin';
import { adminAuth, adminDb, adminStorage } from '@/lib/firebase/admin';
import { UserRole } from '@/types/schema';
import { revalidatePath } from 'next/cache';
import { notifyClient } from '@/lib/whatsapp';

/**
 * Toggles a user's disabled status in Firebase Auth and updates Firestore
 */
export async function toggleUserStatus(uid: string, disabled: boolean) {
    try {
        // 1. Update Firebase Auth status
        await adminAuth.updateUser(uid, { disabled });

        // 2. Update Firestore document
        await adminDb.collection('users').doc(uid).update({
            status: disabled ? 'inactive' : 'active',
            updatedAt: Date.now()
        });

        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        console.error('Error toggling user status:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Deletes a user from Firebase Auth and Firestore (Hard Delete)
 */
export async function deleteUser(uid: string) {
    try {
        const batch = adminDb.batch();

        // Update users created by this user
        const createdUsers = await adminDb.collection('users').where('createdBy', '==', uid).get();
        createdUsers.forEach(doc => {
            batch.update(doc.ref, { createdBy: 'admin' });
        });

        // Update users managed by this user (clients)
        const managedUsers = await adminDb.collection('users').where('managedBy', '==', uid).get();
        managedUsers.forEach(doc => {
            batch.update(doc.ref, { managedBy: 'admin' });
        });

        // Update editors managed by this project manager
        const pmUsers = await adminDb.collection('users').where('managedByPM', '==', uid).get();
        pmUsers.forEach(doc => {
            batch.update(doc.ref, { managedByPM: null }); // Remove PM assignment
        });

        await batch.commit();

        await adminAuth.deleteUser(uid);
        await adminDb.collection('users').doc(uid).delete();
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting user:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Deletes a project and its associated data
 * @param projectId The project ID
 */
export async function deleteProject(projectId: string) {
    try {
        // 1. Delete the project document
        await adminDb.collection('projects').doc(projectId).delete();

        // 2. Delete subcollections (recursively is hard in standard API, 
        // usually we just leave them or use a recursive helper. 
        // For now, we'll just delete the top level doc as standard practice for basic cleanup)

        // Note: For a production app, you'd use a cloud function to recursively delete
        // comments and revisions.

        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting project:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Updates a project's details
 */
export async function updateProject(projectId: string, data: any) {
    try {
        await adminDb.collection('projects').doc(projectId).update({
            ...data,
            updatedAt: Date.now()
        });

        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Adds a log entry to a project
 */
export async function addProjectLog(projectId: string, event: string, user: { uid: string, displayName: string, designation?: string }, details?: string) {
    try {
        await adminDb.collection('projects').doc(projectId).update({
            logs: admin.firestore.FieldValue.arrayUnion({
                event,
                user: user.uid,
                userName: user.displayName,
                designation: user.designation || 'System',
                timestamp: Date.now(),
                details
            })
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Triggered when a client creates a project.
 * Automatically assigns a PM if the client doesn't have one.
 */
export async function handleProjectCreated(projectId: string) {
    try {
        const projectRef = adminDb.collection('projects').doc(projectId);
        const projectSnap = await projectRef.get();
        if (!projectSnap.exists) return { success: false, error: "Project not found" };

        const project = projectSnap.data();
        const clientUID = project?.clientId;

        // Find if client has a PM
        const clientSnap = await adminDb.collection('users').doc(clientUID).get();
        const clientData = clientSnap.data();

        let pmId = clientData?.managedByPM;

        // If NO PM, find the "available" PM (one with least projects)
        if (!pmId) {
            const pmsSnap = await adminDb.collection('users').where('role', '==', 'project_manager').get();
            if (!pmsSnap.empty) {
                // For simplicity, pick one with fewest projects or just first one
                // Real implementation would count active projects
                pmId = pmsSnap.docs[0].id;

                // Assign PM to client permanently
                await adminDb.collection('users').doc(clientUID).update({
                    managedByPM: pmId
                });
            }
        }

        if (pmId) {
            await projectRef.update({
                assignedPMId: pmId,
                updatedAt: Date.now()
            });

            // Log it
            const pmSnap = await adminDb.collection('users').doc(pmId).get();
            const pmName = pmSnap.data()?.displayName || "PM";
            const seId = clientData?.managedBy || clientData?.createdBy;
            let seName = "Unknown SE";
            if (seId) {
                const seSnap = await adminDb.collection('users').doc(seId).get();
                seName = seSnap.exists ? seSnap.data()?.displayName : "Unknown SE";
            }
            const clientName = clientData?.displayName || "Client";

            await addProjectLog(
                projectId,
                'PROJECT_CREATED',
                { uid: clientUID, displayName: clientName, designation: 'Client' },
                `Project created. (SE: ${seName}, Assigned PM: ${pmName})`
            );
        } else {
            await addProjectLog(
                projectId,
                'PROJECT_CREATED',
                { uid: clientUID, displayName: clientData?.displayName || 'Client', designation: 'Client' },
                `Project created. No PM available for auto-assignment.`
            );
        }

        await notifyClient(projectId, 'PROJECT_RECEIVED');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Assigns an editor to a project with a 10-minute validity
 */
export async function assignEditor(projectId: string, editorId: string, editorPrice: number, deadline?: string) {
    try {
        const projectRef = adminDb.collection('projects').doc(projectId);
        const projectSnap = await projectRef.get();

        if (!projectSnap.exists) throw new Error("Project not found");

        const projectData = projectSnap.data();
        let members = projectData?.members || [];

        if (!members.includes(editorId)) {
            members.push(editorId);
        }

        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000;

        const updateData: any = {
            assignedEditorId: editorId,
            assignmentStatus: 'pending',
            assignmentAt: now,
            assignmentExpiresAt: now + tenMinutes,
            status: 'pending_assignment',
            members: members,
            editorPrice: editorPrice,
            updatedAt: now
        };

        if (deadline) {
            updateData.deadline = deadline;
        }

        await projectRef.update(updateData);

        // Add Log
        const pmSnap = await adminDb.collection('users').doc(projectData?.assignedPMId || 'unknown').get();
        const pmName = pmSnap.exists ? pmSnap.data()?.displayName : 'PM';

        const editorSnap = await adminDb.collection('users').doc(editorId).get();
        const editorName = editorSnap.exists ? editorSnap.data()?.displayName : 'Editor';

        await addProjectLog(
            projectId,
            'PROJECT_ASSIGNED',
            { uid: projectData?.assignedPMId || 'pm', displayName: pmName, designation: 'Project Manager' },
            `Editor ${editorName} assigned to project.`
        );

        // Notify client that PM has assigned an editor
        await notifyClient(projectId, 'EDITOR_ASSIGNED');

        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Handles editor acceptance or rejection
 */
export async function respondToAssignment(projectId: string, response: 'accepted' | 'rejected', reason?: string) {
    try {
        const now = Date.now();
        const updateData: any = {
            assignmentStatus: response,
            status: response === 'accepted' ? 'active' : 'pending_assignment',
            updatedAt: now
        };

        if (response === 'rejected') {
            updateData.editorDeclineReason = reason || 'No reason provided';
            updateData.assignedEditorId = admin.firestore.FieldValue.delete();
            updateData.editorPrice = admin.firestore.FieldValue.delete();
            updateData.assignmentAt = admin.firestore.FieldValue.delete();
            updateData.assignmentExpiresAt = admin.firestore.FieldValue.delete();
        }

        await adminDb.collection('projects').doc(projectId).update(updateData);

        // Notify client that editor has accepted/started
        if (response === 'accepted') {
            await notifyClient(projectId, 'EDITOR_ACCEPTED');
        }

        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Fetches all users for the admin table
 * (Can also be done client-side, but server-side ensures we bypass RLS if strict)
 */
export async function getAllUsers() {
    try {
        const usersSnap = await adminDb.collection('users').get();
        const users = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        return { success: true, data: users };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Settles a Project payment from 'pay_later' to fully paid.
 */
export async function settleProjectPayment(projectId: string, uid: string, displayName: string, role: string) {
    try {
        const projectRef = adminDb.collection('projects').doc(projectId);
        const projectSnap = await projectRef.get();
        if (!projectSnap.exists) return { success: false, error: "Not found" };
        let pData = projectSnap.data();
        let cost = pData?.totalCost || 0;

        await projectRef.update({
            paymentStatus: 'full_paid',
            amountPaid: cost,
            paymentOption: 'pay_later', // keep text conceptually, but mark settled
            updatedAt: Date.now()
        });

        await addProjectLog(
            projectId,
            'PAYMENT_SETTLED',
            { uid, displayName, designation: role === 'admin' ? 'Admin' : 'Project Manager' },
            `Payment settled manually.`
        );

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Toggles a user's Pay Later status
 */
export async function togglePayLater(uid: string, payLater: boolean) {
    try {
        await adminDb.collection('users').doc(uid).update({
            payLater: payLater
        });
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Updates a client's credit limit
 */
export async function updateClientCreditLimit(uid: string, creditLimit: number) {
    try {
        await adminDb.collection('users').doc(uid).update({
            creditLimit: creditLimit,
            updatedAt: Date.now()
        });
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Rejects a user's deletion request
 */
export async function rejectDeletionRequest(uid: string) {
    try {
        await adminDb.collection('users').doc(uid).update({
            deletionRequested: false,
            deletionRequestedAt: admin.firestore.FieldValue.delete()
        });
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        console.error('Error rejecting deletion request:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Approves a pending editor
 */
export async function verifyEditor(uid: string) {
    try {
        // 1. Enable in Firebase Auth
        await adminAuth.updateUser(uid, { disabled: false });

        // 2. Update Firestore
        await adminDb.collection('users').doc(uid).update({
            onboardingStatus: 'approved',
            status: 'active',
            updatedAt: Date.now()
        });

        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        console.error('Error verifying editor:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Sets the editor's share for a project
 */
export async function setEditorPrice(projectId: string, price: number, pm: { uid: string, displayName: string }) {
    try {
        await adminDb.collection('projects').doc(projectId).update({
            editorPrice: price,
            updatedAt: Date.now()
        });
        await addProjectLog(projectId, 'REVENUE_SHARE_SET', pm, `Editor revenue share set to ₹${price}`);
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Bulk settles editor dues for multiple projects
 */
export async function bulkSettleEditorDues(projectIds: string[], user: { uid: string, displayName: string, designation?: string }) {
    try {
        const batch = adminDb.batch();
        const now = Date.now();

        for (const pid of projectIds) {
            const ref = adminDb.collection('projects').doc(pid);
            batch.update(ref, {
                editorPaid: true,
                editorPaidAt: now,
                updatedAt: now
            });

            // We can't use union in batch directly for arrays in some versions easily 
            // but we can update the doc with logs using the union operator if we do it doc by doc 
            // OR just do it sequentially. For logs, since batch doesn't support arrayUnion as easily 
            // in some envs without the right admin SDK version, I'll do it sequentially for simplicity 
            // or just skip logs in bulk for performance if needed. 
            // Actually, admin SDK supports FieldValue.arrayUnion in batch.
            batch.update(ref, {
                logs: admin.firestore.FieldValue.arrayUnion({
                    event: 'PAYMENT_MARKED',
                    user: user.uid,
                    userName: user.displayName,
                    designation: user.designation || 'System',
                    timestamp: now,
                    details: 'Editor payment marked as cleared via bulk settlement.'
                })
            });
        }

        await batch.commit();
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        console.error('Error in bulk settlement:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Toggles project autopay
 */
export async function toggleProjectAutoPay(projectId: string, enabled: boolean, pm: { uid: string, displayName: string }) {
    try {
        await adminDb.collection('projects').doc(projectId).update({
            autoPay: enabled,
            updatedAt: Date.now()
        });
        await addProjectLog(projectId, 'AUTOPAY_TOGGLED', pm, `AutoPay ${enabled ? 'ENABLED' : 'DISABLED'} for project`);
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Gets WhatsApp message templates
 */
export async function getWhatsAppTemplates() {
    try {
        const snap = await adminDb.collection('settings').doc('whatsapp').get();
        if (!snap.exists) return { success: true, data: null };
        return { success: true, data: snap.data() };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Updates WhatsApp message templates
 */
export async function updateWhatsAppTemplates(templates: any) {
    try {
        await adminDb.collection('settings').doc('whatsapp').set(templates, { merge: true });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Gets global default prices for video types
 */
export async function getGlobalPrices() {
    try {
        const snap = await adminDb.collection('settings').doc('pricing').get();
        if (!snap.exists) return { success: true, data: null };
        return { success: true, data: snap.data() };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Updates global default prices
 */
export async function updateGlobalPrices(prices: any) {
    try {
        await adminDb.collection('settings').doc('pricing').set(prices, { merge: true });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
