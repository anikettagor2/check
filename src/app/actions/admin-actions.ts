'use server';

import * as admin from 'firebase-admin';
import { adminAuth, adminDb, adminStorage } from '@/lib/firebase/admin';
import { UserRole } from '@/types/schema';
import { revalidatePath } from 'next/cache';
import { notifyClient, notifyClientProjectCreated, notifyClientPMAssigned, notifyPMProjectAssigned, notifyPMEditorAccepted, notifyPMEditorRejected, notifyClientEditorAssigned, notifyEditorProjectAssigned } from '@/lib/whatsapp';

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
                status: 'editor_not_assigned',
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
            
            // Await notification so serverless execution does not drop WhatsApp sends.
            const pmNotifyResult = await notifyPMProjectAssigned(projectId, pmId, seName);
            if (!pmNotifyResult.success) {
                console.error('[WhatsApp] PM assignment notification failed', {
                    projectId,
                    pmId,
                    error: pmNotifyResult.error,
                });
            }
        } else {
            await addProjectLog(
                projectId,
                'PROJECT_CREATED',
                { uid: clientUID, displayName: clientData?.displayName || 'Client', designation: 'Client' },
                `Project created. No PM available for auto-assignment.`
            );
        }

        const clientNotifyResult = await notifyClientProjectCreated(projectId);
        if (!clientNotifyResult.success) {
            console.error('[WhatsApp] Client project-created notification failed', {
                projectId,
                error: clientNotifyResult.error,
            });
        }
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Assigns or changes the Project Manager for a project.
 */
export async function assignProjectManager(projectId: string, pmId: string, updatedBy: { uid: string, displayName: string, designation: string }) {
    try {
        const projectRef = adminDb.collection('projects').doc(projectId);
        const projectSnap = await projectRef.get();
        if (!projectSnap.exists) throw new Error("Project not found");

        const pmSnap = await adminDb.collection('users').doc(pmId).get();
        if (!pmSnap.exists) throw new Error("PM not found");
        const pmData = pmSnap.data();

        await projectRef.update({
            assignedPMId: pmId,
            updatedAt: Date.now()
        });

        await addProjectLog(
            projectId,
            'PM_ASSIGNED',
            updatedBy,
            `Project Manager changed to ${pmData?.displayName || 'Unknown'}.`
        );

        const pmName = pmData?.displayName || 'Project Manager';
        const [clientNotifyResult, pmNotifyResult] = await Promise.all([
            notifyClientPMAssigned(projectId, pmName),
            notifyPMProjectAssigned(projectId, pmId, updatedBy.displayName || 'Admin'),
        ]);

        if (!clientNotifyResult.success) {
            console.error('[WhatsApp] Client PM-assigned notification failed after PM reassignment', {
                projectId,
                pmId,
                error: clientNotifyResult.error,
            });
        }

        if (!pmNotifyResult.success) {
            console.error('[WhatsApp] PM project-assigned notification failed after PM reassignment', {
                projectId,
                pmId,
                error: pmNotifyResult.error,
            });
        }

        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        console.error('Error assigning PM:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Assigns or changes the Project Manager for a client.
 */
export async function assignClientManager(clientId: string, pmId: string, updatedBy: { uid: string, displayName: string, designation: string }) {
    try {
        const clientRef = adminDb.collection('users').doc(clientId);
        const pmSnap = await adminDb.collection('users').doc(pmId).get();
        if (!pmSnap.exists) throw new Error("PM not found");
        const pmData = pmSnap.data();

        await clientRef.update({
            managedByPM: pmId,
            updatedAt: Date.now()
        });

        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        console.error('Error assigning Client PM:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Assigns an editor to a project with a 5-minute validity window
 * Editor must accept within 5 minutes or assignment expires
 */
export async function assignEditor(
    projectId: string,
    editorId: string,
    editorPrice: number,
    deadline?: string,
    assignedByRole: 'project_manager' | 'admin' = 'admin'
) {
    try {
        const projectRef = adminDb.collection('projects').doc(projectId);
        const projectSnap = await projectRef.get();

        if (!projectSnap.exists) throw new Error("Project not found");

        const projectData = projectSnap.data();

        if (projectData?.assignedEditorId && assignedByRole !== 'project_manager') {
            return { success: false, error: 'Editor reassignment is restricted to Project Managers after initial assignment.' };
        }
        let members = projectData?.members || [];

        if (!members.includes(editorId)) {
            members.push(editorId);
        }

        const now = Date.now();
        const fifteenMinutes = 15 * 60 * 1000; // 15 minutes in milliseconds (changed from 5 minutes)

        const updateData: any = {
            assignedEditorId: editorId,
            assignmentStatus: 'pending',
            assignmentAt: now,
            assignmentExpiresAt: now + fifteenMinutes,
            status: 'editor_assigned',
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

        // Only notify the EDITOR — client notification is deferred until editor accepts
        const editorAssignResult = await notifyEditorProjectAssigned(projectId, editorId, pmName, deadline);

        if (!editorAssignResult.success) {
            console.error('[WhatsApp] Editor assignment notification failed', {
                projectId,
                editorId,
                error: editorAssignResult.error,
            });
        }

        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Handles editor acceptance or rejection
 * Checks if assignment has expired (5-minute window)
 */
export async function respondToAssignment(projectId: string, response: 'accepted' | 'rejected', reason?: string) {
    try {
        const now = Date.now();
        
        // Validate rejection reason - required for rejection
        if (response === 'rejected' && !reason?.trim()) {
            return { success: false, error: 'Rejection reason is required. Please provide a reason for declining this project.' };
        }
        
        // Check if assignment has expired
        const projectRef = adminDb.collection('projects').doc(projectId);
        const projectSnap = await projectRef.get();
        
        if (!projectSnap.exists) {
            return { success: false, error: 'Project not found' };
        }
        
        const projectData = projectSnap.data();
        const expiresAt = projectData?.assignmentExpiresAt;
        
        if (expiresAt && now > expiresAt) {
            // Assignment has expired — auto-reject and clear assignment
            await projectRef.update({
                assignmentStatus: 'expired',
                status: 'editor_not_assigned',
                editorDeclineReason: 'Assignment expired - no response within 15 minutes',
                assignedEditorId: admin.firestore.FieldValue.delete(),
                editorPrice: admin.firestore.FieldValue.delete(),
                assignmentAt: admin.firestore.FieldValue.delete(),
                assignmentExpiresAt: admin.firestore.FieldValue.delete(),
                updatedAt: now
            });

            // Notify PM about timeout via pro_delay WhatsApp template
            const expiredPmId = projectData?.assignedPMId;
            if (expiredPmId) {
                const expiredEditorSnap = await adminDb.collection('users').doc(projectData?.assignedEditorId || '').get();
                const expiredEditorName = expiredEditorSnap.exists ? expiredEditorSnap.data()?.displayName || 'Editor' : 'Editor';

                // In-app notification
                const expiredNotifRef = adminDb.collection('notifications').doc();
                await expiredNotifRef.set({
                    id: expiredNotifRef.id,
                    userId: expiredPmId,
                    type: 'project_rejected',
                    title: `${projectData?.name || 'Project'} - Assignment Timed Out`,
                    message: `${expiredEditorName} did not respond within 15 minutes. Please reassign the project.`,
                    projectId,
                    editorName: expiredEditorName,
                    reason: 'No response within 15 minutes',
                    read: false,
                    link: `/dashboard?project=${projectId}`,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // WhatsApp via pro_delay template
                void notifyPMEditorRejected(projectId, expiredPmId, expiredEditorName, 'No response within 15 minutes');
            }

            revalidatePath('/dashboard');
            return { success: false, error: 'Assignment has expired. The 15-minute acceptance window has passed.' };
        }
        
        const updateData: any = {
            assignmentStatus: response,
            status: response === 'accepted' ? 'in_production' : 'editor_not_assigned',
            updatedAt: now
        };

        if (response === 'rejected') {
            updateData.editorDeclineReason = reason?.trim() || 'No reason provided';
            updateData.assignedEditorId = admin.firestore.FieldValue.delete();
            updateData.editorPrice = admin.firestore.FieldValue.delete();
            updateData.assignmentAt = admin.firestore.FieldValue.delete();
            updateData.assignmentExpiresAt = admin.firestore.FieldValue.delete();
        }

        await adminDb.collection('projects').doc(projectId).update(updateData);

        // Get editor and PM info for notifications
        const editorId = projectData?.assignedEditorId;
        const pmId = projectData?.assignedPMId;
        let editorName = 'Editor';
        let projectName = projectData?.name || 'New Project';
        
        if (editorId) {
            const editorSnap = await adminDb.collection('users').doc(editorId).get();
            if (editorSnap.exists) editorName = editorSnap.data()?.displayName || 'Editor';
        }

        // Notify based on response
        if (response === 'accepted') {
            // 1. Notify PM that editor accepted
            const pmAcceptedResult = pmId
                ? await notifyPMEditorAccepted(projectId, pmId, editorName)
                : { success: true, error: undefined as string | undefined };

            if (pmId && !pmAcceptedResult.success) {
                console.error('[WhatsApp] PM editor-accepted notification failed', {
                    projectId,
                    pmId,
                    error: pmAcceptedResult.error,
                });
            }

            // 2. NOW notify client — editor has accepted, it is safe to tell the client
            const clientAcceptedResult = await notifyClientEditorAssigned(projectId);
            if (!clientAcceptedResult.success) {
                console.error('[WhatsApp] Client editor-accepted notification failed', {
                    projectId,
                    error: clientAcceptedResult.error,
                });
            }
        } else if (response === 'rejected') {
            // Create in-app notification for PM about rejection (CRITICAL - must succeed)
            if (pmId) {
                const notificationRef = adminDb.collection('notifications').doc();
                await notificationRef.set({
                    id: notificationRef.id,
                    userId: pmId,
                    type: 'project_rejected',
                    title: `${projectName} - Editor Rejected`,
                    message: `${editorName} rejected the assignment. Reason: ${reason?.trim() || 'No reason provided'}`,
                    projectId: projectId,
                    editorName: editorName,
                    reason: reason?.trim() || 'No reason provided',
                    read: false,
                    link: `/dashboard?project=${projectId}`,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            
            if (pmId) {
                const rejectedNotifyResult = await notifyPMEditorRejected(projectId, pmId, editorName, reason?.trim() || 'No reason provided');
                if (!rejectedNotifyResult.success) {
                    console.error('[WhatsApp] PM editor-rejected notification failed', {
                        projectId,
                        pmId,
                        error: rejectedNotifyResult.error,
                    });
                }
            }
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

/**
 * Gets system settings (phone uniqueness, etc.)
 */
export async function getSystemSettings() {
    try {
        const snap = await adminDb.collection('settings').doc('system').get();
        if (!snap.exists) return { success: true, data: { allowDuplicatePhone: false, downloadLimit: 10 } };
        const data = snap.data();
        return { success: true, data: { ...data, downloadLimit: data?.downloadLimit ?? 10 } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Updates system settings
 */
export async function updateSystemSettings(settings: any) {
    try {
        await adminDb.collection('settings').doc('system').set(settings, { merge: true });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Fetches unread notifications for a user
 */
export async function getUnreadNotifications(userId: string) {
    try {
        // Fetch ALL notifications, filter on client side
        const notificationsSnap = await adminDb
            .collection('notifications')
            .where('userId', '==', userId)
            .limit(50)
            .get();
        
        const notifications = notificationsSnap.docs
            .map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            .filter((n: any) => n.read !== true)  // Filter on client
            .sort((a: any, b: any) => {
                const aTime = a.createdAt?.toMillis?.() || 0;
                const bTime = b.createdAt?.toMillis?.() || 0;
                return bTime - aTime;
            })
            .slice(0, 20);
        
        return { success: true, data: notifications };
    } catch (error: any) {
        console.error('Error fetching notifications:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Marks a notification as read
 */
export async function markNotificationAsRead(notificationId: string) {
    try {
        await adminDb.collection('notifications').doc(notificationId).update({
            read: true,
            readAt: Date.now()
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Marks all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string) {
    try {
        // Fetch all notifications for user, filter client side, then batch update
        const notificationsSnap = await adminDb
            .collection('notifications')
            .where('userId', '==', userId)
            .get();
        
        const batch = adminDb.batch();
        notificationsSnap.docs.forEach(doc => {
            const data = doc.data();
            if (data.read !== true) {  // Only update if not already read
                batch.update(doc.ref, { read: true, readAt: Date.now() });
            }
        });
        
        await batch.commit();
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Gets auto-assign settings
 */
export async function getAutoAssignSettings() {
    try {
        const snap = await adminDb.collection('settings').doc('autoAssign').get();
        if (!snap.exists) return { success: true, data: { editors: [], globalMaxProjects: 5, isEnabled: true } };
        return { success: true, data: snap.data() };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Updates auto-assign settings
 */
export async function updateAutoAssignSettings(settings: any) {
    try {
        await adminDb.collection('settings').doc('autoAssign').set(settings, { merge: true });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Auto-assigns an editor to a project based on priority and availability
 * Called when PM selects "Auto Assign" option
 */
export async function autoAssignEditor(projectId: string, editorPrice: number, deadline?: string) {
    try {
        // 1. Get auto-assign settings
        const settingsSnap = await adminDb.collection('settings').doc('autoAssign').get();
        const settings = settingsSnap.data();
        
        if (!settings || !settings.isEnabled) {
            return { success: false, error: "Auto-assign is not enabled" };
        }

        const editors = settings.editors || [];
        if (editors.length === 0) {
            return { success: false, error: "No editors in auto-assign pool" };
        }

        // 2. Get project data
        const projectRef = adminDb.collection('projects').doc(projectId);
        const projectSnap = await projectRef.get();
        if (!projectSnap.exists) {
            return { success: false, error: "Project not found" };
        }
        const projectData = projectSnap.data();

        // 3. Get all active projects to check workload
        const projectsSnap = await adminDb.collection('projects')
            .where('status', 'not-in', ['completed', 'archived'])
            .get();
        
        // Count active projects per editor
        const editorWorkload: Record<string, number> = {};
        projectsSnap.docs.forEach(doc => {
            const data = doc.data();
            if (data.assignedEditorId) {
                editorWorkload[data.assignedEditorId] = (editorWorkload[data.assignedEditorId] || 0) + 1;
            }
        });

        // 4. Get editor user data for status check
        const editorIds = editors.map((e: any) => e.editorId);
        const editorUsersSnap = await adminDb.collection('users')
            .where(admin.firestore.FieldPath.documentId(), 'in', editorIds)
            .get();
        
        const editorUsers: Record<string, any> = {};
        editorUsersSnap.docs.forEach(doc => {
            editorUsers[doc.id] = doc.data();
        });

        // 5. Sort by priority and find first available editor
        const sortedEditors = [...editors]
            .filter((e: any) => e.isActive !== false)
            .sort((a: any, b: any) => a.priority - b.priority);

        let selectedEditor = null;
        for (const editorConfig of sortedEditors) {
            const workload = editorWorkload[editorConfig.editorId] || 0;
            const maxProjects = editorConfig.maxProjects || settings.globalMaxProjects || 5;
            const editorUser = editorUsers[editorConfig.editorId];

            // Check availability: not at capacity and not offline
            if (workload < maxProjects) {
                // Optional: Check if editor is not offline (if you want strict checking)
                // const status = editorUser?.availabilityStatus || 'offline';
                // if (status === 'offline') continue;
                
                selectedEditor = {
                    ...editorConfig,
                    displayName: editorUser?.displayName || 'Editor'
                };
                break;
            }
        }

        if (!selectedEditor) {
            return { success: false, error: "No available editors. All editors are at max capacity." };
        }

        // 6. Assign the editor (similar to assignEditor function)
        let members = projectData?.members || [];
        if (!members.includes(selectedEditor.editorId)) {
            members.push(selectedEditor.editorId);
        }

        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;

        const updateData: any = {
            assignedEditorId: selectedEditor.editorId,
            assignmentStatus: 'pending',
            assignmentAt: now,
            assignmentExpiresAt: now + fiveMinutes,
            status: 'pending_assignment',
            members: members,
            editorPrice: editorPrice,
            autoAssigned: true,
            updatedAt: now
        };

        if (deadline) {
            updateData.deadline = deadline;
        }

        await projectRef.update(updateData);

        // 7. Add log
        const pmSnap = await adminDb.collection('users').doc(projectData?.assignedPMId || 'unknown').get();
        const pmName = pmSnap.exists ? pmSnap.data()?.displayName : 'PM';

        await addProjectLog(
            projectId,
            'PROJECT_ASSIGNED',
            { uid: projectData?.assignedPMId || 'pm', displayName: pmName, designation: 'Project Manager' },
            `Editor ${selectedEditor.displayName} auto-assigned to project (Priority ${selectedEditor.priority}).`
        );

        // 8. Send notifications
        const [clientAssignResult, editorAssignResult] = await Promise.all([
            notifyClientEditorAssigned(projectId),
            notifyEditorProjectAssigned(projectId, selectedEditor.editorId, pmName, deadline),
        ]);

        if (!clientAssignResult.success) {
            console.error('[WhatsApp] Client auto-assignment notification failed', {
                projectId,
                error: clientAssignResult.error,
            });
        }

        if (!editorAssignResult.success) {
            console.error('[WhatsApp] Editor auto-assignment notification failed', {
                projectId,
                editorId: selectedEditor.editorId,
                error: editorAssignResult.error,
            });
        }

        revalidatePath('/dashboard');
        return { 
            success: true, 
            editorId: selectedEditor.editorId,
            editorName: selectedEditor.displayName,
            priority: selectedEditor.priority
        };
    } catch (error: any) {
        console.error('Auto-assign error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Assign or change a manager (sales executive) for a client
 */
export async function assignManagerToClient(clientId: string, managerId: string, updatedBy: { uid: string, displayName: string }) {
    try {
        const clientRef = adminDb.collection('users').doc(clientId);
        const clientSnap = await clientRef.get();
        if (!clientSnap.exists) {
            return { success: false, error: "Client not found" };
        }

        const managerRef = adminDb.collection('users').doc(managerId);
        const managerSnap = await managerRef.get();
        if (!managerSnap.exists) {
            return { success: false, error: "Manager not found" };
        }

        const managerData = managerSnap.data();

        // Update client with manager assignment
        await clientRef.update({
            assignedManagerId: managerId,
            updatedAt: Date.now()
        });

        revalidatePath('/dashboard');
        return { 
            success: true, 
            message: `Manager ${managerData?.displayName || 'Unknown'} assigned to client successfully`
        };
    } catch (error: any) {
        console.error('Manager assignment error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Update user details (name, email, phone, role) with real-time synchronization
 * Used by admin to edit team members and sales executives
 */
export async function updateUserDetails(uid: string, updates: Partial<any>, updatedBy: { uid: string, displayName: string }) {
    try {
        const userRef = adminDb.collection('users').doc(uid);
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
            return { success: false, error: "User not found" };
        }

        const userData = userSnap.data();

        // Prepare update object - only allow specific fields
        const allowedFields = ['displayName', 'email', 'phoneNumber', 'whatsappNumber', 'role', 'location', 'portfolio', 'skills', 'skillPrices'];
        const safeUpdates: any = {
            updatedAt: Date.now(),
            updatedBy: updatedBy.uid
        };

        for (const field of allowedFields) {
            if (field in updates && updates[field] !== undefined) {
                safeUpdates[field] = updates[field];
            }
        }

        // Update user document
        await userRef.update(safeUpdates);

        // If email changed, update Firebase Auth email as well
        if (updates.email && userData && updates.email !== userData.email) {
            try {
                await adminAuth.updateUser(uid, { email: updates.email });
            } catch (authError: any) {
                console.warn('Warning: Could not update Firebase Auth email:', authError.message);
                // Don't fail the request, just warn
            }
        }

        revalidatePath('/dashboard');
        return { 
            success: true, 
            message: `${userData?.displayName || 'User'} details updated successfully`,
            updatedFields: Object.keys(safeUpdates).filter(k => k !== 'updatedAt' && k !== 'updatedBy')
        };
    } catch (error: any) {
        console.error('User details update error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Update client project details (name, description, budget, etc)
 * Clients can edit their project details after creation
 */
export async function updateClientProjectDetails(projectId: string, clientId: string, updates: Partial<any>) {
    try {
        const projectRef = adminDb.collection('projects').doc(projectId);
        const projectSnap = await projectRef.get();
        if (!projectSnap.exists) {
            return { success: false, error: "Project not found" };
        }

        const project = projectSnap.data();
        
        // Verify that the requesting user is the client who owns this project
        if (project?.clientId !== clientId) {
            return { success: false, error: "Unauthorized: You can only edit your own projects" };
        }

        // Only allow editing specific fields for clients
        const editableFields = ['name', 'description', 'baseLanguage', 'subtitles', 'deliveryResolution', 'turnaroundDaysEstimate', 'budget'];
        const safeUpdates: any = {
            updatedAt: Date.now()
        };

        for (const field of editableFields) {
            if (field in updates && updates[field] !== undefined) {
                safeUpdates[field] = updates[field];
            }
        }

        // Do not allow editing status, assignedEditorId, pricing tier, etc
        if (Object.keys(safeUpdates).length === 1) { // Only updatedAt
            return { success: false, error: "No valid fields to update" };
        }

        // Update project
        await projectRef.update(safeUpdates);

        // Add log entry
        await addProjectLog(
            projectId,
            'PROJECT_DETAILS_UPDATED',
            { uid: clientId, displayName: project?.clientName || 'Client', designation: 'Client' },
            `Project details updated: ${Object.keys(safeUpdates).filter(k => k !== 'updatedAt').join(', ')}`
        );

        revalidatePath(`/dashboard/projects/${projectId}`);
        return { 
            success: true, 
            message: 'Project details updated successfully'
        };
    } catch (error: any) {
        console.error('Project update error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Gets invoice template settings
 */
export async function getInvoiceSettings() {
    try {
        const snap = await adminDb.collection('settings').doc('invoice').get();
        if (!snap.exists) {
            return { 
                success: true, 
                data: {
                    companyName: 'EditoHub Agency',
                    companyAddress: '123 Creative Studio Blvd\nLos Angeles, CA 90012',
                    companyEmail: 'billing@editohub.com',
                    companyPhone: '',
                    companyLogo: '',
                    footerText: 'Thank you for your business.',
                    bankDetails: '',
                    gstNumber: '',
                    termsAndConditions: ''
                }
            };
        }
        return { success: true, data: snap.data() };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Updates invoice template settings
 */
export async function updateInvoiceSettings(settings: any) {
    try {
        await adminDb.collection('settings').doc('invoice').set({
            ...settings,
            updatedAt: Date.now()
        }, { merge: true });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Updates an existing invoice
 */
export async function updateInvoice(invoiceId: string, data: any) {
    try {
        await adminDb.collection('invoices').doc(invoiceId).update({
            ...data,
            updatedAt: Date.now()
        });
        revalidatePath('/dashboard/invoices');
        revalidatePath(`/invoices/${invoiceId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Deletes an invoice
 */
export async function deleteInvoice(invoiceId: string) {
    try {
        await adminDb.collection('invoices').doc(invoiceId).delete();
        revalidatePath('/dashboard/invoices');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Assigns a Project Manager to a client (used by Sales Executives)
 */
export async function assignClientPM(clientId: string, pmId: string) {
    try {
        await adminDb.collection('users').doc(clientId).update({
            managedByPM: pmId,
            updatedAt: Date.now()
        });
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
