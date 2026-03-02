
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  User as FirebaseUser, 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  reauthenticateWithPopup,
  signInWithEmailAndPassword
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
  loginWithEmail: (email: string, password: string) => Promise<void>;
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
  const router = useRouter();

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      
      if (fbUser) {
        // Fetch user profile from Firestore real-time
        const userRef = doc(db, "users", fbUser.uid);
        unsubProfile = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            setUser(snapshot.data() as User);
          }
          setLoading(false);
        }, (err) => {
          console.error("Error listening to user profile:", err);
          setLoading(false);
        });
      } else {
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const signInWithGoogle = async (selectedRole?: UserRole, initialPassword?: string, metadata?: any) => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      const userRef = doc(db, "users", result.user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        if (selectedRole && initialPassword) {
            // Update the Google user's profile with the new password so they can log in via email too!
            const { updatePassword, updateProfile } = await import("firebase/auth");
            try {
                await updatePassword(result.user, initialPassword);
                if (metadata?.displayName) {
                    await updateProfile(result.user, { displayName: metadata.displayName });
                }
            } catch (err: any) {
                console.warn("Could not set initial password or profile on Google account:", err);
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
        } else {
            // Login Flow: Block new users who haven't selected a role via Signup
            await result.user.delete(); // revert the auth creation
            await signOut(auth);
            throw new Error("Account not found. Please navigate to the Create Account page to set up a role, username, and password before using Google Sign In.");
        }
      } else {
        // CASE: Existing User
        const existingData = userSnap.data() as User;
        
        // If coming from Signup (with a role), verify it matches (or just log them in)
        if (selectedRole && existingData.role !== selectedRole && existingData.role !== 'admin') {
             // Optional: You could allow them to "link" or just warn. 
             // For now, let's just warn and log them in as their original role, 
             // OR block them to avoid confusion. Blocking is safer.
             await signOut(auth);
             throw new Error(`You already have an account as a ${existingData.role}. Please Log In.`);
        }

        setUser(existingData);
      }
      
      router.push("/dashboard");

    } catch (error) {
      console.error("Error signing in with Google", error);
      throw error;
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
      // Check for static admin credentials and map to real ones
      // Allow both short username and full email if password matches '1234'
      const normalizedEmail = email.trim().toLowerCase();
      if ((normalizedEmail === "admin@editohub" || normalizedEmail === "admin@editohub.com") && (password.trim() === "1234" || password.trim() === "admin1234")) {
          await loginAsAdmin();
          return;
      }

      try {
          await signInWithEmailAndPassword(auth, email, password);
          router.push("/dashboard");
      } catch (error: any) {
          console.error("Error signing in with Email/Pass", error);
          
          // Enhanced Admin Recovery: If login fails for admin email, try ensuring it exists
          if (
              (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') &&
              (email.trim().toLowerCase() === "admin@editohub.com" || email.trim().toLowerCase() === "admin@editohub")
          ) {
              console.log("Admin login failed, attempting to ensure admin account...");
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
    localStorage.removeItem("editohub_admin_session");
    await signOut(auth);
    setUser(null);
    setFirebaseUser(null);
    router.push("/");
  };



  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, signInWithGoogle, loginAsAdmin, loginWithEmail, signupWithEmail, logout, requestAccountDeletion }}>
      {children}
    </AuthContext.Provider>
  );
}
