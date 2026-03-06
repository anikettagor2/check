
// Firestore Data Models

export type UserRole = 'admin' | 'manager' | 'editor' | 'client' | 'guest' | 'sales_executive' | 'project_manager';

export interface User {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    role: UserRole;
    createdAt: number; // Timestamp
    phoneNumber?: string; // For guests
    companyName?: string; // Optional company name for clients
    websiteUrl?: string; // Additional profile links for clients
    clientCategory?: 'Retainer' | 'One-time' | 'Premium' | string; // Client category
    customRates?: Record<string, number>; // Custom video rates for this specific client
    allowedFormats?: Record<string, boolean>; // Which video formats are visible
    initialPassword?: string; // Temp password for new users
    createdBy?: string; // UID of sales exec or admin who created this user
    managedBy?: string; // UID of sales exec managing this client
    payLater?: boolean; // New feature: allows client to skip immediate payment
    creditLimit?: number; // Maximum pending dues allowed for Pay Later
    deletionRequested?: boolean; // When user requests account deletion, pending admin approval
    deletionRequestedAt?: number; // Timestamp of deletion request

    // Role-specific metrics
    income?: number; // Total income for editor
    rating?: number; // Rating for editor
    portfolio?: { name: string; url: string; date?: number; clientName?: string; category?: string }[]; // Showcase projects for editor
    onboardingStatus?: 'pending' | 'approved' | 'rejected'; // For editors created by SE/PM
    totalRevenueGenerated?: number; // For SE/PM
    whatsappNumber?: string;
    managedByPM?: string; // UID of PM managing this editor (for groups)
    location?: string;
    skills?: string[]; // Specialization/Skills for editors
    skillPrices?: Record<string, string>; // Price range per skill
    status?: 'active' | 'inactive';
    availabilityStatus?: 'online' | 'offline' | 'sleep'; // Presence status
    maxProjectLimit?: number; // Admin defined max active units limit for PM

    // Financial & Performance Metrics (Dynamic)
    lifetimeTotal?: number;
    pendingOutstanding?: number;
    totalEarned?: number;
    pendingDues?: number;
    accuracy?: string;
    verified?: boolean;
    lastSignInTime?: number;
    bio?: string;
    contact?: string;

    // Client Documents
    documents?: {
        agreement?: { url: string; name: string; uploadedAt: number };
        gst?: { url: string; name: string; uploadedAt: number };
        nda?: { url: string; name: string; uploadedAt: number };
        invoices?: { id: string; url: string; name: string; uploadedAt: number }[]; // Since multiple invoice downloads maybe
    };
}

export type ProjectStatus = 'active' | 'in_review' | 'approved' | 'completed' | 'archived' | 'pending_assignment';

export interface Project {
    id: string;
    name: string;
    clientId: string; // ID of the client who owns this project
    clientName: string; // Deprecated in favor of 'brand' maybe?
    brand?: string;
    description?: string;
    deadline?: string;
    duration?: number;
    videoType?: string;
    videoFormat?: string; // e.g., 'Reel Format', 'Documentary', etc.
    aspectRatio?: '9:16' | '1:1' | '16:9' | string;
    referenceLink?: string;
    referenceFiles?: { name: string; url: string; size?: number; type?: string; uploadedAt?: number }[];
    budget?: number;
    totalCost?: number; // Calculated cost
    amountPaid?: number; // Upfront + Final
    paymentStatus?: string; // 'half_paid', 'full_paid'
    assignedEditorId?: string;
    footageLink?: string; // Link to cloud storage
    rawFiles?: { name: string; url: string; size?: number; type?: string; uploadedAt?: number }[]; // Raw video files uploaded by client
    thumbnailUrl?: string; // Cover image
    status: ProjectStatus;
    createdAt: number;
    updatedAt: number;
    members: string[]; // Array of User UIDs (admin, manager, editor, client)
    currentRevisionId?: string; // ID of the latest active revision
    ownerId?: string;
    assignmentStatus?: ProjectAssignmentStatus;
    downloadUnlockRequested?: boolean; // true when a payLater client requests download unlock from PM
    downloadsUnlocked?: boolean;       // true when PM has explicitly approved downloads for this project
    clientHasDownloaded?: boolean;     // true when a client downloads a file successfully
    downloadUnlockedAt?: number;       // timestamp of when the file was downloaded
    isPayLaterRequest?: boolean;       // true for projects submitted via the Pay Later workflow
    assignmentAt?: number;             // When the editor was assigned
    assignmentExpiresAt?: number;      // When the assignment expires (10 min timer)

    // Management links
    assignedPMId?: string;             // Project Manager assigned to this project
    assignedSEId?: string;             // Sales Executive who brought this client
    editorPrice?: number;              // Price shared with the editor
    editorDeclineReason?: string;      // Reason for editor declining project
    editorRating?: number;             // Client rating for editor (1-5)
    editorReview?: string;             // Client review for editor
    autoPay?: boolean;                 // If true, PM has authorized automatic flow for this project
    scripts?: { name: string; url: string; size?: number; type?: string; uploadedAt?: number }[];

    // Audit Log
    editorPaid?: boolean;              // Admin marked this editor payment as cleared
    editorPaidAt?: number;

    logs?: {
        event: string;
        user: string;
        userName: string;
        timestamp: number;
        details?: string;
    }[];
    revisionsCount?: number; // Total revisions handled
    completedAt?: number; // When the project was marked as completed/approved
}

export type ProjectAssignmentStatus = 'pending' | 'accepted' | 'rejected';

export type RevisionStatus = 'active' | 'approved' | 'changes_requested' | 'archived';

export interface Revision {
    id: string;
    projectId: string;
    version: number; // 1, 2, 3...
    videoUrl: string; // Storage URL
    thumbnailUrl?: string; // Specific frame or generated thumb
    description?: string;
    status: RevisionStatus;
    uploadedBy: string; // User UID
    createdAt: number;
    downloadCount?: number; // Track downloads by client for limits
}

export type CommentStatus = 'open' | 'resolved';

export interface Comment {
    id: string;
    projectId: string; // Denormalized for queries
    revisionId: string;
    userId: string;
    userName: string;
    userAvatar?: string | null;
    userRole: UserRole;
    content: string;
    timestamp: number; // Video timestamp in seconds (float)
    createdAt: number; // Message timestamp
    status: CommentStatus;
    replies?: CommentReply[];
    attachments?: string[]; // URLs
}

export interface CommentReply {
    id: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    userRole: UserRole;
    content: string;
    createdAt: number;
    attachments?: string[];
}

export interface GuestSession {
    id: string; // Distinct ID, maybe stored in cookie/localStorage
    name: string;
    phoneNumber: string;
    email?: string;
    projectId: string;
    firstSeenAt: number;
}

export interface ClientInput {
    id: string;
    projectId: string;
    revisionId: string; // Linked to a specific round
    type: 'file' | 'link' | 'voice';
    url: string;
    name: string; // Filename or link title
    uploadedBy: string; // User UID
    createdAt: number;
    description?: string;
}

export interface Notification {
    id: string;
    userId: string;
    type: 'comment' | 'mention' | 'revision' | 'approval' | 'assigned';
    title: string;
    message: string;
    link: string;
    read: boolean;
    createdAt: number;
}

export interface InvoiceItem {
    description: string;
    quantity: number;
    rate: number;
    amount: number;
}

export interface Invoice {
    id: string;
    invoiceNumber: string; // e.g. INV-2024-001
    projectId?: string;
    clientId: string;
    clientName: string;
    clientEmail: string;
    clientAddress?: string;
    items: InvoiceItem[];
    subtotal: number;
    tax?: number; // e.g. 18%
    total: number;
    status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
    issueDate: number; // timestamp
    dueDate: number; // timestamp
    notes?: string;
    createdAt: number;
    updatedAt: number;
}

export interface ProjectMessage {
    id: string;
    projectId: string;
    senderId: string;
    senderName: string;
    senderRole: UserRole;
    text: string;
    createdAt: number;
}
