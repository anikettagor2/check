
const AISENSY_API_KEY = process.env.AISENSY_API_KEY;
const AISENSY_URL = "https://backend.aisensy.com/campaign/t1/api/v2";

import { adminDb } from "@/lib/firebase/admin";
import { Project, User } from "@/types/schema";


/**
 * Sends a WhatsApp notification via AiSensy
 */
export async function sendWhatsAppNotification(
    phoneNumber: string,
    params: string[],
    campaignName: string
) {
    console.log(`[WhatsApp] Attempting send to ${phoneNumber} via campaign "${campaignName}"`);

    const sanitized = phoneNumber.replace(/\D/g, '');
    let finalPhone = sanitized;
    if (sanitized.length === 10) {
        finalPhone = `91${sanitized}`;
    } else if (sanitized.length === 12 && sanitized.startsWith('91')) {
        finalPhone = sanitized;
    } else {
        console.warn(`[WhatsApp] Invalid phone format: ${phoneNumber}`);
        return { success: false, error: "Invalid phone format" };
    }

    if (!AISENSY_API_KEY) {
        console.error("[WhatsApp] AISENSY_API_KEY is missing");
        return { success: false, error: "Service configuration error" };
    }

    const payload = {
        apiKey: AISENSY_API_KEY,
        campaignName: campaignName,
        destination: finalPhone,
        userName: finalPhone, // Added to fix 'Invalid userName format' error
        templateParams: params,
        source: "API"
    };

    try {
        const response = await fetch(AISENSY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            console.error("[WhatsApp] AiSensy Error:", data);
            return { success: false, error: data.message || "Failed to send WhatsApp" };
        }
        console.log("[WhatsApp] Success:", data);
        return { success: true, data };
    } catch (error: any) {
        console.error("[WhatsApp] Network Error:", error);
        return { success: false, error: error.message };
    }
}

export type WhatsAppTrigger =
    | 'PROJECT_RECEIVED'      // Sent when client uploads project
    | 'EDITOR_ASSIGNED'      // Sent when PM assigns editor
    | 'EDITOR_ACCEPTED'      // Sent when editor accepts
    | 'PROPOSAL_UPLOADED'    // Sent when editor uploads proposal
    | 'PROJECT_COMPLETED';    // Sent when project is marked as completed

/**
 * Higher level helper to notify a client based on project events
 */
export async function notifyClient(projectId: string, trigger: WhatsAppTrigger, extraData?: any) {
    try {
        const projectSnap = await adminDb.collection('projects').doc(projectId).get();
        if (!projectSnap.exists) return { success: false, error: "Project not found" };
        const project = projectSnap.data() as Project;

        if (!project.clientId) return { success: false, error: "No client assigned" };
        const clientSnap = await adminDb.collection('users').doc(project.clientId).get();
        if (!clientSnap.exists) return { success: false, error: "Client not found" };
        const client = clientSnap.data() as User;

        if (!client.phoneNumber) return { success: false, error: "No phone number" };

        let params: string[] = [];
        let campaignName = "editohub";

        // Fetch custom templates if any
        let customTemplates: any = {};
        try {
            const settingsSnap = await adminDb.collection('settings').doc('whatsapp').get();
            if (settingsSnap.exists) {
                customTemplates = settingsSnap.data() || {};
            }
        } catch (err) {
            console.error("[WhatsApp] Failed to fetch custom templates, using defaults.");
        }

        const getMessage = (key: WhatsAppTrigger, defaultMsg: string) => {
            let msg = customTemplates[key] || defaultMsg;
            if (key === 'PROPOSAL_UPLOADED') {
                msg = msg.replace('{{reviewLink}}', extraData?.reviewLink || 'Dashboard');
            }
            return msg;
        };

        switch (trigger) {
            case 'PROJECT_RECEIVED':
                params = [
                    client.displayName || "Client",
                    project.name,
                    getMessage('PROJECT_RECEIVED', "We have received your request. We're currently finding the best editor for you.")
                ];
                break;
            case 'EDITOR_ASSIGNED':
                params = [
                    client.displayName || "Client",
                    project.name,
                    getMessage('EDITOR_ASSIGNED', "A specialist editor has been assigned and is reviewing your requirements.")
                ];
                break;
            case 'EDITOR_ACCEPTED':
                params = [
                    client.displayName || "Client",
                    project.name,
                    getMessage('EDITOR_ACCEPTED', "Production has officially started! We'll notify you once the first draft is ready.")
                ];
                break;
            case 'PROPOSAL_UPLOADED':
                params = [
                    client.displayName || "Client",
                    project.name,
                    getMessage('PROPOSAL_UPLOADED', `A new draft is ready for review! View it here: ${extraData?.reviewLink || 'Dashboard'}`)
                ];
                break;
            case 'PROJECT_COMPLETED':
                params = [
                    client.displayName || "Client",
                    project.name,
                    getMessage('PROJECT_COMPLETED', "Congratulations! Your project is now complete and all files are ready for final download. Thank you for choosing EditoHub!")
                ];
                break;
        }

        // Use the campaign name "editohub" if specifically requested or if custom campaigns aren't set up
        // For now, using specialized names as per typical professional setup
        return await sendWhatsAppNotification(client.phoneNumber, params, campaignName);

    } catch (error: any) {
        console.error("[WhatsApp] Helper Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * @deprecated Use notifyClient instead
 */
export async function notifyClientOfStatusUpdate(projectId: string, status: string) {
    // Keep for backward compatibility but redirect to notifyClient if it matches
    const triggerMap: Record<string, WhatsAppTrigger> = {
        'pending_assignment': 'PROJECT_RECEIVED',
        'active': 'EDITOR_ACCEPTED',
        'completed': 'PROJECT_COMPLETED',
    };

    if (triggerMap[status]) {
        return notifyClient(projectId, triggerMap[status]);
    }

    return { success: true }; // Skip if no mapping
}
