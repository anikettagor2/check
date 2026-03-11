
const AISENSY_API_KEY = process.env.AISENSY_API_KEY;
const AISENSY_URL = "https://backend.aisensy.com/campaign/t1/api/v2";

import { adminDb } from "@/lib/firebase/admin";
import { Project, User } from "@/types/schema";

// ============================================================================
// CAMPAIGN NAMES (AiSensy Campaign Names - NOT template names)
// ============================================================================
const CAMPAIGNS = {
    CLIENT: "CLIENT",
    EDITOR: "EDITOR", 
    PM: "PROJECT_MANAGER"
};

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================
export type ClientNotificationType = 
    | 'client_project_created'
    | 'client_pm_assigned'
    | 'client_editor_assigned'
    | 'client_editor_accepted'
    | 'client_draft_submitted'
    | 'client_new_comment'
    | 'client_project_completed';

export type EditorNotificationType =
    | 'editor_project_assigned'
    | 'editor_new_comment'
    | 'editor_feedback_received';

export type PMNotificationType =
    | 'pm_project_assigned'
    | 'pm_editor_accepted'
    | 'pm_editor_rejected'
    | 'pm_new_comment'
    | 'pm_project_completed';

export type NotificationType = ClientNotificationType | EditorNotificationType | PMNotificationType;

// ============================================================================
// DEFAULT MESSAGES (Can be customized via Admin Panel)
// ============================================================================
const DEFAULT_MESSAGES: Record<NotificationType, string> = {
    // Client messages
    client_project_created: "Your project has been received. Our team will review and assign a manager shortly.",
    client_pm_assigned: "{pm} has been assigned as your Project Manager. They'll coordinate your project.",
    client_editor_assigned: "An expert editor has been assigned and is reviewing your requirements.",
    client_editor_accepted: "Production has officially started! We'll notify you when the first draft is ready.",
    client_draft_submitted: "A new draft is ready for your review! Check your dashboard to provide feedback.",
    client_new_comment: "You have a new message from {name}. Please check the review tool to respond.",
    client_project_completed: "Congratulations! Your project is complete. Thank you for choosing EditoHub!",
    
    // Editor messages
    editor_project_assigned: "You've been assigned a new project by {pm}. Please accept or decline within 5 minutes.",
    editor_new_comment: "You have a new message from {client} on this project. Check the review tool to respond.",
    editor_feedback_received: "Great news! You received {rating}-star feedback from the client. Keep up the excellent work!",
    
    // PM messages
    pm_project_assigned: "{se} has assigned you a new project. Please review and assign an editor.",
    pm_editor_accepted: "{editor} has ACCEPTED the project. Production is starting!",
    pm_editor_rejected: "{editor} has DECLINED the project. Reason: {reason}. Please reassign.",
    pm_new_comment: "New activity: {name} ({role}) left a comment. Check the review tool.",
    pm_project_completed: "Project complete! {client} has downloaded the final files. Great job!"
};

// ============================================================================
// CONFIGURATION
// ============================================================================
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// PHONE NUMBER VALIDATION
// ============================================================================
function formatPhoneNumber(phoneNumber: string): { valid: boolean; formatted: string; error?: string } {
    if (!phoneNumber) {
        return { valid: false, formatted: '', error: "Phone number is required" };
    }

    const sanitized = phoneNumber.replace(/\D/g, '');
    
    if (sanitized.length === 10) {
        return { valid: true, formatted: `91${sanitized}` };
    } else if (sanitized.length === 12 && sanitized.startsWith('91')) {
        return { valid: true, formatted: sanitized };
    } else if (sanitized.length === 11 && sanitized.startsWith('0')) {
        return { valid: true, formatted: `91${sanitized.slice(1)}` };
    } else if (sanitized.length === 13 && sanitized.startsWith('091')) {
        return { valid: true, formatted: sanitized.slice(1) };
    }
    
    return { valid: false, formatted: '', error: `Invalid phone format: ${phoneNumber}` };
}

// ============================================================================
// SETTINGS HELPER
// ============================================================================
interface WhatsAppSettings {
    enabled: boolean;
    campaigns: {
        client: string;
        editor: string;
        pm: string;
    };
    notifications: Record<string, { enabled: boolean; message: string }>;
}

async function getWhatsAppSettings(): Promise<WhatsAppSettings | null> {
    try {
        const settingsSnap = await adminDb.collection('settings').doc('whatsapp').get();
        if (settingsSnap.exists) {
            return settingsSnap.data() as WhatsAppSettings;
        }
    } catch (err) {
        console.error("[WhatsApp] Failed to fetch settings:", err);
    }
    return null;
}

function replacePlaceholders(message: string, data: Record<string, string>): string {
    let result = message;
    for (const [key, value] of Object.entries(data)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'gi'), value);
    }
    return result;
}

// ============================================================================
// CORE SEND FUNCTION
// ============================================================================
export async function sendWhatsAppNotification(
    phoneNumber: string,
    params: string[],
    campaignName: string,
    retryCount = 0
): Promise<{ success: boolean; error?: string; data?: any }> {
    console.log(`[WhatsApp] Attempting send to ${phoneNumber} via campaign "${campaignName}" (attempt ${retryCount + 1})`);

    const phoneResult = formatPhoneNumber(phoneNumber);
    if (!phoneResult.valid) {
        console.warn(`[WhatsApp] ${phoneResult.error}`);
        return { success: false, error: phoneResult.error };
    }

    if (!AISENSY_API_KEY) {
        console.error("[WhatsApp] AISENSY_API_KEY is missing");
        return { success: false, error: "WhatsApp service not configured" };
    }

    const payload = {
        apiKey: AISENSY_API_KEY,
        campaignName: campaignName,
        destination: phoneResult.formatted,
        userName: phoneResult.formatted,
        templateParams: params,
        source: "EditoHub-API"
    };

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(AISENSY_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await response.json();
        
        if (!response.ok) {
            console.error("[WhatsApp] AiSensy Error:", data);
            
            if (retryCount < MAX_RETRIES && (response.status >= 500 || response.status === 429)) {
                await delay(RETRY_DELAY * (retryCount + 1));
                return sendWhatsAppNotification(phoneNumber, params, campaignName, retryCount + 1);
            }
            
            return { success: false, error: data.message || `Request failed with status ${response.status}` };
        }
        
        console.log("[WhatsApp] Success:", data);
        return { success: true, data };
        
    } catch (error: any) {
        console.error("[WhatsApp] Network Error:", error);
        
        if (retryCount < MAX_RETRIES && (error.name === 'AbortError' || error.code === 'ECONNRESET')) {
            await delay(RETRY_DELAY * (retryCount + 1));
            return sendWhatsAppNotification(phoneNumber, params, campaignName, retryCount + 1);
        }
        
        return { success: false, error: error.message || "Network error occurred" };
    }
}

// ============================================================================
// CLIENT NOTIFICATIONS
// ============================================================================
export async function notifyClient(
    projectId: string,
    notificationType: ClientNotificationType,
    extraData?: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
    try {
        // Check settings
        const settings = await getWhatsAppSettings();
        if (settings && !settings.enabled) {
            console.log("[WhatsApp] Notifications disabled globally");
            return { success: true };
        }
        
        const notifSettings = settings?.notifications?.[notificationType];
        if (notifSettings && !notifSettings.enabled) {
            console.log(`[WhatsApp] ${notificationType} is disabled`);
            return { success: true };
        }

        // Get project and client data
        const projectSnap = await adminDb.collection('projects').doc(projectId).get();
        if (!projectSnap.exists) return { success: false, error: "Project not found" };
        const project = projectSnap.data() as Project;

        if (!project.clientId) return { success: false, error: "No client assigned" };
        
        const clientSnap = await adminDb.collection('users').doc(project.clientId).get();
        if (!clientSnap.exists) return { success: false, error: "Client not found" };
        const client = clientSnap.data() as User;

        const phoneNumber = client.whatsappNumber || client.phoneNumber;
        if (!phoneNumber) return { success: false, error: "No phone number" };

        // Get message (custom or default)
        let message = notifSettings?.message || DEFAULT_MESSAGES[notificationType];
        message = replacePlaceholders(message, extraData || {});

        // Build params: [name, message, projectName]
        const params = [
            client.displayName || "Client",
            message,
            project.name || "Your Project"
        ];

        const campaignName = settings?.campaigns?.client || CAMPAIGNS.CLIENT;
        return await sendWhatsAppNotification(phoneNumber, params, campaignName);

    } catch (error: any) {
        console.error("[WhatsApp] notifyClient Error:", error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// EDITOR NOTIFICATIONS
// ============================================================================
export async function notifyEditor(
    projectId: string,
    editorId: string,
    notificationType: EditorNotificationType,
    extraData?: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
    try {
        // Check settings
        const settings = await getWhatsAppSettings();
        if (settings && !settings.enabled) {
            console.log("[WhatsApp] Notifications disabled globally");
            return { success: true };
        }
        
        const notifSettings = settings?.notifications?.[notificationType];
        if (notifSettings && !notifSettings.enabled) {
            console.log(`[WhatsApp] ${notificationType} is disabled`);
            return { success: true };
        }

        // Get project data
        const projectSnap = await adminDb.collection('projects').doc(projectId).get();
        if (!projectSnap.exists) return { success: false, error: "Project not found" };
        const project = projectSnap.data() as Project;

        // Get editor data
        const editorSnap = await adminDb.collection('users').doc(editorId).get();
        if (!editorSnap.exists) return { success: false, error: "Editor not found" };
        const editor = editorSnap.data() as User;

        const phoneNumber = editor.whatsappNumber || editor.phoneNumber;
        if (!phoneNumber) return { success: false, error: "No phone number" };

        // Get message (custom or default)
        let message = notifSettings?.message || DEFAULT_MESSAGES[notificationType];
        message = replacePlaceholders(message, extraData || {});

        // Build params: [name, message, projectName, extraInfo]
        const params = [
            editor.displayName || "Editor",
            message,
            project.name || "Project",
            extraData?.extra || `Deadline: ${project.deadline || 'Not set'}`
        ];

        const campaignName = settings?.campaigns?.editor || CAMPAIGNS.EDITOR;
        return await sendWhatsAppNotification(phoneNumber, params, campaignName);

    } catch (error: any) {
        console.error("[WhatsApp] notifyEditor Error:", error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// PROJECT MANAGER NOTIFICATIONS
// ============================================================================
export async function notifyPM(
    projectId: string,
    pmId: string,
    notificationType: PMNotificationType,
    extraData?: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
    try {
        // Check settings
        const settings = await getWhatsAppSettings();
        if (settings && !settings.enabled) {
            console.log("[WhatsApp] Notifications disabled globally");
            return { success: true };
        }
        
        const notifSettings = settings?.notifications?.[notificationType];
        if (notifSettings && !notifSettings.enabled) {
            console.log(`[WhatsApp] ${notificationType} is disabled`);
            return { success: true };
        }

        // Get project data
        const projectSnap = await adminDb.collection('projects').doc(projectId).get();
        if (!projectSnap.exists) return { success: false, error: "Project not found" };
        const project = projectSnap.data() as Project;

        // Get PM data
        const pmSnap = await adminDb.collection('users').doc(pmId).get();
        if (!pmSnap.exists) return { success: false, error: "PM not found" };
        const pm = pmSnap.data() as User;

        const phoneNumber = pm.whatsappNumber || pm.phoneNumber;
        if (!phoneNumber) return { success: false, error: "No phone number" };

        // Get client name for context
        let clientName = "Client";
        if (project.clientId) {
            const clientSnap = await adminDb.collection('users').doc(project.clientId).get();
            if (clientSnap.exists) {
                clientName = (clientSnap.data() as User).displayName || "Client";
            }
        }

        // Get message (custom or default)
        let message = notifSettings?.message || DEFAULT_MESSAGES[notificationType];
        message = replacePlaceholders(message, { client: clientName, ...extraData });

        // Build params: [name, message, projectName, details]
        const params = [
            pm.displayName || "Manager",
            message,
            project.name || "Project",
            extraData?.details || `Client: ${clientName}`
        ];

        const campaignName = settings?.campaigns?.pm || CAMPAIGNS.PM;
        return await sendWhatsAppNotification(phoneNumber, params, campaignName);

    } catch (error: any) {
        console.error("[WhatsApp] notifyPM Error:", error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// CONVENIENCE WRAPPERS (Fire-and-forget, non-blocking)
// ============================================================================

/** Notify client about project creation */
export function notifyClientProjectCreated(projectId: string) {
    notifyClient(projectId, 'client_project_created').catch(console.error);
}

/** Notify client about PM assignment */
export function notifyClientPMAssigned(projectId: string, pmName: string) {
    notifyClient(projectId, 'client_pm_assigned', { pm: pmName }).catch(console.error);
}

/** Notify client about editor assignment */
export function notifyClientEditorAssigned(projectId: string) {
    notifyClient(projectId, 'client_editor_assigned').catch(console.error);
}

/** Notify client that editor accepted */
export function notifyClientEditorAccepted(projectId: string) {
    notifyClient(projectId, 'client_editor_accepted').catch(console.error);
}

/** Notify client about new draft */
export function notifyClientDraftSubmitted(projectId: string) {
    notifyClient(projectId, 'client_draft_submitted').catch(console.error);
}

/** Notify client about new comment */
export function notifyClientNewComment(projectId: string, commenterName: string) {
    notifyClient(projectId, 'client_new_comment', { name: commenterName }).catch(console.error);
}

/** Notify client about project completion */
export function notifyClientProjectCompleted(projectId: string) {
    notifyClient(projectId, 'client_project_completed').catch(console.error);
}

/** Notify editor about new project assignment */
export function notifyEditorProjectAssigned(projectId: string, editorId: string, pmName: string, deadline?: string) {
    notifyEditor(projectId, editorId, 'editor_project_assigned', { 
        pm: pmName, 
        extra: deadline ? `Deadline: ${deadline}` : '' 
    }).catch(console.error);
}

/** Notify editor about new comment from client */
export function notifyEditorNewComment(projectId: string, editorId: string, clientName: string) {
    notifyEditor(projectId, editorId, 'editor_new_comment', { client: clientName }).catch(console.error);
}

/** Notify editor about client feedback */
export function notifyEditorFeedbackReceived(projectId: string, editorId: string, rating: number) {
    notifyEditor(projectId, editorId, 'editor_feedback_received', { 
        rating: rating.toString(),
        extra: `Rating: ${rating} stars`
    }).catch(console.error);
}

/** Notify PM about new project from SE */
export function notifyPMProjectAssigned(projectId: string, pmId: string, seName: string) {
    notifyPM(projectId, pmId, 'pm_project_assigned', { se: seName }).catch(console.error);
}

/** Notify PM that editor accepted */
export function notifyPMEditorAccepted(projectId: string, pmId: string, editorName: string) {
    notifyPM(projectId, pmId, 'pm_editor_accepted', { editor: editorName, details: `Editor: ${editorName}` }).catch(console.error);
}

/** Notify PM that editor rejected */
export function notifyPMEditorRejected(projectId: string, pmId: string, editorName: string, reason: string) {
    notifyPM(projectId, pmId, 'pm_editor_rejected', { editor: editorName, reason, details: `Reason: ${reason}` }).catch(console.error);
}

/** Notify PM about new comment in project */
export function notifyPMNewComment(projectId: string, pmId: string, commenterName: string, commenterRole: string) {
    notifyPM(projectId, pmId, 'pm_new_comment', { name: commenterName, role: commenterRole, details: `${commenterName} (${commenterRole})` }).catch(console.error);
}

/** Notify PM about project completion (client downloaded) */
export function notifyPMProjectCompleted(projectId: string, pmId: string, clientName: string) {
    notifyPM(projectId, pmId, 'pm_project_completed', { client: clientName, details: `Client: ${clientName}` }).catch(console.error);
}

// ============================================================================
// LEGACY SUPPORT (Backward compatibility)
// ============================================================================
export type WhatsAppTrigger =
    | 'PROJECT_RECEIVED'
    | 'EDITOR_ASSIGNED'
    | 'EDITOR_ACCEPTED'
    | 'PROPOSAL_UPLOADED'
    | 'PROJECT_COMPLETED';

/** @deprecated Use specific notify functions instead */
export async function notifyClientLegacy(projectId: string, trigger: WhatsAppTrigger, extraData?: any) {
    const triggerMap: Record<WhatsAppTrigger, ClientNotificationType> = {
        'PROJECT_RECEIVED': 'client_project_created',
        'EDITOR_ASSIGNED': 'client_editor_assigned',
        'EDITOR_ACCEPTED': 'client_editor_accepted',
        'PROPOSAL_UPLOADED': 'client_draft_submitted',
        'PROJECT_COMPLETED': 'client_project_completed'
    };
    return notifyClient(projectId, triggerMap[trigger], extraData);
}
