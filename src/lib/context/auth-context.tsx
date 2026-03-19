
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  User as FirebaseUser, 
  onAuthStateChanged,
  onIdTokenChanged,
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  browserLocalPersistence,
  setPersistence
} from "firebase/auth";
import { auth, db } from "@/lib/firebase/config";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { User, UserRole } from "@/types/schema";
import { useRouter } from "next/navigation";

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signInWithGoogle: (role?: UserRole, initialPassword?: string, metadata?: any) => Promise<void>;
  loginAsAdmin: () => Promise<void>;
  loginWithEmail: (identifier: string, password: string) => Promise<void>;
  signupWithEmail: (email: string, password: string, name: string, role: UserRole, metadata?: any) => Promise<void>;
  logout: () => Promise<void>;
  requestAccountDeletion: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  signInWithGoogle: async () => {},
  loginAsAdmin: async () => {},
  loginWithEmail: async () => {},
  signupWithEmail: async () => {},
  logout: async () => {},
  requestAccountDeletion: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);
  const router = useRouter();

  // Initialize Firebase Auth Persistence on mount
  useEffect(() => {
    const initializePersistence = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        console.log("✅ Firebase Auth Persistence enabled (browserLocalPersistence)");
      } catch (error) {
        console.error("⚠️ Failed to set persistence:", error);
      }
      setAuthInitialized(true);
    };

    initializePersistence();
  }, []);

  // Main auth state listener with token refresh handling
  useEffect(() => {
    if (!authInitialized) return;

    let unsubProfile: (() => void) | null = null;
    let unsubTokenRefresh: (() => void) | null = null;
    let tokenRefreshTimeout: NodeJS.Timeout | null = null;

    // 🔐 Token Refresh Handler: Prevents unexpected logouts due to token expiration
    const handleIdTokenRefresh = () => {
      if (tokenRefreshTimeout) {
        clearTimeout(tokenRefreshTimeout);
      }
      
      // Refresh token every 55 minutes (token valid for 1 hour)
      tokenRefreshTimeout = setTimeout(() => {
        auth.currentUser?.getIdToken(true)
          .then(() => console.log("✅ ID Token refreshed - Session extended"))
          .catch(err => console.error("⚠️ Token refresh failed:", err));
      }, 55 * 60 * 1000);
    };

    // 🔄 Listen to ID token changes (handles refresh automatically)
    unsubTokenRefresh = onIdTokenChanged(auth, (fbUser) => {
      if (fbUser) {
        handleIdTokenRefresh();
      } else if (tokenRefreshTimeout) {
        clearTimeout(tokenRefreshTimeout);
      }
    });

    // 🌐 Listen to auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      try {
        setFirebaseUser(fbUser);
        
        if (fbUser) {
          console.log("🔐 Auth State Changed - User logged in:", fbUser.uid);
          
          // Fetch user profile from Firestore with real-time listener
          const userRef = doc(db, "users", fbUser.uid);
          unsubProfile = onSnapshot(userRef, (snapshot) => {
            if (snapshot.exists()) {
              const userData = snapshot.data() as User;
              setUser(userData);
              console.log("📊 User Profile Loaded:", userData.displayName, `[${userData.role}]`);
            } else {
              console.warn("⚠️ User profile not found in Firestore");
              setUser(null);
            }
            setLoading(false);
          }, (err) => {
            console.error("❌ Error listening to user profile:", err);
            setLoading(false);
          });
        } else {
          console.log("🚪 Auth State Changed - User logged out");
          if (unsubProfile) {
            unsubProfile();
            unsubProfile = null;
          }
          setUser(null);
          setLoading(false);
        }
      } catch (error) {
        console.error("❌ Unexpected error in auth state handler:", error);
        setLoading(false);
      }
    });

    // Cleanup function
    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
      if (unsubTokenRefresh) unsubTokenRefresh();
      if (tokenRefreshTimeout) clearTimeout(tokenRefreshTimeout);
    };
  }, [authInitialized]);

  const signInWithGoogle = async (selectedRole?: UserRole, initialPassword?: string, metadata?: any) => {
    try {
      console.log("🔐 Google Sign-In initiated...");
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      const userRef = doc(db, "users", result.user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        if (selectedRole && initialPassword) {
            console.log("📝 New Google User - Creating profile...");
            // Update the Google user's profile with the new password so they can log in via email too!
            const { updatePassword, updateProfile } = await import("firebase/auth");
            try {
                await updatePassword(result.user, initialPassword);
                if (metadata?.displayName) {
                    await updateProfile(result.user, { displayName: metadata.displayName });
                }
            } catch (err: any) {
                console.warn("⚠️ Could not set initial password or profile on Google account:", err);
            }

            // Signup Flow: Create new user profile with selected role
            const newUser: User = {
                uid: result.user.uid,
                email: result.user.email,
                displayName: metadata?.displayName || result.user.displayName,
                photoURL: result.user.photoURL,
                role: selectedRole,
                createdAt: Date.now(),
                onboardingStatus: selectedRole === 'editor' ? 'pending' : 'approved',
                status: selectedRole === 'editor' ? 'inactive' : 'active' as any,
                ...(initialPassword ? { initialPassword } : {}),
                ...metadata
            };
            await setDoc(userRef, newUser);
            setUser(newUser);
            console.log("✅ Google User Profile Created");
        } else {
            // Login Flow: Block new users who haven't selected a role via Signup
            console.warn("⚠️ Google user not found - Blocking login, redirecting to signup");
            // Don't sign out here - let the error be thrown and handled by the caller
            throw new Error("Account not found. Please navigate to the Create Account page to set up a role, username, and password before using Google Sign In.");
        }
      } else {
        // CASE: Existing User
        const existingData = userSnap.data() as User;
        console.log("✅ Existing Google User logged in:", existingData.displayName);
        
        // If coming from Signup (with a role), verify it matches (or just log them in)
        if (selectedRole && existingData.role !== selectedRole && existingData.role !== 'admin') {
             console.warn("⚠️ Role mismatch detected");
             throw new Error(`You already have an account as a ${existingData.role}. Please Log In.`);
        }

        setUser(existingData);
      }
      
      router.push("/dashboard");

    } catch (error) {
      console.error("❌ Error signing in with Google:", error);
      throw error;
    }
  };

  const loginWithEmail = async (identifier: string, password: string) => {
      // Check for static admin credentials and map to real ones
      // Allow both short username and full email if password matches '1234'
      const normalizedIdentifier = identifier.trim().toLowerCase();
      
      if ((normalizedIdentifier === "admin@editohub" || normalizedIdentifier === "admin@editohub.com") && (password.trim() === "1234" || password.trim() === "admin1234")) {
          await loginAsAdmin();
          return;
      }

        let email = normalizedIdentifier;

        // Handle Phone Number or Username Login
        if (!normalizedIdentifier.includes("@")) {
          try {
              const { collection, query, where, getDocs } = await import("firebase/firestore");
            const rawIdentifier = identifier.trim();
            const digits = rawIdentifier.replace(/\D/g, '');

            // Try phone lookup first (supports +91XXXXXXXXXX, 91XXXXXXXXXX, XXXXXXXXXX)
            const phoneCandidates = new Set<string>();
            if (digits.length >= 10) {
              const lastTen = digits.slice(-10);
              phoneCandidates.add(`+91${lastTen}`);
              phoneCandidates.add(lastTen);
              phoneCandidates.add(`91${lastTen}`);
            }
            phoneCandidates.add(rawIdentifier);

            let resolvedUser: User | null = null;

            for (const candidate of phoneCandidates) {
              const qPhone = query(collection(db, "users"), where("phoneNumber", "==", candidate));
              const phoneSnap = await getDocs(qPhone);
              if (!phoneSnap.empty) {
                resolvedUser = phoneSnap.docs[0].data() as User;
                break;
              }
            }

            // If not phone, treat as username (displayName)
            if (!resolvedUser) {
              const qUsername = query(collection(db, "users"), where("displayName", "==", rawIdentifier));
              const usernameSnap = await getDocs(qUsername);
              if (!usernameSnap.empty) {
                resolvedUser = usernameSnap.docs[0].data() as User;
              }
            }

            if (resolvedUser?.email) {
              email = resolvedUser.email.toLowerCase();
            } else {
              throw new Error("No account found with this phone number or username.");
            }
          } catch (err: any) {
            console.error("Identifier lookup failed", err);
              throw err;
          }
      }

      try {
          await signInWithEmailAndPassword(auth, email, password);
          console.log("✅ Email Login Successful - Session authenticated");
          router.push("/dashboard");
      } catch (error: any) {
          console.error("❌ Error signing in with Email/Pass", error);
          
          // Enhanced Admin Recovery
          if (
              (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') &&
              (email.trim().toLowerCase() === "admin@editohub.com" || email.trim().toLowerCase() === "admin@editohub")
          ) {
              console.log("🔧 Admin login attempt - Trying recovery...");
              try {
                  await loginAsAdmin();
                  return;
              } catch (adminError) {
                  // If enhanced recovery fails, throw original error
                  throw error;
              }
          }

          throw error;
      }
  };

  const signupWithEmail = async (email: string, password: string, name: string, role: UserRole, metadata?: any) => {
      try {
          const { createUserWithEmailAndPassword, updateProfile } = await import("firebase/auth");
          const { collection, query, where, getDocs } = await import("firebase/firestore");

          // Check if phone number is already in use
          if (metadata?.phoneNumber) {
              const q = query(collection(db, "users"), where("phoneNumber", "==", metadata.phoneNumber.trim()));
              const phoneSnapshot = await getDocs(q);
              if (!phoneSnapshot.empty) {
                  throw new Error("Phone number already in use by another account.");
              }
          }
          
          // 1. Create Auth User
          const result = await createUserWithEmailAndPassword(auth, email, password);
          
          // 2. Update Display Name
          await updateProfile(result.user, { displayName: name });
          
          // 3. Create Firestore Profile
          const newUser: User = {
              uid: result.user.uid,
              email: result.user.email,
              displayName: name,
              photoURL: null,
              role: role,
              createdAt: Date.now(),
              onboardingStatus: role === 'editor' ? 'pending' : 'approved',
              status: role === 'editor' ? 'inactive' : 'active' as any,
              ...metadata
          };
          
          await setDoc(doc(db, "users", result.user.uid), newUser);
          setUser(newUser);
          
          router.push("/dashboard");
      } catch (error) {
          console.error("Error signing up with Email/Pass", error);
          throw error;
      }
  };
  
  const loginAsAdmin = async () => {
     try {
         // Call server API to ensure "admin@editohub.com" exists with correct password
         await fetch('/api/admin/ensure-admin', { method: 'POST' });

         // Now sign in with the verified credentials
         await signInWithEmailAndPassword(auth, "admin@editohub.com", "admin1234");
         router.push("/dashboard");

     } catch (error: any) {
         console.error("Admin login failed:", error);
         throw error;
     }
  };

  const requestAccountDeletion = async () => {
    if (!auth.currentUser || !user) return;
    
    // Safety check: super admin cannot delete themselves
    if (user.role === 'admin') {
        throw new Error("Administrative Protocol: Super Admin accounts cannot be requested for termination. Contact infrastructure support for manual lifecycle adjustment.");
    }

    try {
        const uid = auth.currentUser.uid;
        // Instead of deleting from Auth immediately, we mark for deletion in Firestore
        // This keeps the account accessible until Admin approves
        await setDoc(doc(db, "users", uid), { 
            deletionRequested: true, 
            deletionRequestedAt: Date.now() 
        }, { merge: true });
        
        // We don't sign them out or delete from auth yet.
        // We just notify them that the request is pending.
    } catch (error: any) {
        console.error("Error requesting account deletion:", error);
        throw error;
    }
  };

  const logout = async () => {
    try {
      console.log("🚪 Logging out user...");
      
      // Clear all local session data first
      localStorage.removeItem("editohub_admin_session");
      sessionStorage.clear();
      
      // Sign out from Firebase (this will trigger onAuthStateChanged)
      await signOut(auth);
      
      // Clear state
      setUser(null);
      setFirebaseUser(null);
      
      console.log("✅ User logged out successfully");
      
      // Navigation happens via onAuthStateChanged listener
      router.push("/login");
    } catch (error) {
      console.error("❌ Error during logout:", error);
      // Even if logout fails, clear local state and redirect
      setUser(null);
      setFirebaseUser(null);
      router.push("/login");
      throw error;
    }
  };



  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, signInWithGoogle, loginAsAdmin, loginWithEmail, signupWithEmail, logout, requestAccountDeletion }}>
      {children}
    </AuthContext.Provider>
  );
}
