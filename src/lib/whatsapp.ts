
const AISENSY_API_KEY = process.env.AISENSY_API_KEY;
const AISENSY_URL = "https://backend.aisensy.com/campaign/t1/api/v2";
const AISENSY_CLIENT_FALLBACK_CAMPAIGN = process.env.AISENSY_CLIENT_FALLBACK_CAMPAIGN || "CLIENT_UTILITY";

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

const CAMPAIGN_BY_NOTIFICATION: Partial<Record<NotificationType, string>> = {
    client_project_created: 'project_submitted_client',
    client_editor_accepted: 'pr_accept_editor',
    client_draft_submitted: 'first_draft_uploaded_client',
    pm_project_assigned: 'project_manager_msg',
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
    client_draft_submitted: "🎬 Draft Version {version} is ready! Review it here: {link}",
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
        clientFallback?: string;
        editorFallback?: string;
        pmFallback?: string;
    };
    notifications: Record<string, {
        enabled: boolean;
        message: string;
        campaignName?: string;
        fallbackCampaignName?: string;
    }>;
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

function formatDeliveredOn(value?: string): string {
    const parsed = value ? new Date(value) : new Date();
    const validDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    return validDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function normalizeStatus(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function toErrorText(data: any): string {
    const candidates = [
        data?.message,
        data?.error,
        data?.errorMessage,
        data?.description,
        data?.details,
        data?.statusMessage,
        data?.data?.message,
        data?.response?.message,
        Array.isArray(data?.errors)
            ? data.errors.map((entry: any) => entry?.message).filter(Boolean).join(' | ')
            : undefined,
    ];

    const first = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    return typeof first === 'string' ? first : '';
}

function isSemanticFailure(data: any): boolean {
    if (!data || typeof data !== 'object') return false;

    if (data.success === false || data.ok === false || data.sent === false || data.delivered === false) {
        return true;
    }

    const failedStates = new Set(['failed', 'error', 'rejected', 'undelivered', 'not_delivered']);
    if (failedStates.has(normalizeStatus(data?.status)) || failedStates.has(normalizeStatus(data?.data?.status))) {
        return true;
    }

    const message = toErrorText(data).toLowerCase();
    return message.includes('not delivered') || message.includes('delivery failed') || message.includes('rejected');
}

function isEngagementBlockReason(message: string): boolean {
    return message.toLowerCase().includes('healthy ecosystem engagement');
}

// ============================================================================
// CORE SEND FUNCTION
// ============================================================================
export async function sendWhatsAppNotification(
    phoneNumber: string,
    params: string[],
    campaignName: string,
    retryCount = 0,
    options?: {
        fallbackCampaignName?: string;
        usedFallback?: boolean;
    }
): Promise<{ success: boolean; error?: string; data?: any; requestId?: string }> {
    const requestId = `wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[WhatsApp] [${requestId}] Attempting send to ${phoneNumber} via campaign "${campaignName}" (attempt ${retryCount + 1})`);

    const phoneResult = formatPhoneNumber(phoneNumber);
    if (!phoneResult.valid) {
        console.warn(`[WhatsApp] [${requestId}] ${phoneResult.error}`);
        return { success: false, error: phoneResult.error, requestId };
    }

    if (!AISENSY_API_KEY) {
        console.error(`[WhatsApp] [${requestId}] AISENSY_API_KEY is missing`);
        return { success: false, error: "WhatsApp service not configured", requestId };
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
        // Debug logs for network troubleshooting
        console.log(`[WhatsApp] [${requestId}] API Key present:`, !!AISENSY_API_KEY);
        console.log(`[WhatsApp] [${requestId}] Target URL:`, AISENSY_URL);
        console.log(`[WhatsApp] [${requestId}] Campaign:`, payload.campaignName);
        
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
        const semanticFailure = isSemanticFailure(data);
        const semanticError = toErrorText(data) || `AiSensy semantic failure for campaign ${campaignName}`;
        const shouldFallback =
            semanticFailure &&
            isEngagementBlockReason(semanticError) &&
            !!options?.fallbackCampaignName &&
            options.fallbackCampaignName !== campaignName &&
            !options?.usedFallback;

        if (!response.ok || semanticFailure) {
            console.error(`[WhatsApp] [${requestId}] AiSensy Error:`, data);

            if (shouldFallback) {
                console.warn(`[WhatsApp] [${requestId}] Engagement block detected. Retrying with fallback campaign "${options?.fallbackCampaignName}"`);
                return sendWhatsAppNotification(phoneNumber, params, options!.fallbackCampaignName!, 0, {
                    ...options,
                    usedFallback: true,
                });
            }
            
            if (retryCount < MAX_RETRIES && (response.status >= 500 || response.status === 429)) {
                await delay(RETRY_DELAY * (retryCount + 1));
                return sendWhatsAppNotification(phoneNumber, params, campaignName, retryCount + 1, options);
            }
            
            const statusError = response.ok
                ? semanticError
                : (toErrorText(data) || `Request failed with status ${response.status}`);

            return { success: false, error: statusError, requestId, data };
        }
        
        console.log(`[WhatsApp] [${requestId}] Success:`, data);
        return { success: true, data, requestId };
        
    } catch (error: any) {
        const errorCode = error?.code;
        const errorMessage = error?.message || 'Network error occurred';
        
        // Handle specific network errors
        if (errorCode === 'ENOTFOUND' || errorCode === 'ECONNREFUSED') {
            console.error(`[WhatsApp] [${requestId}] Network Error - Domain Resolution Failed: ${errorCode}`, {
                hostname: 'backend.aisensy.com',
                message: 'Production environment cannot reach AiSensy API',
                solution: 'Check firewall rules, DNS configuration, and outbound HTTPS permissions',
                error: errorMessage
            });
            
            // Don't retry DNS errors - they won't resolve on retry
            return { 
                success: false, 
                error: `Network connectivity error (${errorCode}): Cannot reach AiSensy backend. Check firewall/DNS.`,
                requestId
            };
        }
        
        // Handle timeout/abort errors
        if (error.name === 'AbortError' || errorCode === 'ECONNRESET' || errorCode === 'ETIMEDOUT') {
            console.error(`[WhatsApp] [${requestId}] Network Error - Timeout/Connection Reset: ${error.name || errorCode}`);
            
            if (retryCount < MAX_RETRIES) {
                console.log(`[WhatsApp] [${requestId}] Retrying... (attempt ${retryCount + 2}/${MAX_RETRIES + 1})`);
                await delay(RETRY_DELAY * (retryCount + 1));
                return sendWhatsAppNotification(phoneNumber, params, campaignName, retryCount + 1, options);
            }
            
            return { success: false, error: `Connection timeout after ${MAX_RETRIES + 1} attempts`, requestId };
        }
        
        // Generic network error
        console.error(`[WhatsApp] [${requestId}] Network Error:`, error);
        return { success: false, error: errorMessage, requestId };
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

        let params: string[];

        if (notificationType === 'client_project_created') {
            // Template: project_submitted_client
            // {{1}} client name, {{2}} project name, {{3}} submitted date
            params = [
                client.displayName || 'Client',
                project.name || 'Your Project',
                formatSubmissionDate(project.createdAt),
            ];
        } else if (notificationType === 'client_editor_accepted') {
            // Template: project_accpeted_editor
            // {{1}} client name, {{2}} editor name, {{3}} project name
            params = [
                client.displayName || 'Client',
                extraData?.editorName || 'Assigned Editor',
                project.name || 'Your Project',
            ];
        } else if (notificationType === 'client_draft_submitted') {
            const deliveredOn = formatDeliveredOn(extraData?.deliveredOn);
            const fileLink = extraData?.link || '';
            const revisionRound = Number(extraData?.versionNumber || '1');

            // First draft template: {{1}} client, {{2}} project, {{3}} date, {{4}} link
            // Second+ draft template: {{1}} client, {{2}} project, {{3}} round, {{4}} link
            params = revisionRound <= 1
                ? [
                    client.displayName || 'Client',
                    project.name || 'Your Project',
                    deliveredOn,
                    fileLink,
                ]
                : [
                    client.displayName || 'Client',
                    project.name || 'Your Project',
                    String(revisionRound),
                    fileLink,
                ];
        } else {
            // Default parameter structure for existing templates.
            let message = notifSettings?.message || DEFAULT_MESSAGES[notificationType];
            message = replacePlaceholders(message, extraData || {});

            params = [
                client.displayName || 'Client',
                message,
                project.name || 'Your Project',
            ];
        }

        const templateCampaignName = notificationType === 'client_draft_submitted'
            ? (Number(extraData?.versionNumber || '1') <= 1 ? 'first_draft_uploaded_client' : 'second_draft_uploaded_client')
            : CAMPAIGN_BY_NOTIFICATION[notificationType];

        const campaignName = notifSettings?.campaignName || templateCampaignName || settings?.campaigns?.client || CAMPAIGNS.CLIENT;
        const fallbackCampaignName =
            notifSettings?.fallbackCampaignName ||
            settings?.campaigns?.clientFallback ||
            AISENSY_CLIENT_FALLBACK_CAMPAIGN;
        return await sendWhatsAppNotification(phoneNumber, params, campaignName, 0, { fallbackCampaignName });

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

        const campaignName = notifSettings?.campaignName || settings?.campaigns?.editor || CAMPAIGNS.EDITOR;
        const fallbackCampaignName = notifSettings?.fallbackCampaignName || settings?.campaigns?.editorFallback;
        return await sendWhatsAppNotification(phoneNumber, params, campaignName, 0, { fallbackCampaignName });

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

        let params: string[];
        if (notificationType === 'pm_project_assigned') {
            const projectValue = formatInrAmount(project.totalCost || project.budget || 0);
            const projectLink = `${normalizeAppBaseUrl()}/dashboard/projects/${projectId}`;
            // Template: project_manager_msg
            // {{1}} PM name, {{2}} project name, {{3}} client name, {{4}} value, {{5}} project link
            params = [
                pm.displayName || 'Manager',
                project.name || 'Project',
                clientName,
                projectValue,
                projectLink,
            ];
        } else {
            // Existing fallback behavior for other PM notifications.
            let message = notifSettings?.message || DEFAULT_MESSAGES[notificationType];
            message = replacePlaceholders(message, { client: clientName, ...extraData });

            params = [
                pm.displayName || "Manager",
                message,
                project.name || "Project",
                extraData?.details || `Client: ${clientName}`
            ];
        }

        const campaignName = notifSettings?.campaignName || CAMPAIGN_BY_NOTIFICATION[notificationType] || settings?.campaigns?.pm || CAMPAIGNS.PM;
        const fallbackCampaignName = notifSettings?.fallbackCampaignName || settings?.campaigns?.pmFallback;
        return await sendWhatsAppNotification(phoneNumber, params, campaignName, 0, { fallbackCampaignName });

    } catch (error: any) {
        console.error("[WhatsApp] notifyPM Error:", error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// CONVENIENCE WRAPPERS (awaitable)
// ============================================================================

/** Notify client about project creation */
export async function notifyClientProjectCreated(projectId: string) {
    return notifyClient(projectId, 'client_project_created');
}

/** Notify client about PM assignment */
export async function notifyClientPMAssigned(projectId: string, pmName: string) {
    return notifyClient(projectId, 'client_pm_assigned', { pm: pmName });
}

/** Notify client about editor assignment */
export async function notifyClientEditorAssigned(projectId: string) {
    return notifyClient(projectId, 'client_editor_assigned');
}

/** Notify client that editor accepted */
export async function notifyClientEditorAccepted(projectId: string, editorName: string) {
    try {
        const projectSnap = await adminDb.collection('projects').doc(projectId).get();
        if (!projectSnap.exists) return { success: false, error: 'Project not found' };
        const project = projectSnap.data() as Project;

        if (!project.clientId) return { success: false, error: 'No client assigned' };
        const clientSnap = await adminDb.collection('users').doc(project.clientId).get();
        if (!clientSnap.exists) return { success: false, error: 'Client not found' };
        const client = clientSnap.data() as User;

        const phoneNumber = client.whatsappNumber || client.phoneNumber;
        if (!phoneNumber) return { success: false, error: 'No phone number' };

        // Exact template mapping requested by business flow:
        // campaign: pr_accept_editor
        // {{1}} client name, {{2}} editor name, {{3}} project name
        const params = [
            client.displayName || 'Client',
            editorName || 'Assigned Editor',
            project.name || 'Your Project',
        ];

        const result = await sendWhatsAppNotification(
            phoneNumber,
            params,
            'pr_accept_editor',
            0,
            { fallbackCampaignName: AISENSY_CLIENT_FALLBACK_CAMPAIGN }
        );

        return { success: result.success, error: result.error };
    } catch (error: any) {
        console.error('[WhatsApp] notifyClientEditorAccepted Error:', error);
        return { success: false, error: error.message };
    }
}

/** Notify client about new draft */
export async function notifyClientDraftSubmitted(projectId: string, versionNumber?: number, reviewLink?: string) {
    const extraData: Record<string, string> = {};
    
    if (versionNumber !== undefined) {
        extraData.version = `v${versionNumber}`;
    }
    
    if (reviewLink) {
        extraData.link = reviewLink;
    }

    if (versionNumber !== undefined) {
        extraData.versionNumber = String(versionNumber);
    }

    extraData.deliveredOn = new Date().toISOString();
    
    return notifyClient(projectId, 'client_draft_submitted', extraData);
}

/** Notify client about new comment */
export async function notifyClientNewComment(projectId: string, commenterName: string) {
    return notifyClient(projectId, 'client_new_comment', { name: commenterName });
}

/** Notify client about project completion */
export async function notifyClientProjectCompleted(projectId: string) {
    return notifyClient(projectId, 'client_project_completed');
}

/** Notify editor about new project assignment */
export async function notifyEditorProjectAssigned(projectId: string, editorId: string, pmName: string, deadline?: string) {
    return notifyEditor(projectId, editorId, 'editor_project_assigned', { 
        pm: pmName, 
        extra: deadline ? `Deadline: ${deadline}` : '' 
    });
}

/** Notify editor about new comment from client */
export async function notifyEditorNewComment(projectId: string, editorId: string, clientName: string) {
    return notifyEditor(projectId, editorId, 'editor_new_comment', { client: clientName });
}

/** Notify editor about client feedback */
export async function notifyEditorFeedbackReceived(projectId: string, editorId: string, rating: number) {
    return notifyEditor(projectId, editorId, 'editor_feedback_received', { 
        rating: rating.toString(),
        extra: `Rating: ${rating} stars`
    });
}

/** Notify PM about new project from SE */
export async function notifyPMProjectAssigned(projectId: string, pmId: string, _seName: string) {
    return notifyPM(projectId, pmId, 'pm_project_assigned');
}

/** Notify PM that editor accepted */
export async function notifyPMEditorAccepted(projectId: string, pmId: string, editorName: string) {
    return notifyPM(projectId, pmId, 'pm_editor_accepted', { editor: editorName, details: `Editor: ${editorName}` });
}

/** Notify PM that editor rejected */
export async function notifyPMEditorRejected(projectId: string, pmId: string, editorName: string, reason: string) {
    return notifyPM(projectId, pmId, 'pm_editor_rejected', { editor: editorName, reason, details: `Reason: ${reason}` });
}

/** Notify PM about new comment in project */
export async function notifyPMNewComment(projectId: string, pmId: string, commenterName: string, commenterRole: string) {
    return notifyPM(projectId, pmId, 'pm_new_comment', { name: commenterName, role: commenterRole, details: `${commenterName} (${commenterRole})` });
}

/** Notify PM about project completion (client downloaded) */
export async function notifyPMProjectCompleted(projectId: string, pmId: string, clientName: string) {
    return notifyPM(projectId, pmId, 'pm_project_completed', { client: clientName, details: `Client: ${clientName}` });
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

function formatSubmissionDate(timestamp?: number): string {
    const parsed = timestamp ? new Date(timestamp) : new Date();
    const validDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    return validDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function formatInrAmount(value?: number): string {
    const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 0,
    }).format(amount);
}

function normalizeAppBaseUrl(): string {
    const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://editohub.com';
    return raw.replace(/\/+$/, '');
}